// src/ink/ipc-server.ts
// ─────────────────────────────────────────────────────────────────────────────
// Local IPC server — lets CLI agents send commands to the running TUI.
//
// Protocol (line-based over TCP, localhost only):
//   → client sends one command line terminated by \n  e.g. "restart core\n"
//   ← server streams output lines, one per \n
//   ← server closes socket when the operation finishes
//   CLI exit code: 0 if any line starts with ✓, 1 otherwise
//
// Port:  50505  (127.0.0.1 only — never exposed to the network)
// ─────────────────────────────────────────────────────────────────────────────

import * as net from "net";

export const IPC_PORT = 50505;
export const IPC_HOST = "127.0.0.1";

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
