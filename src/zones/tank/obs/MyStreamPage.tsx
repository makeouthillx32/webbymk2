"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Eye, EyeOff, RefreshCw, Video } from "lucide-react";
import { ACTIVE_THEME } from "../theme";

// Self-service OBS credentials for staff.
//
// Every admin gets their own room, independently — no one hands out keys,
// nothing is provisioned by hand. Loading this page for the first time
// creates the room; the backend (getOrCreateMyObsRoom) has done that since
// before this page existed. What was missing was somewhere to actually see
// the result.
//
// The room appears on tank.unenter.live the moment OBS starts publishing and
// disappears the moment it stops — driven entirely by MediaMTX's own
// runOnReady/runOnNotReady hooks (see mediamtx.yml), the same "if there's no
// feed, there's no room" rule every other push-based camera already follows.
// There is nothing to turn off after a stream ends.

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

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black uppercase tracking-wider text-white/50">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/90">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="grid h-9 w-9 shrink-0 place-items-center rounded border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
          aria-label={`Copy ${label}`}
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
      {copied && <p className="text-[10px] font-bold text-emerald-400">Copied</p>}
    </div>
  );
}

export function MyStreamPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/tank/obs/room", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setState({ status: "denied", error: json?.error ?? "OBS rooms are staff-only." });
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
        setRevealed(true);
      }
    } finally {
      setRotating(false);
    }
  }, [state]);

  return (
    <main
      className="min-h-screen p-4 sm:p-8"
      style={{ backgroundColor: "#0d0e10", fontFamily: ACTIVE_THEME.fonts.label }}
    >
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-purple-500/40 bg-purple-950/40 text-purple-400">
            <Video className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white">Your Tank Stream</h1>
            <p className="text-xs text-white/50">
              Paste these into OBS or Streamlabs. Go live and your room appears — stop and it disappears.
            </p>
          </div>
        </div>

        {state.status === "loading" && (
          <p className="text-sm text-white/50">Loading your room...</p>
        )}

        {state.status === "denied" && (
          <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-300">
            {state.error}
          </div>
        )}

        {state.status === "ready" && (
          <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
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

            <CopyField label="Server" value={state.room.serverUrl} />

            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-white/50">Stream Key</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/90">
                  {revealed ? state.room.obsStreamKey : "-".repeat(28)}
                </code>
                <button
                  type="button"
                  onClick={() => setRevealed((v) => !v)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
                  aria-label={revealed ? "Hide stream key" : "Show stream key"}
                >
                  {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(state.room.obsStreamKey)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
                  aria-label="Copy stream key"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[10px] text-white/40">
                Whoever has this can stream into your room. Treat it like a password.
              </p>
            </div>

            <button
              type="button"
              onClick={rotate}
              disabled={rotating}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${rotating ? "animate-spin" : ""}`} />
              Generate new key
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default MyStreamPage;
