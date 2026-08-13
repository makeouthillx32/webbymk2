import { NextResponse, type NextRequest } from "next/server";
import { populateUserCookies } from "@/actions/auth/cookies";
import { createClient } from "@/utils/supabase/server";
import { isLastPageExcluded } from "@/lib/protectedRoutes";

// Fallback is "/" — never a dashboard route. Was "/dashboard/me" in all three
// branches here, which (together with the same default in signUpAction/
// signInAction and /auth/sign-in/route.ts) is why sign-in always landed on
// the dashboard. Fixed 2026-08-12.
const safeRedirectPath = (candidate: unknown): string => {
  if (typeof candidate !== "string") return "/";
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("://")) {
    return "/";
  }
  if (isLastPageExcluded(candidate)) return "/";
  return candidate;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
  const redirectTo = safeRedirectPath(body.next);
  const remember = body.remember === true;

  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: "Missing session tokens" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error || !data.user?.id || !data.session) {
    return NextResponse.json(
      { error: error?.message || "Could not sync session" },
      { status: 401 }
    );
  }

  await populateUserCookies(data.user.id, remember);

  const separator = redirectTo.includes("?") ? "&" : "?";
  return NextResponse.json({ redirectTo: `${redirectTo}${separator}refresh=true` });
}
