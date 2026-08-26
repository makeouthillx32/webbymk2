"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { RefreshCw, Check, X } from "lucide-react";

type AudioRequest = {
  id: string;
  userId: string;
  userName: string;
  kind: "tts" | "sfx";
  message: string | null;
  voiceOrSoundKey: string;
  targetType: "website" | "room";
  targetRoomKey: string | null;
  cost: number;
  status: "pending" | "approved" | "rejected" | "played";
  createdAt: string;
};

export default function TankAudioRequestsPage() {
  const [requests, setRequests] = useState<AudioRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tank/admin/audio-requests");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load requests");
      setRequests(data.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const decide = async (requestId: string, decision: "approve" | "reject") => {
    setDecidingId(requestId);
    try {
      const res = await fetch("/api/tank/admin/audio-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to moderate request");
      toast.success(decision === "approve" ? "Approved — playing now" : "Rejected — tokens refunded");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to moderate request");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">TTS & SFX Requests</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Viewer-submitted text-to-speech and sound effect requests, paid for with tokens.
            Approve to broadcast it (site-wide or to a specific room's audio output); reject to
            refund the viewer. Enable/disable TTS and SFX intake for everyone under Tank →
            Platform Settings (tts_enabled / sfx_enabled).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--border))] px-3 text-sm font-medium hover:bg-[hsl(var(--muted))]"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading requests…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          No pending requests — the queue is empty.
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div
              key={req.id}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">
                  {req.kind}
                </span>
                <strong className="text-sm">{req.userName}</strong>
                <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                  {req.targetType === "room" ? `→ ${req.targetRoomKey}` : "→ website"}
                </span>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  {req.cost} tokens · {new Date(req.createdAt).toLocaleTimeString()}
                </span>
              </div>

              <p className="mt-2 text-sm text-[hsl(var(--foreground))]">
                {req.kind === "tts" ? (
                  <>
                    &ldquo;{req.message}&rdquo;{" "}
                    <span className="text-[hsl(var(--muted-foreground))]">(voice: {req.voiceOrSoundKey})</span>
                  </>
                ) : (
                  <span className="text-[hsl(var(--muted-foreground))]">Sound: {req.voiceOrSoundKey}</span>
                )}
              </p>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={decidingId === req.id}
                  onClick={() => void decide(req.id, "approve")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Check size={14} />
                  Approve
                </button>
                <button
                  type="button"
                  disabled={decidingId === req.id}
                  onClick={() => void decide(req.id, "reject")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] border border-[hsl(var(--border))] px-3 text-sm font-medium hover:bg-[hsl(var(--muted))] disabled:opacity-50"
                >
                  <X size={14} />
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
