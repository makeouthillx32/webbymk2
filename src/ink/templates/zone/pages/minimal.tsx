// src/zones/__ZONE_KEY__/Page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// __ZONE_LABEL__ zone  ·  __ZONE_DOMAIN__
// Layout: minimal  (bare canvas — no header, no footer)
//
// This is the root page for the __ZONE_KEY__ zone.
// Edit freely — the zone container, Providers, and CSS tokens are already
// wired in zones/__ZONE_KEY__/src/app/layout.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";

const ZONE_KEY    = "__ZONE_KEY__";
const ZONE_LABEL  = "__ZONE_LABEL__";
const ZONE_DOMAIN = "__ZONE_DOMAIN__";

export const metadata: Metadata = {
  title:       `${ZONE_LABEL} | Unenter`,
  description: `${ZONE_LABEL} — ${ZONE_DOMAIN}`,
};

export default function __ZONE_PASCAL__Page() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg text-center">

        {/* Zone identity badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          {ZONE_DOMAIN}
        </div>

        <h1 className="mb-4 text-4xl font-bold text-black dark:text-white">
          {ZONE_LABEL}
        </h1>

        <p className="text-body-color">
          Zone is live. Edit{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm dark:bg-dark-2">
            src/zones/{ZONE_KEY}/Page.tsx
          </code>{" "}
          to build this page out.
        </p>

      </div>
__ZONE_DS_SECTION__
    </main>
  );
}
