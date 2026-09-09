import type { PlaybackProtocol } from "../contracts";
import {
  buildDirectorProgramPlayback,
  DIRECTOR_PROGRAM_SLUG,
} from "../mediaPlayback";
import { isObsPathReady } from "./obsRooms";

export type DirectorProgramSnapshot = {
  configured: boolean;
  online: boolean;
  playbackUrl: string | null;
  playbackProtocol: PlaybackProtocol;
  mediaPath: string;
  sourceReady: boolean | null;
  whepReady: boolean;
};

const PROGRAM_HEALTH_CACHE_MS = 3_000;
let cachedProgram: { value: DirectorProgramSnapshot; expiresAt: number } | null = null;
let pendingProgram: Promise<DirectorProgramSnapshot> | null = null;

/**
 * Resolves the one public programme endpoint. Camera selection never changes
 * this URL; OBS changes the contents of the continuously published stream.
 */
export async function getDirectorProgramSnapshot(): Promise<DirectorProgramSnapshot> {
  const now = Date.now();
  if (cachedProgram && cachedProgram.expiresAt > now) return cachedProgram.value;
  if (pendingProgram) return pendingProgram;

  pendingProgram = readDirectorProgramSnapshot();
  try {
    const value = await pendingProgram;
    cachedProgram = { value, expiresAt: Date.now() + PROGRAM_HEALTH_CACHE_MS };
    return value;
  } finally {
    pendingProgram = null;
  }
}

async function readDirectorProgramSnapshot(): Promise<DirectorProgramSnapshot> {
  const sourceReady = await isObsPathReady(DIRECTOR_PROGRAM_SLUG).catch(() => null);
  const online = sourceReady === true;
  const whepReady = online
    ? (await isObsPathReady(DIRECTOR_PROGRAM_SLUG, true).catch(() => false)) === true
    : false;
  const playback = buildDirectorProgramPlayback(online, {
    whepBaseUrl: process.env.TANK_WHEP_PUBLIC_BASE_URL,
    hlsBaseUrl: process.env.TANK_HLS_PUBLIC_BASE_URL,
  });

  // Never advertise a WHEP sibling before MediaMTX confirms it. The raw OBS
  // publish carries H.264/AAC and remains a valid HLS fallback while the Opus
  // sibling starts.
  const playbackUrl = online
    ? whepReady
      ? playback.whepUrl ?? playback.hlsUrl ?? null
      : playback.hlsUrl ?? null
    : null;
  const playbackProtocol: PlaybackProtocol = playbackUrl
    ? whepReady && playback.whepUrl === playbackUrl
      ? "whep"
      : "hls"
    : "none";

  return {
    configured: Boolean(playback.whepUrl || playback.hlsUrl),
    online,
    playbackUrl,
    playbackProtocol,
    mediaPath: playback.path,
    sourceReady,
    whepReady,
  };
}
