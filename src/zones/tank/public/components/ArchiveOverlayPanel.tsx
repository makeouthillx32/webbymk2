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
  codec?: "h264" | "av1";
};

type BrowseResponse = {
  success: boolean;
  isMember: boolean;
  seasons: { slug: string; name: string }[];
  rooms: RoomOption[];
  days: ArchiveDay[];
  segments: Segment[];
};

// Kept in step with TANK_ARCHIVE_BROWSABLE_DAYS. If the window changes, this
// is the number the notice quotes at viewers.
const ARCHIVE_PUBLIC_DAYS = 5;

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


/**
 * True when this browser can play AV1.
 *
 * Segments past the public window are AV1, which Safari decodes only on newer
 * hardware (A17 Pro / M3 and later). Without this check those viewers get a
 * black player and no explanation, so the answer drives a plain-language
 * notice rather than a silent failure.
 */
function canPlayAv1(): boolean {
  if (typeof document === "undefined") return true;
  const v = document.createElement("video");
  // "probably" and "maybe" both count: browsers are deliberately vague here,
  // and an empty string is the only clear "no".
  return v.canPlayType('video/mp4; codecs="av01.0.05M.08"') !== "";
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

  // Older footage is AV1, which needs a recent device. Work out whether this
  // viewer is affected rather than letting them hit a silent black player.
  const av1Supported = useMemo(() => canPlayAv1(), []);
  const viewingAv1 = (data?.segments ?? []).some((x) => x.codec === "av1");

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
          href="https://auth.unenter.live/sign-in?next=https%3A%2F%2Ftank.unenter.live"
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
            className={`rounded border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider transition ${
              r.slug === room
                ? "border-black/60 bg-gradient-to-b from-[#ff8a7a] to-[#ff3b2f] text-white shadow"
                : "border-black/30 bg-black/80 text-yellow-400 hover:bg-black/90"
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
          className="grid h-8 w-8 shrink-0 place-items-center rounded border border-black/40 bg-black/80 text-yellow-400 hover:bg-black/90 active:scale-95 shadow"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div ref={stripRef} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {loading && <p className="py-2 text-xs font-mono text-slate-400">Loading telemetry…</p>}
          {!loading && daysWithFootage.length === 0 && (
            <p className="py-2 text-xs font-mono text-slate-400">
              No recorded logs in this sector yet.
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
                className={`flex w-[62px] shrink-0 flex-col items-center rounded border px-1.5 py-1 transition ${
                  selected
                    ? "border-yellow-400 bg-amber-950/80 text-yellow-300 ring-2 ring-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                    : "border-black/40 bg-black/80 text-slate-300 hover:bg-black/90"
                }`}
              >
                <span className="text-[8px] font-mono font-bold leading-tight uppercase">{month}</span>
                <span className="text-sm font-mono font-black leading-tight">{day}</span>
                <span className="text-[7px] font-black leading-tight opacity-75 uppercase">
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
          className="grid h-8 w-8 shrink-0 place-items-center rounded border border-black/40 bg-black/80 text-yellow-400 hover:bg-black/90 active:scale-95 shadow"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Player */}
      <div className="overflow-hidden rounded border border-black/60 bg-black/95 shadow-inner">
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
            <p className="text-xs font-mono text-slate-400">
              {date && playable.length === 0
                ? "No streamable footage for this cycle."
                : "Select a camera room and timestamp to initiate playback."}
            </p>
          </div>
        )}
      </div>

      {/* Segment rail */}
      {playable.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {playable.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={`rounded border px-2 py-1 font-mono text-[10px] font-black transition ${
                i === activeIndex
                  ? "border-yellow-400 bg-gradient-to-b from-[#ff8a7a] to-[#ff3b2f] text-white shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                  : "border-black/40 bg-black/80 text-yellow-400/90 hover:bg-black"
              }`}
            >
              {clock(s.segmentStart)}
            </button>
          ))}
        </div>
      )}

      {/* Device can't decode what it's being handed */}
      {viewingAv1 && !av1Supported && (
        <p className="rounded border border-amber-500/40 bg-amber-950/80 p-2 text-[11px] font-mono text-amber-300">
          ⚠️ This footage format requires AV1 codec hardware. Older archives ({ARCHIVE_PUBLIC_DAYS}+ days) are encoded in AV1. Recent footage plays on all devices.
        </p>
      )}

      {/* Cold footage notice */}
      {date && (data?.segments.length ?? 0) > playable.length && (
        <p className="text-[10px] font-mono text-slate-700">
          ℹ️ {(data!.segments.length - playable.length)} segment(s) archived in cold vault storage.
        </p>
      )}

      <div className="pt-1">
        <a
          href={fullPageHref}
          className="inline-flex items-center gap-1.5 rounded border border-black/40 bg-black/80 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-yellow-400 hover:bg-black/90 shadow transition"
        >
          Open Master Archive Vault <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

export default ArchiveOverlayPanel;
