// src/zones/tank/server/appearanceEnrolmentDb.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reads and writes over tank_appearance_enrolment for the OPERATOR console.
//
// The vision worker has its own reader (services/tank-vision-worker/enrolment.ts)
// and the two are deliberately separate: the worker loads vectors to compare
// against and needs them grouped by detector class, while the console lists
// enrolments for a human to judge and must never ship a raw vector to a browser.
// One shared "get the enrolments" helper would have to serve both and would end
// up doing neither well — and the failure mode of getting it wrong is leaking a
// per-person descriptor onto a public livestream.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/utils/supabase/admin";
import { getTargetBySlug } from "./detectionCatalog";

export type EnrolmentSummary = {
  id: string;
  targetSlug: string;
  /** Resolved from the catalog so the console never renders a bare slug. */
  displayName: string;
  cameraId: string | null;
  roomScope: string | null;
  note: string | null;
  sourceConfidence: number | null;
  sourceKind: string | null;
  descriptorKind: string | null;
  modelKey: string | null;
  isActive: boolean;
  capturedAt: string;
  /**
   * Deliberately NOT the vector.
   *
   * The console needs to know an enrolment exists, when it was taken and
   * whether it is on — none of which requires the descriptor itself. Shipping
   * the vector to a browser would put a per-person appearance record one
   * devtools tab away, so only its length travels, which is all that is needed
   * to spot one captured under an older layout.
   */
  signatureLength: number;
};

type Row = {
  id: string;
  target_slug: string;
  camera_id: string | null;
  room_scope: string | null;
  note: string | null;
  source_confidence: number | null;
  source_kind: string | null;
  descriptor_kind: string | null;
  model_key: string | null;
  is_active: boolean;
  captured_at: string;
  signature_length: number;
};

export async function listEnrolments(): Promise<EnrolmentSummary[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_appearance_enrolment")
    .select(
      "id, target_slug, camera_id, room_scope, note, source_confidence, source_kind, descriptor_kind, model_key, is_active, captured_at, signature_length",
    )
    .order("captured_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`Enrolment list failed: ${error.message}`);

  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    targetSlug: row.target_slug,
    displayName:
      getTargetBySlug(row.target_slug)?.displayName ?? row.target_slug,
    cameraId: row.camera_id,
    roomScope: row.room_scope,
    note: row.note,
    sourceConfidence: row.source_confidence,
    sourceKind: row.source_kind,
    descriptorKind: row.descriptor_kind,
    modelKey: row.model_key,
    isActive: row.is_active,
    capturedAt: row.captured_at,
    signatureLength: row.signature_length,
  }));
}

export async function setEnrolmentActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("tank_appearance_enrolment")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw new Error(`Enrolment update failed: ${error.message}`);
}

export async function deleteEnrolment(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("tank_appearance_enrolment")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`Enrolment delete failed: ${error.message}`);
}
