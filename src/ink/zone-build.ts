// tui/zone-build.ts
// ─────────────────────────────────────────────────────────────────────────────
// Build + push + deploy logic for zone Docker images.
// Replicates build-and-push.ps1 but callable from the TUI.
// (Formerly tui/build.ts — renamed so tui/build.ts can be the bundler config.)
//
// ── Credential handling ───────────────────────────────────────────────────────
//
// When docker build/push run as spawned child processes on Windows, the
// credential helper (docker-credential-wincred / docker-credential-desktop)
// cannot access Windows Credential Manager:
//   "specified logon session does not exist. It may already have been terminated."
//
// Root cause: child processes inherit the session token but the credential
// helper requires the *interactive* LSASS context to call CredRead/CredWrite,
// which is not available in a spawned stdin-less child.
//
// Fix: resolve GHCR credentials once synchronously in the parent TUI process
// (which runs interactively and CAN access the store), bake them as base64 into
// a temp Docker config that has no credsStore, then set DOCKER_CONFIG to that
// temp dir for every spawned docker command.  Public images (e.g. oven/bun)
// pull anonymously with no credential check.  GHCR push uses the embedded
// base64 token.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir, homedir }   from "os";
import { join }              from "path";
import { spawn, spawnSync }  from "child_process";
import { PROJECT_DIR, GHCR_USER, type Zone } from "../config/zones.ts";
import {
  dbRecordLedger,
  dbGetEnvironmentById,
  dbCreateDeployment,
  dbUpdateDeployment,
  dbPromoteDeploymentToProduction,
} from "./control-db.ts";
import { composeRun, pullAndUp, reloadProxy } from "./docker.ts";
import { drainStream }                       from "./utils.ts";
import { getCredential }                     from "../utils/secureStorage/index.js";
import { log }                               from "./logger.ts";
import { deployRemoteZone, fetchContainers, type ZoneDeployManifest } from "./agent-client.ts";
import type { UnaxisEnvironment }            from "./environment-store.ts";
import { ensureRuntimeEnv }                  from "../utils/runtimeEnv.js";

declare const UNAXIS_VERSION: string | undefined;

// ── Build args ────────────────────────────────────────────────────────────────
//
// Build arg resolution: two-pass approach.
//
//   Pass 1 — key list from zones/{key}/build.env (explicit manifest).
//             Lists exactly which NEXT_PUBLIC_* vars this zone needs at build
//             time.  Safe to commit.  Created by genBuildEnv() at scaffold.
//
//   Pass 2 — values from process.env (loaded from .env by ensureRuntimeEnv
//             before the TUI boots).  Only the keys declared in build.env
//             are ever passed as --build-arg — secrets never leak into layers.
//
//   Fallback — if build.env is absent (zone scaffolded before this feature),
//             fall back to parsing .env for NEXT_PUBLIC_* keys directly.
//             This matches the old behaviour so nothing breaks for old zones.

function loadBuildEnvKeys(zone: Zone): string[] | null {
  // zone.dockerfile is "zones/{key}/Dockerfile" — derive the zone dir from it
  const zoneDir   = join(PROJECT_DIR, "zones", zone.key ?? "");
  const buildEnv  = join(zoneDir, "build.env");
  if (!existsSync(buildEnv)) return null;

  try {
    return readFileSync(buildEnv, "utf-8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && /^[A-Z_][A-Z0-9_]*$/.test(l));
  } catch {
    return null;
  }
}

function loadBuildArgs(zone: Zone): string[] {
  const args: string[] = [];

  // ── Pass 1: build.env manifest (preferred) ──────────────────────────────────
  const manifestKeys = loadBuildEnvKeys(zone);
  if (manifestKeys !== null) {
    for (const key of manifestKeys) {
      const value = process.env[key];
      if (typeof value === "string" && value.length > 0) {
        args.push("--build-arg", `${key}=${value}`);
      }
      // Missing keys are silently skipped — docker build will error clearly
      // if an ARG without a default isn't supplied.
    }
    return args;
  }

  // ── Fallback: parse .env directly for NEXT_PUBLIC_* (old-zone compat) ───────
  // .env may be CRLF on Windows — split on both line endings.
  try {
    const content = readFileSync(join(PROJECT_DIR, ".env"), "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.replace(/\r$/, "");
      const m = line.match(/^(NEXT_PUBLIC_[^=\s]+)=(.*)$/);
      if (m) args.push("--build-arg", `${m[1]}=${m[2]}`);
    }
  } catch {
    // No .env — proceed without NEXT_PUBLIC vars
  }
  return args;
}

// ── Credential resolution ─────────────────────────────────────────────────────
//
// Called ONCE per build from the parent (interactive) TUI process.
// Returns a temp DOCKER_CONFIG directory and a cleanup callback.

interface BuildDockerConfig {
  /** Absolute path to the temp directory containing config.json */
  tmpDir:  string;
  cleanup: () => void;
}

/**
 * Encode a raw GHCR PAT as the base64 auth string Docker expects.
 * If the string is already base64-encoded (decoded form contains ":"),
 * it is returned as-is.
 */
function encodeGhcrAuth(pat: string): string {
  try {
    const decoded = Buffer.from(pat, "base64").toString("utf8");
    if (decoded.includes(":")) return pat; // already encoded
  } catch {}
  return Buffer.from(`${GHCR_USER}:${pat}`).toString("base64");
}

/**
 * Resolve a GHCR auth token (base64 username:PAT) for use in a temp
 * Docker config.  Resolution order (first hit wins):
 *
 *   1. ~/.unaxis/.credentials.json  ghcr_token  (secureStorage — preferred)
 *   2. Legacy %APPDATA%\unenter\config.json  ghcrToken  (backwards compat)
 *   3. ~/.docker/config.json inline base64 auth  (docker login --username)
 *   4. Docker credential helper  (may fail on Windows with wincred)
 *
 * Must be called from the interactive TUI process (not a spawned child)
 * so Windows Credential Manager access works for path 4.
 */
async function resolveGhcrToken(): Promise<string | null> {
  // ── Priority 1: secureStorage credential store ───────────────────────────
  //   Set via: unaxis credentials set ghcr_token ghp_xxxx
  try {
    const stored = await getCredential("ghcr_token");
    if (stored?.trim()) {
      const encoded = encodeGhcrAuth(stored.trim());
      log.info("ghcr-token", "resolved via p1 secureStorage", {
        tokenLen: stored.trim().length,
        tokenPrefix: stored.trim().slice(0, 10) + "…",
      });
      return encoded;
    }
    log.debug("ghcr-token", "p1 secureStorage: key present but empty or null");
  } catch (e) {
    log.warn("ghcr-token", "p1 secureStorage: threw", { err: String(e) });
  }

  // ── Priority 2: legacy %APPDATA%\unenter\config.json ────────────────────
  //   Backwards compat for installs that haven't migrated to secureStorage yet.
  const unenterCfgPath = join(
    process.env["APPDATA"] ?? homedir(),
    "unenter", "config.json",
  );
  try {
    const uc = JSON.parse(readFileSync(unenterCfgPath, "utf8")) as Record<string, unknown>;
    const pat = (uc["ghcrToken"] as string | undefined)?.trim();
    if (pat) {
      log.info("ghcr-token", "resolved via p2 legacy config.json", { path: unenterCfgPath });
      return encodeGhcrAuth(pat);
    }
    log.debug("ghcr-token", "p2 legacy config: no ghcrToken field");
  } catch {
    log.debug("ghcr-token", "p2 legacy config: file missing or unreadable", { path: unenterCfgPath });
  }

  // ── Priority 3: base64 auth already in Docker's config ────────────────────
  //
  // Handles the case where the user ran `docker login ghcr.io` and Docker
  // wrote the credentials directly into ~/.docker/config.json (no store).
  const dockerCfgPath = join(
    process.env["USERPROFILE"] ?? homedir(),
    ".docker", "config.json",
  );
  let dockerCfg: Record<string, unknown> = {};
  try {
    dockerCfg = JSON.parse(readFileSync(dockerCfgPath, "utf8")) as Record<string, unknown>;
  } catch {
    log.warn("ghcr-token", "p3 docker config.json unreadable — no fallback", { path: dockerCfgPath });
    log.error("ghcr-token", "all resolution paths exhausted: token is null");
    return null;
  }

  // Check both "ghcr.io" and "https://ghcr.io" key formats
  const auths = dockerCfg["auths"] as Record<string, { auth?: string }> | undefined;
  for (const key of ["ghcr.io", "https://ghcr.io"]) {
    const a = auths?.[key]?.auth;
    if (a) {
      log.info("ghcr-token", "resolved via p3 docker config.json inline auth", { authKey: key });
      return a;
    }
  }
  log.debug("ghcr-token", "p3 docker config: no inline auth for ghcr.io");

  // ── Priority 4: credential helper (may fail on Windows with wincred) ───────
  //
  // Works when Docker Desktop uses docker-credential-desktop (pipe-based).
  // Fails with docker-credential-wincred due to Windows session restrictions.
  // We try it anyway as a best-effort fallback; returning null is safe because
  // createBuildDockerConfig() will warn the user to add ghcrToken to config.json.
  for (const inputUrl of ["https://ghcr.io", "ghcr.io"]) {
    const store = dockerCfg["credsStore"] as string | undefined;
    if (store) {
      const r = spawnSync(`docker-credential-${store}`, ["get"], {
        input: inputUrl, encoding: "utf8", timeout: 3_000,
      });
      if (r.status === 0 && r.stdout) {
        try {
          const c = JSON.parse(r.stdout) as { Username: string; Secret: string };
          log.info("ghcr-token", "resolved via p4 credential helper", { store, inputUrl, user: c.Username });
          return Buffer.from(`${c.Username}:${c.Secret}`).toString("base64");
        } catch {}
      }
      log.debug("ghcr-token", "p4 credsStore helper failed or returned no data", { store, exit: r.status });
    }
    const helpers = dockerCfg["credHelpers"] as Record<string, string> | undefined;
    const helper  = helpers?.["ghcr.io"];
    if (helper) {
      const r = spawnSync(`docker-credential-${helper}`, ["get"], {
        input: inputUrl, encoding: "utf8", timeout: 3_000,
      });
      if (r.status === 0 && r.stdout) {
        try {
          const c = JSON.parse(r.stdout) as { Username: string; Secret: string };
          log.info("ghcr-token", "resolved via p4 credHelper", { helper, inputUrl, user: c.Username });
          return Buffer.from(`${c.Username}:${c.Secret}`).toString("base64");
        } catch {}
      }
      log.debug("ghcr-token", "p4 credHelper failed or returned no data", { helper, exit: r.status });
    }
    break; // only retry the loop if needed
  }

  log.error("ghcr-token", "all resolution paths exhausted: token is null");
  return null;
}

/**
 * Create a temp DOCKER_CONFIG directory with no credsStore.
 * GHCR auth is embedded as base64 so pushes work.
 * Public images (docker.io) are fetched anonymously — no credential check.
 *
 * Must be called from the interactive TUI process, not from a child process.
 */
async function createBuildDockerConfig(): Promise<BuildDockerConfig> {
  const ghcrToken = await resolveGhcrToken();

  if (!ghcrToken) {
    log.error("docker-config", "no GHCR token — push will be denied by registry");
  } else {
    log.info("docker-config", "GHCR auth embedded in temp Docker config");
  }

  const config: Record<string, unknown> = {
    auths: {} as Record<string, unknown>,
  };

  if (ghcrToken) {
    (config["auths"] as Record<string, unknown>)["ghcr.io"] = { auth: ghcrToken };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "unt-docker-"));
  writeFileSync(join(tmpDir, "config.json"), JSON.stringify(config, null, 2), "utf8");
  log.debug("docker-config", "temp DOCKER_CONFIG written", { tmpDir });

  return {
    tmpDir,
    cleanup: () => {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    },
  };
}

// ── Docker spawn helper ───────────────────────────────────────────────────────

/** Sentinel exit code returned when spawnDocker kills a process for going idle. */
export const DOCKER_IDLE_TIMEOUT_CODE = -777;

async function spawnDocker(
  args:          string[],
  onLine:        (l: string) => void,
  extraEnv:      Record<string, string> = {},
  idleTimeoutMs?: number,
): Promise<number> {
  const env = {
    ...(process.env as Record<string, string>),
    ...(process.platform !== "win32"
      ? { DOCKER_HOST: "unix:///var/run/docker.sock" }
      : {}),
    DOCKER_BUILDKIT: "1",
    ...extraEnv,
  };
  const proc = spawn("docker", args, {
    cwd:   PROJECT_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let code = 1;
  let timedOut = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const exited = new Promise<void>((resolve, reject) => {
    proc.on("close", (c) => { code = c ?? 1; resolve(); });
    proc.on("error", reject);
  });

  // Idle-timeout watchdog, not a total wall-clock cap: builds legitimately
  // range from ~1 to 10+ minutes depending on cache state, but should never
  // go fully SILENT for minutes at a time. Confirmed live 2026-08-23 (Tank
  // zone, twice): buildx hung indefinitely (once 44s, once 62min) right
  // after the Tailwind compile warning with zero further output — no OOM,
  // no disk I/O bottleneck (measured 791MB/s), buildx builder registry
  // clean. The timer resets on every line of output; only true silence
  // kills the process.
  const armIdleTimer = () => {
    if (!idleTimeoutMs) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      onLine(`✗ no build output for ${Math.round(idleTimeoutMs / 1000)}s — assuming the builder is wedged, killing it`);
      proc.kill("SIGKILL");
    }, idleTimeoutMs);
  };
  const onOutput = (l: string) => { armIdleTimer(); onLine(l); };
  armIdleTimer();

  // Legacy builder (DOCKER_BUILDKIT=0) writes step headers to stdout and
  // layer progress to stderr.  Drain both so nothing is lost.
  await Promise.all([
    drainStream(proc.stdout, onOutput),
    drainStream(proc.stderr, onOutput),
    exited,
  ]);
  if (idleTimer) clearTimeout(idleTimer);
  return timedOut ? DOCKER_IDLE_TIMEOUT_CODE : code;
}

/**
 * Stop (not remove) the buildkitd container once a build is over.
 *
 * Left running, it sat idle holding 1.6-2.7 GB of the Docker VM after every
 * build (2026-09-19) -- memory the cameras needed. Stopping frees all of it and
 * keeps the build cache on its state volume; buildx starts the container again
 * by itself on the next `--builder unaxis-net` build. Best-effort: a failure
 * here never fails the build.
 */
export async function parkBuildxBuilder(onLine: (l: string) => void): Promise<void> {
  const code = await spawnDocker(["stop", "-t", "5", "buildx_buildkit_unaxis-net0"], () => {});
  if (code === 0) onLine(`--- build worker parked (memory freed, cache kept; restarts on next build) ---`);
}

/** Force-remove the unaxis-net buildx builder + its stale buildkitd container. Same as `unaxis builder-reset`. */
async function resetBuildxBuilder(onLine: (l: string) => void): Promise<void> {
  onLine(`--- auto-recovery: resetting wedged buildx builder "unaxis-net" ---`);
  await spawnDocker(["buildx", "rm", "--force", "unaxis-net"], onLine);
  await spawnDocker(["rm", "-f", "buildx_buildkit_unaxis-net0"], onLine);
  onLine(`✓ builder reset — next build recreates it clean`);
}

// ── Versioned image tag helpers ───────────────────────────────────────────────
//
// Every successful push produces these tags:
//   :latest            — always the most recent build (mutable pointer)
//   :YYYY-MM-DD-HHmm   — date+time snapshot (immutable, rollback target)
//   :g<sha>[-dirty]    — SOURCE identity (git commit; -dirty = built from an
//                        uncommitted working tree, so it matches NO commit)
//
// The UNAXIS build-tool version is deliberately NOT a tag — it lives as an OCI
// image LABEL (live.unenter.unaxis-version), decoupled from app/zone content.
// Tagging images `v{UNAXIS_VERSION}` was misleading: it looked like an app
// semver, was identical across unrelated images, and moved on CLI releases
// while staying put when zone code changed. The image DIGEST remains the
// source of truth for current-vs-behind; the git tag makes it human-readable.
//
// The base image path is derived from zone.image by stripping the tag.
// e.g.  ghcr.io/makeouthillx32/unenter-rappers:latest
//    →  ghcr.io/makeouthillx32/unenter-rappers

function imageBase(image: string): string {
  const colonIdx = image.lastIndexOf(":");
  return colonIdx > 0 ? image.slice(0, colonIdx) : image;
}

function deploymentDateTag(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${now.getFullYear()}-` +
    `${pad(now.getMonth() + 1)}-` +
    `${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

/** The UNAXIS build-tool version (bare, no "v"). Stored as an image LABEL — it
 *  identifies which CLI built the image, NOT the app/zone content version. */
function resolveUnaxisVersion(): string {
  const defined = typeof UNAXIS_VERSION === "string" ? UNAXIS_VERSION.trim() : "";
  if (defined && defined !== "dev") return defined;
  try {
    const pkgUrl = new URL("./package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, "utf-8")) as { version?: string };
    if (typeof pkg.version === "string" && pkg.version && pkg.version !== "dev") return pkg.version;
  } catch {}
  return "dev";
}

interface GitProvenance {
  shortSha:  string;
  fullSha:   string;
  dirty:     boolean;
  branch:    string;
  commitMsg: string;
  author:    string;
}

let _cachedGitBin: string | null = null;
export function resolveGitBin(cwd: string = PROJECT_DIR): string {
  if (_cachedGitBin) return _cachedGitBin;
  if (process.platform === "linux" && cwd.startsWith("/mnt/")) {
    if (existsSync("/mnt/c/program files/git/cmd/git.exe")) {
      return (_cachedGitBin = "/mnt/c/program files/git/cmd/git.exe");
    }
    if (existsSync("/mnt/c/Program Files/Git/cmd/git.exe")) {
      return (_cachedGitBin = "/mnt/c/Program Files/Git/cmd/git.exe");
    }
    try {
      const probe = spawnSync("which", ["git.exe"], { encoding: "utf-8", timeout: 300 });
      if (probe.status === 0 && probe.stdout.trim()) {
        return (_cachedGitBin = probe.stdout.trim());
      }
    } catch {}
  }
  return (_cachedGitBin = "git");
}

let _provCache: { data: GitProvenance; expiresAt: number } | null = null;

/** Source provenance of the build context — best-effort; degrades to "nogit". */
function gitProvenance(): GitProvenance {
  const now = Date.now();
  if (_provCache && _provCache.expiresAt > now) {
    return _provCache.data;
  }
  const gitBin = resolveGitBin(PROJECT_DIR);

  let branch = "main";
  try {
    const head = readFileSync(join(PROJECT_DIR, ".git", "HEAD"), "utf-8").trim();
    if (head.startsWith("ref: refs/heads/")) {
      branch = head.replace("ref: refs/heads/", "");
    }
  } catch {}

  let fullSha = "";
  let shortSha = "nogit";
  let commitMsg = "";
  let author = "makeouthillx32";

  try {
    const logRes = spawnSync(gitBin, ["log", "-1", "--pretty=%H%x00%h%x00%s%x00%an"], {
      cwd: PROJECT_DIR,
      encoding: "utf-8",
      timeout: 1200,
    });
    if (logRes.status === 0 && logRes.stdout) {
      const parts = logRes.stdout.split("\0");
      if (parts.length >= 4) {
        fullSha = (parts[0] ?? "").trim();
        shortSha = (parts[1] ?? "").trim() || (fullSha ? fullSha.slice(0, 8) : "nogit");
        commitMsg = (parts[2] ?? "").trim();
        author = (parts[3] ?? "").trim() || "makeouthillx32";
      }
    }
  } catch {}

  let dirty = false;
  try {
    // Non-empty porcelain = uncommitted changes → the image matches no commit.
    // Pass -uno (untracked-files=no) to prevent 30+ second filesystem scans over 9p DrvFs mounts in WSL.
    const statusRes = spawnSync(gitBin, ["status", "--porcelain", "-uno"], {
      cwd: PROJECT_DIR,
      encoding: "utf-8",
      timeout: 1200,
    });
    dirty = statusRes.status === 0 && (statusRes.stdout ?? "").trim().length > 0;
  } catch {}

  const data: GitProvenance = {
    shortSha: shortSha || "nogit",
    fullSha,
    dirty,
    branch,
    commitMsg,
    author,
  };
  _provCache = { data, expiresAt: now + 15_000 };
  return data;
}

/** Content/source identity tag: `g<sha>[-dirty]` — the meaningful "version". */
function gitContentTag(prov: GitProvenance): string {
  return `g${prov.shortSha}${prov.dirty ? "-dirty" : ""}`;
}

async function tagAndPush(
  sourceImage: string,
  targetTag:   string,
  onLine:      (l: string) => void,
  dockerEnv:   Record<string, string>,
): Promise<void> {
  const target = `${imageBase(sourceImage)}:${targetTag}`;
  const tagCode = await spawnDocker(["tag", sourceImage, target], onLine, dockerEnv);
  if (tagCode !== 0) {
    onLine(`  Could not tag ${target} — skipping`);
    return;
  }
  const pushCode = await spawnDocker(["push", target], onLine, dockerEnv);
  if (pushCode === 0) {
    onLine(`  Tagged + pushed  ${target}`);
  } else {
    onLine(`  Push failed for  ${target} — skipping`);
  }
}

// ── Single zone build + push ──────────────────────────────────────────────────

// Every zone build shares this one repo-root context, and .dockerignore's
// zones exclusion plus its wildcard re-include line pulls in every zone's
// source on every single zone's build. Tank's Dockerfile only ever COPYs
// its own zone folder, but the context sent to the builder carries all
// 13+ zones' source regardless. Confirmed live 2026-08-24: a Tank build
// spent 305s just transferring a 149MB context before any actual build
// step ran. The ignore file can't reference which zone is being built (it
// is static, evaluated before build-args exist), so this narrows the
// wildcard to just this zone for the duration of the build and restores
// the original afterward, so the file goes back to its checked-in,
// all-zones form and a hand edit mid-session doesn't leave a confusing
// diff.
const DOCKERIGNORE_PATH = join(PROJECT_DIR, ".dockerignore");
const ZONE_REINCLUDE_PATTERN = new RegExp("^!zones/\\*/src(/\\*\\*)?$", "gm");

function scopeDockerignoreToZone(zoneKey: string): () => void {
  const original = readFileSync(DOCKERIGNORE_PATH, "utf8");
  const scoped = original.replace(ZONE_REINCLUDE_PATTERN, (match) =>
    match.replace("*", zoneKey),
  );
  if (scoped === original) {
    // Pattern didn't match (file edited since this was written) — build
    // with whatever's there rather than silently no-op scoping.
    return () => {};
  }
  writeFileSync(DOCKERIGNORE_PATH, scoped);
  return () => {
    try {
      writeFileSync(DOCKERIGNORE_PATH, original);
    } catch {
      // Restoring a text file we just read moments ago failing is not a
      // realistic case worth crashing the build result over.
    }
  };
}

/**
 * Build the Docker image for a zone and push it to GHCR.
 * Resolves GHCR credentials in the parent process to avoid Windows
 * credential-store failures in spawned child processes.
 */
export async function buildZone(
  zone:   Zone,
  onLine: (l: string) => void,
  opts:   { noCache?: boolean } = {},
): Promise<number> {
  onLine(`▶ Initializing build for ${zone.label}...`);
  const dockerfile = zone.dockerfile ?? "Dockerfile";
  const dockerCfg  = await createBuildDockerConfig();
  const restoreDockerignore = scopeDockerignoreToZone(zone.key);
  const t0         = Date.now();

  log.info("build", "started", {
    zone:      zone.key,
    image:     zone.image,
    noCache:   !!opts.noCache,
    dockerfile,
  });

  // Mirror every docker output line into the log file.
  const logBuild = (l: string) => { onLine(l); log.docker(zone.key, "build", l); };
  const logPush  = (l: string) => { onLine(l); log.docker(zone.key, "push",  l); };

  try {
    const buildArgs = loadBuildArgs(zone);
    const dockerEnvBuild = { DOCKER_CONFIG: dockerCfg.tmpDir };

    // Provenance for tags + OCI labels. The git content tag identifies the
    // SOURCE; the UNAXIS version becomes a label (build tool, not app version).
    // buildId is unique per build (ms) AND carries provenance — it doubles as
    // the SOURCE_REF cache-bust so the source layer always recompiles fresh.
    const prov       = gitProvenance();
    const unaxisVer  = resolveUnaxisVersion();
    const createdIso = new Date().toISOString();
    const buildId    = `${gitContentTag(prov)}@${Date.now()}`;
    if (prov.dirty) logBuild(`⚠ building from a DIRTY working tree — image will be tagged ${gitContentTag(prov)} (matches no commit)`);

    const depTarget = prov.branch === "main" ? "production" : "preview";
    const dep = dbCreateDeployment({
      zoneKey: zone.key,
      environmentId: (zone as any).environmentId ?? null,
      status: "building",
      target: depTarget,
      commitSha: prov.shortSha,
      commitMsg: prov.commitMsg || `build(${zone.key}): docker image`,
      branch: prov.branch,
      author: prov.author,
      image: zone.image,
    });

    // The default BuildKit builder can't attach RUN steps to a custom Docker
    // network, so Next.js SSG (`bun run build`) can't reach the internal
    // Supabase host (kong:8000) and hangs at "Generating static pages (0/92)"
    // until the daemon drops. Fix: use a docker-container buildx builder bound
    // to the `unenter` network so build-time DB access works. Created once and
    // reused. `--load` exports the result into the local image store so the
    // subsequent `docker push` can find it.
    const BUILDX_BUILDER = "unaxis-net";
    const inspectCode = await spawnDocker(["buildx", "inspect", BUILDX_BUILDER], () => {}, dockerEnvBuild);
    if (inspectCode !== 0) {
      logBuild(`--- creating buildx builder "${BUILDX_BUILDER}" on network unenter ---`);
      const createCode = await spawnDocker(
        ["buildx", "create", "--name", BUILDX_BUILDER, "--driver", "docker-container", "--driver-opt", "network=unenter", "--bootstrap"],
        logBuild, dockerEnvBuild,
      );
      if (createCode !== 0) {
        // Getting here does NOT mean the builder is missing.
        //
        // `buildx inspect` talks to the daemon over the WSL vsock, and that
        // link times out transiently on this host:
        //
        //   <3>WSL ERROR: UtilAcceptVsock:273: accept4 failed 110   (ETIMEDOUT)
        //
        // A timed-out inspect returns non-zero, which reads exactly like "no
        // such builder" — so we try to create one that already exists, and the
        // create fails on the name. Bailing here turned a blip into a failed
        // ship even though a healthy `unaxis-net` was running the whole time.
        //
        // So: ask again before believing it. If the builder is really there,
        // carry on. Only if it is genuinely absent do we reset and retry once,
        // reusing the same recovery the idle-watchdog path uses.
        const recheck = await spawnDocker(["buildx", "inspect", BUILDX_BUILDER], () => {}, dockerEnvBuild);
        if (recheck === 0) {
          logBuild(`--- builder "${BUILDX_BUILDER}" already exists (first inspect was a false negative) — continuing ---`);
        } else {
          await resetBuildxBuilder(logBuild);
          const retryCode = await spawnDocker(
            ["buildx", "create", "--name", BUILDX_BUILDER, "--driver", "docker-container", "--driver-opt", "network=unenter", "--bootstrap"],
            logBuild, dockerEnvBuild,
          );
          if (retryCode !== 0) {
            logBuild(`FAILED: could not create buildx builder "${BUILDX_BUILDER}"`);
            dbUpdateDeployment(dep.id, {
              status: "error",
              durationMs: Date.now() - t0,
              errorMessage: `Could not create buildx builder "${BUILDX_BUILDER}"`,
              completedAt: new Date().toISOString(),
            });
            return retryCode;
          }
        }
      }
    }

    const buildCmd  = [
      "buildx", "build",
      "--builder", BUILDX_BUILDER,
      // The builder (buildkitd) is attached to the `unenter` network via the
      // driver-opt below. `--network=host` makes RUN steps share buildkitd's
      // network namespace — i.e. the `unenter` network — so SSG can resolve
      // kong:8000. (BuildKit only accepts default/none/host here, not a name.)
      "--network", "host",
      // Load the built image into the local docker store for the push step.
      "--load",
      "--progress=plain",
      "--build-arg", "BUILDKIT_INLINE_CACHE=1",
      // Per-build cache-bust for the source/build layer. The Dockerfiles declare
      // `ARG SOURCE_REF` right before `bun run build` and echo it, so a unique
      // value here forces that RUN to re-execute against the freshly COPYed
      // source every build — killing the stale-layer class of bugs WITHOUT the
      // cost of a full `--no-cache` (the deps stage stays cached). Zones whose
      // Dockerfiles don't declare the ARG yet just emit a harmless warning.
      "--build-arg", `SOURCE_REF=${buildId}`,
      "--build-arg", `NEXT_BUILD_CPUS=${process.env.UNAXIS_BUILD_CPUS || "4"}`,
      // OCI labels — provenance lives in metadata, queryable via `docker
      // inspect`, never confused with the image tag. This is where the UNAXIS
      // build-tool version belongs (decoupled from app/zone content).
      "--label", `org.opencontainers.image.revision=${prov.fullSha}`,
      "--label", `org.opencontainers.image.created=${createdIso}`,
      "--label", `live.unenter.unaxis-version=${unaxisVer}`,
      "--label", `live.unenter.zone=${zone.key}`,
      "--label", `live.unenter.source-dirty=${prov.dirty}`,
      "--label", `live.unenter.build-id=${buildId}`,
      // --no-cache: bypass ALL layer caching.  Necessary when the Dockerfile
      // overlays files (zones/{key}/src/app/ → src/app/) whose inputs sometimes
      // hash-collide with prior builds of the same zone, reusing a stale
      // `next build` layer with the PREVIOUS zone's code.
      ...(opts.noCache ? ["--no-cache"] : []),
      "-f", dockerfile,
      ...buildArgs,
      "-t", zone.image,
      ".",
    ];

    logBuild(`--- build: ${zone.label}${opts.noCache ? "  (--no-cache)" : ""} ---`);
    logBuild(`docker buildx build (builder=${BUILDX_BUILDER}, network=unenter) -t ${zone.image} .`);

    // 7-minute idle watchdog (configurable via UNAXIS_BUILD_IDLE_TIMEOUT_MS):
    // kills + auto-resets the builder if the build goes fully silent.
    // 420s allows large multi-GB image tarball transfers and Next.js SSG page chunking
    // without triggering false-positive watchdog kills.
    const idleTimeoutMs = process.env.UNAXIS_BUILD_IDLE_TIMEOUT_MS
      ? parseInt(process.env.UNAXIS_BUILD_IDLE_TIMEOUT_MS, 10)
      : 420_000;

    let buildCode = await spawnDocker(buildCmd, logBuild, dockerEnvBuild, idleTimeoutMs);
    if (buildCode === DOCKER_IDLE_TIMEOUT_CODE) {
      await resetBuildxBuilder(logBuild);
      logBuild(`--- retrying build once against the fresh builder ---`);
      buildCode = await spawnDocker(buildCmd, logBuild, dockerEnvBuild, idleTimeoutMs);
    }
    if (buildCode !== 0) {
      log.error("build", "docker build failed", { zone: zone.key, exit: buildCode, ms: Date.now() - t0 });
      logBuild(`FAILED: build exited ${buildCode}`);
      dbUpdateDeployment(dep.id, {
        status: "error",
        durationMs: Date.now() - t0,
        errorMessage: `Docker build exited with code ${buildCode}`,
        completedAt: new Date().toISOString(),
      });
      return buildCode;
    }
    const buildDurationSec = ((Date.now() - t0) / 1000).toFixed(1);
    log.info("build", "docker build complete", { zone: zone.key, ms: Date.now() - t0 });
    logBuild(`OK: build complete in ${buildDurationSec}s`);

    logPush(`--- push: ${zone.image} ---`);
    const tp = Date.now();
    log.info("push", "started", { zone: zone.key, image: zone.image });
    const dockerEnv = { DOCKER_CONFIG: dockerCfg.tmpDir };
    const pushCode = await spawnDocker(["push", zone.image], logPush, dockerEnv);
    if (pushCode !== 0) {
      log.error("push", "registry denied or network error", { zone: zone.key, image: zone.image, exit: pushCode, ms: Date.now() - tp });
      logPush("FAILED: push - set GHCR token in Settings [s] -> [t]");
      dbUpdateDeployment(dep.id, {
        status: "error",
        durationMs: Date.now() - t0,
        errorMessage: `Push failed with exit code ${pushCode} (GHCR token or network error)`,
        completedAt: new Date().toISOString(),
      });
      return pushCode;
    }
    const pushDurationSec = ((Date.now() - tp) / 1000).toFixed(1);
    log.info("push", "complete", { zone: zone.key, image: zone.image, ms: Date.now() - tp });
    logPush(`OK: pushed ${zone.image} in ${pushDurationSec}s`);

    // ── Versioned tags — non-fatal, best-effort ──────────────────────────────
    // Push date+time and version tags alongside :latest so rollbacks are
    // always possible.  Failures here are logged but don't fail the build.
    logPush(`--- versioned tags ---`);
    const dateTag    = deploymentDateTag();
    const contentTag = gitContentTag(prov);   // g<sha>[-dirty] — source identity
    await tagAndPush(zone.image, dateTag,    logPush, dockerEnv);
    await tagAndPush(zone.image, contentTag, logPush, dockerEnv);
    log.info("push", "versioned tags pushed", { zone: zone.key, dateTag, contentTag, unaxisVersion: unaxisVer, dirty: prov.dirty });
    logPush(`OK: versioned tags pushed — ${contentTag}${prov.dirty ? " (DIRTY working tree — matches no commit)" : ""}`);

    const finalDurationMs = Date.now() - t0;
    dbUpdateDeployment(dep.id, {
      status: "ready",
      durationMs: finalDurationMs,
      completedAt: new Date().toISOString(),
    });
    if (depTarget === "production") {
      dbPromoteDeploymentToProduction(dep.id, zone.key);
    }

    return 0;

  } finally {
    dockerCfg.cleanup();
    restoreDockerignore();
    await parkBuildxBuilder(onLine).catch(() => {});
  }
}

// ── Build + deploy ("ship") ────────────────────────────────────────────────────

/**
 * Build + push, then deploy (pull + up) — the full "ship" for a zone. This is
 * what the TUI `b`/`R` actions, the CLI `zone <k> build`, and `--bg` builds all
 * run, so "what shipping means" lives in exactly one place. Returns the first
 * non-zero exit (build failure short-circuits the deploy).
 */
export async function buildAndDeploy(
  zone:   Zone,
  onLine: (l: string) => void,
  opts:   { noCache?: boolean } = {},
): Promise<number> {
  onLine(`=== Shipping ${zone.label} (${zone.key}) ===`);
  // Vercel-hosted zones never touch Docker — "build" is a git push instead.
  // This check lives HERE (not just in the IPC dispatcher) because the TUI's
  // own [b]/[R] keybindings call buildAndDeploy directly, bypassing that
  // dispatcher entirely — this is the one shared function both paths run
  // through, so it's the only place the check can't be missed.
  if (zone.hosting === "vercel") {
    return gitCommitAndPushZone(zone, onLine);
  }
  const code = await buildZone(zone, onLine, opts);
  if (code !== 0) return code;
  onLine("--- pull + up ---");
  // skipProxyReload: this is a build/rebuild of an EXISTING zone — its
  // UPSTREAM_<KEY> env var was already set on the proxy at creation time
  // and doesn't change on a routine rebuild, so recreating unt_proxy here
  // buys nothing and costs the whole site a brief connectivity blip on
  // every single build. Zone CREATION (createZonePipeline) still does its
  // own explicit proxy reload once real route/env changes land, which is
  // the only time this container actually needs to be recreated.
  const deployCode = await pullAndUp(zone, onLine, undefined, { skipProxyReload: true });
  if (deployCode === 0) recordZoneLedger(zone, "build+deploy");
  return deployCode;
}

/** Best-effort deploy-ledger entry: correlates this zone's source identity
 *  (git sha + dirty) with its image. Never throws — ledger is observability. */
function recordZoneLedger(zone: Zone, action: string): void {
  try {
    dbRecordLedger({
      zoneKey:       zone.key,
      action,
      sourceRef:     gitContentTag(gitProvenance()),
      image:         zone.image,
      environmentId: (zone as any).environmentId ?? null,
    });
  } catch { /* observability only — never fail a ship on the ledger */ }
}

// ── Deploy a single zone ──────────────────────────────────────────────────────

/**
 * Pull the latest image from GHCR and restart the zone's container.
 * Equivalent to: docker compose pull <service> && docker compose up -d <service>
 *
 * pullAndUp now chains a proxy reload at the end so host-based routing is
 * always in sync with the current compose file.  Batch callers (deployAll)
 * pass { skipProxyReload: true } and reload the proxy once at the end of
 * the batch to avoid recreating the proxy container N times.
 */
export async function deployZone(
  zone:    Zone,
  onLine:  (l: string) => void,
  options?: { skipProxyReload?: boolean },
): Promise<number> {
  const t0 = Date.now();
  log.info("deploy", "started", { zone: zone.key, image: zone.image });
  const logDeploy = (l: string) => { onLine(l); log.docker(zone.key, "deploy", l); };
  logDeploy(`--- deploy: ${zone.label} ---`);
  const code = await pullAndUp(zone, logDeploy, undefined, options);
  if (code !== 0) {
    log.error("deploy", "failed", { zone: zone.key, exit: code, ms: Date.now() - t0 });
  } else {
    log.info("deploy", "complete", { zone: zone.key, ms: Date.now() - t0 });
  }
  return code;
}

/**
 * Deploy a zone to a remote environment via the UNAXIS Agent manifest API (`POST /zones/deploy`).
 * Handles remote port resolution, preflight health verification against the POWER Supabase gateway,
 * 0600 secret env file creation, and container recreation on the remote host.
 */
export async function deployRemoteZoneManifest(
  zone:    Zone,
  env:     UnaxisEnvironment,
  onLine:  (l: string) => void,
): Promise<number> {
  const t0 = Date.now();
  onLine(`=== Deploying ${zone.label} to ${env.name} via agent ===`);
  try {
    ensureRuntimeEnv(true);
  } catch {}

  const prov = gitProvenance();
  const depTarget = prov.branch === "main" ? "production" : "preview";
  const dep = dbCreateDeployment({
    zoneKey: zone.key,
    environmentId: env.id,
    status: "building",
    target: depTarget,
    commitSha: prov.shortSha,
    commitMsg: prov.commitMsg || `deploy(${zone.key}): remote deploy to ${env.name}`,
    branch: prov.branch,
    author: prov.author,
    image: zone.image,
  });

  // 1. Determine target port on remote machine
  let targetPort = 3001;
  try {
    const containers = await fetchContainers(env);
    if (containers) {
      const match = containers.find((c) =>
        c.Names?.some((n) => n.replace(/^\//, "") === zone.container)
      );
      if (match && match.Ports && match.Ports.length > 0) {
        const bound = match.Ports.find((p) => p.PublicPort && p.PublicPort > 0);
        if (bound?.PublicPort) {
          targetPort = bound.PublicPort;
        }
      } else {
        const usedPorts = new Set<number>();
        for (const c of containers) {
          for (const p of c.Ports ?? []) {
            if (p.PublicPort) usedPorts.add(p.PublicPort);
          }
        }
        if (zone.key === "blog" && !usedPorts.has(3001)) {
          targetPort = 3001;
        } else if (zone.key === "docs" && !usedPorts.has(3002)) {
          targetPort = 3002;
        } else {
          let candidate = 3001;
          while (usedPorts.has(candidate)) candidate++;
          targetPort = candidate;
        }
      }
    }
  } catch (err) {
    onLine(`  (could not query remote containers for port, defaulting to ${targetPort})`);
  }

  // 2. Private LAN Kong gateway on POWER for server-side container traffic
  const kongHost = process.env.POWER_LAN_IP || "192.168.50.204";
  const supabaseLanUrl = `http://${kongHost}:8001`;

  // 3. Assemble environment variables
  const containerEnv: Record<string, string> = {
    NODE_ENV: "production",
    PORT: "3000",
    NEXT_PUBLIC_ZONE: zone.key,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "https://www.unenter.live",
    NEXT_PUBLIC_APP_TITLE: process.env.NEXT_PUBLIC_APP_TITLE || "unenter.live",
    NEXT_PUBLIC_COMPANY_NAME: process.env.NEXT_PUBLIC_COMPANY_NAME || "unenter",
    NEXT_PUBLIC_SUPABASE_URL_BROWSER: process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || "https://db.unenter.live",
    NEXT_PUBLIC_SUPABASE_URL: supabaseLanUrl,
    SUPABASE_URL: supabaseLanUrl,
    API_EXTERNAL_URL: process.env.API_EXTERNAL_URL || "https://db.unenter.live",
  };

  const keysToCopy = [
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SERVICE_ROLE_KEY",
    "BLOG_INGEST_TOKEN",
    "STATUS_PUBLIC_KEY",
    "NEXT_PUBLIC_GIPHY_API_KEY",
    "NEXT_PUBLIC_OWNER_USERNAME",
    "NEXT_PUBLIC_OWNER_EMAIL",
  ];

  for (const k of keysToCopy) {
    if (process.env[k]) {
      containerEnv[k] = process.env[k]!;
    }
  }

  const buildKeys = loadBuildEnvKeys(zone);
  if (buildKeys) {
    for (const k of buildKeys) {
      if (process.env[k] && !containerEnv[k]) {
        containerEnv[k] = process.env[k]!;
      }
    }
  }

  const manifest: ZoneDeployManifest = {
    zone: zone.key,
    name: zone.container,
    image: zone.image,
    port: targetPort,
    internalPort: 3000,
    domain: zone.domain,
    preflight: {
      supabase_health_url: `${supabaseLanUrl}/auth/v1/health`,
    },
    env: containerEnv,
  };

  const res = await deployRemoteZone(env, manifest, onLine);
  if (!res.ok) {
    dbUpdateDeployment(dep.id, {
      status: "error",
      durationMs: Date.now() - t0,
      errorMessage: res.error || "Remote deploy failed",
      completedAt: new Date().toISOString(),
    });
    log.error("deploy", "remote deploy failed", { zone: zone.key, env: env.name, error: res.error, ms: Date.now() - t0 });
    return 1;
  }

  const finalDurationMs = Date.now() - t0;
  dbUpdateDeployment(dep.id, {
    status: "ready",
    durationMs: finalDurationMs,
    completedAt: new Date().toISOString(),
  });
  if (depTarget === "production") {
    dbPromoteDeploymentToProduction(dep.id, zone.key);
  }

  log.info("deploy", "remote deploy succeeded", { zone: zone.key, env: env.name, port: targetPort, ms: Date.now() - t0 });
  onLine(`✓ Deployed ${zone.label} to ${env.name}:${targetPort} (status: ${res.httpStatus ?? 200})`);

  // Persist port to zone control state
  try {
    const { dbSetZonePort } = await import("./control-db.ts");
    dbSetZonePort(zone.key, targetPort);
    const { invalidateZoneCache } = await import("./zone-store.ts");
    invalidateZoneCache();
  } catch (err) {
    onLine(`  (warning: failed to save zone port ${targetPort}: ${err})`);
  }

  // Synchronize NPM proxy host with the live port
  try {
    const { npmAddZone } = await import("./npm/zone.ts");
    await npmAddZone({ ...zone, port: targetPort }, onLine, env);
  } catch (err) {
    onLine(`  (warning: failed to sync NPM for ${zone.label}: ${err})`);
  }

  return 0;
}

// ── Build + deploy all zones ──────────────────────────────────────────────────

/**
 * Build and push every zone that has a local Dockerfile, then deploy all zones.
 *
 * Zones without a dockerfile (undefined) are skipped for the build step but
 * still get a pull+up so they stay on the latest GHCR image.
 *
 * Key: [a] in the TUI — "Build all + deploy"
 */
/**
 * Build + push every zone that has a local Dockerfile.
 * Matches the behaviour of build-and-push.ps1 — no deploy step.
 * Key: [a] on the zones panel.
 */
export async function buildAll(
  zones:  Zone[],
  onLine: (l: string) => void,
): Promise<number> {
  const buildable = zones.filter((z) => z.dockerfile !== undefined);

  onLine(`=== Build & push all (${buildable.length} image${buildable.length !== 1 ? "s" : ""}) ===`);

  // Sequential — avoids GHCR rate limits and keeps output readable
  for (const zone of buildable) {
    const code = await buildZone(zone, onLine);
    if (code !== 0) {
      onLine(`✗ Aborting — ${zone.label} build failed`);
      return code;
    }
    onLine("");
  }

  onLine(`=== All images pushed ===`);
  onLine(`Tip: press [d] on each zone to pull + restart, or [A] to deploy all.`);
  return 0;
}

/**
 * Pull the latest image and restart every zone.
 * Key: [A] (shift-a) on the zones panel — deploy without rebuilding.
 */
export async function deployAll(
  zones:  Zone[],
  onLine: (l: string) => void,
): Promise<number> {
  onLine(`=== Deploy all (${zones.length} zone${zones.length !== 1 ? "s" : ""}) ===`);

  // Skip per-zone proxy reloads — we'll do a single reload at the end so the
  // proxy isn't torn down and recreated N times during a bulk deploy.
  for (const zone of zones) {
    const code = await deployZone(zone, onLine, { skipProxyReload: true });
    if (code !== 0) {
      onLine(`✗ Deploy failed for ${zone.label} (exit ${code}) — continuing`);
    }
    onLine("");
  }

  // Single proxy reload for the whole batch — picks up any env / upstream
  // changes and guarantees routing is in sync with the current compose file.
  onLine(`--- reload proxy (batch) ---`);
  const proxyCode = await reloadProxy(onLine);
  if (proxyCode !== 0) {
    onLine(`⚠ proxy reload failed (exit ${proxyCode}) — retry with [R] on the zones panel.`);
  }

  onLine(`=== All zones restarted ===`);
  return 0;
}

// ── Git push ──────────────────────────────────────────────────────────────────

/**
 * Run `git push` from the project root, streaming output.
 * Key: [g] in the TUI.
 */
export async function gitPush(onLine: (l: string) => void): Promise<number> {
  const { spawn } = await import("child_process");
  const { drainStream } = await import("./utils.ts");
  const gitBin = resolveGitBin(PROJECT_DIR);

  onLine("--- git push ---");

  const proc = spawn(gitBin, ["push"], {
    cwd:   PROJECT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let code = 1;
  const exited = new Promise<void>((resolve) => {
    proc.on("close", (c) => {
      code = c ?? 1;
      resolve();
    });
  });

  drainStream(proc.stdout!, onLine);
  drainStream(proc.stderr!, onLine);

  await exited;
  return code;
}

// ── Git commit + push (Vercel-hosted zones) ─────────────────────────────────

/**
 * For zones with hosting: 'vercel' — the "build" step is a git commit+push
 * of the zone's own source paths instead of a Docker build. An external
 * Vercel project (linked to this same repo, Root Directory scoped to the
 * zone) watches `main` and builds/deploys on its own; no image, no container.
 *
 * Scoped `git add` (never -A) so this only ever touches the zone's own
 * paths, regardless of whatever else is dirty elsewhere in the tree.
 */
export async function gitCommitAndPushZone(
  zone:   Zone,
  onLine: (l: string) => void,
): Promise<number> {
  const gitBin = resolveGitBin(PROJECT_DIR);
  const paths = [`zones/${zone.key}`, `src/zones/${zone.key}`];
  const branchResult = spawnSync(gitBin, ["branch", "--show-current"], { cwd: PROJECT_DIR, timeout: 2000 });
  const branch = branchResult.status === 0
    ? branchResult.stdout?.toString().trim() || "unknown"
    : "unknown";

  onLine(`--- Vercel git lane: ${branch} ---`);
  if (branch !== "main") {
    onLine(`⚠ ${zone.label} production tracks main; this push can create a preview but does not publish production.`);
  }

  onLine(`--- git add (${paths.join(", ")}) ---`);
  const add = spawnSync(gitBin, ["add", ...paths], { cwd: PROJECT_DIR, timeout: 5000 });
  if (add.status !== 0) {
    onLine(`✗ git add failed: ${add.stderr?.toString().trim()}`);
    return add.status ?? 1;
  }

  const staged = spawnSync(gitBin, ["diff", "--cached", "--quiet"], { cwd: PROJECT_DIR, timeout: 2000 });
  if (staged.status === 0) {
    onLine("(nothing staged under this zone's paths — skipping commit)");
  } else {
    onLine("--- git commit ---");
    const commit = spawnSync(
      gitBin,
      ["commit", "-m", `chore(${zone.key}): sync zone source for Vercel build`],
      { cwd: PROJECT_DIR, timeout: 5000 },
    );
    for (const line of commit.stdout?.toString().split("\n") ?? []) if (line) onLine(line);
    if (commit.status !== 0) {
      onLine(`✗ git commit failed: ${commit.stderr?.toString().trim()}`);
      return commit.status ?? 1;
    }
  }

  const pushCode = await gitPush(onLine);
  if (pushCode === 0) {
    recordZoneLedger(zone, "git-push");
    onLine(branch === "main"
      ? `✓ pushed ${zone.label} on main; Vercel production build should start`
      : `✓ pushed ${zone.label} on ${branch}; production is unchanged until merge-to-main or an explicit Vercel promote`);
  }
  return pushCode;
}

/** Promote a completed Vercel preview deployment to the project's production
 * aliases. Kept behind the UNAXIS command surface so Vercel-hosted zones have
 * the same visible, auditable lifecycle boundary as Docker-hosted zones. */
export async function promoteVercelZone(
  zone: Zone,
  deploymentUrl: string,
  onLine: (line: string) => void,
): Promise<number> {
  let parsed: URL;
  try {
    parsed = new URL(deploymentUrl);
  } catch {
    onLine("✗ deployment must be a valid https://*.vercel.app URL");
    return 2;
  }

  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".vercel.app")) {
    onLine("✗ deployment must be a valid https://*.vercel.app URL");
    return 2;
  }

  onLine(`--- vercel promote (${zone.key}) ---`);
  const executable = process.platform === "win32" ? "vercel.cmd" : "vercel";
  const proc = spawn(executable, ["promote", parsed.toString(), "--yes", "--no-color"], {
    cwd: PROJECT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });

  drainStream(proc.stdout!, onLine);
  drainStream(proc.stderr!, onLine);

  return new Promise<number>((resolve) => {
    proc.on("error", (error) => {
      onLine(`✗ vercel promote failed to start: ${error.message}`);
      resolve(1);
    });
    proc.on("close", (code) => resolve(code ?? 1));
  });
}
