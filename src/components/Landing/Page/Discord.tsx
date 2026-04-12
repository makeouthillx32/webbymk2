"use client";

import { useState } from "react";
import i18n from "@/locales/en"; // Importing i18n

export default function Hero2() {
  const t = i18n?.hero2; // Access the 'hero2' section from en.ts and check if it's defined

  const [scale, setScale] = useState(false);

  const handleMouseEnter = () => setScale(true);
  const handleMouseLeave = () => setScale(false);

  if (!t) {
    // If 't' is undefined, return fallback content or error message
    return <div>Error: Translations for Hero2 not found.</div>;
  }

  return (
    <section className="bg-gradient-to-r from-blue-500 via-indigo-600 to-black text-white py-16">
      <div className="container mx-auto text-center">
        {/* Title Section */}
        <div className="flex justify-center items-center gap-4">
          <div className="separator-bar bg-white dark:bg-black w-1 h-12"></div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-wide text-white dark:text-black">
            {t.title} {/* This will fetch 'title' from the 'hero2' section */}
          </h1>
          <div className="separator-bar bg-white dark:bg-black w-1 h-12"></div>
        </div>

        {/* Description Section */}
        <div className="mt-4 max-w-3xl mx-auto text-lg">
          <p>{t.paragraph} {/* This will fetch 'paragraph' from 'hero2' */}</p>
        </div>

        {/* Image Section */}
        <div
          className={`mt-8 transform transition-transform duration-500 ${
            scale ? "scale-110" : "scale-100"
          }`}
        >
          <img
            src="/images/discord.gif" // Corrected to use the provided GIF
            alt="Discord Community"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="rounded-lg shadow-2xl max-w-full h-auto mx-auto"
          />
        </div>

        {/* Call-to-Action Button */}
        <a
          href="https://discord.com/invite/xyz"
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-full mt-8 inline-block text-lg shadow-lg transition-all duration-300 transform hover:scale-105"
        >
          {t.button} {/* This will fetch 'button' from the 'hero2' section */}
        </a>

        {/* Extra Information Section */}
        <div className="mt-12">
          <h3 className="text-2xl font-semibold mb-4">{t.extraTitle}</h3>
          <ul className="list-none space-y-3">
            <li>{t.extraPoint1}</li>
            <li>{t.extraPoint2}</li>
            <li>{t.extraPoint3}</li>
            <li>{t.extraPoint4}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
