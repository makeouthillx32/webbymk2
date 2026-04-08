"use client";

import { useEffect, useState } from "react";
import { getCookie } from "./cookieUtils";

export default function useThemeCookie(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const readTheme = () => {
    const cookieTheme = getCookie("theme");
    setTheme(cookieTheme === "dark" ? "dark" : "light");
  };

  useEffect(() => {
    readTheme();
    const interval = setInterval(readTheme, 300);
    return () => clearInterval(interval);
  }, []);

  return theme;
}
