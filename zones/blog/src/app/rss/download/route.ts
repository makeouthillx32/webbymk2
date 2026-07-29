import { buildRssDocument } from "../feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Device-aware RSS button target.
//
// MOBILE (iOS/Android, Safari OR Brave): serve application/octet-stream +
// Content-Disposition: attachment so the browser fires its native download
// prompt — the WebKit "Download / Cancel" sheet on iOS. This is the behavior we
// smoke-tested and want to keep. (Plain application/rss+xml gets the "search the
// App Store" wall on iOS Safari because our proxy adds x-content-type-options:
// nosniff; octet-stream sidesteps that entirely.)
//
// DESKTOP: no attachment — serve text/xml so the browser renders the raw feed
// inline (the collapsible XML view) instead of downloading a file.
//
// iPad on iPadOS 13+ reports a desktop Safari UA, so it is treated as desktop
// here; the target device for the download sheet is iPhone.
const MOBILE_UA =
  /iphone|ipod|android|mobile|silk|kindle|blackberry|opera mini|iemobile|windows phone/i;

export async function GET(request: Request) {
  const rss = await buildRssDocument();
  const ua = request.headers.get("user-agent") ?? "";
  const isMobile = MOBILE_UA.test(ua);

  if (isMobile) {
    // Force the native download sheet.
    return new Response(rss, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="unenter-blog.rss"',
        "Content-Length": String(Buffer.byteLength(rss, "utf8")),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=300",
        Vary: "User-Agent",
      },
    });
  }

  // Desktop: render the raw feed inline as syntax-highlighted source, matching
  // GitButler. application/rss+xml skips Chromium's XML pretty-printer (the
  // "no style information / document tree" banner + collapse triangles that
  // text/xml triggers); the App Store wall this MIME causes only exists on iOS
  // Safari, which never reaches this branch (mobile is served above).
  return new Response(rss, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      Vary: "User-Agent",
    },
  });
}
