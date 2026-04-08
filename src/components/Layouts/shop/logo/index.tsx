"use client";

import Link from "next/link";
import { useTheme } from "@/app/provider";

export function Logo() {
  const { themeType } = useTheme();

  return (
    <Link href="/" className="logo-link focus:ring-primary">
      <img
        src={
          themeType === "dark"
            ? "/images/home/dartlogowhite.svg"
            : "/images/home/dartlogo.svg"
        }
        alt="DART Logo"
        className="logo-image"
      />
    </Link>
  );
}