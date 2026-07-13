---
tags: [unenter, blog, markdown, storage, dev-log]
date: 2026-07-12
---

# Blog upgrade — predictable image slots (post:// refs)

Picked up mid-build (prior session ran out of credits mid-ingest-alignment). Found the
feature essentially COMPLETE in code; job was verify + ship.

## The design (as built)
- Every post's images live at predictable paths: `blog-images/posts/<slug>/cover`,
  `image-1`, `image-2`… One slot = one file (stale-extension eviction on upload).
- Markdown (and cover_image) reference slots as `post://<slot>` BEFORE the file exists.
- Resolved to real public storage URLs at READ time.

## Component status (all built + wired)
- `src/zones/blog/_components/postImages.ts` — resolver: fetchPostImageMap(slug) lists
  posts/<slug>/ → slot→publicUrl; resolvePostRefs(text,map). Best-effort (unknown slots stay literal).
- `src/zones/blog/[slug]/Page.tsx` — RENDERER wired: resolves post:// in BOTH body content
  and cover, in the page render AND generateMetadata (OG). ✓
- `src/app/dashboard/[id]/blog/_components/PostImageSlots.tsx` + PostEditor — editor slot
  panel wired; live preview resolves post:// so preview matches live render. ✓
- `src/app/api/blog/ingest/route.ts` — ingest aligned: uploads to posts/<slug>/<name>.<ext>,
  handles attachment:// AND post://, resolves post:// from request urlMap OR pre-existing
  storage, errors on unresolvable slots. ✓  (+ ingest/images/route.ts)
- docs/blog-ingest-api.md documents post:// (5×). ✓
- Deps added: highlight.js (code highlighting) + marked + zod — bun.lock regenerated in sync.

## Verified this session
- Schema: blog_posts(+content_format), blog_authors/tags/post_tags/post_images all present;
  storage bucket blog-images exists and is PUBLIC. ✓
- Fixed blocker: a lingering failed "Build App" was `bun install --frozen-lockfile` failing
  ("lockfile had changes") — STALE, from before bun.lock was regenerated. Current bun.lock has
  highlight.js/marked/zod → fresh builds pass.
- Shipped: blog zone rebuilt (unt_blog on new image); core already had ingest+editor (ingest
  returns 401 = live). No regression: existing 5 HTML posts + blog index render 200.
- Routes live: /api/blog/ingest (401 no-token), /dashboard/me/blog (307 → sign-in, admin-gated).

## Remaining — both user-owned
1. **Set BLOG_INGEST_TOKEN** in .env (secret; app uses env_file .env) + restart app to enable
   the programmatic ingest path. Dormant until then (returns "not configured").
2. **Live slot round-trip proof** — no post uses slots yet (existing posts are legacy HTML).
   Cleanest proof needs no token: dashboard editor (browser) → new markdown post → drop image in
   a slot → publish → view resolves. OR ingest round-trip once the token is set.
   (Couldn't do the live image round-trip from here: needs the browser dashboard or the token.)



## Went live end-to-end (2026-07-13) — first real post through the pipeline
Published **Peptides & the Mitochondria** (tags: peptides, biohacking; hook "Doctors are now
making their own 'stacks'") via the actual ingest API. Cover: generated a 1200×630 SVG →
cairosvg PNG (177KB), sent as base64 attachment "cover".

- Set BLOG_INGEST_TOKEN in .env + deployed core (--no-deps) to load it. Ingest went from
  "not configured" → accepts Bearer token. POST returned ok:true, published.

### Two bugs found + fixed during the live run
1. **Split-horizon URL leak (the important one).** `postImages.ts` used supabase
   `getPublicUrl()` which returns the INTERNAL host `http://kong:8000/...` — browsers can't
   reach it, so the cover was broken in-browser. Fixed: resolver now builds URLs via
   `getPublicStorageObjectUrl()` (prefers NEXT_PUBLIC_SUPABASE_URL_BROWSER → db.unenter.live).
2. **Ingest baked absolute URLs into the DB**, defeating the slot indirection. The ingest was
   rewriting `post://` AND `attachment://` to absolute URLs at write time. Fixed: ingest now
   normalizes BOTH to durable `post://<slot>` refs (attachments upload to the slot path, so
   attachment://x == post://x). DB stores only slot refs; renderer resolves browser-safe at
   read time and survives image replacement. Backfilled the published post's row to post://cover.

### Verified live
- blog.unenter.live/peptides-and-the-mitochondria → 200, title/hook/tags present, on the index.
- Cover img src = https://db.unenter.live/storage/.../cover.png (NO kong leak); image loads
  200 image/png 177063 bytes.
- Blog zone rebuilt for the resolver fix; core redeployed for the token.

### Design lesson (worth keeping)
Slots must stay as `post://` refs all the way into the DB — resolve ONLY at read time. Any
write-time rewrite to an absolute URL both bakes in the wrong split-horizon host and breaks
the "reference before it exists / survives replacement" promise. The ingest converting
attachment:// → post:// (not → URL) is the correct normalization.



## Fix: cover was showing above the post body (2026-07-13)
Report: cover image appeared above the article when clicking into a post — wrong place.
Cause: the demo `![...](post://cover)` I put at the TOP of the post markdown when first
publishing — it duplicated the cover into the body. The [slug] template never renders a cover
hero (cover = card + OG art only, by design). Fix: stripped the leading image line from the
post's content->>'en' via SQL (regexp_replace); cover_image stays 'post://cover'. No rebuild
(post page is force-dynamic). Verified: post body 0 cover imgs; index card still shows cover
(Next <Image> /_next/image wrapper); OG image intact + browser-safe.
Convention confirmed: cover belongs on the listing card + OG metadata ONLY, never in the body.



## Fix: iOS status-bar color on blog (2026-07-13)
Report: status bar (iOS/Brave) was dark, clashing with the taupe blog header.
Root cause: blog renders under data-layout="landing"; landing's `--lt-status-bar: var(--gp-bg)`
= --secondary in light but --accent (dark) in dark mode. The blog hero/header are hardcoded
hsl(var(--secondary)) in BOTH themes, so in dark mode the status bar (=--accent, dark) clashed
with the taupe header. (The static viewport themeColor literals in zones/blog/.../layout.tsx are
the globals.css DEFAULT --secondary = blue 218°; the live DB theme overrides --secondary to taupe,
so the static value is always stale — only useMetaThemeColor resolves the live value.)
Fix (uses the documented --lt-status-bar system, scoped to blog):
- LayoutBranches BlogLayout wrapper: added className="blog-chrome"
- layout-tokens.css: `[data-layout="landing"].blog-chrome, .dark [data-layout="landing"].blog-chrome
  { --lt-status-bar: hsl(var(--secondary)); }` (compound selectors outrank the .dark landing override)
Chain: blog → isLandingPage → BlogLayout(.blog-chrome) → metaLayout="landing" →
useMetaThemeColor reads that div's --lt-status-bar → live hsl(var(--secondary)) → theme-color meta
= taupe → status bar matches header in both themes. Shipped via blog zone rebuild; class verified live.
Pattern note for future colored-hero zones: don't rely on the generic landing status-bar token —
add a `.<zone>-chrome` override pinning --lt-status-bar to the hero's actual color var.
