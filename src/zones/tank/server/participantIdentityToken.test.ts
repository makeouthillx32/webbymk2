import { describe, expect, it } from "bun:test";
import {
  createTankGuestParticipantToken,
  verifyTankGuestParticipantToken,
} from "./participantIdentityToken";

const SECRET = "test-only-participant-secret";
const GUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("Tank guest participant token", () => {
  it("round-trips a server-minted identity", () => {
    const token = createTankGuestParticipantToken(SECRET, GUEST_ID);
    expect(verifyTankGuestParticipantToken(token, SECRET)).toBe(GUEST_ID);
  });

  it("rejects a changed guest id or signature", () => {
    const token = createTankGuestParticipantToken(SECRET, GUEST_ID);
    expect(
      verifyTankGuestParticipantToken(
        token.replace("123e4567", "223e4567"),
        SECRET,
      ),
    ).toBeNull();
    expect(verifyTankGuestParticipantToken(`${token}x`, SECRET)).toBeNull();
  });

  it("cannot be verified with another deployment secret", () => {
    const token = createTankGuestParticipantToken(SECRET, GUEST_ID);
    expect(verifyTankGuestParticipantToken(token, "different-secret")).toBeNull();
  });
});
