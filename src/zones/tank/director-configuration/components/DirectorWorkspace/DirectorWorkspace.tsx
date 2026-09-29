"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Grid,
  Crosshair,
  Layers,
  Gamepad2,
  Tv,
  ArrowLeft,
  Video,
  Volume2,
  Users,
  UserCheck,
  Footprints,
  Play,
  Pause,
  Sparkles,
  Flame,
} from "lucide-react";
import Link from "next/link";
import { ChromePanel } from "../../../public/components/ChromePanel";
import { ConsoleButton } from "../../../public/components/ConsoleButton";
import { ACTIVE_THEME } from "../../../theme";
import {
  computeDynamicAtlasLayout,
  evaluateDirectorStep,
  type DirectorViewportState,
  type SubjectMode,
  type FramingMode,
  type MotionCurve,
  type CameraTelemetryInput,
  type DetectionCategoryFilters,
  DEFAULT_DETECTION_FILTERS,
  DEFAULT_CAMERA_TILES,
} from "../../../server/directorVirtualAtlas";
import { useTankCameras } from "../../../public/useTankCameras";
import { cameras as fixtureCameras } from "../../../fixtures";
import { VirtualCanvas } from "../VirtualCanvas";
import { defaultOverlayVisibility } from "../../overlayRegistry";
import type { HouseMember } from "../../../server/houseMembers";
import { useServerDirector } from "../../../director/useServerDirector";
import { ChaosWorkshopPanel } from "../ChaosWorkshop/ChaosWorkshopPanel";
import { useRotationRoster } from "@/zones/tank/director/useRotationRoster";
import type { ServerDirectorState } from "../../../server/serverDirectorEngine";
import type { RotationRoster } from "../../../server/rotationRoster";

// The three enrolled housemates. Placeholder identities until real enrolment
// exists — swap detectorLabel for whatever the enrolment pipeline emits, and
// this is the only place that needs to change.
const HOUSE_MEMBERS: HouseMember[] = [
  { id: "member_01", displayName: "Housemate 1", detectorLabel: "member_01" },
  { id: "member_02", displayName: "Housemate 2", detectorLabel: "member_02" },
  { id: "member_03", displayName: "Housemate 3", detectorLabel: "member_03" },
];
import {
  DirectionalSnappingPad,
  JoystickTelemetry,
  ManualPtzController,
  type VirtualPtzState,
} from "../NavigationController";
import {
  SubjectModeSelector,
  FramingModeSelector,
  MotionKinematicsSelector,
} from "../CinematographyMatrix";
import { TouchDesignerBridge } from "../TouchDesignerBridge";
import { LiveProgramMonitor } from "../LiveProgramMonitor";
import {
  stepFocusEngine,
  DEFAULT_FOCUS_ENGINE_STATE,
  type FocusEngineState,
  type FocusSubject,
} from "../../../director/focusEngine";
import {
  stepGroupFramingEngine,
  DEFAULT_GROUP_FRAMING_STATE,
  type GroupFramingState,
  type GroupMemberBox,
} from "../../../director/groupFramingEngine";
import {
  stepAnimalFramingEngine,
  DEFAULT_ANIMAL_FRAMING_STATE,
  type AnimalFramingState,
} from "../../../director/animalFramingEngine";
import { PredictiveRadarPanel } from "../PredictiveRadar";
import {
  calculatePotentialNextRoom,
  extractModeCandidates,
  type TrackingSpeed,
} from "../../../director/aiTrackingFraming";
import {
  DEFAULT_GIMBAL_SMOOTHNESS,
  aimToPtz,
  initialFramingAim,
  stepFramingAim,
  type FramingAimState,
} from "../../../director/gimbal";

const GIMBAL_SMOOTHNESS_STORAGE_KEY = "tank.director.gimbalSmoothness";

export type DirectorWorkspaceProps = {
  initialServerDirector?: Partial<ServerDirectorState> | null;
  initialMode?: SubjectMode | null;
  initialRoster?: RotationRoster | null;
};

export function DirectorWorkspace({
  initialServerDirector,
  initialMode,
  initialRoster,
}: DirectorWorkspaceProps = {}) {
  const { snapshot, liveById, isOnline } = useTankCameras();
  const serverDirector = useServerDirector({ initialState: initialServerDirector });

  const [directorState, setDirectorState] = useState<DirectorViewportState>({
    activeCameraId: initialServerDirector?.activeCameraId || "cam-1786768240090",
    activeCameraSlug: initialServerDirector?.activeRoomKey || "game-room",
    subjectMode: initialMode || "speaker",
    framingMode: "camera",
    motionCurve: "snap",
    viewportX: 0,
    viewportY: 0,
    viewportWidth: 3840,
    viewportHeight: 2160,
    zoomFactor: 1,
    currentScore: 100,
    shotStartedAt: Date.now(),
    challengerId: null,
    challengerSince: null,
    scores: [],
    rotationCameraIds: initialRoster?.cameraIds || [],
    rotationIntervalMs: initialRoster?.intervalMs || 170_000,
    rotationIndex: 0,
    rotationSlotStartedAt: null,
  });

  // Mode defaults to server mode if pre-hydrated, otherwise audio detection ("speaker")
  const [subjectMode, setSubjectMode] = useState<SubjectMode>(initialMode || "speaker");
  const [followMember, setFollowMember] = useState<string | null>(null);
  const [followable, setFollowable] = useState<Array<{ slug: string; displayName: string; kind: "person" | "pet"; guest?: boolean }> | undefined>(undefined);
  const [enrollment, setEnrollment] = useState<{ slug: string; name: string; startedAt: string; kind?: "guest" | "member" } | null>(null);
  const [modeAttached, setModeAttached] = useState(Boolean(initialMode));
  const [modeAttachError, setModeAttachError] = useState<string | null>(null);
  // Why this browser cannot change the director right now (null = it can).
  // Refused changes used to fail silently and the 5 s resync put the server's
  // mode back, which read as "it keeps going back to Dog" (2026-09-19).
  const [controlDenial, setControlDenial] = useState<ControlDenial | null>(null);
  const [modeRejected, setModeRejected] = useState<string | null>(null);

  // Connection barrier: true until initial mode and central server state are confirmed
  const isConnecting = !modeAttached && !Boolean(initialMode);

  const pilotIdRef = useRef<string | null>(null);
  const pendingCameraRef = useRef<{ cameraId: string; expiresAt: number } | null>(null);
  const manualPilotPayloadRef = useRef<{
    activeCameraId: string;
    activeRoomKey: string;
    ptzState: VirtualPtzState;
  }>({
    activeCameraId: directorState.activeCameraId,
    activeRoomKey: "director",
    ptzState: { zoomFactor: 1, panOffsetX: 0, panOffsetY: 0, zoomSpeed: 5, speedMode: "fine" },
  });

  // ── Mode sync with the REAL director ─────────────────────────────────────
  // Adopts the live durable mode so the console opens showing what the 24/7
  // director is ACTUALLY doing rather than its own default.
  useEffect(() => {
    let cancelled = false;
    const attach = async () => {
      try {
        const res = await fetch("/api/tank/director/mode", { cache: "no-store" });
        if (!res.ok) throw new Error("Director mode endpoint unavailable");
        const body = await res.json();
        const serverMode = body?.operatorMode ?? body?.effectiveMode;
        if (cancelled || !serverMode) return;
        setFollowMember(typeof body?.followMember === "string" ? body.followMember : null);
        if (Array.isArray(body?.followable)) setFollowable(body.followable);
        setEnrollment(body?.enrollment ?? null);
        if (typeof body?.canControl === "boolean") {
          setControlDenial(body.canControl ? null : ((body?.denial as ControlDenial | undefined) ?? "signed-out"));
        }
        setSubjectMode(serverMode as SubjectMode);
        setDirectorState((prev) =>
          prev.subjectMode === (serverMode as SubjectMode)
            ? prev
            : { ...prev, subjectMode: serverMode as SubjectMode }
        );
        setModeAttached(true);
        setModeAttachError(null);
      } catch {
        if (!cancelled) setModeAttachError("Server Director unavailable");
      }
    };
    void attach();
    const retry = window.setInterval(attach, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(retry);
    };
  }, [setDirectorState]);

  // Start or finish an enrollment. The server answers with the mode it settled
  // on: Enroll while a session runs, Follow Member on the new guest after.
  const sendEnrollment = useCallback(async (payload: Record<string, unknown>) => {
    try {
      const response = await fetch("/api/tank/director/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        const denial = denialFromResponse(response.status, body);
        if (denial) setControlDenial(denial);
        throw new Error(body?.error ?? "Director rejected the enrollment");
      }
      setEnrollment(body?.enrollment ?? null);
      setFollowMember(typeof body?.followMember === "string" ? body.followMember : null);
      const savedMode = body?.operatorMode ?? body?.effectiveMode;
      if (savedMode) {
        setSubjectMode(savedMode as SubjectMode);
        setDirectorState((prev) => (prev.subjectMode === savedMode ? prev : { ...prev, subjectMode: savedMode as SubjectMode }));
      }
      setModeAttachError(null);
    } catch (error) {
      setModeAttachError(error instanceof Error ? error.message : "Enrollment failed");
    }
  }, [setDirectorState]);

  // The rotation roster is server state; this panel is a client of it.
  const rotationRoster = useRotationRoster(15_000, initialRoster);

  const selectSubjectMode = useCallback((mode: SubjectMode, member?: string) => {
    // Enroll needs a name before the director can act on it: show the name box
    // first, and only tell the server once there is a guest to follow.
    if (mode === "enroll" && !enrollment) {
      setSubjectMode(mode);
      return;
    }
    const previousMode = subjectMode;
    setSubjectMode(mode);
    if (member !== undefined) setFollowMember(member);
    setDirectorState((prev) => (prev.subjectMode === mode ? prev : { ...prev, subjectMode: mode }));
    setModeRejected(null);
    void (async () => {
      try {
        const response = await fetch("/api/tank/director/mode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // followMember is only sent when a member was picked, so changing
          // modes never forgets who Follow Member was following.
          body: JSON.stringify(member === undefined ? { mode } : { mode, followMember: member }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          // Put the real mode back at once and say why, rather than showing
          // the pick until the next resync silently undoes it.
          const denial = denialFromResponse(response.status, body);
          if (denial) setControlDenial(denial);
          setSubjectMode(previousMode);
          setDirectorState((prev) => (prev.subjectMode === previousMode ? prev : { ...prev, subjectMode: previousMode }));
          setModeRejected(body?.error ?? `The director refused ${mode} (HTTP ${response.status})`);
          return;
        }
        setControlDenial(null);
        setFollowMember(typeof body?.followMember === "string" ? body.followMember : null);
        const savedMode = body?.operatorMode ?? body?.effectiveMode;
        if (savedMode) {
          setSubjectMode(savedMode as SubjectMode);
          setDirectorState((prev) =>
            prev.subjectMode === (savedMode as SubjectMode)
              ? prev
              : { ...prev, subjectMode: savedMode as SubjectMode }
          );
        }
        setModeAttached(true);
        setModeAttachError(null);
      } catch {
        setSubjectMode(previousMode);
        setDirectorState((prev) => (prev.subjectMode === previousMode ? prev : { ...prev, subjectMode: previousMode }));
        setModeRejected("Could not reach the director — your change was not saved");
      }
    })();
  }, [enrollment, setDirectorState, subjectMode]);
  const [framingMode, setFramingMode] = useState<FramingMode>("camera");
  const [motionCurve, setMotionCurve] = useState<MotionCurve>("snap");
  const [showDetectionBoxes, setShowDetectionBoxes] = useState<boolean>(true);
  const [detectionFilters, setDetectionFilters] = useState<DetectionCategoryFilters>(DEFAULT_DETECTION_FILTERS);
  const [gamepadConnected, setGamepadConnected] = useState<boolean>(false);
  const [autoSimulateAudio, setAutoSimulateAudio] = useState<boolean>(true);
  // Off by default: its zoom-in / inspect / zoom-out / 5 s-wide cycle outranked
  // the chosen framing and made the shot bounce (Molly, 2026-09-19).
  const [aiFocusEnabled, setAiFocusEnabled] = useState<boolean>(false);
  const [focusState, setFocusState] = useState<FocusEngineState>(DEFAULT_FOCUS_ENGINE_STATE);
  const [groupFramingState, setGroupFramingState] = useState<GroupFramingState>(DEFAULT_GROUP_FRAMING_STATE);
  const [animalFramingState, setAnimalFramingState] = useState<AnimalFramingState>(DEFAULT_ANIMAL_FRAMING_STATE);
  const [manualPtzState, setManualPtzState] = useState<VirtualPtzState>({
    zoomFactor: 1,
    panOffsetX: 0,
    panOffsetY: 0,
    zoomSpeed: 5,
    speedMode: "fine",
  });
  const [trackingSpeed, setTrackingSpeed] = useState<TrackingSpeed>("standard");
  const [gimbalSmoothness, setGimbalSmoothness] = useState<number>(DEFAULT_GIMBAL_SMOOTHNESS);
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(GIMBAL_SMOOTHNESS_STORAGE_KEY));
      if (saved >= 1 && saved <= 10) setGimbalSmoothness(saved);
    } catch {
      // Storage blocked: the default dial is fine.
    }
  }, []);
  const changeGimbalSmoothness = useCallback((level: number) => {
    setGimbalSmoothness(level);
    try {
      window.localStorage.setItem(GIMBAL_SMOOTHNESS_STORAGE_KEY, String(level));
    } catch {
      // Not remembered this time; still applied.
    }
  }, []);
  const [isRoomLocked, setIsRoomLocked] = useState<boolean>(false);
  const [aiPtzState, setAiPtzState] = useState<VirtualPtzState>({
    zoomFactor: 1,
    panOffsetX: 0,
    panOffsetY: 0,
    zoomSpeed: 5,
    speedMode: "fine",
  });

  // Extract REAL cameras from live platform snapshot or real fixtures
  const realCameras = useMemo(() => {
    // Only cameras that survived deriveRooms().
    //
    // snapshot.cameras is the UNFILTERED directory; snapshot.rooms is the same
    // set after room visibility policy. Reading .cameras directly meant the
    // matrix — and the rotation roster built from it — kept showing an OBS room
    // that had no publisher, because projectObsRoomCamera() marks every OBS
    // room publicVisible:true and lets deriveRooms() do the dropping under
    // "live-only". The public site reads rooms and was correct; this surface
    // read cameras and was not.
    //
    // Filtering by room membership rather than re-testing presence here keeps
    // deriveRooms() the single owner of that policy, and picks up the
    // tank_rooms.is_offline kill-switch for free — this surface ignored that
    // too. Safe as a complete partition: /api/tank/cameras is already
    // publicVisible-filtered, and deriveRooms groups every publicVisible
    // camera by roomScope, so anything absent from a room was dropped on
    // purpose.
    const liveCameraIds = new Set((snapshot?.rooms ?? []).flatMap((room) => room.cameraIds));
    const discovered = (snapshot?.cameras ?? []).filter((c) => liveCameraIds.has(c.id));
    if (discovered.length > 0) {
      return discovered.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug || c.id,
        kind: (c.protocol === "rtmp"
          ? "obs"
          : c.protocol === "srt" || c.protocol === "srtla"
          ? "irlcam"
          : c.protocol === "usb"
          ? "usbcam"
          : "ipcam") as "ipcam" | "irlcam" | "usbcam" | "obs",
      }));
    }
    // Fallback strictly to real fixture cameras (no dummy rooms)
    return fixtureCameras.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug || c.id,
      kind: (c.id.includes("remote") ? "irlcam" : "ipcam") as "ipcam" | "irlcam" | "usbcam" | "obs",
    }));
  }, [snapshot]);

  // Dynamic Atlas layout based on REAL active cameras
  const atlasLayout = useMemo(() => computeDynamicAtlasLayout(realCameras), [realCameras]);

  // Telemetry inputs for active cameras
  const [inputs, setInputs] = useState<CameraTelemetryInput[]>([]);

  useEffect(() => {
    // Initialize telemetry for active cameras
    setInputs((prev) => {
      return realCameras.map((cam, idx) => {
        const existing = prev.find((p) => p.cameraId === cam.id);
        const boundingBoxes: Array<{
          nx: number;
          ny: number;
          nw: number;
          nh: number;
          label: string;
          confidence?: number;
          depthZone?: "foreground" | "midground" | "background";
        }> = [];

        if (idx === 0) {
          // Game Room: floor debris / object detection
          boundingBoxes.push({
            nx: 0.38,
            ny: 0.70,
            nw: 0.09,
            nh: 0.13,
            label: "trash",
            confidence: 0.50,
            depthZone: "foreground",
          });
        } else if (idx === 1) {
          // Living Room: floor toy / suspected trash on carpet
          boundingBoxes.push({
            nx: 0.51,
            ny: 0.62,
            nw: 0.08,
            nh: 0.11,
            label: "trash",
            confidence: 0.50,
            depthZone: "foreground",
          });
        }

        return {
          cameraId: cam.id,
          peopleCount: idx === 0 ? 3 : idx === 1 ? 1 : 0,
          visibleFeetCount: idx === 0 ? 6 : idx === 1 ? 2 : 0,
          feetConfidence: 0.94,
          faceCount: idx === 0 ? 3 : 1,
          motionScore: 0.25,
          audioPeak: idx === 0 ? 75 : 20 + idx * 8,
          isSpeaking: idx === 0,
          targetMemberDetected: idx === 0 ? "@admin" : null,
          targetMemberConfidence: 0.99,
          boundingBoxes,
        };
      });
    });
  }, [realCameras]);


  // Real detection readings, from the server telemetry store — not the local
  // fixture below. Anything that POSTs to /api/tank/director/telemetry shows
  // up here; before this existed the canvas could never have shown a real
  // box no matter what posted, because this screen never asked the server
  // for anything.
  // Everything on, so "turn on everything" actually shows everything the
  // first time this screen opens. The toggle panel narrows this down later.
  const overlayVisibility = useMemo(
    () => ({ ...defaultOverlayVisibility(), person: true, member: true, guest: true, trash: true, clutter: true }),
    [],
  );

  // Posts synthetic-but-real telemetry through the actual ingest endpoint so
  // the whole pipeline can be verified before TouchDesigner exists to drive
  // it. This is the ONLY thing in this file that writes real detection data —
  // everything else here only reads and displays it.
  const [simulateDetection, setSimulateDetection] = useState(false);
  useEffect(() => {
    if (!simulateDetection || realCameras.length === 0) return;

    let tick = 0;
    const post = async () => {
      // One housemate at a time, rotating through rooms — matches "we just
      // need to snap to the right position" rather than flooding every room
      // with a body at once.
      const cam = realCameras[tick % realCameras.length];
      const memberIndex = tick % HOUSE_MEMBERS.length;
      const member = HOUSE_MEMBERS[memberIndex];
      tick += 1;

      const audioPeak = 30 + Math.round(Math.random() * 50);
      const cameras = [
        {
          cameraId: cam.id,
          peopleCount: 1,
          visibleFeetCount: 2,
          feetConfidence: 0.9,
          faceCount: 1,
          motionScore: 0.4 + Math.random() * 0.3,
          audioPeak,
          isSpeaking: audioPeak > 55,
          targetMemberDetected: member.detectorLabel,
          targetMemberConfidence: 0.9,
          boundingBoxes: [
            {
              // Centred, human-proportioned box — real values, not a fixed
              // demo position, so the canvas-space conversion is genuinely
              // exercised rather than always landing in the same spot.
              nx: 0.35 + Math.random() * 0.15,
              ny: 0.15 + Math.random() * 0.1,
              nw: 0.22,
              nh: 0.7,
              label: "person",
              depthZone: "midground" as const,
            },
            {
              nx: 0.42 + (tick % 2 === 0 ? 0.05 : -0.05),
              ny: 0.68 + (tick % 3 === 0 ? 0.04 : 0),
              nw: 0.08,
              nh: 0.12,
              label: "trash",
              confidence: 0.50,
              depthZone: "foreground" as const,
            },
          ],
        },
      ];

      try {
        await fetch("/api/tank/director/telemetry/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: subjectMode, cameras }),
        });
      } catch {
        // A dropped tick just means this room's box is briefly stale; the
        // next tick corrects it.
      }
    };

    void post();
    const id = setInterval(post, 1500);
    return () => clearInterval(id);
  }, [simulateDetection, realCameras, subjectMode]);

  const [liveTelemetry, setLiveTelemetry] = useState<CameraTelemetryInput[]>([]);
  const [serverDetectionActive, setServerDetectionActive] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/tank/director/telemetry/live", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) {
            if (Array.isArray(json?.telemetry)) setLiveTelemetry(json.telemetry);
            setServerDetectionActive(Boolean(json?.serverDetectionActive));
          }
        }
      } catch {
        // A missed poll just means the canvas shows last-known state for one
        // more tick — the 4s server-side TTL is the real staleness guard.
      }
    };
    void poll();
    const id = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const mergedTelemetry = useMemo(() => {
    if (!simulateDetection) return liveTelemetry;
    const liveById2 = new Map(liveTelemetry.map((t) => [t.cameraId, t]));
    return inputs.map((local) => liveById2.get(local.cameraId) ?? local);
  }, [inputs, liveTelemetry, simulateDetection]);

  // realCameras[0] is always Game Room — it's first in config.json's fixed
  // camera order, which is DB/config authoring order, not "most relevant
  // room right now". With no real detection signal (see realDetectionEnabled
  // above), the scorer below never gathers enough of a sustained lead to
  // trigger evaluateDirectorStep's hysteresis-gated switch away from
  // whatever this starts on — so a hardcoded [0] here reads as "the director
  // always defaults to Game Room" on every fresh page load, confirmed live
  // 2026-08-23. Preferring the first ONLINE camera is real data instead of
  // authoring-order bias, though it's still an arbitrary tiebreak among
  // several online cameras — the actual fix is real detection telemetry.
  const firstOnlineCamera = realCameras.find((cam) => isOnline(cam.id)) ?? realCameras[0];
  const defaultActiveId = firstOnlineCamera?.id ?? "cam-1786768240090";
  const defaultActiveSlug = firstOnlineCamera?.slug ?? "cam0";

  // The configurator is a client of the central Director, never its clock.
  // Realtime + the server-state poll in useServerDirector keep this monitor on
  // the same camera as the OBS overlay even after the page is refreshed or no
  // operator has had the console open for hours.
  useEffect(() => {
    if (!serverDirector.activeCameraId || simulateDetection) return;

    // Operator Room Lock protection: Keep active camera pinned and ignore background cuts
    if (isRoomLocked) return;

    // Anti-rubberband protection: If user clicked a camera in manual mode,
    // ignore stale polling ticks from the previous room until the server
    // acknowledges the target camera or the 3-second safety window elapses.
    if (pendingCameraRef.current) {
      if (Date.now() < pendingCameraRef.current.expiresAt) {
        if (serverDirector.activeCameraId !== pendingCameraRef.current.cameraId) {
          return;
        }
      }
      pendingCameraRef.current = null;
    }

    const serverCamera = realCameras.find((camera) => camera.id === serverDirector.activeCameraId);
    const serverTile = atlasLayout.tiles.find((tile) => tile.cameraId === serverDirector.activeCameraId);
    setDirectorState((previous) => {
      if (
        previous.activeCameraId === serverDirector.activeCameraId &&
        previous.activeCameraSlug === (serverCamera?.slug ?? serverTile?.slug ?? previous.activeCameraSlug)
      ) {
        return previous;
      }
      return {
        ...previous,
        activeCameraId: serverDirector.activeCameraId,
        activeCameraSlug: serverCamera?.slug ?? serverTile?.slug ?? previous.activeCameraSlug,
        viewportX: serverTile?.xMin ?? previous.viewportX,
        viewportY: serverTile?.yMin ?? previous.viewportY,
        shotStartedAt: Date.now(),
      };
    });
  }, [
    atlasLayout.tiles,
    realCameras,
    serverDirector.activeCameraId,
    simulateDetection,
    isRoomLocked,
  ]);

  // ═══════════ REAL-TIME AUDIO SIMULATION ENGINE (AUTO-DELEGATION) ═══════════
  useEffect(() => {
    if (!simulateDetection || !autoSimulateAudio || subjectMode !== "speaker") return;

    const interval = setInterval(() => {
      setInputs((prev) => {
        return prev.map((inp) => {
          const delta = (Math.random() - 0.5) * 6;
          let newPeak = Math.max(10, Math.min(95, inp.audioPeak + delta));

          // Random speech burst in a room
          if (Math.random() > 0.95) {
            newPeak = Math.min(95, 72 + Math.floor(Math.random() * 23));
          }

          if (newPeak > 75 && Math.random() > 0.4) {
            newPeak -= 10;
          }

          const isSpeaking = newPeak >= 55;
          return {
            ...inp,
            audioPeak: Math.round(newPeak),
            isSpeaking,
          };
        });
      });
    }, 400);

    return () => clearInterval(interval);
  }, [autoSimulateAudio, simulateDetection, subjectMode]);

  // Re-evaluate on mode, telemetry or canvas layout change
  useEffect(() => {
    if (!simulateDetection) return;
    const timer = setInterval(() => {
      setDirectorState((prev) => {
        const next = evaluateDirectorStep(
          { ...prev, subjectMode, framingMode, motionCurve },
          inputs,
          atlasLayout.tiles,
          Date.now()
        );
        if (isRoomLocked) {
          return {
            ...next,
            activeCameraId: prev.activeCameraId,
            activeCameraSlug: prev.activeCameraSlug,
          };
        }
        return next;
      });
    }, 150);

    return () => clearInterval(timer);
  }, [subjectMode, framingMode, motionCurve, inputs, atlasLayout, simulateDetection, isRoomLocked]);

  const currentActiveTile = useMemo(() => {
    return (
      atlasLayout.tiles.find((t) => t.cameraId === directorState.activeCameraId) ||
      atlasLayout.tiles[0] ||
      DEFAULT_CAMERA_TILES[0]
    );
  }, [atlasLayout, directorState.activeCameraId, defaultActiveId, defaultActiveSlug]);

  const activeLiveCam = useMemo(() => {
    return liveById.get(directorState.activeCameraId);
  }, [liveById, directorState.activeCameraId]);

  manualPilotPayloadRef.current = {
    activeCameraId: directorState.activeCameraId,
    activeRoomKey: activeLiveCam?.roomScope || currentActiveTile.slug || "director",
    ptzState: manualPtzState,
  };

  const dispatchPilotClaim = useCallback(
    async (
      targetCameraId: string,
      targetRoomKey: string,
      ptz: VirtualPtzState = manualPtzState,
      action: "claim" | "release" = "claim"
    ) => {
      pilotIdRef.current ??=
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `director-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const pilotId = pilotIdRef.current;

      try {
        await fetch("/api/tank/director/pilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            pilotId,
            connectionType: "browser_web",
            activeCameraId: targetCameraId,
            activeRoomKey: targetRoomKey,
            ptzState: ptz,
            forceTakeover: true,
          }),
          keepalive: action === "release",
        });
      } catch {
        // Next heartbeat retries
      }
    },
    [manualPtzState]
  );

  const handleSelectCamera = useCallback(
    (cameraId: string, slug: string, xMin: number, yMin: number) => {
      // 1. Lock out stale ticks for 3 seconds while cut propagates to central server
      pendingCameraRef.current = { cameraId, expiresAt: Date.now() + 3000 };

      // 2. Put local UI into manual mode immediately
      selectSubjectMode("manual");
      setDirectorState((prev) => ({
        ...prev,
        activeCameraId: cameraId,
        activeCameraSlug: slug,
        subjectMode: "manual",
        viewportX: xMin,
        viewportY: yMin,
        shotStartedAt: Date.now(),
      }));

      // 3. Immediately dispatch pilot claim to central server so broadcast cuts immediately
      const targetRoomKey = liveById.get(cameraId)?.roomScope || slug || "director";
      void dispatchPilotClaim(cameraId, targetRoomKey, manualPtzState, "claim");
    },
    [dispatchPilotClaim, liveById, manualPtzState, selectSubjectMode, setDirectorState]
  );

  // 1. Audio Speech Trigger
  const handleTriggerSpeech = (targetCamId: string, peakDb: number) => {
    setInputs((prev) =>
      prev.map((inp) => {
        if (inp.cameraId === targetCamId) {
          return { ...inp, audioPeak: peakDb, isSpeaking: true };
        }
        return {
          ...inp,
          audioPeak: Math.max(12, Math.round(inp.audioPeak * 0.4)),
          isSpeaking: false,
        };
      })
    );
  };

  // 2. Group Size Scenario Trigger
  const handleTriggerGroup = (targetCamId: string, groupSize: number) => {
    setInputs((prev) =>
      prev.map((inp) => {
        if (inp.cameraId === targetCamId) {
          return {
            ...inp,
            peopleCount: groupSize,
            faceCount: groupSize,
            visibleFeetCount: groupSize * 2,
          };
        }
        return {
          ...inp,
          peopleCount: Math.min(1, inp.peopleCount),
          faceCount: Math.min(1, inp.faceCount),
          visibleFeetCount: Math.min(2, inp.visibleFeetCount),
        };
      })
    );
  };

  // 3. Member / VIP Facial Tracking Trigger (Item Simulation)
  const handleTriggerMemberLock = (targetCamId: string, memberTag: string) => {
    setInputs((prev) =>
      prev.map((inp) => {
        if (inp.cameraId === targetCamId) {
          return {
            ...inp,
            targetMemberDetected: memberTag,
            targetMemberConfidence: 0.99,
            faceCount: Math.max(1, inp.faceCount),
          };
        }
        return {
          ...inp,
          targetMemberDetected: null,
          targetMemberConfidence: 0,
        };
      })
    );
  };

  // Directional Snapping Handler
  const handleSnapDirection = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      if (isConnecting) return;
      const { cols, rows } = atlasLayout.grid;
      const curCol = currentActiveTile?.col ?? 0;
      const curRow = currentActiveTile?.row ?? 0;

      let targetCol = curCol;
      let targetRow = curRow;

      if (direction === "up") targetRow = Math.max(0, curRow - 1);
      if (direction === "down") targetRow = Math.min(rows - 1, curRow + 1);
      if (direction === "left") targetCol = Math.max(0, curCol - 1);
      if (direction === "right") targetCol = Math.min(cols - 1, curCol + 1);

      const targetTile =
        atlasLayout.tiles.find((t) => t.col === targetCol && t.row === targetRow) ||
        atlasLayout.tiles.find((t) => t.row === targetRow) ||
        currentActiveTile;

      if (targetTile && targetTile.cameraId !== directorState.activeCameraId) {
        handleSelectCamera(targetTile.cameraId, targetTile.slug, targetTile.xMin, targetTile.yMin);
      }
    },
    [atlasLayout, currentActiveTile, directorState.activeCameraId, isConnecting, handleSelectCamera]
  );

  // Keyboard Navigation Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        handleSnapDirection("up");
      } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        handleSnapDirection("down");
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        handleSnapDirection("left");
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        handleSnapDirection("right");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSnapDirection]);

  // Gamepad / Joystick Controller Polling Loop
  useEffect(() => {
    let animationFrameId: number;
    let lastButtonPress = 0;

    const pollGamepad = () => {
      if (typeof navigator !== "undefined" && navigator.getGamepads) {
        const gamepads = navigator.getGamepads();
        const gp = gamepads[0] || gamepads[1];
        if (gp) {
          if (!gamepadConnected) setGamepadConnected(true);
          const now = Date.now();
          if (now - lastButtonPress > 220) {
            const axisX = gp.axes[0] ?? 0;
            const axisY = gp.axes[1] ?? 0;

            if (gp.buttons[12]?.pressed || axisY < -0.5) {
              handleSnapDirection("up");
              lastButtonPress = now;
            } else if (gp.buttons[13]?.pressed || axisY > 0.5) {
              handleSnapDirection("down");
              lastButtonPress = now;
            } else if (gp.buttons[14]?.pressed || axisX < -0.5) {
              handleSnapDirection("left");
              lastButtonPress = now;
            } else if (gp.buttons[15]?.pressed || axisX > 0.5) {
              handleSnapDirection("right");
              lastButtonPress = now;
            }
          }
        } else if (gamepadConnected) {
          setGamepadConnected(false);
        }
      }
      animationFrameId = requestAnimationFrame(pollGamepad);
    };

    animationFrameId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(animationFrameId);
  }, [handleSnapDirection, gamepadConnected]);

  // ═══════════ AUTONOMOUS AI PTZ ANIMAL & PET FRAMING ENGINE ═══════════
  useEffect(() => {
    if (subjectMode !== "animals") return;

    const interval = setInterval(() => {
      const activeCamId = directorState.activeCameraId;
      const activeInput = mergedTelemetry.find((i) => i.cameraId === activeCamId);

      const rawBoxes = (activeInput?.boundingBoxes ?? []).map((b) => ({
        nx: b.nx,
        ny: b.ny,
        nw: b.nw,
        nh: b.nh,
        label: b.label,
        confidence: b.confidence,
      }));

      setAnimalFramingState((prev) => stepAnimalFramingEngine(prev, rawBoxes, Date.now(), 0.08));
    }, 80);

    return () => clearInterval(interval);
  }, [subjectMode, directorState.activeCameraId, mergedTelemetry]);

    // ═══════════ AUTONOMOUS AI PTZ GROUP FRAMING ENGINE ═══════════
  useEffect(() => {
    if (subjectMode !== "group") return;

    const interval = setInterval(() => {
      const activeCamId = directorState.activeCameraId;
      const activeInput = mergedTelemetry.find((i) => i.cameraId === activeCamId);

      const personBoxes: GroupMemberBox[] = (activeInput?.boundingBoxes ?? [])
        .filter((b) => !b.label || b.label === "person" || b.label === "Person")
        .map((b) => ({
          nx: b.nx,
          ny: b.ny,
          nw: b.nw,
          nh: b.nh,
          label: b.label,
        }));

      setGroupFramingState((prev) => stepGroupFramingEngine(prev, personBoxes, Date.now(), 0.08));
    }, 80);

    return () => clearInterval(interval);
  }, [subjectMode, directorState.activeCameraId, mergedTelemetry]);

    // ═══════════ AUTONOMOUS AI FOCUS (ZOOM-INSPECT-MEMORIZE-RESTORE) ═══════════
  useEffect(() => {
    if (!aiFocusEnabled || subjectMode === "manual") return;

    const interval = setInterval(() => {
      const activeCamId = directorState.activeCameraId;
      const activeInput = mergedTelemetry.find((i) => i.cameraId === activeCamId);

      const subjects: FocusSubject[] = (activeInput?.boundingBoxes ?? []).map((b, idx) => ({
        id: `${activeCamId}-box-${idx}`,
        cameraId: activeCamId,
        label: b.label,
        confidence: b.confidence ?? 0.75,
        box: { x: b.nx, y: b.ny, width: b.nw, height: b.nh },
        isMovement: Boolean(b.isMovement),
        velocity: b.velocity ?? 0,
        identifiedName: b.targetName,
      }));

      setFocusState((prev) => stepFocusEngine(prev, subjects, Date.now()));
    }, 80);

    return () => clearInterval(interval);
  }, [aiFocusEnabled, subjectMode, directorState.activeCameraId, mergedTelemetry]);

  // ═══════════ AUTONOMOUS AI PTZ ADVANCED FRAMING ENGINE ═══════════
  // Decides WHERE to aim, once per telemetry reading; the gimbal in every
  // renderer does the moving (director/gimbal.ts). It used to re-aim at the raw
  // box and setState every 80 ms, re-rendering this whole workspace ~12x a
  // second and bouncing the shot whenever a box wobbled or went missing.
  const framingAimRef = useRef<{ cameraId: string; state: FramingAimState }>({ cameraId: "", state: initialFramingAim() });
  useEffect(() => {
    const activeCamId = directorState.activeCameraId;
    if (subjectMode === "manual") return;
    if (framingAimRef.current.cameraId !== activeCamId) {
      // A new room is a new picture: aim fresh, never carry the old crop over.
      framingAimRef.current = { cameraId: activeCamId, state: initialFramingAim() };
    }
    const activeInput = mergedTelemetry.find((i) => i.cameraId === activeCamId);
    const candidates = extractModeCandidates(activeInput, subjectMode, followMember);
    const next = stepFramingAim(framingAimRef.current.state, candidates, framingMode, Date.now());
    framingAimRef.current.state = next;
    const ptz = aimToPtz(next.aim, trackingSpeed);
    setAiPtzState((prev) =>
      prev.zoomFactor === ptz.zoomFactor &&
      prev.panOffsetX === ptz.panOffsetX &&
      prev.panOffsetY === ptz.panOffsetY &&
      prev.speedMode === ptz.speedMode
        ? prev
        : ptz,
    );
  }, [subjectMode, framingMode, trackingSpeed, directorState.activeCameraId, mergedTelemetry, followMember]);

  // Active virtual PTZ state derived from Focus Mode, Group Mode, Animal Mode, or Advanced AI Framing
  // The framing the operator chose always wins. AI Focus's inspect cycle is a
  // readout now, never the shot: it overrode Full Camera itself.
  const activePtzState = useMemo(() => {
    const withGimbal = (ptz: VirtualPtzState) => ({ ...ptz, smoothness: gimbalSmoothness });
    if (subjectMode === "manual") {
      return withGimbal(manualPtzState);
    }
    if (framingMode === "camera" || framingMode === "wide") {
      return undefined;
    }
    if (subjectMode === "group" && groupFramingState.calibrationPhase !== "WIDE") {
      return withGimbal(groupFramingState.currentPtz);
    }
    if (subjectMode === "animals" && animalFramingState.calibrationPhase !== "WIDE") {
      return withGimbal(animalFramingState.currentPtz);
    }
    return withGimbal(aiPtzState);
  }, [subjectMode, groupFramingState, animalFramingState, manualPtzState, framingMode, aiPtzState, gimbalSmoothness]);

  // The staff monitor used to be the only place that knew the final AI crop.
  // Publish that composed frame as a short lease so the public Director and
  // OBS browser source render the exact same shot. Camera selection remains
  // server-owned; this endpoint cannot cut rooms or claim manual control.
  const latestProgramFramingRef = useRef({
    activeCameraId: directorState.activeCameraId,
    activeRoomKey: activeLiveCam?.roomScope || currentActiveTile.slug || "director",
    ptzState: activePtzState ?? {
      zoomFactor: 1,
      panOffsetX: 0,
      panOffsetY: 0,
      zoomSpeed: 5,
      speedMode: "fine" as const,
    },
  });
  latestProgramFramingRef.current = {
    activeCameraId: directorState.activeCameraId,
    activeRoomKey: activeLiveCam?.roomScope || currentActiveTile.slug || "director",
    ptzState: activePtzState ?? {
      zoomFactor: 1,
      panOffsetX: 0,
      panOffsetY: 0,
      zoomSpeed: 5,
      speedMode: "fine",
    },
  };

  useEffect(() => {
    if (!modeAttached || subjectMode === "manual" || isRoomLocked || simulateDetection || controlDenial) return;
    let stopped = false;
    let inFlight = false;
    let lastSignature = "";
    let lastSentAt = 0;

    const publish = async () => {
      if (stopped || inFlight) return;
      const payload = latestProgramFramingRef.current;
      if (!payload.activeCameraId) return;
      const ptz = payload.ptzState;
      const signature = [
        payload.activeCameraId,
        ptz.zoomFactor.toFixed(2),
        Math.round(ptz.panOffsetX),
        Math.round(ptz.panOffsetY),
      ].join(":");
      const now = Date.now();
      // Moving shots publish at ~5.5 fps; a steady shot heartbeats once per
      // second so its 2.5s server lease never expires while this compositor is
      // still authoritative.
      if (signature === lastSignature && now - lastSentAt < 1_000) return;
      inFlight = true;
      try {
        const response = await fetch("/api/tank/director/program-framing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          lastSignature = signature;
          lastSentAt = Date.now();
        } else if (response.status === 401 || response.status === 403) {
          // Signed out or not staff: every retry would be refused the same way
          // (it was posting a 403 every 180 ms). Stop and show why.
          const body = await response.json().catch(() => ({}));
          setControlDenial(denialFromResponse(response.status, body) ?? "signed-out");
          stopped = true;
          window.clearInterval(timer);
        }
      } finally {
        inFlight = false;
      }
    };

    void publish();
    const timer = window.setInterval(() => void publish(), 180);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [modeAttached, subjectMode, isRoomLocked, simulateDetection, controlDenial]);

  // Manual Pilot or Operator Room Lock holds a server lease on the active camera.
  // When locked, the server keeps this camera pinned and streams the active PTZ crop.
  useEffect(() => {
    if ((subjectMode !== "manual" && !isRoomLocked) || !manualPilotPayloadRef.current.activeCameraId) return;

    let active = true;
    const heartbeat = window.setInterval(() => {
      if (active) {
        const payload = manualPilotPayloadRef.current;
        void dispatchPilotClaim(
          payload.activeCameraId,
          payload.activeRoomKey,
          activePtzState || payload.ptzState,
          "claim"
        );
      }
    }, 1_000);

    return () => {
      active = false;
      window.clearInterval(heartbeat);
      // NOTE: Do not eagerly release lease on component unmount/refresh. The 8s lease TTL
      // ensures clean automatic expiration without causing sudden camera cuts during page reloads.
    };
  }, [subjectMode, isRoomLocked, dispatchPilotClaim, activePtzState]);

  const activeRoomName = activeLiveCam?.name || currentActiveTile.cameraName || "Director Feed";
  const predictiveRadar = useMemo(() => {
    return calculatePotentialNextRoom({
      activeCameraId: directorState.activeCameraId,
      activeRoomName,
      subjectMode,
      framingMode,
      speedMode: trackingSpeed,
      inputs: mergedTelemetry,
      cameras: realCameras,
      isRoomLocked,
      shotStartedAt: directorState.shotStartedAt,
      challengerId: directorState.challengerId,
      challengerSince: directorState.challengerSince,
    });
  }, [
    directorState.activeCameraId,
    activeRoomName,
    subjectMode,
    framingMode,
    trackingSpeed,
    mergedTelemetry,
    realCameras,
    isRoomLocked,
    directorState.shotStartedAt,
    directorState.challengerId,
    directorState.challengerSince,
  ]);


    const handleAdjustFeet = (camId: string, delta: number) => {
    setInputs((prev) => {
      return prev.map((inp) => {
        if (inp.cameraId !== camId) return inp;
        const newFeet = Math.max(0, inp.visibleFeetCount + delta);
        return {
          ...inp,
          visibleFeetCount: newFeet,
          peopleCount: Math.ceil(newFeet / 2),
        };
      });
    });
  };

  const handleAdjustAudio = (camId: string, delta: number) => {
    setInputs((prev) => {
      return prev.map((inp) => {
        if (inp.cameraId !== camId) return inp;
        const newPeak = Math.max(0, Math.min(100, inp.audioPeak + delta));
        return {
          ...inp,
          audioPeak: newPeak,
          isSpeaking: newPeak > 50,
        };
      });
    });
  };

  // ── Rotation roster: spotlight one or two operator-picked cameras/rooms
  // (a specific moderator's or admin's OBS stream, IRL, whatever) on a
  // fixed timer, instead of leaving selection to the heuristic scorer.
  // These three used to mutate React state and stop there, so the roster died
  // on refresh and the server — the thing that actually cuts — never saw it.
  // They now go through the durable roster; the local mirror below only exists
  // so the rest of this component keeps rendering off one shape.
  const toggleRotationCamera = (cameraId: string) => {
    rotationRoster.toggleCamera(cameraId);
  };

  const setRotationIntervalSeconds = (seconds: number) => {
    rotationRoster.setIntervalSeconds(seconds);
  };

  const startRotation = () => {
    if (rotationRoster.roster.cameraIds.length === 0) return;
    selectSubjectMode("rotation");
    setDirectorState((prev) => ({
      ...prev,
      subjectMode: "rotation",
      rotationIndex: 0,
      rotationSlotStartedAt: null,
      shotStartedAt: Date.now(),
    }));
  };

  const stopRotation = () => {
    selectSubjectMode("manual");
    setDirectorState((prev) => ({ ...prev, subjectMode: "manual" }));
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Return to House */}
      <div className="flex items-center justify-between">
        <Link
          href="/house"
          className="inline-flex items-center gap-1.5 rounded bg-black/10 hover:bg-black/20 px-3 py-1.5 text-xs font-bold text-[#241f14] transition"
        >
          <ArrowLeft className="h-4 w-4" /> Return to House Console
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAiFocusEnabled((v) => !v)}
            className={`rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition ${
              aiFocusEnabled
                ? focusState.phase !== "IDLE_WIDE"
                  ? "bg-cyan-400 text-black animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                  : "bg-cyan-500/20 text-cyan-900 border border-cyan-500/40"
                : "bg-black/10 text-[#241f14] hover:bg-black/20"
            }`}
            title="Autonomous AI Focus: Zooms in to inspect and memorize ambiguous subjects when settled"
          >
            {aiFocusEnabled
              ? focusState.phase !== "IDLE_WIDE"
                ? `⚡ Focus: ${focusState.phase} (${focusState.resolvedIdentity ?? focusState.activeSubject?.label ?? "Subject"} ${(focusState.inspectedConfidence * 100).toFixed(0)}%)`
                : subjectMode === "animals"
                ? `🐾 Animal Mode: ${animalFramingState.calibrationPhase} (${animalFramingState.animalCount} Pets @ ${animalFramingState.currentPtz.zoomFactor.toFixed(1)}x)`
                : subjectMode === "group"
                ? `👥 Group Framing: ${groupFramingState.calibrationPhase} (${groupFramingState.memberCount} People @ ${groupFramingState.currentPtz.zoomFactor.toFixed(1)}x)`
                : "● AI Focus Ready"
              : "○ AI Focus Off"}
          </button>
          <span
            className={`rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
              serverDetectionActive
                ? "bg-emerald-500 text-black"
                : "border border-amber-600/50 bg-amber-500/15 text-amber-900"
            }`}
            title="Read-only health from the 24/7 Tank vision worker"
          >
            {serverDetectionActive ? "● Server Vision Attached" : "○ Server Vision Waiting"}
          </span>
          <span className="text-xs font-mono font-bold text-slate-500">
            Route: tank.unenter.live/director-configuration · {realCameras.length} Real Feeds Attached
          </span>
        </div>
      </div>

      {/* Main Studio Workstation Chassis */}
      <ChromePanel withScrews className="w-full">
        <div className="space-y-6 font-sans p-3">
          {/* Connection Barrier HUD Notice */}
          {isConnecting && (
            <div className="rounded-xl border border-amber-500/50 bg-amber-950/40 p-3.5 flex items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="grid h-7 w-7 place-items-center rounded bg-amber-500 text-black font-black text-xs shadow">
                  ⚡
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-amber-300">
                    Connecting to 24/7 Central Director Control Plane
                  </p>
                  <p className="text-[10px] font-mono text-amber-200/70">
                    Syncing authoritative server mode, rotation roster, and active broadcast camera… Controls locked until sync is established.
                  </p>
                </div>
              </div>
              <span className="text-[9px] font-mono uppercase tracking-widest text-amber-400 font-black border border-amber-400/40 rounded px-2 py-0.5">
                INITIALIZING HANDSHAKE
              </span>
            </div>
          )}

          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/15 pb-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-orange-950/40 border border-orange-500/40 text-orange-400 shadow-md">
                <Crosshair className="h-6 w-6" />
              </div>
              <div>
                <h1
                  className="text-base font-black uppercase tracking-wider text-[#241f14]"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  Director Virtual Canvas & TouchDesigner Vision Matrix
                </h1>
                <p className="text-xs font-semibold text-[#5a5442]">
                  {atlasLayout.grid.cols}x{atlasLayout.grid.rows} Real Live Video Wall · Audio Peak Auto-Delegation · Python Detection
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <JoystickTelemetry gamepadConnected={gamepadConnected} />
            </div>
          </div>

          {/* ═══════════ DETECTION SIMULATOR ═══════════
              Posts real telemetry — with real boundingBoxes — through the
              same /api/tank/director/telemetry route a real detector uses.
              This is what proves the pipeline (post -> store -> poll ->
              canvas-space conversion -> box on screen) actually works before
              TouchDesigner exists. It replaced a bank of buttons that only
              ever mutated local component state and could never have
              produced a box, no matter which toggle was on, because none of
              it had a boundingBoxes field. Audio-only controls are gone from
              here entirely — audio is a signal the detector reports
              alongside boxes, not a separate control surface. */}
          <div className="rounded-xl border border-orange-500/30 bg-gradient-to-r from-orange-950/20 via-black/10 to-orange-950/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 pb-2">
              <div className="flex items-center gap-2">
                <div className="grid h-6 w-6 place-items-center rounded bg-orange-500 text-black font-black text-xs shadow">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                  Detection Simulator — {subjectMode.toUpperCase()} MODE
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSimulateDetection((v) => !v)}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-black uppercase transition ${
                  simulateDetection ? "bg-emerald-700 text-white shadow" : "bg-black/20 text-[#4c4630]"
                }`}
              >
                {simulateDetection ? <Play className="h-3 w-3 fill-current" /> : <Pause className="h-3 w-3" />}
                {simulateDetection ? "Simulating: ACTIVE" : "Simulate: OFF"}
              </button>
            </div>
            <p className="text-[11px] font-bold text-[#4c4630]">
              Stands in for TouchDesigner: posts a person box for each enrolled housemate into a
              rotating room, with real audio and identity, through the real ingest endpoint. Turn
              off the moment TouchDesigner is actually posting — the two would otherwise fight
              over the same telemetry.
            </p>
          </div>

          {/* Snapping Controller & Telemetry Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Real Cameras Status & Detection HUD Toggle (8 Cols) */}
            <div className="lg:col-span-8 rounded-xl bg-black/5 p-4 border border-black/15 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-[#241f14] flex items-center gap-1.5">
                  <Video className="h-4 w-4 text-orange-600" />
                  Live Feeds Status & Real Ingest Signals
                </span>
                <span className="text-[10px] font-mono text-emerald-700 font-bold">
                  {realCameras.filter((c) => isOnline(c.id)).length}/{realCameras.length} ONLINE
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {realCameras.map((cam) => {
                  const online = isOnline(cam.id);
                  const isLead = directorState.activeCameraId === cam.id;
                  return (
                    <button
                      key={cam.id}
                      type="button"
                      disabled={isConnecting}
                      onClick={() => {
                        const tile = atlasLayout.tiles.find((t) => t.cameraId === cam.id);
                        if (tile) handleSelectCamera(tile.cameraId, tile.slug, tile.xMin, tile.yMin);
                      }}
                      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-black transition-all ${
                        isConnecting ? "opacity-50 cursor-not-allowed " : ""
                      }${
                        isLead
                          ? "bg-[#241f14] text-orange-400 border border-orange-500 shadow-md"
                          : "bg-white/80 text-[#4c4630] border border-black/15 hover:bg-white"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                      <span>{cam.name}</span>
                      <span className="text-[9px] font-mono opacity-60">[{cam.kind.toUpperCase()}]</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-black/10 text-xs">
                <span className="font-bold text-[#4c4630]">
                  Keyboard Snapping: <kbd className="px-1.5 py-0.5 rounded bg-black/10 font-mono">W A S D</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-black/10 font-mono">Arrow Keys</kbd>
                </span>
                <button
                  type="button"
                  onClick={() => setShowDetectionBoxes(!showDetectionBoxes)}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-bold uppercase transition ${
                    showDetectionBoxes
                      ? "bg-emerald-800 text-white shadow"
                      : "bg-black/20 text-[#4c4630]"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  {showDetectionBoxes ? "Canvas Detection Boxes: ON" : "Canvas Detection Boxes: OFF"}
                </button>
              </div>
            </div>

            {/* Right: Snapping D-Pad Control Pod (4 Cols) */}
            <div className="space-y-3 lg:col-span-4">
              <DirectionalSnappingPad onSnap={handleSnapDirection} />
              {subjectMode === "manual" && (
                <ManualPtzController
                  activeCameraName={activeLiveCam?.name || currentActiveTile.cameraName}
                  activeRoomKey={activeLiveCam?.roomScope || currentActiveTile.slug}
                  ptzState={manualPtzState}
                  onPtzChange={setManualPtzState}
                />
              )}
            </div>
          </div>

          {/* ═══════════ MAIN VIRTUAL CANVAS MATRIX (ALL REAL FOOTAGE SIDE-BY-SIDE) ═══════════ */}
          <div className="rounded-xl border border-black/15 bg-black/[0.03] p-4 space-y-3">
            {/* ── Detection Category Filter Bar (Trash, Clutter, Toys, Waldo, People, Audio) ── */}
            <div className="rounded-lg bg-black/80 border border-white/10 p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-orange-400" />
                  DETECTION FILTERS:
                </span>

                {/* Quick Presets */}
                <button
                  type="button"
                  onClick={() =>
                    setDetectionFilters({
                      trash: true,
                      clutter: false,
                      easterEgg: false,
                      waldo: false,
                      people: false,
                      pets: false,
                      audio: false,
                      feet: false,
                    })
                  }
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition flex items-center gap-1 ${
                    detectionFilters.trash && !detectionFilters.people && !detectionFilters.clutter && !detectionFilters.audio
                      ? "bg-red-600 text-white shadow ring-2 ring-red-400"
                      : "bg-red-950/70 text-red-300 border border-red-500/40 hover:bg-red-900/80"
                  }`}
                >
                  <span>🗑️ Trash Only</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDetectionFilters({
                      trash: false,
                      clutter: true,
                      easterEgg: false,
                      waldo: false,
                      people: false,
                      pets: false,
                      audio: false,
                      feet: false,
                    })
                  }
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition flex items-center gap-1 ${
                    detectionFilters.clutter && !detectionFilters.trash && !detectionFilters.people
                      ? "bg-amber-600 text-white shadow ring-2 ring-amber-400"
                      : "bg-amber-950/70 text-amber-300 border border-amber-500/40 hover:bg-amber-900/80"
                  }`}
                >
                  <span>📦 Clutter Only</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDetectionFilters({
                      trash: true,
                      clutter: true,
                      easterEgg: true,
                      waldo: true,
                      people: true,
                      pets: true,
                      audio: true,
                      feet: true,
                    })
                  }
                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-slate-200 hover:bg-white/20 transition"
                >
                  All Layers ON
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDetectionFilters({
                      trash: false,
                      clutter: false,
                      easterEgg: false,
                      waldo: false,
                      people: false,
                      pets: false,
                      audio: false,
                      feet: false,
                    })
                  }
                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-slate-400 hover:bg-white/20 transition"
                >
                  Clear All
                </button>
              </div>

              {/* Individual Category Toggles */}
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1 text-[11px] font-mono text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={detectionFilters.trash}
                    onChange={(e) =>
                      setDetectionFilters((prev) => ({ ...prev, trash: e.target.checked }))
                    }
                    className="accent-red-500 rounded"
                  />
                  <span className={detectionFilters.trash ? "text-red-400 font-bold" : "text-slate-400"}>
                    Trash
                  </span>
                </label>

                <label className="flex items-center gap-1 text-[11px] font-mono text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={detectionFilters.clutter}
                    onChange={(e) =>
                      setDetectionFilters((prev) => ({ ...prev, clutter: e.target.checked }))
                    }
                    className="accent-amber-500 rounded"
                  />
                  <span className={detectionFilters.clutter ? "text-amber-400 font-bold" : "text-slate-400"}>
                    Clutter
                  </span>
                </label>

                <label className="flex items-center gap-1 text-[11px] font-mono text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={detectionFilters.easterEgg}
                    onChange={(e) =>
                      setDetectionFilters((prev) => ({ ...prev, easterEgg: e.target.checked }))
                    }
                    className="accent-emerald-500 rounded"
                  />
                  <span className={detectionFilters.easterEgg ? "text-emerald-400 font-bold" : "text-slate-400"}>
                    Toys
                  </span>
                </label>

                <label className="flex items-center gap-1 text-[11px] font-mono text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={detectionFilters.waldo}
                    onChange={(e) =>
                      setDetectionFilters((prev) => ({ ...prev, waldo: e.target.checked }))
                    }
                    className="accent-fuchsia-500 rounded"
                  />
                  <span className={detectionFilters.waldo ? "text-fuchsia-400 font-bold" : "text-slate-400"}>
                    Waldo
                  </span>
                </label>

                <label className="flex items-center gap-1 text-[11px] font-mono text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={detectionFilters.people}
                    onChange={(e) =>
                      setDetectionFilters((prev) => ({ ...prev, people: e.target.checked }))
                    }
                    className="accent-cyan-500 rounded"
                  />
                  <span className={detectionFilters.people ? "text-cyan-400 font-bold" : "text-slate-400"}>
                    People
                  </span>
                </label>

                <label className="flex items-center gap-1 text-[11px] font-mono text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={detectionFilters.audio}
                    onChange={(e) =>
                      setDetectionFilters((prev) => ({ ...prev, audio: e.target.checked }))
                    }
                    className="accent-yellow-500 rounded"
                  />
                  <span className={detectionFilters.audio ? "text-yellow-400 font-bold" : "text-slate-400"}>
                    Audio
                  </span>
                </label>
              </div>
            </div>

            <VirtualCanvas
              atlasLayout={atlasLayout}
              directorState={directorState}
              inputs={mergedTelemetry}
              liveById={liveById}
              showDetectionBoxes={showDetectionBoxes}
              filters={detectionFilters}
              overlayVisibility={overlayVisibility}
              members={HOUSE_MEMBERS}
              ptzState={activePtzState}
              onSelectCamera={handleSelectCamera}
              onAdjustFeet={handleAdjustFeet}
              onAdjustAudio={handleAdjustAudio}
            />
          </div>

          {/* ═══════════ CINEMATOGRAPHY ENGINE & REAL PROGRAM MONITOR ═══════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 7 Cols: Cinematography Mode Selectors */}
            <div className="lg:col-span-7 space-y-4">
              {controlDenial && <ControlDenialBanner denial={controlDenial} />}
              {modeRejected && !controlDenial && (
                <p role="alert" className="rounded-md border border-red-500/60 bg-red-950/60 px-3 py-2 text-[11px] font-bold text-red-200">
                  {modeRejected}
                </p>
              )}
              {modeAttached ? (
                <div aria-disabled={Boolean(controlDenial)} className={controlDenial ? "pointer-events-none select-none opacity-40" : undefined}>
                <SubjectModeSelector
                  subjectMode={subjectMode}
                  onSelectMode={(mode) => selectSubjectMode(mode)}
                  followMember={followMember}
                  onSelectFollowMember={(slug) => selectSubjectMode("member", slug)}
                  followable={followable}
                  enrollment={enrollment}
                  onStartEnrollment={(name, member) =>
                    void sendEnrollment(member ? { mode: "enroll", enrollMember: member } : { mode: "enroll", enrollName: name })
                  }
                  onFinishEnrollment={() => void sendEnrollment({ finishEnrollment: true })}
                />
                </div>
              ) : (
                <div className="rounded-xl border border-amber-700/60 bg-[#16171d] px-4 py-5 text-center">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-400">
                    Attaching to 24/7 Server Director
                  </p>
                  <p className="mt-1 text-[10px] font-mono text-slate-400">
                    {modeAttachError
                      ? `${modeAttachError} · retrying`
                      : "Reading the durable programme mode…"}
                  </p>
                </div>
              )}
              {/* ═══ ROTATION ROSTER — spotlight specific people/rooms on a timer ═══ */}
              <div className="rounded-xl border border-black/80 bg-[#16171d] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wider text-amber-400">
                    Rotation Roster
                  </p>
                  <span
                    className={`rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      subjectMode === "rotation" || directorState.subjectMode === "rotation"
                        ? "bg-emerald-500 text-black animate-pulse"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {subjectMode === "rotation" || directorState.subjectMode === "rotation" ? "Live" : "Idle"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Pick one or more cameras/rooms — including any live IRL or OBS
                  stream — and the director will cycle through exactly them on
                  a fixed timer, ignoring the auto-scorer entirely.
                </p>
                {/* The roster is durable server state, so it has to be able to
                    say when it is NOT attached — an operator editing a roster
                    the 24/7 director never received is the exact failure this
                    panel used to have silently. */}
                {rotationRoster.error ? (
                  <p className="rounded border border-amber-700/60 bg-amber-950/40 px-2 py-1 text-[10px] font-bold text-amber-400">
                    {rotationRoster.error}
                  </p>
                ) : (
                  <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500">
                    {rotationRoster.attached
                      ? "Saved on the 24/7 server director · survives refresh"
                      : "Attaching to the server director…"}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {realCameras.map((cam) => {
                    const picked = rotationRoster.roster.cameraIds.includes(cam.id);
                    return (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => toggleRotationCamera(cam.id)}
                        className={`rounded-md border px-2 py-1 text-[10px] font-bold transition ${
                          picked
                            ? "border-amber-400 bg-amber-500/20 text-amber-200"
                            : "border-slate-700 bg-black/40 text-slate-400 hover:border-slate-500"
                        }`}
                      >
                        {picked ? "✓ " : ""}
                        {cam.name}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-400">
                    Seconds per slot
                  </label>
                  <input
                    type="number"
                    min={10}
                    step={5}
                    value={Math.round(rotationRoster.roster.intervalMs / 1000)}
                    onChange={(e) => setRotationIntervalSeconds(Number(e.target.value) || 170)}
                    className="w-20 rounded border border-slate-700 bg-black/50 px-2 py-1 text-[11px] font-mono text-slate-200"
                  />
                  {subjectMode === "rotation" || directorState.subjectMode === "rotation" ? (
                    <button
                      type="button"
                      onClick={stopRotation}
                      className="ml-auto rounded-md bg-red-600 px-3 py-1 text-[10px] font-black uppercase text-white hover:bg-red-500"
                    >
                      Stop Rotation
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRotation}
                      disabled={rotationRoster.roster.cameraIds.length === 0}
                      className="ml-auto rounded-md bg-emerald-600 px-3 py-1 text-[10px] font-black uppercase text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Start Rotation
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FramingModeSelector
                  framingMode={framingMode}
                  onSelectFraming={setFramingMode}
                  speedMode={trackingSpeed === "sport" ? "sport" : "fine"}
                  onSelectSpeed={(s) => setTrackingSpeed(s === "sport" ? "sport" : "standard")}
                  smoothness={gimbalSmoothness}
                  onSmoothnessChange={changeGimbalSmoothness}
                />
                <MotionKinematicsSelector
                  motionCurve={motionCurve}
                  onSelectCurve={setMotionCurve}
                />
              </div>
            </div>

            {/* Right 5 Cols: Live Program Monitor & TouchDesigner Bridge */}
            <div className="lg:col-span-5 space-y-4">
              <LiveProgramMonitor
                directorState={directorState}
                activeTile={currentActiveTile}
                activeLiveCam={activeLiveCam}
                ptzState={activePtzState}
              />
              <PredictiveRadarPanel
                prediction={predictiveRadar}
                onToggleRoomLock={() => setIsRoomLocked((prev) => !prev)}
                activeRoomName={activeRoomName}
                trackingSpeed={trackingSpeed}
                framingMode={framingMode}
                activeChaosItem={serverDirector.activeChaosItem}
              />
              <ChaosWorkshopPanel
                activeChaosItem={serverDirector.activeChaosItem}
                activeRoomKey={activeRoomName}
              />
              <TouchDesignerBridge />
            </div>
          </div>
        </div>
      </ChromePanel>
    </div>
  );
}
export default DirectorWorkspace;

type ControlDenial = "signed-out" | "not-staff" | "unavailable";

function denialFromResponse(status: number, body: unknown): ControlDenial | null {
  const denial = (body as { denial?: unknown } | null)?.denial;
  if (denial === "signed-out" || denial === "not-staff" || denial === "unavailable") return denial;
  if (status === 401) return "signed-out";
  if (status === 403) return "not-staff";
  return null;
}

/**
 * Shown above the controls whenever this browser cannot change the director,
 * with the one action that fixes it. The controls below are locked meanwhile.
 */
function ControlDenialBanner({ denial }: { denial: ControlDenial }) {
  const signInHref =
    typeof window === "undefined"
      ? "https://auth.unenter.live/sign-in"
      : `https://auth.unenter.live/sign-in?next=${encodeURIComponent(window.location.href)}`;
  const copy =
    denial === "signed-out"
      ? { title: "You're signed out", detail: "Changes can't reach the director until you sign in again." }
      : denial === "not-staff"
        ? { title: "This account isn't Tank staff", detail: "Sign in with a staff account to control the director." }
        : { title: "Can't confirm your staff access", detail: "The account check failed. It retries every few seconds." };
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/70 bg-red-950/70 px-4 py-3">
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-red-200">{copy.title}</p>
        <p className="mt-0.5 text-[11px] text-red-100/80">{copy.detail} Controls are locked meanwhile.</p>
      </div>
      {denial !== "unavailable" && (
        <a href={signInHref} className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white hover:bg-red-400">
          Sign in
        </a>
      )}
    </div>
  );
}
