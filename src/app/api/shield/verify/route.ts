// src/app/api/shield/verify/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Verification API endpoint for Unenter Edge Shield Proof-of-Work solutions.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { verifyProofOfWork, signClearanceToken } from "@/lib/shield/crypto";
import { SHIELD_COOKIE_NAME, ShieldVerifyPayload } from "@/lib/shield/types";
import { getShieldPolicyForHost } from "@/lib/shield/policy";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<ShieldVerifyPayload>;
    const { challengeStr, solution, rayId } = body;

    if (!challengeStr || solution === undefined || !rayId) {
      return NextResponse.json(
        { success: false, error: "Missing required challenge parameters." },
        { status: 400 }
      );
    }

    const verification = await verifyProofOfWork(challengeStr, solution);
    if (!verification.success || !verification.challenge) {
      return NextResponse.json(
        { success: false, error: verification.error || "Proof-of-work validation failed." },
        { status: 403 }
      );
    }

    const { domain, clientIp } = verification.challenge;
    const clearanceToken = await signClearanceToken(domain, clientIp, rayId);

    // Cookie lifetime must track the TOKEN's lifetime, which is now per-zone
    // (labs expires far sooner than tank). If these two disagree the failure is
    // silent and confusing: a cookie outliving its token means the browser
    // keeps sending a value the middleware rejects, so the visitor gets
    // challenged while appearing to hold clearance.
    const { clearanceTtlSeconds } = getShieldPolicyForHost(domain);

    const response = NextResponse.json({
      success: true,
      rayId,
      message: "Browser verified successfully.",
    });

    // Host-scoped cookie — deliberately NOT domain: ".unenter.live".
    //
    // There is one cookie NAME shared by every zone, so an apex-scoped cookie
    // means the newest solve overwrites every other zone's clearance. Since
    // verifyClearanceToken binds a token to its issuing host, that overwrite
    // silently invalidated the previous zone: solve on tank, visit labs
    // (re-challenge, tank's clearance clobbered), go back to tank —
    // challenged again. Harmless when every zone shared one TTL; actively
    // wrong now that labs expires in 30 min and would drag tank's 24h
    // clearance down with it every time a visitor crossed between them.
    //
    // Omitting `domain` scopes the cookie to the exact host that set it, so
    // each zone keeps its own independent clearance and its own TTL.
    response.cookies.set({
      name: SHIELD_COOKIE_NAME,
      value: clearanceToken,
      path: "/",
      maxAge: clearanceTtlSeconds,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return response;
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Invalid verification payload." },
      { status: 400 }
    );
  }
}
