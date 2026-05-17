import { NextResponse, type NextRequest } from "next/server";
import { populateUserCookies } from "@/actions/auth/cookies";
import { createClient } from "@/utils/supabase/server";

const safeRedirectPath = (candidate: unknown): string => {
  if (typeof candidate !== "string") return "/dashboard/me";
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("://")) {
    return "/dashboard/me";
  }

  const pathOnly = candidate.split("#")[0].split("?")[0];
  if (
    pathOnly === "/sign-in" ||
    pathOnly === "/sign-up" ||
    pathOnly === "/forgot-password" ||
    pathOnly === "/reset-password" ||
    pathOnly.startsWith("/auth/")
  ) {
    return "/dashboard/me";
  }

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
