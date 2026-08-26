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

const roleToImageMap: Record<string, string> = {
  admin: "/images/admin-invite.jpg",
  member: "/images/member-invite.jpg",
  guest: "/images/guest-invite.jpg",
  // researcher/affiliate fall through to the default image below — no
  // dedicated art commissioned for those tiers yet.
};

export default async function OGImage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;

  const inviteCode = resolvedSearchParams?.invite?.trim();

  let imagePath = "/images/default-invite.png";

  if (inviteCode) {
    try {
      // invites now has RLS locked to service_role-only (2026-08-10
      // security fix) — this read is public-safe (it only selects which of
      // a handful of static images to show) so it goes through the admin
      // client rather than the cookie-bound one, which would otherwise get
      // blocked and silently fall back to the default image for every
      // invite link. Wrapped in try/catch: this route also gets probed at
      // build time before SUPABASE_SERVICE_ROLE_KEY is injected, and this
      // image is cosmetic — never worth failing the build or the request.
      const admin = createAdminClient();
      const { data: invite, error } = await admin
        .from("invites")
        .select("role_id")
        .eq("code", inviteCode)
        .maybeSingle();

      if (!error && invite?.role_id) {
        const role = String(invite.role_id);
        const mapped = roleToImageMap[role];
        if (mapped) imagePath = mapped;
      }
    } catch (err) {
      console.error("[sign-up/opengraph-image] Failed to resolve invite role:", err);
    }
  }

  const imageUrl = `${SITE_URL}${imagePath}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f9fafb",
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    ),
    size
  );
}
