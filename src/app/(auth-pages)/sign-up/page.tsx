// app/(auth-pages)/sign-up/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { signUpAction } from "@/actions/auth/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/Layouts/app/input";
import { Label } from "@/components/ui/label";
import SignInWithGoogle from "@/components/ui/SignInWithGoogle";
import { Mail, Lock, User } from "lucide-react";

// ✅ If you added the breadcrumbs component earlier:
import { AuthBreadcrumbs } from "@/components/Auth/AuthBreadcrumbs";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a new account to access your account.",
};

type SearchParams = Message & {
  invite?: string;
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const cookieStore = await cookies();

  // Invite is URL-driven (generated links). Cookie fallback optional.
  const inviteFromQuery =
    typeof searchParams?.invite === "string" ? searchParams.invite : "";
  const inviteFromCookie = cookieStore.get("invite")?.value ?? "";
  const invite = inviteFromQuery || inviteFromCookie || "";

  // ✅ Error/message state should still render as a “card”, not a full-screen wrapper
  if ("message" in searchParams) {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-[var(--radius)] bg-[hsl(var(--card))] shadow-[var(--shadow-xl)] p-8 md:p-10">
        <AuthBreadcrumbs current="Sign up" />
        <FormMessage message={searchParams} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl rounded-[var(--radius)] bg-[hsl(var(--card))] shadow-[var(--shadow-xl)] p-8 md:p-10">
      <AuthBreadcrumbs current="Sign up" />

      <h1 className="text-3xl md:text-4xl font-[var(--font-serif)] font-bold text-center text-[hsl(var(--sidebar-primary))] mb-2 leading-[1.2]">
        Create an Account
      </h1>
      <p className="text-center text-sm text-[hsl(var(--muted-foreground))] font-[var(--font-sans)] mb-6">
        Join Desert Cowgirl and start shopping faster.
      </p>

      {/* ✅ Google button now uses w-full internally, so it will center correctly */}
      <SignInWithGoogle />

      <div className="flex items-center my-6">
        <div className="flex-grow border-t border-[hsl(var(--border))]" />
        <span className="mx-4 text-sm font-[var(--font-sans)] text-[hsl(var(--muted-foreground))]">
          OR
        </span>
        <div className="flex-grow border-t border-[hsl(var(--border))]" />
      </div>

      <form className="space-y-6" action={signUpAction}>
        {/* Hidden invite only (NO manual entry field) */}
        <input type="hidden" name="invite" value={invite} />

        {/* first + last name (matches signUpAction) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label
              htmlFor="first_name"
              className="font-[var(--font-sans)] text-[hsl(var(--foreground))]"
            >
              First name
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]">
                <User size={18} />
              </span>
              <Input
                id="first_name"
                name="first_name"
                type="text"
                placeholder="Jane"
                required
                className="pl-10 border-[hsl(var(--border))] bg-[hsl(var(--input))] text-[hsl(var(--foreground))] font-[var(--font-sans)] rounded-[var(--radius)] focus:ring-[hsl(var(--sidebar-ring))] focus:border-[hsl(var(--sidebar-primary))]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="last_name"
              className="font-[var(--font-sans)] text-[hsl(var(--foreground))]"
            >
              Last name
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]">
                <User size={18} />
              </span>
              <Input
                id="last_name"
                name="last_name"
                type="text"
                placeholder="Doe"
                required
                className="pl-10 border-[hsl(var(--border))] bg-[hsl(var(--input))] text-[hsl(var(--foreground))] font-[var(--font-sans)] rounded-[var(--radius)] focus:ring-[hsl(var(--sidebar-ring))] focus:border-[hsl(var(--sidebar-primary))]"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="email"
            className="font-[var(--font-sans)] text-[hsl(var(--foreground))]"
          >
            Email address
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]">
              <Mail size={18} />
            </span>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              className="pl-10 border-[hsl(var(--border))] bg-[hsl(var(--input))] text-[hsl(var(--foreground))] font-[var(--font-sans)] rounded-[var(--radius)] focus:ring-[hsl(var(--sidebar-ring))] focus:border-[hsl(var(--sidebar-primary))]"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="password"
            className="font-[var(--font-sans)] text-[hsl(var(--foreground))]"
          >
            Password
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]">
              <Lock size={18} />
            </span>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="At least 6 characters"
              minLength={6}
              required
              className="pl-10 border-[hsl(var(--border))] bg-[hsl(var(--input))] text-[hsl(var(--foreground))] font-[var(--font-sans)] rounded-[var(--radius)] focus:ring-[hsl(var(--sidebar-ring))] focus:border-[hsl(var(--sidebar-primary))]"
            />
          </div>
        </div>

        <SubmitButton
          pendingText="Creating..."
          className="w-full bg-[hsl(var(--sidebar-primary))] hover:bg-[hsl(var(--sidebar-primary))]/90 text-[hsl(var(--sidebar-primary-foreground))] py-2.5 rounded-[var(--radius)] font-[var(--font-sans)] font-medium transition-colors duration-200 shadow-[var(--shadow-sm)]"
        >
          Create Account
        </SubmitButton>
      </form>

      <p className="text-center text-sm mt-6 text-[hsl(var(--muted-foreground))] font-[var(--font-sans)] leading-[1.5]">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="text-[hsl(var(--sidebar-primary))] hover:underline transition-all duration-200"
        >
          Sign in
        </Link>
      </p>

      <p className="mt-4 text-center text-xs text-[hsl(var(--muted-foreground))] font-[var(--font-sans)] leading-[1.5]">
        By signing up, you agree to our{" "}
        <Link
          href="/terms"
          className="underline hover:text-[hsl(var(--sidebar-primary))] transition-colors duration-200"
        >
          Terms
        </Link>{" "}
        and{" "}
        <Link
          href="/privacy"
          className="underline hover:text-[hsl(var(--sidebar-primary))] transition-colors duration-200"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}