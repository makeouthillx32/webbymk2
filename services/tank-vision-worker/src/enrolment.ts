import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INITIAL_DETECTION_CATALOG,
  type DetectionTargetRecord,
} from "../../../src/zones/tank/server/detectionCatalog";
import {
  SIGNATURE_LENGTH,
  type AppearanceSignature,
  type EnrolledAppearance,
} from "../../../src/zones/tank/vision/appearance";

/**
 * The enrolled roster: who the house knows how to recognise, by class.
 *
 * Keyed by detector class at rest. Person, cat, and dog rosters remain fully
 * separate during matching; an uncertain detector class stays unnamed.
 */
export type EnrolledByClass = Map<string, EnrolledAppearance[]>;

type EnrolmentRow = {
  target_slug: string | null;
  signature: unknown;
  signature_length: number | null;
};

export type EnrolmentLoadResult = {
  byClass: EnrolledByClass;
  /** Total usable signatures, for the log line and /health. */
  signatures: number;
  /** Rows read but discarded, with the reason. Silence here would hide a typo. */
  rejected: string[];
  byTarget: Record<string, number>;
};

const CATALOG_BY_SLUG = new Map<string, DetectionTargetRecord>(
  INITIAL_DETECTION_CATALOG.map((t) => [t.slug, t]),
);

/**
 * Load every active enrolment and group it into a per-class roster.
 *
 * Validation is loud rather than lenient. A row that names a slug the catalog
 * does not carry, or whose vector is the wrong length, is DROPPED and reported
 * — because the alternative failure is invisible: a mismatched vector scores 0
 * against everybody, which on screen looks exactly like "this person simply is
 * not enrolled". That is the same class of bug as `the-foyer` vs `foyer`, which
 * silently stopped Molly ever being named for weeks.
 */
export async function loadEnrolments(
  supabase: SupabaseClient,
): Promise<EnrolmentLoadResult> {
  const { data, error } = await supabase
    .from("tank_appearance_enrolment")
    .select("target_slug, signature, signature_length")
    .eq("is_active", true)
    .order("captured_at", { ascending: false });

  if (error)
    throw new Error(`Appearance enrolment read failed: ${error.message}`);

  return compileEnrolmentRows((data ?? []) as EnrolmentRow[]);
}

export function compileEnrolmentRows(
  rows: EnrolmentRow[],
): EnrolmentLoadResult {
  const bySlug = new Map<
    string,
    { target: DetectionTargetRecord; signatures: AppearanceSignature[] }
  >();
  const rejected: string[] = [];
  let signatures = 0;

  for (const row of rows) {
    const slug = row.target_slug?.trim();
    if (!slug) {
      rejected.push("row with no target_slug");
      continue;
    }
    const target = CATALOG_BY_SLUG.get(slug);
    if (!target) {
      rejected.push(`${slug}: not in the detection catalog`);
      continue;
    }
    const vector = toSignature(row.signature);
    if (!vector) {
      rejected.push(`${slug}: signature is not an array of finite numbers`);
      continue;
    }
    if (row.signature_length !== vector.length) {
      rejected.push(
        `${slug}: declared length ${row.signature_length ?? "missing"} does not match vector length ${vector.length}`,
      );
      continue;
    }
    // The current live probe is a 40-value banded HSV descriptor. A 512-value
    // offline embedding may be valid data, but comparing it to this probe can
    // only score zero. Reject it loudly until a matching live embedder exists.
    if (vector.length !== SIGNATURE_LENGTH) {
      rejected.push(
        `${slug}: ${vector.length}-value descriptor is incompatible with the live ${SIGNATURE_LENGTH}-value probe`,
      );
      continue;
    }

    const entry = bySlug.get(slug) ?? { target, signatures: [] };
    entry.signatures.push(vector);
    bySlug.set(slug, entry);
    signatures += 1;
  }

  const byClass: EnrolledByClass = new Map();
  for (const { target, signatures: vectors } of bySlug.values()) {
    const enrolled: EnrolledAppearance = {
      slug: target.slug,
      displayName: target.displayName,
      signatures: vectors,
    };
    // A target can answer to several classes (a prop might be "box" or "bag"),
    // so it joins every roster it belongs to.
    for (const cls of target.yoloClassIds) {
      const list = byClass.get(cls) ?? [];
      list.push(enrolled);
      byClass.set(cls, list);
    }
  }

  return {
    byClass,
    signatures,
    rejected,
    byTarget: Object.fromEntries(
      [...bySlug.entries()].map(([slug, entry]) => [
        slug,
        entry.signatures.length,
      ]),
    ),
  };
}

function toSignature(value: unknown): AppearanceSignature | null {
  if (!Array.isArray(value)) return null;
  const out = new Array<number>(value.length);
  for (let i = 0; i < value.length; i++) {
    const n = value[i];
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
    out[i] = n;
  }
  return out;
}
