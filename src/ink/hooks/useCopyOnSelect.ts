// tui/hooks/useCopyOnSelect.ts
// ─────────────────────────────────────────────────────────────────────────────
// Clipboard write hook — Ctrl+C copies the currently focused item's data.
//
// Platform strategy:
//   Windows native  →  clip.exe      (stdin pipe)
//   macOS           →  pbcopy        (stdin pipe)
//   Linux / WSL     →  xclip → xsel → OSC 52 terminal escape
//
// Usage:
//   const { copy, didCopy } = useCopyOnSelect();
//   // In useInput:
//   if (key.ctrl && input === "c") copy(focusedItem.domain);
//   // In render:
//   {didCopy && <Text color="green">✓ copied</Text>}
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import { spawn }                 from "child_process";

// ── Platform clipboard write ──────────────────────────────────────────────────

function writeClipboard(text: string): void {
  const clean = text.trim();
  if (!clean) return;

  try {
    if (process.platform === "win32") {
      // clip.exe reads UTF-16 LE from stdin on Windows, but accepts UTF-8
      // from a pipe without the BOM when spawned this way.
      const proc = spawn("clip.exe", [], {
        stdio: ["pipe", "ignore", "ignore"],
        windowsHide: true,
      });
      proc.stdin!.write(clean, "utf8");
      proc.stdin!.end();

    } else if (process.platform === "darwin") {
      const proc = spawn("pbcopy", [], { stdio: ["pipe", "ignore", "ignore"] });
      proc.stdin!.write(clean, "utf8");
      proc.stdin!.end();

    } else {
      // Linux or WSL — try xclip, then xsel, then fall back to OSC 52.
      spawnClipboard(clean);
    }
  } catch {
    // Best-effort — silently ignore clipboard errors so the TUI keeps running.
  }
}

function spawnClipboard(text: string): void {
  try {
    const proc = spawn("xclip", ["-selection", "clipboard"], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    proc.stdin!.write(text, "utf8");
    proc.stdin!.end();
    return;
  } catch {}

  try {
    const proc = spawn("xsel", ["--clipboard", "--input"], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    proc.stdin!.write(text, "utf8");
    proc.stdin!.end();
    return;
  } catch {}

  // OSC 52 — supported by most modern terminals (kitty, WezTerm, iTerm2, etc.)
  const b64 = Buffer.from(text, "utf8").toString("base64");
  process.stdout.write(`\x1b]52;c;${b64}\x07`);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns `copy(text)` and a `didCopy` flag that stays true for 1.5 s.
 * Call `copy` from a `useInput` handler when the user presses Ctrl+C.
 */
export function useCopyOnSelect() {
  const [didCopy, setDidCopy] = useState(false);

  const copy = useCallback((text: string) => {
    if (!text.trim()) return;
    writeClipboard(text.trim());
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }, []);

  return { copy, didCopy };
}
