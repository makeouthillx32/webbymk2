import type { CameraTelemetryInput } from "./directorVirtualAtlas";

// Who is in the house, and who isn't.
//
// The detector matches a body against a small set of enrolled housemates and
// sends back a name or nothing. This file turns that into the three states the
// director actually acts on.
//
// Identity is matched per-person against enrolled references — never inferred
// from appearance. With three known residents that is both the accurate
// approach and the simple one: it degrades to "guest" instead of confidently
// naming the wrong person, and per-member features key off a stable member id
// rather than anything the detector guessed.

export type SubjectIdentity = "house_member" | "guest" | "unresolved";

export type HouseMember = {
  id: string;
  /** Shown on the overlay. */
  displayName: string;
  /** Label the detector emits when it matches this person's enrolment. */
  detectorLabel: string;
};

/**
 * Confidence below which a match is not trusted.
 *
 * Deliberately high. Naming the wrong housemate on screen is worse than saying
 * "guest", because a wrong name is acted on and an unknown is checked.
 */
export const MEMBER_MATCH_THRESHOLD = 0.82;

export function classifySubject(
  telemetry: Pick<CameraTelemetryInput, "peopleCount" | "targetMemberDetected" | "targetMemberConfidence">,
): SubjectIdentity {
  // Nobody in frame: not a guest, just nobody.
  if ((telemetry.peopleCount ?? 0) < 1) return "unresolved";

  const label = telemetry.targetMemberDetected;
  const confidence = telemetry.targetMemberConfidence ?? 0;

  // A body with no match is a guest — the useful signal for the house, since
  // it means someone is here who does not live here.
  if (!label) return "guest";

  // Matched, but not confidently enough to put a name on screen.
  if (confidence < MEMBER_MATCH_THRESHOLD) return "unresolved";

  return "house_member";
}

/**
 * What to render above the box.
 *
 * `unresolved` deliberately reads as PERSON rather than as an error: the
 * detector saw a body and could not place it, which is a normal outcome in a
 * dark hallway or from behind, not a fault worth flagging to the operator.
 */
export function subjectLabel(
  identity: SubjectIdentity,
  members: HouseMember[],
  detectorLabel?: string | null,
): string {
  if (identity === "house_member" && detectorLabel) {
    const member = members.find((m) => m.detectorLabel === detectorLabel);
    return (member?.displayName ?? detectorLabel).toUpperCase();
  }
  if (identity === "guest") return "GUEST";
  return "PERSON";
}
