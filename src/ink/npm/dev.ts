// src/ink/npm/dev.ts
// Dev proxy host registration in NPM.
//
// Dev containers cycle frequently — requesting a new LE cert every time
// would exhaust the 5-cert/week rate limit within days.  Instead:
//   · Reuse any existing cert covering the domain (exact or wildcard)
//   · If the host already exists but has the wrong forward or no cert, PATCH it
//   · If no cert exists at all, fall back to HTTP-only
//   · Never block dev start — all NPM failures log ⚠ and return 1
//
// forward_host is STACK_HOST.ip — the proxy container name (e.g. "unt_proxy").
// NPM and the app stack share the same Docker network so container names resolve.
// Zones use exactly the same forward target — dev containers must too.

import { NPM_HOST }                           from "../../config/stack.ts";
import { npmPing, npmGetToken }               from "./auth.ts";
import { npmFindHost, npmUpdateHost, npmCreateHost } from "./hosts.ts";
import { npmFindCertForDomain }               from "./certs.ts";
import type { OnLine }                        from "./types.ts";

export async function npmAddDevHost(
  domain:      string,
  forwardHost: string,
  forwardPort: number,
  onLine:      OnLine,
): Promise<number> {
  if (!await npmPing()) {
    onLine(`⚠ NPM unreachable — skipping dev host registration`);
    return 1;
  }

  let token: string;
  try {
    token = await npmGetToken();
  } catch {
    onLine(`⚠ NPM auth failed — skipping dev host registration`);
    return 1;
  }

  // Always scan for a reusable cert first — wildcard covers dev.* too.
  onLine(`Checking NPM for existing cert covering ${domain}...`);
  const cert = await npmFindCertForDomain(domain, token, onLine);

  const existing = await npmFindHost(domain, token).catch(() => null);

  if (existing) {
    // Log what NPM currently has — makes it easy to spot a stale forward.
    onLine(`  Found host #${existing.id}  ·  forward → ${existing.forward_host}:${existing.forward_port}`);

    const hasCert   = !!(existing.certificate_id && existing.certificate_id !== 0);
    const forwardOk = existing.forward_host === forwardHost
                   && existing.forward_port === forwardPort;

    if (hasCert && forwardOk) {
      onLine(`✓ NPM dev host ok (id #${existing.id}, forward ${forwardHost}:${forwardPort}, SSL ok)`);
      return 0;
    }
    if (!cert && forwardOk) {
      onLine(`✓ NPM dev host ok (id #${existing.id}, forward ${forwardHost}:${forwardPort}, HTTP-only)`);
      return 0;
    }

    // PATCH — fix stale forward and/or attach available cert
    const reason = !forwardOk
      ? `stale forward ${existing.forward_host}:${existing.forward_port} → ${forwardHost}:${forwardPort}`
      : `missing cert`;
    onLine(`  Patching host #${existing.id} — ${reason}`);
    if (cert) onLine(`  Attaching cert #${cert.id} "${cert.nice_name}"...`);

    try {
      await npmUpdateHost(existing.id, {
        domain_names:            [domain],
        forward_scheme:          "http",
        forward_host:            forwardHost,
        forward_port:            forwardPort,
        certificate_id:          cert ? cert.id : (existing.certificate_id ?? 0),
        ssl_forced:              cert ? true : !!existing.ssl_forced,
        http2_support:           cert ? true : !!existing.http2_support,
        allow_websocket_upgrade: true,
        block_exploits:          false,
        caching_enabled:         false,
        hsts_enabled:            false,
        hsts_subdomains:         false,
        access_list_id:          0,
        advanced_config:         "",
        locations:               [],
      }, token);
      const certNote = cert ? `, SSL cert #${cert.id} attached` : "";
      onLine(`✓ NPM dev host patched — forward → ${forwardHost}:${forwardPort}${certNote}`);
      return 0;
    } catch (e) {
      onLine(`⚠ Host patch failed: ${String(e)}`);
      onLine(`  Fix manually: ${NPM_HOST.uiUrl}`);
      return 1;
    }
  }

  // Host doesn't exist yet — create with SSL if cert available, else HTTP-only.
  const certId     = cert ? cert.id : 0;
  const sslEnabled = cert != null;

  try {
    const created = await npmCreateHost({
      domain_names:            [domain],
      forward_scheme:          "http",
      forward_host:            forwardHost,
      forward_port:            forwardPort,
      certificate_id:          certId,
      ssl_forced:              sslEnabled,
      http2_support:           sslEnabled,
      allow_websocket_upgrade: true,
      block_exploits:          false,
      caching_enabled:         false,
      hsts_enabled:            false,
      hsts_subdomains:         false,
      access_list_id:          0,
      advanced_config:         "",
      locations:               [],
    }, token);
    const sslNote = cert ? `SSL via cert #${cert.id}` : `HTTP-only (no cert available)`;
    onLine(`✓ NPM dev host created  (id #${created.id}, ${sslNote})`);
    onLine(`  forward → ${forwardHost}:${forwardPort}`);
    return 0;
  } catch (e) {
    onLine(`⚠ NPM dev host create failed: ${String(e)}`);
    onLine(`  Internal proxy is active — dev URL still reachable internally.`);
    return 1;
  }
}
