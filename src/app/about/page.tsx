import { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import Breadcrumb from "@/components/Common/Breadcrumb";
import SectionTitle from "@/components/Common/SectionTitle";
import ImageAccordion from "@/components/Common/ImageAccordion";

export const metadata: Metadata = {
  // other metadata
};

// ── Fetch about page copy from Supabase ───────────────────────────────────────

async function fetchAboutContent(locale: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("homepage_content")
    .select("json")
    .eq("key", "about_page")
    .single();

  const translations = data?.json?.translations ?? {};
  const t = translations[locale] ?? translations["de"] ?? {};

  return {
    title:       t.title       ?? "",
    paragraph:   t.paragraph   ?? "",
    description: t.description ?? "",
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AboutPage() {
  // Read locale from cookie (set by middleware / locale switcher)
  const cookieStore = await cookies();
  const locale = (cookieStore.get("Next-Locale")?.value ?? "de") as string;

  const content = await fetchAboutContent(locale);

  return (
    <>
      <Breadcrumb pageName={content.title} description={content.paragraph} />

      <section
        id="uber-uns"
        className="relative bg-gray-light py-16 dark:bg-bg-color-dark md:py-20 lg:py-28"
      >
        <div className="container">
          <SectionTitle
            title=""
            paragraph={content.description}
            width="full"
            center
          />
          <ImageAccordion locale={locale} />
        </div>
      </section>
    </>
  );
}
