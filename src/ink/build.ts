#!/usr/bin/env bun
// src/tui/build.ts — bundle the TUI into a single Node-compatible dist/cli.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Uses Bun's built-in esbuild-powered bundler.
//
// Output is ESM (.mjs) because yoga-wasm-web (used by ink internally) uses
// top-level await at module scope — valid ESM, invalid CJS.  Node.js handles
// .mjs files as ES modules natively, so no extra flags needed.
//
//   Build:  bun build.ts          (from src/tui/)
//   Run:    node src/tui/dist/cli.mjs   (from project root)
//   Exe:    bun build --compile index.tsx --outfile dist/unt
// ─────────────────────────────────────────────────────────────────────────────

import { rmSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

const outdir = join(import.meta.dir, "dist");
const outfile = join(outdir, "cli.mjs");

// ── Clean ──────────────────────────────────────────────────────────────────────
try { rmSync(outdir, { recursive: true }); } catch { }
mkdirSync(outdir, { recursive: true });

console.log("⚙  Bundling TUI…");

// ── Bundle ─────────────────────────────────────────────────────────────────────
const result = await Bun.build({
  entrypoints: [join(import.meta.dir, "App.tsx")],
  outdir,
  naming: "cli.mjs",
  target: "node",   // plain Node-compatible output
  format: "esm",    // ESM: supports top-level await (required by yoga-wasm-web)
  bundle: true,
  minify: false,
  sourcemap: "none",
  external: ["yoga-wasm-web"],
  // Define NODE_ENV=production so Bun eliminates ink's devtools import at
  // bundle time.  ink's reconciler guards the import with
  // `process.env.NODE_ENV !== 'production'`, so this makes it dead code and
  // it never appears in the output — no react-devtools-core needed at runtime.
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

if (!result.success) {
  console.error("✗  Build failed:");
  for (const log of result.logs) console.error(" ", log);
  process.exit(1);
}

// ── Verify output exists ────────────────────────────────────────────────────────
const bytes = readFileSync(outfile).length;
const kb = (bytes / 1024).toFixed(0);

console.log(`✓  dist/cli.mjs  (${kb} KB)`);
console.log("");
console.log("   Run it:");
console.log("     node ./src/ink/dist/cli.mjs");
console.log("");
console.log("   Or compile to a standalone exe:");
console.log("     bun build --compile src/ink/App.tsx --outfile src/ink/dist/unt.exe");
