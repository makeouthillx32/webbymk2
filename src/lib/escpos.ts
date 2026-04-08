// lib/escpos.ts
// ESC/POS command builder for thermal receipt printers.
// Compatible with: Epson, Star, Bixolon, HPRT, most 58mm/80mm USB & BT printers.

const ESC = 0x1b;
const GS  = 0x1d;

export class EscPos {
  private buf: number[] = [];

  // ── Init ──────────────────────────────────────────────────────
  init(): this {
    this.buf.push(ESC, 0x40);          // ESC @ — full reset
    return this;
  }

  // ── Text ──────────────────────────────────────────────────────
  text(s: string): this {
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      this.buf.push(code < 256 ? code : 0x3f); // '?' for non-latin
    }
    return this;
  }

  lf(n = 1): this {
    for (let i = 0; i < n; i++) this.buf.push(0x0a);
    return this;
  }

  // ── Alignment ─────────────────────────────────────────────────
  center(): this  { this.buf.push(ESC, 0x61, 0x01); return this; }
  left(): this    { this.buf.push(ESC, 0x61, 0x00); return this; }
  right(): this   { this.buf.push(ESC, 0x61, 0x02); return this; }

  // ── Style ─────────────────────────────────────────────────────
  bold(on: boolean): this {
    this.buf.push(ESC, 0x45, on ? 0x01 : 0x00);
    return this;
  }

  doubleHeight(on: boolean): this {
    this.buf.push(GS, 0x21, on ? 0x01 : 0x00);
    return this;
  }

  // ── Helpers ───────────────────────────────────────────────────
  /** Two-column row: left text and right text, padded to `width` chars. */
  row(left: string, right: string, width = 32): this {
    const pad = width - left.length - right.length;
    const spaces = pad > 0 ? " ".repeat(pad) : " ";
    return this.text(left + spaces + right).lf();
  }

  /** Dashed divider line */
  divider(width = 32): this {
    return this.text("-".repeat(width)).lf();
  }

  // ── Feed & cut ────────────────────────────────────────────────
  feed(lines = 4): this {
    this.buf.push(ESC, 0x64, lines);   // ESC d — feed n lines
    return this;
  }

  /** Full cut (GS V 0x41 0) — most modern printers */
  cut(): this {
    this.buf.push(GS, 0x56, 0x41, 0x00);
    return this;
  }

  // ── Output ────────────────────────────────────────────────────
  bytes(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

// ── Format helpers ───────────────────────────────────────────────────────────

export function fmtMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function fmtDate(date = new Date()): string {
  return date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}