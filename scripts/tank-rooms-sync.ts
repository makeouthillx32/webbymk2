#!/usr/bin/env bun
/**
 * Publish Blender room scenes to Tank.
 *
 *   bun scripts/tank-rooms-sync.ts              # every room in artifacts/tank-rooms/rooms.json
 *   bun scripts/tank-rooms-sync.ts kitchen foyer
 *   bun scripts/tank-rooms-sync.ts --remove kitchen   # stop showing kitchen's 3D scene
 *   bun scripts/tank-rooms-sync.ts house               # just the walkable house (alt director)
 *   bun scripts/tank-rooms-sync.ts --remove house      # turn the alt director off
 *   bun scripts/tank-rooms-sync.ts --dry-run
 *
 * The Blender "Tank Rooms" panel exports artifacts/tank-rooms/<room>.glb (same
 * name every time) and records each file's content hash in rooms.json. This
 * uploads changed files over the same object names in the public tank-assets
 * bucket (rooms3d/), plus the Draco decoder, and rewrites the public
 * rooms3d/rooms.json last — that manifest is what turns a room's 3D scene on.
 * Unchanged rooms (same hash as published) are skipped.
 *
 * "house" is the whole walkable house ("Export walkable house" in the panel,
 * artifacts/tank-rooms/house.glb): the alt director Tank shows while every
 * room is off air. It is published with the rooms unless rooms are named.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const LOCAL = join(ROOT, "artifacts", "tank-rooms");
const BUCKET = "tank-assets";
const FOLDER = "rooms3d";
const DRACO_DIR = join(ROOT, "node_modules", "three", "examples", "jsm", "libs", "draco", "gltf");
const DRACO_FILES: Array<[string, string]> = [
  ["draco_decoder.wasm", "application/wasm"],
  ["draco_wasm_wrapper.js", "text/javascript"],
  ["draco_decoder.js", "text/javascript"],
];

function env(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  const text = readFileSync(join(ROOT, ".env"), "utf8");
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} not found in environment or .env`);
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const removing = args.includes("--remove");
const names = args.filter((a) => !a.startsWith("--"));

// The browser-facing URL: NEXT_PUBLIC_SUPABASE_URL is the in-Docker kong:8000,
// unreachable from the host this runs on.
const url = (process.env.TANK_ROOMS_STORAGE_URL ?? env("NEXT_PUBLIC_SUPABASE_URL_BROWSER")).replace(/\/$/, "");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
const objectUrl = (path: string) => `${url}/storage/v1/object/${BUCKET}/${FOLDER}/${path}`;
const publicUrl = (path: string) => `${url}/storage/v1/object/public/${BUCKET}/${FOLDER}/${path}`;

async function upload(path: string, body: Uint8Array | string, contentType: string, maxAge: number) {
  if (dryRun) {
    console.log(`  would upload ${path} (${typeof body === "string" ? body.length : body.byteLength} bytes)`);
    return;
  }
  const res = await fetch(objectUrl(path), {
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

type Entry = { file: string; version: string; bytes?: number; exportedAt?: string };

type Manifest = { rooms: Record<string, Entry>; house?: Entry | null };

async function publishedManifest(): Promise<Manifest> {
  const res = await fetch(`${publicUrl("rooms.json")}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return { rooms: {} };
  try {
    const json = (await res.json()) as Manifest;
    return { rooms: json.rooms ?? {}, house: json.house ?? null };
  } catch {
    return { rooms: {} };
  }
}

const local = JSON.parse(readFileSync(join(LOCAL, "rooms.json"), "utf8")) as Manifest;
const publishedAll = await publishedManifest();
const published = publishedAll.rooms;
const next: Record<string, Entry> = { ...published };
let nextHouse: Entry | null = publishedAll.house ?? null;
const wantHouse = names.length ? names.includes("house") : true;
const roomNames = names.filter((n) => n !== "house");

if (removing) {
  if (!names.length) throw new Error("--remove needs at least one room key (or house)");
  if (names.includes("house")) {
    nextHouse = null;
    console.log("- house: removed from the manifest (the alt director is off)");
  }
  for (const room of roomNames) {
    delete next[room];
    console.log(`- ${room}: removed from the manifest (its file stays, unused)`);
  }
} else {
  const rooms = names.length ? roomNames : Object.keys(local.rooms);
  if (wantHouse && local.house) {
    const entry = local.house;
    const file = join(LOCAL, entry.file);
    if (!existsSync(file)) throw new Error(`missing ${file}`);
    if (publishedAll.house?.version === entry.version) {
      console.log(`= house: unchanged (${entry.version})`);
    } else {
      console.log(`+ house: ${publishedAll.house?.version ?? "new"} -> ${entry.version}`);
      await upload(entry.file, readFileSync(file), "model/gltf-binary", 31536000);
      nextHouse = { file: entry.file, version: entry.version, bytes: entry.bytes, exportedAt: entry.exportedAt };
    }
  } else if (wantHouse && names.includes("house")) {
    throw new Error('house is not in rooms.json — run "Export walkable house" in Blender first');
  }
  for (const room of rooms) {
    const entry = local.rooms[room];
    if (!entry) throw new Error(`${room} is not in ${join(LOCAL, "rooms.json")} — export it from Blender first`);
    const file = join(LOCAL, entry.file);
    if (!existsSync(file)) throw new Error(`missing ${file}`);
    if (published[room]?.version === entry.version) {
      console.log(`= ${room}: unchanged (${entry.version})`);
      continue;
    }
    console.log(`+ ${room}: ${published[room]?.version ?? "new"} -> ${entry.version}`);
    await upload(entry.file, readFileSync(file), "model/gltf-binary", 31536000);
    next[room] = { file: entry.file, version: entry.version, bytes: entry.bytes, exportedAt: entry.exportedAt };
  }
  for (const [name, type] of DRACO_FILES) {
    await upload(`draco/${name}`, readFileSync(join(DRACO_DIR, name)), type, 86400);
  }
}

const manifest = JSON.stringify({ updatedAt: new Date().toISOString(), rooms: next, house: nextHouse }, null, 2);
await upload("rooms.json", manifest, "application/json", 60);
console.log(`House:      ${nextHouse ? `${nextHouse.file} (${nextHouse.version})` : "(none — alt director off)"}`);
console.log(`\nLive rooms: ${Object.keys(next).sort().join(", ") || "(none)"}`);
console.log(`Manifest:   ${publicUrl("rooms.json")}`);
