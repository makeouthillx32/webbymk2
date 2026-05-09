// src/utils/debug.ts
// ─────────────────────────────────────────────────────────────────────────────
// Non-blocking, batched, JSONL logger for the TUI.
//
// Writes newline-delimited JSON to ~/.unenter/logs/<date>.jsonl via the
// buffered writer.  Each entry is a single JSON object:
//
//   {"ts":"2026-05-08T19:30:00.123Z","level":"error","msg":"container crashed"}
//
// Log levels (low to high): verbose → debug → info → warn → error
//   LOG_LEVEL env var controls the minimum level written to file.
//   Default: "warn" (errors and warnings always persisted).
//   DEBUG=1 is a shortcut for LOG_LEVEL=debug (backward compat).
//
// The buffered writer batches entries and flushes every 500ms or when the
// buffer hits 50 entries / 64KB — whichever comes first.  A process-exit
// handler forces a final flush so no entries are lost.
// ─────────────────────────────────────────────────────────────────────────────

import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import envPaths from "env-paths";
import { createBufferedWriter, type BufferedWriter } from "./bufferedWriter";

// ── Config ────────────────────────────────────────────────────────────────────

const APP_NAME = "unenter";
const LOG_DIR = envPaths(APP_NAME, { suffix: "" }).log;

export type LogLevel = "verbose" | "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4,
};

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL ?? process.env.DEBUG_LEVEL;
  if (!env && process.env.DEBUG) return "debug";
  if (!env) return "warn";
  if (env === "1" || env === "true") return "debug";
  return env in LEVEL_PRIORITY ? (env as LogLevel) : "warn";
}

// ── Buffered writer ───────────────────────────────────────────────────────────

let writer: BufferedWriter | null = null;
let flushing = false; // re-entrancy guard

function getWriter(): BufferedWriter {
  if (writer) return writer;
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
  const date = new Date().toISOString().slice(0, 10);
  const logFile = join(LOG_DIR, `${date}.jsonl`);
  writer = createBufferedWriter({
    writeFn(content: string) {
      if (flushing) return; // guard against re-entrant flush
      flushing = true;
      try {
        appendFileSync(logFile, content, "utf8");
      } catch {
        // Disk full, permissions, etc — nothing we can do.
      }
      flushing = false;
    },
    flushIntervalMs: 500,
    maxBufferSize: 50,
    maxBufferBytes: 64 * 1024,
  });
  // Flush remaining entries on process exit so nothing is lost.
  process.on("exit", () => writer?.flush());
  return writer;
}

// ── Core write ────────────────────────────────────────────────────────────────

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[getMinLevel()];
}

function writeEntry(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return;
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: message,
  };
  if (data) Object.assign(entry, data);
  getWriter().write(JSON.stringify(entry) + "\n");
}

// ── Legacy API (40+ call sites) ───────────────────────────────────────────────

/** Log a debug-level message. Only written when DEBUG or LOG_LEVEL=debug/verbose. */
export function logForDebugging(
  message: string,
  opts?: { level?: LogLevel },
): void {
  writeEntry(opts?.level ?? "debug", message);
}

/** Returns true when DEBUG is set or LOG_LEVEL >= debug. */
export function isDebugMode(): boolean {
  const min = getMinLevel();
  return min === "debug" || min === "verbose";
}

/** Flush buffered entries to disk. Call before process.exit() in non-exit paths. */
export function flushDebugLogs(): Promise<void> {
  writer?.flush();
  return Promise.resolve();
}

// ── Structured logger (new code) ──────────────────────────────────────────────

export const logger = {
  error: (msg: string, data?: Record<string, unknown>) =>
    writeEntry("error", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) =>
    writeEntry("warn", msg, data),
  info: (msg: string, data?: Record<string, unknown>) =>
    writeEntry("info", msg, data),
  debug: (msg: string, data?: Record<string, unknown>) =>
    writeEntry("debug", msg, data),
  verbose: (msg: string, data?: Record<string, unknown>) =>
    writeEntry("verbose", msg, data),
  flush: () => {
    writer?.flush();
  },
};
