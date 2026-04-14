import ScrollUp from "@/components/Common/ScrollUp";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { fetchHomeContent } from "@/data/fetchHomeContent";
import InteractiveBanner from "@/components/Landing/InteractiveBanner";
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

  return (
    <>
      <ScrollUp />

      {/* Video Background Wrapping Interactive Scene */}
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
            <source src="/video/hero-video.webm" type="video/webm" />
          </video>
        </div>

        {/* Interactive 3D Scene (Now contains head and foot spacing natively) */}
        <InteractiveBanner />
      </section>

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
