// src/lib/spiffe/registry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Agent Identity Registry — the authoritative list of allowed agents.
//
// Source of truth: Supabase `agent_identities` table.
// Read path: in-memory TTL cache (30 s) so hot-path token verification
// does not hammer Supabase on every request.
// Write path: always goes to Supabase; clears the local cache entry.
//
// Revocation is immediate for write operations; cached reads may lag up to
// CACHE_TTL_MS (30 seconds) — acceptable for agent identity at this scale.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/utils/supabase/admin";
import type { AgentRegistration } from "./types";

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  registration: AgentRegistration | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(spiffeId: string): AgentRegistration | null | undefined {
  const entry = cache.get(spiffeId);
  if (!entry) return undefined; // cache miss
  if (Date.now() > entry.expiresAt) {
    cache.delete(spiffeId);
    return undefined; // expired
  }
  return entry.registration; // may be null (known-negative)
}

function setCached(spiffeId: string, registration: AgentRegistration | null): void {
  cache.set(spiffeId, { registration, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── DB row shape ──────────────────────────────────────────────────────────────

interface AgentIdentityRow {
  id: string;
  spiffe_id: string;
  display_name: string;
  description: string | null;
  public_key_jwk: JsonWebKey | null;
  is_active: boolean;
  created_at: string;
  last_seen_at: string | null;
}

function rowToRegistration(row: AgentIdentityRow): AgentRegistration {
  return {
    id: row.id,
    spiffeId: row.spiffe_id,
    displayName: row.display_name,
    description: row.description,
    publicKeyJwk: row.public_key_jwk ?? {},
    isActive: row.is_active,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Look up an agent by SPIFFE ID.
 * Returns the registration if found and active, null otherwise.
 */
export async function lookupAgent(
  spiffeId: string,
): Promise<AgentRegistration | null> {
  const cached = getCached(spiffeId);
  if (cached !== undefined) return cached;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("agent_identities")
      .select("id, spiffe_id, display_name, description, public_key_jwk, is_active, created_at, last_seen_at")
      .eq("spiffe_id", spiffeId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("[spiffe/registry] Supabase lookup error:", error.message);
      return null;
    }

    const result = data ? rowToRegistration(data as AgentIdentityRow) : null;
    setCached(spiffeId, result);
    return result;
  } catch (err) {
    console.error("[spiffe/registry] Unexpected error:", err);
    return null;
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

export interface RegisterAgentOptions {
  spiffeId: string;
  displayName: string;
  description?: string;
  publicKeyJwk: JsonWebKey;
  createdBy?: string;
}

/**
 * Register a new agent in the registry.
 * Throws on duplicate SPIFFE ID or database error.
 */
export async function registerAgent(
  opts: RegisterAgentOptions,
): Promise<AgentRegistration> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("agent_identities")
    .upsert({
      spiffe_id: opts.spiffeId,
      display_name: opts.displayName,
      description: opts.description ?? null,
      public_key_jwk: opts.publicKeyJwk,
      is_active: true,
      created_by: opts.createdBy ?? null,
    }, { onConflict: "spiffe_id" })
    .select("id, spiffe_id, display_name, description, public_key_jwk, is_active, created_at, last_seen_at")
    .single();

  if (error) {
    throw new Error(`Failed to register agent: ${error.message}`);
  }

  const registration = rowToRegistration(data as AgentIdentityRow);
  setCached(opts.spiffeId, registration);
  return registration;
}

// ── Revocation ────────────────────────────────────────────────────────────────

/**
 * Deactivate an agent (soft-delete). Clears the cache entry.
 */
export async function revokeAgent(spiffeId: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("agent_identities")
    .update({ is_active: false })
    .eq("spiffe_id", spiffeId);

  if (error) {
    throw new Error(`Failed to revoke agent: ${error.message}`);
  }

  // Evict — next lookup will return null
  cache.delete(spiffeId);
}

// ── Last-seen touch ───────────────────────────────────────────────────────────

/**
 * Update last_seen_at for an active agent (fire-and-forget).
 * Called after successful token issuance.
 */
export async function touchAgentLastSeen(spiffeId: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from("agent_identities")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("spiffe_id", spiffeId);
    // Invalidate cached entry so next lookup gets fresh last_seen_at
    cache.delete(spiffeId);
  } catch (err) {
    console.error("[spiffe/registry] touchAgentLastSeen failed:", err);
  }
}

// ── List (admin) ──────────────────────────────────────────────────────────────

/** Return all registered agents (active and inactive). Admin use only. */
export async function listAllAgents(): Promise<AgentRegistration[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agent_identities")
    .select("id, spiffe_id, display_name, description, public_key_jwk, is_active, created_at, last_seen_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list agents: ${error.message}`);
  return (data as AgentIdentityRow[]).map(rowToRegistration);
}
