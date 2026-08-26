// src/scripts/add-labs-landing-sections.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Fetching current 'labs' landing sections...");

  const { data: existingSections, error: fetchErr } = await supabase
    .from("landing_sections")
    .select("*")
    .eq("page", "labs")
    .order("position", { ascending: true });

  if (fetchErr) {
    console.error("Failed to fetch existing sections:", fetchErr.message);
    process.exit(1);
  }

  console.log("Current Labs Sections:", existingSections?.map(s => `${s.position}: ${s.type} (${JSON.stringify(s.config)})`));

  const maxPosition = existingSections && existingSections.length > 0 
    ? Math.max(...existingSections.map(s => s.position || 0))
    : 0;

  // 1. Add Featured Products Carousel Bar
  const featuredSection = {
    page: "labs",
    type: "featured_research_carousel",
    position: maxPosition + 1,
    is_active: true,
    config: {
      title: "Featured Products",
      limit: 8
    }
  };

  // 2. Add Research Disclaimer Static Page
  const disclaimerSection = {
    page: "labs",
    type: "static_html",
    position: maxPosition + 2,
    is_active: true,
    config: {
      slug: "research-disclaimer",
      showTitle: false,
      containerWidth: "contained"
    }
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("landing_sections")
    .insert([featuredSection, disclaimerSection])
    .select();

  if (insertErr) {
    console.error("❌ Failed to insert sections:", insertErr.message);
    process.exit(1);
  }

  console.log("✓ Successfully added sections to Labs Landing queue:", inserted);
}

run();
