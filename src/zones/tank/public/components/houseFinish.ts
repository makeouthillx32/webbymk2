// Realistic finishes for the house shell, matched by eye to the real camera
// frames (artifacts/tank-rooms/reference/*.straight.jpg): white board-panel
// walls, warm brown laminate in the foyer and kitchen, tan carpet, a dark
// leather sectional, a cream barrel chair, butcher-block desk tops.
//
// The .blend paints the house with a handful of generic pixel textures (the
// carpet is near-black, keyboards wear the wall texture), and agy re-exports
// it often, so the finish is chosen at load from each object's name, never
// baked into the file. A name no rule knows keeps the look Blender gave it.
//
// Surface textures are tiny generated tiles (no images to ship), mapped in
// world space so a plank is the same size on every floor.

import * as THREE from "three";

export type SurfaceTexture = "carpet" | "wood" | "panel" | "leather" | "marble" | "butcher";

export type Finish = {
  /** Stable cache key: one material per finish, shared by every mesh. */
  key: string;
  /** sRGB colour of the surface. */
  color: string;
  texture?: SurfaceTexture;
  /** Glows on its own (screens, LEDs, daylight through glass): not lit. */
  unlit?: boolean;
};

type Rule = {
  test: RegExp;
  /** Also required of the Blender material's name. */
  material?: RegExp;
  finish: Omit<Finish, "key"> | ((label: string) => Omit<Finish, "key">);
};

// Several colours for the things a house has many of (shoes, books).
const pick = (label: string, colors: readonly string[]) => {
  let h = 2166136261;
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 16777619);
  return colors[(h >>> 0) % colors.length];
};
const SHOES = ["#f1f0ec", "#1f1f22", "#5d5f63", "#8c7a63", "#2f3b55", "#b9b2a6"];
const BOOKS = ["#7a2f2a", "#2f4a6b", "#c9b98f", "#3d5a3d", "#1f1f22", "#a8743a", "#d8d2c4"];

const WALL = "#e4e2dc";
const TRIM = "#eeede8";
/** Keep what Blender gave it. */
const KEEP = { color: "" };

// First match wins, against the object's name with underscores as spaces.
const RULES: Rule[] = [
  // Light sources and glass: they glow, the room doesn't light them.
  { test: /TV Screen|PX Screen|monitor face/i, finish: { color: "#141a24", unlit: true } },
  { test: /under sofa light|Rack LED/i, finish: { color: "#8f63ff", unlit: true } },
  { test: /PC light strip/i, finish: { color: "#5fd8ff", unlit: true } },
  { test: /luminous|daylight/i, finish: { color: "#f4f7fb", unlit: true } },
  { test: /microwave/i, finish: { color: "#202124" } },
  { test: /glass/i, finish: { color: "#c3d3de", unlit: true } },

  // Floors.
  { test: /floor/i, material: /carpet/i, finish: { color: "#8a7864", texture: "carpet" } },
  { test: /floor/i, finish: { color: "#7d5a3c", texture: "wood" } },

  // Living room.
  { test: /sectional|rounded back|lower back|seat cushion|sofa arm/i, finish: { color: "#2d221d", texture: "leather" } },
  { test: /barrel chair/i, finish: { color: "#ddd5c6" } },
  { test: /sofa side table/i, finish: { color: "#6e5a4a", texture: "marble" } },
  { test: /coffee table angled leg|side table leg/i, finish: { color: "#1f1f21" } },
  { test: /Tray on coffee table/i, finish: { color: "#b98f5a" } },
  { test: /coffee table/i, finish: { color: "#715b4b", texture: "marble" } },
  { test: /media (console|shelf)/i, finish: { color: "#3a2c23" } },
  { test: /green curtain|living curtain (left|right)/i, finish: { color: "#4f5f45" } },
  { test: /fan blade/i, finish: { color: "#b49b78" } },

  // Kitchen, bath, laundry.
  { test: /Countertop|worktop|counter plate/i, finish: { color: "#e9e7e3", texture: "marble" } },
  { test: /handle|knob/i, finish: { color: "#1c1c1e" } },
  { test: /PX Fridge/, finish: { color: "#2a2b2e" } },
  { test: /Washer|Dryer/i, finish: { color: "#e9e9e6" } },
  { test: /Appliance Control/i, finish: { color: "#3a3d42" } },
  { test: /Faucet|Sink Rim|Sink Basin|chrome/i, finish: { color: "#a7abaf" } },
  { test: /toilet|Bathroom Sink|Sink Inset/i, finish: { color: "#f1f0ec" } },
  { test: /trash|litter/i, finish: { color: "#b3b7ba" } },
  { test: /cabinet|peninsula|drawers|minifridge|upper cab/i, finish: { color: "#ecebe5" } },
  { test: /pantry (back|side|shelf|lower)/i, finish: { color: "#e6e3dc" } },

  // Game rooms.
  { test: /GamingDesk|desk bridge/i, finish: { color: "#c49a64", texture: "butcher" } },
  { test: /DeskLeg|stool leg/i, finish: { color: "#1d1d20" } },
  { test: /pink (chair|seat)/i, finish: { color: "#e3a7b8" } },
  { test: /chair|armrest|headrest|caster|stool/i, finish: { color: "#1e1e22" } },
  { test: /pixel key|Keyboard|mouse/i, finish: { color: "#1b1b1e" } },
  { test: /Monitor|desktop tower|pc box|Server Rack|rack frame|softbox|katana/i, finish: { color: "#1c1d20" } },
  { test: /cardboard/i, finish: { color: "#b08a5c" } },
  { test: /guitar neck/i, finish: { color: "#4a3020" } },
  { test: /guitar/i, finish: { color: "#a65f26" } },
  { test: /cat tree|scratch post/i, finish: { color: "#b49c74" } },
  { test: /storage bin|storage case|supply bag/i, finish: { color: "#d9d9d5" } },

  // Foyer.
  { test: /boot shaft/i, finish: { color: "#5c4130" } },
  { test: /shoe (rack|shelf)/i, finish: { color: "#eeeeea" } },
  { test: /\bshoe\b/i, finish: (label) => ({ color: pick(label, SHOES) }) },
  { test: /book/i, finish: (label) => ({ color: pick(label, BOOKS) }) },

  // The bones of the house. Art and fabric keep their own look.
  { test: /wall art|art frame|wall shelf|beaded curtain|curtain folds|folded fabric/i, finish: KEEP },
  { test: /blind/i, finish: { color: "#e8e6e0" } },
  { test: /door|entry leaf/i, finish: { color: "#ecebe6" } },
  { test: /jamb|casing|header|trim|arch|sill|mullion|frame [lrt]|window frame|rail|curtain rod/i, finish: { color: TRIM } },
  { test: /trace|wall/i, finish: { color: WALL, texture: "panel" } },
];

/** A Blender object name as a rule reads it (glTF turns spaces into "_"). */
export const finishLabel = (name: string) => name.replace(/_/g, " ").replace(/\.\d+$/, "");

/** The finish for a shell object, or null to keep what Blender gave it. */
export function finishFor(objectName: string, materialName = ""): Finish | null {
  const label = finishLabel(objectName);
  for (const rule of RULES) {
    if (!rule.test.test(label) || (rule.material && !rule.material.test(materialName))) continue;
    const finish = typeof rule.finish === "function" ? rule.finish(objectName) : rule.finish;
    if (!finish.color) return null;
    return { ...finish, key: `${finish.color}|${finish.texture ?? ""}|${finish.unlit ? 1 : 0}` };
  }
  return null;
}

// ---- Surface tiles -------------------------------------------------------

/** World metres one tile of each texture covers. */
export const TILE_METRES: Record<SurfaceTexture, number> = {
  carpet: 0.6,
  wood: 2.4,
  panel: 1.2,
  leather: 0.5,
  marble: 0.8,
  butcher: 0.9,
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A grey tile (one shade per texel, ~0.9 on average) the surface colour is
 * multiplied by. Seamless: every pattern repeats on the tile's edges.
 */
export function surfaceShades(kind: SurfaceTexture): { size: number; shades: Float32Array } {
  const random = rng(kind.length * 7919 + kind.charCodeAt(0));
  const size = kind === "wood" ? 128 : kind === "carpet" || kind === "leather" ? 32 : 64;
  const shades = new Float32Array(size * size).fill(0.9);
  const at = (x: number, y: number) => ((y + size) % size) * size + ((x + size) % size);

  if (kind === "carpet") {
    // Loop pile: 2x2 tufts, each a little lighter or darker.
    for (let y = 0; y < size; y += 2)
      for (let x = 0; x < size; x += 2) {
        const v = 0.86 + random() * 0.1;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) shades[at(x + dx, y + dy)] = v + (random() - 0.5) * 0.04;
      }
  } else if (kind === "wood") {
    // Planks along u: ~0.19 m wide, staggered butt joints, a tone per plank,
    // grain streaks and a dark seam.
    const plankWidth = 10;
    for (let row = 0; row < size / plankWidth; row++) {
      const joint = Math.floor(random() * size);
      for (const start of [joint, joint + size / 2]) {
        const tone = 0.76 + random() * 0.22;
        const phase = random() * 6.28;
        for (let x = 0; x < size / 2; x++)
          for (let y = 0; y < plankWidth; y++) {
            const u = start + x;
            const grain = Math.sin(u * 0.09 + phase + y * 0.9) * 0.035 + Math.sin(u * 0.31 + y * 2.1) * 0.015;
            shades[at(u, row * plankWidth + y)] = tone + grain;
          }
        for (let y = 0; y < plankWidth; y++) shades[at(start, row * plankWidth + y)] *= 0.72;
      }
      for (let x = 0; x < size; x++) shades[at(x, row * plankWidth)] *= 0.68;
    }
  } else if (kind === "panel") {
    // Painted board panelling: a shadowed groove every 0.3 m, a lit lip next
    // to it, and the faintest roller texture.
    const board = size / 4;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const k = x % board;
        shades[at(x, y)] = (k === 0 ? 0.78 : k === 1 ? 0.97 : 0.92) + (random() - 0.5) * 0.012;
      }
  } else if (kind === "leather") {
    for (let i = 0; i < size * size; i++) shades[i] = 0.88 + (random() - 0.5) * 0.05;
    for (let n = 0; n < 10; n++) {
      const cx = random() * size;
      const cy = random() * size;
      const lift = (random() - 0.4) * 0.12;
      for (let y = -5; y <= 5; y++)
        for (let x = -5; x <= 5; x++) {
          const d = Math.hypot(x, y) / 5;
          if (d < 1) shades[at(Math.floor(cx + x), Math.floor(cy + y))] += lift * (1 - d);
        }
    }
  } else if (kind === "marble") {
    for (let i = 0; i < size * size; i++) shades[i] = 0.9 + (random() - 0.5) * 0.04;
    // Veins: a few wandering diagonal walks, wrapped so they tile.
    for (let v = 0; v < 5; v++) {
      let x = random() * size;
      let y = 0;
      const drift = 0.5 + random() * 0.8;
      const depth = 0.68 + random() * 0.14;
      for (let s = 0; s < size * 1.4; s++) {
        x += drift + (random() - 0.5) * 1.6;
        y += 0.7 + random() * 0.4;
        shades[at(Math.floor(x), Math.floor(y))] = Math.min(shades[at(Math.floor(x), Math.floor(y))], depth);
      }
    }
  } else if (kind === "butcher") {
    // End-to-end strips along u, ~4 cm wide, alternating tones.
    const strip = 3;
    for (let y = 0; y < size; y++) {
      const tone = 0.82 + (Math.floor(y / strip) * 0.37) % 0.14;
      for (let x = 0; x < size; x++) shades[at(x, y)] = tone + Math.sin(x * 0.2 + y) * 0.02 + (y % strip === 0 ? -0.06 : 0);
    }
  }
  for (let i = 0; i < shades.length; i++) shades[i] = Math.min(1, Math.max(0, shades[i]));
  return { size, shades };
}

const textures = new Map<SurfaceTexture, THREE.DataTexture>();

/** One shared texture per surface kind (no DOM needed). */
export function surfaceTexture(kind: SurfaceTexture): THREE.DataTexture {
  const cached = textures.get(kind);
  if (cached) return cached;
  const { size, shades } = surfaceShades(kind);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < shades.length; i++) {
    const v = Math.round(shades[i] * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  textures.set(kind, texture);
  return texture;
}

/**
 * Give a mesh world-space texture coordinates (a box projection on each
 * face's dominant axis), `tile` metres per repeat. Works on a copy of the
 * geometry, so meshes sharing it are not changed.
 */
export function projectWorldUvs(mesh: THREE.Mesh, tile: number) {
  const geometry = mesh.geometry.clone();
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    if (ay >= ax && ay >= az) {
      uv[i * 2] = p.x / tile;
      uv[i * 2 + 1] = p.z / tile;
    } else if (ax >= az) {
      uv[i * 2] = p.z / tile;
      uv[i * 2 + 1] = p.y / tile;
    } else {
      uv[i * 2] = p.x / tile;
      uv[i * 2 + 1] = p.y / tile;
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  mesh.geometry = geometry;
}

/** A material for a finish (the caller shares it per finish key). */
export function finishMaterial(finish: Finish, side: THREE.Side): THREE.Material {
  const map = finish.texture ? surfaceTexture(finish.texture) : null;
  // The tiles average ~0.9; lift the colour back so the surface reads true.
  const color = new THREE.Color(finish.color);
  if (map) color.multiplyScalar(1 / 0.81);
  const material = finish.unlit
    ? new THREE.MeshBasicMaterial({ color, map, side })
    : new THREE.MeshLambertMaterial({ color, map, side });
  material.name = `finish ${finish.key}`;
  return material;
}

/**
 * Soft indoor light: a warm ceiling-and-floor bounce plus one key light from
 * high front-left, the same side the pixel pass rims from. No shadows; the
 * pass's contact shadows do the corners.
 */
export function houseLights(): THREE.Group {
  const rig = new THREE.Group();
  rig.name = "tank house lights";
  const bounce = new THREE.HemisphereLight(0xfff8ee, 0xb8a58c, 2.3);
  const key = new THREE.DirectionalLight(0xfff1dc, 1.25);
  key.position.set(-4, 10, 6);
  rig.add(bounce, key);
  return rig;
}
