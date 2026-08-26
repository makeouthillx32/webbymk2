import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import Breadcrumb from "@/components/Common/Breadcrumb";

export const metadata: Metadata = {
  title: "Terms of Service | UNENTER",
  description: "Terms of Service and Community Guidelines for UNENTER.",
};

async function fetchTermsContent() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("homepage_content")
      .select("json")
      .eq("key", "terms_of_service")
      .maybeSingle();

    return data?.json || null;
  } catch (err) {
    console.error("[TermsPage] Failed to fetch terms content:", err);
    return null;
  }
}

export default async function TermsPage() {
  const content = await fetchTermsContent();

  const title = content?.title || "Terms of Service";
  const lastUpdated = content?.last_updated || "August 2026";
  const sections = content?.sections || [
    {
      title: "1. Acceptance of Terms",
      content:
        "By accessing or using unenter.live and associated services, you agree to be bound by these Terms of Service and all applicable laws and regulations.",
    },
    {
      title: "2. User Conduct & Community Guidelines",
      content:
        "Users must respect all community guidelines. Harassment, unauthorized automated access, spamming, and hate speech are strictly prohibited and will result in immediate account termination.",
    },
    {
      title: "3. Service Availability",
      content:
        "We strive to provide continuous availability of our services but reserve the right to modify or discontinue features with or without notice.",
    },
  ];

  return (
    <>
      <Breadcrumb pageName={title} description={`Last updated: ${lastUpdated}`} />

      <section className="relative bg-gray-light py-16 dark:bg-bg-color-dark md:py-20 lg:py-24">
        <div className="container max-w-4xl mx-auto px-4">
          <div className="rounded-lg bg-white p-8 shadow-sm dark:bg-dark sm:p-12">
            <h1 className="mb-6 text-3xl font-black text-black dark:text-white sm:text-4xl">
              {title}
            </h1>
            <p className="mb-8 text-sm text-body-color dark:text-body-color-dark">
              Effective Date: {lastUpdated}
            </p>

            <div className="space-y-8 text-base leading-relaxed text-body-color dark:text-body-color-dark">
              {sections.map((sec: any, idx: number) => (
                <div key={idx} className="scroll-mt-24">
                  <h2 className="mb-3 text-xl font-bold text-black dark:text-white">
                    {sec.title}
                  </h2>
                  <p className="whitespace-pre-line">{sec.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
