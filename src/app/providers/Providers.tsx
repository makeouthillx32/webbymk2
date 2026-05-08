"use client";

// src/app/providers/Providers.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Thin compose layer — assembles the provider stack used by every zone.
//
// Tree (outermost → innermost):
//   NextThemesProvider        — next-themes dark/light class toggle
//   AuthProviderWrapper       — Supabase client, session, auth listeners,
//                               SessionContextProvider, InternalAuthProvider,
//                               RoleProvider, IOSSessionManager
//   ThemeProviderWrapper      — CSS variable application, font loading,
//                               ThemeContext
//   {children}
//
// All zone layout.tsx files import { Providers } from "@/app/provider" (the
// re-export barrel one level up). This file is the implementation; the barrel
// is the stable public path so zone overlays never need editing.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { Session } from "@supabase/auth-helpers-nextjs";
import { AuthProviderWrapper }  from "./AuthProvider";
import { ThemeProviderWrapper } from "./ThemeProvider";

export const Providers: React.FC<{
  children: React.ReactNode;
  session?: Session | null;
}> = ({ children, session }) => (
  <NextThemesProvider attribute="class" defaultTheme="light">
    <AuthProviderWrapper session={session}>
      <ThemeProviderWrapper>
        {children}
      </ThemeProviderWrapper>
    </AuthProviderWrapper>
  </NextThemesProvider>
);
