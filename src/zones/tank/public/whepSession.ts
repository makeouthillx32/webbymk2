// src/zones/tank/public/whepSession.ts
// ─────────────────────────────────────────────────────────────────────────────
// Releasing a WHEP session, which nothing in this codebase used to do.
//
// A WHEP handshake is a POST that returns 201 with a `Location` header naming a
// session resource. That session lives until the client DELETEs it. Closing the
// RTCPeerConnection is NOT the same thing: it drops the local end, and the
// server keeps the reader attached until ICE and DTLS time out — tens of
// seconds later.
//
// Measured on 2026-09-12 while the director was showing exactly ONE room:
//
//   cameras/cam-...090   readers=4  [rtsp, rtsp, webRTCSession, webRTCSession]
//   cameras/cam-...094   readers=6  [rtsp x4, webRTCSession, webRTCSession]
//   cameras/cam-...095   readers=3  [rtsp, webRTCSession, webRTCSession]
//
// Two WebRTC readers on three cameras at once, for a surface that can only
// watch one. Each was an abandoned session from a previous room change.
//
// Why this made fast room switching feel broken on BOTH surfaces: the cost does
// not land in the tab that caused it, it lands on the shared MediaMTX — which
// was already running at ~4.5 cores. Clicking through rooms quickly piled up
// readers that outlived the click, so the OBS scene and the public player
// degraded each other.
// ─────────────────────────────────────────────────────────────────────────────

/** Somewhere to keep a session URL. Matches React's ref shape without importing it. */
export type SessionHandle = { current: string | null };

/**
 * Resolve the session resource from a WHEP response.
 *
 * Returns null when the server sent no Location, or sent one that will not
 * parse. A relative Location is legal and common, so it is resolved against the
 * URL the request went to.
 */
export function whepSessionUrl(response: Response, requestUrl: string): string | null {
  const location = response.headers.get("Location");
  if (!location) return null;
  try {
    return new URL(location, requestUrl).toString();
  } catch {
    return null;
  }
}

/**
 * End a session and forget it. Best effort, by design.
 *
 * `keepalive` because the moment a session most needs releasing is often the
 * moment the page is going away — an OBS scene change, a browser-source
 * refresh, a navigation — and an ordinary fetch is cancelled on unload.
 *
 * Every failure is swallowed. This is cleanup on a live broadcast: a network
 * error here must never become a visible problem, and the worst case is simply
 * the old behaviour, where MediaMTX times the reader out by itself.
 *
 * The handle is cleared BEFORE the request goes out, so a double call cannot
 * send two DELETEs for one session.
 */
export function endWhepSession(handle: SessionHandle): void {
  const url = handle.current;
  handle.current = null;
  if (!url) return;
  try {
    void fetch(url, { method: "DELETE", keepalive: true }).catch(() => {});
  } catch {
    /* best effort — see above */
  }
}
