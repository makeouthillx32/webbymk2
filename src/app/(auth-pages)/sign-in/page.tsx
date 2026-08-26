// app/(auth-pages)/sign-in/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { FormMessage, Message } from "@/components/form-message";
import SignInWithGoogle from "@/components/ui/SignInWithGoogle";
import { AuthBreadcrumbs } from "@/components/Auth/AuthBreadcrumbs";
import { getZoneContext } from "@/lib/zoneContext";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { isLastPageExcluded } from "@/lib/protectedRoutes";
import { CORE_DOMAIN } from "@/lib/multiZone";

// ✅ SigninWithPassword now does client-side auth — no server action or redirectTo needed
import SigninWithPassword from "@/components/Auth/SigninWithPassword";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your account.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const isBlockedAuthPath = (pathOnly: string): boolean =>
  pathOnly === "/sign-in" ||
  pathOnly === "/sign-up" ||
  pathOnly === "/forgot-password" ||
  pathOnly === "/reset-password" ||
  pathOnly.startsWith("/auth/");

// Same allowlist pattern used everywhere else this gets checked (actions.ts,
// route.ts, SigninWithPassword.tsx, mfa-challenge/page.tsx) — same-origin
// relative path, or an absolute *.unenter.live URL so a cross-zone "next"
// (or the lastPage cookie, which can be an absolute URL from any zone)
// still lands somewhere real instead of 404ing on core.
function safeRedirectTarget(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    const pathOnly = candidate.split("#")[0].split("?")[0];
    return isBlockedAuthPath(pathOnly) ? null : candidate;
  }
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    const isOwnDomain = host === CORE_DOMAIN || host.endsWith(`.${CORE_DOMAIN}`);
    if (!isOwnDomain || (url.protocol !== "https:" && url.protocol !== "http:")) return null;
    return isBlockedAuthPath(url.pathname) ? null : url.toString();
  } catch {
    return null;
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Message & { next?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const zoneContext = await getZoneContext();

  // Already signed in — don't show the form again, send them back to
  // wherever they actually came from (an explicit ?next=, or the zone/page
  // the lastPage cookie captured) instead of stranding them on a sign-in
  // page they don't need. Falls back to home, never a dashboard route (same
  // rule signInAction/signUpAction follow — dashboard must never be an
  // implicit landing spot).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const nextParam =
      typeof resolvedSearchParams?.next === "string" ? resolvedSearchParams.next : null;
    // Peek only, don't clear — a Server Component can read cookies but not
    // write/delete them (Next.js throws "Cookies can only be modified in a
    // Server Action or Route Handler" otherwise, confirmed 2026-08-17). The
    // cookie naturally gets consumed the normal way on an actual sign-in.
    const cookieStore = await cookies();
    const rawLastPage = cookieStore.get("lastPage")?.value ?? null;
    const lastPage = rawLastPage && !isLastPageExcluded(rawLastPage) ? rawLastPage : null;
    const signedInFallback =
      zoneContext.zone === "auth" ? `https://www.${CORE_DOMAIN}/` : "/";
    const target =
      safeRedirectTarget(nextParam) ??
      safeRedirectTarget(lastPage) ??
      signedInFallback;
    redirect(target);
  }

  const isResearcherContext = zoneContext.zone === "labs";

  return (
    <div className="mx-auto w-full max-w-md rounded-[var(--radius)] bg-[hsl(var(--card))] shadow-[var(--shadow-xl)] p-6 md:p-8">
      <AuthBreadcrumbs current="Sign in" />

      <h1 className="text-2xl md:text-3xl font-[var(--font-serif)] font-bold text-center text-[hsl(var(--sidebar-primary))] mb-2 leading-[1.2]">
        {isResearcherContext ? "Researcher Sign In" : "Welcome Back"}
      </h1>
      {isResearcherContext && (
        <p className="text-center text-sm text-[hsl(var(--muted-foreground))] font-[var(--font-sans)] mb-4">
          Sign in to checkout with research products. Uses the same account as the shop.
        </p>
      )}

      <div className="w-full flex justify-center">
        <div className="w-full max-w-[520px]">
          <SignInWithGoogle />
        </div>
      </div>

      <div className="flex items-center my-6">
        <div className="flex-grow border-t border-[hsl(var(--border))]" />
        <span className="mx-4 text-sm font-[var(--font-sans)] text-[hsl(var(--muted-foreground))]">
          OR
        </span>
        <div className="flex-grow border-t border-[hsl(var(--border))]" />
      </div>

      {/* ✅ Client-side sign-in — fires onAuthStateChange("SIGNED_IN") natively */}
      <SigninWithPassword />

      <FormMessage message={resolvedSearchParams} />

      <p className="mt-6 text-center text-sm text-[hsl(var(--muted-foreground))] font-[var(--font-sans)] leading-[1.5]">
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-[hsl(var(--sidebar-primary))] hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
