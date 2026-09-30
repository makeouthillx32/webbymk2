import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

// Reads the remote-syslog files written by the `syslog` compose service
// (one file per UTC day, logs/syslog/YYYY-MM-DD.log). Newest lines last.

export type RouterLogQuery = {
  tail: number;
  grep?: string;   // case-insensitive regex
  date?: string;   // YYYY-MM-DD: only that day's file
  days?: number;   // how many recent day files to search (default 2)
};

export function routerLogDir(projectDir: string): string {
  return join(projectDir, "logs", "syslog");
}

export function listLogDays(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.log$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

export function readRouterLog(dir: string, q: RouterLogQuery): { lines: string[]; days: string[] } {
  const all = listLogDays(dir);
  const days = q.date ? all.filter((d) => d === q.date) : all.slice(-Math.max(1, q.days ?? 2));
  const re = q.grep ? new RegExp(q.grep, "i") : null;
  const lines: string[] = [];
  for (const day of days) {
    for (const line of readFileSync(join(dir, `${day}.log`), "utf8").split("\n")) {
      if (line && (!re || re.test(line))) lines.push(line);
    }
  }
  return { lines: lines.slice(-q.tail), days };
}

export function parseRouterLogArgs(args: string[], tail: number): RouterLogQuery | string {
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const q: RouterLogQuery = { tail, grep: flag("--grep"), date: flag("--date") };
  const days = flag("--days");
  if (days !== undefined) {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1) return "--days must be a whole number ≥ 1";
    q.days = n;
  }
  if (q.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(q.date)) return "--date must be YYYY-MM-DD";
  if (q.grep !== undefined) {
    try { new RegExp(q.grep); } catch { return `--grep is not a valid regex: ${q.grep}`; }
  }
  return q;
}
