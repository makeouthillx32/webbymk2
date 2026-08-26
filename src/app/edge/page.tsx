// app/edge/page.tsx
//
// Recovery landing page for unmatched / mistyped subdomains.
// NPM's "Default Site" (the fallback for any Host header that doesn't match a
// registered proxy host — e.g. a typo like lab.unenter.live instead of
// labs.unenter.live) redirects here instead of exposing NPM's own admin
// "Congratulations" page. See vault/Core/npm-default-site-edge-page.md.
//
// Renders through the normal Landing chrome (routeClassifier.ts routes
// "/edge" to isLandingPage), so it inherits the real header/footer/theme —
// no hand-copied styling to keep in sync, unlike a static page pasted into
// NPM's own database would require.

import Link from "next/link";
import { Metadata } from "next";
import { createAdminClient } from "@/utils/supabase/admin";
import { CORE_DOMAIN } from "@/lib/multiZone";

export const metadata: Metadata = {
  title: "Unenter",
  description: "Find your way to the right Unenter site.",
  robots: { index: false, follow: false },
};

type ZoneRow = {
  key: string;
  label: string;
  domain: string;
  description: string | null;
  sort_order: number;
};

// Same curation the site footer already uses (usePublicZoneLinks /
// api/public/zones) — internal-only zones stay off this page too.
const HIDDEN_KEYS = new Set(["unenter", "auth", "logs", "logz"]);

async function getPublicZones(): Promise<ZoneRow[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("zones")
      .select("key,label,domain,description,sort_order")
      .eq("enabled", true)
      .eq("footer_pinned", true)
      .order("sort_order", { ascending: true })
      .returns<ZoneRow[]>();

    if (error || !data) return [];
    return data.filter((zone) => !HIDDEN_KEYS.has(zone.key));
  } catch {
    // A broken catalog read must not take down the recovery page itself.
    return [];
  }
}

// Small Levenshtein distance for "did you mean" suggestions — no dependency
// needed for strings this short (subdomain labels).
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function findSuggestion(
  from: string | undefined,
  zones: ZoneRow[],
): ZoneRow | null {
  if (!from) return null;
  const cleaned = from
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  if (!cleaned || cleaned === CORE_DOMAIN || cleaned === `www.${CORE_DOMAIN}`) {
    return null;
  }

  let best: ZoneRow | null = null;
  let bestDist = Infinity;
  for (const zone of zones) {
    const dist = levenshtein(cleaned, zone.domain.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = zone;
    }
  }
  // Only surface close typos (e.g. "lab" -> "labs"), never a wild guess.
  return best && bestDist <= 3 ? best : null;
}

export default async function EdgePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const zones = await getPublicZones();
  const suggestion = findSuggestion(from, zones);

  return (
    <section className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[hsl(var(--primary))]">
        Unenter
      </p>

      <h1 className="mt-3 text-3xl font-bold text-[hsl(var(--foreground))] sm:text-4xl">
        {suggestion ? "That address doesn't exist" : "You've reached Unenter"}
      </h1>

      {suggestion ? (
        <p className="mt-4 text-base text-[hsl(var(--muted-foreground))]">
          <span className="font-semibold text-[hsl(var(--foreground))]">
            {from}
          </span>{" "}
          isn&apos;t one of ours. Did you mean{" "}
          <a
            href={`https://${suggestion.domain}`}
            className="font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
          >
            {suggestion.domain}
          </a>
          ?
        </p>
      ) : (
        <p className="mt-4 text-base text-[hsl(var(--muted-foreground))]">
          The address you typed doesn&apos;t match one of our sites. Here&apos;s
          everywhere Unenter lives:
        </p>
      )}

      {zones.length > 0 && (
        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {zones.map((zone) => (
            <li key={zone.key}>
              <a
                href={`https://${zone.domain}`}
                className="block rounded-xl border border-[hsl(var(--border))] p-4 transition-colors hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]"
              >
                <p className="font-bold text-[hsl(var(--foreground))]">
                  {zone.label}
                </p>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  {zone.domain}
                </p>
                {zone.description && (
                  <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                    {zone.description}
                  </p>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-12 border-t border-[hsl(var(--border))] pt-6">
        <Link
          href="/"
          className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline"
        >
          Take me to unenter.live &rarr;
        </Link>
      </div>
    </section>
  );
}
