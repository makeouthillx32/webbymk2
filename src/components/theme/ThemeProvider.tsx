// components/theme/ThemeProvider.tsx
"use client";

import React, { createContext, useEffect, useState } from "react";
import { Theme } from "@/types/theme";
import { defaultThemeId, themeMap } from "@/themes";
import { setCookie, getCookie } from "@/lib/cookieUtils";

export interface ThemeContextType {
  // Theme settings
  themeId: string;
  setThemeId: (id: string) => void;
  
  // Color mode settings (dark/light)
  themeType: "light" | "dark";
  toggleTheme: () => void;
  
  // Utility functions
  getTheme: () => Theme;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [themeId, setThemeIdState] = useState<string>(defaultThemeId);
  const [themeType, setThemeType] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  const getTheme = (): Theme => {
    return themeMap[themeId] || themeMap[defaultThemeId];
  };

  const setThemeId = (id: string) => {
    if (themeMap[id]) {
      setThemeIdState(id);
      setCookie("themeId", id, { path: "/", maxAge: 31536000 });
    }
  };

  const toggleTheme = () => {
    const newThemeType = themeType === "light" ? "dark" : "light";
    setThemeType(newThemeType);
    setCookie("themeType", newThemeType, { path: "/", maxAge: 31536000 });
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setMounted(true);
      
      const savedThemeId = getCookie("themeId") || localStorage.getItem("themeId");
      if (savedThemeId && themeMap[savedThemeId]) {
        setThemeIdState(savedThemeId);
      }
      
      const savedThemeType = getCookie("themeType") || localStorage.getItem("themeType");
      if (savedThemeType === "light" || savedThemeType === "dark") {
        setThemeType(savedThemeType);
      } else {
        const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setThemeType(systemPrefersDark ? "dark" : "light");
      }
    }
  }, []);

  // Apply theme variables when theme or mode changes
  useEffect(() => {
    if (!mounted) return;
    
    const html = document.documentElement;
    const theme = getTheme();
    const variables = themeType === "dark" ? theme.dark : theme.light;
    
    for (const [key, value] of Object.entries(variables)) {
      html.style.setProperty(key, value);
    }
    
    html.classList.remove("light", "dark");
    html.classList.add(themeType);
    
    localStorage.setItem("themeId", themeId);
    localStorage.setItem("themeType", themeType);
  }, [themeId, themeType, mounted]);

  const contextValue: ThemeContextType = {
    themeId,
    setThemeId,
    themeType,
    toggleTheme,
    getTheme,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;