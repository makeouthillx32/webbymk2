"use client";

// The house cast's sprites, one per member. Ticked = that member is mirrored
// in the walkable house (their sprite follows them on the live cameras);
// unticked = they are not tracked at all, and the server drops them on the
// next cast tick. See vision/houseCast.ts and server/houseCastPrefs.ts.

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { castLabel } from "../../../vision/houseCast";

type Member = {
  id: string;
  kind: "human" | "dog" | "cat";
  tracked: boolean;
  room: string | null;
  lastSeen: { room: string; at: number } | null;
};

function ago(at: number) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : s < 172800 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
}

const POLL_MS = 4000;

export function HouseCastPanel() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/tank/staff/house-cast", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setMembers(((await response.json()) as { members: Member[] }).members);
      setError(null);
    } catch (e) {
      setError(`Couldn't read the cast: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(load, POLL_MS);
    return () => clearInterval(poll);
  }, [load]);

  const toggle = async (member: Member) => {
    setBusy(member.id);
    try {
      const response = await fetch("/api/tank/staff/house-cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: member.id, tracked: !member.tracked }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
      setMembers(body.members);
      setError(null);
    } catch (e) {
      setError(`Couldn't change ${castLabel(member.id)}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-[#0a1612] p-4 space-y-3 text-white" data-tank-house-cast-panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-300">
          <Users className="h-4 w-4" /> House cast
        </span>
        <span className="text-[10px] font-mono text-white/50">ticked sprites follow their person in the house; unticked are not tracked</span>
      </div>
      {error && <p className="text-[11px] font-mono text-red-400">{error}</p>}
      {!members && !error && <p className="text-xs text-white/60">Loading the cast…</p>}
      {members && (
        <div className="flex flex-wrap gap-2">
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              disabled={busy === member.id}
              onClick={() => toggle(member)}
              aria-pressed={member.tracked}
              data-cast-id={member.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                member.tracked
                  ? "border-emerald-400/70 bg-emerald-500/15 text-white"
                  : "border-white/15 bg-white/5 text-white/45 line-through"
              }`}
            >
              <span
                className={`h-3 w-3 rounded-sm border ${member.tracked ? "border-emerald-300 bg-emerald-400" : "border-white/30"}`}
                aria-hidden
              />
              {castLabel(member.id)}
              <span className="text-[10px] font-mono font-normal text-white/50">
                {!member.tracked
                  ? "off"
                  : member.room
                    ? `in ${member.room}`
                    : member.lastSeen
                      ? `last ${member.lastSeen.room}, ${ago(member.lastSeen.at)} ago`
                      : "not seen"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
