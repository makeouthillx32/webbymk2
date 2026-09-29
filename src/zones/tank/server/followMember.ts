import { INITIAL_DETECTION_CATALOG } from "./detectionCatalog";
import type { CameraTelemetryInput } from "./directorVirtualAtlas";
import { isPointInPolygon, type Point2D } from "../vision/portalGeometry";

// Follow Member: the operator picks one housemate or pet, and the director
// stays on whichever room that member is in.
//
// WHAT THIS RELIES ON, stated plainly: the detector's per-box names are only
// trustworthy in rooms well covered by enrolment. First live walk, 2026-09-16:
// Tyler was named correctly in Game Room 2, called "JOE" 74 times in the Foyer
// and Makeup Room, and not named at all in the Kitchen and Living Room. A name
// is therefore treated as a way to FIND the member, and continuity -- the body
// on programme walking out of one room and into another -- as the way to KEEP
// them.

export type FollowableMember = {
  slug: string;
  displayName: string;
  kind: "person" | "pet";
};

export const FOLLOWABLE_MEMBERS: FollowableMember[] = INITIAL_DETECTION_CATALOG
  .filter((t) => t.category === "house_member" || t.category === "pet_animal")
  .map((t) => ({
    slug: t.slug,
    displayName: t.displayName.charAt(0) + t.displayName.slice(1).toLowerCase(),
    kind: t.category === "pet_animal" ? "pet" : "person",
  }));

// Guests are followable too once the house knows them: an enrolled guest the
// director could name but never follow would make enrollment pointless. Their
// slugs live in the database, not the catalog, so they are recognised by shape.
// Kept free of server imports: the configurator's picker imports this file.
const GUEST_SLUG = /^guest-((?:[1-9][0-9]{0,2})|(?:[a-z][a-z0-9-]{0,23}))$/;

export function isGuestFollowSlug(value: unknown): value is string {
  return typeof value === "string" && GUEST_SLUG.test(value);
}

export function isFollowableSlug(value: unknown): value is string {
  return typeof value === "string" && (FOLLOWABLE_MEMBERS.some((m) => m.slug === value) || GUEST_SLUG.test(value));
}

export function guestFollowName(slug: string): string {
  const match = GUEST_SLUG.exec(slug);
  if (!match) return slug;
  if (/^[0-9]+$/.test(match[1])) return `Guest ${match[1]}`;
  return match[1].split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function followDisplayName(slug: string): string {
  return FOLLOWABLE_MEMBERS.find((m) => m.slug === slug)?.displayName ?? (GUEST_SLUG.test(slug) ? guestFollowName(slug) : slug);
}

/** The catalog's members plus every guest the house has confirmed. */
export function followableWithGuests(guests: string[]): Array<FollowableMember & { guest?: boolean }> {
  return [
    ...FOLLOWABLE_MEMBERS,
    ...guests.filter(isGuestFollowSlug).map((slug) => ({ slug, displayName: guestFollowName(slug), kind: "person" as const, guest: true })),
  ];
}

export type MemberPresence = {
  present: boolean;
  /** Identity confidence where the detector reported one, else detector confidence. */
  confidence: number;
  /** Largest matching box, as a fraction of the frame. A bigger box is a better shot. */
  boxArea: number;
  /** Which side of the member that box shows, when the learner could tell. */
  facing?: Facing;
};

const NOT_PRESENT: MemberPresence = { present: false, confidence: 0, boxArea: 0 };

type Facing = "front" | "side" | "back";

/**
 * Two cameras on one room face each other, so the same body is a front on one
 * and a back or a side on the other. The front is the shot. Unknown ranks with
 * side: no pose reading must not lose to a known back or beat a known front.
 */
export function facingRank(facing: Facing | undefined): number {
  return facing === "front" ? 2 : facing === "back" ? 0 : 1;
}

type Reading = Pick<CameraTelemetryInput, "boundingBoxes" | "targetMemberDetected" | "targetMemberConfidence"> & {
  peopleCount?: number;
};

/**
 * Is `slug` in this camera's latest reading?
 *
 * Boxes are checked first: the worker names every box it can, but reports only
 * one `targetMemberDetected` per camera -- the single strongest person match.
 * With Tyler and Malia in the same kitchen, the per-camera field can only ever
 * say one of them, so relying on it would lose whoever scored second.
 */
export function memberPresence(telemetry: Reading, slug: string): MemberPresence {
  const wanted = new Set([slug.toLowerCase(), followDisplayName(slug).toLowerCase()]);
  let best: MemberPresence = NOT_PRESENT;

  for (const box of telemetry.boundingBoxes ?? []) {
    const name = box.targetName?.trim().toLowerCase();
    if (!name || !wanted.has(name)) continue;
    const area = Math.max(0, box.nw) * Math.max(0, box.nh);
    if (area > best.boxArea) {
      best = { present: true, confidence: box.confidence ?? 0, boxArea: area, facing: box.facing };
    }
  }

  if (telemetry.targetMemberDetected?.trim().toLowerCase() === slug.toLowerCase()) {
    return {
      present: true,
      confidence: telemetry.targetMemberConfidence ?? best.confidence,
      boxArea: best.boxArea,
      facing: best.facing,
    };
  }
  return best;
}

type BodyBox = NonNullable<Reading["boundingBoxes"]>[number];

/**
 * Could this box be the followed member? Right kind of body, and not named as a
 * COMPANION -- someone who was in this room at the same time as the member.
 * Malia at her desk beside Tyler is provably not Tyler: counting her as "the
 * followed body is still here" held the shot on her the whole time Tyler was
 * in the kitchen (live walk, 2026-09-19). Any other name is not proof: on the
 * first walk the detector called Tyler "JOE" in the Foyer, and that body was him.
 */
function couldBeMember(box: BodyBox, kind: "person" | "pet", notHim: Set<string> | null): boolean {
  if ((kind === "person") !== (box.label === "person")) return false;
  const name = box.targetName?.trim().toLowerCase();
  return !notHim || !name || !notHim.has(name);
}

/** Largest box that could be the member (see couldBeMember); any of the class without `wanted`. */
function largestBody(telemetry: Reading, kind: "person" | "pet", notHim: Set<string> | null = null): BodyBox | null {
  let best: BodyBox | null = null;
  let bestArea = 0;
  for (const box of telemetry.boundingBoxes ?? []) {
    if (!couldBeMember(box, kind, notHim)) continue;
    const area = Math.max(0, box.nw) * Math.max(0, box.nh);
    if (area > bestArea) {
      best = box;
      bestArea = area;
    }
  }
  return best;
}

function largestBodyArea(telemetry: Reading, kind: "person" | "pet", notHim: Set<string> | null = null): number {
  const box = largestBody(telemetry, kind, notHim);
  return box ? Math.max(0, box.nw) * Math.max(0, box.nh) : 0;
}

/**
 * Is there a body here that could be the member? With boxes, only an unnamed
 * body or one named as them counts; a reading with a head count but no boxes
 * falls back to the count.
 */
function holdsMember(telemetry: Reading, kind: "person" | "pet", notHim: Set<string>): boolean {
  const boxes = (telemetry.boundingBoxes ?? []).filter((b) => (kind === "person") === (b.label === "person"));
  if (boxes.length === 0) return (telemetry.peopleCount ?? 0) > 0 && kind === "person";
  return boxes.some((b) => couldBeMember(b, kind, notHim));
}

/** Names on the other bodies in a reading where the member is named. */
function companionsIn(telemetry: Reading, wanted: Set<string>): string[] {
  const names = (telemetry.boundingBoxes ?? []).map((b) => b.targetName?.trim().toLowerCase() ?? "");
  return names.filter((n) => n && !wanted.has(n));
}

/** Is view `a` a better shot of the same body than view `b`? Facing first, then clearly bigger. */
function betterView(a: { area: number; facing?: Facing }, b: { area: number; facing?: Facing }): boolean {
  if (a.area <= 0) return false;
  const byFacing = facingRank(a.facing) - facingRank(b.facing);
  if (byFacing !== 0) return byFacing > 0;
  return a.area >= b.area * FOLLOW_TIMING.betterAngleRatio;
}

/** A doorway drawn in the Room Portal Studio, in its camera's full-frame coordinates. */
export type FollowDoorway = { sourceRoomSlug: string; targetRoomSlug: string; polygon: readonly Point2D[] };

/**
 * Is this body standing in the doorway? True when the feet, the centre, or any
 * box corner falls inside the polygon, or a polygon corner falls inside the box
 * -- doorways at a frame edge are often thin slivers the box swallows whole.
 */
export function bodyInDoorway(box: BodyBox, polygon: readonly Point2D[]): boolean {
  const { nx, ny, nw, nh } = box;
  const probes: Point2D[] = [
    { nx: nx + nw / 2, ny: ny + nh },
    { nx: nx + nw / 2, ny: ny + nh / 2 },
    { nx, ny }, { nx: nx + nw, ny }, { nx, ny: ny + nh }, { nx: nx + nw, ny: ny + nh },
  ];
  if (probes.some((pt) => isPointInPolygon(pt, polygon))) return true;
  return polygon.some((pt) => pt.nx >= nx && pt.nx <= nx + nw && pt.ny >= ny && pt.ny <= ny + nh);
}

export type FollowSighting = { slug: string; cameraId: string; at: number };

export type FollowState = {
  slug: string;
  /** Last time the member was NAMED, and where. */
  lastSeen: FollowSighting | null;
  /**
   * The room the followed body is in: where the programme is following them,
   * whether it got there by a name or by a handoff. `occupiedAt` is the last
   * moment that camera still saw a body.
   */
  custody: { cameraId: string; occupiedAt: number; since: number } | null;
  /** A name seen elsewhere while custody is occupied, waiting to persist. */
  pending: { cameraId: string; since: number; lastAt?: number } | null;
  /** A better view of the custody body on an overlapping camera, waiting to persist. */
  betterAngle: { cameraId: string; since: number } | null;
  /** When each camera last went from nobody to somebody. */
  arrivals: Record<string, number>;
  /** Names seen in the custody room at the same time as the member: provably not them. */
  companions?: string[];
  /** The room the followed body was last seen heading into, via a mapped doorway. */
  heading: { roomSlug: string; at: number } | null;
  people: Record<string, number>;
  lastCutAt: number;
};

export function initialFollowState(slug: string): FollowState {
  return { slug, lastSeen: null, custody: null, pending: null, betterAngle: null, arrivals: {}, heading: null, people: {}, lastCutAt: 0 };
}

export type FollowStatus = "locked" | "tracking" | "handoff" | "better-angle" | "searching";

export type FollowDecision = {
  /** Camera to put on programme, or null to hold whatever is on now. */
  cameraId: string | null;
  status: FollowStatus;
  state: FollowState;
  /** Human-readable why, for the director's reason line. */
  detail: string;
};

export const FOLLOW_TIMING = {
  /**
   * A body leaving the followed room and one arriving elsewhere are linked if
   * they happen within this window of each other. The worker samples cameras
   * in turn, so the new room can register the arrival BEFORE the old room
   * registers the departure; the window runs both ways.
   */
  handoffWindowMs: 20_000,
  /** How long a name elsewhere must persist before it may pull the shot away from an occupied room. */
  namePersistMs: 8_000,
  /**
   * A name elsewhere may drop out for this long without restarting that clock.
   * The learner re-judges bodies every few seconds and misses one now and then;
   * resetting on every gap meant a real walk-out never reached namePersistMs.
   */
  namePersistGapMs: 3_500,
  /** How long a better angle must persist before switching between overlapping cameras. */
  betterAnglePersistMs: 4_000,
  /** A better angle must be at least this much bigger. */
  betterAngleRatio: 1.6,
  /** No non-handoff cut within this long of the previous cut. */
  minDwellMs: 5_000,
  /**
   * Minimum dwell before ANY handoff cut is allowed to switch cameras again.
   * Prevents doorway threshold ping-pong when a person stands near a mutual boundary.
   */
  handoffMinDwellMs: 4_000,
  /**
   * The custody room must read empty this long before a handoff. The worker
   * visits each camera every few seconds and misses a body now and then; one
   * empty reading is not someone leaving.
   */
  emptyGraceMs: 2_500,
} as const;

/**
 * Pick the camera for the followed member.
 *
 *  1. Named on the custody camera: stay -- unless the other camera on the
 *     same room shows the member's front while custody shows a side or back.
 *     That must persist too (people turn in their chairs).
 *  2. Named elsewhere: cut at once if custody is empty or unknown; if the
 *     custody room still has a body, the name must persist first. A stray
 *     "TYLER" in the Game Room pulled the shot away from the real Tyler twice
 *     on the first live walk.
 *  3. Not named, custody occupied: keep following the body. Within an overlap
 *     group (Kitchen and Living Room see the same space) move to a camera
 *     with a clearly bigger view once that persists.
 *  4. Not named, custody empty: hand off to the single room someone arrived
 *     in around the time they left. Two such rooms is ambiguous; hold.
 */
export function chooseFollowCamera(params: {
  state: FollowState;
  readings: Array<{ cameraId: string; telemetry: Reading }>;
  incumbentCameraId: string | null;
  now: number;
  /** Camera ids that can currently go on programme. */
  eligibleCameraIds: string[];
  /** Groups of camera ids that view the same space from different angles. */
  overlapGroups?: string[][];
  /** Mapped doorways, and which room each camera shows. Both optional. */
  doorways?: FollowDoorway[];
  cameraRooms?: Record<string, string>;
}): FollowDecision {
  const { readings, incumbentCameraId, now, eligibleCameraIds } = params;
  const T = FOLLOW_TIMING;
  const prev = params.state;
  const slug = prev.slug;
  const kind = FOLLOWABLE_MEMBERS.find((m) => m.slug === slug)?.kind ?? "person";
  const eligible = new Set(eligibleCameraIds);
  const live = readings.filter((r) => eligible.has(r.cameraId));
  const wanted = new Set([slug.toLowerCase(), followDisplayName(slug).toLowerCase()]);
  const notHim = new Set(prev.companions ?? []);
  const telemetryOf = (cameraId: string) => live.find((r) => r.cameraId === cameraId)?.telemetry ?? {};

  const state: FollowState = {
    ...prev,
    arrivals: { ...prev.arrivals },
    people: { ...prev.people },
    custody: prev.custody && eligible.has(prev.custody.cameraId) ? { ...prev.custody } : null,
  };
  for (const r of live) {
    const count = Math.max(0, r.telemetry.peopleCount ?? 0);
    if (r.cameraId in prev.people && count > prev.people[r.cameraId]) state.arrivals[r.cameraId] = now;
    state.people[r.cameraId] = count;
  }
  if (state.custody && holdsMember(telemetryOf(state.custody.cameraId), kind, notHim)) state.custody.occupiedAt = now;

  const cut = (cameraId: string, status: FollowStatus, detail: string): FollowDecision => {
    const moved = cameraId !== incumbentCameraId;
    const sameRoom = state.custody?.cameraId === cameraId;
    const next: FollowState = {
      ...state,
      // Companions belong to a room: whoever sat beside him there says nothing about the next one.
      companions: sameRoom ? state.companions : [],
      custody: sameRoom ? state.custody : { cameraId, occupiedAt: now, since: now },
      pending: null,
      betterAngle: null,
      heading: moved ? null : state.heading,
      lastCutAt: moved ? now : state.lastCutAt,
    };
    return { cameraId, status, state: next, detail };
  };
  const hold = (status: FollowStatus, detail: string, patch: Partial<FollowState> = {}): FollowDecision => ({
    cameraId: null,
    status,
    state: { ...state, ...patch },
    detail,
  });

  const sightings = live
    .map((r) => ({ cameraId: r.cameraId, presence: memberPresence(r.telemetry, slug) }))
    .filter((s) => s.presence.present);
  const custody = state.custody;
  // Occupied by a body that could be them -- not merely by somebody.
  const custodyOccupied = custody !== null && holdsMember(telemetryOf(custody.cameraId), kind, notHim);
  const doorways = params.doorways ?? [];
  const cameraRooms = params.cameraRooms ?? {};
  const roomOf = (cameraId: string) => cameraRooms[cameraId];

  // Where is the followed body heading? Only the custody camera's body counts:
  // someone else standing in some other doorway says nothing about Tyler.
  if (custody && custodyOccupied) {
    const room = roomOf(custody.cameraId);
    const body = largestBody(telemetryOf(custody.cameraId), kind, notHim);
    const door = body && room ? doorways.find((d) => d.sourceRoomSlug === room && bodyInDoorway(body, d.polygon)) : undefined;
    if (door) state.heading = { roomSlug: door.targetRoomSlug, at: now };
  }
  const headingFresh = state.heading && now - state.heading.at <= T.handoffWindowMs ? state.heading : null;
  const headingNote = headingFresh ? ` — heading to ${headingFresh.roomSlug}` : "";

  // 1 + 2. Named somewhere.
  if (sightings.length > 0) {
    state.lastSeen = { slug, cameraId: sightings[0].cameraId, at: now };
    const onCustody = custody ? sightings.find((s) => s.cameraId === custody.cameraId) : undefined;
    if (onCustody) {
      state.lastSeen = { slug, cameraId: onCustody.cameraId, at: now };
      state.companions = [...new Set([...(state.companions ?? []), ...companionsIn(telemetryOf(onCustody.cameraId), wanted)])];
      const group = (params.overlapGroups ?? []).find((g) => g.includes(onCustody.cameraId)) ?? [];
      const here = { area: onCustody.presence.boxArea, facing: onCustody.presence.facing };
      const facingUs = sightings
        .filter((s) => s.cameraId !== onCustody.cameraId && group.includes(s.cameraId))
        .filter((s) => facingRank(s.presence.facing) > facingRank(here.facing) && s.presence.boxArea > 0)
        .sort((a, b) => facingRank(b.presence.facing) - facingRank(a.presence.facing) || b.presence.boxArea - a.presence.boxArea)[0];
      if (facingUs) {
        const better = state.betterAngle?.cameraId === facingUs.cameraId ? state.betterAngle : { cameraId: facingUs.cameraId, since: now };
        if (now - better.since >= T.betterAnglePersistMs && now - state.lastCutAt >= T.minDwellMs) {
          return cut(facingUs.cameraId, "better-angle", `facing this camera (${facingUs.presence.facing})`);
        }
        return hold("locked", "named here — the other camera has their front", { betterAngle: better });
      }
      return cut(onCustody.cameraId, "locked", "named here");
    }
    const best = sightings.reduce((a, b) =>
      facingRank(b.presence.facing) > facingRank(a.presence.facing) ||
      (facingRank(b.presence.facing) === facingRank(a.presence.facing) &&
        (b.presence.boxArea > a.presence.boxArea ||
          (b.presence.boxArea === a.presence.boxArea && b.presence.confidence > a.presence.confidence)))
        ? b
        : a,
    );
    state.lastSeen = { slug, cameraId: best.cameraId, at: now };
    if (!custody || !custodyOccupied) {
      return cut(best.cameraId, "locked", "named here");
    }
    const kept =
      state.pending?.cameraId === best.cameraId && now - (state.pending.lastAt ?? state.pending.since) <= T.namePersistGapMs;
    const pending = { cameraId: best.cameraId, since: kept ? state.pending!.since : now, lastAt: now };
    if (now - pending.since >= T.namePersistMs && now - state.lastCutAt >= T.minDwellMs) {
      return cut(best.cameraId, "locked", `named here for ${Math.round((now - pending.since) / 1000)}s`);
    }
    return hold("tracking", `named elsewhere for ${Math.round((now - pending.since) / 1000)}s — holding the body on air`, { pending });
  }
  // Keep a pending name through a short gap in the naming (namePersistGapMs).
  if (state.pending && now - (state.pending.lastAt ?? state.pending.since) > T.namePersistGapMs) state.pending = null;

  // 3. Following the body.
  if (custody && custodyOccupied) {
    const group = (params.overlapGroups ?? []).find((g) => g.includes(custody.cameraId)) ?? [];
    const view = (telemetry: Reading) => {
      const box = largestBody(telemetry, kind, notHim);
      return { area: box ? Math.max(0, box.nw) * Math.max(0, box.nh) : 0, facing: box?.facing };
    };
    const custodyView = view(live.find((r) => r.cameraId === custody.cameraId)?.telemetry ?? {});
    const alternatives = live
      .filter((r) => r.cameraId !== custody.cameraId && group.includes(r.cameraId))
      .map((r) => ({ cameraId: r.cameraId, ...view(r.telemetry) }))
      .filter((a) => betterView(a, custodyView))
      .sort((a, b) => facingRank(b.facing) - facingRank(a.facing) || b.area - a.area);
    if (alternatives.length > 0) {
      const top = alternatives[0];
      const better = state.betterAngle?.cameraId === top.cameraId ? state.betterAngle : { cameraId: top.cameraId, since: now };
      if (now - better.since >= T.betterAnglePersistMs && now - state.lastCutAt >= T.minDwellMs) {
        return cut(top.cameraId, "better-angle", top.facing === "front" && custodyView.facing !== "front" ? "facing this camera" : "clearer view of the same space");
      }
      return hold("tracking", "following the body", { betterAngle: better });
    }
    return hold("tracking", `following the body${headingNote}`, { betterAngle: null });
  }

  // 4. The followed room emptied: hand off to the one room someone arrived in.
  if (custody && now - custody.occupiedAt < T.emptyGraceMs) {
    return hold("tracking", `following the body${headingNote}`);
  }
  if (custody) {
    const occupied = live.filter((r) => r.cameraId !== custody.cameraId && (state.people[r.cameraId] ?? 0) > 0);

    // They walked through a mapped doorway: go to that room as soon as anyone
    // is visible there. No need to wait for an unambiguous single arrival --
    // the doorway already said where they went.
    if (headingFresh) {
      const there = occupied
        .filter((r) => roomOf(r.cameraId) === headingFresh.roomSlug)
        .sort((a, b) => largestBodyArea(b.telemetry, kind) - largestBodyArea(a.telemetry, kind));
      if (there.length > 0) {
        if (now - state.lastCutAt >= T.handoffMinDwellMs) {
          return cut(there[0].cameraId, "handoff", `walked through the doorway to ${headingFresh.roomSlug}`);
        }
        return hold("tracking", `heading to ${headingFresh.roomSlug} — holding dwell before handoff`);
      }
    }

    // No doorway evidence: someone arriving elsewhere around the time they
    // left. With doorways mapped, only rooms connected to theirs qualify, so a
    // stranger entering the far end of the house cannot take the follow.
    const custodyRoom = roomOf(custody.cameraId);
    const connected = new Set(
      doorways.flatMap((d) =>
        d.sourceRoomSlug === custodyRoom ? [d.targetRoomSlug] : d.targetRoomSlug === custodyRoom ? [d.sourceRoomSlug] : [],
      ),
    );
    const arrivals = occupied
      .filter((r) => {
        const at = state.arrivals[r.cameraId];
        return at !== undefined && Math.abs(at - custody.occupiedAt) <= T.handoffWindowMs;
      })
      .filter((r) => connected.size === 0 || connected.has(roomOf(r.cameraId) ?? ""));
    if (arrivals.length === 1) {
      if (now - state.lastCutAt >= T.handoffMinDwellMs) {
        return cut(arrivals[0].cameraId, "handoff", "someone arrived here as they left view");
      }
      return hold("tracking", `arrival in ${roomOf(arrivals[0].cameraId) ?? "connected room"} — holding dwell before handoff`);
    }
    if (arrivals.length > 1) {
      return hold("searching", `${arrivals.length} rooms gained someone — holding`);
    }
  }

  return hold("searching", custody ? "not in view" : "not seen yet");
}
