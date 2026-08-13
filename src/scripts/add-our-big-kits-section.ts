// src/scripts/add-our-big-kits-section.ts
//
// "Our Big Kits" landing section highlighting 10-vial full kits, 5-vial half kits,
// and bulk research bundles with theme-driven glassmorphism styling.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const kitsHtml = `<!-- Our Big Kits Landing Section -->
<style>
  .our-big-kits-block * { box-sizing: border-box; }
  
  .our-big-kits-block {
    padding: 2.75rem 2rem;
    background: linear-gradient(135deg, hsl(var(--primary) / 12%) 0%, hsl(var(--card)) 55%, hsl(var(--secondary) / 14%) 100%);
    border: 1px solid hsl(var(--primary) / 28%);
    border-radius: calc(var(--radius) * 3);
    margin: 2.25rem 0;
    box-shadow: 0 15px 35px -10px hsl(var(--primary) / 10%);
  }

  .our-big-kits-block .kits-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .our-big-kits-block .kits-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 1.1rem;
    border-radius: 9999px;
    background: hsl(var(--primary) / 16%);
    color: hsl(var(--primary));
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 0.75rem;
  }

  .our-big-kits-block .kits-title {
    font-family: var(--font-family-base);
    font-size: 2.5rem;
    font-weight: 900;
    color: hsl(var(--foreground));
    letter-spacing: -0.02em;
    margin-bottom: 0.5rem;
  }

  .our-big-kits-block .kits-subtitle {
    color: hsl(var(--muted-foreground));
    font-size: 0.975rem;
    max-width: 680px;
    margin: 0 auto;
    line-height: 1.6;
  }

  /* Kit Type Tabs */
  .our-big-kits-block .kit-tabs {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 2.25rem;
  }

  .our-big-kits-block .tab-btn {
    padding: 0.65rem 1.5rem;
    border-radius: 9999px;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    color: hsl(var(--muted-foreground));
    font-size: 0.875rem;
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
    box-shadow: 0 4px 14px hsl(var(--primary) / 35%);
  }

  /* Kit Display Panels */
  .our-big-kits-block .kit-panel {
    display: none;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1.35rem;
    animation: kitFadeIn 0.3s ease forwards;
  }

  .our-big-kits-block .kit-panel.active {
    display: grid;
  }

  @keyframes kitFadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Kit Card */
  .our-big-kits-block .kit-card {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: calc(var(--radius) * 2);
    padding: 1.35rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: all 0.25s ease;
    text-decoration: none;
    position: relative;
    overflow: hidden;
  }

  .our-big-kits-block .kit-card:hover {
    transform: translateY(-5px);
    border-color: hsl(var(--primary) / 60%);
    box-shadow: 0 14px 30px -8px hsl(var(--foreground) / 12%);
  }

  .our-big-kits-block .kit-tag {
    display: inline-block;
    padding: 0.28rem 0.7rem;
    border-radius: 6px;
    background: hsl(var(--primary) / 15%);
    color: hsl(var(--primary));
    font-size: 0.725rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.85rem;
    width: fit-content;
  }

  .our-big-kits-block .half-tag {
    background: hsl(var(--secondary) / 20%);
    color: hsl(var(--foreground));
  }

  .our-big-kits-block .card-title {
    font-size: 1.1rem;
    font-weight: 900;
    color: hsl(var(--foreground));
    line-height: 1.35;
    margin-bottom: 0.35rem;
  }

  .our-big-kits-block .card-spec {
    font-size: 0.835rem;
    color: hsl(var(--muted-foreground));
    margin-bottom: 1.25rem;
    line-height: 1.45;
  }

  .our-big-kits-block .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.85rem;
    border-top: 1px solid hsl(var(--border) / 0.5);
  }

  .our-big-kits-block .card-tier {
    font-size: 0.775rem;
    font-weight: 800;
    color: hsl(var(--muted-foreground));
  }

  .our-big-kits-block .card-cta {
    font-size: 0.8rem;
    font-weight: 800;
    color: hsl(var(--primary));
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  @media (max-width: 640px) {
    .our-big-kits-block { padding: 1.75rem 1rem; }
    .our-big-kits-block .kits-title { font-size: 1.85rem; }
    .our-big-kits-block .tab-btn { padding: 0.5rem 1rem; font-size: 0.775rem; }
  }
</style>

<div class="our-big-kits-block">
  <!-- Header -->
  <div class="kits-header">
    <div class="kits-badge">
      📦 Bulk Research Tier
    </div>
    <h2 class="kits-title">Our Big Kits</h2>
    <p class="kits-subtitle">Maximum efficiency and value for high-volume laboratory research. Explore our 10-vial Full Kits and 5-vial Half Kits with tier-discounted pricing and full batch HPLC COAs.</p>
  </div>

  <!-- Interactive Kit Type Tabs -->
  <div class="kit-tabs">
    <button class="tab-btn active" onclick="switchKitTab('all', this)">🔥 All Kits & Half Kits</button>
    <button class="tab-btn" onclick="switchKitTab('full-kits', this)">📦 10-Vial Full Kits</button>
    <button class="tab-btn" onclick="switchKitTab('half-kits', this)">✨ 5-Vial Half Kits</button>
  </div>

  <!-- PANEL 1: All Kits -->
  <div id="kit-all" class="kit-panel active">
    <!-- GHK-Cu 10-Vial Kit -->
    <a href="/search?q=ghk" class="kit-card">
      <div>
        <span class="kit-tag">📦 10-Vial Full Kit</span>
        <div class="card-title">GHK-Cu 500mg Full Kit</div>
        <div class="card-spec">10x 50mg Lyophilized Vials • 99%+ HPLC Certified • Volume Research Tier</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Bulk Research Tier</span>
        <span class="card-cta">View Kit →</span>
      </div>
    </a>

    <!-- GHK-Cu 5-Vial Half Kit -->
    <a href="/search?q=ghk" class="kit-card">
      <div>
        <span class="kit-tag half-tag">✨ 5-Vial Half Kit</span>
        <div class="card-title">GHK-Cu 250mg Half Kit</div>
        <div class="card-spec">5x 50mg Lyophilized Vials • Starter Research Bundle</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Half-Kit Tier</span>
        <span class="card-cta">View Kit →</span>
      </div>
    </a>

    <!-- BPC-157 10-Vial Kit -->
    <a href="/search?q=bpc" class="kit-card">
      <div>
        <span class="kit-tag">📦 10-Vial Full Kit</span>
        <div class="card-title">BPC-157 50mg Full Kit</div>
        <div class="card-spec">10x 5mg Lyophilized Vials • Body Protection Compound Bulk</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Bulk Research Tier</span>
        <span class="card-cta">View Kit →</span>
      </div>
    </a>

    <!-- BPC-157 5-Vial Half Kit -->
    <a href="/search?q=bpc" class="kit-card">
      <div>
        <span class="kit-tag half-tag">✨ 5-Vial Half Kit</span>
        <div class="card-title">BPC-157 25mg Half Kit</div>
        <div class="card-spec">5x 5mg Lyophilized Vials • High-Purity Half Bundle</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Half-Kit Tier</span>
        <span class="card-cta">View Kit →</span>
      </div>
    </a>

    <!-- CJC-1295 / Ipamorelin Blend 10-Vial Kit -->
    <a href="/search?q=cjc" class="kit-card">
      <div>
        <span class="kit-tag">📦 10-Vial Full Kit</span>
        <div class="card-title">CJC-1295 / Ipamorelin 100mg Kit</div>
        <div class="card-spec">10x 10mg Synergistic Secretagogue Blend Vials</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Bulk Research Tier</span>
        <span class="card-cta">View Kit →</span>
      </div>
    </a>

    <!-- Semaglutide 10-Vial Kit -->
    <a href="/search?q=semaglutide" class="kit-card">
      <div>
        <span class="kit-tag">📦 10-Vial Full Kit</span>
        <div class="card-title">Semaglutide 50mg Full Kit</div>
        <div class="card-spec">10x 5mg Lyophilized Vials • 99%+ Mass-Spec Verified</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Bulk Research Tier</span>
        <span class="card-cta">View Kit →</span>
      </div>
    </a>
  </div>

  <!-- PANEL 2: 10-Vial Full Kits -->
  <div id="kit-full-kits" class="kit-panel">
    <a href="/search?q=ghk" class="kit-card">
      <div>
        <span class="kit-tag">📦 10-Vial Full Kit</span>
        <div class="card-title">GHK-Cu 500mg Full Kit</div>
        <div class="card-spec">10x 50mg Lyophilized Vials • Volume Research Tier</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Bulk Research Tier</span>
        <span class="card-cta">View Kit →</span>
      </div>
    </a>

    <a href="/search?q=bpc" class="kit-card">
      <div>
        <span class="kit-tag">📦 10-Vial Full Kit</span>
        <div class="card-title">BPC-157 50mg Full Kit</div>
        <div class="card-spec">10x 5mg Lyophilized Vials • Body Protection Compound Bulk</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Bulk Research Tier</span>
        <span class="card-cta">View Kit →</span>
      </div>
    </a>

    <a href="/search?q=cjc" class="kit-card">
      <div>
        <span class="kit-tag">📦 10-Vial Full Kit</span>
        <div class="card-title">CJC-1295 / Ipamorelin 100mg Kit</div>
        <div class="card-spec">10x 10mg Synergistic Secretagogue Blend Vials</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Bulk Research Tier</span>
        <span class="card-cta">View Kit →</span>
      </div>
    </a>
  </div>

  <!-- PANEL 3: 5-Vial Half Kits -->
  <div id="kit-half-kits" class="kit-panel">
    <a href="/search?q=ghk" class="kit-card">
      <div>
        <span class="kit-tag half-tag">✨ 5-Vial Half Kit</span>
        <div class="card-title">GHK-Cu 250mg Half Kit</div>
        <div class="card-spec">5x 50mg Lyophilized Vials • Starter Research Bundle</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Half-Kit Tier</span>
        <span class="card-cta">View Kit →</span>
      </div>
    </a>

    <a href="/search?q=bpc" class="kit-card">
      <div>
        <span class="kit-tag half-tag">✨ 5-Vial Half Kit</span>
        <div class="card-title">BPC-157 25mg Half Kit</div>
        <div class="card-spec">5x 5mg Lyophilized Vials • High-Purity Half Bundle</div>
      </div>
      <div class="card-footer">
        <span class="card-tier">Half-Kit Tier</span>
        <span class="card-cta">View Kit →</span>
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

async function run() {
  console.log("1. Upserting our-big-kits static page into Database...");

  const { data: pageData, error: pageError } = await supabase
    .from("static_pages")
    .upsert({
      slug: "our-big-kits",
      title: "Our Big Kits",
      content: kitsHtml,
      content_format: "html",
      is_published: true,
      meta_description: "Explore 10-vial full kits and 5-vial half kits for high-volume research.",
      updated_at: new Date().toISOString()
    }, { onConflict: "slug" })
    .select();

  if (pageError) {
    console.error("❌ Error upserting static page:", pageError.message);
    process.exit(1);
  }

  console.log("✓ Saved static page:", pageData[0].slug);

  console.log("\n2. Inserting our-big-kits into landing_sections queue...");
  const { data: existingSections } = await supabase
    .from("landing_sections")
    .select("*")
    .eq("page", "labs")
    .order("position", { ascending: true });

  const hasSection = (existingSections ?? []).some((s: any) => s.config?.slug === "our-big-kits");

  if (!hasSection) {
    const nextPos = (existingSections?.length ?? 0) + 1;
    console.log(`Adding our-big-kits at position ${nextPos}...`);

    const { error: secError } = await supabase
      .from("landing_sections")
      .insert({
        page: "labs",
        type: "static_html",
        position: nextPos,
        config: {
          slug: "our-big-kits",
          showTitle: false,
          containerWidth: "contained"
        }
      });

    if (secError) {
      console.error("❌ Error adding section:", secError.message);
    } else {
      console.log(`✓ Added our-big-kits to landing section queue at position ${nextPos}!`);
    }
  } else {
    console.log("✓ Section our-big-kits already exists in queue.");
  }
}

run();
