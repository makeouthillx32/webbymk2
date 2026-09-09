import { npmGetToken } from "../src/ink/npm/auth.ts";
import { npmListHosts, npmUpdateHost } from "../src/ink/npm/hosts.ts";

async function main() {
  const token = await npmGetToken();
  const hosts = await npmListHosts(token);
  const targetIds = [28, 212, 45, 25, 246];

  for (const id of targetIds) {
    const host = hosts.find((h) => h.id === id);
    if (!host) continue;

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
      advanced_config: "",
      locations: host.locations || [],
      meta: {},
    };

    console.log(`Fixing [${host.id}] ${host.domain_names.join(", ")}...`);
    const updated = await npmUpdateHost(host.id, payload, token, true);
    console.log(`Updated [${host.id}] nginx_online:`, updated.meta?.nginx_online, updated.meta?.nginx_err || "");
  }
}

await main();
