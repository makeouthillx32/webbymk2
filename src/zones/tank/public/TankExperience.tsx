"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Archive,
  AudioLines,
  Bell,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  Coins,
  Compass,
  CreditCard,
  Globe2,
  HelpCircle,
  Home,
  Key,
  LogOut,
  Maximize,
  Megaphone,
  MessageSquare,
  Minimize2,
  MoreVertical,
  Package,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Send,
  Settings,
  Shield,
  Sparkles,
  Store,
  Trophy,
  User,
  Users,
  Vote,
  Volume2,
  VolumeX,
  Wifi,
  X,
  Zap,
  Activity,
  Gauge,
  Info,
} from "lucide-react";
import type {
  CameraDirectorySnapshot,
  ChatMessage,
  DerivedRoom,
  DiscoveredCamera,
  PlaybackProtocol,
  TankSfxLibraryEntry,
} from "../contracts";
import { rooms as fixtureRooms } from "../fixtures";
import { ACTIVE_THEME, getTankBackgroundTheme } from "../theme";
import { createClient } from "@/utils/supabase/client";
import {
  useTankRealtimeChat,
  drainClientChatStorage,
} from "./useTankRealtimeChat";
import { useTankWatchTimeAccrual } from "./useTankWatchTimeAccrual";
import { useTankSoundboardPlayer } from "./useTankSoundboardPlayer";
import { useTankRoomAudioOutput } from "./useTankRoomAudioOutput";
import { useTankAudioRequestPlayback } from "./useTankAudioRequestPlayback";
import { TankChatBody } from "./TankChatEmoji";
import { AccountOverlay } from "./AccountOverlay";
import { ProfileOverlay } from "./components/ProfileOverlay";
import {
  NotificationsOverlay,
  type TankNotificationItem,
} from "./components/NotificationsOverlay";
import { DockOverlay } from "./components/DockOverlay";
import { InventoryOverlay } from "./components/InventoryOverlay";
import { ClicksOverlay } from "./components/ClansOverlay";
import { SeasonPassOverlay } from "./components/SeasonPassOverlay";
import {
  PollOverlay,
  getTankPollVoterClientId,
} from "./components/PollOverlay";
import { DailyClaimModal } from "./components/DailyClaimModal";
import { PrizeMachineModal } from "./components/PrizeMachineModal";
import { SecretCodeModal } from "./components/SecretCodeModal";
import { TankBanAppealsModal } from "./components/TankBanAppealsModal";
import { DirectorRoomLabel } from "./components/DirectorRoomLabel";
import { getDirectorModePresentation } from "../director/directorModePresentation";
import { useViewerPresence } from "./useViewerPresence";
import {
  SettingsOverlay,
  DEFAULT_SETTINGS,
  PATTERNS_CATALOG,
  type TankSettings,
} from "./components/SettingsOverlay";
import { TankThemeStyles } from "./TankThemeStyles";
import { TankViewportDebugHud } from "./components/TankViewportDebugHud";
import { TankCameraDebugHud } from "./components/TankCameraDebugHud";
import {
  CameraPlayer,
  type CameraPlayerHandle,
  type LiveEdgeInfo,
  type StreamStabilityInfo,
} from "./CameraPlayer";
import { useNetworkQuality } from "./useNetworkQuality";
import {
  countNewInventoryItems,
  snapshotInventoryQuantities,
} from "./mobileActionBadges";
import { safeStorage } from "@/lib/safeStorage";
import {
  completeMission,
  joinClan,
  leaveClan,
  recordTankAuthSignIn,
  saveTankUserSettings,
} from "../server/actions";
import { resolveTankDisplayName } from "../identity";
import { buildGlobalLogoutUrl } from "@/lib/authRedirect";
import { ChromePanel } from "./components/ChromePanel";
import { ConsoleButton } from "./components/ConsoleButton";
import { TopConsoleStrip } from "./components/TopConsoleStrip";
import { ProfilePanel } from "./components/ProfilePanel";
import {
  NavigationPanel,
  type OverlayType,
} from "./components/NavigationPanel";
import { InventoryPanel } from "./components/InventoryPanel";
import {
  MissionsTabsPanel,
  type SidebarTab,
} from "./components/MissionsTabsPanel";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { CameraRosterPanel } from "./components/CameraRosterPanel";
import { RoomDescriptionPanel } from "./components/RoomDescriptionPanel";
import { ChatConsolePanel } from "./components/ChatConsolePanel";
import { ArchiveOverlayPanel } from "./components/ArchiveOverlayPanel";
import { TankExperienceSkeleton } from "./components/TankExperienceSkeleton";
import { CrtTransition } from "./components/CrtTransition";
import { MobileRoomGrid } from "./components/MobileRoomGrid";
import { MobileRoomSourceStrip } from "./components/MobileRoomSourceStrip";
import { TankMarkIcon } from "./components/TankMarkIcon";
import { useServerDirector } from "../director/useServerDirector";
import type { ServerDirectorState } from "../server/serverDirectorEngine";
import { useDirectorAttention } from "../director/useDirectorAttention";
import { useCameraAudioMetrics } from "../director/useCameraAudioMetrics";
import { negotiateDirectorFeed } from "../director/directorNegotiator";
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
import {
  getLevelForXp,
  getXpFloorForLevel,
  getXpCeilForLevel,
  getXpProgressPercent,
} from "../xpLevels";

// Stripe's browser SDK must not be part of Tank's startup path. A static import
// evaluates loadStripe() before the store is opened, which makes every viewer
// wait on js.stripe.com and can leave iOS Safari's initial navigation hanging
// when that third-party request is blocked or slow. Load the checkout bundle
// only after the user explicitly opens the store.
const TankStorePanel = dynamic(
  () =>
    import("./components/TankStorePanel").then((module) =>
      module.TankStorePanel,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="py-6 text-center text-xs font-black uppercase tracking-wider text-[#4c4630]">
        Opening secure checkout…
      </p>
    ),
  },
);

// The single persistent shell for the whole viewer experience: no route
// changes, everything below is client state. Structural pass: matches the
// 24/7 multi-camera console layout facet-for-facet — profile rail with
// nav (Clans/Tokens/Season Pass/Leaderboard/Archives), an inventory panel,
// a Missions/Logs/Poll tab stack, a live stats readout, a camera grid, and
// chat — all built on the real DB "bones" from
// supabase/migrations/20260814140000_tank_platform_bones.sql, not
// fabricated numbers. Where a system has no real data yet (no clans
// created, no archived episodes, no active poll) the UI says so honestly
// instead of inventing activity.

// Director stays a static, curated concept (the program cut) — not a camera
// grouping, so it's not part of the live room derivation below.
const DIRECTOR_ROOM =
  fixtureRooms.find((room) => room.slug === "director") ?? fixtureRooms[0];
const DIRECTOR_SWITCH_INTERVAL_MS = 8000;
const TANK_MERCH_URL = "https://shop.unenter.live/tank";

type ViewMode = "director" | "room" | "grid";
export type TankInitialLocation = { mode: ViewMode; slug?: string };
type ChatScope = "global" | "room" | "click";
type OverlayView =
  | "clicks"
  | "tokens"
  | "store"
  | "inventory"
  | "season"
  | "season-required"
  | "leaderboard"
  | "archives"
  | "missions"
  | "chat"
  | "stats"
  | "audio-request"
  | "poll"
  | null;
type SidebarTab = "missions" | "logs" | "poll";

const LED_RED = "#ff3b2f";
const LED_GREEN = "#39ff6a";
const LED_AMBER = "#ffb020";
const glow = (rgb: string) => ({
  textShadow: `0 0 6px ${rgb}, 0 0 1px ${rgb}`,
});
const PANEL_TEXT = "#e7e2d6";

function MobileUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} unread update${count === 1 ? "" : "s"}`}
      className="pointer-events-none absolute -right-1.5 -top-1.5 z-30 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-[#ff3b2f] px-1 font-mono text-[9px] font-black leading-none text-white shadow-[0_2px_6px_rgba(0,0,0,.8)]"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

const roleTag: Record<string, { label: string; color: string }> = {
  admin: { label: "ADMIN", color: LED_RED },
  moderator: { label: "MOD", color: LED_AMBER },
  member: { label: "MEMBER", color: "#4fd6ff" },
  viewer: { label: "VIEWER", color: "#9aa88f" },
};

// Iceberg Leveling Curve: 600 * (level - 1)^2.3
function xpFloorForLevel(level: number) {
  if (level <= 1) return 0;
  return Math.floor(600 * Math.pow(level - 1, 2.3));
}

function formatCompactTokenBalance(value: number | null | undefined): string {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return "0";
  return Math.ceil(Math.max(0, numericValue)).toLocaleString("en-US");
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
      style={{
        color,
        fontFamily: ACTIVE_THEME.fonts.display,
        ...glow(`${color}cc`),
      }}
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
  playbackUrl = null,
  playbackProtocol = "none",
}: {
  index: number;
  name: string;
  online: boolean;
  selected?: boolean;
  onClick?: () => void;
  playbackUrl?: string | null;
  playbackProtocol?: PlaybackProtocol;
}) {
  const hasRealFeed = Boolean(playbackUrl) && playbackProtocol !== "none";
  return (
    <button
      onClick={onClick}
      className="flex flex-col overflow-hidden rounded text-left"
      style={{
        background: "linear-gradient(180deg,#9a969b,#6c686c)",
        border: selected ? "2px solid #32c0e0" : "2px solid rgba(0,0,0,.35)",
        boxShadow:
          "inset 0 0 2px rgba(255,255,255,.4), 2px 2px 0 rgba(0,0,0,.4)",
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
          online
            ? "bg-gradient-to-br from-cyan-500/30 via-blue-950/60 to-slate-950"
            : "bg-slate-900"
        }`}
      >
        {hasRealFeed ? (
          <CameraPlayer
            playbackUrl={playbackUrl}
            playbackProtocol={playbackProtocol}
            online={online}
          />
        ) : (
          !online && (
            <span className="absolute inset-0 grid place-items-center">
              <CameraOff className="h-5 w-5 text-white/25" />
            </span>
          )
        )}
        {online && (
          <span
            className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: LED_RED,
              boxShadow: `0 0 5px ${LED_RED}`,
            }}
          />
        )}
      </span>
      <span
        className="mx-1 mb-1 h-1.5 rounded-full"
        style={{
          background:
            "repeating-linear-gradient(90deg,#3a3a3a 0 2px,#555 2px 4px)",
        }}
      />
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

function InfoOverlay({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <ChromePanel
        withScrews
        className="max-h-[80vh] w-full max-w-md overflow-hidden"
      >
        <div
          onClick={(event) => event.stopPropagation()}
          className="flex max-h-[80vh] flex-col"
        >
          <div className="flex items-center justify-between border-b border-black/40 px-6 py-3">
            <div className="flex items-center gap-2">
              {icon}
              <span
                className="text-xs font-black uppercase tracking-widest"
                style={{
                  color: "#241f14",
                  fontFamily: ACTIVE_THEME.fonts.label,
                }}
              >
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
  initialLocation?: TankInitialLocation;
  initialCameraSnapshot?: CameraDirectorySnapshot | null;
  initialProfile: TankPlayerProfile | null;
  initialDirectorState?: ServerDirectorState | null;
  season: TankSeason | null;
  missions: TankMission[];
  leaderboard: TankLeaderboardRow[];
  clans: TankClanSummary[];
  userClan: TankClanMembership | null;
  inventory: TankInventoryEntry[];
  archives: TankArchiveEntry[];
  tokenTransactions: TankTokenTransaction[];
};

const COOKIE_MOBILE_CHAT_SIZE = "tank_mobile_chat_size";

function readSavedMobileChatSize(): "hidden" | "half" | "full" {
  if (typeof window === "undefined") return "half";
  try {
    const local = safeStorage.getItem(COOKIE_MOBILE_CHAT_SIZE);
    if (local === "hidden" || local === "half" || local === "full")
      return local;
  } catch {}
  return "half";
}

function persistMobileChatSize(size: "hidden" | "half" | "full") {
  try {
    safeStorage.setItem(COOKIE_MOBILE_CHAT_SIZE, size);
  } catch {}
}

// ── Room + chat persistence across refreshes ──────────────────────────────────
const LS_ROOM_MODE = "tank_room_mode";
const LS_ROOM_SLUG = "tank_room_slug";
const LS_CHAT_TARGET = "tank_chat_target";
const LS_ROOM_ORIGIN = "tank_room_origin";

/**
 * Self-healing cleanup: removes legacy UI state cookies that previously bloated
 * HTTP request headers and triggered HTTP 431 / proxy buffer errors.
 */
export function purgeLegacyTankCookies() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const LEGACY_KEYS = [
    "tank_mobile_chat_size",
    "tank_room_mode",
    "tank_room_slug",
    "tank_chat_target",
    "tank_room_origin",
    "tank_background_theme",
  ];
  const host = window.location.hostname;
  const domains = [undefined, host, `.${host}`, ".unenter.live", "unenter.live"];
  const paths = ["/", "/rooms", ""];

  for (const key of LEGACY_KEYS) {
    for (const domain of domains) {
      for (const path of paths) {
        const domainPart = domain ? `; domain=${domain}` : "";
        const pathPart = path ? `; path=${path}` : "; path=/";
        document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT${pathPart}${domainPart}; SameSite=Lax`;
      }
    }
  }
}

// ── Self-healing incompatible-state recovery ──────────────────────────────────
//
// The known workaround for the iOS Safari / Brave "stuck loading forever"
// incident was deleting ALL unenter.live website data — which also signs the
// person out, and requires them to know to do it, and requires us to reach
// every affected person to tell them. That's a bad fallback, not a fix (see
// vault/Core/tank-ios-safari-persisted-site-data-forever-load.md's own
// engineering follow-up: "version persisted Tank state and safely discard
// incompatible payloads instead of allowing old schemas to block boot").
//
// This does that: a single version stamp. If it's missing (first visit — not
// an error) or doesn't match, every key Tank itself persists gets cleared and
// the stamp is rewritten. Nothing else on unenter.live is touched — not the
// Supabase auth cookie, not theme, not promo/POS/consent state — so this can
// never sign someone out or reset unrelated preferences. Bump
// TANK_STATE_SCHEMA_VERSION whenever a future change to what these keys hold
// could make an old value unsafe to trust at boot.
const TANK_STATE_SCHEMA_VERSION = "1";
const LS_STATE_SCHEMA_VERSION = "tank_state_schema_version";

// Every key Tank itself writes to localStorage — kept in sync with the
// Tank-prefixed entries in safeStorage.ts's own PROTECTED_KEYS list, which is
// already the codebase's authoritative catalog of "Tank's persisted state".
const TANK_OWNED_STORAGE_KEYS = [
  LS_ROOM_MODE,
  LS_ROOM_SLUG,
  LS_CHAT_TARGET,
  LS_ROOM_ORIGIN,
  COOKIE_MOBILE_CHAT_SIZE, // "tank_mobile_chat_size"
  "tank_settings_v1",
  "tank:assigned-room-key",
  "tank_local_profile",
] as const;

/**
 * Runs once per boot, before anything reads persisted room/chat state.
 * Self-heals a stale/incompatible schema without ever touching auth,
 * theme, or any other unenter.live state.
 */
function purgeIncompatibleTankState() {
  if (typeof window === "undefined") return;
  try {
    const stamped = safeStorage.getItem(LS_STATE_SCHEMA_VERSION);
    if (stamped === TANK_STATE_SCHEMA_VERSION) return;

    for (const key of TANK_OWNED_STORAGE_KEYS) {
      safeStorage.removeItem(key);
    }
    safeStorage.setItem(LS_STATE_SCHEMA_VERSION, TANK_STATE_SCHEMA_VERSION);
  } catch {}
}

function readRoomLocation(): TankInitialLocation | null {
  try {
    if (typeof window === "undefined") return null;

    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (path === "/rooms") return { mode: "grid" };
    if (path === "/rooms/director") return { mode: "director" };
    if (path.startsWith("/rooms/")) {
      const slug = decodeURIComponent(path.slice("/rooms/".length)).trim();
      if (slug && !slug.includes("/")) return { mode: "room", slug };
    }

    // One-way compatibility for links saved before clean room routes shipped.
    // The next persistence pass removes the hash and replaces it with /rooms/*.
    const hash = window.location.hash;
    if (hash === "#all-rooms") return { mode: "grid" };
    if (hash === "#director") return { mode: "director" };
    if (hash.startsWith("#room/")) {
      const slug = decodeURIComponent(hash.slice("#room/".length)).trim();
      if (slug) return { mode: "room", slug };
    }
  } catch {}
  return null;
}

function persistRoomLocation(
  _mode: ViewMode,
  _slug: string,
  _historyMode: "push" | "replace" = "replace",
) {
  try {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    // `refresh=true` was a legacy auth-session cache buster. A full-page auth
    // return already carries the shared session cookie, and preserving this
    // transient flag made it reappear on every room change.
    params.delete("refresh");
    const query = params.toString();
    const nextUrl = query ? `/?${query}` : "/";
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl === nextUrl && !window.location.hash) return;
    window.history.replaceState(window.history.state, "", nextUrl);
  } catch {}
}

function readPersistedRoomValue(key: string): string | null {
  try {
    const stored = safeStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {}
  return null;
}

function persistRoomValue(key: string, value: string) {
  try {
    safeStorage.setItem(key, value);
  } catch {}
}

function readSavedRoomMode(): ViewMode {
  try {
    const v = readPersistedRoomValue(LS_ROOM_MODE);
    if (v === "director" || v === "room" || v === "grid") return v;
  } catch {}
  return "director";
}

function readSavedRoomSlug(): string {
  try {
    const v = readPersistedRoomValue(LS_ROOM_SLUG);
    if (v) return v;
  } catch {}
  return DIRECTOR_ROOM.slug;
}

function readSavedChatTarget(): string {
  try {
    const v = readPersistedRoomValue(LS_CHAT_TARGET);
    if (v) return v;
  } catch {}
  return "global";
}

function readSavedRoomOrigin(): Exclude<ViewMode, "room"> {
  try {
    const v = readPersistedRoomValue(LS_ROOM_ORIGIN);
    if (v === "director" || v === "grid") return v;
  } catch {}
  return "grid";
}

function persistRoomState(
  mode: ViewMode,
  slug: string,
  chatTarget: string,
  origin: Exclude<ViewMode, "room">,
  historyMode: "push" | "replace" = "replace",
) {
  try {
    persistRoomLocation(mode, slug, historyMode);
    persistRoomValue(LS_ROOM_MODE, mode);
    persistRoomValue(LS_ROOM_SLUG, slug);
    persistRoomValue(LS_CHAT_TARGET, chatTarget);
    persistRoomValue(LS_ROOM_ORIGIN, origin);
  } catch {}
}

export function TankExperience({
  initialLocation,
  initialCameraSnapshot = null,
  initialProfile,
  initialDirectorState = null,
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
    initialCameraSnapshot,
  );
  const [mounted, setMounted] = useState(false);
  const [dockTime, setDockTime] = useState("");

  useEffect(() => {
    setMounted(true);
    const updateTime = () => {
      setDockTime(
        new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/tank/cameras", {
          cache: "no-store",
        });
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

  // Merge live rooms with canonical house rooms so all room feeds and switchers
  // are always visible on desktop and mobile.
  const browseRooms = useMemo(() => {
    const liveRooms = snapshot?.rooms ?? [];
    const map = new Map<
      string,
      {
        id: string;
        roomKey: string;
        title: string;
        eyebrow: string;
        description: string;
        cameraIds: string[];
        live: boolean;
        tags: string[];
      }
    >();

    // Add all fixture rooms first (excluding director from browse rooms)
    for (const r of fixtureRooms) {
      if (r.slug !== "director") {
        map.set(r.slug, {
          id: r.id,
          roomKey: r.slug,
          title: r.title,
          eyebrow: r.eyebrow,
          description: r.description,
          cameraIds: r.cameraIds,
          live: r.live,
          tags: r.tags,
        });
      }
    }

    // Merge live rooms from snapshot
    for (const lr of liveRooms) {
      if (lr.roomKey !== "director") {
        const curated = map.get(lr.roomKey);
        const liveTags = lr.tags?.filter(Boolean) ?? [];
        const fallbackDescription = liveTags.includes("obs")
          ? "A live room streamed by a Tank member."
          : liveTags.includes("mobile") || liveTags.includes("srtla")
            ? "A roaming IRL camera feed."
            : "Connected camera room view.";
        map.set(lr.roomKey, {
          id: lr.id,
          roomKey: lr.roomKey,
          title: lr.title?.trim() || curated?.title || lr.roomKey,
          eyebrow: lr.eyebrow?.trim() || curated?.eyebrow || "Live room",
          description:
            lr.description?.trim() ||
            curated?.description ||
            fallbackDescription,
          cameraIds: lr.cameraIds,
          live: lr.live,
          tags: liveTags.length > 0 ? liveTags : (curated?.tags ?? []),
        });
      }
    }

    return Array.from(map.values());
  }, [snapshot?.rooms]);

  // Direct /rooms/* requests receive their initial location from the server,
  // keeping SSR and the first browser render identical. Bare / requests defer
  // cookie/localStorage restoration until after mount so mobile Safari cannot
  // turn a storage hydration mismatch into a jump back to Director.
  const [mode, setMode] = useState<ViewMode>(initialLocation?.mode ?? "director");
  const [activeRoomSlug, setActiveRoomSlug] = useState<string>(
    initialLocation?.slug ?? DIRECTOR_ROOM.slug,
  );
  const [explicitChatTarget, setExplicitChatTarget] = useState<string | null>(
    null,
  );
  const [roomStateRestored, setRoomStateRestored] = useState(false);
  // Tracks the mode the user was in *before* the current one so the mobile
  // breadcrumb back button always returns to the real previous view, not a
  // hardcoded "Director" destination.
  const prevModeRef = useRef<Exclude<ViewMode, "room">>("grid");
  const navigateTo = (next: ViewMode) => {
    if (mode !== "room") prevModeRef.current = mode;
    // Save during the navigation event, not only in an effect. Mobile Safari
    // can reload or suspend the page before React flushes that effect.
    persistRoomState(
      next,
      activeRoomSlug,
      explicitChatTarget ?? "global",
      prevModeRef.current,
      "push",
    );
    setMode(next);
  };
  const openRoom = (roomSlug: string) => {
    if (mode !== "room") prevModeRef.current = mode;
    persistRoomState(
      "room",
      roomSlug,
      explicitChatTarget ?? "global",
      prevModeRef.current,
      "push",
    );
    setActiveRoomSlug(roomSlug);
    setMode("room");
  };

  useEffect(() => {
    purgeIncompatibleTankState();
    const savedLocation = initialLocation ?? readRoomLocation();
    const savedMode = savedLocation?.mode ?? readSavedRoomMode();
    const savedSlug = savedLocation?.slug ?? readSavedRoomSlug();
    const savedChatTarget = readSavedChatTarget();
    const savedOrigin = readSavedRoomOrigin();

    prevModeRef.current = savedOrigin;
    setActiveRoomSlug(savedSlug);
    setExplicitChatTarget(savedChatTarget);
    setMode(savedMode);
    setRoomStateRestored(true);
  }, [initialLocation]);

  useEffect(() => {
    const restoreFromHistory = () => {
      const location = readRoomLocation();
      if (!location) return;
      setMode(location.mode);
      if (location.slug) setActiveRoomSlug(location.slug);
    };
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, []);

  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>(
    undefined,
  );
  const [chatScope, setChatScope] = useState<ChatScope>("global");
  const [accountOpen, setAccountOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [dailyClaimOpen, setDailyClaimOpen] = useState(false);
  const [prizeMachineOpen, setPrizeMachineOpen] = useState(false);
  const [secretCodeOpen, setSecretCodeOpen] = useState(false);
  const [appealsModalOpen, setAppealsModalOpen] = useState(false);
  const [appealsTargetUserId, setAppealsTargetUserId] = useState<
    string | undefined
  >(undefined);
  const [userNotifications, setUserNotifications] = useState<
    TankNotificationItem[]
  >([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playerMenuOpen, setPlayerMenuOpen] = useState(false);
  const [nerdStatsOpen, setNerdStatsOpen] = useState(false);
  const [settings, setSettings] = useState<TankSettings>(() => {
    if (initialProfile?.settings) {
      return {
        ...DEFAULT_SETTINGS,
        ...(initialProfile.settings as Partial<TankSettings>),
      };
    }
    return DEFAULT_SETTINGS;
  });
  // Fixed default on first render (matches SSR, where window/cookies don't
  // exist) — the effect below applies the real saved value post-mount.
  // Reading cookies/localStorage inside the useState initializer itself
  // would return different values on the server vs. the client's first
  // hydration pass for any returning visitor, which is a guaranteed React
  // hydration mismatch (error #418) that blows away and re-renders the
  // whole mobile chat panel right after load.
  const [mobileChatSize, setMobileChatSizeState] = useState<
    "hidden" | "half" | "full"
  >("half");

  useEffect(() => {
    // Scrub legacy UI cookies that previously caused HTTP 431 header bloat
    purgeLegacyTankCookies();

    try {
      const saved = (safeStorage.getItem(COOKIE_MOBILE_CHAT_SIZE) ??
        readSavedMobileChatSize()) as "hidden" | "half" | "full" | null;
      if (
        saved &&
        (saved === "hidden" || saved === "half" || saved === "full")
      ) {
        setMobileChatSizeState(saved);
      }
    } catch {}

    // Auto-recover from Next.js HMR stale chunk errors on hot reload
    const handleChunkError = (event: ErrorEvent) => {
      if (
        event.message?.includes("ChunkLoadError") ||
        event.message?.includes("Loading chunk") ||
        event.message?.includes("Failed to find Server Action")
      ) {
        window.location.reload();
      }
    };
    window.addEventListener("error", handleChunkError);
    return () => window.removeEventListener("error", handleChunkError);
  }, []);

  const setMobileChatSize = (size: "hidden" | "half" | "full") => {
    setMobileChatSizeState(size);
    persistMobileChatSize(size);
  };
  const [mobileDockOpen, setMobileDockOpen] = useState(false);
  const [mobileProfileMenuOpen, setMobileProfileMenuOpen] = useState(false);
  const mobileProfileMenuRef = useRef<HTMLDivElement | null>(null);
  const [liveInventory, setLiveInventory] =
    useState<TankInventoryEntry[]>(inventory);
  const [newInventoryCount, setNewInventoryCount] = useState(0);
  const [unvotedPollCount, setUnvotedPollCount] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [overlayView, setOverlayView] = useState<OverlayView>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("missions");
  const [userClan, setUserClan] = useState(initialUserClan);
  const [clanBusy, setClanBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(!!initialProfile);
  const [playerProfile, setPlayerProfile] = useState<
    | (TankPlayerProfile & {
        avatarUrl?: string | null;
        nameColor?: string | null;
        bio?: string | null;
      })
    | null
  >(
    initialProfile
      ? {
          ...initialProfile,
          avatarUrl: initialProfile.avatarUrl ?? null,
          nameColor: initialProfile.nameColor ?? null,
        }
      : null,
  );
  const setupPromptedRef = useRef(false);

  useEffect(() => {
    if (
      signedIn &&
      playerProfile?.profileSetupComplete === false &&
      !setupPromptedRef.current
    ) {
      setupPromptedRef.current = true;
      setProfileOpen(true);
    }
  }, [playerProfile?.profileSetupComplete, signedIn]);

  useEffect(() => setLiveInventory(inventory), [inventory]);

  useEffect(() => {
    let active = true;
    const refreshInventory = async () => {
      if (!signedIn) return;
      try {
        const response = await fetch("/api/tank/inventory", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          inventory?: TankInventoryEntry[];
        };
        if (active && Array.isArray(payload.inventory)) {
          setLiveInventory(payload.inventory);
        }
      } catch {}
    };
    void refreshInventory();
    const interval = window.setInterval(() => void refreshInventory(), 20_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [signedIn]);

  useEffect(() => {
    const profileId = playerProfile?.id;
    if (!signedIn || !profileId) {
      setNewInventoryCount(0);
      return;
    }
    const storageKey = `tank_seen_inventory_v1:${profileId}`;
    const current = snapshotInventoryQuantities(liveInventory);
    try {
      const saved = safeStorage.getItem(storageKey);
      if (!saved) {
        safeStorage.setItem(storageKey, JSON.stringify(current));
        setNewInventoryCount(0);
        return;
      }
      const seen = JSON.parse(saved) as Record<string, number>;
      setNewInventoryCount(countNewInventoryItems(liveInventory, seen));
    } catch {
      setNewInventoryCount(0);
    }
  }, [liveInventory, playerProfile?.id, signedIn]);

  useEffect(() => {
    let active = true;
    const refreshPollBadge = async () => {
      try {
        const response = await fetch("/api/tank/poll/active", {
          cache: "no-store",
          headers: { "x-tank-voter-id": getTankPollVoterClientId() },
        });
        if (!response.ok) return;
        const { poll } = (await response.json()) as {
          poll: { active?: boolean; viewerVote?: number | null } | null;
        };
        if (active) {
          setUnvotedPollCount(
            poll?.active && poll.viewerVote == null ? 1 : 0,
          );
        }
      } catch {}
    };
    void refreshPollBadge();
    const interval = window.setInterval(() => void refreshPollBadge(), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const unreadNotificationCount = userNotifications.filter(
    (notification) => !notification.read,
  ).length;
  const mobileActionUnreadCount =
    unvotedPollCount + newInventoryCount + unreadNotificationCount;

  const acknowledgeInventory = () => {
    const profileId = playerProfile?.id;
    if (profileId) {
      try {
        safeStorage.setItem(
          `tank_seen_inventory_v1:${profileId}`,
          JSON.stringify(
            snapshotInventoryQuantities(liveInventory),
          ),
        );
      } catch {}
    }
    setNewInventoryCount(0);
  };

  useEffect(() => {
    if (!mobileProfileMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        mobileProfileMenuRef.current &&
        !mobileProfileMenuRef.current.contains(event.target as Node)
      ) {
        setMobileProfileMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [mobileProfileMenuOpen]);

  useEffect(() => {
    if (initialProfile?.settings) {
      setSettings({
        ...DEFAULT_SETTINGS,
        ...(initialProfile.settings as Partial<TankSettings>),
      });
      return;
    }
    try {
      const saved = safeStorage.getItem("tank_settings_v1");
      if (saved) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
    } catch {}
  }, [initialProfile?.settings]);

  const handleSaveSettings = (updated: TankSettings) => {
    setSettings(updated);
    try {
      safeStorage.setItem("tank_settings_v1", JSON.stringify(updated));
    } catch {}
    if (signedIn) {
      void saveTankUserSettings(updated as Record<string, unknown>);
    }
  };

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return;
      if (user) {
        const currentTags = Array.isArray(user.user_metadata?.tags)
          ? user.user_metadata.tags as string[]
          : [];
        const canonicalName = initialProfile?.displayName?.trim();
        if (
          !currentTags.includes("tank") ||
          (canonicalName && user.user_metadata?.display_name !== canonicalName)
        ) {
          void recordTankAuthSignIn();
        }
        setSignedIn(true);
        let localData: {
          displayName?: string;
          avatarUrl?: string;
          nameColor?: string;
          bio?: string;
        } = {};
        try {
          const cached = safeStorage.getItem("tank_local_profile");
          if (cached) localData = JSON.parse(cached);
        } catch {}

        const userRole =
          (user.app_metadata?.role as string) ||
          (user.user_metadata?.role as string) ||
          (user.email?.toLowerCase() === "admin@unenter.live"
            ? "admin"
            : "member");

        setPlayerProfile((prev) => ({
          // Carry the auth id through: this updater rebuilds the profile from
          // scratch, and dropping the id here would re-break the "you" badge
          // and the optimistic-send identity.
          id: prev?.id ?? user.id,
          xp: prev?.xp ?? 0,
          level: prev?.level ?? 1,
          tokens: prev?.tokens ?? 0,
          displayName: resolveTankDisplayName({
            localDisplayName: localData.displayName,
            tankDisplayName: prev?.displayName,
            authDisplayName: user.user_metadata?.display_name,
            providerFullName: user.user_metadata?.full_name,
            providerUserName: user.user_metadata?.user_name,
            email: user.email,
          }),
          avatarUrl:
            localData.avatarUrl ||
            prev?.avatarUrl ||
            (user.user_metadata?.avatar_url as string) ||
            "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png",
          nameColor:
            localData.nameColor ||
            (user.user_metadata?.name_color as string) ||
            "#ff3b2f",
          bio: localData.bio || (user.user_metadata?.bio as string) || "",
          role: userRole,
        }));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Global Keyboard Shortcuts: 'D' for Dock, 'I' for Inventory
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        setDockOpen((prev) => !prev);
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        setOverlayView((prev) => (prev === "inventory" ? null : "inventory"));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Real mission completion, not just a static checklist. Idempotent
  // server-side (tank_complete_mission is a no-op past the first call), so
  // firing this on every sign-in is safe — it just won't re-award.
  const signInMissionReported = useRef(false);
  useEffect(() => {
    if (!signedIn || signInMissionReported.current) return;
    signInMissionReported.current = true;
    void completeMission("Sign in for the first time");
  }, [signedIn]);

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
    const diffDays = Math.max(
      1,
      Math.floor((now.getTime() - started) / 86_400_000) + 1,
    );
    return diffDays;
  }, [season, now]);

  const watchMode =
    mode === "room" && activeRoomSlug !== "director"
      ? "room_direct"
      : "director";

  const networkQuality = useNetworkQuality();
  const [heroLiveEdge, setHeroLiveEdge] = useState<LiveEdgeInfo>({
    isLive: true,
    latencySec: 0,
    isPaused: false,
    seekableEnd: 0,
    currentTime: 0,
    bufferDuration: 0,
  });
  // Real drop/recovery counters from the player itself — see
  // CameraPlayer's StreamStabilityInfo doc comment for why this exists
  // alongside bufferingInfo instead of duplicating it.
  const [heroStability, setHeroStability] = useState<StreamStabilityInfo>({
    reconnectCount: 0,
    isBuffering: false,
    bufferingReason: null,
    lastEventAt: null,
  });

  const {
    currentXp,
    currentTokens,
    currentLevel,
    ratePerSecond,
    levelUpNotif,
    clearLevelUpNotif,
    applyReward,
  } = useTankWatchTimeAccrual(
    initialProfile?.xp ?? 0,
    initialProfile?.tokens ?? 0,
    initialProfile?.level ?? 1,
    signedIn,
    watchMode,
    activeRoomSlug ?? "director",
    {
      averageLatencyMs: Math.round((heroLiveEdge?.latencySec || 0) * 1000),
      networkType: networkQuality?.effectiveType || "4g",
    },
  );

  const activeXp = signedIn
    ? currentXp
    : (playerProfile?.xp ?? initialProfile?.xp ?? 0);
  const currentLvl = signedIn
    ? getLevelForXp(activeXp)
    : (playerProfile?.level ?? initialProfile?.level ?? 1);
  const xpFloor = getXpFloorForLevel(currentLvl);
  const xpCeil = getXpCeilForLevel(currentLvl);
  const xpProgress = signedIn
    ? Math.min(
        1,
        Math.max(0, (activeXp - xpFloor) / Math.max(1, xpCeil - xpFloor)),
      )
    : 0;

  const livePlayerProfile: TankPlayerProfile | null = useMemo(() => {
    if (!playerProfile) return initialProfile ?? null;
    return {
      ...playerProfile,
      xp: activeXp,
      level: currentLvl,
      tokens: signedIn ? currentTokens : playerProfile.tokens,
    };
  }, [
    playerProfile,
    initialProfile,
    activeXp,
    currentLvl,
    currentTokens,
    signedIn,
  ]);

  // Roster comes straight from the live receiver-manager snapshot, sorted by
  // the admin-curated priority — any camera the manager auto-provisions
  // shows up here with no code edit required (previously this iterated a
  // hardcoded array in fixtures.ts that had to be hand-updated per camera).
  const rosterCameras = useMemo(
    () =>
      [...(snapshot?.cameras ?? [])].sort((a, b) => a.priority - b.priority),
    [snapshot],
  );

  const onlineCameraIds = useMemo(
    () =>
      rosterCameras
        .filter((camera) => isOnline(camera.id))
        .map((camera) => camera.id),
    [rosterCameras, snapshot],
  );

  const activeBrowseRoom =
    mode === "room"
      ? browseRooms.find((room) => room.roomKey === activeRoomSlug)
      : undefined;

  const resolvedRoomFeaturedCameraId = useMemo(() => {
    if (!activeBrowseRoom) return undefined;
    // 1. First check if any camera assigned to this room is online
    const onlineCam = activeBrowseRoom.cameraIds.find((cid) => isOnline(cid));
    if (onlineCam) return onlineCam;
    // 2. Direct room key match if it's a camera
    if (liveById.has(activeBrowseRoom.roomKey)) return activeBrowseRoom.roomKey;
    // 3. First camera assigned to room
    if (activeBrowseRoom.cameraIds.length > 0)
      return activeBrowseRoom.cameraIds[0];
    // 4. Any online camera in the house
    return onlineCameraIds[0];
  }, [activeBrowseRoom, liveById, onlineCameraIds, isOnline]);

  // Normalized so every downstream read (id/title/description/featuredCameraId)
  // works the same whether the source is a live-derived room or the static
  // Director concept — real rooms just aren't loaded yet falls back to
  // Director rather than an undefined room.
  const restoredRoomTitle = activeRoomSlug
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const activeRoom = activeBrowseRoom
    ? {
        id: activeBrowseRoom.roomKey,
        roomKey: activeBrowseRoom.roomKey,
        title: activeBrowseRoom.title,
        description: activeBrowseRoom.description,
        featuredCameraId:
          resolvedRoomFeaturedCameraId ?? DIRECTOR_ROOM.featuredCameraId,
      }
    : mode === "room"
      ? {
          id: activeRoomSlug,
          roomKey: activeRoomSlug,
          title: restoredRoomTitle || "Saved Room",
          description:
            "Restoring this room from your last visit. Its live feed will reconnect automatically when discovery reports it.",
          featuredCameraId: undefined,
        }
      : {
          id: DIRECTOR_ROOM.id,
          roomKey: DIRECTOR_ROOM.slug,
          title: DIRECTOR_ROOM.title,
          description: DIRECTOR_ROOM.description,
          featuredCameraId: DIRECTOR_ROOM.featuredCameraId,
        };

  useEffect(() => {
    if (mode === "room") {
      setSelectedCameraId(resolvedRoomFeaturedCameraId);
    }
  }, [mode, activeBrowseRoom?.roomKey, resolvedRoomFeaturedCameraId]);

  const { attentionLock, timeRemainingSeconds } = useDirectorAttention();
  const { metricsMap: audioMetricsMap } = useCameraAudioMetrics(rosterCameras);

  // Track dwell time on current camera
  const [dwellSeconds, setDwellSeconds] = useState(0);

  // The receiver manager already computes a real director assignment (NOALBS
  // scene-cutting on the SRT Receiver Manager side — see receiverManager.ts's
  // `directorAssigned` flag). Follow that when it's present.
  const directorAssignedCameraId = useMemo(() => {
    for (const camera of snapshot?.cameras ?? []) {
      if (
        camera.directorAssigned &&
        (camera.presence === "online" || camera.presence === "degraded")
      ) {
        return camera.id;
      }
    }
    return undefined;
  }, [snapshot]);

  // ── Central Server-Side Director Attachment (Pre-Seeded via SSR Quartz) ──
  const serverDirector = useServerDirector({
    initialState: initialDirectorState,
    enabled: mode === "director",
  });

  // ── Real-Time Audio-Tracking & Director Scene Negotiation ──
  const directorNegotiation = useMemo(() => {
    return negotiateDirectorFeed(
      rosterCameras,
      onlineCameraIds,
      directorAssignedCameraId,
      attentionLock,
      audioMetricsMap,
      serverDirector.activeCameraId,
      dwellSeconds,
    );
  }, [
    rosterCameras,
    onlineCameraIds,
    directorAssignedCameraId,
    attentionLock,
    audioMetricsMap,
    serverDirector.activeCameraId,
    dwellSeconds,
  ]);

  const directorCameraId =
    directorNegotiation.selectedCameraId ||
    serverDirector.activeCameraId ||
    directorAssignedCameraId ||
    onlineCameraIds[0];

  const heroCameraId =
    mode === "director"
      ? directorCameraId
      : (selectedCameraId ?? resolvedRoomFeaturedCameraId);
  const heroOnline = heroCameraId ? isOnline(heroCameraId) : false;
  const heroLive = heroCameraId ? liveById.get(heroCameraId) : undefined;
  const heroHasRealFeed =
    Boolean(heroLive?.playbackUrl) &&
    heroLive?.playbackProtocol !== "none" &&
    heroOnline;
  const anyHouseCameraOnline = onlineCameraIds.length > 0;

  // The director has nothing to negotiate between when no house camera is
  // online. Previously spelled `serverDirector.state === "no_rooms"`, but the
  // hook exposes no `state` — that read was always undefined, so the
  // "no rooms to play with" copy below could never appear.
  const directorHasNoRooms = !anyHouseCameraOnline;

  // Room the hero player is actually showing. In director mode that's whichever
  // room the server director cut to (not the room being browsed), otherwise it
  // is the browsed room. Read by the Stats for Nerds HUD.
  const heroRoom = useMemo(() => {
    if (mode === "director") {
      const directorRoomKey = serverDirector.activeRoomKey;
      const match = directorRoomKey
        ? browseRooms.find((room) => room.roomKey === directorRoomKey)
        : undefined;
      if (match) return { id: match.roomKey, title: match.title };
    }
    return activeRoom;
  }, [mode, serverDirector.activeRoomKey, browseRooms, activeRoom]);

  // Instant Keyframe-on-Demand: When active camera changes, signal the Ingest Tool for an instant IDR frame
  useEffect(() => {
    if (!heroCameraId || !heroOnline) return;
    void fetch(
      `/api/tank/cameras/${encodeURIComponent(heroCameraId)}/keyframe`,
      {
        method: "POST",
      },
    ).catch(() => {});
  }, [heroCameraId, heroOnline]);

  // Real hero-player controls — fullscreen via the actual Fullscreen API,
  // play/pause and mute via imperative calls into the underlying <video>
  // (CameraPlayer exposes both through a ref), not decorative buttons.
  const heroSectionRef = useRef<HTMLElement | null>(null);
  const heroPlayerRef = useRef<CameraPlayerHandle | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [heroMuted, setHeroMuted] = useState(true);
  const [heroPaused, setHeroPaused] = useState(false);

  // Plays soundboard clips triggered from the admin dashboard, for every
  // connected viewer — follows the same mute preference as the hero player.
  useTankSoundboardPlayer(heroMuted);

  // Which physical room (if any) this device's audio output is assigned to
  // — a local, per-device setting (see useTankRoomAudioOutput.ts), not
  // server state. Approved viewer TTS/SFX requests targeted at that room
  // play through this device; requests targeted at "website" always play
  // regardless of assignment.
  const { assignedRoomKey, setAssignedRoomKey } = useTankRoomAudioOutput();
  useTankAudioRequestPlayback(heroMuted, assignedRoomKey);

  const [audioRequestTab, setAudioRequestTab] = useState<"tts" | "sfx">("tts");
  const [audioRequestTarget, setAudioRequestTarget] =
    useState<string>("website");
  const [ttsMessage, setTtsMessage] = useState("");
  const [ttsVoice, setTtsVoice] = useState("default");
  const [sfxKey, setSfxKey] = useState("");
  const [sfxLibrary, setSfxLibrary] = useState<TankSfxLibraryEntry[]>([]);
  const [sfxLibraryLoading, setSfxLibraryLoading] = useState(false);
  const [sfxLibraryLoaded, setSfxLibraryLoaded] = useState(false);
  const [audioRequestSubmitting, setAudioRequestSubmitting] = useState(false);
  const [audioRequestError, setAudioRequestError] = useState<string | null>(
    null,
  );
  const [audioRequestSuccess, setAudioRequestSuccess] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (overlayView !== "audio-request" || sfxLibraryLoaded) return;
    let active = true;
    setSfxLibraryLoading(true);
    void fetch("/api/sfx", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { sfx?: TankSfxLibraryEntry[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load the sound library.");
        if (active) {
          const entries = Array.isArray(payload.sfx) ? payload.sfx : [];
          setSfxLibrary(entries);
          setSfxLibraryLoaded(true);
          setSfxKey((current) => current || entries[0]?.soundKey || "");
        }
      })
      .catch((error) => {
        if (active) {
          setSfxLibraryLoaded(true);
          setAudioRequestError(error instanceof Error ? error.message : "Could not load the sound library.");
        }
      })
      .finally(() => { if (active) setSfxLibraryLoading(false); });
    return () => { active = false; };
  }, [overlayView, sfxLibraryLoaded]);

  const submitAudioRequest = async () => {
    setAudioRequestError(null);
    setAudioRequestSuccess(null);
    const target =
      audioRequestTarget === "website"
        ? { type: "website" as const }
        : { type: "room" as const, roomKey: audioRequestTarget };

    setAudioRequestSubmitting(true);
    try {
      const response = await fetch(audioRequestTab === "tts" ? "/api/tts/generate" : "/api/sfx/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(audioRequestTab === "tts"
          ? { text: ttsMessage, voice: ttsVoice, target }
          : { soundKey: sfxKey, target }),
      });
      const result = await response.json() as { success?: boolean; error?: string; status?: string };
      if (!response.ok || !result.success) {
        setAudioRequestError(result.error ?? "Failed to submit request.");
        return;
      }
      setAudioRequestSuccess(
        result.status === "approved"
          ? "Queued for the room audio worker."
          : "Sent — waiting for a producer to approve it.",
      );
      setTtsMessage("");
    } catch (error) {
      setAudioRequestError(error instanceof Error ? error.message : "Failed to submit request.");
    } finally {
      setAudioRequestSubmitting(false);
    }
  };

  useEffect(() => {
    const handleChange = () =>
      setIsFullscreen(document.fullscreenElement === heroSectionRef.current);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const [heroVolume, setHeroVolume] = useState(1.0);

  const handleToggleFullscreen = () => {
    const el = heroSectionRef.current;
    if (!el) return;
    const isDocFullscreen =
      document.fullscreenElement || (document as any).webkitFullscreenElement;

    if (isDocFullscreen) {
      if (document.exitFullscreen) void document.exitFullscreen();
      else if ((document as any).webkitExitFullscreen)
        void (document as any).webkitExitFullscreen();
      setIsFullscreen(false);
      try {
        void (screen.orientation as any)?.unlock?.();
      } catch {}
    } else {
      // On iOS Safari / WebKit devices (iPhones & iPads), delegate to the native video element
      // This activates native iOS hardware fullscreen with automatic horizontal rotation when the phone is turned!
      const isIos =
        typeof navigator !== "undefined" &&
        (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

      if (isIos) {
        heroPlayerRef.current?.requestFullscreen();
        setIsFullscreen(true);
        return;
      }

      if (el.requestFullscreen) {
        void el
          .requestFullscreen()
          .then(() => {
            setIsFullscreen(true);
            try {
              void (screen.orientation as any)
                ?.lock?.("landscape")
                .catch(() => {});
            } catch {}
          })
          .catch(() => {
            heroPlayerRef.current?.requestFullscreen();
          });
      } else if ((el as any).webkitRequestFullscreen) {
        void (el as any).webkitRequestFullscreen();
        setIsFullscreen(true);
      } else {
        heroPlayerRef.current?.requestFullscreen();
      }
    }
  };

  // "Watch a live camera" mission — fired once per session, the moment a
  // real feed actually starts playing (not just when a placeholder renders).
  const watchMissionReported = useRef(false);
  const reportWatchMission = () => {
    if (watchMissionReported.current) return;
    watchMissionReported.current = true;
    void completeMission("Watch a live camera");
  };

  // Chat routing: explicitChatTarget overrides auto-follow.
  // When null, chat automatically tracks viewing room (or global if in director mode).
  const activeChatRoomId = useMemo(() => {
    if (explicitChatTarget === "global" || explicitChatTarget === "director")
      return "global";
    if (explicitChatTarget) return explicitChatTarget;
    if (mode === "director" || mode === "grid") return "global";
    const roomKey = activeRoom?.roomKey ?? activeRoom?.id;
    if (!roomKey || roomKey === "director" || roomKey === "global")
      return "global";
    return roomKey;
  }, [explicitChatTarget, mode, activeRoom]);

  const activeChatScope: ChatScope =
    activeChatRoomId === "global"
      ? "global"
      : activeChatRoomId.startsWith("click:")
        ? "click"
        : "room";

  // Persist room + chat selection so it survives page refreshes
  useEffect(() => {
    if (!roomStateRestored) return;
    persistRoomState(
      mode,
      activeRoomSlug,
      explicitChatTarget ?? "global",
      prevModeRef.current,
    );
  }, [mode, activeRoomSlug, explicitChatTarget, roomStateRestored]);

  const handleSetChatScope = (scope: ChatScope, targetRoomKey?: string) => {
    if (
      scope === "global" ||
      targetRoomKey === "global" ||
      targetRoomKey === "director"
    ) {
      setExplicitChatTarget("global");
      setChatScope("global");
    } else if (scope === "click" && targetRoomKey?.startsWith("click:")) {
      setExplicitChatTarget(targetRoomKey);
      setChatScope("click");
    } else {
      const validRoom = browseRooms.find(
        (r) =>
          r.roomKey !== "director" &&
          r.roomKey !== "global" &&
          r.title?.toLowerCase() !== "director",
      );
      const target =
        targetRoomKey ||
        (mode === "director"
          ? (validRoom?.roomKey ?? "global")
          : (activeRoom?.roomKey ?? "global"));
      setExplicitChatTarget(target);
      setChatScope("room");
    }
  };

  // Identity for the optimistic row, so a message the user just typed renders
  // as them immediately instead of as a stranger until the server answers.
  const optimisticIdentity = useMemo(
    () =>
      signedIn
        ? {
            userId: playerProfile?.id ?? initialProfile?.id ?? undefined,
            user:
              playerProfile?.displayName ??
              initialProfile?.displayName ??
              "You",
            avatarUrl:
              playerProfile?.avatarUrl ?? initialProfile?.avatarUrl ?? null,
            nameColor: playerProfile?.nameColor ?? null,
            level: currentLvl,
            role:
              (initialProfile?.role as "member" | "admin" | undefined) ??
              "member",
          }
        : null,
    [signedIn, initialProfile, playerProfile, currentLvl],
  );

  const {
    messages,
    sending,
    error: chatError,
    postMessage,
    toggleReaction,
  } = useTankRealtimeChat(activeChatRoomId, [], optimisticIdentity);

  // Viewer presence: EVERYONE with the feed open, not just signed-in accounts.
  //
  // Server heartbeat rather than Supabase Realtime presence. A browser can't
  // see its own IP and can claim anything about itself, so identity, shared-
  // connection grouping and automated-client classification happen server-side.
  // It also keeps the count working independently of realtime, which is where
  // the old implementation quietly failed: the socket never connected, so this
  // number sat on its Math.max(1, ...) floor forever.
  const { presence: viewerPresence } = useViewerPresence(activeChatRoomId);
  const onlineCount = viewerPresence?.online ?? 1;

  // Keyboard shortcut: 'D' to toggle the Dock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      if (activeTag === "input" || activeTag === "textarea") return;
      if (e.key === "d" || e.key === "D") {
        setDockOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSend = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    // Clear first. The old code awaited the full server round trip before
    // clearing, and gated on `sending`, so the box sat frozen with the text
    // still in it — the single biggest reason chat felt slow. Send is
    // optimistic now, so there is nothing to wait for and no reason to block
    // a second message.
    setChatInput("");
    const replyingTo = replyTarget;
    setReplyTarget(null);
    void postMessage(text, replyingTo ?? undefined);
  };

  const handleJoinClan = async (clanId: string) => {
    setClanBusy(true);
    const result = await joinClan(clanId);
    setClanBusy(false);
    if (result.success) {
      const clan = clans.find((c) => c.id === clanId);
      if (clan)
        setUserClan({
          clanId: clan.id,
          name: clan.name,
          tag: clan.tag,
          bannerColor: clan.bannerColor,
        });
    }
  };

  const handleLeaveClan = async () => {
    setClanBusy(true);
    const result = await leaveClan();
    setClanBusy(false);
    if (result.success) setUserClan(null);
  };

  const activePattern = useMemo(() => {
    return (
      PATTERNS_CATALOG.find((item) => item.id === settings.selectedPattern) ??
      null
    );
  }, [settings.selectedPattern]);

  const activePatternUrl =
    activePattern?.url || ACTIVE_THEME.images.aluminumTexture;

  const activeBackgroundTheme = useMemo(() => {
    return getTankBackgroundTheme(settings.selectedBackgroundTheme);
  }, [settings.selectedBackgroundTheme]);

  const activeBackgroundUrl =
    activeBackgroundTheme.backgroundUrl || ACTIVE_THEME.images.background;

  const labelWide: React.CSSProperties = {
    fontFamily: ACTIVE_THEME.fonts.labelWide,
  };
  const label: React.CSSProperties = { fontFamily: ACTIVE_THEME.fonts.label };

  // Auto-fit & zoom reset when rotating between portrait and landscape
  useEffect(() => {
    const handleOrientationReset = () => {
      window.scrollTo(0, 0);
      if (document.body) document.body.scrollTop = 0;
      if (document.documentElement) document.documentElement.scrollTop = 0;
    };
    window.addEventListener("orientationchange", handleOrientationReset);
    window.addEventListener("resize", handleOrientationReset);
    return () => {
      window.removeEventListener("orientationchange", handleOrientationReset);
      window.removeEventListener("resize", handleOrientationReset);
    };
  }, []);

  // The server cannot see a URL hash or browser storage. Rendering Director
  // here would make every mobile refresh visibly jump through the wrong room
  // while React hydrates. Keep the console in its branded loading chassis
  // until the saved view has been restored, then reveal that exact view.
  if (!roomStateRestored) {
    return (
      <div data-tank-room-state="booting">
        <TankExperienceSkeleton />
      </div>
    );
  }

  return (
    <div
      className="relative min-h-[100dvh] min-h-screen pb-3"
      data-tank-view-mode={mode}
      data-tank-room={activeRoomSlug}
      data-tank-room-origin={prevModeRef.current}
      data-tank-room-state={roomStateRestored ? "restored" : "booting"}
      style={
        {
          "--tank-panel-texture": `url(${activePatternUrl})`,
          color: "#241f14",
        } as React.CSSProperties
      }
    >
      {/* Hardware-accelerated fixed background without mobile Safari scroll jitter */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundColor: activeBackgroundTheme.statusBarHex,
          backgroundImage: `url(${activeBackgroundUrl})`,
          backgroundRepeat:
            activeBackgroundTheme.id === "tank-arcade-blue"
              ? "repeat"
              : "no-repeat",
          backgroundSize:
            activeBackgroundTheme.id === "tank-arcade-blue" ? "auto" : "cover",
          backgroundPosition: "center",
          transform: "translate3d(0,0,0)",
          WebkitTransform: "translate3d(0,0,0)",
        }}
      />

      <TankThemeStyles statusBarColor={activeBackgroundTheme.statusBarHex} />
      <TankViewportDebugHud />
      <TankCameraDebugHud />
      <div className="relative z-10 mx-auto max-w-[1800px] p-2 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:p-3 lg:pb-3">
        {/* ═══════════ MOBILE TOP HEADER BAR (lg:hidden) ═══════════ */}
        <div className="mb-2 flex items-center justify-between px-1 lg:hidden">
          {/* Breadcrumbs: Room -> Director -> All Rooms Grid */}
          {mode === "grid" ? (
            <div className="flex items-center gap-1 px-1">
              <span
                className="text-base font-black uppercase tracking-widest text-white"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                tank<span className="text-[#ff4d00]">®</span>
              </span>
            </div>
          ) : mode === "director" ? (
            <button
              type="button"
              onClick={() => navigateTo("grid")}
              className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/60 px-3 py-1.5 text-xs font-black text-white shadow active:scale-95"
            >
              <span className="text-[#ff4d00]">←</span>
              <span>All Rooms</span>
            </button>
          ) : (
            // mode === "room": go back to wherever the user actually came from
            <button
              type="button"
              onClick={() => navigateTo(prevModeRef.current)}
              className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/60 px-3 py-1.5 text-xs font-black text-white shadow active:scale-95"
            >
              <span className="text-[#ff4d00]">←</span>
              <span>
                {prevModeRef.current === "grid" ? "All Rooms" : "Director"}
              </span>
            </button>
          )}

          {/* User Badge + Pass + Avatar */}
          <div
            ref={mobileProfileMenuRef}
            className="relative flex items-center gap-2"
          >
            {signedIn ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOverlayView("season")}
                  className="rounded bg-[#ff4d00] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow active:scale-95"
                >
                  Get A Season Pass
                </button>
                <div className="text-right leading-tight">
                  <p className="text-[11px] font-black text-[#ff4d00]">
                    {livePlayerProfile?.displayName ?? "Unenter"}
                  </p>
                  <p className="text-[9px] font-bold text-slate-300">
                    LVL {livePlayerProfile?.level ?? 1}{" "}
                    <span className="text-[#39ff6a]">
                      ₮ {formatCompactTokenBalance(livePlayerProfile?.tokens)}
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                className="rounded bg-[#ff4d00] px-3 py-1 text-xs font-black text-white shadow"
              >
                Sign In
              </button>
            )}

            {/* Keep the profile identity in the mobile header even for guests.
                Signed-out viewers use it as a second, familiar sign-in entry;
                members get the complete profile dropdown. */}
            <button
              type="button"
              onClick={() => {
                if (signedIn) {
                  setMobileProfileMenuOpen((prev) => !prev);
                } else {
                  setAccountOpen(true);
                }
              }}
              aria-label={signedIn ? "Open profile menu" : "Open sign in"}
              aria-expanded={signedIn ? mobileProfileMenuOpen : undefined}
              className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/30 bg-black/80 shadow active:scale-95"
            >
              <img
                src={
                  livePlayerProfile?.avatarUrl ||
                  playerProfile?.avatarUrl ||
                  "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png"
                }
                alt=""
                className="h-full w-full object-contain p-0.5"
              />
            </button>

            {/* Mobile Profile Dropdown Menu */}
            {mobileProfileMenuOpen && signedIn && (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-md border border-[#2d2f34] bg-[#1a1b1e] p-1.5 shadow-2xl backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => {
                    setMobileProfileMenuOpen(false);
                    setProfileOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-xs font-black text-white hover:bg-white/10"
                >
                  <User className="h-4 w-4 text-[#ff4d00]" /> Profile
                </button>
                {(playerProfile?.role === "admin" ||
                  playerProfile?.role === "moderator") && (
                  <Link
                    href="/house"
                    onClick={() => setMobileProfileMenuOpen(false)}
                    className="flex w-full items-center justify-between rounded border border-orange-500/50 bg-gradient-to-r from-orange-950/60 to-amber-950/60 px-3 py-2.5 text-left text-xs font-black text-orange-200 shadow-[0_0_10px_rgba(255,77,0,0.2)] transition hover:bg-orange-900/80"
                  >
                    <div className="flex items-center gap-3">
                      <Shield className="h-4 w-4 text-orange-400" /> Staff Room
                    </div>
                    <span className="rounded bg-[#ff4d00] px-1.5 py-0.5 text-[8px] font-black uppercase text-white shadow">
                      {playerProfile?.role === "admin" ? "ADMIN" : "MOD"}
                    </span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMobileProfileMenuOpen(false);
                    setNotificationsOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-xs font-black text-white hover:bg-white/10"
                >
                  <Bell className="h-4 w-4 text-[#ff4d00]" /> Notifications
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileProfileMenuOpen(false);
                    setOverlayView("season");
                  }}
                  className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-xs font-black text-white hover:bg-white/10"
                >
                  <CreditCard className="h-4 w-4 text-[#ff4d00]" /> Billing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileProfileMenuOpen(false);
                    alert("Advertise: team@unenter.live");
                  }}
                  className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-xs font-black text-white hover:bg-white/10"
                >
                  <Megaphone className="h-4 w-4 text-[#ff4d00]" /> Advertise
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileProfileMenuOpen(false);
                    alert("Help: discord.gg/unenter");
                  }}
                  className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-xs font-black text-white hover:bg-white/10"
                >
                  <HelpCircle className="h-4 w-4 text-[#ff4d00]" /> Help
                </button>
                <div className="my-1 border-t border-white/10" />
                <button
                  type="button"
                  onClick={async () => {
                    drainClientChatStorage();
                    window.location.assign(
                      buildGlobalLogoutUrl(`${window.location.origin}/`),
                    );
                  }}
                  className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-xs font-black text-white hover:bg-[#ff4d00]/20 hover:text-[#ff4d00]"
                >
                  <LogOut className="h-4 w-4 text-[#ff4d00]" /> Log Out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Top console strip: balanced 3-column layout (Desktop only) */}
        <div className="hidden lg:block">
          <TopConsoleStrip
            season={season}
            onClaimDaily={() => setDailyClaimOpen(true)}
            merchHref={TANK_MERCH_URL}
          />
        </div>

        {/* ═══════════ MOBILE-ONLY ALL-ROOMS GRID VIEW ═══════════ */}
        {mode === "grid" && (
          <div className="block lg:hidden">
            <MobileRoomGrid
              rooms={browseRooms.map((room) => {
                const liveCam =
                  liveById.get(room.roomKey) ??
                  (room.cameraIds[0]
                    ? liveById.get(room.cameraIds[0])
                    : undefined);
                const online =
                  isOnline(room.roomKey) ||
                  room.cameraIds.some((cid) => isOnline(cid));
                return {
                  roomKey: room.roomKey,
                  title: room.title,
                  camera: liveCam,
                  isOnline: online,
                };
              })}
              directorCamera={
                directorCameraId
                  ? liveById.get(directorCameraId)
                  : onlineCameraIds[0]
                    ? liveById.get(onlineCameraIds[0])
                    : undefined
              }
              directorOnline={anyHouseCameraOnline}
              onSelectDirector={() => navigateTo("director")}
              onSelectRoom={openRoom}
            />
          </div>
        )}

        {/* Never fully hidden on mobile, even in grid ("All Rooms") mode —
            ChatConsolePanel lives inside this and its mobile drawer/pill is
            fixed-positioned, so it stays reachable regardless of whatever
            else is in the document flow above it. Previously this whole
            wrapper (chat included) was `hidden` on mobile whenever
            mode==="grid", making chat completely unreachable from the All
            Rooms view. */}
        <div className="flex flex-col items-stretch gap-2 lg:grid lg:grid-cols-[230px_minmax(0,1fr)_380px] xl:grid-cols-[240px_minmax(0,1fr)_420px] 2xl:grid-cols-[250px_minmax(0,1fr)_460px]">
          {/* ── Left rail: profile, nav, inventory, missions, stats ────── */}
          <div className="hidden flex-col gap-2 lg:flex">
            <ProfilePanel
              initialProfile={livePlayerProfile ?? playerProfile}
              userClan={userClan}
              signedIn={signedIn}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenSignIn={() => setAccountOpen(true)}
              onOpenProfile={() => setProfileOpen(true)}
              onOpenNotifications={() => setNotificationsOpen(true)}
              onOpenBilling={() => setOverlayView("season")}
              onOpenAdvertise={() =>
                alert("Advertise: Contact team@unenter.live")
              }
              onOpenHelp={() =>
                alert(
                  "Help: Visit discord.gg/unenter or chat with moderators in Global",
                )
              }
              onOpenAppeals={() => setAppealsModalOpen(true)}
              unreadNotificationsCount={unreadNotificationCount}
              onSignOut={async () => {
                drainClientChatStorage();
                const supabase = createClient();
                await supabase.auth.signOut();
                window.location.reload();
              }}
            />

            <NavigationPanel onSelectOverlay={setOverlayView} />

            <InventoryPanel
              inventory={liveInventory}
              onOpenShop={() => setOverlayView("store")}
              onOpenInventory={() => {
                acknowledgeInventory();
                setOverlayView("inventory");
              }}
            />

            <MissionsTabsPanel
              sidebarTab={sidebarTab}
              onTabChange={setSidebarTab}
              missions={missions}
              // Realtime chat may hydrate from a browser-only cached session.
              // Keep the Logs badge deterministic for the server and first
              // client render, then reveal the live count after mount.
              messages={mounted ? messages : []}
            />

            <TelemetryPanel
              seasonDay={seasonDay}
              now={now}
              level={currentLvl}
              tokens={signedIn ? currentTokens : (initialProfile?.tokens ?? 0)}
            />
          </div>

          {/* ── Center: hero player + camera grid + room description ─── */}
          <div className="flex min-w-0 shrink-0 flex-col gap-1.5 lg:shrink">
            {/* Room / Director Switcher Bar with Corner Screws (Desktop only; Mobile uses top breadcrumbs) */}
            <ChromePanel
              withScrews
              className="hidden w-full lg:block"
              contentClassName="!px-7 !py-1.5 flex flex-row items-center gap-1.5 overflow-x-auto flex-nowrap min-h-[44px] scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <ConsoleButton
                active={mode === "director"}
                variant={mode === "director" ? "orange" : "gray"}
                className="shrink-0"
                onClick={() => navigateTo("director")}
              >
                🌐 Director
              </ConsoleButton>
              {browseRooms.map((room) => {
                const active =
                  mode === "room" && activeRoomSlug === room.roomKey;
                return (
                  <ConsoleButton
                    key={room.roomKey}
                    active={active}
                    variant={active ? "orange" : "gray"}
                    className="shrink-0"
                    onClick={() => openRoom(room.roomKey)}
                  >
                    {room.title}
                  </ConsoleButton>
                );
              })}
            </ChromePanel>

            {/* Clean Director Mode Attention Banner (Decibels hidden from public view) */}
            {mode === "director" &&
              Boolean(serverDirector.attentionLock?.active) && (
                <div
                  className="flex items-center justify-between rounded border border-orange-500/70 bg-orange-950/60 px-3 py-1.5 text-[11px] font-black uppercase text-orange-200 shadow-[0_0_12px_rgba(255,77,0,0.25)] transition-all animate-in fade-in"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-orange-500 shadow-[0_0_6px_#ff4d00]" />
                    <span className="truncate">
                      DIRECTOR ATTENTION:{" "}
                      {attentionLock?.targetLabel ?? "ACTIVE ROOM"}
                    </span>
                  </span>
                  {timeRemainingSeconds !== null && (
                    <span className="shrink-0 font-mono text-[10px] text-orange-300">
                      ⏱️ {Math.floor(timeRemainingSeconds / 60)}:
                      {(timeRemainingSeconds % 60).toString().padStart(2, "0")}{" "}
                      remaining
                    </span>
                  )}
                </div>
              )}

            {/* Level-Up Celebration Banner */}
            {levelUpNotif !== null && (
              <div className="border-yellow-400/60 via-yellow-900/90 flex items-center justify-between rounded border bg-gradient-to-r from-amber-950/90 to-amber-950/90 px-3 py-2 text-xs font-black text-white shadow-2xl duration-300 animate-in slide-in-from-top-2">
                <div className="flex items-center gap-2">
                  <span className="animate-bounce text-xl">🎉</span>
                  <div>
                    <p className="text-yellow-300 font-black uppercase tracking-wide">
                      LEVEL UP! You reached LEVEL {levelUpNotif}!
                    </p>
                    <p className="text-yellow-100 text-[10px] font-semibold">
                      Watch Multiplier Active: +{ratePerSecond.toFixed(1)}{" "}
                      XP/sec · Keep watching to unlock badges & tokens!
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearLevelUpNotif}
                  className="text-yellow-200 rounded bg-black/60 px-2 py-1 text-[10px] font-bold transition hover:bg-black"
                >
                  Dismiss ✕
                </button>
              </div>
            )}

            {mode !== "grid" && (
              <div className="lg:hidden">
                <MobileRoomSourceStrip
                  mode={mode}
                  selectedRoomSlug={activeRoomSlug}
                  directorOnline={anyHouseCameraOnline}
                  rooms={browseRooms.map((room) => ({
                    roomKey: room.roomKey,
                    title: room.title,
                    isOnline:
                      isOnline(room.roomKey) ||
                      room.cameraIds.some((cameraId) => isOnline(cameraId)),
                  }))}
                  onSelectDirector={() => navigateTo("director")}
                  onSelectRoom={openRoom}
                />
              </div>
            )}

            {/* Hidden on mobile in All Rooms mode. The wrapper above stays in
                the tree because chat lives inside it, but the hero player must
                not: with no room selected it renders a second, camera-less
                video panel under the grid reading "This camera — not
                connected", and it takes a stream admission slot away from the
                tiles the viewer is actually looking at. */}
            <div
              className={`rounded-lg border-2 border-[#232920] bg-black p-1.5 shadow-xl ${
                mode === "grid" ? "hidden lg:block" : ""
              }`}
            >
              <section
                ref={heroSectionRef}
                className={`relative aspect-video max-h-[52vh] w-full overflow-hidden rounded lg:max-h-[65vh] landscape:max-h-[calc(100dvh-2.5rem)] ${
                  heroOnline
                    ? `bg-gradient-to-br ${heroLive?.accent ?? "from-cyan-500/35 via-blue-950/60 to-slate-950"}`
                    : "bg-slate-950"
                }`}
                aria-label={
                  mode === "director"
                    ? "Director program"
                    : `${heroLive?.name ?? "Room"} video placeholder`
                }
              >
                {heroOnline && (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_30%,rgba(255,255,255,.2),transparent_16%),radial-gradient(circle_at_68%_55%,rgba(45,212,191,.22),transparent_18%),linear-gradient(110deg,transparent_30%,rgba(255,255,255,.05)_50%,transparent_70%)]" />
                )}
                {heroHasRealFeed && heroLive && (
                  <CameraPlayer
                    // A room switch is a source boundary, not an in-place
                    // recovery. Reusing the same dual-buffer instance kept
                    // the previous 4K room visible while the OBS feed warmed
                    // behind it, so Admin looked selected without appearing
                    // in the hero for several seconds. A camera-specific key
                    // closes the old transports and gives the selected room a
                    // clean, immediately truthful player lifecycle.
                    key={heroCameraId ?? heroLive.playbackUrl}
                    ref={heroPlayerRef}
                    playbackUrl={heroLive.playbackUrl}
                    playbackProtocol={heroLive.playbackProtocol}
                    online={heroOnline}
                    prerollLoopUrl={
                      heroLive.recentClipUrl ?? null
                    }
                    muted={heroMuted}
                    volume={heroVolume}
                    className="absolute inset-0 h-full w-full object-cover"
                    onPlayStateChange={setHeroPaused}
                    onLiveEdgeChange={setHeroLiveEdge}
                    onStabilityChange={setHeroStability}
                    onWatching={reportWatchMission}
                    onClick={() => {
                      if (heroMuted) setHeroMuted(false);
                    }}
                    onDoubleClick={handleToggleFullscreen}
                  />
                )}

                {/* Director feed: plain room text only. Mode and auto-cycle
                    are diagnostics and live in the Stats for Nerds HUD. */}
                {mode === "director" && (
                  <DirectorRoomLabel roomTitle={heroRoom?.title} />
                )}

                {/* CRT Static & Scanline Glitch Transition Sweep */}
                <CrtTransition triggerKey={heroCameraId} />
                <div
                  className={`absolute inset-0 grid place-items-center ${heroHasRealFeed ? "pointer-events-none opacity-0" : ""}`}
                >
                  <div className="max-w-sm rounded-lg border border-white/15 bg-black/30 p-5 text-center text-white backdrop-blur-sm">
                    {heroOnline ? (
                      <Radio className="mx-auto h-8 w-8 opacity-85" />
                    ) : (
                      <CameraOff className="mx-auto h-8 w-8 opacity-60" />
                    )}
                    <p className="mt-2 text-sm font-bold">
                      {mode === "director"
                        ? directorHasNoRooms
                          ? "I have no rooms to play with. I have no rooms to negotiate between."
                          : (heroLive?.name ?? "Director Program Feed")
                        : heroOnline
                          ? `${heroLive?.name ?? "Camera"} — live`
                          : `${heroLive?.name ?? "This camera"} — not connected`}
                    </p>
                    <p className="mt-1 text-xs text-white/65">
                      {mode === "director"
                        ? directorHasNoRooms
                          ? "Director Room Negotiator is standing by for active room camera feeds."
                          : "Automated director room switching active."
                        : heroOnline
                          ? "WebRTC low-latency stream player"
                          : "Provision this camera in the SRT app to bring it online"}
                    </p>
                  </div>
                </div>
                {/* ── Stats for Nerds HUD Card ── */}
                {nerdStatsOpen && (
                  <div className="absolute left-3 top-3 z-30 w-72 select-none rounded-lg border border-white/15 bg-black/85 p-3 font-mono text-[11px] text-slate-200 shadow-2xl backdrop-blur-md duration-150 animate-in fade-in zoom-in-95">
                    <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2 text-[10px] font-bold uppercase tracking-wider text-white">
                      <div className="flex items-center gap-1.5 text-orange-400">
                        <Activity className="h-3.5 w-3.5" />
                        <span>Stats for Nerds</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNerdStatsOpen(false)}
                        className="rounded p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {/* Director diagnostics — moved off the video and in
                          here so the feed stays clean. Only meaningful while
                          the director is actually driving the hero player. */}
                      {mode === "director" &&
                        (() => {
                          const directorMode = getDirectorModePresentation(
                            serverDirector.mode,
                            serverDirector.reason,
                          );
                          return (
                            <>
                              <div className="flex justify-between">
                                <span className="text-slate-400">
                                  Director Mode:
                                </span>
                                <span
                                  className={`flex items-center gap-1.5 font-bold ${directorMode.text}`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 animate-pulse rounded-full ${directorMode.dot}`}
                                  />
                                  {directorMode.label}
                                </span>
                              </div>
                              {serverDirector.mode === "ATTENTION" ? (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">
                                      Attention Lock:
                                    </span>
                                    <span className="max-w-[140px] truncate font-semibold text-[#ff4d00]">
                                      {attentionLock?.targetLabel ??
                                        "Active room"}
                                    </span>
                                  </div>
                                  {timeRemainingSeconds !== null &&
                                    timeRemainingSeconds !== undefined && (
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">
                                          Lock Remaining:
                                        </span>
                                        <span className="text-orange-200">
                                          {Math.floor(
                                            timeRemainingSeconds / 60,
                                          )}
                                          :
                                          {(timeRemainingSeconds % 60)
                                            .toString()
                                            .padStart(2, "0")}
                                        </span>
                                      </div>
                                    )}
                                </>
                              ) : (
                                <div className="flex justify-between">
                                  <span className="text-slate-400">
                                    Auto-Cycle:
                                  </span>
                                  <span className="text-slate-200">
                                    {dwellSeconds % 15}s / 15s
                                  </span>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      <div className="flex justify-between">
                        <span className="text-slate-400">Camera / Room:</span>
                        <span className="font-semibold text-white">
                          {heroRoom?.title || "Main Feed"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Camera ID:</span>
                        <span className="max-w-[140px] truncate text-slate-300">
                          {heroLive?.id || heroCameraId || "cam-main"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Sync Status:</span>
                        <span
                          className={
                            heroLiveEdge?.isLive
                              ? "font-bold text-emerald-400"
                              : "font-bold text-amber-400"
                          }
                        >
                          {heroLiveEdge?.isLive
                            ? "🔴 LIVE (Synced)"
                            : `⏪ -${heroLiveEdge?.latencySec ?? 0}s Lag`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">
                          Engine / Protocol:
                        </span>
                        <span className="uppercase text-slate-300">
                          {heroLive?.playbackProtocol || "HLS / WHEP"}
                        </span>
                      </div>
                      {/* Real, server-measured per-camera telemetry (SRT receiver
                          stats piped through receiverManager.ts) — this is what
                          actually explains a stall on THIS stream, unlike the
                          browser's own network guess below. 0/null means the
                          manager has no stats for this source (e.g. RTMP has no
                          stats endpoint), not that the stream is silent. */}
                      <div className="flex justify-between">
                        <span className="text-slate-400">Stream Bitrate:</span>
                        <span className="font-semibold text-cyan-300">
                          {heroLive?.bitrateKbps
                            ? `${heroLive.bitrateKbps.toLocaleString()} kbps`
                            : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Stream RTT:</span>
                        <span className="text-slate-200">
                          {heroLive?.latencyMs != null && heroLive.latencyMs > 0
                            ? `${heroLive.latencyMs} ms`
                            : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">
                          Reconnects (this session):
                        </span>
                        <span
                          className={
                            heroStability.reconnectCount > 0
                              ? "font-semibold text-amber-400"
                              : "font-semibold text-emerald-400"
                          }
                        >
                          {heroStability.reconnectCount}
                        </span>
                      </div>
                      {/* The browser's own guess — Chrome's Network Information
                          API tops out at "4g" for anything faster than 3g, so a
                          gigabit LAN link reports identically to real cellular
                          4G. Labelled as an estimate on purpose; it is not a
                          measurement of this stream. */}
                      {Boolean(
                        networkQuality?.downlinkMbps || networkQuality?.rttMs,
                      ) && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">
                            Browser Network Est.:
                          </span>
                          <span className="text-slate-500">
                            {networkQuality?.downlinkMbps
                              ? `${networkQuality.downlinkMbps} Mbps`
                              : ""}
                            {networkQuality?.rttMs
                              ? ` · ${networkQuality.rttMs} ms`
                              : ""}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-400">Buffer Length:</span>
                        <span className="text-slate-200">
                          {(heroLiveEdge?.bufferDuration ?? 0).toFixed(1)}s
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between border-t border-white/5 pt-1">
                        <span className="text-slate-400">Source Ingest:</span>
                        <span className="uppercase text-slate-200">
                          {heroLive?.protocol || "unknown"}
                        </span>
                      </div>
                      {Boolean(
                        heroLive?.protocol === "rtsp" ||
                        heroLive?.protocol === "ip-camera",
                      ) && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Ingest Bridge:</span>
                          <span
                            className={
                              heroLive?.ingestStats?.bridgeAlive
                                ? "font-semibold text-emerald-300"
                                : "font-semibold text-red-400"
                            }
                          >
                            {heroLive?.ingestStats?.bridgeAlive
                              ? "Native bridge alive"
                              : "Bridge down"}
                            {Boolean(heroLive?.ingestStats?.restarts) &&
                              ` (${heroLive?.ingestStats?.restarts} restarts)`}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-400">Audio:</span>
                        <span className="text-slate-200">
                          {heroLive?.audioStatus ?? "unknown"}
                          {heroLive?.ingestStats?.audioCodec
                            ? ` (${heroLive.ingestStats.audioCodec})`
                            : ""}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2">
                      <button
                        type="button"
                        onClick={() => heroPlayerRef.current?.snapToLiveEdge()}
                        className="flex items-center gap-1 rounded border border-orange-500/40 bg-orange-600/30 px-2 py-1 text-[10px] font-bold uppercase text-orange-300 transition hover:bg-orange-600/50"
                      >
                        <Zap className="h-3 w-3" />
                        <span>Re-Sync Live</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          heroPlayerRef.current?.snapToLiveEdge();
                        }}
                        className="flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-300 transition hover:bg-white/10"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Reload</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Standard Clean Minimalist Player Control Bar ── */}
                <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-2.5 pt-8 text-white sm:px-4">
                  <div className="flex items-center justify-between">
                    {/* Left: Clean space (LIVE overlay pill legacied for pristine presentation) */}
                    <div className="flex items-center gap-2">
                      {/* [LEGACY LIVE PILL - REMOVED FOR CLEAN MODERN PRESENTATION] */}
                    </div>

                    {/* [LEGACY BONES - RE-EXPLORE LATER: DVR PAUSE/PLAY BUTTON]
                    <button
                      aria-label={heroPaused ? "Play" : "Pause"}
                      disabled={!heroHasRealFeed}
                      onClick={() => heroPlayerRef.current?.togglePlayback()}
                      className="disabled:opacity-40 hover:text-orange-400 transition p-1.5 rounded-lg hover:bg-white/10"
                    >
                      {heroPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                    </button>
                    */}

                    {/* Right: Mute / Volume, 3-Dots Options Menu, Fullscreen */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {/* Volume Slider & Mute Toggle */}
                      <div className="mr-1 flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={heroMuted ? "Unmute" : "Mute"}
                          disabled={!heroHasRealFeed}
                          onClick={() => setHeroMuted((prev) => !prev)}
                          className="rounded-lg p-1.5 transition hover:bg-white/10 hover:text-orange-400 disabled:opacity-40"
                          title={
                            heroLive?.audioStatus === "transcode-required"
                              ? "This camera's audio still needs a transcode step — video only for now"
                              : undefined
                          }
                        >
                          {heroMuted || heroVolume === 0 ? (
                            <VolumeX className="h-5 w-5 text-red-400" />
                          ) : (
                            <Volume2 className="h-5 w-5 text-white" />
                          )}
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={heroMuted ? 0 : heroVolume}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setHeroVolume(val);
                            if (val > 0 && heroMuted) setHeroMuted(false);
                            else if (val === 0 && !heroMuted)
                              setHeroMuted(true);
                          }}
                          className="h-1.5 w-14 cursor-pointer appearance-none rounded-lg bg-white/30 accent-[#ff4d00] transition sm:w-20"
                          title={`Volume: ${Math.round((heroMuted ? 0 : heroVolume) * 100)}%`}
                        />
                      </div>

                      {/* ── 3-Dots Options Menu Popover ── */}
                      <div className="relative">
                        <button
                          type="button"
                          aria-label="Player Options & Stats"
                          onClick={() => setPlayerMenuOpen((prev) => !prev)}
                          className={`rounded-lg p-1.5 transition hover:text-orange-400 ${
                            playerMenuOpen
                              ? "bg-white/20 text-orange-400"
                              : "text-white hover:bg-white/10"
                          }`}
                          title="Stream Options & Nerd Stats"
                        >
                          <MoreVertical className="h-5 w-5" />
                        </button>

                        {playerMenuOpen && (
                          <div className="absolute bottom-full right-0 z-40 mb-2 w-48 select-none rounded-xl border border-white/15 bg-black/90 p-1.5 font-sans text-xs text-slate-200 shadow-2xl backdrop-blur-md duration-100 animate-in fade-in zoom-in-95">
                            <button
                              type="button"
                              onClick={() => {
                                setNerdStatsOpen((prev) => !prev);
                                setPlayerMenuOpen(false);
                              }}
                              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition hover:bg-white/10 hover:text-white"
                            >
                              <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4 text-orange-400" />
                                <span>Stats for nerds</span>
                              </div>
                              <span className="font-mono text-[10px] text-slate-400">
                                {nerdStatsOpen ? "ON" : "OFF"}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                heroPlayerRef.current?.snapToLiveEdge();
                                setPlayerMenuOpen(false);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/10 hover:text-white"
                            >
                              <Zap className="h-4 w-4 text-amber-400" />
                              <span>Snap to live</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                heroPlayerRef.current?.snapToLiveEdge();
                                setPlayerMenuOpen(false);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/10 hover:text-white"
                            >
                              <RefreshCw className="h-4 w-4 text-cyan-400" />
                              <span>Reload stream</span>
                            </button>

                            <div className="my-1 border-t border-white/10" />

                            <button
                              type="button"
                              onClick={() => {
                                setSettingsOpen(true);
                                setPlayerMenuOpen(false);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/10 hover:text-white"
                            >
                              <Settings className="h-4 w-4 text-slate-400" />
                              <span>Tank settings</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Fullscreen Button */}
                      <button
                        aria-label={
                          isFullscreen ? "Exit fullscreen" : "Fullscreen"
                        }
                        onClick={handleToggleFullscreen}
                        className="rounded-lg p-1.5 transition hover:bg-white/10 hover:text-orange-400"
                      >
                        {isFullscreen ? (
                          <Minimize2 className="h-5 w-5" />
                        ) : (
                          <Maximize className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {mode !== "grid" && (
              <div className="lg:hidden">
                <RoomDescriptionPanel
                  compact
                  title={
                    mode === "director"
                      ? "Director Program Cut"
                      : activeRoom.title
                  }
                  description={
                    mode === "director"
                      ? DIRECTOR_ROOM.description
                      : activeRoom.description
                  }
                  live={mode === "director" ? anyHouseCameraOnline : heroOnline}
                />
              </div>
            )}

            <div className="hidden lg:flex lg:flex-col lg:gap-2">
              <CameraRosterPanel
                mode={mode}
                onSetMode={navigateTo}
                anyHouseCameraOnline={anyHouseCameraOnline}
                onlineCameraCount={onlineCameraIds.length}
                totalCameraCount={browseRooms.length}
                rooms={browseRooms.map((room) => ({
                  roomKey: room.roomKey,
                  title: room.title,
                  camera:
                    liveById.get(room.roomKey) ??
                    (room.cameraIds[0]
                      ? liveById.get(room.cameraIds[0])
                      : undefined),
                  isOnline:
                    isOnline(room.roomKey) ||
                    room.cameraIds.some((cid) => isOnline(cid)),
                }))}
                selectedRoomSlug={activeRoomSlug}
                onSelectRoom={openRoom}
              />

              <RoomDescriptionPanel
                title={
                  mode === "director"
                    ? "Director Program Cut"
                    : (activeRoom?.title ?? "Room")
                }
                description={
                  mode === "director"
                    ? DIRECTOR_ROOM.description
                    : (activeRoom?.description ?? "Connected camera room view.")
                }
              />
            </div>
          </div>

          {/* ── Right: chat — sticky on desktop so it never scrolls below the fold ── */}
          <div className="flex min-h-0 w-full flex-1 flex-col lg:sticky lg:top-2 lg:h-[calc(100dvh-5.5rem)] lg:max-h-[calc(100dvh-5.5rem)] lg:self-start">
            <ChatConsolePanel
              className="flex h-full min-h-0 w-full flex-1 flex-col"
              chatScope={activeChatScope}
              onSetChatScope={handleSetChatScope}
              roomTitle={
                activeChatRoomId === "global"
                  ? "Global"
                  : activeChatRoomId.startsWith("click:")
                    ? userClan
                      ? `[${userClan.tag}] ${userClan.name}`
                      : "Click"
                    : (browseRooms.find(
                        (r) =>
                          r.roomKey === activeChatRoomId ||
                          r.id === activeChatRoomId,
                      )?.title ??
                      activeRoom?.title ??
                      "Global")
              }
              onlineCount={onlineCount}
              messages={messages}
              chatInput={chatInput}
              onChatInputChange={setChatInput}
              onSend={handleSend}
              replyTarget={replyTarget}
              onReply={setReplyTarget}
              onToggleReaction={(messageId, reaction) => {
                void toggleReaction(messageId, reaction);
              }}
              sending={sending}
              signedIn={signedIn}
              chatError={chatError}
              settings={settings}
              availableRooms={browseRooms
                .filter(
                  (r) =>
                    r.roomKey !== "director" &&
                    r.roomKey !== "global" &&
                    r.title?.toLowerCase() !== "director",
                )
                .map((r) => ({
                  roomKey: r.roomKey,
                  title: r.title,
                }))}
              availableClick={
                userClan
                  ? {
                      id: userClan.clanId,
                      name: userClan.name,
                      tag: userClan.tag,
                    }
                  : null
              }
              activeChatRoomKey={activeChatRoomId}
              mobileSize={mobileChatSize}
              onMobileSizeChange={setMobileChatSize}
              currentUserRole={(initialProfile?.role as any) ?? "member"}
              currentUserId={
                playerProfile?.id ?? initialProfile?.id ?? undefined
              }
              currentUserName={
                playerProfile?.displayName ||
                initialProfile?.userName ||
                "Viewer"
              }
            />
          </div>
        </div>

        {/* Bottom strip: XP bar + missions ticker (Desktop only) */}
        <div className="hidden lg:block">
          <ChromePanel
            withScrews
            className="mt-2 w-full"
            contentClassName="!px-8 !py-3 flex items-center gap-3"
          >
            <div className="flex items-center gap-2">
              <span
                className="hidden shrink-0 text-[10px] font-black tracking-widest sm:inline"
                style={{
                  color: "#241f14",
                  fontFamily: ACTIVE_THEME.fonts.label,
                }}
              >
                {signedIn
                  ? `LVL ${currentLvl} · ${Math.floor(activeXp)} XP`
                  : "SIGN IN FOR XP"}
              </span>
              {signedIn && (
                <span className="rounded border border-black/40 bg-black/80 px-1.5 py-0.5 text-[9px] font-black text-[#39ff6a]">
                  +{ratePerSecond.toFixed(1)}/s
                </span>
              )}
            </div>
            <div className="h-3 flex-1 overflow-hidden rounded-full border border-black/50 bg-black/60 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round(xpProgress * 100)}%`,
                  background: "linear-gradient(90deg,#39ff6a,#1a9c3c)",
                  boxShadow: "0 0 6px rgba(57,255,106,0.6)",
                }}
              />
            </div>
            <div className="hidden flex-1 overflow-hidden lg:block">
              <p
                className="truncate text-[11px] font-bold"
                style={{ color: "#241f14" }}
              >
                {missions.length > 0
                  ? `COMPLETE MISSIONS FOR XP & TOKENS — ${missions.map((m) => m.title).join("   ·   ")}`
                  : "CHECK BACK FOR NEW MISSIONS"}
              </p>
            </div>
          </ChromePanel>
        </div>
      </div>

      {/* ═══════════ MOBILE QUICK ACTION PYRAMID DOCK ═══════════ */}
      {mobileDockOpen && (
        <div
          className="fixed inset-0 z-40 flex flex-col items-center justify-end bg-black/80 p-4 pb-20 backdrop-blur-sm duration-150 animate-in fade-in"
          onClick={() => setMobileDockOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-xs flex-col items-center gap-2 duration-200 animate-in slide-in-from-bottom-6"
          >
            {/* Row 1: Send TTS */}
            <ConsoleButton
              variant="orange"
              onClick={() => {
                setMobileDockOpen(false);
                setOverlayView("chat");
              }}
              className="!w-48 !py-2.5"
            >
              <MessageSquare className="h-4 w-4" />
              Send TTS
            </ConsoleButton>

            {/* Row 2: House Poll · Play SFX */}
            <div className="flex w-full justify-center gap-2">
              <div className="relative flex-1">
                <ConsoleButton
                  variant="orange"
                  onClick={() => {
                    setMobileDockOpen(false);
                    setOverlayView("poll");
                  }}
                  ariaLabel="Open House Poll"
                  className="!w-full !py-2"
                >
                  <Vote className="h-3.5 w-3.5" />
                  <span className="flex flex-col items-start leading-none">
                    <span>House Poll</span>
                    <span className="mt-0.5 font-mono text-[7px] tracking-[0.14em]">
                      Live vote
                    </span>
                  </span>
                </ConsoleButton>
                <MobileUnreadBadge count={unvotedPollCount} />
              </div>
              <ConsoleButton
                variant="gray"
                onClick={() => {
                  setMobileDockOpen(false);
                  setOverlayView("chat");
                }}
                className="flex-1 !py-2"
              >
                📢 Play SFX
              </ConsoleButton>
            </div>

            {/* Row 3: Inventory · Notifications */}
            <div className="flex w-full justify-center gap-2">
              <div className="relative flex-1">
                <ConsoleButton
                  variant="gray"
                  onClick={() => {
                    acknowledgeInventory();
                    setMobileDockOpen(false);
                    setOverlayView("inventory");
                  }}
                  ariaLabel="Open Inventory"
                  className="!w-full !py-2"
                >
                  <Package className="h-3.5 w-3.5" /> Inventory
                </ConsoleButton>
                <MobileUnreadBadge count={newInventoryCount} />
              </div>
              <div className="relative flex-1">
                <ConsoleButton
                  variant="gray"
                  onClick={() => {
                    setMobileDockOpen(false);
                    setNotificationsOpen(true);
                  }}
                  ariaLabel="Open Notifications"
                  className="!w-full !py-2"
                >
                  <Bell className="h-3.5 w-3.5" /> Alerts
                </ConsoleButton>
                <MobileUnreadBadge count={unreadNotificationCount} />
              </div>
            </div>

            {/* Row 4: Watch Episodes · See Schedule */}
            <div className="flex w-full justify-center gap-2">
              <ConsoleButton
                variant="gray"
                onClick={() => {
                  setMobileDockOpen(false);
                  setOverlayView("archives");
                }}
                className="flex-1 !py-2"
              >
                📽️ Watch Episodes
              </ConsoleButton>
              <ConsoleButton
                variant="gray"
                onClick={() => {
                  setMobileDockOpen(false);
                  setOverlayView("missions");
                }}
                className="flex-1 !py-2"
              >
                📅 See Schedule
              </ConsoleButton>
            </div>

            {/* Row 5: Watch Archives · Watch Clips */}
            <div className="flex w-full justify-center gap-2">
              <ConsoleButton
                variant="gray"
                onClick={() => {
                  setMobileDockOpen(false);
                  setOverlayView("archives");
                }}
                className="flex-1 !py-2"
              >
                📖 Watch Archives
              </ConsoleButton>
              <ConsoleButton
                variant="gray"
                onClick={() => {
                  setMobileDockOpen(false);
                  setOverlayView("archives");
                }}
                className="flex-1 !py-2"
              >
                🎬 Watch Clips
              </ConsoleButton>
            </div>

            {/* Row 6: Get Merch · See Contestants */}
            <div className="flex w-full justify-center gap-2">
              <ConsoleButton
                variant="gray"
                href={TANK_MERCH_URL}
                className="flex-1 !py-2"
              >
                🛒 Get Merch
              </ConsoleButton>
              <ConsoleButton
                variant="gray"
                onClick={() => {
                  setMobileDockOpen(false);
                  setOverlayView("clicks");
                }}
                className="flex-1 !py-2"
              >
                👥 See Contestants
              </ConsoleButton>
            </div>

            {/* Row 7: Claim Daily XP · Edit My Profile */}
            <div className="flex w-full justify-center gap-2">
              <ConsoleButton
                variant="gray"
                onClick={() => {
                  setMobileDockOpen(false);
                }}
                className="flex-1 !py-2"
              >
                🏆 Claim Daily XP
              </ConsoleButton>
              <ConsoleButton
                variant="gray"
                onClick={() => {
                  setMobileDockOpen(false);
                  setProfileOpen(true);
                }}
                className="flex-1 !py-2"
              >
                👤 Edit Profile
              </ConsoleButton>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ MOBILE BOTTOM SYSTEM DOCK BAR (lg:hidden) ═══════════ */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] items-center justify-between border-t-2 border-black/60 px-7 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_20px_rgba(0,0,0,0.8)] lg:hidden landscape:hidden"
        style={{
          backgroundColor: "#6e737b",
          backgroundImage:
            "var(--tank-panel-texture, url(https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/light-aluminum-comp.webp))",
          backgroundRepeat: "repeat",
          backgroundSize: "auto",
        }}
      >
        {/* Texture Lighting & Bevel Overlays (contained inside dock height) */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div
            className="absolute inset-0 opacity-30 mix-blend-overlay"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.3) 0%, rgba(0,0,0,0.4) 100%)",
            }}
          />
          <div
            className="absolute inset-0 opacity-20 mix-blend-multiply"
            style={{
              backgroundImage: `url(${ACTIVE_THEME.images.metalTexture})`,
            }}
          />
        </div>

        {/* 4 Corner Bolt Screws */}
        <img
          src={ACTIVE_THEME.images.screwTopLeft}
          alt=""
          className="pointer-events-none absolute left-1.5 top-1.5 z-20 h-3.5 w-3.5 select-none drop-shadow-[1px_1px_1px_rgba(0,0,0,0.8)]"
        />
        <img
          src={ACTIVE_THEME.images.screwTopRight}
          alt=""
          className="pointer-events-none absolute right-1.5 top-1.5 z-20 h-3.5 w-3.5 select-none drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.8)]"
        />
        <img
          src={ACTIVE_THEME.images.screwBottomLeft}
          alt=""
          className="pointer-events-none absolute bottom-1.5 left-1.5 z-20 h-3.5 w-3.5 select-none drop-shadow-[1px_-1px_1px_rgba(0,0,0,0.8)]"
        />
        <img
          src={ACTIVE_THEME.images.screwBottomRight}
          alt=""
          className="pointer-events-none absolute bottom-1.5 right-1.5 z-20 h-3.5 w-3.5 select-none drop-shadow-[-1px_-1px_1px_rgba(0,0,0,0.8)]"
        />

        {/* Left: Gear + Day/Time */}
        <div className="relative z-10 flex items-center gap-2">
          <ConsoleButton
            variant="gray"
            onClick={() => setSettingsOpen(true)}
            className="!px-2.5 !py-1"
            ariaLabel="Settings"
          >
            <Settings className="h-4 w-4" />
          </ConsoleButton>
          <div className="select-none leading-tight">
            <p
              className="text-[11px] font-black uppercase text-[#241f14]"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              Day {seasonDay ?? 1}
            </p>
            <p
              suppressHydrationWarning
              className="text-[10px] font-bold text-[#333]"
            >
              {mounted && dockTime ? dockTime : "LIVE"}
            </p>
          </div>
        </div>

        {/* Center: Circular Protruding Action Center Button (Elevated & Prominent) */}
        <button
          type="button"
          onClick={() => setMobileDockOpen((prev) => !prev)}
          aria-label={`Toggle Quick Actions${mobileActionUnreadCount > 0 ? `, ${mobileActionUnreadCount} unread update${mobileActionUnreadCount === 1 ? "" : "s"}` : ""}`}
          className={`absolute -top-6 left-1/2 z-50 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full border-2 border-black/80 shadow-[0_4px_16px_rgba(0,0,0,0.9)] transition-all hover:scale-105 active:scale-95 ${
            mobileDockOpen
              ? "rotate-45 bg-black text-white ring-2 ring-white/50"
              : "bg-[#16181b] text-white ring-2 ring-black/40"
          }`}
          title="Toggle Quick Actions"
        >
          <div className="pointer-events-none grid h-11 w-11 select-none place-items-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            <TankMarkIcon />
          </div>
          <MobileUnreadBadge count={mobileActionUnreadCount} />
        </button>

        {/* Right: Backpack + Toys (1) + Blue Chat Bubble Icon */}
        <div className="relative z-10 flex items-center gap-1.5">
          <div className="relative">
            <ConsoleButton
              variant="gray"
              onClick={() => {
                acknowledgeInventory();
                setOverlayView("inventory");
              }}
              className="!px-2 !py-1 !text-sm"
              ariaLabel="Inventory"
            >
              🎒
            </ConsoleButton>
            <MobileUnreadBadge count={newInventoryCount} />
          </div>
          <div className="relative">
            <ConsoleButton
              variant={dockOpen ? "orange" : "gray"}
              onClick={() => setDockOpen((prev) => !prev)}
              className="!px-2 !py-1 !text-sm"
              ariaLabel="Dock (D)"
            >
              ⚓
            </ConsoleButton>
            <span className="pointer-events-none absolute -right-1 -top-1 z-20 grid h-4 w-4 place-items-center rounded-full border border-white bg-[#ff3b2f] text-[9px] font-black text-white">
              1
            </span>
          </div>
          <ConsoleButton
            variant={mobileChatSize !== "hidden" ? "orange" : "gray"}
            onClick={() => {
              if (mobileChatSize === "hidden") setMobileChatSize("half");
              else if (mobileChatSize === "half") setMobileChatSize("full");
              else setMobileChatSize("half");
            }}
            className="!px-2.5 !py-1"
            ariaLabel="Toggle Chat"
          >
            <MessageSquare className="h-4 w-4" />
          </ConsoleButton>
        </div>
      </div>

      {dockOpen && (
        <DockOverlay
          missions={missions}
          onClose={() => setDockOpen(false)}
          onClaimDailyXp={() => {
            setDockOpen(false);
            setDailyClaimOpen(true);
          }}
          onOpenPrizeMachine={() => {
            setDockOpen(false);
            setPrizeMachineOpen(true);
          }}
          onOpenSecretCode={() => {
            setDockOpen(false);
            setSecretCodeOpen(true);
          }}
          onGiftSeasonPass={() => setOverlayView("season")}
          onCompleteMission={async (missionId) => {
            await completeMission(missionId);
          }}
        />
      )}

      {/* Daily Claim Streak Modal */}
      <DailyClaimModal
        isOpen={dailyClaimOpen}
        onClose={() => setDailyClaimOpen(false)}
        onSuccess={(res) => {
          applyReward(res.xpAwarded ?? 0, res.tokensAwarded ?? 0);
          setPlayerProfile((prev) => ({
            ...prev,
            xp: (prev?.xp ?? 0) + (res.xpAwarded ?? 0),
            level: prev?.level ?? 1,
            tokens: (prev?.tokens ?? 0) + (res.tokensAwarded ?? 0),
          }));
        }}
      />

      {/* Interactive Prize Machine (Gacha Wheel) */}
      <PrizeMachineModal
        isOpen={prizeMachineOpen}
        onClose={() => setPrizeMachineOpen(false)}
        userTokens={playerProfile?.tokens ?? 50}
        onPrizeWon={(prize) => {
          if (prize.type === "tokens" && prize.amount) {
            setPlayerProfile((prev) => ({
              xp: prev?.xp ?? 0,
              level: prev?.level ?? 1,
              tokens: (prev?.tokens ?? 0) + prize.amount!,
              ...prev,
            }));
          } else if (prize.type === "xp" && prize.amount) {
            setPlayerProfile((prev) => ({
              xp: (prev?.xp ?? 0) + prize.amount!,
              level: prev?.level ?? 1,
              tokens: prev?.tokens ?? 0,
              ...prev,
            }));
          }
        }}
      />

      {/* Secret Event Promo Code Redemption */}
      <SecretCodeModal
        isOpen={secretCodeOpen}
        onClose={() => setSecretCodeOpen(false)}
        onSuccess={(res) => {
          setPlayerProfile((prev) => ({
            xp: (prev?.xp ?? 0) + (res.xpAwarded ?? 0),
            level: prev?.level ?? 1,
            tokens: (prev?.tokens ?? 0) + (res.tokensAwarded ?? 0),
            ...prev,
          }));
        }}
      />

      {/* Moderation & Ban Appeals Review Desk Modal */}
      <TankBanAppealsModal
        isOpen={appealsModalOpen}
        onClose={() => {
          setAppealsModalOpen(false);
          setAppealsTargetUserId(undefined);
        }}
        initialUserId={appealsTargetUserId}
      />

      {accountOpen && <AccountOverlay onClose={() => setAccountOpen(false)} />}
      {profileOpen && (
        <ProfileOverlay
          initialProfile={livePlayerProfile ?? playerProfile}
          onClose={() => setProfileOpen(false)}
          onOpenSeasonPass={() => setOverlayView("season")}
          onProfileUpdated={(updated) => {
            setPlayerProfile((prev) => ({
              xp: prev?.xp ?? 0,
              level: prev?.level ?? 1,
              tokens: prev?.tokens ?? 0,
              ...prev,
              ...updated,
            }));
          }}
        />
      )}
      {notificationsOpen && (
        <NotificationsOverlay
          notifications={userNotifications}
          onClose={() => setNotificationsOpen(false)}
          onMarkAllRead={() =>
            setUserNotifications((current) =>
              current.map((notification) => ({
                ...notification,
                read: true,
              })),
            )
          }
        />
      )}
      {settingsOpen && (
        <SettingsOverlay
          currentSettings={settings}
          onClose={() => setSettingsOpen(false)}
          onSettingsSaved={handleSaveSettings}
        />
      )}

      {overlayView === "clicks" && (
        <ClicksOverlay
          onClose={() => setOverlayView(null)}
          signedIn={signedIn}
          currentUserLevel={currentLevel}
          currentUserTokens={currentTokens}
          onMembershipChanged={(membership) => {
            setUserClan(
              membership
                ? {
                    clanId: membership.id,
                    name: membership.name,
                    tag: membership.tag,
                    bannerColor: membership.bannerColor,
                  }
                : null,
            );
            if (!membership && activeChatRoomId.startsWith("click:")) {
              setExplicitChatTarget("global");
              setChatScope("global");
            }
          }}
        />
      )}

      {overlayView === "tokens" && (
        <InfoOverlay
          title="Tokens"
          icon={<Coins className="h-4 w-4" style={{ color: "#241f14" }} />}
          onClose={() => setOverlayView(null)}
        >
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
                <div
                  key={tx.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span style={{ color: "#4c4630" }}>{tx.reason}</span>
                  <span
                    className="font-bold"
                    style={{ color: tx.amount >= 0 ? "#1a6b34" : "#b02318" }}
                  >
                    {tx.amount >= 0 ? "+" : ""}
                    {tx.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </InfoOverlay>
      )}

      {overlayView === "store" && (
        <InfoOverlay
          title="Tank Store"
          icon={<Store className="h-4 w-4" style={{ color: "#241f14" }} />}
          onClose={() => setOverlayView(null)}
        >
          <p className="mb-3 text-xs font-bold" style={{ color: "#4c4630" }}>
            Inventory is available to every signed-in account. Shop items and
            token packs do not require a Season Pass.
          </p>
          <TankStorePanel />
        </InfoOverlay>
      )}

      {(overlayView === "season" || overlayView === "season-required") && (
        <SeasonPassOverlay
          isOpen={true}
          variant={overlayView === "season-required" ? "required" : "get"}
          onClose={() => setOverlayView(null)}
        />
      )}

      {overlayView === "missions" && (
        <InfoOverlay
          title="Daily Missions"
          icon={<Compass className="h-4 w-4" style={{ color: "#241f14" }} />}
          onClose={() => setOverlayView(null)}
        >
          <div className="space-y-2">
            {missions.map((mission) => (
              <div
                key={mission.id}
                className="rounded border border-black/20 p-2.5"
              >
                <p className="text-sm font-bold" style={{ color: "#241f14" }}>
                  {mission.title}
                </p>
                <p className="text-xs" style={{ color: "#4c4630" }}>
                  {mission.description} — {mission.rewardXp} XP,{" "}
                  {mission.rewardTokens} tokens
                </p>
              </div>
            ))}
          </div>
        </InfoOverlay>
      )}

      {overlayView === "leaderboard" && (
        <InfoOverlay
          title="Leader board"
          icon={<Trophy className="h-4 w-4" style={{ color: "#241f14" }} />}
          onClose={() => setOverlayView(null)}
        >
          {leaderboard.length === 0 ? (
            <p className="text-sm" style={{ color: "#4c4630" }}>
              No ranked players yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {leaderboard.map((row) => (
                <div
                  key={row.userId}
                  className="flex items-center justify-between text-sm"
                >
                  <span style={{ color: "#241f14" }}>
                    #{row.rank} {row.displayName}{" "}
                    {row.clanTag ? `[${row.clanTag}]` : ""}
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
        <InfoOverlay
          title="Archives"
          icon={<Archive className="h-4 w-4" style={{ color: "#241f14" }} />}
          onClose={() => setOverlayView(null)}
        >
          {/* Recorded footage, room by room. Opens on the room currently being
              watched, since "let me see what happened in here earlier" is the
              reason anyone opens this mid-stream. */}
          <ArchiveOverlayPanel initialRoomSlug={heroRoom?.id} />

          {/* Curated episodes still live in tank_archives and are a separate
              thing from the continuous recording above — published highlights
              rather than raw footage. Kept, but no longer the whole section. */}
          {archives.length > 0 && (
            <div className="mt-4 border-t border-black/15 pt-3">
              <p
                className="mb-2 text-[10px] font-black uppercase tracking-wider"
                style={{ color: "#4c4630" }}
              >
                Episodes
              </p>
              <div className="space-y-2">
                {archives.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded border border-black/20 p-2.5"
                  >
                    <p
                      className="text-sm font-bold"
                      style={{ color: "#241f14" }}
                    >
                      {entry.episodeNumber
                        ? `Ep. ${entry.episodeNumber} — `
                        : ""}
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
            </div>
          )}
        </InfoOverlay>
      )}

      {overlayView === "inventory" && (
        <InventoryOverlay
          inventory={liveInventory}
          targetRoomKey={activeRoom?.roomKey && activeRoom.roomKey !== "director" ? activeRoom.roomKey : null}
          onClose={() => setOverlayView(null)}
          onOpenShop={() => setOverlayView("store")}
        />
      )}

      {overlayView === "poll" && (
        <PollOverlay
          onClose={() => setOverlayView(null)}
          onVoteRecorded={() => setUnvotedPollCount(0)}
        />
      )}

      {overlayView === "audio-request" && (
        <InfoOverlay
          title="Text To Speech / Sound Effects"
          icon={<AudioLines className="h-4 w-4" style={{ color: "#241f14" }} />}
          onClose={() => setOverlayView(null)}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1.5">
              {(["tts", "sfx"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAudioRequestTab(tab)}
                  className="rounded px-2.5 py-1 text-xs font-black uppercase tracking-wide"
                  style={{
                    background:
                      audioRequestTab === tab ? "#241f14" : "transparent",
                    color: audioRequestTab === tab ? "#e8dfc8" : "#4c4630",
                    border: "1px solid rgba(0,0,0,.2)",
                  }}
                >
                  {tab === "tts" ? "Text To Speech" : "Sound Effects"}
                </button>
              ))}
            </div>
            <span className="text-xs font-bold" style={{ color: "#4c4630" }}>
              Balance: {initialProfile?.tokens ?? 0}
            </span>
          </div>

          {audioRequestTab === "tts" ? (
            <div className="space-y-2">
              <textarea
                value={ttsMessage}
                onChange={(e) => setTtsMessage(e.target.value.slice(0, 250))}
                placeholder="Message to speak…"
                rows={3}
                className="w-full rounded border border-black/20 bg-white/70 p-2 text-sm"
                style={{ color: "#241f14" }}
              />
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "#4c4630" }}
              >
                <span>{ttsMessage.length} / 250</span>
                <select
                  value={ttsVoice}
                  onChange={(e) => setTtsVoice(e.target.value)}
                  className="rounded border border-black/20 bg-white/70 px-1.5 py-1"
                >
                  <option value="default">Default voice</option>
                  <option value="brainrot">Brainrot</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <select
                value={sfxKey}
                onChange={(e) => setSfxKey(e.target.value)}
                disabled={sfxLibraryLoading || sfxLibrary.length === 0}
                className="w-full rounded border border-black/20 bg-white/70 p-2 text-sm disabled:opacity-60"
                style={{ color: "#241f14" }}
              >
                {sfxLibrary.length === 0 ? (
                  <option value="">{sfxLibraryLoading ? "Loading sound library…" : "No sounds have been imported yet"}</option>
                ) : sfxLibrary.map((clip) => (
                  <option key={clip.id} value={clip.soundKey}>
                    {clip.name} · {clip.isPremium ? "Item" : `${clip.tokenCost} ₮`}
                  </option>
                ))}
              </select>
              <p className="text-[11px]" style={{ color: "#4c4630" }}>
                Only producer-approved clips from the Tank sound library can be queued.
              </p>
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: "#4c4630" }}>
              To
            </span>
            <select
              value={audioRequestTarget}
              onChange={(e) => setAudioRequestTarget(e.target.value)}
              className="flex-1 rounded border border-black/20 bg-white/70 px-2 py-1.5 text-sm"
              style={{ color: "#241f14" }}
            >
              <option value="website">Website</option>
              {browseRooms.map((room) => (
                <option key={room.roomKey} value={room.roomKey}>
                  {room.title}
                </option>
              ))}
            </select>
          </div>

          {audioRequestError && (
            <p className="mt-2 text-xs font-bold" style={{ color: "#b02318" }}>
              {audioRequestError}
            </p>
          )}
          {audioRequestSuccess && (
            <p className="mt-2 text-xs font-bold" style={{ color: "#1a6b34" }}>
              {audioRequestSuccess}
            </p>
          )}

          <button
            onClick={() => void submitAudioRequest()}
            disabled={
              audioRequestSubmitting ||
              (audioRequestTab === "tts" ? !ttsMessage.trim() : !sfxKey.trim())
            }
            className="mt-3 w-full rounded px-3 py-2 text-sm font-black uppercase tracking-wide disabled:opacity-50"
            style={{ background: "#c0432a", color: "#f5ece0" }}
          >
            {audioRequestSubmitting
              ? "Sending…"
              : `Send ${audioRequestTab === "tts" ? "TTS" : "SFX"}`}
          </button>

          <div className="mt-4 border-t border-black/20 pt-3">
            <p
              className="mb-1.5 text-xs font-black uppercase tracking-wide"
              style={{ color: "#4c4630" }}
            >
              This device's room output
            </p>
            <select
              value={assignedRoomKey ?? ""}
              onChange={(e) => setAssignedRoomKey(e.target.value || null)}
              className="w-full rounded border border-black/20 bg-white/70 px-2 py-1.5 text-sm"
              style={{ color: "#241f14" }}
            >
              <option value="">Not assigned — website audio only</option>
              {browseRooms.map((room) => (
                <option key={room.roomKey} value={room.roomKey}>
                  {room.title}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px]" style={{ color: "#4c4630" }}>
              If this device sits in a physical room (OS audio output already
              paired to that room's speaker), assign it here so it plays TTS/SFX
              targeted at that room.
            </p>
          </div>
        </InfoOverlay>
      )}
    </div>
  );
}
