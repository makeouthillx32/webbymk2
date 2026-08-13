"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Radio,
  RefreshCw,
  Signal,
} from "lucide-react";
import type { CameraDirectorySnapshot, DiscoveredCamera } from "../contracts";

function presenceTone(camera: DiscoveredCamera) {
  if (camera.presence === "online") return "bg-emerald-500 text-emerald-950";
  if (camera.presence === "degraded") return "bg-amber-400 text-amber-950";
  return "bg-red-500 text-white";
}

export function CameraDirectoryClient({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<CameraDirectorySnapshot | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/tank/cameras", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Directory unavailable");
        const next = (await response.json()) as CameraDirectorySnapshot;
        if (active) {
          setSnapshot(next);
          setFailed(false);
        }
      } catch {
        if (active) setFailed(true);
      }
    };
    void load();
    const timer = window.setInterval(load, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (failed && !snapshot)
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5 text-sm text-amber-700">
        <div className="flex items-center gap-2 font-bold">
          <AlertTriangle className="h-4 w-4" />
          Live camera directory is reconnecting
        </div>
        <p className="mt-1 text-xs opacity-80">
          The Director room remains available while receiver discovery recovers.
        </p>
      </div>
    );
  if (!snapshot)
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Detecting camera connections…
      </div>
    );
  if (!snapshot.cameras.length)
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
        <Camera className="mx-auto h-7 w-7 text-muted-foreground" />
        <h3 className="mt-3 font-bold">No camera feeds are live</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A valid SRT, SRTLA, RTMP, or IP-camera connection will appear here
          automatically.
        </p>
      </div>
    );

  return (
    <div
      className={`grid gap-4 ${compact ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-3"}`}
    >
      {snapshot.cameras.map((camera) => (
        <Link
          key={camera.id}
          href={`/cameras/${camera.slug}`}
          className="hover:border-primary/40 group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
        >
          <div className="relative aspect-video bg-gradient-to-br from-cyan-500/35 via-blue-950/60 to-slate-950">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,.2),transparent_15%),radial-gradient(circle_at_72%_62%,rgba(45,212,191,.24),transparent_18%)]" />
            <span
              className={`absolute left-3 top-3 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${presenceTone(camera)}`}
            >
              {camera.presence === "reconnecting"
                ? `Dead cam · ${camera.reconnectSecondsRemaining}s`
                : camera.presence}
            </span>
            {camera.directorAssigned && (
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-black/65 px-2 py-1 text-[10px] font-bold uppercase text-white">
                <Radio className="h-3 w-3" />
                Director source
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/85 to-transparent p-4 pt-12 text-white">
              <span className="text-xs font-bold uppercase tracking-wider">
                {camera.protocol}
              </span>
              <Signal className="h-4 w-4" />
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold group-hover:text-primary">
                  {camera.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Camera key · {camera.id}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
            </div>
            <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
              {camera.reason}
            </p>
            <div className="mt-4 flex gap-4 border-t border-border pt-3 text-xs font-semibold text-muted-foreground">
              <span>
                {camera.bitrateKbps
                  ? `${camera.bitrateKbps} kbps`
                  : "No bitrate"}
              </span>
              <span>
                {camera.latencyMs ? `${camera.latencyMs} ms` : "Waiting"}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
