// scripts/chaos-drill.ts
// ─────────────────────────────────────────────────────────────────────────────
// Chaos drills for the failure modes behind the 2026-10-10..12 outage.
// Each drill breaks one thing on purpose, then proves UNAXIS repairs it by
// itself — no human, no Claude. Run from Windows (POWER):
//
//   bun scripts/chaos-drill.ts port-dead          # ~2-3 min, touches only its own container
//   bun scripts/chaos-drill.ts tui-kill --yes     # kills the Ubuntu WSL distro (both TUIs)
//
// Results append to logs/chaos-<drill>-<stamp>.ndjson.
// ─────────────────────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import net from "node:net";
import { probePort } from "../src/ink/port-watchdog.ts";

const ROOT = resolve(import.meta.dir, "..");
const LOGS = resolve(ROOT, "logs");
const CORE_IP = process.env.CHAOS_CORE_IP || "192.168.50.204";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString().slice(11, 19);
let resultFile = "";
function record(event: string, data: Record<string, unknown> = {}) {
  const line = { ts: new Date().toISOString(), event, ...data };
  console.log(`[${now()}] ${event}${Object.keys(data).length ? " " + JSON.stringify(data) : ""}`);
  if (resultFile) appendFileSync(resultFile, JSON.stringify(line) + "\n");
}
function sh(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { code: r.status ?? 1, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}
function watchdogLines(since: number, container?: string): string[] {
  // The TUI logger names files by LOCAL date (logger.ts today()), not UTC.
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const f = resolve(LOGS, `tui-${day}.ndjson`);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter((l) => {
    if (!l.includes('"port-watchdog"')) return false;
    if (container && !l.includes(container)) return false;
    try { return Date.parse(JSON.parse(l).ts) >= since; } catch { return false; }
  }).map((l) => JSON.parse(l).msg as string);
}
function portOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((r) => {
    const s = net.connect({ host, port });
    s.setTimeout(1500, () => { s.destroy(); r(false); });
    s.on("connect", () => { s.destroy(); r(true); });
    s.on("error", () => r(false));
  });
}

// ── Drill 1: a published port goes dead while the container "runs" ──────────
// Reproduces the exact signature: Docker accepts on the host port and drops
// the connection with 0 bytes because nothing answers behind it. The drill
// container is dead on first boot and healthy after one restart — the same
// "restart rebinds it" recovery the real outage needed.
async function portDead() {
  const name = "unt_chaos_portdead";
  const hostPort = Number(process.env.CHAOS_PORT || 39080);
  const t0 = Date.now();
  sh("docker", ["rm", "-f", name]);
  const run = sh("docker", ["run", "-d", "--name", name, "-p", `${hostPort}:8080`, "busybox:1.36", "sh", "-c",
    "if [ -f /tmp/booted ]; then exec httpd -f -p 8080; else touch /tmp/booted; exec sleep 86400; fi"]);
  if (run.code !== 0) { record("setup-failed", { err: run.err }); return false; }
  try {
    await sleep(3000);
    const before = await probePort(CORE_IP, hostPort);
    record("broken", { port: hostPort, probe: before, expect: "dead" });
    if (before !== "dead") { record("abort", { why: "could not reproduce the dead-port signature" }); return false; }

    const deadline = t0 + 5 * 60_000;
    let restartedAt = 0;
    while (Date.now() < deadline) {
      const lines = watchdogLines(t0, name);
      if (!restartedAt && lines.some((l) => l.includes("restarting it"))) {
        restartedAt = Date.now();
        record("watchdog-restarted", { afterSec: Math.round((restartedAt - t0) / 1000) });
      }
      if (lines.some((l) => l.includes("reachable again"))) {
        const after = await probePort(CORE_IP, hostPort);
        record("recovered", { afterSec: Math.round((Date.now() - t0) / 1000), probe: after });
        return after === "ok";
      }
      if (lines.some((l) => l.includes("needs a restart"))) { record("escalated", { lines }); return false; }
      await sleep(5000);
    }
    record("timeout", { watchdogLines: watchdogLines(t0, name), hint: "is a TUI running? (port 50505/50507)" });
    return false;
  } finally {
    sh("docker", ["rm", "-f", name]);
    record("cleanup", { removed: name });
  }
}

// ── Drill 2: the WSL distro dies under the TUI (what happened 2026-10-08) ────
async function tuiKill() {
  if (!process.argv.includes("--yes")) {
    console.log("This terminates the Ubuntu WSL distro: both TUIs and everything else in it (openclaw…).");
    console.log("Docker Desktop and the containers are NOT touched. Re-run with --yes to proceed.");
    return false;
  }
  for (const p of [50505, 50507]) record("before", { port: p, up: await portOpen(p) });
  const t0 = Date.now();
  const r = sh("wsl.exe", ["--terminate", "Ubuntu"]);
  record("terminated", { code: r.code });
  const back: Record<number, number | null> = { 50505: null, 50507: null };
  while (Date.now() - t0 < 5 * 60_000 && (back[50505] === null || back[50507] === null)) {
    await sleep(5000);
    for (const p of [50505, 50507] as const) {
      if (back[p] === null && await portOpen(p)) {
        back[p] = Math.round((Date.now() - t0) / 1000);
        record("tui-back", { port: p, afterSec: back[p] });
      }
    }
  }
  const ok = back[50507] !== null;  // the supervised (autostart) instance
  record(ok ? "pass" : "fail", { back, hint: ok ? undefined : "is the supervisor window (autostart-launch.ps1) running?" });
  return ok;
}

// ── main ──────────────────────────────────────────────────────────────────────
const drill = process.argv[2];
const drills: Record<string, () => Promise<boolean | void>> = {
  "port-dead": portDead, "tui-kill": tuiKill,
};
if (!drill || !drills[drill]) {
  console.log("usage: bun scripts/chaos-drill.ts <port-dead | tui-kill --yes>");
  process.exit(2);
}
resultFile = resolve(LOGS, `chaos-${drill}-${stamp}.ndjson`);
const ok = await drills[drill]!();
if (typeof ok === "boolean") {
  console.log(ok ? `\nPASS  ${drill}` : `\nFAIL  ${drill}`);
  console.log(`log: ${resultFile}`);
  process.exit(ok ? 0 : 1);
}
