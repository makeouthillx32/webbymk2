import { createAdminClient } from "@/utils/supabase/admin";
import type { CameraTelemetryInput, SubjectMode } from "./directorVirtualAtlas";
import { isFollowableSlug } from "./followMember";

export const SUBJECT_MODES = [
  "auto",
  "person",
  "speaker",
  "feet",
  "face",
  "member",
  "motion",
  "crowd",
  "group",
  "animals",
  "dog",
  "cat",
  "chaos",
  "manual",
  "rotation",
  "enroll",
] as const satisfies readonly SubjectMode[];

export function isSubjectMode(value: unknown): value is SubjectMode {
  return (
    typeof value === "string" &&
    (SUBJECT_MODES as readonly string[]).includes(value)
  );
}

// Live detection telemetry, in memory.
//
// This is the link between the 24/7 tank-vision worker and the Director. The
// configuration screen reads these numbers for its monitor; it is not their
// producer and no browser is required to keep them flowing.
//
// Deliberately NOT persisted. Telemetry arrives many times a second, is only
// meaningful for a moment, and is worthless after a restart — writing it to
// Postgres would cost far more than it returns. It shares that reasoning with
// the viewer presence snapshot.

/**
 * How long a reading stays usable. A detector posting at 2-10 Hz refreshes
 * well inside this; anything older than this means the producer has stopped
 * and the director must fall back rather than cut on a stale frame.
 */
export const TELEMETRY_TTL_MS = 4000;

type TelemetryOrigin = "browser" | "server" | "fallback" | "learner";

/**
 * How long the learner's naming stays usable. Longer than a reading's own TTL:
 * a name survives a second of the tracker losing a body, where a whole reading
 * must not.
 */
export const IDENTITY_TTL_MS = 8000;

/**
 * Who the live learner (services/tank-vision-gpu) says is in frame right now.
 *
 * It is kept BESIDE the readings, not inside them, because two producers write
 * this store: the vision worker measures audio, motion and faces at 2-10 Hz,
 * and the learner names bodies from the operator's graded gallery. Recording
 * the learner as an ordinary reading meant whichever posted last won, so
 * identity and audio erased each other in turn -- the same failure the
 * fallback-vs-worker overwrite caused in September. Composed on read instead:
 * the worker keeps owning sound, the learner keeps owning names.
 */
export type IdentityOverlay = {
  at: number;
  boxes: NonNullable<CameraTelemetryInput["boundingBoxes"]>;
  peopleCount: number;
  animalCount: number;
  target: { name: string; confidence: number } | null;
};

const g_identity = new Map<string, IdentityOverlay>();

type StoredTelemetry = {
  telemetry: CameraTelemetryInput;
  receivedAt: number;
  origin: TelemetryOrigin;
};

const g_telemetry = new Map<string, StoredTelemetry>();

/** Subject mode requested by the detector, if it wants to drive the mode too. */
let g_suggestedMode: SubjectMode | null = null;

/**
 * When a SERVER-SIDE detector (tank-vision-worker, via the shared-secret ingest
 * route) last posted.
 *
 * The configuration console displays this as attachment health. It is a
 * timestamp rather than a boolean because a silent/crashed worker must become
 * visibly stale without relying on a browser to notice it.
 */
let g_lastServerPostAt = 0;

export type ServerAppearanceStatus = {
  receivedAt: number;
  signatures: number;
  classes: string[];
  rejected: string[];
  targets: Record<string, number>;
  seed: {
    configured: number;
    existing: number;
    inserted: number;
    ready: boolean;
    byTarget: Record<string, number>;
    error: string | null;
  } | null;
};

let g_serverAppearance: ServerAppearanceStatus | null = null;

/** Store a bounded, non-biometric status snapshot from the private worker. */
export function recordServerAppearanceStatus(
  raw: unknown,
  now = Date.now(),
): void {
  if (!raw || typeof raw !== "object") return;
  const input = raw as Record<string, any>;
  const count = (value: unknown, max = 100_000) => {
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? Math.max(0, Math.min(max, Math.round(parsed)))
      : 0;
  };
  const targetCounts = Object.fromEntries(
    Object.entries(input.targets ?? {})
      .filter(([key]) => /^[a-z0-9_-]{1,64}$/.test(key))
      .slice(0, 64)
      .map(([key, value]) => [key, count(value, 10_000)]),
  );
  const rawSeed =
    input.seed && typeof input.seed === "object" ? input.seed : null;
  g_serverAppearance = {
    receivedAt: now,
    signatures: count(input.signatures),
    classes: Array.isArray(input.classes)
      ? input.classes
          .filter(
            (value: unknown): value is string => typeof value === "string",
          )
          .slice(0, 16)
      : [],
    rejected: Array.isArray(input.rejected)
      ? input.rejected
          .filter(
            (value: unknown): value is string => typeof value === "string",
          )
          .slice(0, 20)
      : [],
    targets: targetCounts,
    seed: rawSeed
      ? {
          configured: count(rawSeed.configured),
          existing: count(rawSeed.existing),
          inserted: count(rawSeed.inserted),
          ready: rawSeed.ready === true,
          byTarget: Object.fromEntries(
            Object.entries(rawSeed.byTarget ?? {})
              .filter(([key]) => /^[a-z0-9_-]{1,64}$/.test(key))
              .slice(0, 64)
              .map(([key, value]) => [key, count(value, 10_000)]),
          ),
          error:
            typeof rawSeed.error === "string"
              ? rawSeed.error.slice(0, 300)
              : null,
        }
      : null,
  };
}

export function getServerAppearanceStatus(
  now = Date.now(),
): ServerAppearanceStatus | null {
  if (
    !g_serverAppearance ||
    now - g_serverAppearance.receivedAt > SERVER_DETECTION_STALE_MS
  )
    return null;
  return g_serverAppearance;
}

/** Grace window before a silent worker is treated as gone. */
export const SERVER_DETECTION_STALE_MS = 15_000;

/** Is a server-side detector currently feeding the director? */
export function isServerDetectionActive(now = Date.now()): boolean {
  return (
    g_lastServerPostAt > 0 &&
    now - g_lastServerPostAt <= SERVER_DETECTION_STALE_MS
  );
}

/**
 * Last database-backed mode seen by this server bundle. The database is the
 * authority; this value is only a short cache so a three-second Director tick
 * does not need a round trip for every consumer in the same process.
 */
let g_operatorMode: SubjectMode | null = null;
// Who Follow Member mode follows. Stored in the same settings row as the mode
// so the two can never be written, or read back, out of step.
let g_followMember: string | null = null;
let g_operatorModeLoadedAt = 0;
let g_operatorModeLoadPromise: Promise<SubjectMode | null> | null = null;
const OPERATOR_MODE_CACHE_MS = 2_000;

/**
 * Rolling audio baseline per camera, as an exponential moving average.
 *
 * Absolute loudness is the wrong signal for "where is something happening".
 * One room being permanently noisy — a game room with audio always blasting —
 * wins every comparison forever, so `speaker` mode pins there and never cuts
 * away. What actually matters is a room being loud *for that room*.
 *
 * The baseline is what this measures against, so a normally-quiet kitchen
 * suddenly at 60 outranks a game room sitting at its usual 85.
 */
const g_audioBaseline = new Map<string, number>();

/** How fast the baseline follows the room. Slow enough to survive a shout. */
const BASELINE_ALPHA = 0.02;

function updateAudioBaseline(cameraId: string, audioPeak: number): void {
  const prev = g_audioBaseline.get(cameraId);
  g_audioBaseline.set(
    cameraId,
    prev === undefined ? audioPeak : prev + BASELINE_ALPHA * (audioPeak - prev),
  );
}

/**
 * How far above its own normal a room currently is, 0-100.
 *
 * Returns the raw level until a baseline has had time to settle, so the
 * director behaves sensibly in the first seconds after a restart rather than
 * treating every room as unremarkable.
 */
export function audioExcess(cameraId: string, audioPeak: number): number {
  const baseline = g_audioBaseline.get(cameraId);
  if (baseline === undefined) return audioPeak;
  return Math.max(0, Math.min(100, (audioPeak - baseline) * 1.5));
}

/**
 * Real-but-approximate activity signal, fed automatically from each
 * camera's own encoded bitrate — no detector required.
 *
 * This remains the zero-cost fallback when the dedicated vision worker is
 * unavailable. It ensures the process can still make conservative cuts from
 * real camera activity without asking an operator's browser to decode feeds.
 *
 * This is not a substitute for real detection — peopleCount, faceCount,
 * feetConfidence and audioPeak all stay honestly at 0 here, so
 * face/feet/speaker-specific scoring gets nothing extra from this path.
 * What it does give, non-fabricated: most encoders spend more bits when a
 * scene has more going on (movement, changing content) than when it's
 * static, so a room's bitrate rising above ITS OWN normal — exactly the
 * same "excess over rolling baseline" trick audioExcess already uses, not
 * an absolute threshold, since a 4K room and a 720p room have nothing in
 * common on raw bitrate — is a real signal for "more is happening here
 * than usual", which is enough to drive motion/crowd/chaos/auto scoring
 * without waiting on the full detection pipeline.
 */
const g_bitrateBaseline = new Map<string, number>();
const BITRATE_BASELINE_ALPHA = 0.05;

export function bitrateDerivedMotionScore(
  cameraId: string,
  bitrateKbps: number,
): number {
  if (!(bitrateKbps > 0)) return 0;
  const prev = g_bitrateBaseline.get(cameraId);
  g_bitrateBaseline.set(
    cameraId,
    prev === undefined
      ? bitrateKbps
      : prev + BITRATE_BASELINE_ALPHA * (bitrateKbps - prev),
  );
  if (prev === undefined) return 0;
  // Anything at or below baseline scores 0; roughly double the baseline
  // saturates at 1. Deliberately gentle (the divisor, not the multiplier)
  // so a single noisy sample doesn't swing the score wildly — the EMA
  // baseline already does most of the smoothing.
  const excessRatio = (bitrateKbps - prev) / Math.max(prev, 1);
  return Math.max(0, Math.min(1, excessRatio));
}

function setOperatorMode(mode: SubjectMode | null): void {
  g_operatorMode = mode;
  g_operatorModeLoadedAt = Date.now();
}

export async function persistOperatorModeToDb(
  mode: SubjectMode | null,
  operator = "Operator",
  /** undefined keeps the current choice; null clears it. */
  followMember?: string | null,
): Promise<void> {
  // Do not let an older in-flight read win the race after this write.
  if (g_operatorModeLoadPromise) {
    await g_operatorModeLoadPromise.catch(() => null);
  }
  const admin = createAdminClient();
  const updatedAt = new Date().toISOString();
  const { error } = await admin.from("tank_platform_settings").upsert(
    {
      key: "director_operator_mode",
      value: {
        mode,
        followMember: followMember === undefined ? g_followMember : followMember,
        operator,
        updatedAt,
      },
      updated_at: updatedAt,
    },
    { onConflict: "key" },
  );

  if (error) {
    throw new Error(`Failed to persist Director mode: ${error.message}`);
  }

  // Never let a failed database write become the process-local truth. Update
  // the cache only after the durable write has succeeded.
  setOperatorMode(mode);
  if (followMember !== undefined) g_followMember = followMember;
}

export async function loadPersistedOperatorModeFromDb(
  force = false,
): Promise<SubjectMode | null> {
  const now = Date.now();
  if (
    !force &&
    g_operatorModeLoadedAt > 0 &&
    now - g_operatorModeLoadedAt < OPERATOR_MODE_CACHE_MS
  ) {
    return g_operatorMode;
  }
  if (g_operatorModeLoadPromise) return g_operatorModeLoadPromise;

  g_operatorModeLoadPromise = (async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tank_platform_settings")
      .select("value")
      .eq("key", "director_operator_mode")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load Director mode: ${error.message}`);
    }

    const storedMode =
      data?.value && typeof data.value === "object"
        ? (data.value as { mode?: unknown }).mode
        : null;

    if (
      storedMode !== null &&
      storedMode !== undefined &&
      !isSubjectMode(storedMode)
    ) {
      throw new Error("Stored Director mode is invalid");
    }

    g_operatorMode = isSubjectMode(storedMode) ? storedMode : null;
    const storedFollow =
      data?.value && typeof data.value === "object"
        ? (data.value as { followMember?: unknown }).followMember
        : null;
    // An unknown slug (a member later removed from the catalog) follows nobody
    // rather than failing the whole director.
    g_followMember = isFollowableSlug(storedFollow) ? storedFollow : null;
    g_operatorModeLoadedAt = Date.now();
    return g_operatorMode;
  })();

  try {
    return await g_operatorModeLoadPromise;
  } finally {
    g_operatorModeLoadPromise = null;
  }
}

export function getOperatorMode(): SubjectMode | null {
  return g_operatorMode;
}

export function getFollowMember(): string | null {
  return g_followMember;
}

/**
 * The mode the director should actually run.
 *
 * Operator selection wins, then the detector's suggestion, then auto. An
 * operator who picks "group" must get group even if the detector is convinced
 * someone is talking.
 */
export function getEffectiveMode(): SubjectMode {
  return g_operatorMode ?? g_suggestedMode ?? "auto";
}

/**
 * Store readings.
 *
 * `fallback` is the director's own bitrate-only stand-in (no people, no boxes).
 * It fills a camera with no fresh detector reading and NEVER replaces one.
 * Until 2026-09-16 it was recorded like any other reading, every 3s tick,
 * straight over the vision worker's detections -- so the director scored
 * every mode on "0 people, no boxes" while the worker's own log showed TYLER in
 * Game Room 2 on every pass. Follow Member could not see anyone.
 */
export function recordTelemetry(
  inputs: CameraTelemetryInput[],
  mode?: SubjectMode | null,
  origin: TelemetryOrigin = "browser",
): number {
  const now = Date.now();
  if (origin === "learner") return recordIdentity(inputs, now);
  if (origin === "server") g_lastServerPostAt = now;
  let stored = 0;
  for (const t of inputs) {
    if (!t || typeof t.cameraId !== "string" || !t.cameraId) continue;
    if (origin === "fallback") {
      const existing = g_telemetry.get(t.cameraId);
      if (existing && existing.origin !== "fallback" && now - existing.receivedAt <= TELEMETRY_TTL_MS) {
        continue;
      }
    }
    g_telemetry.set(t.cameraId, { telemetry: t, receivedAt: now, origin });
    // The fallback's audioPeak is a hard 0, not a measurement. Folding it into
    // the rolling baseline dragged every room's "normal loudness" toward
    // silence and inflated audioExcess for any real reading that followed.
    if (origin !== "fallback") updateAudioBaseline(t.cameraId, t.audioPeak);
    stored += 1;
  }
  if (mode) g_suggestedMode = mode;
  return stored;
}

/** Store what the learner recognises on each camera. */
export function recordIdentity(inputs: CameraTelemetryInput[], now = Date.now()): number {
  let stored = 0;
  for (const t of inputs) {
    if (!t || typeof t.cameraId !== "string" || !t.cameraId) continue;
    g_identity.set(t.cameraId, {
      at: now,
      boxes: t.boundingBoxes ?? [],
      peopleCount: t.peopleCount,
      animalCount: t.animalCount ?? 0,
      target: t.targetMemberDetected
        ? { name: t.targetMemberDetected, confidence: t.targetMemberConfidence ?? 0 }
        : null,
    });
    stored += 1;
  }
  return stored;
}

/** A reading as the director should see it: the worker's, wearing the learner's names. */
export function composeIdentity(
  telemetry: CameraTelemetryInput,
  now = Date.now(),
): CameraTelemetryInput {
  const overlay = g_identity.get(telemetry.cameraId);
  if (!overlay) return telemetry;
  if (now - overlay.at > IDENTITY_TTL_MS) {
    g_identity.delete(telemetry.cameraId);
    return telemetry;
  }
  const { boxes, peopleCount, animalCount } = mergeDetections(telemetry, overlay);
  return {
    ...telemetry,
    peopleCount,
    animalCount,
    boundingBoxes: boxes,
    targetMemberDetected: overlay.target?.name ?? null,
    targetMemberConfidence: overlay.target?.confidence ?? 0,
  };
}

/** Learner boxes with this label mark something it recognised as NOT a body (the rack). */
export const LEARNER_SUPPRESSED_LABEL = "suppressed";

type Box = NonNullable<CameraTelemetryInput["boundingBoxes"]>[number];

function boxIou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.nx + a.nw, b.nx + b.nw) - Math.max(a.nx, b.nx));
  const iy = Math.max(0, Math.min(a.ny + a.nh, b.ny + b.nh) - Math.max(a.ny, b.ny));
  const inter = ix * iy;
  const union = a.nw * a.nh + b.nw * b.nh - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * The learner NAMES bodies; it does not get to un-see them.
 *
 * Its overlay used to replace the worker's boxes and head count outright. The
 * learner looks once a second and needs a steady detection to open a track, so
 * someone walking briskly through the Foyer was often not in its list -- and
 * its "nobody here" erased the worker's sighting. Follow never saw an arrival
 * and stayed glued to the Game Room (2026-09-19). Now: the learner's boxes
 * (with names) win where both saw the same body; worker boxes the learner has
 * no match for stay, unnamed (the learner owns names); boxes over something the
 * learner recognised as not-a-person (the rack) are dropped; counts are the
 * larger of the two.
 */
export function mergeDetections(telemetry: CameraTelemetryInput, overlay: IdentityOverlay): {
  boxes: Box[];
  peopleCount: number;
  animalCount: number;
} {
  const learner = overlay.boxes.filter((b) => b.label !== LEARNER_SUPPRESSED_LABEL);
  const suppressed = overlay.boxes.filter((b) => b.label === LEARNER_SUPPRESSED_LABEL);
  const extra = (telemetry.boundingBoxes ?? [])
    .filter((w) => !suppressed.some((x) => boxIou(w, x) >= 0.3))
    .filter((w) => !learner.some((l) => l.label === w.label && boxIou(w, l) >= 0.3))
    .map((w) => ({ ...w, targetName: undefined }));
  const boxes = [...learner, ...extra];
  const count = (isPerson: boolean) => boxes.filter((b) => (b.label === "person") === isPerson && b.label !== "object").length;
  const workerPeople = Math.max(0, (telemetry.peopleCount ?? 0) - (telemetry.boundingBoxes ?? []).filter((w) => w.label === "person" && suppressed.some((x) => boxIou(w, x) >= 0.3)).length);
  return {
    boxes,
    peopleCount: Math.max(overlay.peopleCount, workerPeople, count(true)),
    animalCount: Math.max(overlay.animalCount, telemetry.animalCount ?? 0),
  };
}

/**
 * A camera the learner can see but no detector is reporting still has people in
 * it. With the worker down this is all the director has, so it is worth a
 * reading of its own -- silent, motionless, but with the bodies named.
 */
function identityOnlyReading(cameraId: string, overlay: IdentityOverlay): CameraTelemetryInput {
  return {
    cameraId,
    peopleCount: overlay.peopleCount,
    animalCount: overlay.animalCount,
    visibleFeetCount: 0,
    feetConfidence: 0,
    faceCount: 0,
    motionScore: 0,
    audioPeak: 0,
    isSpeaking: false,
    boundingBoxes: overlay.boxes.filter((b) => b.label !== LEARNER_SUPPRESSED_LABEL),
    targetMemberDetected: overlay.target?.name ?? null,
    targetMemberConfidence: overlay.target?.confidence ?? 0,
  };
}

/** What the learner currently recognises, for diagnostics. */
export function getIdentityOverlays(now = Date.now()): {
  cameraId: string;
  ageMs: number;
  fresh: boolean;
  names: string[];
  peopleCount: number;
  animalCount: number;
}[] {
  return [...g_identity.entries()]
    .map(([cameraId, overlay]) => ({
      cameraId,
      ageMs: now - overlay.at,
      fresh: now - overlay.at <= IDENTITY_TTL_MS,
      names: [...new Set(overlay.boxes.map((box) => box.targetName).filter((name): name is string => Boolean(name)))],
      peopleCount: overlay.peopleCount,
      animalCount: overlay.animalCount,
    }))
    .sort((a, b) => a.cameraId.localeCompare(b.cameraId));
}

/** Fresh readings only. Expired entries are dropped as they are found. */
export function getFreshTelemetry(now = Date.now()): CameraTelemetryInput[] {
  const out: CameraTelemetryInput[] = [];
  for (const [cameraId, entry] of g_telemetry) {
    if (now - entry.receivedAt > TELEMETRY_TTL_MS) {
      g_telemetry.delete(cameraId);
      continue;
    }
    out.push(composeIdentity(entry.telemetry, now));
  }
  for (const [cameraId, overlay] of g_identity) {
    if (now - overlay.at > IDENTITY_TTL_MS) {
      g_identity.delete(cameraId);
      continue;
    }
    if (!g_telemetry.has(cameraId)) out.push(identityOnlyReading(cameraId, overlay));
  }
  return out;
}

export function getTelemetryFor(
  cameraId: string,
  now = Date.now(),
): CameraTelemetryInput | null {
  const entry = g_telemetry.get(cameraId);
  const overlay = g_identity.get(cameraId);
  const identityFresh = Boolean(overlay) && now - overlay!.at <= IDENTITY_TTL_MS;
  if (!entry || now - entry.receivedAt > TELEMETRY_TTL_MS) {
    if (entry) g_telemetry.delete(cameraId);
    return identityFresh ? identityOnlyReading(cameraId, overlay!) : null;
  }
  return composeIdentity(entry.telemetry, now);
}

export function getSuggestedMode(): SubjectMode | null {
  return g_suggestedMode;
}

/**
 * Whether the director should trust telemetry at all right now.
 *
 * One camera reporting is not enough to run a comparison — scoring picks a
 * winner among rooms, so a single reading would always "win" and pin the cut
 * to whichever camera happens to have a detector attached.
 */
export function hasUsableTelemetry(now = Date.now()): boolean {
  return getFreshTelemetry(now).length >= 2;
}

/**
 * Every stored reading with its age, fresh or not, without evicting anything.
 * For diagnostics only: the director itself must keep using getTelemetryFor.
 */
export function getTelemetrySnapshot(now = Date.now()): {
  cameraId: string;
  ageMs: number;
  fresh: boolean;
  origin: TelemetryOrigin;
  telemetry: CameraTelemetryInput;
}[] {
  return [...g_telemetry.entries()]
    .map(([cameraId, entry]) => ({
      cameraId,
      ageMs: now - entry.receivedAt,
      fresh: now - entry.receivedAt <= TELEMETRY_TTL_MS,
      origin: entry.origin,
      telemetry: entry.telemetry,
    }))
    .sort((a, b) => a.cameraId.localeCompare(b.cameraId));
}

/** Diagnostics for the admin surface: who is reporting, and how stale. */
export function describeTelemetry(now = Date.now()): {
  cameras: { cameraId: string; ageMs: number }[];
  usable: boolean;
  suggestedMode: SubjectMode | null;
  serverDetectionActive: boolean;
  appearance: ServerAppearanceStatus | null;
} {
  const cameras: { cameraId: string; ageMs: number }[] = [];
  for (const [cameraId, entry] of g_telemetry) {
    cameras.push({ cameraId, ageMs: now - entry.receivedAt });
  }
  cameras.sort((a, b) => a.ageMs - b.ageMs);
  return {
    cameras,
    usable: hasUsableTelemetry(now),
    suggestedMode: g_suggestedMode,
    serverDetectionActive: isServerDetectionActive(now),
    appearance: getServerAppearanceStatus(now),
  };
}

/**
 * Coerces one detector reading into the telemetry contract.
 *
 * Everything is clamped and defaulted rather than trusted. A detector sending
 * NaN, a negative count, or a 0-1 audio level where 0-100 was expected would
 * otherwise poison the scoring and swing the live cut. Shared between the
 * shared-secret external-detector route and the staff-authenticated
 * browser-detector route — both feed the same store and must trust their
 * input equally little.
 */
export function normaliseTelemetryReading(
  raw: any,
): CameraTelemetryInput | null {
  if (!raw || typeof raw.cameraId !== "string" || !raw.cameraId) return null;

  const num = (v: unknown, min: number, max: number, fallback = 0): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };

  return {
    cameraId: raw.cameraId.slice(0, 128),
    peopleCount: Math.round(num(raw.peopleCount, 0, 64)),
    visibleFeetCount: Math.round(num(raw.visibleFeetCount, 0, 128)),
    feetConfidence: num(raw.feetConfidence, 0, 1),
    faceCount: Math.round(num(raw.faceCount, 0, 64)),
    // Dropped silently before this: the normalizer builds an explicit shape, so
    // a field it does not name never reaches the director however faithfully
    // the detector reported it. animals mode was left inferring the count from
    // box labels alone.
    animalCount: Math.round(num(raw.animalCount, 0, 64)),
    motionScore: num(raw.motionScore, 0, 1),
    audioPeak: num(raw.audioPeak, 0, 100),
    isSpeaking: Boolean(raw.isSpeaking),
    itemTriggerCount: Math.round(num(raw.itemTriggerCount, 0, 999)),
    targetMemberDetected:
      typeof raw.targetMemberDetected === "string"
        ? raw.targetMemberDetected.slice(0, 64)
        : null,
    targetMemberConfidence: num(raw.targetMemberConfidence, 0, 1),
    depthZone: raw.depthZone,
    quantizedDepthBin: Math.round(num(raw.quantizedDepthBin, 0, 7)),
    depthScalingFactor: num(raw.depthScalingFactor, 0, 1, 1),
    lighting: raw.lighting,
    boundingBoxes: Array.isArray(raw.boundingBoxes)
      ? raw.boundingBoxes.slice(0, 64).map((b: any) => ({
          nx: num(b?.nx, 0, 1),
          ny: num(b?.ny, 0, 1),
          nw: num(b?.nw, 0, 1),
          nh: num(b?.nh, 0, 1),
          label: typeof b?.label === "string" ? b.label.slice(0, 48) : "object",
          depthZone: b?.depthZone,
          // Was dropped here silently — the simulate route stores raw boxes
          // unsanitized (see recordTelemetry), so confidence/targetName only
          // ever worked for simulated boxes and quietly vanished for
          // anything from a real detector routed through this normalizer
          // (the external shared-secret route and the real browser-YOLO
          // route both call this). Same clamp-don't-trust posture as every
          // other field here — just no longer discarding the value outright.
          confidence:
            b?.confidence != null ? num(b.confidence, 0, 1) : undefined,
          isMovement:
            typeof b?.isMovement === "boolean" ? b.isMovement : undefined,
          velocity: b?.velocity != null ? num(b.velocity, 0, 100) : undefined,
          targetName:
            typeof b?.targetName === "string"
              ? b.targetName.slice(0, 48)
              : undefined,
          facing: b?.facing === "front" || b?.facing === "side" || b?.facing === "back" ? b.facing : undefined,
        }))
      : undefined,
  };
}

/** Test seam. */
export function __resetTelemetry(): void {
  g_identity.clear();
  g_telemetry.clear();
  g_suggestedMode = null;
  g_operatorMode = null;
  g_followMember = null;
  g_audioBaseline.clear();
  g_serverAppearance = null;
}
