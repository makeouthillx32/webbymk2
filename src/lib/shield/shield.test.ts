// src/lib/shield/shield.test.ts
import { describe, it, expect } from "bun:test";
import {
  createShieldChallenge,
  verifyProofOfWork,
  signClearanceToken,
  verifyClearanceToken,
  generateRayId,
  getClientSubnet,
} from "./crypto";
import {
  getShieldPolicyForZone,
  getShieldPolicyForHost,
} from "./policy";
import { DEFAULT_SHIELD_POLICY } from "./types";

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("Unenter Edge Shield Core", () => {
  it("generates a unique Ray ID with unt_ prefix", () => {
    const rayId = generateRayId();
    expect(rayId.startsWith("unt_")).toBe(true);
    expect(rayId.length).toBeGreaterThan(10);
  });

  it("extracts client subnets cleanly", () => {
    expect(getClientSubnet("127.0.0.1")).toBe("localhost");
    expect(getClientSubnet("192.168.1.55")).toBe("192.168.1.0/24");
    expect(getClientSubnet("2600:1700:1234:5678:9abc:def0:1234:5678")).toBe("2600:1700:1234:5678::/64");
  });

  it("creates challenge and solves proof of work", async () => {
    const { challenge, serialized } = await createShieldChallenge("tank.unenter.live", "192.168.1.55", 2);
    expect(challenge.domain).toBe("tank.unenter.live");
    expect(challenge.difficulty).toBe(2);

    // Solve PoW (difficulty 2 = 2 leading hex zeros)
    const challengeData = `${challenge.domain}|${challenge.clientIp}|${challenge.timestamp}|${challenge.nonce}|${challenge.difficulty}|${challenge.rayId}`;
    let solution = 0;
    while (true) {
      const hash = await sha256Hex(`${challengeData}:${solution}`);
      if (hash.startsWith("00")) break;
      solution++;
    }

    const verification = await verifyProofOfWork(serialized, solution);
    expect(verification.success).toBe(true);
    expect(verification.challenge?.rayId).toBe(challenge.rayId);
  });

  it("rejects invalid proof of work solution", async () => {
    const { serialized } = await createShieldChallenge("tank.unenter.live", "192.168.1.55", 4);
    const invalidVerification = await verifyProofOfWork(serialized, 999999999999);
    // Highly improbable to accidentally match 4 zeros
    expect(invalidVerification.success).toBe(false);
  });

  it("rejects tampered challenge token", async () => {
    const { serialized } = await createShieldChallenge("tank.unenter.live", "192.168.1.55", 2);
    // Tamper with serialized token
    const tampered = serialized.slice(0, -4) + "AAAA";
    const verification = await verifyProofOfWork(tampered, 0);
    expect(verification.success).toBe(false);
  });

  it("signs and verifies valid clearance cookie", async () => {
    const rayId = generateRayId();
    const token = await signClearanceToken("tank.unenter.live", "192.168.1.55", rayId);
    expect(token.startsWith("v1.")).toBe(true);

    const result = await verifyClearanceToken(token, "tank.unenter.live", "192.168.1.55");
    expect(result.valid).toBe(true);
    expect(result.payload?.rayId).toBe(rayId);
  });

  it("rejects clearance token when IP subnet differs completely", async () => {
    const rayId = generateRayId();
    const token = await signClearanceToken("tank.unenter.live", "192.168.1.55", rayId);

    // Completely different subnet
    const result = await verifyClearanceToken(token, "tank.unenter.live", "10.0.0.1");
    expect(result.valid).toBe(false);
  });

  it("rejects tampered clearance cookie signature", async () => {
    const rayId = generateRayId();
    const token = await signClearanceToken("tank.unenter.live", "192.168.1.55", rayId);
    const tamperedToken = token + "xyz";

    const result = await verifyClearanceToken(tamperedToken, "tank.unenter.live", "192.168.1.55");
    expect(result.valid).toBe(false);
  });
});

// ── Per-zone shield policy (2026-09-04) ──────────────────────────────────────
// Labs is a research-chemical catalog: clearance must expire far sooner and
// cost more to obtain than on a livestream zone like tank.
describe("Per-zone shield policy", () => {
  it("gives labs a shorter clearance TTL than the default zone", () => {
    const labs = getShieldPolicyForZone("labs");
    const fallback = getShieldPolicyForZone("some-unknown-zone");
    expect(labs.clearanceTtlSeconds).toBeLessThan(fallback.clearanceTtlSeconds);
    expect(labs.clearanceTtlSeconds).toBe(1_800);
  });

  it("gives labs a harder challenge than other zones", () => {
    expect(getShieldPolicyForZone("labs").difficulty).toBeGreaterThan(
      getShieldPolicyForZone("tank").difficulty
    );
  });

  it("resolves policy from a hostname, not just a zone key", () => {
    expect(getShieldPolicyForHost("labs.unenter.live")).toEqual(getShieldPolicyForZone("labs"));
    expect(getShieldPolicyForHost("tank.unenter.live").clearanceTtlSeconds).toBe(
      DEFAULT_SHIELD_POLICY.clearanceTtlSeconds
    );
  });

  it("falls back to the default policy for an empty/unknown host", () => {
    expect(getShieldPolicyForHost("")).toEqual(DEFAULT_SHIELD_POLICY);
  });

  it("stamps the per-zone TTL into the issued clearance token", async () => {
    const labsToken = await signClearanceToken("labs.unenter.live", "192.168.1.55", generateRayId());
    const tankToken = await signClearanceToken("tank.unenter.live", "192.168.1.55", generateRayId());

    const decode = (t: string) =>
      JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString("utf-8")) as {
        issuedAt: number;
        expiresAt: number;
      };

    const labs = decode(labsToken);
    const tank = decode(tankToken);

    // The token carries its own lifetime, so a labs clearance dies first.
    expect(labs.expiresAt - labs.issuedAt).toBe(1_800 * 1000);
    expect(tank.expiresAt - tank.issuedAt).toBe(DEFAULT_SHIELD_POLICY.clearanceTtlSeconds * 1000);
    expect(labs.expiresAt).toBeLessThan(tank.expiresAt);
  });
});
