import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export async function GET() {
  // Create Supabase client
  const supabase = await createClient();

  // Sign out from Supabase
  await supabase.auth.signOut();

  // ✅ Await cookies() before accessing methods (Next.js 15)
  const store = await cookies();
  
  // Delete ALL auth-related cookies
  store.delete("userRole");
  store.delete("userRoleUserId");
  store.delete("userDisplayName");
  store.delete("userPermissions");
  store.delete("rememberMe");
  store.delete("lastPage"); // ✅ CRITICAL: Always clear lastPage on logout

  console.log("[Auth] 🚪 Logged out, redirecting to home");

  // ✅ ALWAYS redirect to home after logout (never use lastPage)
  // This prevents getting stuck on /sign-in
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL("/", baseUrl));
}