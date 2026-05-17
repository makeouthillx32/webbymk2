import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { PROJECT_DIR } from "../config/zones.ts";

export type WatchMode = "light" | "dev" | "risky";

export interface WatchSession {
  id: string;
  label: string;
  mode: WatchMode;
  zone?: string;
  dir: string;
  startedAt: string;
}

export interface BeginWatchOptions {
  label: string;
  mode?: WatchMode;
  zone?: string;
}

const WATCH_ROOT = join(PROJECT_DIR, "logs", "agent-sessions");
const ACTIVE_FILE = join(WATCH_ROOT, "_active.json");

function ensureRoot(): void {
  if (!existsSync(WATCH_ROOT)) mkdirSync(WATCH_ROOT, { recursive: true });
}

function stamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "agent-session";
}

function timelinePath(session: WatchSession): string {
  return join(session.dir, "timeline.ndjson");
}

function redact(value: string): string {
  return value
    .replace(/(service_role|anon|apikey|authorization|password|token)(\s*[:=]\s*)([^\s]+)/gi, "$1$2[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt-redacted]");
}

export function getActiveWatch(): WatchSession | null {
  try {
    if (!existsSync(ACTIVE_FILE)) return null;
    return JSON.parse(readFileSync(ACTIVE_FILE, "utf8")) as WatchSession;
  } catch {
    return null;
  }
}

export function beginWatch(options: BeginWatchOptions): WatchSession {
  ensureRoot();
  const now = new Date().toISOString();
  const id = `${stamp()}_${slugify(options.label)}`;
  const dir = join(WATCH_ROOT, id);
  mkdirSync(join(dir, "docker"), { recursive: true });

  const session: WatchSession = {
    id,
    label: options.label,
    mode: options.mode ?? "light",
    zone: options.zone,
    dir,
    startedAt: now,
  };

  writeFileSync(join(dir, "manifest.json"), JSON.stringify(session, null, 2), "utf8");
  writeFileSync(ACTIVE_FILE, JSON.stringify(session, null, 2), "utf8");
  appendTimeline(session, "session.start", {
    label: session.label,
    mode: session.mode,
    zone: session.zone,
  });
  return session;
}

export function appendTimeline(
  session: WatchSession,
  type: string,
  data: Record<string, unknown> = {},
): void {
  try {
    appendFileSync(
      timelinePath(session),
      JSON.stringify({ ts: new Date().toISOString(), type, ...data }) + "\n",
      "utf8",
    );
  } catch {
    // Watch recording should never break the TUI command path.
  }
}

export function writeWatchText(
  session: WatchSession,
  filename: string,
  text: string,
): string {
  const path = join(session.dir, filename);
  writeFileSync(path, redact(text), "utf8");
  appendTimeline(session, "file.write", { file: filename });
  return path;
}

export function appendWatchText(
  session: WatchSession,
  filename: string,
  text: string,
): string {
  const path = join(session.dir, filename);
  appendFileSync(path, redact(text), "utf8");
  appendTimeline(session, "file.append", { file: filename });
  return path;
}

export function noteWatch(message: string): WatchSession | null {
  const session = getActiveWatch();
  if (!session) return null;
  appendTimeline(session, "note", { message });
  appendWatchText(session, "notes.md", `- ${new Date().toISOString()} ${message}\n`);
  return session;
}

export function endWatch(summary?: string): WatchSession | null {
  const session = getActiveWatch();
  if (!session) return null;

  appendTimeline(session, "session.end", {});
  const endedAt = new Date().toISOString();
  const summaryText = summary ?? [
    "# Agent Session Summary",
    "",
    `Label: ${session.label}`,
    `Mode: ${session.mode}`,
    session.zone ? `Zone: ${session.zone}` : null,
    `Started: ${session.startedAt}`,
    `Ended: ${endedAt}`,
    "",
    "See timeline.ndjson for the full event stream.",
    "",
  ].filter(Boolean).join("\n");
  writeWatchText(session, "summary.md", summaryText);

  try {
    rmSync(ACTIVE_FILE, { force: true });
  } catch {
    // Ignore cleanup failure.
  }
  return session;
}

export function watchRoot(): string {
  ensureRoot();
  return WATCH_ROOT;
}
