import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  createTankGuestParticipantToken,
  verifyTankGuestParticipantToken,
} from "./participantIdentityToken";

export const TANK_PARTICIPANT_COOKIE = "tank_participant_v1";
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export type TankParticipantIdentity =
  | { kind: "member"; voterKey: string }
  | { kind: "guest"; voterKey: string };

function participantSecret(): string | null {
  return (
    process.env.TANK_PARTICIPANT_ID_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    null
  );
}

/** Resolve account-first identity and mint a tamper-resistant guest cookie. */
export async function resolveTankParticipantIdentity(): Promise<TankParticipantIdentity | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) return { kind: "member", voterKey: user.id };
  } catch {
    // A missing account session is a normal guest path.
  }

  const secret = participantSecret();
  if (!secret) return null;

  const cookieStore = await cookies();
  const currentToken = cookieStore.get(TANK_PARTICIPANT_COOKIE)?.value;
  let guestId = verifyTankGuestParticipantToken(currentToken, secret);

  if (!guestId) {
    const token = createTankGuestParticipantToken(secret);
    guestId = verifyTankGuestParticipantToken(token, secret);
    if (!guestId) return null;
    cookieStore.set(TANK_PARTICIPANT_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }

  return { kind: "guest", voterKey: `guest_${guestId}` };
}
