// src/scripts/add-wholesale-promo-section.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Adding wholesale-promo section to 'labs' landing queue...");

  const { data: existingSections } = await supabase
    .from("landing_sections")
    .select("*")
    .eq("page", "labs")
    .order("position", { ascending: true });

  const maxPosition = existingSections && existingSections.length > 0 
    ? Math.max(...existingSections.map(s => s.position || 0))
    : 0;

  const promoSection = {
    page: "labs",
    type: "static_html",
    position: maxPosition + 1,
    is_active: true,
    config: {
      slug: "wholesale-promo",
      showTitle: false,
      containerWidth: "contained"
    }
  };

  const { data: inserted, error } = await supabase
    .from("landing_sections")
    .insert([promoSection])
    .select();

  if (error) {
    console.error("❌ Failed to insert wholesale-promo section:", error.message);
    process.exit(1);
  }

  console.log("✓ Successfully added wholesale-promo section to Labs Landing queue:", inserted);
}

run();
