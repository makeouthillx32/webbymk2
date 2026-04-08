"use client";

import { useSupabaseClient } from "@supabase/auth-helpers-react";
import type { Provider } from "@supabase/supabase-js";

type OAuthButton = {
  provider: Provider; // "google" | "apple" | "facebook" etc.
  label: string;
  icon: React.ReactNode;
};

function buildRedirectTo() {
  const invite = new URLSearchParams(window.location.search).get("invite");
  return `${location.origin}/auth/callback/oauth${invite ? `?invite=${invite}` : ""}`;
}

export default function SignInWithProviders() {
  const supabase = useSupabaseClient();

  const signIn = async (provider: Provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: buildRedirectTo(),
      },
    });

    if (error) {
      console.error(`${provider} sign-in error:`, error.message);
      alert(`${provider} sign-in failed – see console for details.`);
    }
  };

  const buttons: OAuthButton[] = [
    {
      provider: "google",
      label: "Continue with Google",
      icon: <GoogleIcon />,
    },
    {
      provider: "apple",
      label: "Continue with Apple",
      icon: <AppleIcon />,
    },
    {
      provider: "facebook",
      label: "Continue with Facebook",
      icon: <FacebookIcon />,
    },
  ];

  return (
    <div className="w-full space-y-3">
      {buttons.map((b) => (
        <button
          key={b.provider}
          type="button"
          onClick={() => signIn(b.provider)}
          className="
            w-full flex items-center justify-center gap-3
            rounded-[var(--radius)]
            border border-[hsl(var(--border))]
            bg-[hsl(var(--card))]
            text-[hsl(var(--foreground))]
            py-2.5 text-sm font-[var(--font-sans)]
            shadow-[var(--shadow-sm)]
            transition hover:bg-[hsl(var(--muted))]
          "
        >
          <span className="shrink-0">{b.icon}</span>
          <span>{b.label}</span>
        </button>
      ))}
    </div>
  );
}

/* --- minimal inline icons --- */

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <g fill="none" fillRule="evenodd">
        <path d="M17.6 9.2l-.1-1.8H9v3.4h4.8C13.6 12 13 13 12 13.6v2.2h3a8.8 8.8 0 0 0 2.6-6.6z" fill="#4285F4" />
        <path d="M9 18c2.4 0 4.5-.8 6-2.2l-3-2.2a5.4 5.4 0 0 1-8-2.9H1V13a9 9 0 0 0 8 5z" fill="#34A853" />
        <path d="M4 10.7a5.4 5.4 0 0 1 0-3.4V5H1a9 9 0 0 0 0 8l3-2.3z" fill="#FBBC05" />
        <path d="M9 3.6c1.3 0 2.5.4 3.4 1.3L15 2.3A9 9 0 0 0 1 5l3 2.4a5.4 5.4 0 0 1 5-3.7z" fill="#EA4335" />
      </g>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.7 13.4c0-2 1.6-3 1.7-3.1-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.8-3.2.8-.6 0-1.6-.8-2.7-.8-1.4 0-2.7.8-3.4 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.9-.7 1.4 0 1.8.7 2.9.7 1.2 0 2-1.1 2.7-2.1.8-1.2 1.1-2.3 1.1-2.4-.1 0-2.8-1.1-2.8-3.6ZM14.6 7c.6-.8 1-1.8.9-2.9-.9.1-2 .6-2.6 1.4-.6.7-1.1 1.8-.9 2.8 1 0 2-.5 2.6-1.3Z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.6-4.7 1.3 0 2.6.2 2.6.2v2.9h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"
      />
    </svg>
  );
}