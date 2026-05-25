// src/utils/pairingKey.ts
// ─────────────────────────────────────────────────────────────────────────────
// UNAXIS Pairing Key — generate and parse connection keys that let a remote
// UNAXIS instance (agent, container, other machine) connect to THIS TUI and
// issue IPC commands as if running locally.
//
// Key format:   uaxc_<base64url(JSON payload)>
//
// Payload shape:
//   {
//     v:     1,                      // format version
//     host:  "192.168.50.204",       // target machine's LAN IP
//     port:  50506,                  // remote-IPC bridge port (separate from 50505)
//     token: "<64-char hex>",        // 32 random bytes — bearer token
//     slug:  "webbymk2",             // project slug (informational)
//     exp:   1748000000,             // Unix timestamp — 24h from generation
//   }
//
// The token is also stored locally (in credentials) so the bridge can validate
// incoming connections before forwarding them to the main IPC handler.
//
// Security model:
//   • Keys expire after TTL_H hours — stale keys are rejected at the bridge.
//   • Token is random and never reused.
//   • Port 50506 binds 0.0.0.0 (LAN-accessible); the main port stays localhost.
//   • The bridge ONLY forwards known IPC commands — it is not a shell.
//
// Usage:
//   const { key, token, expiresAt } = generatePairingKey(host, slug)
//   const payload = parsePairingKey(key)  // null if invalid / expired
// ─────────────────────────────────────────────────────────────────────────────

import { randomBytes, createHmac } from 'crypto'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Remote IPC bridge port — LAN-accessible, token-authenticated. */
export const REMOTE_IPC_PORT = 50506

/** Key lifetime in hours. */
export const KEY_TTL_H = 24

const PREFIX = 'uaxc_'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PairingKeyPayload {
  v:     1
  host:  string
  port:  number
  token: string    // 32-byte random, hex-encoded
  slug:  string
  exp:   number    // Unix timestamp (seconds)
}

export interface GeneratedKey {
  /** The full key string — share this with the remote machine. */
  key:       string
  /** The raw bearer token (stored locally for bridge validation). */
  token:     string
  /** Absolute expiry time. */
  expiresAt: Date
}

// ── Base64url helpers ─────────────────────────────────────────────────────────

function toBase64url(s: string): string {
  return Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64url(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((s.length + 2) % 4 || 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a new pairing key for the given host and project slug.
 *
 * @param host  LAN IP or hostname of this machine (e.g. "192.168.50.204")
 * @param slug  Project slug (e.g. "webbymk2") — informational only
 */
export function generatePairingKey(host: string, slug: string): GeneratedKey {
  const token    = randomBytes(32).toString('hex')                    // 64 hex chars
  const exp      = Math.floor(Date.now() / 1000) + KEY_TTL_H * 3600
  const expiresAt = new Date(exp * 1000)

  const payload: PairingKeyPayload = {
    v:    1,
    host: host.trim(),
    port: REMOTE_IPC_PORT,
    token,
    slug,
    exp,
  }

  const key = PREFIX + toBase64url(JSON.stringify(payload))
  return { key, token, expiresAt }
}

/**
 * Parse and validate a pairing key string.
 *
 * Returns the decoded payload if the key is well-formed and not expired.
 * Returns null for any parse/validation failure — callers must treat null
 * as "rejected" and never proceed.
 */
export function parsePairingKey(raw: string): PairingKeyPayload | null {
  try {
    if (!raw.startsWith(PREFIX)) return null
    const encoded = raw.slice(PREFIX.length)
    const json    = fromBase64url(encoded)
    const payload = JSON.parse(json) as PairingKeyPayload

    if (payload.v !== 1)               return null
    if (typeof payload.host  !== 'string') return null
    if (typeof payload.port  !== 'number') return null
    if (typeof payload.token !== 'string' || payload.token.length !== 64) return null
    if (typeof payload.exp   !== 'number') return null

    const nowSec = Math.floor(Date.now() / 1000)
    if (payload.exp < nowSec) return null   // expired

    return payload
  } catch {
    return null
  }
}

/**
 * Return a human-readable summary for display in the TUI or CLI.
 *
 * Example:
 *   host  192.168.50.204:50506
 *   slug  webbymk2
 *   exp   2026-05-23 14:30 (23h 59m)
 */
export function describePairingKey(p: PairingKeyPayload): {
  host: string; port: number; slug: string; expiresAt: Date; ttlLabel: string
} {
  const expiresAt = new Date(p.exp * 1000)
  const diffMs    = expiresAt.getTime() - Date.now()
  const diffH     = Math.floor(diffMs / 3_600_000)
  const diffM     = Math.floor((diffMs % 3_600_000) / 60_000)
  const ttlLabel  = diffMs <= 0 ? 'expired' : `${diffH}h ${diffM}m remaining`

  return { host: p.host, port: p.port, slug: p.slug, expiresAt, ttlLabel }
}
