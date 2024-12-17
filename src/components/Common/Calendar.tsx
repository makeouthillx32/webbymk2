// Z:\code\FEver-main\src\components\Common\Calendar.tsx

"use client";  // Enables client-side code

import { useTheme } from "next-themes";  // Client-side theme detection
import clsx from 'clsx';
import { useEffect, useState } from "react";

const Calendar = () => {
  const { theme } = useTheme();  // Detect the theme on the client-side
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
//old function didnt check theme befor page loaded //
  return (
    <div className={clsx("calendar-embed flex flex-col items-center justify-center w-full h-screen", backgroundClass)}>
      <iframe
        src="https://cal.unenter.live/unenter"
        className="w-full h-full border-0 overflow-hidden"  // Use flexbox and full height to avoid overflow
        title="Booking Calendar"
        allow="camera; microphone; encrypted-media"
      ></iframe>
      <button
        onClick={handleBack}
        className=" left-4 bottom-4 z-10 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition-colors"
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
  );
};

export default Calendar;
