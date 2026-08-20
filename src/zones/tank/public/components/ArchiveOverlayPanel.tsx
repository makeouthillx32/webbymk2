"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Lock } from "lucide-react";

// The Archives section inside the live experience.
//
// Same data and same endpoint as the full /archives page — this is the compact
// view for someone who does not want to leave the stream. Where the full page
// shows every day of the season (so gaps are visible), this shows only days
// that actually have footage: in a small overlay a row of disabled chips is
// noise, and the full page is one click away for the whole timeline.

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
  seasons: { slug: string; name: string }[];
  rooms: RoomOption[];
  days: ArchiveDay[];
  segments: Segment[];
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function chipLabel(iso: string) {
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

function clock(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ArchiveOverlayPanel({ initialRoomSlug }: { initialRoomSlug?: string }) {
  const [room, setRoom] = useState(initialRoomSlug ?? "");
  const [date, setDate] = useState("");
  const [season, setSeason] = useState("");
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const qs = new URLSearchParams();
    if (season) qs.set("season", season);
    if (room) qs.set("room", room);
    if (date) qs.set("date", date);

    fetch(`/api/tank/archive/browse?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: BrowseResponse) => {
        if (!active) return;
        setData(json);
        setActiveIndex(0);
        // Adopt whatever the server resolved so the next request is explicit
        // rather than relying on the same defaults being picked again.
        if (!season && json.seasons?.length) setSeason(json.seasons[json.seasons.length - 1].slug);
        if (!room && json.rooms?.length) setRoom(json.rooms[0].slug);
      })
      .catch(() => active && setData(null))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [season, room, date]);

  const daysWithFootage = useMemo(
    () => (data?.days ?? []).filter((d) => d.hasFootage),
    [data?.days],
  );

  const playable = useMemo(
    () => (data?.segments ?? []).filter((s) => s.playbackUrl),
    [data?.segments],
  );

  const active = playable[activeIndex] ?? null;

  // A day is many segments; roll into the next one so it plays as one
  // continuous recording rather than stopping every ten minutes.
  const onEnded = useCallback(() => {
    setActiveIndex((i) => (i + 1 < playable.length ? i + 1 : i));
  }, [playable.length]);

  const fullPageHref = `/archives?${new URLSearchParams({
    ...(season ? { season } : {}),
    ...(room ? { room } : {}),
    ...(date ? { date } : {}),
  }).toString()}`;

  if (!loading && data && !data.isMember) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <Lock className="h-6 w-6" style={{ color: "#4c4630" }} />
        <p className="text-sm font-bold" style={{ color: "#241f14" }}>
          Archives are for members
        </p>
        <p className="text-xs" style={{ color: "#4c4630" }}>
          Sign in to browse recorded footage room by room.
        </p>
        <a
          href="https://www.unenter.live/sign-in?next=https%3A%2F%2Ftank.unenter.live"
          className="mt-1 rounded bg-[#f26d4b] px-3 py-1 text-xs font-black uppercase text-white"
        >
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Room picker */}
      <div className="flex flex-wrap gap-1.5">
        {(data?.rooms ?? []).map((r) => (
          <button
            key={r.slug}
            type="button"
            onClick={() => {
              setRoom(r.slug);
              setDate("");
            }}
            className={`rounded border px-2 py-1 text-[11px] font-black uppercase tracking-wide transition ${
              r.slug === room
                ? "border-black/60 bg-[#f26d4b] text-white"
                : "border-black/25 bg-white/70 text-[#241f14] hover:bg-white"
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* Days that actually have footage */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Earlier dates"
          onClick={() => stripRef.current?.scrollBy({ left: -200, behavior: "smooth" })}
          className="grid h-7 w-7 shrink-0 place-items-center rounded border border-black/30 bg-white/70 text-[#241f14]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div ref={stripRef} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {loading && <p className="py-2 text-xs" style={{ color: "#4c4630" }}>Loading…</p>}
          {!loading && daysWithFootage.length === 0 && (
            <p className="py-2 text-xs" style={{ color: "#4c4630" }}>
              No footage recorded for this room yet.
            </p>
          )}
          {daysWithFootage.map((d) => {
            const { month, day } = chipLabel(d.date);
            const selected = d.date === date;
            return (
              <button
                key={d.date}
                type="button"
                title={`${formatDuration(d.totalSeconds)} across ${d.segmentCount} recordings${d.isComplete ? "" : " — still recording"}`}
                onClick={() => setDate(d.date)}
                className={`flex w-[58px] shrink-0 flex-col items-center rounded border px-1 py-0.5 transition ${
                  selected
                    ? "border-black/60 bg-[#f26d4b] text-white"
                    : "border-black/30 bg-white text-[#241f14] hover:bg-[#ffe9c9]"
                }`}
              >
                <span className="text-[8px] font-bold leading-tight">{month}</span>
                <span className="text-xs font-black leading-tight">{day}</span>
                {/* How much of the day was captured, and whether it is final.
                    A day still recording is unfinished, not short. */}
                <span className="text-[7px] font-bold leading-tight opacity-70">
                  {d.isComplete ? formatDuration(d.totalSeconds) : "REC"}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="Later dates"
          onClick={() => stripRef.current?.scrollBy({ left: 200, behavior: "smooth" })}
          className="grid h-7 w-7 shrink-0 place-items-center rounded border border-black/30 bg-white/70 text-[#241f14]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Player */}
      <div className="overflow-hidden rounded border border-black/30 bg-black">
        {active?.playbackUrl ? (
          <video
            key={active.id}
            src={active.playbackUrl}
            className="aspect-video w-full"
            controls
            autoPlay
            playsInline
            onEnded={onEnded}
          />
        ) : (
          <div className="grid aspect-video w-full place-items-center px-4 text-center">
            <p className="text-xs text-white/60">
              {date && playable.length === 0
                ? "No streamable footage for this day."
                : "Pick a room and a date."}
            </p>
          </div>
        )}
      </div>

      {/* Segment rail */}
      {playable.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {playable.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={`rounded border px-1.5 py-0.5 text-[10px] font-bold transition ${
                i === activeIndex
                  ? "border-black/60 bg-[#f26d4b] text-white"
                  : "border-black/25 bg-white/80 text-[#241f14] hover:bg-white"
              }`}
            >
              {clock(s.segmentStart)}
            </button>
          ))}
        </div>
      )}

      {/* Cold footage exists but cannot stream — say so rather than quietly
          showing a shorter day than was actually recorded. */}
      {date && (data?.segments.length ?? 0) > playable.length && (
        <p className="text-[11px]" style={{ color: "#4c4630" }}>
          {(data!.segments.length - playable.length)} recording(s) from this day are in cold
          storage and aren&apos;t streamable here.
        </p>
      )}

      <a
        href={fullPageHref}
        className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide"
        style={{ color: "#241f14" }}
      >
        Open full archive <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

export default ArchiveOverlayPanel;
