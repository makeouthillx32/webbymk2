"use client";

// components/Layouts/shop/PullToRefresh.tsx
//
// Pull-to-refresh with logo rotation physics:
//   • Pulling down  → clockwise spin, rate driven by sin(pullDistance) — organic, slow
//   • Release       → counter-clockwise spin, rate driven by scroll velocity (webkit bounce-back)
//   • Threshold     → page.reload() once the indicator is fully extended
//
// Works alongside native iOS overscroll — we don't preventDefault on the scroll,
// we just observe it and layer the indicator on top.

import { useEffect, useRef, useCallback } from "react";
import { useTheme } from "@/app/provider";

const PULL_THRESHOLD   = 80;   // px — reload fires at this pull distance
const MAX_PULL         = 120;  // px — indicator stops growing after this
const INDICATOR_SIZE   = 48;   // px — logo diameter
const SPIN_SENSITIVITY = 0.35; // deg per px of pull (clockwise, manual)
const RELEASE_SPIN_MUL = 3.2;  // multiplier applied to scroll velocity on release

export default function PullToRefresh() {
  const { themeType } = useTheme();

  // ── Refs (no re-renders — everything is direct DOM manipulation for 60fps) ──
  const wrapRef   = useRef<HTMLDivElement>(null);
  const imgRef    = useRef<HTMLImageElement>(null);
  const trackRef  = useRef<HTMLDivElement>(null);

  const stateRef = useRef({
    // Touch tracking
    startY       : 0,
    currentY     : 0,
    pulling      : false,
    released     : false,
    pullDist     : 0,          // current pull distance in px

    // Rotation accumulator (degrees, +cw)
    rotation     : 0,

    // Release-phase velocity
    lastScrollY  : 0,
    lastScrollT  : 0,
    releaseRafId : 0,
    spinVel      : 0,          // deg/frame, negative = counter-clockwise

    // Already triggered reload?
    reloading    : false,
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  const setTranslate = (y: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.style.transform = `translateY(${y}px)`;
    wrap.style.opacity   = String(Math.min(1, y / (PULL_THRESHOLD * 0.6)));
  };

  const setRotation = (deg: number) => {
    const img = imgRef.current;
    if (!img) return;
    img.style.transform = `rotate(${deg}deg)`;
  };

  const stopReleaseSpin = () => {
    cancelAnimationFrame(stateRef.current.releaseRafId);
  };

  // ── Release spin loop ─────────────────────────────────────────────────────
  // Fires after finger lifts. spinVel starts negative (counter-clockwise),
  // decays exponentially each frame until nearly zero.

  const startReleaseSpin = useCallback((initialVel: number) => {
    stopReleaseSpin();
    const s = stateRef.current;
    s.spinVel = initialVel; // negative = CCW

    const tick = () => {
      s.rotation  += s.spinVel;
      s.spinVel   *= 0.92;           // friction
      setRotation(s.rotation);

      if (Math.abs(s.spinVel) > 0.3) {
        s.releaseRafId = requestAnimationFrame(tick);
      } else {
        s.spinVel = 0;
      }
    };
    s.releaseRafId = requestAnimationFrame(tick);
  }, []);

  // ── Touch handlers ────────────────────────────────────────────────────────

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY > 2) return;         // only trigger at very top
    const s = stateRef.current;
    s.startY    = e.touches[0].clientY;
    s.currentY  = s.startY;
    s.pulling   = false;
    s.released  = false;
    s.pullDist  = 0;
    stopReleaseSpin();
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (stateRef.current.reloading) return;
    const s     = stateRef.current;
    const touch = e.touches[0];
    const dy    = touch.clientY - s.startY;

    if (dy <= 0) { s.pulling = false; return; }
    if (window.scrollY > 2 && !s.pulling) return;

    s.pulling  = true;
    s.currentY = touch.clientY;
    s.pullDist = Math.min(dy * 0.55, MAX_PULL); // dampen the raw drag

    // ── Clockwise rotation: sin curve so it starts fast, plateaus ──
    // Each px of new pull adds a sin-scaled increment
    const dpx        = touch.clientY - (s.currentY - 1); // delta this frame ~1px
    const progress   = s.pullDist / MAX_PULL;             // 0 → 1
    const sinFactor  = Math.sin(progress * Math.PI);       // peaks at 0.5
    s.rotation      += dpx * SPIN_SENSITIVITY * sinFactor;

    setTranslate(s.pullDist);
    setRotation(s.rotation);
  }, []);

  const onTouchEnd = useCallback(() => {
    const s = stateRef.current;
    if (!s.pulling) return;

    s.pulling  = false;
    s.released = true;

    const wrap = wrapRef.current;
    if (wrap) {
      wrap.style.transition = "transform 0.45s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease";
      wrap.style.transform  = "translateY(0px)";
      wrap.style.opacity    = "0";
      setTimeout(() => {
        if (wrap) wrap.style.transition = "";
      }, 500);
    }

    // Measure scroll velocity for CCW release spin
    // The browser's overscroll bounce means scrollY will tick fast —
    // we sample it over a couple of frames to get velocity.
    s.lastScrollY = window.scrollY;
    s.lastScrollT = performance.now();

    const sampleVelocity = () => {
      const now  = performance.now();
      const dt   = now - s.lastScrollT;
      const dScr = window.scrollY - s.lastScrollY;
      const vel  = dt > 0 ? (dScr / dt) * 16 : 0; // px/frame @60fps

      if (dt < 300) {
        // Keep sampling for up to 300ms to catch webkit bounce peak
        s.lastScrollY = window.scrollY;
        s.lastScrollT = now;
        requestAnimationFrame(sampleVelocity);
      } else {
        // Kick off CCW spin — magnitude from measured velocity
        const pullBased = s.pullDist * 0.08; // minimum spin from pull size
        const velBased  = Math.abs(vel) * RELEASE_SPIN_MUL;
        const initVel   = -(Math.max(pullBased, velBased));  // negative = CCW
        startReleaseSpin(initVel);
      }
    };
    requestAnimationFrame(sampleVelocity);

    // Trigger reload if threshold was reached
    if (s.pullDist >= PULL_THRESHOLD && !s.reloading) {
      s.reloading = true;
      setTimeout(() => window.location.reload(), 300);
    }
  }, [startReleaseSpin]);

  // ── Mount / unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    const el = document.documentElement;
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove",  onTouchMove,  { passive: true });
    el.addEventListener("touchend",   onTouchEnd,   { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove",  onTouchMove);
      el.removeEventListener("touchend",   onTouchEnd);
      stopReleaseSpin();
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  // ── Logo src matches preloader logic ──────────────────────────────────────
  const logoSrc = themeType === "dark"
    ? "/images/logo/logo-dark.svg"
    : "/images/logo/logo-icon.svg";

  // ── Render ────────────────────────────────────────────────────────────────
  // Fixed to top-center, starts at -INDICATOR_SIZE (hidden above fold),
  // translateY pushes it down as user pulls.

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{
        position        : "fixed",
        top             : -(INDICATOR_SIZE + 16),
        left            : "50%",
        transform       : "translateX(-50%) translateY(0px)",
        zIndex          : 9998,
        width           : INDICATOR_SIZE,
        height          : INDICATOR_SIZE,
        opacity         : 0,
        willChange      : "transform, opacity",
        pointerEvents   : "none",
      }}
    >
      {/* Track ring — subtle circle behind the logo */}
      <div
        ref={trackRef}
        style={{
          position     : "absolute",
          inset        : -6,
          borderRadius : "50%",
          border       : "1.5px solid hsl(var(--border))",
          background   : "hsl(var(--background) / 0.9)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          boxShadow    : "0 4px 24px hsl(var(--foreground) / 0.08)",
        }}
      />

      {/* Logo — rotated via direct DOM ref */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={logoSrc}
        alt=""
        style={{
          position     : "relative",
          width        : INDICATOR_SIZE,
          height       : INDICATOR_SIZE,
          objectFit    : "contain",
          willChange   : "transform",
          userSelect   : "none",
          WebkitUserSelect: "none",
        }}
      />
    </div>
  );
}