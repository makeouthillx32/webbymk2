import { useCallback, useEffect, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ChildProcess } from "child_process";
import type { StackOp } from "../components/DetachedStack.tsx";
import { linesToClipboard } from "../utils.ts";
import { popoutLogTail, popoutOpOutput } from "../../utils/terminalPopout.ts";

type UseOperationChromeParams = {
  bgOps: StackOp[];
  setBgOps: Dispatch<SetStateAction<StackOp[]>>;
  overlayOpId: number | null;
  setOverlayOpId: Dispatch<SetStateAction<number | null>>;
  overlayOp: StackOp | null;
  stackOpen: boolean;
  setStackOpen: Dispatch<SetStateAction<boolean>>;
  stackFocusId: number | null;
  setStackFocusId: Dispatch<SetStateAction<number | null>>;
  logProcRef: MutableRefObject<ChildProcess | null>;
  logOpIdRef: MutableRefObject<number | null>;
  copy: (value: string) => void;
  triggerDismissHook: (opId: number) => void;
  triggerRestartHook: (opId: number) => void;
  registerPopout: (opId: number) => void;
  dismissPopout: (opId: number) => void;
};

export function useOperationChrome({
  bgOps,
  setBgOps,
  overlayOpId,
  setOverlayOpId,
  overlayOp,
  stackOpen,
  setStackOpen,
  stackFocusId,
  setStackFocusId,
  logProcRef,
  logOpIdRef,
  copy,
  triggerDismissHook,
  triggerRestartHook,
  registerPopout,
  dismissPopout,
}: UseOperationChromeParams) {
  const [stackFocused, setStackFocused] = useState(false);
  const [stackManagerOpen, setStackManagerOpen] = useState(false);

  useEffect(() => {
    if (bgOps.length === 0) {
      setStackFocused(false);
      setStackOpen(false);
      setStackManagerOpen(false);
    }
  }, [bgOps.length, setStackOpen]);

  const markLogTailStopped = useCallback(() => {
    logProcRef.current?.kill();
    logProcRef.current = null;
    if (logOpIdRef.current !== null) {
      const stoppedId = logOpIdRef.current;
      setBgOps((prev) =>
        prev.map((o) => o.id === stoppedId ? { ...o, busy: false } : o)
      );
      logOpIdRef.current = null;
    }
  }, [logProcRef, logOpIdRef, setBgOps]);

  const detachOverlay = useCallback(() => {
    if (overlayOp?.isLog) markLogTailStopped();
    if (bgOps.length > 0) setStackOpen(true);
    setOverlayOpId(null);
  }, [overlayOp, bgOps.length, markLogTailStopped, setStackOpen, setOverlayOpId]);

  const handleOverlayQ = detachOverlay;
  const handleOverlayEsc = detachOverlay;

  const handleOverlayKill = useCallback(() => {
    if (!overlayOp) return;
    triggerDismissHook(overlayOp.id);
    setOverlayOpId(null);
    setStackOpen(true);
  }, [overlayOp, triggerDismissHook, setOverlayOpId, setStackOpen]);

  const handleOverlayEnter = useCallback(() => {
    setOverlayOpId(null);
  }, [setOverlayOpId]);

  const handleOverlayCopy = useCallback(() => {
    if (overlayOp) copy(linesToClipboard(overlayOp.lines));
  }, [overlayOp, copy]);

  const handleOverlayCopyTail = useCallback((tailLines: string[]) => {
    copy(linesToClipboard(tailLines));
  }, [copy]);

  const handleOverlayRestart = useCallback(() => {
    if (overlayOpId !== null) triggerRestartHook(overlayOpId);
  }, [overlayOpId, triggerRestartHook]);

  const handleOverlayPopout = useCallback(() => {
    if (!overlayOp) return;
    if (overlayOp.isLog && overlayOp.lines.length > 0) {
      const containerMatch = overlayOp.lines[0]?.match(/Streaming logs: (\S+)/);
      const container = containerMatch?.[1];
      markLogTailStopped();
      if (container) popoutLogTail(container);
    } else {
      popoutOpOutput(overlayOp.id, overlayOp.title, overlayOp.lines);
      registerPopout(overlayOp.id);
    }
    setOverlayOpId(null);
  }, [overlayOp, markLogTailStopped, setOverlayOpId, registerPopout]);

  const handleStackUp = useCallback(() => {
    setBgOps((prev) => {
      const idx = prev.findIndex((o) => o.id === stackFocusId);
      const next = (idx - 1 + prev.length) % prev.length;
      setStackFocusId(prev[next]?.id ?? null);
      return prev;
    });
  }, [setBgOps, stackFocusId, setStackFocusId]);

  const handleStackDown = useCallback(() => {
    setBgOps((prev) => {
      const idx = prev.findIndex((o) => o.id === stackFocusId);
      const next = (idx + 1) % prev.length;
      setStackFocusId(prev[next]?.id ?? null);
      return prev;
    });
  }, [setBgOps, stackFocusId, setStackFocusId]);

  const handleStackEnter = useCallback(() => {
    if (stackFocusId === null) return;
    setOverlayOpId(stackFocusId);
    setStackOpen(false);
  }, [stackFocusId, setOverlayOpId, setStackOpen]);

  const handleStackDismiss = useCallback(() => {
    const op = bgOps.find((o) => o.id === stackFocusId);
    if (op && (op.dismissable ?? !op.busy)) {
      triggerDismissHook(op.id);
      dismissPopout(op.id);
      const remaining = bgOps.filter((o) => o.id !== stackFocusId);
      setBgOps(remaining);
      setStackFocusId(remaining[remaining.length - 1]?.id ?? null);
      if (remaining.length === 0) {
        setStackOpen(false);
        setStackFocused(false);
      }
    }
  }, [bgOps, stackFocusId, triggerDismissHook, dismissPopout, setBgOps, setStackFocusId, setStackOpen]);

  const handleStackDismissAll = useCallback(() => {
    const dismissible = bgOps.filter((o) => o.dismissable ?? !o.busy);
    dismissible.forEach((o) => {
      triggerDismissHook(o.id);
      dismissPopout(o.id);
    });
    const running = bgOps.filter((o) => o.busy && !o.dismissable);
    setBgOps(running);
    setStackFocusId(running[running.length - 1]?.id ?? null);
    if (running.length === 0) {
      setStackOpen(false);
      setStackFocused(false);
    }
  }, [bgOps, triggerDismissHook, dismissPopout, setBgOps, setStackFocusId, setStackOpen]);

  const handleStackPopout = useCallback(() => {
    const op = bgOps.find((o) => o.id === stackFocusId);
    if (!op) return;
    if (op.isLog) {
      const containerMatch = op.lines[0]?.match(/Streaming logs: (\S+)/);
      const container = containerMatch?.[1];
      markLogTailStopped();
      if (container) popoutLogTail(container);
    } else {
      popoutOpOutput(op.id, op.title, op.lines);
      registerPopout(op.id);
    }
  }, [bgOps, stackFocusId, markLogTailStopped, registerPopout]);

  const handleStackCopy = useCallback(() => {
    const op = bgOps.find((o) => o.id === stackFocusId);
    if (op) copy(linesToClipboard(op.lines));
  }, [bgOps, stackFocusId, copy]);

  const handleStackCopyTail = useCallback(() => {
    const op = bgOps.find((o) => o.id === stackFocusId);
    if (op) copy(linesToClipboard(op.lines.slice(-8)));
  }, [bgOps, stackFocusId, copy]);

  const handleStackClose = useCallback(() => {
    setStackFocused(false);
  }, []);

  const handleStackHide = useCallback(() => {
    setStackOpen(false);
    setStackFocused(false);
  }, [setStackOpen]);

  const handleStackManagerClose = useCallback(() => {
    setStackManagerOpen(false);
  }, []);

  const toggleStackFocus = useCallback(() => {
    if (!stackOpen) setStackOpen(true);
    setStackFocused((f) => !f);
  }, [stackOpen, setStackOpen]);

  const toggleStackManager = useCallback(() => {
    setStackManagerOpen((open) => !open);
    if (!stackManagerOpen) setStackFocused(false);
  }, [stackManagerOpen]);

  return {
    stackFocused,
    stackManagerOpen,
    setStackManagerOpen,
    toggleStackFocus,
    toggleStackManager,
    handleOverlayQ,
    handleOverlayEsc,
    handleOverlayKill,
    handleOverlayEnter,
    handleOverlayCopy,
    handleOverlayCopyTail,
    handleOverlayRestart,
    handleOverlayPopout,
    handleStackUp,
    handleStackDown,
    handleStackEnter,
    handleStackDismiss,
    handleStackDismissAll,
    handleStackPopout,
    handleStackCopy,
    handleStackCopyTail,
    handleStackClose,
    handleStackHide,
    handleStackManagerClose,
  };
}
