// src/zones/tank/house/directorOverlayWorkshop.ts
// ─────────────────────────────────────────────────────────────────────────────
// What is tunable on each director overlay, and how those settings become a URL.
//
// The split this supports: the Workshop is where an overlay is CONFIGURED, and
// OBS Studio is where the configured URL is POSITIONED. So this file is the
// single description of every knob, and the Workshop panel renders itself from
// it — adding a sixth overlay is one entry here, not another bespoke editor.
//
// Every field is a REAL query parameter that the overlay component actually
// reads. That is the rule worth keeping: a control that writes a parameter
// nothing parses looks identical to one that works, right up until someone
// puts it on air and wonders why nothing changed. Each entry below names the
// component and line that consumes it.
// ─────────────────────────────────────────────────────────────────────────────

// "audio" is deliberately absent: programme sound is NOT a separate source.
// It used to be /obs/director/audio, a second independent WHEP session to the
// same camera — which could and did drift out of step with the picture, and
// could be pointed at a different room than the one on screen. Sound now comes
// off the SAME video element that carries the programme, so it is locked to
// whatever the director is showing and there is no switch that can separate
// them. See DirectorObsScene.
//
// "crt" is deliberately absent: the programme and public room players are
// clean video surfaces. Visual effects must be added as explicit, independent
// browser sources rather than silently layered over every camera.
import { OVERLAY_TEXTURES } from "../obs/overlaySkin";

export type DirectorOverlayId =
  | "hud"
  | "rec"
  | "room"
  | "clock"
  | "attention"
  | "vu"
  | "goal"
  | "chat";

export type DirectorOverlayField =
  | { kind: "text"; key: string; label: string; placeholder?: string; help?: string }
  | { kind: "toggle"; key: string; label: string; value: boolean; help?: string }
  | {
      kind: "number";
      key: string;
      label: string;
      value: number;
      min: number;
      max: number;
      unit?: string;
      help?: string;
    }
  | { kind: "room"; key: string; label: string; help?: string }
  | {
      kind: "choice";
      key: string;
      label: string;
      /** The default. Omitted from the URL, like every other default. */
      value: string;
      options: readonly { value: string; label: string; hint?: string }[];
      help?: string;
    };

export type DirectorOverlayDefinition = {
  id: DirectorOverlayId;
  title: string;
  route: string;
  description: string;
  fields: DirectorOverlayField[];
  /**
   * What to set the OBS Browser Source to.
   *
   * THE ANSWER IS ALMOST ALWAYS THE FULL CANVAS, and that surprises people.
   * These overlays anchor themselves to the viewport — the HUD is
   * `fixed inset-x-0 top-0`, the VU meter pins to the bottom, the attention
   * banner centres itself. The browser source IS their coordinate space, so
   * sizing one to a small box does not "crop" the overlay to that box, it
   * re-anchors the whole thing inside it: a 400x100 source puts the HUD at the
   * top of a 400x100 area and the timecode somewhere unexpected.
   *
   * So match the canvas and let the overlay place itself, then position it in
   * OBS only if you want it somewhere other than where it was designed to sit.
   */
  recommendedWidth: number;
  recommendedHeight: number;
  /** Why that size, in one line, shown next to the fields. */
  sizingNote: string;
};

export const DIRECTOR_OVERLAY_WORKSHOP: readonly DirectorOverlayDefinition[] = [
  {
    id: "hud",
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    sizingNote: "Full canvas. The bar anchors itself to the top edge.",
    title: "CCTV HUD",
    route: "/obs/director/hud",
    description: "REC badge, room caption and running timecode across the top of the shot.",
    fields: [
      {
        kind: "choice",
        key: "texture",
        label: "Tank texture",
        value: "clean",
        // Sourced from the skin module, so a texture cannot be offered here
        // that the overlay does not actually render.
        options: OVERLAY_TEXTURES.map((t) => ({ value: t.id, label: t.label, hint: t.hint })),
        help:
          "The console panel behind the text. Clean is plain black and reads over " +
          "anything; the metal skins use the real Tank console textures and fonts.",
      },
      {
        kind: "text",
        key: "label",
        label: "Caption override",
        placeholder: "TANK HOUSE • Kitchen",
        // DirectorHudOverlay reads `label` and hands it to overlayCameraLabel,
        // where an explicit value wins outright over anything derived.
        help:
          "Replaces the room caption with your own words. Leave empty to follow " +
          "the director automatically.",
      },
    ],
  },
  {
    id: "rec",
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    sizingNote: "Full canvas. The badge anchors to the top-left corner.",
    title: "REC Badge",
    route: "/obs/director/rec",
    description:
      "The pulsing REC dot and feed label, on its own. Carries no room information.",
    fields: [
      {
        kind: "choice",
        key: "texture",
        label: "Tank texture",
        value: "clean",
        options: OVERLAY_TEXTURES.map((t) => ({ value: t.id, label: t.label, hint: t.hint })),
        help: "The console panel behind the text.",
      },
      {
        kind: "text",
        key: "feed",
        label: "Feed label",
        placeholder: "DIRECTOR FEED",
        help: "The text beside REC. Clear it to show the dot and REC alone.",
      },
    ],
  },
  {
    id: "room",
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    sizingNote: "Full canvas. The caption anchors to the top-left corner.",
    title: "Room Caption",
    route: "/obs/director/room",
    description:
      "Just the room name. Follows the director's cuts unless locked to one room.",
    fields: [
      {
        kind: "choice",
        key: "texture",
        label: "Tank texture",
        value: "clean",
        options: OVERLAY_TEXTURES.map((t) => ({ value: t.id, label: t.label, hint: t.hint })),
        help: "The console panel behind the text.",
      },
      {
        kind: "text",
        key: "label",
        label: "Caption override",
        placeholder: "TANK HOUSE • Kitchen",
        help: "Replaces the room name. Leave empty to follow the director.",
      },
    ],
  },
  {
    id: "clock",
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    sizingNote: "Full canvas. The clock anchors to the top-right corner.",
    title: "Timecode",
    route: "/obs/director/clock",
    description: "Running wall clock on the Tank LED face.",
    fields: [
      {
        kind: "choice",
        key: "texture",
        label: "Tank texture",
        value: "clean",
        options: OVERLAY_TEXTURES.map((t) => ({ value: t.id, label: t.label, hint: t.hint })),
        help: "The console panel behind the text.",
      },
      { kind: "toggle", key: "seconds", label: "Show seconds", value: true },
    ],
  },
  {
    id: "attention",
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    sizingNote: "Full canvas. The banner centres itself horizontally.",
    title: "Attention Banner",
    route: "/obs/director/attention",
    description: "Centre banner naming the director's active lock, with its countdown.",
    fields: [
      {
        kind: "choice",
        key: "texture",
        label: "Tank texture",
        value: "clean",
        // Sourced from the skin module, so a texture cannot be offered here
        // that the overlay does not actually render.
        options: OVERLAY_TEXTURES.map((t) => ({ value: t.id, label: t.label, hint: t.hint })),
        help:
          "The console panel behind the text. Clean is plain black and reads over " +
          "anything; the metal skins use the real Tank console textures and fonts.",
      },
      {
        kind: "text",
        key: "target",
        label: "Target text override",
        placeholder: "TYLER",
        help: "What the banner names. Leave empty to use the live attention lock.",
      },
      {
        kind: "toggle",
        key: "preview",
        label: "Hold visible (for positioning)",
        value: false,
        help:
          "Forces the banner on so it can be placed in OBS. A real lock appears " +
          "for seconds at a time, which is impossible to aim at. Turn off before air.",
      },
    ],
  },
  {
    id: "vu",
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    sizingNote: "Full canvas. Meter and watermark pin to the bottom edge.",
    title: "VU Meter",
    route: "/obs/director/vu",
    description: "Audio energy for the room currently on air, plus the Tank watermark.",
    fields: [
      {
        kind: "choice",
        key: "texture",
        label: "Tank texture",
        value: "clean",
        // Sourced from the skin module, so a texture cannot be offered here
        // that the overlay does not actually render.
        options: OVERLAY_TEXTURES.map((t) => ({ value: t.id, label: t.label, hint: t.hint })),
        help:
          "The console panel behind the text. Clean is plain black and reads over " +
          "anything; the metal skins use the real Tank console textures and fonts.",
      },
      { kind: "toggle", key: "vu", label: "Show meter", value: true },
      { kind: "toggle", key: "watermark", label: "Show watermark", value: true },
    ],
  },
  {
    id: "goal",
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    sizingNote: "Full canvas. The bar anchors itself to the edge you pick below.",
    title: "Stream Goal",
    route: "/obs/goal",
    description:
      "Progress bar for whichever goal is switched on, e.g. \"Follower goal 243 / 254\".",
    fields: [
      {
        kind: "choice",
        key: "texture",
        label: "Tank texture",
        value: "clean",
        // Sourced from the skin module, so a texture cannot be offered here
        // that the overlay does not actually render.
        options: OVERLAY_TEXTURES.map((t) => ({ value: t.id, label: t.label, hint: t.hint })),
        help:
          "The console panel behind the text. Clean is plain black and reads over " +
          "anything; the metal skins use the real Tank console textures and fonts.",
      },
      {
        kind: "text",
        key: "position",
        label: "Anchor",
        placeholder: "bottom",
        // DirectorGoalOverlay maps this onto its fixed-position classes.
        help:
          "bottom, top, bottom-left, bottom-right, top-left or top-right. " +
          "Anything else anchors bottom-centre.",
      },
      {
        kind: "number",
        key: "width",
        label: "Bar width",
        value: 420,
        min: 160,
        max: 1600,
        unit: "px",
        help: "How wide the card is. The anchor above decides where it sits.",
      },
      { kind: "toggle", key: "percent", label: "Show percentage", value: true },
      {
        kind: "text",
        key: "label",
        label: "Label override",
        placeholder: "Follower goal",
        help: "Replaces the goal's own name. Leave empty to use what staff typed.",
      },
      {
        kind: "text",
        key: "accent",
        label: "Accent colour",
        placeholder: "#f59e0b",
        // Validated as a hex by the overlay; anything else falls back rather
        // than landing an invalid value in a style attribute.
        help: "Hex colour for the filled part of the bar. Leave empty to use the goal's own.",
      },
    ],
  },
  {
    id: "chat",
    recommendedWidth: 520,
    recommendedHeight: 900,
    sizingNote:
      "Unlike the director overlays, this one is a COLUMN — size the source to the " +
      "space you want chat to occupy and it fills it.",
    title: "Tank Chat",
    route: "/obs/chat",
    description: "Global Tank chat, including messages bridged from Twitch, Kick and YouTube.",
    fields: [
      {
        kind: "choice",
        key: "align",
        label: "Side",
        value: "left",
        options: [
          { value: "left", label: "Left", hint: "Hugs the left edge of the source." },
          { value: "right", label: "Right", hint: "Hugs the right edge." },
          { value: "center", label: "Centre", hint: "Centred in the source." },
        ],
        help: "Which edge of the browser source the chat column sits against.",
      },
      {
        kind: "number",
        key: "width",
        label: "Column width",
        value: 100,
        min: 15,
        max: 100,
        unit: "%",
        help: "How much of the source width chat uses. 100 fills it.",
      },
      {
        kind: "choice",
        key: "background",
        label: "Backing",
        value: "transparent",
        options: [
          {
            value: "transparent",
            label: "Transparent (chat only)",
            hint: "Just the messages over whatever is beneath. The usual choice.",
          },
          { value: "green", label: "Tank green plate", hint: "The arcade green panel." },
          { value: "blue", label: "Tank blue plate", hint: "The arcade blue panel." },
          { value: "dark", label: "Solid dark", hint: "Plain Tank black, no texture." },
        ],
        help:
          "A backing covers whatever is under the source, so leave it transparent " +
          "unless chat has its own panel in the scene.",
      },
      {
        kind: "number",
        key: "bgOpacity",
        label: "Backing opacity",
        value: 85,
        min: 0,
        max: 100,
        unit: "%",
        // Applied to a colour behind the text, never to the element, so the
        // messages stay fully opaque at any setting.
        help: "Only applies when a backing is chosen. Text stays fully opaque.",
      },
      {
        kind: "number",
        key: "fontSize",
        label: "Text size",
        value: 28,
        min: 14,
        max: 72,
        unit: "px",
      },
      {
        kind: "number",
        key: "limit",
        label: "Messages shown",
        value: 8,
        min: 1,
        max: 25,
      },
      {
        kind: "number",
        key: "ttl",
        label: "Hold each message",
        value: 30,
        min: 0,
        max: 300,
        unit: "s",
        help: "0 keeps messages until they scroll off.",
      },
      { kind: "toggle", key: "avatars", label: "Show avatars", value: true },
      { kind: "toggle", key: "badges", label: "Show badges", value: true },
    ],
  },
] as const;

export function getDirectorOverlay(id: string): DirectorOverlayDefinition | undefined {
  return DIRECTOR_OVERLAY_WORKSHOP.find((entry) => entry.id === id);
}

export type DirectorOverlayValues = Record<string, string | number | boolean | null | undefined>;

/**
 * Turn a set of edits into the URL to paste into OBS.
 *
 * Only values that DIFFER from the overlay's own default are written. That is
 * not tidiness — a URL carrying every parameter hides which ones the operator
 * actually chose, and the next person cannot tell an intentional `vu=1` from
 * one the form happened to emit. A short URL is a readable one.
 *
 * The exception is anything whose default is ON: those must be written when
 * switched OFF, because every one of these flags is read as
 * `get(key) !== "0"` — omitting it means enabled. Getting that backwards is
 * how `vu=0` ends up doing nothing.
 */
export function buildDirectorOverlayUrl(
  origin: string,
  id: DirectorOverlayId,
  values: DirectorOverlayValues = {},
): string {
  const definition = getDirectorOverlay(id);
  if (!definition) throw new Error(`Unknown director overlay "${id}"`);

  const url = new URL(definition.route, origin || "https://tank.unenter.live");

  for (const field of definition.fields) {
    const raw = values[field.key];

    if (field.kind === "text" || field.kind === "room") {
      const text = typeof raw === "string" ? raw.trim() : "";
      if (text) url.searchParams.set(field.key, text);
      continue;
    }

    if (field.kind === "choice") {
      const choice = typeof raw === "string" ? raw.trim() : "";
      // Validated against the field's own options rather than trusted: a value
      // no overlay recognises would be silently ignored at render time, which
      // looks exactly like the setting doing nothing.
      if (!choice || choice === field.value) continue;
      if (!field.options.some((option) => option.value === choice)) continue;
      url.searchParams.set(field.key, choice);
      continue;
    }

    if (field.kind === "toggle") {
      const on = typeof raw === "boolean" ? raw : field.value;
      if (on === field.value) continue;
      url.searchParams.set(field.key, on ? "1" : "0");
      continue;
    }

    const numeric = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(numeric)) continue;
    const clamped = Math.min(field.max, Math.max(field.min, numeric));
    if (clamped === field.value) continue;
    url.searchParams.set(field.key, String(clamped));
  }

  return url.toString();
}

/**
 * Which overlay a browser-source URL points at, if any.
 *
 * This is what connects the two decks: a layer in the OBS Studio compositor
 * knows only its URL, and the Workshop is keyed by overlay id. Without this,
 * "configure this layer" would mean the operator reading the URL, recognising
 * it, switching decks and finding the matching card by hand.
 *
 * Tolerant on purpose, because these URLs are typed and pasted by people:
 * absolute or relative, with or without a query string, with or without a
 * trailing slash. Anything that is not one of ours returns undefined rather
 * than guessing — a wrong match would send someone to edit settings that have
 * no effect on the layer they are looking at.
 */
export function getDirectorOverlayByRoute(
  url: string | null | undefined,
): DirectorOverlayDefinition | undefined {
  if (!url || typeof url !== "string") return undefined;

  let pathname: string;
  try {
    // A relative path needs a base; the base itself is irrelevant to the match.
    pathname = new URL(url, "https://tank.unenter.live").pathname;
  } catch {
    return undefined;
  }

  const normalized = pathname.replace(/\/+$/, "").toLowerCase();
  return DIRECTOR_OVERLAY_WORKSHOP.find((entry) => entry.route.toLowerCase() === normalized);
}
