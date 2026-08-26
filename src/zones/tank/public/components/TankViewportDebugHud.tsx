"use client";

import { useEffect, useRef, useState } from "react";

// Diagnostic-only overlay for chasing the iOS-only "text dancing" report.
// Inert unless ?debug=viewport is in the URL — polls visualViewport + a
// sentinel element's computed font-size every animation frame and logs
// only the frames where something actually changed, with a timestamp and
// what fired around it, so we get real WebKit evidence instead of another
// guess we can't reproduce off-device.
export function TankViewportDebugHud() {
  const [enabled, setEnabled] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const startRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setEnabled(new URLSearchParams(window.location.search).get("debug") === "viewport");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    startRef.current = performance.now();

    const push = (msg: string) => {
      const t = ((performance.now() - startRef.current) / 1000).toFixed(2);
      setLines((prev) => [`[${t}s] ${msg}`, ...prev].slice(0, 40));
    };

    push("HUD armed — watching visualViewport + sentinel font-size");

    let lastEventTag = "init";
    const tag = (name: string) => () => {
      lastEventTag = name;
      push(`EVENT ${name}`);
    };

    const onResize = tag("window.resize");
    const onOrientation = tag("orientationchange");
    const onFocusIn = tag("focusin");
    const onFocusOut = tag("focusout");
    const onVvResize = tag("visualViewport.resize");
    const onVvScroll = tag("visualViewport.scroll");

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientation);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.visualViewport?.addEventListener("resize", onVvResize);
    window.visualViewport?.addEventListener("scroll", onVvScroll);

    let lastFontSize = "";
    let lastScale = -1;
    let lastHtmlFontSize = "";
    let raf = 0;

    const poll = () => {
      const vv = window.visualViewport;
      const scale = vv ? Math.round(vv.scale * 1000) / 1000 : -1;
      const sentinelFs = sentinelRef.current
        ? getComputedStyle(sentinelRef.current).fontSize
        : "n/a";
      const htmlFs = getComputedStyle(document.documentElement).fontSize;

      if (sentinelFs !== lastFontSize) {
        push(`SENTINEL font-size ${lastFontSize || "(first)"} -> ${sentinelFs}  (near: ${lastEventTag})`);
        lastFontSize = sentinelFs;
      }
      if (htmlFs !== lastHtmlFontSize) {
        push(`HTML root font-size ${lastHtmlFontSize || "(first)"} -> ${htmlFs}  (near: ${lastEventTag})`);
        lastHtmlFontSize = htmlFs;
      }
      if (scale !== lastScale) {
        push(`visualViewport.scale ${lastScale === -1 ? "(first)" : lastScale} -> ${scale}  (near: ${lastEventTag})`);
        lastScale = scale;
      }

      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.visualViewport?.removeEventListener("resize", onVvResize);
      window.visualViewport?.removeEventListener("scroll", onVvScroll);
      cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[99999] max-h-[45vh] overflow-y-auto bg-black/95 p-2 font-mono text-[10px] leading-tight text-lime-300"
      style={{ WebkitUserSelect: "text", userSelect: "text" }}
    >
      <div className="mb-1 flex items-center justify-between text-amber-400">
        <span>VIEWPORT/FONT DEBUG HUD — screenshot or screen-record this</span>
        <span ref={sentinelRef} className="text-sm text-white">
          sentinel text
        </span>
      </div>
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

export default TankViewportDebugHud;
