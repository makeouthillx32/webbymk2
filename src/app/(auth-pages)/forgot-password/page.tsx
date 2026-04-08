// app/(auth-pages)/forgot-password/page.tsx
import { forgotPasswordAction } from "@/actions/auth";
import { FormMessage, Message } from "@/components/form-message";
import { AuthBreadcrumbs } from "@/components/Auth/AuthBreadcrumbs";
import { SubmitButton } from "@/components/submit-button";
import { Mail } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Reset your Desert Cowgirl account password.",
};

export default async function ForgotPasswordPage(props: {
  searchParams: Promise<Message>;
}) {
  const searchParams = await props.searchParams;

  return (
    <div className="mx-auto w-full max-w-md rounded-[var(--radius)] bg-[hsl(var(--card))] shadow-[var(--shadow-xl)] p-6 md:p-8">
      <AuthBreadcrumbs current="Reset Password" />

      <h1 className="text-2xl md:text-3xl font-[var(--font-serif)] font-bold text-center text-[hsl(var(--sidebar-primary))] mb-2 leading-[1.2]">
        Forgot Your Password?
      </h1>
      <p className="text-center text-sm text-[hsl(var(--muted-foreground))] font-[var(--font-sans)] mb-8">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="email"
            className="block text-sm font-medium font-[var(--font-sans)] text-[hsl(var(--foreground))]"
          >
            Email
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]">
              <Mail size={18} />
            </span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              className="w-full px-4 py-3 pl-10 border border-[hsl(var(--border))] rounded-[var(--radius)] bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] font-[var(--font-sans)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-ring))] focus:border-[hsl(var(--sidebar-primary))] transition-colors"
            />
          </div>
        </div>

        <SubmitButton
          formAction={forgotPasswordAction}
          pendingText="Sending link..."
          className="w-full flex items-center justify-center rounded-md py-3 px-4 font-medium font-[var(--font-sans)] text-[hsl(var(--sidebar-primary-foreground))] bg-[hsl(var(--sidebar-primary))] hover:bg-[hsl(var(--sidebar-primary))]/90 transition-colors duration-200"
        >
          Send Reset Link
        </SubmitButton>

        <FormMessage message={searchParams} />
      </form>

      <p className="mt-6 text-center text-sm text-[hsl(var(--muted-foreground))] font-[var(--font-sans)]">
        Remembered it?{" "}
        <Link
          href="/sign-in"
          className="font-medium text-[hsl(var(--sidebar-primary))] hover:underline"
        >
          Back to Sign In
        </Link>
      </p>
    </div>
  );
}