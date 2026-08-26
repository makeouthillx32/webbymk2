// app/research-access/page.tsx
// Deliberate opt-in upgrade to researcher (research-compound checkout
// eligibility). Protected route — see src/lib/protectedRoutes.ts — so an
// unauthenticated visitor is bounced through sign-in first, landing back
// here afterward.
import type { Metadata } from "next";
import Link from "next/link";

import { requestResearcherAccessAction } from "@/actions/auth/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/utils/supabase/server";

export const metadata: Metadata = {
  title: "Research access",
  description: "Upgrade your account for research-compound checkout eligibility.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ResearchAccessPage({
  searchParams,
}: {
  searchParams: Promise<Message>;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    role = profile?.role ?? null;
  }

  const alreadyEligible = role === "researcher" || role === "admin";

  return (
    <div className="mx-auto w-full max-w-xl rounded-[var(--radius)] bg-[hsl(var(--card))] shadow-[var(--shadow-xl)] p-6 md:p-8">
      <h1 className="text-2xl md:text-3xl font-[var(--font-serif)] font-bold text-center text-[hsl(var(--sidebar-primary))] mb-2 leading-[1.2]">
        Research access
      </h1>

      {alreadyEligible ? (
        <p className="text-center text-sm text-[hsl(var(--muted-foreground))] font-[var(--font-sans)]">
          Your account already has research-compound checkout access.{" "}
          <Link href="/products" className="underline hover:text-[hsl(var(--sidebar-primary))]">
            Browse products
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="text-center text-sm text-[hsl(var(--muted-foreground))] font-[var(--font-sans)] mb-6">
            Research compounds are restricted to accounts that accept our research-use
            terms. This is a one-time upgrade — your regular account, chat, and everything
            else you've already set up stays exactly as it is.
          </p>

          <form className="space-y-6" action={requestResearcherAccessAction}>
            <div className="flex items-start gap-2.5">
              <input
                id="accept_research_terms"
                name="accept_research_terms"
                type="checkbox"
                required
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[hsl(var(--border))] text-[hsl(var(--sidebar-primary))] focus:ring-[hsl(var(--sidebar-ring))]"
              />
              <label
                htmlFor="accept_research_terms"
                className="text-xs font-normal leading-relaxed text-[hsl(var(--muted-foreground))] font-[var(--font-sans)]"
              >
                I confirm I am purchasing for research purposes only and agree to the{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  className="underline hover:text-[hsl(var(--sidebar-primary))] transition-colors duration-200"
                >
                  research-use terms
                </Link>
                .
              </label>
            </div>

            <SubmitButton
              pendingText="Upgrading..."
              className="w-full bg-[hsl(var(--sidebar-primary))] hover:bg-[hsl(var(--sidebar-primary))]/90 text-[hsl(var(--sidebar-primary-foreground))] py-2.5 rounded-[var(--radius)] font-[var(--font-sans)] font-medium transition-colors duration-200 shadow-[var(--shadow-sm)]"
            >
              Unlock research checkout
            </SubmitButton>
          </form>
        </>
      )}

      <FormMessage message={resolvedSearchParams} />
    </div>
  );
}
