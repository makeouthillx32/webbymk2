// components/SignInForm.tsx
// ✅ Server Component version (uses your server action + server cookies)

import Link from "next/link";
import SignInWithGoogle from "@/components/ui/SignInWithGoogle";
import { Mail, Lock } from "lucide-react";

import { signInAction } from "@/actions/auth/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";

type Props = {
  message?: Message;
};

export default function SignInForm({ message }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-[hsl(var(--background))]">
      <div className="w-full max-w-md">
        <div className="p-6 md:p-8 rounded-[var(--radius)] shadow-[var(--shadow-lg)] bg-[hsl(var(--card))]">
          <h1 className="text-2xl md:text-3xl font-[var(--font-serif)] font-bold text-center text-[hsl(var(--foreground))] mb-6 leading-[1.2]">
            Welcome Back
          </h1>

          <SignInWithGoogle />

          <div className="flex items-center my-6">
            <div className="flex-grow border-t border-[hsl(var(--border))]" />
            <span className="mx-4 text-sm font-[var(--font-sans)] text-[hsl(var(--muted-foreground))]">
              OR
            </span>
            <div className="flex-grow border-t border-[hsl(var(--border))]" />
          </div>

          {/* ✅ Server action handles auth + cookie population + redirect */}
          <form action={signInAction} className="space-y-5" autoComplete="on">
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
                  className="w-full px-4 py-2 pl-10 border border-[hsl(var(--border))] rounded-[var(--radius)] bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] font-[var(--font-sans)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-ring))] focus:border-[hsl(var(--sidebar-primary))] transition-colors leading-[1.5]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-medium font-[var(--font-sans)] text-[hsl(var(--foreground))]"
              >
                Password
              </label>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]">
                  <Lock size={18} />
                </span>

                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-2 pl-10 border border-[hsl(var(--border))] rounded-[var(--radius)] bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] font-[var(--font-sans)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-ring))] focus:border-[hsl(var(--sidebar-primary))] transition-colors leading-[1.5]"
                />
              </div>
            </div>

            {/* ✅ Your server action expects: remember === "true" */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-[var(--font-sans)] text-[hsl(var(--muted-foreground))]">
                <input
                  type="checkbox"
                  name="remember"
                  value="true"
                  className="h-4 w-4 text-[hsl(var(--sidebar-primary))] border-[hsl(var(--border))] rounded focus:ring-[hsl(var(--sidebar-ring))]"
                />
                Remember me
              </label>

              <Link
                href="/forgot-password"
                className="text-sm font-medium text-[hsl(var(--sidebar-primary))] hover:text-[hsl(var(--sidebar-primary))]/80 transition-colors font-[var(--font-sans)]"
              >
                Forgot password?
              </Link>
            </div>

            <SubmitButton
              pendingText="Signing in..."
              className="w-full bg-[hsl(var(--sidebar-primary))] hover:bg-[hsl(var(--sidebar-primary))]/90 text-[hsl(var(--sidebar-primary-foreground))] font-medium py-2.5 px-4 rounded-[var(--radius)] transition-colors duration-200 shadow-[var(--shadow-sm)] font-[var(--font-sans)] flex items-center justify-center"
            >
              Sign in
            </SubmitButton>

            {/* ✅ shows success/error messages from redirects */}
            {message ? <FormMessage message={message} /> : null}
          </form>

          <p className="mt-6 text-center text-sm text-[hsl(var(--muted-foreground))] font-[var(--font-sans)] leading-[1.5]">
            Don&apos;t have an account?{" "}
            <Link
              href="/sign-up"
              className="text-[hsl(var(--sidebar-primary))] hover:underline transition-colors font-medium"
            >
              Sign up
            </Link>
          </p>

          <p className="mt-4 text-center text-xs text-[hsl(var(--muted-foreground))] font-[var(--font-sans)] leading-[1.5]">
            By signing in, you agree to our{" "}
            <Link
              href="/terms"
              className="underline hover:text-[hsl(var(--sidebar-primary))] transition-colors"
            >
              Terms
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="underline hover:text-[hsl(var(--sidebar-primary))] transition-colors"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
