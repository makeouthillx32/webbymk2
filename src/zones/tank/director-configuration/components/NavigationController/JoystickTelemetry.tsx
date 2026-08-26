"use client";

import React from "react";
import { Gamepad2, Activity } from "lucide-react";

type JoystickTelemetryProps = {
  gamepadConnected: boolean;
};

export function JoystickTelemetry({ gamepadConnected }: JoystickTelemetryProps) {
  return (
    <div className="rounded-lg bg-black/60 border border-black/20 p-2.5 text-xs text-slate-300 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div
          className={`grid h-6 w-6 place-items-center rounded ${
            gamepadConnected
              ? "bg-emerald-950/80 border border-emerald-500/50 text-emerald-400"
              : "bg-black/40 border border-white/10 text-slate-500"
          }`}
        >
          <Gamepad2 className="h-3.5 w-3.5" />
        </div>
        <div>
          <p className="text-[11px] font-bold text-white uppercase">
            {gamepadConnected ? "Physical Joystick / Gamepad Connected" : "Joystick Port Ready"}
          </p>
          <p className="text-[9px] text-slate-400 font-mono">
            {gamepadConnected
              ? "Standard Gamepad API Active (Stick / D-Pad Snapping)"
              : "Plug in any USB / Bluetooth joystick or controller"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <span
          className={`h-2 w-2 rounded-full ${
            gamepadConnected ? "bg-emerald-400 animate-ping" : "bg-slate-600"
          }`}
        />
        <span className="text-[10px] font-mono font-bold text-slate-400">
          {gamepadConnected ? "ONLINE" : "STANDBY"}
        </span>
      </div>
    </div>
  );
}
export default JoystickTelemetry;
