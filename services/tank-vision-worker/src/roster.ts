import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

/**
 * Who to watch, and where their video is.
 *
 * Two sources, deliberately: Supabase owns the camera→room mapping (room_scope,
 * which tier-2 identity resolution joins on by string), and MediaMTX owns
 * whether a path is actually carrying bytes right now. Trusting the registry's
 * `status` alone would have the worker burn an ffmpeg process on a camera that
 * is enrolled but dark; trusting MediaMTX alone would leave every detection
 * roomless and therefore unnameable.
 */
export type ObservedCamera = {
  cameraId: string;
  name: string;
  /** Joins against detectionCatalog room keys. See detectionCatalog.test.ts. */
  roomScope: string;
  hlsUrl: string;
  /** Which HLS rung is being decoded. Surfaced so a silent fallback to the
   *  expensive 4K rung is visible rather than only showing up as CPU. */
  rung: DetectionRung;
};

type RegistryRow = {
  camera_id: string;
  name: string | null;
  room_scope: string | null;
  status: string | null;
  protocol: string | null;
};

export function createSupabase(): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Which HLS rung detection reads, and why it is HLS at all.
 *
 * HLS rather than WHEP for the same reason the browser engine chose it:
 * detection does not care about sub-second latency, and HLS is the more
 * broadly decodable source. MediaMTX publishes `cameras/<id>`,
 * `cameras/<id>-hls` and `cameras/<id>-hls-low` as separate ready paths.
 *
 * `low` is 1280x720; the source rung is 3840x2160. Detection letterboxes
 * everything into a 640x640 model input regardless, so the 4K rung delivers
 * roughly nine times the pixels to throw away — and the throwing away is
 * SOFTWARE H.264 decode, six streams of it, which measured at ~4.7 cores on
 * 2026-09-12 while MediaMTX needed another ~4.4 for the live pipeline. On a
 * 16-core host that is more than half the machine spent competing with the very
 * broadcast this worker exists to describe, and the cameras were visibly
 * stalling and restarting under it.
 *
 * Accuracy does not pay for it. A 720p frame scaled to 640 is barely a
 * downscale; a 4K frame scaled to 640 is an 6x reduction that aliases detail
 * away anyway. The browser engine this worker replaced already read the low
 * rung by default (see deriveDetectionHlsUrl in PeopleDetectionEngine) — moving
 * to the server quietly regressed that, and this restores it.
 *
 * Appearance signatures are unaffected: they are cut from the 640x640 buffer,
 * which is identical either way.
 */
export type DetectionRung = "low" | "full";

export function cameraHlsPath(cameraId: string, rung: DetectionRung = "low"): string {
  return `cameras/${cameraId}-hls${rung === "low" ? "-low" : ""}`;
}

export function hlsUrlFor(cameraId: string, rung: DetectionRung = "low"): string {
  return `${config.mediamtxHlsUrl}/${cameraHlsPath(cameraId, rung)}/index.m3u8`;
}

async function readyPaths(): Promise<Set<string>> {
  const headers: Record<string, string> = {};
  if (config.mediamtxApiToken) {
    headers.Authorization = `Bearer ${config.mediamtxApiToken}`;
  }
  const response = await fetch(`${config.mediamtxApiUrl}/v3/paths/list?itemsPerPage=500`, {
    headers,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`MediaMTX paths/list returned HTTP ${response.status}`);
  const body = (await response.json()) as { items?: Array<{ name?: string; ready?: boolean }> };
  const ready = new Set<string>();
  for (const item of body.items ?? []) {
    if (item.ready && typeof item.name === "string") ready.add(item.name);
  }
  return ready;
}

export async function loadRoster(supabase: SupabaseClient): Promise<ObservedCamera[]> {
  const { data, error } = await supabase
    .from("tank_camera_registry")
    .select("camera_id, name, room_scope, status, protocol");
  if (error) throw new Error(`Camera registry read failed: ${error.message}`);

  const rows = (data ?? []) as RegistryRow[];
  const deny = new Set(config.cameraDenyList);
  const allow = new Set(config.roomAllowList);

  let ready: Set<string>;
  try {
    ready = await readyPaths();
  } catch (error) {
    // A MediaMTX blip must not empty the roster and tear down every puller —
    // the pullers restart themselves, so keeping the roster is the calmer
    // failure. Report it and let this cycle pass.
    throw new Error(`MediaMTX readiness unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  const observed: ObservedCamera[] = [];
  for (const row of rows) {
    const cameraId = row.camera_id;
    if (!cameraId || deny.has(cameraId)) continue;
    const roomScope = row.room_scope?.trim() || "unscoped";
    if (allow.size > 0 && !allow.has(roomScope)) continue;
    // Skipped because the DIRECTOR keys every shot by room: a reading with no
    // room has nowhere to land in the telemetry store and no tile to steer to.
    //
    // The old reason given here — that nothing unscoped could ever be resolved
    // to an individual — stopped being true when appearance matching landed
    // (2026-09-12). Identity no longer depends on the room at all. The skip
    // stays for the director's sake, not identity's.
    if (roomScope === "unscoped") continue;
    // Prefer the cheap rung, but never refuse to watch a camera that only has
    // the full one — not every camera carries a -hls-low sibling (cam-...091
    // had none on 2026-09-12), and going blind on a room to save CPU is the
    // wrong trade.
    const rung: DetectionRung | null = ready.has(cameraHlsPath(cameraId, "low"))
      ? "low"
      : ready.has(cameraHlsPath(cameraId, "full"))
        ? "full"
        : null;
    if (!rung) continue;

    observed.push({
      cameraId,
      name: row.name?.trim() || cameraId,
      roomScope,
      rung,
      hlsUrl: hlsUrlFor(cameraId, rung),
    });
  }

  return observed;
}
