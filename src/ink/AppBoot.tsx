import React from "react";
import { render } from "ink";
import { setupGracefulShutdown } from "../utils/gracefulShutdown.js";
import { App } from "./App.tsx";
import { AppProviders } from "./AppProviders.tsx";

/**
 * Production npm-Ink boot wrapper.
 *
 * This is the only file in this split that should perform terminal side
 * effects. Keeping render here makes App.tsx import-safe for local-engine
 * preview work.
 */
export function bootInkApp() {
  setupGracefulShutdown();

  return render(
    <AppProviders>
      <App />
    </AppProviders>,
    {
      patchConsole: false,
      exitOnCtrlC: false,
    },
  );
}

bootInkApp();
