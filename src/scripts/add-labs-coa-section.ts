// src/scripts/add-labs-coa-section.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey!);

const coaHtml = `<!-- COA & Batch Verification Section: Uses exact same theme tokens & soft glass styling -->
<div class="p-8 md:p-12 my-6" style="background: hsl(var(--primary) / 10%); border: 1px solid hsl(var(--primary) / 25%); border-radius: calc(var(--radius) * 3);">
  <div class="flex flex-col lg:flex-row items-center justify-between gap-8 text-center lg:text-left">
    
    <div class="max-w-2xl">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3" style="background: hsl(var(--primary) / 18%); color: hsl(var(--primary));">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
        Full Batch Traceability
      </div>

      <h2 class="font-serif text-3xl md:text-4xl font-bold text-[hsl(var(--foreground))] leading-tight mb-3">
        Independent HPLC & Mass-Spec Testing
      </h2>

      <p class="text-sm md:text-base text-[hsl(var(--muted-foreground))] leading-relaxed">
        Every vial shipped from Unenter Labs includes a unique QR code linked to its batch-specific Certificate of Analysis. Verify purity percentages, net content, and mass spectroscopy reports directly in real time.
      </p>
    </div>

    <div class="flex flex-col sm:flex-row gap-4 shrink-0">
      <a href="/search" class="inline-flex items-center justify-center px-6 py-3.5 rounded-full font-bold text-sm transition-all duration-200 shadow-md" style="background: hsl(var(--primary)); color: hsl(var(--primary-foreground));">
        Browse Lab-Tested Compounds →
      </a>
    </div>

  </div>
</div>`;

async function run() {
  console.log("1. Upserting labs-coa-transparency static page...");

  const { data: pageData, error: pageError } = await supabase
    .from("static_pages")
    .upsert({
      slug: "labs-coa-transparency",
      title: "Batch Verification & HPLC Transparency",
      content: coaHtml,
      content_format: "html",
      is_published: true,
      meta_description: "Verify HPLC and Mass-Spec certificates of analysis for Unenter Labs research compounds.",
      updated_at: new Date().toISOString()
    }, { onConflict: "slug" })
    .select();

  if (pageError) {
    console.error("❌ Error upserting static page:", pageError.message);
    process.exit(1);
  }

  console.log("✓ Saved static page:", pageData[0].slug);

  console.log("\n2. Checking existing landing sections...");
  const { data: existingSections } = await supabase
    .from("landing_sections")
    .select("*")
    .eq("page", "labs")
    .order("position", { ascending: true });

  const hasSection = (existingSections ?? []).some((s: any) => s.config?.slug === "labs-coa-transparency");

  if (!hasSection) {
    const nextPos = (existingSections?.length ?? 0) + 1;
    console.log(`Adding labs-coa-transparency at position ${nextPos}...`);

    const { error: secError } = await supabase
      .from("landing_sections")
      .insert({
        page: "labs",
        type: "static_html",
        position: nextPos,
        config: {
          slug: "labs-coa-transparency",
          showTitle: false,
          containerWidth: "contained"
        }
      });

    if (secError) {
      console.error("❌ Error adding section:", secError.message);
    } else {
      console.log(`✓ Added labs-coa-transparency to landing section queue at pos ${nextPos}!`);
    }
  } else {
    console.log("✓ Section labs-coa-transparency already exists in queue.");
  }
}

run();
