"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  KeyRound,
  Mic,
  Radio,
  RefreshCw,
  Server,
  Unplug,
  Volume2,
} from "lucide-react";
import type { CameraDirectorySnapshot, DiscoveredCamera } from "../contracts";

function stateClass(camera: DiscoveredCamera) {
  if (camera.presence === "online")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
  if (camera.presence === "degraded")
    return "border-amber-500/30 bg-amber-500/10 text-amber-600";
  if (camera.presence === "reconnecting")
    return "border-red-500/30 bg-red-500/10 text-red-600";
  return "border-border bg-muted text-muted-foreground";
}

const audioTrackOptions = [
  { id: "self", name: "Native Stream Audio (Default)" },
  { id: "house-ambient-mic", name: "House Ambient Microphone (Room 1)" },
  { id: "house-main-mic", name: "House Main Audio (Mixer Line Out)" },
  { id: "ip-room-cam-audio", name: "Game Room Camera Audio" },
  { id: "oc-setup-cam-audio", name: "OC Setup Camera Audio" },
];

export default function LiveCameraRegistry() {
  const [snapshot, setSnapshot] = useState<CameraDirectorySnapshot | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [assignedAudio, setAssignedAudio] = useState<Record<string, string>>({});

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

  const handleAssignAudioTrack = (cameraId: string, audioTrackId: string) => {
    setAssignedAudio((prev) => ({ ...prev, [cameraId]: audioTrackId }));
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
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-muted/60 p-3">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Discovery source
          </span>
          <strong className="mt-1 flex items-center gap-2 text-sm">
            <Server className="h-4 w-4 text-primary" />
            {snapshot.source}
          </strong>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Disconnect grace
          </span>
          <strong className="mt-1 flex items-center gap-2 text-sm">
            <Clock3 className="h-4 w-4 text-primary" />
            {snapshot.gracePeriodSeconds} seconds
          </strong>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <span className="text-xs font-bold uppercase text-muted-foreground">
            Configured identities
          </span>
          <strong className="mt-1 block text-sm">
            {snapshot.cameras.length} camera keys
          </strong>
        </div>
      </div>
      <div className="space-y-3">
        {snapshot.cameras.map((camera) => {
          const currentAudio = assignedAudio[camera.id] ?? camera.audioSourceId ?? "self";
          return (
            <article
              key={camera.id}
              className="rounded-xl border border-border p-4 space-y-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{camera.name}</h3>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${stateClass(camera)}`}
                    >
                      {camera.presence}
                    </span>
                    {camera.directorAssigned && (
                      <span className="bg-primary/10 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase text-primary">
                        <Radio className="h-3 w-3" />
                        Director assigned
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {camera.reason}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 lg:min-w-[510px]">
                  <div>
                    <span className="block text-muted-foreground">
                      Identity key
                    </span>
                    <strong className="font-mono">{camera.id}</strong>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">
                      Credential fingerprint
                    </span>
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
                    <span className="block text-muted-foreground">
                      Audio Source
                    </span>
                    <strong className="flex items-center gap-1 text-primary">
                      <Mic className="h-3 w-3" />
                      {audioTrackOptions.find((opt) => opt.id === currentAudio)?.name ?? "Native Audio"}
                    </strong>
                  </div>
                </div>
              </div>

              {/* IP Camera / Silent Feed Audio Assignment Selector */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-primary" />
                  <span className="font-bold text-foreground">
                    Audio Track Binding (For IP Cameras & Silent Feeds):
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={currentAudio}
                    onChange={(e) => handleAssignAudioTrack(camera.id, e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 font-medium outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {audioTrackOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {camera.presence === "reconnecting" && (
                <div className="mt-2 flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600">
                  <Unplug className="h-4 w-4" />
                  <strong>
                    Dead cam remains rendered for{" "}
                    {camera.reconnectSecondsRemaining} seconds.
                  </strong>
                </div>
              )}
              {camera.presence === "online" && (
                <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Valid stream active on `/cameras/{camera.slug}`.
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
