import { CORE_DOMAIN } from "@/lib/multiZone";
import { isLastPageExcluded } from "@/lib/protectedRoutes";

export function safePostAuthRedirect(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    return isLastPageExcluded(candidate) ? null : candidate;
  }

  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    const ownDomain = host === CORE_DOMAIN || host.endsWith(`.${CORE_DOMAIN}`);
    if (!ownDomain || url.protocol !== "https:" || isLastPageExcluded(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function buildOAuthCallbackUrl({
  currentOrigin,
  next,
  invite,
}: {
  currentOrigin: string;
  next?: string | null;
  invite?: string | null;
}) {
  const current = new URL(currentOrigin);
  const isLocal = current.hostname === "localhost" || current.hostname === "127.0.0.1";
  const callbackOrigin = isLocal ? current.origin : `https://auth.${CORE_DOMAIN}`;
  const callback = new URL("/auth/callback", callbackOrigin);
  const safeNext = safePostAuthRedirect(next);
  if (safeNext) callback.searchParams.set("next", safeNext);
  if (invite) callback.searchParams.set("invite", invite);
  return callback.toString();
}

export function buildOAuthStartUrl({
  currentOrigin,
  provider,
  next,
}: {
  currentOrigin: string;
  provider: "google" | "facebook";
  next?: string | null;
}) {
  const current = new URL(currentOrigin);
  const isLocal = current.hostname === "localhost" || current.hostname === "127.0.0.1";
  const authOrigin = isLocal ? current.origin : `https://auth.${CORE_DOMAIN}`;
  const start = new URL(`/auth/provider/${provider}`, authOrigin);
  const safeNext = safePostAuthRedirect(next);
  if (safeNext) start.searchParams.set("next", safeNext);
  return start.toString();
}

export function buildGlobalLogoutUrl(next?: string | null) {
  const logout = new URL(`/auth/logout`, `https://auth.${CORE_DOMAIN}`);
  const safeNext = safePostAuthRedirect(next);
  if (safeNext) logout.searchParams.set(`next`, safeNext);
  return logout.toString();
}
