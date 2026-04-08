// components/POS/PrinterManager/index.tsx
"use client";

import { useState, useCallback } from "react";
import {
  canUseSerial, canUseBluetooth,
  connectUSB, connectBluetooth,
  disconnectUSB, disconnectBluetooth,
} from "@/lib/thermalPrinter";
import type { PrinterConnection } from "@/lib/thermalPrinter";
import "./styles.scss";

interface PrinterManagerProps {
  connection: PrinterConnection | null;
  onConnectionChange: (conn: PrinterConnection | null) => void;
  paperWidth: 58 | 80;
  onPaperWidthChange: (w: 58 | 80) => void;
}

export function PrinterManager({
  connection,
  onConnectionChange,
  paperWidth,
  onPaperWidthChange,
}: PrinterManagerProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = !!connection;

  const handleConnectUSB = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const conn = await connectUSB();
      onConnectionChange(conn);
    } catch (e: any) {
      if (e.name !== "NotFoundError") setError(e.message);
    } finally {
      setConnecting(false);
    }
  }, [onConnectionChange]);

  const handleConnectBluetooth = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const conn = await connectBluetooth();
      onConnectionChange(conn);
    } catch (e: any) {
      if (e.name !== "NotFoundError") setError(e.message);
    } finally {
      setConnecting(false);
    }
  }, [onConnectionChange]);

  const handleDisconnect = useCallback(async () => {
    if (!connection) return;
    if (connection.type === "usb") await disconnectUSB(connection);
    else disconnectBluetooth(connection);
    onConnectionChange(null);
  }, [connection, onConnectionChange]);

  return (
    <div className="pm">
      {/* Status bar */}
      <div className="pm__status">
        <span className={`pm__dot ${connected ? "pm__dot--on" : ""}`} />
        <span className="pm__label">
          {connected
            ? <>Printer: <strong>{connection!.name}</strong> ({connection!.type === "usb" ? "USB" : "Bluetooth"})</>
            : "No printer connected"}
        </span>

        {connected && (
          <button type="button" className="pm__disconnect" onClick={handleDisconnect}>
            Disconnect
          </button>
        )}
      </div>

      {/* Connect buttons — shown when no printer connected */}
      {!connected && (
        <div className="pm__connect-row">
          {canUseSerial() && (
            <button
              type="button"
              className="pm__btn"
              onClick={handleConnectUSB}
              disabled={connecting}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 22V8M5 12H2a10 10 0 0 0 20 0h-3"/>
                <path d="M12 8V2M9 5h6"/>
              </svg>
              {connecting ? "Connecting…" : "Connect USB"}
            </button>
          )}

          {canUseBluetooth() && (
            <button
              type="button"
              className="pm__btn"
              onClick={handleConnectBluetooth}
              disabled={connecting}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/>
              </svg>
              {connecting ? "Connecting…" : "Connect Bluetooth"}
            </button>
          )}

          {!canUseSerial() && !canUseBluetooth() && (
            <span className="pm__unavailable">
              Use Chrome or Edge to connect a printer via USB or Bluetooth
            </span>
          )}

          {/* Paper width toggle */}
          <div className="pm__paper-row">
            <span className="pm__paper-label">Paper:</span>
            <button
              type="button"
              className={`pm__paper-btn ${paperWidth === 58 ? "pm__paper-btn--active" : ""}`}
              onClick={() => onPaperWidthChange(58)}
            >58mm</button>
            <button
              type="button"
              className={`pm__paper-btn ${paperWidth === 80 ? "pm__paper-btn--active" : ""}`}
              onClick={() => onPaperWidthChange(80)}
            >80mm</button>
          </div>
        </div>
      )}

      {error && <p className="pm__error">{error}</p>}
    </div>
  );
}