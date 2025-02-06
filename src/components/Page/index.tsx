"use client";

import HeroHead from "./HeroHead"; // Header Section
import InteractiveBanner from "./InteractiveBanner"; // 3D Interactive Section
import HeroYouTube from "./HeroYouTube"; // YouTube Section
import Kick from "./Kick"; // Kick Section
import Discord from "./Discord"; // Discord Section
import Pickme from "./Pickme"; // Pick Me Section

export default function Hero() {
  return (
    <>
      {/* Video Background Wrapping All Sections */}
      <section className="relative z-10 overflow-hidden">
        <div className="absolute inset-0 -z-10 w-full h-full">
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          >
            <source src="/video/hero-video.webm" type="video/webm" />
          </video>
        </div>

        {/* Head Section (Now Uses `HeroHead.tsx`) */}
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
