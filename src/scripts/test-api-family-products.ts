// src/scripts/test-api-family-products.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey!);

async function run() {
  console.log("Checking products matching 'ghk'...");
  const { data: ghkData } = await supabase
    .from("research_products")
    .select("id, title, slug")
    .eq("status", "active")
    .ilike("title", "%ghk%");
  console.log(`GHK products count: ${ghkData?.length ?? 0}`);
  ghkData?.forEach((p) => console.log(` - ${p.title}`));

  console.log("\nChecking products matching 'bpc'...");
  const { data: bpcData } = await supabase
    .from("research_products")
    .select("id, title, slug")
    .eq("status", "active")
    .ilike("title", "%bpc%");
  console.log(`BPC products count: ${bpcData?.length ?? 0}`);
  bpcData?.forEach((p) => console.log(` - ${p.title}`));
}

run();
