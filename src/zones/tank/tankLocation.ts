// src/zones/tank/tankLocation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tank Location & Metadata Definitions (Single-URL Web Application Architecture)
// ─────────────────────────────────────────────────────────────────────────────

export type ViewMode = "director" | "room" | "grid";

export type TankInitialLocation = {
  mode: ViewMode;
  slug?: string;
};

/**
 * Safely sanitizes a room slug without throwing on malformed percent encoding.
 * Slugs must match ^[a-z0-9]+(?:-[a-z0-9]+)*$.
 */
export function sanitizeRoomSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let candidate = raw.trim().toLowerCase();
  if (!candidate) return null;

  if (candidate.includes("%")) {
    try {
      candidate = decodeURIComponent(candidate).trim().toLowerCase();
    } catch {
      return null;
    }
  }

  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate) ? candidate : null;
}

/**
 * Converts a room slug into a human-readable title.
 */
export function formatRoomTitle(slug: string): string {
  if (slug === "director") return "Director";
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type ParseLocationInput = {
  room?: unknown;
  view?: unknown;
  pathname?: string;
  hash?: string;
};

/**
 * In the single-URL app architecture, room and view state live entirely within
 * client state. All locations resolve cleanly to Director by default without
 * query string parameters.
 */
export function parseTankLocation(_input: ParseLocationInput = {}): TankInitialLocation {
  return { mode: "director" };
}

export const DEFAULT_TANK_METADATA = {
  title: "Tank | Live rooms, cameras, and community",
  description:
    "Watch the director feed, move between public cameras, and join live rooms on Tank.",
  alternates: { canonical: "https://tank.unenter.live/" },
  openGraph: {
    type: "website",
    url: "https://tank.unenter.live/",
    siteName: "Tank LIVE",
    title: "Tank | Live rooms, cameras, and community",
    description:
      "Watch the director feed, move between public cameras, and join live rooms on Tank.",
  },
};

/**
 * Single canonical metadata for Tank's single-URL web application.
 */
export function buildTankMetadata(_location?: TankInitialLocation) {
  return DEFAULT_TANK_METADATA;
}
