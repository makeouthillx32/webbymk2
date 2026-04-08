"use client";

// components/Layouts/hooks/useScreenSize.ts
import { useEffect, useState } from "react";
import { getCookie, setCookie } from "@/lib/cookieUtils";

export type ScreenSize = "mobile" | "tablet" | "desktop";

function resolveSize(width: number): ScreenSize {
  return width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop";
}

export function useScreenSize(): ScreenSize {
  const [screenSize, setScreenSize] = useState<ScreenSize>(() => {
    if (typeof window === "undefined") return "desktop";
    try {
      const cached = getCookie("screenSize");
      if (cached === "mobile" || cached === "tablet" || cached === "desktop") return cached;
    } catch (e) {
      console.warn("Cookie access failed:", e);
    }
    try {
      const size = resolveSize(window.innerWidth);
      try { setCookie("screenSize", size, { maxAge: 86400 }); } catch {}
      return size;
    } catch {
      return "desktop";
    }
  });

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        try {
          const newSize = resolveSize(window.innerWidth);
          if (newSize !== screenSize) {
            setScreenSize(newSize);
            try { setCookie("screenSize", newSize, { maxAge: 86400 }); } catch {}
          }
        } catch {}
      }, 200);
    };

    try {
      window.addEventListener("resize", handleResize);
      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener("resize", handleResize);
      };
    } catch {
      return () => clearTimeout(timeoutId);
    }
  }, [screenSize]);

  return screenSize;
}