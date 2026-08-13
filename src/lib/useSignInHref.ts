"use client";

import { useEffect, useState } from "react";
import { CORE_DOMAIN } from "@/lib/multiZone";

/**
 * Builds the sign-in link for whatever zone this component is currently
 * rendered on. /sign-in only lives on the core zone (www.unenter.live) — a
 * plain relative href="/sign-in" 404s on every zone subdomain (shop, labs,
 * any future zone), since auth pages aren't in those zones' route
 * whitelists. This is for components reused across multiple zones (e.g.
 * ShopLayout's Header/MobileDrawer/auth-button) where the current zone
 * can't be known statically.
 *
 * Defaults to the relative path (correct, unchanged behavior on the core
 * zone) for the SSR pass / first paint, then upgrades to the correct
 * absolute cross-zone URL once mounted and window.location is available.
 * Found via E2E checkout test, 2026-08-06 — see utils/supabase/server.ts
 * and components/Layouts/labs/Header.tsx for the rest of the fix.
 */
export function useSignInHref(): string {
  const [href, setHref] = useState("/sign-in");

  useEffect(() => {
    const host = window.location.hostname.toLowerCase();
    const isCore = host === CORE_DOMAIN || host === `www.${CORE_DOMAIN}`;

    if (isCore) {
      setHref(`/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }

    const next = encodeURIComponent(window.location.href);
    setHref(`https://www.${CORE_DOMAIN}/sign-in?next=${next}`);
  }, []);

  return href;
}

/** Same idea as useSignInHref, for /sign-up links — see that hook's comment. */
export function useSignUpHref(): string {
  const [href, setHref] = useState("/sign-up");

  useEffect(() => {
    const host = window.location.hostname.toLowerCase();
    const isCore = host === CORE_DOMAIN || host === `www.${CORE_DOMAIN}`;
    setHref(isCore ? "/sign-up" : `https://www.${CORE_DOMAIN}/sign-up`);
  }, []);

  return href;
}
