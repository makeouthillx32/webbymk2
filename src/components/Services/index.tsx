"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import i18n from "@/locales/en"; // Import the updated en.ts file

export default function KickHero() {
  const t = i18n.kick;  // Access the 'kick' section from en.ts

  const [scale, setScale] = useState(false);

  const handleMouseEnter = () => setScale(true);
  const handleMouseLeave = () => setScale(false);

  return (
    <section
      className={`hero5 ${
        // Apply gradient in one direction for light mode, and reverse for dark mode
        "bg-gradient-to-r from-green-500 to-black dark:bg-gradient-to-l dark:from-green-500 dark:to-black"
      } text-white py-16`}
    >
      <div className="kick-container text-center">
        <div className="kick-title flex justify-center items-center gap-2">
          {/* Unenter text with different color for dark mode */}
          <h1 className="text-3xl md:text-5xl font-bold text-black dark:text-white">
            {t.title}
          </h1>

          {/* Separator bar that changes color in dark mode */}
          <div className="separator-bar bg-black dark:bg-white w-1 h-10"></div>

          {/* Light mode SVG */}
          <img
            src="/images/hero/Darkk.svg"
            alt="Kick Logo - Light Mode"
            className="kick-logo w-24 h-24 block dark:hidden"
          />

          {/* Dark mode SVG */}
          <img
            src="/images/hero/Whitek.svg"
            alt="Kick Logo - Dark Mode"
            className="kick-logo w-24 h-24 hidden dark:block"
          />
        </div>

        <div className="kick-description mt-4 max-w-3xl mx-auto text-lg">
          <p>{t.description}</p>
        </div>

        <div
          className={`kick-stream-image mt-8 transform transition-transform duration-300 ${
            scale ? "scale-105" : ""
          }`}
        >
          <img
            src="/images/kickp.png"
            alt="Stream Image"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="rounded-lg shadow-lg"
          />
        </div>

        <a
          href="https://www.kick.com/unenter"
          className="kick-watch-button bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-full mt-6 inline-block"
        >
          {t.streamButton}
        </a>

        <div className="kick-did-you-know mt-10">
          <h3 className="text-2xl font-semibold">{t.didYouKnowTitle}</h3>
          <ul className="list-none mt-4 space-y-2">
            {t.didYouKnowItems.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
            <li>
              <Link href="#" className="underline">
                {t.didYouKnowItems[4]}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
