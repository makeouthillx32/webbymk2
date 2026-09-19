// keygen.ts — generate CA + Claude key pairs
import { getCaKeyPair } from "./src/lib/spiffe/ca.ts";
import { generateAgentKeyPair } from "./src/lib/spiffe/agentClient.ts";

// 1. Force CA key generation and capture the output
const pair = await getCaKeyPair();
const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const caB64 = Buffer.from(JSON.stringify(privateJwk)).toString("base64");

// 2. Generate Claude's key pair
const claude = await generateAgentKeyPair();

console.log("=== COPY THESE TO .env ===");
console.log(`SPIFFE_CA_PRIVATE_KEY_JWK=${caB64}`);
console.log(`CLAUDE_AGENT_SPIFFE_PRIVATE_KEY_JWK=${claude.privateKeyB64}`);
console.log("");
console.log("=== Claude public key JWK (for registration) ===");
console.log(JSON.stringify(claude.publicKeyJwk, null, 2));
