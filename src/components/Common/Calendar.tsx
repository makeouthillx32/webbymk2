"use client"; // Enables client-side code

import { useTheme } from "next-themes"; // Client-side theme detection
import clsx from "clsx";
import { useEffect, useState } from "react";
import Phonesim from "../Features/Phonesim"; // Import the Phonesim component

const Calendar = () => {
  const { theme } = useTheme(); // Detect the theme on the client-side
  const [backgroundClass, setBackgroundClass] = useState("");

  useEffect(() => {
    // Set the background class based on the theme
    const lightThemeClass = "bg-[#F3F4F6]";
    const darkThemeClass = "bg-[#101010]";
    setBackgroundClass(theme === "dark" ? darkThemeClass : lightThemeClass);
  }, [theme]);

  const handleBack = () => {
    window.history.back();
  };

  return (
    <div
      className={clsx(
        "calendar-embed flex flex-col items-center justify-start w-full min-h-screen overflow-visible",
        backgroundClass
      )}
      style={{
        position: "relative", // Ensure it's positioned relative for stacking
        zIndex: 0, // Ensure nothing clips this container
      }}
    >
      {/* Responsive Phonesim */}
      <div
        className="flex items-center justify-center w-full p-4"
        style={{
          overflow: "visible", // Ensure Phonesim is not clipped
          position: "relative",
        }}
      >
        <Phonesim />
      </div>

      {/* Go Back Button */}
      <div className="fixed bottom-4 left-4 z-10">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition-colors"
          aria-label="Go back"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>
    </div>
  );
};

export default Calendar;
