"use client";

import { useState, useMemo } from "react";
import { X, Sparkles, Clock, Coins } from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ACTIVE_THEME } from "../../theme";
import { sendSuperChat } from "../../server/chatPins";

export type SuperChatModalProps = {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  userTokens: number;
  onSent?: (newBalance: number) => void;
};

const MIN_MINUTES = 2;
const MAX_MINUTES = 300; // 5 hours
const RATE_PER_MINUTE = 100;
const MAX_CHARS = 350;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
}

export function SuperChatModal({ isOpen, onClose, roomId, userTokens, onSent }: SuperChatModalProps) {
  const [message, setMessage] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(MIN_MINUTES);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client-side preview only — sendSuperChat recomputes and enforces the
  // real cost server-side from durationMinutes, never trusting this value.
  const cost = useMemo(
    () =>
      Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(durationMinutes))) *
      RATE_PER_MINUTE,
    [durationMinutes],
  );
  const canAfford = userTokens >= cost;

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!message.trim() || !canAfford || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendSuperChat(roomId, message, durationMinutes);
      if (res.success) {
        setMessage("");
        setDurationMinutes(MIN_MINUTES);
        onSent?.(res.newBalance ?? userTokens - cost);
        onClose();
      } else {
        setError(res.error || "Failed to send Super Chat.");
      }
    } catch {
      setError("Network error sending Super Chat.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-3 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Super Chat"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.9)]"
      >
        <ChromePanel withScrews className="flex max-h-[90vh] w-full flex-col overflow-hidden" contentClassName="!p-0 flex flex-1 min-h-0 flex-col">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-black/40 px-4 py-3">
            <h2
              className="flex items-center gap-2 text-lg font-black uppercase tracking-wider text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              <Sparkles className="h-5 w-5 text-amber-400" /> Super Chat
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded border border-white/40 bg-[#e85a4f] text-white shadow hover:scale-105 active:scale-95"
            >
              <X className="h-4 w-4 stroke-[3]" />
            </button>
          </div>

          {/* Scrollable body — nothing below this can get clipped off-screen */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <p className="mb-3 text-xs font-medium text-slate-400">
              Pin your message to the top of chat for everyone to see.
            </p>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-400">
                <span>Message</span>
                <span className={message.length > MAX_CHARS ? "text-red-400" : ""}>
                  {message.length} / {MAX_CHARS}
                </span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
                placeholder="Enter your super chat message..."
                rows={3}
                className="w-full resize-none rounded-lg border border-black/60 bg-black/60 p-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-500"
              />
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Duration
                </span>
                <span className="text-white">{formatDuration(durationMinutes)}</span>
              </div>
              <input
                type="range"
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                step={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
              <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
                <span>{formatDuration(MIN_MINUTES)}</span>
                <span>{formatDuration(MAX_MINUTES)}</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Balance</p>
                <p className="flex items-center gap-1 text-sm font-black text-white">
                  <Coins className="h-3.5 w-3.5 text-amber-400" /> {userTokens}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase text-slate-400">Cost</p>
                <p className={`text-sm font-black ${canAfford ? "text-emerald-400" : "text-red-400"}`}>
                  {cost}
                </p>
              </div>
              <div className="text-right text-[10px] text-slate-500">{RATE_PER_MINUTE}/min</div>
            </div>

            {error && <p className="mt-2 text-center text-xs font-bold text-red-400">{error}</p>}
            {!canAfford && !error && (
              <p className="mt-2 text-center text-xs font-bold text-red-400">
                Not enough tokens for this duration.
              </p>
            )}

            <button
              type="button"
              onClick={handleSend}
              disabled={!message.trim() || !canAfford || sending}
              className="mt-4 w-full rounded-lg bg-gradient-to-b from-amber-400 to-amber-600 py-2.5 text-center text-sm font-black uppercase tracking-wider text-white shadow-lg transition hover:from-amber-300 hover:to-amber-500 active:scale-95 disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send Super Chat"}
            </button>
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}

export default SuperChatModal;
