// app/protected/reset-password/page.tsx
// ✅ User lands here after clicking the email reset link.
// Supabase's /auth/callback exchanges the token and establishes a session,
// then redirects here. We use supabase.auth.updateUser() to set the new password.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      // Give the user a moment to see the success state, then redirect
      setTimeout(() => router.push("/sign-in"), 2500);
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[hsl(var(--background))]">
      <div className="mx-auto w-full max-w-md rounded-[var(--radius)] bg-[hsl(var(--card))] shadow-[var(--shadow-xl)] p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl font-[var(--font-serif)] font-bold text-center text-[hsl(var(--sidebar-primary))] mb-2 leading-[1.2]">
          Set New Password
        </h1>
        <p className="text-center text-sm text-[hsl(var(--muted-foreground))] font-[var(--font-sans)] mb-8">
          Choose a strong password for your account.
        </p>

        {success ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-[hsl(var(--foreground))] font-[var(--font-sans)] font-medium">
              Password updated!
            </p>
            <p className="text-sm text-[hsl(var(--muted-foreground))] font-[var(--font-sans)]">
              Redirecting you to sign in…
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password */}
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-medium font-[var(--font-sans)] text-[hsl(var(--foreground))]"
              >
                New Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]">
                  <Lock size={18} />
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  disabled={loading}
                  className="w-full px-4 py-3 pl-10 pr-10 border border-[hsl(var(--border))] rounded-[var(--radius)] bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] font-[var(--font-sans)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-ring))] focus:border-[hsl(var(--sidebar-primary))] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label
                htmlFor="confirm"
                className="block text-sm font-medium font-[var(--font-sans)] text-[hsl(var(--foreground))]"
              >
                Confirm Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]">
                  <Lock size={18} />
                </span>
                <input
                  id="confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 pl-10 pr-10 border border-[hsl(var(--border))] rounded-[hsl(var(--radius))] bg-[hsl(var(--input))] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] font-[var(--font-sans)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-ring))] focus:border-[hsl(var(--sidebar-primary))] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 font-[var(--font-sans)]">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`flex w-full items-center justify-center gap-2 rounded-md py-3 px-4 font-medium font-[var(--font-sans)] text-[hsl(var(--sidebar-primary-foreground))] bg-[hsl(var(--sidebar-primary))] hover:bg-[hsl(var(--sidebar-primary))]/90 transition-colors duration-200 ${
                loading ? "opacity-90 cursor-wait" : "cursor-pointer"
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Updating…</span>
                </>
              ) : (
                "Update Password"
              )}
            </button>
          </form>
        )}

        {!success && (
          <p className="mt-6 text-center text-sm text-[hsl(var(--muted-foreground))] font-[var(--font-sans)]">
            <Link
              href="/sign-in"
              className="font-medium text-[hsl(var(--sidebar-primary))] hover:underline"
            >
              Back to Sign In
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}