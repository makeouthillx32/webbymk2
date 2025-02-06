"use client";

export default function HeroHead() {
  return (
    <div
      className="absolute inset-0 pointer-events-none z-10"
      style={{
        height: "6vh", // Default smaller height
        minHeight: "40px", // Ensures it doesn’t disappear
      }}
    >
      {/* Tailwind-based responsive styles */}
      <style jsx>{`
        @media (max-width: 768px) {
          div {
            height: 4vh !important; /* Force smaller size on tablets */
            min-height: 35px !important;
          }
        }
        @media (max-width: 480px) {
          div {
            height: 3vh !important; /* Force even smaller size on phones */
            min-height: 30px !important;
          }
        }
      `}</style>
    </div>
  );
}