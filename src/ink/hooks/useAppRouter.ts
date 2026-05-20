// src/ink/hooks/useAppRouter.ts
// ─────────────────────────────────────────────────────────────────────────────
// History-based router for the TUI.
//
// State model:
//   history: View[]  — navigation stack, last item is the current view.
//   history[0] is always "welcome" (the root that can never be popped).
//
// API:
//   view               — current (last) view, derived from history
//   history            — full stack, passed to AppShell for breadcrumbs
//   navigate(v)        — push a new view (go deeper)
//   navigateReplace(v) — replace the current view in-place (Tab cycling:
//                        lateral movement between sibling panels)
//   goBack()           — pop one level; no-op at root
//   goRoot()           — collapse to ["welcome"] (emergency/overlay exit)
//
// tokenEditing is co-located here because it gates the global useInput
// (isActive: !tokenEditing) to prevent quit/escape firing while the settings
// token editor is capturing keystrokes.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";

export type View = "welcome" | "settings" | "core" | "zones" | "npm" | "db" | "infra" | "env" | "wizard" | "instance-wizard" | "add-environment" | "env-detail";

export const PANEL_TABS = ["core", "zones", "npm", "db", "infra", "env"] as const;
export type PanelTab    = typeof PANEL_TABS[number];

export function useAppRouter() {
  const [history, setHistory] = useState<View[]>(["welcome"]);
  const view = history[history.length - 1] ?? "welcome";

  const [tokenEditing, setTokenEditing] = useState(false);

  // Sub-crumbs: internal navigation depth within a panel (e.g. zone name,
  // action panel, gallery).  Panels set these via onSubCrumbs().
  // Auto-cleared whenever the top-level view changes.
  const [subCrumbs, setSubCrumbs] = useState<string[]>([]);

  // Push: go deeper (welcome → zones, zones → wizard, etc.)
  const navigate = useCallback((v: View) => {
    setSubCrumbs([]);
    setHistory((prev) => [...prev, v]);
  }, []);

  // Replace current level in-place: used for Tab cycling between sibling panels.
  // Keeps the "came from welcome" entry intact without adding depth.
  const navigateReplace = useCallback((v: View) => {
    setSubCrumbs([]);
    setHistory((prev) => [...prev.slice(0, -1), v]);
  }, []);

  // Pop one level — the standard back gesture.
  const goBack = useCallback(() => {
    setSubCrumbs([]);
    setHistory((prev) => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  // Collapse to root — used only by the overlay emergency-exit (q/Esc while
  // watching an operation).  Clears the entire history so any dangling state
  // in intermediate views is abandoned cleanly.
  const goRoot = useCallback(() => {
    setSubCrumbs([]);
    setHistory(["welcome"]);
  }, []);

  return {
    view, history,
    navigate, navigateReplace, goBack, goRoot,
    tokenEditing, setTokenEditing,
    subCrumbs, setSubCrumbs,
  };
}
