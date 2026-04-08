"use client";

import React, { useState } from "react";
import {
  MapPin,
  Receipt,
  User as UserIcon,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import Avatar from "./Avatar";
import AvatarUpload from "./AvatarUpload";
import DeleteAccount from "./DeleteAccount";
import { ProfileOrders } from "./ProfileOrders";

interface Profile {
  id: string;
  email: string;
  role: string;
  avatar_url: string | null;
  email_confirmed_at: string | null;
  created_at: string;
  last_sign_in_at: string;
  app_metadata: { providers?: string[] };
}

interface ProfileCardProps {
  profile: Profile;
  displayName: string;
  roleLabel: string;
}

export default function ProfileCard({ profile, displayName, roleLabel }: ProfileCardProps) {
  const country = "United States";
  const addressCount = 1;
  const [showAvatarUpload, setShowAvatarUpload] = useState(false);

  return (
    <div className="w-full max-w-4xl mx-auto">

      {/* ── Header row: avatar + name + actions ── */}
      <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-5">
          <div className="shrink-0">
            <Avatar userId={profile.id} role={profile.role} avatarUrl={profile.avatar_url} />
          </div>

          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
              My account
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <UserIcon className="h-4 w-4" aria-hidden="true" />
                <span className="truncate">{displayName}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>{roleLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                <span>{country}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAvatarUpload((v) => !v)}
            className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-medium text-foreground shadow-[var(--shadow-sm)] hover:bg-[hsl(var(--muted))] transition-colors"
          >
            {showAvatarUpload ? (
              <><ChevronUp className="h-4 w-4" />Hide photo upload</>
            ) : (
              <><ChevronDown className="h-4 w-4" />Change photo</>
            )}
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[var(--shadow-sm)] hover:opacity-90 transition-opacity"
            onClick={() => { window.location.href = "/auth/logout"; }}
          >
            <Receipt className="h-4 w-4" />
            Log out
          </button>
        </div>
      </div>

      {/* ── Avatar upload panel ── */}
      {showAvatarUpload && (
        <div className="mt-5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-[var(--shadow-sm)]">
          <AvatarUpload userId={profile.id} />
        </div>
      )}

      {/* ── Main content grid ── */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Orders — real data from /api/orders/mine */}
        <section className="lg:col-span-2">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)] p-5">
            <ProfileOrders />
          </div>
        </section>

        {/* Account details sidebar */}
        <aside className="lg:col-span-1">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]">
            <div className="px-5 py-4 border-b border-[hsl(var(--border))]">
              <h2 className="text-base font-semibold text-foreground">Account details</h2>
            </div>

            <div className="p-5 space-y-4">
              <DetailRow label="Name"    value={displayName} />
              <DetailRow label="Email"   value={profile.email} />
              <DetailRow label="Role"    value={roleLabel} />
              <DetailRow label="Country" value={country} />

              <button
                type="button"
                className="w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2 text-sm font-medium text-foreground hover:bg-[hsl(var(--muted))] transition-colors"
                onClick={() => { window.location.href = "/profile/addresses"; }}
              >
                View addresses ({addressCount})
              </button>
            </div>
          </div>

          <div className="mt-6">
            <DeleteAccount />
          </div>
        </aside>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground text-right break-words">{value}</p>
    </div>
  );
}