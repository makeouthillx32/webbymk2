"use client";

import React, { useMemo } from "react";
import type {
  CameraTelemetryInput,
  CameraTileBounds,
  DynamicAtlasLayout,
} from "../../../server/directorVirtualAtlas";
import { classifySubject, subjectLabel, type HouseMember } from "../../../server/houseMembers";
import { SubjectBoxLayer } from "./SubjectBoxLayer";
import { SubjectTelemetryCard, type SubjectTelemetryRow } from "./SubjectTelemetryCard";
import type { OverlayVisibility } from "../../overlayRegistry";

// One detection overlay for the whole video wall, not one per tile.
//
// The wall is already seamless — six cameras butt edge to edge with zero gap
// and zero rounding, forming one 11520x4320-equivalent image, exactly like a
// real security monitor bank. Detection was the one thing still thinking in
// six separate frames: each tile ran its own overlay, converting its own
// telemetry into its own 0-1 space, independent of every other tile.
//
// The fix is arithmetic the atlas already had. Every tile carries its real
// pixel position on the shared canvas (`xMin`, `yMin`, `xMax`, `yMax` — tile
// one is literally 0,0 to 3840,2160, tile two 3840,0 to 7680,2160, and so on).
// A detector still reports each room's boxes in that room's own 0-1 frame —
// nothing about how detection runs has to change, and running six small,
// mostly-empty detections is cheap. This layer is what changes: it converts
// every box from tile-local space into canvas-wide space before drawing, so
// one overlay spanning the whole grid places every box in its true position.

type CanvasDetectionOverlayProps = {
  atlasLayout: DynamicAtlasLayout;
  inputs: CameraTelemetryInput[];
  filters?: import("../../../server/directorVirtualAtlas").DetectionCategoryFilters;
  overlays?: Partial<OverlayVisibility>;
  members?: HouseMember[];
  visible: boolean;
};

type CanvasBox = {
  key: string;
  cameraId: string;
  label: string;
  depthZone?: "foreground" | "midground" | "background";
  confidence?: number;
  targetName?: string;
  /** Fractions of the WHOLE canvas, not the tile. */
  nx: number;
  ny: number;
  nw: number;
  nh: number;
};

/** Tile-local 0-1 box -> canvas-wide 0-1 box, via the tile's real pixel bounds. */
function toCanvasSpace(
  tile: CameraTileBounds,
  box: { nx: number; ny: number; nw: number; nh: number; label: string; depthZone?: string; confidence?: number; targetName?: string },
  canvasWidth: number,
  canvasHeight: number,
): CanvasBox {
  const tileW = tile.xMax - tile.xMin;
  const tileH = tile.yMax - tile.yMin;
  return {
    key: `${tile.cameraId}-${box.label}-${box.nx.toFixed(2)}-${box.ny.toFixed(2)}`,
    cameraId: tile.cameraId,
    label: box.label,
    depthZone: box.depthZone as CanvasBox["depthZone"],
    confidence: box.confidence,
    targetName: box.targetName,
    nx: (tile.xMin + box.nx * tileW) / canvasWidth,
    ny: (tile.yMin + box.ny * tileH) / canvasHeight,
    nw: (box.nw * tileW) / canvasWidth,
    nh: (box.nh * tileH) / canvasHeight,
  };
}

export function CanvasDetectionOverlay({
  atlasLayout,
  inputs,
  filters,
  overlays,
  members = [],
  visible,
}: CanvasDetectionOverlayProps) {
  const isEnabled = (cat: string, fallback = true) => {
    if (filters) {
      if (cat === "person" || cat === "people" || cat === "guest" || cat === "member") {
        return filters.people;
      }
      if (cat === "trash") return filters.trash;
      if (cat === "clutter") return filters.clutter;
      if (cat === "pets" || cat === "dog" || cat === "cat") return filters.pets ?? true;
      if (cat === "audio") return filters.audio;
    }
    return overlays?.[cat as keyof OverlayVisibility] ?? fallback;
  };

  const { boxes, cardFor } = useMemo(() => {
    if (!visible) return { boxes: [] as CanvasBox[], cardFor: null as CanvasBox | null };

    const tileById = new Map(atlasLayout.tiles.map((t) => [t.cameraId, t]));
    const allBoxes: CanvasBox[] = [];
    let primary: CanvasBox | null = null;
    let primaryTelemetry: CameraTelemetryInput | null = null;
    let primaryArea = 0;

    for (const telemetry of inputs) {
      const tile = tileById.get(telemetry.cameraId);
      if (!tile || !telemetry.boundingBoxes) continue;

      for (const box of telemetry.boundingBoxes) {
        const label = (box.label || "").toLowerCase();
        if (label === "person" && !isEnabled("person")) continue;
        if (label === "dog" && !isEnabled("dog")) continue;
        if (label === "cat" && !isEnabled("cat")) continue;
        if ((label === "trash" || label.includes("trash")) && !isEnabled("trash", true)) continue;
        if (label === "clutter" && !isEnabled("clutter", true)) continue;

        const canvasBox = toCanvasSpace(tile, box, atlasLayout.canvasWidth, atlasLayout.canvasHeight);
        allBoxes.push(canvasBox);

        if (label === "person") {
          const area = box.nw * box.nh;
          if (area > primaryArea) {
            primaryArea = area;
            primary = canvasBox;
            primaryTelemetry = telemetry;
          }
        }
      }
    }

    return { boxes: allBoxes, cardFor: primary, primaryTelemetry } as any;
  }, [visible, atlasLayout, inputs, filters, overlays]);

  if (!visible || boxes.length === 0) return null;

  const primaryTelemetry: CameraTelemetryInput | undefined = (
    inputs.find((i) => cardFor && i.cameraId === cardFor.cameraId)
  );

  let identityRows: SubjectTelemetryRow[] = [];
  let memberLabel: string | null = null;

  if (cardFor && primaryTelemetry) {
    const identity = classifySubject(primaryTelemetry);
    const label = subjectLabel(identity, members, primaryTelemetry.targetMemberDetected);
    const showIdentity =
      identity === "guest" ? isEnabled("guest") : identity === "house_member" ? isEnabled("member") : true;
    memberLabel = showIdentity ? label : null;

    identityRows = [
      { label: "STATUS", value: showIdentity ? label : "PERSON", emphasis: identity === "guest" },
      { label: "ROOM", value: (atlasLayout.tiles.find((t) => t.cameraId === cardFor.cameraId)?.cameraName ?? "").toUpperCase() },
      // Identity-match confidence, separate from detection confidence (that
      // lives on the box label itself) — standard in face-ID/re-id systems
      // to show both. Real, not fabricated: currently 0% for every actual
      // detection because no real face-matching exists yet (see the
      // face-embedding conversation) — the simulator's flat 0.9 is the only
      // thing that currently populates this, and it's honest for that to
      // read as near-100% since that IS what the simulator claims.
      ...(identity === "house_member"
        ? [{ label: "MATCH", value: `${Math.round((primaryTelemetry.targetMemberConfidence ?? 0) * 100)}%` }]
        : []),
      ...(isEnabled("audio") ? [{ label: "AUDIO", value: `${Math.round(primaryTelemetry.audioPeak)}%` }] : []),
    ];
  }

  // Simple boxes are the whole point of a shared canvas: SubjectBoxLayer
  // already draws normalized 0-1 boxes, and canvas-wide fractions are exactly
  // that — just measured against the full wall instead of one tile.
  const layerBoxes = boxes.map((b) => ({
    nx: b.nx,
    ny: b.ny,
    nw: b.nw,
    nh: b.nh,
    label: b.label,
    depthZone: b.depthZone,
    confidence: b.confidence,
    targetName: b.targetName,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <SubjectBoxLayer
        boxes={layerBoxes}
        memberLabel={memberLabel}
        memberConfidence={primaryTelemetry?.targetMemberConfidence ?? 0}
        showGroundContact={isEnabled("feet", false)}
      />
      {cardFor && identityRows.length > 0 && (
        <SubjectTelemetryCard
          rows={identityRows}
          nx={Math.max(0.005, cardFor.nx - 0.005)}
          ny={Math.max(0.005, cardFor.ny - 0.035)}
          targetNx={cardFor.nx + cardFor.nw / 2}
          targetNy={cardFor.ny}
        />
      )}
    </div>
  );
}

export default CanvasDetectionOverlay;
