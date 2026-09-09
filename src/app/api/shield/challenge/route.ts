// src/app/api/shield/challenge/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Generates a fresh Proof-of-Work challenge for frontend widgets (Turnstile).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createShieldChallenge } from "@/lib/shield/crypto";

export const dynamic = "force-dynamic";

function getClientIp(request: NextRequest): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) return xForwardedFor.split(",")[0].trim();
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();
  return "127.0.0.1";
}

export async function GET(request: NextRequest) {
  try {
    const rawHost =
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      request.headers.get("host") ||
      "unenter.live";
    const clientIp = getClientIp(request);

    const { challenge, serialized } = await createShieldChallenge(rawHost, clientIp);

    return NextResponse.json({
      success: true,
      challenge,
      serialized,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Failed to generate security challenge" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
