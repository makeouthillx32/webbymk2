// src/scripts/upsert-wholesale-pages.ts
//
// Airy, transparent static pages that play off the active page theme background.
// Uses transparent background layers, glassmorphism, and floating vial PNGs.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const vialImage1 = "https://db.unenter.live/storage/v1/object/public/blog-images/wholesale/bpc-tb-kpv-vial.png";
const vialImage2 = "https://db.unenter.live/storage/v1/object/public/blog-images/wholesale/cjc-ipa-vial.png";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Wholesale & Distributor Landing Advertisement Banner (wholesale-promo)
// ─────────────────────────────────────────────────────────────────────────────
const promoHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: transparent; color: var(--foreground); font-family: var(--font-sans); line-height: 1.6; }
    main { max-width: 1200px; width: 100%; margin: 10px auto; padding: 0; }
    
    .wholesale-banner {
      position: relative;
      background: transparent;
      border: none;
      padding: 2.5rem 1rem;
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 2.5rem;
      align-items: center;
    }

    .banner-badge {
      display: inline-block;
      padding: 0.35rem 1.1rem;
      border-radius: 9999px;
      background-color: hsla(var(--primary), 0.12);
      color: hsl(var(--primary));
      font-size: 0.825rem;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 1rem;
    }

    .banner-title {
      font-size: 2.85rem;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: var(--foreground);
      line-height: 1.15;
      margin-bottom: 1.25rem;
    }

    .banner-text {
      color: var(--muted-foreground);
      font-size: 1rem;
      line-height: 1.65;
      max-width: 580px;
      margin-bottom: 2rem;
    }

    .banner-highlights {
      display: flex;
      align-items: center;
      gap: 2.5rem;
      padding-top: 1.25rem;
      padding-bottom: 1.75rem;
      border-top: 1px solid hsla(var(--foreground), 0.12);
      border-bottom: 1px solid hsla(var(--foreground), 0.12);
      margin-bottom: 2rem;
    }

    .highlight-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .highlight-icon {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background-color: hsla(var(--primary), 0.12);
      color: hsl(var(--primary));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
    }

    .highlight-label {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--foreground);
      letter-spacing: -0.01em;
    }

    .apply-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.9rem 2.5rem;
      border-radius: 9999px;
      background-color: hsl(var(--primary));
      color: hsl(var(--primary-foreground));
      font-weight: 800;
      font-size: 0.95rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      text-decoration: none;
      transition: all 0.2s ease;
      box-shadow: 0 6px 20px hsla(var(--primary), 0.35);
      width: fit-content;
    }

    .apply-btn:hover {
      opacity: 0.92;
      transform: translateY(-2px);
      box-shadow: 0 8px 25px hsla(var(--primary), 0.45);
    }

    /* Right Column: Vials Showcase */
    .vials-container {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 320px;
    }

    .vial-img-left {
      width: 220px;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 20px 25px rgba(0, 0, 0, 0.25));
      transform: scale(1.05) translateX(25px);
      z-index: 2;
      transition: transform 0.3s ease;
    }

    .vial-img-right {
      width: 220px;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 20px 25px rgba(0, 0, 0, 0.25));
      transform: scale(1.05) translateX(-25px);
      z-index: 1;
      transition: transform 0.3s ease;
    }

    .vials-container:hover .vial-img-left {
      transform: scale(1.08) translateX(15px);
    }
    .vials-container:hover .vial-img-right {
      transform: scale(1.08) translateX(-15px);
    }

    @media (max-width: 900px) {
      .wholesale-banner {
        grid-template-columns: 1fr;
        padding: 1.5rem 0.5rem;
        gap: 2rem;
      }
      .banner-title { font-size: 2.15rem; }
      .vials-container { min-height: 260px; }
      .vial-img-left, .vial-img-right { width: 170px; }
    }
  </style>
</head>
<body>
  <main>
    <div class="wholesale-banner">
      <!-- Left Info -->
      <div>
        <div class="banner-badge">Volume Research Chemical Pricing</div>
        <h2 class="banner-title">Need A Lot?<br>We've Got You Covered</h2>
        <p class="banner-text">
          At Unenter Labs, we understand the needs of wholesalers and institutional distributors. That's why we offer tiered pricing options, providing significant volume discounts for larger orders. This allows our partners to deliver high-quality research compounds while maintaining a healthy margin.
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

      <!-- Right Vials Showcase (Transparent PNGs) -->
      <div class="vials-container">
        <img src="${vialImage1}" alt="Unenter Labs BPC-157/TB-500/KPV Blend Vial" class="vial-img-left">
        <img src="${vialImage2}" alt="Unenter Labs CJC-1295 NO DAC/IPAMORELIN Blend Vial" class="vial-img-right">
      </div>
    </div>
  </main>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────
// 2. Full Application Page (wholesale-application)
// ─────────────────────────────────────────────────────────────────────────────
const appHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: transparent; color: var(--foreground); font-family: var(--font-sans); line-height: 1.6; }
    
    main {
      max-width: 880px;
      width: 92%;
      margin: 0 auto;
      padding-bottom: 80px;
    }

    .app-hero {
      text-align: center;
      padding: 3rem 1.5rem 2rem;
      background: transparent;
      color: var(--foreground);
    }

    .app-badge {
      display: inline-block;
      padding: 0.35rem 1.1rem;
      border-radius: 9999px;
      background-color: hsla(var(--primary), 0.12);
      color: hsl(var(--primary));
      font-size: 0.8rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 1rem;
    }

    .app-hero h1 {
      font-size: 2.75rem;
      font-weight: 900;
      letter-spacing: -0.02em;
      margin-bottom: 0.5rem;
      color: var(--foreground);
    }

    .app-hero p {
      color: var(--muted-foreground);
      font-size: 1.05rem;
    }

    .app-form-card {
      background-color: hsla(var(--card), 0.5);
      border: 1px solid hsla(var(--border), 0.4);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 1.75rem;
      padding: 3.25rem 2.5rem;
      box-shadow: 0 20px 40px -10px hsla(var(--foreground), 0.05);
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.25rem;
      margin-bottom: 1.25rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .form-group.full {
      grid-column: 1 / -1;
    }

    .form-label {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--foreground);
    }

    .form-label span {
      color: hsl(var(--primary));
    }

    .form-input, .form-select, .form-textarea {
      width: 100%;
      padding: 0.85rem 1rem;
      border-radius: 0.65rem;
      border: 1px solid hsla(var(--border), 0.5);
      background-color: hsla(var(--background), 0.6);
      color: var(--foreground);
      font-family: inherit;
      font-size: 0.925rem;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .form-input:focus, .form-select:focus, .form-textarea:focus {
      border-color: hsl(var(--primary));
      box-shadow: 0 0 0 3px hsla(var(--primary), 0.18);
    }

    .form-textarea {
      resize: vertical;
      min-height: 100px;
    }

    .submit-btn {
      width: 100%;
      padding: 1.1rem;
      border-radius: 9999px;
      border: none;
      background-color: hsl(var(--primary));
      color: hsl(var(--primary-foreground));
      font-size: 1rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 6px 20px hsla(var(--primary), 0.35);
      margin-top: 1rem;
    }

    .submit-btn:hover {
      opacity: 0.92;
      transform: translateY(-1px);
      box-shadow: 0 8px 25px hsla(var(--primary), 0.45);
    }

    .success-alert {
      display: none;
      padding: 1.5rem;
      border-radius: 1rem;
      background-color: hsla(var(--primary), 0.12);
      border: 1px solid hsl(var(--primary));
      color: var(--foreground);
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .success-alert.show { display: block; }

    @media (max-width: 640px) {
      .form-grid { grid-template-columns: 1fr; }
      .app-form-card { padding: 2rem 1.25rem; }
      .app-hero h1 { font-size: 2rem; }
    }
  </style>
</head>
<body>
  <main>
    <div class="app-hero">
      <div class="app-badge">Distributor & Institutional Portal</div>
      <h1>Wholesale Account Application</h1>
      <p>Please fill out the form below and our wholesale team will contact you.</p>
    </div>

    <div class="app-form-card">
      <div id="successAlert" class="success-alert">
        <h3>✅ Application Submitted</h3>
        <p style="font-size: 0.9rem; margin-top: 0.5rem;">Thank you for applying. Our wholesale compliance team will review your business credentials and contact you within 24 hours.</p>
      </div>

      <form id="wholesaleForm">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">First Name <span>*</span></label>
            <input type="text" name="first_name" required class="form-input" placeholder="First Name">
          </div>

          <div class="form-group">
            <label class="form-label">Last Name <span>*</span></label>
            <input type="text" name="last_name" required class="form-input" placeholder="Last Name">
          </div>

          <div class="form-group full">
            <label class="form-label">Company Name <span>*</span></label>
            <input type="text" name="company_name" required class="form-input" placeholder="Company Name">
          </div>

          <div class="form-group full">
            <label class="form-label">Email <span>*</span></label>
            <input type="email" name="email" required class="form-input" placeholder="Email Address">
          </div>

          <div class="form-group">
            <label class="form-label">Mobile <span>*</span></label>
            <input type="tel" name="mobile" required class="form-input" placeholder="+1 (555) 000-0000">
          </div>

          <div class="form-group">
            <label class="form-label">Office Phone</label>
            <input type="tel" name="office_phone" class="form-input" placeholder="+1 (555) 000-0000">
          </div>

          <div class="form-group full">
            <label class="form-label">Business Website</label>
            <input type="url" name="website" class="form-input" placeholder="https://yourcompany.com">
          </div>

          <div class="form-group full">
            <label class="form-label">EIN/TAX ID Number <span>*</span></label>
            <input type="text" name="tax_id" required class="form-input" placeholder="EIN or Tax ID Number">
          </div>

          <div class="form-group full">
            <label class="form-label">Main Business Address <span>*</span></label>
            <input type="text" name="address" required class="form-input" placeholder="Street Address">
          </div>

          <div class="form-group full">
            <label class="form-label">Suite/Unit/Office</label>
            <input type="text" name="suite" class="form-input" placeholder="Suite or Unit Number">
          </div>

          <div class="form-group">
            <label class="form-label">City <span>*</span></label>
            <input type="text" name="city" required class="form-input" placeholder="City">
          </div>

          <div class="form-group">
            <label class="form-label">Zip/Postal Code <span>*</span></label>
            <input type="text" name="zip" required class="form-input" placeholder="Zip/Postal Code">
          </div>

          <div class="form-group">
            <label class="form-label">State/Province <span>*</span></label>
            <input type="text" name="state" required class="form-input" placeholder="State/Province">
          </div>

          <div class="form-group">
            <label class="form-label">Country <span>*</span></label>
            <select name="country" required class="form-select">
              <option value="United States">United States</option>
              <option value="Canada">Canada</option>
              <option value="United Kingdom">United Kingdom</option>
              <option value="Australia">Australia</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div class="form-group full">
            <label class="form-label">How did you hear about us?</label>
            <select name="source" class="form-select">
              <option value="">- Select -</option>
              <option value="Search Engine">Search Engine (Google)</option>
              <option value="Industry Referral">Industry Referral</option>
              <option value="Social Media">Social Media</option>
              <option value="Existing Partner">Existing Partner</option>
            </select>
          </div>
        </div>

        <button type="submit" class="submit-btn">Submit Application</button>
      </form>
    </div>
  </main>

  <script>
    document.getElementById('wholesaleForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const alert = document.getElementById('successAlert');
      const form = document.getElementById('wholesaleForm');
      
      alert.classList.add('show');
      form.reset();
      window.scrollTo({ top: alert.offsetTop - 100, behavior: 'smooth' });
    });
  </script>
</body>
</html>`;

async function run() {
  console.log("Upserting transparent wholesale static pages into Database...");

  const pages = [
    {
      slug: "wholesale-promo",
      title: "Wholesale & Distributor Program Banner",
      content: promoHtml,
      content_format: "html",
      is_published: true,
      meta_description: "Wholesale and institutional distributor program callout banner.",
      updated_at: new Date().toISOString(),
    },
    {
      slug: "wholesale-application",
      title: "Wholesale & Distributor Application",
      content: appHtml,
      content_format: "html",
      is_published: true,
      meta_description: "Apply for direct wholesale pricing and institutional distribution with Unenter Labs.",
      updated_at: new Date().toISOString(),
    }
  ];

  const { data, error } = await supabase
    .from("static_pages")
    .upsert(pages, { onConflict: "slug" })
    .select();

  if (error) {
    console.error("❌ Failed to upsert wholesale pages:", error.message);
    process.exit(1);
  }

  console.log("✓ Successfully updated transparent wholesale static pages:", data.map(p => `${p.slug} (${p.title})`));
}

run();
