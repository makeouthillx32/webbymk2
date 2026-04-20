// tui/utils.ts — shared helpers

import type { Readable } from "stream";

// ── ANSI / decoration stripper ────────────────────────────────────────────────
//
// Produces clean plain-text suitable for pasting into a chat, doc, or LLM
// context window.  Strips:
//   • ANSI CSI sequences  \x1b[...m  (colors, cursor movement)
//   • OSC sequences       \x1b]...\x07  (window title, hyperlinks, OSC 52)
//   • Braille block       U+2800-U+28FF  (spinner frames ⣾⣽⣻⢿…)
//
// Preserves meaningful Unicode like ✓ ✗ ⚠ ● ◑ so the log stays readable.

export function stripAnsi(str: string): string {
  return str
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")      // CSI sequences (colors etc.)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\][^\x07]*\x07/g, "")          // OSC sequences (ST = BEL)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\][^\x1b]*\x1b\\/g, "")        // OSC sequences (ST = ESC \)
    .replace(/[\u2800-\u28ff]/g, "");             // Braille (spinner chars)
}

/**
 * Convert an array of raw output lines into clean plain-text for the clipboard.
 * Strips ANSI and trims trailing whitespace from each line.
 */
export function linesToClipboard(lines: string[]): string {
  return lines
    .map((l) => stripAnsi(l).trimEnd())
    .join("\n")
    .trim();
}


/**
 * Drain a Node.js Readable stream line by line.
 * Works with stdout/stderr from child_process.spawn.
 */
export async function drainStream(
  stream: Readable | null | undefined,
  onLine: (line: string) => void
): Promise<void> {
  if (!stream) return;
  return new Promise((resolve, reject) => {
    let buf = "";
    stream.on("data", (chunk: Buffer | string) => {
      buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        if (l.trim()) onLine(l);
      }
    });
    stream.on("end", () => {
      if (buf.trim()) onLine(buf);
      resolve();
    });
    stream.on("error", reject);
  });
}
