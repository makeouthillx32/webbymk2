export type TankChatOverlayLayout = "bottom-up" | "top-down";
export type TankChatOverlayTheme = "tank" | "minimal" | "cards";

/** Which edge of the browser source the chat column hugs. */
export type TankChatOverlayAlign = "left" | "right" | "center";

/**
 * What sits behind the messages.
 *
 * `transparent` is the default and the right answer most of the time — an OBS
 * source that paints a background covers whatever is under it. The Tank plates
 * exist for the case where chat is its own panel in a scene rather than an
 * overlay on the camera.
 */
export type TankChatOverlayBackground = "transparent" | "green" | "blue" | "dark";

export type TankChatOverlayConfig = {
  room: string;
  align: TankChatOverlayAlign;
  /** Column width as a percentage of the browser source. */
  widthPercent: number;
  background: TankChatOverlayBackground;
  /** 0-100. Only meaningful when background is not transparent. */
  backgroundOpacity: number;
  layout: TankChatOverlayLayout;
  theme: TankChatOverlayTheme;
  limit: number;
  ttlSeconds: number;
  fontSize: number;
  outline: number;
  avatars: boolean;
  badges: boolean;
  events: boolean;
  replies: boolean;
  debug: boolean;
};

export type TankTtsOverlayConfig = {
  scope: "website" | "room" | "both";
  room: string;
  volume: number;
  fallbackVoice: string;
  showCard: boolean;
  captions: boolean;
  debug: boolean;
};

type SearchInput = URLSearchParams | ReadonlyURLSearchParamsLike;

type ReadonlyURLSearchParamsLike = {
  get(name: string): string | null;
};

function enumValue<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return value && allowed.includes(value as T) ? (value as T) : fallback;
}

function numberValue(value: string | null, fallback: number, min: number, max: number) {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function booleanValue(value: string | null, fallback: boolean) {
  if (value === null) return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return fallback;
}

function safeKey(value: string | null, fallback: string) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized) ? normalized : fallback;
}

export function parseTankChatOverlayConfig(search: SearchInput): TankChatOverlayConfig {
  return {
    room: safeKey(search.get("room"), "global"),
    align: enumValue(search.get("align"), ["left", "right", "center"] as const, "left"),
    // Not clamped to 100 at the top: a source sized to the chat column itself
    // wants 100, and anything narrower is the operator's choice.
    widthPercent: Math.round(numberValue(search.get("width"), 100, 15, 100)),
    background: enumValue(
      search.get("background"),
      ["transparent", "green", "blue", "dark"] as const,
      "transparent",
    ),
    backgroundOpacity: Math.round(numberValue(search.get("bgOpacity"), 85, 0, 100)),
    layout: enumValue(search.get("layout"), ["bottom-up", "top-down"] as const, "bottom-up"),
    theme: enumValue(search.get("theme"), ["tank", "minimal", "cards"] as const, "tank"),
    // Keep the default overlay compact: messages build into a small rolling
    // stack, then age out independently instead of filling the whole scene.
    limit: Math.round(numberValue(search.get("limit"), 4, 1, 25)),
    ttlSeconds: Math.round(numberValue(search.get("ttl"), 20, 0, 300)),
    fontSize: Math.round(numberValue(search.get("fontSize"), 28, 14, 72)),
    outline: numberValue(search.get("outline"), 2, 0, 6),
    avatars: booleanValue(search.get("avatars"), true),
    badges: booleanValue(search.get("badges"), true),
    events: booleanValue(search.get("events"), true),
    replies: booleanValue(search.get("replies"), true),
    debug: booleanValue(search.get("debug"), false),
  };
}

export function parseTankTtsOverlayConfig(search: SearchInput): TankTtsOverlayConfig {
  return {
    scope: enumValue(search.get("scope"), ["website", "room", "both"] as const, "website"),
    room: safeKey(search.get("room"), "global"),
    volume: Math.round(numberValue(search.get("volume"), 80, 0, 100)),
    fallbackVoice: (search.get("voice")?.trim() || "default").slice(0, 80),
    showCard: booleanValue(search.get("showCard"), true),
    captions: booleanValue(search.get("captions"), true),
    debug: booleanValue(search.get("debug"), false),
  };
}
