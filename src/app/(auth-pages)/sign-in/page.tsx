// app/(auth-pages)/sign-in/page.tsx
import Link from "next/link";
import type { Metadata } from "next";

import { FormMessage, Message } from "@/components/form-message";
import SignInWithGoogle from "@/components/ui/SignInWithGoogle";
import { AuthBreadcrumbs } from "@/components/Auth/AuthBreadcrumbs";

// ✅ SigninWithPassword now does client-side auth — no server action or redirectTo needed
import SigninWithPassword from "@/components/Auth/SigninWithPassword";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your account.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Message>;
}) {
  const resolvedSearchParams = await searchParams;

  return (
    <div className="mx-auto w-full max-w-md rounded-[var(--radius)] bg-[hsl(var(--card))] shadow-[var(--shadow-xl)] p-6 md:p-8">
      <AuthBreadcrumbs current="Sign in" />

      <h1 className="text-2xl md:text-3xl font-[var(--font-serif)] font-bold text-center text-[hsl(var(--sidebar-primary))] mb-6 leading-[1.2]">
        Welcome Back
      </h1>

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