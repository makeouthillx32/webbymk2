"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Activity,
  Antenna,
  Bell,
  Boxes,
  Camera,
  CheckCircle2,
  ChevronRight,
  CirclePause,
  Eye,
  EyeOff,
  Gauge,
  History,
  LayoutDashboard,
  Lock,
  MessageSquare,
  Radio,
  RadioTower,
  RefreshCw,
  Settings2,
  Shield,
  SlidersHorizontal,
  Users,
  Video,
  Webhook,
  XCircle,
} from "lucide-react";
import type { AdminSection, StreamHealth, TankCamera } from "../contracts";
import { cameras as initialCameras, channels } from "../fixtures";
import LiveCameraRegistry from "./LiveCameraRegistry";

const nav: { section: AdminSection; label: string; icon: typeof Activity }[] = [
  { section: "overview", label: "Overview", icon: LayoutDashboard },
  { section: "director", label: "Director", icon: Video },
  { section: "sources", label: "Sources", icon: Antenna },
  { section: "channels", label: "Channels", icon: Radio },
  { section: "chat", label: "Chat", icon: MessageSquare },
  { section: "webhooks", label: "Webhooks", icon: Webhook },
  { section: "users", label: "Users", icon: Users },
  { section: "system", label: "System", icon: Settings2 },
];

function tone(health: StreamHealth) {
  return health === "live"
    ? "bg-emerald-500"
    : health === "degraded"
      ? "bg-amber-500"
      : "bg-slate-500";
}
function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-border p-5">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function AdminConsole({
  section,
  operatorName,
}: {
  section: AdminSection;
  operatorName: string;
}) {
  const [sources, setSources] = useState<TankCamera[]>(initialCameras);
  const [scene, setScene] = useState("LIVE");
  const [paused, setPaused] = useState(false);
  const [locked, setLocked] = useState(true);
  const updateSource = (id: string, patch: Partial<TankCamera>) =>
    setSources((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  const sectionLabel =
    nav.find((item) => item.section === section)?.label ?? "Backstage";

  return (
    <main className="min-h-screen bg-muted/20 text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[244px_minmax(0,1fr)]">
        <aside className="border-r border-border bg-card lg:sticky lg:top-0 lg:h-screen">
          <div className="flex h-16 items-center gap-3 border-b border-border px-5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Video className="h-5 w-5" />
            </span>
            <div>
              <strong className="block leading-none">Tank Backstage</strong>
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                Admin only
              </span>
            </div>
          </div>
          <nav
            className="flex gap-1 overflow-x-auto p-3 lg:block lg:space-y-1"
            aria-label="Backstage navigation"
          >
            {nav.map(({ section: item, label, icon: Icon }) => (
              <Link
                key={item}
                href={item === "overview" ? "/admin" : `/admin/${item}`}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${section === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="hidden border-t border-border p-4 lg:block">
            <Link
              href="/"
              className="flex items-center justify-between rounded-xl border border-border p-3 text-sm font-semibold hover:bg-muted"
            >
              <span>
                <span className="block text-xs text-muted-foreground">
                  Return to
                </span>
                Public Tank
              </span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border bg-background/85 px-4 backdrop-blur md:px-7">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.15em] text-muted-foreground">
                Operations
              </p>
              <h1 className="text-xl font-bold">{sectionLabel}</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600 sm:flex">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                Production online
              </span>
              <button
                className="relative rounded-xl border border-border p-2.5"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
              </button>
              <span className="bg-primary/15 grid h-9 w-9 place-items-center rounded-full text-sm font-black text-primary">
                {operatorName.slice(0, 1).toUpperCase()}
              </span>
            </div>
          </header>
          <div className="space-y-6 p-4 md:p-7">
            {section === "overview" && <Overview sources={sources} />}
            {section === "director" && (
              <Director
                sources={sources}
                scene={scene}
                setScene={setScene}
                paused={paused}
                setPaused={setPaused}
                locked={locked}
                setLocked={setLocked}
              />
            )}
            {section === "sources" && (
              <Sources sources={sources} updateSource={updateSource} />
            )}
            {section === "channels" && <Channels />}
            {section === "chat" && <Chat />}
            {section === "webhooks" && <Webhooks />}
            {section === "users" && <UsersPanel />}
            {section === "system" && <System />}
          </div>
        </div>
      </div>
    </main>
  );
}

function Stats({ sources }: { sources: TankCamera[] }) {
  const bitrate = sources.reduce(
    (sum, source) => sum + (source.enabled ? source.bitrateKbps : 0),
    0,
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        {
          label: "OBS",
          value: "Connected",
          detail: "Program · LIVE",
          icon: Video,
        },
        {
          label: "NOALBS",
          value: "Live",
          detail: "Auto-switch armed",
          icon: RadioTower,
        },
        {
          label: "Ingest",
          value: `${sources.filter((s) => s.health !== "offline").length} / ${sources.length} feeds`,
          detail: `${(bitrate / 1000).toFixed(1)} Mbps combined`,
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
          className="rounded-2xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <p className="mt-2 text-lg font-bold">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </div>
            <span className="bg-primary/10 h-fit rounded-xl p-2 text-primary">
              <Icon className="h-5 w-5" />
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

function Overview({ sources }: { sources: TankCamera[] }) {
  return (
    <>
      <Stats sources={sources} />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <Panel
          title="Production health"
          description="Operational signals across the current session."
        >
          <div className="space-y-4">
            {sources.map((source) => (
              <div key={source.id} className="flex items-center gap-3">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${tone(source.health)}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-4 text-sm">
                    <strong>{source.name}</strong>
                    <span className="text-muted-foreground">
                      {source.bitrateKbps
                        ? `${(source.bitrateKbps / 1000).toFixed(1)} Mbps`
                        : "Offline"}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(100, source.bitrateKbps / 70)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="Next actions"
          description="Work needed before real viewer delivery."
        >
          <div className="space-y-3">
            {[
              "Attach MediaMTX WebRTC endpoints",
              "Publish read-only camera directory API",
              "Connect OBS websocket through server",
              "Replace fixture chat with Phoenix rooms",
            ].map((item, index) => (
              <div key={item} className="flex gap-3 rounded-xl bg-muted/60 p-3">
                <span className="bg-primary/10 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black text-primary">
                  {index + 1}
                </span>
                <span className="text-sm font-semibold leading-7">{item}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Director({
  sources,
  scene,
  setScene,
  paused,
  setPaused,
  locked,
  setLocked,
}: {
  sources: TankCamera[];
  scene: string;
  setScene: (scene: string) => void;
  paused: boolean;
  setPaused: (value: boolean) => void;
  locked: boolean;
  setLocked: (value: boolean) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            OBS and NOALBS program control
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPaused(!paused)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold"
          >
            <CirclePause className="h-4 w-4" />
            {paused ? "Resume" : "Pause"} switcher
          </button>
          <button
            onClick={() => setLocked(!locked)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            <Lock className="h-4 w-4" />
            {locked ? "Director locked" : "Lock director"}
          </button>
        </div>
      </div>
      <Stats sources={sources} />
      <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <Panel
          title="Multiview"
          description="Preview public and protected source states."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {sources.map((source, index) => (
              <button
                key={source.id}
                className={`group relative overflow-hidden rounded-xl border text-left ${index === 0 ? "ring-primary/20 border-primary ring-2" : "border-border"}`}
              >
                <div
                  className={`aspect-video bg-gradient-to-br ${source.accent}`}
                >
                  <span className="absolute left-3 top-3 rounded-md bg-black/65 px-2 py-1 text-[10px] font-bold uppercase text-white">
                    {index === 0 ? "Program" : "Preview"}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-background p-3">
                  <span>
                    <strong className="block text-sm">{source.name}</strong>
                    <span className="text-xs text-muted-foreground">
                      {source.latencyMs
                        ? `${source.latencyMs} ms`
                        : "No signal"}
                    </span>
                  </span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${tone(source.health)}`}
                  />
                </div>
              </button>
            ))}
          </div>
        </Panel>
        <div className="space-y-6">
          <Panel title="Program scene" description="Manual OBS scene override.">
            <div className="grid gap-2">
              {["LIVE", "LOW", "BRB"].map((item) => (
                <button
                  key={item}
                  onClick={() => setScene(item)}
                  className={`flex justify-between rounded-xl border px-4 py-3 text-sm font-black ${scene === item ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
                >
                  <span>{item}</span>
                  <span className="text-xs opacity-70">
                    {scene === item ? "On program" : "Take"}
                  </span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Switch countdown">
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
              <p className="text-sm font-bold text-amber-600">
                Primary stability check
              </p>
              <p className="mt-1 text-3xl font-black tabular-nums">00:08</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Primary camera recovered above 4 Mbps.
              </p>
            </div>
          </Panel>
        </div>
      </div>
      <Panel
        title="Scene history"
        description="Recent automatic and manual decisions."
      >
        <div className="divide-y divide-border">
          {[
            ["14:36:18", "Primary → Program", "Primary recovered above 4 Mbps"],
            ["14:35:52", "LOW scene", "Primary sustained low bitrate for 8s"],
            ["14:22:04", "Secondary → Program", "Manual director switch"],
          ].map(([time, event, reason]) => (
            <div
              key={time}
              className="grid gap-1 py-3 text-sm sm:grid-cols-[100px_190px_1fr]"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {time}
              </span>
              <strong>{event}</strong>
              <span className="text-muted-foreground">{reason}</span>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function Sources({
  sources,
  updateSource,
}: {
  sources: TankCamera[];
  updateSource: (id: string, patch: Partial<TankCamera>) => void;
}) {
  return (
    <div className="space-y-6">
      <Panel
        title="Automatic camera lifecycle"
        description="Live receiver projection. Credentials are reduced to a non-reversible fingerprint before reaching this page."
      >
        <LiveCameraRegistry />
      </Panel>
      <Panel
        title="Receiver sources"
        description="SRT, SRTLA, IP-camera, and RTMP ingest inventory."
        action={
          <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            <Camera className="h-4 w-4" />
            Add source
          </button>
        }
      >
        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={source.id}
              className="grid gap-4 rounded-xl border border-border p-4 lg:grid-cols-[1fr_120px_130px_190px] lg:items-center"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full ${tone(source.health)}`}
                />
                <div>
                  <strong>{source.name}</strong>
                  <p className="text-xs text-muted-foreground">
                    {source.location} · receiver/{source.slug}
                  </p>
                </div>
              </div>
              <div className="text-sm">
                <span className="block text-xs text-muted-foreground">
                  Bitrate
                </span>
                <strong>
                  {source.bitrateKbps ? `${source.bitrateKbps} kbps` : "—"}
                </strong>
              </div>
              <div className="text-sm">
                <span className="block text-xs text-muted-foreground">
                  Priority
                </span>
                <strong>{source.priority}</strong>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    updateSource(source.id, { enabled: !source.enabled })
                  }
                  className={`rounded-lg border px-3 py-2 text-xs font-bold ${source.enabled ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {source.enabled ? "Enabled" : "Disabled"}
                </button>
                <button
                  onClick={() =>
                    updateSource(source.id, { isPublic: !source.isPublic })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"
                >
                  {source.isPublic ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  {source.isPublic ? "Public" : "Private"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Channels() {
  return (
    <Panel
      title="Channels and rooms"
      description="Stable identities now; creator ownership can attach later."
      action={
        <button className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          New channel
        </button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {channels.map((channel) => (
          <article
            key={channel.id}
            className="rounded-xl border border-border p-4"
          >
            <div className="flex justify-between">
              <div>
                <strong className="text-lg">{channel.name}</strong>
                <p className="text-sm text-primary">{channel.handle}</p>
              </div>
              <span
                className={`h-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${channel.live ? "bg-red-500/15 text-red-500" : "bg-muted text-muted-foreground"}`}
              >
                {channel.live ? "Live" : "Offline"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {channel.bio}
            </p>
            <div className="mt-4 flex justify-between border-t border-border pt-3 text-xs font-semibold text-muted-foreground">
              <span>{channel.cameraIds.length} sources</span>
              <span>{channel.followers.toLocaleString()} followers</span>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function Chat() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <Panel
        title="Moderation queue"
        description="Messages and viewer reports across public rooms."
      >
        <div className="space-y-3">
          {[
            [
              "game-room",
              "viewer482",
              "Possible spam link removed automatically",
              "Review",
            ],
            [
              "director",
              "nightcurrent",
              "Message reported by 3 viewers",
              "Review",
            ],
            ["game-room", "newviewer17", "First-time chatter", "Approve"],
          ].map(([room, user, reason, action]) => (
            <div
              key={`${room}-${user}`}
              className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center"
            >
              <span className="bg-primary/10 grid h-9 w-9 place-items-center rounded-full font-bold text-primary">
                {user[0].toUpperCase()}
              </span>
              <div className="flex-1">
                <strong className="text-sm">{user}</strong>
                <p className="text-xs text-muted-foreground">
                  #{room} · {reason}
                </p>
              </div>
              <button className="rounded-lg border border-border px-3 py-2 text-xs font-bold">
                {action}
              </button>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Room controls">
        <div className="space-y-3">
          {[
            "Followers-only chat",
            "Slow mode · 8 seconds",
            "Block links from new users",
            "Hold suspicious messages",
          ].map((item, index) => (
            <label
              key={item}
              className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3 text-sm font-semibold"
            >
              <span>{item}</span>
              <input
                type="checkbox"
                defaultChecked={index !== 0}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
            </label>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Webhooks() {
  return (
    <Panel
      title="Event webhooks"
      description="Server-to-server delivery only; signing secrets are never shown here."
      action={
        <button className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          Add endpoint
        </button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="pb-3">Endpoint</th>
              <th className="pb-3">Events</th>
              <th className="pb-3">Last delivery</th>
              <th className="pb-3">Status</th>
              <th className="pb-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[
              [
                "automation.unenter.live/tank",
                "stream.*, source.health",
                "12 seconds ago",
                "200",
              ],
              [
                "chat.unenter.live/hooks/mod",
                "chat.reported",
                "4 minutes ago",
                "200",
              ],
              [
                "archive.unenter.live/session",
                "session.ended",
                "Yesterday",
                "Retry",
              ],
            ].map(([url, events, last, status]) => (
              <tr key={url}>
                <td className="py-4 font-mono text-xs">{url}</td>
                <td className="py-4 text-muted-foreground">{events}</td>
                <td className="py-4 text-muted-foreground">{last}</td>
                <td className="py-4">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${status === "200" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}
                  >
                    {status === "200" ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {status}
                  </span>
                </td>
                <td className="py-4 text-right">
                  <button className="text-xs font-bold text-primary">
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function UsersPanel() {
  return (
    <Panel
      title="People and access"
      description="Admin and operator roles remain separate from future creator memberships."
    >
      <div className="space-y-3">
        {[
          ["Skill", "Platform admin", "Active now", "SK"],
          ["Tank Operator", "Director", "18 minutes ago", "TO"],
          ["Chat Moderator", "Moderator", "2 hours ago", "CM"],
        ].map(([name, role, seen, initials]) => (
          <div
            key={name}
            className="flex items-center gap-4 rounded-xl border border-border p-4"
          >
            <span className="bg-primary/12 grid h-10 w-10 place-items-center rounded-full text-sm font-black text-primary">
              {initials}
            </span>
            <div className="flex-1">
              <strong>{name}</strong>
              <p className="text-xs text-muted-foreground">{role}</p>
            </div>
            <span className="hidden text-xs text-muted-foreground sm:block">
              {seen}
            </span>
            <button className="rounded-lg border border-border px-3 py-2 text-xs font-bold">
              Manage
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function System() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Panel
        title="Service boundary"
        description="What the platform can currently prove."
      >
        <div className="space-y-3">
          {[
            {
              label: "Receiver manager",
              text: "Public directory contract defined; live API not attached.",
              ok: true,
            },
            {
              label: "OBS websocket",
              text: "Server-only adapter planned; fixture state in this frontend.",
              ok: true,
            },
            {
              label: "Browser playback",
              text: "WebRTC and HLS player connection points are present.",
              ok: true,
            },
            {
              label: "Phoenix chat",
              text: "Room UI is ready; realtime server is not connected.",
              ok: false,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex gap-3 rounded-xl border border-border p-4"
            >
              {item.ok ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              )}
              <div>
                <strong>{item.label}</strong>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {item.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <div className="space-y-6">
        <Panel title="Security">
          <div className="space-y-3 text-sm">
            {[
              { icon: Shield, label: "Admin role required" },
              { icon: Lock, label: "Credentials server-side" },
              { icon: EyeOff, label: "Private sources hidden" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="bg-primary/10 rounded-lg p-2 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Configuration">
          <div className="grid gap-2">
            <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold">
              <Boxes className="h-4 w-4" />
              Export fixture config
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold">
              <SlidersHorizontal className="h-4 w-4" />
              Import configuration
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
