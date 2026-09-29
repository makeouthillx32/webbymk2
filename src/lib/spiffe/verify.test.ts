// src/lib/spiffe/verify.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for JWT-SVID verification — error paths (bun:test).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "bun:test";
import { issueJwtSvid, agentSpiffeId, getCaKeyPair } from "./ca";
import { verifyJwtSvid, tryVerifyJwtSvid } from "./verify";

const AGENT_ID = agentSpiffeId("verify-test-agent");
const AUD = ["verify-test-aud"];

async function freshToken(overrides?: { ttlSeconds?: number; aud?: string[] }): Promise<string> {
  return issueJwtSvid(AGENT_ID, overrides?.aud ?? AUD, overrides?.ttlSeconds ?? 300);
}

function b64url(s: string): string {
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

describe("verifyJwtSvid — happy path", () => {
  it("verifies a valid token", async () => {
    const t = await freshToken();
    const r = await verifyJwtSvid(t, { audience: AUD });
    expect(r.spiffeId.uri).toBe(AGENT_ID);
    expect(r.claims.sub).toBe(AGENT_ID);
  });

  it("accepts any audience when option is omitted", async () => {
    const t = await freshToken();
    const r = await verifyJwtSvid(t);
    expect(r.spiffeId.uri).toBe(AGENT_ID);
  });
});

describe("verifyJwtSvid — error cases", () => {
  it("throws INVALID_FORMAT for non-JWT string", async () => {
    await expect(verifyJwtSvid("not.a.jwt.with.too.many.dots")).rejects.toMatchObject({
      code: "INVALID_FORMAT",
    });
  });

  it("throws INVALID_SIGNATURE for tampered payload", async () => {
    const t = await freshToken();
    const [h, , s] = t.split(".");
    const fakeClaims = b64url(JSON.stringify({ sub: AGENT_ID, iss: "https://unenter.live", aud: AUD, iat: 1, exp: 9999999999, jti: "x" }));
    await expect(verifyJwtSvid(`${h}.${fakeClaims}.${s}`)).rejects.toMatchObject({
      code: "INVALID_SIGNATURE",
    });
  });

  it("throws INVALID_AUDIENCE for wrong audience", async () => {
    const t = await freshToken({ aud: ["actual-aud"] });
    await expect(
      verifyJwtSvid(t, { audience: ["expected-other-aud"] })
    ).rejects.toMatchObject({ code: "INVALID_AUDIENCE" });
  });

  it("throws INVALID_SUBJECT for a non-spiffe sub (re-signed with CA key)", async () => {
    const { privateKey } = await getCaKeyPair();
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claims = { sub: "not-a-spiffe-id", iss: "https://unenter.live", aud: AUD, iat: now, exp: now + 300, jti: "x" };
    const h = b64url(JSON.stringify(header));
    const c = b64url(JSON.stringify(claims));
    const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, privateKey, new TextEncoder().encode(`${h}.${c}`));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    await expect(verifyJwtSvid(`${h}.${c}.${sigB64}`, { audience: AUD })).rejects.toMatchObject({
      code: "INVALID_SUBJECT",
    });
  });

  it("tryVerifyJwtSvid returns null instead of throwing", async () => {
    const result = await tryVerifyJwtSvid("garbage.garbage.garbage");
    expect(result).toBeNull();
  });
});
