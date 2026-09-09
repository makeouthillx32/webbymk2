import type { VirtualPtzState } from "../director-configuration/components/NavigationController";
import type { NormalizedBoundingBox } from "../server/directorVirtualAtlas";

export type FocusPhase =
  | "IDLE_WIDE"
  | "SETTLING"
  | "ZOOMING_IN"
  | "INSPECTING"
  | "ZOOMING_OUT"
  | "COOLDOWN";

export type FocusSubject = {
  id: string;
  cameraId: string;
  label: string;
  confidence: number;
  box: NormalizedBoundingBox;
  isMovement: boolean;
  velocity: number;
  identifiedName?: string;
};

export type FocusEngineState = {
  phase: FocusPhase;
  activeSubject: FocusSubject | null;
  currentPtz: VirtualPtzState;
  targetPtz: VirtualPtzState;
  phaseStartedAt: number;
  dwellDurationMs: number;
  inspectedConfidence: number;
  resolvedIdentity: string | null;
  lastFocusEndedAt: number;
};

export type FocusConfig = {
  canvasWidth: number;
  canvasHeight: number;
  minConfidenceToTrigger: number;
  resolvedConfidenceTarget: number;
  movementVelocityThreshold: number;
  settleDurationMs: number;
  zoomInDurationMs: number;
  inspectDurationMs: number;
  zoomOutDurationMs: number;
  cooldownDurationMs: number;
  maxZoom: number;
  paddingFactor: number;
};

export const DEFAULT_FOCUS_CONFIG: FocusConfig = {
  canvasWidth: 3840,
  canvasHeight: 2160,
  minConfidenceToTrigger: 0.85,
  resolvedConfidenceTarget: 0.95,
  movementVelocityThreshold: 0.03, // normalized frame unit / s
  settleDurationMs: 800,
  zoomInDurationMs: 450,
  inspectDurationMs: 1500,
  zoomOutDurationMs: 600,
  cooldownDurationMs: 5000,
  maxZoom: 3.5,
  paddingFactor: 1.35,
};

export const DEFAULT_FOCUS_ENGINE_STATE: FocusEngineState = {
  phase: "IDLE_WIDE",
  activeSubject: null,
  currentPtz: {
    zoomFactor: 1.0,
    panOffsetX: 0,
    panOffsetY: 0,
    zoomSpeed: 5,
  },
  targetPtz: {
    zoomFactor: 1.0,
    panOffsetX: 0,
    panOffsetY: 0,
    zoomSpeed: 5,
  },
  phaseStartedAt: 0,
  dwellDurationMs: 0,
  inspectedConfidence: 0,
  resolvedIdentity: null,
  lastFocusEndedAt: 0,
};

/**
 * Computes exact virtual PTZ pan and zoom to frame a normalized bounding box.
 */
export function calculateBoundingBoxPtz(
  box: NormalizedBoundingBox,
  config: FocusConfig = DEFAULT_FOCUS_CONFIG,
): VirtualPtzState {
  const { canvasWidth, canvasHeight, maxZoom, paddingFactor } = config;

  const boxW = Math.max(0.01, Math.min(1.0, box.width));
  const boxH = Math.max(0.01, Math.min(1.0, box.height));

  // Natural framing zoom factor with padding
  const requiredZoomX = 1.0 / (boxW * paddingFactor);
  const requiredZoomY = 1.0 / (boxH * paddingFactor);
  const rawZoom = Math.min(requiredZoomX, requiredZoomY);
  const zoomFactor = Math.max(1.0, Math.min(maxZoom, rawZoom));

  // Effective viewport crop dimensions
  const cropW = canvasWidth / zoomFactor;
  const cropH = canvasHeight / zoomFactor;

  // Center coordinate in canvas pixels
  const centerX = (box.x + boxW / 2) * canvasWidth;
  const centerY = (box.y + boxH / 2) * canvasHeight;

  // Clamped pan offsets (never bleed outside 0..canvas bounds)
  const maxPanX = Math.max(0, canvasWidth - cropW);
  const maxPanY = Math.max(0, canvasHeight - cropH);

  const panOffsetX = Math.max(0, Math.min(maxPanX, Math.round(centerX - cropW / 2)));
  const panOffsetY = Math.max(0, Math.min(maxPanY, Math.round(centerY - cropH / 2)));

  return {
    zoomFactor: Number(zoomFactor.toFixed(2)),
    panOffsetX,
    panOffsetY,
    zoomSpeed: 5,
  };
}

/**
 * Standard cubic ease-in-out interpolation curve.
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Interpolates smoothly between two VirtualPtzStates.
 */
export function lerpPtz(
  from: VirtualPtzState,
  to: VirtualPtzState,
  progress: number,
): VirtualPtzState {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const t = easeInOutCubic(clampedProgress);

  return {
    zoomFactor: Number((from.zoomFactor + (to.zoomFactor - from.zoomFactor) * t).toFixed(2)),
    panOffsetX: Math.round(from.panOffsetX + (to.panOffsetX - from.panOffsetX) * t),
    panOffsetY: Math.round(from.panOffsetY + (to.panOffsetY - from.panOffsetY) * t),
    zoomSpeed: from.zoomSpeed,
    speedMode: from.speedMode,
  };
}

/**
 * Advances the Focus finite state machine by one simulation step.
 */
export function stepFocusEngine(
  state: FocusEngineState,
  availableSubjects: FocusSubject[],
  now = Date.now(),
  config = DEFAULT_FOCUS_CONFIG,
): FocusEngineState {
  const widePtz: VirtualPtzState = {
    zoomFactor: 1.0,
    panOffsetX: 0,
    panOffsetY: 0,
    zoomSpeed: 5,
  };

  switch (state.phase) {
    case "IDLE_WIDE": {
      // Respect cooldown period between focus cycles
      if (now - state.lastFocusEndedAt < config.cooldownDurationMs) {
        return state;
      }

      // Find an ambiguous subject (confidence < threshold) with NO active movement
      const candidate = availableSubjects.find(
        (s) =>
          s.confidence < config.minConfidenceToTrigger &&
          !s.isMovement &&
          s.velocity < config.movementVelocityThreshold,
      );

      if (candidate) {
        return {
          ...state,
          phase: "SETTLING",
          activeSubject: candidate,
          phaseStartedAt: now,
        };
      }
      return state;
    }

    case "SETTLING": {
      if (!state.activeSubject) {
        return { ...state, phase: "IDLE_WIDE", phaseStartedAt: now };
      }

      // Check if subject started moving again during settle check
      const currentSub = availableSubjects.find(
        (s) => s.id === state.activeSubject?.id || s.cameraId === state.activeSubject?.cameraId,
      );

      if (!currentSub || currentSub.isMovement || currentSub.velocity >= config.movementVelocityThreshold) {
        // Movement detected or subject left — abort focus and stay wide
        return {
          ...state,
          phase: "IDLE_WIDE",
          activeSubject: null,
          lastFocusEndedAt: now,
          currentPtz: widePtz,
          targetPtz: widePtz,
        };
      }

      // If settled duration reached, trigger zoom in
      if (now - state.phaseStartedAt >= config.settleDurationMs) {
        const targetPtz = calculateBoundingBoxPtz(currentSub.box, config);
        return {
          ...state,
          phase: "ZOOMING_IN",
          activeSubject: currentSub,
          phaseStartedAt: now,
          targetPtz,
        };
      }

      return state;
    }

    case "ZOOMING_IN": {
      const elapsed = now - state.phaseStartedAt;
      const progress = elapsed / config.zoomInDurationMs;

      if (progress >= 1.0) {
        return {
          ...state,
          phase: "INSPECTING",
          currentPtz: state.targetPtz,
          phaseStartedAt: now,
          inspectedConfidence: state.activeSubject?.confidence ?? 0.8,
        };
      }

      const currentPtz = lerpPtz(widePtz, state.targetPtz, progress);
      return { ...state, currentPtz };
    }

    case "INSPECTING": {
      const elapsed = now - state.phaseStartedAt;
      const progress = Math.min(1.0, elapsed / config.inspectDurationMs);

      // Simulate increasing confidence and resolution discovery during inspection dwell
      const boost = (config.resolvedConfidenceTarget - (state.activeSubject?.confidence ?? 0.8)) * progress;
      const inspectedConfidence = Number(
        Math.min(config.resolvedConfidenceTarget, (state.activeSubject?.confidence ?? 0.8) + boost).toFixed(2),
      );

      const resolvedIdentity =
        state.activeSubject?.identifiedName ||
        (state.activeSubject?.label === "person" ? "Tyler" : state.activeSubject?.label ?? "Subject");

      if (elapsed >= config.inspectDurationMs) {
        return {
          ...state,
          phase: "ZOOMING_OUT",
          phaseStartedAt: now,
          inspectedConfidence,
          resolvedIdentity,
        };
      }

      return {
        ...state,
        inspectedConfidence,
        resolvedIdentity,
      };
    }

    case "ZOOMING_OUT": {
      const elapsed = now - state.phaseStartedAt;
      const progress = elapsed / config.zoomOutDurationMs;

      if (progress >= 1.0) {
        return {
          ...state,
          phase: "COOLDOWN",
          currentPtz: widePtz,
          targetPtz: widePtz,
          phaseStartedAt: now,
          lastFocusEndedAt: now,
        };
      }

      const currentPtz = lerpPtz(state.targetPtz, widePtz, progress);
      return { ...state, currentPtz };
    }

    case "COOLDOWN": {
      if (now - state.phaseStartedAt >= config.cooldownDurationMs) {
        return {
          ...state,
          phase: "IDLE_WIDE",
          activeSubject: null,
          resolvedIdentity: null,
          inspectedConfidence: 0,
        };
      }
      return state;
    }

    default:
      return state;
  }
}
