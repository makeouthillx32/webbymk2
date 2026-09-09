"use client";

import React from "react";
import { DETECTION, DETECTION_MONO } from "../../detectionTheme";

// The ID / Status / Confidence card, tethered to its subject by a leader line.
//
// A card floating in a corner makes the director work out which box it refers
// to. Tethering it removes that step — which matters most in exactly the case
// the overlay exists for: several people in frame and a cut to make quickly.
//
// Values arrive already decided. Identity in particular is matched by the
// detector against enrolled members; this renders the answer and never guesses
// at who someone is.

export type SubjectTelemetryRow = { label: string; value: string; emphasis?: boolean };

type SubjectTelemetryCardProps = {
  rows: SubjectTelemetryRow[];
  /** Card position, normalized to the tile. */
  nx: number;
  ny: number;
  /** Where the leader line should point — the subject's box, normalized. */
  targetNx?: number;
  targetNy?: number;
};

export function SubjectTelemetryCard({
  rows,
  nx,
  ny,
  targetNx,
  targetNy,
}: SubjectTelemetryCardProps) {
  if (!rows.length) return null;

  const hasTarget = typeof targetNx === "number" && typeof targetNy === "number";

  return (
    <>
      {/* Leader line, drawn in its own SVG so it sits under the card and can
          cross the whole tile without affecting layout. `vectorEffect` keeps it
          hairline-thin at any canvas zoom rather than scaling into a slab. */}
      {hasTarget && (
        <svg
          className="pointer-events-none absolute inset-0"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ overflow: "visible" }}
        >
          <line
            x1={nx * 100}
            y1={ny * 100}
            x2={(targetNx as number) * 100}
            y2={(targetNy as number) * 100}
            stroke={DETECTION.accentDim}
            strokeWidth={DETECTION.leaderStroke}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}

      <div
        className="pointer-events-none absolute"
        style={{
          left: `${nx * 100}%`,
          top: `${ny * 100}%`,
          background: DETECTION.panel,
          border: `1px solid ${DETECTION.panelBorder}`,
          borderLeft: `2px solid ${DETECTION.accent}`,
          // Was padding 4/7, fontSize 9, minWidth 118 — read as a full-size
          // HUD panel on a 3x2 grid where each tile is a few hundred px
          // wide. Same rows, same information, just built for the tile size
          // this actually renders at instead of a hypothetical full-frame
          // single-camera view.
          padding: "2px 5px",
          fontFamily: DETECTION_MONO,
          fontSize: 7,
          lineHeight: 1.35,
          minWidth: 82,
          gap: 1,
        }}
      >
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-2 whitespace-nowrap">
            <span style={{ color: DETECTION.textDim }}>{row.label}:</span>
            <span
              style={{
                color: row.emphasis ? DETECTION.accent : DETECTION.text,
                fontWeight: row.emphasis ? 700 : 500,
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export default SubjectTelemetryCard;
