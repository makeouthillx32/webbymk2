// app/(auth-pages)/mfa-challenge/page.tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthBreadcrumbs } from "@/components/Auth/AuthBreadcrumbs";
import { CORE_DOMAIN } from "@/lib/multiZone";
import { createBrowserClient } from "@/utils/supabase/client";
import { populateCookiesAction } from "@/actions/auth/actions";

const isBlockedAuthPath = (pathOnly: string): boolean =>
  pathOnly === "/sign-in" ||
  pathOnly === "/sign-up" ||
  pathOnly === "/forgot-password" ||
  pathOnly === "/reset-password" ||
  pathOnly.startsWith("/auth/");

// Same allowlist as SigninWithPassword.tsx / actions/auth/actions.ts — this
// page can be reached directly by URL, so `next` gets re-validated here too
// rather than trusted just because it came from our own earlier redirect.
const getSafeRedirectPath = (candidate: string | null): string => {
  if (!candidate) return "/";
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    const pathOnly = candidate.split("#")[0].split("?")[0];
    return isBlockedAuthPath(pathOnly) ? "/" : candidate;
  }
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    const isOwnDomain = host === CORE_DOMAIN || host.endsWith(`.${CORE_DOMAIN}`);
    if (!isOwnDomain || (url.protocol !== "https:" && url.protocol !== "http:")) return "/";
    return isBlockedAuthPath(url.pathname) ? "/" : url.toString();
  } catch {
    return "/";
  }
};

export default function MfaChallengePage() {
  const searchParams = useSearchParams();
  const next = getSafeRedirectPath(searchParams.get("next"));
  const remember = searchParams.get("remember") === "true";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);

    const supabase = createBrowserClient();

    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    const factor = factorsData?.totp.find((item) => item.status === "verified");
    if (factorsError || !factor) {
      setBusy(false);
      setError("No verified authenticator found for this account.");
      return;
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: factor.id,
    });
    if (challengeError) {
      setBusy(false);
      setError(challengeError.message);
      return;
    }

    const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      code,
    });
    if (verifyError || !verifyData?.user) {
      setBusy(false);
      setCode("");
      setError(verifyError?.message || "That code didn't work — try again.");
      return;
    }

    await populateCookiesAction(verifyData.user.id, remember);

    // Full navigation, not the client router — `next` may be an absolute
    // cross-zone URL (a different *.unenter.live host), which router.push()
    // cannot cross.
    window.location.href = next;
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-[var(--radius)] bg-[hsl(var(--card))] shadow-[var(--shadow-xl)] p-6 md:p-8">
      <AuthBreadcrumbs current="Two-factor verification" />

      <h1 className="text-2xl md:text-3xl font-[var(--font-serif)] font-bold text-center text-[hsl(var(--sidebar-primary))] mb-2 leading-[1.2]">
        Two-factor verification
      </h1>
      <p className="text-center text-sm text-[hsl(var(--muted-foreground))] font-[var(--font-sans)] mb-6">
        Enter the 6-digit code from your authenticator app.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          placeholder="000000"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-4 py-3 text-center text-lg tracking-[0.5em] text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--sidebar-primary))]"
        />

        {error && (
          <p className="text-center text-sm text-red-500" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="flex w-full items-center justify-center gap-2 rounded-md py-3 px-4 font-medium text-[hsl(var(--sidebar-primary-foreground))] bg-[hsl(var(--sidebar-primary))] hover:bg-[hsl(var(--sidebar-primary))]/90 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? "Verifying…" : "Verify"}
        </button>
      </form>
    </div>
  );
}
