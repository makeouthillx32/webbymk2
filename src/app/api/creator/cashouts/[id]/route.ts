// app/api/creator/cashouts/[id]/route.ts
// Admin: resolve a cash-out request — mark it paid (after paying the creator
// manually, outside this system) or failed (with a reason, balance stays put
// so they can be retried).
import { NextRequest, NextResponse } from "next/server";
import { requireCreatorAdmin } from "@/lib/creator-admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCreatorAdmin();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const body = await request.json();
  const { action, failure_reason, admin_notes } = body as {
    action: "paid" | "failed";
    failure_reason?: string;
    admin_notes?: string;
  };

  if (action !== "paid" && action !== "failed") {
    return NextResponse.json({ error: "action must be 'paid' or 'failed'" }, { status: 400 });
  }

  if (action === "failed" && !failure_reason?.trim()) {
    return NextResponse.json({ error: "failure_reason is required when marking a cash-out failed" }, { status: 400 });
  }

  const { data, error } = await guard.admin.rpc("resolve_creator_cashout", {
    p_cashout_id: id,
    p_action: action,
    p_failure_reason: failure_reason ?? null,
    p_admin_notes: admin_notes ?? null,
    p_resolved_by: guard.userId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ cashout: data });
}
