// src/ink/npm/zone.ts
// Production zone registration in NPM.
//
// Flow:
//   1. Credential check
//   2. Connectivity ping
//   3. Auth
//   4. Idempotency: if host exists with correct forward, exit cleanly
//   5. If host exists with wrong forward, update it
//   6. If host missing: look for existing cert to reuse (avoids LE rate limit)
//   7. Create proxy host — with reused cert if available, else LE "new"

import { STACK_HOST, NPM_HOST }             from "../../config/stack.ts";
import type { Zone }                        from "../../config/zones.ts";
import { npmPing, npmGetToken }             from "./auth.ts";
import { npmFindHost, npmUpdateHost, npmCreateHost, resolveProxyHostsBase } from "./hosts.ts";
import { npmFindCertForDomain }             from "./certs.ts";
import { SLOW_TIMEOUT_MS }                  from "./client.ts";
import type { OnLine }                      from "./types.ts";

export async function npmAddZone(zone: Zone, onLine: OnLine): Promise<number> {
  const domain = zone.domain;

  onLine(`NPM      →  ${NPM_HOST.ip}:${NPM_HOST.port}`);
  onLine(`Zone     →  ${domain}`);
  onLine(`Forward  →  ${STACK_HOST.ip}:${STACK_HOST.proxyPort}`);
  onLine("");

  // 1. Credentials
  if (!NPM_HOST.email || !NPM_HOST.password) {
    onLine("✗ NPM_EMAIL and NPM_PASSWORD must be set in .env");
    onLine(`  Open: ${NPM_HOST.uiUrl}`);
    return 1;
  }

  // 2. Connectivity
  onLine("Checking NPM connectivity...");
  if (!await npmPing()) {
    onLine(`✗ Cannot reach NPM at ${NPM_HOST.apiUrl}`);
    onLine(`  Is L0VE (${NPM_HOST.ip}) online?`);
    return 1;
  }
  onLine("✓ NPM reachable");

  // 3. Auth
  onLine("Authenticating...");
  let token: string;
  try {
    token = await npmGetToken();
    onLine("✓ Token obtained");
  } catch (e) {
    onLine(`✗ ${String(e)}`);
    return 1;
  }

  // 4. Idempotency check
  onLine(`Checking if ${domain} is already registered...`);
  let existing = await npmFindHost(domain, token).catch((e: unknown) => { onLine(`✗ ${String(e)}`); return undefined; });
  if (existing === undefined) return 1;

  if (existing) {
    const sslLabel     = existing.certificate_id ? "SSL ✓" : "no cert";
    const enabledLabel = existing.enabled         ? "enabled" : "DISABLED";
    onLine(`Found (host #${existing.id})  ·  ${sslLabel}  ·  ${enabledLabel}`);
    onLine(`  forward  →  ${existing.forward_host}:${existing.forward_port}`);

    if (existing.forward_host === STACK_HOST.ip && existing.forward_port === STACK_HOST.proxyPort) {
      onLine(`✓ Forward target is correct  (${STACK_HOST.ip}:${STACK_HOST.proxyPort})`);
      onLine(`  Review: ${NPM_HOST.uiUrl}`);
      return 0;
    }

    // 5. Stale forward — update in place
    onLine(`⚠ Forward target is WRONG — expected ${STACK_HOST.ip}:${STACK_HOST.proxyPort}`);
    onLine(`  Updating proxy host #${existing.id}...`);
    try {
      await npmUpdateHost(existing.id, {
        domain_names:            [domain],
        forward_scheme:          "http",
        forward_host:            STACK_HOST.ip,
        forward_port:            STACK_HOST.proxyPort,
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
      onLine(`✓ Proxy host updated  →  ${STACK_HOST.ip}:${STACK_HOST.proxyPort}`);
      onLine(`  Review: ${NPM_HOST.uiUrl}`);
      return 0;
    } catch (e) {
      onLine(`✗ Update failed: ${String(e)}`);
      onLine(`  Fix manually: ${NPM_HOST.uiUrl}`);
      return 1;
    }
  }

  onLine(`Not found — creating proxy host...`);

  // 6. Reuse existing cert if available — avoids LE 5-cert/week rate limit
  onLine(`Checking NPM for existing cert covering ${domain}...`);
  const reusableCert = await npmFindCertForDomain(domain, token, onLine);

  let certId:   number | string;
  let certMeta: Record<string, unknown> | undefined;

  if (reusableCert) {
    const exp = reusableCert.expires_on
      ? `expires ${new Date(reusableCert.expires_on).toLocaleDateString()}`
      : "no expiry";
    onLine(`✓ Reusing cert #${reusableCert.id}  "${reusableCert.nice_name}"  (${exp})`);
    certId   = reusableCert.id;
    certMeta = undefined;
  } else {
    const leEmail = NPM_HOST.letsencryptEmail;
    if (!leEmail) {
      onLine("✗ NPM_LE_EMAIL or NPM_EMAIL must be set for Let's Encrypt");
      return 1;
    }
    onLine(`No existing cert found — requesting new Let's Encrypt cert...`);
    onLine("  (this may take 30-60s — HTTP-01 challenge runs server-side)");
    certId   = "new";
    certMeta = undefined; // NPM v2.13+ handles LE internally — no meta fields accepted
  }

  // 7. Create
  const payload: Record<string, unknown> = {
    domain_names:            [domain],
    forward_scheme:          "http",
    forward_host:            STACK_HOST.ip,
    forward_port:            STACK_HOST.proxyPort,
    certificate_id:          certId,
    ...(certMeta ? { meta: certMeta } : {}),
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
    onLine(`  ${domain}  →  ${STACK_HOST.ip}:${STACK_HOST.proxyPort}`);
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
