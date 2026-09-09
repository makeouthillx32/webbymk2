"use client";

// src/zones/labs/account/ProfileForm.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Isolated researcher profile form for Unenter Labs.
//
// Strictly using Unenter theme tokens (hsl(var(--...))):
// - var(--background), var(--foreground), var(--card), var(--card-foreground)
// - var(--primary), var(--primary-foreground), var(--muted), var(--muted-foreground)
// - var(--border), var(--input), var(--ring), var(--destructive)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

export type EditableProfile = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  region: string | null;
  email: string | null;
};

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const FIELDS: { key: keyof EditableProfile; label: string; placeholder: string }[] = [
  { key: "first_name", label: "First name", placeholder: "First name" },
  { key: "last_name", label: "Last name", placeholder: "Last name" },
  { key: "display_name", label: "Display name", placeholder: "Public research moniker" },
  { key: "region", label: "Region", placeholder: "e.g. California, US" },
];

export default function ProfileForm({
  profile,
  onProfileUpdated,
}: {
  profile: EditableProfile;
  onProfileUpdated?: (updated: EditableProfile) => void;
}) {
  const [form, setForm] = useState(profile);
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  const set = (key: keyof EditableProfile, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/research-account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: form.display_name,
          first_name: form.first_name,
          last_name: form.last_name,
          region: form.region,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `save_failed_${res.status}`);
      }
      const data = await res.json();
      if (data.profile) {
        setForm(data.profile);
        onProfileUpdated?.(data.profile);
      }
      setState({ kind: "saved" });
      setTimeout(() => setState({ kind: "idle" }), 2500);
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "save_failed" });
    }
  }

  const inputClass =
    "w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-3.5 py-2.5 text-sm text-[hsl(var(--card-foreground))] " +
    "outline-none transition placeholder:text-[hsl(var(--muted-foreground)/0.6)] focus:border-[hsl(var(--primary))] focus:ring-1 focus:ring-[hsl(var(--ring))]";

  // Monogram initials
  const initials = [form.first_name?.[0], form.last_name?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() ||
    form.display_name?.slice(0, 2).toUpperCase() ||
    "UL";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ── Researcher Clinical Monogram (Pure Theme Vars, No Tank PFP) ── */}
      <div className="flex items-center gap-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-xl font-bold tracking-wider text-[hsl(var(--primary-foreground))] shadow ring-2 ring-[hsl(var(--primary)/0.25)]">
          {initials}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[hsl(var(--foreground))]">
              {form.display_name || [form.first_name, form.last_name].filter(Boolean).join(" ") || "Researcher"}
            </h3>
            <span className="inline-flex items-center rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--primary))]">
              Verified Researcher
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            Unenter Labs Account · Dedicated research identity decoupled from other products
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(({ key, label, placeholder }) => (
          <label key={key} className="block">
            <span className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">{label}</span>
            <input
              type="text"
              value={(form[key] as string | null) ?? ""}
              onChange={(e) => set(key, e.target.value)}
              placeholder={placeholder}
              maxLength={120}
              className={inputClass}
            />
          </label>
        ))}

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">Email Address</span>
          <input
            type="email"
            value={form.email ?? ""}
            readOnly
            disabled
            className={inputClass + " cursor-not-allowed opacity-60"}
          />
          <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Email is managed by your Unenter authentication session.
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={state.kind === "saving"}
          className="rounded-md bg-[hsl(var(--primary))] px-6 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))] shadow transition hover:opacity-90 disabled:opacity-50"
        >
          {state.kind === "saving" ? "Saving…" : "Save changes"}
        </button>
        {state.kind === "saved" && (
          <span className="text-sm font-medium text-[hsl(var(--primary))]">
            ✓ Changes saved successfully.
          </span>
        )}
        {state.kind === "error" && (
          <span className="text-sm font-medium text-[hsl(var(--destructive))]">
            Could not save ({state.message}).
          </span>
        )}
      </div>
    </form>
  );
}
