// app/api/research-products/admin/[id]/lab-reports/parse/route.ts
//
// Step 2 of the "upload a CoA" flow. Takes the storage path of a file
// already uploaded via ../upload/route.ts, hands it to Claude, and asks for
// every field on the CoA form back as structured data — lab_name, dates,
// fentanyl status, and the three child arrays (results / conformity_samples
// / stats) that back the storefront's own CoA graphs. This is a best-effort
// read, not a source of truth: the admin reviews/edits the populated form
// and only the DB write (POST/PATCH on ../route.ts and ../[reportId]/route.ts)
// is authoritative. Nothing here writes to the database.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdminClient } from "@/lib/require-admin";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: Promise<{ id: string }> };

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

// Mirrors FormState in lab-data-tab.tsx (minus operational fields like
// access_code/verified/pending, which are the admin's call, not the lab's).
const EXTRACT_TOOL: Anthropic.Tool = {
  name: "extract_coa_data",
  description:
    "Record every field found on this Certificate of Analysis (COA). Use null for anything not present on the document — never guess or invent a value.",
  input_schema: {
    type: "object",
    properties: {
      lab_name: { type: ["string", "null"], description: "Name of the testing laboratory" },
      lab_website: { type: ["string", "null"] },
      coa_number: { type: ["string", "null"], description: "Certificate/report number" },
      product_label: { type: ["string", "null"], description: "Product name/label as printed on the COA" },
      lot_number: { type: ["string", "null"], description: "Lot or batch number" },
      appearance: { type: ["string", "null"], description: "Physical appearance description, e.g. 'White lyophilized powder'" },
      test_type: { type: ["string", "null"], description: "e.g. 'Full QC Panel', 'Purity Analysis'" },
      date_received: { type: ["string", "null"], description: "ISO date (YYYY-MM-DD) the lab received the sample" },
      date_confirmed: { type: ["string", "null"], description: "ISO date (YYYY-MM-DD) testing was completed/confirmed" },
      signed_date: { type: ["string", "null"], description: "ISO date (YYYY-MM-DD) the report was signed" },
      produced_date: { type: ["string", "null"], description: "ISO date (YYYY-MM-DD) the batch was produced, if stated" },
      fentanyl_free: { type: ["boolean", "null"], description: "true only if the document explicitly confirms fentanyl-free" },
      fentanyl_test_method: { type: ["string", "null"] },
      lab_director_name: { type: ["string", "null"] },
      notes: { type: ["string", "null"], description: "Any freeform notes/disclaimers on the report" },
      methodology: { type: ["string", "null"], description: "Testing methodology description, e.g. HPLC/LC-MS method summary" },
      results: {
        type: "array",
        description: "Every analyte/test row on the report (purity, identity, heavy metals, sterility, endotoxin, etc.)",
        items: {
          type: "object",
          properties: {
            section: { type: "string", description: "Group heading this row falls under, e.g. 'Purity', 'Heavy Metals'" },
            analyte: { type: "string" },
            limit_spec: { type: ["string", "null"], description: "Spec/limit column, e.g. '<10 ppm'" },
            result: { type: ["string", "null"] },
            unit: { type: ["string", "null"] },
            status: { type: ["string", "null"], description: "e.g. 'Pass', 'Fail', 'Conforms'" },
          },
          required: ["section", "analyte"],
        },
      },
      conformity_samples: {
        type: "array",
        description: "Per-sample conformity testing rows, if the report has them (e.g. multiple vial samples tested)",
        items: {
          type: "object",
          properties: {
            sample_label: { type: "string" },
            purity_pct: { type: ["number", "null"] },
            net_content_mg: { type: ["number", "null"] },
            identification: { type: ["string", "null"] },
            result: { type: ["string", "null"] },
            is_representative: { type: "boolean" },
          },
          required: ["sample_label"],
        },
      },
      stats: {
        type: "array",
        description: "Statistical summary rows, if present (e.g. mean purity across samples with std deviation)",
        items: {
          type: "object",
          properties: {
            metric_name: { type: "string" },
            mean_value: { type: ["number", "null"] },
            std_dev: { type: ["number", "null"] },
            unit: { type: ["string", "null"] },
          },
          required: ["metric_name"],
        },
      },
    },
    required: ["results", "conformity_samples", "stats"],
  },
};

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdminClient(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonError(
      501,
      "AI_PARSE_NOT_CONFIGURED",
      "ANTHROPIC_API_KEY is not set — add it to the app's .env to enable AI parsing. You can still fill the form manually."
    );
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const path = body?.path;
  const contentType = body?.contentType;
  if (!path || typeof path !== "string") {
    return jsonError(400, "MISSING_PATH", "path (from the upload step) is required");
  }

  const admin = createAdminClient();
  const { data: fileBlob, error: downloadError } = await admin.storage
    .from("research-lab-reports")
    .download(path);

  if (downloadError || !fileBlob) {
    return jsonError(404, "FILE_NOT_FOUND", downloadError?.message ?? "Could not read the uploaded file");
  }

  const base64 = Buffer.from(await fileBlob.arrayBuffer()).toString("base64");
  const isPdf = contentType === "application/pdf" || path.endsWith(".pdf");

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_coa_data" },
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
              : {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: (contentType || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp",
                    data: base64,
                  },
                },
            {
              type: "text",
              text: "This is a Certificate of Analysis (COA) for a research chemical. Extract every field you can find using the extract_coa_data tool. Leave anything not present on the document as null — do not infer or fabricate values.",
            },
          ],
        },
      ],
    });

    const toolUse = message.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (!toolUse) {
      return jsonError(502, "AI_PARSE_NO_RESULT", "Claude did not return structured data for this file");
    }

    return NextResponse.json({ ok: true, data: toolUse.input });
  } catch (err: any) {
    console.error("[lab-reports/parse] Claude request failed:", err);
    return jsonError(502, "AI_PARSE_FAILED", err?.message ?? "AI parsing failed");
  }
}
