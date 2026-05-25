// src/ink/ipc-server.ts
// ─────────────────────────────────────────────────────────────────────────────
// Local IPC server — lets CLI agents send commands to the running TUI.
//
// Two servers:
//
//   50505  127.0.0.1 only  — local IPC (existing, unchanged)
//          Protocol: send one JSON { argv } command line, receive streamed output
//
//   50506  0.0.0.0         — remote IPC bridge (new)
//          Protocol: client sends AUTH <token>\n first; if token matches the
//          stored remote_bridge_token credential, the connection is promoted and
//          subsequent commands are handled identically to 50505.
//          The bridge only runs if a valid pairing key has been generated.
//
// Remote bridge security:
//   • Token is 32 random bytes (hex) — collision probability negligible
//   • Token expires after KEY_TTL_H hours (same as pairing key)
//   • Expired-token connections are refused before any data is processed
//   • The bridge only forwards known IPC commands; it is NOT a shell
// ─────────────────────────────────────────────────────────────────────────────

import * as net from "net";

export const IPC_PORT        = 50505;
export const IPC_HOST        = "127.0.0.1";
export const REMOTE_IPC_PORT = 50506;
export const REMOTE_IPC_HOST = "0.0.0.0";

export type IpcHandler = (
  args:   string[],
  onLine: (line: string) => void,
) => Promise<number>;

export type IpcHandlers = Record<string, IpcHandler>;

function parseRequest(raw: string): { cmd: string; args: string[] } {
  try {
    const parsed = JSON.parse(raw) as { argv?: unknown };
    if (Array.isArray(parsed.argv)) {
      const argv = parsed.argv.filter((value): value is string => typeof value === "string");
      return { cmd: argv[0] ?? "", args: argv.slice(1) };
    }
  } catch {
    // Keep compatibility with the first-pass raw line protocol.
  }

  const parts = raw.split(/\s+/).filter(Boolean);
  return { cmd: parts[0] ?? "", args: parts.slice(1) };
}

/**
 * Start the IPC server.  Returns the net.Server so the caller can close it
 * on shutdown if needed.  Errors are swallowed silently — if the port is
 * already taken (e.g. another TUI instance) we just skip.
 */
export function startIpcServer(handlers: IpcHandlers): net.Server {
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buf = "";

    socket.on("data", (chunk) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl === -1) return;

      const raw   = buf.slice(0, nl).trim();
      buf         = "";                         // reset — one command per connection

      const { cmd, args } = parseRequest(raw);

      const onLine = (line: string) => {
        if (!socket.destroyed) socket.write(line + "\n");
      };

      const handler = handlers[cmd];
      if (!handler) {
        onLine(`✗ unknown command: "${cmd}"`);
        onLine(`  available: ${Object.keys(handlers).sort().join(", ")}`);
        socket.end();
        return;
      }

      handler(args, onLine)
        .then((code) => {
          if (code !== 0) onLine(`✗ exited with code ${code}`);
          socket.end();
        })
        .catch((err) => {
          onLine(`✗ error: ${String(err)}`);
          socket.end();
        });
    });

    socket.on("error", () => { /* client disconnected early — ignore */ });
  });

  server.on("error", () => {
    // Port busy (another TUI instance) — silent no-op.
  });

  server.listen(IPC_PORT, IPC_HOST);
  return server;
}

// ── Remote IPC bridge (port 50506) ────────────────────────────────────────────

/**
 * Start the remote IPC bridge on REMOTE_IPC_PORT (50506, 0.0.0.0).
 *
 * Architecture: authenticated tunnel → local IPC server (50505).
 * After token auth succeeds, all traffic is piped directly to/from the local
 * server rather than duplicating handler logic here.  The local server is the
 * single source of truth for command dispatch.
 *
 * Handshake:
 *   client → "AUTH <token>\n"
 *   bridge → "OK\n"           (valid + not expired → tunnel open)
 *          | "ERR expired\n"
 *          | "ERR invalid\n"
 *
 * @param getToken  Async function returning { token, exp } from credentials,
 *                  or null if no active pairing key.  Called per-connection so
 *                  revocation is instant (no restart needed).
 */
export function startRemoteIpcBridge(
  getToken: () => Promise<{ token: string; exp: number } | null>,
): net.Server {
  const { timingSafeEqual } = require("crypto") as typeof import("crypto");

  const server = net.createServer((remote) => {
    remote.setEncoding("utf8");
    let buf     = "";
    let authed  = false;

    // ── Auth handler — removed from the socket once auth is resolved ─────────
    // Using a named function so we can call removeListener on it explicitly.
    // This prevents the auth handler from intercepting command packets that
    // arrive in a separate TCP segment after the AUTH line.
    const onAuthData = async (chunk: string) => {
      buf += chunk;

      const nl = buf.indexOf("\n");
      if (nl === -1) return;                       // AUTH line not yet complete

      // Unhook immediately — subsequent data goes to the tunnel handler only.
      remote.removeListener("data", onAuthData);

      const line = buf.slice(0, nl).trim();
      const rest = buf.slice(nl + 1);              // data pipelined after AUTH
      buf        = "";

      // ── Validate AUTH line ───────────────────────────────────────────────
      if (!line.startsWith("AUTH ")) {
        remote.write("ERR invalid\n");
        remote.destroy();
        return;
      }

      const presented = line.slice(5).trim();
      const stored    = await getToken().catch(() => null);

      if (!stored) {
        remote.write("ERR invalid\n");
        remote.destroy();
        return;
      }

      const nowSec = Math.floor(Date.now() / 1000);
      if (stored.exp < nowSec) {
        remote.write("ERR expired\n");
        remote.destroy();
        return;
      }

      let valid = false;
      try {
        const a = Buffer.from(presented, "hex");
        const b = Buffer.from(stored.token, "hex");
        valid   = a.length === b.length && timingSafeEqual(a, b);
      } catch { /* malformed hex */ }

      if (!valid) {
        remote.write("ERR invalid\n");
        remote.destroy();
        return;
      }

      // ── Auth OK — open tunnel to local IPC server ────────────────────────
      authed = true;
      remote.write("OK\n");

      const local = net.connect(IPC_PORT, IPC_HOST);

      local.on("connect", () => {
        // Flush anything the client pipelined immediately after AUTH
        if (rest) local.write(rest);
        // Bidirectional pipe: remote ↔ local
        remote.on("data", (d) => { if (!local.destroyed) local.write(d); });
        local.on("data",  (d) => { if (!remote.destroyed) remote.write(d); });
      });

      local.on("close",  () => remote.destroy());
      remote.on("close", () => local.destroy());
      local.on("error",  () => remote.destroy());
      remote.on("error", () => local.destroy());

      local.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ECONNREFUSED") {
          remote.write("✗ local TUI is not running\n");
        }
        remote.destroy();
      });
    };

    remote.on("data", onAuthData);

    remote.on("error", () => { /* client disconnected — ignore */ });
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EADDRINUSE") {
      process.stderr.write(`[ipc-bridge] ${err.message}\n`);
    }
  });

  server.listen(REMOTE_IPC_PORT, REMOTE_IPC_HOST);
  return server;
}
