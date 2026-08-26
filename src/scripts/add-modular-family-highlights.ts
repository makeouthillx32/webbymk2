// src/scripts/add-modular-family-highlights.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey!);

async function run() {
  console.log("Updating landing_sections queue with modular family_highlight sections...");

  // Delete old static_html highlight-family from landing_sections if present
  const { data: existing } = await supabase
    .from("landing_sections")
    .select("*")
    .eq("page", "labs");

  const staticHighlight = (existing ?? []).find((s: any) => s.config?.slug === "highlight-family");
  if (staticHighlight) {
    console.log("Removing static_html highlight-family from queue...");
    await supabase.from("landing_sections").delete().eq("id", staticHighlight.id);
  }

  // Insert GHK-Cu family highlight
  const ghkSection = {
    page: "labs",
    type: "family_highlight",
    position: 4,
    config: {
      family: "ghk",
      title: "Featured GHK-Cu Compound Family",
      badge: "Highlighted Family",
      description: "Explore all formulations: sublingual drops, intranasal sprays, lyophilized vials, and research kits.",
      limit: 4
    }
  };

  // Insert BPC-157 family highlight
  const bpcSection = {
    page: "labs",
    type: "family_highlight",
    position: 5,
    config: {
      family: "bpc",
      title: "Featured BPC-157 Compound Family",
      badge: "Highlighted Family",
      description: "Explore all Body Protection Compound formulations and synergistic peptide blends.",
      limit: 4
    }
  };

  console.log("Inserting modular family_highlight sections into Supabase...");
  const { data, error } = await supabase
    .from("landing_sections")
    .insert([ghkSection, bpcSection])
    .select();

  if (error) {
    console.error("❌ Error adding modular family highlights:", error.message);
    process.exit(1);
  }

  console.log("✓ Successfully added 2 modular family_highlight sections to landing queue!");
}

run();
