import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

// Whether the current request is from staff, and nothing more.
//
// Identity is verified against Supabase Auth, then authorization is read from
// the canonical core `profiles.role` record through the server-only admin
// client. This deliberately matches the Tank admin page guard. Relying only on
// JWT app_metadata made staff access drift until a token refresh, while using
// user_metadata would be unsafe because users can edit it themselves.

export type StaffUser = { id: string; role: "admin" | "moderator" };

/**
 * Why a request may not control the house. "signed-out" and "not-staff" need
 * different fixes from the operator (sign in again vs. use a staff account), so
 * the director console shows them differently instead of silently snapping back
 * to the server's mode (the "it keeps going back to Dog" bug, 2026-09-19).
 */
export type StaffDenial = "signed-out" | "not-staff" | "unavailable";

export type StaffCheck = { staff: StaffUser; denial: null } | { staff: null; denial: StaffDenial };

export async function checkStaff(): Promise<StaffCheck> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { staff: null, denial: "signed-out" };

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // A failed lookup is not proof the user is not staff; say so honestly.
  if (error) return { staff: null, denial: "unavailable" };
  const role = String(profile?.role ?? "");
  if (role !== "admin" && role !== "moderator") return { staff: null, denial: "not-staff" };

  return { staff: { id: user.id, role }, denial: null };
}

export async function requireStaff(): Promise<StaffUser | null> {
  return (await checkStaff()).staff;
}

/** HTTP status + body for a denial: 401 signed out, 403 not staff, 503 lookup failed. */
export function staffDenialResponse(denial: StaffDenial): { status: number; body: { error: string; denial: StaffDenial } } {
  if (denial === "signed-out") return { status: 401, body: { error: "Sign in to control the director", denial } };
  if (denial === "not-staff") return { status: 403, body: { error: "This account is not Tank staff", denial } };
  return { status: 503, body: { error: "Could not check your staff access; try again", denial } };
}
