// src/scripts/update-mobile-layouts.ts
//
// Updates all static HTML landing sections in Supabase to display clean,
// compact 2-column mobile grids matching Explore Catalog.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// 1. Updated "Our Big Kits" (2-column grid on mobile)
const ourBigKitsHtml = `<!-- Our Big Kits Landing Section (2-Column Mobile Grid) -->
<style>
  .our-big-kits-block * { box-sizing: border-box; }
  
  .our-big-kits-block {
    padding: 2.25rem 1.5rem;
    background: linear-gradient(135deg, hsl(var(--primary) / 12%) 0%, hsl(var(--card)) 55%, hsl(var(--secondary) / 14%) 100%);
    border: 1px solid hsl(var(--primary) / 28%);
    border-radius: calc(var(--radius) * 3);
    margin: 1.5rem 0;
  }

  .our-big-kits-block .kits-header {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .our-big-kits-block .kits-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.9rem;
    border-radius: 9999px;
    background: hsl(var(--primary) / 16%);
    color: hsl(var(--primary));
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }

  .our-big-kits-block .kits-title {
    font-family: var(--font-family-base);
    font-size: 2.15rem;
    font-weight: 900;
    color: hsl(var(--foreground));
    letter-spacing: -0.02em;
    margin-bottom: 0.35rem;
  }

  .our-big-kits-block .kits-subtitle {
    color: hsl(var(--muted-foreground));
    font-size: 0.875rem;
    max-width: 680px;
    margin: 0 auto;
    line-height: 1.5;
  }

  /* Kit Type Tabs */
  .our-big-kits-block .kit-tabs {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }

  .our-big-kits-block .tab-btn {
    padding: 0.5rem 1.1rem;
    border-radius: 9999px;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    color: hsl(var(--muted-foreground));
    font-size: 0.8rem;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .our-big-kits-block .tab-btn:hover {
    color: hsl(var(--foreground));
    border-color: hsl(var(--primary) / 50%);
  }

  .our-big-kits-block .tab-btn.active {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-color: hsl(var(--primary));
  }

  /* Kit Display Panels - 2 Column Mobile Grid */
  .our-big-kits-block .kit-panel {
    display: none;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  @media (min-width: 768px) {
    .our-big-kits-block .kit-panel {
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 1.25rem;
    }
  }

  .our-big-kits-block .kit-panel.active {
    display: grid;
  }

  /* Kit Card */
  .our-big-kits-block .kit-card {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) * 2);
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    text-decoration: none;
    transition: transform 0.2s ease;
  }

  .our-big-kits-block .kit-card:hover {
    transform: translateY(-3px);
    border-color: hsl(var(--primary) / 60%);
  }

  .our-big-kits-block .kit-tag {
    display: inline-block;
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    background: hsl(var(--primary) / 15%);
    color: hsl(var(--primary));
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.5rem;
    width: fit-content;
  }

  .our-big-kits-block .half-tag {
    background: hsl(var(--secondary) / 20%);
    color: hsl(var(--foreground));
  }

  .our-big-kits-block .card-title {
    font-size: 0.9rem;
    font-weight: 800;
    color: hsl(var(--foreground));
    line-height: 1.25;
    margin-bottom: 0.25rem;
  }

  .our-big-kits-block .card-spec {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    margin-bottom: 0.75rem;
    line-height: 1.35;
  }

  .our-big-kits-block .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.5rem;
    border-top: 1px solid hsl(var(--border) / 0.5);
  }

  .our-big-kits-block .card-tier {
    font-size: 0.7rem;
    font-weight: 800;
    color: hsl(var(--muted-foreground));
  }

  .our-big-kits-block .card-cta {
    font-size: 0.725rem;
    font-weight: 800;
    color: hsl(var(--primary));
  }

  @media (max-width: 640px) {
    .our-big-kits-block { padding: 1.25rem 0.75rem; }
    .our-big-kits-block .kits-title { font-size: 1.65rem; }
    .our-big-kits-block .kits-subtitle { font-size: 0.8rem; }
  }
</style>

<div class="our-big-kits-block">
  <div class="kits-header">
    <div class="kits-badge">📦 Bulk Research Tier</div>
    <h2 class="kits-title">Our Big Kits</h2>
    <p class="kits-subtitle">Maximum value for laboratory research. Explore our 10-vial Full Kits and 5-vial Half Kits with tier pricing.</p>
  </div>

  <div class="kit-tabs">
    <button class="tab-btn active" onclick="switchKitTab('all', this)">🔥 All Kits & Half Kits</button>
    <button class="tab-btn" onclick="switchKitTab('full-kits', this)">📦 10-Vial Full Kits</button>
    <button class="tab-btn" onclick="switchKitTab('half-kits', this)">✨ 5-Vial Half Kits</button>
  </div>

  <div id="kit-all" class="kit-panel active">
    <a href="/search?q=ghk" class="kit-card">
      <div>
        <span class="kit-tag">📦 10-Vial Kit</span>
        <div class="card-title">GHK-Cu 500mg Kit</div>
        <div class="card-spec">10x 50mg Vials • 99%+ HPLC</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Full Kit</span>
        <span class="card-cta">View →</span>
      </div>
    </a>

    <a href="/search?q=ghk" class="kit-card">
      <div>
        <span class="kit-tag half-tag">✨ 5-Vial Kit</span>
        <div class="card-title">GHK-Cu 250mg Half</div>
        <div class="card-spec">5x 50mg Vials • Starter Bundle</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Half Kit</span>
        <span class="card-cta">View →</span>
      </div>
    </a>

    <a href="/search?q=bpc" class="kit-card">
      <div>
        <span class="kit-tag">📦 10-Vial Kit</span>
        <div class="card-title">BPC-157 50mg Kit</div>
        <div class="card-spec">10x 5mg Vials • Bulk Tier</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Full Kit</span>
        <span class="card-cta">View →</span>
      </div>
    </a>

    <a href="/search?q=bpc" class="kit-card">
      <div>
        <span class="kit-tag half-tag">✨ 5-Vial Kit</span>
        <div class="card-title">BPC-157 25mg Half</div>
        <div class="card-spec">5x 5mg Vials • High Purity</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Half Kit</span>
        <span class="card-cta">View →</span>
      </div>
    </a>
  </div>

  <div id="kit-full-kits" class="kit-panel">
    <a href="/search?q=ghk" class="kit-card">
      <div>
        <span class="kit-tag">📦 10-Vial Kit</span>
        <div class="card-title">GHK-Cu 500mg Kit</div>
        <div class="card-spec">10x 50mg Vials • Volume Tier</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Full Kit</span>
        <span class="card-cta">View →</span>
      </div>
    </a>

    <a href="/search?q=bpc" class="kit-card">
      <div>
        <span class="kit-tag">📦 10-Vial Kit</span>
        <div class="card-title">BPC-157 50mg Kit</div>
        <div class="card-spec">10x 5mg Vials • Bulk Compound</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Full Kit</span>
        <span class="card-cta">View →</span>
      </div>
    </a>
  </div>

  <div id="kit-half-kits" class="kit-panel">
    <a href="/search?q=ghk" class="kit-card">
      <div>
        <span class="kit-tag half-tag">✨ 5-Vial Kit</span>
        <div class="card-title">GHK-Cu 250mg Half</div>
        <div class="card-spec">5x 50mg Vials • Starter Bundle</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Half Kit</span>
        <span class="card-cta">View →</span>
      </div>
    </a>

    <a href="/search?q=bpc" class="kit-card">
      <div>
        <span class="kit-tag half-tag">✨ 5-Vial Kit</span>
        <div class="card-title">BPC-157 25mg Half</div>
        <div class="card-spec">5x 5mg Vials • High Purity</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Half Kit</span>
        <span class="card-cta">View →</span>
      </div>
    </a>
  </div>
</div>

<script>
  function switchKitTab(typeId, btnEl) {
    var panels = document.querySelectorAll('.our-big-kits-block .kit-panel');
    panels.forEach(function(p) { p.classList.remove('active'); });

    var btns = document.querySelectorAll('.our-big-kits-block .tab-btn');
    btns.forEach(function(b) { b.classList.remove('active'); });

    var targetPanel = document.getElementById('kit-' + typeId);
    if (targetPanel) targetPanel.classList.add('active');
    if (btnEl) btnEl.classList.add('active');
  }
</script>`;

// 2. Updated "Labs Excellence You Can Trust" (2-column card grid on mobile)
const labsExcellenceHtml = `<!-- Excellence You Can Trust: 2-column mobile card grid matching Explore Catalog -->
<div class="p-4 sm:p-8 md:p-12" style="background: hsl(var(--secondary) / 14%); border: 1px solid hsl(var(--secondary) / 30%); border-radius: calc(var(--radius) * 3);">
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12 items-center">

  <div>
    <h2 class="font-serif text-2xl sm:text-4xl font-bold leading-tight text-[hsl(var(--foreground))] mb-3 sm:mb-5">Excellence You Can Trust</h2>
    <p class="text-xs sm:text-base text-[hsl(var(--muted-foreground))] leading-relaxed max-w-md">At Unenter Labs, quality is our promise. Each peptide is carefully refined and tested to ensure purity and consistency.</p>
  </div>

  <!-- 2 Column Mobile Grid for Cards -->
  <div class="grid grid-cols-2 gap-3 sm:gap-5">
    <div class="border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:p-6 text-center rounded-2xl">
      <div class="mb-2 flex justify-center text-[hsl(var(--primary))]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/>
          <path d="M6.453 15h11.094"/>
          <path d="M8.5 2h7"/>
        </svg>
      </div>
      <h3 class="font-bold text-xs sm:text-lg text-[hsl(var(--foreground))] mb-1">Ultra-Pure Peptides</h3>
      <p class="text-[10px] sm:text-sm text-[hsl(var(--muted-foreground))]">HPLC & Mass-Spec tested.</p>
    </div>

    <div class="border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:p-6 text-center rounded-2xl">
      <div class="mb-2 flex justify-center text-[hsl(var(--primary))]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
      </div>
      <h3 class="font-bold text-xs sm:text-lg text-[hsl(var(--foreground))] mb-1">Scientific Transparency</h3>
      <p class="text-[10px] sm:text-sm text-[hsl(var(--muted-foreground))]">Full COA lab reports.</p>
    </div>

    <div class="border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:p-6 text-center rounded-2xl">
      <div class="mb-2 flex justify-center text-[hsl(var(--primary))]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </div>
      <h3 class="font-bold text-xs sm:text-lg text-[hsl(var(--foreground))] mb-1">Custom Synthesis</h3>
      <p class="text-[10px] sm:text-sm text-[hsl(var(--muted-foreground))]">Tailored sequences.</p>
    </div>

    <div class="border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:p-6 text-center rounded-2xl">
      <div class="mb-2 flex justify-center text-[hsl(var(--primary))]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9 10 2 2 4-4"/>
          <rect width="20" height="14" x="2" y="3" rx="2"/>
          <path d="M12 17v4"/>
          <path d="M8 21h8"/>
        </svg>
      </div>
      <h3 class="font-bold text-xs sm:text-lg text-[hsl(var(--foreground))] mb-1">Quality Control</h3>
      <p class="text-[10px] sm:text-sm text-[hsl(var(--muted-foreground))]">Strict batch purity.</p>
    </div>
  </div>

</div>
</div>`;

// 3. Updated "Labs Trust Badges" (3-column grid on mobile)
const trustBadgesHtml = `<!-- Trust Badges: 3-column horizontal grid on mobile -->
<div class="p-4 sm:p-8" style="background: hsl(var(--primary) / 12%); border: 1px solid hsl(var(--primary) / 28%); border-radius: calc(var(--radius) * 3);">
  <div class="grid grid-cols-3 gap-2 sm:gap-6 text-center">

    <div class="flex flex-col items-center">
      <div class="mb-1 text-[hsl(var(--primary))]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
      </div>
      <h3 class="font-bold text-[11px] sm:text-base text-[hsl(var(--foreground))] mb-0.5">3rd Party Tested</h3>
      <p class="text-[9px] sm:text-xs text-[hsl(var(--muted-foreground))]">HPLC & MS Verified</p>
    </div>

    <div class="flex flex-col items-center">
      <div class="mb-1 text-[hsl(var(--primary))]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <h3 class="font-bold text-[11px] sm:text-base text-[hsl(var(--foreground))] mb-0.5">Secure Checkout</h3>
      <p class="text-[9px] sm:text-xs text-[hsl(var(--muted-foreground))]">256-Bit SSL Encrypted</p>
    </div>

    <div class="flex flex-col items-center">
      <div class="mb-1 text-[hsl(var(--primary))]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
          <path d="M15 18H9"/>
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
          <circle cx="17" cy="18" r="2"/>
          <circle cx="7" cy="18" r="2"/>
        </svg>
      </div>
      <h3 class="font-bold text-[11px] sm:text-base text-[hsl(var(--foreground))] mb-0.5">Fast Shipping</h3>
      <p class="text-[9px] sm:text-xs text-[hsl(var(--muted-foreground))]">Same-Day Dispatch</p>
    </div>

  </div>
</div>`;

async function run() {
  console.log("Updating static pages with 2-column mobile grid layouts...");

  const updates = [
    { slug: "our-big-kits", content: ourBigKitsHtml },
    { slug: "labs-excellence-trust", content: labsExcellenceHtml },
    { slug: "labs-trust-badges", content: trustBadgesHtml },
  ];

  for (const item of updates) {
    const { error } = await supabase
      .from("static_pages")
      .update({ content: item.content, updated_at: new Date().toISOString() })
      .eq("slug", item.slug);

    if (error) {
      console.error(`❌ Error updating ${item.slug}:`, error.message);
    } else {
      console.log(`✓ Updated ${item.slug} for 2-column mobile layout!`);
    }
  }
}

run();
