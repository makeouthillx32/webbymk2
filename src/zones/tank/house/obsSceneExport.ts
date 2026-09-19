// src/zones/tank/house/obsSceneExport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Generating an OBS Studio scene collection, so a composed Tank scene can be
// imported into OBS in one step instead of hand-creating six browser sources
// and sizing each one.
//
// OBS imports this via Scene Collection → Import. The format is undocumented
// and version-sensitive, so everything below states which parts matter and
// which are cargo that OBS expects to exist:
//
//  - `sources` is a FLAT list holding both the scene and its inputs. A scene is
//    just a source with `id: "scene"` whose settings contain `items`.
//  - A scene item references its input BY NAME (and by `source_uuid` on OBS 28+).
//    Names must therefore be unique across the whole collection, or OBS silently
//    binds several items to one input.
//  - Every input needs the full audio/hotkey block even when it is video-only.
//    Omitting fields does not fall back to defaults — OBS reads them directly
//    and a missing key can drop the source on import.
//
// LAYER ORDER IS THE ONE THING TO CHECK AFTER IMPORTING. OBS enumerates scene
// items bottom-to-top, so the first entry in `items` is the BACK of the scene
// and the last is the front. This module therefore emits the base video first
// and overlays after it. If a build of OBS ever reverses that, the fix is one
// drag in the source list rather than a re-export, and it is called out in the
// UI for exactly that reason.
// ─────────────────────────────────────────────────────────────────────────────

export type ObsExportSource = {
  /** Shown in the OBS source list. Must be unique — see the note above. */
  name: string;
  url: string;
  width: number;
  height: number;
  /** Canvas position in pixels. */
  x: number;
  y: number;
  visible?: boolean;
  /**
   * Route this source's audio into the OBS mixer.
   *
   * Off for overlays: a browser source with audio enabled occupies a mixer
   * channel and shows a fader for something that makes no sound, which is
   * clutter at best and a muted-by-accident programme at worst.
   */
  routeAudio?: boolean;
};

export type ObsSceneExportInput = {
  sceneName: string;
  collectionName: string;
  canvasWidth: number;
  canvasHeight: number;
  sources: ObsExportSource[];
};

/** OBS writes this on every source; it is a schema marker, not our value. */
const PREV_VER = 503382016;

/**
 * Deterministic UUIDs.
 *
 * Real randomness would make every export of the same scene a different file,
 * which makes diffing two exports useless and re-importing produce duplicates
 * rather than replacing. Derived from the collection and source name instead,
 * so the same scene always exports byte-identically.
 */
function stableUuid(seed: string): string {
  // FNV-1a, run four times over salted input to fill 128 bits. Not
  // cryptographic and does not need to be: this only has to be stable and
  // collision-free across a handful of names in one file.
  const hashes: string[] = [];
  for (let salt = 0; salt < 4; salt++) {
    let h = 0x811c9dc5;
    const input = `${salt}:${seed}`;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hashes.push(h.toString(16).padStart(8, "0"));
  }
  const hex = hashes.join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    // Version 4 and the RFC 4122 variant bits, so OBS sees a well-formed UUID.
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function browserInput(source: ObsExportSource, uuid: string) {
  return {
    prev_ver: PREV_VER,
    name: source.name,
    uuid,
    id: "browser_source",
    versioned_id: "browser_source",
    settings: {
      url: source.url,
      width: Math.round(source.width),
      height: Math.round(source.height),
      // `shutdown` frees the browser when the source is hidden. OFF for these:
      // a director overlay that shuts down loses its realtime subscription and
      // has to reconnect on every scene change, which is visible on air.
      shutdown: false,
      // Likewise off — restarting on activate would replay the CRT glitch and
      // re-negotiate WHEP every time you switch back to the scene.
      restart_when_active: false,
      reroute_audio: Boolean(source.routeAudio),
      fps_custom: false,
      fps: 30,
    },
    mixers: source.routeAudio ? 255 : 0,
    sync: 0,
    flags: 0,
    volume: 1.0,
    balance: 0.5,
    enabled: true,
    muted: false,
    "push-to-mute": false,
    "push-to-mute-delay": 0,
    "push-to-talk": false,
    "push-to-talk-delay": 0,
    hotkeys: {},
    deinterlace_mode: 0,
    deinterlace_field_order: 0,
    // 0 = monitor off. Turning monitoring on by default would play the house
    // audio out of the operator's speakers the moment they import.
    monitoring_type: 0,
    private_settings: {},
  };
}

function sceneItem(source: ObsExportSource, uuid: string, id: number) {
  return {
    name: source.name,
    source_uuid: uuid,
    visible: source.visible !== false,
    locked: false,
    rot: 0.0,
    pos: { x: Number(source.x), y: Number(source.y) },
    scale: { x: 1.0, y: 1.0 },
    // 5 = top-left. The overlays anchor themselves inside their own viewport,
    // so the item must be pinned by its corner or OBS would centre it and every
    // position would be off by half the source.
    align: 5,
    bounds_type: 0,
    bounds_align: 0,
    bounds: { x: 0.0, y: 0.0 },
    crop_left: 0,
    crop_top: 0,
    crop_right: 0,
    crop_bottom: 0,
    id,
    group_item_backup: false,
    scale_filter: "disable",
    blend_method: "default",
    blend_type: "normal",
    show_transition: { duration: 0 },
    hide_transition: { duration: 0 },
    private_settings: {},
  };
}

export function buildObsSceneCollection(input: ObsSceneExportInput): Record<string, unknown> {
  const seen = new Set<string>();
  const sources = input.sources.map((source, index) => {
    // Duplicate names bind several scene items to ONE input in OBS, so a
    // rename or a URL change would silently affect both. Disambiguate instead.
    let name = source.name.trim() || `Source ${index + 1}`;
    let suffix = 2;
    while (seen.has(name)) name = `${source.name} ${suffix++}`;
    seen.add(name);
    return { ...source, name };
  });

  const withUuids = sources.map((source) => ({
    source,
    uuid: stableUuid(`${input.collectionName}/${source.name}`),
  }));

  const sceneUuid = stableUuid(`${input.collectionName}/scene/${input.sceneName}`);

  return {
    current_scene: input.sceneName,
    current_program_scene: input.sceneName,
    scene_order: [{ name: input.sceneName }],
    name: input.collectionName,
    groups: [],
    quick_transitions: [
      { name: "Cut", duration: 300, hotkeys: [], id: 1, fade_to_black: false },
      { name: "Fade", duration: 300, hotkeys: [], id: 2, fade_to_black: false },
    ],
    transitions: [],
    current_transition: "Fade",
    transition_duration: 300,
    preview_locked: false,
    scaling_enabled: false,
    scaling_level: 0,
    scaling_off_x: 0.0,
    scaling_off_y: 0.0,
    virtual_camera: { type2: 3 },
    modules: {},
    version: 1,
    sources: [
      ...withUuids.map(({ source, uuid }) => browserInput(source, uuid)),
      {
        prev_ver: PREV_VER,
        name: input.sceneName,
        uuid: sceneUuid,
        id: "scene",
        versioned_id: "scene",
        settings: {
          id_counter: withUuids.length,
          custom_size: false,
          items: withUuids.map(({ source, uuid }, index) => sceneItem(source, uuid, index + 1)),
        },
        mixers: 0,
        sync: 0,
        flags: 0,
        volume: 1.0,
        balance: 0.5,
        enabled: true,
        muted: false,
        "push-to-mute": false,
        "push-to-mute-delay": 0,
        "push-to-talk": false,
        "push-to-talk-delay": 0,
        hotkeys: {},
        deinterlace_mode: 0,
        deinterlace_field_order: 0,
        monitoring_type: 0,
        private_settings: {},
      },
    ],
  };
}

/** A filename OBS and every OS will accept. */
export function obsSceneFilename(collectionName: string): string {
  const safe =
    collectionName
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "tank-scene";
  return `${safe}.json`;
}
