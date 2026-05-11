// src/ink/hooks/useBackgroundOps.ts
// ─────────────────────────────────────────────────────────────────────────────
// Background operation stack - multi-op streaming output system.
//
// Design:
//   Multiple ops can run concurrently; each gets a unique numeric id.
//   overlayOpId -- which op is shown full-screen (null = main UI visible).
//   stackOpen   -- whether the DetachedStack pane is visible in the sidebar.
//   stackFocusId -- which op is "on top" (expanded) in the stack.
//
// Public surface:
//   runOp(title, asyncFn)         -- start an op immediately (always parallel)
//   runOpQueued(title, fn, pri?)  -- start immediately if idle, else enqueue by
//                                    priority ('now'>'next'>'later'). Use for
//                                    all Docker / DB lifecycle operations so they
//                                    run sequentially instead of competing.
//   openLogs(zone)                -- open a live log-tail op (never queued)
//   runCreateZone(derivedZone)    -- run the 6-step zone creation pipeline with
//                                    batched line buffering (80 ms window)
//
// addNotification, refreshZones, and setZones are injected because they
// originate from sibling hooks (useNotifications, useZoneManager) that are
// composed at the App level after this hook runs.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from "react";
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
import { registerShutdownHook }  from "../../utils/gracefulShutdown.js";
import { clearOpQueue }          from "../../utils/messageQueueManager.js";

import { QueryGuard }            from "../../utils/QueryGuard.js";
import { enqueue }               from "../../utils/messageQueueManager.js";
import type { QueuePriority, QueuedOp } from "../../utils/messageQueueManager.js";
import { useOpQueueProcessor }   from "./useQueueProcessor.js";

// Types

/** Signature shared by every runnable background operation. */
type OpFn = (onLine: (l: string) => void) => Promise<number>

interface BackgroundOpsParams {
  addNotification: (msg: string, type?: "success" | "error" | "info") => void;
  refreshZones:    () => void | Promise<void>;
  setZones:        Dispatch<SetStateAction<Zone[]>>;
}

// Hook

export function useBackgroundOps({
  addNotification,
  refreshZones,
  setZones,
}: BackgroundOpsParams) {
  // Op stack state
  const opIdRef    = useRef(0);
  const logOpIdRef = useRef<number | null>(null);
  const logProcRef = useRef<ChildProcess | null>(null);
  const popoutOps  = useRef(new Set<number>());

  // Stable QueryGuard for the op queue -- lazy-initialized so the class
  // constructor only runs once across the component's lifetime.
  const queryGuardRef = useRef<QueryGuard | null>(null);
  if (queryGuardRef.current === null) queryGuardRef.current = new QueryGuard();
  const queryGuard = queryGuardRef.current;

  const [bgOps,        setBgOps]        = useState<StackOp[]>([]);
  const [overlayOpId,  setOverlayOpId]  = useState<number | null>(null);
  const [stackOpen,    setStackOpen]    = useState(false);
  const [stackFocusId, setStackFocusId] = useState<number | null>(null);

  // Derived
  const anyBusy   = bgOps.some((o) => o.busy);
  const overlayOp = bgOps.find((o) => o.id === overlayOpId) ?? null;

  // Internal: allocate an op slot
  // autoOverlay=true  => starts in full overlay (user watches it immediately)
  // autoOverlay=false => starts directly in the background stack
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
      if (popoutOps.current.has(id)) {
        appendPopoutLines(id, [l]);
      }
    };

    return { id, addLine };
  }, []);

  // Streaming operation runner
  const runOp = useCallback(
    (title: string, op: (onLine: (l: string) => void) => Promise<number>) => {
      const { id, addLine } = _startOp(title, false, true);
      Promise.resolve()
        .then(() => op(addLine))
        .then(
          (code) => {
            addLine(code === 0 ? "✓ done" : `✗ exit ${code}`);
            setBgOps((prev) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));
            refreshZones();
          },
          () => {
            addLine("✗ op failed unexpectedly");
            setBgOps((prev) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));
            refreshZones();
          },
        );
    },
    [_startOp, refreshZones],
  );

  // Queued operation runner
  // Starts immediately when no build/lifecycle op is active; enqueues when
  // busy. Log-tail ops (isLog=true) are excluded from the busy check so
  // watching logs does not block a zone build from starting.
  const runOpQueued = useCallback(
    (title: string, op: OpFn, priority: QueuePriority = 'next') => {
      const buildBusy = bgOps.some((o) => o.busy && !o.isLog);
      const sameOpRunning = bgOps.some((o) => o.busy && !o.isLog && o.title === title);
      if (sameOpRunning) return;
      if (buildBusy) {
        const queued = enqueue({ id: title, label: title, priority, payload: op });
        if (queued) addNotification(`"${title}" queued`, 'info');
      } else {
        runOp(title, op);
      }
    },
    [bgOps, runOp, addNotification],
  );

  // Queue executor -- called by useOpQueueProcessor when idle
  const executeQueuedOp = useCallback(
    async (op: QueuedOp) => {
      const opFn = op.payload as OpFn;
      await new Promise<void>((resolve) => {
        const { id, addLine } = _startOp(op.label, false, true);
        Promise.resolve().then(() => opFn(addLine)).then(
          (code) => {
            addLine(code === 0 ? "✓ done" : `✗ exit ${code}`);
            setBgOps((prev) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));
            refreshZones();
            resolve();
          },
          () => {
            addLine('✗ op failed unexpectedly');
            setBgOps((prev) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));
            resolve();
          },
        );
      });
    },
    [_startOp, setBgOps, refreshZones],
  );

  // Drain the queue whenever all build/lifecycle ops have finished.
  // Log-tails excluded from the busy check: watching logs does not stall the queue.
  useOpQueueProcessor({
    executeQueuedOp,
    isUiBusy: bgOps.some((o) => o.busy && !o.isLog),
    queryGuard,
  });

  // Register teardown with the shutdown layer so log processes and the op
  // queue are cleaned up before terminal restoration on SIGINT/SIGTERM/SIGHUP.
  useEffect(() => {
    registerShutdownHook(() => {
      clearOpQueue();
      if (logProcRef.current) {
        logProcRef.current.kill();
        logProcRef.current = null;
      }
    });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Zone creation -- 6-step pipeline
  // addLine calls are batched in an 80 ms window so heavy docker output
  // does not trigger dozens of re-renders per second.
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
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      lineBuffer.splice(0).forEach(rawAddLine);

      rawAddLine(code === 0 ? "✓ done" : `✗ exit ${code}`);
      setBgOps((prev) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));

      if (code === 0) {
        addNotification(`${zone.label} is live at ${zone.domain} ✓`, "success");
        loadZones(true).then(setZones);
      } else {
        addNotification(`Create "${zone.label}" failed -- check [o] for output`, "error");
      }
      refreshZones();
    }, () => {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      lineBuffer.splice(0).forEach(rawAddLine);
      rawAddLine("✗ op failed unexpectedly");
      setBgOps((prev) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));
      addNotification(`Create "${zone.label}" failed -- check [o] for output`, "error");
      refreshZones();
    });
  }, [_startOp, addNotification, refreshZones, setZones]);

  // Open log-tail overlay
  // Kills any existing log tail before starting a new one (one live stream
  // at a time -- switching containers replaces the previous tail).
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

  // Pop-out terminal management
  const registerPopout = useCallback((opId: number) => {
    popoutOps.current.add(opId);
  }, []);

  const dismissPopout = useCallback((opId: number) => {
    popoutOps.current.delete(opId);
    cleanupPopoutFile(opId);
  }, []);

  return {
    bgOps,         setBgOps,
    overlayOpId,   setOverlayOpId,
    overlayOp,
    stackOpen,     setStackOpen,
    stackFocusId,  setStackFocusId,
    anyBusy,
    logProcRef,    logOpIdRef,
    runOp,         runOpQueued,
    runCreateZone,
    openLogs,
    registerPopout, dismissPopout,
  };
}
