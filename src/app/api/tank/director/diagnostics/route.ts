import { NextResponse } from "next/server";
import { requireStaff } from "@/zones/tank/server/staffAuth";
import { getCameraDirectorySnapshot } from "@/zones/tank/server/receiverManager";
import { toPublicCameraDirectory } from "@/zones/tank/server/publicCameraProjection";
import {
  describeTelemetry,
  getEffectiveMode,
  getFollowMember,
  getOperatorMode,
  getIdentityOverlays,
  getTelemetryFor,
  getTelemetrySnapshot,
  loadPersistedOperatorModeFromDb,
} from "@/zones/tank/server/directorTelemetryStore";
import {
  getDirectorDecisionLog,
  getFollowDiagnostics,
  getServerDirectorState,
  getServerDirectorWorkerHealth,
} from "@/zones/tank/server/serverDirectorEngine";
import { memberPresence } from "@/zones/tank/server/followMember";

// Everything the live director knows, in one read.
//
// The director configuration screen shows a browser-side simulation of what
// the director might do; the real decisions happen in this process's memory and
// were visible nowhere. Diagnosing "why is it stuck in the game room" meant a
// person copying panel text into a chat. This is the server's own answer.
//
// Read-only. Gated like the telemetry ingest (shared secret, for tooling on the
// host) or a staff session (for a person in a browser). It exposes who the
// detector thinks is in which room, which is not for the public.

export const dynamic = "force-dynamic";

function hasIngestSecret(request: Request): boolean {
  const secret = process.env.TANK_ARCHIVE_INGEST_SECRET;
  return Boolean(secret) && request.headers.get("x-tank-ingest-secret") === secret;
}

export async function GET(request: Request) {
  if (!hasIngestSecret(request) && !(await requireStaff())) {
    return NextResponse.json({ error: "Staff or ingest secret required" }, { status: 403 });
  }

  const now = Date.now();
  await loadPersistedOperatorModeFromDb().catch(() => null);
  // The same camera list the director ticks against, so "presence" here is
  // exactly what the engine saw rather than a second, differently-filtered view.
  const [state, rawSnapshot] = await Promise.all([
    getServerDirectorState(),
    getCameraDirectorySnapshot().catch(() => null),
  ]);
  const snapshot = rawSnapshot ? toPublicCameraDirectory(rawSnapshot) : null;
  const cameraName = new Map((snapshot?.cameras ?? []).map((c) => [c.id, c.name]));
  const followMember = getFollowMember();
  const telemetry = describeTelemetry(now);

  return NextResponse.json({
    now,
    programme: {
      cameraId: state.activeCameraId,
      camera: cameraName.get(state.activeCameraId) ?? null,
      roomKey: state.activeRoomKey,
      mode: state.mode,
      reason: state.reason,
      heldForSeconds: Math.round((now - state.switchedAt) / 1000),
      ptzState: state.ptzState ?? null,
      attentionLock: state.attentionLock,
    },
    operator: {
      operatorMode: getOperatorMode(),
      effectiveMode: getEffectiveMode(),
      followMember,
      follow: getFollowDiagnostics(),
    },
    worker: getServerDirectorWorkerHealth(),
    detection: {
      usable: telemetry.usable,
      serverDetectionActive: telemetry.serverDetectionActive,
      suggestedMode: telemetry.suggestedMode,
      appearance: telemetry.appearance,
      // Who the live learner is naming right now, beside what the worker measures.
      identity: getIdentityOverlays(),
    },
    cameras: (snapshot?.cameras ?? []).map((cam) => {
      // Read the clock now, not at the top: telemetry can land while the
      // awaits above run, which made fresh readings report negative ages.
      const at = Date.now();
      const reading = getTelemetrySnapshot(at).find((r) => r.cameraId === cam.id);
      // Compose what the DIRECTOR sees, not the raw reading: the learner's names
      // ride on top of the worker's measurements, and a diagnostic that shows
      // only one of the two sent me hunting a bug that was not there.
      const t = getTelemetryFor(cam.id, at) ?? reading?.telemetry;
      return {
        id: cam.id,
        name: cam.name,
        presence: cam.presence,
        onProgramme: cam.id === state.activeCameraId,
        telemetryAgeMs: reading?.ageMs ?? null,
        telemetryFresh: reading?.fresh ?? false,
        // "fallback" is the director's bitrate-only stand-in, not a detection.
        telemetryOrigin: reading?.origin ?? null,
        peopleCount: t?.peopleCount ?? null,
        animalCount: t?.animalCount ?? null,
        motionScore: t?.motionScore ?? null,
        audioPeak: t?.audioPeak ?? null,
        bestMember: t?.targetMemberDetected ?? null,
        bestMemberConfidence: t?.targetMemberConfidence ?? null,
        followPresence: followMember && t ? memberPresence(t, followMember) : null,
        boxes: (t?.boundingBoxes ?? []).map((b) => ({
          label: b.label,
          name: b.targetName ?? null,
          confidence: b.confidence ?? null,
          box: [b.nx, b.ny, b.nw, b.nh].map((v) => Number((v ?? 0).toFixed(3))),
        })),
      };
    }),
    decisions: getDirectorDecisionLog().reverse(),
  });
}
