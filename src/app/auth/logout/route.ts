import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { clearAuthCookies } from "@/actions/auth/cookies";
import { safePostAuthRedirect } from "@/lib/authRedirect";
import { CORE_DOMAIN } from "@/lib/multiZone";

const APP_AUTH_COOKIE_NAMES = [
  "userRole",
  "userRoleUserId",
  "userDisplayName",
  "userPermissions",
  "rememberMe",
  "lastPage",
];

function cookieNamesToExpire(request: NextRequest) {
  const names = new Set(APP_AUTH_COOKIE_NAMES);
  for (const { name } of request.cookies.getAll()) {
    if (
      name.startsWith("sb-") &&
      (name.includes("auth-token") || name.includes("code-verifier"))
    ) {
      names.add(name);
    }
  }
  for (let part = 0; part < 6; part += 1) {
    names.add(`sb-unenter-auth-token.${part}`);
  }
  names.add("sb-unenter-auth-token");
  names.add("sb-unenter-auth-token-code-verifier");
  return names;
}

function appendExpiredCookie(
  response: NextResponse,
  name: string,
  domain?: string,
) {
  // Cookie names supplied by Next's parser should already be valid, but keep
  // request-derived names out of a raw response header unless they satisfy
  // the RFC token character set.
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) return;
  const attributes = [
    `${name}=`,
    "Path=/",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    "Secure",
    "SameSite=Lax",
  ];
  if (domain) attributes.splice(2, 0, `Domain=${domain}`);
  response.headers.append("Set-Cookie", attributes.join("; "));
}

export async function GET(request: NextRequest) {
  // Create Supabase client
  const supabase = await createClient();

  // Revoke the refresh session when possible, then clear every local cookie
  // variant even if the session itself is already stale.
  await supabase.auth.signOut();
  await clearAuthCookies();

  const requestedNext = safePostAuthRedirect(request.nextUrl.searchParams.get("next"));
  const target = requestedNext ?? `https://www.${CORE_DOMAIN}/`;
  // request.nextUrl.origin is the container's 0.0.0.0:3000 origin behind the
  // production proxy, so this interstitial must use the canonical public host.
  const finishUrl = new URL(
    "/auth/logout/finish",
    `https://auth.${CORE_DOMAIN}`,
  );
  finishUrl.searchParams.set("next", target);
  const response = NextResponse.redirect(finishUrl);

  for (const name of cookieNamesToExpire(request)) {
    // Clear a historical auth.unenter.live host-only cookie.
    appendExpiredCookie(response, name);
    // Clear the shared session visible to every zone.
    appendExpiredCookie(response, name, `.${CORE_DOMAIN}`);
  }

  console.log("[Auth] 🚪 Global logout session cleared", { target });

  return response;
}
