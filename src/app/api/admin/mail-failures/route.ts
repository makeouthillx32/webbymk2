// app/api/admin/mail-failures/route.ts
// GET /api/admin/mail-failures
// Recent transactional-email failures (src/lib/mail/client.ts writes these).
// Guardrail added 2026-08-08 after the poste.io blacklist + self-signed-cert
// incidents both went unnoticed for an unknown window — nobody was tailing
// container logs. See vault/Core/access-denied-reload-loop-2026-08-08.md.
//
// mail_failures has RLS enabled with no anon/authenticated policies (service
// role only, by design — it's internal diagnostic data), so this route uses
// requireAdmin() for the access check and createAdminClient() to actually
// read the rows.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET() {
  await requireAdmin(); // redirects non-admins — throws before we get here otherwise

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mail_failures")
    .select("id, created_at, to_email, subject, reason, order_id, context")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("[mail-failures] Failed to load recent failures:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ failures: data ?? [] });
}
