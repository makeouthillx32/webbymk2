"use client";

export default function HeroHead() {
  return (
    <div
      className="absolute inset-0 pointer-events-none z-10"
      style={{
        height: "8vh", // Default height
        minHeight: "50px", // Ensures it doesn't get too small
      }}
    >
      {/* Responsive Styling */}
      <style jsx>{`
        @media (max-width: 768px) {
          div {
            height: 6vh; /* Reduce height further on smaller screens */
            min-height: 40px; /* Set a minimum size */
          }
        }
        @media (max-width: 480px) {
          div {
            height: 5vh; /* Even smaller for very small devices */
            min-height: 35px;
          }
        }
      `}</style>
    </div>
  );
}