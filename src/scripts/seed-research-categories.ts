// src/scripts/seed-research-categories.ts
//
// Seeds core research categories (Peptides, Blends, Capsules, Drops, Sprays, Lab Supplies)
// and maps all existing research products to their appropriate category in research_product_categories.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const categoriesToSeed = [
  { name: "Peptides", slug: "peptides", position: 1 },
  { name: "Blends", slug: "blends", position: 2 },
  { name: "Capsules", slug: "capsules", position: 3 },
  { name: "Drops", slug: "drops", position: 4 },
  { name: "Sprays", slug: "sprays", position: 5 },
  { name: "Liquid Solutions", slug: "liquid-solutions", position: 6 },
  { name: "Lab Supplies", slug: "lab-supplies", position: 7 },
];

async function run() {
  console.log("1. Upserting research categories into Supabase...");

  const { data: catData, error: catError } = await supabase
    .from("research_categories")
    .upsert(categoriesToSeed, { onConflict: "slug" })
    .select("*");

  if (catError) {
    console.error("❌ Failed to seed research_categories:", catError.message);
    process.exit(1);
  }

  console.log(`✓ Seeded ${catData.length} categories:`, catData.map((c) => `${c.name} (${c.slug})`).join(", "));

  // Create a slug -> id mapping map
  const catMap = new Map<string, string>();
  catData.forEach((c) => catMap.set(c.slug, c.id));

  console.log("\n2. Fetching all active research products...");
  const { data: products, error: prodError } = await supabase
    .from("research_products")
    .select("id, title, slug, description")
    .eq("status", "active");

  if (prodError) {
    console.error("❌ Failed to fetch research_products:", prodError.message);
    process.exit(1);
  }

  console.log(`✓ Found ${products.length} active research products.`);

  // 3. Map products to categories based on title/description/slug rules
  const assignments: { product_id: string; category_id: string }[] = [];

  for (const p of products) {
    const title = p.title.toLowerCase();
    const slug = p.slug.toLowerCase();
    const desc = (p.description ?? "").toLowerCase();
    const text = `${title} ${slug} ${desc}`;

    const productCategories: string[] = [];

    // Rule 1: Blends
    if (text.includes("blend") || title.includes("/") || title.includes("+")) {
      productCategories.push("blends");
    }

    // Rule 2: Capsules
    if (text.includes("capsule") || text.includes("caps")) {
      productCategories.push("capsules");
    }

    // Rule 3: Sprays
    if (text.includes("spray") || text.includes("nasal")) {
      productCategories.push("sprays");
    }

    // Rule 4: Drops / Liquid Solutions
    if (text.includes("drop") || text.includes("liquid") || text.includes("solution") || text.includes("tincture") || text.includes("sublingual")) {
      productCategories.push("drops");
      productCategories.push("liquid-solutions");
    }

    // Rule 5: Lab Supplies
    if (text.includes("water") || text.includes("bac") || text.includes("syringe") || text.includes("vial") || text.includes("filter")) {
      productCategories.push("lab-supplies");
    }

    // Default Rule: Peptides (if not purely lab supplies/capsules/drops or if it's a known peptide compound)
    if (
      productCategories.length === 0 ||
      text.includes("bpc") ||
      text.includes("tb") ||
      text.includes("semaglutide") ||
      text.includes("tirzepatide") ||
      text.includes("cjc") ||
      text.includes("ipamorelin") ||
      text.includes("tesamorelin") ||
      text.includes("sermorelin") ||
      text.includes("aod") ||
      text.includes("nad") ||
      text.includes("mg") ||
      text.includes("mcg")
    ) {
      productCategories.push("peptides");
    }

    // Add unique assigned category IDs for this product
    const uniqueSlugs = [...new Set(productCategories)];
    for (const catSlug of uniqueSlugs) {
      const catId = catMap.get(catSlug);
      if (catId) {
        assignments.push({ product_id: p.id, category_id: catId });
      }
    }
  }

  console.log(`\n3. Inserting ${assignments.length} product-to-category mapping rows...`);

  const { data: mapData, error: mapError } = await supabase
    .from("research_product_categories")
    .upsert(assignments, { onConflict: "product_id,category_id" })
    .select("*");

  if (mapError) {
    console.error("❌ Failed to upsert research_product_categories:", mapError.message);
    process.exit(1);
  }

  console.log(`✓ Successfully assigned ${mapData.length} category mappings across ${products.length} products!`);
}

run();
