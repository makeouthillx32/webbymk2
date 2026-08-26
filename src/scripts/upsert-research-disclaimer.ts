// src/scripts/upsert-research-disclaimer.ts
//
// Transparent, frameless Research Disclaimer Static Page.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background-color: transparent;
      color: var(--foreground);
      font-family: var(--font-sans);
      line-height: 1.65;
    }

    main {
      max-width: 1000px;
      width: 100%;
      margin: 20px auto;
      padding: 0 10px;
    }

    .notice-card {
      background-color: transparent;
      border: none;
      border-left: 4px solid hsl(var(--primary));
      padding: 0.5rem 0 0.5rem 1.75rem;
      position: relative;
    }

    .notice-title {
      color: hsl(var(--primary));
      font-size: 1.5rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 1rem;
      font-family: var(--font-sans);
    }

    .notice-content p {
      color: var(--muted-foreground);
      font-size: 0.925rem;
      line-height: 1.7;
      margin-bottom: 1.15rem;
    }

    .notice-content p:last-child {
      margin-bottom: 0;
    }

    @media (max-width: 640px) {
      .notice-card {
        padding-left: 1.25rem;
      }
      .notice-title {
        font-size: 1.25rem;
      }
      .notice-content p {
        font-size: 0.85rem;
      }
    }
  </style>
</head>
<body>

  <main>
    <div class="notice-card">
      <h2 class="notice-title">NOTICE</h2>
      <div class="notice-content">
        <p>Any peptides on our website are sold for research and laboratory use. The products should not be used in form of cosmetic, food additive, chemical, drugs, or other applications not classified in this document. The listing of a material on this site does not constitute a license to its use in infringement of any patent. All customers represent and warrant that through their own review and study that they are fully aware and knowledgeable about the following: Government regulations regarding the use of and exposure to all products. The health and safety hazards associated with the handling of the products they purchase. The necessity of adequately warning of the health and safety hazards associated with any products. The company holds its right to cancel any purchase done if there is any proof or the company sees that you are buying for use other than it is sold for.</p>
        
        <p>“Unenter Labs” products are intended solely for laboratory research purposes and are not to be used for any other purposes, including but not limited to vitro diagnostic purpose, in food drugs, medical devices, or cosmetics for humans or animals or for commercial purposes. The purchaser agrees that the products have not been sterilized or tested by “Unenter Labs” for safety and efficacy in food, drug, medical device, cosmetic, commercial or any other use.</p>

        <p>The purchaser expressly represents and warrants to “Unenter Labs” that the purchaser will properly test, use, manufacture and market any products purchased from “Unenter Labs” and/or materials produced with products purchased from “Unenter Labs” in accordance with the practices of a reliable person who is experienced in the field and in strict compliance with all applicable laws and regulations, now and hereinafter enacted.</p>
      </div>
    </div>
  </main>

</body>
</html>`;

async function run() {
  console.log("Upserting transparent research-disclaimer static page into Database...");

  const { data, error } = await supabase
    .from("static_pages")
    .upsert(
      {
        slug: "research-disclaimer",
        title: "Research Use & Laboratory Disclaimer",
        content: htmlContent,
        content_format: "html",
        is_published: true,
        meta_description: "Research and laboratory use notice for Unenter Labs compounds.",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" }
    )
    .select();

  if (error) {
    console.error("❌ Failed to upsert static page:", error.message);
    process.exit(1);
  }

  console.log("✓ Successfully saved transparent research-disclaimer static page:", data);
}

run();
