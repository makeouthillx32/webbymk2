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
import type { ChildProcess }             from "child_process";

import type { Zone }       from "../../config/zones.ts";
import type { DerivedZone } from "../zone-scaffold.ts";
import type { StackOp }    from "../components/DetachedStack.tsx";

import { spawnLogTail }          from "../docker.ts";
import { drainStream }           from "../utils.ts";
import { loadZones }             from "../zone-store.ts";
import { log }                   from "../logger.ts";
import { createZonePipeline }    from "../zone-pipeline.ts";
import { appendPopoutLines, cleanupPopoutFile } from "../../utils/terminalPopout.ts";
import { registerShutdownHook }  from "../../utils/gracefulShutdown.js";
import { clearOpQueue }          from "../../utils/messageQueueManager.js";

import { QueryGuard }            from "../../utils/QueryGuard.js";
import { enqueue }               from "../../utils/messageQueueManager.js";
import type { QueuePriority, QueuedOp } from "../../utils/messageQueueManager.js";
import { useOpQueueProcessor }   from "./useQueueProcessor.js";
import { eventBus }              from "../../utils/eventBus.js";

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
  const opIdRef       = useRef(0);
  const logOpIdRef    = useRef<number | null>(null);
  const logProcRef    = useRef<ChildProcess | null>(null);
  const popoutOps     = useRef(new Set<number>());
  /** Per-op dismiss callbacks — fired by App.tsx handleStackDismiss when the op
   *  is removed.  Dev-mode ops register here so cleanup runs on dismiss. */
  const dismissHooks  = useRef(new Map<number, () => void>());
  /** Per-op restart callbacks — fired when [r] is pressed in the overlay. */
  const restartHooks  = useRef(new Map<number, () => void>());

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

    setBgOps((prev) => [...prev, { id, title, lines: [], busy: true, isLog }]);
    setStackFocusId(id);
    eventBus.emit("op_started", { id, title, isLog });
    if (autoOverlay) {
      setOverlayOpId(id);
      setStackOpen(false);
    } else {
      setStackOpen(true);
    }

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

  // Mark an op finished. Successful ops auto-dismiss after a short flash so the
  // stack stays clean ("all others stop on finish"). The dev/log-tail ops
  // (isLog or dismissable) are the persistent exception — they stay until
  // manually stopped. Failures also persist so they can be inspected.
  const AUTO_DISMISS_MS = 6000;
  const finishOp = useCallback((id: number, code: number) => {
    setBgOps((prev) => prev.map((o) => (o.id === id ? { ...o, busy: false } : o)));
    if (code === 0) {
      setTimeout(() => {
        setBgOps((prev) => prev.filter((o) => !(o.id === id && !o.isLog && !o.dismissable)));
        dismissHooks.current.delete(id);
      }, AUTO_DISMISS_MS);
    }
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
            finishOp(id, code);
            eventBus.emit("op_completed", { id, title, code });
            refreshZones();
          },
          (err) => {
            const msg = err instanceof Error ? err.message : String(err);
            addLine(`✗ ${msg}`);
            finishOp(id, 1);
            eventBus.emit("op_failed", { id, title });
            refreshZones();
          },
        );
    },
    [_startOp, refreshZones, finishOp],
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
        if (queued) {
          addNotification(`"${title}" queued`, 'info');
          eventBus.emit("op_queued", { title, priority });
        }
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
            finishOp(id, code);
            eventBus.emit("op_completed", { id, title: op.label, code });
            refreshZones();
            resolve();
          },
          (err) => {
            const msg = err instanceof Error ? err.message : String(err);
            addLine(`✗ ${msg}`);
            finishOp(id, 1);
            eventBus.emit("op_failed", { id, title: op.label });
            resolve();
          },
        );
      });
    },
    [_startOp, setBgOps, refreshZones, finishOp],
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
  const runCreateZone = useCallback((zone: DerivedZone, dockerUrl?: string) => {
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

    createZonePipeline(zone, addLine, dockerUrl).then((code) => {
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
    }, (err) => {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      lineBuffer.splice(0).forEach(rawAddLine);
      const msg = err instanceof Error ? err.message : String(err);
      rawAddLine(`✗ ${msg}`);
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

  /**
   * Called by App.tsx `handleStackDismiss` (and DismissAll) for every op being
   * removed.  If the op registered a dismiss hook, runs it and clears the entry.
   */
  const triggerDismissHook = useCallback((opId: number) => {
    const hook = dismissHooks.current.get(opId);
    if (hook) {
      dismissHooks.current.delete(opId);
      hook();
    }
  }, []);

  const triggerRestartHook = useCallback((opId: number) => {
    const hook = restartHooks.current.get(opId);
    if (hook) hook();
  }, []);

  /**
   * Start (or stop) a dev-mode container as a background op.
   *
   *   - If container is already running  → run stopFn, op finishes when done
   *   - If container is not running      → run startFn; op stays dismissable
   *     in the stack while the container lives.  Dismissing it calls stopFn.
   *
   * The op is marked dismissable=true so the user can [x]-dismiss it from the
   * stack even while the container is running — the dismiss hook fires stopFn.
   */
  const runDevModeOp = useCallback((
    label:     string,
    container: string,
    startFn:   (onLine: (l: string) => void) => Promise<number>,
    stopFn:    (onLine: (l: string) => void) => Promise<number>,
  ) => {
    // Auto-cleanup: remove all finished dev ops for this label so the stack
    // doesn't accumulate stale entries across repeated start/stop cycles.
    setBgOps((prev) => {
      const devTitles = new Set([`Dev  ${label}`, `Stop Dev  ${label}`]);
      const toRemove  = prev.filter((o) => !o.busy && devTitles.has(o.title));
      toRemove.forEach((o) => {
        dismissHooks.current.delete(o.id);
        restartHooks.current.delete(o.id);
      });
      return toRemove.length === 0
        ? prev
        : prev.filter((o) => o.busy || !devTitles.has(o.title));
    });

    const { id, addLine } = _startOp(`Dev  ${label}`, false, true);

    setBgOps((prev) =>
      prev.map((o) => o.id === id ? { ...o, dismissable: true } : o)
    );

    import("../docker.ts").then(({ getStatus }) => getStatus(container)).then((status) => {
      const running = status === "running" || status === "starting";

      if (running) {
        log.info("dev", "container already running — stopping", { label, container });
        addLine(`Dev container "${container}" is running — stopping…`);
        return stopFn((l) => { addLine(l); log.docker(label, "stop", l); }).then((code) => {
          addLine(code === 0 ? "✓ stopped" : `✗ stop exited ${code}`);
          if (code === 0) log.info("dev", "stopped", { label, container });
          else            log.error("dev", "stop failed", { label, container, exit: code });
          setBgOps((prev) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));
        });
      }

      log.info("dev", "starting", { label, container });
      return startFn((l) => { addLine(l); log.docker(label, "dev", l); }).then((code) => {
        if (code !== 0) {
          log.error("dev", "start failed", { label, container, exit: code });
          addLine(`✗ start failed (exit ${code})`);
          setBgOps((prev) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));
          return;
        }

        log.info("dev", "container started — streaming logs", { label, container });

        // Mutable ref to the active log process — shared by dismiss + restart hooks
        // so both always operate on the latest process regardless of restarts.
        let currentLogProc: ReturnType<typeof spawnLogTail> | null = null;

        // Wrap addLine to detect Next.js "Ready in Xs" and flip devReady badge.
        const devAddLine = (l: string) => {
          addLine(l);
          log.docker(label, "dev", l);
          if (/Ready in \d/.test(l)) {
            log.info("dev", "Next.js ready", { label, container });
            setBgOps((prev) => prev.map((o) =>
              o.id === id ? { ...o, devReady: true } : o
            ));
          }
        };

        // Start streaming logs — called on initial start and after each restart.
        function startStreaming() {
          setBgOps((prev) => prev.map((o) =>
            o.id === id
              ? { ...o, busy: true, isLog: true, dismissable: true, devReady: false }
              : o
          ));
          const logProc = spawnLogTail(container, 50);
          currentLogProc = logProc;
          drainStream(logProc.stdout!, devAddLine);
          drainStream(logProc.stderr!, devAddLine);
          logProc.on("close", () => {
            if (currentLogProc === logProc) {
              log.warn("dev", "log stream closed", { label, container });
              setBgOps((prev) => prev.map((o) =>
                o.id === id ? { ...o, busy: false } : o
              ));
            }
          });
        }

        addLine(`─── streaming dev logs (Next.js starting…) ───`);
        startStreaming();

        // Dismiss hook — kill stream + stop container
        dismissHooks.current.set(id, () => {
          currentLogProc?.kill();
          restartHooks.current.delete(id);
          log.info("dev", "dismissed — stopping container", { label, container });
          const { id: stopId, addLine: stopLine } = _startOp(`Stop Dev  ${label}`, false, false);
          stopFn((l) => { stopLine(l); log.docker(label, "stop", l); }).then((code) => {
            stopLine(code === 0 ? "✓ stopped" : `✗ stop exited ${code}`);
            if (code === 0) log.info("dev", "stopped via dismiss", { label, container });
            else            log.error("dev", "stop via dismiss failed", { label, container, exit: code });
            setBgOps((prev) => prev.map((o) =>
              o.id === stopId ? { ...o, busy: false } : o
            ));
          }).catch((err) => {
            stopLine(`✗ stop error: ${String(err)}`);
            log.error("dev", "stop via dismiss threw", { label, container, err: String(err) });
            setBgOps((prev) => prev.map((o) =>
              o.id === stopId ? { ...o, busy: false } : o
            ));
          });
        });

        // Restart hook — hard restart: stop → start → resume streaming
        restartHooks.current.set(id, () => {
          currentLogProc?.kill();
          currentLogProc = null;
          setBgOps((prev) => prev.map((o) =>
            o.id === id ? { ...o, devReady: false, busy: true, isLog: false } : o
          ));
          addLine(`─── hard restart — stopping container… ───`);
          stopFn(addLine)
            .then(() => {
              addLine(`─── starting fresh container… ───`);
              return startFn(addLine);
            })
            .then((restartCode) => {
              if (restartCode !== 0) {
                addLine(`✗ restart failed (exit ${restartCode})`);
                setBgOps((prev) => prev.map((o) =>
                  o.id === id ? { ...o, busy: false } : o
                ));
                return;
              }
              setBgOps((prev) => prev.map((o) =>
                o.id === id ? { ...o, lines: [] } : o
              ));
              addLine(`─── streaming dev logs (Next.js starting…) ───`);
              startStreaming();
            })
            .catch((err) => {
              addLine(`✗ restart error: ${String(err)}`);
              setBgOps((prev) => prev.map((o) =>
                o.id === id ? { ...o, busy: false } : o
              ));
            });
        });
      });
    }).catch((err) => {
      addLine(`✗ docker status error: ${String(err)}`);
      setBgOps((prev) => prev.map((o) => o.id === id ? { ...o, busy: false } : o));
    });
  }, [_startOp, setBgOps]);

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
    runDevModeOp,
    triggerDismissHook,
    triggerRestartHook,
    registerPopout, dismissPopout,
  };
}
