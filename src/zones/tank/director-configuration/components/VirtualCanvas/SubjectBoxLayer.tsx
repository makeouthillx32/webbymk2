"use client";

import React from "react";
import { DETECTION, DETECTION_MONO, confidenceOpacity, classColor } from "../../detectionTheme";
import type { CameraTelemetryInput } from "../../../server/directorVirtualAtlas";

// Draws detections ON the subject, not in the corner.
//
// The telemetry contract has carried `boundingBoxes[]` — normalized coords,
// label, depth zone — since the atlas was written, and nothing ever rendered
// them. The overlay showed corner chips instead, which is why the canvas never
// looked like a detection view: the information was not attached to the thing
// it described.
//
// Coordinates are normalized 0-1 against the tile, so this layer needs no
// knowledge of the tile's pixel size and stays correct when the canvas is
// zoomed or the grid reflows.

type Box = NonNullable<CameraTelemetryInput["boundingBoxes"]>[number];

type SubjectBoxLayerProps = {
  boxes: Box[];
  /** Identity for the primary subject, when the detector matched an enrolled member. */
  memberLabel?: string | null;
  memberConfidence?: number;
  /** Draw the red ground-contact marker under each subject. */
  showGroundContact?: boolean;
  /** Suppresses labels when tiles are small enough that text would be noise. */
  compact?: boolean;
};

/**
 * A person box carries identity; an object box carries its label. Every box
 * shows a real confidence percentage when one exists — standard practice in
 * every detection tool (Ultralytics, CVAT, Roboflow all label boxes
 * `class conf%`) — and NEVER a made-up one. This used to hardcode a fallback
 * 50%/65% for trash/clutter when no real confidence was posted, which read
 * as a real (if middling) detector reading instead of what it actually was:
 * no confidence at all. Omitting the number is the honest option.
 *
 * Identity is deliberately matched by the detector against enrolled members and
 * arrives here as a name — the overlay never infers who someone is from how
 * they look. "Unknown" is a first-class, expected result rather than a failure.
 */
function boxTitle(box: Box, memberLabel?: string | null, isPrimary?: boolean): string {
  const raw = (box.label || "object").toLowerCase();
  const conf = box.confidence != null ? Math.round(box.confidence * 100) : null;
  const confSuffix = conf != null ? ` (${conf}%)` : "";

  if (raw === "trash" || raw.includes("trash")) return `LIKELY TRASH${confSuffix}`;
  if (raw === "clutter") return `CLUTTER${confSuffix}`;
  if (raw === "dog" || raw === "cat") {
    // Named when the detector matched a specific enrolled pet (currently
    // only the simulator does this — see petRoster.ts), generic species
    // otherwise. Same "never infer, only display what was matched" rule as
    // the person/member case below.
    if (box.targetName) return `${box.targetName.toUpperCase()} (${raw.toUpperCase()})${confSuffix}`;
    return `${raw.toUpperCase()}${confSuffix}`;
  }

  if (raw !== "person") return (box.label || "object").toUpperCase();

  // Per-box identity, same as the pet branch above. This was ignored for
  // people: the detector resolves an individual and attaches `targetName`, and
  // this function threw it away, so a correctly identified resident still
  // rendered as UNKNOWN PERSON. Only the single "primary" box could ever carry
  // a name, and only via the separate per-camera targetMemberDetected field.
  //
  // Safe to trust now that resolveDetection declines whenever more than one
  // subject of a class is in frame — it will not hand back a name it cannot
  // attribute to this specific body.
  if (box.targetName) return `${box.targetName.toUpperCase()}${confSuffix}`;
  if (isPrimary && memberLabel) return `${memberLabel.toUpperCase()}${confSuffix}`;
  return `UNKNOWN PERSON${confSuffix}`;
}

/** Thin wrapper kept for call-site clarity — box border/badge colors are the
 * single CLASS_COLORS palette in detectionTheme.ts, not a local literal. */
function getBoxAccent(label: string) {
  return classColor(label);
}

export function SubjectBoxLayer({
  boxes,
  memberLabel = null,
  memberConfidence = 0,
  showGroundContact = true,
  compact = false,
}: SubjectBoxLayerProps) {
  if (!boxes || boxes.length === 0) return null;

  // The largest person box is treated as the primary subject: it is the one the
  // identity label belongs to, and the one a director is most likely acting on.
  let primaryIndex = -1;
  let primaryArea = 0;
  boxes.forEach((b, i) => {
    if ((b.label || "").toLowerCase() !== "person") return;
    const area = b.nw * b.nh;
    if (area > primaryArea) {
      primaryArea = area;
      primaryIndex = i;
    }
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {boxes.map((box, i) => {
        const isPrimary = i === primaryIndex;
        const isPerson = (box.label || "").toLowerCase() === "person";
        const isTrash = (box.label || "").toLowerCase().includes("trash");
        // Confidence drives visual prominence — standard practice, and now
        // possible for every class (real dog/cat/person detections all
        // carry a real box.confidence from the YOLO decoder). Only falls
        // back to the old flat guesses when nothing real is known at all.
        const opacity =
          box.confidence != null
            ? confidenceOpacity(box.confidence)
            : isPrimary
              ? confidenceOpacity(memberConfidence || 0.9)
              : isTrash
                ? 0.95
                : 0.85;

        const left = `${box.nx * 100}%`;
        const top = `${box.ny * 100}%`;
        const width = `${box.nw * 100}%`;
        const height = `${box.nh * 100}%`;

        const accent = getBoxAccent(box.label || "");

        // Depth drives stroke weight so a distant subject reads as distant
        // without needing a second colour or a size label.
        const stroke =
          box.depthZone === "background"
            ? 1
            : box.depthZone === "foreground"
            ? DETECTION.boxStroke + 1
            : DETECTION.boxStroke;

        return (
          <div key={`${box.label}-${i}`} style={{ position: "absolute", left, top, width, height, opacity }}>
            <div
              className="absolute inset-0"
              style={{
                border: `${stroke}px solid ${accent.border}`,
                background: isPrimary ? DETECTION.accentFaint : accent.bg,
                boxShadow: isTrash ? `0 0 8px ${accent.border}44` : undefined,
              }}
            />

            {!compact && (
              <div
                className="absolute whitespace-nowrap"
                style={{
                  bottom: "100%",
                  left: -stroke,
                  marginBottom: 2,
                  background: accent.badgeBg,
                  color: accent.badgeText,
                  fontFamily: DETECTION_MONO,
                  // Was fontSize 9 / padding "1px 5px" — same reasoning as
                  // SubjectTelemetryCard: a 6-up grid tile is a few hundred
                  // px wide, not a single full-frame camera view.
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  padding: "1px 4px",
                }}
              >
                {boxTitle(box, memberLabel, isPrimary)}
              </div>
            )}

            {/* Ground contact. The one marker that denotes a physical position
                rather than a classification, so it gets the reserved colour. */}
            {showGroundContact && isPerson && (
              <div
                className="absolute"
                style={{
                  left: "50%",
                  bottom: -4,
                  width: 8,
                  height: 8,
                  marginLeft: -4,
                  borderRadius: "50%",
                  background: DETECTION.ground,
                  boxShadow: `0 0 8px ${DETECTION.ground}`,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default SubjectBoxLayer;
