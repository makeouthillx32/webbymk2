"use client";

import React from "react";
import { DETECTION, DETECTION_MONO, confidenceOpacity } from "../../detectionTheme";
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

type Box = NonNullable<CameraTelemetryInput["boundingBoxes"]>[number] & {
  confidence?: number;
};

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
 * A person box carries identity; an object box carries its label.
 *
 * Identity is deliberately matched by the detector against enrolled members and
 * arrives here as a name — the overlay never infers who someone is from how
 * they look. "Unknown" is a first-class, expected result rather than a failure.
 */
function boxTitle(box: Box, memberLabel?: string | null, isPrimary?: boolean): string {
  const raw = (box.label || "object").toLowerCase();
  if (raw === "trash" || raw.includes("trash")) {
    const conf = box.confidence ? Math.round(box.confidence * 100) : 50;
    return `LIKELY TRASH (${conf}%)`;
  }
  if (raw === "clutter") {
    const conf = box.confidence ? Math.round(box.confidence * 100) : 65;
    return `CLUTTER (${conf}%)`;
  }
  const label = (box.label || "object").toUpperCase();
  if (label !== "PERSON") return label;
  if (isPrimary && memberLabel) return memberLabel.toUpperCase();
  return "UNKNOWN PERSON";
}

function getBoxAccent(label: string) {
  const raw = (label || "").toLowerCase();
  if (raw === "trash" || raw.includes("trash")) {
    return {
      border: "#FF4D00",
      bg: "rgba(255, 77, 0, 0.18)",
      badgeBg: "#FF4D00",
      badgeText: "#FFFFFF",
    };
  }
  if (raw === "clutter") {
    return {
      border: "#FBBF24",
      bg: "rgba(251, 191, 36, 0.14)",
      badgeBg: "#FBBF24",
      badgeText: "#000000",
    };
  }
  return {
    border: DETECTION.accent,
    bg: "transparent",
    badgeBg: DETECTION.accent,
    badgeText: "#141414",
  };
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
        const opacity = isPrimary ? confidenceOpacity(memberConfidence || 0.9) : isTrash ? 0.95 : 0.85;

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
                  marginBottom: 3,
                  background: accent.badgeBg,
                  color: accent.badgeText,
                  fontFamily: DETECTION_MONO,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  padding: "1px 5px",
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
