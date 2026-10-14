// src/ink/hooks/usePortWatchdog.ts
// Runs the published-port watchdog for the life of the TUI, on every view —
// unlike useZoneManager's status poll, which pauses off the status screens.
// See port-watchdog.ts for what it detects and why.

import { useEffect } from "react";
import { join } from "path";
import { PROJECT_DIR } from "../../config/stack.ts";
import { dbCoreLanIp } from "../control-db.ts";
import { log } from "../logger.ts";
import { startPortWatchdog } from "../port-watchdog.ts";

export function usePortWatchdog(
  addNotification: (msg: string, type?: "success" | "error" | "info") => void,
): void {
  useEffect(() => {
    if (process.env["UNAXIS_PORT_WATCHDOG"] === "0") return;
    const host = dbCoreLanIp();
    if (!host) {
      log.warn("port-watchdog", "core LAN IP unknown — watchdog off (set it: unaxis media facts <env> --lan-ip)");
      return;
    }
    return startPortWatchdog(host, join(PROJECT_DIR, "logs", ".port-watchdog.lock"), {
      onLine: (msg, level) => {
        log[level]("port-watchdog", msg);
        addNotification(msg, level === "info" ? "success" : "error");
      },
    });
    // addNotification is stable for the TUI's lifetime; start once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
