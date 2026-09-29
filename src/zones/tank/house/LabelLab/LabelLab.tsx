"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eraser, GitMerge, ImageOff, Loader2, RefreshCw, SkipForward, Sparkles, UserPlus, X, XCircle } from "lucide-react";
import { cropBadge, cycleOrder, nextCropState, type CropTarget } from "./cropCycle";
import { IdentityMap, type IdentityMapData, type MapPoint } from "./IdentityMap";
import { ArrowDownToLine, Flame, Shuffle } from "lucide-react";

// One screen for grading identity: the Housemate Labels game, fed by the live
// learner and the archive pass alike. One group is one card — every crop kept,
// its guess, and the answers: yes, someone else, a guest, the same body as
// another group, or not a sighting at all. Keys: Y, X, N, 1-9, G, arrows.
//
// It replaced the separate Identity Review workspace on 2026-09-18; two screens
// grading the same two tables disagreed about what was graded.

type LabQueue = "confident" | "unsure" | "skipped" | "named" | "rejected";
type LabClass = "person" | "cat" | "dog";
type Tile = { id: string; url: string; rejected: boolean; slug: string | null; room: string | null; at: number; preview?: boolean };
type Group = {
  key: string; cls: LabClass; queue: LabQueue; guess: string | null; guessName: string | null; sure: boolean;
  confidence: number | null; name: string | null; displayName: string; rooms: string[]; seconds: number;
  tileCount: number; tiles: Tile[]; firstSeen: string | null; lastSeen: string | null;
};
type Candidate = { key: string; displayName: string; slug: string | null; score: number; preview: string | null };
type Payload = {
  groups: Group[];
  candidates: Candidate[];
  counts: Record<LabQueue, number>;
  bulk: Array<{ slug: string; displayName: string; cls: LabClass; groups: number; crops: number }>;
  targets: Array<{ slug: string; displayName: string; cls: LabClass; guest: boolean; negative?: boolean }>;
  nextGuest: string;
  excludedHere: number;
  struckInRejected: number;
  emptyRejected: number;
  singles: number;
  retrickle: {
    status: "requested" | "running" | "done" | "failed";
    stage?: string;
    finishedAt?: string;
    result?: { singles: number; groups: number; sure: number; unsure: number };
    error?: string;
  } | null;
  learner: { active: boolean; groupsToday: number };
};

const QUEUES: Array<{ id: LabQueue; label: string; hint: string }> = [
  { id: "confident", label: "Sure", hint: "It thinks it knows. Confirm in one tap." },
  { id: "unsure", label: "Not sure", hint: "Its best guess, needs your eyes." },
  { id: "skipped", label: "Skipped", hint: "Come back to these." },
  { id: "named", label: "Named", hint: "Already graded — check for mistakes." },
  { id: "rejected", label: "Rejected", hint: "Not a real sighting." },
];

function Crop({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="grid h-full w-full place-items-center bg-slate-950 text-slate-700"><ImageOff className="h-4 w-4" /></div>;
  // Private staff endpoint, not a user-controlled remote image.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />;
}

/** Mirrors guestSlugFromName on the server; the server validates it again. */
function guestSlug(name: string): string | null {
  const slug = `guest-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
  return /^guest-((?:[1-9][0-9]{0,2})|(?:[a-z][a-z0-9-]{0,23}))$/.test(slug) ? slug : null;
}

/** Mirrors negativeSlugFromName on the server. */
function negativeSlug(name: string): string | null {
  const slug = `not-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
  return /^not-[a-z][a-z0-9-]{0,23}$/.test(slug) ? slug : null;
}

function when(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** `embedded` drops the page chrome so the House console can host it in a deck. */
export function LabelLab({ embedded = false }: { embedded?: boolean } = {}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [queue, setQueue] = useState<LabQueue>("confident");
  const [cls, setCls] = useState<LabClass | "all">("all");
  const [scope, setScope] = useState<"all" | "live" | "archive">("all");
  const [kind, setKind] = useState<"all" | "member" | "guest" | "negative">("all");
  const [who, setWho] = useState("");
  const [similar, setSimilar] = useState<{ key: string; list: Candidate[] } | null>(null);
  // By key, never by index: the quiet refresh reorders groups (newest first)
  // and an index would silently point at a different body mid-decision.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [graded, setGraded] = useState(0);
  const [guestName, setGuestName] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [mapData, setMapData] = useState<IdentityMapData | null>(null);
  // A group opened from the map stays pinned only in the view it was opened
  // into; change the queue or the person and it lets go.
  const [focus, setFocus] = useState<{ key: string; queue: LabQueue; who: string } | null>(null);
  const [notName, setNotName] = useState("");
  // Burning crops cannot be undone, so it takes two clicks and says the number.
  const [armed, setArmed] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ queue, limit: "60", scope, kind });
      if (who) params.set("who", who);
      if (focus && focus.queue === queue && focus.who === who) params.set("focus", focus.key);
      if (cls !== "all") params.set("class", cls);
      const response = await fetch(`/api/tank/labels?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
      setPayload(body);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [cls, focus, kind, queue, scope, who]);

  useEffect(() => { void load(); setSelectedKey(null); }, [load]);
  // New sightings arrive while grading; refresh quietly so the wall stays current.
  // A refresh mid-decision swaps the card out from under the operator, so it
  // waits while they are typing a guest's name or a write is in flight.
  const jobRunning = payload?.retrickle?.status === "requested" || payload?.retrickle?.status === "running";
  useEffect(() => {
    const timer = setInterval(() => {
      const typing = document.activeElement?.id === "label-lab-guest-name";
      if (!typing && !busyRef.current) void load(true);
    }, jobRunning ? 5_000 : 60_000);
    return () => clearInterval(timer);
  }, [load, jobRunning]);

  const groups = payload?.groups ?? [];
  const index = Math.max(0, groups.findIndex((group) => group.key === selectedKey));
  const current = groups[index] ?? null;
  const step = useCallback((delta: number) => {
    setSelectedKey((key) => {
      const at = groups.findIndex((group) => group.key === key);
      const next = groups[Math.min(Math.max((at < 0 ? 0 : at) + delta, 0), groups.length - 1)];
      return next?.key ?? key;
    });
  }, [groups]);
  // Every name is offered, not just the ones matching the detector's class: a
  // dog it called a person must be nameable as the dog, which is exactly the
  // group the operator could not fix before.
  const names = useMemo(() => {
    const targets = (payload?.targets ?? []) as CropTarget[];
    if (!current) return targets;
    const fits = (target: CropTarget) => target.cls === current.cls;
    return [...targets.filter(fits), ...targets.filter((target) => !fits(target))];
  }, [payload?.targets, current]);

  useEffect(() => {
    if (!groups.length) return;
    if (!selectedKey || !groups.some((group) => group.key === selectedKey)) setSelectedKey(groups[0].key);
  }, [groups, selectedKey]);

  const act = useCallback(async (body: Record<string, unknown>, advance = true) => {
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/tank/labels", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? `HTTP ${response.status}`);
      setGraded((count) => count + (result.changed ?? 0));
      setStreak((value) => value + 1);
      setError(null);
      if (advance) step(1);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStreak(0);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [load, step]);

  const askSimilar = useCallback(async (key: string) => {
    setSimilar({ key, list: [] });
    try {
      const response = await fetch(`/api/tank/labels?similar=${encodeURIComponent(key)}&limit=1`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
      setSimilar({ key, list: body.candidates ?? [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSimilar(null);
    }
  }, []);

  const name = useCallback((slug: string) => { if (current) void act({ action: "name", keys: [current.key], slug }); }, [act, current]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (busy || !current || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (key === "y" && current.guess) name(current.guess);
      else if (key === "x") void act({ action: "reject", keys: [current.key] });
      else if (key === "n") void act({ action: "skip", keys: [current.key] });
      else if (key === "g" && current.cls === "person" && payload) name(payload.nextGuest);
      else if (key === "arrowright") step(1);
      else if (key === "arrowleft") step(-1);
      else if (/^[1-9]$/.test(key) && names[Number(key) - 1]) name(names[Number(key) - 1].slug);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, busy, current, name, names, payload, step]);

  const shownKey = useRef<string | null>(null);
  useEffect(() => {
    if (current && shownKey.current !== current.key) {
      shownKey.current = current.key;
      cardRef.current?.scrollTo({ top: 0 });
    }
  }, [current]);

  const remaining = payload ? payload.counts[queue] : 0;

  const toggleMap = useCallback(async () => {
    if (showMap) { setShowMap(false); return; }
    try {
      const response = await fetch("/api/tank/labels?map=1", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
      setMapData(body.map ?? null);
      setShowMap(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [showMap]);

  // Clicking a dot opens that sighting for grading, whatever the filters were.
  const openFromMap = useCallback((point: MapPoint) => {
    setShowMap(false);
    setQueue("named");
    setWho(point.name);
    setKind("all");
    setFocus({ key: point.key, queue: "named", who: point.name });
    setSelectedKey(point.key);
  }, []);

  const mapName = useCallback(
    (slug: string) => (payload?.targets ?? []).find((target) => target.slug === slug)?.displayName ?? slug,
    [payload?.targets],
  );
  const hiddenByFilter = !current && remaining > 0 && (cls !== "all" || scope !== "all" || kind !== "all" || Boolean(who));

  // Plain elements, never a component declared in here: a type created during
  // render is new every time, and React unmounts and rebuilds its whole subtree
  // -- which reset the crop grid's scroll and blurred the guest-name field on
  // the first keystroke.
  const body = (
    <>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-black uppercase tracking-wider">Label Lab</h1>
            <p className="mt-1 text-[11px] text-slate-400">
              Grade what the house saw. Every yes teaches the tracker who it is looking at.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-mono text-[10px] text-slate-400">{graded} graded this session{streak > 4 ? ` · ${streak} in a row` : ""}</div>
              <div className="font-mono text-[10px] text-slate-500">
                {payload?.learner.active ? "Learner watching live" : "Learner idle (AI mode off?)"} · {payload?.learner.groupsToday ?? 0} today
              </div>
            </div>
            <button type="button" onClick={() => void toggleMap()}
              className={`rounded border px-3 py-2 text-[10px] font-black uppercase ${showMap ? "border-cyan-400 bg-cyan-500/15 text-cyan-200" : "border-white/10 bg-black/40 text-slate-300 hover:text-white"}`}>
              {showMap ? "Close map" : "Identity map"}
            </button>
            <button type="button" onClick={() => void load()} disabled={loading || busy} className="grid h-9 w-9 place-items-center rounded border border-white/10 bg-black/40 text-slate-300 hover:text-white disabled:opacity-40" aria-label="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        {error ? <div className="mt-3 rounded border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-[11px] text-rose-200">{error}</div> : null}

        {showMap ? (
          <section className="mt-4">
            {mapData ? <IdentityMap data={mapData} displayName={mapName} onOpen={openFromMap} />
              : <div className="rounded-xl border border-white/10 p-6 text-center text-[11px] text-slate-500">No map yet — it is built with the gallery.</div>}
          </section>
        ) : null}

        <nav className="mt-4 flex flex-wrap gap-2">
          {QUEUES.map((item) => (
            <button key={item.id} type="button" onClick={() => setQueue(item.id)} title={item.hint}
              className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase transition ${queue === item.id ? "border-cyan-400 bg-cyan-500/15 text-cyan-200" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"}`}>
              {item.label} <span className="ml-1 font-mono text-[9px] text-slate-400">{payload?.counts[item.id] ?? 0}</span>
            </button>
          ))}
          <span className="mx-1 w-px bg-white/10" />
          {(["all", "live", "archive"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setScope(value)}
              title={value === "live" ? "What the cameras saw" : value === "archive" ? "Older groups from the archive pass" : "Everything"}
              className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase transition ${scope === value ? "border-white/40 bg-white/10 text-white" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"}`}>
              {value === "all" ? "Any source" : value === "live" ? "Live" : "Archive"}
            </button>
          ))}
          <span className="mx-1 w-px bg-white/10" />
          {/* Whose groups to show: everyone, a whole category, or one person. */}
          <select value={who || kind} aria-label="Whose groups to show"
            onChange={(event) => {
              const value = event.target.value;
              if (value === "all" || value === "member" || value === "guest" || value === "negative") { setKind(value); setWho(""); }
              else { setWho(value); setKind("all"); }
            }}
            className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase focus:outline-none ${who || kind !== "all" ? "border-amber-400/70 bg-amber-500/15 text-amber-200" : "border-white/10 bg-white/[0.03] text-slate-300"}`}>
            <option value="all">Anyone</option>
            <option value="member">Housemates</option>
            <option value="guest">Guests</option>
            <option value="negative">Not people</option>
            {(payload?.targets ?? []).map((target) => (
              <option key={target.slug} value={target.slug}>{target.displayName}</option>
            ))}
          </select>
          <span className="mx-1 w-px bg-white/10" />
          {(["all", "person", "dog", "cat"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setCls(value)}
              className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase transition ${cls === value ? "border-white/40 bg-white/10 text-white" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"}`}>
              {value === "all" ? "Everyone" : value === "person" ? "People" : value === "dog" ? "Dogs" : "Cats"}
            </button>
          ))}
        </nav>

        {queue === "unsure" && ((payload?.singles ?? 0) > 0 || payload?.retrickle) ? (
          <section className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-500/25 bg-violet-950/15 p-3">
            <div className="text-[10px] text-slate-400">
              <div>
                <span className="font-black text-violet-200">{payload?.singles ?? 0} single-image cards.</span>{" "}
                Re-trickle rebuilds the gallery from your named data, groups look-alike singles back into sightings, and guesses each one —
                confident groups move to Sure, where Yes to all works.
              </div>
              {payload?.retrickle ? (
                <div className="mt-1 font-mono text-[9px]">
                  {payload.retrickle.status === "requested" ? "Asked the learner — waiting for it to pick up (up to 30s)…"
                    : payload.retrickle.status === "running" ? `Working: ${payload.retrickle.stage ?? "…"}`
                    : payload.retrickle.status === "failed" ? <span className="text-rose-300">Failed: {payload.retrickle.error}</span>
                    : payload.retrickle.result
                      ? `Last run: ${payload.retrickle.result.singles} singles → ${payload.retrickle.result.groups} groups (${payload.retrickle.result.sure} sure, ${payload.retrickle.result.unsure} not sure)`
                      : "Last run finished."}
                </div>
              ) : null}
            </div>
            <button type="button" disabled={busy || jobRunning || !(payload?.singles ?? 0)}
              onClick={() => void act({ action: "retrickle" }, false)}
              className="flex items-center gap-1.5 rounded-lg border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 text-[10px] font-black uppercase text-violet-200 hover:bg-violet-500/30 disabled:opacity-50">
              {jobRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />} Re-trickle singles
            </button>
          </section>
        ) : null}

        {queue !== "rejected" && (payload?.excludedHere ?? 0) > 0 ? (
          <section className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/25 bg-sky-950/15 p-3">
            <p className="text-[10px] text-slate-400">
              Struck crops in this view go to <span className="font-black text-sky-200">Not sure</span> as single images, one card each, ready to regrade.
              Applies to every group matching your filters, not just the ones on screen.
            </p>
            {armed === "drop-struck" ? (
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy}
                  onClick={() => {
                    setArmed(null);
                    void act({ action: "drop-struck", filter: { queue, cls: cls === "all" ? undefined : cls, scope, kind, who: who || undefined } }, false);
                  }}
                  className="rounded-lg border border-sky-400 bg-sky-600/30 px-4 py-2.5 text-[10px] font-black uppercase text-white hover:bg-sky-600/50 disabled:opacity-50">
                  Yes, drop them all
                </button>
                <button type="button" onClick={() => setArmed(null)}
                  className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5 text-[10px] font-black uppercase text-slate-300">Cancel</button>
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={() => setArmed("drop-struck")}
                className="flex items-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-500/15 px-4 py-2.5 text-[10px] font-black uppercase text-sky-200 hover:bg-sky-500/30 disabled:opacity-50">
                <ArrowDownToLine className="h-3.5 w-3.5" /> Drop struck to Not sure
              </button>
            )}
          </section>
        ) : null}

        {queue === "rejected" && ((payload?.struckInRejected ?? 0) > 0 || (payload?.emptyRejected ?? 0) > 0) ? (
          <section className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-rose-300"><Flame className="h-3.5 w-3.5" /> Burn struck crops</div>
                <p className="mt-1 text-[10px] text-slate-400">
                  Deletes {payload?.struckInRejected} struck crops
                  {(payload?.emptyRejected ?? 0) > 0 ? ` and ${payload?.emptyRejected} rejected groups with no crops left` : ""}
                  {" "}— the records and the pictures. There is no undo.
                </p>
              </div>
              {armed === "rejected-queue" ? (
                <div className="flex items-center gap-2">
                  <button type="button" disabled={busy}
                    onClick={() => { setArmed(null); void act({ action: "purge-struck", scope: "rejected-queue" }, false); }}
                    className="rounded-lg border border-rose-400 bg-rose-600/40 px-4 py-2.5 text-[10px] font-black uppercase text-white hover:bg-rose-600/60 disabled:opacity-50">
                    Burn {(payload?.struckInRejected ?? 0) + (payload?.emptyRejected ?? 0)} items — permanently
                  </button>
                  <button type="button" onClick={() => setArmed(null)}
                    className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5 text-[10px] font-black uppercase text-slate-300">Cancel</button>
                </div>
              ) : (
                <button type="button" disabled={busy} onClick={() => setArmed("rejected-queue")}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-950/40 px-4 py-2.5 text-[10px] font-black uppercase text-rose-200 hover:bg-rose-900/60 disabled:opacity-50">
                  <Flame className="h-3.5 w-3.5" /> Burn all struck
                </button>
              )}
            </div>
          </section>
        ) : null}

        {queue === "confident" && payload?.bulk.length ? (
          <section className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-300"><Sparkles className="h-3.5 w-3.5" /> Accept a whole name at once</div>
            <div className="flex flex-wrap gap-2">
              {payload.bulk.map((entry) => (
                <button key={entry.slug} type="button" disabled={busy}
                  onClick={() => void act({ action: "accept-confident", slug: entry.slug }, false)}
                  className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-[10px] font-black uppercase text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50">
                  Yes to all {entry.displayName} <span className="font-mono text-[9px] text-emerald-300/80">{entry.groups} groups · {entry.crops} crops</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {loading ? (
          <div className="mt-10 grid place-items-center text-cyan-300"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !current ? (
          <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.02] p-10 text-center">
            {/* An empty queue usually means a filter is hiding it, not that the
                work is done: the counts on the tabs ignore the class filter. */}
            {hiddenByFilter ? (
              <>
                <div className="text-sm font-black uppercase text-amber-300">Hidden by a filter</div>
                <p className="mx-auto mt-2 max-w-md text-[11px] text-slate-400">
                  {remaining} in this queue, but none match the filters you have on
                  {cls !== "all" ? ` · ${cls === "person" ? "people" : cls === "dog" ? "dogs" : "cats"}` : ""}
                  {who ? ` · ${(payload?.targets ?? []).find((target) => target.slug === who)?.displayName ?? who}` : kind !== "all" ? ` · ${kind === "guest" ? "guests" : kind === "negative" ? "not people" : "housemates"}` : ""}
                  {scope !== "all" ? ` · ${scope === "live" ? "live" : "archive"}` : ""}.
                </p>
                <button type="button" onClick={() => { setCls("all"); setScope("all"); setKind("all"); setWho(""); }}
                  className="mt-3 rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-4 py-2 text-[10px] font-black uppercase text-cyan-200 hover:bg-cyan-500/30">
                  Show all {remaining}
                </button>
              </>
            ) : (
              <>
                <div className="text-sm font-black uppercase text-slate-300">Nothing here</div>
                <p className="mx-auto mt-2 max-w-md text-[11px] text-slate-500">
                  {queue === "confident" || queue === "unsure"
                    ? "Everything is graded. New sightings land here while the director is in AI mode."
                    : "This queue is empty."}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="font-mono text-[10px] text-slate-500">
                {groups.length ? index + 1 : 0} of {groups.length} shown · {remaining} in this queue
              </div>
              <div className="font-mono text-[9px] text-slate-600">Y yes · 1-9 name · G unnamed guest · X reject · N skip · ← →</div>
            </div>

            <section ref={cardRef} className="mt-2 max-h-[62vh] overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-black uppercase text-white">
                  {current.name ? current.displayName : current.guessName ? `${current.guessName}${current.sure ? "" : " ?"}` : `Unknown ${current.cls}`}
                </h2>
                <div className="font-mono text-[10px] text-slate-500">
                  {current.rooms.join(", ") || "unknown room"} · {when(current.firstSeen)} · {current.seconds}s · {current.tileCount} crops
                  {current.confidence !== null ? ` · ${Math.round(current.confidence * 100)}% match` : ""}
                  <div className="mt-0.5 text-[9px] text-slate-600">
                    Click a crop to strike it; click again to hand it to {cycleOrder(names)[0]?.displayName ?? "someone else"}, then the next name, then back to this group.
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
                {current.tiles.map((tile) => {
                  if (tile.preview) {
                    return (
                      <div key={tile.id} title="This group has no crops left — only its preview picture. Reject it, then Burn to remove it."
                        className="relative aspect-[3/4] overflow-hidden rounded border border-dashed border-white/20 opacity-70">
                        <Crop src={tile.url} alt="Preview of an empty group" />
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/75 px-1 py-0.5 text-center text-[7px] font-black uppercase text-slate-300">preview only</span>
                      </div>
                    );
                  }
                  const state = { rejected: tile.rejected, slug: tile.slug };
                  const badge = cropBadge(state, names);
                  const next = nextCropState(state, names);
                  const nextLabel = next.rejected ? "strike it" : next.slug ? `give it to ${cropBadge(next, names)}` : "give it back to this group";
                  return (
                    <button key={tile.id} type="button" title={`Click to ${nextLabel}`}
                      onClick={() => void act({ action: "set-crop", sampleId: tile.id, rejected: next.rejected, slug: next.slug }, false)}
                      className={`relative aspect-[3/4] overflow-hidden rounded border transition ${tile.rejected ? "border-rose-500/70 opacity-50" : badge ? "border-amber-400/70" : "border-white/10 hover:border-cyan-400/60"}`}>
                      <Crop src={tile.url} alt="Crop from this sighting" />
                      {tile.rejected ? <span className="pointer-events-none absolute inset-0 grid place-items-center"><span className="h-0.5 w-[140%] rotate-[-28deg] bg-rose-500" /></span> : null}
                      {badge ? <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-amber-500/85 px-1 py-0.5 text-[7px] font-black uppercase text-black">{badge}</span> : null}
                    </button>
                  );
                })}
              </div>
              {current.tileCount > current.tiles.length ? (
                <div className="mt-2 font-mono text-[9px] text-slate-600">Showing {current.tiles.length} of {current.tileCount} crops</div>
              ) : null}
            </section>

            {similar?.key === current.key ? (
              <section className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-300">
                  <GitMerge className="h-3.5 w-3.5" /> Is this the same body?
                </div>
                {!similar.list.length ? (
                  <div className="text-[10px] text-slate-500">No look-alikes found.</div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {similar.list.map((candidate) => (
                      <article key={candidate.key} className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
                        <div className="h-28 bg-slate-950">{candidate.preview ? <Crop src={candidate.preview} alt={candidate.displayName} /> : null}</div>
                        <div className="p-2">
                          <div className="truncate text-[9px] font-black uppercase text-white">{candidate.displayName}</div>
                          <div className="mt-0.5 font-mono text-[8px] text-slate-500">{Math.round(candidate.score * 100)}% alike</div>
                          <div className="mt-2 grid grid-cols-2 gap-1">
                            <button type="button" disabled={busy}
                              onClick={() => { setSimilar(null); void act({ action: "same-identity", key: current.key, candidateKey: candidate.key }); }}
                              className="rounded bg-emerald-600/25 px-2 py-1.5 text-[8px] font-black text-emerald-200 hover:bg-emerald-600/40 disabled:opacity-40">SAME</button>
                            <button type="button" disabled={busy}
                              onClick={() => void act({ action: "different-identity", key: current.key, candidateKey: candidate.key }, false).then(() => askSimilar(current.key))}
                              className="rounded bg-rose-600/20 px-2 py-1.5 text-[8px] font-black text-rose-200 hover:bg-rose-600/35 disabled:opacity-40">DIFFERENT</button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            <section className="mt-3 flex flex-wrap items-center gap-2">
              {current.guess ? (
                <button type="button" disabled={busy} onClick={() => name(current.guess!)}
                  className="flex items-center gap-2 rounded-lg border border-emerald-400/60 bg-emerald-500/20 px-4 py-2.5 text-xs font-black uppercase text-emerald-100 hover:bg-emerald-500/35 disabled:opacity-50">
                  <Check className="h-4 w-4" /> Yes, it&apos;s {current.guessName}
                </button>
              ) : null}
              {names.map((target, index) => (
                <button key={target.slug} type="button" disabled={busy} onClick={() => name(target.slug)}
                  className={`rounded-lg border px-3 py-2.5 text-[10px] font-black uppercase transition disabled:opacity-50 ${current.name === target.slug ? "border-emerald-400 bg-emerald-500/20 text-emerald-200" : "border-white/15 bg-white/[0.04] text-slate-300 hover:border-cyan-400/50 hover:text-white"}`}>
                  {index < 9 ? <span className="mr-1 font-mono text-[9px] text-slate-500">{index + 1}</span> : null}{target.displayName}
                </button>
              ))}
              {current.cls === "person" ? (
                <form
                  className="flex items-center gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const slug = guestSlug(guestName);
                    if (slug) { setGuestName(""); name(slug); }
                  }}>
                  <input value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Guest's name"
                    id="label-lab-guest-name" aria-label="Name this guest"
                    className="w-32 rounded-lg border border-white/15 bg-black/40 px-2.5 py-2.5 text-[10px] font-black uppercase text-white placeholder:text-slate-600 focus:border-sky-400/60 focus:outline-none" />
                  <button type="submit" disabled={busy || !guestSlug(guestName)}
                    className="rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-2.5 text-[10px] font-black uppercase text-sky-200 hover:bg-sky-500/30 disabled:opacity-40">
                    Add guest
                  </button>
                </form>
              ) : null}
              <form
                className="flex items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const slug = negativeSlug(notName);
                  if (slug) { setNotName(""); name(slug); }
                }}>
                <input value={notName} onChange={(event) => setNotName(event.target.value)} placeholder="Not a person…"
                  id="label-lab-negative-name" aria-label="What is this really?"
                  className="w-36 rounded-lg border border-white/15 bg-black/40 px-2.5 py-2.5 text-[10px] font-black uppercase text-white placeholder:text-slate-600 focus:border-slate-400/60 focus:outline-none" />
                <button type="submit" disabled={busy || !negativeSlug(notName)}
                  className="rounded-lg border border-slate-400/40 bg-slate-700/30 px-3 py-2.5 text-[10px] font-black uppercase text-slate-200 hover:bg-slate-700/50 disabled:opacity-40">
                  Not a person
                </button>
              </form>
              {current.cls === "person" && payload ? (
                <button type="button" disabled={busy} onClick={() => name(payload.nextGuest)}
                  className="flex items-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-2.5 text-[10px] font-black uppercase text-sky-200 hover:bg-sky-500/30 disabled:opacity-50">
                  <UserPlus className="h-3.5 w-3.5" /> Unnamed guest
                </button>
              ) : null}
              {/* Crop-wide strikes live with the group's other buttons: below the
                  grid they sat under 24 crops inside a scrolling panel, where the
                  operator could not find them at all. */}
              {current.tiles.some((tile) => tile.rejected) || queue === "rejected" ? (
                <button type="button" disabled={busy} onClick={() => void act({ action: "crops", key: current.key, mode: "include-all" }, false)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5 text-[10px] font-black uppercase text-slate-300 hover:text-white disabled:opacity-50">
                  <Eraser className="h-3.5 w-3.5" /> Un-strike all
                </button>
              ) : null}
              {queue === "rejected" ? (
                // Only here: striking every crop of a good sighting would throw
                // away the best training data in the house by accident.
                <button type="button" disabled={busy} onClick={() => void act({ action: "crops", key: current.key, mode: "exclude-all" }, false)}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-950/40 px-3 py-2.5 text-[10px] font-black uppercase text-rose-200 hover:bg-rose-900/60 disabled:opacity-50">
                  <XCircle className="h-3.5 w-3.5" /> Strike all
                </button>
              ) : null}
              <span className="flex-1" />
              <button type="button" disabled={busy} onClick={() => void askSimilar(current.key)}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5 text-[10px] font-black uppercase text-slate-300 hover:text-white disabled:opacity-50">
                <GitMerge className="h-3.5 w-3.5" /> Same as…
              </button>
              <button type="button" disabled={busy} onClick={() => void act({ action: "skip", keys: [current.key] })}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5 text-[10px] font-black uppercase text-slate-300 hover:text-white disabled:opacity-50">
                <SkipForward className="h-3.5 w-3.5" /> Skip
              </button>
              <button type="button" disabled={busy} onClick={() => void act({ action: current.queue === "rejected" ? "restore" : "reject", keys: [current.key] })}
                className="flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-950/40 px-3 py-2.5 text-[10px] font-black uppercase text-rose-200 hover:bg-rose-900/60 disabled:opacity-50">
                <X className="h-3.5 w-3.5" /> {current.queue === "rejected" ? "Restore" : "Not a sighting"}
              </button>
            </section>

            <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-8 lg:grid-cols-12">
              {groups.map((group, index) => (
                <button key={group.key} type="button" onClick={() => setSelectedKey(group.key)}
                  className={`relative aspect-square overflow-hidden rounded border ${group.key === current.key ? "border-cyan-400" : "border-white/10 hover:border-white/30"}`}>
                  {group.tiles[0] ? <Crop src={group.tiles[0].url} alt={group.displayName} /> : <div className="h-full w-full bg-slate-900" />}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-1 py-0.5 text-[7px] font-black uppercase text-slate-200">
                    {group.name ?? group.guessName ?? "?"}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
    </>
  );

  return embedded ? (
    <section className="overflow-hidden rounded-xl border border-cyan-500/25 bg-[#0b0d12] p-4 text-white">{body}</section>
  ) : (
    <main className="min-h-screen bg-[#070910] px-4 py-5 text-white">
      <div className="mx-auto max-w-6xl">{body}</div>
    </main>
  );
}
