---
tags: [unenter, blog, theme, ios, rss, reference]
date: 2026-07-13
---

# Blog zone — chrome, fonts, RSS, and a Brave/iOS quirk

## Seamless dark top (2026-07-13)
The blog's browser chrome / iOS status bar, header, hero band, and page body are all
`hsl(var(--background))` so the top reads as one uniform surface (no seam).
- `layout-tokens.css`: `[data-layout="landing"].blog-chrome` pins `--lt-status-bar` to
  `hsl(var(--background))` (compound selector outranks the `.dark [data-layout="landing"]`
  rule so it wins in both themes).
- `LayoutBranches.tsx` BlogLayout wrapper carries `className="blog-chrome"`.
- `BlogHeader` + `[slug]` hero: changed from taupe `--secondary` → `--background`, text
  → `--foreground`, tag-pill hover inverts light/dark. Mobile menu got a top border to
  stay distinguishable on the now-dark bg.
- The status bar is driven by `useMetaThemeColor` reading `--lt-status-bar` from the
  `[data-layout="landing"]` element after hydration.

## ⚠️ KNOWN QUIRK — Brave on iOS: theme-color frozen at render time (NO FIX, documented)
On **Brave (and Safari) on iOS**, the browser samples `theme-color` when the page is first
rendered and does NOT update it when the in-page theme toggle flips light↔dark. So if the
page was rendered/restored on dark, the iOS status-bar tint STAYS the dark value even after
switching to light (and vice-versa) — **until a hard refresh**. This is an iOS WebKit/Brave
limitation, not our bug: our `useMetaThemeColor` hook DOES update the `<meta theme-color>`
value correctly (verifiable in devtools), but iOS ignores the live change mid-session.
Also: iOS caches `theme-color` aggressively — after any change, a hard refresh / fresh
private tab is needed to see it. When someone reports "status bar wrong color," check this
first before touching code.

## Fonts — use the THEME fonts, not a generic fallback (2026-07-13)
`globals.css` declares `--font-sans: Plus Jakarta Sans`, `--font-serif: Source Serif 4`,
`--font-mono: JetBrains Mono`, and `tailwind.config.ts` maps `font-sans/serif/mono` to
those vars. BUT nothing loaded them — both core and the blog layout forced `Titillium_Web`
on the body — so `font-serif` headings fell back to a generic system serif and it all
looked like one font. Fix (blog `layout.tsx`): load the three theme fonts via
`next/font/google`, set `--font-*` INLINE on `<html>` (`style={fontVars}` — inline beats the
static `:root` values), and set the body to `fontSans.className`. Now `font-serif`/`font-mono`
utilities resolve to the real loaded theme fonts.
NOTE: the CORE app (`src/app/layout.tsx`) still forces Titillium and has the same latent
issue — apply the same fix there when core typography matters.

## RSS feed (2026-07-13)
- Route: `zones/blog/src/app/rss/route.ts` → `blog.unenter.live/rss`, RSS 2.0 XML from
  `blog_posts` (published, newest 50), `application/rss+xml`. Never 500s (empty feed on
  backend error).
- Header: `BlogHeader` shows a classic RSS feed icon + "RSS" linking to `/rss`, gated on
  `blog_settings.header.show_rss` (set to `true`).



## RSS download behavior (2026-07-13) — match GitButler's download sheet
Problem: iOS intercepts `application/rss+xml` and shows "This is a link to an RSS feed —
search the App Store?" instead of downloading. GitButler's RSS instead pops the WebKit
download sheet ("rss.rss — Download").
Fix: the `/rss` route adds `Content-Disposition: attachment; filename="rss.rss"`, and the
header link carries `download="rss.rss"`. Attachment disposition tells the browser to
download rather than hand the feed to a handler, so iOS shows the download sheet. Feed
aggregators fetch the URL programmatically and ignore Content-Disposition, so subscribing
via a reader still works — only interactive browser clicks change. Verified header live.



### RSS download — the ACTUAL fix (2026-07-13, round 2)
Content-Disposition: attachment alone did NOT stop iOS's "search App Store for RSS apps"
dialog — iOS/WebKit special-cases the `application/rss+xml` MIME at the URL level and shows
that prompt BEFORE honoring the disposition (and ignores the `download` attribute). The fix
that works: serve the feed as **`Content-Type: application/octet-stream`** (+ attachment
disposition, filename rss.rss). Body stays valid RSS 2.0 XML; aggregators sniff/parse the
body regardless of content-type, so subscribing still works. Lesson: to force a download of
an RSS/Atom feed on iOS, you MUST drop the feed MIME type — disposition + download attr are
not enough on their own.



### RSS download sheet position — top vs bottom (2026-07-13)
The `download` attribute on the `<a>` routed iOS/WebKit through its "web download" path
(top banner). Removing it — plain `<a href="/rss">` to a resource served with
`Content-Disposition: attachment` — gives the classic BOTTOM download action sheet, matching
GitButler. Takeaway: for the native bottom sheet, DON'T use the `download` attribute; let the
server disposition drive it.

### Gotcha: JSX comment placement broke a build
Putting `{/* ... */}` between `(` and `<a>` inside `{cond && ( <a/> )}` is a syntax error
(the `&&` right side must be a single expression, not JSX children). Use a `//` line comment
INSIDE the opening tag (valid in .tsx) or a comment outside the `{cond && (` block instead.
(Also: `unaxis stack clear --failed` cleared the resulting lingering failed build op — the
command added earlier works.)



### RSS download — FINAL resolved recipe (2026-07-13), matches GitButler exactly
Verified GitButler's live `/rss` headers: `Content-Type: application/rss+xml` + attachment +
chunked (no Content-Length). The winning combination for the clean iOS bottom download sheet:
1. **No `download` attribute** on the `<a>` — this was the real cause of the "search App Store
   for RSS apps" dialog (NOT the MIME type, which we wrongly blamed).
2. **Content-Type: application/rss+xml; charset=utf-8** — the proper feed MIME is fine once the
   download attribute is gone.
3. **Content-Disposition: attachment; filename="rss.rss"**.
4. **Stream the body** via ReadableStream (no Content-Length → Transfer-Encoding: chunked). iOS
   shows an unknown-size download as the direct file card ("rss.rss — Download (-1 byte)")
   instead of the "do you want to download?" confirm it shows when the byte size is known.
Myths busted along the way: octet-stream was NOT needed (it caused the "-1"-less confirm);
application/rss+xml was never the problem. Result: tap RSS → bottom sheet, downloads rss.rss,
no dialogs. Aggregators still parse the RSS 2.0 body normally.



### RSS — CORRECTION (2026-07-13): GitButler serves it INLINE, not a download
The entire "make it download / bottom sheet / -1 byte" chase was based on a MISREAD of
GitButler. Their `/rss` does NOT force a download — on desktop it DISPLAYS the XML in the
browser; iOS then handles the inline feed natively. Verified: GitButler serves
`Content-Type: application/rss+xml; charset=utf-8` with **NO Content-Disposition**.
Every dialog/error we hit was self-inflicted by trying to FORCE a download:
- `download` attribute on the link → iOS App-Store dialog
- `Content-Disposition: attachment` → desktop force-download + iOS "download?" confirm
- `application/octet-stream` → the "do you want to download?" confirm
- streamed/chunked body → iOS error
FINAL correct recipe = match GitButler exactly: serve the RSS 2.0 XML string INLINE with
`Content-Type: application/rss+xml; charset=utf-8`, NO Content-Disposition, NO download attr,
plain (non-streamed) body. Desktop renders it in-page; feed readers subscribe; iOS matches
GitButler because the headers are identical. Lesson: when cloning a behavior, match the
source's HEADERS first — don't assume the interaction and engineer toward it.
