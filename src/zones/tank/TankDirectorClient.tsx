"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Antenna,
  Camera,
  CheckCircle2,
  ChevronRight,
  CirclePause,
  Eye,
  EyeOff,
  Gauge,
  History,
  Lock,
  Radio,
  RadioTower,
  Settings2,
  ShieldCheck,
  Video,
} from "lucide-react";

type CameraState = "live" | "low" | "offline";
type CameraFeed = {
  id: string;
  name: string;
  location: string;
  bitrate: number;
  latency: number | null;
  state: CameraState;
  priority: number;
  enabled: boolean;
  isPublic: boolean;
};

const INITIAL_CAMERAS: CameraFeed[] = [
  {
    id: "cam-a",
    name: "Tank A",
    location: "Primary mobile",
    bitrate: 6420,
    latency: 178,
    state: "live",
    priority: 1,
    enabled: true,
    isPublic: true,
  },
  {
    id: "cam-b",
    name: "Tank B",
    location: "Wide safety",
    bitrate: 3280,
    latency: 224,
    state: "live",
    priority: 2,
    enabled: true,
    isPublic: true,
  },
  {
    id: "cam-c",
    name: "Tank C",
    location: "Roaming backup",
    bitrate: 780,
    latency: 410,
    state: "low",
    priority: 3,
    enabled: true,
    isPublic: false,
  },
  {
    id: "cam-d",
    name: "Tank D",
    location: "Spare receiver",
    bitrate: 0,
    latency: null,
    state: "offline",
    priority: 4,
    enabled: false,
    isPublic: false,
  },
];
const SCENES = ["LIVE", "LOW", "BRB"] as const;

function statusTone(state: CameraState) {
  if (state === "live") return "border-primary/40 bg-primary/10 text-primary";
  if (state === "low")
    return "border-accent/50 bg-accent/15 text-accent-foreground";
  return "border-border bg-muted text-muted-foreground";
}

export default function TankDirectorClient() {
  const [cameras, setCameras] = useState(INITIAL_CAMERAS);
  const [scene, setScene] = useState<(typeof SCENES)[number]>("LIVE");
  const [switcherPaused, setSwitcherPaused] = useState(false);
  const [directorLocked, setDirectorLocked] = useState(true);
  const totalBitrate = useMemo(
    () =>
      cameras.reduce(
        (total, camera) => total + (camera.enabled ? camera.bitrate : 0),
        0,
      ),
    [cameras],
  );
  const updateCamera = (id: string, patch: Partial<CameraFeed>) =>
    setCameras((current) =>
      current.map((camera) =>
        camera.id === id ? { ...camera, ...patch } : camera,
      ),
    );

  return (
    <main className="min-h-screen min-h-[100dvh] bg-background text-foreground">
      <section className="border-b border-border/70 bg-[hsl(var(--card)/0.72)]">
        <div className="container py-7 md:py-9">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <span className="border-primary/35 bg-primary/10 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-primary">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  Production online
                </span>
                <span>tank.unenter.live</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Director Control
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                One protected console for receiver health, OBS program control,
                NOALBS switching, and viewer-safe browser delivery.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSwitcherPaused((value) => !value)}
                className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-4 py-2.5 text-sm font-semibold shadow-sm transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <CirclePause className="h-4 w-4" />
                {switcherPaused ? "Resume switcher" : "Pause switcher"}
              </button>
              <button
                type="button"
                onClick={() => setDirectorLocked((value) => !value)}
                className="inline-flex items-center gap-2 rounded-[var(--radius)] bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Lock className="h-4 w-4" />
                {directorLocked ? "Director locked" : "Lock director"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="container space-y-6 py-6 md:py-8">
        <section
          aria-label="System status"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {[
            {
              label: "OBS",
              value: "Connected",
              detail: `Program · ${scene}`,
              icon: Video,
            },
            {
              label: "NOALBS",
              value: switcherPaused ? "Protected" : "Live",
              detail: switcherPaused
                ? "Automation paused"
                : "Auto-switch armed",
              icon: RadioTower,
            },
            {
              label: "Ingest",
              value: `${cameras.filter((camera) => camera.state !== "offline").length} / ${cameras.length} feeds`,
              detail: `${(totalBitrate / 1000).toFixed(1)} Mbps combined`,
              icon: Antenna,
            },
            {
              label: "Delivery",
              value: "Gateway ready",
              detail: "WebRTC · HLS fallback",
              icon: Radio,
            },
          ].map(({ label, value, detail, icon: Icon }) => (
            <article
              key={label}
              className="rounded-[calc(var(--radius)*1.5)] border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-2 text-lg font-bold">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                </div>
                <span className="bg-primary/10 rounded-[var(--radius)] p-2 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(310px,0.65fr)]">
          <div className="space-y-6">
            <article className="overflow-hidden rounded-[calc(var(--radius)*1.75)] border border-border bg-card shadow-md">
              <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Camera className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-bold">Camera health</h2>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Priority, visibility, and receiver state at a glance.
                  </p>
                </div>
                <button
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                  type="button"
                >
                  Directory API <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {cameras.map((camera) => (
                  <div
                    key={camera.id}
                    className="rounded-[calc(var(--radius)*1.25)] border border-border bg-background/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card font-mono text-sm font-bold">
                          {camera.priority}
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate font-bold">{camera.name}</h3>
                          <p className="truncate text-xs text-muted-foreground">
                            {camera.location}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${statusTone(camera.state)}`}
                      >
                        {camera.state}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-[var(--radius)] bg-muted/60 p-2.5">
                        <span className="block text-[11px] uppercase text-muted-foreground">
                          Bitrate
                        </span>
                        <strong>
                          {camera.bitrate
                            ? `${(camera.bitrate / 1000).toFixed(1)} Mbps`
                            : "—"}
                        </strong>
                      </div>
                      <div className="rounded-[var(--radius)] bg-muted/60 p-2.5">
                        <span className="block text-[11px] uppercase text-muted-foreground">
                          Latency
                        </span>
                        <strong>
                          {camera.latency ? `${camera.latency} ms` : "—"}
                        </strong>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateCamera(camera.id, { enabled: !camera.enabled })
                        }
                        className={`rounded-[var(--radius)] border px-3 py-1.5 text-xs font-semibold ${camera.enabled ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                      >
                        {camera.enabled ? "Enabled" : "Disabled"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateCamera(camera.id, {
                            isPublic: !camera.isPublic,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                      >
                        {camera.isPublic ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" />
                        )}
                        {camera.isPublic ? "Public" : "Private"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[calc(var(--radius)*1.75)] border border-border bg-card p-5 shadow-md">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-bold">Recent switches</h2>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Why the program feed changed.
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                  Session 01:42:18
                </span>
              </div>
              <div className="mt-4 divide-y divide-border">
                {[
                  [
                    "14:36:18",
                    "Tank A → Program",
                    "Primary recovered above 4 Mbps",
                  ],
                  [
                    "14:35:52",
                    "LOW scene",
                    "Tank A sustained low bitrate for 8s",
                  ],
                  ["14:22:04", "Tank B → Program", "Manual director switch"],
                ].map(([time, event, reason]) => (
                  <div
                    key={time}
                    className="grid gap-1 py-3 sm:grid-cols-[90px_170px_1fr] sm:items-center"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {time}
                    </span>
                    <strong className="text-sm">{event}</strong>
                    <span className="text-sm text-muted-foreground">
                      {reason}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <aside className="space-y-6">
            <article className="rounded-[calc(var(--radius)*1.75)] border border-border bg-card p-5 shadow-md">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold">Program scene</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Manual OBS scene override.
              </p>
              <div className="mt-5 grid gap-2">
                {SCENES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setScene(item)}
                    className={`flex items-center justify-between rounded-[var(--radius)] border px-4 py-3 text-left text-sm font-bold transition ${scene === item ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
                  >
                    {item}
                    <span className="text-xs opacity-75">
                      {scene === item ? "On program" : "Take"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-[var(--radius)] border border-accent/40 bg-accent/10 p-3 text-sm text-accent-foreground">
                <strong>Next automatic check</strong>
                <span className="mt-1 block text-xs opacity-80">
                  Tank A stability · 00:08
                </span>
              </div>
            </article>
            <article className="rounded-[calc(var(--radius)*1.75)] border border-border bg-card p-5 shadow-md">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold">Delivery boundary</h2>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {[
                  {
                    icon: CheckCircle2,
                    title: "Viewer API",
                    detail: "Only public camera labels and playback URLs",
                  },
                  {
                    icon: Lock,
                    title: "Backstage API",
                    detail:
                      "Receiver, OBS, and switcher controls stay server-side",
                  },
                  {
                    icon: Gauge,
                    title: "Playback",
                    detail: "WebRTC first, HLS fallback per feed",
                  },
                  {
                    icon: Activity,
                    title: "Future user data",
                    detail: "Provider settings exported as an encrypted blob",
                  },
                ].map(({ icon: Icon, title, detail }) => (
                  <div key={title} className="flex gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <strong>{title}</strong>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}
