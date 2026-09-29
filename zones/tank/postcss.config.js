// zones/tank/postcss.config.js
// -----------------------------------------------------------------------------
// Next.js resolves PostCSS config relative to its OWN detected project root
// (wherever next.config.js lives), not by walking further up the tree. The
// bare-metal dev run (dev-bare.ps1) sets cwd/project-root to zones/tank/, so
// without a copy of this file here, Next never found root's postcss.config.js
// and silently never invoked the tailwindcss PostCSS plugin at all — the
// `@tailwind base/components/utilities` at-rules in globals.css just passed
// through as unrecognized at-rules the browser ignores. Confirmed live
// 2026-08-30: the compiled layout.css contained zero utility classes (no
// `.flex{`, no `bg-emerald`, nothing) despite being ~100KB of real CSS (plain
// custom properties, keyframes, radix/shadcn vars that don't need Tailwind).
//
// Getting PostCSS to run tailwindcss at all (this file's mere presence) was
// only half the fix, discovered right after: tailwindcss's OWN config
// auto-resolution (node_modules/tailwindcss/lib/util/resolveConfigPath.js,
// resolveDefaultConfigPath) checks ONLY `path.resolve("./tailwind.config.*")`
// against cwd — it does NOT walk up parent directories the way most
// "find a config file" tools do. From cwd=zones/tank it found nothing,
// silently fell back to tailwindcss's bare built-in default config
// (content: []), which still emits the unconditional preflight/base layer
// (why the tailwindcss banner + reset CSS were already present) but scans
// zero files for `@tailwind components/utilities` (why every class was
// missing with no error anywhere). An explicit `config:` path bypasses that
// cwd-only search entirely, and is what makes tailwind.config.ts's own
// `content.relative: true` meaningful — it needs a real userConfigPath to
// resolve "relative to the config file" against.
const path = require("path");
module.exports = {
  plugins: {
    tailwindcss: { config: path.join(__dirname, "..", "..", "tailwind.config.ts") },
    autoprefixer: {},
  },
}
