"use client";

// src/app/provider.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Re-export barrel — stable public path for the provider stack.
//
// All zone layout.tsx files import from "@/app/provider". This file keeps
// that path intact while the implementation lives in providers/ sub-modules
// so each concern can be reasoned about and tested independently.
//
// What each sub-module owns:
//   Providers.tsx    — compose layer (NextThemesProvider → Auth → Theme)
//   AuthProvider.tsx — Supabase client, session, auth listeners, iOS handlers,
//                      AuthContext, RoleProvider, protected-route redirect
//   ThemeProvider.tsx — CSS variable application, font loading, ThemeContext
// ─────────────────────────────────────────────────────────────────────────────

export { Providers }                         from "./providers/Providers";
export { useTheme }                          from "./providers/ThemeProvider";
export { useAuth, useIOSSessionRefresh }     from "./providers/AuthProvider";
