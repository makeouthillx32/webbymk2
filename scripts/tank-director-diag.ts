#!/usr/bin/env bun
/**
 * Read the LIVE director's own view of the house.
 *
 *   bun scripts/tank-director-diag.ts            summary
 *   bun scripts/tank-director-diag.ts --json     full payload
 *   bun scripts/tank-director-diag.ts --watch 5  summary every 5s
 *
 * Authenticates with TANK_ARCHIVE_INGEST_SECRET from .env (the same secret the
 * vision worker posts telemetry with), so it needs no browser session.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const base = process.env.TANK_DIAG_URL ?? "https://tank.unenter.live";

function secretFromEnv(): string {
  if (process.env.TANK_ARCHIVE_INGEST_SECRET) return process.env.TANK_ARCHIVE_INGEST_SECRET;
  const env = readFileSync(join(import.meta.dir, "..", ".env"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("TANK_ARCHIVE_INGEST_SECRET="));
  if (!line) throw new Error("TANK_ARCHIVE_INGEST_SECRET not found in .env");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

const ago = (ms: number | null) => (ms === null ? "never" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

async function fetchDiag() {
  const res = await fetch(`${base}/api/tank/director/diagnostics?cb=${Date.now()}`, {
    headers: { "x-tank-ingest-secret": secretFromEnv() },
  });
  if (!res.ok) throw new Error(`diagnostics ${res.status}: ${await res.text()}`);
  return res.json();
}

function summarise(d: any): string {
  const out: string[] = [];
  const p = d.programme;
  out.push(`ON AIR  ${p.camera ?? p.cameraId}  (${p.mode}, held ${p.heldForSeconds}s)`);
  out.push(`        ${p.reason}`);
  const o = d.operator;
  out.push(
    `MODE    operator=${o.operatorMode ?? "-"} effective=${o.effectiveMode} follow=${o.followMember ?? "-"}` +
      (o.follow?.lastSeen ? ` lastSeen=${o.follow.lastSeen.cameraId} ${ago(d.now - o.follow.lastSeen.at)} ago` : ""),
  );
  const a = d.detection.appearance;
  out.push(
    `DETECT  usable=${d.detection.usable} worker=${d.detection.serverDetectionActive}` +
      (a ? ` signatures=${a.signatures} rejected=${a.rejected?.length ?? 0} targets=${JSON.stringify(a.targets)}` : ""),
  );
  const ident = (d.detection.identity ?? []).filter((i: any) => i.fresh);
  out.push(
    `LEARNER ${ident.length ? ident.map((i: any) => `${i.cameraId.slice(-3)}:${i.names.join("/") || `${i.peopleCount}p`}`).join(" ") : "no live naming (learner idle or director hands-on)"}`,
  );
  out.push(`TICKS   ${d.worker.tickCount} failures=${d.worker.consecutiveFailures} lastError=${d.worker.lastError ?? "-"}`);
  out.push("");
  for (const c of d.cameras) {
    const boxes = c.boxes
      .map((b: any) => `${b.name ?? b.label}${b.confidence !== null ? `@${Number(b.confidence).toFixed(2)}` : ""}`)
      .join(" ");
    const follow = c.followPresence ? (c.followPresence.present ? " FOLLOW-SEEN" : "") : "";
    out.push(
      `${c.onProgramme ? "▶" : " "} ${String(c.name).padEnd(14)} ${String(c.presence).padEnd(8)} age=${ago(c.telemetryAgeMs).padEnd(6)}` +
        ` people=${c.peopleCount ?? "-"} best=${c.bestMember ?? "-"}${follow}  ${boxes}`,
    );
  }
  out.push("");
  out.push("RECENT DECISIONS (newest first)");
  for (const dec of d.decisions.slice(0, 12)) {
    const t = new Date(dec.lastAt).toLocaleTimeString();
    out.push(`  ${t}  x${String(dec.ticks).padEnd(4)} ${dec.reason}`);
  }
  return out.join("\n");
}

const watchIdx = args.indexOf("--watch");
if (args.includes("--json")) {
  console.log(JSON.stringify(await fetchDiag(), null, 2));
} else if (watchIdx >= 0) {
  const every = Number(args[watchIdx + 1] ?? 5) * 1000;
  for (;;) {
    console.log(`\n── ${new Date().toLocaleTimeString()} ──`);
    console.log(summarise(await fetchDiag()));
    await new Promise((r) => setTimeout(r, every));
  }
} else {
  console.log(summarise(await fetchDiag()));
}
