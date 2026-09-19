// Playback URL derivation for the Tank media paths.
//
// Extracted from CameraPlayer so it can be tested directly. These four
// functions have caused two separate blackouts -- a previews/* URL passed
// through unchanged and handed to video.src, and a low-rung URL silently
// upgraded back to 4K -- and in both cases the failure was a regex that did
// not match rather than one that threw. Nothing here touches the DOM, so
// there is no reason for that class of bug to be discoverable only in a
// browser.

// HLS is served from the `-hls` sibling path when transcoded, or directly from
// `cameras/{id}/index.m3u8` for direct IRL/USB/OBS ingest.
//
// obs/<slug> rooms are the OPPOSITE polarity from cameras/<id>: OBS is the
// one actively publishing the base path, so nothing can transcode it in
// place — the base path IS the HLS-ready (AAC) content, and -whep is the
// ADDED Opus sibling (see provisionObsWhepSibling in server/mediaGateway.ts).
// Stripping -whep back to the bare path is therefore the correct HLS
// fallback for a room, the mirror image of adding -hls for a camera.
export function deriveHlsUrl(url: string, direct = false): string {
  // previews/* had no branch here, so a preview WHEP URL came back from this
  // function UNCHANGED and was then assigned to video.src as if it were a
  // playlist. A WHEP endpoint is not decodable media, so the element failed
  // with MEDIA_ERR_SRC_NOT_SUPPORTED and the tile stayed black — which is
  // exactly what Admin and Director looked like on the Tank landing while
  // every camera tile beside them played fine.
  if (/\/previews\//.test(url)) {
    return url.replace(/\/(previews\/[^/]+)\/(?:whep|index\.m3u8)(\?.*)?$/, "/$1/index.m3u8$2");
  }
  if (/-whep\//.test(url)) {
    return url.replace(/-whep\/(?:whep|index\.m3u8)(\?.*)?$/, "/index.m3u8$1");
  }
  if (direct) {
    return url.replace(
      /\/(cameras\/[^/]+?)(?:-hls(?:-low)?)?\/(?:whep|index\.m3u8)(\?.*)?$/,
      "/$1/index.m3u8",
    );
  }
  return url.replace(
    /\/(cameras\/[^/]+?)(?:-hls(?:-low)?)?\/(?:whep|index\.m3u8)(\?.*)?$/,
    "/$1-hls/index.m3u8",
  );
}

// 720p rung. Only exists when TANK_HLS_LOW_RUNG=1 server-side, and only for
// `cameras/*`: the OBS `previews/*` and `-whep` paths publish a single rung.
//
// Anything this cannot downgrade is handed to deriveHlsUrl rather than
// returned untouched. An unmatched pass-through would put a WHEP endpoint on
// video.src — the exact MEDIA_ERR_SRC_NOT_SUPPORTED that blacked out Director
// and Admin on the landing page — so the low rung fails to the full rung,
// never to a URL no video element can decode.
export function deriveHlsLowUrl(url: string): string {
  if (!/\/cameras\/[^/]+/.test(url)) return deriveHlsUrl(url);
  const low = url.replace(
    /\/(cameras\/[^/]+?)(?:-hls(?:-low)?)?\/(?:whep|index\.m3u8)(\?.*)?$/,
    "/$1-hls-low/index.m3u8",
  );
  return /-hls-low\//.test(low) ? low : deriveHlsUrl(url);
}

// Small screens and phones get the low rung when it's available: a 4K
// 8.4 Mbps stream is unwatchable on cellular and pointless on a handset
// display. Falls back to the source rung when the ladder is disabled.
export function prefersLowRung(): boolean {
  if (typeof window === "undefined") return false;
  const narrow = window.matchMedia?.("(max-width: 900px)")?.matches ?? false;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  return narrow || coarse;
}

export function deriveWhepUrl(url: string): string {
  return url.replace(
    /\/(cameras\/[^/]+?)(?:-hls)?\/(?:whep|index\.m3u8)(\?.*)?$/,
    "/$1/whep",
  );
}
