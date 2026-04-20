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

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir, homedir }   from "os";
import { join }              from "path";
import { spawn, spawnSync }  from "child_process";
import { PROJECT_DIR, GHCR_USER, type Zone } from "../config/zones.ts";
import { composeRun, pullAndUp }             from "./docker.ts";
import { drainStream }                       from "./utils.ts";

// ── Build args ────────────────────────────────────────────────────────────────

/** Parse NEXT_PUBLIC_* vars from .env → flat --build-arg pairs for docker build. */
function loadBuildArgs(): string[] {
  const args: string[] = [];
  try {
    const content = readFileSync(`${PROJECT_DIR}/.env`, "utf-8");
    // .env may be saved with CRLF on Windows — split on both LF and CRLF so the
    // regex below (which uses $ without the /s flag, so . doesn't match \r and
    // $ won't anchor before \r) matches cleanly.  Without this, every CRLF line
    // fails to match and NO build-args get passed — Next.js then builds with
    // empty process.env.NEXT_PUBLIC_* and supabase.createClient("") throws
    // "Failed to collect page data" for any API route that inits at module load.
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.replace(/\r$/, "");
      const m = line.match(/^(NEXT_PUBLIC_[^=\s]+)=(.*)$/);
      if (m) args.push("--build-arg", `${m[1]}=${m[2]}`);
    }
  } catch {
    // No .env present — proceed without NEXT_PUBLIC vars
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

function resolveGhcrToken(): string | null {
  // ── Priority 1: PAT stored in our own config.json ──────────────────────────
  //
  // Add  "ghcrToken": "ghp_xxxxxxxxxxxx"  to %APPDATA%\unenter\config.json.
  // This completely bypasses Windows Credential Manager and works from any
  // child-process context.  Recommended on Windows where wincred fails.
  //
  // The value may be:
  //   • a raw PAT  (ghp_…)         → we encode as base64(GHCR_USER:PAT)
  //   • already base64-encoded      → we use it directly (contains ':' decoded)
  const unenterCfgPath = join(
    process.env["APPDATA"] ?? homedir(),
    "unenter", "config.json",
  );
  try {
    const uc = JSON.parse(readFileSync(unenterCfgPath, "utf8")) as Record<string, unknown>;
    const pat = (uc["ghcrToken"] as string | undefined)?.trim();
    if (pat) {
      // Detect if already base64-encoded (decoded form contains ":")
      try {
        const decoded = Buffer.from(pat, "base64").toString("utf8");
        if (decoded.includes(":")) return pat;
      } catch {}
      // Raw PAT → encode with the GHCR username from config
      return Buffer.from(`${GHCR_USER}:${pat}`).toString("base64");
    }
  } catch {}

  // ── Priority 2: base64 auth already in Docker's config ────────────────────
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
    return null;
  }

  // Check both "ghcr.io" and "https://ghcr.io" key formats
  const auths = dockerCfg["auths"] as Record<string, { auth?: string }> | undefined;
  for (const key of ["ghcr.io", "https://ghcr.io"]) {
    const a = auths?.[key]?.auth;
    if (a) return a;
  }

  // ── Priority 3: credential helper (may fail on Windows with wincred) ───────
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
          return Buffer.from(`${c.Username}:${c.Secret}`).toString("base64");
        } catch {}
      }
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
          return Buffer.from(`${c.Username}:${c.Secret}`).toString("base64");
        } catch {}
      }
    }
    break; // only retry the loop if needed
  }

  return null;
}

/**
 * Create a temp DOCKER_CONFIG directory with no credsStore.
 * GHCR auth is embedded as base64 so pushes work.
 * Public images (docker.io) are fetched anonymously — no credential check.
 *
 * Must be called from the interactive TUI process, not from a child process.
 */
function createBuildDockerConfig(): BuildDockerConfig {
  const ghcrToken = resolveGhcrToken();

  const config: Record<string, unknown> = {
    auths: {} as Record<string, unknown>,
  };

  if (ghcrToken) {
    (config["auths"] as Record<string, unknown>)["ghcr.io"] = { auth: ghcrToken };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "unt-docker-"));
  writeFileSync(join(tmpDir, "config.json"), JSON.stringify(config, null, 2), "utf8");

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
  const dockerCfg  = createBuildDockerConfig();

  try {
    const buildArgs = loadBuildArgs();
    const buildCmd  = [
      "build",
      // --cache-from omitted: BuildKit resolves it inside buildkitd which
      // ignores DOCKER_CONFIG on the host, causing credential failures for
      // private GHCR repos. BuildKit's local layer cache handles re-builds.
      "--progress=plain",
      "--build-arg", "BUILDKIT_INLINE_CACHE=1",
      // --no-cache: bypass ALL BuildKit layer caching.  Necessary when the
      // Dockerfile overlays files (like our zones/{key}/src/app/ → src/app/
      // swap) whose inputs sometimes hash-collide with prior builds of the
      // same zone, causing BuildKit to reuse a stale `next build` layer that
      // contains the PREVIOUS zone's code.  Symptom: test2 serves test1's
      // content after delete+rescaffold.  Use [R] Rebuild in the TUI.
      ...(opts.noCache ? ["--no-cache"] : []),
      "-f", dockerfile,
      ...buildArgs,
      "-t", zone.image,
      ".",
    ];

    onLine(`--- build: ${zone.label}${opts.noCache ? "  (--no-cache)" : ""} ---`);
    onLine(`docker build ${opts.noCache ? "--no-cache " : ""}... -t ${zone.image} .`);

    // BuildKit (default) — matches build-and-push.ps1 + docker compose.
    // DOCKER_CONFIG points to our temp dir with embedded GHCR credentials
    // for the push step; the build itself only uses public base images.
    const buildCode = await spawnDocker(buildCmd, onLine, {
      DOCKER_CONFIG: dockerCfg.tmpDir,
    });
    if (buildCode !== 0) {
      onLine(`FAILED: build exited ${buildCode}`);
      return buildCode;
    }
    onLine(`OK: build complete`);

    onLine(`--- push: ${zone.image} ---`);
    const pushCode = await spawnDocker(["push", zone.image], onLine, {
      DOCKER_CONFIG: dockerCfg.tmpDir,
    });
    if (pushCode !== 0) {
      onLine(`FAILED: push — set GHCR token in Settings [s] → [t]`);
    } else {
      onLine(`OK: pushed ${zone.image}`);
    }
    return pushCode;

  } finally {
    dockerCfg.cleanup();
  }
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
  onLine(`--- deploy: ${zone.label} ---`);
  return pullAndUp(zone, onLine);
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