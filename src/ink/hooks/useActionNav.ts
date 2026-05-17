// src/ink/hooks/useActionNav.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reusable action-panel navigation.
//
// Both ZonesView and CoreView manage an action list cursor with identical
// disabled-skipping up/down logic.  This hook owns that state so neither
// view has to re-implement it.
//
// Usage:
//   const nav = useActionNav(activeActions);
//   // in useInput:
//   if (key.upArrow || input === "k") { nav.moveUp(); return; }
//   if (key.downArrow || input === "j") { nav.moveDown(); return; }
//   // open action panel:
//   nav.reset(firstEnabled(zone));
//   // read selection:
//   const action = actions[nav.selected];
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import type { Action } from "../panels/Action/index.tsx";

export interface ActionNav {
  selected:    number;
  setSelected: (idx: number) => void;
  moveUp:      () => void;
  moveDown:    () => void;
  /** Reset cursor — pass the index to land on (e.g. firstEnabled result). */
  reset:       (idx?: number) => void;
}

export function useActionNav(actions: Action[]): ActionNav {
  const [selected, setSelected] = useState(0);

  const moveUp = useCallback(() => {
    setSelected((s) => {
      let next = s - 1;
      while (next >= 0 && actions[next]?.disabled) next--;
      return next >= 0 ? next : s;
    });
  }, [actions]);

  const moveDown = useCallback(() => {
    setSelected((s) => {
      let next = s + 1;
      while (next < actions.length && actions[next]?.disabled) next++;
      return next < actions.length ? next : s;
    });
  }, [actions]);

  const reset = useCallback((idx = 0) => setSelected(idx), []);

  return { selected, setSelected, moveUp, moveDown, reset };
}
