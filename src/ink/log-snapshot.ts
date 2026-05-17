import { spawn } from "child_process";
import { appendTimeline, appendWatchText, getActiveWatch } from "./watch-session.ts";

const DEFAULT_TAIL = 120;
const MAX_TAIL = 2000;

const DOCKER_ENV: Record<string, string> = {
  ...(process.env as Record<string, string>),
  ...(process.platform !== "win32"
    ? { DOCKER_HOST: "unix:///var/run/docker.sock" }
    : {}),
};

function clampTail(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TAIL;
  return Math.max(1, Math.min(MAX_TAIL, Math.floor(value)));
}

function safeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "container";
}

export function parseLogTail(args: string[], fallback = DEFAULT_TAIL): number {
  const idx = args.indexOf("--tail");
  if (idx === -1) return fallback;
  return clampTail(Number(args[idx + 1]));
}

export const parseTail = parseLogTail;

export async function snapshotContainerLogs({
  label,
  container,
  tail = DEFAULT_TAIL,
  onLine,
}: {
  label: string;
  container: string;
  tail?: number;
  onLine: (line: string) => void;
}): Promise<number> {
  const count = clampTail(tail);
  const session = getActiveWatch();
  const watchFile = `docker/${safeName(label)}-tail.txt`;
  const lines: string[] = [];

  if (session) {
    appendTimeline(session, "docker.logs.start", { label, container, tail: count });
  }

  const header = `Logs ${label} (${container}) tail ${count}`;
  onLine(header);
  lines.push(`# ${new Date().toISOString()} ${header}`);

  const code = await new Promise<number>((resolve) => {
    const proc = spawn("docker", ["logs", "--tail", String(count), container], {
      env: DOCKER_ENV,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const handle = (chunk: Buffer) => {
      chunk.toString().split("\n").filter(Boolean).forEach((line) => {
        lines.push(line);
        onLine(line);
      });
    };

    proc.stdout?.on("data", handle);
    proc.stderr?.on("data", handle);
    proc.on("close", (exitCode) => resolve(exitCode ?? 1));
    proc.on("error", (err) => {
      const line = `docker logs error: ${err.message}`;
      lines.push(line);
      onLine(line);
      resolve(1);
    });
  });

  if (session) {
    appendWatchText(session, watchFile, lines.join("\n") + "\n");
    appendTimeline(session, "docker.logs.end", { label, container, tail: count, exitCode: code, file: watchFile });
  }

  if (code === 0) onLine(`✓ logs captured (${label})`);
  else onLine(`✗ docker logs exited ${code} (${label})`);
  return code;
}

export async function captureDockerLogs({
  label,
  container,
  tail = DEFAULT_TAIL,
}: {
  label: string;
  container: string;
  tail?: number;
}, onLine: (line: string) => void): Promise<{ code: number; tail: number }> {
  const count = clampTail(tail);
  const session = getActiveWatch();
  const watchFile = `docker/${safeName(label)}-tail.txt`;
  const lines: string[] = [];

  if (session) {
    appendTimeline(session, "docker.logs.start", { label, container, tail: count });
  }

  const header = `Logs ${label} (${container}) tail ${count}`;
  onLine(header);
  lines.push(`# ${new Date().toISOString()} ${header}`);

  const code = await new Promise<number>((resolve) => {
    const proc = spawn("docker", ["logs", "--tail", String(count), container], {
      env: DOCKER_ENV,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const handle = (chunk: Buffer) => {
      chunk.toString().split("\n").filter(Boolean).forEach((line) => {
        lines.push(line);
        onLine(line);
      });
    };

    proc.stdout?.on("data", handle);
    proc.stderr?.on("data", handle);
    proc.on("close", (exitCode) => resolve(exitCode ?? 1));
    proc.on("error", (err) => {
      const line = `docker logs error: ${err.message}`;
      lines.push(line);
      onLine(line);
      resolve(1);
    });
  });

  if (session) {
    appendWatchText(session, watchFile, lines.join("\n") + "\n");
    appendTimeline(session, "docker.logs.end", { label, container, tail: count, exitCode: code, file: watchFile });
  }

  if (code !== 0) onLine(`✗ docker logs exited ${code} (${label})`);
  return { code, tail: count };
}
