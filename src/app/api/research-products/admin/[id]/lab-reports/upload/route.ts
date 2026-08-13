// app/api/research-products/admin/[id]/lab-reports/upload/route.ts
//
// Uploads the raw CoA file (PDF or scanned image) a lab sent us to the
// research-lab-reports storage bucket, returns its public URL. This is
// step 1 of the "upload a CoA" flow — the admin picks the file here, then
// either pastes the returned URL onto a report (or, more usefully, hits
// "Parse with AI" — see ../parse/route.ts — which reads the same file back
// out of storage and tries to fill in the rest of the form).
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdminClient } from "@/lib/require-admin";

type Params = { params: Promise<{ id: string }> };

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB, matches the bucket's file_size_limit

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdminClient(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { id: productId } = await params;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return jsonError(400, "MISSING_FILE", "No file provided");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return jsonError(400, "INVALID_FILE_TYPE", "Only PDF, JPEG, PNG, or WEBP files are accepted");
  }
  if (file.size > MAX_BYTES) {
    return jsonError(400, "FILE_TOO_LARGE", "File must be 20 MB or smaller");
  }

  const admin = createAdminClient();

  const ext = file.name.split(".").pop()?.toLowerCase() || (file.type === "application/pdf" ? "pdf" : "jpg");
  const objectPath = `${productId}/${crypto.randomUUID()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from("research-lab-reports")
    .upload(objectPath, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    return jsonError(500, "UPLOAD_FAILED", uploadError.message);
  }

  const { data: publicUrlData } = admin.storage.from("research-lab-reports").getPublicUrl(objectPath);

  return NextResponse.json({
    ok: true,
    data: {
      path: objectPath,
      url: publicUrlData.publicUrl,
      contentType: file.type,
    },
  });
}
