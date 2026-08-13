// src/scripts/verify-trust-badges-content.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey!);

async function run() {
  const { data, error } = await supabase
    .from("static_pages")
    .select("slug, title, updated_at, content")
    .eq("slug", "labs-trust-badges")
    .single();

  if (error) {
    console.error("Error fetching labs-trust-badges:", error.message);
  } else {
    console.log("=== VERIFYING LABS-TRUST-BADGES ===");
    console.log(`Slug: ${data.slug}`);
    console.log(`Title: ${data.title}`);
    console.log(`Updated At: ${data.updated_at}`);
    console.log("Content:\n", data.content);
  }
}

run();
