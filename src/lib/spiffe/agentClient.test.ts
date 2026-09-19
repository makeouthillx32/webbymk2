import { describe, expect, it } from "bun:test";
import {
  buildClientAssertion,
  generateAgentKeyPair,
  loadPrivateKey,
} from "./agentClient";
import { verifyJwtSvid } from "./verify";

const SPIFFE_ID = "spiffe://unenter.live/agents/claude";
const AUDIENCE = "https://auth.unenter.live/api/auth/agent/token";

describe("agent-owned client assertions", () => {
  it("verifies with the registered agent public key and canonical issuer", async () => {
    const generated = await generateAgentKeyPair();
    const privateKey = await loadPrivateKey(generated.privateKeyJwk);
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      generated.publicKeyJwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const assertion = await buildClientAssertion({
      spiffeId: SPIFFE_ID,
      privateKey,
      audience: AUDIENCE,
    });
    const verified = await verifyJwtSvid(assertion, {
      publicKey,
      audience: AUDIENCE,
    });

    expect(verified.spiffeId.uri).toBe(SPIFFE_ID);
    expect(verified.claims.iss).toBe("https://unenter.live");
  });

  it("rejects an assertion verified with another agent's key", async () => {
    const signer = await generateAgentKeyPair();
    const stranger = await generateAgentKeyPair();
    const privateKey = await loadPrivateKey(signer.privateKeyJwk);
    const wrongPublicKey = await crypto.subtle.importKey(
      "jwk",
      stranger.publicKeyJwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const assertion = await buildClientAssertion({
      spiffeId: SPIFFE_ID,
      privateKey,
      audience: AUDIENCE,
    });

    await expect(
      verifyJwtSvid(assertion, { publicKey: wrongPublicKey, audience: AUDIENCE }),
    ).rejects.toThrow("Signature verification failed");
  });
});
