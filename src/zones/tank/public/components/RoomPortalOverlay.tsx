"use client";

// src/zones/tank/public/components/RoomPortalOverlay.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Spatial Room Portals Viewer Layer (Fishtank-style Doorway Navigation)
//
// Camera streams remain visually clean until a pointer is actually over a
// configured doorway. Touch/coarse pointers still receive the same invisible
// targets so tapping a calibrated doorway always navigates.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { DoorOpen, ArrowRight, ArrowLeft } from "lucide-react";
import {
  calculateQuadBoundingBox,
  calculateQuadCentroid,
  pointsToSvgViewBox,
  type PortalPolygon,
  type RoomPortal,
} from "../../vision/portalGeometry";

const MIN_HOVER_WIDTH = 0.14;
const MIN_HOVER_HEIGHT = 0.18;
const HOVER_PADDING = 0.025;
const CAMERA_ASPECT_RATIO = 16 / 9;

export type PortalVideoBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Returns the real pixel rectangle occupied by an object-fit video. Doorway
 * polygons are calibrated against the source frame, so their overlay must use
 * this rectangle rather than the surrounding player surface when cover crops.
 */
export function calculatePortalVideoBox(
  containerWidth: number,
  containerHeight: number,
  fit: "cover" | "contain" = "cover",
  sourceAspect = CAMERA_ASPECT_RATIO,
): PortalVideoBox {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    !Number.isFinite(containerWidth) ||
    !Number.isFinite(containerHeight) ||
    !Number.isFinite(sourceAspect) ||
    sourceAspect <= 0
  ) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const containerAspect = containerWidth / containerHeight;
  const constrainByWidth =
    fit === "cover"
      ? containerAspect >= sourceAspect
      : containerAspect <= sourceAspect;
  const width = constrainByWidth
    ? containerWidth
    : containerHeight * sourceAspect;
  const height = constrainByWidth
    ? containerWidth / sourceAspect
    : containerHeight;

  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Saved geometry controls what is highlighted. The invisible discovery area
 * is intentionally more forgiving: a perspective doorway may be only a few
 * pixels wide at its far edge and should not require pixel hunting.
 */
export function calculatePortalHoverBounds(polygon: PortalPolygon) {
  const bounds = calculateQuadBoundingBox(polygon);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const width = Math.min(
    1,
    Math.max(MIN_HOVER_WIDTH, bounds.width + HOVER_PADDING * 2),
  );
  const height = Math.min(
    1,
    Math.max(MIN_HOVER_HEIGHT, bounds.height + HOVER_PADDING * 2),
  );
  const left = Math.max(0, Math.min(1 - width, centerX - width / 2));
  const top = Math.max(0, Math.min(1 - height, centerY - height / 2));

  return { left, top, width, height };
}

export type RoomPortalOverlayProps = {
  roomSlug: string;
  onSelectRoom: (targetRoomSlug: string) => void;
  /** Debug/Preview mode for operators in Axis studio */
  debugShowAll?: boolean;
  portals?: RoomPortal[];
  videoFit?: "cover" | "contain";
};

export function RoomPortalOverlay({
  roomSlug: _roomSlug,
  onSelectRoom,
  debugShowAll = false,
  portals = [],
  videoFit = "cover",
}: RoomPortalOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [hoveredPortalId, setHoveredPortalId] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const measure = () => {
      const rect = overlay.getBoundingClientRect();
      setViewportSize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    };

    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(overlay);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    setHoveredPortalId(null);
  }, [_roomSlug, portals]);

  // If debug/preview is explicitly requested (e.g. inside Axis studio), render subtle dashed guides
  if (debugShowAll && portals && portals.length > 0) {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden select-none">
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {portals.map((p) => {
            const pointsStr = pointsToSvgViewBox(p.polygon);
            return (
              <g key={p.id}>
                <polygon
                  points={pointsStr}
                  fill="rgba(249, 115, 22, 0.15)"
                  stroke="#f97316"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>
        {portals.map((portal) => {
          const centroid = calculateQuadCentroid(portal.polygon);
          return (
            <div
              key={`${portal.id}-debug-label`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              style={{ left: `${centroid.nx * 100}%`, top: `${centroid.ny * 100}%` }}
            >
              {portal.title}
            </div>
          );
        })}
      </div>
    );
  }

  if (portals.length === 0) {
    return null;
  }

  const hoveredPortal =
    portals.find((portal) => portal.id === hoveredPortalId) ?? null;
  const hoveredCentroid = hoveredPortal
    ? calculateQuadCentroid(hoveredPortal.polygon)
    : null;
  const videoBox = calculatePortalVideoBox(
    viewportSize.width,
    viewportSize.height,
    videoFit,
  );
  const hasMeasuredVideo = videoBox.width > 0 && videoBox.height > 0;

  const pointStyle = (nx: number, ny: number) =>
    hasMeasuredVideo
      ? {
          left: `${videoBox.left + nx * videoBox.width}px`,
          top: `${videoBox.top + ny * videoBox.height}px`,
        }
      : { left: `${nx * 100}%`, top: `${ny * 100}%` };

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden select-none"
    >
      <svg
        className="pointer-events-none absolute"
        style={
          hasMeasuredVideo
            ? {
                left: videoBox.left,
                top: videoBox.top,
                width: videoBox.width,
                height: videoBox.height,
              }
            : { inset: 0, width: "100%", height: "100%" }
        }
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-label="Room doorways"
      >
        <defs>
          <filter id="doorway-hover-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="0.45" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="doorway-hover-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#fb923c" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ea580c" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {hoveredPortal && (
          <polygon
            points={pointsToSvgViewBox(hoveredPortal.polygon)}
            fill="url(#doorway-hover-grad)"
            stroke="#f97316"
            strokeWidth="3.5"
            filter="url(#doorway-hover-glow)"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* The saved polygon remains the exact visible highlight. The invisible
          button is a padded bounding target so narrow perspective doors are
          discoverable without pixel hunting. */}
      {portals.map((portal) => {
        const hit = calculatePortalHoverBounds(portal.polygon);
        return (
          <button
            key={`${_roomSlug}:${portal.id}`}
            type="button"
            aria-label={`Enter ${portal.title}`}
            className="pointer-events-auto absolute cursor-pointer border-0 bg-transparent p-0 outline-none"
            style={{
              ...(hasMeasuredVideo
                ? {
                    left: videoBox.left + hit.left * videoBox.width,
                    top: videoBox.top + hit.top * videoBox.height,
                    width: hit.width * videoBox.width,
                    height: hit.height * videoBox.height,
                  }
                : {
                    left: `${hit.left * 100}%`,
                    top: `${hit.top * 100}%`,
                    width: `${hit.width * 100}%`,
                    height: `${hit.height * 100}%`,
                  }),
            }}
            onPointerEnter={() => setHoveredPortalId(portal.id)}
            onPointerLeave={() => setHoveredPortalId(null)}
            onFocus={() => setHoveredPortalId(portal.id)}
            onBlur={() => setHoveredPortalId(null)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onSelectRoom(portal.targetRoomSlug);
            }}
          />
        );
      })}

      {hoveredPortal && hoveredCentroid && <div
        style={pointStyle(hoveredCentroid.nx, hoveredCentroid.ny)}
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in-95 duration-100"
      >
        <div
          className="flex items-center gap-2 rounded-full border-2 border-orange-400 bg-black/95 px-4 py-2 text-xs font-black uppercase tracking-wider text-orange-300 shadow-[0_0_30px_rgba(249,115,22,0.9)]"
          style={{
            borderColor: "var(--tank-color-link, #fb923c)",
            color: "var(--tank-color-link, #fed7aa)",
            boxShadow: "var(--tank-anim-glow, 0 0 30px rgba(249,115,22,0.9))",
          }}
        >
          {hoveredPortal.direction === "left" ? (
            <ArrowLeft className="h-4 w-4 text-orange-400 animate-pulse" />
          ) : hoveredPortal.direction === "right" ? (
            <ArrowRight className="h-4 w-4 text-orange-400 animate-pulse" />
          ) : (
            <DoorOpen className="h-4 w-4 text-orange-400 animate-bounce" />
          )}
          <span>{hoveredPortal.title.toUpperCase()}</span>
        </div>
      </div>}
    </div>
  );
}
