"use client";

// src/components/Auth/RedeemInviteCard.tsx
// Shown at /sign-up instead of the "Create Account" form when the visitor is
// ALREADY signed in and the URL carries an invite code — previously that
// case fell through to the normal signup form with no session awareness at
// all: an existing user clicking a role-invite link just saw "Create
// Account" and, if they submitted it, either got a second, separate account
// or a "email already registered" error. Their real account was never
// touched. This is the actual "upgrade an existing account" path, wired to
// the same /api/apply-invite endpoint that already existed but had no UI
// caller anywhere.
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RedeemInviteCard({
  invite,
  role,
  next,
}: {
  invite: string;
  role?: string;
  next?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [grantedRole, setGrantedRole] = useState<string | null>(null);

  async function handleAccept() {
    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch("/api/apply-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Something went wrong redeeming this invite.");
        setStatus("error");
        return;
      }

      setGrantedRole(data.role);
      setTimeout(() => {
        router.push(next || "/dashboard");
        router.refresh();
      }, 1500);
    } catch {
      setError("Something went wrong redeeming this invite.");
      setStatus("error");
    }
  }

  if (grantedRole) {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-[var(--radius)] bg-[hsl(var(--card))] shadow-[var(--shadow-xl)] p-8 md:p-10 text-center">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))] capitalize">
          You're now a {grantedRole}
        </h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Taking you to your dashboard…
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl rounded-[var(--radius)] bg-[hsl(var(--card))] shadow-[var(--shadow-xl)] p-8 md:p-10">
      <h1 className="text-2xl md:text-3xl font-[var(--font-serif)] font-bold text-center text-[hsl(var(--sidebar-primary))] mb-2">
        You've been invited{role ? <> as <span className="capitalize">{role}</span></> : null}
      </h1>
      <p className="text-center text-sm text-[hsl(var(--muted-foreground))] mb-6">
        You're already signed in. Accepting this invite will update the role on your existing account — no new account is created.
      </p>

      {error && (
        <p className="mb-4 text-center text-sm font-semibold text-[hsl(var(--destructive))]">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleAccept}
        disabled={status === "submitting"}
        className="w-full bg-[hsl(var(--sidebar-primary))] hover:bg-[hsl(var(--sidebar-primary))]/90 text-[hsl(var(--sidebar-primary-foreground))] py-2.5 rounded-[var(--radius)] font-medium transition-colors duration-200 shadow-[var(--shadow-sm)] disabled:opacity-50"
      >
        {status === "submitting" ? "Accepting…" : "Accept Invite"}
      </button>
    </div>
  );
}
