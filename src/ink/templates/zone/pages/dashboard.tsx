// src/zones/__ZONE_KEY__/Page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// __ZONE_LABEL__ zone  ·  __ZONE_DOMAIN__
// Layout: dashboard  (Sidebar + DashboardHeader)
//
// This is the root page for the __ZONE_KEY__ zone.
// Edit freely — the dashboard shell (Sidebar + DashboardHeader) is already
// applied via the routeClassifier override baked into this zone's build.
//
// The dashboard shell expects isDashboardPage: true in routeClassifier, which
// is set for this zone.  Dashboard sub-routes are scaffolded alongside if you
// selected them in the wizard.
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
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">

      {/* Zone identity */}
      <div className="mb-6">
        <p className="mb-1 text-sm font-medium text-primary">{ZONE_DOMAIN}</p>
        <h1 className="text-2xl font-bold text-black dark:text-white">
          {ZONE_LABEL}
        </h1>
        <p className="mt-2 text-sm text-body-color">
          Zone is live. Edit{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm dark:bg-dark-2">
            src/zones/{ZONE_KEY}/Page.tsx
          </code>{" "}
          to build the dashboard home.
        </p>
      </div>

      {/* Placeholder stat cards — replace with real data */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {["Metric A", "Metric B", "Metric C", "Metric D"].map((label) => (
          <div
            key={label}
            className="rounded-lg border border-stroke bg-white p-5 shadow-sm dark:border-dark-3 dark:bg-dark"
          >
            <p className="text-sm text-body-color">{label}</p>
            <p className="mt-2 text-2xl font-bold text-black dark:text-white">—</p>
          </div>
        ))}
      </div>

__ZONE_DS_SECTION__
    </div>
  );
}
