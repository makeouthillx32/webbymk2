"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  X,
  Clock,
  Video,
  Smartphone,
  Radio,
  Tv,
  Film,
  CheckCircle2,
} from "lucide-react";
import { ACTIVE_THEME } from "../theme";

// Archives browser: Days → Rooms on Day → Footage.
//
// URL is the source of truth (?season=s01&date=YYYY-MM-DD&room=slug) so a day
// and specific room recording are directly linkable and shareable.

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

type DayRoomFootage = {
  slug: string;
  name: string;
  kind: "fixed-247" | "irl" | "user-stream";
  kindLabel: string;
  segmentCount: number;
  totalSeconds: number;
  formattedDuration: string;
  activeWindow: string;
  is24Hour: boolean;
  hasMasterArchive: boolean;
  isRecordingLive?: boolean;
};

type Segment = {
  id: string;
  segmentStart: string;
  durationSeconds: number;
  tier: "hot" | "cold" | "expired";
  playbackUrl: string | null;
  codec?: "h264" | "av1";
};

type BrowseResponse = {
  success: boolean;
  isMember: boolean;
  seasons: SeasonOption[];
  rooms: RoomOption[];
  days: ArchiveDay[];
  selectedDate: string | null;
  roomsOnDay: DayRoomFootage[];
  selectedRoom: string | null;
  segments: Segment[];
};

const ARCHIVE_PUBLIC_DAYS = 5;

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

function formatDayChip(iso: string): { month: string; day: string } {
  const [, m, d] = iso.split("-");
  return { month: MONTHS[Number(m) - 1] ?? "", day: d ?? "" };
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0m";
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

function canPlayAv1(): boolean {
  if (typeof document === "undefined") return true;
  const v = document.createElement("video");
  return v.canPlayType('video/mp4; codecs="av01.0.05M.08"') !== "";
}

export function ArchivePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const season = searchParams.get("season") || "";
  const date = searchParams.get("date") || "";
  const room = searchParams.get("room") || "";

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
    if (date) qs.set("date", date);
    if (room) qs.set("room", room);

    fetch(`/api/tank/archive/browse?${qs.toString()}`)
      .then((r) => r.json())
      .then((json: BrowseResponse) => {
        if (!active) return;
        setData(json);
        setActiveIndex(0);

        const resolvedSeason = season || json.seasons?.[json.seasons.length - 1]?.slug;
        const resolvedDate = date || json.selectedDate;
        const resolvedRoom = room || json.selectedRoom;

        if (
          (resolvedSeason && !season) ||
          (resolvedDate && !date) ||
          (resolvedRoom && !room)
        ) {
          setParams({
            season: resolvedSeason ?? null,
            date: resolvedDate ?? null,
            room: resolvedRoom ?? null,
          });
        }
      })
      .catch(() => active && setData(null))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [season, date, room, setParams]);

  const playable = useMemo(
    () => (data?.segments ?? []).filter((s) => s.playbackUrl),
    [data?.segments],
  );

  const activeSegment = playable[activeIndex] ?? null;

  const av1Supported = useMemo(() => canPlayAv1(), []);
  const viewingAv1 = (data?.segments ?? []).some((x) => x.codec === "av1");

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
  const roomsOnDay = data?.roomsOnDay ?? [];
  const activeDate = date || data?.selectedDate || "";
  const activeRoomSlug = room || data?.selectedRoom || "";
  const activeRoom = roomsOnDay.find((r) => r.slug === activeRoomSlug) ?? roomsOnDay[0] ?? null;
  const isMember = data?.isMember ?? false;

  const activeDateFormatted = activeDate
    ? new Date(activeDate + "T00:00:00").toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Select a Broadcast Day";

  return (
    <div
      className="min-h-screen min-h-[100dvh] bg-[#8fa08a] p-3 sm:p-5"
      style={{ fontFamily: ACTIVE_THEME.fonts.label }}
    >
      <div className="mx-auto max-w-[1600px] overflow-hidden rounded-lg border border-black/30 bg-[#f4f2ea] shadow-2xl">
        {/* Header: Title + Season Picker + Return to Live Stream */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/15 px-4 py-3 bg-[#e8e6dc]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            <div>
              <h1 className="text-lg font-black tracking-tight text-[#241f14]">
                ARCHIVES // 24H MASTER VAULT
              </h1>
              <p className="text-[11px] font-bold text-[#4c4630]">
                Continuous 24h House Recordings & Session Streams
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Dropdown
              label="Season"
              value={season}
              options={data?.seasons ?? []}
              onChange={(slug) => setParams({ season: slug, date: null, room: null })}
            />
            <a
              href="/"
              aria-label="Back to Live Stream"
              title="Back to Live Stream"
              className="inline-flex items-center gap-1.5 rounded-md border-2 border-black/50 bg-[#f26d4b] px-3 py-2 text-xs font-black uppercase text-white shadow-sm transition hover:bg-[#e05430]"
            >
              <X className="h-4 w-4" />
              <span>Live Feed</span>
            </a>
          </div>
        </div>

        {/* Step 1: The Days Timeline */}
        <div className="flex items-center gap-2 border-b border-black/15 bg-[#8a8874] px-4 py-3">
          <button
            type="button"
            aria-label="Earlier dates"
            onClick={() => scrollStrip(-1)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border-2 border-black/40 bg-[#4aa3e0] text-white shadow-sm transition hover:bg-[#3b8ec6]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 rounded-md border border-black/30 bg-[#757361] p-2">
            <div className="flex items-center justify-between pb-1.5 px-1">
              <span className="text-xs font-black uppercase tracking-wider text-white/90">
                1. Select Broadcast Day
              </span>
              <span className="text-[11px] font-bold text-amber-200 truncate">
                {activeDateFormatted}
              </span>
            </div>

            <div ref={stripRef} className="flex gap-2 overflow-x-auto pb-1">
              {days.length === 0 && !loading && (
                <p className="w-full py-2 text-center text-xs text-white/70">
                  No recorded days found for this season.
                </p>
              )}
              {days.map((d) => {
                const { month, day } = formatDayChip(d.date);
                const selected = d.date === activeDate;
                const isToday = d.date === new Date().toISOString().slice(0, 10);

                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={!d.hasFootage}
                    title={
                      d.hasFootage
                        ? `${formatDuration(d.totalSeconds)} recorded footage across cameras${
                            d.isComplete ? "" : " (accumulating live)"
                          }`
                        : "No footage recorded"
                    }
                    onClick={() => setParams({ date: d.date, room: null })}
                    className={`flex w-[58px] shrink-0 flex-col items-center rounded-md border px-1.5 py-1 transition ${
                      selected
                        ? "border-black/80 bg-[#f26d4b] text-white shadow-md ring-2 ring-white/50"
                        : d.hasFootage
                          ? "border-black/30 bg-white text-[#241f14] hover:bg-[#ffe9c9]"
                          : "cursor-not-allowed border-black/10 bg-white/25 text-white/40"
                    }`}
                  >
                    <span className="text-[9px] font-bold leading-tight uppercase">{month}</span>
                    <span className="text-base font-black leading-tight">{day}</span>
                    {d.hasFootage && (
                      <span
                        className={`mt-0.5 rounded px-1 text-[8px] font-black leading-tight ${
                          selected
                            ? "bg-black/30 text-white"
                            : isToday
                              ? "bg-red-500 text-white animate-pulse"
                              : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {isToday ? "REC" : "24H"}
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
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border-2 border-black/40 bg-[#4aa3e0] text-white shadow-sm transition hover:bg-[#3b8ec6]"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Step 2: Active Broadcast Rooms on Selected Day */}
        <div className="border-b border-black/15 bg-[#e4e1d3] px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-[#241f14]" />
              <h2 className="text-xs font-black uppercase tracking-wider text-[#241f14]">
                2. Available Camera Feeds for {activeDateFormatted}
              </h2>
              <span className="rounded bg-black/10 px-2 py-0.5 text-[10px] font-bold text-[#4c4630]">
                {roomsOnDay.length} {roomsOnDay.length === 1 ? "room recorded" : "rooms recorded"}
              </span>
            </div>
            <span className="text-[11px] font-bold text-[#4c4630]">
              Click a room to view continuous recording
            </span>
          </div>

          {roomsOnDay.length === 0 && !loading ? (
            <div className="rounded-md border border-black/15 bg-white/60 p-4 text-center text-xs font-bold text-[#4c4630]">
              No active camera sectors recorded on this date.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              {roomsOnDay.map((r) => {
                const isSelected = r.slug === activeRoomSlug;
                const is24h = r.kind === "fixed-247";
                const isIrl = r.kind === "irl";

                return (
                  <button
                    key={r.slug}
                    type="button"
                    onClick={() => setParams({ room: r.slug })}
                    className={`flex flex-col justify-between rounded-lg border p-2.5 text-left transition-all ${
                      isSelected
                        ? "border-black bg-gradient-to-b from-[#ff8a7a] to-[#ff3b2f] text-white shadow-md ring-2 ring-black/20"
                        : "border-black/20 bg-white text-[#241f14] hover:border-black/40 hover:bg-[#fff9f0] shadow-sm"
                    }`}
                  >
                    {/* Badge header */}
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                          isSelected
                            ? "bg-black/30 text-white"
                            : is24h
                              ? "bg-blue-100 text-blue-800 border border-blue-200"
                              : isIrl
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-purple-100 text-purple-800 border border-purple-200"
                        }`}
                      >
                        {r.kindLabel}
                      </span>
                      {r.hasMasterArchive && (
                        <span
                          className={`text-[9px] font-bold ${
                            isSelected ? "text-white/90" : "text-emerald-700"
                          }`}
                        >
                          ✓ Master
                        </span>
                      )}
                    </div>

                    {/* Room title & duration */}
                    <div className="mb-2">
                      <h3 className="truncate text-sm font-black tracking-tight leading-snug">
                        {r.name}
                      </h3>
                      <p
                        className={`text-[11px] font-bold ${
                          isSelected ? "text-white/90" : "text-[#4c4630]"
                        }`}
                      >
                        {r.formattedDuration}
                      </p>
                    </div>

                    {/* Time window */}
                    <div
                      className={`mt-auto flex items-center gap-1 text-[10px] font-semibold ${
                        isSelected ? "text-white/80" : "text-slate-500"
                      }`}
                    >
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="truncate">{r.activeWindow}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 3: Player View */}
        <div className="p-4 sm:p-6">
          <div className="rounded-lg border border-black/20 bg-[#7a7865] p-4 sm:p-6">
            {/* Active Feed Title Bar */}
            {activeRoom && (
              <div className="mx-auto mb-3 flex max-w-5xl flex-wrap items-center justify-between gap-2 rounded-md border border-black/40 bg-[#1c1f26] px-4 py-2 text-white shadow-inner">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                  <span className="text-sm font-black tracking-wide">{activeRoom.name}</span>
                  <span className="rounded bg-black/50 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    {activeRoom.kindLabel}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold text-slate-300">
                  <span>⏱ {activeRoom.formattedDuration}</span>
                  <span className="hidden sm:inline text-slate-500">|</span>
                  <span className="hidden sm:inline text-slate-400">
                    Window: {activeRoom.activeWindow}
                  </span>
                </div>
              </div>
            )}

            {/* Video Player */}
            <div className="relative mx-auto aspect-video w-full max-w-5xl overflow-hidden rounded-xl border-2 border-black/70 bg-black shadow-2xl">
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
                    <p className="text-sm font-mono text-white/70">Loading archives…</p>
                  ) : !isMember ? (
                    <div className="flex flex-col items-center gap-2 text-white/80">
                      <Lock className="h-6 w-6" />
                      <p className="text-sm font-bold">Archives are for members</p>
                      <a
                        href="https://auth.unenter.live/sign-in?next=https%3A%2F%2Ftank.unenter.live%2Farchives"
                        className="mt-1 rounded bg-[#f26d4b] px-3 py-1 text-xs font-black uppercase text-white"
                      >
                        Sign in
                      </a>
                    </div>
                  ) : activeDate && playable.length === 0 ? (
                    <p className="text-sm font-mono text-white/70">
                      No footage recorded for {activeRoom?.name || "this room"} on this date.
                    </p>
                  ) : (
                    <p className="text-sm font-mono text-white/70">
                      Select a date and camera feed above to begin playback.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* If 24-Hour Consolidated Master exists */}
            {activeRoom?.hasMasterArchive && (
              <div className="mx-auto mt-3 flex max-w-5xl items-center justify-between rounded border border-black/20 bg-[#1c1f26] px-3.5 py-2 text-xs text-slate-300 shadow-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="font-bold text-white">Full 24-Hour Continuous Master Recording</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  Lossless stream-copy consolidation · Seamless 24h scrubber
                </span>
              </div>
            )}

            {/* Segment rail — for today's active chunks */}
            {playable.length > 1 && (
              <div className="mx-auto mt-3 max-w-5xl rounded-md border border-black/30 bg-[#1c1f26] p-3 shadow-inner">
                <p className="pb-1.5 text-xs font-bold text-white/90">
                  Timeline Recording Segments ({playable.length} chunks):
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {playable.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveIndex(i)}
                      className={`rounded border px-2 py-1 text-[11px] font-bold transition ${
                        i === activeIndex
                          ? "border-black bg-[#f26d4b] text-white shadow-sm"
                          : "border-black/30 bg-white/90 text-[#241f14] hover:bg-white"
                      }`}
                    >
                      {formatClock(s.segmentStart)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* AV1 Hardware compatibility warning */}
            {isMember && viewingAv1 && !av1Supported && (
              <p className="mx-auto mt-3 max-w-5xl rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-[12px] text-amber-200">
                This footage format requires AV1 codec hardware. Archives older than{" "}
                {ARCHIVE_PUBLIC_DAYS} days are stored in AV1 to optimize bandwidth. Recent footage
                plays on all devices.
              </p>
            )}

            {/* Cold segments notice */}
            {isMember && activeDate && (data?.segments.length ?? 0) > playable.length && (
              <p className="mx-auto mt-2 max-w-5xl text-center text-[11px] text-white/70">
                {(data!.segments.length - playable.length)} recording(s) from this date are stored
                in cold storage.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ArchivePageClient;
