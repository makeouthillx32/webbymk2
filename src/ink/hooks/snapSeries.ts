// src/ink/hooks/snapSeries.ts
// ─────────────────────────────────────────────────────────────────────────────
// Frame-sequence recorder — the "film strip" companion to `snap` (one frame).
//
//   unaxis snap --series [--every <ms>] [--duration <ms>] [--label <name>]
//     Samples the live frame on an interval and writes a folder of frames
//     plus a manifest to .snapshots/<ts>-<label>-series/.
//
//   unaxis snap --arm-startup [--every <ms>] [--duration <ms>]
//     Drops .snapshots/.record-startup.json. The NEXT boot (dev hot-reload or
//     restart) consumes the marker and records its own startup splash. This
//     indirection exists because the splash only plays at process boot and a
//     restart kills any in-process recorder — so startup capture must begin
//     at boot, not from a live IPC call.
//
// Boot recordings also write logs/startup-series-latest.json (manifest copy +
// dir pointer) so agents without filesystem access can verify the capture.
//
// Dispatch lives in ipc-server.ts (server-level intercept); the single-frame
// `snap` handler in useIpcBridge.ts is untouched.
// ─────────────────────────────────────────────────────────────────────────────

import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { join, resolve } from "path";

export const SERIES_DEFAULT_EVERY    = 100;   // ms between samples
export const SERIES_DEFAULT_DURATION = 4000;  // total recording window, ms
export const STARTUP_RECORD_MARKER   = ".record-startup.json";

export type SeriesOpts = { every: number; duration: number; label: string };

export function parseSeriesOpts(args: string[], defaultLabel: string): SeriesOpts {
  const num = (flag: string, dflt: number) => {
    const i = args.indexOf(flag);
    const v = i >= 0 ? parseInt(args[i + 1] ?? "", 10) : NaN;
    return Number.isFinite(v) && v > 0 ? v : dflt;
  };
  const labelIdx = args.indexOf("--label");
  return {
    every:    num("--every", SERIES_DEFAULT_EVERY),
    duration: num("--duration", SERIES_DEFAULT_DURATION),
    label:    labelIdx >= 0 ? (args[labelIdx + 1] ?? defaultLabel) : defaultLabel,
  };
}

// Reads the current live screen as plain text — same cell walk as `snap`.
async function readLiveFrameText(): Promise<{ text: string; width: number; height: number } | null> {
  const instances = (await import("../instances.js")).default;
  const { cellAt } = await import("../screen.js");
  const ink    = instances.get(process.stdout);
  const frame  = ink?.lastFrame();
  const screen = frame?.screen;
  if (!screen) return null;
  const rows: string[] = [];
  for (let y = 0; y < screen.height; y++) {
    let row = "";
    for (let x = 0; x < screen.width; x++) row += cellAt(screen, x, y)?.char ?? " ";
    rows.push(row.trimEnd());
  }
  while (rows.length > 0 && rows[rows.length - 1] === "") rows.pop();
  return { text: rows.join("\n"), width: screen.width, height: screen.height };
}

type FrameEntry = { index: number; file: string | null; t: number; repeatOf?: number };

export type SeriesManifest = {
  label:      string;
  mode:       string;
  everyMs:    number;
  durationMs: number;
  sampled:    number;
  written:    number;
  width?:     number;
  height?:    number;
  startedAt:  string;
  dir:        string;
  frames:     FrameEntry[];
};

export async function recordFrameSeries(
  opts: SeriesOpts,
  onLine: (line: string) => void,
): Promise<number> {
  const ts   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug = opts.label.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  const root = resolve(process.cwd(), ".snapshots");
  const dir  = join(root, `${ts}-${slug}-series`);
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  mkdirSync(dir, { recursive: true });

  const isDev = process.execPath.toLowerCase().includes("bun");
  const t0 = Date.now();
  const frames: FrameEntry[] = [];
  let written = 0;
  let prevText: string | null = null;
  let prevIndex = 0;
  let index = 0;
  let size: { width: number; height: number } | null = null;

  onLine(`● recording: every ${opts.every}ms for ${opts.duration}ms → ${dir}`);

  while (Date.now() - t0 < opts.duration) {
    const frame = await readLiveFrameText();
    index += 1;
    const t = Date.now() - t0;
    if (frame === null) {
      frames.push({ index, file: null, t });
    } else if (frame.text === prevText) {
      // identical to previous — manifest records timing, no duplicate file
      frames.push({ index, file: null, t, repeatOf: prevIndex });
    } else {
      const name = `frame-${String(index).padStart(4, "0")}.txt`;
      writeFileSync(join(dir, name), frame.text, "utf8");
      frames.push({ index, file: name, t });
      written += 1;
      prevText  = frame.text;
      prevIndex = index;
      size = { width: frame.width, height: frame.height };
    }
    const elapsed = Date.now() - t0;
    const wait = Math.min(opts.every, Math.max(0, opts.duration - elapsed));
    if (wait <= 0) break;
    await new Promise((r) => setTimeout(r, wait));
  }

  const manifest: SeriesManifest = {
    label:      opts.label,
    mode:       isDev ? "dev" : "prod",
    everyMs:    opts.every,
    durationMs: opts.duration,
    sampled:    index,
    written,
    ...(size ?? {}),
    startedAt:  new Date(t0).toISOString(),
    dir,
    frames,
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  onLine(`✓ series: ${index} samples, ${written} unique frames`);
  onLine(`  dir      ${dir}`);
  onLine(`  manifest manifest.json (repeatOf entries dedupe identical frames)`);
  return 0;
}

export async function armStartupRecording(
  args: string[],
  onLine: (line: string) => void,
): Promise<number> {
  const opts = parseSeriesOpts(args, "startup");
  const root = resolve(process.cwd(), ".snapshots");
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  const marker = join(root, STARTUP_RECORD_MARKER);
  writeFileSync(marker, JSON.stringify({ ...opts, armedAt: new Date().toISOString() }, null, 2), "utf8");
  onLine(`✓ startup recording armed: every ${opts.every}ms for ${opts.duration}ms`);
  onLine(`  marker ${marker}`);
  onLine(`  next TUI boot (dev hot-reload or restart) records its own startup splash`);
  return 0;
}

// Called once at boot from startIpcServer. Consumes the marker (deleted first
// so a crash can never loop the recorder), records the splash, and writes a
// verification pointer to logs/startup-series-latest.json. Never throws.
export async function maybeRecordStartupFromMarker(): Promise<void> {
  try {
    const marker = join(resolve(process.cwd(), ".snapshots"), STARTUP_RECORD_MARKER);
    if (!existsSync(marker)) return;
    let opts: SeriesOpts = { every: SERIES_DEFAULT_EVERY, duration: SERIES_DEFAULT_DURATION, label: "startup" };
    try { opts = { ...opts, ...JSON.parse(readFileSync(marker, "utf8")) }; } catch { /* defaults */ }
    try { unlinkSync(marker); } catch { /* ignore */ }

    const lines: string[] = [];
    await recordFrameSeries(opts, (l) => lines.push(l));

    try {
      const dirLine   = lines.find((l) => l.includes("dir")) ?? "";
      const dir       = dirLine.replace(/^\s*dir\s+/, "").trim();
      const logsDir   = resolve(process.cwd(), "logs");
      if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
      const manifest  = dir ? JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) : { lines };
      writeFileSync(
        join(logsDir, "startup-series-latest.json"),
        JSON.stringify({ recordedAt: new Date().toISOString(), ...manifest }, null, 2),
        "utf8",
      );
    } catch { /* pointer write is best-effort */ }
  } catch { /* never break boot */ }
}

// touch 2026-06-12: revive dev TUI after cli.tsx edits
