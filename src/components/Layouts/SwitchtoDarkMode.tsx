"use client";

import React, { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookieUtils";
import { useTheme } from "@/app/provider";
import { handleThemeToggleClick } from "@/utils/themeTransitions";

const SwitchtoDarkMode: React.FC = () => {
  const { themeType, toggleTheme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  // Sync with theme context
  useEffect(() => {
    setIsDark(themeType === "dark");
  }, [themeType]);

  // Initialize from cookie
  useEffect(() => {
    const theme = getCookie("theme");
    setIsDark(theme === "dark");
  }, []);

  // Enhanced click handler with iOS support for both touch and click events
  const handleThemeToggle = async (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    // Prevent default to avoid double-firing on iOS
    event.preventDefault();
    
    // Update local state immediately for visual feedback
    setIsDark((prev) => !prev);
    
    // Use the iOS-compatible click handler
    await handleThemeToggleClick(event, async () => {
      await toggleTheme(event.currentTarget);
    });
  };

  return (
    <button
      title="Toggle Theme"
      className="theme-toggle-button"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      onClick={handleThemeToggle}
      onTouchEnd={handleThemeToggle} // Add touch support for iOS
      style={{ 
        // Ensure button is touchable on iOS
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation'
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      >
        {/* Moon (shows in light mode) */}
        <path
          className={`moon-icon ${!isDark ? "visible" : "hidden"}`}
          d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        />
        {/* Sun (shows in dark mode) */}
        <circle
          className={`sun-icon ${isDark ? "visible" : "hidden"}`}
          cx="12"
          cy="12"
          r="5"
        />
        <line className={`sun-icon ${isDark ? "visible" : "hidden"}`} x1="12" y1="1" x2="12" y2="3" />
        <line className={`sun-icon ${isDark ? "visible" : "hidden"}`} x1="12" y1="21" x2="12" y2="23" />
        <line className={`sun-icon ${isDark ? "visible" : "hidden"}`} x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line className={`sun-icon ${isDark ? "visible" : "hidden"}`} x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line className={`sun-icon ${isDark ? "visible" : "hidden"}`} x1="1" y1="12" x2="3" y2="12" />
        <line className={`sun-icon ${isDark ? "visible" : "hidden"}`} x1="21" y1="12" x2="23" y2="12" />
        <line className={`sun-icon ${isDark ? "visible" : "hidden"}`} x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line className={`sun-icon ${isDark ? "visible" : "hidden"}`} x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    </button>
  );
};

export default SwitchtoDarkMode;