import { NextRequest, NextResponse } from "next/server";
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

function appendExpiredHostCookie(response: NextResponse, name: string) {
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) return;
  response.headers.append(
    "Set-Cookie",
    [
      `${name}=`,
      "Path=/",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "Max-Age=0",
      "Secure",
      "SameSite=Lax",
    ].join("; "),
  );
}

export async function GET(request: NextRequest) {
  const requestedNext = safePostAuthRedirect(request.nextUrl.searchParams.get("next"));
  const target = requestedNext ?? `https://www.${CORE_DOMAIN}/`;
  const response = NextResponse.redirect(target);

  // This second response intentionally emits host-only deletions only. Next's
  // response-cookie layer coalesces same-name host and Domain variants when
  // they share one response, leaving historical auth.unenter.live cookies
  // behind. Splitting the cleanup across two redirects makes both scopes
  // independently observable and removable by the browser.
  for (const name of cookieNamesToExpire(request)) {
    appendExpiredHostCookie(response, name);
  }

  console.log("[Auth] 🚪 Global logout cookies cleared", { target });
  return response;
}
