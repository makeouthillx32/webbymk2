import React, { type ReactNode } from "react";
import { KeybindingWire } from "./KeybindingWire.tsx";
import { NotificationsProvider } from "./components/Notifications.tsx";
import { TerminalSizeProvider } from "./components/TerminalSizeContext.tsx";
import { TerminalWriteProvider } from "./useTerminalNotification.ts";

type AppProvidersProps = {
  children: ReactNode;
  write?: (data: string) => void;
};

export function AppProviders({
  children,
  write = data => {
    process.stdout.write(data);
  },
}: AppProvidersProps) {
  return (
    <TerminalWriteProvider value={write}>
      <TerminalSizeProvider>
        <KeybindingWire>
          <NotificationsProvider>{children}</NotificationsProvider>
        </KeybindingWire>
      </TerminalSizeProvider>
    </TerminalWriteProvider>
  );
}
