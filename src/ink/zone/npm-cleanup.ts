// src/ink/zone/npm-cleanup.ts
// ─────────────────────────────────────────────────────────────────────────────
// NPM proxy host cleanup.
//
// Best-effort removal of the NPM proxy host for a deleted zone.
// This step is wrapped so any NPM-side failure never blocks
// deleting the zone — filesystem removal has already succeeded.
//
// Orphan proxy hosts are easy to clean up later in the NPM UI.
// ─────────────────────────────────────────────────────────────────────────────

import { DOMAIN }                              from "../../config/stack.ts";
import { npmFindHost, npmDeleteHost, npmGetToken } from "../npm-api.ts";
import type { OnLine }                         from "./types.ts";

// ── Delete NPM proxy host for a zone (best-effort) ──────────────────────────────

export async function deleteZoneNpmHost(key: string, onLine: OnLine): Promise<void> {
  const domain = `${key}.${DOMAIN || "unenter.live"}`;
  onLine(`Removing NPM proxy host for ${domain}...`);

  let token: string;
  try {
    token = await npmGetToken();
  } catch (e) {
    onLine(`�a� NPM auth failed — skipping proxy-host cleanup (${String(e)})`);
    onLine(`  You may need to remove ${domain} manually in the NPM UI.`);
    return;
  }

  let host;
  try {
    host = await npmFindHost(domain, token);
  } catch (e) {
    onLine(`�a� NPM lookup failed — skipping proxy-host cleanup (${String(e)})`);
    return;
  }

  if (!host) {
    onLine(`� No NPM proxy host for ${domain} — nothing to remove`);
    return;
  }

  try {
    await npmDeleteHost(host.id, token);
    onLine(`� Removed NPM proxy host #${host.id} (${domain})`);
  } catch (e) {
    onLine(`�a� NPM delete failed (${String(e)})`);
    onLine(`  Remove host #${host.id} manually in the NPM UI.`);
  }
}
