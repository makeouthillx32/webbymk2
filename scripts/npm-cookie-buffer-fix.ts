// One-off incident-response script — code red, 2026-08-27.
// Mobile Safari/Brave (WebKit) users get "server stopped responding" on
// tank.unenter.live; clearing cookies fixes it. This is the same bug class
// as the 2026-08-17 auth 502 incident (see memory:
// project-nginx-4k-header-buffer-502) but on the REQUEST side: nginx's
// default large_client_header_buffers (4 8k) rejects an oversized incoming
// Cookie header outright, and — unlike a clean 400 — some proxy chains just
// drop the connection, which is exactly what Safari reports as "server
// stopped responding". The prior fix only covered the response-header path
// (proxy_buffer_size/proxy_buffers/proxy_busy_buffers_size) on two hosts.
// This applies both directions to every live proxy host, since cookies for
// .unenter.live are shared across all subdomains — any host can be hit by
// the same oversized cookie jar.
import { npmGetToken } from "../src/ink/npm/auth.ts";
import { npmListHosts, npmUpdateHost } from "../src/ink/npm/hosts.ts";

const BUFFER_BLOCK = [
  "# cookie/header buffer fix — code red 2026-08-27, see vault/Docker",
  "large_client_header_buffers 4 32k;",
  "client_header_buffer_size 32k;",
  "proxy_buffer_size 32k;",
  "proxy_buffers 8 32k;",
  "proxy_busy_buffers_size 64k;",
].join("\n");

async function main() {
  const token = await npmGetToken();
  const hosts = await npmListHosts(token);
  console.log(`Found ${hosts.length} proxy host(s).\n`);

  for (const host of hosts) {
    const domains = host.domain_names.join(", ");
    if (host.advanced_config.includes("code red 2026-08-27")) {
      console.log(`SKIP  [${host.id}] ${domains} — already patched`);
      continue;
    }
    const merged = host.advanced_config?.trim()
      ? `${host.advanced_config.trim()}\n\n${BUFFER_BLOCK}`
      : BUFFER_BLOCK;
    try {
      await npmUpdateHost(host.id, { advanced_config: merged }, token, true);
      console.log(`FIXED [${host.id}] ${domains}`);
    } catch (err) {
      console.error(`FAIL  [${host.id}] ${domains} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

await main();
