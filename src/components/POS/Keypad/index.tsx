// components/POS/Keypad/index.tsx
"use client";

import { useState } from "react";
import "./styles.scss";

interface KeypadProps {
  onCharge: (amountCents: number, note: string) => void;
  isProcessing: boolean;
}

const KEYS = ["1","2","3","4","5","6","7","8","9",".","0","⌫"];

export function Keypad({ onCharge, isProcessing }: KeypadProps) {
  const [raw, setRaw] = useState(""); // raw string e.g. "1275" → "$12.75"
  const [note, setNote] = useState("");

  function handleKey(k: string) {
    if (k === "⌫") {
      setRaw((r) => r.slice(0, -1));
      return;
    }
    // Only one decimal point allowed
    if (k === "." && raw.includes(".")) return;
    // Max 2 decimal places
    if (raw.includes(".")) {
      const decimals = raw.split(".")[1] ?? "";
      if (decimals.length >= 2) return;
    }
    // Max value guard ($9999.99)
    if (raw.replace(".", "").length >= 6) return;
    setRaw((r) => r + k);
  }

  const displayValue = raw === "" ? "0.00" : raw;
  const cents = Math.round(parseFloat(raw || "0") * 100);
  const isValid = cents > 0;

  function handleCharge() {
    if (!isValid || isProcessing) return;
    onCharge(cents, note.trim());
    setRaw("");
    setNote("");
  }

  return (
    <div className="pos-keypad">
      {/* Display */}
      <div className="pos-keypad__display">
        <span className="pos-keypad__currency">$</span>
        <span className="pos-keypad__amount">{displayValue}</span>
      </div>

      {/* Note input */}
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        className="pos-keypad__note"
        maxLength={80}
      />

      {/* Number grid */}
      <div className="pos-keypad__grid">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => handleKey(k)}
            className={`pos-keypad__key ${k === "⌫" ? "pos-keypad__key--del" : ""} ${k === "." ? "pos-keypad__key--dot" : ""}`}
          >
            {k}
          </button>
        ))}
      </div>

      {/* Charge */}
      <button
        type="button"
        onClick={handleCharge}
        disabled={!isValid || isProcessing}
        className="pos-keypad__charge"
      >
        {isProcessing ? "Processing…" : isValid ? `Charge $${(cents / 100).toFixed(2)}` : "Enter amount"}
      </button>
    </div>
  );
}