# Default-theme color flash (blue header on first paint)

**Status:** investigated, documented, NOT fixed — deliberate. Fix is a later goal.
**Found while:** building the Tank zone's arcade-console shell (2026-08-14).

## Symptom

On first paint — especially on slow/low-bandwidth connections — chrome that
uses `--secondary` (e.g. the shared "app" layout header, `--gp-bg` /
`--lt-bg`) renders a vivid blue before snapping to the site's real
configured color a moment later. Looks like a stale default flashing before
"the DB sends over the proper color."

## Root cause

Three separate places define the default theme's colors, and they can — and
did — drift out of sync:

1. **`src/app/globals.css`** `:root` block — static CSS, present in the very
   first byte of HTML (SSR), always instant. Hand-maintained.
   `--secondary: 218.54 79.19% 66.08%` (hue 218° = blue, sat 79%, light 66%).
2. **`src/themes/default.ts`** — the bundled JS fallback `Theme` object, used
   by `getThemeById()`/`fetchThemes()` (`src/themes/index.ts`) whenever
   Supabase is unreachable or during the async gap before the DB fetch
   resolves. Also hand-maintained. Currently has the *same* `--secondary`
   value as globals.css (`218.54 79.19% 66.08%`) — so right now the two
   static copies agree with each other, but neither is generated from the
   third source below, so nothing stops them drifting from it.
3. **Supabase `public.themes` table** (`theme_data` jsonb column) — the real,
   live, admin-editable source of truth. Fetched client-side, async, by
   `fetchThemes()` in `src/themes/index.ts` (5 min cache, 30s error backoff).

### Why the flash happens

- `ThemeProviderWrapper` (`src/app/providers/ThemeProvider.tsx`) applies
  theme CSS variables to `<html>` via `style.setProperty()` **only after**
  hydration: mount → load available theme IDs → read saved `themeId` from
  localStorage/cookie → `getThemeById()` (which hits Supabase) → apply.
  Nothing paints the DB-sourced color before that async chain finishes.
- Until it finishes, the page shows whatever `globals.css` baked in at
  build/SSR time — i.e. item (1) above, the static blue.
- **If someone edits the default theme's colors in Supabase** (via whatever
  admin theme editor exists) but doesn't also hand-update `globals.css` and
  `default.ts` to match, those two static copies go stale silently. Every
  visitor then sees the *old* color at first paint, then a visible snap to
  the *new* color once the async Supabase fetch resolves. On a slow
  connection that gap is long enough to be obviously wrong.
- There's a fast-path for repeat visitors: `applyTheme()` caches resolved
  `--background` and `--primary` in
  `localStorage['unenter-preloader-bg-{light|dark}']` /
  `['unenter-preloader-primary']` for a synchronous pre-hydration
  preloader script to read on the next load (comment references this in
  `ThemeProvider.tsx` around line 191–198). **But it does not cache
  `--secondary`** — which is exactly what the app-header blue comes from
  (`layout-tokens.css`: `--gp-bg: hsl(var(--secondary))` →
  `[data-layout="app"] --lt-bg: var(--gp-bg)`). So even a warm returning
  visitor still sees the header flash; only the page background benefits
  from the cache.

### Relevant files

- `src/app/globals.css` — static `:root` / `.dark` CSS variable fallback.
- `src/themes/index.ts` — `fetchThemes()`, `getThemeById()`, cache/backoff.
- `src/themes/default.ts` — bundled fallback `Theme` object (and
  `monochrome.ts` / `vintage.ts` / `sharp.ts` siblings).
- `src/app/providers/ThemeProvider.tsx` — applies resolved theme to
  `<html>` client-side; owns the preloader-cache write.
- `src/style/layout-tokens.css` — maps each `[data-layout]` variant's
  header/footer background to `--gp-bg` (→ `--secondary` in light mode,
  `--accent` in dark mode).
- Supabase `public.themes` table — live source of truth (`theme_data`
  jsonb, `is_active`, `preview_color`).

## Candidate fixes (not implemented — pick one later)

**A. Manual sync discipline (cheapest, fragile).** Whenever the default
theme is edited in Supabase, also hand-edit `globals.css` and
`default.ts` to match. Zero engineering, but it's exactly the discipline
that already lapsed once — will drift again.

**B. Generate the static fallbacks from Supabase (safer, still simple).**
A script (run at Docker build time, or triggered from whatever admin UI
saves theme edits) that pulls the active/default row from
`public.themes` and regenerates the `globals.css` `:root`/`.dark` block
and `themes/default.ts` automatically. Removes the possibility of drift
entirely, no architecture change needed.

**C. Cache `--secondary` (and friends) in the preloader (targeted, partial).**
Extend the `unenter-preloader-*` localStorage cache to include every
variable the layout-token chains depend on (`--secondary`, `--accent`,
not just `--background`/`--primary`), so returning visitors' synchronous
preloader script can paint the correct header color immediately. Doesn't
help first-time visitors or a cleared cache — only reduces how often the
flash is seen.

**D. Resolve the active theme server-side (most robust, biggest lift).**
Have the root `layout.tsx` fetch the active theme with the server/admin
Supabase client and inline the resolved CSS variables into the initial
HTML response (inline `<style>` or `style` attribute), instead of
resolving 100% client-side in `ThemeProviderWrapper`. Eliminates the flash
entirely regardless of connection speed or cache state, since the correct
color is present in the very first byte of HTML. Requires restructuring
theme resolution to be SSR-aware — worth it if this keeps being reported,
otherwise B is a good middle ground.

## Recommendation (non-binding)

B (generate static fallbacks from Supabase) is the best cost/benefit for
a "later fix" — kills the specific drift bug that caused this, doesn't
require touching the client-side theme architecture. C is worth doing
alongside B regardless, since it's a two-line change. D is the "real" fix
if this class of bug keeps recurring across other CSS variables, not just
`--secondary`.
