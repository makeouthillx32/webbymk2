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
import { composeRun, pullAndUp }             from "./docker.ts";
import { drainStream }                       from "./utils.ts";
import { getCredential }                     from "../utils/secureStorage/index.js";
import { log }                               from "./logger.ts";

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

async function spawnDocker(
  args:     string[],
  onLine:   (l: string) => void,
  extraEnv: Record<string, string> = {},
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
  const exited = new Promise<void>((resolve, reject) => {
    proc.on("close", (c) => { code = c ?? 1; resolve(); });
    proc.on("error", reject);
  });

  // Legacy builder (DOCKER_BUILDKIT=0) writes step headers to stdout and
  // layer progress to stderr.  Drain both so nothing is lost.
  await Promise.all([
    drainStream(proc.stdout, onLine),
    drainStream(proc.stderr, onLine),
    exited,
  ]);
  return code;
}

// ── Versioned image tag helpers ───────────────────────────────────────────────
//
// Every successful push produces three tags:
//   :latest          — always the most recent build (mutable)
//   :YYYY-MM-DD-HHmm — date+time snapshot (immutable, good for rollback)
//   :v{semver}       — UNAXIS version at build time (immutable)
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

function unaxisVersionTag(): string {
  const definedVersion =
    typeof UNAXIS_VERSION === "string" ? UNAXIS_VERSION.trim() : "";
  if (definedVersion && definedVersion !== "dev") {
    return `v${definedVersion}`;
  }

  try {
    const pkgUrl = new URL("./package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, "utf-8")) as { version?: string };
    if (typeof pkg.version === "string" && pkg.version) {
      if (pkg.version !== "dev") {
        return `v${pkg.version}`;
      }
    }
  } catch {}
  return "";
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
  const dockerfile = zone.dockerfile ?? "Dockerfile";
  const dockerCfg  = await createBuildDockerConfig();
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
      if (createCode !== 0) { logBuild(`FAILED: could not create buildx builder "${BUILDX_BUILDER}"`); return createCode; }
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

    // DOCKER_CONFIG points to our temp dir with embedded GHCR credentials
    // for the push step; the build itself only uses public base images.
    const buildCode = await spawnDocker(buildCmd, logBuild, dockerEnvBuild);
    if (buildCode !== 0) {
      log.error("build", "docker build failed", { zone: zone.key, exit: buildCode, ms: Date.now() - t0 });
      logBuild(`FAILED: build exited ${buildCode}`);
      return buildCode;
    }
    log.info("build", "docker build complete", { zone: zone.key, ms: Date.now() - t0 });
    logBuild(`OK: build complete`);

    logPush(`--- push: ${zone.image} ---`);
    const tp = Date.now();
    log.info("push", "started", { zone: zone.key, image: zone.image });
    const dockerEnv = { DOCKER_CONFIG: dockerCfg.tmpDir };
    const pushCode = await spawnDocker(["push", zone.image], logPush, dockerEnv);
    if (pushCode !== 0) {
      log.error("push", "registry denied or network error", { zone: zone.key, image: zone.image, exit: pushCode, ms: Date.now() - tp });
      logPush("FAILED: push - set GHCR token in Settings [s] -> [t]");
      return pushCode;
    }
    log.info("push", "complete", { zone: zone.key, image: zone.image, ms: Date.now() - tp });
    logPush(`OK: pushed ${zone.image}`);

    // ── Versioned tags — non-fatal, best-effort ──────────────────────────────
    // Push date+time and version tags alongside :latest so rollbacks are
    // always possible.  Failures here are logged but don't fail the build.
    logPush(`--- versioned tags ---`);
    const dateTag    = deploymentDateTag();
    const versionTag = unaxisVersionTag();
    await tagAndPush(zone.image, dateTag, logPush, dockerEnv);
    if (versionTag) await tagAndPush(zone.image, versionTag, logPush, dockerEnv);
    log.info("push", "versioned tags pushed", { zone: zone.key, dateTag, versionTag: versionTag ?? null });
    logPush(`OK: versioned tags pushed`);

    return 0;

  } finally {
    dockerCfg.cleanup();
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
  const code = await buildZone(zone, onLine, opts);
  if (code !== 0) return code;
  onLine("--- pull + up ---");
  return pullAndUp(zone, onLine);
}

// ── Deploy a single zone ──────────────────────────────────────────────────────

/**
 * Pull the latest image from GHCR and restart the zone's container.
 * Equivalent to: docker compose pull <service> && docker compose up -d <service>
 */
export async function deployZone(
  zone:   Zone,
  onLine: (l: string) => void,
): Promise<number> {
  const t0 = Date.now();
  log.info("deploy", "started", { zone: zone.key, image: zone.image });
  const logDeploy = (l: string) => { onLine(l); log.docker(zone.key, "deploy", l); };
  logDeploy(`--- deploy: ${zone.label} ---`);
  const code = await pullAndUp(zone, logDeploy);
  if (code !== 0) {
    log.error("deploy", "failed", { zone: zone.key, exit: code, ms: Date.now() - t0 });
  } else {
    log.info("deploy", "complete", { zone: zone.key, ms: Date.now() - t0 });
  }
  return code;
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

  for (const zone of zones) {
    const code = await deployZone(zone, onLine);
    if (code !== 0) {
      onLine(`✗ Deploy failed for ${zone.label} (exit ${code}) — continuing`);
    }
    onLine("");
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

  onLine("--- git push ---");

  const proc = spawn("git", ["push"], {
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
