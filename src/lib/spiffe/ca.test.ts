// src/lib/spiffe/ca.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for the self-managed SPIFFE CA (bun:test).
// Tests the sign → verify round-trip and JWKS shape.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll } from "bun:test";
import { issueJwtSvid, getJwks, getCaPublicKey, agentSpiffeId, TRUST_DOMAIN, SPIFFE_ISSUER } from "./ca";
import { verifyJwtSvid } from "./verify";

const TEST_SPIFFE_ID = agentSpiffeId("test-agent");
const TEST_AUD = ["unenter-test"];

describe("SPIFFE CA — issuance", () => {
  let token: string;

  beforeAll(async () => {
    token = await issueJwtSvid(TEST_SPIFFE_ID, TEST_AUD);
  });

  it("issues a 3-part JWT-SVID", () => {
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
  });

  it("round-trips: issued token passes verification", async () => {
    const verified = await verifyJwtSvid(token, { audience: TEST_AUD });
    expect(verified.spiffeId.uri).toBe(TEST_SPIFFE_ID);
    expect(verified.spiffeId.trustDomain).toBe(TRUST_DOMAIN);
    expect(verified.claims.iss).toBe(SPIFFE_ISSUER);
    expect(verified.claims.aud).toContain(TEST_AUD[0]);
    expect(verified.claims.jti).toBeTruthy();
  });

  it("embeds agent_name claim when provided", async () => {
    const t = await issueJwtSvid(TEST_SPIFFE_ID, TEST_AUD, 300, "Test Agent");
    const verified = await verifyJwtSvid(t, { audience: TEST_AUD });
    expect(verified.claims.agent_name).toBe("Test Agent");
  });

  it("throws on wrong trust domain", async () => {
    await expect(
      issueJwtSvid("spiffe://evil.example.com/agents/bad", TEST_AUD)
    ).rejects.toThrow("trust domain mismatch");
  });

  it("throws on empty audience", async () => {
    await expect(
      issueJwtSvid(TEST_SPIFFE_ID, [])
    ).rejects.toThrow("at least one audience");
  });
});

describe("SPIFFE CA — JWKS", () => {
  it("returns a JWKS with one RS256 key", async () => {
    const jwks = await getJwks();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0].alg).toBe("RS256");
    expect(jwks.keys[0].kty).toBe("RSA");
    expect(jwks.keys[0].use).toBe("sig");
    expect(typeof jwks.keys[0].n).toBe("string");
    expect(typeof jwks.keys[0].e).toBe("string");
  });

  it("public key is importable by Web Crypto", async () => {
    const pub = await getCaPublicKey();
    expect(pub.type).toBe("public");
    expect(pub.algorithm.name).toBe("RSASSA-PKCS1-v1_5");
  });
});
