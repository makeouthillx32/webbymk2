/**
 * The Director Programme browser source.
 *
 * There used to be five flags here — audio, hud, attention, vu, crt — and each
 * was a way for the one source an operator pastes into OBS to come out wrong.
 * The worst was `audio`, which could silence the programme or, together with
 * the old standalone /obs/director/audio source, put a DIFFERENT room's sound
 * under the picture.
 *
 * The source is now one fixed, clean thing: the director's current room with
 * its own sound and no visual overlay. Volume and an optional room lock are all
 * that remain, because neither can desynchronise anything — one is a level,
 * the other picks the room for both halves at once.
 */
export type DirectorBrowserSourceOptions = {
  volume: number;
  roomLock?: string | null;
};

export function buildDirectorBrowserSourceUrl(
  origin: string,
  options: DirectorBrowserSourceOptions,
): string {
  const url = new URL("/obs/director", origin);
  const volume = Math.max(0, Math.min(100, Math.round(options.volume)));

  url.searchParams.set("volume", String(volume));
  url.searchParams.set("theme", "cctv");

  const roomLock = options.roomLock?.trim();
  if (roomLock && roomLock !== "auto") {
    url.searchParams.set("lock", roomLock);
  }

  return url.toString();
}

export type ChatBrowserSourceOptions = {
  room: string;
  align?: "left" | "right" | "center";
  widthPercent?: number;
  background?: "transparent" | "green" | "blue" | "dark";
  backgroundOpacity?: number;
  layout: "bottom-up" | "top-down";
  theme: "tank" | "minimal" | "cards";
  limit: number;
  ttlSeconds: number;
  avatars: boolean;
  badges: boolean;
  events: boolean;
  replies: boolean;
};

export function buildChatBrowserSourceUrl(origin: string, options: ChatBrowserSourceOptions) {
  const url = new URL("/obs/chat", origin);
  url.searchParams.set("room", options.room || "global");
  // Only written when they differ from the overlay's own defaults, so a pasted
  // URL shows what the operator actually chose.
  if (options.align && options.align !== "left") url.searchParams.set("align", options.align);
  if (options.widthPercent !== undefined && options.widthPercent !== 100) {
    url.searchParams.set("width", String(Math.max(15, Math.min(100, Math.round(options.widthPercent)))));
  }
  if (options.background && options.background !== "transparent") {
    url.searchParams.set("background", options.background);
    if (options.backgroundOpacity !== undefined && options.backgroundOpacity !== 85) {
      url.searchParams.set(
        "bgOpacity",
        String(Math.max(0, Math.min(100, Math.round(options.backgroundOpacity)))),
      );
    }
  }
  url.searchParams.set("layout", options.layout);
  url.searchParams.set("theme", options.theme);
  url.searchParams.set("limit", String(Math.max(1, Math.min(25, Math.round(options.limit)))));
  url.searchParams.set("ttl", String(Math.max(0, Math.min(300, Math.round(options.ttlSeconds)))));
  url.searchParams.set("avatars", options.avatars ? "on" : "off");
  url.searchParams.set("badges", options.badges ? "on" : "off");
  url.searchParams.set("events", options.events ? "on" : "off");
  url.searchParams.set("replies", options.replies ? "on" : "off");
  return url.toString();
}

export type TtsBrowserSourceOptions = {
  scope: "website" | "room" | "both";
  room: string;
  volume: number;
  voice: string;
  showCard: boolean;
  captions: boolean;
};

export function buildTtsBrowserSourceUrl(origin: string, options: TtsBrowserSourceOptions) {
  const url = new URL("/obs/tts", origin);
  url.searchParams.set("scope", options.scope);
  if (options.scope !== "website") url.searchParams.set("room", options.room || "global");
  url.searchParams.set("volume", String(Math.max(0, Math.min(100, Math.round(options.volume)))));
  url.searchParams.set("voice", options.voice.trim() || "default");
  url.searchParams.set("showCard", options.showCard ? "on" : "off");
  url.searchParams.set("captions", options.captions ? "on" : "off");
  return url.toString();
}
