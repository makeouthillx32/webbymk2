#!/usr/bin/env bun
/**
 * Publish Tank's random NPC pool (the Tavern's customers).
 *
 *   python artifacts/tank-npcs/build_npcs.py   # strips + npcs.json from Star-city-drift
 *   bun scripts/tank-npcs-sync.ts [--dry-run]
 *
 * Uploads artifacts/tank-npcs/out/<id>.webp (one idle strip per NPC) and
 * npcs.json to the public tank-assets bucket under rooms3d/npcs/. npcs.json
 * carries a version hash of every strip, which Tank appends to the strip URLs,
 * so the strips can be cached for a year and the manifest only briefly.
 * No Tank build is needed to add, drop or redraw NPCs.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const LOCAL = join(ROOT, "artifacts", "tank-npcs", "out");
const BUCKET = "tank-assets";
const FOLDER = "rooms3d/npcs";
const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function env(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  const text = readFileSync(join(ROOT, ".env"), "utf8");
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} not found in environment or .env`);
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

const dryRun = process.argv.includes("--dry-run");
// The browser-facing URL: NEXT_PUBLIC_SUPABASE_URL is the in-Docker kong:8000.
const url = (process.env.TANK_ROOMS_STORAGE_URL ?? env("NEXT_PUBLIC_SUPABASE_URL_BROWSER")).replace(/\/$/, "");
const key = env("SUPABASE_SERVICE_ROLE_KEY");

async function upload(path: string, body: Uint8Array | string, contentType: string, maxAge: number) {
  if (dryRun) {
    console.log(`  would upload ${path} (${typeof body === "string" ? body.length : body.byteLength} bytes)`);
    return;
  }
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${FOLDER}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      apikey: key,
      "content-type": contentType,
      "cache-control": `max-age=${maxAge}`,
      "x-upsert": "true",
    },
    body,
  });
  if (!res.ok) throw new Error(`upload ${path} failed: ${res.status} ${await res.text()}`);
  console.log(`  uploaded ${path}`);
}

type Npc = { id: string; name: string; frames: number; fps: number };
const built = JSON.parse(readFileSync(join(LOCAL, "npcs.json"), "utf8")) as { cell: [number, number]; npcs: Npc[] };
const hash = createHash("sha256");
const shipped: Npc[] = [];
for (const npc of built.npcs) {
  const file = join(LOCAL, `${npc.id}.webp`);
  if (!ID.test(npc.id) || !existsSync(file)) continue;
  const strip = readFileSync(file);
  hash.update(npc.id).update(npc.name).update(strip);
  await upload(`${npc.id}.webp`, strip, "image/webp", 31536000);
  shipped.push({ id: npc.id, name: String(npc.name).slice(0, 32), frames: npc.frames, fps: npc.fps });
}
const manifest = { version: hash.digest("hex").slice(0, 12), cell: built.cell, npcs: shipped };
await upload("npcs.json", JSON.stringify(manifest), "application/json", 60);
console.log(`NPC pool ${manifest.version}: ${shipped.length} NPCs`);
