// src/scripts/test-api-featured-products.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey!);

async function run() {
  console.log("Fetching featured research products from Supabase...");
  const { data: featuredProds, error } = await supabase
    .from("research_products")
    .select("id, title, slug, is_featured, status")
    .eq("status", "active")
    .eq("is_featured", true);

  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log(`Found ${featuredProds.length} active featured products:`);
    featuredProds.forEach((p) => console.log(`- ${p.title} (${p.slug})`));
  }
}

run();
