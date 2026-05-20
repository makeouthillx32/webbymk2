// src/ink/zone/registry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Supabase zone table operations.
//
// Zone topology is stored in `public.zones` (not in source). These helpers
// INSERT / DELETE rows and bust the in-memory cache so the TUI reflects
// changes immediately without a restart.
//
// On INSERT, we also:
//   1. Look up the currently-active environment and link it via environment_id.
//   2. Write a `managed_stacks` row recording the artifact store path for this
//      zone's compose file.  This mirrors Portainer's Stack model: metadata
//      lives in the DB, YAML lives on the filesystem.
// ─────────────────────────────────────────────────────────────────────────────

import { join }                 from "path";
import type { DerivedZone, OnLine } from "./types.ts";
import { invalidateZoneCache } from "../zone-store.ts";
import { ensureRuntimeEnv, getRuntimeKongUrl, getRuntimeServiceKey } from "../../utils/runtimeEnv.js";
import { ARTIFACT_STORE_DIR }  from "../../config/stack.ts";

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
  const kongUrl  = getRuntimeKongUrl();
  const headers  = authHeaders();
  if (!headers.apikey) {
    onLine("x SERVICE_ROLE_KEY not loaded from .env"
      + (envState.projectRoot ? ` (root: ${envState.projectRoot})` : " (project root not found)"));
    throw new Error("SERVICE_ROLE_KEY not loaded from .env");
  }

  // ── Resolve active environment id ─────────────────────────────────────────
  // Null is fine: zones.environment_id is nullable for backward compat.
  let activeEnvironmentId: string | null = null;
  try {
    const envRes = await fetch(
      `${kongUrl}/rest/v1/environments?active=eq.true&select=id&limit=1`,
      { headers }
    );
    if (envRes.ok) {
      const envRows = (await envRes.json()) as Array<{ id: string }>;
      activeEnvironmentId = envRows[0]?.id ?? null;
    }
  } catch {
    // Non-fatal: zone registers without an environment link.
  }

  // ── Append after the current highest sort_order ───────────────────────────
  const maxRes  = await fetch(
    `${kongUrl}/rest/v1/zones?select=sort_order&order=sort_order.desc&limit=1`,
    { headers }
  );
  const maxRows = (await maxRes.json()) as Array<{ sort_order: number }>;
  const sortOrder = (maxRows[0]?.sort_order ?? -1) + 1;

  const payload = {
    key:              z.key,
    label:            z.label,
    domain:           z.domain,
    service:          z.service,
    container:        z.container,
    image:            z.image,
    dockerfile:       z.dockerfile,
    upstream_env_key: z.upstreamEnvKey,
    sort_order:       sortOrder,
    enabled:          true,
    ...(activeEnvironmentId ? { environment_id: activeEnvironmentId } : {}),
  };

  // Request the full inserted row back so we can read the generated uuid.
  const res = await fetch(`${kongUrl}/rest/v1/zones`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    onLine(`✗ Failed to register zone in DB (${res.status}): ${body}`);
    throw new Error(`DB insert failed: ${res.status}`);
  }

  const inserted = (await res.json()) as Array<{ id: string }>;
  const zoneId   = inserted[0]?.id ?? null;

  invalidateZoneCache();
  onLine(`✓ Registered in Supabase zones table`);

  // ── Insert managed_stacks row ─────────────────────────────────────────────
  // One managed stack per zone, linking it to the active environment and
  // recording the artifact store path for this zone's compose file.
  // stack_name matches the com.docker.compose.project Docker label, enabling
  // label-based external stack discovery (same pattern as Portainer).
  if (zoneId && activeEnvironmentId) {
    const composePath  = join(ARTIFACT_STORE_DIR, z.key, "docker-compose.yml");
    const stackPayload = {
      zone_id:        zoneId,
      environment_id: activeEnvironmentId,
      stack_name:     z.key,
      compose_path:   composePath,
      entrypoint:     "docker-compose.yml",
      env_vars:       [],
      source:         "template",
      status:         "inactive",
    };

    const stackRes = await fetch(`${kongUrl}/rest/v1/managed_stacks`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(stackPayload),
    });

    if (stackRes.ok) {
      onLine(`✓ Registered managed stack: ${z.key} → env/${activeEnvironmentId.slice(0, 8)}…`);
    } else {
      const body = await stackRes.text().catch(() => "");
      // Non-fatal: zone is registered, stack record can be fixed later.
      onLine(`⚠ managed_stacks insert failed (${stackRes.status}): ${body}`);
    }
  } else if (!activeEnvironmentId) {
    onLine(`⚠ No active environment found — managed_stacks row skipped`);
  }
}

// ── Delete zone from Supabase zones table ─────────────────────────────────────

export async function deleteZoneFromDb(key: string, onLine: OnLine): Promise<void> {
  const envState = ensureRuntimeEnv(true);
  const kongUrl  = getRuntimeKongUrl();
  const headers  = authHeaders();
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
    onLine(`⚠ Could not remove zone from DB (${res.status}): ${body}`);
    return;
  }

  invalidateZoneCache();
  onLine(`✓ Removed from Supabase zones table`);
}
