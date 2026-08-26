import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import Breadcrumb from "@/components/Common/Breadcrumb";

export const metadata: Metadata = {
  title: "Privacy Policy | UNENTER",
  description: "Privacy Policy and User Data Deletion Instructions for UNENTER.",
};

async function fetchPrivacyContent() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("homepage_content")
      .select("json")
      .eq("key", "privacy_policy")
      .maybeSingle();

    return data?.json || null;
  } catch (err) {
    console.error("[PrivacyPage] Failed to fetch privacy content:", err);
    return null;
  }
}

export default async function PrivacyPage() {
  const content = await fetchPrivacyContent();

  const title = content?.title || "Privacy Policy";
  const lastUpdated = content?.last_updated || "August 2026";
  const sections = content?.sections || [
    {
      title: "1. Information We Collect",
      content:
        "When you authenticate with our platform using third-party services (such as Google or Facebook), we collect your public profile information (name, avatar) and email address solely to create and manage your user account.",
    },
    {
      title: "2. How We Use Your Information",
      content:
        "We use your account data to provide access to our interactive livestream rooms, chat system, user profiles, and personalized platform features. We do not sell your personal information to third parties.",
    },
    {
      title: "3. Data Retention & Third-Party Authentication",
      content:
        "Authentication tokens and profile information obtained from Facebook/Meta or Google are stored securely in our database and used strictly for authentication and session management.",
    },
    {
      title: "4. User Data Deletion Instructions",
      id: "data-deletion",
      content:
        "In accordance with Facebook Platform rules and data privacy regulations, you have the right to request the deletion of your personal data at any time. To request deletion: 1. Visit your Account settings on unenter.live or tank.unenter.live and click Delete Account. 2. Alternatively, remove the app via your Facebook Settings -> Apps and Websites -> Remove. 3. Or send an email to support@unenter.live with your account email and your data will be permanently removed within 48 hours.",
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
                <div key={idx} id={sec.id || undefined} className="scroll-mt-24">
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
