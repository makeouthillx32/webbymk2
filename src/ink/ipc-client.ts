// src/ink/ipc-client.ts
// ─────────────────────────────────────────────────────────────────────────────
// CLI-side IPC client.  Connects to the running TUI's IPC server, sends a
// command, streams back output, and resolves with the process exit code.
//
// Usage (from cli.tsx fast-path):
//   import { sendIpcCommand } from "../ink/ipc-client.js";
//   process.exit(await sendIpcCommand(args));
// ─────────────────────────────────────────────────────────────────────────────

import * as net from "net";
import { IPC_PORT, IPC_HOST } from "./ipc-server.ts";

/**
 * Connect to the running TUI, send `args` as a structured argv command, stream
 * its output to stdout, and return 0 (success) or 1 (failure/not-running).
 */
export function sendIpcCommand(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const cmd    = JSON.stringify({ argv: args });
    const socket = net.connect(IPC_PORT, IPC_HOST);
    let   ok      = false;
    let   settled = false;

    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };

    socket.on("connect", () => {
      socket.write(cmd + "\n");
    });

    socket.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        if (!line) continue;
        process.stdout.write(line + "\n");
        if (line.startsWith("✓")) ok = true;
        if (line.startsWith("✗")) ok = false;
      }
    });

    socket.on("close", () => finish(ok ? 0 : 1));

    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNRESET" && ok) {
        finish(0);
        return;
      }
      if (err.code === "ECONNREFUSED") {
        process.stderr.write(
          "✗ UNAXIS is not running — start it first with: unaxis\n"
        );
      } else {
        process.stderr.write(`✗ IPC error: ${err.message}\n`);
      }
      finish(1);
    });
  });
}
