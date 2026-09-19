import type { SupabaseClient } from "@supabase/supabase-js";
import { SIGNATURE_LENGTH } from "../../../src/zones/tank/vision/appearance";
import {
  RUNTIME_IDENTITY_SEEDS,
  RUNTIME_IDENTITY_SEED_COUNTS,
  type RuntimeIdentitySeed,
} from "./runtimeIdentitySeed";

export type RuntimeIdentitySeedStatus = {
  configured: number;
  existing: number;
  inserted: number;
  ready: boolean;
  byTarget: Record<string, number>;
  error: string | null;
};

export function runtimeSeedRows(
  seeds: readonly RuntimeIdentitySeed[] = RUNTIME_IDENTITY_SEEDS,
) {
  return seeds.map((seed) => ({
    id: seed.id,
    target_slug: seed.targetSlug,
    signature: [...seed.signature],
    signature_length: SIGNATURE_LENGTH,
    descriptor_kind: "color-histogram-v1",
    model_key: "tank-banded-hsv-v1",
    source_kind: seed.sourceKind,
    source_ref: {
      seed_id: seed.id,
      source_key: seed.sourceKey,
      source_kind: seed.sourceKind,
    },
    camera_id:
      seed.sourceKind === "archive-reviewed"
        ? "archive-reviewed-seed"
        : "reference-image-seed",
    room_scope: null,
    source_confidence: seed.sourceKind === "archive-reviewed" ? 1 : null,
    note:
      seed.sourceKind === "archive-reviewed"
        ? `Reviewed CCTV seed · ${seed.sourceKey}`
        : `User-labeled reference seed · ${seed.sourceKey.slice(0, 12)}`,
    is_active: true,
    captured_at: "2026-09-15T12:20:37.000Z",
  }));
}

/**
 * Materialise the user-labeled profiles into the table the live matcher reads.
 *
 * Existing ids are never updated: retiring a bad seed in Staff Room must stay
 * retired across worker restarts. Only genuinely missing records are inserted.
 */
export async function ensureRuntimeIdentitySeeds(
  supabase: SupabaseClient,
): Promise<RuntimeIdentitySeedStatus> {
  const rows = runtimeSeedRows();
  const ids = rows.map((row) => row.id);
  const { data, error: readError } = await supabase
    .from("tank_appearance_enrolment")
    .select("id")
    .in("id", ids);
  if (readError)
    throw new Error(`Runtime identity seed read failed: ${readError.message}`);

  const existingIds = new Set(
    (data ?? []).map((row: { id: string }) => row.id),
  );
  const missing = rows.filter((row) => !existingIds.has(row.id));
  if (missing.length > 0) {
    const { error: insertError } = await supabase
      .from("tank_appearance_enrolment")
      .insert(missing);
    if (insertError)
      throw new Error(
        `Runtime identity seed insert failed: ${insertError.message}`,
      );
  }

  return {
    configured: rows.length,
    existing: existingIds.size,
    inserted: missing.length,
    ready: true,
    byTarget: { ...RUNTIME_IDENTITY_SEED_COUNTS },
    error: null,
  };
}

export function failedRuntimeIdentitySeedStatus(
  error: unknown,
): RuntimeIdentitySeedStatus {
  return {
    configured: RUNTIME_IDENTITY_SEEDS.length,
    existing: 0,
    inserted: 0,
    ready: false,
    byTarget: { ...RUNTIME_IDENTITY_SEED_COUNTS },
    error: error instanceof Error ? error.message : String(error),
  };
}
