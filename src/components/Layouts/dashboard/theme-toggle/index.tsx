import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookieUtils";
import { useTheme } from "@/app/provider";
import { handleThemeToggleClick } from "@/utils/themeTransitions";
import { Moon, Sun } from "./icons";

const THEMES = [
  {
    name: "light",
    Icon: Sun,
  },
  {
    name: "dark",
    Icon: Moon,
  },
];

export function ThemeToggleSwitch() {
  const { toggleTheme } = useTheme();
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Get the current theme from your cookie system
    const theme = getCookie("theme");
    setIsDark(theme === "dark");
  }, []);

  // Enhanced click handler with iOS support for both touch and click events
  const handleToggle = async (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    // Prevent default to avoid double-firing on iOS
    event.preventDefault();
    
    // Update local state immediately for visual feedback
    setIsDark((prev) => !prev);
    
    // Use the iOS-compatible click handler
    await handleThemeToggleClick(event, async () => {
      await toggleTheme(event.currentTarget);
    });
  };

  if (!mounted) {
    return null;
  }

  return (
    <button
      onClick={handleToggle}
      onTouchEnd={handleToggle} // Add touch support for iOS
      className="group rounded-full bg-gray-3 p-[5px] text-[hsl(var(--foreground))] outline-1 outline-[hsl(var(--sidebar-primary))] focus-visible:outline dark:bg-[hsl(var(--background))] dark:text-current"
      style={{ 
        // Ensure button is touchable on iOS
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation'
      }}
    >
      <span className="sr-only">
        Switch to {isDark ? "light" : "dark"} mode
      </span>

      <span aria-hidden className="relative flex gap-2.5">
        {/* Indicator - moves based on isDark state */}
        <span className={cn(
          "absolute size-[38px] rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] transition-all",
          isDark 
            ? "translate-x-[48px] border-none bg-[hsl(var(--secondary))] group-hover:bg-[hsl(var(--accent))]"
            : ""
        )} />

        {THEMES.map(({ name, Icon }) => (
          <span
            key={name}
            className={cn(
              "relative grid size-[38px] place-items-center rounded-full",
              name === "dark" && isDark && "text-[hsl(var(--foreground))]",
            )}
          >
            <Icon />
          </span>
        ))}
      </span>
    </button>
  );
}