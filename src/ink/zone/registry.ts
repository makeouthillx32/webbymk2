// src/ink/zone/registry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Supabase zone table operations.
//
// Zone topology is stored in `public.zones` (not in source). These helpers
// INSERT / DELETE rows and bust the in-memory cache so the TUI reflects
// changes immediately without a restart.
// ─────────────────────────────────────────────────────────────────────────────

import type { DerivedZone, OnLine } from "./types.ts";
import { invalidateZoneCache } from "../zone-store.ts";
import { ensureRuntimeEnv, getRuntimeKongUrl, getRuntimeServiceKey } from "../../utils/runtimeEnv.js";

// ── Insert zone into Supabase zones table ────────────────────────────────────

function authHeaders(): Record<string, string> {
  ensureRuntimeEnv(true);
  const serviceKey = getRuntimeServiceKey();
  return {
    "Authorization": "Bearer " + serviceKey,
    "apikey": serviceKey,
  };
}

export async function insertZoneToDb(z: DerivedZone, onLine: OnLine): Promise<void> {
  const envState = ensureRuntimeEnv(true);
  const kongUrl = getRuntimeKongUrl();
  const headers = authHeaders();
  if (!headers.apikey) {
    onLine("x SERVICE_ROLE_KEY not loaded from .env"
      + (envState.projectRoot ? ` (root: ${envState.projectRoot})` : " (project root not found)"));
    throw new Error("SERVICE_ROLE_KEY not loaded from .env");
  }

  // Append after the current highest sort_order
  const maxRes = await fetch(
    `${kongUrl}/rest/v1/zones?select=sort_order&order=sort_order.desc&limit=1`,
    { headers }
  );
  const maxRows = (await maxRes.json()) as Array<{ sort_order: number }>;
  const sortOrder = (maxRows[0]?.sort_order ?? -1) + 1;

  const payload = {
    key: z.key,
    label: z.label,
    domain: z.domain,
    service: z.service,
    container: z.container,
    image: z.image,
    dockerfile: z.dockerfile,
    upstream_env_key: z.upstreamEnvKey,
    sort_order: sortOrder,
    enabled: true,
  };

  const res = await fetch(`${kongUrl}/rest/v1/zones`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    onLine(`✗ Failed to register zone in DB (${res.status}): ${body}`);
    throw new Error(`DB insert failed: ${res.status}`);
  }

  invalidateZoneCache();
  onLine(`� Registered in Supabase zones table`);
}

// ── Delete zone from Supabase zones table ─────────────────────────────────────

export async function deleteZoneFromDb(key: string, onLine: OnLine): Promise<void> {
  const envState = ensureRuntimeEnv(true);
  const kongUrl = getRuntimeKongUrl();
  const headers = authHeaders();
  if (!headers.apikey) {
    onLine("x SERVICE_ROLE_KEY not loaded from .env"
      + (envState.projectRoot ? ` (root: ${envState.projectRoot})` : " (project root not found)"));
    return;
  }

  const res = await fetch(
    `${kongUrl}/rest/v1/zones?key=eq.${encodeURIComponent(key)}`,
    {
      method: "DELETE",
      headers,
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    onLine(`�a� Could not remove zone from DB (${res.status}): ${body}`);
    return;
  }

  invalidateZoneCache();
  onLine(`� Removed from Supabase zones table`);
}
