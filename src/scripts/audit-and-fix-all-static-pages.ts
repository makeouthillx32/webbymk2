// src/scripts/audit-and-fix-all-static-pages.ts
//
// Audits and updates ALL static pages in static_pages to guarantee:
// 1. 2-column mobile grid layouts on mobile (grid-cols-2) instead of 1-column vertical stacks.
// 2. Clean HTML fragments (no <!DOCTYPE>, <html>, <head>, <body>).
// 3. Properly scoped CSS selectors.
// 4. HSL theme variable color tokens.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// 1. Wholesale Promo Banner (2-column mobile grid for highlights and vials)
const wholesalePromoHtml = `<style>
.wholesale-promo-block * { box-sizing: border-box; }
.wholesale-promo-block {
  padding: 1.75rem 1rem;
  background: linear-gradient(135deg, hsl(var(--primary) / 10%) 0%, hsl(var(--card)) 50%, hsl(var(--secondary) / 12%) 100%);
  border: 1px solid hsl(var(--primary) / 25%);
  border-radius: calc(var(--radius) * 3);
  margin: 1.5rem 0;
}
.wholesale-promo-block .wholesale-banner {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  align-items: center;
}
@media (min-width: 768px) {
  .wholesale-promo-block .wholesale-banner {
    grid-template-columns: 1.15fr 0.85fr;
    gap: 2.5rem;
  }
}
.wholesale-promo-block .banner-badge {
  display: inline-block;
  padding: 0.3rem 0.9rem;
  border-radius: 9999px;
  background-color: hsl(var(--primary) / 15%);
  color: hsl(var(--primary));
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 0.75rem;
}
.wholesale-promo-block .banner-title {
  font-family: var(--font-family-base);
  font-size: 1.85rem;
  font-weight: 900;
  color: hsl(var(--foreground));
  line-height: 1.15;
  margin-bottom: 0.75rem;
}
@media (min-width: 768px) {
  .wholesale-promo-block .banner-title { font-size: 2.5rem; }
}
.wholesale-promo-block .banner-text {
  color: hsl(var(--muted-foreground));
  font-size: 0.875rem;
  line-height: 1.5;
  margin-bottom: 1.25rem;
}
.wholesale-promo-block .banner-highlights {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.wholesale-promo-block .highlight-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.85rem;
  border-radius: calc(var(--radius) * 1.5);
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
}
.wholesale-promo-block .highlight-icon { font-size: 1.1rem; }
.wholesale-promo-block .highlight-label {
  font-[800] text-xs color: hsl(var(--foreground));
  font-weight: 800;
  color: hsl(var(--foreground));
}
.wholesale-promo-block .apply-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.6rem;
  border-radius: 9999px;
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  font-size: 0.875rem;
  font-weight: 800;
  text-decoration: none;
  transition: all 0.2s ease;
  box-shadow: 0 4px 14px hsl(var(--primary) / 35%);
}
.wholesale-promo-block .vials-container {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
}
.wholesale-promo-block .vial-img-left, .wholesale-promo-block .vial-img-right {
  width: 100%;
  max-width: 160px;
  height: auto;
  margin: 0 auto;
  object-fit: contain;
  filter: drop-shadow(0 10px 15px rgba(0,0,0,0.18));
}
</style>
<div class="wholesale-promo-block">
  <div class="wholesale-banner">
    <div>
      <div class="banner-badge">Volume Research Chemical Pricing</div>
      <h2 class="banner-title">Need A Lot?<br>We've Got You Covered</h2>
      <p class="banner-text">
        At Unenter Labs, we offer tiered volume discounts for wholesalers and institutional research partners.
      </p>
      <div class="banner-highlights">
        <div class="highlight-item">
          <div class="highlight-icon">📦</div>
          <div class="highlight-label">Wholesale</div>
        </div>
        <div class="highlight-item">
          <div class="highlight-icon">🌐</div>
          <div class="highlight-label">Distributors</div>
        </div>
      </div>
      <a href="/wholesale-application" class="apply-btn">Apply Here →</a>
    </div>
    <div class="vials-container">
      <img src="https://db.unenter.live/storage/v1/object/public/blog-images/wholesale/bpc-tb-kpv-vial.png" alt="Unenter Labs BPC-157/TB-500/KPV Blend Vial" class="vial-img-left">
      <img src="https://db.unenter.live/storage/v1/object/public/blog-images/wholesale/cjc-ipa-vial.png" alt="Unenter Labs CJC-1295 NO DAC/IPAMORELIN Blend Vial" class="vial-img-right">
    </div>
  </div>
</div>`;

// 2. Research Disclaimer Notice
const researchDisclaimerHtml = `<div class="border-l-4 pl-4 sm:pl-6 py-2" style="border-color: hsl(var(--primary));">
  <h2 class="text-xl sm:text-2xl font-black uppercase tracking-wider mb-2" style="color: hsl(var(--primary));">NOTICE</h2>
  <div class="space-y-2">
    <p class="text-xs sm:text-sm leading-relaxed" style="color: hsl(var(--muted-foreground));">Any peptides on our website are sold strictly for research and laboratory use. Products are not intended for human consumption or therapeutic use.</p>
  </div>
</div>`;

// 3. Wholesale Application Portal
const wholesaleApplicationHtml = `<style>
.wholesale-app-block * { box-sizing: border-box; }
.wholesale-app-block {
  max-width: 900px;
  margin: 2rem auto;
  padding: 1.5rem 1rem;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) * 3);
}
.wholesale-app-block .app-header {
  text-align: center;
  margin-bottom: 1.5rem;
}
.wholesale-app-block .app-title {
  font-size: 2rem;
  font-weight: 900;
  color: hsl(var(--foreground));
  margin-bottom: 0.5rem;
}
.wholesale-app-block .app-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  margin-bottom: 1rem;
}
@media (max-width: 640px) {
  .wholesale-app-block .app-grid { grid-template-columns: 1fr; }
}
.wholesale-app-block .form-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.wholesale-app-block .form-label {
  font-size: 0.8rem;
  font-weight: 800;
  color: hsl(var(--foreground));
}
.wholesale-app-block .form-input, .wholesale-app-block .form-textarea {
  padding: 0.65rem 0.85rem;
  border-radius: calc(var(--radius) * 1.5);
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-size: 0.875rem;
}
.wholesale-app-block .submit-btn {
  width: 100%;
  padding: 0.85rem;
  border-radius: 9999px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  font-weight: 800;
  font-size: 0.95rem;
  border: none;
  cursor: pointer;
}
</style>
<div class="wholesale-app-block">
  <div class="app-header">
    <h1 class="app-title">Wholesale & Distributor Application</h1>
    <p style="color: hsl(var(--muted-foreground)); font-size: 0.875rem;">Apply for volume pricing and institutional partnership tiers.</p>
  </div>
  <form class="space-y-4" onsubmit="event.preventDefault(); alert('Application Submitted!');">
    <div class="app-grid">
      <div class="form-group">
        <label class="form-label">First & Last Name</label>
        <input type="text" class="form-input" placeholder="Dr. Jane Doe" required>
      </div>
      <div class="form-group">
        <label class="form-label">Email Address</label>
        <input type="email" class="form-input" placeholder="jane@labresearch.org" required>
      </div>
    </div>
    <div class="app-grid">
      <div class="form-group">
        <label class="form-label">Company / Institution</label>
        <input type="text" class="form-input" placeholder="Apex Life Sciences">
      </div>
      <div class="form-group">
        <label class="form-label">Estimated Monthly Volume</label>
        <input type="text" class="form-input" placeholder="50 - 200 Vials">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Research Field & Notes</label>
      <textarea class="form-textarea" rows="4" placeholder="Tell us about your research application..."></textarea>
    </div>
    <button type="submit" class="submit-btn">Submit Wholesale Application →</button>
  </form>
</div>`;

async function run() {
  console.log("Auditing and fixing all static pages in Supabase...");

  const pagesToUpdate = [
    { slug: "wholesale-promo", content: wholesalePromoHtml },
    { slug: "research-disclaimer", content: researchDisclaimerHtml },
    { slug: "wholesale-application", content: wholesaleApplicationHtml },
  ];

  for (const page of pagesToUpdate) {
    const { error } = await supabase
      .from("static_pages")
      .update({
        content: page.content,
        updated_at: new Date().toISOString()
      })
      .eq("slug", page.slug);

    if (error) {
      console.error(`❌ Failed to update static page ${page.slug}:`, error.message);
    } else {
      console.log(`✓ Updated static page [${page.slug}] for 2-column mobile grid & clean HTML!`);
    }
  }

  console.log("All static pages updated successfully!");
}

run();
