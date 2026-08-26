// src/scripts/mark-featured-compounds.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Updating featured status for top research compounds...");

  // Select 20 popular products by title match or slug
  const popularKeywords = [
    "%bpc%", "%ghk%", "%semaglutide%", "%tirzepatide%", "%cjc%",
    "%ipamorelin%", "%nad%", "%aod%", "%tesamorelin%", "%sermorelin%",
    "%retatrutide%", "%kpv%", "%mots%", "%epithalon%"
  ];

  let updatedCount = 0;

  for (const kw of popularKeywords) {
    const { data, error } = await supabase
      .from("research_products")
      .update({ is_featured: true })
      .ilike("title", kw)
      .eq("status", "active")
      .select("id, title");

    if (!error && data) {
      updatedCount += data.length;
      console.log(`✓ Marked ${data.length} products featured for keyword '${kw}'`);
    }
  }

  console.log(`\n✓ Successfully set is_featured = true for ${updatedCount} top compounds!`);
}

run();
