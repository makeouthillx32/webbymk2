// src/scripts/revert-trust-badges.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Original Trust Badges HTML before my changes
const originalTrustBadgesHtml = `<!-- Trust Badges: Third Party Tested / Secure Payment / Fast Shipping -->
<div class="p-8 md:p-10" style="background: hsl(var(--primary) / 12%); border: 1px solid hsl(var(--primary) / 28%); border-radius: calc(var(--radius) * 3);">
  <div class="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-6 text-center">

    <div class="flex flex-col items-center">
      <div class="mb-3 text-[hsl(var(--primary))]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
      </div>
      <h3 class="font-serif text-xl font-bold text-[hsl(var(--foreground))] mb-2">3rd Party Tested</h3>
      <p class="text-sm text-[hsl(var(--muted-foreground))]">Every batch is independently verified by US labs for purity, identity, and exact concentration.</p>
    </div>

    <div class="flex flex-col items-center">
      <div class="mb-3 text-[hsl(var(--primary))]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <h3 class="font-serif text-xl font-bold text-[hsl(var(--foreground))] mb-2">Secure Payment</h3>
      <p class="text-sm text-[hsl(var(--muted-foreground))]">End-to-end encrypted checkout protecting your financial and personal research data.</p>
    </div>

    <div class="flex flex-col items-center">
      <div class="mb-3 text-[hsl(var(--primary))]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
          <path d="M15 18H9"/>
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
          <circle cx="17" cy="18" r="2"/>
          <circle cx="7" cy="18" r="2"/>
        </svg>
      </div>
      <h3 class="font-serif text-xl font-bold text-[hsl(var(--foreground))] mb-2">Fast Shipping</h3>
      <p class="text-sm text-[hsl(var(--muted-foreground))]">Same-day processing and discreet temperature-controlled packaging on all orders.</p>
    </div>

  </div>
</div>`;

async function run() {
  console.log("Reverting labs-trust-badges static page to original state...");

  const { error } = await supabase
    .from("static_pages")
    .update({
      content: originalTrustBadgesHtml,
      updated_at: new Date().toISOString()
    })
    .eq("slug", "labs-trust-badges");

  if (error) {
    console.error("❌ Failed to revert labs-trust-badges:", error.message);
    process.exit(1);
  }

  console.log("✓ Successfully reverted labs-trust-badges to its original state!");
}

run();
