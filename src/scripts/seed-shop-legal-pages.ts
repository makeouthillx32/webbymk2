// src/scripts/seed-shop-legal-pages.ts
// ─────────────────────────────────────────────────────────────────────────────
// Upserts Shop's (apparel) own shipping + returns pages into static_pages with
// zone_key='shop'. Source of truth: src/zones/shop/legal/*.html (the leading
// <!-- … --> authoring note is stripped). Never touches another zone's rows.
//
//   bun src/scripts/seed-shop-legal-pages.ts
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || "https://db.unenter.live";
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export const SHOP_LEGAL_PAGES = [
  {
    slug: "shipping",
    file: "shipping.html",
    title: "Shipping Policy",
    meta_description: "How Unenter boutique apparel orders ship, delivery estimates, and free shipping on domestic orders over $75.",
    meta_keywords: ["shipping", "delivery", "USPS", "free shipping", "boutique apparel"],
  },
  {
    slug: "returns",
    file: "returns.html",
    title: "Returns & Exchanges",
    meta_description: "Easy returns and exchanges on boutique apparel within 30 days.",
    meta_keywords: ["returns", "exchanges", "refunds", "boutique apparel", "30 days"],
  },
] as const;

export const SHOP_LEGAL_DIR = path.join(process.cwd(), "src", "zones", "shop", "legal");

/** Page HTML as stored: the file minus its leading authoring comment. */
export function readShopLegalHtml(file: string): string {
  const raw = fs.readFileSync(path.join(SHOP_LEGAL_DIR, file), "utf8");
  return raw.replace(/^﻿?\s*<!--[\s\S]*?-->\s*/, "").replace(/\r\n/g, "\n").trim() + "\n";
}

async function main() {
  if (!SERVICE_ROLE_KEY) {
    console.error("Missing SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  for (const page of SHOP_LEGAL_PAGES) {
    const content = readShopLegalHtml(page.file);
    const { data: existing } = await supabase
      .from("static_pages")
      .select("id, version")
      .eq("zone_key", "shop")
      .eq("slug", page.slug)
      .maybeSingle();

    const { error } = await supabase.from("static_pages").upsert(
      {
        zone_key: "shop",
        slug: page.slug,
        title: page.title,
        content,
        content_format: "html",
        meta_description: page.meta_description,
        meta_keywords: [...page.meta_keywords],
        is_published: true,
        published_at: now,
        updated_at: now,
        version: (existing?.version ?? 0) + 1,
      },
      { onConflict: "zone_key,slug" },
    );
    if (error) {
      console.error(`shop/${page.slug}: ${error.message}`);
      process.exitCode = 1;
    } else {
      console.log(`shop/${page.slug}: upserted (v${(existing?.version ?? 0) + 1})`);
    }
  }
}

if (import.meta.main) {
  void main();
}
