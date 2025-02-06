"use client";

export default function HeroHead() {
  return (
    <div className="w-full py-6 sm:py-5 md:py-4 lg:py-4 xl:py-4"> {/* Adjusts padding based on screen size */}
      <h1 className="text-4xl font-bold text-transparent select-none">.</h1> {/* Keeps structure without visible text */}
    </div>
  );
}
