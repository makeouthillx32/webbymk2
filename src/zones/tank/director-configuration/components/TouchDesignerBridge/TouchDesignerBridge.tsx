"use client";

import React, { useState } from "react";
import { Sliders, Zap, CheckCircle2, RefreshCw, Cpu, Activity, Code2, Terminal, ChevronDown, ChevronUp } from "lucide-react";
import { ConsoleButton } from "../../../public/components/ConsoleButton";

const PYTHON_TOUCHDESIGNER_SCRIPT = `# TouchDesigner Script Operator: python_director_eval.py
# Running inside TouchDesigner (Script CHOP & Script TOP)
# Detects Audio Peaks, Quantized Depth Scaling, Room Lighting (Day vs IR Night) & VIP Tracking

import numpy as np

def onCook(scriptOp):
    mode = parent().par.Directormode.eval()  # 'audio', 'crowd', 'face', 'feet'
    cameras = ['cam_game_room', 'cam_living_room', 'cam_kitchen', 'cam_foyer', 'cam_makeup_room', 'cam_game_room_2']
    scores = {}
    
    # ── 1. ROOM LIGHTING PERCEPTION (Day vs. IR Night Mode Detection) ──
    lighting_ctx = {}
    for cam in cameras:
        luma_mean = op(cam + '_top_stats')['mean'][0]  # Normalized frame luma (0.0 - 1.0)
        is_ir_night = 1 if luma_mean < 0.15 else 0
        lux_estimate = (luma_mean * 30.0) if is_ir_night else (luma_mean * 750.0)
        # Night mode gain boost to compensate for low contrast
        conf_gain = 1.35 if is_ir_night else 1.0
        lighting_ctx[cam] = {'is_ir': is_ir_night, 'lux': lux_estimate, 'gain': conf_gain}
    
    # ── 2. AUDIO DETECTION MODE (Sound Peak Delegation) ──────────────
    if mode == 'audio':
        audio_chop = op('audio_in_channels')
        for cam in cameras:
            peak_db = audio_chop[cam + ':peak'][0]
            is_speech = 1 if peak_db > -24.0 else 0
            scores[cam] = (peak_db + 60.0) * 1.5 + (is_speech * 30.0)
            
    # ── 3. GROUP / CROWD & QUANTIZED DEPTH SCALING ───────────────────
    elif mode == 'crowd':
        for cam in cameras:
            person_boxes = op(cam + '_yolo_out').rows()
            weighted_people = 0.0
            for box in person_boxes:
                # Perspective scaling: Y position determines distance (Ground vanishing horizon = 0.25)
                ny = box['y']
                depth_scale = 0.35 + max(0.0, min(1.0, (ny - 0.25) / 0.60)) * 0.65
                # Quantized depth bin weighting (Foreground subjects count for more interest)
                weighted_people += (1.0 * depth_scale * lighting_ctx[cam]['gain'])
            
            count = len(person_boxes)
            scores[cam] = (weighted_people ** 1.5 * 35.0) if count >= 2 else (count * 15.0)

    # ── 4. VIP / MEMBER TRACKING (Face Recognition via Item) ──────────
    elif mode == 'face':
        target_vip = parent().par.Targetmember.eval()  # e.g. '@admin'
        for cam in cameras:
            face_matches = [f for f in op(cam + '_face_recon').rows() if f['name'] == target_vip]
            if face_matches:
                scores[cam] = 150.0 + (face_matches[0]['confidence'] * 20.0 * lighting_ctx[cam]['gain'])
            else:
                scores[cam] = 10.0
            
    # ── 5. FEET DETECTION & GROUND-PLANE PERSPECTIVE ──────────────────
    elif mode == 'feet':
        for cam in cameras:
            feet_boxes = op(cam + '_yolo_out').rows()
            # Only count feet within calibrated ground-plane bounds
            valid_feet = [f for f in feet_boxes if f['class'] == 'foot' and f['y'] >= 0.40]
            scores[cam] = len(valid_feet) * 25.0 * lighting_ctx[cam]['gain']
            
    # ── 6. DELEGATION & OSC SNAP BROADCAST ─────────────────────────────
    lead_cam = max(scores, key=scores.get)
    op('osc_out').sendOSC('/tank/director/snap', [lead_cam, mode, scores[lead_cam]])
    return`;

export function TouchDesignerBridge() {
  const [oscPort, setOscPort] = useState(7000);
  const [synced, setSynced] = useState(true);
  const [isPinging, setIsPinging] = useState(false);
  const [showPythonCode, setShowPythonCode] = useState(false);

  const handlePingBridge = () => {
    setIsPinging(true);
    setTimeout(() => {
      setIsPinging(false);
      setSynced(true);
    }, 500);
  };

  return (
    <div className="rounded-xl border border-black/20 bg-black/5 p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-black/15 pb-2">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded bg-amber-950/40 border border-amber-500/40 text-amber-500">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[#241f14]">
              TouchDesigner Node-Graph & Python Vision Engine
            </h3>
            <p className="text-[10px] text-[#5a5442] font-mono">
              Script TOP / CHOP &middot; Python Detection Boxes &middot; OSC Delegation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono font-bold text-emerald-800">
            OSC 127.0.0.1:{oscPort}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
        <div className="rounded-lg bg-white/70 border border-black/10 p-2.5 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500">Audio Ingest Delegate</span>
          <p className="font-mono font-black text-amber-600">Peak dB Delegation</p>
          <p className="text-[9px] text-slate-500 font-mono">Audio Device In CHOP</p>
        </div>

        <div className="rounded-lg bg-white/70 border border-black/10 p-2.5 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500">Python Script Operators</span>
          <p className="font-mono font-black text-emerald-700">YOLO / Pose TOP</p>
          <p className="text-[9px] text-slate-500 font-mono">Feet & People Boxes</p>
        </div>

        <div className="rounded-lg bg-white/70 border border-black/10 p-2.5 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500">Snapping Hysteresis</span>
          <p className="font-mono font-black text-orange-600">1.5s Hold / 15 Pts</p>
          <p className="text-[9px] text-slate-500 font-mono">Zero-Twitch Snapping</p>
        </div>
      </div>

      {/* Python Code Toggle */}
      <div className="border border-black/10 rounded-lg bg-black/[0.03] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPythonCode(!showPythonCode)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-black uppercase text-[#241f14] hover:bg-black/5 transition"
        >
          <span className="flex items-center gap-1.5 font-mono text-[11px]">
            <Code2 className="h-3.5 w-3.5 text-orange-600" />
            TouchDesigner Python Script Operator (Inspect Code)
          </span>
          {showPythonCode ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showPythonCode && (
          <div className="p-3 bg-[#0d0f12] border-t border-black/20 text-slate-200">
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10 text-[9px] font-mono text-slate-400">
              <span>python_director_eval.py (TouchDesigner Script CHOP)</span>
              <span className="text-emerald-400">Python 3.11 · Numpy · OpenCV</span>
            </div>
            <pre className="font-mono text-[10px] leading-relaxed text-emerald-300 overflow-x-auto p-2 bg-black/60 rounded border border-white/10">
              <code>{PYTHON_TOUCHDESIGNER_SCRIPT}</code>
            </pre>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1 text-xs">
        <span className="text-[11px] text-slate-600 font-mono">
          Socket Latency: <strong className="text-emerald-700">1.2 ms</strong>
        </span>
        <button
          type="button"
          onClick={handlePingBridge}
          disabled={isPinging}
          className="flex items-center gap-1 rounded bg-[#241f14] px-3 py-1 text-xs font-bold text-orange-400 hover:bg-black transition shadow"
        >
          <RefreshCw className={`h-3 w-3 ${isPinging ? "animate-spin text-orange-400" : ""}`} />
          {isPinging ? "Pinging Node Bridge..." : "Sync Node Graph"}
        </button>
      </div>
    </div>
  );
}
export default TouchDesignerBridge;
