"use client";

import React from "react";
import { Volume2, Footprints, Users, UserCheck, Eye, Flame, Sliders } from "lucide-react";
import type { SubjectMode } from "../../../server/directorVirtualAtlas";

type SubjectModeSelectorProps = {
  subjectMode: SubjectMode;
  onSelectMode: (mode: SubjectMode) => void;
};

const MODES: Array<{ id: SubjectMode; label: string; icon: React.ElementType; badge: string; desc: string }> = [
  {
    id: "speaker",
    label: "Audio Detection",
    icon: Volume2,
    badge: "MODE #1",
    desc: "Auto-delegates to highest sound / audio peak",
  },
  {
    id: "crowd",
    label: "Group / Crowd Mode",
    icon: Users,
    badge: "BIGGEST GROUP",
    desc: "Finds and snaps to the biggest group of people",
  },
  {
    id: "face",
    label: "Member Tracking",
    icon: UserCheck,
    badge: "VIP / ITEM",
    desc: "Facial biometric lock on defined house members",
  },
  {
    id: "feet",
    label: "Feet Detection",
    icon: Footprints,
    badge: "PYTHON VISION",
    desc: "Python boxes detect feet & snaps to most feet",
  },
  {
    id: "person",
    label: "People Focus",
    icon: Eye,
    badge: "YOLO PERSON",
    desc: "Standard Python bounding box on solo subjects",
  },
  {
    id: "manual",
    label: "Manual Pilot",
    icon: Sliders,
    badge: "OPERATOR",
    desc: "Joystick / D-pad / Keyboard snapping override",
  },
];

export function SubjectModeSelector({ subjectMode, onSelectMode }: SubjectModeSelectorProps) {
  return (
    <div className="rounded-lg bg-black/5 p-3.5 border border-black/15 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-[#241f14] flex items-center gap-1.5">
          <Volume2 className="h-4 w-4 text-orange-600" />
          Director Snapping & Python Detection Modes
        </p>
        <span className="text-[9px] font-mono text-[#5a5442] uppercase">
          Dynamic Auto-Delegation Hysteresis: 15 pts / 1.5s
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {MODES.map((m) => {
          const Icon = m.icon;
          const isSelected = subjectMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectMode(m.id)}
              className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all relative ${
                isSelected
                  ? "border-orange-500 bg-orange-600 text-white shadow-md ring-2 ring-orange-400/50"
                  : "border-black/15 bg-white/80 text-[#3a3528] hover:bg-white"
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-black">
                  <Icon className={`h-3.5 w-3.5 ${isSelected ? "text-white" : "text-orange-600"}`} />
                  <span>{m.label}</span>
                </div>
                <span className={`text-[8px] font-mono font-bold px-1 py-0.2 rounded ${
                  isSelected ? "bg-black/30 text-white" : "bg-black/10 text-[#5a5442]"
                }`}>
                  {m.badge}
                </span>
              </div>
              <span className={`text-[9px] mt-1 line-clamp-2 ${isSelected ? "text-orange-100" : "text-slate-600"}`}>
                {m.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
export default SubjectModeSelector;
