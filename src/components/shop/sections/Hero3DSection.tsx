// src/components/shop/sections/Hero3DSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// "Interactive 3D Banner (Custom by unenter)" landing section.
//
// FULL replacement for the hero block that used to be hardcoded in
// src/app/page.tsx — not just the 3D scene. That block was three layers:
//
//   <section relative overflow-hidden>
//     <div absolute inset-0 -z-10>  ← 4K hero video, object-cover, opacity-30
//     <InteractiveBanner>           ← starry backdrop + three.js logo scene
//
// The first version of this section rendered only the banner, so dropping it in
// would have silently lost the video backdrop. It now reproduces all three
// layers, which is what makes `page.tsx` able to stand down entirely when a
// hero_3d row exists (see the guard there).
//
// Every asset resolves through the site_assets registry, so the video, the
// backdrop loop and the GLB model are all swappable with no rebuild.
//
// Server component: it does a DB read for the asset URLs and hands them to the
// client banner as props.
//
// config (all optional — the defaults reproduce the old hardcoded look exactly):
//   showVideo      boolean   layer the 4K video behind the scene   (default true)
//   videoOpacity   0–1       strength of that video                (default 0.3)
//   minHeight      string    CSS height for the section            (default auto)
// ─────────────────────────────────────────────────────────────────────────────

import InteractiveBanner, {
  DEFAULT_BACKDROP_SRC,
  DEFAULT_MODEL_SRC,
} from "@/components/Landing/InteractiveBanner";
import { getSiteAssets, LANDING_ASSETS } from "@/lib/siteAssets";
import type { SectionComponentProps } from "./SectionRegistry";

function clamp01(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

export default async function Hero3DSection({ section }: SectionComponentProps) {
  const cfg = section.config ?? {};

  // `page` tells us which landing surface this row belongs to, so the same
  // section type can pull a different backdrop/model per zone later without any
  // code change — labs could ship its own model under 'labs-landing'.
  const scope =
    section.page === "labs"
      ? ("labs-landing" as const)
      : section.page === "shop"
      ? ("shop-landing" as const)
      : ("core-landing" as const);

  const assets = await getSiteAssets(scope, {
    "hero.video.webm": LANDING_ASSETS.heroVideoWebm,
    "banner.backdrop.webm": DEFAULT_BACKDROP_SRC,
    "banner.model.glb": DEFAULT_MODEL_SRC,
  });

  const showVideo = cfg.showVideo !== false; // default on — matches the old hero
  const videoOpacity = clamp01(cfg.videoOpacity, 0.3);
  const minHeight = typeof cfg.minHeight === "string" ? cfg.minHeight : undefined;

  return (
    <section
      className="relative z-10 overflow-hidden"
      style={minHeight ? { minHeight } : undefined}
    >
      {showVideo && (
        <div className="absolute inset-0 -z-10 w-full h-full">
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: videoOpacity }}
          >
            <source src={assets["hero.video.webm"]} type="video/webm" />
          </video>
        </div>
      )}

      {/* Interactive 3D Scene (contains its own head/foot spacing) */}
      <InteractiveBanner
        backdropSrc={assets["banner.backdrop.webm"]}
        modelSrc={assets["banner.model.glb"]}
      />
    </section>
  );
}
