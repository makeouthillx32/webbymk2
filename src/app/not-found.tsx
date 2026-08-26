// src/app/not-found.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Zone-aware 404. This is a FALLBACK, not a router: middleware handles Zone
// Promotion redirects before a request ever reaches here (see middleware.ts +
// the promotion registry in @/lib/multiZone). By the time we render, the route
// genuinely matched nothing — so we use the zone context to offer the most
// useful recovery instead of the old blind redirect("/error").
//
// Recovery logic:
//   • Promoted Core path that somehow fell through → point at the zone.
//   • On a zone subdomain → offer the zone home + Core home.
//   • On Core → offer Core home.
//   • Always offer the canonical host as a safe anchor.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  CORE_DOMAIN,
  getZoneBaseUrl,
  type ZoneName,
  type ZoneRequestContext,
} from "@/lib/multiZone";
import { getZoneContext } from "@/lib/zoneContext";

const CORE_HOME = `https://www.${CORE_DOMAIN}`;

async function safeZoneContext(): Promise<ZoneRequestContext> {
  try {
    return await getZoneContext();
  } catch {
    // Static/header-less render path — default to a Core, non-promoted view.
    return {
      zone: "unenter",
      host: "",
      canonicalHost: `www.${CORE_DOMAIN}`,
      isCoreHost: true,
      isLocal: false,
    };
  }
}

export default async function NotFound() {
  const ctx = await safeZoneContext();

  // Build the recovery actions from zone context.
  const actions: { href: string; label: string; primary?: boolean }[] = [];

  if (ctx.promotionStatus === "redirect" && ctx.promotedToZone) {
    // A promoted path leaked to 404 — send them to the zone it moved to.
    const zoneUrl = getZoneBaseUrl(ctx.promotedToZone as ZoneName);
    actions.push({ href: zoneUrl, label: `Go to ${ctx.promotedToZone}.${CORE_DOMAIN}`, primary: true });
  }

  if (!ctx.isCoreHost && ctx.host) {
    // On a zone subdomain: offer this zone's home first, then Core.
    actions.push({ href: `https://${ctx.host}`, label: `${ctx.host} home`, primary: actions.length === 0 });
    actions.push({ href: CORE_HOME, label: `${CORE_DOMAIN} home` });
  } else {
    actions.push({ href: CORE_HOME, label: `${CORE_DOMAIN} home`, primary: actions.length === 0 });
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        404 — page not found
      </p>

      <h1 className="mt-3 text-2xl font-bold text-[var(--foreground)]">
        We couldn&rsquo;t find that page
      </h1>

      <p className="mt-3 text-base leading-relaxed text-[var(--muted-foreground)]">
        {ctx.promotionStatus === "redirect" && ctx.promotedToZone
          ? `That section moved to ${ctx.promotedToZone}.${CORE_DOMAIN}.`
          : "The page may have moved, or the link may be out of date."}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {actions.map((a) => (
          <a
            key={a.href + a.label}
            href={a.href}
            className={
              a.primary
                ? "inline-flex items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-5 py-3 font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
                : "inline-flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-5 py-3 font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
            }
          >
            {a.label} →
          </a>
        ))}
      </div>

      <Link
        href="/"
        className="mt-6 text-sm text-[var(--muted-foreground)] underline-offset-4 hover:underline"
      >
        Back to this site&rsquo;s home
      </Link>
    </main>
  );
}
