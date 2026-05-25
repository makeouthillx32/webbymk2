// src/utils/terminalPopout.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pop-out terminal — open operation output in a separate terminal window.
//
// When the user presses [O] from an overlay or stack, this module spawns a
// new terminal window that tails the operation's output file.  The main TUI
// returns to the home screen immediately.  The popped-out terminal stays
// open until the user closes it — the operation's final lines are always
// visible for review.
//
// Platform strategy:
//   Windows   →  cmd.exe /c start "title" <wrapper.cmd>
//                A temporary .cmd file avoids quoting hell with nested
//                PowerShell commands. The wrapper sets the window title,
//                runs the command, and pauses on exit.  Stale wrappers
//                are cleaned up on next TUI session start.
//   macOS     →  open -a Terminal.app / bash -c "tail -f <file>"
//   Linux     →  x-terminal-emulator -e tail -f <file>
//                (falls back to xterm, gnome-terminal, konsole in order)
//
// Log tail pop-out is simpler — it runs `docker logs -f <container>` directly
// in the new terminal instead of tailing a file.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from "child_process";
import { writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── Temp file for operation output ────────────────────────────────────────────

const POPOUT_DIR = join(homedir(), ".unaxis", "unenter", "popout");

function ensurePopoutDir(): void {
  if (!existsSync(POPOUT_DIR)) {
    mkdirSync(POPOUT_DIR, { recursive: true });
  }
}

/**
 * Delete stale .cmd wrapper files from previous sessions.
 * Safe to call at module load — these files are only used for the
 * brief moment between `start` and the new console window opening.
 * After that they're inert debris on disk.
 */
function cleanupStaleWrappers(): void {
  if (!existsSync(POPOUT_DIR)) return;
  try {
    for (const entry of readdirSync(POPOUT_DIR)) {
      if (entry.startsWith("popout-") && entry.endsWith(".cmd")) {
        try { unlinkSync(join(POPOUT_DIR, entry)); } catch { /* in use */ }
      }
    }
  } catch { /* dir unreadable */ }
}

// Clean up on module load
cleanupStaleWrappers();

/**
 * Initialize a fresh pop-out file for a new operation.
 * Overwrites any previous file with the same op ID.
 * Writes `initialLines` as the starting content.
 */
export function initPopoutFile(opId: number, initialLines: string[] = []): string {
  ensurePopoutDir();
  const filePath = join(POPOUT_DIR, `op-${opId}.log`);
  writeFileSync(filePath, initialLines.join("\n") + (initialLines.length > 0 ? "\n" : ""), "utf8");
  return filePath;
}

// ── Platform-specific terminal spawn ──────────────────────────────────────────

/**
 * Spawn a new terminal window running a command.
 * The terminal is fully detached — the TUI keeps running.
 * Returns true if the spawn was attempted (not guaranteed to succeed).
 */
function spawnTerminalWindow(title: string, command: string): boolean {
  try {
    if (process.platform === "win32") {
      // Windows: `start` opens a new console window.
      // To avoid quoting hell (nested quotes in PowerShell -Command break
      // when passed through cmd.exe /c start), write a temporary .cmd file
      // and have `start` execute that.  Stale .cmd files are cleaned up on
      // the next TUI session start via cleanupStaleWrappers().
      const wrapperPath = join(POPOUT_DIR, `popout-${Date.now()}.cmd`);
      const wrapper = [
        "@echo off",
        `title ${title}`,
        command,
        "pause",
      ].join("\r\n");
      ensurePopoutDir();
      writeFileSync(wrapperPath, wrapper, "utf8");

      spawn("cmd.exe", ["/c", "start", title, wrapperPath], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      }).unref();
      return true;
    }

    if (process.platform === "darwin") {
      // macOS: use Terminal.app via open -a
      // The command is wrapped in a shell that pauses at the end.
      const shellCmd = `${command}; echo ''; echo '[Press Enter to close]'; read`;
      spawn("open", ["-a", "Terminal.app", "--args", "bash", "-c", shellCmd], {
        detached: true,
        stdio: "ignore",
      }).unref();
      return true;
    }

    // Linux: try common terminal emulators in order.
    const terminals = [
      { cmd: "x-terminal-emulator",  args: ["-e"] },
      { cmd: "gnome-terminal",        args: ["--"] },
      { cmd: "konsole",               args: ["-e"] },
      { cmd: "xterm",                 args: ["-e"] },
    ];

    for (const term of terminals) {
      try {
        spawn(term.cmd, [...term.args, "bash", "-c", `${command}; read`], {
          detached: true,
          stdio: "ignore",
        }).unref();
        return true;
      } catch {
        continue;
      }
    }

    return false;
  } catch {
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pop out a log tail to a new terminal window.
 * Runs `docker logs -f <container>` directly — no temp file needed.
 */
export function popoutLogTail(container: string): boolean {
  const title = `Logs: ${container}`;
  // --tail 80 limits historical output; --follow keeps the stream live.
  const command = `docker logs --follow --tail 80 ${container}`;
  return spawnTerminalWindow(title, command);
}

/**
 * Pop out an operation's output to a new terminal window.
 * The operation's lines are written to a temp file, and the new
 * terminal tails that file.  The caller should call `appendPopoutLines`
 * as new lines arrive to keep the file up to date.
 */
export function popoutOpOutput(
  opId: number,
  title: string,
  lines: string[],
): boolean {
  const filePath = initPopoutFile(opId, lines);
  // Now that the command is written directly into a .cmd wrapper file,
  // we don't need to worry about cmd.exe argument quoting.  The command
  // text is executed verbatim by cmd.exe inside the new console window.
  // On Windows, PowerShell's Get-Content -Wait tails a file (works in
  // both PS 5.1 and 7+). -Tail 50 starts from the last 50 lines.
  const tailCmd =
    process.platform === "win32"
      ? `powershell -Command "Get-Content -Path '${filePath}' -Wait -Tail 50"`
      : `tail -f '${filePath}'`;
  return spawnTerminalWindow(title, tailCmd);
}

/**
 * Append new lines to an existing pop-out file.
 * Called by useBackgroundOps as new lines stream in.
 */
export function appendPopoutLines(opId: number, newLines: string[]): void {
  const filePath = join(POPOUT_DIR, `op-${opId}.log`);
  if (!existsSync(filePath)) return;
  try {
    writeFileSync(filePath, newLines.join("\n") + "\n", { flag: "a" });
  } catch {
    // Best-effort — if the file is gone or locked, skip.
  }
}

/**
 * Clean up pop-out files for a completed operation.
 * Called when an op is dismissed from the stack.
 */
export function cleanupPopoutFile(opId: number): void {
  const filePath = join(POPOUT_DIR, `op-${opId}.log`);
  try {
    if (existsSync(filePath)) {
      writeFileSync(filePath, "\n[Operation complete — close this window when done]\n", { flag: "a" });
    }
  } catch {
    // Best-effort.
  }
}
