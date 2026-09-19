"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Shield,
  Volume2,
  VolumeX,
  Radio,
  AlertTriangle,
  Megaphone,
  Sparkles,
  Zap,
  Bell,
  Sun,
  Moon,
  Flame,
  Award,
  Play,
  RotateCcw,
  Home,
  Tv,
  Users,
  CheckCircle2,
  Send,
  Sliders,
  ChevronRight,
  Terminal,
  Target,
  Clock,
  Activity,
  Layers,
  Ban,
  Trash2,
  Filter,
  UserX,
  MessageSquare,
  Lock,
  Cpu,
  Eye,
  X,
  Mic,
  BarChart3,
  Pin,
  Plus,
  Video,
  Monitor,
  LayoutGrid,
  Footprints,
  Maximize2,
  Edit3,
  Save,
  Volume1,
  Sparkle,
  Smartphone,
  MonitorPlay,
  Heart,
  Power,
} from "lucide-react";
import { ACTIVE_THEME } from "../theme";
import { ChromePanel } from "../public/components/ChromePanel";
import { ConsoleButton } from "../public/components/ConsoleButton";
import { CameraPlayer } from "../public/CameraPlayer";
import { useTankCameras } from "../public/useTankCameras";
import { useDirectorAttention } from "../director/useDirectorAttention";
import { useCameraAudioMetrics } from "../director/useCameraAudioMetrics";
import { useHousePresence } from "./useHousePresence";
import { HouseOverlayWorkspace } from "./HouseOverlayWorkspace";
import { ObsStudioCompositorPanel } from "./ObsStudioCompositorPanel";
import { UserDirectoryPanel } from "./UserDirectoryPanel";
import { EconomyDeckPanel } from "./EconomyDeckPanel";
import { ChannelsDeckPanel } from "./ChannelsDeckPanel";
import { WebhooksDeckPanel } from "./WebhooksDeckPanel";
import {
  Overview as OverviewSwitcher,
  Sources as SourcesPanel,
  SystemPanel,
} from "../admin/AdminConsole";
import { DropsAdminPanel } from "../admin/DropsAdminPanel";
import { TavernAdminPanel } from "../admin/TavernAdminPanel";
import { SoundboardAdminPanel } from "../admin/SoundboardAdminPanel";
import { TrashAdminPanel } from "../admin/TrashAdminPanel";
import { PetsAdminPanel } from "../admin/PetsAdminPanel";
import { ScavengerAdminPanel } from "../admin/ScavengerAdminPanel";
import { RoomPortalStudioPanel } from "./RoomPortalStudio";
import { AppearanceEnrolmentPanel } from "./AppearanceEnrolment";
import {
  Dices,
  Webhook,
  RadioTower,
  Settings,
  ExternalLink,
  Gift,
  Beer,
  Settings2,
  Antenna,
  DoorOpen,
  UserCheck,
} from "lucide-react";
import {
  listPendingAudioRequests,
  moderateAudioRequest,
} from "../server/audioRequests";
import type {
  AutomodConfig,
  BannedUserEntry,
} from "../server/chatModerationDb";
import {
  createPollAction,
  endPollAction,
  getActivePoll,
} from "../server/pollSystem";
import type { ActivePoll } from "../server/pollContract";
import type {
  TankAudioRequest,
  TankSfxLibraryEntry,
  TankCamera,
} from "../contracts";
import {
  broadcastConsoleMessage,
  setDirectorModeAction,
  getDirectorModeAction,
  getDirectorPrioritiesAction,
  setDirectorPrioritiesAction,
  takeDirectorLiveAction,
  listHouseRoomsAction,
  updateHouseRoomAction,
  setAllHouseRoomsOfflineAction,
  setMasterVolumeAction,
  type HouseRoomData,
} from "../server/actions";
import type { DirectorFeedPriorities } from "../server/directorAttentionDb";
import type { SubjectMode } from "../server/directorVirtualAtlas";

export type HouseConsoleProps = {
  operatorName: string;
  operatorRole: "admin" | "moderator";
};

export type OperatorDeck =
  | "house"
  | "switcher"
  | "sources"
  | "drops"
  | "tavern"
  | "soundboard"
  | "trash"
  | "scavenger"
  | "pets"
  | "members"
  | "director"
  | "rooms"
  | "portals"
  | "moderation"
  | "overlays"
  | "economy"
  | "users"
  | "channels"
  | "webhooks"
  | "system";

type HouseAlertMode = "normal" | "lockdown" | "challenge" | "quiet";
type HouseLightMode = "daylight" | "cinema" | "strobe" | "red_alert";

const DIRECTOR_QUICK_MODES: {
  id: SubjectMode;
  title: string;
  badge: string;
  icon: string;
  desc: string;
  glow: string;
  activeBorder: string;
}[] = [
  {
    id: "speaker",
    title: "SPEAKER AUTO-TRACK",
    badge: "AUDIO AI",
    icon: "🎤",
    desc: "AI dynamically cuts to the loudest talking room and ongoing vocal conversations.",
    glow: "rgba(34, 211, 238, 0.25)",
    activeBorder: "border-cyan-500 bg-cyan-950/40 text-cyan-200",
  },
  {
    id: "group",
    title: "GROUP AUTO-PTZ CLUSTER",
    badge: "AI CROWD",
    icon: "👥",
    desc: "Cuts to room with most people and frames group with dynamic lens calibration bobbing.",
    glow: "rgba(168, 85, 247, 0.25)",
    activeBorder: "border-purple-500 bg-purple-950/40 text-purple-200",
  },
  {
    id: "animals",
    title: "PET & ANIMAL TRACKER",
    badge: "PET AI",
    icon: "🐾",
    desc: "Cuts to dogs & cats (Buster, Kona, Mochi, Shadow) and applies tight pet PTZ framing.",
    glow: "rgba(245, 158, 11, 0.25)",
    activeBorder: "border-amber-500 bg-amber-950/40 text-amber-200",
  },
  {
    id: "feet",
    title: "FEET & FLOOR CAM",
    badge: "POSE AI",
    icon: "🦶",
    desc: "Directs vision to floor action, footwear, and choreography tracking.",
    glow: "rgba(234, 179, 8, 0.25)",
    activeBorder: "border-yellow-500 bg-yellow-950/40 text-yellow-200",
  },
  {
    id: "face",
    title: "FACE LOCK & CLOSE-UP",
    badge: "VISION AI",
    icon: "👤",
    desc: "Locks onto facial expressions and crops to dramatic close-up cinematography.",
    glow: "rgba(59, 130, 246, 0.25)",
    activeBorder: "border-blue-500 bg-blue-950/40 text-blue-200",
  },
  {
    id: "motion",
    title: "MOTION & ACTION",
    badge: "VELOCITY AI",
    icon: "⚡",
    desc: "Cuts to dynamic physical motion, fast movement, and active house challenges.",
    glow: "rgba(249, 115, 22, 0.25)",
    activeBorder: "border-orange-500 bg-orange-950/40 text-orange-200",
  },
  {
    id: "chaos",
    title: "CHAOS / RUSH MODE",
    badge: "HYPER-CUT",
    icon: "🔥",
    desc: "Rapid-fire switching with snappy transitions across all active feeds.",
    glow: "rgba(239, 68, 68, 0.25)",
    activeBorder: "border-red-500 bg-red-950/40 text-red-200",
  },
  {
    id: "manual",
    title: "ATTENTION OVERRIDE",
    badge: "MANUAL HOLD",
    icon: "🎯",
    desc: "Locks onto an operator-selected room or IRL camera until released.",
    glow: "rgba(244, 63, 94, 0.25)",
    activeBorder: "border-rose-500 bg-rose-950/40 text-rose-200",
  },
  {
    id: "auto",
    title: "BALANCED AUTO CYCLE",
    badge: "DEFAULT",
    icon: "🔄",
    desc: "Smooth ambient round-robin cycling across all online house cameras.",
    glow: "rgba(16, 185, 129, 0.25)",
    activeBorder: "border-emerald-500 bg-emerald-950/40 text-emerald-200",
  },
];

const OPERATOR_DECK_IDS: OperatorDeck[] = [
  "house",
  "switcher",
  "sources",
  "drops",
  "tavern",
  "soundboard",
  "trash",
  "scavenger",
  "pets",
  "members",
  "director",
  "rooms",
  "portals",
  "moderation",
  "overlays",
  "economy",
  "users",
  "channels",
  "webhooks",
  "system",
];

function isOperatorDeck(value: string | null): value is OperatorDeck {
  return value !== null && (OPERATOR_DECK_IDS as string[]).includes(value);
}

export function HouseConsole({
  operatorName,
  operatorRole,
}: HouseConsoleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Reloading used to always land back on "house" — every deck switch was
  // pure React state, nothing in the URL to restore. Confirmed live
  // 2026-08-23: an operator working in one deck who refreshes (or whose tab
  // reloads for any other reason) got silently bounced back to the default
  // deck with no way to tell that's what happened. The URL is now the
  // source of truth on mount, so a reload — or sharing/bookmarking the
  // link — lands back on the same deck instead of resetting.
  const [activeDeck, setActiveDeckState] = useState<OperatorDeck>(() => {
    const fromUrl = searchParams.get("deck");
    return isOperatorDeck(fromUrl) ? fromUrl : "house";
  });

  const setActiveDeck = (deck: OperatorDeck) => {
    setActiveDeckState(deck);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("deck", deck);
    router.replace(`?${params.toString()}`, { scroll: false });
  };
  const { snapshot, liveById, isOnline } = useTankCameras();
  const cameras = snapshot?.cameras ?? [];
  const rooms = snapshot?.rooms ?? [];
  const roomKeys = rooms.map((r) => r.roomKey);
  const {
    counts: presenceCounts,
    viewersByRoom,
    total: totalPresence,
  } = useHousePresence(roomKeys);
  const [rosterRoomKey, setRosterRoomKey] = useState<string>("director");
  const [portalStudioRoomScope, setPortalStudioRoomScope] = useState<
    string | undefined
  >();
  const {
    attentionLock,
    timeRemainingSeconds,
    loading: attentionLoading,
    setAttention,
    releaseAttention,
  } = useDirectorAttention();
  const { metricsMap } = useCameraAudioMetrics(cameras);

  // Director Quick Mode state
  const [currentDirectorMode, setCurrentDirectorMode] =
    useState<SubjectMode>("auto");
  const [modeSwitching, setModeSwitching] = useState(false);

  useEffect(() => {
    void getDirectorModeAction().then((res) => {
      if (res.success && res.mode) setCurrentDirectorMode(res.mode);
    });
  }, []);

  const handleSelectDirectorMode = async (mode: SubjectMode) => {
    setModeSwitching(true);
    setCurrentDirectorMode(mode);
    const res = await setDirectorModeAction(mode);
    if (res.success) {
      addLog(`SET DIRECTOR MODE: ${mode.toUpperCase()}`, "AI VISION ENGINE");
    }
    setModeSwitching(false);
  };

  // Director Feed Priorities state (IRL / OBS Auto-Switch Toggles)
  const [feedPriorities, setFeedPriorities] = useState<DirectorFeedPriorities>({
    irlPriority: true,
    obsPriority: true,
    autoSwitchOnLive: true,
  });
  const [prioritySaving, setPrioritySaving] = useState(false);

  useEffect(() => {
    void getDirectorPrioritiesAction().then((res) => {
      if (res.success && res.priorities) {
        setFeedPriorities(res.priorities);
      }
    });
  }, []);

  const handleToggleFeedPriority = async (
    key: keyof DirectorFeedPriorities,
  ) => {
    const nextVal = !feedPriorities[key];
    const nextPriorities = { ...feedPriorities, [key]: nextVal };
    setFeedPriorities(nextPriorities);
    setPrioritySaving(true);
    const res = await setDirectorPrioritiesAction({ [key]: nextVal });
    if (res.success) {
      const label =
        key === "irlPriority"
          ? "IRL FEED AUTO-PRIORITY"
          : key === "obsPriority"
            ? "OBS STUDIO AUTO-PRIORITY"
            : "AUTO-SWITCH ON LIVE";
      addLog(
        `${label} ${nextVal ? "ENABLED (ACTIVE)" : "DISABLED (STANDBY)"}`,
        "DIRECTOR ENGINE",
      );
    }
    setPrioritySaving(false);
  };

  const handleTakeFeedLive = async (kind: "irl" | "obs") => {
    const targetCam = cameras.find((c) =>
      kind === "irl"
        ? c.slug.includes("irl") ||
          c.id.includes("irl") ||
          (c as any).kind === "irlcam"
        : c.slug.includes("obs") ||
          c.id.includes("obs") ||
          (c as any).kind === "obs",
    );
    if (!targetCam) {
      addLog(`NO ${kind.toUpperCase()} FEED FOUND ONLINE`, "DIRECTOR ENGINE");
      return;
    }
    const res = await setAttention({
      targetType: "camera",
      targetId: targetCam.id,
      targetLabel: targetCam.name,
      durationMinutes: 15,
      multiCameraMode: "audio_peak",
    });
    if (res.success) {
      addLog(
        `TAKEN LIVE ON DIRECTOR: ${targetCam.name.toUpperCase()} (15m lock)`,
        "DIRECTOR OVERRIDE",
      );
    }
  };

  // Director Attention form state
  const [attentionTargetType, setAttentionTargetType] = useState<
    "room" | "camera" | "irl"
  >("room");
  const [attentionTargetId, setAttentionTargetId] =
    useState<string>("living-room");
  const [attentionTargetLabel, setAttentionTargetLabel] =
    useState<string>("Living Room");
  const [attentionDuration, setAttentionDuration] = useState<
    number | "indefinite"
  >(30);
  const [multiCamMode, setMultiCamMode] = useState<
    "audio_peak" | "round_robin" | "fixed_primary"
  >("audio_peak");

  // Chat Moderation & Automod state
  const [automodConfig, setAutomodConfig] = useState<AutomodConfig>({
    enabled: true,
    blacklistedWords: [
      "nigger",
      "faggot",
      "kike",
      "chink",
      "dox",
      "kill yourself",
    ],
    blockLinks: true,
    whitelistedDomains: [
      "unenter.live",
      "tank.unenter.live",
      "youtube.com",
      "kick.com",
      "twitch.tv",
    ],
    slowModeSeconds: 3,
    subOnlyMode: false,
    maxMessageLength: 300,
  });
  const [bannedUsers, setBannedUsers] = useState<BannedUserEntry[]>([]);
  const [newBlacklistWord, setNewBlacklistWord] = useState("");
  const [manualBanUser, setManualBanUser] = useState("");
  const [manualBanReason, setManualBanReason] = useState("");

  // Console broadcast state
  const [consoleTargetRoom, setConsoleTargetRoom] = useState<string>("global");
  const [consoleMsgText, setConsoleMsgText] = useState("");
  const [consoleBusy, setConsoleBusy] = useState(false);

  // House-level state
  const [houseAlert, setHouseAlert] = useState<HouseAlertMode>("normal");
  const [houseLights, setHouseLights] = useState<HouseLightMode>("daylight");
  const [housePaText, setHousePaText] = useState("");
  const [paTarget, setPaTarget] = useState<"all" | "game-room" | "living-room">(
    "all",
  );
  const [paVoice, setPaVoice] = useState<
    "drill_sergeant" | "robot_ai" | "narrator"
  >("robot_ai");
  const [houseSfx, setHouseSfx] = useState<TankSfxLibraryEntry[]>([]);
  const [audioDispatchBusy, setAudioDispatchBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/sfx", { cache: "no-store" })
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Sound library unavailable")),
      )
      .then((payload: { sfx?: TankSfxLibraryEntry[] }) => {
        if (active) setHouseSfx(Array.isArray(payload.sfx) ? payload.sfx : []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const [commandLog, setCommandLog] = useState<
    {
      id: string;
      time: string;
      operator: string;
      action: string;
      target: string;
      status: string;
    }[]
  >([
    {
      id: "1",
      time: new Date().toLocaleTimeString(),
      operator: operatorName,
      action: "HOUSE CONSOLE INITIALIZED",
      target: "FULL HOUSE",
      status: "SUCCESS",
    },
  ]);

  // ═══════════ ROOM CONTROL DECK STATE ═══════════
  const [houseRooms, setHouseRooms] = useState<HouseRoomData[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editEyebrow, setEditEyebrow] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [masterVolume, setMasterVolume] = useState<number>(85);
  const [masterMuted, setMasterMuted] = useState<boolean>(false);
  const [savingRoomId, setSavingRoomId] = useState<string | null>(null);

  const refreshHouseRooms = async () => {
    setLoadingRooms(true);
    const res = await listHouseRoomsAction();
    if (res.success && res.rooms) {
      setHouseRooms(res.rooms);
    }
    setLoadingRooms(false);
  };

  useEffect(() => {
    void refreshHouseRooms();
  }, []);

  const handleStartEditRoom = (room: HouseRoomData) => {
    setEditingRoomId(room.id);
    setEditTitle(room.title);
    setEditEyebrow(room.eyebrow || "");
    setEditDesc(room.description || "");
  };

  const handleSaveRoomDetails = async (roomId: string) => {
    setSavingRoomId(roomId);
    const res = await updateHouseRoomAction(roomId, {
      title: editTitle.trim(),
      eyebrow: editEyebrow.trim() || undefined,
      description: editDesc.trim() || undefined,
    });
    if (res.success && res.room) {
      setHouseRooms((prev) =>
        prev.map((r) => (r.id === roomId ? res.room! : r)),
      );
      addLog(
        `UPDATED ROOM: "${editTitle.trim()}" [${roomId.toUpperCase()}]`,
        "ROOM CONTROL",
      );
      setEditingRoomId(null);
    }
    setSavingRoomId(null);
  };

  const handleUpdateRoomVolume = async (roomId: string, vol: number) => {
    setHouseRooms((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? {
              ...r,
              audio_output_config: { ...r.audio_output_config, volume: vol },
            }
          : r,
      ),
    );
    await updateHouseRoomAction(roomId, { volume: vol });
  };

  const handleToggleRoomMuteState = async (
    roomId: string,
    currentMuted: boolean,
  ) => {
    const nextMuted = !currentMuted;
    setHouseRooms((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? {
              ...r,
              audio_output_config: {
                ...r.audio_output_config,
                muted: nextMuted,
              },
            }
          : r,
      ),
    );
    await updateHouseRoomAction(roomId, { muted: nextMuted });
    addLog(
      `${nextMuted ? "MUTED" : "UNMUTED"} ROOM AUDIO [${roomId.toUpperCase()}]`,
      "AUDIO MATRIX",
    );
  };

  const handleSetRoomAudioOutput = async (
    roomId: string,
    audioOutputKind: "embedded" | "client-broadcast" | "host-bluetooth",
  ) => {
    const result = await updateHouseRoomAction(roomId, { audioOutputKind });
    if (result.success && result.room) {
      setHouseRooms((prev) =>
        prev.map((room) => (room.id === roomId ? result.room! : room)),
      );
      addLog(
        `ROOM OUTPUT SET TO ${audioOutputKind.toUpperCase()}`,
        roomId.toUpperCase(),
      );
    }
  };

  const handleSetAllMasterVolume = async (vol: number) => {
    setMasterVolume(vol);
    setHouseRooms((prev) =>
      prev.map((r) => ({
        ...r,
        audio_output_config: { ...r.audio_output_config, volume: vol },
      })),
    );
    await setMasterVolumeAction(vol);
    addLog(`MASTER VOLUME SET TO ${vol}%`, "HOUSE AUDIO");
  };

  const handleToggleMasterMute = async () => {
    const next = !masterMuted;
    setMasterMuted(next);
    setHouseRooms((prev) =>
      prev.map((r) => ({
        ...r,
        audio_output_config: { ...r.audio_output_config, muted: next },
      })),
    );
    await setMasterVolumeAction(masterVolume, next);
    addLog(
      `${next ? "MASTER MUTED ALL ROOMS" : "MASTER UNMUTED ALL ROOMS"}`,
      "HOUSE AUDIO",
    );
  };

  // Per-room kill-switch. See tank_rooms.is_offline / roomProjection.ts —
  // this fully omits the room from every public response, not a client-side
  // hide.
  const handleToggleRoomOffline = async (
    roomId: string,
    currentOffline: boolean,
  ) => {
    const nextOffline = !currentOffline;
    setHouseRooms((prev) =>
      prev.map((r) =>
        r.id === roomId ? { ...r, is_offline: nextOffline } : r,
      ),
    );
    const result = await updateHouseRoomAction(roomId, {
      isOffline: nextOffline,
    });
    if (!result.success) {
      // Roll back the optimistic flip — the operator needs to see this failed,
      // not believe a room went dark when it didn't.
      setHouseRooms((prev) =>
        prev.map((r) =>
          r.id === roomId ? { ...r, is_offline: currentOffline } : r,
        ),
      );
      addLog(
        `✗ FAILED TO ${nextOffline ? "DISABLE" : "RESTORE"} ROOM [${roomId.toUpperCase()}]: ${result.error ?? "unknown error"}`,
        "ROOM CONTROL",
      );
      return;
    }
    addLog(
      `ROOM ${nextOffline ? "TAKEN OFFLINE" : "RESTORED"} [${roomId.toUpperCase()}]`,
      "ROOM CONTROL",
    );
  };

  // "ALL ROOMS OFF"/"ALL ROOMS ON" panic button — deliberately a separate,
  // confirm-gated action rather than looping handleToggleRoomOffline per
  // room: one request, one atomic-feeling action, and the confirm() below
  // is the one deliberate speed bump on the one genuinely destructive
  // control in this deck.
  const [togglingAllRooms, setTogglingAllRooms] = useState(false);
  const handleToggleAllRoomsOffline = async (nextOffline: boolean) => {
    if (
      nextOffline &&
      !window.confirm(
        "Take ALL rooms offline right now? Every camera/room disappears from the public site immediately.",
      )
    ) {
      return;
    }
    setTogglingAllRooms(true);
    const result = await setAllHouseRoomsOfflineAction(nextOffline);
    if (result.success) {
      setHouseRooms((prev) =>
        prev.map((r) => ({ ...r, is_offline: nextOffline })),
      );
      addLog(
        `${nextOffline ? "ALL ROOMS TAKEN OFFLINE" : "ALL ROOMS RESTORED"} (${result.count ?? 0} rooms)`,
        "ROOM CONTROL",
      );
    } else {
      addLog(
        `✗ FAILED TO ${nextOffline ? "DISABLE" : "RESTORE"} ALL ROOMS: ${result.error ?? "unknown error"}`,
        "ROOM CONTROL",
      );
    }
    setTogglingAllRooms(false);
  };

  // Fetch live chat moderation config & banned users
  const refreshModeration = async () => {
    try {
      const res = await fetch("/api/tank/chat/moderate");
      const json = await res.json();
      if (json.success) {
        if (json.automodConfig) setAutomodConfig(json.automodConfig);
        if (json.bannedUsers) setBannedUsers(json.bannedUsers);
      }
    } catch {}
  };

  useEffect(() => {
    refreshModeration();
  }, []);

  // Pending TTS / SFX request queue
  const [pendingAudioRequests, setPendingAudioRequests] = useState<
    TankAudioRequest[]
  >([]);
  const [audioQueueBusyId, setAudioQueueBusyId] = useState<string | null>(null);

  const refreshAudioQueue = async () => {
    try {
      const requests = await listPendingAudioRequests();
      setPendingAudioRequests(requests);
    } catch {}
  };

  useEffect(() => {
    refreshAudioQueue();
    const timer = setInterval(refreshAudioQueue, 8000);
    return () => clearInterval(timer);
  }, []);

  const handleModerateAudioRequest = async (
    request: TankAudioRequest,
    decision: "approve" | "reject",
  ) => {
    if (audioQueueBusyId) return;
    setAudioQueueBusyId(request.id);
    try {
      const res = await moderateAudioRequest(request.id, decision);
      if (res.success) {
        setPendingAudioRequests((prev) =>
          prev.filter((r) => r.id !== request.id),
        );
        addLog(
          `${decision === "approve" ? "APPROVED" : "REJECTED"} ${request.kind.toUpperCase()} REQUEST (${request.userName})`,
          request.targetType === "room"
            ? (request.targetRoomKey || "ROOM").toUpperCase()
            : "WEBSITE",
        );
      }
    } catch {}
    setAudioQueueBusyId(null);
  };

  // Room-level quick controls for Show tab
  const [selectedRoom, setSelectedRoom] = useState<"game-room" | "living-room">(
    "game-room",
  );
  const [roomMuted, setRoomMuted] = useState<{ [key: string]: boolean }>({
    "game-room": false,
    "living-room": false,
  });
  const [roomTopics, setRoomTopics] = useState<{ [key: string]: string }>({
    "game-room": "Active Gaming & Challenges",
    "living-room": "General House Hangout",
  });
  const [roomTopicInput, setRoomTopicInput] = useState("");

  const addLog = (action: string, target: string) => {
    setCommandLog((prev) => [
      {
        id: Math.random().toString(36).substring(2, 9),
        time: new Date().toLocaleTimeString(),
        operator: operatorName,
        action,
        target,
        status: "EXECUTED",
      },
      ...prev.slice(0, 49),
    ]);
  };

  const handleSetDirectorAttention = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await setAttention({
      targetType: attentionTargetType,
      targetId: attentionTargetId,
      targetLabel: attentionTargetLabel,
      durationMinutes: attentionDuration,
      multiCameraMode: multiCamMode,
    });
    if (res.success) {
      addLog(
        `SET DIRECTOR ATTENTION [${attentionTargetLabel.toUpperCase()}] (${attentionDuration}m)`,
        "DIRECTOR FEED",
      );
    }
  };

  const handleReleaseDirectorAttention = async () => {
    const res = await releaseAttention();
    if (res.success) {
      addLog(
        "RELEASED DIRECTOR ATTENTION (RESUME AUTO-DIRECTOR)",
        "DIRECTOR FEED",
      );
    }
  };

  // ═══════════ LIVE HOUSE POLLS ═══════════
  const [housePoll, setHousePoll] = useState<ActivePoll | null>(null);
  const [pollQInput, setPollQInput] = useState("");
  const [pollOptsInput, setPollOptsInput] = useState<string[]>(["", ""]);
  const [pollDurInput, setPollDurInput] = useState<number | "indefinite">(5);
  const [pollSubmitting, setPollSubmitting] = useState(false);

  const loadHousePoll = async () => {
    try {
      const p = await getActivePoll();
      setHousePoll(p);
    } catch {}
  };

  useEffect(() => {
    void loadHousePoll();
    const interval = setInterval(() => void loadHousePoll(), 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateHousePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    setPollSubmitting(true);
    const res = await createPollAction({
      question: pollQInput,
      options: pollOptsInput,
      durationMinutes: pollDurInput,
    });
    if (res.success && res.poll) {
      setHousePoll(res.poll);
      setPollQInput("");
      setPollOptsInput(["", ""]);
      addLog(`LAUNCHED LIVE POLL: "${res.poll.question}"`, "LIVE CHAT");
    } else {
      alert(res.error || "Failed to create poll");
    }
    setPollSubmitting(false);
  };

  const handleEndHousePoll = async () => {
    if (!housePoll) return;
    await endPollAction(housePoll.id);
    addLog(`ENDED LIVE POLL: "${housePoll.question}"`, "LIVE CHAT");
    setHousePoll(null);
  };

  const handleUpdateAutomod = async (updated: Partial<AutomodConfig>) => {
    const next = { ...automodConfig, ...updated };
    setAutomodConfig(next);
    try {
      await fetch("/api/tank/chat/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_config", config: next }),
      });
      addLog("UPDATED CHAT AUTOMOD RULES", "LIVE CHAT");
    } catch {}
  };

  const handleAddBlacklistWord = async (e: React.FormEvent) => {
    e.preventDefault();
    const word = newBlacklistWord.trim().toLowerCase();
    if (!word || automodConfig.blacklistedWords.includes(word)) return;
    const nextWords = [...automodConfig.blacklistedWords, word];
    setNewBlacklistWord("");
    await handleUpdateAutomod({ blacklistedWords: nextWords });
    addLog(`ADDED BLACKLIST WORD: "${word}"`, "AUTOMOD");
  };

  const handleRemoveBlacklistWord = async (wordToRemove: string) => {
    const nextWords = automodConfig.blacklistedWords.filter(
      (w) => w !== wordToRemove,
    );
    await handleUpdateAutomod({ blacklistedWords: nextWords });
    addLog(`REMOVED BLACKLIST WORD: "${wordToRemove}"`, "AUTOMOD");
  };

  const handleUnban = async (userId: string, userName: string) => {
    try {
      await fetch("/api/tank/chat/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unban", userId }),
      });
      setBannedUsers((prev) => prev.filter((b) => b.userId !== userId));
      addLog(`UNBANNED USER: ${userName}`, "CHAT MODERATION");
    } catch {}
  };

  const handleManualBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBanUser.trim()) return;
    try {
      const res = await fetch("/api/tank/chat/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ban",
          userId: manualBanUser.trim(),
          userName: manualBanUser.trim(),
          reason: manualBanReason.trim() || "Banned via House Console",
          durationMinutes: "permanent",
        }),
      });
      if (res.ok) {
        addLog(`BANNED USER: ${manualBanUser.trim()}`, "CHAT MODERATION");
        setManualBanUser("");
        setManualBanReason("");
        refreshModeration();
      }
    } catch {}
  };

  const handleBroadcastConsoleMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const textToSend = consoleMsgText.trim();
    if (!textToSend || consoleBusy) return;
    setConsoleBusy(true);
    try {
      const result = await broadcastConsoleMessage(
        consoleTargetRoom,
        textToSend,
      );
      if (result.success) {
        addLog(
          `CONSOLE BROADCAST [${consoleTargetRoom.toUpperCase()}]: "${textToSend}"`,
          "LIVE CHAT",
        );
        setConsoleMsgText("");
      }
    } catch {}
    setConsoleBusy(false);
  };

  const handleSendPa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!housePaText.trim() || audioDispatchBusy) return;
    setAudioDispatchBusy(true);
    void fetch("/api/tank/admin/audio-dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "tts",
        text: housePaText.trim(),
        voice: paVoice,
        target: paTarget,
      }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          rooms?: string[];
        };
        if (!response.ok)
          throw new Error(payload.error ?? "PA dispatch failed.");
        addLog(
          `QUEUED PA [${paVoice.toUpperCase()}]: "${housePaText.trim()}"`,
          (payload.rooms ?? [paTarget]).join(", ").toUpperCase(),
        );
        setHousePaText("");
      })
      .catch((error) => {
        addLog(
          `PA FAILED: ${error instanceof Error ? error.message : "Unknown error"}`,
          paTarget.toUpperCase(),
        );
      })
      .finally(() => setAudioDispatchBusy(false));
  };

  const handleTriggerSfx = async (sfx: TankSfxLibraryEntry) => {
    if (audioDispatchBusy) return;
    setAudioDispatchBusy(true);
    try {
      const response = await fetch("/api/tank/admin/audio-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "sfx",
          soundKey: sfx.soundKey,
          target: paTarget,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        rooms?: string[];
      };
      if (!response.ok)
        throw new Error(payload.error ?? "SFX dispatch failed.");
      addLog(
        `QUEUED SFX: ${sfx.name}`,
        (payload.rooms ?? [paTarget]).join(", ").toUpperCase(),
      );
    } catch (error) {
      addLog(
        `SFX FAILED: ${error instanceof Error ? error.message : "Unknown error"}`,
        paTarget.toUpperCase(),
      );
    } finally {
      setAudioDispatchBusy(false);
    }
  };

  const handleSetAlert = (mode: HouseAlertMode) => {
    setHouseAlert(mode);
    addLog(`SET HOUSE ALERT: ${mode.toUpperCase()}`, "FULL HOUSE");
  };

  const handleSetLights = (mode: HouseLightMode) => {
    setHouseLights(mode);
    addLog(`SET AMBIENT LIGHTS: ${mode.toUpperCase()}`, "FULL HOUSE");
  };

  const toggleRoomMute = (room: "game-room" | "living-room") => {
    const next = !roomMuted[room];
    setRoomMuted((prev) => ({ ...prev, [room]: next }));
    addLog(`${next ? "MUTE" : "UNMUTE"} ROOM AUDIO`, room.toUpperCase());
  };

  const handleUpdateTopic = (room: "game-room" | "living-room") => {
    if (!roomTopicInput.trim()) return;
    setRoomTopics((prev) => ({ ...prev, [room]: roomTopicInput.trim() }));
    addLog(`UPDATE TOPIC: "${roomTopicInput.trim()}"`, room.toUpperCase());
    setRoomTopicInput("");
  };

  const formatTimer = (seconds: number | null) => {
    if (seconds === null) return "Indefinite";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Dedicated monitor preview camera
  const primaryCam = cameras[0];
  const primaryCamOnline = primaryCam ? isOnline(primaryCam.id) : false;
  const [scene, setScene] = useState("LIVE");
  const [locked, setLocked] = useState(true);
  const legacyAdminSources = useMemo<TankCamera[]>(
    () =>
      cameras.map((camera) => ({
        id: camera.id,
        slug: camera.slug,
        name: camera.name,
        location: camera.roomScope || camera.location,
        description: camera.description,
        health:
          camera.presence === "online"
            ? "live"
            : camera.presence === "degraded"
              ? "degraded"
              : "offline",
        bitrateKbps: camera.bitrateKbps,
        latencyMs: camera.latencyMs,
        viewers: 0,
        priority: camera.priority,
        enabled: camera.enabled,
        isPublic: camera.publicVisible,
        delivery:
          camera.playbackProtocol === "whep"
            ? "webrtc"
            : camera.playbackProtocol === "hls"
              ? "hls"
              : "coming-soon",
        accent: camera.accent,
        audioSourceId: camera.audioSourceId,
        audioSourceName: camera.audioSourceName,
      })),
    [cameras],
  );
  const [adminSources, setAdminSources] =
    useState<TankCamera[]>(legacyAdminSources);

  useEffect(() => {
    setAdminSources(legacyAdminSources);
  }, [legacyAdminSources]);

  const updateSource = (id: string, patch: Partial<TankCamera>) =>
    setAdminSources((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );

  const DECKS: {
    id: OperatorDeck;
    label: string;
    icon: React.ReactNode;
    badge?: string | number;
  }[] = [
    { id: "house", label: "House & Show", icon: <Home className="h-4 w-4" /> },
    {
      id: "director",
      label: "Director Studio",
      icon: <Target className="h-4 w-4" />,
      badge: attentionLock.active
        ? "LOCKED"
        : currentDirectorMode.toUpperCase(),
    },
    {
      id: "switcher",
      label: "Switcher",
      icon: <Video className="h-4 w-4" />,
      badge: "MASTER",
    },
    {
      id: "sources",
      label: "Ingest & Keys",
      icon: <Antenna className="h-4 w-4" />,
      badge: "SRT/RTMP",
    },
    {
      id: "drops",
      label: "Drops",
      icon: <Gift className="h-4 w-4" />,
      badge: "REWARDS",
    },
    {
      id: "tavern",
      label: "Tavern",
      icon: <Beer className="h-4 w-4" />,
      badge: "CHAOS",
    },
    {
      id: "soundboard",
      label: "Soundboard",
      icon: <Volume2 className="h-4 w-4" />,
      badge: `${houseSfx.length}`,
    },
    {
      id: "trash",
      label: "Trash & Bounties",
      icon: <Trash2 className="h-4 w-4" />,
      badge: "NEW",
    },
    {
      id: "scavenger",
      label: "Scavenger Hunts",
      icon: <Target className="h-4 w-4" />,
      badge: "AI YOLO",
    },
    {
      id: "pets",
      label: "House Pets",
      icon: <Heart className="h-4 w-4" />,
      badge: "4 ENROLLED",
    },
    {
      id: "members",
      label: "Identity Registry",
      icon: <UserCheck className="h-4 w-4" />,
      badge: "7 PROFILES",
    },
    {
      id: "rooms",
      label: "Room Control",
      icon: <Sliders className="h-4 w-4" />,
      badge: `${houseRooms.length} Rooms`,
    },
    {
      id: "portals",
      label: "Doorways & Spatial Matrix",
      icon: <DoorOpen className="h-4 w-4" />,
      badge: "SPATIAL",
    },
    {
      id: "moderation",
      label: "Chat & Moderation",
      icon: <Shield className="h-4 w-4" />,
      badge:
        pendingAudioRequests.length > 0
          ? pendingAudioRequests.length
          : undefined,
    },
    {
      id: "overlays",
      label: "Overlays & Triggers",
      icon: <Layers className="h-4 w-4" />,
    },
    {
      id: "economy",
      label: "Economy & RNG",
      icon: <Dices className="h-4 w-4" />,
    },
    {
      id: "users",
      label: "Users & Levels",
      icon: <Users className="h-4 w-4" />,
    },
    {
      id: "channels",
      label: "Channels",
      icon: <RadioTower className="h-4 w-4" />,
    },
    {
      id: "webhooks",
      label: "Webhooks",
      icon: <Webhook className="h-4 w-4" />,
    },
    {
      id: "system",
      label: "System Health",
      icon: <Settings2 className="h-4 w-4" />,
    },
  ];

  return (
    <main className="min-h-[100dvh] min-h-screen bg-[#0d0e11] p-2 text-slate-200 md:p-4">
      {/* ═══════════ TOP COMMAND DECK HEADER ═══════════ */}
      <header className="mb-3 rounded-lg border border-[#2d3139] bg-gradient-to-r from-[#17191e] via-[#1b1e24] to-[#17191e] p-3 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded border border-orange-500/40 bg-orange-950/40 text-orange-400 shadow-[0_0_15px_rgba(255,77,0,0.3)]">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1
                  className="text-base font-black uppercase tracking-wider text-white md:text-lg"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  HOUSE COMMAND CONSOLE
                </h1>
                <span className="rounded border border-emerald-500/40 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                  STAFF DECK
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-400">
                Operator:{" "}
                <span className="font-bold text-white">{operatorName}</span> ·
                Clearance:{" "}
                <span className="font-bold uppercase text-orange-400">
                  {operatorRole}
                </span>{" "}
                · Alert:{" "}
                <span
                  className={`font-bold uppercase ${
                    houseAlert === "normal"
                      ? "text-emerald-400"
                      : houseAlert === "challenge"
                        ? "text-amber-400"
                        : houseAlert === "lockdown"
                          ? "animate-pulse text-red-400"
                          : "text-blue-400"
                  }`}
                >
                  {houseAlert}
                </span>{" "}
                · Viewers:{" "}
                <span className="font-bold text-emerald-400">
                  {totalPresence}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/Director"
              target="_blank"
              className="flex items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-xs font-bold text-cyan-300 shadow transition hover:bg-cyan-900/60 hover:text-white"
            >
              <Video className="h-3.5 w-3.5 text-cyan-400" />
              Director Console
            </Link>
            <Link
              href="/admin"
              target="_blank"
              className="flex items-center gap-1.5 rounded border border-purple-500/40 bg-purple-950/40 px-3 py-1.5 text-xs font-bold text-purple-300 shadow transition hover:bg-purple-900/60 hover:text-white"
            >
              <Shield className="h-3.5 w-3.5 text-purple-400" />
              Admin Portal
            </Link>
            <Link
              href="/obs"
              target="_blank"
              className="flex items-center gap-1.5 rounded border border-orange-500/40 bg-orange-950/40 px-3 py-1.5 text-xs font-bold text-orange-300 transition hover:bg-orange-900/60 hover:text-white"
            >
              <Tv className="h-3.5 w-3.5 text-orange-400" />
              OBS Source
            </Link>
            <Link
              href="/"
              className="flex items-center gap-2 rounded border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
            >
              Return to Broadcast
            </Link>
          </div>
        </div>

        {/* ═══════════ OPERATOR DECK TABS (MODULAR NAVIGATION) ═══════════ */}
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/10 pt-2.5">
          {DECKS.map((deck) => {
            const isActive = activeDeck === deck.id;
            return (
              <button
                key={deck.id}
                type="button"
                onClick={() => setActiveDeck(deck.id)}
                className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-black uppercase tracking-wider transition-all ${
                  isActive
                    ? "border border-orange-500/60 bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-[0_0_12px_rgba(255,102,0,0.4)]"
                    : "border border-slate-700/50 bg-[#121316] text-slate-400 hover:border-slate-600 hover:bg-[#181a1f] hover:text-slate-200"
                }`}
              >
                {deck.icon}
                <span>{deck.label}</span>
                {deck.badge && (
                  <span
                    className={`py-0.2 rounded-full px-1.5 text-[9px] font-black ${
                      isActive
                        ? "bg-black/40 text-white"
                        : "border border-orange-500/30 bg-orange-500/20 text-orange-400"
                    }`}
                  >
                    {deck.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* ═══════════ MAIN HOUSE WORKSPACE GRID ═══════════ */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* ── LEFT: Active Deck Content (8 Cols) ── */}
        <div className="space-y-4 lg:col-span-8">
          {/* ════════════════════════════════════════════════════════════════
              DECK 1: 🎮 HOUSE & SHOW CONTROL
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "house" && (
            <div className="space-y-4">
              {/* 0. 📊 LIVE HOUSE TELEMETRY */}
              <ChromePanel withScrews>
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-black/15 pb-1">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                        LIVE HOUSE TELEMETRY
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[#666]">
                      Realtime Presence
                    </span>
                  </div>

                  {/* Per-room viewer counts */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded border border-emerald-500/30 bg-emerald-950/20 p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 text-emerald-400">
                        <Eye className="h-3.5 w-3.5" />
                        <span className="text-lg font-black">
                          {totalPresence}
                        </span>
                      </div>
                      <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                        Total in House
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRosterRoomKey("director")}
                      className={`rounded border p-2.5 text-center transition ${
                        rosterRoomKey === "director"
                          ? "border-orange-500 bg-orange-950/30 ring-1 ring-orange-500"
                          : "border-black/20 bg-white/40 hover:bg-white/60"
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1 text-[#241f14]">
                        <Eye className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-lg font-black">
                          {presenceCounts.get("director") ?? 0}
                        </span>
                      </div>
                      <p className="truncate text-[9px] font-black uppercase tracking-wide text-slate-500">
                        Global / Director
                      </p>
                    </button>
                    {rooms.map((room) => (
                      <button
                        type="button"
                        key={room.roomKey}
                        onClick={() => setRosterRoomKey(room.roomKey)}
                        className={`rounded border p-2.5 text-center transition ${
                          rosterRoomKey === room.roomKey
                            ? "border-orange-500 bg-orange-950/30 ring-1 ring-orange-500"
                            : "border-black/20 bg-white/40 hover:bg-white/60"
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1 text-[#241f14]">
                          <Eye className="h-3.5 w-3.5 text-slate-500" />
                          <span className="text-lg font-black">
                            {presenceCounts.get(room.roomKey) ?? 0}
                          </span>
                        </div>
                        <p className="truncate text-[9px] font-black uppercase tracking-wide text-slate-500">
                          {room.title}
                        </p>
                      </button>
                    ))}
                  </div>

                  {/* Who's Where */}
                  <div className="space-y-2 rounded border border-black/20 bg-white/40 p-3">
                    <div className="flex items-center justify-between border-b border-black/10 pb-1.5">
                      <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#4c4630]">
                        <Users className="h-3.5 w-3.5 text-orange-600" />
                        Who's Here —{" "}
                        {rosterRoomKey === "director"
                          ? "Global / Director"
                          : (rooms.find((r) => r.roomKey === rosterRoomKey)
                              ?.title ?? rosterRoomKey)}
                      </span>
                      <span className="rounded bg-black/10 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                        {(viewersByRoom.get(rosterRoomKey) ?? []).length} active{" "}
                        {(viewersByRoom.get(rosterRoomKey) ?? []).length === 1
                          ? "viewer"
                          : "viewers"}
                      </span>
                    </div>
                    {(viewersByRoom.get(rosterRoomKey) ?? []).length === 0 ? (
                      <p className="py-2 text-xs font-semibold italic text-slate-600">
                        Nobody tuned into this room right now.
                      </p>
                    ) : (
                      <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3">
                        {(viewersByRoom.get(rosterRoomKey) ?? []).map(
                          (viewer, i) => (
                            <div
                              key={`${viewer.userId ?? "anon"}-${i}`}
                              className="flex items-center justify-between gap-2 rounded border border-black/15 bg-black/80 p-2 text-white shadow-sm transition hover:border-orange-500/50"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                {viewer.avatarUrl ? (
                                  <img
                                    src={viewer.avatarUrl}
                                    alt=""
                                    className="h-7 w-7 rounded-full border border-white/20 object-cover"
                                  />
                                ) : (
                                  <span className="grid h-7 w-7 place-items-center rounded-full border border-white/20 bg-gradient-to-br from-slate-600 to-slate-800 text-[10px] font-black text-white">
                                    {viewer.displayName
                                      .slice(0, 1)
                                      .toUpperCase()}
                                  </span>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1">
                                    <span className="truncate text-xs font-black leading-tight text-slate-100">
                                      {viewer.displayName}
                                    </span>
                                    {viewer.rank && (
                                      <span
                                        className={`py-0.2 rounded px-1 text-[8px] font-black uppercase tracking-wider ${
                                          viewer.rank === "Admin"
                                            ? "bg-red-600 text-white"
                                            : viewer.rank === "Mod"
                                              ? "bg-amber-500 text-black"
                                              : viewer.rank === "Legend"
                                                ? "bg-purple-600 text-white"
                                                : viewer.rank === "Veteran"
                                                  ? "bg-blue-600 text-white"
                                                  : viewer.rank === "VIP"
                                                    ? "bg-emerald-600 text-white"
                                                    : "bg-white/20 text-slate-300"
                                        }`}
                                      >
                                        {viewer.rank}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] text-slate-400">
                                    <span>Lv. {viewer.level ?? 1}</span>
                                    <span>·</span>
                                    <span className="font-bold text-amber-400">
                                      🪙 {viewer.tokens ?? 0}
                                    </span>
                                    <span>·</span>
                                    <span>
                                      {viewer.isCellular ? "📱 4G" : "💻 Desk"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </ChromePanel>

              {/* House Alert State & Ambient Lighting Controls */}
              <div className="grid gap-4 sm:grid-cols-2">
                <ChromePanel withScrews>
                  <div className="mb-2 border-b border-black/15 pb-1 text-xs font-black uppercase tracking-wider text-[#241f14]">
                    HOUSE ALERT STATUS
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSetAlert("normal")}
                      className={`flex flex-col items-center gap-1 rounded border p-2 text-center transition ${
                        houseAlert === "normal"
                          ? "border-emerald-500 bg-emerald-950/40 text-emerald-300 ring-2 ring-emerald-500"
                          : "border-black/20 bg-black/5 text-[#4c4630] hover:bg-black/10"
                      }`}
                    >
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      <span className="text-xs font-black uppercase">
                        Normal
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Live Active
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetAlert("challenge")}
                      className={`flex flex-col items-center gap-1 rounded border p-2 text-center transition ${
                        houseAlert === "challenge"
                          ? "border-amber-500 bg-amber-950/40 text-amber-300 ring-2 ring-amber-500"
                          : "border-black/20 bg-black/5 text-[#4c4630] hover:bg-black/10"
                      }`}
                    >
                      <Award className="h-5 w-5 text-amber-500" />
                      <span className="text-xs font-black uppercase">
                        Challenge
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Game Active
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetAlert("lockdown")}
                      className={`flex flex-col items-center gap-1 rounded border p-2 text-center transition ${
                        houseAlert === "lockdown"
                          ? "animate-pulse border-red-500 bg-red-950/40 text-red-300 ring-2 ring-red-500"
                          : "border-black/20 bg-black/5 text-[#4c4630] hover:bg-black/10"
                      }`}
                    >
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                      <span className="text-xs font-black uppercase">
                        Code Red
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Lockdown
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetAlert("quiet")}
                      className={`flex flex-col items-center gap-1 rounded border p-2 text-center transition ${
                        houseAlert === "quiet"
                          ? "border-blue-500 bg-blue-950/40 text-blue-300 ring-2 ring-blue-500"
                          : "border-black/20 bg-black/5 text-[#4c4630] hover:bg-black/10"
                      }`}
                    >
                      <Moon className="h-5 w-5 text-blue-500" />
                      <span className="text-xs font-black uppercase">
                        Quiet Mode
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Night Mute
                      </span>
                    </button>
                  </div>
                </ChromePanel>

                <ChromePanel withScrews>
                  <div className="mb-2 border-b border-black/15 pb-1 text-xs font-black uppercase tracking-wider text-[#241f14]">
                    HOUSE AMBIENCE & LIGHTING
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSetLights("daylight")}
                      className={`flex items-center gap-2 rounded border p-2 text-left transition ${
                        houseLights === "daylight"
                          ? "border-yellow-500 bg-yellow-950/30 text-yellow-300 ring-yellow-500 ring-1"
                          : "border-black/20 bg-black/5 text-[#4c4630] hover:bg-black/10"
                      }`}
                    >
                      <Sun className="text-yellow-500 h-4 w-4" />
                      <div>
                        <p className="text-xs font-black uppercase">Daylight</p>
                        <p className="text-[9px] text-slate-500">Full 100%</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetLights("cinema")}
                      className={`flex items-center gap-2 rounded border p-2 text-left transition ${
                        houseLights === "cinema"
                          ? "border-purple-500 bg-purple-950/30 text-purple-300 ring-1 ring-purple-500"
                          : "border-black/20 bg-black/5 text-[#4c4630] hover:bg-black/10"
                      }`}
                    >
                      <Moon className="h-4 w-4 text-purple-400" />
                      <div>
                        <p className="text-xs font-black uppercase">
                          Cinema Dim
                        </p>
                        <p className="text-[9px] text-slate-500">Warm 30%</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetLights("strobe")}
                      className={`flex items-center gap-2 rounded border p-2 text-left transition ${
                        houseLights === "strobe"
                          ? "border-pink-500 bg-pink-950/30 text-pink-300 ring-1 ring-pink-500"
                          : "border-black/20 bg-black/5 text-[#4c4630] hover:bg-black/10"
                      }`}
                    >
                      <Zap className="h-4 w-4 text-pink-400" />
                      <div>
                        <p className="text-xs font-black uppercase">
                          Party Strobe
                        </p>
                        <p className="text-[9px] text-slate-500">Color Cycle</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetLights("red_alert")}
                      className={`flex items-center gap-2 rounded border p-2 text-left transition ${
                        houseLights === "red_alert"
                          ? "border-red-500 bg-red-950/30 text-red-300 ring-1 ring-red-500"
                          : "border-black/20 bg-black/5 text-[#4c4630] hover:bg-black/10"
                      }`}
                    >
                      <Flame className="h-4 w-4 text-red-500" />
                      <div>
                        <p className="text-xs font-black uppercase">
                          Red Alert
                        </p>
                        <p className="text-[9px] text-slate-500">
                          Emergency Red
                        </p>
                      </div>
                    </button>
                  </div>
                </ChromePanel>
              </div>

              {/* Master Public Address / TTS Broadcast */}
              <ChromePanel withScrews>
                <form onSubmit={handleSendPa} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 pb-2">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-orange-500" />
                      <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                        Master Public Address / TTS Broadcast
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <label className="font-bold text-[#4c4630]">
                        Target:
                      </label>
                      <select
                        value={paTarget}
                        onChange={(e) => setPaTarget(e.target.value as any)}
                        className="rounded border border-black/20 bg-white/80 px-2 py-0.5 text-xs font-bold text-[#241f14]"
                      >
                        <option value="all">Full House (All Rooms)</option>
                        <option value="game-room">Game Room Only</option>
                        <option value="living-room">Living Room Only</option>
                      </select>

                      <label className="ml-2 font-bold text-[#4c4630]">
                        Voice:
                      </label>
                      <select
                        value={paVoice}
                        onChange={(e) => setPaVoice(e.target.value as any)}
                        className="rounded border border-black/20 bg-white/80 px-2 py-0.5 text-xs font-bold text-[#241f14]"
                      >
                        <option value="robot_ai">AI Overseer</option>
                        <option value="drill_sergeant">Drill Sergeant</option>
                        <option value="narrator">Game Master</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={housePaText}
                      onChange={(e) => setHousePaText(e.target.value)}
                      placeholder="Type an announcement to broadcast through house speakers..."
                      className="flex-1 rounded border border-black/30 bg-white/90 px-3 py-2 text-xs font-bold text-[#241f14] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <ConsoleButton
                      variant="orange"
                      type="submit"
                      disabled={audioDispatchBusy || !housePaText.trim()}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Broadcast PA
                    </ConsoleButton>
                  </div>
                </form>
              </ChromePanel>

              {/* SFX Soundboard */}
              <ChromePanel withScrews>
                <div className="mb-2 border-b border-black/15 pb-1 text-xs font-black uppercase tracking-wider text-[#241f14]">
                  HOUSE SFX & SOUNDBOARD
                </div>
                {houseSfx.length === 0 ? (
                  <p className="rounded border border-dashed border-black/20 bg-white/30 p-3 text-xs font-bold text-[#4c4630]">
                    No approved clips yet. Upload the Discord archive clips in
                    Tank Settings → Soundboard.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {houseSfx.map((sfx) => (
                      <button
                        key={sfx.id}
                        type="button"
                        disabled={audioDispatchBusy}
                        onClick={() => void handleTriggerSfx(sfx)}
                        className="flex items-center gap-2.5 rounded border border-black/20 bg-white/60 p-2.5 text-left shadow-sm transition hover:border-orange-500 hover:bg-white active:scale-95 disabled:opacity-50"
                      >
                        {sfx.iconUrl ? (
                          <img
                            src={sfx.iconUrl}
                            alt={sfx.name}
                            className="h-7 w-7 shrink-0 rounded object-contain"
                            onError={(e) => {
                              (
                                e.currentTarget as HTMLImageElement
                              ).style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="text-xl">🔊</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-black uppercase text-[#241f14]">
                            {sfx.name}
                          </p>
                          <p className="text-[9px] font-bold text-[#888]">
                            {sfx.category}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ChromePanel>

              {/* Live House Polls */}
              <ChromePanel withScrews>
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-black/15 pb-1">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-orange-600" />
                      <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                        LIVE HOUSE POLLS & COMMUNITY VOTES
                      </span>
                    </div>
                    {housePoll && (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 rounded border border-orange-500/30 bg-orange-950/20 px-2 py-0.5 text-[10px] font-bold text-orange-600">
                          <Pin className="h-3 w-3" /> Pinned in Chat (
                          {housePoll.totalVotes} votes)
                        </span>
                        <ConsoleButton
                          variant="red"
                          onClick={handleEndHousePoll}
                          className="!px-2.5 !py-1 !text-[10px] font-black uppercase"
                        >
                          End Poll
                        </ConsoleButton>
                      </div>
                    )}
                  </div>

                  {housePoll && (
                    <div className="space-y-2 rounded border border-orange-500/30 bg-orange-950/20 p-3">
                      <div className="flex items-center justify-between text-xs font-black text-[#241f14]">
                        <span>QUESTION: {housePoll.question}</span>
                        <span className="font-mono text-[10px] text-[#4c4630]">
                          {housePoll.durationMinutes === "indefinite"
                            ? "Open Poll"
                            : `${housePoll.durationMinutes}m duration`}
                        </span>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {housePoll.options.map((opt) => {
                          const pct =
                            housePoll.totalVotes > 0
                              ? Math.round(
                                  (opt.votes / housePoll.totalVotes) * 100,
                                )
                              : 0;
                          return (
                            <div
                              key={opt.id}
                              className="relative flex items-center justify-between overflow-hidden rounded border border-black/20 bg-white/70 px-2.5 py-1.5 text-xs font-bold"
                            >
                              <div
                                className="pointer-events-none absolute inset-y-0 left-0 bg-orange-500/25"
                                style={{ width: `${pct}%` }}
                              />
                              <span className="relative z-10">{opt.text}</span>
                              <span className="relative z-10 font-mono text-[10px] text-[#4c4630]">
                                {pct}% ({opt.votes})
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <form
                    onSubmit={handleCreateHousePoll}
                    className="space-y-3 rounded border border-black/20 bg-white/40 p-3"
                  >
                    <p className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                      Launch New Broadcast Poll
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-4">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[10px] font-black uppercase text-[#4c4630]">
                          Poll Question
                        </label>
                        <input
                          type="text"
                          required
                          value={pollQInput}
                          onChange={(e) => setPollQInput(e.target.value)}
                          placeholder="e.g. Who wins the next room fight?"
                          className="w-full rounded border border-black/20 bg-white/90 px-2.5 py-1 text-xs font-bold text-[#241f14]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[10px] font-black uppercase text-[#4c4630]">
                          Duration
                        </label>
                        <select
                          value={pollDurInput.toString()}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPollDurInput(
                              v === "indefinite"
                                ? "indefinite"
                                : parseInt(v, 10),
                            );
                          }}
                          className="w-full rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-bold text-[#241f14]"
                        >
                          <option value="2">2 Minutes (Flash)</option>
                          <option value="5">5 Minutes</option>
                          <option value="10">10 Minutes</option>
                          <option value="30">30 Minutes</option>
                          <option value="indefinite">
                            Until Manually Ended
                          </option>
                        </select>
                      </div>

                      <div className="flex items-end">
                        <ConsoleButton
                          variant="orange"
                          type="submit"
                          disabled={pollSubmitting}
                          className="w-full !py-1.5 !text-xs font-black uppercase"
                        >
                          {pollSubmitting
                            ? "Broadcasting..."
                            : "Broadcast Poll"}
                        </ConsoleButton>
                      </div>
                    </div>

                    <div className="grid gap-2 pt-1 sm:grid-cols-2">
                      {pollOptsInput.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <span className="w-4 font-mono text-[10px] font-bold text-[#4c4630]">
                            #{idx + 1}
                          </span>
                          <input
                            type="text"
                            required
                            value={opt}
                            onChange={(e) => {
                              const copy = [...pollOptsInput];
                              copy[idx] = e.target.value;
                              setPollOptsInput(copy);
                            }}
                            placeholder={`Option ${idx + 1}`}
                            className="flex-1 rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-semibold text-[#241f14]"
                          />
                          {pollOptsInput.length > 2 && (
                            <button
                              type="button"
                              onClick={() =>
                                setPollOptsInput(
                                  pollOptsInput.filter((_, i) => i !== idx),
                                )
                              }
                              className="p-0.5 text-slate-400 hover:text-red-500"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      {pollOptsInput.length < 4 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPollOptsInput([...pollOptsInput, ""])
                          }
                          className="flex items-center gap-1 py-1 text-[11px] font-bold text-orange-600 hover:text-orange-700"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Another Option
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </ChromePanel>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK 2: 🎯 DIRECTOR & INGEST STUDIO
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "director" && (
            <div className="space-y-4">
              {/* Quick Mode Selection Deck */}
              <ChromePanel withScrews>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/15 pb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-cyan-600" />
                      <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                        DIRECTOR VISION & AI QUICK MODE SELECTOR
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold text-[#4c4630]">
                        ACTIVE MODE:{" "}
                        <span className="rounded bg-black/80 px-2 py-0.5 uppercase text-orange-400">
                          {currentDirectorMode}
                        </span>
                      </span>
                      <Link
                        href="/admin/director"
                        className="flex items-center gap-1 rounded bg-black/10 px-2.5 py-1 text-[10px] font-black uppercase text-[#241f14] transition hover:bg-black/20"
                      >
                        <Settings className="h-3 w-3 text-orange-600" />
                        Configure Virtual Canvas
                        <ExternalLink className="ml-0.5 h-2.5 w-2.5 text-slate-500" />
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    {DIRECTOR_QUICK_MODES.map((mode) => {
                      const isSelected = currentDirectorMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => handleSelectDirectorMode(mode.id)}
                          disabled={modeSwitching}
                          className={`relative flex flex-col justify-between rounded-lg border p-3 text-left transition-all active:scale-[0.98] ${
                            isSelected
                              ? `${mode.activeBorder} shadow-lg ring-2 ring-orange-500`
                              : "border-black/15 bg-white/50 text-[#241f14] shadow-sm hover:border-black/30 hover:bg-white/80"
                          }`}
                        >
                          <div>
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className="text-xl">{mode.icon}</span>
                              <span
                                className={`py-0.2 rounded px-1.5 text-[8px] font-black uppercase tracking-wider ${
                                  isSelected
                                    ? "bg-black/80 text-white"
                                    : "border border-black/10 bg-black/10 text-slate-600"
                                }`}
                              >
                                {mode.badge}
                              </span>
                            </div>
                            <h3 className="text-xs font-black uppercase tracking-tight">
                              {mode.title}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-600">
                              {mode.desc}
                            </p>
                          </div>
                          <div className="mt-2.5 flex items-center justify-between border-t border-black/10 pt-1.5 text-[9px] font-black">
                            <span
                              className={
                                isSelected
                                  ? "font-black text-orange-600"
                                  : "text-slate-500"
                              }
                            >
                              {isSelected
                                ? "● ACTIVE DEPLOYED"
                                : "CLICK TO ENGAGE"}
                            </span>
                            {isSelected && (
                              <CheckCircle2 className="h-3 w-3 text-orange-600" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </ChromePanel>

              {/* Director Ingest & Live Feed Auto-Switch Priority Deck */}
              <ChromePanel withScrews>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/15 pb-2">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 animate-pulse text-amber-600" />
                      <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                        DIRECTOR FEED PRIORITY & AUTO-SWITCH CONTROLS
                      </span>
                    </div>
                    <span className="font-mono text-[10px] font-bold text-[#4c4630]">
                      AUTO-INGEST PREFERENCE:{" "}
                      <span className="rounded bg-black/80 px-2 py-0.5 uppercase text-emerald-400">
                        {feedPriorities.irlPriority &&
                        feedPriorities.obsPriority
                          ? "IRL + OBS PRIORITY"
                          : feedPriorities.irlPriority
                            ? "IRL ONLY"
                            : feedPriorities.obsPriority
                              ? "OBS ONLY"
                              : "BALANCED CYCLE"}
                      </span>
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* IRL Priority Card */}
                    {(() => {
                      const liveIrlCams = cameras.filter(
                        (c) =>
                          (c.slug.includes("irl") ||
                            c.id.includes("irl") ||
                            (c as any).kind === "irlcam") &&
                          isOnline(c.id),
                      );
                      return (
                        <div
                          className={`relative flex flex-col justify-between rounded-lg border p-3.5 transition-all ${
                            feedPriorities.irlPriority
                              ? "border-amber-500/60 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.12)] ring-1 ring-amber-500/30"
                              : "border-black/15 bg-white/40 opacity-75"
                          }`}
                        >
                          <div>
                            <div className="mb-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Smartphone
                                  className={`h-5 w-5 ${feedPriorities.irlPriority ? "text-amber-600" : "text-slate-500"}`}
                                />
                                <h3 className="text-xs font-black uppercase tracking-tight text-[#241f14]">
                                  IRL Mobile / Backpack Feed
                                </h3>
                              </div>
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                                  liveIrlCams.length > 0
                                    ? "animate-pulse border-emerald-500/40 bg-emerald-500/20 text-emerald-700"
                                    : "border-black/10 bg-black/10 text-slate-600"
                                }`}
                              >
                                {liveIrlCams.length > 0
                                  ? `🟢 ${liveIrlCams.length} LIVE`
                                  : "STANDBY"}
                              </span>
                            </div>

                            <p className="text-[11px] leading-relaxed text-[#4c4630]">
                              When toggled{" "}
                              <strong className="font-black text-black">
                                ON
                              </strong>
                              , whenever an IRL rig or mobile stream goes live,
                              Director immediately takes priority and switches
                              program feed to it.
                            </p>
                          </div>

                          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-black/10 pt-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleFeedPriority("irlPriority")
                              }
                              disabled={prioritySaving}
                              className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-black uppercase transition active:scale-95 ${
                                feedPriorities.irlPriority
                                  ? "bg-amber-600 text-white shadow-md hover:bg-amber-500"
                                  : "bg-black/15 text-[#4c4630] hover:bg-black/25"
                              }`}
                            >
                              <Zap className="h-3.5 w-3.5" />
                              {feedPriorities.irlPriority
                                ? "⚡ Priority Enabled"
                                : "○ Priority Off"}
                            </button>

                            {liveIrlCams.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleTakeFeedLive("irl")}
                                className="rounded bg-black/80 px-2.5 py-1.5 text-[10px] font-black uppercase text-amber-400 shadow-sm transition hover:bg-black"
                              >
                                Take IRL Live
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* OBS Priority Card */}
                    {(() => {
                      const liveObsCams = cameras.filter(
                        (c) =>
                          (c.slug.includes("obs") ||
                            c.id.includes("obs") ||
                            (c as any).kind === "obs") &&
                          isOnline(c.id),
                      );
                      return (
                        <div
                          className={`relative flex flex-col justify-between rounded-lg border p-3.5 transition-all ${
                            feedPriorities.obsPriority
                              ? "border-cyan-500/60 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.12)] ring-1 ring-cyan-500/30"
                              : "border-black/15 bg-white/40 opacity-75"
                          }`}
                        >
                          <div>
                            <div className="mb-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <MonitorPlay
                                  className={`h-5 w-5 ${feedPriorities.obsPriority ? "text-cyan-600" : "text-slate-500"}`}
                                />
                                <h3 className="text-xs font-black uppercase tracking-tight text-[#241f14]">
                                  OBS Studio / Gaming Stream
                                </h3>
                              </div>
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                                  liveObsCams.length > 0
                                    ? "animate-pulse border-emerald-500/40 bg-emerald-500/20 text-emerald-700"
                                    : "border-black/10 bg-black/10 text-slate-600"
                                }`}
                              >
                                {liveObsCams.length > 0
                                  ? `🟢 ${liveObsCams.length} LIVE`
                                  : "STANDBY"}
                              </span>
                            </div>

                            <p className="text-[11px] leading-relaxed text-[#4c4630]">
                              When toggled{" "}
                              <strong className="font-black text-black">
                                ON
                              </strong>
                              , whenever an OBS Studio or desktop RTMP stream
                              connects, Director immediately takes priority and
                              cuts to OBS.
                            </p>
                          </div>

                          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-black/10 pt-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleFeedPriority("obsPriority")
                              }
                              disabled={prioritySaving}
                              className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-black uppercase transition active:scale-95 ${
                                feedPriorities.obsPriority
                                  ? "bg-cyan-600 text-white shadow-md hover:bg-cyan-500"
                                  : "bg-black/15 text-[#4c4630] hover:bg-black/25"
                              }`}
                            >
                              <Zap className="h-3.5 w-3.5" />
                              {feedPriorities.obsPriority
                                ? "⚡ Priority Enabled"
                                : "○ Priority Off"}
                            </button>

                            {liveObsCams.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleTakeFeedLive("obs")}
                                className="rounded bg-black/80 px-2.5 py-1.5 text-[10px] font-black uppercase text-cyan-400 shadow-sm transition hover:bg-black"
                              >
                                Take OBS Live
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </ChromePanel>

              {/* Director Attention Lock Strip & Form */}
              <ChromePanel withScrews>
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-black/15 pb-1">
                    <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                      DIRECTOR ATTENTION & DURATION OVERRIDE
                    </span>
                    <span className="font-mono text-[10px] text-[#666]">
                      TouchDesigner Live Engine
                    </span>
                  </div>

                  <div
                    className={`flex flex-wrap items-center justify-between gap-3 rounded border p-3 ${
                      attentionLock.active
                        ? "border-orange-500 bg-orange-950/30 text-orange-200 shadow-[0_0_15px_rgba(255,77,0,0.15)]"
                        : "border-black/20 bg-black/5 text-[#4c4630]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`grid h-8 w-8 place-items-center rounded-full ${
                          attentionLock.active
                            ? "animate-pulse bg-orange-500 text-black"
                            : "bg-black/20 text-slate-500"
                        }`}
                      >
                        <Target className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wide">
                            {attentionLock.active
                              ? `🎯 Attention Locked: ${attentionLock.targetLabel}`
                              : `Auto-Director (${currentDirectorMode.toUpperCase()} MODE ACTIVE)`}
                          </span>
                          {attentionLock.active && (
                            <span className="rounded border border-orange-500/40 bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-black text-orange-300">
                              {attentionLock.multiCameraMode === "audio_peak"
                                ? "Auto Audio-Peak Angles"
                                : attentionLock.multiCameraMode}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {attentionLock.active
                            ? `Locked by ${attentionLock.lockedBy} · Director will not switch away until timer expires.`
                            : "Director is automatically switching based on selected mode intelligence scoring."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {attentionLock.active && (
                        <div className="flex items-center gap-1.5 rounded border border-orange-500/40 bg-black/60 px-2.5 py-1 font-mono text-sm font-black text-white">
                          <Clock className="h-3.5 w-3.5 text-orange-400" />
                          <span>{formatTimer(timeRemainingSeconds)}</span>
                        </div>
                      )}

                      {attentionLock.active ? (
                        <ConsoleButton
                          variant="red"
                          onClick={handleReleaseDirectorAttention}
                          disabled={attentionLoading}
                          className="!px-3 !py-1.5 !text-xs font-black"
                        >
                          Release Attention
                        </ConsoleButton>
                      ) : (
                        <span className="rounded border border-emerald-500/30 bg-emerald-950/20 px-2 py-1 text-[10px] font-bold uppercase text-emerald-600">
                          🟢 Active Tracking
                        </span>
                      )}
                    </div>
                  </div>

                  <form
                    onSubmit={handleSetDirectorAttention}
                    className="rounded border border-black/20 bg-white/40 p-3"
                  >
                    <p className="mb-2 text-xs font-black uppercase tracking-wider text-[#241f14]">
                      Set Target & Duration Override
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-[10px] font-black uppercase text-[#4c4630]">
                          Target Type
                        </label>
                        <select
                          value={attentionTargetType}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            setAttentionTargetType(val);
                            if (val === "room") {
                              setAttentionTargetId("living-room");
                              setAttentionTargetLabel("Living Room");
                            } else if (val === "irl") {
                              setAttentionTargetId("cam-irl-1");
                              setAttentionTargetLabel("IRL Cam 1");
                            }
                          }}
                          className="w-full rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-bold text-[#241f14]"
                        >
                          <option value="room">Entire Room (Multi-Cam)</option>
                          <option value="camera">Specific Camera</option>
                          <option value="irl">IRL Backpack Cam</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-[10px] font-black uppercase text-[#4c4630]">
                          Target
                        </label>
                        <select
                          value={attentionTargetId}
                          onChange={(e) => {
                            setAttentionTargetId(e.target.value);
                            const selectedOption =
                              e.target.options[e.target.selectedIndex];
                            setAttentionTargetLabel(selectedOption.text);
                          }}
                          className="w-full rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-bold text-[#241f14]"
                        >
                          {attentionTargetType === "room" ? (
                            <>
                              <option value="living-room">
                                Living Room (Karaoke/Hangout)
                              </option>
                              <option value="game-room">
                                Game Room (Challenges)
                              </option>
                              <option value="kitchen">Kitchen</option>
                              <option value="foyer">The Foyer</option>
                              <option value="makeup-room">Makeup Room</option>
                              <option value="game-room-2">Game Room 2</option>
                              <option value="director">Global House</option>
                            </>
                          ) : attentionTargetType === "irl" ? (
                            <>
                              <option value="cam-irl-1">
                                IRL Backpack 1 (Primary)
                              </option>
                              <option value="cam-irl-2">
                                IRL Backpack 2 (Secondary)
                              </option>
                            </>
                          ) : (
                            cameras.map((cam) => (
                              <option key={cam.id} value={cam.id}>
                                {cam.name} ({cam.location ?? "House"})
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-[10px] font-black uppercase text-[#4c4630]">
                          Duration
                        </label>
                        <select
                          value={attentionDuration}
                          onChange={(e) =>
                            setAttentionDuration(
                              e.target.value === "indefinite"
                                ? "indefinite"
                                : Number(e.target.value),
                            )
                          }
                          className="w-full rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-bold text-[#241f14]"
                        >
                          <option value={5}>5 Minutes</option>
                          <option value={15}>15 Minutes</option>
                          <option value={30}>30 Minutes</option>
                          <option value={60}>60 Minutes</option>
                          <option value="indefinite">
                            Until Manually Released
                          </option>
                        </select>
                      </div>

                      <div className="flex items-end">
                        <ConsoleButton
                          variant="orange"
                          type="submit"
                          disabled={attentionLoading}
                          className="w-full !py-1.5 !text-xs font-black uppercase"
                        >
                          Lock Director
                        </ConsoleButton>
                      </div>
                    </div>
                  </form>
                </div>
              </ChromePanel>

              {/* OBS Studio & TouchDesigner Room Compositor */}
              <ObsStudioCompositorPanel operatorRole={operatorRole} />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK 3: 🎛️ ROOM CONTROL & VOLUME MATRIX
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "rooms" && (
            <div className="space-y-4">
              {/* Master Volume Bar */}
              <ChromePanel withScrews>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/15 pb-2">
                    <div className="flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-orange-600" />
                      <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                        MASTER ROOM & AUDIO GAIN CONTROL
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ConsoleButton
                        variant={masterMuted ? "red" : "gray"}
                        onClick={handleToggleMasterMute}
                        className="!px-3 !py-1 !text-xs font-black"
                      >
                        {masterMuted ? (
                          <VolumeX className="h-3.5 w-3.5" />
                        ) : (
                          <Volume2 className="h-3.5 w-3.5" />
                        )}
                        {masterMuted ? "MASTER MUTED" : "MASTER AUDIO ON"}
                      </ConsoleButton>
                      <button
                        type="button"
                        onClick={refreshHouseRooms}
                        disabled={loadingRooms}
                        className="rounded bg-black/10 p-1.5 text-[#241f14] hover:bg-black/20"
                        title="Refresh Rooms"
                      >
                        <RotateCcw
                          className={`h-3.5 w-3.5 ${loadingRooms ? "animate-spin" : ""}`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Panic button — takes every room off the public site at
                      once. Confirm-gated in handleToggleAllRoomsOffline;
                      restoring is a single click, no confirm, since that
                      direction is never the destructive one. */}
                  <div className="flex items-center justify-between gap-3 rounded border-2 border-red-600/50 bg-red-950/20 p-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-red-400">
                        Emergency Room Control
                      </p>
                      <p className="text-[10px] font-bold text-red-300/80">
                        Pulls every room off the public site instantly —
                        cameras, chat context, everything. Toggle back on any
                        time.
                      </p>
                    </div>
                    <ConsoleButton
                      variant="red"
                      onClick={() =>
                        handleToggleAllRoomsOffline(
                          !houseRooms.every((r) => r.is_offline),
                        )
                      }
                      disabled={togglingAllRooms || houseRooms.length === 0}
                      className="shrink-0 !px-4 !py-2 !text-xs font-black"
                    >
                      {togglingAllRooms
                        ? "WORKING…"
                        : houseRooms.every((r) => r.is_offline)
                          ? "TURN ALL ROOMS ON"
                          : "ALL ROOMS OFF"}
                    </ConsoleButton>
                  </div>

                  {/* Master Volume Slider */}
                  <div className="flex items-center gap-4 rounded border border-black/20 bg-white/50 p-3">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-5 w-5 text-orange-600" />
                      <span className="text-xs font-black uppercase text-[#241f14]">
                        All Rooms Gain
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={masterVolume}
                      onChange={(e) =>
                        handleSetAllMasterVolume(Number(e.target.value))
                      }
                      className="h-2 flex-1 cursor-pointer rounded-lg bg-black/20 accent-orange-600"
                    />
                    <span className="w-12 text-right font-mono text-sm font-black text-[#241f14]">
                      {masterVolume}%
                    </span>
                  </div>
                </div>
              </ChromePanel>

              {/* Room Cards Grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                {houseRooms.map((room) => {
                  const isEditing = editingRoomId === room.id;
                  const roomVolume = room.audio_output_config?.volume ?? 80;
                  const roomIsMuted = room.audio_output_config?.muted ?? false;
                  const matchingCam = cameras.find((c) =>
                    room.camera_ids?.includes(c.id),
                  );
                  const online = matchingCam
                    ? isOnline(matchingCam.id)
                    : room.live;

                  return (
                    <ChromePanel key={room.id} withScrews>
                      <div className="space-y-2.5">
                        {/* Header with Title and Live Badge */}
                        <div className="flex items-start justify-between border-b border-black/15 pb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black uppercase text-[#241f14]">
                                {room.title}
                              </span>
                              <span className="py-0.2 rounded bg-black/10 px-1.5 font-mono text-[9px] font-bold text-slate-600">
                                #{room.slug}
                              </span>
                            </div>
                            {room.eyebrow && (
                              <p className="text-[10px] font-bold uppercase tracking-wide text-orange-600">
                                {room.eyebrow}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span
                              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${
                                room.is_offline
                                  ? "border border-red-500/30 bg-red-500/20 text-red-500"
                                  : online
                                    ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-700"
                                    : "bg-slate-500/20 text-slate-600"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${room.is_offline ? "bg-red-500" : online ? "animate-pulse bg-emerald-600" : "bg-slate-500"}`}
                              />
                              {room.is_offline
                                ? "OFFLINE"
                                : online
                                  ? "LIVE"
                                  : "STANDBY"}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleRoomOffline(
                                  room.id,
                                  room.is_offline,
                                )
                              }
                              className={`rounded p-1 ${room.is_offline ? "bg-emerald-600/80 text-white hover:bg-emerald-600" : "bg-black/10 text-[#241f14] hover:bg-red-500/30"}`}
                              title={
                                room.is_offline
                                  ? "Bring room back online"
                                  : "Take room offline"
                              }
                            >
                              <Power className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                isEditing
                                  ? setEditingRoomId(null)
                                  : handleStartEditRoom(room)
                              }
                              className="rounded bg-black/10 p-1 text-[#241f14] hover:bg-black/20"
                              title="Edit Room Details"
                            >
                              {isEditing ? (
                                <X className="h-3.5 w-3.5" />
                              ) : (
                                <Edit3 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Editable Form or Display */}
                        {isEditing ? (
                          <div className="space-y-2 rounded border border-orange-500/40 bg-orange-950/10 p-2.5">
                            <div>
                              <label className="mb-0.5 block text-[9px] font-black uppercase text-[#4c4630]">
                                Room Title / Name
                              </label>
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-bold text-[#241f14]"
                              />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[9px] font-black uppercase text-[#4c4630]">
                                Subtitle / Eyebrow Tag
                              </label>
                              <input
                                type="text"
                                value={editEyebrow}
                                onChange={(e) => setEditEyebrow(e.target.value)}
                                placeholder="e.g. Gaming Zone, Karaoke Hall"
                                className="w-full rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-bold text-[#241f14]"
                              />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[9px] font-black uppercase text-[#4c4630]">
                                Description
                              </label>
                              <textarea
                                rows={2}
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                placeholder="Describe room purpose and equipment..."
                                className="w-full rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-medium text-[#241f14]"
                              />
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <ConsoleButton
                                variant="gray"
                                onClick={() => setEditingRoomId(null)}
                                className="!px-2 !py-1 !text-[10px]"
                              >
                                Cancel
                              </ConsoleButton>
                              <ConsoleButton
                                variant="orange"
                                disabled={
                                  savingRoomId === room.id || !editTitle.trim()
                                }
                                onClick={() => handleSaveRoomDetails(room.id)}
                                className="!px-3 !py-1 !text-[10px] font-black uppercase"
                              >
                                <Save className="h-3 w-3" />
                                {savingRoomId === room.id
                                  ? "Saving..."
                                  : "Save Room"}
                              </ConsoleButton>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-[11px] italic text-slate-600">
                              {room.description ||
                                "No description set for this room."}
                            </p>
                          </div>
                        )}

                        <div className="rounded border border-black/15 bg-white/40 p-2">
                          <label className="mb-1 block text-[9px] font-black uppercase text-[#4c4630]">
                            Room audio output
                          </label>
                          <select
                            value={room.audio_output_kind}
                            onChange={(event) =>
                              void handleSetRoomAudioOutput(
                                room.id,
                                event.target.value as
                                  | "embedded"
                                  | "client-broadcast"
                                  | "host-bluetooth",
                              )
                            }
                            className="w-full rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-bold text-[#241f14]"
                          >
                            <option value="embedded">
                              Camera / embedded only
                            </option>
                            <option value="client-broadcast">
                              Paired room browser
                            </option>
                            <option value="host-bluetooth">
                              Host Bluetooth worker
                            </option>
                          </select>
                          {room.audio_output_kind === "host-bluetooth" && (
                            <p className="mt-1 text-[9px] font-bold text-orange-700">
                              Requires this room key in the worker&apos;s
                              server-only sink map.
                            </p>
                          )}
                        </div>

                        {/* Room Volume Slider & Mute Toggle */}
                        <div className="space-y-1.5 rounded border border-black/15 bg-white/40 p-2">
                          <div className="flex items-center justify-between text-[10px] font-black uppercase text-[#4c4630]">
                            <span className="flex items-center gap-1">
                              {roomIsMuted ? (
                                <VolumeX className="h-3 w-3 text-red-500" />
                              ) : (
                                <Volume2 className="h-3 w-3 text-emerald-600" />
                              )}
                              Room Volume:{" "}
                              <span className="font-mono text-[#241f14]">
                                {roomIsMuted ? "MUTED" : `${roomVolume}%`}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleRoomMuteState(room.id, roomIsMuted)
                              }
                              className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase transition ${
                                roomIsMuted
                                  ? "bg-red-600 text-white"
                                  : "bg-black/10 text-[#241f14] hover:bg-black/20"
                              }`}
                            >
                              {roomIsMuted ? "Unmute" : "Mute"}
                            </button>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            disabled={roomIsMuted}
                            value={roomVolume}
                            onChange={(e) =>
                              handleUpdateRoomVolume(
                                room.id,
                                Number(e.target.value),
                              )
                            }
                            className="h-1.5 w-full cursor-pointer rounded-lg bg-black/20 accent-orange-600 disabled:opacity-40"
                          />
                        </div>

                        {/* Camera Preview Thumbnail if available */}
                        {matchingCam && (
                          <div className="overflow-hidden rounded border border-black/30 bg-black">
                            <div className="relative aspect-[21/9] w-full bg-slate-950">
                              <CameraPlayer
                                online={online}
                                playbackUrl={matchingCam.playbackUrl ?? null}
                                playbackProtocol={
                                  matchingCam.playbackProtocol ?? "whep"
                                }
                                priority="thumbnail"
                              />
                            </div>
                          </div>
                        )}

                        {/* Spatial Doorway Mapping Link */}
                        <div className="border-t border-black/10 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPortalStudioRoomScope(room.slug);
                              setActiveDeck("portals");
                            }}
                            className="flex w-full items-center justify-center gap-1.5 rounded border border-orange-500/40 bg-orange-950/20 px-2 py-1.5 text-[10px] font-black uppercase text-orange-400 shadow-sm transition hover:bg-orange-950/40"
                          >
                            <DoorOpen className="h-3.5 w-3.5" />
                            <span>Map Doorways ({room.title})</span>
                          </button>
                        </div>
                      </div>
                    </ChromePanel>
                  );
                })}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK: 🚪 SPATIAL DOORWAY ENROLMENT & ROOM PORTALS
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "portals" && (
            <div className="space-y-4">
              <RoomPortalStudioPanel
                key={portalStudioRoomScope}
                cameras={cameras}
                initialRoomScope={portalStudioRoomScope}
              />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK 4: 🛡️ CHAT & MODERATION
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "moderation" && (
            <div className="space-y-4">
              {/* Live Chat Automod & Moderation Controls */}
              <ChromePanel withScrews>
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-black/15 pb-1">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                        LIVE CHAT MODERATION, AUTOMOD & BANS
                      </span>
                    </div>
                    <span className="text-[10px] font-bold italic text-slate-500">
                      Permanent Audit Trail
                    </span>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <div className="rounded border border-black/20 bg-white/40 p-2">
                      <label className="mb-1 block text-[10px] font-black uppercase text-[#4c4630]">
                        Rate Limit / Slow Mode
                      </label>
                      <select
                        value={automodConfig.slowModeSeconds}
                        onChange={(e) =>
                          handleUpdateAutomod({
                            slowModeSeconds: Number(e.target.value),
                          })
                        }
                        className="w-full rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-bold text-[#241f14]"
                      >
                        <option value={0}>Off (No Delay)</option>
                        <option value={3}>3 Seconds (Standard)</option>
                        <option value={5}>5 Seconds (High Traffic)</option>
                        <option value={10}>10 Seconds (Raid Mode)</option>
                        <option value={30}>30 Seconds (Lockdown)</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between rounded border border-black/20 bg-white/40 p-2">
                      <div>
                        <p className="text-xs font-black uppercase text-[#241f14]">
                          Block External Links
                        </p>
                        <p className="text-[9px] text-slate-600">
                          Only whitelist allowed
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={automodConfig.blockLinks}
                        onChange={(e) =>
                          handleUpdateAutomod({ blockLinks: e.target.checked })
                        }
                        className="h-4 w-4 accent-orange-600"
                      />
                    </div>

                    <div className="flex items-center justify-between rounded border border-black/20 bg-white/40 p-2">
                      <div>
                        <p className="text-xs font-black uppercase text-[#241f14]">
                          Automod Word Filter
                        </p>
                        <p className="text-[9px] text-slate-600">
                          Auto-reject slurs/dox
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={automodConfig.enabled}
                        onChange={(e) =>
                          handleUpdateAutomod({ enabled: e.target.checked })
                        }
                        className="h-4 w-4 accent-orange-600"
                      />
                    </div>
                  </div>

                  {/* Blacklisted Words */}
                  <div className="space-y-2 rounded border border-black/20 bg-white/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#4c4630]">
                        Blacklisted Words & Phrases (
                        {automodConfig.blacklistedWords.length})
                      </span>
                    </div>

                    <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded bg-black/10 p-1">
                      {automodConfig.blacklistedWords.map((word) => (
                        <span
                          key={word}
                          className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-black/80 px-2 py-0.5 text-[10px] font-bold text-red-300"
                        >
                          <span>{word}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveBlacklistWord(word)}
                            className="text-slate-400 hover:text-white"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>

                    <form
                      onSubmit={handleAddBlacklistWord}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={newBlacklistWord}
                        onChange={(e) => setNewBlacklistWord(e.target.value)}
                        placeholder="Add new word to blacklist..."
                        className="flex-1 rounded border border-black/20 bg-white/90 px-2.5 py-1 text-xs font-bold text-[#241f14]"
                      />
                      <ConsoleButton
                        variant="red"
                        type="submit"
                        className="!px-3 !py-1 !text-xs"
                      >
                        + Add Word
                      </ConsoleButton>
                    </form>
                  </div>

                  {/* Banned Users & Manual Ban Tool */}
                  <div className="space-y-2 rounded border border-black/20 bg-white/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#4c4630]">
                        Active Banned Users & Timeouts ({bannedUsers.length})
                      </span>
                    </div>

                    {bannedUsers.length === 0 ? (
                      <p className="text-[11px] font-semibold italic text-slate-600">
                        No users currently banned.
                      </p>
                    ) : (
                      <div className="max-h-28 space-y-1 overflow-y-auto">
                        {bannedUsers.map((ban) => (
                          <div
                            key={ban.id}
                            className="flex items-center justify-between rounded border border-white/10 bg-black/80 px-2 py-1 text-xs text-white"
                          >
                            <div>
                              <span className="font-bold text-red-400">
                                {ban.userName}
                              </span>
                              <span className="ml-2 text-[10px] text-slate-400">
                                ({ban.reason} · by {ban.bannedBy})
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleUnban(ban.userId, ban.userName)
                              }
                              className="rounded bg-emerald-600 px-2 py-0.5 text-[9px] font-bold uppercase text-white hover:bg-emerald-500"
                            >
                              Unban
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <form onSubmit={handleManualBan} className="flex gap-2">
                      <input
                        type="text"
                        value={manualBanUser}
                        onChange={(e) => setManualBanUser(e.target.value)}
                        placeholder="User ID or Username to ban..."
                        className="flex-1 rounded border border-black/20 bg-white/90 px-2.5 py-1 text-xs font-bold text-[#241f14]"
                      />
                      <input
                        type="text"
                        value={manualBanReason}
                        onChange={(e) => setManualBanReason(e.target.value)}
                        placeholder="Reason..."
                        className="flex-1 rounded border border-black/20 bg-white/90 px-2.5 py-1 text-xs font-bold text-[#241f14]"
                      />
                      <ConsoleButton
                        variant="red"
                        type="submit"
                        className="!px-3 !py-1 !text-xs"
                      >
                        Ban User
                      </ConsoleButton>
                    </form>
                  </div>
                </div>
              </ChromePanel>

              {/* Pending TTS / SFX Request Queue */}
              <ChromePanel withScrews>
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-black/15 pb-1">
                    <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#241f14]">
                      <Mic className="h-3.5 w-3.5 text-blue-600" />
                      Pending TTS / SFX Moderation Queue (
                      {pendingAudioRequests.length})
                    </span>
                    <span className="font-mono text-[10px] text-slate-600">
                      Tokens Spent by Viewers
                    </span>
                  </div>

                  {pendingAudioRequests.length === 0 ? (
                    <p className="py-2 text-[11px] font-semibold italic text-slate-600">
                      No pending audio requests — nothing triggered through chat
                      right now.
                    </p>
                  ) : (
                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                      {pendingAudioRequests.map((req) => (
                        <div
                          key={req.id}
                          className="flex items-center justify-between gap-2 rounded border border-white/10 bg-black/80 px-2.5 py-2 text-white"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`py-0.2 rounded px-1.5 text-[9px] font-black uppercase ${
                                  req.kind === "tts"
                                    ? "bg-cyan-500 text-black"
                                    : "bg-purple-500 text-black"
                                }`}
                              >
                                {req.kind}
                              </span>
                              <span className="text-xs font-bold text-orange-300">
                                {req.userName}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                →{" "}
                                {req.targetType === "room"
                                  ? req.targetRoomKey
                                  : "Website"}
                              </span>
                            </div>
                            <p className="truncate text-[11px] text-slate-300">
                              {req.kind === "tts"
                                ? `"${req.message}"`
                                : req.voiceOrSoundKey}{" "}
                              · {req.cost} tokens
                            </p>
                          </div>
                          {operatorRole === "admin" && (
                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                disabled={audioQueueBusyId === req.id}
                                onClick={() =>
                                  handleModerateAudioRequest(req, "approve")
                                }
                                title="Approve & play"
                                className="grid h-7 w-7 place-items-center rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                disabled={audioQueueBusyId === req.id}
                                onClick={() =>
                                  handleModerateAudioRequest(req, "reject")
                                }
                                title="Reject & refund"
                                className="grid h-7 w-7 place-items-center rounded bg-red-600 text-white hover:bg-red-500 disabled:opacity-40"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ChromePanel>

              {/* Console Broadcast Tool */}
              <ChromePanel withScrews>
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-black/15 pb-1">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-cyan-600" />
                      <span className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                        CONSOLE BROADCAST
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-600">
                      Posts as CONSOLE
                    </span>
                  </div>

                  <form
                    onSubmit={handleBroadcastConsoleMessage}
                    className="flex gap-2 rounded border border-black/20 bg-white/40 p-2"
                  >
                    <select
                      value={consoleTargetRoom}
                      onChange={(e) => setConsoleTargetRoom(e.target.value)}
                      className="rounded border border-black/20 bg-white/90 px-2 py-1 text-xs font-bold text-[#241f14]"
                    >
                      <option value="global">Global</option>
                      <option value="director">Director</option>
                      <option value="game-room">Game Room</option>
                      <option value="living-room">Living Room</option>
                      <option value="kitchen">Kitchen</option>
                      <option value="foyer">The Foyer</option>
                      <option value="makeup-room">Makeup Room</option>
                      <option value="game-room-2">Game Room 2</option>
                    </select>
                    <input
                      type="text"
                      value={consoleMsgText}
                      onChange={(e) => setConsoleMsgText(e.target.value)}
                      placeholder="Broadcast a CONSOLE announcement to chat..."
                      className="flex-1 rounded border border-black/20 bg-white/90 px-2.5 py-1 text-xs font-bold text-[#241f14]"
                    />
                    <ConsoleButton
                      variant="orange"
                      type="submit"
                      disabled={consoleBusy || !consoleMsgText.trim()}
                      className="!px-3 !py-1 !text-xs"
                    >
                      <Send className="h-3 w-3" />
                      Broadcast
                    </ConsoleButton>
                  </form>
                </div>
              </ChromePanel>

              {/* User Directory & Live Viewers Audit */}
              <UserDirectoryPanel
                operatorRole={operatorRole}
                livePresenceCount={totalPresence}
              />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK 5: 🌐 OVERLAYS & TRIGGERS
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "overlays" && (
            <HouseOverlayWorkspace rooms={rooms} operatorRole={operatorRole} />
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK 6: 🎲 ECONOMY & RNG
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "economy" && <EconomyDeckPanel />}

          {/* ════════════════════════════════════════════════════════════════
              DECK 7: 👥 USERS & LEVELS
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "users" && (
            <div className="space-y-4">
              <UserDirectoryPanel
                operatorRole={operatorRole}
                livePresenceCount={totalPresence}
              />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK 8: 📡 CHANNELS
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "channels" && <ChannelsDeckPanel />}

          {/* ════════════════════════════════════════════════════════════════
              DECK 9: 🪝 WEBHOOKS
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "webhooks" && <WebhooksDeckPanel />}

          {/* ════════════════════════════════════════════════════════════════
              DECK 10: 🎬 PRODUCTION SWITCHER
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "switcher" && (
            <div className="space-y-4">
              <OverviewSwitcher
                sources={adminSources}
                scene={scene}
                setScene={setScene}
                locked={locked}
                setLocked={setLocked}
              />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK 11: 📡 INGEST & STREAM KEYS
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "sources" && (
            <div className="space-y-4">
              <SourcesPanel
                sources={adminSources}
                updateSource={updateSource}
              />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK 12: 🎁 DROPS CAMPAIGNS
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "drops" && (
            <div className="space-y-4">
              <DropsAdminPanel />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK 13: 🍺 TANK TAVERN & CHAOS ENGINE
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "tavern" && (
            <div className="space-y-4">
              <TavernAdminPanel />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK: 🔊 SOUNDBOARD LIBRARY — upload/preview/delete
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "soundboard" && (
            <div className="space-y-4">
              <SoundboardAdminPanel />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK: 🗑️ TRASH & SCAVENGER BOUNTIES CRUD MANAGER
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "trash" && (
            <div className="space-y-4">
              <TrashAdminPanel />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK: 🕵️ YOLO VISION SCAVENGER HUNT DECK
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "scavenger" && (
            <div className="space-y-4">
              <ScavengerAdminPanel />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK: 🐾 HOUSE PETS & ANIMAL ROSTER
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "pets" && (
            <div className="space-y-4">
              <PetsAdminPanel
                onNavigateToEnrolment={() => setActiveDeck("members")}
              />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK: 👤 HOUSEHOLD IDENTITY REGISTRY
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "members" && (
            <div className="space-y-4">
              <AppearanceEnrolmentPanel cameras={cameras} />
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              DECK 14: ⚙️ SYSTEM HEALTH & MEDIA GATEWAY
             ════════════════════════════════════════════════════════════════ */}
          {activeDeck === "system" && (
            <div className="space-y-4">
              <SystemPanel />
            </div>
          )}
        </div>

        {/* ── RIGHT: Mini-Monitor & Command Dispatch Audit Log (4 Cols) ── */}
        <div className="space-y-4 lg:col-span-4">
          {/* Persistent Mini-Monitor Feed */}
          <ChromePanel withScrews>
            <div className="mb-2 flex items-center justify-between border-b border-black/15 pb-1 text-xs font-black uppercase tracking-wider text-[#241f14]">
              <span className="flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5 text-orange-600" />
                PRIMARY MONITOR
              </span>
              <span className="font-mono text-[10px] font-bold text-emerald-700">
                {primaryCam?.name ?? "House Feed"}
              </span>
            </div>

            <div className="overflow-hidden rounded border border-black/40 bg-black">
              <div className="relative aspect-video w-full bg-slate-950">
                {primaryCam && (
                  <CameraPlayer
                    online={primaryCamOnline}
                    playbackUrl={primaryCam.playbackUrl ?? null}
                    playbackProtocol={primaryCam.playbackProtocol ?? "whep"}
                    priority="hero"
                  />
                )}
              </div>
            </div>
          </ChromePanel>

          {/* Moderator Command Dispatch Audit Stream */}
          <ChromePanel withScrews>
            <div className="mb-2 flex items-center justify-between border-b border-black/10 pb-1">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase text-[#4c4630]">
                <Terminal className="h-3.5 w-3.5 text-orange-600" /> Live
                Dispatch Log
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                {commandLog.length} events
              </span>
            </div>

            <div className="max-h-[500px] space-y-1.5 overflow-y-auto font-mono text-[10px]">
              {commandLog.map((log) => (
                <div
                  key={log.id}
                  className="rounded border border-black/10 bg-white/40 p-2 leading-tight text-[#241f14]"
                >
                  <div className="flex items-center justify-between text-[#888]">
                    <span>{log.time}</span>
                    <span className="font-bold uppercase text-orange-600">
                      {log.status}
                    </span>
                  </div>
                  <p className="my-0.5 font-bold text-[#111]">{log.action}</p>
                  <p className="text-[9px] text-slate-500">
                    Target:{" "}
                    <span className="font-semibold text-slate-700">
                      {log.target}
                    </span>{" "}
                    · By:{" "}
                    <span className="font-semibold text-slate-700">
                      {log.operator}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </ChromePanel>
        </div>
      </div>
    </main>
  );
}

export default HouseConsole;
