import { npmGetToken } from "../src/ink/npm/auth.ts";
import { npmListHosts } from "../src/ink/npm/hosts.ts";

const targets = process.argv.slice(2);
const token = await npmGetToken();
const hosts = await npmListHosts(token);
for (const h of hosts) {
  if (targets.some((t) => h.domain_names.includes(t))) {
    console.log(`\n=== [${h.id}] ${h.domain_names.join(", ")} ===`);
    console.log(h.advanced_config || "(empty)");
  }
}
