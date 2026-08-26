// src/ink/zone/npm-cleanup.ts
// -----------------------------------------------------------------------------
// Best-effort removal of the NPM proxy host for a deleted zone.

import { DOMAIN } from "../../config/stack.ts";
import { npmDeleteHost, npmFindHost, npmGetToken } from "../npm-api.ts";
import type { OnLine } from "./types.ts";

export async function deleteZoneNpmHost(
  key: string,
  onLine: OnLine,
): Promise<void> {
  const domain = `${key}.${DOMAIN || "unenter.live"}`;
  onLine(`Removing NPM proxy host for ${domain}...`);

  let token: string;
  try {
    token = await npmGetToken();
  } catch (error) {
    onLine(`WARNING: NPM auth failed - skipping proxy-host cleanup (${String(error)})`);
    onLine(`  You may need to remove ${domain} manually in the NPM UI.`);
    return;
  }

  let host;
  try {
    host = await npmFindHost(domain, token);
  } catch (error) {
    onLine(`WARNING: NPM lookup failed - skipping proxy-host cleanup (${String(error)})`);
    return;
  }

  if (!host) {
    onLine(`No NPM proxy host for ${domain} - nothing to remove`);
    return;
  }

  try {
    await npmDeleteHost(host.id, token);
    onLine(`Removed NPM proxy host #${host.id} (${domain})`);
  } catch (error) {
    onLine(`WARNING: NPM delete failed (${String(error)})`);
    onLine(`  Remove host #${host.id} manually in the NPM UI.`);
  }
}
