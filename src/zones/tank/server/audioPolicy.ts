import type {
  CameraAudioMode,
  CameraAudioStatus,
  TankAudioSource,
} from "../contracts";

export type CameraAudioAssignment = {
  audioSourceId: string | null;
  audioSourceName: string | null;
  nativeAudioMuted: boolean;
  crossRoomConfirmed: boolean;
};

export type ResolvedCameraAudio = CameraAudioAssignment & {
  mode: CameraAudioMode;
  status: CameraAudioStatus;
  warning: string | null;
};

export function requiresBrowserAudioWorker(status: CameraAudioStatus) {
  return status === "transcode-required" ||
    status === "external-ready" ||
    status === "probe-required";
}

// WebRTC's one mandatory-to-implement audio codec is Opus — nothing else is
// safe to assume a browser will negotiate. Any camera/phone source that
// isn't already Opus needs transcoding before it can reach a WHEP viewer,
// full stop. Was narrowed to "is it pcm_alaw/pcm_mulaw" (the only codec seen
// on fixed IP cameras at the time) — that missed AAC, which is exactly what
// phone senders (Moblin/IRL Pro/Larix) actually send. Never re-narrow this
// to a specific codec list again; the source of truth is "is it Opus yet."
export function needsOpusTranscode(codec: string | null | undefined): boolean {
  const normalized = (codec ?? "").toLowerCase();
  return normalized !== "" && normalized !== "opus";
}

export function normalizeAudioMode(value: unknown): CameraAudioMode {
  return value === "auto" ||
    value === "embedded" ||
    value === "none" ||
    value === "external"
    ? value
    : "auto";
}

function externalResolution(
  mode: CameraAudioMode,
  cameraRoomScope: string,
  sourceId: string | null,
  sourceName: string | null,
  nativeAudioMuted: boolean,
  crossRoomConfirmed: boolean,
  sources: TankAudioSource[],
): ResolvedCameraAudio {
  const source = sources.find((item) => item.id === sourceId);
  if (!sourceId || !source) {
    return {
      mode,
      status: "missing-audio",
      warning: sourceId
        ? `External audio source ${sourceId} is not registered.`
        : "External audio requires an audio source.",
      audioSourceId: sourceId,
      audioSourceName: sourceName,
      nativeAudioMuted,
      crossRoomConfirmed,
    };
  }

  const crossRoom = source.roomScope !== cameraRoomScope;
  if (crossRoom && !source.tags.includes("shared-audio")) {
    return {
      mode,
      status: "missing-audio",
      warning: `${source.name} is outside this camera room and is not shared-audio.`,
      audioSourceId: source.id,
      audioSourceName: source.name,
      nativeAudioMuted,
      crossRoomConfirmed: false,
    };
  }
  if (crossRoom && !crossRoomConfirmed) {
    return {
      mode,
      status: "missing-audio",
      warning: `${source.name} requires explicit cross-room confirmation.`,
      audioSourceId: source.id,
      audioSourceName: source.name,
      nativeAudioMuted,
      crossRoomConfirmed: false,
    };
  }

  return {
    mode,
    status: source.online ? "external-ready" : "missing-audio",
    warning: source.online
      ? null
      : `${source.name} is offline; video remains live without external audio.`,
    audioSourceId: source.id,
    audioSourceName: source.name,
    nativeAudioMuted,
    crossRoomConfirmed,
  };
}

export function resolveCameraAudio(input: {
  cameraId: string;
  roomScope: string;
  declaredMode: unknown;
  declaredSourceId?: string | null;
  declaredSourceName?: string | null;
  assignment?: CameraAudioAssignment | null;
  sources: TankAudioSource[];
  probe?: { present: boolean | null; codec: string | null };
}): ResolvedCameraAudio {
  const mode = normalizeAudioMode(input.declaredMode);
  const assignment = input.assignment ?? {
    audioSourceId: null,
    audioSourceName: null,
    nativeAudioMuted: false,
    crossRoomConfirmed: false,
  };
  const sourceId =
    mode === "external"
      ? assignment.audioSourceId || input.declaredSourceId
      : assignment.audioSourceId;
  const sourceName =
    mode === "external"
      ? assignment.audioSourceName || input.declaredSourceName
      : assignment.audioSourceName;

  if (mode === "external") {
    return externalResolution(
      mode,
      input.roomScope,
      sourceId,
      sourceName,
      assignment.nativeAudioMuted,
      assignment.crossRoomConfirmed,
      input.sources,
    );
  }

  if (mode === "embedded") {
    if (sourceId && assignment.nativeAudioMuted) {
      return externalResolution(
        mode,
        input.roomScope,
        sourceId,
        sourceName,
        true,
        assignment.crossRoomConfirmed,
        input.sources,
      );
    }
    // Was hardcoded to a single camera id ("only cam0 needs transcode") —
    // written speculatively before any camera was confirmed to have audio
    // at all. Confirmed 2026-08-16: every fixed IP camera on this setup
    // sends G.711 A-law, not just that one — detect the actual codec
    // instead of guessing by id, same probe-based check the "auto" mode
    // branch below already uses.
    const codec = input.probe?.codec?.toLowerCase() ?? "";
    const needsTranscode = needsOpusTranscode(codec);
    return {
      mode,
      status: needsTranscode ? "transcode-required" : "embedded",
      warning: needsTranscode
        ? `${codec ? codec.toUpperCase() : "Audio"} must be transcoded to Opus for WebRTC.`
        : null,
      audioSourceId: null,
      audioSourceName: null,
      nativeAudioMuted: false,
      crossRoomConfirmed: false,
    };
  }

  if (mode === "none") {
    if (sourceId) {
      return externalResolution(
        mode,
        input.roomScope,
        sourceId,
        sourceName,
        false,
        assignment.crossRoomConfirmed,
        input.sources,
      );
    }
    return {
      mode,
      status: "silent",
      warning: "This camera is intentionally publishing silent video.",
      audioSourceId: null,
      audioSourceName: null,
      nativeAudioMuted: false,
      crossRoomConfirmed: false,
    };
  }

  if (input.probe?.present === true) {
    const codec = input.probe.codec?.toLowerCase() ?? "";
    const needsTranscode = needsOpusTranscode(codec);
    return {
      mode,
      status: needsTranscode ? "transcode-required" : "embedded",
      warning: needsTranscode
        ? `${codec} must be transcoded for browser delivery.`
        : null,
      audioSourceId: null,
      audioSourceName: null,
      nativeAudioMuted: false,
      crossRoomConfirmed: false,
    };
  }

  if (input.probe?.present === false) {
    if (sourceId) {
      return externalResolution(
        mode,
        input.roomScope,
        sourceId,
        sourceName,
        false,
        assignment.crossRoomConfirmed,
        input.sources,
      );
    }
    return {
      mode,
      status: "silent",
      warning: "Automatic probing found no embedded audio.",
      audioSourceId: null,
      audioSourceName: null,
      nativeAudioMuted: false,
      crossRoomConfirmed: false,
    };
  }

  return {
    mode,
    status: "probe-required",
    warning: "Embedded audio capability is unknown and must be probed.",
    audioSourceId: null,
    audioSourceName: null,
    nativeAudioMuted: false,
    crossRoomConfirmed: false,
  };
}

export function validateAudioAssignment(input: {
  camera: { roomScope: string; audioMode: CameraAudioMode; audioStatus: CameraAudioStatus };
  source: TankAudioSource | null;
  replaceNative: boolean;
  confirmCrossRoom: boolean;
}): { ok: true; nativeAudioMuted: boolean; crossRoomConfirmed: boolean } | { ok: false; error: string } {
  const { camera, source } = input;
  if (!source) {
    if (camera.audioMode === "external") {
      return { ok: false, error: "External audio mode requires an audio source." };
    }
    return { ok: true, nativeAudioMuted: false, crossRoomConfirmed: false };
  }

  if (camera.audioMode === "auto" && camera.audioStatus === "probe-required") {
    return { ok: false, error: "Probe automatic audio before assigning an external microphone." };
  }

  const replacingEmbedded =
    camera.audioMode === "embedded" || camera.audioStatus === "embedded" || camera.audioStatus === "transcode-required";
  if (replacingEmbedded && !input.replaceNative) {
    return { ok: false, error: "Replacing embedded audio requires the explicit mute-native/replace action." };
  }

  const crossRoom = source.roomScope !== camera.roomScope;
  if (crossRoom && !source.tags.includes("shared-audio")) {
    return { ok: false, error: "Cross-room audio is rejected unless the microphone has the shared-audio tag." };
  }
  if (crossRoom && !input.confirmCrossRoom) {
    return { ok: false, error: "Explicitly confirm this shared cross-room microphone assignment." };
  }

  return {
    ok: true,
    nativeAudioMuted: replacingEmbedded,
    crossRoomConfirmed: crossRoom,
  };
}
