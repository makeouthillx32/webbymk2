import React, { type ReactNode } from "react";
import { AppShell } from "./components/AppShell.tsx";
import { AlternateScreen } from "./components/AlternateScreen.tsx";
import { OperationOverlay } from "./OperationOverlay.tsx";
import { StartupScreen } from "./components/StartupScreen.tsx";
import { ZoneWizardScreen } from "../screens/ZoneWizardScreen.js";
import { StackManagerScreen } from "../screens/StackManagerScreen.js";

type AppFrameProps = {
  children: ReactNode;
  noSplash: boolean;
  splashDone: boolean;
  onSplashDone: () => void;
  onQuit: () => void;
  view: string;
  history: string[];
  subCrumbs: string[];
  bgOps: any[];
  overlayOpId: number | null;
  overlayOp: any;
  stackOpen: boolean;
  stackFocused: boolean;
  stackFocusId: number | null;
  stackManagerOpen: boolean;
  notifications: any[];
  didCopy: boolean;
  activeEnvName?: string;
  activeEnvType?: string;
  copy: (value: string) => void;
  goBack: () => void;
  runCreateZone: (value: any) => void;
  onOverlayQ: () => void;
  onOverlayEsc: () => void;
  onOverlayKill: () => void;
  onOverlayEnter: () => void;
  onOverlayCopy: () => void;
  onOverlayCopyTail: (lines: string[]) => void;
  onOverlayRestart: () => void;
  onOverlayPopout: () => void;
  onStackUp: () => void;
  onStackDown: () => void;
  onStackEnter: () => void;
  onStackDismiss: () => void;
  onStackDismissAll: () => void;
  onStackPopout: () => void;
  onStackCopy: () => void;
  onStackCopyTail: () => void;
  onStackClose: () => void;
  onStackHide: () => void;
  onStackManagerClose: () => void;
  setStackManagerOpen: (value: boolean) => void;
};

export function AppFrame({
  children,
  noSplash,
  splashDone,
  onSplashDone,
  onQuit,
  view,
  history,
  subCrumbs,
  bgOps,
  overlayOpId,
  overlayOp,
  stackOpen,
  stackFocused,
  stackFocusId,
  stackManagerOpen,
  notifications,
  didCopy,
  activeEnvName,
  activeEnvType,
  copy,
  goBack,
  runCreateZone,
  onOverlayQ,
  onOverlayEsc,
  onOverlayKill,
  onOverlayEnter,
  onOverlayCopy,
  onOverlayCopyTail,
  onOverlayRestart,
  onOverlayPopout,
  onStackUp,
  onStackDown,
  onStackEnter,
  onStackDismiss,
  onStackDismissAll,
  onStackPopout,
  onStackCopy,
  onStackCopyTail,
  onStackClose,
  onStackHide,
  onStackManagerClose,
  setStackManagerOpen,
}: AppFrameProps) {
  return (
    <AlternateScreen>
      {!splashDone && (
        <StartupScreen
          instant={noSplash}
          onDone={onSplashDone}
          onQuit={onQuit}
          bgOps={bgOps}
        />
      )}

      {splashDone && overlayOpId !== null && (
        <OperationOverlay
          title={overlayOp?.title ?? ""}
          lines={overlayOp?.lines ?? []}
          busy={overlayOp?.busy ?? false}
          mode={overlayOp?.isLog ? "logs" : "output"}
          dismissable={overlayOp?.dismissable}
          didCopy={didCopy}
          onQ={onOverlayQ}
          onEsc={onOverlayEsc}
          onKill={onOverlayKill}
          onEnter={onOverlayEnter}
          devReady={overlayOp?.devReady}
          onCopy={onOverlayCopy}
          onCopyTail={onOverlayCopyTail}
          onRestart={onOverlayRestart}
          onPopout={onOverlayPopout}
        />
      )}

      {splashDone && overlayOpId === null && stackManagerOpen && (
        <StackManagerScreen
          ops={bgOps}
          focusedId={stackFocusId}
          didCopy={didCopy}
          onUp={onStackUp}
          onDown={onStackDown}
          onEnter={() => {
            onStackEnter();
            setStackManagerOpen(false);
          }}
          onDismiss={onStackDismiss}
          onDismissAll={onStackDismissAll}
          onPopout={onStackPopout}
          onCopy={onStackCopy}
          onClose={onStackManagerClose}
        />
      )}

      {splashDone && overlayOpId === null && !stackManagerOpen && view === "wizard" && (
        <ZoneWizardScreen
          onDone={(derived) => {
            goBack();
            runCreateZone(derived);
          }}
          onCancel={goBack}
          copy={copy}
          didCopy={didCopy}
        />
      )}

      {splashDone && overlayOpId === null && !stackManagerOpen && view !== "wizard" && (
        <AppShell
          view={view as any}
          history={history as any}
          subCrumbs={subCrumbs}
          bgOps={bgOps}
          stackOpen={stackOpen}
          stackFocused={stackFocused}
          stackFocusId={stackFocusId}
          notifications={notifications}
          didCopy={didCopy}
          activeEnvName={activeEnvName}
          activeEnvType={activeEnvType as any}
          onStackUp={onStackUp}
          onStackDown={onStackDown}
          onStackEnter={onStackEnter}
          onStackDismiss={onStackDismiss}
          onStackDismissAll={onStackDismissAll}
          onStackPopout={onStackPopout}
          onStackCopy={onStackCopy}
          onStackCopyTail={onStackCopyTail}
          onStackClose={onStackClose}
          onStackHide={onStackHide}
        >
          {children}
        </AppShell>
      )}
    </AlternateScreen>
  );
}
