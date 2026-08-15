"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Archive,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  Coins,
  Globe2,
  LogOut,
  Maximize,
  MessageSquare,
  Package,
  Pause,
  Radio,
  Send,
  Settings,
  Signal,
  Sparkles,
  Trophy,
  User,
  Users,
  X,
} from "lucide-react";
import type { CameraDirectorySnapshot, DiscoveredCamera } from "../contracts";
import { cameraById, cameras, rooms as fixtureRooms } from "../fixtures";
import { ACTIVE_THEME } from "../theme";
import { createClient } from "@/utils/supabase/client";
import { useTankRealtimeChat } from "./useTankRealtimeChat";
import { AccountOverlay } from "./AccountOverlay";
import { TankThemeStyles } from "./TankThemeStyles";
import { joinClan, leaveClan } from "../server/actions";
import type {
  TankArchiveEntry,
  TankClanMembership,
  TankClanSummary,
  TankInventoryEntry,
  TankLeaderboardRow,
  TankMission,
  TankPlayerProfile,
  TankSeason,
  TankTokenTransaction,
} from "../server/gamification";

// The single persistent shell for the whole viewer experience: no route
// changes, everything below is client state. Structural pass: matches the
// real fishtank.live console layout facet-for-facet — profile rail with
// nav (Clans/Tokens/Season Pass/Leaderboard/Archives), an inventory panel,
// a Missions/Logs/Poll tab stack, a live stats readout, a camera grid, and
// chat — all built on the real DB "bones" from
// supabase/migrations/20260814140000_tank_platform_bones.sql, not
// fabricated numbers. Where a system has no real data yet (no clans
// created, no archived episodes, no active poll) the UI says so honestly
// instead of inventing activity.

const DIRECTOR_ROOM = fixtureRooms.find((room) => room.slug === "director") ?? fixtureRooms[0];
const BROWSE_ROOMS = fixtureRooms.filter((room) => room.slug !== "director");
const DIRECTOR_SWITCH_INTERVAL_MS = 8000;

type ViewMode = "director" | "room";
type ChatScope = "global" | "room";
type OverlayView = "clans" | "tokens" | "season" | "leaderboard" | "archives" | null;
type SidebarTab = "missions" | "logs" | "poll";

const LED_RED = "#ff3b2f";
const LED_GREEN = "#39ff6a";
const LED_AMBER = "#ffb020";
const glow = (rgb: string) => ({ textShadow: `0 0 6px ${rgb}, 0 0 1px ${rgb}` });
const PANEL_TEXT = "#e7e2d6";

const roleTag: Record<string, { label: string; color: string }> = {
  admin: { label: "ADMIN", color: LED_RED },
  moderator: { label: "MOD", color: LED_AMBER },
  member: { label: "MEMBER", color: "#4fd6ff" },
  viewer: { label: "VIEWER", color: "#9aa88f" },
};

// Same leveling curve as tank_level_for_xp() in the migration — kept in
// sync so the client-side progress bar matches what the DB will compute.
function xpFloorForLevel(level: number) {
  return 100 * (level - 1) * (level - 1);
}

// A metal console panel: gradient + outset bevel border + the real aluminum
// / brushed-metal texture overlays from the asset dump, optionally with
// corner screw bolts (also real assets).
function ChromePanel({
  children,
  className = "",
  withScrews = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  withScrews?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded ${className}`}
      style={{
        background:
          "linear-gradient(90deg,#88868b,#a7a2a6 10%,#a09b9f 50%,#8f8d93 75%,#625f60 90%,#4a4645)",
        border: "3px outset hsla(300,5%,79%,.75)",
        outline: "2px solid rgba(0,0,0,.5)",
        boxShadow:
          "-2px 2px 1px rgba(0,0,0,.75), inset 0 0 4px #cbc6cb, 4px 4px 0 rgba(0,0,0,.75)",
        ...style,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ backgroundImage: `url(${ACTIVE_THEME.images.aluminumTexture})`, mixBlendMode: "overlay" }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ backgroundImage: `url(${ACTIVE_THEME.images.metalTexture})`, mixBlendMode: "overlay" }}
      />
      {withScrews && (
        <>
          <img src={ACTIVE_THEME.images.screwTopLeft} alt="" className="pointer-events-none absolute left-1 top-1 z-20 h-3.5 w-3.5" />
          <img src={ACTIVE_THEME.images.screwTopRight} alt="" className="pointer-events-none absolute right-1 top-1 z-20 h-3.5 w-3.5" />
          <img src={ACTIVE_THEME.images.screwBottomLeft} alt="" className="pointer-events-none absolute bottom-1 left-1 z-20 h-3.5 w-3.5" />
          <img src={ACTIVE_THEME.images.screwBottomRight} alt="" className="pointer-events-none absolute bottom-1 right-1 z-20 h-3.5 w-3.5" />
        </>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// A real console-button PNG stretched under the label — the pill-shaped 3D
// buttons from the reference (SETTINGS / LOG OUT / SEASON PASS style).
function ConsoleButton({
  children,
  onClick,
  active = false,
  variant = "gray",
  className = "",
  type = "button",
  disabled = false,
  ariaLabel,
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  variant?: "gray" | "red" | "orange";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  ariaLabel?: string;
  href?: string;
}) {
  const bg = active
    ? ACTIVE_THEME.images.buttonBlue
    : variant === "red"
      ? ACTIVE_THEME.images.buttonRed
      : variant === "orange"
        ? ACTIVE_THEME.images.buttonOrange
        : ACTIVE_THEME.images.buttonGray;
  const classes = `relative inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-[#2c2717] transition hover:brightness-105 active:brightness-95 disabled:opacity-50 disabled:hover:brightness-100 ${className}`;
  const style: React.CSSProperties = {
    backgroundImage: `url(${bg})`,
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    fontFamily: ACTIVE_THEME.fonts.label,
    textShadow: "0 1px 0 rgba(255,255,255,.4)",
  };
  // Rendered as a <Link> when href is given, never a <button> nested
  // inside an <a> — that combination is invalid HTML and Next warns on it.
  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={classes} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={classes}
      style={style}
    >
      {children}
    </button>
  );
}

function LedReadout({
  children,
  color = LED_RED,
  small = false,
  className = "",
}: {
  children: ReactNode;
  color?: string;
  small?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border border-[#233326] bg-black px-2.5 py-1 tracking-[.12em] ${small ? "text-[10px]" : "text-xs"} ${className}`}
      style={{ color, fontFamily: ACTIVE_THEME.fonts.display, ...glow(`${color}cc`) }}
    >
      {children}
    </span>
  );
}

// A small metal-framed camera tile, matching the reference's numbered
// screen + speaker grille + knob row look.
function CameraTile({
  index,
  name,
  online,
  selected,
  onClick,
}: {
  index: number;
  name: string;
  online: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col overflow-hidden rounded text-left"
      style={{
        background: "linear-gradient(180deg,#9a969b,#6c686c)",
        border: selected ? "2px solid #32c0e0" : "2px solid rgba(0,0,0,.35)",
        boxShadow: "inset 0 0 2px rgba(255,255,255,.4), 2px 2px 0 rgba(0,0,0,.4)",
      }}
    >
      <span
        className="px-2 py-1 text-[10px] font-black uppercase tracking-wide"
        style={{ color: "#2c2717", fontFamily: ACTIVE_THEME.fonts.label }}
      >
        {index} {name}
      </span>
      <span
        className={`relative m-1 aspect-[16/10] overflow-hidden rounded-sm border border-black/60 ${
          online ? "bg-gradient-to-br from-cyan-500/30 via-blue-950/60 to-slate-950" : "bg-slate-900"
        }`}
      >
        {!online && (
          <span className="absolute inset-0 grid place-items-center">
            <CameraOff className="h-5 w-5 text-white/25" />
          </span>
        )}
        {online && (
          <span
            className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: LED_RED, boxShadow: `0 0 5px ${LED_RED}` }}
          />
        )}
      </span>
      <span className="mx-1 mb-1 h-1.5 rounded-full" style={{ background: "repeating-linear-gradient(90deg,#3a3a3a 0 2px,#555 2px 4px)" }} />
      <span className="mb-1 flex items-center gap-1 px-1.5">
        <span className="h-2.5 w-2.5 rounded-full border border-black/50 bg-gradient-to-br from-white/60 to-black/30" />
        <span className="h-2.5 w-2.5 rounded-full border border-black/50 bg-gradient-to-br from-white/60 to-black/30" />
        <span className="ml-auto grid grid-cols-3 gap-[1px]">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="h-1 w-1 rounded-[1px] bg-black/40" />
          ))}
        </span>
      </span>
    </button>
  );
}

function InfoOverlay({ title, icon, onClose, children }: { title: string; icon: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <ChromePanel withScrews className="max-h-[80vh] w-full max-w-md overflow-hidden">
        <div onClick={(event) => event.stopPropagation()} className="flex max-h-[80vh] flex-col">
          <div className="flex items-center justify-between border-b border-black/40 px-4 py-2.5">
            <div className="flex items-center gap-2">
              {icon}
              <span className="text-xs font-black uppercase tracking-widest" style={{ color: "#241f14", fontFamily: ACTIVE_THEME.fonts.label }}>
                {title}
              </span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-6 w-6 place-items-center rounded-full border border-black/40 bg-gradient-to-b from-[#ff8a7a] to-[#ff3b2f] text-white shadow-[inset_1px_1px_0_rgba(255,255,255,.5)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
        </div>
      </ChromePanel>
    </div>
  );
}

export type TankExperienceProps = {
  initialProfile: TankPlayerProfile | null;
  season: TankSeason | null;
  missions: TankMission[];
  leaderboard: TankLeaderboardRow[];
  clans: TankClanSummary[];
  userClan: TankClanMembership | null;
  inventory: TankInventoryEntry[];
  archives: TankArchiveEntry[];
  tokenTransactions: TankTokenTransaction[];
};

export function TankExperience({
  initialProfile,
  season,
  missions,
  leaderboard,
  clans,
  userClan: initialUserClan,
  inventory,
  archives,
  tokenTransactions,
}: TankExperienceProps) {
  const [snapshot, setSnapshot] = useState<CameraDirectorySnapshot | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/tank/cameras", { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as CameraDirectorySnapshot;
        if (active) setSnapshot(next);
      } catch {
        // keep last known snapshot rather than flashing an error state
      }
    };
    void load();
    const timer = window.setInterval(load, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const liveById = useMemo(() => {
    const map = new Map<string, DiscoveredCamera>();
    for (const camera of snapshot?.cameras ?? []) map.set(camera.id, camera);
    return map;
  }, [snapshot]);

  const isOnline = (id: string) => {
    const live = liveById.get(id);
    return live?.presence === "online" || live?.presence === "degraded";
  };

  const [mode, setMode] = useState<ViewMode>("director");
  const [activeRoomSlug, setActiveRoomSlug] = useState<string>(
    BROWSE_ROOMS[0]?.slug ?? DIRECTOR_ROOM.slug,
  );
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>(
    BROWSE_ROOMS[0]?.featuredCameraId,
  );
  const [chatScope, setChatScope] = useState<ChatScope>("global");
  const [accountOpen, setAccountOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [overlayView, setOverlayView] = useState<OverlayView>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("missions");
  const [userClan, setUserClan] = useState(initialUserClan);
  const [clanBusy, setClanBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(!!initialProfile);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (active) setSignedIn(!!data.user);
    });
    return () => {
      active = false;
    };
  }, []);

  // Live wall-clock — real, not fabricated. Used for the STATS "TIME" LED
  // readout and for computing "days into season" for "DAY".
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const seasonDay = useMemo(() => {
    if (!season || !now) return null;
    const started = new Date(season.startsAt).getTime();
    const diffDays = Math.max(1, Math.floor((now.getTime() - started) / 86_400_000) + 1);
    return diffDays;
  }, [season, now]);

  const xpFloor = xpFloorForLevel(initialProfile?.level ?? 1);
  const xpCeil = xpFloorForLevel((initialProfile?.level ?? 1) + 1);
  const xpProgress = initialProfile
    ? Math.min(1, Math.max(0, (initialProfile.xp - xpFloor) / Math.max(1, xpCeil - xpFloor)))
    : 0;

  const activeRoom =
    mode === "room"
      ? BROWSE_ROOMS.find((room) => room.slug === activeRoomSlug) ?? BROWSE_ROOMS[0]
      : DIRECTOR_ROOM;

  useEffect(() => {
    if (mode === "room" && activeRoom) setSelectedCameraId(activeRoom.featuredCameraId);
  }, [mode, activeRoom?.id]);

  // Director auto-switch: cycle through whichever house cameras are online.
  const onlineCameraIds = useMemo(
    () => cameras.filter((camera) => isOnline(camera.id)).map((camera) => camera.id),
    [snapshot],
  );
  const [directorCameraId, setDirectorCameraId] = useState<string | undefined>(
    onlineCameraIds[0],
  );
  useEffect(() => {
    if (mode !== "director") return;
    if (onlineCameraIds.length === 0) {
      setDirectorCameraId(undefined);
      return;
    }
    if (!directorCameraId || !onlineCameraIds.includes(directorCameraId)) {
      setDirectorCameraId(onlineCameraIds[0]);
    }
    if (onlineCameraIds.length < 2) return;
    const timer = window.setInterval(() => {
      setDirectorCameraId((prev) => {
        const index = prev ? onlineCameraIds.indexOf(prev) : -1;
        return onlineCameraIds[(index + 1) % onlineCameraIds.length];
      });
    }, DIRECTOR_SWITCH_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, onlineCameraIds.join(",")]);

  const heroCameraId = mode === "director" ? directorCameraId : selectedCameraId;
  const heroCamera = heroCameraId ? cameraById(heroCameraId) : undefined;
  const heroOnline = heroCameraId ? isOnline(heroCameraId) : false;
  const anyHouseCameraOnline = onlineCameraIds.length > 0;

  const chatRoomId = chatScope === "global" ? "global" : activeRoom?.id ?? DIRECTOR_ROOM.id;
  const { messages, sending, error: chatError, postMessage } =
    useTankRealtimeChat(chatRoomId);

  // Real presence count over the same realtime channel chat already uses —
  // an honest "ONLINE" number instead of a fabricated one.
  const [onlineCount, setOnlineCount] = useState(1);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`room:${chatRoomId}:presence`, {
      config: { presence: { key: `${Math.random()}` } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnlineCount(Math.max(1, Object.keys(state).length));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ online_at: new Date().toISOString() });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatRoomId]);

  const handleSend = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!chatInput.trim() || sending) return;
    const ok = await postMessage(chatInput);
    if (ok) setChatInput("");
  };

  const handleJoinClan = async (clanId: string) => {
    setClanBusy(true);
    const result = await joinClan(clanId);
    setClanBusy(false);
    if (result.success) {
      const clan = clans.find((c) => c.id === clanId);
      if (clan) setUserClan({ clanId: clan.id, name: clan.name, tag: clan.tag, bannerColor: clan.bannerColor });
    }
  };

  const handleLeaveClan = async () => {
    setClanBusy(true);
    const result = await leaveClan();
    setClanBusy(false);
    if (result.success) setUserClan(null);
  };

  const labelWide: React.CSSProperties = { fontFamily: ACTIVE_THEME.fonts.labelWide };
  const label: React.CSSProperties = { fontFamily: ACTIVE_THEME.fonts.label };

  return (
    <div
      className="min-h-screen pb-3"
      style={{
        backgroundImage: `url(${ACTIVE_THEME.images.background})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        color: "#241f14",
      }}
    >
      <TankThemeStyles />
      <div className="mx-auto max-w-[1800px] p-2 md:p-3">
        {/* Top console strip: daily login, season marquee, merch/invest */}
        <ChromePanel withScrews className="mb-2 flex flex-wrap items-center gap-2 p-2">
          <ConsoleButton variant="orange" disabled className="hidden sm:inline-flex">
            <Sparkles className="h-3.5 w-3.5" />
            Daily login bonus
          </ConsoleButton>

          <div className="mx-auto flex flex-1 items-center justify-center gap-2 rounded border border-black/40 bg-black/80 px-3 py-1.5">
            <span
              className="h-3 w-3 rounded-full"
              style={{
                background: "radial-gradient(circle at 35% 30%, #ff8a7a, #ff3b2f 55%, #7a0f0a)",
                boxShadow: "0 0 6px rgba(255,59,47,.8)",
              }}
            />
            <span
              className="truncate text-sm font-black tracking-[.2em]"
              style={{ color: LED_RED, fontFamily: ACTIVE_THEME.fonts.display, ...glow("rgba(255,59,47,.85)") }}
            >
              {season
                ? season.name.toLowerCase().startsWith("season")
                  ? season.name.toUpperCase()
                  : `SEASON ${season.number}: ${season.name.toUpperCase()}`
                : "NO ACTIVE SEASON"}
            </span>
          </div>

          <ConsoleButton variant="orange" disabled className="hidden sm:inline-flex">
            Merch — coming soon
          </ConsoleButton>
          <ConsoleButton variant="red" disabled className="hidden md:inline-flex">
            Invest — coming soon
          </ConsoleButton>
        </ChromePanel>

        <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_330px]">
          {/* ── Left rail: profile, nav, inventory, missions, stats ────── */}
          <div className="hidden flex-col gap-2 md:flex">
            <ChromePanel withScrews className="p-2.5">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-black/40 bg-gradient-to-br from-slate-300 to-slate-500">
                  <User className="h-5 w-5 text-slate-800" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-black uppercase tracking-wide" style={{ color: "#241f14", ...label }}>
                    {signedIn ? initialProfile?.displayName ?? "Viewer" : "Guest"}
                  </p>
                  {signedIn && (
                    <p className="text-[10px] font-bold" style={{ color: "#4c4630" }}>
                      LVL {initialProfile?.level ?? 1}
                      {userClan ? ` · [${userClan.tag}]` : ""}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-2 flex gap-1.5">
                <ConsoleButton className="flex-1" onClick={() => setAccountOpen(true)}>
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </ConsoleButton>
                {signedIn ? (
                  <ConsoleButton
                    variant="red"
                    className="flex-1"
                    onClick={async () => {
                      const supabase = createClient();
                      await supabase.auth.signOut();
                      window.location.reload();
                    }}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Log out
                  </ConsoleButton>
                ) : (
                  <ConsoleButton variant="orange" className="flex-1" onClick={() => setAccountOpen(true)}>
                    Sign in
                  </ConsoleButton>
                )}
              </div>
            </ChromePanel>

            <ChromePanel withScrews className="flex flex-col gap-1.5 p-2">
              {([
                ["clans", "Clans", Users],
                ["tokens", "Tokens", Coins],
                ["season", "Season pass", Trophy],
                ["leaderboard", "Leader board", Trophy],
                ["archives", "Archives", Archive],
              ] as const).map(([key, label_, Icon]) => (
                <ConsoleButton key={key} className="w-full justify-start normal-case" onClick={() => setOverlayView(key)}>
                  <Icon className="h-3.5 w-3.5" />
                  <span style={labelWide}>{label_}</span>
                </ConsoleButton>
              ))}
            </ChromePanel>

            <ChromePanel withScrews className="p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[.18em]" style={{ color: "#241f14", ...label }}>
                  Inventory
                </p>
                <ConsoleButton variant="orange" className="!px-2 !py-1 !text-[9px]" onClick={() => setOverlayView("season")}>
                  Get fishtoys
                </ConsoleButton>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: 8 }).map((_, i) => {
                  const entry = inventory[i];
                  return (
                    <div
                      key={i}
                      className="grid aspect-square place-items-center rounded border border-black/40 bg-black/30"
                      title={entry?.name}
                    >
                      {entry ? (
                        <Package className="h-4 w-4" style={{ color: "#d8d2bd" }} />
                      ) : (
                        <span className="h-1 w-1 rounded-full bg-black/30" />
                      )}
                    </div>
                  );
                })}
              </div>
              {inventory.length === 0 && (
                <p className="mt-1.5 text-[10px]" style={{ color: "#4c4630" }}>
                  Empty — complete missions to earn items.
                </p>
              )}
            </ChromePanel>

            <ChromePanel withScrews className="flex flex-1 flex-col overflow-hidden">
              <div className="flex border-b border-black/40">
                {(["missions", "logs", "poll"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSidebarTab(tab)}
                    className="flex-1 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide"
                    style={{
                      color: sidebarTab === tab ? "#241f14" : "#4c4630",
                      background: sidebarTab === tab ? "rgba(255,255,255,.35)" : "transparent",
                      ...label,
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="max-h-64 flex-1 overflow-y-auto p-2.5">
                {sidebarTab === "missions" && (
                  <div className="space-y-2">
                    {missions.length === 0 && (
                      <p className="text-[11px]" style={{ color: "#4c4630" }}>
                        No missions live right now.
                      </p>
                    )}
                    {missions.map((mission) => (
                      <div key={mission.id} className="rounded border border-black/30 bg-black/10 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold" style={{ color: "#241f14" }}>
                            {mission.title}
                          </p>
                          {mission.completedAt && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: "#1a6b34" }} />}
                        </div>
                        <p className="mt-0.5 text-[10px]" style={{ color: "#4c4630" }}>
                          {mission.rewardXp} XP · {mission.rewardTokens} tokens
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {sidebarTab === "logs" && (
                  <div className="space-y-1.5">
                    {messages.length === 0 ? (
                      <p className="text-[11px]" style={{ color: "#4c4630" }}>
                        No activity logged yet.
                      </p>
                    ) : (
                      messages
                        .slice(-6)
                        .reverse()
                        .map((message) => (
                          <p key={message.id} className="text-[10px]" style={{ color: "#4c4630" }}>
                            <span className="font-bold">{message.user}</span> posted in chat · {message.time}
                          </p>
                        ))
                    )}
                  </div>
                )}
                {sidebarTab === "poll" && (
                  <p className="text-[11px]" style={{ color: "#4c4630" }}>
                    No active poll right now.
                  </p>
                )}
              </div>
            </ChromePanel>

            <ChromePanel withScrews className="grid grid-cols-2 gap-1.5 p-2.5">
              {[
                ["DAY", seasonDay ?? "—"],
                ["TIME", now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"],
                ["LEVEL", initialProfile?.level ?? 1],
                ["TOKENS", initialProfile?.tokens ?? 0],
              ].map(([lbl, val]) => (
                <div key={lbl as string} className="rounded border border-black/40 bg-black px-2 py-1.5 text-center">
                  <p className="text-[8px] font-bold tracking-widest" style={{ color: "#7a8570" }}>
                    {lbl}
                  </p>
                  <p className="text-sm font-black" style={{ color: LED_RED, fontFamily: ACTIVE_THEME.fonts.display, ...glow("rgba(255,59,47,.8)") }}>
                    {val}
                  </p>
                </div>
              ))}
            </ChromePanel>
          </div>

          {/* ── Mobile room switcher ─────────────────────────────────── */}
          {mode === "room" && (
            <ChromePanel className="flex gap-1.5 overflow-x-auto p-2 md:hidden">
              {BROWSE_ROOMS.map((room) => {
                const active = activeRoomSlug === room.slug;
                return (
                  <ConsoleButton
                    key={room.id}
                    active={active}
                    className="shrink-0 normal-case"
                    onClick={() => setActiveRoomSlug(room.slug)}
                  >
                    {room.title}
                  </ConsoleButton>
                );
              })}
            </ChromePanel>
          )}

          {/* ── Center: hero player + camera grid ───────────────────── */}
          <div className="flex min-w-0 flex-col gap-2">
            <div className="rounded-lg border-2 border-[#232920] bg-black p-1.5">
              <section
                className={`relative aspect-video max-h-[52vh] w-full overflow-hidden rounded ${
                  heroOnline
                    ? `bg-gradient-to-br ${heroCamera?.accent ?? "from-cyan-500/35 via-blue-950/60 to-slate-950"}`
                    : "bg-slate-950"
                }`}
                aria-label={
                  mode === "director"
                    ? "Director program"
                    : `${heroCamera?.name ?? "Room"} video placeholder`
                }
              >
                {heroOnline && (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_30%,rgba(255,255,255,.2),transparent_16%),radial-gradient(circle_at_68%_55%,rgba(45,212,191,.22),transparent_18%),linear-gradient(110deg,transparent_30%,rgba(255,255,255,.05)_50%,transparent_70%)]" />
                )}
                <div className="absolute left-3 top-3 flex gap-2">
                  <LedReadout color={heroOnline ? LED_RED : "#9aa88f"} small>
                    {heroOnline && (
                      <span
                        className="h-1.5 w-1.5 animate-pulse rounded-full"
                        style={{ backgroundColor: LED_RED, boxShadow: `0 0 5px ${LED_RED}` }}
                      />
                    )}
                    {heroOnline ? "LIVE" : "NO SIGNAL"}
                  </LedReadout>
                  {mode === "director" && (
                    <LedReadout color={LED_AMBER} small>
                      DIRECTOR CUT
                    </LedReadout>
                  )}
                </div>
                <div className="absolute inset-0 grid place-items-center">
                  <div className="max-w-sm rounded-lg border border-white/15 bg-black/30 p-5 text-center text-white backdrop-blur-sm">
                    {heroOnline ? (
                      <Radio className="mx-auto h-8 w-8 opacity-85" />
                    ) : (
                      <CameraOff className="mx-auto h-8 w-8 opacity-60" />
                    )}
                    <p className="mt-2 text-sm font-bold">
                      {mode === "director"
                        ? anyHouseCameraOnline
                          ? heroCamera?.name ?? "Director program output"
                          : "No connected cameras to cut to yet"
                        : heroOnline
                          ? `${heroCamera?.name ?? "Camera"} — live`
                          : `${heroCamera?.name ?? "This camera"} — not connected`}
                    </p>
                    <p className="mt-1 text-xs text-white/65">
                      {heroOnline
                        ? "WebRTC low-latency stream player"
                        : "Provision this camera in the SRT app to bring it online"}
                    </p>
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pb-3 pt-14 text-white">
                  <button aria-label="Pause">
                    <Pause className="h-5 w-5" />
                  </button>
                  <span
                    className="text-[11px] font-black tracking-widest"
                    style={{ color: heroOnline ? LED_GREEN : "#9aa88f", fontFamily: ACTIVE_THEME.fonts.display }}
                  >
                    {heroOnline ? "LIVE" : "OFFLINE"}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-300">
                    {heroOnline && <Signal className="h-4 w-4" />}
                  </span>
                  <button aria-label="Settings">
                    <Settings className="h-5 w-5" />
                  </button>
                  <button aria-label="Fullscreen">
                    <Maximize className="h-5 w-5" />
                  </button>
                </div>
              </section>
            </div>

            {/* Camera grid — real tile chrome, only as many tiles as we
                actually have cameras (no padding with fake offline slots). */}
            <ChromePanel withScrews className="p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ConsoleButton active={mode === "director"} onClick={() => setMode("director")}>
                    Director
                  </ConsoleButton>
                  <ConsoleButton active={mode === "room"} onClick={() => setMode("room")}>
                    Free roam
                  </ConsoleButton>
                </span>
                <LedReadout color={anyHouseCameraOnline ? LED_GREEN : LED_RED} small className="hidden sm:inline-flex">
                  {anyHouseCameraOnline && (
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: LED_GREEN, boxShadow: `0 0 5px ${LED_GREEN}` }} />
                  )}
                  {onlineCameraIds.length}/{cameras.length} CAMS ONLINE
                </LedReadout>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {cameras.map((camera, i) => (
                  <CameraTile
                    key={camera.id}
                    index={i + 1}
                    name={camera.name}
                    online={isOnline(camera.id)}
                    selected={mode === "room" ? selectedCameraId === camera.id : directorCameraId === camera.id}
                    onClick={() => {
                      setMode("room");
                      const room = BROWSE_ROOMS.find((r) => r.cameraIds.includes(camera.id));
                      if (room) setActiveRoomSlug(room.slug);
                      setSelectedCameraId(camera.id);
                    }}
                  />
                ))}
              </div>
            </ChromePanel>

            <ChromePanel withScrews className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black tracking-tight" style={{ ...labelWide, color: PANEL_TEXT }}>
                  {mode === "director" ? "Director" : activeRoom?.title}
                </h1>
                <CheckCircle2 className="h-4 w-4" style={{ color: LED_GREEN }} />
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: "#cfc9b8" }}>
                {mode === "director"
                  ? DIRECTOR_ROOM.description
                  : activeRoom?.description}
              </p>
            </ChromePanel>
          </div>

          {/* ── Right: chat ──────────────────────────────────────────── */}
          <ChromePanel
            withScrews
            className="flex min-h-[420px] flex-col md:sticky md:top-2 md:h-[calc(100vh-5.5rem)]"
            style={{ background: "linear-gradient(180deg,#2b2d2e,#121314,#000)" }}
          >
            <div className="flex h-12 items-center justify-between border-b border-black/40 px-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" style={{ color: LED_AMBER }} />
                <h2 className="text-xs font-black uppercase tracking-widest" style={{ color: PANEL_TEXT, ...label }}>
                  Chat
                </h2>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: LED_GREEN }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: LED_GREEN, boxShadow: `0 0 5px ${LED_GREEN}` }} />
                {onlineCount} ONLINE
              </span>
              <ChevronDown className="h-4 w-4 opacity-60" style={{ color: PANEL_TEXT }} />
            </div>

            <div className="flex items-center gap-1.5 border-b border-black/40 p-2">
              <ConsoleButton active={chatScope === "global"} className="flex-1" onClick={() => setChatScope("global")}>
                <Globe2 className="h-3.5 w-3.5" />
                Global
              </ConsoleButton>
              <ConsoleButton active={chatScope === "room"} className="flex-1 normal-case" onClick={() => setChatScope("room")}>
                {mode === "director" ? "Director" : activeRoom?.title ?? "Room"}
              </ConsoleButton>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto p-3 text-[12.5px] leading-relaxed" style={{ fontFamily: ACTIVE_THEME.fonts.dotMatrix }}>
              {messages.length === 0 && (
                <p className="text-[11px]" style={{ color: "#8a917f" }}>
                  No messages yet — be the first.
                </p>
              )}
              {messages.map((message) => {
                const tag = roleTag[message.role ?? "viewer"] ?? roleTag.viewer;
                return (
                  <div key={message.id}>
                    <span className="mr-1.5 text-[10px]" style={{ color: "#6d7563" }}>
                      {message.time}
                    </span>
                    <span className="mr-1 font-black" style={{ color: tag.color, ...glow(`${tag.color}99`) }}>
                      [{tag.label}]
                    </span>
                    <strong style={{ color: PANEL_TEXT }}>{message.user}</strong>
                    <span style={{ color: "#6d7563" }}>: </span>
                    <span style={{ color: "#cfc7ac" }}>{message.body}</span>
                  </div>
                );
              })}
            </div>

            {chatError && (
              <div className="border-t border-black/40 bg-red-950/40 px-3 py-1.5 text-[11px] font-bold text-red-300">
                {chatError}
              </div>
            )}

            <form onSubmit={handleSend} className="border-t border-black/40 p-2.5">
              <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide" style={{ color: "#8a917f" }}>
                <span>{chatScope === "global" ? "House-wide chat" : "This room only"}</span>
                <Users className="h-3 w-3" />
              </div>
              <div className="flex gap-1.5">
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Send a message..."
                  disabled={sending}
                  className="min-w-0 flex-1 rounded border border-black/50 px-2.5 py-2 text-xs outline-none placeholder:text-[#6d7563] disabled:opacity-50"
                  style={{
                    background: "linear-gradient(180deg,#1f2021,#121314,#000)",
                    color: PANEL_TEXT,
                    boxShadow: "inset 0 2px 8px 0 #000",
                  }}
                />
                <ConsoleButton type="submit" disabled={sending || !chatInput.trim()} ariaLabel="Send">
                  <Send className="h-4 w-4" />
                </ConsoleButton>
              </div>
            </form>
          </ChromePanel>
        </div>

        {/* Bottom strip: XP bar + missions ticker */}
        <ChromePanel withScrews className="mt-2 flex items-center gap-3 p-2">
          <span className="hidden shrink-0 text-[10px] font-black tracking-widest sm:inline" style={{ color: "#241f14" }}>
            {initialProfile ? `${initialProfile.xp} XP` : "SIGN IN FOR XP"}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full border border-black/50 bg-black/60">
            <div className="h-full rounded-full" style={{ width: `${Math.round(xpProgress * 100)}%`, background: "linear-gradient(90deg,#39ff6a,#1a9c3c)" }} />
          </div>
          <div className="hidden flex-1 overflow-hidden lg:block">
            <p className="truncate text-[11px] font-bold" style={{ color: "#241f14" }}>
              {missions.length > 0
                ? `COMPLETE MISSIONS FOR XP & TOKENS — ${missions.map((m) => m.title).join("   ·   ")}`
                : "CHECK BACK FOR NEW MISSIONS"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {[ACTIVE_THEME.images.buttonGray].map(() => null)}
          </div>
        </ChromePanel>
      </div>

      {accountOpen && <AccountOverlay onClose={() => setAccountOpen(false)} />}

      {overlayView === "clans" && (
        <InfoOverlay title="Clans" icon={<Users className="h-4 w-4" style={{ color: "#241f14" }} />} onClose={() => setOverlayView(null)}>
          {clans.length === 0 ? (
            <p className="text-sm" style={{ color: "#4c4630" }}>
              No clans have been created yet.
            </p>
          ) : (
            <div className="space-y-2">
              {clans.map((clan) => (
                <div key={clan.id} className="flex items-center justify-between rounded border border-black/20 p-2.5" style={{ background: `${clan.bannerColor}22` }}>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#241f14" }}>
                      [{clan.tag}] {clan.name}
                    </p>
                    <p className="text-xs" style={{ color: "#4c4630" }}>
                      {clan.memberCount} member{clan.memberCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  {userClan?.clanId === clan.id ? (
                    <ConsoleButton variant="red" disabled={clanBusy} onClick={handleLeaveClan}>
                      Leave
                    </ConsoleButton>
                  ) : (
                    <ConsoleButton disabled={clanBusy || !signedIn} onClick={() => handleJoinClan(clan.id)}>
                      Join
                    </ConsoleButton>
                  )}
                </div>
              ))}
            </div>
          )}
        </InfoOverlay>
      )}

      {overlayView === "tokens" && (
        <InfoOverlay title="Tokens" icon={<Coins className="h-4 w-4" style={{ color: "#241f14" }} />} onClose={() => setOverlayView(null)}>
          <p className="mb-3 text-2xl font-black" style={{ color: "#241f14" }}>
            {initialProfile?.tokens ?? 0} tokens
          </p>
          {tokenTransactions.length === 0 ? (
            <p className="text-sm" style={{ color: "#4c4630" }}>
              No transactions yet — this is where token rewards will show up.
            </p>
          ) : (
            <div className="space-y-1.5">
              {tokenTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-xs">
                  <span style={{ color: "#4c4630" }}>{tx.reason}</span>
                  <span className="font-bold" style={{ color: tx.amount >= 0 ? "#1a6b34" : "#b02318" }}>
                    {tx.amount >= 0 ? "+" : ""}
                    {tx.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </InfoOverlay>
      )}

      {overlayView === "season" && (
        <InfoOverlay title="Season pass" icon={<Trophy className="h-4 w-4" style={{ color: "#241f14" }} />} onClose={() => setOverlayView(null)}>
          <p className="text-sm font-bold" style={{ color: "#241f14" }}>
            {season ? `Season ${season.number}: ${season.name}` : "No active season"}
          </p>
          <p className="mb-3 text-xs" style={{ color: "#4c4630" }}>
            {season ? `Started ${new Date(season.startsAt).toLocaleDateString()}` : ""}
          </p>
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide" style={{ color: "#4c4630" }}>
            Missions
          </p>
          <div className="space-y-2">
            {missions.map((mission) => (
              <div key={mission.id} className="rounded border border-black/20 p-2.5">
                <p className="text-sm font-bold" style={{ color: "#241f14" }}>
                  {mission.title}
                </p>
                <p className="text-xs" style={{ color: "#4c4630" }}>
                  {mission.description} — {mission.rewardXp} XP, {mission.rewardTokens} tokens
                </p>
              </div>
            ))}
          </div>
        </InfoOverlay>
      )}

      {overlayView === "leaderboard" && (
        <InfoOverlay title="Leader board" icon={<Trophy className="h-4 w-4" style={{ color: "#241f14" }} />} onClose={() => setOverlayView(null)}>
          {leaderboard.length === 0 ? (
            <p className="text-sm" style={{ color: "#4c4630" }}>
              No ranked players yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {leaderboard.map((row) => (
                <div key={row.userId} className="flex items-center justify-between text-sm">
                  <span style={{ color: "#241f14" }}>
                    #{row.rank} {row.displayName} {row.clanTag ? `[${row.clanTag}]` : ""}
                  </span>
                  <span className="font-bold" style={{ color: "#4c4630" }}>
                    {row.xp} XP
                  </span>
                </div>
              ))}
            </div>
          )}
        </InfoOverlay>
      )}

      {overlayView === "archives" && (
        <InfoOverlay title="Archives" icon={<Archive className="h-4 w-4" style={{ color: "#241f14" }} />} onClose={() => setOverlayView(null)}>
          {archives.length === 0 ? (
            <p className="text-sm" style={{ color: "#4c4630" }}>
              No archived episodes yet.
            </p>
          ) : (
            <div className="space-y-2">
              {archives.map((entry) => (
                <div key={entry.id} className="rounded border border-black/20 p-2.5">
                  <p className="text-sm font-bold" style={{ color: "#241f14" }}>
                    {entry.episodeNumber ? `Ep. ${entry.episodeNumber} — ` : ""}
                    {entry.title}
                  </p>
                  {entry.airedAt && (
                    <p className="text-xs" style={{ color: "#4c4630" }}>
                      {new Date(entry.airedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </InfoOverlay>
      )}
    </div>
  );
}
