// src/ink/npm/zone.ts
// Production zone registration in NPM.
//
// Flow:
//   1. Upstream derivation — resolves forward_host:forward_port from zone.environmentId
//   2. Credential check
//   3. Connectivity ping
//   4. Auth
//   5. Idempotency: if host exists with correct forward, exit cleanly
//   6. If host exists with wrong forward, update it
//   7. If host missing: look for existing cert to reuse (avoids LE rate limit)
//   8. Create proxy host — with reused cert if available, else LE "new"
//
// Upstream derivation rules:
//   local-docker env (POWER)           → STACK_HOST.ip : STACK_HOST.proxyPort (routes through unt_proxy)
//   remote env with proxyPort > 0      → env_host : env.proxyPort              (routes through env's proxy)
//   remote env with proxyPort = 0      → env_host : 3000                       (routes directly to zone container)
//   no env / unresolvable              → STACK_HOST.ip : STACK_HOST.proxyPort  (POWER fallback)

import { STACK_HOST, NPM_HOST }             from "../../config/stack.ts";
import type { Zone }                        from "../../config/zones.ts";
import type { UnaxisEnvironment }           from "../environment-store.ts";
import { npmPing, npmGetToken }             from "./auth.ts";
import { npmFindHost, npmUpdateHost, npmCreateHost } from "./hosts.ts";
import { npmFindCertForDomain }             from "./certs.ts";
import { SLOW_TIMEOUT_MS }                  from "./client.ts";
import type { OnLine }                      from "./types.ts";

// ── Upstream derivation ───────────────────────────────────────────────────────

/**
 * Derive the NPM forward_host and forward_port for a zone.
 *
 * NPM sits at the public edge — it needs to reach the zone's actual host.
 * The derivation mirrors deriveZoneUpstream() in proxy-config.ts but for the
 * NPM layer rather than the internal unt_proxy layer:
 *
 *   POWER (local-docker)  → STACK_HOST.ip : STACK_HOST.proxyPort
 *                           All POWER zones share unt_proxy — same logic as before.
 *
 *   Remote (remote-docker,  → env_host : env.proxyPort  (if proxyPort > 0)
 *           azure, edge)    → env_host : 3000            (if proxyPort = 0, direct to container)
 *
 *   No env / fallback       → STACK_HOST.ip : STACK_HOST.proxyPort
 */
export function deriveNpmUpstream(
  zone: Zone,
  env:  UnaxisEnvironment | null,
): { host: string; port: number } {
  // No assigned environment or explicitly local → POWER proxy (current behaviour)
  if (!env || env.type === "local-docker") {
    return { host: STACK_HOST.ip, port: STACK_HOST.proxyPort };
  }

  // Remote environment — extract host IP.
  // Prefer proxyHost (explicit), fall back to parsing agentUrl.
  let host = env.proxyHost || "";
  if (!host && env.agentUrl) {
    try { host = new URL(env.agentUrl).hostname; } catch { /* ignore */ }
  }

  if (!host) {
    // Cannot determine remote host — fall back to POWER proxy rather than break routing
    return { host: STACK_HOST.ip, port: STACK_HOST.proxyPort };
  }

  // proxyPort > 0 means the env runs a proxy (e.g. unt_proxy at :3080)
  // proxyPort = 0 means route directly to the zone container port
  const port = (env.proxyPort ?? 0) > 0 ? env.proxyPort : 3000;
  return { host, port };
}

// ── Auto-resolve environment ──────────────────────────────────────────────────

async function resolveEnv(zone: Zone): Promise<UnaxisEnvironment | null> {
  if (!zone.environmentId) return null;
  try {
    const { loadEnvironments } = await import("../environment-store.js");
    const envs = await loadEnvironments();
    return envs.find((e) => e.id === zone.environmentId) ?? null;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register or update an NPM proxy host for a zone.
 *
 * @param zone   Zone record — zone.environmentId is used to derive the upstream.
 * @param onLine Progress callback for TUI display.
 * @param env    Optional pre-resolved environment. If omitted, auto-looked up
 *               from zone.environmentId. Pass null to force POWER-proxy fallback.
 */
export async function npmAddZone(
  zone:   Zone,
  onLine: OnLine,
  env?:   UnaxisEnvironment | null,
): Promise<number> {
  const domain = zone.domain;

  // 1. Resolve environment + derive upstream
  const resolvedEnv = env !== undefined ? env : await resolveEnv(zone);
  const { host: fwdHost, port: fwdPort } = deriveNpmUpstream(zone, resolvedEnv);

  const envLabel = resolvedEnv
    ? ` [${resolvedEnv.name}]`
    : ` [POWER]`;

  onLine(`NPM      →  ${NPM_HOST.ip}:${NPM_HOST.port}`);
  onLine(`Zone     →  ${domain}${envLabel}`);
  onLine(`Forward  →  ${fwdHost}:${fwdPort}`);
  onLine("");

  // 2. Credentials
  if (!NPM_HOST.email || !NPM_HOST.password) {
    onLine("✗ NPM_EMAIL and NPM_PASSWORD must be set in .env");
    onLine(`  Open: ${NPM_HOST.uiUrl}`);
    return 1;
  }

  // 3. Connectivity
  onLine("Checking NPM connectivity...");
  if (!await npmPing()) {
    onLine(`✗ Cannot reach NPM at ${NPM_HOST.apiUrl}`);
    onLine(`  Is L0VE (${NPM_HOST.ip}) online?`);
    return 1;
  }
  onLine("✓ NPM reachable");

  // 4. Auth
  onLine("Authenticating...");
  let token: string;
  try {
    token = await npmGetToken();
    onLine("✓ Token obtained");
  } catch (e) {
    onLine(`✗ ${String(e)}`);
    return 1;
  }

  // 5. Idempotency check — compare against the DERIVED upstream, not a hardcoded constant
  onLine(`Checking if ${domain} is already registered...`);
  const existing = await npmFindHost(domain, token).catch((e: unknown) => {
    onLine(`✗ ${String(e)}`);
    return undefined;
  });
  if (existing === undefined) return 1;

  if (existing) {
    const sslLabel     = existing.certificate_id ? "SSL ✓" : "no cert";
    const enabledLabel = existing.enabled         ? "enabled" : "DISABLED";
    onLine(`Found (host #${existing.id})  ·  ${sslLabel}  ·  ${enabledLabel}`);
    onLine(`  forward  →  ${existing.forward_host}:${existing.forward_port}`);

    if (existing.forward_host === fwdHost && existing.forward_port === fwdPort) {
      onLine(`✓ Forward target is correct  (${fwdHost}:${fwdPort})`);
      onLine(`  Review: ${NPM_HOST.uiUrl}`);
      return 0;
    }

    // 6. Stale forward — update in place
    onLine(`⚠ Forward target is WRONG — expected ${fwdHost}:${fwdPort}`);
    onLine(`  Updating proxy host #${existing.id}...`);
    try {
      await npmUpdateHost(existing.id, {
        domain_names:            [domain],
        forward_scheme:          "http",
        forward_host:            fwdHost,
        forward_port:            fwdPort,
        certificate_id:          existing.certificate_id ?? 0,
        ssl_forced:              true,
        http2_support:           true,
        allow_websocket_upgrade: true,
        block_exploits:          true,
        caching_enabled:         false,
        hsts_enabled:            false,
        hsts_subdomains:         false,
        access_list_id:          0,
        advanced_config:         "",
        locations:               [],
      }, token, true);
      onLine(`✓ Proxy host updated  →  ${fwdHost}:${fwdPort}`);
      onLine(`  Review: ${NPM_HOST.uiUrl}`);
      return 0;
    } catch (e) {
      onLine(`✗ Update failed: ${String(e)}`);
      onLine(`  Fix manually: ${NPM_HOST.uiUrl}`);
      return 1;
    }
  }

  onLine(`Not found — creating proxy host...`);

  // 7. Reuse existing cert if available — avoids LE 5-cert/week rate limit
  onLine(`Checking NPM for existing cert covering ${domain}...`);
  const reusableCert = await npmFindCertForDomain(domain, token, onLine);

  let certId:   number | string;

  if (reusableCert) {
    const exp = reusableCert.expires_on
      ? `expires ${new Date(reusableCert.expires_on).toLocaleDateString()}`
      : "no expiry";
    onLine(`✓ Reusing cert #${reusableCert.id}  "${reusableCert.nice_name}"  (${exp})`);
    certId = reusableCert.id;
  } else {
    const leEmail = NPM_HOST.letsencryptEmail;
    if (!leEmail) {
      onLine("✗ NPM_LE_EMAIL or NPM_EMAIL must be set for Let's Encrypt");
      return 1;
    }
    onLine(`No existing cert found — requesting new Let's Encrypt cert...`);
    onLine("  (this may take 30-60s — HTTP-01 challenge runs server-side)");
    certId = "new";
  }

  // 8. Create
  const payload: Record<string, unknown> = {
    domain_names:            [domain],
    forward_scheme:          "http",
    forward_host:            fwdHost,
    forward_port:            fwdPort,
    certificate_id:          certId,
    ssl_forced:              true,
    http2_support:           true,
    allow_websocket_upgrade: true,
    block_exploits:          true,
    caching_enabled:         false,
    hsts_enabled:            false,
    hsts_subdomains:         false,
    access_list_id:          0,
    advanced_config:         "",
    locations:               [],
  };

  try {
    const created = await npmCreateHost(payload, token, certId === "new");
    onLine(`✓ Proxy host created  (id #${created.id})`);
    onLine(reusableCert
      ? `✓ SSL cert reused  (id #${reusableCert.id}  "${reusableCert.nice_name}")`
      : `✓ Let's Encrypt cert requested`);
    onLine("");
    onLine(`  ${domain}  →  ${fwdHost}:${fwdPort}${envLabel}`);
    onLine("  SSL forced · HTTP/2 · WebSocket upgrade · exploit blocking");
    onLine("");
    onLine(`  Review: ${NPM_HOST.uiUrl}`);
    return 0;
  } catch (e) {
    const msg = String(e);
    onLine(`✗ ${msg}`);
    onLine("");
    if (msg.includes("400")) {
      onLine("Schema validation failed — payload shape likely wrong for this NPM version.");
      onLine("Fields sent: " + Object.keys(payload).join(", "));
    } else if (msg.includes("AbortError") || msg.includes("timed out")) {
      onLine("  NPM may still be processing — check the UI, the host might appear shortly.");
    } else {
      onLine("Common causes:");
      onLine("  · DNS for this domain not yet pointing to NPM's IP");
      onLine("  · Let's Encrypt rate limit — wait or use staging");
      onLine(`  · Review NPM logs: ${NPM_HOST.uiUrl}`);
    }
    return 1;
  }
}
