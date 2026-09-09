"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  Gift,
  Link2,
  RefreshCw,
  Shield,
  Trophy,
  Video,
  Wrench,
} from "lucide-react";
import { ACTIVE_THEME } from "../theme";

// Creator dashboard shell for tank.unenter.live/stream.
//
// Only the "Stream URL & Key" tab is real — it's the same self-service OBS
// credential flow that used to live alone at /obs/stream (now a redirect
// here), given a proper home instead of a bare unbranded card. Every other
// tab is deliberately a forward-facing placeholder: this
// is a mod-only tool for the current platform lifecycle (see
// tank-platform-lifecycle-roadmap.md Phase 1), not the self-service
// creator/broadcaster onboarding of Phase 4 — Revenue, Achievements,
// Moderation, and Drops & rewards get built out when that phase does.
//
// Access is gated by the same server-side role check /api/tank/obs/room
// already enforces (admin or moderator) — there is no separate page-level
// auth here on purpose, the API is the source of truth.

type ObsRoomCredentials = {
  slug: string;
  title: string;
  isLive: boolean;
  serverUrl: string;
  obsStreamKey: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "denied"; error: string }
  | { status: "ready"; room: ObsRoomCredentials };

type StreamTab = "stream" | "keys" | "revenue" | "achievements" | "moderation" | "drops";

const NAV: { tab: StreamTab; label: string; icon: typeof Video }[] = [
  { tab: "stream", label: "Stream", icon: Video },
  { tab: "keys", label: "Stream URL & Key", icon: Link2 },
  { tab: "revenue", label: "Revenue", icon: BarChart3 },
  { tab: "achievements", label: "Achievements", icon: Trophy },
  { tab: "moderation", label: "Moderation", icon: Wrench },
  { tab: "drops", label: "Drops & rewards", icon: Gift },
];

const RECOMMENDED_ENCODING: { label: string; value: string }[] = [
  { label: "Output Resolution", value: "1920x1080" },
  { label: "Framerate", value: "60" },
  { label: "Rate Control", value: "CBR" },
  { label: "Bitrate (Kbps)", value: "8000" },
  { label: "Keyframe Interval (seconds)", value: "2" },
];

function CopyIconButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="grid h-8 w-8 shrink-0 place-items-center rounded border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10"
      aria-label={`Copy ${value}`}
      title={copied ? "Copied" : "Copy"}
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

function MaskedField({
  label,
  value,
  revealed,
  onToggle,
  action,
}: {
  label: string;
  value: string;
  revealed: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="mb-2 text-sm font-bold text-white">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded border border-white/10 bg-black/50 px-3 py-2.5 text-xs text-white/90">
          {revealed ? value : "•".repeat(Math.min(40, Math.max(20, value.length)))}
        </code>
        <button
          type="button"
          onClick={onToggle}
          className="grid h-9 w-9 shrink-0 place-items-center rounded border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10"
          aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        {action}
      </div>
    </div>
  );
}

function StreamKeysTab({
  state,
  onRotate,
  rotating,
}: {
  state: Extract<LoadState, { status: "ready" }>;
  onRotate: () => void;
  rotating: boolean;
}) {
  const [urlRevealed, setUrlRevealed] = useState(false);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const downloadProfile = useCallback(() => {
    const lines = [
      "Tank stream settings — reference file",
      "",
      `Server URL: ${state.room.serverUrl}`,
      `Stream Key: ${state.room.obsStreamKey}`,
      "",
      "Recommended encoding:",
      ...RECOMMENDED_ENCODING.map((row) => `  ${row.label}: ${row.value}`),
      "",
      "Paste Server URL and Stream Key into OBS → Settings → Stream → Custom.",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tank-stream-${state.room.slug}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [state.room]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${state.room.isLive ? "animate-pulse bg-emerald-400" : "bg-white/20"}`}
          />
          <span className="text-xs font-bold text-white/70">
            {state.room.isLive ? "Live now" : "Not currently streaming"}
          </span>
        </div>
        <span className="text-[10px] font-mono text-white/40">room: {state.room.slug}</span>
      </div>

      <MaskedField
        label="Stream URL"
        value={state.room.serverUrl}
        revealed={urlRevealed}
        onToggle={() => setUrlRevealed((v) => !v)}
        action={<CopyIconButton value={state.room.serverUrl} />}
      />

      <MaskedField
        label="Stream Key"
        value={state.room.obsStreamKey}
        revealed={keyRevealed}
        onToggle={() => setKeyRevealed((v) => !v)}
        action={
          <button
            type="button"
            onClick={onRotate}
            disabled={rotating}
            className="flex shrink-0 items-center gap-1.5 rounded border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-bold text-white/70 transition hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rotating ? "animate-spin" : ""}`} />
            Reset
          </button>
        }
      />
      <p className="-mt-3 text-[10px] text-white/40">
        Resetting generates a new key immediately — OBS will need it updated right away, the old one stops working.
      </p>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="mb-1 text-sm font-bold text-white">Recommended Encoding Settings</p>
        <p className="mb-4 text-xs text-white/50">
          Reasonable defaults for streaming into Tank. Not enforced — OBS will accept other settings too.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {RECOMMENDED_ENCODING.map((row) => (
            <div key={row.label}>
              <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-white/50">{row.label}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded border border-white/10 bg-black/50 px-3 py-2 text-xs text-white/90">
                  {row.value}
                </code>
                <CopyIconButton value={row.value} />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={downloadProfile}
          className="mt-4 flex items-center gap-1.5 text-xs font-bold text-white/60 underline decoration-white/20 underline-offset-2 transition hover:text-white/90"
        >
          <Download className="h-3.5 w-3.5" />
          Download stream settings (.txt)
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03]">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <div>
            <p className="text-sm font-bold text-white">Advanced Settings</p>
            <p className="text-xs text-white/50">Ingest protocol and endpoint details.</p>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-white/50 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
          />
        </button>
        {advancedOpen && (
          <div className="space-y-2 border-t border-white/10 p-4 text-xs text-white/60">
            <p>
              <span className="font-bold text-white/80">Protocol:</span> RTMP, via the Server URL and Stream Key above.
            </p>
            <p>
              SRT ingest exists for the house camera pipeline but isn&apos;t self-service yet — ask an admin if you
              need it for your stream specifically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ComingSoonPanel({
  icon: Icon,
  title,
  blurb,
}: {
  icon: typeof Video;
  title: string;
  blurb: string;
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/40">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-black text-white">{title}</p>
      <p className="mt-1.5 max-w-xs text-xs text-white/40">{blurb}</p>
      <span className="mt-4 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white/40">
        Coming soon
      </span>
    </div>
  );
}

export function StreamDashboardPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [rotating, setRotating] = useState(false);
  const [tab, setTab] = useState<StreamTab>("keys");

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/tank/obs/room", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setState({ status: "denied", error: json?.error ?? "This page is moderator-only." });
        return;
      }
      setState({ status: "ready", room: json.room });
    } catch {
      setState({ status: "denied", error: "Could not reach Tank." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rotate = useCallback(async () => {
    if (state.status !== "ready") return;
    const proceed = window.confirm(
      "Generate a new stream key? OBS will need the new key immediately — the old one stops working right away.",
    );
    if (!proceed) return;
    setRotating(true);
    try {
      const res = await fetch("/api/tank/obs/room", { method: "POST" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setState({ status: "ready", room: json.room });
      }
    } finally {
      setRotating(false);
    }
  }, [state]);

  if (state.status === "loading") {
    return (
      <main
        className="grid min-h-screen place-items-center"
        style={{ backgroundColor: "#0d0e10", fontFamily: ACTIVE_THEME.fonts.label }}
      >
        <p className="text-sm text-white/40">Loading your stream dashboard...</p>
      </main>
    );
  }

  if (state.status === "denied") {
    return (
      <main
        className="grid min-h-screen place-items-center p-6"
        style={{ backgroundColor: "#0d0e10", fontFamily: ACTIVE_THEME.fonts.label }}
      >
        <div className="max-w-sm rounded-xl border border-red-500/30 bg-red-950/20 p-5 text-center">
          <Shield className="mx-auto mb-2 h-6 w-6 text-red-400" />
          <p className="text-sm font-bold text-red-300">{state.error}</p>
          <p className="mt-2 text-xs text-red-300/60">
            Moderator or admin access is required to stream into Tank right now.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen min-h-[100dvh]"
      style={{ backgroundColor: "#0d0e10", fontFamily: ACTIVE_THEME.fonts.label }}
    >
      <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-white/10 p-4 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center gap-2 px-2">
            <Video className="h-5 w-5 text-purple-400" />
            <span className="text-sm font-black text-white">Creator Dashboard</span>
          </div>
          <nav className="space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = tab === item.tab;
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => setTab(item.tab)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/50 hover:bg-white/5 hover:text-white/80"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="p-5 sm:p-8">
          <div className="mx-auto max-w-2xl space-y-6">
            <div>
              <h1 className="text-lg font-black text-white">
                {NAV.find((item) => item.tab === tab)?.label}
              </h1>
              {tab === "keys" && (
                <p className="text-xs text-white/50">
                  Paste these into OBS or Streamlabs. Go live and your room appears — stop and it disappears.
                </p>
              )}
            </div>

            {tab === "keys" && <StreamKeysTab state={state} onRotate={rotate} rotating={rotating} />}
            {tab === "stream" && (
              <ComingSoonPanel
                icon={Video}
                title="Stream overview"
                blurb="Live status, uptime, and viewer stats for your current broadcast will land here."
              />
            )}
            {tab === "revenue" && (
              <ComingSoonPanel
                icon={BarChart3}
                title="Revenue"
                blurb="Creator payouts arrive with self-service broadcaster onboarding — not part of this platform phase yet."
              />
            )}
            {tab === "achievements" && (
              <ComingSoonPanel
                icon={Trophy}
                title="Achievements"
                blurb="Streaming milestones and badges for creators will show up here."
              />
            )}
            {tab === "moderation" && (
              <ComingSoonPanel
                icon={Wrench}
                title="Moderation"
                blurb="Per-stream moderator tools and settings will live here."
              />
            )}
            {tab === "drops" && (
              <ComingSoonPanel
                icon={Gift}
                title="Drops & rewards"
                blurb="Viewer drops tied to your stream will be configurable here."
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default StreamDashboardPage;
