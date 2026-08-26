// src/zones/blog/_components/settings.ts
// Server-side fetch of blog_settings rows (promo band, newsletter copy).

import { createClient } from "@/utils/supabase/server";

export interface PromoSettings {
  enabled: boolean;
  title:   string;
  url:     string;
  image:   string | null;
}

export interface NewsletterSettings {
  enabled: boolean;
  heading: string;
  body:    string;
  success: string;
}

const PROMO_DEFAULTS: PromoSettings = {
  enabled: false, title: "", url: "", image: null,
};

const NEWSLETTER_DEFAULTS: NewsletterSettings = {
  enabled: true,
  heading: "Stay in the Loop",
  body:    "Subscribe to get fresh updates, insights, and exclusive content delivered straight to your inbox. No spam, just great reads.",
  success: "Thanks — you are on the list.",
};

export async function fetchBlogSettings(): Promise<{
  promo: PromoSettings;
  newsletter: NewsletterSettings;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blog_settings")
    .select("key, value")
    .in("key", ["promo", "newsletter"]);

  const map = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));

  return {
    promo:      { ...PROMO_DEFAULTS,      ...((map.get("promo")      as object) ?? {}) },
    newsletter: { ...NEWSLETTER_DEFAULTS, ...((map.get("newsletter") as object) ?? {}) },
  };
}
