// src/scripts/check-labs-landing-active.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey!);

async function run() {
  const { data, error } = await supabase
    .from("landing_sections")
    .select("*")
    .eq("page", "labs")
    .order("position", { ascending: true });

  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log(`Found ${data.length} landing sections for page='labs':`);
    data.forEach((s) => {
      console.log(`Pos ${s.position}: id=${s.id}, type=${s.type}, is_active=${s.is_active}, config=${JSON.stringify(s.config)}`);
    });
  }
}

run();
