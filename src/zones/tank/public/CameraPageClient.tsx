"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Radio,
  RefreshCw,
  Signal,
} from "lucide-react";
import type { CameraDirectorySnapshot, DiscoveredCamera } from "../contracts";

export default function CameraPageClient({ slug }: { slug: string }) {
  const [camera, setCamera] = useState<DiscoveredCamera | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/tank/cameras", {
          cache: "no-store",
        });
        const snapshot = (await response.json()) as CameraDirectorySnapshot;
        if (active)
          setCamera(
            snapshot.cameras.find((item) => item.slug === slug) ?? null,
          );
      } finally {
        if (active) setLoaded(true);
      }
    };
    void load();
    const timer = window.setInterval(load, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [slug]);

  if (!loaded)
    return (
      <div className="container grid min-h-[60vh] place-items-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Opening camera…
        </div>
      </div>
    );
  if (!camera)
    return (
      <div className="container grid min-h-[60vh] place-items-center py-12">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <Camera className="mx-auto h-9 w-9 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-bold">
            Camera feed is not published
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Its disconnect grace period ended, so it was removed from the public
            directory. This URL will reopen automatically when the same camera
            key reconnects.
          </p>
          <Link
            href="/cameras"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Camera directory
          </Link>
        </div>
      </div>
    );

  const reconnecting = camera.presence === "reconnecting";
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <section className="relative aspect-video max-h-[76vh] overflow-hidden bg-gradient-to-br from-cyan-500/35 via-blue-950/65 to-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_32%_30%,rgba(255,255,255,.2),transparent_15%),radial-gradient(circle_at_68%_60%,rgba(45,212,191,.22),transparent_18%)]" />
        {reconnecting ? (
          <div className="absolute inset-0 grid place-items-center bg-black/65 text-white">
            <div className="max-w-md px-6 text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
              <h2 className="mt-3 text-2xl font-black">
                Dead camera · reconnecting
              </h2>
              <p className="mt-2 text-sm text-white/70">
                This scene stays mounted for {camera.reconnectSecondsRemaining}{" "}
                more seconds. Reconnecting the same camera key restores it
                without creating a new room.
              </p>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white">
            <div className="rounded-2xl border border-white/15 bg-black/25 p-5 text-center backdrop-blur-sm">
              <Signal className="mx-auto h-8 w-8" />
              <p className="mt-2 font-bold">Live player connection point</p>
              <p className="mt-1 text-xs text-white/65">
                {camera.protocol.toUpperCase()} ·{" "}
                {camera.bitrateKbps || "detecting"} kbps
              </p>
            </div>
          </div>
        )}
        <div className="absolute left-4 top-4 flex gap-2">
          <span
            className={`rounded-md px-2.5 py-1.5 text-xs font-black uppercase text-white ${reconnecting ? "bg-amber-500" : "bg-red-600"}`}
          >
            {reconnecting ? "Signal lost" : "Live"}
          </span>
          {camera.directorAssigned && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-black/65 px-2.5 py-1.5 text-xs font-bold text-white">
              <Radio className="h-3.5 w-3.5" />
              Available to Director
            </span>
          )}
        </div>
      </section>
      <div className="container py-7">
        <Link
          href="/cameras"
          className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All cameras
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-primary">
              Individual camera
            </p>
            <h1 className="mt-1 text-3xl font-black">{camera.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Stable camera key: {camera.id} · {camera.reason}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <span className="block text-xs font-bold uppercase text-muted-foreground">
              Director relationship
            </span>
            <strong>
              {camera.directorAssigned
                ? "This feed can also be on the Director program"
                : "Independent feed"}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
