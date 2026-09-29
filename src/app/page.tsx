import ScrollUp from "@/components/Common/ScrollUp";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { fetchHomeContent } from "@/data/fetchHomeContent";
import InteractiveBanner from "@/components/Landing/InteractiveBanner";
import { getSiteAssets, LANDING_ASSETS } from "@/lib/siteAssets";
import { createServerClient } from "@/utils/supabase/server";
import { SectionComponents } from "@/components/shop/sections/SectionRegistry";

export const metadata: Metadata = {
  title: "Unenter | Home",
  description: "Explore Unenter's projects, live streams, and community.",
};

export default async function Home() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("Next-Locale")?.value ?? "en";
  const content = await fetchHomeContent(locale);

  // Fetch dynamic sections specifically assigned to the "home" page
  const supabase = await createServerClient();
  const { data: sectionsData } = await supabase
    .from("landing_sections")
    .select("*")
    .eq("page", "home")
    .eq("is_active", true)
    .order("position", { ascending: true });

  const sections = sectionsData || [];

  // If the editor has placed the 3D banner as a section, that row owns it and
  // the hardcoded hero below is suppressed — see the note at its JSX.
  const hasHero3dSection = sections.some(
    (s: { type?: string; is_active?: boolean }) => s.type === "hero_3d"
  );

  // Hot-swappable landing assets. Falls back to the known storage URLs when the
  // registry has no active row, so an empty table is never a blank hero.
  const landingAssets = await getSiteAssets("core-landing", {
    "hero.video.webm": LANDING_ASSETS.heroVideoWebm,
    "banner.backdrop.webm": LANDING_ASSETS.bannerBackdropWebm,
    "banner.model.glb": LANDING_ASSETS.bannerModelGlb,
  });

  return (
    <>
      <ScrollUp />

      {/* Video Background Wrapping Interactive Scene.

          Rendered here ONLY when the landing has no `hero_3d` section row.
          The banner is now available as a positionable section, so without
          this guard adding one to Home Heroes would render TWO 3D scenes —
          two <Canvas> contexts, two GLB downloads, and a visibly duplicated
          hero. The moment a hero_3d row exists it owns the banner and this
          hardcoded copy steps aside, which is also what makes the section
          able to move above/below other sections. */}
      {!hasHero3dSection && (
        <section className="relative z-10 overflow-hidden">
          <div className="absolute inset-0 -z-10 w-full h-full">
            <video
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              className="absolute inset-0 w-full h-full object-cover opacity-30"
            >
              <source src={landingAssets["hero.video.webm"]} type="video/webm" />
            </video>
          </div>

          {/* Interactive 3D Scene (Now contains head and foot spacing natively) */}
          <InteractiveBanner
            backdropSrc={landingAssets["banner.backdrop.webm"]}
            modelSrc={landingAssets["banner.model.glb"]}
          />
        </section>
      )}

      {/* Dynamic Landing Sections */}
      <div className="dynamic-home-sections flex flex-col w-full">
        {sections.map((section) => {
          const Component = SectionComponents[section.type];
          if (!Component) {
            console.warn(`[Landing] Unknown section type on home: ${section.type}`);
            return null;
          }
          return <Component key={section.id} section={section} />;
        })}
      </div>
    </>
  );
}
