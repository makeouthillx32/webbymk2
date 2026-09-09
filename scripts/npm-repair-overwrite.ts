// Repair pass: my earlier script appended a smaller buffer block after any
// EXISTING advanced_config, and since nginx uses the last-declared directive
// in a context, that silently downgraded any host that already had good
// custom buffer tuning (e.g. db.unenter.live's 64k/8x64k/128k from the
// 2026-08-17 incident got shadowed by my appended 32k/8x32k/64k). For any
// host where my marker block has real content BEFORE it, strip my block
// entirely and restore the original — the pre-existing config was already
// fine. For hosts where my block was the ONLY content, leave it in place —
// that's a genuine net-new fix with nothing to regress.
import { npmGetToken } from "../src/ink/npm/auth.ts";
import { npmListHosts, npmUpdateHost } from "../src/ink/npm/hosts.ts";

const MARKER = "# cookie/header buffer fix — code red 2026-08-27, see vault/Docker";

async function main() {
  const token = await npmGetToken();
  const hosts = await npmListHosts(token);
  for (const host of hosts) {
    const cfg = host.advanced_config ?? "";
    const idx = cfg.indexOf(MARKER);
    if (idx === -1) continue; // never touched by my script
    const before = cfg.slice(0, idx).trim();
    if (!before) {
      console.log(`KEEP  [${host.id}] ${host.domain_names.join(", ")} — no pre-existing config, my block stands`);
      continue;
    }
    try {
      await npmUpdateHost(host.id, { advanced_config: before }, token, true);
      console.log(`REVERT[${host.id}] ${host.domain_names.join(", ")} — restored pre-existing config, stripped my append`);
    } catch (err) {
      console.error(`FAIL  [${host.id}] ${host.domain_names.join(", ")} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

await main();
