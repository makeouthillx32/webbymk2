// src/zones/__ZONE_KEY__/Page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// __ZONE_LABEL__ zone  ·  __ZONE_DOMAIN__
// Layout: shop  (ShopHeader + ShopFooter)
//
// This is the root page for the __ZONE_KEY__ zone.
// Edit freely — the shop shell (ShopHeader + ShopFooter) is already applied
// via the routeClassifier override baked into this zone's build.
//
// The shop shell expects isShopRoute: true in routeClassifier, which is set
// for this zone.  Cart, products, collections, and checkout routes are
// scaffolded alongside if you selected them in the wizard.
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
    <main className="py-16 md:py-20 lg:py-28">
      <div className="container">

        {/* Zone identity */}
        <div className="mb-8">
          <p className="mb-2 text-sm font-medium text-primary">{ZONE_DOMAIN}</p>
          <h1 className="text-3xl font-bold text-black dark:text-white">
            {ZONE_LABEL}
          </h1>
          <p className="mt-3 text-body-color">
            Zone is live. Edit{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm dark:bg-dark-2">
              src/zones/{ZONE_KEY}/Page.tsx
            </code>{" "}
            to build the shop homepage.
          </p>
        </div>

      </div>
__ZONE_DS_SECTION__
    </main>
  );
}
