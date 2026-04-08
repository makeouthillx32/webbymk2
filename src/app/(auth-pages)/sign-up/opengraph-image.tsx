// app/(auth-pages)/sign-up/opengraph-image.tsx

import { ImageResponse } from "next/og";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

// OpenGraph size
export const size = {
  width: 1200,
  height: 630,
};

// Tell Next.js this is an OpenGraph handler
export const contentType = "image/png";

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
};

export default async function OGImage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Ensure cookies are available (needed by your server client helper)
  await cookies();

  const supabase = await createClient();
  const inviteCode = searchParams?.invite?.trim();

  let imagePath = "/images/default-invite.png";

  if (inviteCode) {
    const { data: invite, error } = await supabase
      .from("invites")
      .select("role_id")
      .eq("code", inviteCode)
      .maybeSingle();

    if (!error && invite?.role_id) {
      const role = String(invite.role_id);
      const mapped = roleToImageMap[role];
      if (mapped) imagePath = mapped;
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
