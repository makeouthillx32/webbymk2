// src/scripts/inspect-static-pages.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("=== 1. FETCHING ALL STATIC PAGES ===");
  const { data: pages, error: pageError } = await supabase
    .from("static_pages")
    .select("slug, title, is_published, updated_at, content_format, content")
    .order("updated_at", { ascending: false });

  if (pageError) {
    console.error("Error fetching static pages:", pageError.message);
  } else {
    console.log(`Found ${pages.length} static pages:`);
    pages.forEach((p) => {
      console.log(`\n--- [SLUG: ${p.slug}] (Title: "${p.title}", Updated: ${p.updated_at}) ---`);
      console.log(`Content length: ${p.content?.length ?? 0} chars`);
      console.log(`Content snippet:\n${p.content?.slice(0, 400)}...`);
    });
  }

  console.log("\n=== 2. FETCHING LANDING SECTIONS FOR LABS ===");
  const { data: sections, error: secError } = await supabase
    .from("landing_sections")
    .select("*")
    .eq("page", "labs")
    .order("position", { ascending: true });

  if (secError) {
    console.error("Error fetching landing sections:", secError.message);
  } else {
    console.log(`Found ${sections.length} landing sections for page='labs':`);
    sections.forEach((s) => {
      console.log(`Position ${s.position}: type=${s.type}, enabled=${s.is_enabled}, config=${JSON.stringify(s.config)}`);
    });
  }
}

run();
