import { NextResponse } from "next/server";
import {
  getServerDirectorState,
  getServerDirectorWorkerHealth,
} from "./serverDirectorEngine";
import { getDirectorProgramSnapshot } from "./directorProgram";
import { getTelemetryFor } from "./directorTelemetryStore";
import { loadDirectorProgramFramingFromDb } from "./directorProgramFraming";

export async function handleDirectorStateGet() {
  try {
    const [baseState, program] = await Promise.all([
      getServerDirectorState(),
      getDirectorProgramSnapshot(),
    ]);
    const sharedFraming =
      baseState.mode === "MANUAL_PILOT"
        ? null
        : await loadDirectorProgramFramingFromDb(baseState.activeCameraId);
    const state = sharedFraming
      ? { ...baseState, ptzState: sharedFraming.ptzState }
      : baseState;

    // The REAL audio level of whatever is on air.
    //
    // The VU overlay used to generate its own: a sine wave plus occasional
    // random spikes, in useCameraAudioMetrics. It had never metered a room —
    // not the director's, not any other — so the meter on the broadcast was
    // decorative, and it moved convincingly enough that nobody could tell.
    //
    // This is the measured value: the vision worker runs ebur128 over each
    // camera's audio track and posts it as `audioPeak`. Attaching it here,
    // rather than exposing the whole telemetry store, means an unauthenticated
    // browser source gets exactly one number about one camera — the one already
    // named in this same response — and nothing about any other room.
    const onAir = state?.activeCameraId ? getTelemetryFor(state.activeCameraId) : null;

    return NextResponse.json({
      success: true,
      state,
      program,
      audio: {
        cameraId: state?.activeCameraId ?? null,
        // 0-100, as the worker reports it. null means "no reading", which the
        // overlay must render differently from silence — a meter pinned at zero
        // and a meter with no signal are not the same fault.
        peak: onAir ? onAir.audioPeak ?? null : null,
        isSpeaking: onAir ? onAir.isSpeaking ?? false : false,
      },
      worker: getServerDirectorWorkerHealth(),
    });
  } catch (error) {
    console.error("[DirectorState] failed to read shared state:", error);
    return NextResponse.json({ error: "Director state unavailable" }, { status: 503 });
  }
}
