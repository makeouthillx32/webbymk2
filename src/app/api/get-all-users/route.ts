import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type ProfileRow = {
  id: string;
  role: string | null;
  avatar_url: string | null;
  initials: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  region: string | null;
  email: string |null;
  created_at: string | null;
  last_seen_at: string | null;
  deleted_at: string | null;
};

export async function GET() {
  const supabase = await createClient("service");
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id,role,avatar_url,initials,display_name,first_name,last_name,region,email,created_at,last_seen_at,deleted_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: authList, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    const simplified = (profiles as ProfileRow[]).map((p) => ({
      id: p.id,
      display_name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.display_name || "Guest",
      avatar_url: p.avatar_url,
      role: (p.role || "guest") as "admin" | "member" | "guest",
      email: p.email,
      created_at: p.created_at,
      last_sign_in_at: p.last_seen_at,
      email_confirmed_at: null,
      auth_providers: [] as string[],
    }));
    return NextResponse.json(simplified);
  }
  const authById = new Map(authList.users.map((u) => [u.id, u] as const));
  const merged = (profiles as ProfileRow[]).map((p) => {
    const authUser = authById.get(p.id);
    const providers = Array.isArray((authUser as any)?.app_metadata?.providers)
      ? (authUser as any).app_metadata.providers
      : (authUser as any)?.app_metadata?.provider
        ? [(authUser as any).app_metadata.provider]
        : [];
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    return {
      id: p.id,
      display_name: fullName || p.display_name || (authUser as any)?.user_metadata?.display_name || "Guest",
      avatar_url: p.avatar_url,
      role: (p.role || "guest") as "admin" | "member" | "guest",
      email: (authUser as any)?.email || p.email || null,
      created_at: (authUser as any)?.created_at || p.created_at || null,
      last_sign_in_at: (authUser as any)?.last_sign_in_at || p.last_seen_at || null,
      email_confirmed_at: (authUser as any)?.confirmed_at || null,
      auth_providers: providers,
    };
  });
  return NextResponse.json(merged);
}
