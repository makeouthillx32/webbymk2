"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  isSourceAvailable,
  isSourceMeasurable,
  resolveGoalProgress,
  type GoalSource,
} from "../obs/goalProgress";

type Goal = {
  id: string;
  label: string;
  source: GoalSource;
  sourceProvider: string | null;
  target: number;
  currentValue: number;
  accentColor: string;
  showCount: boolean;
  isActive: boolean;
  sortOrder: number;
};

const SOURCES: { value: GoalSource; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "viewers", label: "Live viewers" },
  { value: "drops", label: "Drop participants" },
  { value: "tavern", label: "Tavern chits served" },
  { value: "followers", label: "Followers" },
];

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-border p-5">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function GoalsAdminPanel() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [liveValue, setLiveValue] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/tank/goals", { cache: "no-store" });
      const payload = await response.json();
      setGoals(payload?.goals ?? []);
      setActiveId(payload?.active?.id ?? null);
      setLiveValue(payload?.liveValue ?? null);
      setError(null);
    } catch {
      setError("Could not load goals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Which platforms are actually connected, so a follower goal can say plainly
  // that it will not move rather than sitting at a number nobody can explain.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/tank/chat-providers", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled) return;
        const connected = (payload?.connections ?? [])
          .filter((c: { status?: string }) => c?.status === "connected")
          .map((c: { provider?: string }) => c?.provider)
          .filter(Boolean);
        setConnectedProviders(connected);
      } catch {
        // Leaving it empty is the safe reading: it makes the console warn about
        // follower goals rather than quietly promise they work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (patch: Record<string, unknown> & { id?: string }) => {
    setBusyId(patch.id ?? "new");
    try {
      const response = await fetch("/api/tank/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error ?? "Save failed.");
        return;
      }
      setError(null);
      await load();
    } catch {
      setError("Save failed.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await fetch("/api/tank/goals?id=" + encodeURIComponent(id), { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel
      title="Stream Goals"
      description="The progress bar on the /obs/goal browser source. One goal is on air at a time."
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={() => void save({ label: "New goal", source: "manual", target: 100 })}
            disabled={busyId === "new"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> New goal
          </button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No goals yet. Create one and switch it on — the overlay stays empty until then.
        </p>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const onAir = goal.id === activeId;
            // Only the goal actually on air has a measured value; for the others
            // that number belongs to a different goal.
            const progress = resolveGoalProgress(goal, onAir ? liveValue : null);
            const connected = isSourceAvailable(goal.source, connectedProviders);
            // Two different faults, and they need different sentences: no
            // platform connected, versus connected but Tank cannot count it.
            const countable = isSourceMeasurable(goal.source);
            const busy = busyId === goal.id;

            return (
              <div
                key={goal.id}
                className={
                  "rounded-xl border p-4 " +
                  (onAir ? "border-primary/60 bg-primary/5" : "border-border")
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Flag className="h-4 w-4 text-muted-foreground" />
                  <input
                    defaultValue={goal.label}
                    onBlur={(e) => {
                      if (e.target.value !== goal.label) {
                        void save({ id: goal.id, label: e.target.value });
                      }
                    }}
                    className="min-w-[10rem] flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-semibold"
                  />
                  {onAir && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                      On air
                    </span>
                  )}
                  <button
                    onClick={() => void remove(goal.id)}
                    disabled={busy}
                    className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
                    aria-label={"Delete " + goal.label}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="text-xs">
                    <span className="mb-1 block text-muted-foreground">Source</span>
                    <select
                      value={goal.source}
                      onChange={(e) => void save({ id: goal.id, source: e.target.value })}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    >
                      {SOURCES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs">
                    <span className="mb-1 block text-muted-foreground">Target</span>
                    <input
                      type="number"
                      min={1}
                      defaultValue={goal.target}
                      onBlur={(e) => {
                        if (Number(e.target.value) !== goal.target) {
                          void save({ id: goal.id, target: Number(e.target.value) });
                        }
                      }}
                      className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>

                  <label className="text-xs">
                    <span className="mb-1 block text-muted-foreground">
                      {goal.source === "manual" ? "Current" : "Last known"}
                    </span>
                    <input
                      type="number"
                      min={0}
                      defaultValue={goal.currentValue}
                      // A computed source overwrites this on every poll, so
                      // letting staff type into it would look like the console
                      // was ignoring them.
                      disabled={goal.source !== "manual" && countable}
                      onBlur={(e) => {
                        if (Number(e.target.value) !== goal.currentValue) {
                          void save({ id: goal.id, current_value: Number(e.target.value) });
                        }
                      }}
                      className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                    />
                  </label>

                  <label className="text-xs">
                    <span className="mb-1 block text-muted-foreground">Accent</span>
                    <input
                      type="color"
                      defaultValue={goal.accentColor}
                      onBlur={(e) => void save({ id: goal.id, accent_color: e.target.value })}
                      className="h-8 w-12 rounded border border-border bg-background"
                    />
                  </label>

                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={goal.isActive}
                      onChange={(e) => void save({ id: goal.id, is_active: e.target.checked })}
                    />
                    <span>Switched on</span>
                  </label>
                </div>

                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: progress.percent + "%", background: progress.accentColor }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {progress.current.toLocaleString()} / {progress.target.toLocaleString()} ·{" "}
                    {progress.percent}%
                    {progress.complete
                      ? " · met"
                      : " · " + progress.remaining.toLocaleString() + " to go"}
                  </p>
                  {!countable && (
                    // Said plainly, because a bar that never moves reads as a
                    // broken overlay rather than an unfinished integration.
                    <p className="mt-1.5 text-xs text-amber-500">
                      {connected
                        ? "Platforms are connected, but Tank does not fetch follower counts yet. This bar holds the number above — type it in, or switch the source to Manual."
                        : "No platform is connected, so this cannot count followers. It holds the number above until one is — or switch it to Manual."}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Browser source: <code className="rounded bg-muted px-1.5 py-0.5">/obs/goal</code> at
        1920×1080. Position and colours live in Overlay Workshop → Stream Goal. Switching a goal off
        here empties the overlay — nothing to remove in OBS.
      </p>
    </Panel>
  );
}

export default GoalsAdminPanel;
