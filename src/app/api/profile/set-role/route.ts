// app/api/members/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const ALLOWED_ROLES = new Set(["admin", "member", "guest"]);

function normalizeRole(input: any) {
  const v = String(input || "").toLowerCase().trim();
  return ALLOWED_ROLES.has(v) ? v : "member";
}

// Minimal admin check: caller must be signed-in AND have profile.role === "admin"
async function requireAdmin(supabase: any) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: meProfile } = await supabase
    .from("profiles")
    .select("role")
    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
    .maybeSingle();

  if (!meProfile || normalizeRole(meProfile.role) !== "admin") {
    return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, user };
}

export async function GET() {
  // Use service client because we need auth.admin.listUsers() to enrich emails/providers
  const supabase = await createClient("service");

  // OPTIONAL: lock this endpoint behind admin only
  // If you want storefront staff access only, keep it on.
  // If you want it visible to regular users, remove this block.
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.res;

  // 1) Pull all profiles (guests + members + admins)
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id,user_id,role,display_name,avatar_url,created_at")
    .order("created_at", { ascending: false });

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const profileList = profiles || [];

  // 2) Pull all auth users (service role required)
  // This gets email, last_sign_in_at, providers
  const authMap = new Map<string, any>();

  try {
    let page = 1;
    const perPage = 1000;

    // paginate until empty
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) throw error;

      const users = data?.users || [];
      for (const u of users) authMap.set(u.id, u);

      if (users.length < perPage) break;
      page += 1;
    }
  } catch (e: any) {
    // If this fails, we still return profiles (guests will still work)
    console.error("members: auth.admin.listUsers failed:", e?.message || e);
  }

  // 3) Merge
  const merged = profileList.map((p: any) => {
    const u = p.user_id ? authMap.get(p.user_id) : null;
    const providers =
      u?.app_metadata?.providers ||
      (u?.app_metadata?.provider ? [u.app_metadata.provider] : []) ||
      [];

    return {
      id: p.id,
      user_id: p.user_id ?? null,

      role: normalizeRole(p.role),
      display_name: p.display_name ?? (u?.user_metadata?.display_name || u?.user_metadata?.full_name || null),
      avatar_url: p.avatar_url ?? null,

      created_at: p.created_at ?? null,

      // auth-enriched (nullable)
      email: u?.email ?? null,
      last_sign_in_at: u?.last_sign_in_at ?? null,
      email_confirmed_at: u?.email_confirmed_at ?? null,
      auth_providers: Array.isArray(providers) ? providers : [],
    };
  });

  return NextResponse.json({ members: merged });
}
