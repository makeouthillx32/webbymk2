// components/shop/Home.tsx
"use client";

import React, { useEffect } from "react";

import useThemeCookie from "@/lib/useThemeCookie";

import Landing from "@/components/shop/Landing";

export default function Home() {
  useThemeCookie();

  // Optional: if user hits /#something, smoothly scroll (ONLY for sections on Landing)
  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.replace("#", "");
      if (!id) return;

      // Let layout render first
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };

    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  return (
    <main className="flex-grow">
      <Landing />
    </main>
  );
}