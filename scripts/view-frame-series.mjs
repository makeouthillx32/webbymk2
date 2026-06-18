#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const args = process.argv.slice(2);

function valueAfter(flag, fallback = null) {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
}

function has(flag) {
  return args.includes(flag);
}

function usage(exitCode = 0) {
  console.log([
    "Usage: node scripts/view-frame-series.mjs [manifest-or-dir] [options]",
    "",
    "Defaults to logs/startup-series-latest.json.",
    "",
    "Options:",
    "  --summary          Only print manifest stats and frame timeline.",
    "  --strip            Print unique frames inline as a compact film strip. Default.",
    "  --all-samples      Include repeat samples as timing rows. Default in --summary.",
    "  --unique-only      Omit repeat samples from the timeline.",
    "  --max-frames N     Limit inline unique frames. Default: all unique frames.",
    "  --help             Show this help.",
  ].join("\n"));
  process.exit(exitCode);
}

if (has("--help") || has("-h")) usage();

const flagsWithValues = new Set(["--max-frames"]);
let positional = null;
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (flagsWithValues.has(arg)) {
    i += 1;
    continue;
  }
  if (!arg.startsWith("-")) {
    positional = arg;
    break;
  }
}
const targetPath = resolve(process.cwd(), positional ?? "logs/startup-series-latest.json");

function loadManifest(path) {
  if (!existsSync(path)) throw new Error(`Frame-series path not found: ${path}`);
  const manifestPath = path.endsWith(".json") ? path : join(path, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const baseDir = manifest.dir && isAbsolute(manifest.dir) ? manifest.dir : dirname(manifestPath);
  return { manifest, baseDir, manifestPath };
}

function framePath(baseDir, file) {
  return isAbsolute(file) ? file : join(baseDir, file);
}

function readFrame(baseDir, file) {
  return readFileSync(framePath(baseDir, file), "utf8").replace(/\s+$/g, "");
}

function timelineRow(frame) {
  const index = String(frame.index).padStart(4, "0");
  const t = String(frame.t ?? 0).padStart(5, " ");
  if (frame.file) return `${index}  ${t}ms  ${frame.file}`;
  if (frame.repeatOf) return `${index}  ${t}ms  repeatOf frame-${String(frame.repeatOf).padStart(4, "0")}`;
  return `${index}  ${t}ms  no frame captured`;
}

const { manifest, baseDir, manifestPath } = loadManifest(targetPath);
const frames = Array.isArray(manifest.frames) ? manifest.frames : [];
const uniqueFrames = frames.filter((frame) => frame.file);
const includeRepeats = has("--all-samples") || !has("--unique-only");
const summaryOnly = has("--summary");
const strip = has("--strip") || !summaryOnly;
const maxFramesRaw = valueAfter("--max-frames");
const maxFrames = maxFramesRaw ? Math.max(0, Number.parseInt(maxFramesRaw, 10)) : uniqueFrames.length;

console.log(`Frame series: ${manifest.label ?? "(unlabeled)"}`);
console.log(`Manifest: ${manifestPath}`);
console.log(`Directory: ${baseDir}`);
console.log(`Mode: ${manifest.mode ?? "unknown"} | sampled: ${manifest.sampled ?? frames.length} | unique: ${manifest.written ?? uniqueFrames.length} | every: ${manifest.everyMs ?? "?"}ms | duration: ${manifest.durationMs ?? "?"}ms | size: ${manifest.width ?? "?"}x${manifest.height ?? "?"}`);
console.log("");
console.log("Timeline:");
for (const frame of frames) {
  if (!includeRepeats && !frame.file) continue;
  console.log(`  ${timelineRow(frame)}`);
}

if (strip) {
  console.log("");
  console.log(`Film strip: ${Math.min(maxFrames, uniqueFrames.length)} of ${uniqueFrames.length} unique frames`);
  for (const frame of uniqueFrames.slice(0, maxFrames)) {
    console.log("");
    console.log(`--- frame-${String(frame.index).padStart(4, "0")} @ ${frame.t ?? 0}ms (${frame.file}) ---`);
    console.log(readFrame(baseDir, frame.file));
  }
  if (maxFrames < uniqueFrames.length) {
    console.log("");
    console.log(`... ${uniqueFrames.length - maxFrames} unique frame(s) omitted by --max-frames ${maxFrames}`);
  }
}
