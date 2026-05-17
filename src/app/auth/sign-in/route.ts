import { NextResponse, type NextRequest } from "next/server";
import { populateUserCookies } from "@/actions/auth/cookies";
import { authLogger } from "@/lib/authLogger";
import { createClient } from "@/utils/supabase/server";

const safeRedirectPath = (candidate: FormDataEntryValue | null): string | null => {
  if (typeof candidate !== "string") return null;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("://")) {
    return null;
  }

  const pathOnly = candidate.split("#")[0].split("?")[0];
  if (
    pathOnly === "/sign-in" ||
    pathOnly === "/sign-up" ||
    pathOnly === "/forgot-password" ||
    pathOnly === "/reset-password" ||
    pathOnly.startsWith("/auth/")
  ) {
    return null;
  }

  return candidate;
};

const getPublicOrigin = (request: NextRequest) => {
  const firstHeaderValue = (value: string | null) => value?.split(",")[0]?.trim() || null;
  const host =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ||
    firstHeaderValue(request.headers.get("host")) ||
    request.nextUrl.host;
  const proto =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ||
    request.nextUrl.protocol.replace(":", "") ||
    "https";

  return `${proto}://${host}`;
};

const redirectTo = (request: NextRequest, path: string) => {
  return NextResponse.redirect(new URL(path, getPublicOrigin(request)), 303);
};

const redirectWithError = (request: NextRequest, message: string) => {
  const url = new URL("/sign-in", getPublicOrigin(request));
  url.searchParams.set("next", "/dashboard/me");
  url.searchParams.set("error", "auth_failed");
  url.searchParams.set("message", message);
  return NextResponse.redirect(url, 303);
};

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = formData.get("email")?.toString().trim() || "";
  const password = formData.get("password")?.toString() || "";
  const rememberValue = formData.get("remember")?.toString();
  const remember = rememberValue === "true" || rememberValue === "on";
  const nextPath = safeRedirectPath(formData.get("next")) ?? "/dashboard/me";

  console.log("[Auth] Sign-in route attempt:", { email, remember, nextPath });

  if (!email || !password) {
    return redirectWithError(request, "Email and password are required.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return redirectWithError(request, error.message);
  if (!data.user?.id || !data.session) {
    return redirectWithError(request, "Authentication failed.");
  }

  authLogger.memberSignIn(data.user.id, data.user.email || "", remember);
  await populateUserCookies(data.user.id, remember);

  const separator = nextPath.includes("?") ? "&" : "?";
  return redirectTo(request, `${nextPath}${separator}refresh=true`);
}
