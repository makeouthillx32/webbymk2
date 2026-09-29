// src/scripts/seed-labs-static-pages.ts
// ─────────────────────────────────────────────────────────────────────────────
// Seeds authentic, high-fidelity static pages for Unenter Labs (labs.unenter.live)
// into the Postgres static_pages table:
// 1. about: Unenter Labs & Blurton Livestock & Rescue partnership story
// 2. faq: Research peptides, HPLC testing, storage, shipping FAQs
// 3. privacy-policy: Researcher privacy, institutional data confidentiality
// 4. terms-and-conditions: Research Use Only (RUO) terms, safety, veterinary disclosures
// 5. shipping: Discreet packaging, cold-chain/lyophilized transit, courier tracking
// 6. returns: Biochemical sterility standards, 100% COA conformity guarantee
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || "https://db.unenter.live";
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Shared sleek CSS matching Unenter theme tokens
const sharedStyles = `
<style>
  .labs-page-wrapper {
    font-family: var(--font-sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    color: hsl(var(--foreground));
    line-height: 1.75;
    padding: 1.5rem 0 4rem 0;
  }
  .labs-hero {
    border-radius: 1.25rem;
    border: 1px solid hsl(var(--border));
    background: linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.7) 100%);
    padding: 2.5rem 2rem;
    margin-bottom: 2.5rem;
    box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.1);
    position: relative;
    overflow: hidden;
  }
  .labs-hero::before {
    content: "";
    position: absolute;
    top: -50px;
    right: -50px;
    width: 250px;
    height: 250px;
    background: radial-gradient(circle, hsl(var(--primary) / 0.12) 0%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
  }
  .labs-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.85rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    background: hsl(var(--primary) / 0.12);
    color: hsl(var(--primary));
    border: 1px solid hsl(var(--primary) / 0.25);
    margin-bottom: 1rem;
  }
  .labs-title {
    font-size: 2.25rem;
    font-weight: 900;
    letter-spacing: -0.03em;
    color: hsl(var(--foreground));
    line-height: 1.2;
    margin-bottom: 0.75rem;
  }
  .labs-subtitle {
    font-size: 1.0625rem;
    color: hsl(var(--muted-foreground));
    max-width: 48rem;
  }
  .labs-section {
    margin-bottom: 2.5rem;
  }
  .labs-section h2 {
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: hsl(var(--card-foreground));
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid hsl(var(--border) / 0.7);
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .labs-section h3 {
    font-size: 1.15rem;
    font-weight: 700;
    color: hsl(var(--card-foreground));
    margin: 1.5rem 0 0.5rem 0;
  }
  .labs-section p {
    color: hsl(var(--muted-foreground));
    margin-bottom: 1rem;
    font-size: 0.9375rem;
  }
  .labs-section ul, .labs-section ol {
    margin: 0 0 1.25rem 1.5rem;
    color: hsl(var(--muted-foreground));
    font-size: 0.9375rem;
  }
  .labs-section li {
    margin-bottom: 0.5rem;
  }
  .labs-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.25rem;
    margin: 1.5rem 0;
  }
  .labs-card {
    border-radius: 1rem;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    padding: 1.5rem;
    box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.05);
  }
  .labs-card h4 {
    font-size: 1rem;
    font-weight: 700;
    color: hsl(var(--card-foreground));
    margin-bottom: 0.5rem;
  }
  .labs-card p {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    margin-bottom: 0;
  }
  .labs-callout {
    border-radius: 1rem;
    border: 1px solid hsl(var(--primary) / 0.3);
    background: hsl(var(--primary) / 0.06);
    padding: 1.25rem 1.5rem;
    margin: 1.5rem 0;
  }
  .labs-callout-warning {
    border: 1px solid hsl(var(--destructive) / 0.3);
    background: hsl(var(--destructive) / 0.06);
  }
  .labs-callout-title {
    font-size: 0.875rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--primary));
    margin-bottom: 0.35rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .labs-callout-warning .labs-callout-title {
    color: hsl(var(--destructive));
  }
  .labs-callout p {
    margin-bottom: 0;
    font-size: 0.875rem;
    color: hsl(var(--foreground));
  }
  .labs-table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5rem 0;
    font-size: 0.875rem;
    border-radius: 0.75rem;
    overflow: hidden;
    border: 1px solid hsl(var(--border));
  }
  .labs-table th {
    background: hsl(var(--muted) / 0.4);
    padding: 0.75rem 1rem;
    text-align: left;
    font-weight: 700;
    color: hsl(var(--foreground));
    border-bottom: 1px solid hsl(var(--border));
  }
  .labs-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid hsl(var(--border));
    color: hsl(var(--muted-foreground));
  }
  .labs-table tr:last-child td {
    border-bottom: none;
  }
  .signature-box {
    margin-top: 2.5rem;
    padding-top: 1.5rem;
    border-top: 2px dashed hsl(var(--border));
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
  }
  .signature-name {
    font-weight: 800;
    color: hsl(var(--foreground));
    font-size: 1rem;
  }
  .signature-role {
    font-size: 0.8125rem;
    color: hsl(var(--primary));
    font-weight: 600;
  }
</style>
`;

const pages = [
  {
    slug: "about",
    title: "Our Story · Unenter Labs & Blurton Livestock & Rescue",
    meta_description:
      "The mission of Unenter Labs: Partnered with Blurton Livestock & Rescue to pioneer veterinary biochemical recovery, equine rehabilitation data, and ISO/IEC 17025 tested research compounds.",
    meta_keywords: [
      "Unenter Labs",
      "Blurton Livestock & Rescue",
      "equine research",
      "horse rescue",
      "veterinary peptides",
      "Tyler Burns",
      "animal rehabilitation",
      "HPLC certified",
      "research compounds",
    ],
    content_format: "html" as const,
    content: `
${sharedStyles}
<div class="labs-page-wrapper">
  <div class="labs-hero">
    <div class="labs-badge">Veterinary Science &amp; Rescue Alliance</div>
    <h1 class="labs-title">Pioneering Equine &amp; Livestock Recovery</h1>
    <p class="labs-subtitle">
      Unenter Labs was founded on a singular conviction: rigorous analytical biochemistry should directly serve the animals who need it most. Through our direct operational alliance with <strong>Blurton Livestock &amp; Rescue</strong>, our research begins in the field, rehabilitating horses and livestock and documenting real biochemical telemetry.
    </p>
  </div>

  <div class="labs-section">
    <h2>The Rescue Mission Behind the Science</h2>
    <p>
      Across ranches, sanctuaries, and rural rescue facilities, larger animals—particularly horses, working equines, and rescued livestock—routinely face catastrophic musculoskeletal breakdown, chronic joint degeneration, severe tendon lacerations, and systemic metabolic trauma. Traditional veterinary options have frequently been limited to palliative maintenance or premature euthanasia.
    </p>
    <p>
      Unenter Labs was created to change that reality. In partnership with <strong>Blurton Livestock &amp; Rescue</strong>, our team rescues injured, neglected, and abandoned horses and large animals. Rather than accepting irreversible physical decline, we apply modern, third-party-verified research compounds to log tissue repair, accelerated tenocyte synthesis, anti-inflammatory cascades, and metabolic stabilization under rigorous observational protocols.
    </p>
  </div>

  <div class="labs-callout">
    <div class="labs-callout-title">The Non-Human Research Boundary</div>
    <p>
      Unenter Labs operates strictly within the non-human and laboratory research boundary. We do not formulate, market, or study products for human consumption or human clinical administration. Our research base is grounded entirely in observational veterinary rehabilitation and in vitro analytical testing. However, mammalian biological mechanisms—from cellular angiogenesis to extracellular matrix remodeling—share profound phylogenetic conservation. If the larger scientific, academic, and clinical research communities can benefit from the telemetry, safety profiles, and recovery curves we document in our rescued animals, we consider that a vital and transformative contribution to biological science as a whole.
    </p>
  </div>

  <div class="labs-section">
    <h2>Core Pillars of Our Operation</h2>
    <div class="labs-card-grid">
      <div class="labs-card">
        <h4>Blurton Livestock &amp; Rescue Alliance</h4>
        <p>
          Every observational dataset begins with real animals in our care. Rescued horses receiving targeted research regimens are monitored for mobility restoration, gait symmetry, and tissue regeneration.
        </p>
      </div>
      <div class="labs-card">
        <h4>100% Third-Party Lab Verification</h4>
        <p>
          We do not rely on manufacturer batch assertions. Every batch undergoes independent analytical testing at ISO/IEC 17025 accredited facilities (Janoshik Analytical, MZ Biolabs) for HPLC purity (≥99%) and ESI-MS mass confirmation.
        </p>
      </div>
      <div class="labs-card">
        <h4>Full Telemetry Transparency</h4>
        <p>
          We publish original scanned lab reports, raw HPLC detector integration tables, and mass spectrometry abundance readings directly to our public COA library for verified peer review.
        </p>
      </div>
    </div>
  </div>

  <div class="labs-section">
    <h2>Advancing the Frontier for Animals We Love</h2>
    <p>
      From deep flexor tendon tears in retired rodeo horses to metabolic wasting in rescued livestock, the research conducted under Unenter Labs is expanding what veterinary medicine can understand about regenerative peptides like BPC-157, TB-500, Cartalax, VIP, and metabolic analogues.
    </p>
    <p>
      By holding our research supplies to human analytical reference standards—with sterile lyophilization, nitrogen purging, and verifiable third-party chromatographic purity—we ensure that veterinarians, academic researchers, and animal sanctuaries receive reference-grade materials that deliver consistent, verifiable scientific outcomes.
    </p>
  </div>

  <div class="signature-box">
    <div>
      <div class="signature-name">Tyler Burns</div>
      <div class="signature-role">Director of Operations &amp; Research · Unenter Labs</div>
      <div style="font-size: 0.8125rem; color: hsl(var(--muted-foreground));">In Alliance with Blurton Livestock &amp; Rescue</div>
    </div>
    <div style="font-size: 0.8125rem; font-family: monospace; color: hsl(var(--muted-foreground));">
      Facility Code: UNENTER-BLR-2026
    </div>
  </div>
</div>
`,
  },

  {
    slug: "faq",
    title: "Frequently Asked Questions · Unenter Labs",
    meta_description:
      "Common questions regarding Unenter Labs research peptides, Blurton Livestock & Rescue alliance, third-party HPLC & MS testing, storage, and fulfillment.",
    meta_keywords: [
      "Unenter Labs FAQ",
      "research peptide questions",
      "HPLC purity",
      "peptides for horses",
      "how to store peptides",
      "Janoshik verification",
      "RUO compliance",
    ],
    content_format: "html" as const,
    content: `
${sharedStyles}
<div class="labs-page-wrapper">
  <div class="labs-hero">
    <div class="labs-badge">Help &amp; Knowledge Base</div>
    <h1 class="labs-title">Frequently Asked Questions</h1>
    <p class="labs-subtitle">
      Clear answers regarding our research mission, veterinary rescue partnership, independent analytical testing, storage protocols, and laboratory order fulfillment.
    </p>
  </div>

  <div class="labs-section">
    <h2>1. Research Mission &amp; Product Use</h2>

    <h3>What is the core focus of Unenter Labs?</h3>
    <p>
      Unenter Labs supplies analytical reference standards and bio-active research peptides primarily focused on equine, large livestock, and veterinary regenerative recovery. In partnership with <strong>Blurton Livestock &amp; Rescue</strong>, our research records real-world tissue repair and metabolic recovery in rescued horses and animals while providing laboratory-grade compounds to the global scientific research community.
    </p>

    <h3>Are your compounds approved for human consumption?</h3>
    <p>
      <strong>No.</strong> All compounds sold by Unenter Labs are strictly designated for <strong>Laboratory, In Vitro, and Veterinary Animal Research Use Only (RUO)</strong>. They are not pharmaceuticals, drugs, medical devices, or food additives. They are not approved by the U.S. Food and Drug Administration (FDA) for human diagnostic or therapeutic applications.
    </p>

    <h3>Can human medicine benefit from your animal research data?</h3>
    <p>
      Yes. While our direct observational base is strictly non-human (horses and livestock), cellular biology and mammalian peptide signaling pathways are highly conserved. When our data demonstrates accelerated tendon remodeling, cellular cytoprotection, or safe metabolic stabilization, that published telemetry serves as valuable foundational evidence for the wider medical and scientific community.
    </p>
  </div>

  <div class="labs-section">
    <h2>2. Purity, Testing &amp; COA Transparency</h2>

    <h3>How do you verify compound quality and purity?</h3>
    <p>
      Every single synthesis lot is sent to independent, ISO/IEC 17025 accredited chemical laboratories (such as Janoshik Analytical and MZ Biolabs). We conduct:
    </p>
    <ul>
      <li><strong>RP-HPLC (Reverse-Phase High Performance Liquid Chromatography):</strong> Verifying chemical purity exceeds 98.0% to 99.5%+.</li>
      <li><strong>ESI-MS / MALDI-TOF (Electrospray Ionization Mass Spectrometry):</strong> Confirming exact molecular mass and amino acid sequence identity.</li>
      <li><strong>Endotoxin LAL Testing:</strong> Ensuring bacterial endotoxin levels are below 0.01 to 0.05 EU/mg.</li>
      <li><strong>Visual &amp; Residue Analysis:</strong> Confirming proper sterile lyophilized solid cake formation with zero synthesis intermediates.</li>
    </ul>

    <h3>How can I view the Certificate of Analysis (COA) for my specific vial?</h3>
    <p>
      Every vial shipped features a clear batch lot identifier on its label (e.g., <code>CTB40-20260628-01</code>). You can visit our public <a href="/verify" style="color: hsl(var(--primary)); font-weight: 600;">Verification Portal</a> or <a href="/coa" style="color: hsl(var(--primary)); font-weight: 600;">COA Library</a> to view the digital analytical release panel, inspect the original stamped lab paper scan, and download the full detector integration readings in CSV or JSON format.
    </p>
  </div>

  <div class="labs-section">
    <h2>3. Storage, Stability &amp; Reconstitution</h2>

    <h3>How should lyophilized peptide vials be stored?</h3>
    <p>
      Lyophilized (freeze-dried) peptide powders are vacuum-sealed under inert gas and are remarkably stable:
    </p>
    <ul>
      <li><strong>Long-Term Storage (1–2+ years):</strong> Store in a laboratory freezer at -20°C (-4°F) protected from light and moisture.</li>
      <li><strong>Short-Term Storage (up to 3 months):</strong> Refrigerate between 2°C to 8°C (36°F to 46°F).</li>
      <li><strong>Ambient Transit:</strong> Stable at room temperature (up to 25°C / 77°F) for up to 30–45 days without measurable degradation.</li>
    </ul>

    <h3>What solvent is recommended for laboratory reconstitution?</h3>
    <p>
      For in vitro laboratory assays or veterinary experimental preparations, reconstitution is standardly performed with sterile Bacteriostatic Water (0.9% Benzyl Alcohol) or sterile physiological saline (0.9% NaCl). Once reconstituted, liquid solutions must be refrigerated between 2°C and 8°C and utilized within 21 to 28 days.
    </p>
  </div>

  <div class="labs-section">
    <h2>4. Ordering, Payment &amp; Discreet Shipping</h2>

    <h3>What payment options do you accept?</h3>
    <p>
      We support major credit cards via secure bank-grade encrypted checkout as well as offline <strong>Zelle payment verification</strong> (<code>labs@unenter.live</code>). With Zelle, researchers submit their order and upload a verification screenshot to their order tracking page for rapid manual clearing.
    </p>

    <h3>How are orders packaged and shipped?</h3>
    <p>
      Orders are fulfilled from our temperature-monitored facility in discreet, unbranded mailers or heavy-duty boxes with zero compound names or chemical identifiers on the exterior label. Shipments are dispatched via FedEx, UPS, or USPS Priority with real-time tracking provided upon carrier handoff.
    </p>
  </div>
</div>
`,
  },

  {
    slug: "privacy-policy",
    title: "Privacy Policy · Unenter Labs",
    meta_description:
      "Unenter Labs Privacy Policy: Comprehensive disclosure of data handling, institutional researcher confidentiality, encryption standards, and zero third-party broker sharing.",
    meta_keywords: [
      "Unenter Labs Privacy Policy",
      "research confidentiality",
      "data protection",
      "Tyler Burns privacy",
      "secure checkout",
      "no data sharing",
    ],
    content_format: "html" as const,
    content: `
${sharedStyles}
<div class="labs-page-wrapper">
  <div class="labs-hero">
    <div class="labs-badge">Data Protection &amp; Confidentiality</div>
    <h1 class="labs-title">Privacy Policy</h1>
    <p class="labs-subtitle">
      At Unenter Labs, we recognize the sensitive nature of biological research and scientific acquisition. This policy details how your researcher identification, institutional orders, and communication telemetry are protected with bank-grade encryption.
    </p>
  </div>

  <div class="labs-section">
    <h2>1. Data Controller &amp; Scope</h2>
    <p>
      This Privacy Policy governs the digital services, research storefront, and user account portals operated under <strong>Unenter Labs</strong> (<code>labs.unenter.live</code>), in partnership with <strong>Blurton Livestock &amp; Rescue</strong>, under the operational direction of <strong>Tyler Burns</strong>.
    </p>
    <p>
      For questions, privacy audit inquiries, or data access requests, contact our dedicated privacy officer at <a href="mailto:labs@unenter.live" style="color: hsl(var(--primary)); font-weight: 600;">labs@unenter.live</a>.
    </p>
  </div>

  <div class="labs-section">
    <h2>2. Information We Collect</h2>
    <p>We collect only the minimum required information necessary to verify researcher eligibility, fulfill orders, and maintain laboratory traceability:</p>
    <ul>
      <li><strong>Researcher Identity &amp; Contact:</strong> Full name, institutional or sanctuary affiliation, professional email address, and telephone number.</li>
      <li><strong>Fulfillment Destinations:</strong> Physical laboratory delivery addresses and billing addresses saved in your researcher address book.</li>
      <li><strong>Order Records &amp; Batch Telemetry:</strong> Transaction identifiers, compound purchase history, payment confirmation receipts (e.g., Zelle transfer confirmations), and lot-specific COA association.</li>
      <li><strong>Technical &amp; Session Telemetry:</strong> IP addresses, browser user agents, and security tokens collected via our DDoS mitigation engine (Unenter Edge Shield) to protect against automated scraping and credential stuffing.</li>
    </ul>
  </div>

  <div class="labs-section">
    <h2>3. Strict Prohibition on Third-Party Data Sharing</h2>
    <div class="labs-callout">
      <div class="labs-callout-title">Zero Commercial Data Brokering</div>
      <p>
        Unenter Labs does not sell, rent, monetize, or trade your personal information, compound purchase records, or research inquiries with third-party advertisers, data syndicates, or commercial data brokers under any circumstances.
      </p>
    </div>
    <p>Information is disclosed solely to vetted operational service providers under strict confidentiality agreements:</p>
    <ul>
      <li><strong>Couriers &amp; Logistics:</strong> FedEx, UPS, and USPS solely for the generation of shipping labels and parcel delivery. Exterior labels contain zero chemical nomenclature.</li>
      <li><strong>Payment Gateways:</strong> PCI-DSS compliant credit card processors and bank networks for transaction verification. Unenter Labs does not store raw credit card numbers.</li>
      <li><strong>Infrastructure &amp; Database:</strong> Dedicated Supabase Postgres instance secured behind TLS 1.3 encryption and enterprise firewalls.</li>
    </ul>
  </div>

  <div class="labs-section">
    <h2>4. Security &amp; Encryption Architecture</h2>
    <p>
      All data in transit between your browser and our servers is secured using modern Transport Layer Security (TLS 1.3 / HTTPS). User authentication tokens and passwords are encrypted using one-way cryptographic bcrypt hashing. Database records are protected by strict Postgres Row-Level Security (RLS) policies ensuring that your account details and order records can only ever be queried by your authenticated user session.
    </p>
  </div>

  <div class="labs-section">
    <h2>5. Researcher Data Rights &amp; Deletion</h2>
    <p>
      As a researcher or institution utilizing Unenter Labs, you retain full ownership of your personal data:
    </p>
    <ul>
      <li><strong>Access &amp; Export:</strong> You may review and export your order history, detector readings, and saved facility addresses directly in your account dashboard.</li>
      <li><strong>Correction:</strong> You may edit your profile credentials and address book at any time.</li>
      <li><strong>Account Deletion:</strong> You may request complete purging of your researcher profile and contact details by emailing <code>labs@unenter.live</code>. (Mandatory tax and accounting transaction records are archived for statutory compliance periods only).</li>
    </ul>
  </div>

  <div class="signature-box">
    <div>
      <div class="signature-name">Tyler Burns</div>
      <div class="signature-role">Compliance Officer &amp; Director · Unenter Labs</div>
    </div>
    <div style="font-size: 0.8125rem; color: hsl(var(--muted-foreground));">
      Effective Date: September 2026 · Version 2.4
    </div>
  </div>
</div>
`,
  },

  {
    slug: "terms-and-conditions",
    title: "Terms & Conditions · Unenter Labs",
    meta_description:
      "Terms & Conditions of Sale for Unenter Labs: Strict Research Use Only (RUO) covenant, non-human research acknowledgment, laboratory safety, and Blurton Livestock & Rescue disclosures.",
    meta_keywords: [
      "Unenter Labs Terms and Conditions",
      "RUO terms",
      "research peptide legal",
      "not for human consumption",
      "veterinary peptide terms",
      "buyer acknowledgment",
    ],
    content_format: "html" as const,
    content: `
${sharedStyles}
<div class="labs-page-wrapper">
  <div class="labs-hero">
    <div class="labs-badge">Legal &amp; Regulatory Agreement</div>
    <h1 class="labs-title">Terms &amp; Conditions of Sale</h1>
    <p class="labs-subtitle">
      Please read these terms carefully before purchasing from Unenter Labs. By placing an order, the purchaser explicitly warrants compliance with our Research Use Only (RUO) mandate and non-human research parameters.
    </p>
  </div>

  <div class="labs-callout labs-callout-warning">
    <div class="labs-callout-title">Critical Regulatory Covenant: Research Use Only (RUO)</div>
    <p>
      All products, peptides, proteins, and chemical reference standards sold on <code>labs.unenter.live</code> are supplied exclusively for <strong>In Vitro Laboratory, Analytical, and Veterinary Animal Research Use Only</strong>. They are strictly <strong>NOT FOR HUMAN CONSUMPTION</strong>, clinical diagnostic use, therapeutic treatment, or incorporation into food, cosmetic, or household products.
    </p>
  </div>

  <div class="labs-section">
    <h2>1. Purchaser Qualifications &amp; Representations</h2>
    <p>By placing an order with Unenter Labs, the purchaser expressly represents, covenants, and warrants that:</p>
    <ul>
      <li>The purchaser is an individual of legal age (at least 18 years old) or an authorized agent of a recognized research laboratory, academic institution, veterinary clinic, or analytical facility.</li>
      <li>The purchaser possesses the professional training, personal protective equipment (PPE), and proper biosafety storage facilities necessary to safely handle, reconstitute, and store biochemical research peptides.</li>
      <li>The products will not be administered to humans under any circumstances, nor will they be distributed to individuals intending human administration.</li>
      <li>The purchaser will comply with all applicable local, state, and federal laws and regulations governing the acquisition, handling, and disposal of laboratory research chemicals.</li>
    </ul>
  </div>

  <div class="labs-section">
    <h2>2. Blurton Livestock &amp; Rescue Alliance Disclosures</h2>
    <p>
      Unenter Labs operates in direct observational collaboration with <strong>Blurton Livestock &amp; Rescue</strong>, documenting the restorative and biological effects of research peptides in rescued equines and livestock.
    </p>
    <p>
      Any case observations, tissue repair recovery notes, or veterinary telemetry published on this site or in associated whitepapers are for educational, observational, and scientific discussion only. They do not constitute veterinary medical advice or veterinary product endorsements. Licensed veterinarians should exercise independent clinical judgment when conducting research.
    </p>
  </div>

  <div class="labs-section">
    <h2>3. Product Purity, Warranties &amp; COA Integrity</h2>
    <p>
      Unenter Labs warrants that all supplied materials conform to the analytical specifications set forth in the corresponding Certificate of Analysis (COA) issued by independent ISO/IEC 17025 accredited laboratories at the time of manufacture.
    </p>
    <p>
      Except as expressly stated herein, products are provided "AS IS" without warranties of any kind, whether express, implied, or statutory, including warranties of merchantability or fitness for any specific off-label experimental outcome. The purchaser assumes all experimental risk associated with in vitro or in vivo animal application.
    </p>
  </div>

  <div class="labs-section">
    <h2>4. Limitation of Liability &amp; Indemnification</h2>
    <p>
      In no event shall Unenter Labs, its founders, directors, employees, affiliates, or partner organizations (including Blurton Livestock &amp; Rescue and Tyler Burns) be liable for any indirect, incidental, special, exemplary, or consequential damages resulting from:
    </p>
    <ul>
      <li>Improper handling, reconstitution, or storage of research compounds;</li>
      <li>Unauthorized human administration or misuse of materials;</li>
      <li>Experimental laboratory failures or loss of biological samples;</li>
      <li>Any violation of local statutory research chemical regulations by the purchaser.</li>
    </ul>
    <p>
      The purchaser agrees to defend, indemnify, and hold harmless Unenter Labs against any claims, liabilities, losses, damages, and legal expenses arising out of the purchaser's handling, storage, use, or disposal of the products.
    </p>
  </div>

  <div class="labs-section">
    <h2>5. Right to Refuse Service &amp; Order Cancellation</h2>
    <p>
      Unenter Labs strictly adheres to research chemical compliance standards. We reserve the absolute right to refuse service, terminate accounts, or cancel pending orders if we have reasonable grounds to suspect that an individual or entity intends to use our compounds for human consumption or unauthorized resale.
    </p>
  </div>

  <div class="signature-box">
    <div>
      <div class="signature-name">Tyler Burns</div>
      <div class="signature-role">Operations &amp; Compliance Directorate · Unenter Labs</div>
    </div>
    <div style="font-size: 0.8125rem; font-family: monospace; color: hsl(var(--muted-foreground));">
      Governing Law: State &amp; Federal Commercial Code
    </div>
  </div>
</div>
`,
  },

  {
    slug: "shipping",
    title: "Shipping & Fulfillment Policy · Unenter Labs",
    meta_description:
      "Unenter Labs Shipping Policy: Cold-chain and lyophilized transit stability, discreet packaging, expedited courier tracking, and transit replacement guarantee.",
    meta_keywords: [
      "Unenter Labs Shipping Policy",
      "peptide shipping",
      "cold shipping",
      "discreet packaging",
      "FedEx peptide tracking",
      "lyophilized stability in transit",
    ],
    content_format: "html" as const,
    content: `
${sharedStyles}
<div class="labs-page-wrapper">
  <div class="labs-hero">
    <div class="labs-badge">Logistics &amp; Fulfillment Standards</div>
    <h1 class="labs-title">Shipping &amp; Fulfillment Policy</h1>
    <p class="labs-subtitle">
      Ensuring chemical integrity from our controlled synthesis vault to your research laboratory bench. Discover our packaging standards, courier schedules, and temperature stability guarantees.
    </p>
  </div>

  <div class="labs-section">
    <h2>1. Dispatch Timelines &amp; Fulfillment Speed</h2>
    <p>
      We recognize that research schedules and animal care regimens require rapid, dependable logistics. All orders placed and verified before <strong>2:00 PM EST (Monday through Friday)</strong> are fulfilled and staged for courier handoff on the same business day. Orders placed after 2:00 PM EST or over the weekend are dispatched the following business day.
    </p>
    <table class="labs-table">
      <thead>
        <tr>
          <th>Courier Service</th>
          <th>Typical Delivery Window</th>
          <th>Tracking Updates</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>USPS Priority Mail</strong></td>
          <td>2–4 Business Days</td>
          <td>Live Scan via USPS.com</td>
        </tr>
        <tr>
          <td><strong>FedEx 2Day Express</strong></td>
          <td>2 Business Days Guaranteed</td>
          <td>Full Real-Time Telemetry</td>
        </tr>
        <tr>
          <td><strong>UPS Ground / Next Day</strong></td>
          <td>1–3 Business Days</td>
          <td>Direct Doorstep Signature / Scan</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="labs-section">
    <h2>2. Temperature &amp; Lyophilized Stability in Transit</h2>
    <p>
      A frequent question from researchers is whether peptide compounds degrade during summer heat or standard transit.
    </p>
    <p>
      All Unenter Labs peptides are produced via high-vacuum freeze-drying (lyophilization) and sealed under pure inert nitrogen gas. In this dry cake form, research peptides are chemically robust and experience <strong>zero degradation at ambient temperatures up to 37°C (98.6°F) for up to 30–45 days</strong>.
    </p>
    <p>
      Upon delivery to your facility, vials should simply be transferred to your designated laboratory refrigerator (2°C to 8°C) or freezer (-20°C) for multi-year preservation. For temperature-sensitive liquid matrices, specialized insulated thermal mailers and gel cold packs are automatically utilized.
    </p>
  </div>

  <div class="labs-section">
    <h2>3. 100% Discreet &amp; Secure Laboratory Packaging</h2>
    <div class="labs-callout">
      <div class="labs-callout-title">Confidential Laboratory Security</div>
      <p>
        Your privacy and facility security are paramount. All parcels are shipped in plain, durable, unbranded packaging (tear-resistant poly bubble mailers or plain brown cardboard boxes). The exterior shipping label contains only the shipping destination and a standard return address with zero mention of chemical names, peptides, or research products.
      </p>
    </div>
    <p>
      Inside each box, individual vials are protected with custom foam inserts and bubble shielding to completely prevent vial friction, rubber stopper displacement, or glass micro-fractures during transit.
    </p>
  </div>

  <div class="labs-section">
    <h2>4. Transit Loss &amp; Damage Guarantee</h2>
    <p>
      In the rare event that a courier mishandles, loses, or damages your parcel during transit:
    </p>
    <ul>
      <li><strong>Immediate Replacement Guarantee:</strong> If glass vials arrive cracked or broken, contact <code>labs@unenter.live</code> within 48 hours of delivery with photos of the damaged packaging and vials. We will immediately dispatch a replacement shipment at no expense to you.</li>
      <li><strong>Lost In Transit:</strong> If a package shows no tracking scans for more than 5 consecutive business days, we will launch an immediate carrier trace and issue a replacement without delay.</li>
    </ul>
  </div>

  <div class="signature-box">
    <div>
      <div class="signature-name">Fulfillment Operations Center</div>
      <div class="signature-role">Unenter Labs Logistics Department</div>
    </div>
    <div style="font-size: 0.8125rem; color: hsl(var(--muted-foreground));">
      Contact: <a href="mailto:labs@unenter.live" style="color: hsl(var(--primary)); font-weight: 600;">labs@unenter.live</a>
    </div>
  </div>
</div>
`,
  },

  {
    slug: "returns",
    title: "Returns & Exchanges · Unenter Labs",
    meta_description:
      "Unenter Labs Returns & Quality Guarantee: Chemical chain-of-custody policies, replacement guarantees for analytical COA variance, and inspection reporting procedures.",
    meta_keywords: [
      "Unenter Labs Returns",
      "peptide return policy",
      "COA guarantee",
      "quality replacement",
      "research chemical refunds",
    ],
    content_format: "html" as const,
    content: `
${sharedStyles}
<div class="labs-page-wrapper">
  <div class="labs-hero">
    <div class="labs-badge">Chain of Custody &amp; Quality Guarantee</div>
    <h1 class="labs-title">Returns &amp; Quality Guarantee</h1>
    <p class="labs-subtitle">
      Due to the strict biochemical sterility, cold-chain preservation, and regulatory standards required for analytical reference standards, our return policy balances chemical safety with a 100% Quality Conformity Guarantee.
    </p>
  </div>

  <div class="labs-section">
    <h2>1. The Chemical Chain-of-Custody Standard</h2>
    <p>
      Analytical research peptides and chemical standards are sensitive biochemical reagents. Once a sealed vial leaves the controlled custody of our storage facility and is received by a customer, it cannot be verified against potential environmental contamination, improper thermal exposure, or tampering.
    </p>
    <p>
      <strong>Therefore, in accordance with standard chemical industry biosafety protocols, we cannot accept returns or restock opened or unopened vials for resale.</strong> This policy guarantees that every vial delivered to our researchers is 100% factory-sealed, unhandled, and fully verified directly from synthesis.
    </p>
  </div>

  <div class="labs-section">
    <h2>2. 100% Analytical Conformity &amp; Quality Guarantee</h2>
    <p>
      While we do not accept change-of-mind returns, we stand fully behind the scientific accuracy of our compounds:
    </p>
    <div class="labs-card-grid">
      <div class="labs-card">
        <h4>Analytical Variance Guarantee</h4>
        <p>
          If your laboratory conducts independent testing that demonstrates a compound fails to conform to our published Certificate of Analysis (COA) specifications (purity or sequence identity), we will issue an immediate 100% replacement or full store refund upon review of your laboratory data.
        </p>
      </div>
      <div class="labs-card">
        <h4>Physical Transit Damage</h4>
        <p>
          If vials arrive cracked, compromised, or with broken crimp seals, provide photographic evidence within 7 days of delivery for immediate, hassle-free reshipment at our cost.
        </p>
      </div>
      <div class="labs-card">
        <h4>Order Discrepancies</h4>
        <p>
          If you receive an incorrect compound or dosage specification, notify our care team and we will correct the error with expedited priority shipping.
        </p>
      </div>
    </div>
  </div>

  <div class="labs-section">
    <h2>3. How to Submit an Inspection Claim</h2>
    <p>To submit a damage, discrepancy, or analytical inquiry claim:</p>
    <ol>
      <li>Locate your <strong>Order Number</strong> (found in your confirmation email or <a href="/account" style="color: hsl(var(--primary)); font-weight: 600;">Researcher Account Portal</a>).</li>
      <li>Take clear photographs of the product label showing the <strong>Batch Lot Number</strong> and the physical issue.</li>
      <li>Email our clinical support team at <a href="mailto:labs@unenter.live" style="color: hsl(var(--primary)); font-weight: 600;">labs@unenter.live</a> with your order number in the subject line.</li>
      <li>Our operations team will review your submission and process your replacement or refund within 24–48 business hours.</li>
    </ol>
  </div>

  <div class="signature-box">
    <div>
      <div class="signature-name">Tyler Burns</div>
      <div class="signature-role">Quality Assurance Directorate · Unenter Labs</div>
    </div>
    <div style="font-size: 0.8125rem; font-family: monospace; color: hsl(var(--muted-foreground));">
      Resolution SLA: &lt; 24 Business Hours
    </div>
  </div>
</div>
`,
  },
];

async function main() {
  console.log("=== Seeding Unenter Labs Static Pages ===");

  for (const page of pages) {
    console.log(`\nProcessing slug: '${page.slug}' - '${page.title}'...`);

    // Check if page exists
    const { data: existing } = await supabase
      .from("static_pages")
      .select("id, slug, version")
      .eq("slug", page.slug)
      .maybeSingle();

    if (existing) {
      console.log(`- Found existing record (ID: ${existing.id}, v${existing.version}). Updating...`);
      const { error: updateErr } = await supabase
        .from("static_pages")
        .update({
          title: page.title,
          content: page.content,
          content_format: page.content_format,
          meta_description: page.meta_description,
          meta_keywords: page.meta_keywords,
          is_published: true,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: (existing.version || 1) + 1,
        })
        .eq("id", existing.id);

      if (updateErr) {
        console.error(`  Error updating '${page.slug}':`, updateErr.message);
      } else {
        console.log(`  Successfully updated '${page.slug}' (v${(existing.version || 1) + 1})`);
      }
    } else {
      console.log(`- Creating new record for '${page.slug}'...`);
      const { error: insertErr } = await supabase.from("static_pages").insert({
        slug: page.slug,
        title: page.title,
        content: page.content,
        content_format: page.content_format,
        meta_description: page.meta_description,
        meta_keywords: page.meta_keywords,
        is_published: true,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      });

      if (insertErr) {
        console.error(`  Error inserting '${page.slug}':`, insertErr.message);
      } else {
        console.log(`  Successfully inserted '${page.slug}' (v1)`);
      }
    }
  }

  console.log("\n=== All Unenter Labs Static Pages Processed Successfully! ===");
}

main().catch((err) => {
  console.error("Fatal seed error:", err);
  process.exit(1);
});
