"use client"; // Add this line at the top

import { useState, useEffect } from "react";
import Link from "next/link";

export default function Hero3() {
  const [scale, setScale] = useState(false);

  const handleMouseEnter = () => setScale(true);
  const handleMouseLeave = () => setScale(false);

  return (
    <section className="hero3 bg-gradient-to-r from-blue-500 to-black text-white py-16">
      <div className="hero3-container text-center">
        <div className="hero3-title flex justify-center items-center gap-2">
          <h1 className="text-3xl md:text-5xl font-bold">Discord Section</h1>
          <div className="separator-bar bg-white w-1 h-10"></div>
        </div>

        <div className="hero3-description mt-4 max-w-3xl mx-auto text-lg">
          <p>
            This is the Discord Hero Section. Check out the interactive features
            below!
          </p>
        </div>

        <div
          className={`hero3-image mt-8 transform transition-transform duration-300 ${
            scale ? "scale-105" : ""
          }`}
        >
          <img
            src="/images/discord-image.png"
            alt="Discord"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="rounded-lg shadow-lg"
          />
        </div>

        <a
          href="https://discord.com/invite/xyz"
          className="hero3-watch-button bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full mt-6 inline-block"
        >
          Join the Discord
        </a>
      </div>
    </section>
  );
}
