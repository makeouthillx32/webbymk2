// scripts/dev-bare.ts
// ─────────────────────────────────────────────────────────────────────────────
// Bare-metal dev server for ANY zone — `next dev` as a plain Windows process
// on the host, no Docker. Launched (detached) by src/ink/bare-dev.ts:
//
//   bun scripts/dev-bare.ts <zone-key> <port>
//
// Why: the containerized dev loop reads the repo through Docker Desktop's
// Windows-drive mount, which doesn't deliver file-change events, so Next only
// noticed edits on a slow poll (75 s to show a one-line change, measured
// 2026-10-01). A native process watches NTFS directly — Tank's bare-metal
// mode showed ~2 s.
//
// How a zone is assembled: production (each zone's Dockerfile) and the old dev
// container REPLACE src/app with the shared app pieces + zones/<key>/src/app.
// That can't happen in place on Windows (src/app IS the core app), so this
// builds a small Next project per zone OUTSIDE the repo:
//
//   <repo parent>\.unaxis-bare-dev\<zone>\  (same drive as the repo)
//     node_modules, public           → junctions to the repo (live)
//     src\app\                       → assembled: every directory a junction
//                                      into the repo (live edits, real HMR),
//                                      loose files copied and re-copied the
//                                      moment they change
//     next.config.mjs                → the repo's config + externalDir
//     tsconfig.json, postcss.config.js, middleware.ts → point at / mirror the repo
//
// `@/…` resolves to the repo's real src/, so shared code and src/zones/<key>
// are edited in place exactly as before. The `unenter` zone needs no overlay
// and runs straight from the repo root.
// ─────────────────────────────────────────────────────────────────────────────

import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmdirSync,
  statSync, symlinkSync, unlinkSync, watch, writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const [zone, portArg] = process.argv.slice(2);
if (!zone || !portArg) {
  console.error("usage: bun scripts/dev-bare.ts <zone-key> <port>");
  process.exit(2);
}
const port = Number(portArg);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APPDATA = process.env.APPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Roaming");
// Same drive as the repo, outside it: Next makes its own client entries
// relative to the project dir, and a cross-drive relative path (C: → Z:)
// doesn't exist on Windows, so a root on another drive breaks every page.
const ROOT = zone === "unenter" ? REPO : join(dirname(REPO), ".unaxis-bare-dev", zone);
void APPDATA;
const log = (m: string) => console.log(`[dev-bare ${zone}] ${m}`);

// ── Safe filesystem helpers (never recurse THROUGH a junction) ──────────────

function isLink(p: string): boolean {
  try { return lstatSync(p).isSymbolicLink(); } catch { return false; }
}

/** Removes a path without ever following a junction into the repo. */
function safeRemove(p: string): void {
  if (!existsSync(p) && !isLink(p)) return;
  if (isLink(p)) {
    try { rmdirSync(p); } catch { unlinkSync(p); }
    return;
  }
  if (lstatSync(p).isDirectory()) {
    for (const e of readdirSync(p)) safeRemove(join(p, e));
    rmdirSync(p);
    return;
  }
  unlinkSync(p);
}

function junction(target: string, at: string): void {
  safeRemove(at);
  symlinkSync(target, at, "junction");
}

// ── Assembly ────────────────────────────────────────────────────────────────

// Same lists as the production overlay (dev-container.ts devOverlayCommand).
const CORE_DIRS = ["api", "actions", "auth", "_components", "providers"];
const CORE_FILES = ["provider.tsx", "globals.css"];
const SHOP_CORE_DIRS = ["[categorySlug]", "products", "collections", "shop", "checkout", "(auth-pages)"];
const SHOP_SKIP_FROM_ZONE = new Set(["[categorySlug]", "products", "collections", "checkout"]);

/** source file → copied destination, re-copied when the source changes. */
const copies = new Map<string, string>();

function copyTracked(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  copies.set(src, dest);
}

/**
 * Lays `sources` (name → ordered source paths) into `dir`: a name with one
 * directory source becomes a junction; a name several sources share as
 * directories becomes a real folder merged one level down; files are copied,
 * the last source winning (production's `cp -a` order).
 */
function layout(dir: string, sources: Map<string, string[]>): void {
  mkdirSync(dir, { recursive: true });
  for (const [name, paths] of sources) {
    const at = join(dir, name);
    const dirs = paths.filter((p) => statSync(p).isDirectory());
    if (dirs.length === paths.length && dirs.length === 1) { junction(dirs[0], at); continue; }
    if (dirs.length === paths.length) {
      const inner = new Map<string, string[]>();
      for (const d of dirs) for (const e of readdirSync(d)) inner.set(e, [...(inner.get(e) ?? []), join(d, e)]);
      safeRemove(at);
      layout(at, inner);
      continue;
    }
    safeRemove(at);
    copyTracked(paths[paths.length - 1], at);
  }
}

function assembleApp(): void {
  const coreApp = join(REPO, "src", "app");
  const zoneApp = join(REPO, "zones", zone, "src", "app");
  if (!existsSync(zoneApp)) throw new Error(`zones/${zone}/src/app not found`);
  const sources = new Map<string, string[]>();
  const add = (name: string, p: string) => sources.set(name, [...(sources.get(name) ?? []), p]);
  for (const n of [...CORE_DIRS, ...(zone === "shop" ? SHOP_CORE_DIRS : []), ...CORE_FILES]) {
    if (existsSync(join(coreApp, n))) add(n, join(coreApp, n));
  }
  for (const n of readdirSync(zoneApp)) {
    if (zone === "shop" && SHOP_SKIP_FROM_ZONE.has(n)) continue;
    add(n, join(zoneApp, n));
  }
  const appDir = join(ROOT, "src", "app");
  safeRemove(appDir);
  copies.clear();
  layout(appDir, sources);
}

function writeProjectFiles(): void {
  mkdirSync(join(ROOT, "src"), { recursive: true });
  junction(join(REPO, "node_modules"), join(ROOT, "node_modules"));
  junction(join(REPO, "public"), join(ROOT, "public"));
  // Every src/ entry except app/ is linked, so relative imports from copied
  // files (globals.css → ../style/home.css) land where they expect.
  for (const e of readdirSync(join(REPO, "src"))) {
    if (e === "app") continue;
    const from = join(REPO, "src", e);
    if (statSync(from).isDirectory()) junction(from, join(ROOT, "src", e));
    else copyTracked(from, join(ROOT, "src", e));
  }
  for (const f of ["middleware.ts", "next-env.d.ts"]) {
    if (existsSync(join(REPO, f))) copyTracked(join(REPO, f), join(ROOT, f));
  }
  // The repo's config, copied as ESM (re-copied when it changes): importing it
  // by file URL works for Next but not for its webpack cache.
  copyTracked(join(REPO, "next.config.js"), join(ROOT, "next.config.base.mjs"));
  writeFileSync(join(ROOT, "package.json"), JSON.stringify({ name: `unaxis-dev-${zone}`, private: true }, null, 2));
  writeFileSync(join(ROOT, "next.config.mjs"), [
    "// Generated by scripts/dev-bare.ts — the repo's config, plus what a project outside the repo needs.",
    `import base from "./next.config.base.mjs";`,
    "export default {",
    "  ...base,",
    "  experimental: { ...(base.experimental ?? {}), externalDir: true },",
    `  allowedDevOrigins: [...(base.allowedDevOrigins ?? []), "dev.*.unenter.live", "localhost"],`,
    "};",
    "",
  ].join("\n"));
  const repoTs = JSON.parse(readFileSync(join(REPO, "tsconfig.json"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
  writeFileSync(join(ROOT, "tsconfig.json"), JSON.stringify({
    // src/ here links every repo src/ folder, so the project's own ./src/*
    // is the repo's src/ (an absolute baseUrl confuses Next's resolver).
    compilerOptions: {
      ...repoTs.compilerOptions,
      baseUrl: ".",
      paths: { "@/*": ["./src/*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
    exclude: ["node_modules"],
  }, null, 2));
  writeFileSync(join(ROOT, "postcss.config.js"), [
    "// Generated: the repo's Tailwind config (relative:true resolves its content globs against the repo).",
    "module.exports = {",
    `  plugins: { tailwindcss: { config: ${JSON.stringify(join(REPO, "tailwind.config.ts"))} }, autoprefixer: {} },`,
    "};",
    "",
  ].join("\n"));
}

// ── Environment (same rules as zones/tank/dev-bare.ps1) ─────────────────────

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const file = join(REPO, ".env");
  if (existsSync(file)) {
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(raw);
      if (!m) continue;
      let v = m[2].trim();
      if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
  // Docker-network names don't resolve from a host process.
  const browserSupabase = env.NEXT_PUBLIC_SUPABASE_URL_BROWSER;
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== "string") continue;
    if (browserSupabase && v.includes("http://kong:8000")) env[k] = v.replaceAll("http://kong:8000", browserSupabase);
    else if (v.includes("host.docker.internal")) env[k] = v.replaceAll("host.docker.internal", "localhost");
  }
  if (!env.SRT_MANAGER_INTERNAL_URL) env.SRT_MANAGER_INTERNAL_URL = "http://localhost:5050";
  env.NEXT_PUBLIC_ZONE = zone;
  env.NEXT_TELEMETRY_DISABLED = "1";
  return env;
}

// ── Keep copied files in step with the repo ─────────────────────────────────

function watchSources(): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let structural = false;
  const onEvent = (kind: string) => {
    if (kind === "rename") structural = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        if (structural) { structural = false; assembleApp(); log("app tree changed — re-assembled"); return; }
        for (const [src, dest] of copies) {
          if (existsSync(src) && statSync(src).mtimeMs > (existsSync(dest) ? statSync(dest).mtimeMs : 0)) {
            copyFileSync(src, dest);
            log(`synced ${src.slice(REPO.length + 1)}`);
          }
        }
      } catch (e) { log(`sync failed: ${e instanceof Error ? e.message : e}`); }
    }, 150);
  };
  for (const d of [join(REPO, "src", "app"), join(REPO, "zones", zone, "src", "app")]) {
    if (existsSync(d)) watch(d, { recursive: true }, (kind) => onEvent(kind));
  }
  watch(REPO, (kind, f) => { if (f === "middleware.ts" || f === "next.config.js") onEvent(kind === "rename" ? "change" : kind); });
}

// ── Run ─────────────────────────────────────────────────────────────────────

if (zone !== "unenter") {
  log(`assembling ${ROOT}`);
  writeProjectFiles();
  assembleApp();
  log(`app assembled: ${copies.size} copied file(s), the rest linked to the repo`);
  watchSources();
}
const nextBin = join(REPO, "node_modules", "next", "dist", "bin", "next");
log(`next dev on :${port} from ${ROOT}`);
const child = spawn("node", [nextBin, "dev", "-p", String(port), "-H", "0.0.0.0"], {
  cwd: ROOT, env: loadEnv(), stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => child.kill(sig));
