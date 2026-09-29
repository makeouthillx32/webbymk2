"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Radio,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Unplug,
  ShieldCheck,
  Globe2,
  Layers,
  Sparkles,
} from "lucide-react";
import { ACTIVE_THEME } from "../theme";
import { ChromePanel } from "../public/components/ChromePanel";
import { ExternalChatProviderBadge } from "../public/components/ExternalChatProviderBadge";
import type { TankChatProvider } from "../contracts";

type SafeProviderConnection = {
  provider: TankChatProvider;
  configured: boolean;
  enabled: boolean;
  status: "disconnected" | "connecting" | "connected" | "error" | "retired";
  accountId?: string;
  accountName?: string;
  channelId?: string;
  channelName?: string;
  connectedAt?: string;
  lastEventAt?: string;
  lastError?: string;
};

const PROVIDER_METADATA: Record<
  TankChatProvider,
  {
    title: string;
    description: string;
    accentBorder: string;
    accentBg: string;
    accentText: string;
    retired?: boolean;
    authGuide: string;
  }
> = {
  tank: {
    title: "Tank Native Chat",
    description: "Built-in real-time WebSocket / Supabase channel for tank.unenter.live users.",
    accentBorder: "border-amber-500/40",
    accentBg: "bg-amber-950/20",
    accentText: "text-amber-400",
    authGuide: "Always active as the core chat plane.",
  },
  twitch: {
    title: "Twitch EventSub",
    description: "Live channel chat ingestion via Twitch EventSub webhook & official IRC gateway.",
    accentBorder: "border-purple-500/40",
    accentBg: "bg-purple-950/20",
    accentText: "text-purple-400",
    authGuide: "Requires Twitch Client ID & EventSub webhook secret.",
  },
  kick: {
    title: "Kick Webhook & Chat",
    description: "Real-time chatroom ingestion via Kick official webhook API and RSA-SHA256 signature verification.",
    accentBorder: "border-emerald-500/40",
    accentBg: "bg-emerald-950/20",
    accentText: "text-emerald-400",
    authGuide: "Requires Kick PKCE OAuth & Webhook public key verification.",
  },
  youtube: {
    title: "YouTube Live Chat",
    description: "YouTube Live Chat API stream reader syncing live broadcast messages.",
    accentBorder: "border-rose-500/40",
    accentBg: "bg-rose-950/20",
    accentText: "text-rose-400",
    authGuide: "Requires Google Cloud OAuth 2.0 with youtube.readonly scope.",
  },
  trovo: {
    title: "Trovo Live (Retired)",
    description: "Historical Trovo platform bridge. Live streaming on Trovo officially concluded on June 30, 2026.",
    accentBorder: "border-emerald-700/30",
    accentBg: "bg-emerald-950/10",
    accentText: "text-emerald-500/70",
    retired: true,
    authGuide: "Retired June 30, 2026. Preserved for legacy badges and historical archives.",
  },
};

export function HouseExternalChatPanel() {
  const [connections, setConnections] = useState<SafeProviderConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/tank/chat-providers", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load chat providers (${res.status})`);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.connections)) {
        setConnections(data.connections);
      } else {
        setConnections([]);
      }
    } catch (err) {
      console.error("Failed to load chat providers", err);
      setError(err instanceof Error ? err.message : "Unable to reach provider backend.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleDisconnect = async (provider: TankChatProvider) => {
    if (actionInProgress) return;
    try {
      setActionInProgress(provider);
      const res = await fetch(`/api/tank/chat-providers/${provider}/disconnect`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`Disconnect failed (${res.status})`);
      }
      await fetchConnections();
    } catch (err) {
      console.error(`Failed to disconnect ${provider}`, err);
      alert(err instanceof Error ? err.message : "Disconnect failed.");
    } finally {
      setActionInProgress(null);
    }
  };

  const providersToShow: TankChatProvider[] = ["twitch", "kick", "youtube", "trovo"];

  return (
    <div className="space-y-4">
      <ChromePanel withScrews className="shadow-2xl" contentClassName="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded border border-amber-500/40 bg-amber-950/40 text-amber-400 shadow-inner">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h2
                className="text-sm font-black uppercase tracking-wider text-white"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                External Streaming Chat Integrations
              </h2>
              <p className="text-xs text-slate-400">
                Unified live chat sync. External messages from Twitch, Kick, and YouTube appear directly in Tank Global Chat with provider badges.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchConnections}
              disabled={loading}
              className="flex items-center gap-1.5 rounded border border-black/80 bg-[#1e222b] px-2.5 py-1 text-xs font-bold text-slate-300 transition-colors hover:bg-[#282d39] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Sync Status
            </button>
            <span className="flex items-center gap-1 text-xs font-black text-emerald-400 font-mono">
              <ShieldCheck className="h-3.5 w-3.5" />
              INGEST READY
            </span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Provider Cards */}
        <div className="grid gap-3.5 md:grid-cols-2">
          {providersToShow.map((provider) => {
            const meta = PROVIDER_METADATA[provider];
            const connection = connections.find((c) => c.provider === provider);
            const isConnected = connection?.status === "connected";
            const isRetired = meta.retired || connection?.status === "retired";
            const isBusy = actionInProgress === provider;

            return (
              <div
                key={provider}
                className={`rounded border border-black/80 bg-[#16181d]/90 p-4 shadow-inner space-y-3 relative overflow-hidden transition-all ${
                  isConnected ? "ring-1 ring-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.08)]" : ""
                }`}
              >
                {/* Top Bar */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <ExternalChatProviderBadge provider={provider} />
                    <div>
                      <h3
                        className="text-sm font-black uppercase text-white tracking-wide"
                        style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                      >
                        {meta.title}
                      </h3>
                      {connection?.channelName ? (
                        <p className="text-xs font-bold text-amber-400 font-mono">
                          @{connection.channelName}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500 font-mono">
                          {isRetired ? "Archived" : "Not connected"}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status Pill */}
                  <span
                    className={`rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      isConnected
                        ? "border-emerald-500/40 bg-emerald-950/60 text-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)] animate-pulse"
                        : isRetired
                        ? "border-amber-700/40 bg-amber-950/40 text-amber-500/80"
                        : "border-black/60 bg-black/60 text-slate-400"
                    }`}
                  >
                    {isConnected ? "● CONNECTED" : isRetired ? "RETIRED" : "DISCONNECTED"}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-300 leading-relaxed">
                  {meta.description}
                </p>

                {/* Status / Error info */}
                {connection?.lastError && (
                  <div className="rounded border border-rose-500/30 bg-rose-950/20 p-2 text-[11px] text-rose-300 flex items-start gap-1.5 font-mono">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400 mt-0.5" />
                    <span>{connection.lastError}</span>
                  </div>
                )}

                {/* Metadata details */}
                <div className="border-t border-white/5 pt-2.5 flex items-center justify-between text-[10px] font-bold text-slate-400">
                  <span className="flex items-center gap-1 font-mono">
                    <Globe2 className="h-3 w-3 text-slate-500" />
                    Global Chat Sync:{" "}
                    <span className={isConnected ? "text-emerald-400" : "text-slate-500"}>
                      {isConnected ? "Active" : "Idle"}
                    </span>
                  </span>

                  {connection?.lastEventAt && (
                    <span className="text-slate-500 font-mono">
                      Last: {new Date(connection.lastEventAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                {/* Action buttons */}
                {!isRetired && (
                  <div className="flex items-center gap-2 pt-1">
                    {isConnected ? (
                      <button
                        onClick={() => handleDisconnect(provider)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 rounded border border-rose-500/40 bg-rose-950/30 px-3 py-1.5 text-xs font-bold text-rose-300 transition-colors hover:bg-rose-900/40 disabled:opacity-50"
                      >
                        <Unplug className="h-3.5 w-3.5" />
                        {isBusy ? "Disconnecting..." : "Disconnect Channel"}
                      </button>
                    ) : (
                      <a
                        href={`/api/tank/chat-providers/${provider}/connect`}
                        className="flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-xs font-black uppercase text-amber-300 transition-all hover:bg-amber-900/60 hover:border-amber-400"
                        style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Connect via OAuth
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Live Chat & Overlay Preview Notice */}
        <div className="rounded border border-black/80 bg-black/40 p-3 text-xs text-slate-400 space-y-1">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Badge & Overlay Rendering</span>
          </div>
          <p>
            When connected, all chat messages ingested from these external streams are tagged with their origin provider. They render with the respective provider badge in the Tank public chat feed and in the OBS transparent chat overlay (<code className="text-slate-300">/obs/chat</code>).
          </p>
        </div>
      </ChromePanel>
    </div>
  );
}
