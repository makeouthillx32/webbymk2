import { npmGetToken } from "../src/ink/npm/auth.ts";
import { npmListHosts, npmUpdateHost } from "../src/ink/npm/hosts.ts";

function cleanAdvancedConfig(config: string): string {
  // Pure buffer directives only — NEVER put location or error_page blocks in advanced_config
  // because NPM templates inject advanced_config into locations where nested location blocks cause [emerg] syntax errors.
  return [
    "# Unenter Multi-Zone Enhanced Buffers & WebKit Cookie Isolation",
    "large_client_header_buffers 4 32k;",
    "client_header_buffer_size 32k;",
    "proxy_buffer_size 32k;",
    "proxy_buffers 8 32k;",
    "proxy_busy_buffers_size 64k;",
    "client_max_body_size 100M;",
  ].join("\n");
}

async function main() {
  const token = await npmGetToken();
  const hosts = await npmListHosts(token);
  console.log(`Found ${hosts.length} proxy host(s).\n`);

  let repairedCount = 0;
  for (const host of hosts) {
    const domains = host.domain_names.join(", ");
    const cleaned = cleanAdvancedConfig(host.advanced_config || "");

    const payload = {
      domain_names: host.domain_names,
      forward_scheme: host.forward_scheme,
      forward_host: host.forward_host,
      forward_port: host.forward_port,
      certificate_id: host.certificate_id,
      ssl_forced: host.ssl_forced,
      http2_support: host.http2_support,
      allow_websocket_upgrade: host.allow_websocket_upgrade,
      block_exploits: host.block_exploits,
      caching_enabled: host.caching_enabled,
      hsts_enabled: host.hsts_enabled,
      hsts_subdomains: host.hsts_subdomains,
      access_list_id: host.access_list_id,
      advanced_config: cleaned,
      locations: host.locations || [],
      meta: {},
    };

    try {
      const updated = await npmUpdateHost(host.id, payload, token, true);
      const isOnline = updated.meta?.nginx_online !== false;
      if (isOnline) {
        console.log(`✓ ONLINE [${host.id}] ${domains}`);
        repairedCount++;
      } else {
        console.error(`✗ NGINX ERR [${host.id}] ${domains}:`, updated.meta?.nginx_err);
      }
    } catch (err) {
      console.error(`FAIL [${host.id}] ${domains} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nRepaired & verified online: ${repairedCount}/${hosts.length} hosts.`);
}

await main();
