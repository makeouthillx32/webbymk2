"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import i18n from "@/locales/en";  // Importing en.ts file directly

export default function HeroYouTube() {
  const t = i18n; // Access the "hero" key from the translation object

  const [channel, setChannel] = useState<any>(null);
  const [latestVideo, setLatestVideo] = useState<any>(null);

  useEffect(() => {
    const fetchYouTubeData = async () => {
      try {
        const response = await fetch(
          "https://website-api-git-main-tylers-projects-e3c386db.vercel.app/api/youtube"
        );
        const data = await response.json();
        setChannel(data.channel);
        setLatestVideo(data.latestVideo);
      } catch (error) {
        console.error("Error fetching YouTube data:", error);
      }
    };

    fetchYouTubeData();
  }, [t]);

  return (
    <div className="container relative mt-12">
      <div className="-mx-4 flex flex-wrap">
        <div className="w-full px-4">
          <div className="mx-auto max-w-[800px] text-center">
            
            {/* Full width red bar */}
            <div className="bg-red-500 dark:bg-black py-6 w-full">
              <h1 className="text-white dark:text-red-500 text-3xl font-bold leading-tight sm:text-4xl sm:leading-tight md:text-5xl md:leading-tight">
                <span className="inline-block animate-wave" style={{ animationDelay: "0s" }}>Y</span>
                <span className="inline-block animate-wave" style={{ animationDelay: "0.1s" }}>o</span>
                <span className="inline-block animate-wave" style={{ animationDelay: "0.2s" }}>u</span>
                <span className="inline-block animate-wave" style={{ animationDelay: "0.3s" }}>T</span>
                <span className="inline-block animate-wave" style={{ animationDelay: "0.4s" }}>u</span>
                <span className="inline-block animate-wave" style={{ animationDelay: "0.5s" }}>b</span>
                <span className="inline-block animate-wave" style={{ animationDelay: "0.6s" }}>e</span>
              </h1>
            </div>

            {/* Slogan */}
            <p className="mb-12 text-body-color dark:text-body-color-dark sm:text-lg md:text-3xl">
              {t?.slogan || "Fallback text"} {/* Access "slogan" directly from i18n.hero */}
            </p>

            {/* YouTube Channel and Latest Video */}
            {channel && latestVideo ? (
              <div className="mt-12 text-center">
                <h2 className="text-2xl font-bold dark:text-white">
                  Latest Video from {channel.title}
                </h2>

                <div className="mt-6">
                  <Link href={latestVideo.link}>
                    <img
                      src={latestVideo.thumbnail}
                      alt={latestVideo.title}
                      className="mx-auto rounded-lg shadow-lg"
                    />
                    <h3 className="mt-4 text-xl font-semibold dark:text-white">
                      {latestVideo.title}
                    </h3>
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-gray-400">Loading latest video...</p>
            )}

          </div>
        </div>
      </div>
    </div>
  );
} 
