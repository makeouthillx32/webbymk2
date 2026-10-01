// src/ink/git-bin.ts
// ─────────────────────────────────────────────────────────────────────────────
// Which git to run, and an async runner for it.
//
// Under WSL, a repo on a Windows drive (/mnt/<x>/…) is reached over 9p, where
// Linux git is very slow (a 1,800-file index refresh took ~97 s). Windows
// git.exe reads the same repo natively in a fraction of that, so it's
// preferred whenever it exists. git.exe doesn't understand /mnt/… arguments —
// interop only translates the working directory — so callers pass paths
// relative to `cwd`.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync } from "fs";
import { spawn, spawnSync } from "child_process";

// Every git the TUI spawns runs with core.fsmonitor off. The repo enables the
// fsmonitor daemon (for editors); when the first git call starts that daemon,
// the daemon inherits the call's stdout pipe and holds it open, so the call
// "hangs" until its timeout kills it. That is why every image from 2026-09-27
// on was tagged gnogit: `git log` started the daemon and timed out.
// GIT_CONFIG_COUNT/KEY/VALUE apply to child processes without touching the
// repo's config; WSLENV carries them across to Windows git.exe under WSL.
if (!process.env.GIT_CONFIG_COUNT) {
  process.env.GIT_CONFIG_COUNT = "1";
  process.env.GIT_CONFIG_KEY_0 = "core.fsmonitor";
  process.env.GIT_CONFIG_VALUE_0 = "false";
  if (process.platform === "linux") {
    const passthrough = "GIT_CONFIG_COUNT:GIT_CONFIG_KEY_0:GIT_CONFIG_VALUE_0";
    process.env.WSLENV = process.env.WSLENV ? `${process.env.WSLENV}:${passthrough}` : passthrough;
  }
}

const cache = new Map<string, string>();

export function resolveGitBin(cwd: string): string {
  const onWindowsDrive = process.platform === "linux" && cwd.startsWith("/mnt/");
  const key = onWindowsDrive ? "wsl-mnt" : "native";
  const hit = cache.get(key);
  if (hit) return hit;
  let bin = "git";
  if (onWindowsDrive) {
    for (const p of ["/mnt/c/program files/git/cmd/git.exe", "/mnt/c/Program Files/Git/cmd/git.exe"]) {
      if (existsSync(p)) { bin = p; break; }
    }
    if (bin === "git") {
      try {
        const probe = spawnSync("which", ["git.exe"], { encoding: "utf-8", timeout: 300 });
        if (probe.status === 0 && probe.stdout.trim()) bin = probe.stdout.trim();
      } catch {}
    }
  }
  cache.set(key, bin);
  return bin;
}

export type GitRun = { status: number; stdout: string; stderr: string };

/** Runs git without blocking the event loop (the TUI keeps rendering). */
export function runGit(cwd: string, args: string[], opts: { input?: string; timeoutMs?: number } = {}): Promise<GitRun> {
  return new Promise((resolve) => {
    const p = spawn(resolveGitBin(cwd), args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = opts.timeoutMs ? setTimeout(() => p.kill(), opts.timeoutMs) : null;
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => err.push(d));
    p.on("error", (e) => { if (timer) clearTimeout(timer); resolve({ status: -1, stdout: "", stderr: String(e) }); });
    p.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ status: code ?? -1, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") });
    });
    p.stdin.end(opts.input ?? "");
  });
}
