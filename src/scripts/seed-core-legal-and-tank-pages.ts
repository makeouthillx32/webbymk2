import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  console.log("=== 1. Reading HTML files ===");
  const fbPath = path.join(__dirname, "pages", "facebook-data-deletion.html");
  const shieldPath = path.join(__dirname, "pages", "shield-privacy-policy.html");
  const tankPath = path.join(__dirname, "pages", "tank-callout.html");

  const fbHtml = fs.readFileSync(fbPath, "utf8");
  const shieldHtml = fs.readFileSync(shieldPath, "utf8");
  const tankHtml = fs.readFileSync(tankPath, "utf8");

  console.log(`- Facebook Data Deletion HTML: ${fbHtml.length} bytes`);
  console.log(`- Shield Privacy Policy HTML: ${shieldHtml.length} bytes`);
  console.log(`- Tank Callout HTML: ${tankHtml.length} bytes`);

  console.log("\n=== 2. Upserting into static_pages ===");
  const pagesToUpsert = [
    {
      slug: "facebook-data-deletion",
      title: "Facebook Data Deletion Policy",
      content: fbHtml,
      content_format: "html",
      meta_description: "Instructions and automated mechanisms for Facebook users to request data deletion under Meta platform policies.",
      meta_keywords: ["Facebook", "Meta", "data deletion", "privacy policy", "user rights", "GDPR", "account deletion"],
      is_published: true,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      slug: "shield-privacy-policy",
      title: "Unenter Edge Shield Privacy Policy",
      content: shieldHtml,
      content_format: "html",
      meta_description: "Privacy policy and security disclosure for Unenter Edge Shield (UES) anti-bot challenge and DDoS protection.",
      meta_keywords: ["Edge Shield", "bot challenge", "turnstile alternative", "privacy", "proof of work", "security", "DDoS protection"],
      is_published: true,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      slug: "tank-callout",
      title: "Tank Callout",
      content: tankHtml,
      content_format: "html",
      meta_description: "Step inside the interactive multi-cam house. Chat in real-time, trigger room events with Tavern coins, and watch autonomous AI feeds.",
      meta_keywords: ["tank", "livestream", "24/7", "interactive house", "multi-cam", "tavern coins", "ai director"],
      og_image_url: "https://db.unenter.live/storage/v1/object/public/site-assets/zones/tank/open-graph/1787724040474-f09c43da.jpg",
      is_published: true,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  for (const p of pagesToUpsert) {
    const { data, error } = await supabase
      .from("static_pages")
      .upsert(p, { onConflict: "slug" })
      .select("id, slug, title, is_published");

    if (error) {
      console.error(`Error upserting ${p.slug}:`, error.message);
    } else {
      console.log(`✓ Successfully upserted static page: ${p.slug} (${p.title})`);
    }
  }

  console.log("\n=== 3. Verifying landing_sections ===");
  const { data: finalSections } = await supabase
    .from("landing_sections")
    .select("position, type, is_active, config")
    .eq("page", "home")
    .order("position", { ascending: true });

  console.log("Current home landing sections order:");
  finalSections?.forEach((s) => {
    console.log(`  Position ${s.position}: [${s.type}] ${s.config?.slug} (active: ${s.is_active})`);
  });
}

main().catch(console.error);
