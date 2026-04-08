// components/Auth/SigninWithPassword.tsx
// ✅ Client-side sign-in: calls supabase.auth.signInWithPassword() directly in the browser
// so onAuthStateChange fires SIGNED_IN natively — exactly like logout fires SIGNED_OUT.
// This means MobileDrawer, Header, and all auth-aware components update instantly
// without any ?refresh=true hack or race conditions.
"use client";

import { EmailIcon, PasswordIcon } from "@/assets/icons";
import Link from "next/link";
import React, { useState } from "react";
import InputGroup from "../FormElements/InputGroup";
import { Checkbox } from "../FormElements/checkbox";
import { useTheme } from "@/app/provider";
import { Loader2 } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { populateCookiesAction } from "@/actions/auth/actions";
import { getLastPageForRedirect } from "@/lib/cookieUtils";

export default function SigninWithPassword() {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";
  const router = useRouter();

  const [data, setData] = useState({
    email: process.env.NEXT_PUBLIC_DEMO_USER_MAIL || "",
    password: process.env.NEXT_PUBLIC_DEMO_USER_PASS || "",
    remember: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = React.useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setData({ ...data, [e.target.name]: e.target.value });
  };

  const handleRememberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setData({ ...data, remember: e.target.checked });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // ✅ Sign in from the browser — this fires onAuthStateChange("SIGNED_IN")
      // which propagates through the entire Provider → MobileDrawer → Header chain
      // identically to how signOut fires SIGNED_OUT. No page reload needed.
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!authData.user?.id) {
        setError("Authentication failed — no user returned.");
        return;
      }

      console.log("[SignIn] ✅ Browser sign-in succeeded, SIGNED_IN will fire via onAuthStateChange");

      // ✅ Populate server-side profile cookies (userRole, userDisplayName, etc.)
      // This runs in the background — it's not blocking the auth state update.
      populateCookiesAction(authData.user.id, data.remember).catch((err) => {
        console.warn("[SignIn] ⚠️ Cookie population failed (non-critical):", err);
      });

      // ✅ Redirect to lastPage or home — no ?refresh=true needed
      const redirectTo = getLastPageForRedirect();
      router.push(redirectTo);
    } catch (err) {
      console.error("[SignIn] ❌ Unexpected error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <InputGroup
        type="email"
        label="Email"
        className="[&_input]:py-3 [&_input]:px-4 [&_input]:rounded-md [&_input]:border-[hsl(var(--border))] [&_input]:bg-[hsl(var(--input))] [&_input]:text-[hsl(var(--foreground))] [&_input]:placeholder:text-[hsl(var(--muted-foreground))]"
        placeholder="Enter your email"
        name="email"
        handleChange={handleChange}
        value={data.email}
        icon={<EmailIcon className="text-[hsl(var(--muted-foreground))]" />}
        required
        disabled={loading}
      />

      <InputGroup
        type="password"
        label="Password"
        className="[&_input]:py-3 [&_input]:px-4 [&_input]:rounded-md [&_input]:border-[hsl(var(--border))] [&_input]:bg-[hsl(var(--input))] [&_input]:text-[hsl(var(--foreground))] [&_input]:placeholder:text-[hsl(var(--muted-foreground))]"
        placeholder="Enter your password"
        name="password"
        handleChange={handleChange}
        value={data.password}
        icon={<PasswordIcon className="text-[hsl(var(--muted-foreground))]" />}
        required
        disabled={loading}
      />

      <div className="flex items-center justify-between gap-2 py-2 font-medium">
        <Checkbox
          label="Remember me"
          name="remember"
          checked={data.remember}
          withIcon="check"
          minimal
          radius="md"
          onChange={handleRememberChange}
          disabled={loading}
        />

        {/* ✅ Fixed: was /auth/forgot-password (404), now points to /forgot-password */}
        <Link
          href="/forgot-password"
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--sidebar-primary))] transition-colors duration-200"
        >
          Forgot Password?
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-500 font-[var(--font-sans)]">{error}</p>
      )}

      <div>
        <button
          type="submit"
          disabled={loading}
          className={`flex w-full items-center justify-center gap-2 rounded-md py-3 px-4 font-medium text-[hsl(var(--sidebar-primary-foreground))] bg-[hsl(var(--sidebar-primary))] hover:bg-[hsl(var(--sidebar-primary))]/90 transition-colors duration-200 ${
            loading ? "opacity-90 cursor-wait" : "cursor-pointer"
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            "Sign In"
          )}
        </button>
      </div>
    </form>
  );
}