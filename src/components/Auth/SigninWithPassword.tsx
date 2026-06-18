"use client";

import { EmailIcon, PasswordIcon } from "@/assets/icons";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import InputGroup from "../FormElements/InputGroup";
import { Checkbox } from "../FormElements/checkbox";

const getSafeRedirectPath = (candidate: string | null): string => {
  if (!candidate) return "/dashboard/me";
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("://")) {
    return "/dashboard/me";
  }
  const pathOnly = candidate.split("#")[0].split("?")[0];
  if (
    pathOnly === "/sign-in" ||
    pathOnly === "/sign-up" ||
    pathOnly === "/forgot-password" ||
    pathOnly === "/reset-password" ||
    pathOnly.startsWith("/auth/")
  ) {
    return "/dashboard/me";
  }
  return candidate;
};

export default function SigninWithPassword() {
  const searchParams = useSearchParams();
  const explicitNext = searchParams.get("next");
  // Honor an explicit ?next=, otherwise fall back to the page that linked here
  // (same-origin) so sign-in links without ?next= still return the user to where
  // they were instead of dumping them on /dashboard/me.
  const [nextPath, setNextPath] = useState(() => getSafeRedirectPath(explicitNext));

  useEffect(() => {
    if (explicitNext) {
      setNextPath(getSafeRedirectPath(explicitNext));
      return;
    }
    if (typeof document !== "undefined" && document.referrer) {
      try {
        const ref = new URL(document.referrer);
        if (ref.origin === window.location.origin) {
          setNextPath(getSafeRedirectPath(ref.pathname + ref.search));
        }
      } catch {
        /* ignore malformed referrer */
      }
    }
  }, [explicitNext]);

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(process.env.NEXT_PUBLIC_DEMO_USER_MAIL || "");
  const [password, setPassword] = useState(process.env.NEXT_PUBLIC_DEMO_USER_PASS || "");
  const [remember, setRemember] = useState(false);

  const handleSubmit = () => {
    // Set loading state — page navigates away on server redirect, no need to reset
    setLoading(true);
  };

  return (
    <form
      action="/auth/sign-in"
      method="post"
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      {/* Hidden fields read by the /auth/sign-in route handler */}
      <input type="hidden" name="next" value={nextPath} />
      <input type="hidden" name="remember" value={remember ? "true" : "false"} />

      <InputGroup
        type="email"
        label="Email"
        className="[&_input]:py-3 [&_input]:px-4 [&_input]:rounded-md [&_input]:border-[hsl(var(--border))] [&_input]:bg-[hsl(var(--input))] [&_input]:text-[hsl(var(--foreground))] [&_input]:placeholder:text-[hsl(var(--muted-foreground))]"
        placeholder="Enter your email"
        name="email"
        handleChange={(e) => setEmail(e.target.value)}
        value={email}
        icon={<EmailIcon className="text-[hsl(var(--muted-foreground))]" />}
        required
      />

      <InputGroup
        type="password"
        label="Password"
        className="[&_input]:py-3 [&_input]:px-4 [&_input]:rounded-md [&_input]:border-[hsl(var(--border))] [&_input]:bg-[hsl(var(--input))] [&_input]:text-[hsl(var(--foreground))] [&_input]:placeholder:text-[hsl(var(--muted-foreground))]"
        placeholder="Enter your password"
        name="password"
        handleChange={(e) => setPassword(e.target.value)}
        value={password}
        icon={<PasswordIcon className="text-[hsl(var(--muted-foreground))]" />}
        required
      />

      <div className="flex items-center justify-between gap-2 py-2 font-medium">
        <Checkbox
          label="Remember me"
          name="remember-ui"
          withIcon="check"
          minimal
          radius="md"
          onChange={(e) => setRemember(e.target.checked)}
        />
        <Link
          href="/forgot-password"
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--sidebar-primary))] transition-colors duration-200"
        >
          Forgot Password?
        </Link>
      </div>

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
