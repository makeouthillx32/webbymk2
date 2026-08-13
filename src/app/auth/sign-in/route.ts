import { NextResponse, type NextRequest } from "next/server";
import { populateUserCookies, getAndClearLastPage } from "@/actions/auth/cookies";
import { authLogger } from "@/lib/authLogger";
import { createClient } from "@/utils/supabase/server";
import { CORE_DOMAIN } from "@/lib/multiZone";

const isBlockedAuthPath = (pathOnly: string): boolean =>
  pathOnly === "/sign-in" ||
  pathOnly === "/sign-up" ||
  pathOnly === "/forgot-password" ||
  pathOnly === "/reset-password" ||
  pathOnly.startsWith("/auth/");

const safeRedirectPath = (candidate: FormDataEntryValue | null): string | null => {
  if (typeof candidate !== "string" || !candidate) return null;

  // Same-origin relative path — original behavior.
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    const pathOnly = candidate.split("#")[0].split("?")[0];
    return isBlockedAuthPath(pathOnly) ? null : candidate;
  }

  // Cross-zone absolute URL. Sign-in only lives on the core zone, so a
  // visitor bounced here from labs.unenter.live (or any other zone) needs
  // `next` to send them back to that zone — redirectTo() below already
  // honors an absolute URL's own origin via `new URL(path, origin)`.
  // Restricted to *.unenter.live / unenter.live so this can't become an
  // open redirect. Found via E2E checkout test, 2026-08-06.
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    const isOwnDomain = host === CORE_DOMAIN || host.endsWith(`.${CORE_DOMAIN}`);
    if (!isOwnDomain) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (isBlockedAuthPath(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
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

const redirectWithError = (request: NextRequest, message: string, explicitNext: string | null) => {
  const url = new URL("/sign-in", getPublicOrigin(request));
  // Preserve a real explicit `next` (e.g. bounced here mid-checkout) across
  // a failed attempt so a retry still lands where they were headed — but
  // never re-prime it with a dashboard default. The lastPage-cookie fallback
  // deliberately does NOT get re-threaded here: getAndClearLastPage() already
  // consumed it above, and re-deriving it isn't worth the complexity for a
  // failed-login edge case that just falls back to "/" on retry instead.
  if (explicitNext) url.searchParams.set("next", explicitNext);
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
  const explicitNext = safeRedirectPath(formData.get("next"));
  // Honor an explicit `next` first, then fall back to the captured last page,
  // then home — never a dashboard route (see signInAction in
  // actions/auth/actions.ts, which this route mirrors). This route previously
  // ignored the lastPage cookie entirely and always fell back to
  // /dashboard/me, which is what was sending everyone to the dashboard after
  // sign-in. Fixed 2026-08-12.
  const nextPath = explicitNext ?? safeRedirectPath(await getAndClearLastPage()) ?? "/";

  console.log("[Auth] Sign-in route attempt:", { email, remember, nextPath });

  if (!email || !password) {
    return redirectWithError(request, "Email and password are required.", explicitNext);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return redirectWithError(request, error.message, explicitNext);
  if (!data.user?.id || !data.session) {
    return redirectWithError(request, "Authentication failed.", explicitNext);
  }

  authLogger.memberSignIn(data.user.id, data.user.email || "", remember);
  await populateUserCookies(data.user.id, remember);

  const separator = nextPath.includes("?") ? "&" : "?";
  return redirectTo(request, `${nextPath}${separator}refresh=true`);
}
