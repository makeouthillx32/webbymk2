"use client";

import HeroHead from "./HeroHead"; // Header Section
import InteractiveBanner from "./InteractiveBanner"; // 3D Interactive Section
import HeroYouTube from "./HeroYouTube"; // YouTube Section
import Kick from "./Kick"; // Kick Section
import Discord from "./Discord"; // Discord Section
import Pickme from "./Pickme"; // Pick Me Section
import { cn } from "@/utils/cn";

export default function Hero() {
  return (
    <>
      <section
        id="home"
        className={cn(
          "relative z-10 overflow-hidden bg-white pb-24 pt-[140px]",
          "dark:bg-gray-dark"
        )}
      >
        {/* Background video that wraps everything */}
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        >
          <source src="/video/hero-video.mp4" type="video/mp4" />
        </video>

        {/* Head Section */}
        <HeroHead />

        {/* Interactive 3D Scene */}
        <InteractiveBanner />

        {/* YouTube Section */}
        <HeroYouTube />
      </section>

      {/* Kick Section (Placed Outside the Hero Section) */}
      <Kick />

      {/* Discord Section (Placed Below Kick) */}
      <Discord />

      {/* Pick Me Section (Placed Below Discord) */}
      <Pickme />
    </>
  );
}
