/**
 * Should the room-offline overlay cover the scene right now?
 *
 * Pulled out of the component because this is the one piece of the overlay
 * that can hurt: every "true" here paints a full-screen card over whatever the
 * OBS scene was showing. Getting it wrong in the safe direction means a missed
 * overlay; getting it wrong in the unsafe direction means blacking out a live
 * broadcast. It is worth being able to test that directly.
 *
 * The rule throughout is FAIL HIDDEN — anything unknown, unreachable or
 * unparsed resolves to "stay out of the way".
 */

export type OverlayTrigger = "off" | "nosignal" | "both";

export type OverlayStatus = {
  offline: boolean;
  anyOnline: boolean;
  /** False when the server could not read the camera directory in time. */
  cameraStateKnown?: boolean;
  /** False when no such room is enrolled. */
  known: boolean;
};

export function parseTrigger(raw: string | null | undefined): OverlayTrigger {
  const value = (raw || "off").toLowerCase();
  return value === "nosignal" || value === "both" ? value : "off";
}

export function shouldShowOverlay(
  status: OverlayStatus | null,
  trigger: OverlayTrigger,
  preview = false,
): boolean {
  // Preview is the operator explicitly asking to see the card so they can
  // position it in OBS. It outranks everything, including an unknown room.
  if (preview) return true;

  // No answer yet, a failed fetch, or a room nobody has enrolled.
  if (!status || !status.known) return false;

  // The kill-switch is always trustworthy: it comes from a cheap DB read that
  // does not depend on the camera directory being reachable.
  if (trigger === "off") return status.offline;

  // "No signal" is only actionable when the server actually managed to look.
  // When it could not, treat the feed as fine — never cover a broadcast that
  // was merely unverified.
  const noSignal = status.cameraStateKnown !== false && !status.anyOnline;

  if (trigger === "nosignal") return noSignal;
  return status.offline || noSignal;
}
