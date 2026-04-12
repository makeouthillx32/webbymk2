"use client";
import { useEffect, useState } from "react";
import i18n from "@/locales/en"; // Importing the en.ts file

export default function Hero3() {
  const [scale, setScale] = useState(false);
  const t = i18n.hero3; // Access the hero3 translations

  useEffect(() => {
    const hero7 = document.getElementById("hero7");

    if (!hero7) return;

    const gif1 = hero7.querySelector(".gif1") as HTMLImageElement;
    const gif2 = hero7.querySelector(".gif2") as HTMLImageElement;

    const redirectToLink = () => {
      window.location.href = "https://www.facebook.com/groups/959294042173680/";
    };

    if (gif1 && gif2) {
      gif1.addEventListener("click", redirectToLink);
      gif2.addEventListener("click", redirectToLink);
    }

    return () => {
      gif1?.removeEventListener("click", redirectToLink);
      gif2?.removeEventListener("click", redirectToLink);
    };
  }, []);

  return (
    <section
      id="hero7"
      className="hero7 bg-[#F5F5F5] dark:bg-[#2b1951] text-black dark:text-white py-16 transition-colors duration-300"
    >
      <div className="hero7-container text-center flex justify-between items-center gap-6 max-w-4xl mx-auto">
        {/* GIF 1 */}
        <div className="gif-wrapper flex flex-col items-center text-center">
          <img
            src="/images/Hero7gif1.gif"
            alt="Creative Design 1"
            className="gif1 hover:scale-110 transition-transform duration-300 max-w-[100px] w-auto h-auto"
          />
          <div
            className="hero7-caption font-bold mt-2 text-xl dark:text-white text-black"
            style={{ fontFamily: "'Bebas Neue', cursive" }}
          >
            {t.pickMe} {/* Translation for "Pick me!" */}
          </div>
        </div>

        {/* Centered text with wave animation */}
        <div className="hero7-text text-xl mx-6 flex justify-center items-center text-black dark:text-white">
          <span className="wave-text">{t.repostText}</span> {/* Translation for "REPOST YOURSELF TO GROW!" */}
        </div>

        {/* GIF 2 */}
        <div className="gif-wrapper flex flex-col items-center text-center">
          <img
            src="/images/hero7gif2.gif"
            alt="Creative Design 2"
            className="gif2 hover:scale-110 transition-transform duration-300 max-w-[100px] w-auto h-auto"
            style={{ transform: "scaleX(-1)" }}
          />
          <div
            className="hero7-caption font-bold mt-2 text-xl dark:text-white text-black"
            style={{ fontFamily: "'Bebas Neue', cursive" }}
          >
            {t.noPickMe} {/* Translation for "No, pick me!" */}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes wave {
          0%,
          100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(10px);
          }
          50% {
            transform: translateX(-10px);
          }
          75% {
            transform: translateX(0px);
          }
        }

        .wave-text {
          display: inline-block;
          animation: wave 2s ease-in-out infinite;
        }

        /* Mobile responsiveness */
        @media (max-width: 640px) {
          .hero7-container {
            flex-direction: row;
            gap: 16px;
          }

          .gif-wrapper {
            max-width: 90px; /* Limit gif size even more on mobile */
          }

          .hero7-caption {
            font-size: 1rem; /* Reduce caption size for mobile */
          }

          .hero7-text {
            font-size: 1rem; /* Reduce text size for mobile */
          }
        }
      `}</style>
    </section>
  );
}
