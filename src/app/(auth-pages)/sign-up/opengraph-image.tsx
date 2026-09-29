// app/(auth-pages)/sign-up/opengraph-image.tsx

import { ImageResponse } from "next/og";
import { createAdminClient } from "@/utils/supabase/admin";

// OpenGraph size
export const size = {
  width: 1200,
  height: 630,
};

// Tell Next.js this is an OpenGraph handler
export const contentType = "image/png";

// Next tries to statically export this route at build time (no dynamic
// segment). SUPABASE_SERVICE_ROLE_KEY isn't present in the build-time env
// (only baked in at container runtime), so createAdminClient() below would
// throw during `next build` and fail the whole zone build. Force dynamic so
// this always renders per-request instead — it needs a live DB read anyway.
export const dynamic = "force-dynamic";

type SearchParams = { invite?: string };

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_VERCEL_URL?.startsWith("http")
    ? process.env.NEXT_PUBLIC_VERCEL_URL
    : process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : "http://localhost:3000";

// Used to previously point at /images/{role}-invite.jpg + a
// /images/default-invite.png background — none of those files exist
// anywhere in the repo (confirmed 2026-09-23), so every invite link's OG
// preview was silently rendering as a blank gray box for as long as this
// route has existed. Replaced with a generated card so there's nothing left
// to go missing. Colors mirror `roles.color` in the DB (see RolesTable.tsx)
// — keep these in sync if that table's colors change. researcher/affiliate
// have no DB color today, so they get a sensible fallback here.
const ROLE_COLORS: Record<string, string> = {
  admin: "#7c2d12",
  member: "#92400e",
  guest: "#78716c",
  marketing: "#ec4899",
  researcher: "#6366f1",
  affiliate: "#0ea5e9",
};

const BRAND_GREEN = "hsl(139.66, 52.73%, 43.14%)";

export default async function OGImage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const inviteCode = resolvedSearchParams?.invite?.trim();

  let role: string | null = null;

  if (inviteCode) {
    try {
      // invites has RLS locked to service_role-only (2026-08-10 security
      // fix) — this read only decides which role name/color to draw, so it
      // goes through the admin client rather than the cookie-bound one,
      // which would otherwise get blocked and silently fall back to the
      // generic card for every invite link. Wrapped in try/catch: this
      // route also gets probed at build time before
      // SUPABASE_SERVICE_ROLE_KEY is injected, and this image is cosmetic —
      // never worth failing the build or the request.
      const admin = createAdminClient();
      const { data: invite, error } = await admin
        .from("invites")
        .select("role_id")
        .eq("code", inviteCode)
        .maybeSingle();

      if (!error && invite?.role_id) role = String(invite.role_id);
    } catch (err) {
      console.error("[sign-up/opengraph-image] Failed to resolve invite role:", err);
    }
  }

  const accent = (role && ROLE_COLORS[role]) || BRAND_GREEN;
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : null;
  const logoUrl = `${SITE_URL}/images/home/dartlogowhite.svg`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0a0a0a",
          backgroundImage: `linear-gradient(135deg, #0a0a0a 0%, #141414 55%, ${accent}22 100%)`,
          padding: "72px",
          position: "relative",
        }}
      >
        {/* Decorative SVG art — soft orbiting rings in the role's accent color */}
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <circle cx="1010" cy="160" r="260" fill="none" stroke={accent} strokeOpacity="0.35" strokeWidth="2" />
          <circle cx="1010" cy="160" r="180" fill="none" stroke={accent} strokeOpacity="0.5" strokeWidth="2" />
          <circle cx="1010" cy="160" r="100" fill={accent} fillOpacity="0.18" />
          <circle cx="120" cy="560" r="140" fill="none" stroke={accent} strokeOpacity="0.25" strokeWidth="2" />
        </svg>

        {/* Header: brand */}
        <div style={{ display: "flex", alignItems: "center", zIndex: 1 }}>
          <img src={logoUrl} width="44" height="44" alt="" />
          <span
            style={{
              marginLeft: "16px",
              fontSize: "28px",
              fontWeight: 800,
              letterSpacing: "0.2em",
              color: "#ffffff",
            }}
          >
            UNENTER
          </span>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flexDirection: "column", zIndex: 1 }}>
          {roleLabel ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 24px",
                borderRadius: "9999px",
                backgroundColor: `${accent}2a`,
                border: `2px solid ${accent}`,
                width: "fit-content",
                marginBottom: "28px",
              }}
            >
              <div
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "9999px",
                  backgroundColor: accent,
                  marginRight: "12px",
                }}
              />
              <span style={{ fontSize: "26px", fontWeight: 700, color: "#ffffff" }}>
                {roleLabel} Invite
              </span>
            </div>
          ) : null}

          <span
            style={{
              fontSize: "60px",
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.1,
              maxWidth: "820px",
            }}
          >
            {roleLabel
              ? `You've been invited to join UNENTER as ${roleLabel}.`
              : "You've been invited to join UNENTER."}
          </span>

          <span
            style={{
              marginTop: "24px",
              fontSize: "26px",
              color: "#a3a3a3",
            }}
          >
            unenter.live
          </span>
        </div>
      </div>
    ),
    size
  );
}
