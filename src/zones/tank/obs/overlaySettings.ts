// src/zones/tank/obs/overlaySettings.ts
// ─────────────────────────────────────────────────────────────────────────────
// Deciding what an overlay setting actually IS, given three possible answers.
//
//     query parameter  >  stored setting  >  built-in default
//
// WHY THE URL STILL WINS. Storage exists so a browser source can be pasted into
// OBS once and reconfigured from the console afterwards — that is the whole
// point. But every URL already pasted into OBS carries its settings in the
// query string, and if storage outranked them, the first time anyone saved in
// the console every existing scene would silently change. So the query string
// keeps its authority and storage becomes the new DEFAULT layer.
//
// That also leaves a genuine escape hatch: a second source that must not follow
// the shared configuration (a different caption on an alternate scene) just
// sets the parameter explicitly and is immune.
//
// The cost, stated plainly: a setting pinned in a URL cannot be changed from the
// console, and nothing on screen says so. `explain()` exists for exactly that —
// the workshop uses it to tell the operator which of their edits are being
// overridden rather than letting them wonder why nothing happened.
// ─────────────────────────────────────────────────────────────────────────────

export type OverlaySettingValue = string | number | boolean;
export type OverlaySettings = Record<string, OverlaySettingValue>;

/** Just enough of URLSearchParams to be testable without a DOM. */
export type ParamSource = { get(name: string): string | null };

export type ResolvedSource = "query" | "stored" | "default";

export type Resolved<T> = { value: T; from: ResolvedSource };

function readParam(params: ParamSource | null | undefined, key: string): string | null {
  if (!params) return null;
  const raw = params.get(key);
  return raw === null ? null : raw;
}

/**
 * A boolean that is ON unless explicitly switched off.
 *
 * Every visibility flag in this system is read as `!== "0"`, so ABSENCE MEANS
 * ON. That asymmetry is the single most common way these overlays get
 * misconfigured — `hud` dropped from a URL does not disable the HUD, it enables
 * it — and it is why this lives in one function instead of being re-typed.
 */
export function resolveBoolean(
  key: string,
  params: ParamSource | null | undefined,
  stored: OverlaySettings | null | undefined,
  fallback: boolean,
): Resolved<boolean> {
  const raw = readParam(params, key);
  if (raw !== null) {
    const off = raw === "0" || raw.toLowerCase() === "false" || raw.toLowerCase() === "off";
    return { value: !off, from: "query" };
  }
  const stored_ = stored?.[key];
  if (typeof stored_ === "boolean") return { value: stored_, from: "stored" };
  return { value: fallback, from: "default" };
}

/** Free text, where empty and whitespace mean "not set" rather than "set to nothing". */
export function resolveText(
  key: string,
  params: ParamSource | null | undefined,
  stored: OverlaySettings | null | undefined,
  fallback: string | null = null,
): Resolved<string | null> {
  const raw = readParam(params, key);
  if (raw !== null && raw.trim()) return { value: raw.trim(), from: "query" };
  const stored_ = stored?.[key];
  if (typeof stored_ === "string" && stored_.trim()) {
    return { value: stored_.trim(), from: "stored" };
  }
  return { value: fallback, from: "default" };
}

/** A number, clamped. Non-numeric input falls through rather than becoming NaN. */
export function resolveNumber(
  key: string,
  params: ParamSource | null | undefined,
  stored: OverlaySettings | null | undefined,
  fallback: number,
  min: number,
  max: number,
): Resolved<number> {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const raw = readParam(params, key);
  if (raw !== null) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return { value: clamp(parsed), from: "query" };
  }
  const stored_ = stored?.[key];
  if (typeof stored_ === "number" && Number.isFinite(stored_)) {
    return { value: clamp(stored_), from: "stored" };
  }
  return { value: clamp(fallback), from: "default" };
}

/**
 * Which of these keys are pinned by the URL, and therefore cannot be changed
 * from the console.
 *
 * Surfaced in the workshop so an operator editing a caption that a URL has
 * already fixed is told, instead of saving into a void and concluding the
 * feature is broken.
 */
export function overriddenByQuery(
  keys: readonly string[],
  params: ParamSource | null | undefined,
): string[] {
  if (!params) return [];
  return keys.filter((key) => {
    const raw = params.get(key);
    return raw !== null && raw.trim() !== "";
  });
}

/** Drop anything that is not a settings-shaped scalar. Storage is not a schema. */
export function sanitizeSettings(input: unknown): OverlaySettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: OverlaySettings = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    }
    // Anything else — null, nested objects, NaN — is ignored rather than
    // rejected, so a row written by a newer deploy cannot break an older one.
  }
  return out;
}
