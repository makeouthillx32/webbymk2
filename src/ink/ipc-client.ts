// src/ink/ipc-client.ts
// ─────────────────────────────────────────────────────────────────────────────
// CLI-side IPC client.  Connects to the running TUI's IPC server, sends a
// command, streams back output, and resolves with the process exit code.
//
// Local mode (default):
//   Connects to 127.0.0.1:50505 — requires the TUI to be running locally.
//
// Remote mode (active when ~/.unaxis/remote-session.json exists):
//   Connects to host:50506, sends AUTH <token> first, then the command.
//   Written by `unaxis connect <key>`.  Removed by `unaxis disconnect`.
//
// Usage (from cli.tsx fast-path):
//   import { sendIpcCommand } from "../ink/ipc-client.js";
//   process.exit(await sendIpcCommand(args));
// ─────────────────────────────────────────────────────────────────────────────

import * as net from "net";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { IPC_PORT, IPC_HOST } from "./ipc-server.ts";

// ── Remote session file ───────────────────────────────────────────────────────

export interface RemoteSession {
  host:        string
  port:        number
  token:       string
  slug:        string
  exp:         number    // Unix timestamp (seconds)
  connectedAt: string    // ISO-8601
}

export function remoteSessionPath(): string {
  return join(homedir(), ".unaxis", "remote-session.json")
}

export function loadRemoteSession(): RemoteSession | null {
  const p = remoteSessionPath()
  if (!existsSync(p)) return null
  try {
    const s = JSON.parse(readFileSync(p, "utf8")) as RemoteSession
    if (Math.floor(Date.now() / 1000) >= s.exp) return null   // expired
    return s
  } catch {
    return null
  }
}

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
 * Send an IPC command to the TUI (local or remote).
 *
 * If a valid remote session exists in ~/.unaxis/remote-session.json, the
 * command is routed to the remote bridge (host:50506) with token auth.
 * Otherwise it connects to the local server (127.0.0.1:50505).
 */
export function sendIpcCommand(args: string[], opts?: { quiet?: boolean }): Promise<number> {
  const quiet   = opts?.quiet ?? false;
  const cmd     = JSON.stringify({ argv: args });
  const session = loadRemoteSession();

  if (session) {
    return sendRemoteIpcCommand(args, session, quiet);
  }

  // ── Local path ────────────────────────────────────────────────────────────
  return new Promise((resolve) => {
    const socket = net.connect(IPC_PORT, IPC_HOST);
    socket.on("connect", () => streamCommand(socket, cmd, quiet, resolve));
    socket.on("error",   (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNREFUSED") {
        if (!quiet) process.stderr.write("✗ UNAXIS is not running — start it first with: unaxis\n");
      } else {
        process.stderr.write(`✗ IPC error: ${err.message}\n`);
      }
      resolve(1);
    });
  });
}

/**
 * Connect to a remote UNAXIS bridge, authenticate, then send a command.
 * Called automatically by sendIpcCommand when a remote session is active.
 */
export function sendRemoteIpcCommand(
  args:    string[],
  session: RemoteSession,
  quiet    = false,
): Promise<number> {
  const cmd = JSON.stringify({ argv: args });

  return new Promise((resolve) => {
    const socket = net.connect(session.port, session.host);
    let   buf    = "";
    let   authed = false;
    let settled  = false;

    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };

    socket.on("connect", () => {
      // Send bearer token first — bridge requires AUTH before any command
      socket.write(`AUTH ${session.token}\n`);
    });

    socket.on("data", (chunk) => {
      buf += (chunk as Buffer).toString();

      if (!authed) {
        const nl = buf.indexOf("\n");
        if (nl === -1) return;
        const line = buf.slice(0, nl).trim();
        buf        = buf.slice(nl + 1);

        if (line === "OK") {
          authed = true;
          streamCommand(socket, cmd, quiet, finish);
        } else {
          const reason = line.startsWith("ERR") ? line.slice(4) : "rejected";
          process.stderr.write(`✗ Remote bridge auth failed: ${reason}\n`);
          if (reason.includes("expired")) {
            process.stderr.write("  Run: unaxis disconnect  (key has expired)\n");
          }
          socket.destroy();
          finish(1);
        }
        return;
      }
    });

    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNREFUSED") {
        if (!quiet) {
          process.stderr.write(
            `✗ Remote UNAXIS not reachable at ${session.host}:${session.port}\n` +
            "  Check that the remote TUI is running and the pairing key has not expired.\n"
          );
        }
      } else {
        process.stderr.write(`✗ Remote IPC error: ${err.message}\n`);
      }
      finish(1);
    });
  });
}
