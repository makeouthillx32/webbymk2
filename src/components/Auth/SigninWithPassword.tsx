// components/Auth/SigninWithPassword.tsx
// Client-side sign-in: calls supabase.auth.signInWithPassword() directly in the browser
// so onAuthStateChange fires SIGNED_IN natively.
"use client";

import { EmailIcon, PasswordIcon } from "@/assets/icons";
import Link from "next/link";
import React, { useState } from "react";
import InputGroup from "../FormElements/InputGroup";
import { Checkbox } from "../FormElements/checkbox";
import { useTheme } from "@/app/provider";
import { Loader2 } from "lucide-react";
import { createBrowserClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { populateCookiesAction } from "@/actions/auth/actions";
import { getLastPageForRedirect } from "@/lib/cookieUtils";

export default function SigninWithPassword() {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState({
    email: process.env.NEXT_PUBLIC_DEMO_USER_MAIL || "",
    password: process.env.NEXT_PUBLIC_DEMO_USER_PASS || "",
    remember: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = React.useMemo(() => createBrowserClient(), []);

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

      populateCookiesAction(authData.user.id, data.remember).catch((err) => {
        console.warn("[SignIn] cookie population failed (non-critical):", err);
      });

      // Prefer ?next= param set by middleware, fall back to lastPage cookie, then home
      const nextParam = searchParams.get("next");
      const redirectTo = nextParam || getLastPageForRedirect();
      router.push(redirectTo);
    } catch (err) {
      console.error("[SignIn] unexpected error:", err);
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
