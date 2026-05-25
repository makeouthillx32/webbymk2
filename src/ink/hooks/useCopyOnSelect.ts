// tui/hooks/useCopyOnSelect.ts
// ─────────────────────────────────────────────────────────────────────────────
// Clipboard write hook — Ctrl+C copies the currently focused item's data.
//
// Platform strategy:
//   Windows native  →  clip.exe      (stdin pipe)
//   macOS           →  pbcopy        (stdin pipe)
//   Linux / WSL     →  xclip → xsel → OSC 52 terminal escape
//
// Unicode handling:
//   clip.exe on Windows interprets stdin through the system's ANSI code page,
//   not UTF-8.  Multi-byte Unicode symbols (✓, ✗, ⚠, →, etc.) get mangled
//   into 2-3 garbage characters each.  To avoid this, we sanitize all
//   clipboard text to ASCII equivalents before writing.  macOS and Linux
//   clipboard tools handle UTF-8 natively so they get the original text.
//
// Usage:
//   const { copy, didCopy } = useCopyOnSelect();
//   // In useInput:
//   if (key.ctrl && input === "c") copy(focusedItem.domain);
//   // In render:
//   {didCopy && <Text color="green">copied</Text>}
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useContext } from "react";
import { spawn }                 from "child_process";
import { TerminalWriteContext }  from "../useTerminalNotification.js";

// ── Unicode → ASCII sanitization ──────────────────────────────────────────────
// Replaces common Unicode symbols used in the TUI with plain-ASCII equivalents
// so that clip.exe (Windows) doesn't mangle them into garbage fragments.
//
// macOS and Linux clipboard tools handle UTF-8 natively, so we only sanitize
// on Windows.  This map covers every non-ASCII symbol the TUI emits.

const UNICODE_TO_ASCII: Record<string, string> = {
  // Status indicators
  "\u2713": "[ok]",      // ✓
  "\u2717": "[X]",      // ✗ (heavy ballot X)
  "\u2718": "[X]",      // ✗ (light ballot X)
  "\u26A0": "[!]",      // ⚠
  "\u2699": "[*]",      // ⚙
  // Arrows
  "\u2192": "->",       // →
  "\u2190": "<-",       // ←
  "\u2191": "^",        // ↑
  "\u2193": "v",        // ↓
  "\u2194": "<->",      // ↔
  // Bullets and dots
  "\u25CF": "*",        // ●
  "\u25CB": "o",        // ○
  "\u25D0": "o",        // ◑
  "\u25C9": "(*)",      // ◉
  "\u2022": "-",        // •
  "\u25AA": "[ ]",      // ▪
  "\u25FB": "[ ]",      // ◻
  // Box drawing
  "\u2500": "-",        // ─
  "\u2502": "|",        // │
  "\u250C": "+",        // ┌
  "\u2510": "+",        // ┐
  "\u2514": "+",        // └
  "\u2518": "+",        // ┘
  "\u251C": "+",        // ├
  "\u2524": "+",        // ┤
  "\u252C": "+",        // ┬
  "\u2534": "+",        // ┴
  "\u253C": "+",        // ┼
  // Misc
  "\u270E": ">>",       // ✎
  "\u25B6": ">",        // ▶
  "\u25C0": "<",        // ◀
  "\u2713": "[ok]",     // ✓ (duplicate coverage)
};

/**
 * Replace Unicode symbols with ASCII equivalents.
 * On Windows, clip.exe mangles multi-byte UTF-8 into garbage because it
 * reads stdin through the system's ANSI code page, not as UTF-8.
 * macOS and Linux tools handle UTF-8 natively and don't need this.
 */
function sanitizeForClipboard(text: string): string {
  if (process.platform !== "win32") return text;

  // Fast path: if the string is pure ASCII, skip the replacement loop.
  if (text.charCodeAt) {
    let pureAscii = true;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 127) { pureAscii = false; break; }
    }
    if (pureAscii) return text;
  }

  // Replace known Unicode symbols, strip any remaining non-ASCII.
  let result = "";
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i)!;
    const char = String.fromCodePoint(cp);
    if (UNICODE_TO_ASCII[char]) {
      result += UNICODE_TO_ASCII[char];
    } else if (cp <= 127) {
      result += char;
    } else {
      // Unknown non-ASCII character — replace with ? to avoid mangling.
      result += "?";
    }
    i += cp > 0xFFFF ? 2 : 1; // advance past surrogate pairs
  }
  return result;
}

// ── Platform clipboard write ──────────────────────────────────────────────────

function writeClipboard(text: string, writeRaw?: (data: string) => void): void {
  const clean = text.trim();
  if (!clean) return;

  const safe = sanitizeForClipboard(clean);

  try {
    if (process.platform === "win32") {
      // clip.exe on Windows — sanitized text to avoid Unicode mangling.
      const proc = spawn("clip.exe", [], {
        stdio: ["pipe", "ignore", "ignore"],
        windowsHide: true,
      });
      proc.stdin!.write(safe, "utf8");
      proc.stdin!.end();

    } else if (process.platform === "darwin") {
      const proc = spawn("pbcopy", [], { stdio: ["pipe", "ignore", "ignore"] });
      proc.stdin!.write(clean, "utf8");
      proc.stdin!.end();

    } else {
      // Linux or WSL — try xclip, then xsel, then fall back to OSC 52.
      spawnClipboard(clean, writeRaw);
    }
  } catch {
    // Best-effort — silently ignore clipboard errors so the TUI keeps running.
  }
}

function spawnClipboard(text: string, writeRaw?: (data: string) => void): void {
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
  writeRaw?.(`\x1b]52;c;${b64}\x07`);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns `copy(text)` and a `didCopy` flag that stays true for 1.5 s.
 * Call `copy` from a `useInput` handler when the user presses Ctrl+C.
 */
export function useCopyOnSelect() {
  const [didCopy, setDidCopy] = useState(false);
  const writeRaw = useContext(TerminalWriteContext);

  const copy = useCallback((text: string) => {
    if (!text.trim()) return;
    writeClipboard(text.trim(), writeRaw ?? undefined);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }, [writeRaw]);

  return { copy, didCopy };
}
