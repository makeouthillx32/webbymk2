"use client";

import React from "react";
import { Volume2, Footprints, Users, UserCheck, UserPlus, Sliders, Dog, Cat, Bot } from "lucide-react";
import type { SubjectMode } from "../../../server/directorVirtualAtlas";
import { FOLLOWABLE_MEMBERS, type FollowableMember } from "../../../server/followMember";

type EnrollmentView = { slug: string; name: string; startedAt: string; kind?: "guest" | "member" } | null;

type SubjectModeSelectorProps = {
  subjectMode: SubjectMode;
  onSelectMode: (mode: SubjectMode) => void;
  /** Slug Follow Member is locked to, or null when nobody is picked. */
  followMember?: string | null;
  /** Picking a member also switches the director into Follow Member mode. */
  onSelectFollowMember?: (slug: string) => void;
  /** Housemates, pets and every guest the house has confirmed. */
  followable?: Array<FollowableMember & { guest?: boolean }>;
  /** The person being enrolled right now, if any. */
  enrollment?: EnrollmentView;
  /** A new guest by name, or an existing housemate by slug (member). */
  onStartEnrollment?: (name: string, member?: string) => void;
  onFinishEnrollment?: () => void;
};

const MODES: Array<{
  id: SubjectMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: string;
  desc: string;
}> = [
  {
    id: "auto",
    label: "A (Auto Mode)",
    icon: Bot,
    badge: "AI DIRECTOR",
    desc: "Autonomous multi-modal AI director (scoring, cuts & PTZ)",
  },
  {
    id: "group",
    label: "Group Mode",
    icon: Users,
    badge: "AI CLUSTER",
    desc: "Enclosing AI PTZ framing all detected housemates & guests",
  },
  {
    id: "member",
    label: "Follow Member",
    icon: UserCheck,
    badge: "FOLLOW",
    desc: "Stays on whichever room the picked housemate or pet is detected in",
  },
  {
    id: "enroll",
    label: "Enroll Person",
    icon: UserPlus,
    badge: "ENROLL",
    desc: "Teach the house a guest, or a housemate in new poses: follows them and collects them to grade",
  },
  {
    id: "dog",
    label: "Dog Focused",
    icon: Dog,
    badge: "CANINE PTZ",
    desc: "Dedicated dog tracker for Buster, Kona, Molly & canine roamers",
  },
  {
    id: "cat",
    label: "Cat Focused",
    icon: Cat,
    badge: "FELINE PTZ",
    desc: "Dedicated cat tracker for Mochi, Shadow, Kitty & feline roamers",
  },
  {
    id: "feet",
    label: "Headless / Feet",
    icon: Footprints,
    badge: "VISION",
    desc: "Floor & foot tracking via Python vision bounding boxes",
  },
  {
    id: "speaker",
    label: "Audio Detection",
    icon: Volume2,
    badge: "SOUND PEAK",
    desc: "Snaps framing to highest audio amplitude and voice activity",
  },
  {
    id: "manual",
    label: "Manual Pilot",
    icon: Sliders,
    badge: "OPERATOR",
    desc: "Direct operator joystick, D-pad, and PTZ overrides",
  },
];

export function SubjectModeSelector({
  subjectMode,
  onSelectMode,
  followMember = null,
  onSelectFollowMember,
  followable = FOLLOWABLE_MEMBERS,
  enrollment = null,
  onStartEnrollment,
  onFinishEnrollment,
}: SubjectModeSelectorProps) {
  const [guestName, setGuestName] = React.useState("");
  return (
    <div className="rounded-lg bg-black/5 p-3.5 border border-black/15 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-[#241f14] flex items-center gap-1.5">
          <Bot className="h-4 w-4 text-orange-600" />
          AI Driving Modes & Detection Targets
        </p>
        <span className="text-[9px] font-mono text-[#5a5442] uppercase">
          Dynamic Auto-Delegation Hysteresis: 15 pts / 1.5s
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

      {subjectMode === "member" && onSelectFollowMember && (
        <div className="rounded-lg border border-orange-500/40 bg-white/70 p-2.5 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#241f14]">
            {followMember ? "Following" : "Pick who to follow"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {followable.map((m) => {
              const active = followMember === m.slug;
              return (
                <button
                  key={m.slug}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectFollowMember(m.slug)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-black transition-all ${
                    active
                      ? "border-orange-500 bg-orange-600 text-white shadow ring-2 ring-orange-400/50"
                      : "border-black/15 bg-white text-[#3a3528] hover:bg-orange-50"
                  }`}
                >
                  {m.displayName}
                  {m.kind === "pet" && (
                    <span className={`ml-1 text-[8px] font-mono ${active ? "text-orange-100" : "text-slate-500"}`}>PET</span>
                  )}
                  {"guest" in m && m.guest && (
                    <span className={`ml-1 text-[8px] font-mono ${active ? "text-orange-100" : "text-slate-500"}`}>GUEST</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {subjectMode === "enroll" && (
        <div className="rounded-lg border border-sky-500/40 bg-white/70 p-2.5 space-y-2">
          {enrollment ? (
            <>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#241f14]">
                Enrolling {enrollment.name}
              </p>
              <p className="text-[10px] text-[#3a3528]">
                The director follows the one person it can&apos;t recognise{enrollment.kind === "member" ? ` (or recognises as ${enrollment.name})` : ""},
                and every sighting of them is saved as {enrollment.name} for you to check. Keep everyone else off camera while they walk
                each room: standing, sitting, lying down, turning slowly.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => onFinishEnrollment?.()}
                  className="rounded-md border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-black text-white shadow hover:bg-sky-700">
                  Finish enrollment
                </button>
                <a href="/house/labels" target="_blank" rel="noreferrer"
                  className="rounded-md border border-black/15 bg-white px-3 py-1.5 text-xs font-black text-[#3a3528] hover:bg-sky-50">
                  Open Label Lab
                </a>
              </div>
              <p className="text-[9px] text-slate-500">
                Finishing rebuilds the gallery from what you graded and switches to following {enrollment.name}, so you can see
                straight away whether the house knows them.
              </p>
            </>
          ) : (
            <form className="space-y-2" onSubmit={(event) => {
              event.preventDefault();
              if (guestName.trim()) { onStartEnrollment?.(guestName.trim()); setGuestName(""); }
            }}>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#241f14]">Who are you enrolling?</p>
              <div className="flex flex-wrap gap-1.5">
                {FOLLOWABLE_MEMBERS.filter((m) => m.kind === "person").map((m) => (
                  <button key={m.slug} type="button" onClick={() => onStartEnrollment?.(m.displayName, m.slug)}
                    className="rounded-md border border-black/15 bg-white px-2.5 py-1 text-xs font-black text-[#3a3528] hover:bg-sky-50">
                    {m.displayName}
                    <span className="ml-1 text-[8px] font-mono text-slate-500">HOUSEMATE</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input id="enroll-guest-name" value={guestName} onChange={(event) => setGuestName(event.target.value)}
                  placeholder="Guest's name" aria-label="Guest's name"
                  className="min-w-0 flex-1 rounded-md border border-black/20 bg-white px-2.5 py-1.5 text-xs font-bold text-[#241f14] focus:border-sky-500 focus:outline-none" />
                <button type="submit" disabled={!guestName.trim()}
                  className="rounded-md border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-black text-white shadow hover:bg-sky-700 disabled:opacity-40">
                  Start
                </button>
              </div>
              <p className="text-[9px] text-slate-500">
                Pick a housemate to teach new poses, or type a new guest&apos;s name. Clear the cameras first: they should be the only
                person on camera. Full guide: vault Tank/tank-enrollment-and-grading-guide.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default SubjectModeSelector;
