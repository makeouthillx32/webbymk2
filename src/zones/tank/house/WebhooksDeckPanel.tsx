"use client";

import React from "react";
import { Webhook, CheckCircle2, RefreshCw, Send, ShieldCheck, Zap } from "lucide-react";
import { ACTIVE_THEME } from "../theme";
import { ChromePanel } from "../public/components/ChromePanel";

const WEBHOOK_ENDPOINTS = [
  {
    endpoint: "https://automation.unenter.live/api/webhooks/tank",
    events: "stream.*, source.health, chat.moderation",
    lastDelivery: "4 seconds ago",
    status: 200,
  },
  {
    endpoint: "https://discord.com/api/webhooks/tank-announcements",
    events: "house.event, house.poll, token.jackpot",
    lastDelivery: "1 minute ago",
    status: 200,
  },
  {
    endpoint: "https://bot.unenter.live/api/tank/director-events",
    events: "director.cut, camera.attention_lock",
    lastDelivery: "3 minutes ago",
    status: 200,
  },
];

export function WebhooksDeckPanel() {
  return (
    <div className="space-y-4">
      <ChromePanel
        withScrews
        className="shadow-2xl"
        contentClassName="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded border border-purple-500/40 bg-purple-950/40 text-purple-400 shadow-inner">
              <Webhook className="h-4 w-4" />
            </div>
            <div>
              <h2
                className="text-sm font-black uppercase tracking-wider text-white"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                Event Webhooks & Outbound Integrations
              </h2>
              <p className="text-xs text-slate-400">
                Server-to-server delivery ledger. Payloads signed with HMAC-SHA256 signatures.
              </p>
            </div>
          </div>

          <span className="flex items-center gap-1 text-xs font-black text-emerald-400 font-mono">
            <ShieldCheck className="h-3.5 w-3.5" />
            OUTBOX ACTIVE
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="border-b border-black/80 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="pb-2">Endpoint URL</th>
                <th className="pb-2">Subscribed Events</th>
                <th className="pb-2">Last Delivery</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {WEBHOOK_ENDPOINTS.map((item, idx) => (
                <tr key={idx} className="hover:bg-black/20">
                  <td className="py-2.5 pr-3 text-slate-200 font-bold">
                    {item.endpoint}
                  </td>
                  <td className="py-2.5 pr-3 text-purple-300">
                    {item.events}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-400 text-[11px]">
                    {item.lastDelivery}
                  </td>
                  <td className="py-2.5">
                    <span className="rounded border border-emerald-500/40 bg-emerald-950/60 px-2 py-0.5 text-[9px] font-black text-emerald-400">
                      HTTP {item.status} OK
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChromePanel>
    </div>
  );
}
