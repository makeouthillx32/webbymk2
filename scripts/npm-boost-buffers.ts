// Properly increase buffer/header directives on specific hosts — REPLACES
// each known directive's value in place rather than appending a duplicate
// (the mistake from the first pass). Any line not matching a known
// directive (comments, error_page/location blocks, etc.) is left untouched.
import { npmGetToken } from "../src/ink/npm/auth.ts";
import { npmListHosts, npmFindHost, npmUpdateHost } from "../src/ink/npm/hosts.ts";

const NEW_VALUES: Record<string, string> = {
  proxy_buffer_size: "256k",
  proxy_buffers: "8 512k",
  proxy_busy_buffers_size: "512k",
  large_client_header_buffers: "16 128k",
  client_header_buffer_size: "128k",
};

function boost(config: string): string {
  const lines = config.split("\n");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*([a-z_]+)\s+([^;]+);/);
    const directive = match?.[1];
    if (directive && NEW_VALUES[directive]) {
      out.push(`${directive} ${NEW_VALUES[directive]};`);
      seen.add(directive);
    } else {
      out.push(line);
    }
  }
  // Add any directive that wasn't present at all yet.
  const missing = Object.entries(NEW_VALUES).filter(([k]) => !seen.has(k));
  if (missing.length) {
    if (out.length && out[out.length - 1].trim() !== "") out.push("");
    for (const [k, v] of missing) out.push(`${k} ${v};`);
  }
  return out.join("\n");
}

async function main() {
  const targets = process.argv.slice(2);
  const token = await npmGetToken();
  const hosts = await npmListHosts(token);
  for (const domain of targets) {
    const host = hosts.find((h) => h.domain_names.includes(domain));
    if (!host) { console.error(`NOT FOUND: ${domain}`); continue; }
    const before = host.advanced_config ?? "";
    const after = boost(before);
    console.log(`\n=== [${host.id}] ${domain} — before ===`);
    console.log(before || "(empty)");
    console.log(`--- after ---`);
    console.log(after);
    await npmUpdateHost(host.id, { advanced_config: after }, token, true);
    console.log(`APPLIED [${host.id}] ${domain}`);
  }
}

await main();
