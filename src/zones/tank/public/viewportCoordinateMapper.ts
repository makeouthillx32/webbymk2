// src/zones/tank/public/viewportCoordinateMapper.ts
// ─────────────────────────────────────────────────────────────────────────────
// Precision Aspect-Ratio-Aware Viewport Tap Coordinate Normalizer
//
// Accurately converts screen click/touch events (clientX, clientY) into
// normalized (nx, ny) video coordinates [0.0, 1.0], accounting for:
// - Letterboxing & Pillarboxing black bars (object-fit: contain)
// - Cropped zooming (object-fit: cover)
// - Digital PTZ Cropping & Pan Offsets (Virtual PTZ compensation)
// - Mobile orientation changes & safe-area insets
// ─────────────────────────────────────────────────────────────────────────────

import type { VirtualPtzState } from "../director-configuration/components/NavigationController";

export const CANVAS_BASE_WIDTH = 3840;
export const CANVAS_BASE_HEIGHT = 2160;

export type RenderedVideoRect = {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

export type NormalizedTapResult = {
  isInsideVideo: boolean;
  nx: number; // 0.0 to 1.0 (relative to rendered viewport)
  ny: number; // 0.0 to 1.0 (relative to rendered viewport)
  globalNx: number; // 0.0 to 1.0 (compensated for PTZ canvas zoom/pan)
  globalNy: number; // 0.0 to 1.0 (compensated for PTZ canvas zoom/pan)
  renderedRect: RenderedVideoRect;
};

export type BoundingBoxRect = {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
};

/**
 * Computes the rendered video bounding box inside a container element for `object-fit: contain`.
 */
export function getRenderedVideoRect(
  containerWidth: number,
  containerHeight: number,
  videoAspectRatio = 16 / 9,
  fitMode: "contain" | "cover" = "contain",
): RenderedVideoRect {
  if (containerWidth <= 0 || containerHeight <= 0 || videoAspectRatio <= 0) {
    return { offsetX: 0, offsetY: 0, width: containerWidth, height: containerHeight };
  }

  const containerAspectRatio = containerWidth / containerHeight;

  let width: number;
  let height: number;
  let offsetX: number;
  let offsetY: number;

  const fillWidth =
    fitMode === "contain"
      ? containerAspectRatio <= videoAspectRatio
      : containerAspectRatio >= videoAspectRatio;

  if (!fillWidth) {
    // Pillarboxed (black bars on left & right)
    height = containerHeight;
    width = height * videoAspectRatio;
    offsetX = (containerWidth - width) / 2;
    offsetY = 0;
  } else {
    // Letterboxed (black bars on top & bottom)
    width = containerWidth;
    height = width / videoAspectRatio;
    offsetX = 0;
    offsetY = (containerHeight - height) / 2;
  }

  return {
    offsetX,
    offsetY,
    width,
    height,
  };
}

/**
 * Maps viewport-local normalized coordinates to global canvas normalized coordinates when PTZ is active.
 */
export function compensatePtzCrop(
  viewportNx: number,
  viewportNy: number,
  ptzState?: VirtualPtzState | null
): { globalNx: number; globalNy: number } {
  if (!ptzState || ptzState.zoomFactor <= 1.01) {
    return { globalNx: viewportNx, globalNy: viewportNy };
  }

  const zoom = ptzState.zoomFactor;
  const cropW = CANVAS_BASE_WIDTH / zoom;
  const cropH = CANVAS_BASE_HEIGHT / zoom;

  const canvasX = ptzState.panOffsetX + viewportNx * cropW;
  const canvasY = ptzState.panOffsetY + viewportNy * cropH;

  const globalNx = Math.max(0, Math.min(1, canvasX / CANVAS_BASE_WIDTH));
  const globalNy = Math.max(0, Math.min(1, canvasY / CANVAS_BASE_HEIGHT));

  return {
    globalNx: parseFloat(globalNx.toFixed(4)),
    globalNy: parseFloat(globalNy.toFixed(4)),
  };
}

/**
 * Evaluates whether a normalized tap point hits a target bounding box with optional touch tolerance.
 */
export function isTargetHit(
  tapNx: number,
  tapNy: number,
  target: BoundingBoxRect,
  tolerancePadding = 0.035
): boolean {
  const xMin = target.nx - tolerancePadding;
  const yMin = target.ny - tolerancePadding;
  const xMax = target.nx + target.nw + tolerancePadding;
  const yMax = target.ny + target.nh + tolerancePadding;

  return tapNx >= xMin && tapNx <= xMax && tapNy >= yMin && tapNy <= yMax;
}

/**
 * Converts a raw click/touch client position into normalized (nx, ny) coordinates inside the video frame.
 */
export function clientToNormalizedVideoCoords(
  clientX: number,
  clientY: number,
  containerBoundingRect: { left: number; top: number; width: number; height: number },
  videoAspectRatio = 16 / 9,
  fitMode: "contain" | "cover" = "contain",
  ptzState?: VirtualPtzState | null
): NormalizedTapResult {
  const containerX = clientX - containerBoundingRect.left;
  const containerY = clientY - containerBoundingRect.top;

  // For contain, offsets are positive black bars. For cover, one offset is
  // negative because that part of the rendered video is cropped outside the
  // container. Mapping through the actual rendered rect keeps both modes in
  // the same source-video coordinate space.
  const rect = getRenderedVideoRect(
    containerBoundingRect.width,
    containerBoundingRect.height,
    videoAspectRatio,
    fitMode,
  );

  const isInsideContainer =
    containerX >= 0 &&
    containerX <= containerBoundingRect.width &&
    containerY >= 0 &&
    containerY <= containerBoundingRect.height;
  const isInsideX = containerX >= rect.offsetX && containerX <= rect.offsetX + rect.width;
  const isInsideY = containerY >= rect.offsetY && containerY <= rect.offsetY + rect.height;

  if (!isInsideContainer || !isInsideX || !isInsideY || rect.width <= 0 || rect.height <= 0) {
    return {
      isInsideVideo: false,
      nx: 0,
      ny: 0,
      globalNx: 0,
      globalNy: 0,
      renderedRect: rect,
    };
  }

  const rawNx = (containerX - rect.offsetX) / rect.width;
  const rawNy = (containerY - rect.offsetY) / rect.height;

  const nx = Math.max(0, Math.min(1, rawNx));
  const ny = Math.max(0, Math.min(1, rawNy));
  const { globalNx, globalNy } = compensatePtzCrop(nx, ny, ptzState);

  return {
    isInsideVideo: true,
    nx: parseFloat(nx.toFixed(4)),
    ny: parseFloat(ny.toFixed(4)),
    globalNx,
    globalNy,
    renderedRect: rect,
  };
}

/**
 * Maps a normalized (nx, ny) coordinate back into CSS pixel styles relative to the container.
 */
export function normalizedToContainerCss(
  nx: number,
  ny: number,
  containerWidth: number,
  containerHeight: number,
  videoAspectRatio = 16 / 9
): { left: number; top: number } {
  const rect = getRenderedVideoRect(containerWidth, containerHeight, videoAspectRatio);
  return {
    left: Math.round(rect.offsetX + nx * rect.width),
    top: Math.round(rect.offsetY + ny * rect.height),
  };
}
