// src/scripts/view-user-sections.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey!);

async function run() {
  const { data } = await supabase
    .from("static_pages")
    .select("slug, title, content")
    .in("slug", ["labs-excellence-trust", "labs-trust-badges", "wholesale-promo"]);

  data?.forEach((p) => {
    console.log(`\n=== SLUG: ${p.slug} (${p.title}) ===\n`);
    console.log(p.content);
  });
}

run();
