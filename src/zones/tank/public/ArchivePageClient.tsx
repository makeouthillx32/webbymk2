"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock, X } from "lucide-react";
import { ACTIVE_THEME } from "../theme";

// Archives browser: season → room → date → footage.
//
// URL is the source of truth (?season=s01&room=bedroom-1&date=YYYY-MM-DD) so a
// day is linkable and the back button works. `date` is optional; season and
// room alone are a valid, shareable state.

type SeasonOption = { slug: string; name: string };
type RoomOption = { slug: string; name: string };
type ArchiveDay = {
  date: string;
  hasFootage: boolean;
  segmentCount: number;
  totalSeconds: number;
  isComplete: boolean;
  isStreamable: boolean;
};
type Segment = {
  id: string;
  segmentStart: string;
  durationSeconds: number;
  tier: "hot" | "cold" | "expired";
  playbackUrl: string | null;
};

type BrowseResponse = {
  success: boolean;
  isMember: boolean;
  seasons: SeasonOption[];
  rooms: RoomOption[];
  days: ArchiveDay[];
  segments: Segment[];
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function formatDayChip(iso: string): { month: string; day: string } {
  const [, m, d] = iso.split("-");
  return { month: MONTHS[Number(m) - 1] ?? "", day: d ?? "" };
}


function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h >= 1) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${Math.max(1, m)}m`;
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Dropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { slug: string; name: string }[];
  onChange: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const current = options.find((o) => o.slug === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="min-w-[150px] rounded-md border-2 border-black/60 bg-[#1c1f26] px-3 py-2 text-left text-sm font-bold text-white shadow-inner"
      >
        {current?.name ?? label}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1 max-h-72 w-full min-w-[180px] overflow-y-auto rounded-md border border-black/60 bg-[#23262e] shadow-2xl">
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">Nothing available</p>
          )}
          {options.map((o) => (
            <button
              key={o.slug}
              type="button"
              onClick={() => {
                onChange(o.slug);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-white/10 ${
                o.slug === value ? "font-bold text-white" : "text-slate-400"
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ArchivePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const season = searchParams.get("season") || "";
  const room = searchParams.get("room") || "";
  const date = searchParams.get("date") || "";

  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const stripRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const setParams = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      router.replace(`/archives?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);

    const qs = new URLSearchParams();
    if (season) qs.set("season", season);
    if (room) qs.set("room", room);
    if (date) qs.set("date", date);

    fetch(`/api/tank/archive/browse?${qs.toString()}`)
      .then((r) => r.json())
      .then((json: BrowseResponse) => {
        if (!active) return;
        setData(json);
        setActiveIndex(0);

        // The server resolves defaults (newest season, first room). Reflect
        // that back into the URL so the address bar always describes exactly
        // what is on screen and the state stays shareable.
        const resolvedSeason = season || json.seasons?.[json.seasons.length - 1]?.slug;
        const resolvedRoom = room || json.rooms?.[0]?.slug;
        if ((resolvedSeason && !season) || (resolvedRoom && !room)) {
          setParams({ season: resolvedSeason ?? null, room: resolvedRoom ?? null });
        }
      })
      .catch(() => active && setData(null))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
    // setParams intentionally omitted — it changes identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, room, date]);

  const playable = useMemo(
    () => (data?.segments ?? []).filter((s) => s.playbackUrl),
    [data?.segments],
  );

  const activeSegment = playable[activeIndex] ?? null;

  // A day is many segments, so play them as one continuous recording: when one
  // ends, roll straight into the next instead of stopping every 10 minutes.
  const handleEnded = useCallback(() => {
    setActiveIndex((i) => (i + 1 < playable.length ? i + 1 : i));
  }, [playable.length]);

  useEffect(() => {
    const v = videoRef.current;
    if (v && activeSegment) void v.play().catch(() => {});
  }, [activeSegment?.id]);

  const scrollStrip = (direction: -1 | 1) => {
    stripRef.current?.scrollBy({ left: direction * 400, behavior: "smooth" });
  };

  const days = data?.days ?? [];
  const isMember = data?.isMember ?? false;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#8fa08a] p-3 sm:p-5" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
      <div className="mx-auto max-w-[1600px] overflow-hidden rounded-lg border border-black/30 bg-[#f4f2ea] shadow-2xl">
        {/* Header: title + season/room pickers + close */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/15 px-4 py-3">
          <h1 className="text-lg font-black tracking-tight text-[#241f14]">Archives</h1>

          <div className="flex items-center gap-2">
            <Dropdown
              label="Season"
              value={season}
              options={data?.seasons ?? []}
              onChange={(slug) => setParams({ season: slug, date: null })}
            />
            <Dropdown
              label="Room"
              value={room}
              options={data?.rooms ?? []}
              onChange={(slug) => setParams({ room: slug, date: null })}
            />
            <a
              href="/"
              aria-label="Close archives"
              className="grid h-9 w-9 place-items-center rounded-md border-2 border-black/50 bg-[#f26d4b] text-white shadow-sm transition hover:bg-[#e05430]"
            >
              <X className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Date strip */}
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            aria-label="Earlier dates"
            onClick={() => scrollStrip(-1)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border-2 border-black/40 bg-[#4aa3e0] text-white shadow-sm"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 rounded-md border border-black/20 bg-[#8a8874] p-2">
            <p className="pb-1 text-center text-sm font-bold text-white/90">
              {date ? new Date(date).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }) : "Select a date"}
            </p>
            <div ref={stripRef} className="flex gap-1.5 overflow-x-auto pb-1">
              {days.length === 0 && !loading && (
                <p className="w-full py-2 text-center text-xs text-white/70">
                  No dates for this season yet.
                </p>
              )}
              {days.map((d) => {
                const { month, day } = formatDayChip(d.date);
                const selected = d.date === date;
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={!d.hasFootage}
                    title={
                      d.hasFootage
                        ? `${formatDuration(d.totalSeconds)} across ${d.segmentCount} recordings${d.isComplete ? "" : " — still recording"}`
                        : "No footage"
                    }
                    onClick={() => setParams({ date: d.date })}
                    className={`flex w-[52px] shrink-0 flex-col items-center rounded border px-1 py-0.5 transition ${
                      selected
                        ? "border-black/60 bg-[#f26d4b] text-white"
                        : d.hasFootage
                          ? "border-black/30 bg-white text-[#241f14] hover:bg-[#ffe9c9]"
                          : "cursor-not-allowed border-black/10 bg-white/35 text-[#241f14]/35"
                    }`}
                  >
                    <span className="text-[9px] font-bold leading-tight">{month}</span>
                    <span className="text-sm font-black leading-tight">{day}</span>
                    {d.hasFootage && (
                      <span className="text-[8px] font-bold leading-tight opacity-70">
                        {d.isComplete ? formatDuration(d.totalSeconds) : "REC"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            aria-label="Later dates"
            onClick={() => scrollStrip(1)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border-2 border-black/40 bg-[#4aa3e0] text-white shadow-sm"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Player */}
        <div className="px-4 pb-4">
          <div className="rounded-md border border-black/20 bg-[#8a8874] p-4 sm:p-8">
            <div className="relative mx-auto aspect-video w-full max-w-5xl overflow-hidden rounded-xl border border-black/60 bg-black shadow-2xl">
              {activeSegment?.playbackUrl ? (
                <video
                  ref={videoRef}
                  key={activeSegment.id}
                  src={activeSegment.playbackUrl}
                  className="h-full w-full object-contain"
                  controls
                  autoPlay
                  playsInline
                  onEnded={handleEnded}
                />
              ) : (
                <div className="grid h-full w-full place-items-center px-6 text-center">
                  {loading ? (
                    <p className="text-sm text-white/60">Loading archives…</p>
                  ) : !isMember ? (
                    // Footage is members-only and RLS enforces it server-side;
                    // this is the human-readable version of that same rule.
                    <div className="flex flex-col items-center gap-2 text-white/80">
                      <Lock className="h-6 w-6" />
                      <p className="text-sm font-bold">Archives are for members</p>
                      <a
                        href="https://www.unenter.live/sign-in?next=https%3A%2F%2Ftank.unenter.live%2Farchives"
                        className="mt-1 rounded bg-[#f26d4b] px-3 py-1 text-xs font-black uppercase text-white"
                      >
                        Sign in
                      </a>
                    </div>
                  ) : date && playable.length === 0 ? (
                    <p className="text-sm text-white/70">No footage recorded for this day.</p>
                  ) : (
                    <p className="text-lg text-white/70">Select a season, room, and date…</p>
                  )}
                </div>
              )}
            </div>

            {/* Segment rail — the day broken into its recordings */}
            {playable.length > 0 && (
              <div className="mx-auto mt-3 flex max-w-5xl flex-wrap gap-1.5">
                {playable.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    className={`rounded border px-2 py-1 text-[11px] font-bold transition ${
                      i === activeIndex
                        ? "border-black/60 bg-[#f26d4b] text-white"
                        : "border-black/25 bg-white/85 text-[#241f14] hover:bg-white"
                    }`}
                  >
                    {formatClock(s.segmentStart)}
                  </button>
                ))}
              </div>
            )}

            {/* Cold segments exist but cannot stream from Supabase — say so
                rather than silently showing a shorter day. */}
            {isMember && date && (data?.segments.length ?? 0) > playable.length && (
              <p className="mx-auto mt-2 max-w-5xl text-center text-[11px] text-white/70">
                {(data!.segments.length - playable.length)} recording(s) from this day have been
                moved to cold storage and are not streamable here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ArchivePageClient;
