import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SIGNATURE_LENGTH } from "../../../src/zones/tank/vision/appearance";
import {
  RUNTIME_IDENTITY_SEED_COUNTS,
  RUNTIME_IDENTITY_SEEDS,
} from "./runtimeIdentitySeed";
import {
  ensureRuntimeIdentitySeeds,
  runtimeSeedRows,
} from "./runtimeIdentityEnrolment";

function fakeSupabase(existingIds: string[]) {
  const inserted: ReturnType<typeof runtimeSeedRows> = [];
  const client = {
    from() {
      return {
        select() {
          return {
            in: async () => ({
              data: existingIds.map((id) => ({ id })),
              error: null,
            }),
          };
        },
        insert: async (rows: ReturnType<typeof runtimeSeedRows>) => {
          inserted.push(...rows);
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, inserted };
}

describe("runtime household identity seed", () => {
  test("contains every user-labeled house member and animal", () => {
    expect(RUNTIME_IDENTITY_SEED_COUNTS).toMatchObject({
      tyler: 46,
      malia: 14,
      joe: 9,
      molly: 7,
      olly: 4,
      james: 2,
      kitty: 1,
    });
    expect(Object.keys(RUNTIME_IDENTITY_SEED_COUNTS).sort()).toEqual([
      "james",
      "joe",
      "kitty",
      "malia",
      "molly",
      "olly",
      "tyler",
    ]);
  });

  test("uses the same descriptor shape as live camera probes", () => {
    expect(RUNTIME_IDENTITY_SEEDS).toHaveLength(83);
    for (const seed of RUNTIME_IDENTITY_SEEDS) {
      expect(seed.signature).toHaveLength(SIGNATURE_LENGTH);
      expect(seed.signature.every(Number.isFinite)).toBe(true);
    }
    expect(
      runtimeSeedRows().every(
        (row) => row.signature_length === SIGNATURE_LENGTH,
      ),
    ).toBe(true);
    expect(
      runtimeSeedRows().every(
        (row) =>
          row.descriptor_kind === "color-histogram-v1" &&
          row.model_key === "tank-banded-hsv-v1" &&
          row.source_kind === row.source_ref.source_kind,
      ),
    ).toBe(true);
  });

  test("never crosses a roster target into the wrong detector species", () => {
    const expected = {
      tyler: "person",
      malia: "person",
      joe: "person",
      molly: "dog",
      olly: "dog",
      james: "cat",
      kitty: "cat",
    } as const;
    for (const seed of RUNTIME_IDENTITY_SEEDS) {
      expect(seed.detectedClass).toBe(
        expected[seed.targetSlug as keyof typeof expected],
      );
    }
  });

  test("materialises only missing deterministic rows and never overwrites a retired row", async () => {
    const rows = runtimeSeedRows();
    const retiredExistingId = rows[0].id;
    const { client, inserted } = fakeSupabase([retiredExistingId]);

    const status = await ensureRuntimeIdentitySeeds(client);

    expect(status.ready).toBe(true);
    expect(status.existing).toBe(1);
    expect(status.inserted).toBe(rows.length - 1);
    expect(inserted.some((row) => row.id === retiredExistingId)).toBe(false);
    expect(inserted.map((row) => row.id)).toEqual(
      rows.slice(1).map((row) => row.id),
    );
  });

  test("performs no write when all seven profiles are already materialised", async () => {
    const rows = runtimeSeedRows();
    const { client, inserted } = fakeSupabase(rows.map((row) => row.id));

    const status = await ensureRuntimeIdentitySeeds(client);

    expect(status.ready).toBe(true);
    expect(status.inserted).toBe(0);
    expect(inserted).toHaveLength(0);
  });
});
