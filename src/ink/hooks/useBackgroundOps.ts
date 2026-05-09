// src/ink/hooks/useBackgroundOps.ts
// ─────────────────────────────────────────────────────────────────────────────
// Background operation stack — multi-op streaming output system.
//
// Design:
//   • Multiple ops can run concurrently; each gets a unique numeric id.
//   • overlayOpId — which op is shown full-screen (null = main UI visible).
//   • stackOpen   — whether the DetachedStack pane is visible in the sidebar.
//   • stackFocusId — which op is "on top" (expanded) in the stack.
//
// Public surface:
//   runOp(title, asyncFn)       — start a streaming op shown in full overlay
//   openLogs(zone)              — open a live log-tail op for a zone container
//   runCreateZone(derivedZone)  — run the 6-step zone creation pipeline with
//                                 batched line buffering (80 ms window)
//
// addNotification, refreshZones, and setZones are injected because they
// originate from sibling hooks (useNotifications, useZoneManager) that are
// composed at the App level after this hook runs.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { unstable_batchedUpdates }       from "react-dom";
import type { ChildProcess }             from "child_process";

import type { Zone }       from "../../config/zones.ts";
import type { DerivedZone } from "../zone-scaffold.ts";
import type { StackOp }    from "../components/DetachedStack.tsx";

import { spawnLogTail }          from "../docker.ts";
import { drainStream }           from "../utils.ts";
import { loadZones }             from "../zone-store.ts";
import { createZonePipeline }    from "../zone-pipeline.ts";
import { appendPopoutLines, cleanupPopoutFile } from "../../utils/terminalPopout.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BackgroundOpsParams {
  addNotification: (msg: string, type?: "success" | "error" | "info") => void;
  refreshZones:    () => void | Promise<void>;
  setZones:        Dispatch<SetStateAction<Zone[]>>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBackgroundOps({
  addNotification,
  refreshZones,
  setZones,
}: BackgroundOpsParams) {
  // ── Op stack state ─────────────────────────────────────────────────────────
  const opIdRef    = useRef(0);
  const logOpIdRef = useRef<number | null>(null);
  const logProcRef = useRef<ChildProcess | null>(null);
  const popoutOps  = useRef(new Set<number>());  // ops popped out to external terminals

  const [bgOps,        setBgOps]        = useState<StackOp[]>([]);
  const [overlayOpId,  setOverlayOpId]  = useState<number | null>(null);
  const [stackOpen,    setStackOpen]    = useState(false);
  const [stackFocusId, setStackFocusId] = useState<number | null>(null);

  // Derived
  const anyBusy  = bgOps.some((o) => o.busy);
  const overlayOp = bgOps.find((o) => o.id === overlayOpId) ?? null;

  // ── Internal: allocate an op slot ─────────────────────────────────────────
  // autoOverlay=true  → starts in full overlay (user watches it immediately)
  // autoOverlay=false → starts directly in the background stack
  const _startOp = useCallback((
    title:       string,
    isLog:       boolean,
    autoOverlay: boolean,
  ): { id: number; addLine: (l: string) => void } => {
    const id = ++opIdRef.current;

    unstable_batchedUpdates(() => {
      setBgOps((prev) => [...prev, { id, title, lines: [], busy: true, isLog }]);
      setStackFocusId(id);
      if (autoOverlay) {
        setOverlayOpId(id);
        setStackOpen(false);
      } else {
        setStackOpen(true);
      }
    });

    const addLine = (l: string) => {
      setBgOps((prev) =>
        prev.map((o) =>
          o.id === id ? { ...o, lines: [...o.lines.slice(-300), l] } : o
        )
      );
      // If this op has been popped out, also write to its external terminal file.
      if (popoutOps.current.has(id)) {
        appendPopoutLines(id, [l]);
      }
    };

    return { id, addLine };
  }, []);

  // ── Streaming operation runner ─────────────────────────────────────────────
  const runOp = useCallback(
    (title: string, op: (onLine: (l: string) => void) => Promise<number>) => {
      const { id, addLine } = _startOp(title, false, true);
      op(addLine).then((code) => {
        addLine(code === 0 ? "✓ done" : `✗ exit ${code}`);
        setBgOps((prev) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));
        refreshZones();
      });
    },
    [_startOp, refreshZones],
  );

  // ── Zone creation — 6-step pipeline ───────────────────────────────────────
  // addLine calls are batched in an 80 ms window so heavy docker output
  // doesn't trigger dozens of re-renders per second.
  const runCreateZone = useCallback((zone: DerivedZone) => {
    const { id, addLine: rawAddLine } = _startOp(`Create  ${zone.label}`, false, true);

    let lineBuffer: string[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const addLine = (l: string) => {
      lineBuffer.push(l);
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          const flush = lineBuffer.splice(0);
          flushTimer  = null;
          flush.forEach(rawAddLine);
        }, 80);
      }
    };

    createZonePipeline(zone, addLine).then((code) => {
      // Flush any remaining buffered lines before marking done
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      lineBuffer.splice(0).forEach(rawAddLine);

      rawAddLine(code === 0 ? "✓ done" : `✗ exit ${code}`);
      setBgOps((prev) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));

      if (code === 0) {
        addNotification(`${zone.label} is live at ${zone.domain} ✓`, "success");
        loadZones(true).then(setZones);
      } else {
        addNotification(`Create "${zone.label}" failed — check [o] for output`, "error");
      }
      refreshZones();
    });
  }, [_startOp, addNotification, refreshZones, setZones]);

  // ── Open log-tail overlay ──────────────────────────────────────────────────
  // Kills any existing log tail before starting a new one (one live stream
  // at a time — switching containers replaces the previous tail).
  const openLogs = useCallback((zone: Zone) => {
    if (logProcRef.current) {
      logProcRef.current.kill();
      logProcRef.current = null;
      if (logOpIdRef.current !== null) {
        setBgOps((prev) =>
          prev.map((o) =>
            o.id === logOpIdRef.current ? { ...o, busy: false } : o
          )
        );
        logOpIdRef.current = null;
      }
    }

    const { id, addLine } = _startOp(`Logs  ${zone.label}`, true, true);
    logOpIdRef.current = id;
    addLine(`Streaming logs: ${zone.container}`);

    const proc = spawnLogTail(zone.container, 80);
    logProcRef.current = proc;
    drainStream(proc.stdout!, addLine);
    drainStream(proc.stderr!, addLine);
  }, [_startOp]);

  // ── Pop-out terminal management ────────────────────────────────────────────
  const registerPopout = useCallback((opId: number) => {
    popoutOps.current.add(opId);
  }, []);

  const dismissPopout = useCallback((opId: number) => {
    popoutOps.current.delete(opId);
    cleanupPopoutFile(opId);
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  return {
    bgOps,         setBgOps,
    overlayOpId,   setOverlayOpId,
    overlayOp,
    stackOpen,     setStackOpen,
    stackFocusId,  setStackFocusId,
    anyBusy,
    logProcRef,    logOpIdRef,
    runOp,
    runCreateZone,
    openLogs,
    registerPopout, dismissPopout,
  };
}
