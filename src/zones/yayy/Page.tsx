// src/zones/yayy/Page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Yayy zone  ·  yayy.unenter.live
//
// LAYOUT SHELL
// The header, footer, overlays, theme, and dark/light switching are all
// handled automatically — you never import them here.  The shell for this
// zone is controlled by the NEXT_PUBLIC_ZONE="yayy" override in
//   src/components/Layouts/routeClassifier.ts
//
// DESIGN SYSTEM
// Every CSS variable, design token, and component from the core is available:
//   import { Button } from "@/components/ui/button";
//   import SomeWidget from "@/components/YourComponent";
// globals.css is inherited from the core at build time — no zone stylesheet needed.
//
// START BUILDING
// Delete everything inside <main> below and build your page.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link             from "next/link";

export const metadata: Metadata = {
  title:       "Yayy | Unenter",
  description: "Yayy — yayy.unenter.live",
};

export default function YayyPage() {
  return (
    <main>
      <section className="py-20 md:py-28 lg:py-32">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">

            {/* Live indicator */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              yayy.unenter.live
            </div>

            <h1 className="mb-3 text-4xl font-bold leading-tight text-black dark:text-white sm:text-5xl">
              Welcome to Yayy
            </h1>

            <p className="mb-8 text-base leading-relaxed text-body-color">
              Your new Unenter zone is live. Modify this page however you like —
              it&apos;s just a starting point.
            </p>

            <div className="rounded-lg border border-stroke bg-white p-5 text-left dark:border-dark-3 dark:bg-dark">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-body-color/60">
                Your page file
              </p>
              <code className="block text-sm text-black dark:text-white">
                src/zones/yayy/Page.tsx
              </code>
              <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wider text-body-color/60">
                Shared components (design system)
              </p>
              <code className="block text-sm text-black dark:text-white">
                @/components/&hellip;
              </code>
              <p className="mt-2 text-xs text-body-color/70">
                All of <code>src/components/</code> is available — use the core
                design system or drop in your own.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ── Dynamic sections ────────────────────────────────────────────────── */}
      <section className="py-12 md:py-16">
        <div className="container">
          <h2 className="mb-8 text-2xl font-bold text-black dark:text-white">Sections</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Link href="/" className="group flex flex-col gap-2 rounded-lg border border-stroke bg-white p-5 transition hover:border-primary hover:shadow-md dark:border-dark-3 dark:bg-dark">
        <p className="font-semibold text-black transition group-hover:text-primary dark:text-white">Posts / Pages</p>
        <p className="text-sm text-body-color">/[slug]            — blog posts or CMS pages</p>
      </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
