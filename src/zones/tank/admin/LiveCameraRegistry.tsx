"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Home,
  KeyRound,
  Layers,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  Server,
  Smartphone,
  Tv,
  Unplug,
  Usb,
  Video,
  Volume2,
  Zap,
} from "lucide-react";
import type {
  CameraDirectorySnapshot,
  DiscoveredCamera,
  TankAudioSource,
} from "../contracts";

function stateClass(camera: DiscoveredCamera) {
  if (camera.presence === "online")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
  if (camera.presence === "degraded")
    return "border-amber-500/30 bg-amber-500/10 text-amber-600";
  if (camera.presence === "reconnecting")
    return "border-red-500/30 bg-red-500/10 text-red-600";
  return "border-border bg-muted text-muted-foreground";
}

function classifyCamera(camera: DiscoveredCamera): {
  label: string;
  type: "fixed-ip" | "mobile-irl" | "usb-direct" | "external-obs";
  icon: typeof Camera;
} {
  if (camera.id.startsWith("cam-irl") || camera.protocol === "srtla") {
    return { label: "Mobile IRL (SRTLA)", type: "mobile-irl", icon: Smartphone };
  }
  if (camera.id.startsWith("usb-") || camera.tags.includes("usb")) {
    return { label: "USB Direct Ingest", type: "usb-direct", icon: Usb };
  }
  if (camera.protocol === "rtmp" || camera.tags.includes("external")) {
    return { label: "External OBS Stream", type: "external-obs", icon: Tv };
  }
  return { label: "Fixed IP Cam (RTSP)", type: "fixed-ip", icon: Home };
}

const AVAILABLE_ROOMS = [
  { id: "game-room", label: "Game Room" },
  { id: "living-room", label: "Living Room" },
  { id: "kitchen", label: "Kitchen" },
  { id: "foyer", label: "The Foyer" },
  { id: "makeup-room", label: "Makeup Room" },
  { id: "game-room-2", label: "Game Room 2" },
  { id: "roaming", label: "IRL Roaming" },
  { id: "director-program", label: "Director Main Mix" },
];

const DECLARED_AUDIO_VALUE = "__declared__";

function selectValueFor(camera: DiscoveredCamera): string {
  return camera.audioSourceId ?? DECLARED_AUDIO_VALUE;
}

export default function LiveCameraRegistry() {
  const [snapshot, setSnapshot] = useState<CameraDirectorySnapshot | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [audioSources, setAudioSources] = useState<TankAudioSource[]>([]);
  const [savingCameraId, setSavingCameraId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<Record<string, string>>({});
  const [roomOverrides, setRoomOverrides] = useState<Record<string, string>>({});
  const [directorCutId, setDirectorCutId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/tank/admin/cameras", {
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error(
            response.status === 403
              ? "Admin permission required"
              : "Receiver registry unavailable",
          );
        const next = (await response.json()) as CameraDirectorySnapshot;
        if (active) {
          setSnapshot(next);
          setError(null);
        }
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Registry unavailable",
          );
      }
    };
    void load();
    const timer = window.setInterval(load, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/tank/admin/audio-sources", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { sources: [] }))
      .then((data: { sources: TankAudioSource[] }) => {
        if (active) setAudioSources(data.sources ?? []);
      })
      .catch(() => {
        if (active) setAudioSources([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleAudioChange = async (camera: DiscoveredCamera, value: string) => {
    setSaveError((prev) => ({ ...prev, [camera.id]: "" }));
    setSavingCameraId(camera.id);

    const source = value === DECLARED_AUDIO_VALUE
      ? null
      : audioSources.find((item) => item.id === value) ?? null;
    if (value !== DECLARED_AUDIO_VALUE && !source) {
      setSaveError((prev) => ({ ...prev, [camera.id]: "Audio source not found." }));
      setSavingCameraId(null);
      return;
    }

    const replacingNative = Boolean(
      source &&
        (camera.audioMode === "embedded" ||
          camera.audioStatus === "embedded" ||
          camera.audioStatus === "transcode-required"),
    );
    const replaceNative = replacingNative
      ? window.confirm(
          "This camera already has embedded audio. Mute its native track and replace it with the selected source?",
        )
      : false;
    if (replacingNative && !replaceNative) {
      setSavingCameraId(null);
      return;
    }

    const crossRoom = Boolean(source && source.roomScope !== camera.roomScope);
    if (crossRoom && !source?.tags.includes("shared-audio")) {
      setSaveError((prev) => ({
        ...prev,
        [camera.id]: "Cross-room audio requires a source tagged shared-audio.",
      }));
      setSavingCameraId(null);
      return;
    }
    const confirmCrossRoom = crossRoom
      ? window.confirm(
          `Confirm shared audio from ${source?.roomScope} for camera room ${camera.roomScope}?`,
        )
      : false;
    if (crossRoom && !confirmCrossRoom) {
      setSavingCameraId(null);
      return;
    }

    try {
      const response = await fetch("/api/tank/admin/cameras/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cameraId: camera.id,
          audioSourceId: source?.id ?? "self",
          replaceNative,
          confirmCrossRoom,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Failed to save audio routing.");
    } catch (reason) {
      setSaveError((prev) => ({
        ...prev,
        [camera.id]: reason instanceof Error ? reason.message : "Failed to save.",
      }));
    } finally {
      setSavingCameraId(null);
    }
  };

  const handleRoomAssignment = (cameraId: string, roomKey: string) => {
    setRoomOverrides((prev) => ({ ...prev, [cameraId]: roomKey }));
  };

  const handleDirectorTake = (cameraId: string) => {
    setDirectorCutId(cameraId);
  };

  if (!snapshot && !error)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border p-4 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Reading receiver telemetry…
      </div>
    );
  if (!snapshot)
    return (
      <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-600">
        <div className="flex items-center gap-2 font-bold">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Top Status & Discovery Metadata */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-muted/60 p-3">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Discovery Source (Bidirectional Tool)
          </span>
          <strong className="mt-1 flex items-center gap-2 text-sm">
            <Server className="h-4 w-4 text-primary" />
            {snapshot.source}
          </strong>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Disconnect Grace
          </span>
          <strong className="mt-1 flex items-center gap-2 text-sm">
            <Clock3 className="h-4 w-4 text-primary" />
            {snapshot.gracePeriodSeconds} seconds
          </strong>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Configured Ingest Identities
          </span>
          <strong className="mt-1 block text-sm">
            {snapshot.cameras.length} camera keys active
          </strong>
        </div>
      </div>

      {/* Ontological Architecture Notice */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground flex items-center gap-3">
        <Layers className="h-5 w-5 text-primary shrink-0" />
        <div>
          <strong className="text-foreground block">Camera vs. Room Matrix Architecture</strong>
          A <span className="font-semibold text-primary">Room</span> is a persistent viewer space (chat, audience, TTS, minigames) that stays open 24/7. A <span className="font-semibold text-primary">Camera</span> is an ingest source (IP Cam, IRL Backpack, USB, OBS) routed into a Room.
        </div>
      </div>

      {/* Camera Matrix Feed Roster */}
      <div className="space-y-4">
        {snapshot.cameras.map((camera) => {
          const selectValue = selectValueFor(camera);
          const audioLabel = camera.audioSourceName ??
            `${camera.audioMode} · ${camera.audioStatus}`;
          const classification = classifyCamera(camera);
          const Icon = classification.icon;
          const currentRoom = roomOverrides[camera.id] ?? camera.roomScope;
          const isDirectorCut = directorCutId === camera.id || camera.directorAssigned;

          return (
            <article
              key={camera.id}
              className={`rounded-2xl border p-4 space-y-4 transition ${
                isDirectorCut ? "border-primary ring-2 ring-primary/25 bg-card" : "border-border bg-card/60"
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="font-bold text-base">{camera.name}</h3>

                    {/* Classification Badge */}
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground border border-border">
                      {classification.label}
                    </span>

                    {/* Status Badge */}
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${stateClass(camera)}`}
                    >
                      {camera.presence}
                    </span>

                    {/* Director Assigned Badge */}
                    {isDirectorCut && (
                      <span className="bg-primary/20 text-primary border border-primary/30 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase">
                        <Radio className="h-3 w-3" />
                        Director Cut
                      </span>
                    )}

                    {(camera.protocol === "rtsp" || camera.id.startsWith("cam-178")) && (
                      <a
                        href={`http://${camera.id === "cam-1786768240090" ? "192.168.50.65" : camera.id === "cam-1786768240091" ? "192.168.50.66" : camera.id === "cam-1786768240092" ? "192.168.50.67" : "192.168.50.65"}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[10px] font-black uppercase text-primary hover:bg-primary/20 transition ml-auto"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Camera IP ↗
                      </a>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {camera.reason} · Assigned to room: <strong className="text-foreground">{currentRoom}</strong>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 lg:min-w-[500px]">
                  <div>
                    <span className="block text-muted-foreground">Identity key</span>
                    <strong className="font-mono">{camera.id}</strong>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Credential</span>
                    <strong className="flex items-center gap-1 font-mono">
                      <KeyRound className="h-3 w-3" />
                      {camera.keyFingerprint}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Protocol</span>
                    <strong className="font-mono uppercase">{camera.protocol}</strong>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Audio Track</span>
                    <strong className="flex items-center gap-1 text-primary truncate">
                      {camera.audioStatus === "silent" ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                      {audioLabel}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Dynamic Matrix Controls: Room Scope Routing + Director Take + Audio Binding */}
              <div className="grid gap-3 sm:grid-cols-3 border-t border-border/60 pt-3 text-xs">
                {/* 1. Room Scope Assignment */}
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-foreground flex items-center gap-1">
                    <Home className="h-3.5 w-3.5 text-primary" />
                    Assigned Room Venue:
                  </label>
                  <select
                    value={currentRoom}
                    onChange={(e) => handleRoomAssignment(camera.id, e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 font-medium outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {AVAILABLE_ROOMS.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Audio Routing */}
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-foreground flex items-center gap-1">
                    <Volume2 className="h-3.5 w-3.5 text-primary" />
                    Audio Source Binding:
                  </label>
                  <select
                    value={selectValue}
                    disabled={savingCameraId === camera.id}
                    onChange={(e) => void handleAudioChange(camera, e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 font-medium outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  >
                    <option value={DECLARED_AUDIO_VALUE}>
                      Receiver default ({camera.audioMode})
                    </option>
                    {audioSources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name} · {source.roomScope}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Director Quick Take */}
                <div className="flex flex-col justify-end">
                  <button
                    onClick={() => handleDirectorTake(camera.id)}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-bold text-xs transition ${
                      isDirectorCut
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "border border-border bg-muted hover:bg-primary/20 text-foreground"
                    }`}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    {isDirectorCut ? "ACTIVE ON DIRECTOR" : "TAKE TO DIRECTOR"}
                  </button>
                </div>
              </div>

              {saveError[camera.id] && (
                <p className="text-xs font-semibold text-red-600">{saveError[camera.id]}</p>
              )}

              {camera.presence === "reconnecting" && (
                <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600">
                  <Unplug className="h-4 w-4" />
                  <strong>
                    Camera disconnected. Room {currentRoom} remains open with "NO SIGNAL" fallback screen.
                  </strong>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
