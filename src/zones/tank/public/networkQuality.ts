"use client";

// What kind of pipe are we on, and how hard should video push?
//
// Tank's recovery logic was written on a LAN, where a stalled playhead really
// does mean something broke. On cellular a stalled playhead is the normal cost
// of rebuffering, so the same logic reads healthy-but-slow as broken and starts
// "recovering" a stream that only needed time. Everything here exists to give
// the player a second set of numbers to use when the pipe is thin.

export type NetworkTier = "fast" | "slow" | "unknown";

export type NetworkProfile = {
  tier: NetworkTier;
  /** The user explicitly asked for less data (Low Data Mode / Data Saver). */
  saveData: boolean;
  /** Thin pipe: cellular, 2g/3g, or an explicit data-saving preference. */
  constrained: boolean;
  /** How long to let a WHEP handshake produce its first frame. */
  whepFirstFrameMs: number;
  /** Seconds of buffer to keep behind the live edge when resyncing. */
  liveEdgeTargetSeconds: number;
  /** Give up on an engine after this many failed attempts. */
  maxEngineRetries: number;
  /** How much a video element may download before the user asks for it. */
  preload: "none" | "metadata" | "auto";
  /** Players allowed to hold a live connection at once. */
  maxConcurrentStreams: number;
};

const FAST: NetworkProfile = {
  tier: "fast",
  saveData: false,
  constrained: false,
  whepFirstFrameMs: 3500,
  liveEdgeTargetSeconds: 0.5,
  maxEngineRetries: 6,
  preload: "auto",
  maxConcurrentStreams: 8,
};

// Deliberately patient rather than aggressive. On a thin pipe every retry costs
// bandwidth that the stream itself needed, so recovery makes things worse — the
// cheapest fix for congestion is to stop adding to it.
const SLOW: NetworkProfile = {
  tier: "slow",
  saveData: false,
  constrained: true,
  // Cellular ICE plus a first keyframe regularly exceeds 3.5s; failing over at
  // 3.5s abandons handshakes that were about to succeed.
  whepFirstFrameMs: 12000,
  // Snapping to 0.5s behind live on cellular guarantees an immediate re-stall,
  // which is what turned recovery into a loop. Sit further back and stay there.
  liveEdgeTargetSeconds: 6,
  maxEngineRetries: 3,
  preload: "none",
  // One stream at a time. Six players sharing a cellular link starve each other
  // AND the page's own requests, which is why the site itself stops loading.
  maxConcurrentStreams: 1,
};

/** Same on the server and first browser render; live connection data applies after hydration. */
export function getHydrationSafeNetworkProfile(): NetworkProfile {
  return { ...SLOW, tier: "unknown", constrained: false, maxConcurrentStreams: 4, preload: "metadata" };
}

function readConnection(): any | null {
  if (typeof navigator === "undefined") return null;
  return (
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection ||
    null
  );
}

export function detectNetworkProfile(): NetworkProfile {
  const conn = readConnection();

  // No Network Information API (Safari, Firefox — so most iPhones). We cannot
  // tell, and guessing "fast" is what produces the broken experience on a
  // phone, while guessing "slow" only costs a fast viewer a slightly deeper
  // buffer. Treat unknown as unknown and use the patient numbers, but keep the
  // tier honest so the UI never claims to know.
  if (!conn) {
    return getHydrationSafeNetworkProfile();
  }

  const saveData = Boolean(conn.saveData);
  const effective = typeof conn.effectiveType === "string" ? conn.effectiveType : "";
  const downlink = typeof conn.downlink === "number" ? conn.downlink : null;

  const slow =
    saveData ||
    effective === "slow-2g" ||
    effective === "2g" ||
    effective === "3g" ||
    conn.type === "cellular" ||
    (downlink !== null && downlink > 0 && downlink < 1.5);

  if (slow) return { ...SLOW, saveData };
  return { ...FAST, saveData };
}

/**
 * The live profile, re-read when the connection changes (walking out of wifi
 * onto cellular mid-stream is exactly when the patient numbers start mattering).
 */
export function subscribeToNetworkProfile(onChange: (p: NetworkProfile) => void): () => void {
  const conn = readConnection();
  if (!conn || typeof conn.addEventListener !== "function") return () => {};

  const handler = () => onChange(detectNetworkProfile());
  conn.addEventListener("change", handler);
  return () => conn.removeEventListener("change", handler);
}
