"use client";

// A tile-sized game cam: the room's 3D scene from its real camera's angle,
// drawn by the page's one shared preview renderer (altDirector/gamePreviews.ts).
// Fades in once the first frame lands; until then the tile shows whatever
// sits behind it.

import { useEffect, useRef, useState } from "react";

export function GamePreview({
  roomKey,
  url,
  reducedMotion = false,
  className = "",
}: {
  roomKey: string;
  url: string;
  reducedMotion?: boolean;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let cancelled = false;
    let handle: { setVisible: (v: boolean) => void; detach: () => void } | null = null;
    let observer: IntersectionObserver | null = null;
    let poll = 0;
    setShown(false);
    void import("../altDirector/gamePreviews").then((previews) => {
      if (cancelled) return;
      previews.setGamePreviewStillsOnly(reducedMotion);
      handle = previews.attachGamePreview(roomKey, url, element);
      if (!handle) return;
      observer = new IntersectionObserver(([entry]) => handle?.setVisible(entry?.isIntersecting ?? true));
      observer.observe(element);
      // Reveal on the first drawn frame (a blank canvas reads as a black box).
      const check = () => {
        if (cancelled) return;
        const pixel = element.getContext("2d")?.getImageData(element.width >> 1, element.height >> 1, 1, 1).data;
        if (pixel && pixel[3] > 0) setShown(true);
        else poll = window.setTimeout(check, 250);
      };
      check();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(poll);
      observer?.disconnect();
      handle?.detach();
    };
  }, [roomKey, url, reducedMotion]);

  return (
    <canvas
      ref={canvas}
      data-tank-game-preview={roomKey}
      aria-hidden="true"
      className={`h-full w-full object-cover transition-opacity duration-500 [image-rendering:pixelated] ${shown ? "opacity-100" : "opacity-0"} ${className}`}
    />
  );
}
