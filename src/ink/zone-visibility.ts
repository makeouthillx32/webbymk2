// src/ink/zone-visibility.ts
// ─────────────────────────────────────────────────────────────────────────────
// Zone public-visibility read/write against core Supabase (public.zones), via
// kong REST with the service key. Shared by the IPC command handler
// (`unaxis zone <key> public|private|visibility`) and the TUI zones panel's
// [P] toggle, so both drive the exact same catalog write.
//
// visibility is DASHBOARD-owned in the ownership model; a deliberate operator
// toggle here is a legitimate write, distinct from the sync path (which only
// SEEDS visibility on insert and never overwrites dashboard edits).
// ─────────────────────────────────────────────────────────────────────────────

import {
  ensureRuntimeEnv,
  getRuntimeKongUrl,
  getRuntimeServiceKey,
} from "../utils/runtimeEnv.js";

export type ZoneVisibility = "private" | "unlisted" | "public";

export interface ZoneVisibilityRow {
  key: string;
  label: string;
  domain: string;
  visibility: ZoneVisibility;
}

const SELECT = "key,label,domain,visibility";

function restConfig() {
  ensureRuntimeEnv(true);
  const kongUrl = getRuntimeKongUrl().replace(/\/+$/, "");
  const serviceKey = getRuntimeServiceKey();
  if (!serviceKey) {
    throw new Error("SERVICE_ROLE_KEY not loaded; cannot update zone visibility");
  }
  return { kongUrl, serviceKey };
}

function headers(serviceKey: string, extra?: Record<string, string>) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...extra,
  };
}

const keyFilter = (zoneKey: string) => `eq.${encodeURIComponent(zoneKey)}`;

export async function fetchZoneVisibility(zoneKey: string): Promise<ZoneVisibilityRow | null> {
  const { kongUrl, serviceKey } = restConfig();
  const res = await fetch(
    `${kongUrl}/rest/v1/zones?key=${keyFilter(zoneKey)}&select=${SELECT}&limit=1`,
    { headers: headers(serviceKey) },
  );
  if (!res.ok) {
    throw new Error(`Supabase zone visibility read failed (${res.status}): ${await res.text()}`);
  }
  const rows = (await res.json()) as ZoneVisibilityRow[];
  return rows[0] ?? null;
}

export async function setZoneVisibility(
  zoneKey: string,
  visibility: ZoneVisibility,
): Promise<ZoneVisibilityRow> {
  const { kongUrl, serviceKey } = restConfig();
  const res = await fetch(
    `${kongUrl}/rest/v1/zones?key=${keyFilter(zoneKey)}&select=${SELECT}`,
    {
      method: "PATCH",
      headers: headers(serviceKey, { Prefer: "return=representation" }),
      body: JSON.stringify({ visibility, updated_at: new Date().toISOString() }),
    },
  );
  if (!res.ok) {
    throw new Error(`Supabase zone visibility update failed (${res.status}): ${await res.text()}`);
  }
  const rows = (await res.json()) as ZoneVisibilityRow[];
  const row = rows[0];
  if (!row) throw new Error(`Supabase zone not found: ${zoneKey}`);
  return row;
}

/** Flip public ↔ private (treats unlisted as "not public" → goes public). */
export async function toggleZoneVisibility(zoneKey: string): Promise<ZoneVisibilityRow> {
  const current = await fetchZoneVisibility(zoneKey);
  const next: ZoneVisibility = current?.visibility === "public" ? "private" : "public";
  return setZoneVisibility(zoneKey, next);
}
