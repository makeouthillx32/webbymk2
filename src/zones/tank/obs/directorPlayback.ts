export type VideoPictureProbe = {
  readyState: number;
  currentTime: number;
  videoWidth: number;
  videoHeight: number;
  decodedFrames: number | null;
};

export function readVideoPictureProbe(video: HTMLVideoElement): VideoPictureProbe {
  let decodedFrames: number | null = null;
  try {
    decodedFrames = video.getVideoPlaybackQuality?.().totalVideoFrames ?? null;
  } catch {
    // Older browsers/OBS CEF builds can expose the method but throw when the source is a
    // MediaStream. The media clock remains a valid visibility-independent gate.
  }
  return {
    readyState: video.readyState,
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    decodedFrames,
  };
}

/**
 * A connection is ready for programme only after it has produced a real video
 * picture. Track arrival and a successful WHEP POST prove signalling, not
 * decoding; swapping on either one is how an audio-only/late-IDR stream turns
 * the browser source black.
 */
export function hasNewDecodedPicture(
  baseline: VideoPictureProbe,
  current: VideoPictureProbe,
): boolean {
  if (
    current.readyState < 2 ||
    current.videoWidth <= 0 ||
    current.videoHeight <= 0
  ) {
    return false;
  }

  const mediaClockAdvanced =
    Number.isFinite(current.currentTime) &&
    current.currentTime > baseline.currentTime + 0.015;
  const decodedFrameAdvanced =
    baseline.decodedFrames !== null &&
    current.decodedFrames !== null &&
    current.decodedFrames > baseline.decodedFrames;

  return mediaClockAdvanced || decodedFrameAdvanced;
}

/**
 * Derive the HTTPS HLS safety rung from the public WHEP URL. OBS rooms publish
 * HLS on the base path and add a `-whep` sibling; cameras do the inverse and
 * add a `-hls` AAC sibling. Keeping this pure makes the fallback deterministic
 * and testable without exposing an ingest credential.
 */
export function deriveDirectorHlsUrl(url: string): string | null {
  if (/\.m3u8(?:\?.*)?$/.test(url)) return url;

  if (/\/obs\/[^/]+-whep\/whep(?:\?.*)?$/.test(url)) {
    return url.replace(/-whep\/whep(\?.*)?$/, "/index.m3u8$1");
  }

  if (/\/cameras\/[^/]+\/whep(?:\?.*)?$/.test(url)) {
    return url.replace(/\/(cameras\/[^/]+)\/whep(\?.*)?$/, "/$1-hls/index.m3u8$2");
  }

  return null;
}
