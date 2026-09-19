import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveDetection,
  type DetectedClass,
} from "../../../src/zones/tank/server/detectionCatalog";
import {
  assignAppearances,
  buildAppearanceSignature,
  similarity,
  type AppearanceMatch,
} from "../../../src/zones/tank/vision/appearance";
import {
  MODEL_SIZE,
  normalizedBoxToModelRect,
} from "../../../src/zones/tank/vision/decode";
import {
  trackMotion,
  type PriorBox,
  type TrackedBox,
} from "../../../src/zones/tank/vision/motion";
import { config } from "./config";
import {
  loadEnrolments,
  type EnrolledByClass,
} from "./enrolment";
import { FramePuller } from "./frameSource";
import { GalleryNamer } from "./galleryNamer";
import {
  PERSON_MATCH_THRESHOLDS,
  PET_SAME_CLASS_THRESHOLDS,
} from "./identityPolicy";
import { loadRoster, type ObservedCamera } from "./roster";
import {
  ensureRuntimeIdentitySeeds,
  failedRuntimeIdentitySeedStatus,
  type RuntimeIdentitySeedStatus,
} from "./runtimeIdentityEnrolment";
import type { VisionSession } from "./session";

/**
 * The house observer: watches every live room continuously and reports what it
 * sees to the director.
 *
 * Two loops, deliberately decoupled:
 *
 *  - INFERENCE round-robins one camera per pass. The wasm session is not
 *    reentrant and a pass costs ~500ms, so sweeping all six concurrently would
 *    only queue them behind each other.
 *
 *  - POSTING sends the whole current set of readings every pass, not just the
 *    camera that was re-inferred. This matters: the store expires a reading
 *    after TELEMETRY_TTL_MS (4s), and six cameras round-robinned at ~600ms is
 *    ~3.6s per cycle — close enough to 4s that any hiccup would make cameras
 *    flicker out of the director's view and the matrix drop tiles. Re-posting
 *    is nearly free; re-inferring is not. Each reading still carries its own
 *    `observedAt` so genuine staleness stays visible rather than being hidden
 *    by the refresh.
 */

const IDENTIFIABLE: ReadonlySet<string> = new Set(["person", "cat", "dog"]);

/** audioPeak (0-100) above which a room counts as "someone is talking". */
const SPEAKING_AUDIO_FLOOR = 35;

/** A capture request handed back by the telemetry response. */
type CaptureRequest = {
  id: string;
  targetSlug: string;
  detectedClass: string;
  cameraId: string;
  mode?: "single" | "burst";
  burstDurationMs?: number;
  burstTargetCount?: number;
  note: string | null;
};

type CaptureResult = {
  id: string;
  status: "captured" | "failed";
  detail: string;
};

/** What FramePuller.takeLatest hands over. Named so captures can pass it around. */
type PulledFrame = {
  rgba: Uint8Array;
  letterbox: Parameters<typeof normalizedBoxToModelRect>[1];
  sourceWidth: number;
  sourceHeight: number;
  capturedAt: number;
};

type Reading = {
  cameraId: string;
  peopleCount: number;
  visibleFeetCount: number;
  feetConfidence: number;
  faceCount: number;
  animalCount: number;
  motionScore: number;
  audioPeak: number;
  isSpeaking: boolean;
  boundingBoxes: Array<TrackedBox & { targetName?: string }>;
  targetMemberDetected: string | null;
  targetMemberConfidence: number;
  /** When the frame behind this reading was captured. Ours, not the store's. */
  observedAt: number;
};

export class HouseObserver {
  private readonly supabase: SupabaseClient;
  private readonly session: VisionSession;
  private pullers = new Map<string, FramePuller>();
  private roster = new Map<string, ObservedCamera>();
  private priors = new Map<string, PriorBox[]>();
  private readings = new Map<string, Reading>();
  // Who the house can recognise, refreshed alongside the camera roster. Empty
  // is the normal starting state and simply means nothing gets named — the
  // system degrades to reporting classes, which is what it did before.
  private enrolled: EnrolledByClass = new Map();
  private enrolledSignatures = 0;
  private enrolledRejected: string[] = [];
  private enrolmentsEverLoaded = false;
  // The most recent inference, per camera, kept solely so an enrolment capture
  // can act on the same frame the operator was looking at. Not used by the
  // detection loop itself — it always takes a fresh frame.
  private lastSeen = new Map<
    string,
    { frame: PulledFrame; boxes: TrackedBox[]; roomScope: string }
  >();
  private captureResults: CaptureResult[] = [];
  private order: string[] = [];
  private cursor = 0;
  private stopping = false;
  private passes = 0;
  private posts = 0;
  private lastPostError: string | null = null;
  private runtimeIdentitySeed: RuntimeIdentitySeedStatus | null = null;
  // Names people from the operator's graded gallery (see galleryNaming.ts).
  // Null when no gallery directory is configured: the histogram path runs as before.
  private readonly namer: GalleryNamer | null;

  constructor(supabase: SupabaseClient, session: VisionSession) {
    this.supabase = supabase;
    this.session = session;
    this.namer = config.galleryDir ? new GalleryNamer(config.galleryDir) : null;
    if (this.namer) console.log(`[tank-vision] people named from the graded gallery: ${this.namer.summary}`);
  }

  async syncRoster(): Promise<void> {
    let cameras: ObservedCamera[];
    try {
      cameras = await loadRoster(this.supabase);
    } catch (error) {
      // Keep watching what we already have. Tearing down every puller because
      // one roster read failed would blind the house over a transient blip.
      console.warn(`[tank-vision] roster refresh failed: ${message(error)}`);
      return;
    }

    const wanted = new Set(cameras.map((c) => c.cameraId));

    for (const [cameraId, puller] of this.pullers) {
      if (wanted.has(cameraId)) continue;
      puller.stop();
      this.pullers.delete(cameraId);
      this.roster.delete(cameraId);
      this.priors.delete(cameraId);
      this.readings.delete(cameraId);
      // Holds a full 640x640 RGBA buffer — ~1.6MB per camera. Dropping it with
      // the puller keeps a long-lived worker from accumulating frames for
      // cameras that were retired hours ago.
      this.lastSeen.delete(cameraId);
      console.log(`[tank-vision] stopped watching ${cameraId}`);
    }

    for (const camera of cameras) {
      this.roster.set(camera.cameraId, camera);
      const existing = this.pullers.get(camera.cameraId);
      if (existing) {
        existing.retarget(camera.hlsUrl);
        continue;
      }
      const puller = new FramePuller(camera.cameraId, camera.hlsUrl);
      this.pullers.set(camera.cameraId, puller);
      void puller.start();
      console.log(
        `[tank-vision] watching ${camera.cameraId} (${camera.name}) in ${camera.roomScope}` +
          ` [${camera.rung} rung]`,
      );
    }

    this.order = [...this.pullers.keys()].sort();
    if (this.cursor >= this.order.length) this.cursor = 0;

    await this.syncEnrolments();
  }

  /**
   * Refresh who the house can recognise.
   *
   * Rides the roster cycle rather than having its own timer: enrolments change
   * when an operator captures one, which is rare, and a stale roster for one
   * cycle only costs a newly enrolled person a few seconds of anonymity.
   *
   * A failed read KEEPS the previous roster. Emptying it would silently strip
   * every name off the stream on a transient DB blip, and "nobody is named" is
   * indistinguishable from "nobody is enrolled" on screen — exactly the kind of
   * quiet degradation that goes unnoticed for days.
   */
  private async syncEnrolments(): Promise<void> {
    try {
      if (!this.runtimeIdentitySeed?.ready) {
        try {
          this.runtimeIdentitySeed = await ensureRuntimeIdentitySeeds(
            this.supabase,
          );
          console.log(
            `[tank-vision] runtime identity seed ready: ${this.runtimeIdentitySeed.configured} signature(s), ` +
              `${this.runtimeIdentitySeed.inserted} inserted`,
          );
        } catch (error) {
          this.runtimeIdentitySeed = failedRuntimeIdentitySeedStatus(error);
          console.warn(
            `[tank-vision] runtime identity seed unavailable: ${message(error)}`,
          );
        }
      }
      const result = await loadEnrolments(this.supabase);
      // Always report the FIRST load, even when it finds nothing. An empty
      // roster and a roster that failed to load look identical on the stream —
      // every box unnamed — so startup has to say which one happened, or the
      // most likely failure in this feature is also its most invisible one.
      const changed =
        !this.enrolmentsEverLoaded ||
        result.signatures !== this.enrolledSignatures ||
        result.rejected.length !== this.enrolledRejected.length;
      this.enrolmentsEverLoaded = true;
      this.enrolled = result.byClass;
      this.enrolledSignatures = result.signatures;
      this.enrolledRejected = result.rejected;

      if (changed) {
        const roster = [...result.byClass.entries()]
          .map(
            ([cls, people]) =>
              `${cls}:${people.map((p) => p.slug).join("/") || "none"}`,
          )
          .join(" ");
        console.log(
          `[tank-vision] appearance roster: ${result.signatures} signature(s) ${roster || "(empty)"}`,
        );
        // Rejections are logged every time they change because each one is a
        // person who will silently never be named.
        for (const reason of result.rejected) {
          console.warn(`[tank-vision] enrolment rejected — ${reason}`);
        }
      }
    } catch (error) {
      console.warn(`[tank-vision] enrolment refresh failed: ${message(error)}`);
    }
  }

  /** One inference pass: re-infer the next camera in the rotation. */
  async inferNext(): Promise<void> {
    if (this.order.length === 0) return;
    const cameraId = this.order[this.cursor % this.order.length];
    this.cursor = (this.cursor + 1) % this.order.length;

    const puller = this.pullers.get(cameraId);
    const camera = this.roster.get(cameraId);
    if (!puller || !camera) return;

    const frame = puller.takeLatest();
    if (!frame) {
      // No usable frame: drop the reading rather than letting the director keep
      // steering toward a room nobody can currently see into.
      if (this.readings.delete(cameraId)) {
        console.warn(
          `[tank-vision] ${cameraId} has no fresh frame; reading withdrawn`,
        );
      }
      return;
    }

    let detections;
    try {
      detections = await this.session.infer(
        frame.rgba,
        frame.letterbox,
        frame.sourceWidth,
        frame.sourceHeight,
      );
    } catch (error) {
      console.warn(
        `[tank-vision] inference failed for ${cameraId}: ${message(error)}`,
      );
      return;
    }

    const now = Date.now();
    const { boxes, nextPriors } = trackMotion(
      detections,
      this.priors.get(cameraId) ?? [],
      now,
    );
    this.priors.set(cameraId, nextPriors);
    this.lastSeen.set(cameraId, { frame, boxes, roomScope: camera.roomScope });

    // Tier 2: name the individual where the room narrows it to exactly one.
    // resolveDetection refuses to guess, so an unnamed box is an honest box.
    let bestMember: string | null = null;
    let bestMemberConfidence = 0;
    // How many of each class are in frame. The resolver needs this: one
    // enrolment cannot be attributed across two bodies, and labelling both
    // "JOE" because the room is Joe's is a confident falsehood.
    const classCounts = new Map<string, number>();
    for (const box of boxes) {
      classCounts.set(box.label, (classCounts.get(box.label) ?? 0) + 1);
    }
    // Appearance: the only evidence in the system about WHICH body this is.
    // Cut each subject's crop from the very frame it was detected in and score
    // it against the enrolled roster for its own class.
    const appearance = this.matchFrame(boxes, frame);
    // People: the graded gallery, when loaded. It answers from memory at once
    // and looks again on its own thread, so this never waits on the model.
    const gallery =
      this.namer?.active
        ? this.namer.nameFrame(cameraId, boxes, frame.rgba, MODEL_SIZE, MODEL_SIZE, (box) =>
            normalizedBoxToModelRect(box, frame.letterbox, frame.sourceWidth, frame.sourceHeight),
          )
        : null;

    const named: Array<TrackedBox & { targetName?: string }> = [];
    boxes.forEach((box, index) => {
      if (gallery && box.label === "person") {
        const verdict = gallery.get(index);
        // The rack, the jacket: recognised as not a person, kept out of the
        // director's view and out of the head count.
        if (verdict?.notAPerson) return;
        if (verdict?.name) {
          if (verdict.margin > bestMemberConfidence || bestMember === null) {
            bestMember = verdict.name;
            bestMemberConfidence = Math.min(1, verdict.margin);
          }
          named.push({ ...box, targetName: verdict.name });
        } else {
          named.push(box);
        }
        return;
      }
      named.push(nameByHistogram(box, index));
    });

    const roomScope = camera.roomScope;
    function nameByHistogram(box: TrackedBox, index: number): TrackedBox & { targetName?: string } {
        if (!IDENTIFIABLE.has(box.label)) return box;
        const match = appearance.get(String(index)) ?? null;
        const resolution = resolveDetection(box.label as DetectedClass, {
          roomKey: roomScope,
          subjectCount: classCounts.get(box.label) ?? 1,
          appearanceSlug: match?.slug ?? null,
        });
        // Detector confidence answers "is this a person?". It says nothing about
        // WHICH person this is. Reporting box.confidence as identity confidence
        // made a very clear generic person box look like a very clear TYLER
        // match even when the appearance evidence was marginal. Only the
        // appearance score is identity evidence.
        if (
          resolution.target &&
          box.label === "person" &&
          match &&
          match.score > bestMemberConfidence
        ) {
          bestMember = resolution.target.slug;
          bestMemberConfidence = match.score;
        }
        return resolution.target
          ? { ...box, targetName: resolution.label }
          : box;
    }

    const people = named.filter((b) => b.label === "person");
    const peopleCount = people.length;
    const audioPeak = puller.audioLevel();

    // Fields the DIRECTOR MODES score on, which nothing was producing.
    //
    // feet / face / animals / chaos all read telemetry the worker never sent,
    // so with the browser detector stood down they scored zero everywhere and
    // effectively stopped working. YOLOv8n gives boxes, not keypoints or faces,
    // so these are geometric proxies — stated plainly rather than dressed up as
    // pose or face detection:
    //
    //  visibleFeetCount — a person whose box bottom is INSIDE the frame is
    //    standing fully in view, so their feet are visible. A box clipped by
    //    the bottom edge is someone cut off at the knees. That is exactly the
    //    distinction feet mode wants, and the ground-contact point is the same
    //    one the floor tracker uses.
    //  feetConfidence — mean detector confidence across those unclipped people.
    //  faceCount — people large enough in frame for a face to be resolvable.
    //    A person occupying under ~6% of frame height is a smudge, not a face.
    //  animalCount — cats plus dogs, so animals mode stops depending on the
    //    stale hardcoded pet-name list in calculateCameraScore.
    const BOTTOM_EDGE = 0.985;
    const FACE_MIN_HEIGHT = 0.06;
    const feetVisible = people.filter((b) => b.ny + b.nh < BOTTOM_EDGE);
    const visibleFeetCount = feetVisible.length;
    const feetConfidence = feetVisible.length
      ? feetVisible.reduce((sum, b) => sum + b.confidence, 0) /
        feetVisible.length
      : 0;
    const faceCount = people.filter((b) => b.nh >= FACE_MIN_HEIGHT).length;
    const animalCount = named.filter(
      (b) => b.label === "cat" || b.label === "dog",
    ).length;
    const motionScore = named.length
      ? Math.min(1, Math.max(...named.map((b) => b.velocity)) / 0.5)
      : 0;

    this.readings.set(cameraId, {
      cameraId,
      peopleCount,
      motionScore: Number(motionScore.toFixed(3)),
      // Metered from the camera's own AAC track via ebur128 (see
      // frameSource.audioLevel). This was hardcoded to 0, which left `speaker`
      // mode unable to tell a silent room from one where someone was talking —
      // the mode scored identically everywhere and effectively did not work.
      audioPeak,
      // Momentary loudness above a conversational floor. Deliberately not a
      // voice-activity detector: it cannot tell speech from a television, and
      // claiming otherwise would put a confident wrong label on the shot.
      isSpeaking: audioPeak >= SPEAKING_AUDIO_FLOOR,
      visibleFeetCount,
      feetConfidence: Number(feetConfidence.toFixed(3)),
      faceCount,
      animalCount,
      boundingBoxes: named,
      targetMemberDetected: bestMember,
      targetMemberConfidence: Number(bestMemberConfidence.toFixed(3)),
      observedAt: frame.capturedAt,
    });

    this.passes += 1;
    if (config.logDetections && named.length > 0) {
      const summary = named
        .map(
          (b) =>
            `${b.targetName ?? b.label.toUpperCase()}@${b.confidence.toFixed(2)}`,
        )
        .join(", ");
      // Audio in the line because it is otherwise invisible: it reaches the
      // director as a number nothing prints, so a silently-broken meter would
      // look exactly like a silent house.
      const audio = `aud:${audioPeak}${audioPeak >= SPEAKING_AUDIO_FLOOR ? "*" : ""}`;
      console.log(`[tank-vision] ${camera.roomScope}: ${summary} [${audio}]`);
    }
  }

  /**
   * Name the subjects in one frame from how they look.
   *
   * Boxes are keyed by their index in this frame's array — an identity that is
   * meaningful only for the length of this call, which is exactly the scope
   * assignAppearances arbitrates over (one person cannot be in two places in a
   * single frame).
   *
   * Note what is NOT done here: no cross-frame smoothing, no memory of who was
   * named last pass. A name that flickers is telling the truth about weak
   * evidence, and papering over it with hysteresis would convert a visible
   * problem into a confident wrong answer that persists.
   */
  private matchFrame(
    boxes: readonly TrackedBox[],
    frame: PulledFrame,
  ): Map<string, AppearanceMatch> {
    if (this.enrolledSignatures === 0) return new Map();

    // Matching stays inside the detector class. This preserves the useful
    // information YOLO supplied and enforces the product invariant that
    // person, cat, and dog identity pools never cross.
    const byClass = new Map<
      string,
      Array<{
        key: string;
        signature: ReturnType<typeof buildAppearanceSignature>;
      }>
    >();
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (!IDENTIFIABLE.has(box.label)) continue;
      if (!this.enrolled.has(box.label)) continue;

      const rect = normalizedBoxToModelRect(
        box,
        frame.letterbox,
        frame.sourceWidth,
        frame.sourceHeight,
      );
      // The frame buffer IS the padded model input, so the crop is read in
      // MODEL_SIZE space. Using the source dimensions here would index past the
      // end of the array on any camera larger than 640px.
      const signature = buildAppearanceSignature(
        { rgba: frame.rgba, width: MODEL_SIZE, height: MODEL_SIZE },
        rect,
      );

      const list = byClass.get(box.label) ?? [];
      list.push({ key: String(i), signature });
      byClass.set(box.label, list);
    }

    const assigned = new Map<string, AppearanceMatch>();
    const takenSlugs = new Set<string>();
    for (const [cls, probes] of byClass) {
      const roster = this.enrolled.get(cls);
      if (!roster?.length) continue;
      const thresholds =
        cls === "person" ? PERSON_MATCH_THRESHOLDS : PET_SAME_CLASS_THRESHOLDS;
      for (const [key, match] of assignAppearances(
        probes,
        roster,
        thresholds,
      )) {
        if (takenSlugs.has(match.slug)) continue;
        assigned.set(key, match);
        takenSlugs.add(match.slug);
      }
    }

    return assigned;
  }

  /**
   * Enrol what one person looks like, from the worker's own decoded frame.
   *
   * THE RULE: exactly one subject of that class must be in frame. Not "pick the
   * biggest", not "pick the most confident" — exactly one, or nothing is
   * captured.
   *
   * This looks strict and is the most important decision in the whole feature.
   * An enrolment is the ground truth every later comparison is measured
   * against, so capturing the wrong body does not produce one bad frame — it
   * permanently teaches the house that Malia looks like Joe, and every
   * subsequent mis-naming traces back to a click nobody remembers making. With
   * two people in shot there is no evidence available to this process about
   * which one the operator meant; the operator's own screen is a second behind
   * and their click carries no pixels. Refusing costs them a moment of standing
   * alone. Guessing costs a roster that has to be torn down to debug.
   *
   * The same reasoning rejects a crop too small to read: buildAppearanceSignature
   * declines, and a declined enrolment is better than one built from a smudge
   * that will later match everybody.
   */
  private async runCapture(request: CaptureRequest): Promise<CaptureResult> {
    const isBurst = request.mode === "burst";
    const targetCount = isBurst
      ? Math.min(6, Math.max(2, request.burstTargetCount ?? 4))
      : 1;
    const durationMs = isBurst
      ? Math.min(6000, Math.max(1000, request.burstDurationMs ?? 3000))
      : 0;
    const intervalMs = isBurst
      ? Math.max(300, Math.floor(durationMs / targetCount))
      : 0;

    const collectedSignatures: Array<{
      signature: readonly number[];
      confidence: number;
      roomScope: string;
    }> = [];

    const startTime = Date.now();
    let lastFrameTime = 0;

    while (collectedSignatures.length < targetCount) {
      const seen = this.lastSeen.get(request.cameraId);
      if (!seen) {
        if (collectedSignatures.length === 0) {
          return {
            id: request.id,
            status: "failed",
            detail: `No recent frame for ${request.cameraId} — the worker may not be watching this camera.`,
          };
        }
        break;
      }

      const frameAge = Date.now() - seen.frame.capturedAt;
      if (
        frameAge <= config.frameStaleMs &&
        seen.frame.capturedAt !== lastFrameTime
      ) {
        lastFrameTime = seen.frame.capturedAt;
        const subjects = seen.boxes.filter(
          (b) => b.label === request.detectedClass,
        );

        if (subjects.length === 1) {
          const subject = subjects[0];
          const rect = normalizedBoxToModelRect(
            subject,
            seen.frame.letterbox,
            seen.frame.sourceWidth,
            seen.frame.sourceHeight,
          );
          const signature = buildAppearanceSignature(
            { rgba: seen.frame.rgba, width: MODEL_SIZE, height: MODEL_SIZE },
            rect,
          );

          if (signature) {
            // Check diversity: is this frame sufficiently distinct from already collected ones?
            const isDiverse = collectedSignatures.every(
              (prev) => similarity(signature, prev.signature) < 0.96,
            );
            if (isDiverse || collectedSignatures.length === 0) {
              collectedSignatures.push({
                signature: [...signature],
                confidence: subject.confidence,
                roomScope: seen.roomScope,
              });
            }
          }
        }
      }

      if (
        !isBurst ||
        collectedSignatures.length >= targetCount ||
        Date.now() - startTime >= durationMs
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    if (collectedSignatures.length === 0) {
      const seen = this.lastSeen.get(request.cameraId);
      const count =
        seen?.boxes.filter((b) => b.label === request.detectedClass).length ??
        0;
      if (count === 0) {
        return {
          id: request.id,
          status: "failed",
          detail: `No ${request.detectedClass} in frame on this camera.`,
        };
      }
      if (count > 1) {
        return {
          id: request.id,
          status: "failed",
          detail: `${count} ${request.detectedClass}s in frame — enrolment needs exactly one to avoid capturing wrong subject.`,
        };
      }
      return {
        id: request.id,
        status: "failed",
        detail:
          "Subject was too small in frame or frame was stale — move closer to camera.",
      };
    }

    for (let i = 0; i < collectedSignatures.length; i++) {
      const item = collectedSignatures[i];
      const noteLabel =
        collectedSignatures.length > 1
          ? `${request.note || "Walk burst"} [shot ${i + 1}/${collectedSignatures.length}]`
          : request.note;

      const { error } = await this.supabase
        .from("tank_appearance_enrolment")
        .insert({
          target_slug: request.targetSlug,
          signature: item.signature,
          signature_length: item.signature.length,
          camera_id: request.cameraId,
          room_scope: item.roomScope,
          source_confidence: item.confidence,
          note: noteLabel,
        });
      if (error) {
        return {
          id: request.id,
          status: "failed",
          detail: `Write failed: ${error.message}`,
        };
      }
    }

    await this.syncEnrolments();

    const room = collectedSignatures[0].roomScope;
    const detail =
      collectedSignatures.length > 1
        ? `Captured ${collectedSignatures.length} multi-angle signatures across 3s walk in ${room}.`
        : `Captured from ${room} at ${collectedSignatures[0].confidence.toFixed(2)} confidence.`;

    console.log(
      `[tank-vision] enrolled ${request.targetSlug} from ${request.cameraId} (${detail})`,
    );

    return {
      id: request.id,
      status: "captured",
      detail,
    };
  }

  /** Push every current reading, refreshing the store's TTL for all of them. */
  async postReadings(): Promise<void> {
    const cameras = [...this.readings.values()].filter(
      (r) => Date.now() - r.observedAt <= config.frameStaleMs,
    );
    if (cameras.length === 0) return;

    // Results from the previous pass's captures ride up with this post, and are
    // put BACK on the queue if the post fails. recordOutcome is keyed by request
    // id, so a result delivered twice is idempotent — whereas a result dropped
    // once leaves the operator staring at a spinner for a capture that actually
    // succeeded.
    const captureResults = this.captureResults;
    this.captureResults = [];

    try {
      const response = await fetch(
        `${config.tankBaseUrl}/api/tank/director/telemetry`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tank-ingest-secret": config.ingestSecret,
          },
          body: JSON.stringify({
            cameras,
            captureResults,
            appearance: this.describe().appearance,
          }),
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} ${(await response.text()).slice(0, 200)}`,
        );
      }
      this.posts += 1;
      this.lastPostError = null;

      // Enrolment requests come back on the response. Running them here rather
      // than in the inference loop keeps a slow DB write off the path that
      // feeds the director.
      const body = (await response.json().catch(() => null)) as {
        captures?: CaptureRequest[];
      } | null;
      for (const request of body?.captures ?? []) {
        if (!request?.id || !request.targetSlug || !request.cameraId) continue;
        try {
          this.captureResults.push(await this.runCapture(request));
        } catch (error) {
          this.captureResults.push({
            id: request.id,
            status: "failed",
            detail: message(error),
          });
        }
      }
    } catch (error) {
      this.captureResults.unshift(...captureResults);
      const text = message(error);
      // Only log a change, so a tank restart does not fill the log with one
      // identical line per pass.
      if (text !== this.lastPostError) {
        console.warn(`[tank-vision] telemetry post failed: ${text}`);
        this.lastPostError = text;
      }
    }
  }

  describe() {
    return {
      workerId: config.workerId,
      watching: this.order.length,
      passes: this.passes,
      posts: this.posts,
      lastPostError: this.lastPostError,
      // Surfaced so "nobody is being named" can be told apart from "nobody is
      // enrolled" without reading logs. Those look identical on the stream.
      appearance: {
        signatures: this.enrolledSignatures,
        classes: [...this.enrolled.keys()].sort(),
        rejected: this.enrolledRejected,
        targets: Object.fromEntries(
          [...this.enrolled.values()]
            .flat()
            .filter(
              (entry, index, all) =>
                all.findIndex((candidate) => candidate.slug === entry.slug) ===
                index,
            )
            .map((entry) => [entry.slug, entry.signatures.length]),
        ),
        seed: this.runtimeIdentitySeed,
      },
      cameras: [...this.pullers.values()].map((p) => p.stats),
    };
  }

  stop() {
    this.stopping = true;
    for (const puller of this.pullers.values()) puller.stop();
    this.pullers.clear();
    this.readings.clear();
    this.lastSeen.clear();
  }

  get stopped() {
    return this.stopping;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
