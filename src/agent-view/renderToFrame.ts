// src/agent-view/renderToFrame.ts
// ─────────────────────────────────────────────────────────────────────────────
// Renders any Ink ReactElement directly into a captured text/ANSI frame.
// No TUI launch. No keystroke simulation. No process spawn.
//
// Reads text directly from screen cells via instance.lastFrame().screen —
// perfect spaces, wide chars, and all. No ANSI-stripping required for text.
//
// Usage:
//   const frame = await renderToFrame(<NpmPanel {...mockProps} />, { columns: 120, rows: 40 })
//   console.log(frame.text)
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import { PassThrough }    from 'stream'
import { renderSync }     from '../ink/root.js'
import { cellAt }         from '../ink/screen.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type FrameSize = {
  columns: number;
  rows:    number;
};

export type FrameCapture = {
  text:      string;     // plain text read directly from screen cells
  ansi:      string;     // raw ANSI output (for color terminals)
  lines:     string[];   // text rows, trailing spaces trimmed
  size:      FrameSize;
  renderMs:  number;
  timestamp: string;
  label?:    string;
};

// ── Mock stdout ───────────────────────────────────────────────────────────────

function createMockStdout(columns: number, rows: number): NodeJS.WriteStream {
  const stream  = new PassThrough() as unknown as NodeJS.WriteStream;
  stream.columns = columns;
  stream.rows    = rows;
  stream.isTTY   = true;
  const origOn   = stream.on.bind(stream);
  (stream as any).on = (event: string, cb: (...a: unknown[]) => void) => {
    if (event === 'resize') return stream; // swallow — mock never resizes
    return origOn(event, cb);
  };
  return stream;
}

// ── Screen cells → text ───────────────────────────────────────────────────────

function screenToText(screen: { width: number; height: number }, getCell: (x: number, y: number) => { char?: string } | undefined): string {
  const rows: string[] = [];
  for (let y = 0; y < screen.height; y++) {
    let row = '';
    for (let x = 0; x < screen.width; x++) {
      row += getCell(x, y)?.char ?? ' ';
    }
    rows.push(row.trimEnd());
  }
  while (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
  return rows.join('\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function renderToFrame(
  node:   ReactNode,
  size:   FrameSize = { columns: 120, rows: 40 },
  label?: string,
): Promise<FrameCapture> {
  const stdout = createMockStdout(size.columns, size.rows);

  const ansiChunks: Buffer[] = [];
  stdout.on('data', (chunk: Buffer) =>
    ansiChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  );

  const t0 = performance.now();

  // Mock stdin for snapshot rendering — no keyboard input needed.
  // isTTY must be TRUE so App.isRawModeSupported() returns true and doesn't
  // throw. setRawMode is a no-op: we claim TTY support but do nothing with it.
  const mockStdin = new PassThrough() as unknown as NodeJS.ReadStream;
  mockStdin.isTTY = true;
  (mockStdin as any).setRawMode  = () => mockStdin;
  (mockStdin as any).setEncoding = () => mockStdin;
  (mockStdin as any).ref         = () => mockStdin;
  (mockStdin as any).unref       = () => mockStdin;

  const instance = renderSync(node, {
    stdout,
    stdin: mockStdin,
    exitOnCtrlC: false,
  });

  // Give React one microtask tick to flush commits
  await Promise.resolve();

  // Read screen cells BEFORE unmounting
  const frame  = instance.lastFrame();
  const screen = frame?.screen;
  const text   = screen
    ? screenToText(screen, (x, y) => cellAt(screen, x, y))
    : '';

  instance.unmount();
  instance.cleanup();

  const renderMs = performance.now() - t0;

  stdout.end();
  await new Promise<void>((res) => stdout.on('finish', res));

  const ansi = Buffer.concat(ansiChunks).toString('utf8');

  return {
    text,
    ansi,
    lines:     text.split('\n'),
    size,
    renderMs:  Math.round(renderMs),
    timestamp: new Date().toISOString(),
    label,
  };
}
