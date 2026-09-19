// src/lib/spiffe/claudeIdentity.ts
// ─────────────────────────────────────────────────────────────────────────────
// Claude apos;s SPIFFE identity bootstrap.
//
// This module gives the Claude/Antigravity agent its cryptographic identity
// on the unenter.live platform. It reads Claude apos;s private key from the env,
// builds a client assertion, and calls the token endpoint.
//
// Usage (in any server-side context where Claude needs to call internal APIs):
//
//   import { getClaudeAgentToken } from "@/lib/spiffe/claudeIdentity";
//   const token = await getClaudeAgentToken();
//   // Use: Authorization: Bearer <token>
//
// The token is cached in-process and auto-refreshed 60 seconds before expiry.
// ─────────────────────────────────────────────────────────────────────────────

import { loadPrivateKey, requestSelfAuthToken, decodeAat } from "./agentClient";
import { agentSpiffeId } from "./ca";
import type { AgentTokenResponse } from "./types";

// ── Configuration ─────────────────────────────────────────────────────────────

/** The SPIFFE ID for the Claude/Antigravity agent. */
export const CLAUDE_SPIFFE_ID = agentSpiffeId("claude");

/** How many seconds before expiry to proactively refresh the token. */
const REFRESH_BUFFER_SECONDS = 60;

// ── Token cache ───────────────────────────────────────────────────────────────

interface CachedToken {
  response: AgentTokenResponse;
  expiresAt: number; // epoch seconds
}

let _cached: CachedToken | null = null;

// ── Key cache ─────────────────────────────────────────────────────────────────

let _privateKey: CryptoKey | null = null;

async function getPrivateKey(): Promise<CryptoKey | null> {
  if (_privateKey) return _privateKey;

  const raw = process.env.CLAUDE_AGENT_SPIFFE_PRIVATE_KEY_JWK?.trim();
  if (!raw) return null;

  try {
    _privateKey = await loadPrivateKey(raw);
    return _privateKey;
  } catch (err) {
    console.error("[claude-identity] Failed to load private key:", err);
    return null;
  }
}

// ── Base URL ──────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://unenter.live"
  );
}

// ── Token acquisition ─────────────────────────────────────────────────────────

/**
 * Get a valid Agent Access Token for Claude.
 *
 * Returns null if `CLAUDE_AGENT_SPIFFE_PRIVATE_KEY_JWK` is not configured —
 * callers should degrade gracefully (e.g., skip agent auth header).
 */
export async function getClaudeAgentToken(): Promise<string | null> {
  const privateKey = await getPrivateKey();
  if (!privateKey) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still fresh
  if (_cached && _cached.expiresAt - REFRESH_BUFFER_SECONDS > now) {
    return _cached.response.access_token;
  }

  // Acquire a new token
  try {
    const response = await requestSelfAuthToken({
      spiffeId: CLAUDE_SPIFFE_ID,
      privateKey,
      baseUrl: getBaseUrl(),
      scope: "agent:self",
    });

    const claims = decodeAat(response.access_token);
    const expiresAt = claims?.exp ?? now + response.expires_in;

    _cached = { response, expiresAt };
    return response.access_token;
  } catch (err) {
    console.error("[claude-identity] Token acquisition failed:", err);
    _cached = null;
    return null;
  }
}

/**
 * Build the Authorization header value for Claude when calling internal APIs.
 * Returns undefined if no token is available.
 */
export async function claudeAuthHeader(): Promise<
  { Authorization: string } | Record<string, never>
> {
  const token = await getClaudeAgentToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Check whether Claude identity is configured on this instance.
 */
export function isClaudeIdentityConfigured(): boolean {
  return Boolean(process.env.CLAUDE_AGENT_SPIFFE_PRIVATE_KEY_JWK?.trim());
}
