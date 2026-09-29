import { createAdminClient } from "@/utils/supabase/admin";
import { getTargetBySlug } from "./detectionCatalog";

export type IdentityTargetCount = {
  targetSlug: string;
  displayName: string;
  references: number;
  confirmedSamples: number;
  quarantinedSamples: number;
};

export type IdentityTrainingSummary = {
  available: boolean;
  references: number;
  confirmedSamples: number;
  quarantinedSamples: number;
  rejectedSamples: number;
  targets: IdentityTargetCount[];
  message?: string;
};

type SummaryRow = {
  target_slug: string | null;
  active_references: number;
  confirmed_samples: number;
  quarantined_samples: number;
  rejected_samples: number;
};

/**
 * Staff-facing totals only. Embeddings, source hashes, crop paths and archive
 * locations deliberately never leave the server.
 */
export async function getIdentityTrainingSummary(): Promise<IdentityTrainingSummary> {
  const admin = createAdminClient();
  const { data, error: missing } = await admin
    .from("tank_identity_training_summary")
    .select("target_slug, active_references, confirmed_samples, quarantined_samples, rejected_samples");
  if (missing) {
    // The code can ship before the migration without breaking the existing
    // capture screen. Once UNAXIS applies the schema, Refresh activates it.
    if (missing.code === "42P01" || missing.code === "PGRST205") {
      return {
        available: false,
        references: 0,
        confirmedSamples: 0,
        quarantinedSamples: 0,
        rejectedSamples: 0,
        targets: [],
        message: "Private identity index schema is awaiting deployment.",
      };
    }
    throw new Error(`Identity training summary failed: ${missing.message}`);
  }

  const rows = (data ?? []) as SummaryRow[];
  const targets = rows
    .filter((row) => row.target_slug)
    .map((row) => ({
      targetSlug: row.target_slug as string,
      displayName: getTargetBySlug(row.target_slug as string)?.displayName ?? (row.target_slug as string).toUpperCase(),
      references: Number(row.active_references),
      confirmedSamples: Number(row.confirmed_samples),
      quarantinedSamples: Number(row.quarantined_samples),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {
    available: true,
    references: rows.reduce((sum, row) => sum + Number(row.active_references), 0),
    confirmedSamples: rows.reduce((sum, row) => sum + Number(row.confirmed_samples), 0),
    quarantinedSamples: rows.reduce((sum, row) => sum + Number(row.quarantined_samples), 0),
    rejectedSamples: rows.reduce((sum, row) => sum + Number(row.rejected_samples), 0),
    targets,
  };
}
