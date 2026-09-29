// scripts/tui-dev.ts
// Polling hot-refresh runner for Windows drives mounted into WSL.
//
// Bun 1.4.x can throw "directory mismatch ... fd 3" when its TS watcher loads
// --tsconfig-override from /mnt/<drive>. Build with Bun (which is reliable on
// the mount), then run the single Node-compatible bundle. This also gives each
// restarted TUI a fresh Node process and PTY lifecycle.

import { spawn, type Subprocess } from "bun";
import chokidar from "chokidar";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
// tree-kill is already a runtime dependency; it discovers descendants before
// terminating the root, which prevents startup/self-heal children becoming orphans.
// @ts-expect-error package does not publish TypeScript declarations
import treeKill from "tree-kill";

const PROJECT_ROOT = resolve(import.meta.dir, "..");
const DIST_ENTRY = resolve(PROJECT_ROOT, "src", "ink", "dist", "cli.js");
const LEASE_DIR = resolve(homedir(), ".unaxis");
const LEASE_PATH = resolve(LEASE_DIR, "tui-dev-runner.json");
const TMUX_SESSION = "unaxis-dev";

function hasTmuxBinary(): boolean {
  if (process.platform === "win32") return false;
  try {
    const check = spawnSync("which", ["tmux"], { stdio: "ignore" });
    return check.status === 0;
  } catch {
    return false;
  }
}

function isInsideTargetTmuxSession(): boolean {
  if (process.env.UNAXIS_IN_TMUX === "1") return true;
  if (process.env.TMUX) {
    try {
      const res = spawnSync("tmux", ["display-message", "-p", "#S"], { encoding: "utf8" });
      if (res.status === 0 && res.stdout.trim() === TMUX_SESSION) {
        return true;
      }
    } catch {}
  }
  return false;
}

function tmuxSessionActive(): boolean {
  try {
    const res = spawnSync("tmux", ["has-session", "-t", TMUX_SESSION], { stdio: "ignore" });
    if (res.status !== 0) return false;

    // Check if pane is dead or if any alive process is still running
    const checkDead = spawnSync("tmux", ["list-panes", "-t", TMUX_SESSION, "-F", "#{pane_dead} #{pane_pid}"], { encoding: "utf8" });
    if (checkDead.status !== 0 || !checkDead.stdout.trim()) {
      spawnSync("tmux", ["kill-session", "-t", TMUX_SESSION], { stdio: "ignore" });
      return false;
    }

    const lines = checkDead.stdout.trim().split("\n");
    const anyAlive = lines.some((line) => {
      const parts = line.trim().split(/\s+/);
      const isDead = parts[0];
      const pid = parseInt(parts[1] ?? "0", 10);
      return isDead !== "1" && pid > 0 && processAlive(pid);
    });

    if (!anyAlive) {
      // Zombie or dead session — clean it up so we don't attach to a dead pane
      spawnSync("tmux", ["kill-session", "-t", TMUX_SESSION], { stdio: "ignore" });
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function ensureTmuxOrAttach(): Promise<void> {
  const allowTmux = process.env.UNAXIS_NO_TMUX !== "1" && !process.argv.includes("--no-tmux");
  if (!allowTmux || !hasTmuxBinary()) return;

  if (isInsideTargetTmuxSession()) {
    return;
  }

  const restartRequested = process.argv.includes("--restart") || process.argv.includes("-r");
  const sessionExists = tmuxSessionActive();
  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (restartRequested && sessionExists) {
    process.stdout.write(`\x1b[33m[tui:dev]\x1b[0m Stopping existing UNAXIS session…\n`);
    spawnSync("tmux", ["kill-session", "-t", TMUX_SESSION], { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 200));
  } else if (sessionExists) {
    if (isInteractive) {
      process.stdout.write(`\x1b[32m[tui:dev]\x1b[0m Attaching to running UNAXIS dev session…\n`);
      let attachRes: { status: number | null };
      if (process.env.TMUX) {
        attachRes = spawnSync("tmux", ["switch-client", "-t", TMUX_SESSION], { stdio: "inherit" });
      } else {
        attachRes = spawnSync("tmux", ["attach-session", "-t", TMUX_SESSION], { stdio: "inherit" });
      }
      if (!tmuxSessionActive()) {
        spawnSync("tmux", ["kill-session", "-t", TMUX_SESSION], { stdio: "ignore" });
      }
      process.exit(attachRes.status ?? 0);
    } else {
      process.stdout.write(`[tui:dev] UNAXIS session '${TMUX_SESSION}' already active.\n`);
    }
    process.exit(0);
  }

  // If no tmux session is active, check if an older bare runner is holding the lease
  const existing = readLease();
  if (existing?.projectRoot === PROJECT_ROOT && existing.runnerPid && processAlive(existing.runnerPid)) {
    process.stdout.write(`\x1b[33m[tui:dev]\x1b[0m Migrating active bare runner (PID ${existing.runnerPid}) into shared attachable session…\n`);
    await stopPid(existing.runnerPid);
    if (existing.childPid && processAlive(existing.childPid)) {
      await stopPid(existing.childPid);
    }
    writeLease(null);
  }

  // Create detached tmux session running this script with UNAXIS_IN_TMUX=1 and UNAXIS_DEV=true
  const scriptPath = resolve(PROJECT_ROOT, "scripts", "tui-dev.ts");
  spawnSync("tmux", [
    "new-session", "-d", "-s", TMUX_SESSION,
    "-e", "UNAXIS_IN_TMUX=1",
    "-e", "UNAXIS_DEV=true",
    `${process.execPath} ${scriptPath}`
  ], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, UNAXIS_IN_TMUX: "1", UNAXIS_DEV: "true" },
    stdio: "ignore",
  });
  spawnSync("tmux", ["set-option", "-t", TMUX_SESSION, "status", "off"], { stdio: "ignore" });
  spawnSync("tmux", ["set-option", "-t", TMUX_SESSION, "mouse", "on"], { stdio: "ignore" });
  spawnSync("tmux", ["set-option", "-t", TMUX_SESSION, "window-size", "latest"], { stdio: "ignore" });
  spawnSync("tmux", ["set-option", "-t", TMUX_SESSION, "remain-on-exit", "off"], { stdio: "ignore" });

  await new Promise((r) => setTimeout(r, 300));

  if (isInteractive) {
    let attachRes: { status: number | null };
    if (process.env.TMUX) {
      attachRes = spawnSync("tmux", ["switch-client", "-t", TMUX_SESSION], { stdio: "inherit" });
    } else {
      attachRes = spawnSync("tmux", ["attach-session", "-t", TMUX_SESSION], { stdio: "inherit" });
    }
    if (!tmuxSessionActive()) {
      spawnSync("tmux", ["kill-session", "-t", TMUX_SESSION], { stdio: "ignore" });
    }
    process.exit(attachRes.status ?? 0);
  } else {
    process.stdout.write(`[tui:dev] Started UNAXIS in background tmux session '${TMUX_SESSION}'.\n`);
  }
  process.exit(0);
}

let child: Subprocess | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
let reloadRunning = false;
let reloadRequested = false;
let shuttingDown = false;

type RunnerLease = { runnerPid: number; childPid: number | null; projectRoot: string };

function processAlive(pid: number | null): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLease(): RunnerLease | null {
  if (!existsSync(LEASE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(LEASE_PATH, "utf8")) as RunnerLease;
  } catch {
    return null;
  }
}

function writeLease(childPid: number | null): void {
  mkdirSync(LEASE_DIR, { recursive: true });
  writeFileSync(LEASE_PATH, JSON.stringify({ runnerPid: process.pid, childPid, projectRoot: PROJECT_ROOT }));
}

function removeOwnLease(): void {
  const lease = readLease();
  if (lease?.runnerPid !== process.pid) return;
  try { unlinkSync(LEASE_PATH); } catch {}
}

async function stopPid(pid: number): Promise<void> {
  if (!processAlive(pid)) return;
  try { process.kill(pid, "SIGTERM"); } catch {}
  for (let attempt = 0; attempt < 15 && processAlive(pid); attempt++) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  if (processAlive(pid)) {
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
}

function stopProcessTree(pid: number, signal: NodeJS.Signals): Promise<void> {
  return new Promise((resolveStop) => {
    treeKill(pid, signal, () => resolveStop());
  });
}

async function claimRunnerLease(): Promise<void> {
  const existing = readLease();
  if (existing?.projectRoot === PROJECT_ROOT && existing.runnerPid !== process.pid) {
    if (processAlive(existing.runnerPid)) {
      throw new Error(`UNAXIS dev runner is already active (pid ${existing.runnerPid}).`);
    }
    if (existing.childPid && processAlive(existing.childPid)) {
      process.stderr.write(`[tui:dev] Cleaning stale child pid ${existing.childPid} from the previous runner…\n`);
      await stopPid(existing.childPid);
    }
  }
  writeLease(null);
}

async function buildBundle(): Promise<boolean> {
  const build = spawn({
    cmd: ["bun", "--cwd", "src/ink", "build.ts"],
    cwd: PROJECT_ROOT,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  return (await build.exited) === 0;
}

function startTuiChild(): void {
  child = spawn({
    cmd: [process.execPath, DIST_ENTRY],
    cwd: PROJECT_ROOT,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      UNAXIS_DEV: "true",
      TUI_DEV_WATCH: "1",
    },
  });

  const startedChild = child;
  writeLease(startedChild.pid);
  void startedChild.exited.then(async (code) => {
    if (child === startedChild) child = null;
    if (!child) writeLease(null);
    if (!shuttingDown && !reloadRunning) {
      await shutdown(code ?? 0);
    }
  });
}

async function stopTuiChild(): Promise<void> {
  const active = child;
  if (!active) return;
  child = null;
  await stopProcessTree(active.pid, "SIGTERM");

  const exited = await Promise.race([
    active.exited.then(() => true),
    new Promise<false>((resolveTimeout) => setTimeout(() => resolveTimeout(false), 1_500)),
  ]);
  if (!exited) {
    await stopProcessTree(active.pid, "SIGKILL");
    await active.exited.catch(() => undefined);
  }
  writeLease(null);
}

async function rebuildAndRestart(changedPath: string): Promise<void> {
  if (reloadRunning) {
    reloadRequested = true;
    return;
  }
  reloadRunning = true;
  try {
    let nextPath = changedPath;
    let latestBuildSucceeded = false;
    do {
      reloadRequested = false;
      const relPath = nextPath.replace(PROJECT_ROOT, "").replace(/^[/\\]/, "");
      process.stderr.write(`\n\x1b[36m[tui:dev]\x1b[0m File changed: \x1b[1m${relPath}\x1b[0m — building…\n`);

      // Keep the last known-good TUI running when a source edit does not bundle.
      latestBuildSucceeded = await buildBundle();
      if (!latestBuildSucceeded) {
        process.stderr.write("\x1b[31m[tui:dev]\x1b[0m Build failed; keeping the previous TUI alive.\n");
      }
      nextPath = "additional source changes";
    } while (reloadRequested && !shuttingDown);

    // A burst can request another build while Bun is replacing dist/cli.js.
    // Restart only after the final successful bundle so a fresh Node child can
    // never race the next build's temporary removal of the output file.
    if (latestBuildSucceeded && !shuttingDown) {
      await stopTuiChild();
      startTuiChild();
    }
  } finally {
    reloadRunning = false;
  }
}

function ignoredWatchPath(candidate: string): boolean {
  const normalized = candidate.replaceAll("\\", "/");
  return /\/(node_modules|dist|\.git|\.next)(\/|$)/.test(normalized)
    || /\.(db[^/]*|tmp|log|swp)$/.test(normalized)
    || normalized.endsWith("/package.json");
}

const watcher = chokidar.watch([
  resolve(PROJECT_ROOT, "src", "main.tsx"),
  resolve(PROJECT_ROOT, "src", "ink"),
  resolve(PROJECT_ROOT, "src", "utils"),
  resolve(PROJECT_ROOT, "src", "types"),
  resolve(PROJECT_ROOT, "src", "config"),
  resolve(PROJECT_ROOT, "src", "bootstrap"),
], {
  usePolling: true,
  interval: 400,
  binaryInterval: 800,
  ignoreInitial: true,
  ignored: ignoredWatchPath,
});

function triggerReload(changedPath: string): void {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => void rebuildAndRestart(changedPath), 300);
}

watcher.on("change", triggerReload);
watcher.on("add", triggerReload);
watcher.on("unlink", triggerReload);

async function shutdown(code: number): Promise<never> {
  if (shuttingDown) process.exit(code);
  shuttingDown = true;
  if (reloadTimer) clearTimeout(reloadTimer);
  await watcher.close();
  await stopTuiChild();
  removeOwnLease();
  if (hasTmuxBinary()) {
    spawnSync("tmux", ["kill-session", "-t", TMUX_SESSION], { stdio: "ignore" });
  }
  process.exit(code);
}

process.on("SIGINT", () => void shutdown(130));
process.on("SIGTERM", () => void shutdown(143));
process.on("SIGHUP", () => void shutdown(129));
process.on("exit", () => {
  removeOwnLease();
  if (hasTmuxBinary()) {
    spawnSync("tmux", ["kill-session", "-t", TMUX_SESSION], { stdio: "ignore" });
  }
});

await ensureTmuxOrAttach();

try {
  await claimRunnerLease();
} catch (error) {
  process.stderr.write(`\x1b[31m[tui:dev]\x1b[0m ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

process.stderr.write("\x1b[35m● UNAXIS Dev Runner\x1b[0m — polling + bundled Node child (WSL mount safe).\n");

if (!(await buildBundle())) {
  process.stderr.write("\x1b[31m[tui:dev]\x1b[0m Initial bundle failed; TUI was not started.\n");
  process.exit(1);
}
startTuiChild();
