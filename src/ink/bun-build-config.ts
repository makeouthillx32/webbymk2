// src/ink/bun-build-config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the UNAXIS Bun.build() configuration.
//
// Both build.ts (local dev builds) and release.ts (the `r` release flow) must
// produce identical bundles.  Any time plugins, externals, or aliases change,
// edit THIS file — not the two callers.
//
// Usage:
//   const result = await Bun.build(makeBuildConfig(version))
// ─────────────────────────────────────────────────────────────────────────────

import { join } from 'path'

// ── Resolved paths (relative to this file = src/ink/) ─────────────────────────

export const entry          = join(import.meta.dir, '../entrypoints/cli.tsx')
export const outdir         = join(import.meta.dir, 'dist')
export const outfile        = join(outdir, 'cli.js')

const tuiNodeModules        = join(import.meta.dir, 'node_modules')
const tuiInkBuild           = join(tuiNodeModules, 'ink', 'build')

// ── Shared plugins ─────────────────────────────────────────────────────────────

export const buildPlugins: import('bun').BunPlugin[] = [
  {
    // Stub react-devtools-core so it is never left as a live runtime import.
    // devDependencies are not installed with global npm packages, so any
    // external reference to this module causes ERR_MODULE_NOT_FOUND on
    // machines that only have the published package.
    name: 'stub-react-devtools-core',
    setup(builder) {
      builder.onResolve({ filter: /^react-devtools-core$/ }, () => ({
        path:      'react-devtools-core',
        namespace: 'devtools-stub',
      }))
      builder.onLoad({ filter: /.*/, namespace: 'devtools-stub' }, () => ({
        contents: 'export default null; export const connectToDevTools = () => {};',
        loader:   'js',
      }))
    },
  },
  {
    // Force all ink/react/react-dom imports to the single isolated copy in
    // src/ink/node_modules.  Without this, files at different directory depths
    // resolve to different copies (root vs src/ink), producing two React
    // instances in the bundle — the reconciler initialises with one, components
    // reference the other, and React's internal state is undefined at runtime.
    name: 'unaxis-tui-runtime-aliases',
    setup(builder) {
      builder.onResolve({ filter: /^ink$/ }, () => ({
        path: join(tuiInkBuild, 'index.js'),
      }))
      builder.onResolve({ filter: /^ink\/(.+)$/ }, ({ path }) => ({
        path: join(tuiInkBuild, path.slice('ink/'.length)),
      }))
      builder.onResolve({ filter: /^react$/ }, () => ({
        path: join(tuiNodeModules, 'react', 'index.js'),
      }))
      builder.onResolve({ filter: /^react\/(.+)$/ }, ({ path }) => ({
        path: join(tuiNodeModules, 'react', path.slice('react/'.length) + '.js'),
      }))
      builder.onResolve({ filter: /^react-dom$/ }, () => ({
        path: join(tuiNodeModules, 'react-dom', 'index.js'),
      }))
      builder.onResolve({ filter: /^react-dom\/(.+)$/ }, ({ path }) => ({
        path: join(tuiNodeModules, 'react-dom', path.slice('react-dom/'.length) + '.js'),
      }))
    },
  },
]

// ── makeBuildConfig ────────────────────────────────────────────────────────────

/**
 * Returns a complete Bun.build() options object for the UNAXIS CLI bundle.
 *
 * @param version  The semver string to bake into UNAXIS_VERSION (e.g. "0.0.20")
 */
export function makeBuildConfig(version: string): Parameters<typeof Bun.build>[0] {
  return {
    entrypoints: [entry],
    outdir,
    naming:    'cli.js',
    target:    'node',
    format:    'esm',
    bundle:    true,
    minify:    false,
    sourcemap: 'none',
    external:  ['yoga-wasm-web'],
    plugins:   buildPlugins,
    define: {
      'process.env.NODE_ENV': '"production"',
      'UNAXIS_VERSION':       '"' + version + '"',
    },
  }
}
