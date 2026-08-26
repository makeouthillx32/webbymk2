// src/scripts/add-highlight-family-section.ts
//
// "Highlight Family" interactive landing section.
// Features compound family tabs (GHK-Cu, BPC-157, CJC-1295 / Ipamorelin, NAD+ & Longevity)
// displaying all available forms (Vials, Nasal Sprays, Drops, Multi-Vial Kits) with
// theme-driven gradient panels and glass cards.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const highlightFamilyHtml = `<!-- Highlight Family Interactive Section -->
<style>
  .highlight-family-block * { box-sizing: border-box; }
  
  .highlight-family-block {
    padding: 2.5rem 2rem;
    background: linear-gradient(135deg, hsl(var(--primary) / 10%) 0%, hsl(var(--card)) 50%, hsl(var(--secondary) / 12%) 100%);
    border: 1px solid hsl(var(--primary) / 25%);
    border-radius: calc(var(--radius) * 3);
    margin: 2rem 0;
  }

  .highlight-family-block .family-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .highlight-family-block .family-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 1.1rem;
    border-radius: 9999px;
    background: hsl(var(--primary) / 15%);
    color: hsl(var(--primary));
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 0.75rem;
  }

  .highlight-family-block .family-title {
    font-family: var(--font-family-base);
    font-size: 2.25rem;
    font-weight: 900;
    color: hsl(var(--foreground));
    letter-spacing: -0.02em;
    margin-bottom: 0.5rem;
  }

  .highlight-family-block .family-subtitle {
    color: hsl(var(--muted-foreground));
    font-size: 0.95rem;
    max-width: 650px;
    margin: 0 auto;
  }

  /* Family Tabs */
  .highlight-family-block .family-tabs {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 2rem;
  }

  .highlight-family-block .tab-btn {
    padding: 0.65rem 1.4rem;
    border-radius: 9999px;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    color: hsl(var(--muted-foreground));
    font-size: 0.875rem;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .highlight-family-block .tab-btn:hover {
    color: hsl(var(--foreground));
    border-color: hsl(var(--primary) / 50%);
  }

  .highlight-family-block .tab-btn.active {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-color: hsl(var(--primary));
    box-shadow: 0 4px 14px hsl(var(--primary) / 35%);
  }

  /* Family Product Display Grid */
  .highlight-family-block .family-panel {
    display: none;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1.25rem;
    animation: familyFadeIn 0.3s ease forwards;
  }

  .highlight-family-block .family-panel.active {
    display: grid;
  }

  @keyframes familyFadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Product Card */
  .highlight-family-block .family-card {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) * 2);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: all 0.25s ease;
    text-decoration: none;
  }

  .highlight-family-block .family-card:hover {
    transform: translateY(-4px);
    border-color: hsl(var(--primary) / 60%);
    box-shadow: 0 12px 28px -8px hsl(var(--foreground) / 10%);
  }

  .highlight-family-block .form-tag {
    display: inline-block;
    padding: 0.25rem 0.65rem;
    border-radius: 6px;
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    font-size: 0.725rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.85rem;
    width: fit-content;
  }

  .highlight-family-block .card-title {
    font-size: 1.05rem;
    font-weight: 800;
    color: hsl(var(--foreground));
    line-height: 1.35;
    margin-bottom: 0.35rem;
  }

  .highlight-family-block .card-spec {
    font-size: 0.825rem;
    color: hsl(var(--muted-foreground));
    margin-bottom: 1.25rem;
  }

  .highlight-family-block .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.85rem;
    border-top: 1px solid hsl(var(--border) / 0.5);
  }

  .highlight-family-block .card-price {
    font-size: 0.95rem;
    font-weight: 900;
    color: hsl(var(--foreground));
  }

  .highlight-family-block .card-cta {
    font-size: 0.8rem;
    font-weight: 800;
    color: hsl(var(--primary));
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  @media (max-width: 640px) {
    .highlight-family-block { padding: 1.75rem 1rem; }
    .highlight-family-block .family-title { font-size: 1.75rem; }
    .highlight-family-block .family-tabs { gap: 0.5rem; }
    .highlight-family-block .tab-btn { padding: 0.5rem 1rem; font-size: 0.775rem; }
  }
</style>

<div class="highlight-family-block">
  <!-- Header -->
  <div class="family-header">
    <div class="family-badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>
      Featured Compound Families
    </div>
    <h2 class="family-title">Explore By Peptide Family</h2>
    <p class="family-subtitle">Select a research compound family to explore all available formulations: lyophilized vials, nasal sprays, sublingual drops, and multi-vial research kits.</p>
  </div>

  <!-- Interactive Family Tabs -->
  <div class="family-tabs">
    <button class="tab-btn active" onclick="switchFamilyTab('ghk-cu', this)">✨ GHK-Cu Family</button>
    <button class="tab-btn" onclick="switchFamilyTab('bpc-157', this)">🧪 BPC-157 Family</button>
    <button class="tab-btn" onclick="switchFamilyTab('cjc-ipam', this)">⚡ CJC-1295 / Ipamorelin</button>
    <button class="tab-btn" onclick="switchFamilyTab('nad-plus', this)">🔬 NAD+ & Longevity</button>
  </div>

  <!-- PANEL 1: GHK-Cu Family -->
  <div id="family-ghk-cu" class="family-panel active">
    <!-- Drops / Sublingual -->
    <a href="/search?q=ghk" class="family-card">
      <div>
        <span class="form-tag" style="background: hsl(var(--primary) / 15%); color: hsl(var(--primary));">💧 Sublingual Drops</span>
        <div class="card-title">GHK-Cu Sublingual Drops</div>
        <div class="card-spec">50mg / 30ml Solution • High Absorption Drops</div>
      </div>
      <div class="card-footer">
        <span class="card-price">View Compound</span>
        <span class="card-cta">Explore →</span>
      </div>
    </a>

    <!-- Nasal Spray -->
    <a href="/search?q=ghk" class="family-card">
      <div>
        <span class="form-tag" style="background: hsl(var(--secondary) / 20%); color: hsl(var(--foreground));">👃 Intranasal Spray</span>
        <div class="card-title">GHK-Cu Nasal Spray</div>
        <div class="card-spec">20mg Intranasal Delivery • Metered Spray</div>
      </div>
      <div class="card-footer">
        <span class="card-price">View Compound</span>
        <span class="card-cta">Explore →</span>
      </div>
    </a>

    <!-- Lyophilized Vial 50mg -->
    <a href="/search?q=ghk" class="family-card">
      <div>
        <span class="form-tag">🧪 Pure Vial (50mg)</span>
        <div class="card-title">GHK-Cu 50mg Vial</div>
        <div class="card-spec">Copper Tripeptide-1 • 99%+ HPLC Certified Purity</div>
      </div>
      <div class="card-footer">
        <span class="card-price">View Compound</span>
        <span class="card-cta">Explore →</span>
      </div>
    </a>

    <!-- Multi-Vial Research Kit -->
    <a href="/search?q=ghk" class="family-card">
      <div>
        <span class="form-tag" style="background: hsl(var(--primary) / 20%); color: hsl(var(--primary));">📦 10-Vial Research Kit</span>
        <div class="card-title">GHK-Cu 500mg Multi-Kit</div>
        <div class="card-spec">10x 50mg Lyophilized Vials • Bulk Research Tier</div>
      </div>
      <div class="card-footer">
        <span class="card-price">View Compound</span>
        <span class="card-cta">Explore →</span>
      </div>
    </a>
  </div>

  <!-- PANEL 2: BPC-157 Family -->
  <div id="family-bpc-157" class="family-panel">
    <a href="/search?q=bpc" class="family-card">
      <div>
        <span class="form-tag">🧪 Pure Vial (5mg)</span>
        <div class="card-title">BPC-157 5mg Vial</div>
        <div class="card-spec">Body Protection Compound • 99%+ Purity</div>
      </div>
      <div class="card-footer">
        <span class="card-price">View Compound</span>
        <span class="card-cta">Explore →</span>
      </div>
    </a>

    <a href="/search?q=bpc" class="family-card">
      <div>
        <span class="form-tag" style="background: hsl(var(--primary) / 15%); color: hsl(var(--primary));">✨ BPC / TB / KPV Blend</span>
        <div class="card-title">BPC-157 / TB-500 / KPV</div>
        <div class="card-spec">10mg/10mg/10mg Synergy Blend Vial</div>
      </div>
      <div class="card-footer">
        <span class="card-price">View Compound</span>
        <span class="card-cta">Explore →</span>
      </div>
    </a>

    <a href="/search?q=bpc" class="family-card">
      <div>
        <span class="form-tag" style="background: hsl(var(--secondary) / 20%); color: hsl(var(--foreground));">👃 Nasal Spray</span>
        <div class="card-title">BPC-157 Nasal Spray</div>
        <div class="card-spec">10mg Metered Intranasal Solution</div>
      </div>
      <div class="card-footer">
        <span class="card-price">View Compound</span>
        <span class="card-cta">Explore →</span>
      </div>
    </a>

    <a href="/search?q=bpc" class="family-card">
      <div>
        <span class="form-tag" style="background: hsl(var(--primary) / 20%); color: hsl(var(--primary));">📦 10-Vial Research Kit</span>
        <div class="card-title">BPC-157 50mg Bulk Kit</div>
        <div class="card-spec">10x 5mg Lyophilized Vials</div>
      </div>
      <div class="card-footer">
        <span class="card-price">View Compound</span>
        <span class="card-cta">Explore →</span>
      </div>
    </a>
  </div>

  <!-- PANEL 3: CJC-1295 / Ipamorelin -->
  <div id="family-cjc-ipam" class="family-panel">
    <a href="/search?q=cjc" class="family-card">
      <div>
        <span class="form-tag">⚡ Blend Vial (10mg)</span>
        <div class="card-title">CJC-1295 / Ipamorelin Blend</div>
        <div class="card-spec">5mg/5mg Synergistic GH Secretagogue</div>
      </div>
      <div class="card-footer">
        <span class="card-price">View Compound</span>
        <span class="card-cta">Explore →</span>
      </div>
    </a>

    <a href="/search?q=cjc" class="family-card">
      <div>
        <span class="form-tag">🧪 CJC-1295 No DAC (5mg)</span>
        <div class="card-title">CJC-1295 No DAC 5mg</div>
        <div class="card-spec">Mod GRF 1-29 • 99%+ HPLC Certified</div>
      </div>
      <div class="card-footer">
        <span class="card-price">View Compound</span>
        <span class="card-cta">Explore →</span>
      </div>
    </a>

    <a href="/search?q=ipamorelin" class="family-card">
      <div>
        <span class="form-tag">🧪 Ipamorelin 5mg</span>
        <div class="card-title">Ipamorelin 5mg Vial</div>
        <div class="card-spec">Selective GH Secretagogue Peptide</div>
      </div>
      <div class="card-footer">
        <span class="card-price">View Compound</span>
        <span class="card-cta">Explore →</span>
      </div>
    </a>
  </div>

  <!-- PANEL 4: NAD+ & Longevity -->
  <div id="family-nad-plus" class="family-panel">
    <a href="/search?q=nad" class="family-card">
      <div>
        <span class="form-tag">🔬 Pure Vial (500mg)</span>
        <div class="card-title">NAD+ 500mg Vial</div>
        <div class="card-spec">Nicotinamide Adenine Dinucleotide</div>
      </div>
      <div class="card-footer">
        <span class="card-price">View Compound</span>
        <span class="card-cta">Explore →</span>
      </div>
    </a>

    <a href="/search?q=ss-31" class="family-card">
      <div>
        <span class="form-tag" style="background: hsl(var(--primary) / 15%); color: hsl(var(--primary));">⚡ Mitochondrial Peptide</span>
        <div class="card-title">SS-31 (Elamipretide) 10mg</div>
        <div class="card-spec">Targeted Mitochondrial Antioxidant</div>
      </div>
      <div class="card-footer">
        <span class="card-price">View Compound</span>
        <span class="card-cta">Explore →</span>
      </div>
    </a>
  </div>
</div>

<script>
  function switchFamilyTab(familyId, btnEl) {
    // Hide all panels
    var panels = document.querySelectorAll('.highlight-family-block .family-panel');
    panels.forEach(function(p) { p.classList.remove('active'); });

    // Deactivate all buttons
    var btns = document.querySelectorAll('.highlight-family-block .tab-btn');
    btns.forEach(function(b) { b.classList.remove('active'); });

    // Activate selected
    var targetPanel = document.getElementById('family-' + familyId);
    if (targetPanel) targetPanel.classList.add('active');
    if (btnEl) btnEl.classList.add('active');
  }
</script>`;

async function run() {
  console.log("1. Upserting highlight-family static page into Database...");

  const { data: pageData, error: pageError } = await supabase
    .from("static_pages")
    .upsert({
      slug: "highlight-family",
      title: "Featured Compound Families",
      content: highlightFamilyHtml,
      content_format: "html",
      is_published: true,
      meta_description: "Explore research compounds by family: GHK-Cu, BPC-157, CJC-1295/Ipamorelin, and NAD+.",
      updated_at: new Date().toISOString()
    }, { onConflict: "slug" })
    .select();

  if (pageError) {
    console.error("❌ Error upserting static page:", pageError.message);
    process.exit(1);
  }

  console.log("✓ Saved static page:", pageData[0].slug);

  console.log("\n2. Inserting highlight-family into landing_sections queue...");
  const { data: existingSections } = await supabase
    .from("landing_sections")
    .select("*")
    .eq("page", "labs")
    .order("position", { ascending: true });

  const hasSection = (existingSections ?? []).some((s: any) => s.config?.slug === "highlight-family");

  if (!hasSection) {
    // Insert at position 4 (right after featured carousel / grid)
    const nextPos = 4;
    
    // Shift positions >= 4 up by 1
    for (const sec of (existingSections ?? [])) {
      if (sec.position >= nextPos) {
        await supabase
          .from("landing_sections")
          .update({ position: sec.position + 1 })
          .eq("id", sec.id);
      }
    }

    const { error: secError } = await supabase
      .from("landing_sections")
      .insert({
        page: "labs",
        type: "static_html",
        position: nextPos,
        config: {
          slug: "highlight-family",
          showTitle: false,
          containerWidth: "contained"
        }
      });

    if (secError) {
      console.error("❌ Error adding section:", secError.message);
    } else {
      console.log(`✓ Inserted highlight-family into landing section queue at position ${nextPos}!`);
    }
  } else {
    console.log("✓ Section highlight-family already exists in queue.");
  }
}

run();
