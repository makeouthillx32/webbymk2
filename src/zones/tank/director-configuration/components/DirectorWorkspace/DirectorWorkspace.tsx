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
} from "../../../server/directorVirtualAtlas";
import { useTankCameras } from "../../../public/useTankCameras";
import { cameras as fixtureCameras } from "../../../fixtures";
import { VirtualCanvas } from "../VirtualCanvas";
import { defaultOverlayVisibility } from "../../overlayRegistry";
import type { HouseMember } from "../../../server/houseMembers";

// The three enrolled housemates. Placeholder identities until real enrolment
// exists — swap detectorLabel for whatever the enrolment pipeline emits, and
// this is the only place that needs to change.
const HOUSE_MEMBERS: HouseMember[] = [
  { id: "member_01", displayName: "Housemate 1", detectorLabel: "member_01" },
  { id: "member_02", displayName: "Housemate 2", detectorLabel: "member_02" },
  { id: "member_03", displayName: "Housemate 3", detectorLabel: "member_03" },
];
import { DirectionalSnappingPad, JoystickTelemetry } from "../NavigationController";
import {
  SubjectModeSelector,
  FramingModeSelector,
  MotionKinematicsSelector,
} from "../CinematographyMatrix";
import { TouchDesignerBridge } from "../TouchDesignerBridge";
import { LiveProgramMonitor } from "../LiveProgramMonitor";
import { PeopleDetectionEngine, type DetectionCameraInput } from "../PeopleDetectionEngine";

export function DirectorWorkspace() {
  const { snapshot, liveById, isOnline } = useTankCameras();

  // Mode defaults to Audio Detection ("speaker") as Mode #1
  const [subjectMode, setSubjectMode] = useState<SubjectMode>("speaker");
  const [framingMode, setFramingMode] = useState<FramingMode>("camera");
  const [motionCurve, setMotionCurve] = useState<MotionCurve>("snap");
  const [showDetectionBoxes, setShowDetectionBoxes] = useState<boolean>(true);
  const [detectionFilters, setDetectionFilters] = useState<DetectionCategoryFilters>(DEFAULT_DETECTION_FILTERS);
  const [gamepadConnected, setGamepadConnected] = useState<boolean>(false);
  const [autoSimulateAudio, setAutoSimulateAudio] = useState<boolean>(true);

  // Extract REAL cameras from live platform snapshot or real fixtures
  const realCameras = useMemo(() => {
    const discovered = snapshot?.cameras ?? [];
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

  // Real cameras with something to actually decode a frame from — this is
  // what makes the director's scoring engine see real numbers instead of
  // nothing, which is the one missing piece behind serverDirectorEngine.ts's
  // detection branch never firing. Toggleable because it's real inference
  // work running in this tab; an admin who wants the tab quiet can turn it
  // off without losing the manual simulate toggle above.
  const [realDetectionEnabled, setRealDetectionEnabled] = useState(true);
  const detectionCameras = useMemo<DetectionCameraInput[]>(() => {
    if (!realDetectionEnabled) return [];
    const out: DetectionCameraInput[] = [];
    for (const cam of realCameras) {
      const live = liveById.get(cam.id);
      if (!live || !live.playbackUrl) continue;
      if (live.presence !== "online" && live.presence !== "degraded") continue;
      out.push({ id: cam.id, playbackUrl: live.playbackUrl });
    }
    return out;
  }, [realDetectionEnabled, realCameras, liveById]);

  const [liveTelemetry, setLiveTelemetry] = useState<CameraTelemetryInput[]>([]);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/tank/director/telemetry/live", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && Array.isArray(json?.telemetry)) setLiveTelemetry(json.telemetry);
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
    const liveById2 = new Map(liveTelemetry.map((t) => [t.cameraId, t]));
    return inputs.map((local) => liveById2.get(local.cameraId) ?? local);
  }, [inputs, liveTelemetry]);

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

  const [directorState, setDirectorState] = useState<DirectorViewportState>({
    activeCameraId: defaultActiveId,
    activeCameraSlug: defaultActiveSlug,
    subjectMode: "speaker",
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
    rotationCameraIds: [],
    // 2:50 per slot — the operator's own stated metric for a rotation between
    // a couple of spotlighted streamers.
    rotationIntervalMs: 170_000,
    rotationIndex: 0,
    rotationSlotStartedAt: null,
  });

  // ═══════════ REAL-TIME AUDIO SIMULATION ENGINE (AUTO-DELEGATION) ═══════════
  useEffect(() => {
    if (!autoSimulateAudio || subjectMode !== "speaker") return;

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
  }, [autoSimulateAudio, subjectMode]);

  // Re-evaluate on mode, telemetry or canvas layout change
  useEffect(() => {
    const timer = setInterval(() => {
      setDirectorState((prev) =>
        evaluateDirectorStep(
          { ...prev, subjectMode, framingMode, motionCurve },
          inputs,
          atlasLayout.tiles,
          Date.now()
        )
      );
    }, 150);

    return () => clearInterval(timer);
  }, [subjectMode, framingMode, motionCurve, inputs, atlasLayout]);

  const currentActiveTile = useMemo(() => {
    return (
      atlasLayout.tiles.find((t) => t.cameraId === directorState.activeCameraId) ||
      atlasLayout.tiles[0] || {
        cameraId: defaultActiveId,
        cameraName: "Main Feed",
        slug: defaultActiveSlug,
        kind: "ipcam",
        row: 0,
        col: 0,
        xMin: 0,
        yMin: 0,
        xMax: 3840,
        yMax: 2160,
      }
    );
  }, [atlasLayout, directorState.activeCameraId, defaultActiveId, defaultActiveSlug]);

  const activeLiveCam = useMemo(() => {
    return liveById.get(directorState.activeCameraId);
  }, [liveById, directorState.activeCameraId]);

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
        setSubjectMode("manual");
        setDirectorState((prev) => ({
          ...prev,
          activeCameraId: targetTile.cameraId,
          activeCameraSlug: targetTile.slug,
          subjectMode: "manual",
          viewportX: targetTile.xMin,
          viewportY: targetTile.yMin,
          shotStartedAt: Date.now(),
        }));
      }
    },
    [atlasLayout, currentActiveTile, directorState.activeCameraId]
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

  const handleSelectCamera = (cameraId: string, slug: string, xMin: number, yMin: number) => {
    setSubjectMode("manual");
    setDirectorState((prev) => ({
      ...prev,
      activeCameraId: cameraId,
      activeCameraSlug: slug,
      subjectMode: "manual",
      viewportX: xMin,
      viewportY: yMin,
      shotStartedAt: Date.now(),
    }));
  };

  // ── Rotation roster: spotlight one or two operator-picked cameras/rooms
  // (a specific moderator's or admin's OBS stream, IRL, whatever) on a
  // fixed timer, instead of leaving selection to the heuristic scorer.
  const toggleRotationCamera = (cameraId: string) => {
    setDirectorState((prev) => {
      const already = prev.rotationCameraIds.includes(cameraId);
      const rotationCameraIds = already
        ? prev.rotationCameraIds.filter((id) => id !== cameraId)
        : [...prev.rotationCameraIds, cameraId];
      return { ...prev, rotationCameraIds };
    });
  };

  const setRotationIntervalSeconds = (seconds: number) => {
    const clamped = Math.max(10, Math.round(seconds));
    setDirectorState((prev) => ({ ...prev, rotationIntervalMs: clamped * 1000 }));
  };

  const startRotation = () => {
    if (directorState.rotationCameraIds.length === 0) return;
    setSubjectMode("rotation");
    setDirectorState((prev) => ({
      ...prev,
      subjectMode: "rotation",
      rotationIndex: 0,
      rotationSlotStartedAt: null,
      shotStartedAt: Date.now(),
    }));
  };

  const stopRotation = () => {
    setSubjectMode("manual");
    setDirectorState((prev) => ({ ...prev, subjectMode: "manual" }));
  };

  return (
    <div className="space-y-6">
      {/* Runs real person detection in this tab against hidden video
          elements and posts to the real telemetry store — see
          PeopleDetectionEngine's own comment for why this is separate from
          the visible CameraPlayer tiles above. Renders nothing itself. */}
      <PeopleDetectionEngine cameras={detectionCameras} />

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
            onClick={() => setRealDetectionEnabled((v) => !v)}
            className={`rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition ${
              realDetectionEnabled
                ? "bg-emerald-500 text-black"
                : "bg-black/10 text-[#241f14] hover:bg-black/20"
            }`}
            title="Real person detection, running in this tab against the live feeds"
          >
            {realDetectionEnabled ? `● Real Detection (${detectionCameras.length})` : "○ Real Detection Off"}
          </button>
          <span className="text-xs font-mono font-bold text-slate-500">
            Route: tank.unenter.live/director-configuration · {realCameras.length} Real Feeds Attached
          </span>
        </div>
      </div>

      {/* Main Studio Workstation Chassis */}
      <ChromePanel withScrews className="w-full">
        <div className="space-y-6 font-sans p-3">
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
                      onClick={() => {
                        const tile = atlasLayout.tiles.find((t) => t.cameraId === cam.id);
                        if (tile) handleSelectCamera(tile.cameraId, tile.slug, tile.xMin, tile.yMin);
                      }}
                      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-black transition-all ${
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
            <div className="lg:col-span-4">
              <DirectionalSnappingPad onSnap={handleSnapDirection} />
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
              onSelectCamera={handleSelectCamera}
              onAdjustFeet={handleAdjustFeet}
              onAdjustAudio={handleAdjustAudio}
            />
          </div>

          {/* ═══════════ CINEMATOGRAPHY ENGINE & REAL PROGRAM MONITOR ═══════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 7 Cols: Cinematography Mode Selectors */}
            <div className="lg:col-span-7 space-y-4">
              <SubjectModeSelector
                subjectMode={subjectMode}
                onSelectMode={setSubjectMode}
              />

              {/* ═══ ROTATION ROSTER — spotlight specific people/rooms on a timer ═══ */}
              <div className="rounded-xl border border-black/80 bg-[#16171d] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wider text-amber-400">
                    Rotation Roster
                  </p>
                  <span
                    className={`rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      directorState.subjectMode === "rotation"
                        ? "bg-emerald-500 text-black"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {directorState.subjectMode === "rotation" ? "Live" : "Idle"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Pick one or more cameras/rooms — including any live IRL or OBS
                  stream — and the director will cycle through exactly them on
                  a fixed timer, ignoring the auto-scorer entirely.
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {realCameras.map((cam) => {
                    const picked = directorState.rotationCameraIds.includes(cam.id);
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
                    value={Math.round(directorState.rotationIntervalMs / 1000)}
                    onChange={(e) => setRotationIntervalSeconds(Number(e.target.value) || 170)}
                    className="w-20 rounded border border-slate-700 bg-black/50 px-2 py-1 text-[11px] font-mono text-slate-200"
                  />
                  {directorState.subjectMode === "rotation" ? (
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
                      disabled={directorState.rotationCameraIds.length === 0}
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
