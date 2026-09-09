import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";
const GUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function signatureFor(guestId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`tank-participant:${TOKEN_VERSION}:${guestId}`)
    .digest("base64url");
}

export function createTankGuestParticipantToken(
  secret: string,
  guestId = randomUUID(),
): string {
  if (!secret || !GUEST_ID_PATTERN.test(guestId)) {
    throw new Error("Tank guest participant identity is not configured.");
  }
  return `${TOKEN_VERSION}.${guestId}.${signatureFor(guestId, secret)}`;
}

export function verifyTankGuestParticipantToken(
  token: string | undefined,
  secret: string,
): string | null {
  if (!token || !secret) return null;
  const [version, guestId, suppliedSignature, extra] = token.split(".");
  if (
    extra !== undefined ||
    version !== TOKEN_VERSION ||
    !guestId ||
    !GUEST_ID_PATTERN.test(guestId) ||
    !suppliedSignature
  ) {
    return null;
  }

  const expected = Buffer.from(signatureFor(guestId, secret));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length) return null;
  return timingSafeEqual(expected, supplied) ? guestId : null;
}
