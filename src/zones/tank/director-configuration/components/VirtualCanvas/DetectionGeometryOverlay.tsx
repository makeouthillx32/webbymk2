"use client";

import React from "react";
import type {
  CameraTileBounds,
  CameraTelemetryInput,
  SubjectMode,
  DetectionCategoryFilters,
} from "../../../server/directorVirtualAtlas";
import { classifySubject, subjectLabel, type HouseMember } from "../../../server/houseMembers";
import { SubjectBoxLayer } from "./SubjectBoxLayer";
import { SubjectTelemetryCard } from "./SubjectTelemetryCard";
import type { OverlayVisibility } from "../../overlayRegistry";

// The detection overlay: boxes on things, and nothing else.
//
// This replaced a 336-line strip of status chips — lighting badges, VU meters,
// filter-mode pills, emoji, scanlines, eight colours across ninety usages —
// that sat in the corner and never drew a single bounding box, even though the
// telemetry carried them the whole time. The information was in the corner
// instead of on the subject, which is exactly backwards for a director trying
// to decide which room to cut to.
//
// Things deliberately not here:
//   - lighting / IR badges: the cameras switch to night mode in hardware, so
//     there is nothing for an operator to act on
//   - filter-mode badges: the detector detects, the overlay draws; the overlay
//     does not need to narrate the pipeline back to the room
//   - scanlines and grid washes: decoration that costs contrast against a dark
//     hallway and buys nothing
//
// None of this ever reaches a viewer. tank.unenter.live renders clean video.

type DetectionGeometryOverlayProps = {
  tile: CameraTileBounds;
  telemetry?: CameraTelemetryInput;
  subjectMode?: SubjectMode;
  visible: boolean;
  /** Retained so existing call sites keep compiling; no longer read. */
  filters?: DetectionCategoryFilters;
  /** Per-layer visibility from the overlay registry. */
  overlays?: Partial<OverlayVisibility>;
  /** Enrolled housemates, for resolving a match to a display name. */
  members?: HouseMember[];
  /** Small tiles drop labels — text at thumbnail size is noise, not data. */
  compact?: boolean;
};

export function DetectionGeometryOverlay({
  telemetry,
  visible,
  overlays,
  members = [],
  compact = false,
}: DetectionGeometryOverlayProps) {
  if (!visible || !telemetry) return null;

  const show = (id: keyof OverlayVisibility, fallback = true) =>
    overlays?.[id] ?? fallback;

  if (!show("person")) return null;

  const identity = classifySubject(telemetry);
  const label = subjectLabel(identity, members, telemetry.targetMemberDetected);

  // A guest is the signal worth surfacing — someone is here who does not live
  // here. Members are named only when the layer is on, so a director watching
  // for strangers is not reading four familiar names all night.
  const showIdentity =
    identity === "guest" ? show("guest") : identity === "house_member" ? show("member") : true;

  const boxes = telemetry.boundingBoxes ?? [];

  // The largest person box anchors the card. Card sits above-left of it, which
  // keeps it clear of the box and of the subject's head in a standing shot.
  const primary = boxes
    .filter((b) => (b.label || "").toLowerCase() === "person")
    .sort((a, b) => b.nw * b.nh - a.nw * a.nh)[0];

  const rows = primary
    ? [
        { label: "STATUS", value: showIdentity ? label : "PERSON", emphasis: identity === "guest" },
        ...(show("audio")
          ? [{ label: "AUDIO", value: `${Math.round(telemetry.audioPeak)}%` }]
          : []),
        ...(show("motion")
          ? [{ label: "MOTION", value: `${Math.round((telemetry.motionScore ?? 0) * 100)}%` }]
          : []),
      ]
    : [];

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden">
      <SubjectBoxLayer
        boxes={boxes}
        memberLabel={showIdentity ? label : null}
        memberConfidence={telemetry.targetMemberConfidence ?? 0}
        showGroundContact={show("feet", false)}
        compact={compact}
      />

      {!compact && primary && rows.length > 0 && (
        <SubjectTelemetryCard
          rows={rows}
          nx={Math.max(0.02, primary.nx - 0.02)}
          ny={Math.max(0.02, primary.ny - 0.16)}
          targetNx={primary.nx + primary.nw / 2}
          targetNy={primary.ny}
        />
      )}
    </div>
  );
}

export default DetectionGeometryOverlay;
