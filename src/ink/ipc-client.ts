// src/ink/ipc-client.ts
// ─────────────────────────────────────────────────────────────────────────────
// CLI-side IPC client. Connects directly to the TUI's open IPC server.
// No auth, no pairing keys — LAN-local open access.
//
// Prod TUI: 0.0.0.0:50505  (unaxis binary)
// Dev TUI:  0.0.0.0:50507  (bun run tui:dev, hot-reload)
//
// From the control node itself: connects to 127.0.0.1:PORT
// From elsewhere on the LAN (sandbox/agent): connects to the control node's
// LAN IP, read from config.json (STACK_IP_SAFE) — never hardcoded here so
// this stays correct across machine moves/relocations and isn't committed
// to the (public) repo as a literal address.
//
// Usage:
//   import { sendIpcCommand } from "../ink/ipc-client.js";
//   process.exit(await sendIpcCommand(args));
// ─────────────────────────────────────────────────────────────────────────────

import * as net from "net";
import { STACK_IP_SAFE } from "../config/stack.js";

// ── Open LAN ports (no auth) ──────────────────────────────────────────────────
// Prod TUI binds 0.0.0.0:50505, Dev TUI binds 0.0.0.0:50507.
// From the control node (local): use 127.0.0.1. From elsewhere on the LAN
// (sandbox/agent): use the control node's IP from config.json.
// No remote session file, no pairing keys.

const PROD_PORT  = 50505;
const DEV_PORT   = 50507;
const LOCAL_HOST = "127.0.0.1";
// Control-node LAN IP — sourced from config.json (never a literal address in
// source, since this repo is public). Empty string if config is absent; in
// that case we just fall back to treating the connection as local.
const CONTROL_NODE_IP = STACK_IP_SAFE;

// Detect if running on the control node itself or from a remote sandbox
const IS_LOCAL   = (() => {
  if (!CONTROL_NODE_IP) return true;
  try {
    const { networkInterfaces } = require("os") as typeof import("os");
    const ifaces = networkInterfaces();
    return Object.values(ifaces).flat().some(i => i?.address === CONTROL_NODE_IP);
  } catch { return false; }
})();

const CONNECT_HOST = IS_LOCAL ? LOCAL_HOST : CONTROL_NODE_IP;

// Legacy stubs — kept so imports in cli.tsx don't break during transition
export interface RemoteSession { host: string; port: number; token: string; slug: string; exp: number; connectedAt: string; }
export function loadRemoteSession(): RemoteSession | null { return null; }
export function remoteSessionPath(): string { return ""; }

// ── Shared low-level sender ───────────────────────────────────────────────────

function streamCommand(
  socket:  net.Socket,
  cmd:     string,
  quiet:   boolean,
  resolve: (code: number) => void,
): void {
  let ok      = false;
  let settled = false;

  const finish = (code: number) => {
    if (settled) return;
    settled = true;
    resolve(code);
  };

  socket.write(cmd + "\n");

  socket.on("data", (chunk) => {
    const lines = (chunk as Buffer).toString().split("\n");
    for (const line of lines) {
      if (!line) continue;
      process.stdout.write(line + "\n");
      if (line.startsWith("✓")) ok = true;
      if (line.startsWith("✗")) ok = false;
    }
  });

  socket.on("close", () => finish(ok ? 0 : 1));

  socket.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "ECONNRESET" && ok) { finish(0); return; }
    if (err.code === "ECONNREFUSED") {
      if (!quiet) process.stderr.write("✗ UNAXIS is not running — start it first with: unaxis\n");
    } else {
      process.stderr.write(`✗ IPC error: ${err.message}\n`);
    }
    finish(1);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send an IPC command to a TUI.
 * target: "auto" | "prod" | "dev"
 *   prod → CONNECT_HOST:50505
 *   dev  → CONNECT_HOST:50507
 *   auto → prod port (50505), falls back to dev (50507) if prod not running
 */
export async function sendIpcCommand(
  args:  string[],
  opts?: { quiet?: boolean; target?: "auto" | "prod" | "dev" },
): Promise<number> {
  const quiet  = opts?.quiet  ?? false;
  const target = opts?.target ?? "auto";
  const cmd    = JSON.stringify({ argv: args });

  // silent: used only by "auto" for its first (prod) attempt — a
  // ECONNREFUSED there isn't a real failure yet, it just means "try dev
  // next", so it shouldn't print the "not running" line the way a genuine
  // single-target failure should.
  const connect = (port: number, label: string, silentRefused = false) =>
    new Promise<number>((resolve, reject) => {
      const socket = net.connect(port, CONNECT_HOST);
      socket.on("connect", () => streamCommand(socket, cmd, quiet, resolve));
      socket.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNREFUSED") {
          if (silentRefused) {
            reject(err);
            return;
          }
          if (!quiet) process.stderr.write(`✗ ${label} TUI not running (${CONNECT_HOST}:${port})\n`);
        } else {
          process.stderr.write(`✗ IPC error: ${err.message}\n`);
        }
        resolve(1);
      });
    });

  if (target === "dev")  return connect(DEV_PORT,  "dev");
  if (target === "prod") return connect(PROD_PORT, "prod");

  // auto: try prod first, silently fall back to dev on ECONNREFUSED — this
  // was previously documented (see the docstring above) but not actually
  // implemented; every "auto" call just failed outright whenever only a
  // dev TUI was running instead of falling back to it.
  try {
    return await connect(PROD_PORT, "prod", true);
  } catch {
    return connect(DEV_PORT, "dev");
  }
}

/** Legacy stub — kept for any remaining call sites during transition */
export function sendRemoteIpcCommand(
  args:    string[],
  _session: RemoteSession,
  quiet    = false,
): Promise<number> {
  return sendIpcCommand(args, { quiet });
}

