"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import "./top-banner.scss";

// -----------------------
// Types
// -----------------------
type BannerGroup = {
  text: string;
  position: number;
  is_enabled: boolean;

  active_days: number[] | null;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string | null;
};

type BannerConfigRow = {
  is_enabled: boolean;
  display_mode: "static" | "marquee" | "slideshow" | "typewriter";
  animation_speed_ms: number;
  rotation_interval_ms: number;
  pause_on_hover: boolean;
  separator: string;
  site_banner_groups: BannerGroup[];
};

// -----------------------
// Time helpers (TZ-safe)
// -----------------------
function isoNowParts(timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const weekdayShort = get("weekday");
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");

  const date = `${year}-${month}-${day}`;
  const timeHHMM = `${hour}:${minute}`;

  const isoWeekday =
    weekdayShort === "Mon"
      ? 1
      : weekdayShort === "Tue"
      ? 2
      : weekdayShort === "Wed"
      ? 3
      : weekdayShort === "Thu"
      ? 4
      : weekdayShort === "Fri"
      ? 5
      : weekdayShort === "Sat"
      ? 6
      : 7;

  return { isoWeekday, date, timeHHMM };
}

function timeToHHMM(t: string | null) {
  if (!t) return "";
  return t.slice(0, 5);
}

function isTimeInWindow(nowHHMM: string, start: string | null, end: string | null) {
  const s = timeToHHMM(start);
  const e = timeToHHMM(end);

  if (!s && !e) return true;

  const now = nowHHMM || "00:00";
  const startV = s || "00:00";
  const endV = e || "23:59";

  if (startV <= endV) return now >= startV && now <= endV;
  return now >= startV || now <= endV; // overnight wrap
}

function isDateInWindow(nowDate: string, startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return true;
  const s = startDate ?? "0000-01-01";
  const e = endDate ?? "9999-12-31";
  return nowDate >= s && nowDate <= e;
}

function groupIsEligible(g: BannerGroup, fallbackTZ: string) {
  if (!g.is_enabled) return false;

  const tz = (g.timezone || fallbackTZ || "America/Chicago").trim() || "America/Chicago";
  const now = isoNowParts(tz);

  if (g.active_days && Array.isArray(g.active_days) && g.active_days.length) {
    if (!g.active_days.includes(now.isoWeekday)) return false;
  }

  if (!isDateInWindow(now.date, g.start_date, g.end_date)) return false;
  if (!isTimeInWindow(now.timeHHMM, g.start_time, g.end_time)) return false;

  return true;
}

// -----------------------
// Component
// -----------------------
export function TopBanner() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<BannerConfigRow["display_mode"]>("static");

  // keep this as "transition/typewriter speed"
  const [speedMs, setSpeedMs] = useState(450);

  // rotation interval for slideshow/typewriter
  const [intervalMs, setIntervalMs] = useState(2200);

  const [pauseOnHover, setPauseOnHover] = useState(true);
  const [separator, setSeparator] = useState(" • ");

  const [groups, setGroups] = useState<BannerGroup[]>([]);
  const [hovered, setHovered] = useState(false);

  const [activeIndex, setActiveIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const typeTimerRef = useRef<number | null>(null);

  const [scheduleTick, setScheduleTick] = useState(0);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("site_banners")
        .select(
          `
          is_enabled,
          display_mode,
          animation_speed_ms,
          rotation_interval_ms,
          pause_on_hover,
          separator,
          site_banner_groups (
            text,
            position,
            is_enabled,
            active_days,
            start_time,
            end_time,
            start_date,
            end_date,
            timezone
          )
        `
        )
        .eq("key", "top_banner")
        .maybeSingle();

      if (!alive) return;
      if (error || !data) return;

      const cfg = data as unknown as BannerConfigRow;

      setEnabled(!!cfg.is_enabled);
      setMode((cfg.display_mode || "static") as any);

      setSpeedMs(Number(cfg.animation_speed_ms ?? 450));
      setIntervalMs(Number(cfg.rotation_interval_ms ?? 2200));
      setPauseOnHover(!!cfg.pause_on_hover);
      setSeparator(cfg.separator ?? " • ");

      const mapped =
        (cfg.site_banner_groups ?? [])
          .filter((g) => !!g && !!g.is_enabled)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) ?? [];

      setGroups(mapped);
    })();

    return () => {
      alive = false;
    };
  }, [supabase]);

  useEffect(() => {
    const t = window.setInterval(() => setScheduleTick((x) => x + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const eligible = useMemo(() => {
    const fallbackTZ = "America/Chicago";
    return groups
      .filter((g) => groupIsEligible(g, fallbackTZ))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [groups, scheduleTick]);

  useEffect(() => {
    if (activeIndex >= eligible.length) setActiveIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible.length]);

  // Slideshow rotation
  useEffect(() => {
    if (!enabled) return;
    if (mode !== "slideshow") return;
    if (eligible.length <= 1) return;
    if (pauseOnHover && hovered) return;

    const t = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % eligible.length);
    }, intervalMs);

    return () => window.clearInterval(t);
  }, [enabled, mode, eligible.length, intervalMs, pauseOnHover, hovered]);

  // Typewriter effect
  useEffect(() => {
    if (!enabled) return;
    if (mode !== "typewriter") return;
    if (!eligible.length) return;
    if (pauseOnHover && hovered) return;

    const full = eligible[activeIndex]?.text ?? "";
    setTyped("");

    let idx = 0;
    const stepMs = Math.max(18, Math.floor(speedMs / 10));

    if (typeTimerRef.current) window.clearInterval(typeTimerRef.current);

    typeTimerRef.current = window.setInterval(() => {
      idx++;
      setTyped(full.slice(0, idx));
      if (idx >= full.length) {
        window.clearInterval(typeTimerRef.current!);
        typeTimerRef.current = null;

        window.setTimeout(() => {
          setActiveIndex((i) => (i + 1) % eligible.length);
        }, Math.max(600, intervalMs));
      }
    }, stepMs);

    return () => {
      if (typeTimerRef.current) window.clearInterval(typeTimerRef.current);
      typeTimerRef.current = null;
    };
  }, [enabled, mode, eligible, activeIndex, speedMs, intervalMs, pauseOnHover, hovered]);

  if (!enabled) return null;
  if (!eligible.length) return null;

  const staticText = eligible.map((g) => g.text).join(separator);

  // ✅ FIX: marquee duration must be LONG. We derive it from speedMs so your UI still “controls” it.
  // Example mapping:
  //   speedMs=450 => marquee ~ 24000ms (24s) (nice)
  //   speedMs=900 => marquee ~ 18000ms (faster)
  //   speedMs=200 => marquee ~ 30000ms (slower)
  const marqueeDurationMs = Math.min(
    60_000,
    Math.max(12_000, Math.round(30_000 - speedMs * 15))
  );

  return (
    <div
      className="top-banner"
      style={
        {
          // used for fades/typewriter/caret timing, etc.
          ["--banner-speed-ms" as any]: `${speedMs}ms`,
          // used for slideshow/typewriter rotation
          ["--banner-interval-ms" as any]: `${intervalMs}ms`,
          // ✅ used ONLY for marquee scroll speed
          ["--marquee-duration-ms" as any]: `${marqueeDurationMs}ms`,
        } as any
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-mode={mode}
      data-paused={pauseOnHover && hovered ? "true" : "false"}
    >
      <div className="top-banner__inner">
        {mode === "static" && <span className="top-banner__static">{staticText}</span>}

        {mode === "marquee" && (
          <div className="top-banner__marquee" aria-label={staticText}>
            <div className="top-banner__marqueeTrack">
              <span>{staticText}</span>
              <span aria-hidden="true">{staticText}</span>
              <span aria-hidden="true">{staticText}</span>
            </div>
          </div>
        )}

        {mode === "slideshow" && (
          <div className="top-banner__slideshow">
            <span key={activeIndex} className="top-banner__slide">
              {eligible[activeIndex]?.text}
            </span>
          </div>
        )}

        {mode === "typewriter" && (
          <div className="top-banner__typewriter" aria-label={eligible[activeIndex]?.text}>
            <span className="top-banner__typed">{typed}</span>
            <span className="top-banner__caret" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}
