import type { VirtualPtzState } from "../director/ptzState";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * The staff compositor is the authority for the final virtual-PTZ crop. The
 * central Director still owns camera selection; this short lease only carries
 * the crop for that selected camera to the public and OBS renderers.
 *
 * A lease deliberately expires quickly. If the staff compositor closes or
 * loses its connection, leaving a moving-person crop frozen forever would be
 * much worse than returning to the full camera frame.
 */
export const PROGRAM_FRAMING_TTL_MS = 2_500;
export const PROGRAM_FRAMING_MAX_ZOOM = 3.5;
const PROGRAM_FRAMING_SETTINGS_KEY = "director_program_framing";
const PROGRAM_FRAMING_PERSIST_INTERVAL_MS = 750;

let g_lastPersistedAt = 0;
let g_persistInFlight: Promise<void> | null = null;

export type DirectorProgramFramingLease = {
  cameraId: string;
  roomKey: string;
  ptzState: VirtualPtzState | null;
  receivedAt: number;
};

declare global {
  // Next can load API-route and instrumentation bundles as separate module
  // graphs inside the same Tank process. globalThis keeps this tiny lease
  // shared across those graphs instead of giving each route its own copy.
  // eslint-disable-next-line no-var
  var __tankDirectorProgramFraming: DirectorProgramFramingLease | null | undefined;
}

export function sanitizeProgramPtzState(value: unknown): VirtualPtzState | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const finite = (key: string, fallback: number) =>
    typeof input[key] === "number" && Number.isFinite(input[key])
      ? (input[key] as number)
      : fallback;
  const zoomFactor = Math.min(
    PROGRAM_FRAMING_MAX_ZOOM,
    Math.max(1, finite("zoomFactor", 1)),
  );
  const maxPanX = 3840 - 3840 / zoomFactor;
  const maxPanY = 2160 - 2160 / zoomFactor;
  return {
    zoomFactor,
    panOffsetX: Math.min(maxPanX, Math.max(0, finite("panOffsetX", 0))),
    panOffsetY: Math.min(maxPanY, Math.max(0, finite("panOffsetY", 0))),
    zoomSpeed: Math.min(10, Math.max(1, finite("zoomSpeed", 5))),
    speedMode: input.speedMode === "sport" ? "sport" : "fine",
    ...(typeof input.smoothness === "number" && Number.isFinite(input.smoothness)
      ? { smoothness: Math.min(10, Math.max(1, Math.round(input.smoothness))) }
      : {}),
  };
}

export function setDirectorProgramFraming(
  cameraId: string,
  roomKey: string,
  ptzState: unknown,
  now = Date.now(),
): DirectorProgramFramingLease {
  globalThis.__tankDirectorProgramFraming = {
    cameraId: cameraId.slice(0, 200),
    roomKey: roomKey.slice(0, 200),
    ptzState: sanitizeProgramPtzState(ptzState),
    receivedAt: now,
  };
  return { ...globalThis.__tankDirectorProgramFraming };
}

export function getDirectorProgramFraming(
  cameraId: string,
  now = Date.now(),
): DirectorProgramFramingLease | null {
  const lease = globalThis.__tankDirectorProgramFraming;
  if (!lease) return null;
  if (now - lease.receivedAt > PROGRAM_FRAMING_TTL_MS) return null;
  if (lease.cameraId !== cameraId) return null;
  return { ...lease };
}

/**
 * Persist a low-rate snapshot of the live crop for readers served by another
 * Next worker. Realtime remains the smooth fast path; this shared row is the
 * authoritative recovery path for refreshes, reconnects, and process splits.
 */
export async function persistDirectorProgramFraming(
  lease: DirectorProgramFramingLease,
): Promise<void> {
  const now = Date.now();
  if (g_persistInFlight) return g_persistInFlight;
  if (now - g_lastPersistedAt < PROGRAM_FRAMING_PERSIST_INTERVAL_MS) return;

  g_lastPersistedAt = now;
  g_persistInFlight = (async () => {
    const admin = createAdminClient();
    const { error } = await admin.from("tank_platform_settings").upsert(
      {
        key: PROGRAM_FRAMING_SETTINGS_KEY,
        value: lease,
        updated_at: new Date(lease.receivedAt).toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(`Failed to persist Director framing: ${error.message}`);
  })();

  try {
    await g_persistInFlight;
  } finally {
    g_persistInFlight = null;
  }
}

/** Read the crop shared by the staff compositor, even when this request lands
 * on a different Next worker from the POST that accepted it. */
export async function loadDirectorProgramFramingFromDb(
  cameraId: string,
  now = Date.now(),
): Promise<DirectorProgramFramingLease | null> {
  const local = getDirectorProgramFraming(cameraId, now);
  if (local) return local;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_platform_settings")
    .select("value")
    .eq("key", PROGRAM_FRAMING_SETTINGS_KEY)
    .maybeSingle();
  if (error) {
    console.warn(`[DirectorProgramFraming] shared snapshot read failed: ${error.message}`);
    return null;
  }

  const value = data?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.cameraId !== "string" || input.cameraId !== cameraId) return null;
  if (typeof input.roomKey !== "string") return null;
  if (typeof input.receivedAt !== "number" || !Number.isFinite(input.receivedAt)) return null;
  if (now - input.receivedAt > PROGRAM_FRAMING_TTL_MS) return null;

  const lease: DirectorProgramFramingLease = {
    cameraId: input.cameraId,
    roomKey: input.roomKey,
    ptzState: sanitizeProgramPtzState(input.ptzState ?? null),
    receivedAt: input.receivedAt,
  };
  globalThis.__tankDirectorProgramFraming = lease;
  return { ...lease };
}

/** Test-only reset; production callers let the lease expire naturally. */
export function resetDirectorProgramFramingForTests(): void {
  globalThis.__tankDirectorProgramFraming = null;
  g_lastPersistedAt = 0;
  g_persistInFlight = null;
}
