// src/scripts/find-kit-products.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey!);

async function run() {
  console.log("Searching for kit products in Supabase...");

  const { data: products, error } = await supabase
    .from("research_products")
    .select("id, title, slug, price_cents, is_featured")
    .eq("status", "active")
    .or("title.ilike.%kit%,title.ilike.%half%,slug.ilike.%kit%,slug.ilike.%half%");

  if (error) {
    console.error("Error searching products:", error.message);
  } else {
    console.log(`Found ${products.length} kit products:`);
    products.forEach((p) => console.log(`- ${p.title} (slug: ${p.slug}, price: $${p.price_cents / 100})`));
  }
}

run();
