// app/api/roles/stats/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

// job_coach/client were roles from a pre-unenter.live version of this app —
// the live roles table (see invite_security_lockdown_and_role_ladder) is
// admin/member/guest/researcher/affiliate.
const ROLE_ORDER = ["admin", "affiliate", "researcher", "member", "guest"] as const;
type RoleType = (typeof ROLE_ORDER)[number];

export async function GET() {
  // Admin check was commented out — any signed-in user could view role
  // counts across every account. Low severity (aggregate only) but
  // re-enabled 2026-08-10 alongside the invite-system audit.
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  // Fetch roles and count in JS (simple + reliable)
  const { data: rows, error } = await guard.admin
    .from("profiles")
    .select("role");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts: Record<RoleType, number> = {
    admin: 0,
    affiliate: 0,
    researcher: 0,
    member: 0,
    guest: 0,
  };

  for (const r of rows ?? []) {
    const role = r.role as RoleType;
    if (role in counts) counts[role] += 1;
  }

  return NextResponse.json({
    roles: ROLE_ORDER.map((role) => ({ role, count: counts[role] })),
  });
}
