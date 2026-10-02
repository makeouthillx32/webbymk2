// src/ink/changelog.ts
// Changelogs per part of the platform — one per zone, plus core, unaxis and
// services (scopes: changelog-scopes.ts). Nothing new to write: it reads the
// commit messages you already write, and for zones the deploy ledger.
//
//   zone      — each deploy and the commits it shipped (zone's own source +
//               core), then what is committed but not deployed yet. Needs
//               ledger rows that carry a commit (`g<sha>`); older rows say
//               "gnogit", and for those it falls back to commit history.
//   core / unaxis / services — recent commits, newest first.

import { PROJECT_DIR } from "../config/zones.ts";
import { runGit } from "./git-bin.ts";
import { commitMatches, scopesOfCommit, type ChangelogTarget, type PathScope } from "./changelog-scopes.ts";

export interface ChangelogCommit {
  sha: string;
  date: string;          // YYYY-MM-DD, author date
  subject: string;
  /** For zone logs: true when the commit only reached the zone through core. */
  viaCore?: boolean;
  /** For services logs: which services it touched. */
  services?: string[];
}

export interface ZoneDeploy {
  at: string;
  sourceRef: string;
  image: string;
  /** null = the range could not be read (commit missing from this checkout). */
  commits: ChangelogCommit[] | null;
  /** The oldest deploy shown has nothing earlier to diff against. */
  first: boolean;
}

export interface ZoneChangelog {
  zone: string;
  deploys: ZoneDeploy[];
  /** Committed on HEAD, not in the last deploy. null when no deploy carries a commit. */
  unshipped: ChangelogCommit[] | null;
  /** Commit history, used when no deploy carries a commit yet. */
  history: ChangelogCommit[];
  /** Deploys newer than the newest one with a commit (logged as "gnogit"
   *  before the ledger fix). While > 0, `unshipped` may list live commits. */
  unrecorded: number;
  /** Time of the newest deploy of any kind. */
  lastDeployAt: string | null;
}

interface RawCommit { sha: string; date: string; subject: string; scopes: PathScope[] }

const REC = "\x01";
const FIELD = "\x02";

/** `git log <args>` with each commit's files, or null when git fails. */
async function readCommits(args: string[]): Promise<RawCommit[] | null> {
  const r = await runGit(PROJECT_DIR, ["log", ...args, `--format=${REC}%H${FIELD}%as${FIELD}%s`, "--name-only"], { timeoutMs: 15_000 });
  if (r.status !== 0) return null;
  return parseLog(r.stdout);
}

export function parseLog(out: string): RawCommit[] {
  return out.split(REC).slice(1).map((chunk) => {
    const [head, ...lines] = chunk.split("\n");
    const [sha = "", date = "", subject = ""] = head.split(FIELD);
    const files = lines.map((l) => l.trim()).filter(Boolean);
    return { sha: sha.trim(), date: date.trim(), subject: subject.trim(), scopes: scopesOfCommit(subject, files) };
  });
}

function toEntry(c: RawCommit, target: ChangelogTarget): ChangelogCommit {
  const e: ChangelogCommit = { sha: c.sha.slice(0, 8), date: c.date, subject: c.subject };
  if (target.kind === "zone") {
    e.viaCore = !c.scopes.some((s) => s.kind === "zone" && s.name === target.name);
  }
  if (target.kind === "services") {
    e.services = c.scopes.filter((s) => s.kind === "services").map((s) => s.name!).sort();
  }
  return e;
}

function pick(commits: RawCommit[], target: ChangelogTarget): ChangelogCommit[] {
  return commits.filter((c) => commitMatches(target, c.scopes)).map((c) => toEntry(c, target));
}

/** `g<sha>[-dirty]` → `<sha>`; "" for gnogit or anything unparseable. */
export function shaFromSourceRef(ref: string): string {
  return /^g([0-9a-f]{7,40})(?:-dirty)?$/i.exec((ref ?? "").trim())?.[1] ?? "";
}

/** Recent commits for any target, newest first. Scans a window of history
 *  rather than the whole repo, so a quiet scope may show fewer than `limit`. */
export async function scopeChangelog(target: ChangelogTarget, limit = 30, scan = 2000): Promise<ChangelogCommit[]> {
  const commits = await readCommits(["-n", String(scan), "HEAD"]);
  return commits ? pick(commits, target).slice(0, limit) : [];
}

/** Deploys of one zone with the commits each one shipped. */
export async function zoneChangelog(zoneKey: string, limit = 10): Promise<ZoneChangelog> {
  const target: ChangelogTarget = { kind: "zone", name: zoneKey };
  const { dbGetLedger } = await import("./control-db.ts");

  const all = dbGetLedger({ zoneKey, limit: 200 }).filter((r) => r.action !== "git-push");
  const lastDeployAt = all[0]?.createdAt ?? null;
  const firstKnown = all.findIndex((r) => shaFromSourceRef(r.sourceRef));
  const unrecorded = firstKnown === -1 ? all.length : firstKnown;

  // Deploys that know their commit, newest first, one per distinct source.
  const rows = all
    .filter((r) => shaFromSourceRef(r.sourceRef))
    .filter((r, i, all) => i === 0 || all[i - 1].sourceRef !== r.sourceRef)
    .slice(0, limit + 1); // one extra: the base the oldest shown deploy diffs against

  if (rows.length === 0) {
    return { zone: zoneKey, deploys: [], unshipped: null, history: await scopeChangelog(target, 20), unrecorded, lastDeployAt };
  }

  const deploys: ZoneDeploy[] = [];
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    const cur = rows[i], prev = rows[i + 1];
    const curSha = shaFromSourceRef(cur.sourceRef);
    let commits: ChangelogCommit[] | null = [];
    if (prev) {
      const prevSha = shaFromSourceRef(prev.sourceRef);
      const raw = prevSha === curSha ? [] : await readCommits([`${prevSha}..${curSha}`]);
      commits = raw ? pick(raw, target) : null;
    }
    deploys.push({ at: cur.createdAt ?? "", sourceRef: cur.sourceRef, image: cur.image ?? "", commits, first: !prev });
  }

  const latest = shaFromSourceRef(rows[0].sourceRef);
  const ahead = await readCommits([`${latest}..HEAD`]);
  return { zone: zoneKey, deploys, unshipped: ahead ? pick(ahead, target) : null, history: [], unrecorded, lastDeployAt };
}

// ── text output ────────────────────────────────────────────────────────────

function commitLine(c: ChangelogCommit): string {
  const tags = [c.viaCore ? "core" : "", ...(c.services ?? [])].filter(Boolean);
  return `    ${c.sha}  ${c.subject}${tags.length ? `  [${tags.join(", ")}]` : ""}`;
}

/** Commits grouped under a line per day. */
export function formatByDay(commits: ChangelogCommit[]): string[] {
  const out: string[] = [];
  let day = "";
  for (const c of commits) {
    if (c.date !== day) { day = c.date; out.push(`  ${day}`); }
    out.push(commitLine(c));
  }
  return out;
}

export function formatZoneChangelog(log: ZoneChangelog): string[] {
  const out: string[] = [];
  if (log.deploys.length === 0) {
    out.push(log.lastDeployAt
      ? `  No deploy of ${log.zone} has a recorded commit yet (older deploys were logged as "gnogit").`
      : `  ${log.zone} has no deploys in the ledger yet.`);
    out.push(`  The next \`zone ${log.zone} build\` records one. Recent commits for ${log.zone} + core:`);
    out.push(...formatByDay(log.history));
    return out;
  }

  if (log.unrecorded > 0) {
    out.push(`  ! ${log.unrecorded} newer deploy${log.unrecorded === 1 ? "" : "s"} (latest ${(log.lastDeployAt ?? "").slice(0, 16)}) logged no commit —`);
    out.push(`    "not deployed yet" counts from ${log.deploys[0].sourceRef} and may list commits that are live. The next build fixes this.`);
    out.push("");
  }
  if (log.unshipped === null) {
    out.push(`  Not deployed yet: unknown (the last deployed commit isn't in this checkout — git fetch)`);
  } else if (log.unshipped.length > 0) {
    out.push(`  Not deployed yet (${log.unshipped.length})`);
    out.push(...log.unshipped.map(commitLine));
  } else {
    out.push(`  Not deployed yet: nothing — the live image has every commit on HEAD`);
  }

  for (const d of log.deploys) {
    out.push("");
    out.push(`  ${d.at.slice(0, 16)}  deployed ${d.sourceRef}`);
    if (d.first) out.push(`    (oldest recorded deploy — nothing earlier to compare)`);
    else if (d.commits === null) out.push(`    (commits unknown — that range isn't in this checkout)`);
    else if (d.commits.length === 0) out.push(`    (rebuild — no new commits for this zone)`);
    else out.push(...d.commits.map(commitLine));
  }
  return out;
}
