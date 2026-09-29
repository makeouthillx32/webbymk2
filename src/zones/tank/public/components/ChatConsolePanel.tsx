"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  MessageSquare,
  Smile,
  Sparkles,
  Send,
  Plus,
  Minus,
  SlidersHorizontal,
  ChevronDown,
  Globe2,
  Trash2,
  Clock,
  Ban,
  Shield,
  Crown,
  Flame,
  AlertOctagon,
  Dices,
  Coins,
  Gift,
  Crosshair,
  Package,
  Trophy,
  CornerUpLeft,
  MoreHorizontal,
  Copy,
  ChevronRight,
  Pin,
  X,
  Users,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Search,
} from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { TankChatInputField } from "./TankChatInputField";
import {
  TankChatBody,
  useTankEmojiCatalog,
  TANK_EMOJI_NAMES,
} from "../TankChatEmoji";
import { extractImageIdsFromText } from "../../server/chatAttachments";
import {
  extractGifTokensFromText,
  formatGifToken,
  type GiphyMediaItem,
} from "../../server/chatGifs";
import { GiphyPickerPopover } from "./GiphyPickerPopover";
import { SuperChatModal } from "./SuperChatModal";
import { TavernPanel } from "../../tavern/TavernPanel";
import { ACTIVE_THEME } from "../../theme";
import type { ChatMessage, ChatSearchResult } from "../../contracts";
import {
  findActiveMention,
  getMentionSuggestions,
  insertMention,
} from "../chatDiscovery";
import { type TankSettings } from "./SettingsOverlay";
import {
  getActivePinnedMessage,
  pinChatMessage,
  unpinChatMessage,
  type PinnedChatMessage,
  type PinDurationHours,
} from "../../server/chatPins";
import { isSystemPillMessage } from "../chatMessagePresentation";

export type MobileChatSize = "hidden" | "half" | "full";
export type DesktopChatSize = "hidden" | "full";

/**
 * Normalizes chat message timestamp to the client's local browser timezone.
 */
export function formatLocalChatTime(
  rawTime?: string,
  createdAt?: string,
): string {
  if (!rawTime && !createdAt) return "";

  // 1. If explicit ISO timestamp exists, format directly in client's local timezone
  if (createdAt) {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
  }

  // 2. If rawTime is available, parse UTC/local and format in client's local timezone
  if (rawTime) {
    let parseable = rawTime;
    if (
      !parseable.includes("Z") &&
      !parseable.includes("GMT") &&
      !parseable.includes("UTC") &&
      !parseable.includes("+") &&
      !parseable.includes("-")
    ) {
      const parts = rawTime.split(",");
      if (parts.length === 2) {
        parseable = `${rawTime} UTC`;
      }
    }
    const d = new Date(parseable);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return rawTime;
  }

  return "";
}

export type ChatConsolePanelProps = {
  chatScope: "global" | "room" | "click";
  onSetChatScope: (
    scope: "global" | "room" | "click",
    targetRoomKey?: string,
  ) => void;
  roomTitle: string;
  onlineCount: number;
  messages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (val: string) => void;
  onSend: (e: React.FormEvent) => void;
  replyTarget?: ChatMessage | null;
  onReply: (message: ChatMessage | null) => void;
  onToggleReaction: (messageId: string, reaction: string) => void;
  sending: boolean;
  signedIn: boolean;
  chatError: string | null;
  settings?: TankSettings;
  availableRooms?: Array<{ roomKey: string; title: string }>;
  availableClick?: { id: string; name: string; tag: string } | null;
  activeChatRoomKey?: string;
  mobileSize?: MobileChatSize;
  onMobileSizeChange?: (size: MobileChatSize) => void;
  desktopSize?: DesktopChatSize;
  onDesktopSizeChange?: (size: DesktopChatSize) => void;
  className?: string;
  currentUserRole?: "viewer" | "member" | "moderator" | "admin";
  currentUserId?: string;
  currentUserName?: string;
  currentUserTokens?: number;
  onOpenMessenger?: () => void;
  onOpenSignIn?: () => void;
};

const USER_COLORS = [
  "#a855f7", // purple
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#eab308", // yellow
  "#06b6d4", // cyan
  "#ec4899", // pink
];

function getUserColor(username: string, customColor?: string): string {
  if (customColor) return customColor;
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

const PLACEHOLDER_PROMPTS = [
  "Online therapy available now...",
  "Type /roll, /slots, or /flip for RNG...",
  "Type :emotion_happy: or any emoji...",
  "Chatting house-wide on unenter.live...",
  "Send a broadcast to the room...",
];

export function ChatConsolePanel({
  chatScope,
  onSetChatScope,
  roomTitle,
  onlineCount,
  messages,
  chatInput,
  onChatInputChange,
  onSend,
  replyTarget,
  onReply,
  onToggleReaction,
  sending,
  signedIn,
  chatError,
  settings,
  availableRooms = [],
  availableClick = null,
  activeChatRoomKey,
  mobileSize = "half",
  onMobileSizeChange,
  desktopSize = "full",
  onDesktopSizeChange,
  className = "",
  currentUserRole = "member",
  currentUserId,
  currentUserName,
  currentUserTokens = 0,
  onOpenMessenger,
  onOpenSignIn,
}: ChatConsolePanelProps) {
  const [superChatOpen, setSuperChatOpen] = useState(false);
  const [tavernOverlayOpen, setTavernOverlayOpen] = useState(false);
  const [liveUserTokens, setLiveUserTokens] = useState(currentUserTokens);
  useEffect(() => setLiveUserTokens(currentUserTokens), [currentUserTokens]);
  const [roomDropdownOpen, setRoomDropdownOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [rngMenuOpen, setRngMenuOpen] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [modBusyId, setModBusyId] = useState<string | null>(null);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(
    null,
  );
  const [showModToolsForId, setShowModToolsForId] = useState<string | null>(
    null,
  );
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const feedContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const emojiCatalog = useTankEmojiCatalog();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);

  // ═══════════ ATTACHMENT & GIF STATE ═══════════
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);

  const handleSelectGif = (gif: GiphyMediaItem) => {
    setGifPickerOpen(false);
    const token = formatGifToken(gif.id);
    const separator =
      chatInput.length > 0 && !chatInput.endsWith(" ") ? " " : "";
    onChatInputChange(`${chatInput}${separator}${token} `);
    setTimeout(() => chatInputRef.current?.focus(), 50);
  };

  const handleImageFile = async (file: File) => {
    if (!file || !signedIn) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Image exceeds 5MB size limit.");
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/tank/chat/attachments/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.token) {
        throw new Error(data.error || "Upload failed");
      }

      // Append inline token into compose box
      const separator =
        chatInput.length > 0 && !chatInput.endsWith(" ") ? " " : "";
      onChatInputChange(`${chatInput}${separator}${data.token} `);
      setTimeout(() => chatInputRef.current?.focus(), 50);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const isStaff =
    currentUserRole === "admin" || currentUserRole === "moderator";

  // ═══════════ PINNED ANNOUNCEMENT STATE ═══════════
  const [pinnedMessage, setPinnedMessage] = useState<PinnedChatMessage | null>(
    null,
  );
  const [pinTimeRemaining, setPinTimeRemaining] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinTitleInput, setPinTitleInput] = useState("SYSTEM ANNOUNCEMENT");
  const [pinBodyInput, setPinBodyInput] = useState("");
  const [pinDurationInput, setPinDurationInput] =
    useState<PinDurationHours>(24);
  const [pinBusy, setPinBusy] = useState(false);

  const activeRoomKey =
    activeChatRoomKey || (chatScope === "global" ? "global" : "director");

  const mentionCandidates = useMemo(
    () =>
      messages
        .filter(
          (message) =>
            message.userId &&
            !["SYSTEM", "CONSOLE", "HOUSE EVENT"].includes(
              message.user.toUpperCase(),
            ),
        )
        .map((message) => ({ userId: message.userId, name: message.user })),
    [messages],
  );
  const activeMention = findActiveMention(
    chatInput,
    chatInputRef.current?.selectionStart ?? chatInput.length,
  );
  const mentionSuggestions =
    activeMention && !mentionDismissed
      ? getMentionSuggestions(
          mentionCandidates,
          activeMention.query,
          currentUserId,
        )
      : [];

  useEffect(() => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
  }, [activeRoomKey]);

  useEffect(() => {
    if (!searchOpen) return;
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({
          roomId: activeRoomKey,
          search: query,
        });
        const response = await fetch(`/api/tank/chat/messages?${params}`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Chat search failed.");
        }
        setSearchResults(payload.results ?? []);
      } catch (error) {
        if (!controller.signal.aborted) {
          setSearchResults([]);
          setSearchError(
            error instanceof Error ? error.message : "Chat search failed.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeRoomKey, searchOpen, searchQuery]);

  const toggleSearch = () => {
    setSearchOpen((open) => {
      const next = !open;
      if (next) window.setTimeout(() => searchInputRef.current?.focus(), 0);
      return next;
    });
  };

  const handleChatInputChangeWithMentions = (value: string) => {
    setMentionDismissed(false);
    setMentionIndex(0);
    onChatInputChange(value);
  };

  const chooseMention = (index: number) => {
    const candidate = mentionSuggestions[index];
    if (!candidate || !activeMention) return;
    const inserted = insertMention(chatInput, activeMention, candidate.name);
    onChatInputChange(inserted.value);
    setMentionDismissed(true);
    window.setTimeout(() => {
      chatInputRef.current?.focus();
      chatInputRef.current?.setSelectionRange(
        inserted.caretPosition,
        inserted.caretPosition,
      );
    }, 0);
  };

  const handleMentionKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (mentionSuggestions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setMentionIndex((current) => {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        return (current + delta + mentionSuggestions.length) %
          mentionSuggestions.length;
      });
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      chooseMention(Math.min(mentionIndex, mentionSuggestions.length - 1));
    } else if (event.key === "Escape") {
      event.preventDefault();
      setMentionDismissed(true);
    }
  };

  const loadPinnedMessage = async () => {
    try {
      const pin = await getActivePinnedMessage(activeRoomKey);
      setPinnedMessage(pin);
    } catch {}
  };

  useEffect(() => {
    void loadPinnedMessage();
    const interval = setInterval(() => void loadPinnedMessage(), 10000);
    return () => clearInterval(interval);
  }, [activeRoomKey]);

  useEffect(() => {
    if (!pinnedMessage || !pinnedMessage.expiresAt) {
      setPinTimeRemaining(null);
      return;
    }

    const updatePinTimer = () => {
      const remainingMs = pinnedMessage.expiresAt! - Date.now();
      if (remainingMs <= 0) {
        setPinnedMessage(null);
        setPinTimeRemaining(null);
      } else {
        const hours = Math.floor(remainingMs / (1000 * 60 * 60));
        const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 0) {
          setPinTimeRemaining(`${hours}h ${mins}m left`);
        } else {
          setPinTimeRemaining(`${mins}m left`);
        }
      }
    };

    updatePinTimer();
    const timer = setInterval(updatePinTimer, 10000);
    return () => clearInterval(timer);
  }, [pinnedMessage]);

  const handleUnpin = async () => {
    if (!isStaff || !confirm("Unpin this announcement?")) return;
    setPinBusy(true);
    await unpinChatMessage(activeRoomKey);
    setPinnedMessage(null);
    setPinBusy(false);
  };

  const handleCreatePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinBodyInput.trim()) return;
    setPinBusy(true);
    const res = await pinChatMessage(
      activeRoomKey,
      pinBodyInput.trim(),
      pinDurationInput,
      pinTitleInput.trim() || "SYSTEM ANNOUNCEMENT",
    );
    if (res.success && res.pinned) {
      setPinnedMessage(res.pinned);
      setPinModalOpen(false);
      setPinBodyInput("");
    } else {
      alert(res.error || "Failed to pin message");
    }
    setPinBusy(false);
  };

  // Rotate placeholder occasionally
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_PROMPTS.length);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll inside chat feed only (never scroll the outer page window)
  useEffect(() => {
    if (!isScrolledUp && feedContainerRef.current) {
      feedContainerRef.current.scrollTop =
        feedContainerRef.current.scrollHeight;
    }
  }, [messages, isScrolledUp]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    // Staff slash commands: /pin [3h|12h|24h] <message> and /unpin
    if (trimmed.startsWith("/pin") && isStaff) {
      const parts = trimmed.split(" ");
      let dur: PinDurationHours = 24;
      let text = "";
      if (parts[1] === "3h" || parts[1] === "3") {
        dur = 3;
        text = parts.slice(2).join(" ");
      } else if (parts[1] === "12h" || parts[1] === "12") {
        dur = 12;
        text = parts.slice(2).join(" ");
      } else if (parts[1] === "24h" || parts[1] === "24") {
        dur = 24;
        text = parts.slice(2).join(" ");
      } else {
        text = parts.slice(1).join(" ");
      }

      if (text.trim()) {
        onChatInputChange("");
        setPinBusy(true);
        const res = await pinChatMessage(activeRoomKey, text.trim(), dur);
        if (res.success && res.pinned) {
          setPinnedMessage(res.pinned);
        } else {
          alert(res.error || "Failed to pin message");
        }
        setPinBusy(false);
        return;
      }
    }

    if (trimmed === "/unpin" && isStaff) {
      onChatInputChange("");
      await handleUnpin();
      return;
    }

    onSend(e);
  };

  const handleScroll = () => {
    if (!feedContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedContainerRef.current;
    const isUp = scrollHeight - scrollTop - clientHeight > 60;
    setIsScrolledUp(isUp);
  };

  const handleScrollToBottom = () => {
    setIsScrolledUp(false);
    if (feedContainerRef.current) {
      feedContainerRef.current.scrollTo({
        top: feedContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const handleSelectEmoji = (shortcode: string) => {
    onChatInputChange(`${chatInput} :${shortcode}: `);
    setEmojiPickerOpen(false);
    setTimeout(() => chatInputRef.current?.focus(), 50);
  };

  const handleTriggerRngCommand = (command: string) => {
    onChatInputChange(command);
    setRngMenuOpen(false);
    setTimeout(() => chatInputRef.current?.focus(), 50);
  };

  const handlePlusClick = () => {
    if (!onMobileSizeChange) return;
    if (mobileSize === "hidden") onMobileSizeChange("half");
    else if (mobileSize === "half") onMobileSizeChange("full");
  };

  const handleMinusClick = () => {
    if (!onMobileSizeChange) return;
    if (mobileSize === "full") onMobileSizeChange("half");
    else if (mobileSize === "half") onMobileSizeChange("hidden");
  };

  const handleDesktopMinusClick = () => {
    if (!onDesktopSizeChange) return;
    onDesktopSizeChange("hidden");
  };

  // Moderator actions
  const handleDeleteMessage = async (messageId: string) => {
    if (!isStaff || modBusyId) return;
    setModBusyId(messageId);
    try {
      await fetch("/api/tank/chat/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          messageId,
          roomId:
            activeChatRoomKey && activeChatRoomKey !== "director"
              ? activeChatRoomKey
              : "global",
        }),
      });
    } catch {}
    setModBusyId(null);
  };

  const handleTimeoutUser = async (userId?: string, userName?: string) => {
    if (!isStaff || !userId || modBusyId) return;
    if (!confirm(`Timeout ${userName || "user"} for 5 minutes?`)) return;
    setModBusyId(userId);
    try {
      await fetch("/api/tank/chat/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ban",
          userId,
          userName: userName || "User",
          reason: "5m Moderator Timeout",
          durationMinutes: 5,
        }),
      });
    } catch {}
    setModBusyId(null);
  };

  const handleBanUser = async (userId?: string, userName?: string) => {
    if (!isStaff || !userId || modBusyId) return;
    if (!confirm(`PERMANENTLY BAN ${userName || "user"} from Tank chat?`))
      return;
    setModBusyId(userId);
    try {
      await fetch("/api/tank/chat/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ban",
          userId,
          userName: userName || "User",
          reason: "Banned by Moderator",
          durationMinutes: "permanent",
        }),
      });
    } catch {}
    setModBusyId(null);
  };

  return (
    <>
      {/* Sleek Mini Opener Pill when Chat is Hidden */}
      {mobileSize === "hidden" && (
        <div className="fixed inset-x-2 bottom-[3.8rem] z-30 flex duration-200 animate-in slide-in-from-bottom-2 lg:hidden">
          <button
            type="button"
            onClick={() => onMobileSizeChange?.("half")}
            className="flex w-full items-center justify-between rounded border border-black/60 bg-black/85 px-3.5 py-2 text-xs font-black text-white shadow-2xl backdrop-blur-md active:scale-95"
            style={{ fontFamily: ACTIVE_THEME.fonts.label }}
          >
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#39ff6a] shadow-[0_0_6px_#39ff6a]" />
              <span>LIVE CHAT ({onlineCount} ONLINE)</span>
            </span>
            <span className="flex items-center gap-1 text-[11px] font-black uppercase text-[#ff4d00]">
              <span>Open</span>
              <Plus className="h-3.5 w-3.5" />
            </span>
          </button>
        </div>
      )}

      {/* Main Bottom-Sliding Chat Console Drawer */}
      <div
        className={`flex h-full w-full transform-gpu flex-col transition-all duration-300 ease-out will-change-transform ${
          mobileSize === "full"
            ? "fixed inset-x-0 bottom-[3.5rem] z-40 h-[86dvh] max-h-[86vh] translate-y-0 px-2 pb-1 opacity-100 lg:static lg:h-full lg:max-h-none lg:min-h-full lg:p-0 landscape:bottom-0 landscape:h-[55dvh] landscape:max-h-[55vh]"
            : mobileSize === "half"
              ? "fixed inset-x-0 bottom-[3.5rem] z-30 h-[48dvh] max-h-[48vh] translate-y-0 px-2 pb-1 opacity-100 lg:static lg:h-full lg:max-h-none lg:min-h-full lg:p-0 landscape:bottom-0 landscape:h-[35dvh] landscape:max-h-[35vh]"
              : "pointer-events-none fixed inset-x-0 bottom-[3.5rem] z-10 h-0 translate-y-full px-2 opacity-0 lg:pointer-events-auto lg:static lg:flex lg:h-full lg:max-h-none lg:min-h-full lg:translate-y-0 lg:p-0 lg:opacity-100 landscape:bottom-0"
        } ${desktopSize === "hidden" ? "lg:hidden" : ""} ${className}`}
      >
        <ChromePanel
          withScrews
          className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden shadow-2xl"
          contentClassName="!p-0 flex flex-1 flex-col h-full min-h-0 overflow-hidden"
        >
          {/* ═══════════ TOP CONSOLE HEADER STRIP ═══════════ */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-black/50 pl-9 pr-3 sm:h-12 sm:px-8">
            {/* Left: Chat Icon + Title + Room Scope */}
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 animate-pulse rounded-full"
                style={{
                  background: "radial-gradient(circle, #ff8a7a, #ff3b2f)",
                  boxShadow: "0 0 6px #ff3b2f",
                }}
              />
              <h2
                className="text-xs font-black uppercase tracking-widest text-[#241f14]"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                LIVE CHAT
              </h2>

              {/* Room Scope Pill */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setRoomDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-1 rounded bg-[#1f2021] px-2 py-0.5 text-[10px] font-bold text-white shadow transition hover:bg-black active:scale-95"
                >
                  {chatScope === "click" ? (
                    <Users className="h-3 w-3 text-orange-400" />
                  ) : chatScope === "room" ? (
                    <MessageSquare className="h-3 w-3 text-orange-400" />
                  ) : (
                    <Globe2 className="h-3 w-3 text-orange-400" />
                  )}
                  <span className="max-w-[90px] truncate sm:max-w-[120px]">
                    {chatScope === "global" ? "GLOBAL" : roomTitle}
                  </span>
                  <ChevronDown className="h-2.5 w-2.5 text-slate-400" />
                </button>

                {/* Dropdown Menu */}
                {roomDropdownOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-48 overflow-y-auto rounded-md border border-black/60 bg-[#17191e] p-1 shadow-2xl backdrop-blur-md">
                    <button
                      type="button"
                      onClick={() => {
                        onSetChatScope("global");
                        setRoomDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs font-bold transition ${
                        chatScope === "global"
                          ? "bg-orange-500 text-black"
                          : "text-white hover:bg-white/10"
                      }`}
                    >
                      <span>🌐 Global Chat</span>
                      {chatScope === "global" && (
                        <span className="text-[10px]">●</span>
                      )}
                    </button>

                    {availableRooms.map((room) => (
                      <button
                        key={room.roomKey}
                        type="button"
                        onClick={() => {
                          onSetChatScope("room", room.roomKey);
                          setRoomDropdownOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs font-bold transition ${
                          chatScope === "room" &&
                          activeChatRoomKey === room.roomKey
                            ? "bg-orange-500 text-black"
                            : "text-white hover:bg-white/10"
                        }`}
                      >
                        <span className="truncate">{room.title}</span>
                        {chatScope === "room" &&
                          activeChatRoomKey === room.roomKey && (
                            <span className="text-[10px]">●</span>
                          )}
                      </button>
                    ))}

                    {availableClick && (
                      <button
                        type="button"
                        onClick={() => {
                          onSetChatScope("click", `click:${availableClick.id}`);
                          setRoomDropdownOpen(false);
                        }}
                        className={`mt-1 flex w-full items-center justify-between rounded border-t border-white/10 px-2 py-1.5 text-left text-xs font-bold transition ${
                          chatScope === "click"
                            ? "bg-orange-500 text-black"
                            : "text-white hover:bg-white/10"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Users className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            [{availableClick.tag}] {availableClick.name}
                          </span>
                        </span>
                        {chatScope === "click" && (
                          <span className="text-[10px]">●</span>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* Right: Online Indicator + Mobile Expand / Collapse Buttons */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={toggleSearch}
                className={`grid h-6 w-6 place-items-center rounded border shadow active:scale-95 md:h-7 md:w-7 ${
                  searchOpen
                    ? "border-cyan-300 bg-cyan-500 text-black"
                    : "border-black/50 bg-[#1f2021] text-cyan-300"
                }`}
                title="Search this chat room"
                aria-label="Search this chat room"
                aria-pressed={searchOpen}
              >
                {searchLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin md:h-3.5 md:w-3.5" />
                ) : (
                  <Search className="h-3 w-3 md:h-3.5 md:w-3.5" />
                )}
              </button>

              {/* Online count badge */}
              <div className="flex items-center gap-1 font-mono text-[10px] font-black uppercase text-[#241f14]">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-500" />
                <span>{onlineCount}</span>
              </div>

              {/* Tank Messenger */}
              {onOpenMessenger && (
                <button
                  type="button"
                  onClick={onOpenMessenger}
                  className="grid h-6 w-6 place-items-center rounded bg-emerald-600 text-white shadow active:scale-95 md:h-7 md:w-7"
                  title="Tank Messenger"
                >
                  <MessageCircle className="h-3 w-3 md:h-3.5 md:w-3.5" />
                </button>
              )}

              {/* Mobile: full = minus, half = plus + minus. Hidden uses the
                  restore pill above, which contains only plus. */}
              <div className="flex items-center gap-1 lg:hidden">
                {mobileSize !== "full" && (
                  <button type="button" onClick={handlePlusClick} className="grid h-6 w-6 place-items-center rounded bg-[#1f2021] text-xs font-black text-white shadow active:scale-95" title="Expand Chat" aria-label="Expand chat">
                    <Plus className="h-3 w-3" />
                  </button>
                )}
                {mobileSize !== "hidden" && (
                  <button type="button" onClick={handleMinusClick} className="grid h-6 w-6 place-items-center rounded bg-[#1f2021] text-xs font-black text-white shadow active:scale-95" title="Collapse Chat" aria-label="Collapse chat">
                    <Minus className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Desktop has two states: open shows minus; closed is restored
                  by the reserved plus control outside this panel. */}
              <div className="hidden items-center gap-1 lg:flex">
                {desktopSize !== "hidden" && (
                  <button type="button" onClick={handleDesktopMinusClick} className="grid h-7 w-7 place-items-center rounded border border-red-950/70 bg-[#d94339] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.3)] transition hover:bg-[#ef5146] active:translate-y-px" title="Collapse Chat" aria-label="Collapse desktop chat">
                    <Minus className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {searchOpen && (
            <div className="flex shrink-0 items-center gap-2 border-b border-cyan-500/30 bg-[#111820] px-2.5 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") toggleSearch();
                }}
                placeholder={`Search ${chatScope === "global" ? "global chat" : roomTitle}...`}
                className="h-7 min-w-0 flex-1 rounded border border-cyan-500/30 bg-black/70 px-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
                aria-label="Chat search query"
              />
              <span className="shrink-0 font-mono text-[9px] uppercase text-cyan-300/70">
                {searchQuery.trim().length < 2
                  ? "2+ chars"
                  : `${searchResults.length} found`}
              </span>
              <button
                type="button"
                onClick={toggleSearch}
                className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Close chat search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* ═══════════ CHAT MESSAGE FEED ═══════════ */}
          <div
            ref={feedContainerRef}
            onScroll={handleScroll}
            className="tank-chat-feed custom-scrollbar relative flex-1 space-y-2 overflow-y-auto bg-gradient-to-b from-[#18191a] via-[#121314] to-[#0a0a0b] p-2.5 text-xs"
            style={{
              boxShadow: "inset 0 4px 12px rgba(0,0,0,0.8)",
            }}
          >
            {searchOpen && (
              <div className="absolute inset-0 z-30 overflow-y-auto bg-[#0b0d10]/[0.98] p-2.5 backdrop-blur-sm">
                {searchQuery.trim().length < 2 ? (
                  <div className="grid h-full place-items-center text-center text-xs font-bold text-slate-500">
                    Type at least 2 characters to search this room's saved chat.
                  </div>
                ) : searchError ? (
                  <div className="grid h-full place-items-center px-5 text-center text-xs font-bold text-red-400">
                    {searchError}
                  </div>
                ) : searchLoading && searchResults.length === 0 ? (
                  <div className="grid h-full place-items-center text-cyan-300">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="grid h-full place-items-center text-center text-xs font-bold text-slate-500">
                    No matching messages in this room.
                  </div>
                ) : (
                  <div className="space-y-2" role="list" aria-label="Chat search results">
                    {searchResults.map((result) => (
                      <article
                        key={result.id}
                        role="listitem"
                        className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5 shadow hover:border-cyan-500/30"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="truncate font-black text-cyan-300">
                            {result.user}
                          </span>
                          <time className="shrink-0 font-mono text-[9px] text-slate-500">
                            {formatLocalChatTime(undefined, result.createdAt)}
                          </time>
                        </div>
                        <p className="break-words text-xs leading-relaxed text-slate-100">
                          <TankChatBody text={result.body} />
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 📌 Pinned System Announcement Card Banner */}
            {pinnedMessage && (
              <div className="sticky top-0 z-20 mx-0.5 mb-2 overflow-hidden rounded-xl border border-cyan-500/50 bg-gradient-to-r from-cyan-950/90 via-black/95 to-cyan-950/90 p-3 shadow-2xl backdrop-blur-md duration-150 animate-in slide-in-from-top-2">
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-cyan-500/20 pb-1.5">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-cyan-500/30 bg-cyan-500/20 text-cyan-400">
                      <Pin className="h-3 w-3" />
                    </span>
                    <span className="truncate text-xs font-black uppercase tracking-wider text-cyan-300">
                      {pinnedMessage.title || "SYSTEM ANNOUNCEMENT"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {pinTimeRemaining && (
                      <span className="flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-950/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                        <Clock className="h-2.5 w-2.5" />
                        {pinTimeRemaining}
                      </span>
                    )}
                    {pinnedMessage.durationHours === "indefinite" && (
                      <span className="flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-950/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300/80">
                        📌 Pinned
                      </span>
                    )}
                    {isStaff && (
                      <button
                        type="button"
                        onClick={handleUnpin}
                        disabled={pinBusy}
                        className="rounded border border-red-500/30 bg-red-950/50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-400 transition hover:text-red-300 active:scale-95"
                      >
                        Unpin
                      </button>
                    )}
                  </div>
                </div>
                <p className="break-words text-xs font-medium leading-relaxed text-slate-100">
                  <TankChatBody text={pinnedMessage.body} />
                </p>
                <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] text-cyan-400/50">
                  <span>Pinned by {pinnedMessage.pinnedBy}</span>
                  <span>
                    {new Date(pinnedMessage.pinnedAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            )}

            {messages.length === 0 && (
              <div className="py-12 text-center text-xs font-bold text-slate-500">
                No messages yet. Broadcast something or roll /dice to start!
              </div>
            )}

            {messages
              .filter((msg) => {
                if (settings?.blockedUsers?.includes(msg.user)) return false;
                if (
                  settings?.hideEmotes &&
                  /^:[a-zA-Z0-9_-]+:$/.test(msg.body.trim())
                )
                  return false;
                return true;
              })
              .map((message) => {
                const userColor = getUserColor(message.user, message.nameColor);

                // Sender role, used for the name colour and the badge row
                // below. These were referenced but never declared, so any
                // message that reached the badge branch threw
                // "isMsgAdmin is not defined" and took the whole page down —
                // a render-time crash, invisible to a build that does not
                // typecheck this directory.
                const isMsgAdmin = message.role === "admin";
                const isMsgMod = message.role === "moderator";

                // 0a. Every in-game flavor/console message (Fishtank-style:
                // plain centered italic text, no pill, no border, no
                // background, no icon/badge cards — just floating text on
                // the feed). This used to be split across seven separate
                // "console card" blocks (rng_drop/item_use/item_flex/
                // dice_roll/coinflip/slots/roulette/crate_unbox), each with
                // its own bordered box, icon, and color treatment — visually
                // loud in a way fishtank's chat never is. All of their body
                // text is already a complete, self-describing sentence
                // ("admin rolls a 100-sided dice. It lands: 66", "🎰 admin
                // spun ... — No match.", etc. — see chatRngEvents.ts's
                // saveAndBroadcast callers), so no information is lost by
                // rendering them exactly like /me action text. Was
                // previously caught by the system/announcement pill below
                // (0b) before ever reaching its own styling, making it
                // permanently unreachable dead code — confirmed live
                // 2026-09-03 comparing against fishtank.live's own /me
                // rendering, which is exactly this: no box at all.
                if (
                  message.messageType === "action" ||
                  message.messageType === "rng_drop" ||
                  message.messageType === "item_use" ||
                  message.messageType === "item_flex" ||
                  message.messageType === "dice_roll" ||
                  message.messageType === "coinflip" ||
                  message.messageType === "slots" ||
                  message.messageType === "roulette" ||
                  message.messageType === "crate_unbox"
                ) {
                  return (
                    <div
                      key={message.id}
                      className="my-1.5 flex w-full select-text justify-center px-4 text-center duration-150 animate-in fade-in"
                    >
                      <p className="text-xs italic leading-relaxed text-slate-400/90">
                        <TankChatBody text={message.body} />
                      </p>
                    </div>
                  );
                }

                // 0b. Seamless In-Line System / Event / Console Message (Centered pill in the middle of feed)
                if (isSystemPillMessage(message)) {
                  return (
                    <div
                      key={message.id}
                      className="my-2 flex w-full select-text justify-center px-3 text-center duration-150 animate-in fade-in"
                    >
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#16181d]/90 px-3.5 py-1 text-center shadow-sm">
                        <p className="text-[11px] font-semibold leading-relaxed tracking-wide text-slate-300">
                          <TankChatBody text={message.body} />
                        </p>
                      </div>
                    </div>
                  );
                }

                const isMentionedToMe = Boolean(
                  (currentUserName &&
                    message.body
                      ?.toLowerCase()
                      .includes(`@${currentUserName.toLowerCase()}`)) ||
                  (message.replyToUserId &&
                    currentUserId &&
                    message.replyToUserId === currentUserId),
                );

                // 8. Regular Chat Message Row (with purple highlight when replied/mentioned)
                return (
                  <div
                    key={message.id}
                    className="group relative flex gap-2 rounded border border-white/5 bg-black/40 p-2 transition hover:bg-black/70"
                  >
                    {/* User Avatar with top-left Level Badge */}
                    {settings?.showAvatars !== false && (
                      <div className="relative shrink-0">
                        {/* Red Level Badge on top-left of Avatar (Exact match to screenshot) */}
                        {message.level !== undefined && (
                          <span className="py-0.2 absolute -left-1.5 -top-1.5 z-10 rounded border border-red-500/80 bg-black/95 px-1 text-[8px] font-black text-red-400 shadow-md">
                            {message.level}
                          </span>
                        )}

                        {/* "YOU" badge on top of avatar for own messages (Exact match to screenshot) */}
                        {(Boolean(
                          currentUserId && message.userId === currentUserId,
                        ) ||
                          Boolean(
                            currentUserName &&
                            message.user?.toLowerCase() ===
                              currentUserName?.toLowerCase(),
                          )) && (
                          <span className="absolute -top-1 right-0 z-10 rounded-sm border border-white/30 bg-black/80 px-1 py-0 text-[7px] font-black lowercase text-slate-200">
                            you
                          </span>
                        )}

                        {message.avatarUrl ? (
                          <img
                            src={message.avatarUrl}
                            alt=""
                            className="h-8 w-8 rounded border border-black/60 object-cover"
                          />
                        ) : (
                          <div
                            className="grid h-8 w-8 place-items-center rounded border border-black/60 text-xs font-bold text-white shadow"
                            style={{ backgroundColor: userColor }}
                          >
                            {message.user.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Content Column */}
                    <div className="min-w-0 flex-1">
                      {/* Name + Badges + Level */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Clan badge — colored by the Click's own banner
                            color when the sender has one, falling back to
                            the original red pill for Clicks created before
                            banner_color was wired through to chat. */}
                        {message.clanTag && (
                          <span
                            className="py-0.2 rounded border border-white/20 px-1.5 text-[9px] font-black uppercase text-white shadow-sm"
                            style={{
                              backgroundColor: message.clanColor || "#ff0033",
                              borderColor: message.clanColor ? `${message.clanColor}66` : undefined,
                            }}
                          >
                            {message.clanTag}
                          </span>
                        )}

                        {/* Admin Badge */}
                        {isMsgAdmin && (
                          <span className="py-0.2 flex items-center gap-0.5 rounded bg-gradient-to-r from-amber-500 to-orange-500 px-1 text-[9px] font-black uppercase text-black shadow-sm">
                            <Crown className="h-2.5 w-2.5" /> ADMIN
                          </span>
                        )}

                        {/* Moderator Badge */}
                        {isMsgMod && (
                          <span className="py-0.2 flex items-center gap-0.5 rounded bg-gradient-to-r from-emerald-500 to-cyan-500 px-1 text-[9px] font-black uppercase text-black shadow-sm">
                            <Shield className="h-2.5 w-2.5" /> MOD
                          </span>
                        )}

                        <span
                          className="font-black tracking-tight"
                          style={{
                            color: isMsgAdmin
                              ? "#ffb020"
                              : isMsgMod
                                ? "#39ff6a"
                                : userColor,
                            fontFamily: ACTIVE_THEME.fonts.label,
                          }}
                        >
                          {message.user}
                        </span>
                      </div>

                      {message.replyToMessageId && (
                        <div className="mt-1 rounded border-l-2 border-orange-400 bg-white/5 px-2 py-1 text-[10px] text-slate-400">
                          <span className="font-black text-orange-300">
                            Reply to {message.replyToUserName || "member"}
                          </span>
                          {message.replyPreview && (
                            <span className="ml-1 line-clamp-1">
                              {message.replyPreview}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Message Body with emoji parser */}
                      <div className="tank-chat-body mt-0.5 break-words text-xs font-medium leading-5 text-slate-200">
                        <TankChatBody text={message.body} />
                      </div>

                      <div className="mt-1 flex flex-wrap gap-1">
                        {(message.reactions ?? []).map((entry) => (
                          <button
                            key={entry.reaction}
                            type="button"
                            onClick={() =>
                              onToggleReaction(message.id, entry.reaction)
                            }
                            className={`rounded-full border px-1.5 py-0.5 text-[10px] ${entry.reactedByMe ? "border-orange-400 bg-orange-500/20" : "border-white/15 bg-black/40"}`}
                          >
                            {
                              {
                                love: "❤️",
                                laugh: "😂",
                                wow: "😮",
                                fire: "🔥",
                                skull: "💀",
                              }[entry.reaction]
                            }{" "}
                            {entry.count}
                          </button>
                        ))}
                      </div>

                      {/* Timestamp */}
                      <div className="mt-0.5 flex justify-end">
                        <span className="text-[10px] font-semibold text-[#6e737b]">
                          {formatLocalChatTime(message.time, message.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Message Actions on Hover/Tap (Reply first, Admin controls tucked away) */}
                    <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
                      {/* 1. Reply Button (Primary action for everyone) */}
                      <button
                        type="button"
                        onClick={() => onReply(message)}
                        title={`Reply to ${message.user}`}
                        className="hidden items-center gap-1 rounded border border-white/20 bg-black/80 px-2 py-0.5 text-[10px] font-bold text-slate-200 shadow-lg transition hover:bg-orange-500 hover:text-black active:scale-95 group-hover:flex"
                      >
                        <CornerUpLeft className="h-3 w-3" />
                        <span>Reply</span>
                      </button>

                      {/* 2. More Options Menu Toggle (...) */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveMenuMessageId(
                              activeMenuMessageId === message.id
                                ? null
                                : message.id,
                            )
                          }
                          title="More options"
                          className={`grid h-5 w-5 place-items-center rounded border border-white/15 bg-black/70 text-slate-300 shadow-lg transition hover:bg-white/20 hover:opacity-100 ${activeMenuMessageId === message.id ? "opacity-100" : "opacity-45"}`}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>

                        {/* Dropdown Menu */}
                        {activeMenuMessageId === message.id && (
                          <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border border-black/80 bg-[#16181b]/95 p-1.5 shadow-2xl backdrop-blur-md duration-100 animate-in fade-in zoom-in-95">
                            {signedIn && (
                              <div className="mb-1 flex items-center justify-between gap-1 border-b border-white/10 px-1 pb-1.5">
                                {(
                                  [
                                    ["love", "❤️"],
                                    ["laugh", "😂"],
                                    ["wow", "😮"],
                                    ["fire", "🔥"],
                                    ["skull", "💀"],
                                  ] as const
                                ).map(([reaction, emoji]) => (
                                  <button
                                    key={reaction}
                                    type="button"
                                    onClick={() => {
                                      onToggleReaction(message.id, reaction);
                                      setActiveMenuMessageId(null);
                                    }}
                                    className="grid h-7 w-7 place-items-center rounded text-sm hover:bg-white/10 active:scale-90"
                                    title={`React with ${reaction}`}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                            {/* Reply Action */}
                            <button
                              type="button"
                              onClick={() => {
                                onReply(message);
                                setActiveMenuMessageId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs font-bold text-white transition hover:bg-white/10"
                            >
                              <CornerUpLeft className="h-3.5 w-3.5 text-orange-400" />
                              <span>Reply to @{message.user}</span>
                            </button>

                            {/* Copy Text Action */}
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(message.body);
                                setActiveMenuMessageId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs font-bold text-slate-300 transition hover:bg-white/10"
                            >
                              <Copy className="h-3.5 w-3.5 text-slate-400" />
                              <span>Copy Text</span>
                            </button>

                            {/* Highly Restricted Moderation Tools at the Very Bottom behind a Toggle */}
                            {isStaff && (
                              <div className="mt-1 border-t border-white/10 pt-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowModToolsForId(
                                      showModToolsForId === message.id
                                        ? null
                                        : message.id,
                                    )
                                  }
                                  className="flex w-full items-center justify-between rounded px-2 py-1 text-[11px] font-black uppercase text-amber-400 transition hover:bg-amber-950/40"
                                >
                                  <span className="flex items-center gap-1.5">
                                    <Shield className="h-3 w-3" /> Mod Tools
                                  </span>
                                  <ChevronRight
                                    className={`h-3 w-3 transition-transform ${
                                      showModToolsForId === message.id
                                        ? "rotate-90"
                                        : ""
                                    }`}
                                  />
                                </button>

                                {showModToolsForId === message.id && (
                                  <div className="mt-1 space-y-0.5 rounded border border-red-500/20 bg-black/60 p-1 animate-in slide-in-from-top-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleDeleteMessage(message.id);
                                        setActiveMenuMessageId(null);
                                      }}
                                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] font-bold text-red-300 transition hover:bg-red-950/80"
                                    >
                                      <Trash2 className="h-3 w-3 text-red-400" />
                                      <span>Delete Message</span>
                                    </button>

                                    {message.userId && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleTimeoutUser(
                                              message.userId,
                                              message.user,
                                            );
                                            setActiveMenuMessageId(null);
                                          }}
                                          className="text-yellow-300 hover:bg-yellow-950/80 flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] font-bold transition"
                                        >
                                          <Clock className="text-yellow-400 h-3 w-3" />
                                          <span>5m Timeout</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleBanUser(
                                              message.userId,
                                              message.user,
                                            );
                                            setActiveMenuMessageId(null);
                                          }}
                                          className="flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] font-bold text-red-400 transition hover:bg-red-950/80"
                                        >
                                          <Ban className="h-3 w-3 text-red-500" />
                                          <span>Ban User</span>
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            <div ref={messagesEndRef} />

            {/* Floating scroll-to-bottom control */}
            {isScrolledUp && (
              <div className="sticky inset-x-2 bottom-2 z-30 flex flex-col items-center gap-1.5 duration-200 animate-in slide-in-from-bottom-2">
                <button
                  type="button"
                  onClick={handleScrollToBottom}
                  className="w-[92%] max-w-sm rounded-lg border border-white/40 bg-gradient-to-r from-[#ff5a36] via-[#f24c27] to-[#e64019] px-4 py-2.5 text-center text-xs font-black tracking-wide text-white shadow-[0_4px_16px_rgba(255,80,40,0.6)] transition active:scale-95"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  Scroll to Bottom
                </button>
              </div>
            )}
          </div>

          {/* Error bar */}
          {chatError && (
            <div className="border-t border-black/40 bg-red-950/80 px-3 py-1 text-[11px] font-bold text-red-200">
              {chatError}
            </div>
          )}

          {/* ═══════════ BOTTOM INPUT STRIP ═══════════ */}
          <div className="relative shrink-0 border-t border-black/50 bg-[#1f2021] px-3 py-2 sm:px-8 sm:py-3">
            {/* 1. Emoji Picker Popup */}
            {emojiPickerOpen && (
              <div className="absolute bottom-full left-2 right-2 z-50 mb-2 max-h-56 overflow-y-auto rounded-xl border border-white/20 bg-black/95 p-3 shadow-2xl backdrop-blur-md duration-150 animate-in slide-in-from-bottom-2">
                <div className="sticky top-0 z-10 mb-2 flex items-center justify-between border-b border-white/10 bg-black/95 pb-2">
                  <span className="flex items-center gap-1.5 text-xs font-black uppercase text-orange-400">
                    <Smile className="h-4 w-4" /> Tank Emojis (
                    {TANK_EMOJI_NAMES.length})
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    Click to insert
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-10">
                  {TANK_EMOJI_NAMES.map((name) => {
                    const url = `https://db.unenter.live/storage/v1/object/public/tank-emoji/32/emotion_${name}.png`;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleSelectEmoji(`emotion_${name}`)}
                        className="group relative flex aspect-square items-center justify-center rounded-lg border border-transparent bg-white/5 p-1 transition hover:border-orange-400/50 hover:bg-orange-500/20 active:scale-95"
                        title={`:${name}:`}
                      >
                        <img
                          src={url}
                          alt={name}
                          className="h-7 w-7 object-contain transition-transform group-hover:scale-125"
                          loading="lazy"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. RNG Mini-Games Quick Launcher Popup */}
            {rngMenuOpen && (
              <div className="border-yellow-500/40 absolute bottom-full left-2 right-2 z-50 mb-2 rounded-lg border bg-black/95 p-2.5 shadow-2xl backdrop-blur-md duration-150 animate-in slide-in-from-bottom-2">
                <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
                  <span className="text-yellow-400 flex items-center gap-1.5 text-xs font-black uppercase">
                    <Dices className="h-4 w-4" /> Live RNG Mini-Games
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    1-Click Chat Action
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => handleTriggerRngCommand("/roll 100")}
                    className="flex items-center gap-2 rounded border border-purple-500/30 bg-purple-950/40 p-2 text-left transition hover:bg-purple-900/60 active:scale-95"
                  >
                    <span className="text-lg">🎲</span>
                    <div>
                      <p className="text-xs font-black text-white">Roll d100</p>
                      <p className="text-[9px] text-purple-300">
                        Test your roll
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTriggerRngCommand("/flip heads 10")}
                    className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-950/40 p-2 text-left transition hover:bg-amber-900/60 active:scale-95"
                  >
                    <span className="text-lg">🪙</span>
                    <div>
                      <p className="text-xs font-black text-white">
                        Coinflip (10T)
                      </p>
                      <p className="text-[9px] text-amber-300">
                        2x Token Payout
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTriggerRngCommand("/slots 20")}
                    className="border-yellow-500/30 bg-yellow-950/40 hover:bg-yellow-900/60 flex items-center gap-2 rounded border p-2 text-left transition active:scale-95"
                  >
                    <span className="text-lg">🎰</span>
                    <div>
                      <p className="text-xs font-black text-white">
                        Spin Slots (20T)
                      </p>
                      <p className="text-yellow-300 text-[9px]">
                        Up to 50x + Items
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTriggerRngCommand("/unbox")}
                    className="flex items-center gap-2 rounded border border-cyan-500/30 bg-cyan-950/40 p-2 text-left transition hover:bg-cyan-900/60 active:scale-95"
                  >
                    <span className="text-lg">📦</span>
                    <div>
                      <p className="text-xs font-black text-white">
                        Mystery Crate
                      </p>
                      <p className="text-[9px] text-cyan-300">
                        Unbox rare loot
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTriggerRngCommand("/roulette")}
                    className="flex items-center gap-2 rounded border border-red-500/30 bg-red-950/40 p-2 text-left transition hover:bg-red-900/60 active:scale-95"
                  >
                    <span className="text-lg">🔫</span>
                    <div>
                      <p className="text-xs font-black text-white">
                        Tank Roulette
                      </p>
                      <p className="text-[9px] text-red-300">
                        5/6 Win or Timeout
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTriggerRngCommand("/fart")}
                    className="flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-950/40 p-2 text-left transition hover:bg-emerald-900/60 active:scale-95"
                  >
                    <span className="text-lg">💨</span>
                    <div>
                      <p className="text-xs font-black text-white">
                        Fart Action
                      </p>
                      <p className="text-[9px] text-emerald-300">
                        +20 XP Flavor
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRngMenuOpen(false);
                      setTavernOverlayOpen(true);
                    }}
                    className="flex items-center gap-2 rounded border border-amber-600/30 bg-amber-950/40 p-2 text-left transition hover:bg-amber-900/60 active:scale-95"
                  >
                    <span className="text-lg">🍺</span>
                    <div>
                      <p className="text-xs font-black text-white">
                        Tavern
                      </p>
                      <p className="text-[9px] text-amber-400">
                        Bartender minigame
                      </p>
                    </div>
                  </button>

                </div>
              </div>
            )}

            {replyTarget && (
              <div className="mb-1 flex items-center justify-between rounded border border-orange-400/30 bg-orange-950/30 px-2 py-1 text-[10px] text-slate-300">
                <span className="min-w-0 truncate">
                  <strong className="text-orange-300">
                    Replying to {replyTarget.user}
                  </strong>{" "}
                  · {replyTarget.body}
                </span>
                <button
                  type="button"
                  onClick={() => onReply(null)}
                  className="ml-2 text-slate-400 hover:text-white"
                  aria-label="Cancel reply"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {extractImageIdsFromText(chatInput).length > 0 && (
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-950/40 px-2 py-1 text-xs">
                <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-cyan-300">
                  <ImageIcon className="h-3 w-3" />
                  Attached Preview:
                </span>
                {extractImageIdsFromText(chatInput).map((id) => (
                  <div
                    key={id}
                    className="flex items-center gap-1.5 rounded border border-cyan-500/40 bg-black/70 px-1.5 py-0.5 shadow-sm"
                  >
                    <img
                      src={`https://db.unenter.live/storage/v1/object/public/tank-chat-attachments/attachments/${id}.webp`}
                      alt=""
                      className="h-5 w-5 rounded border border-white/20 object-cover"
                      onError={(e) => {
                        e.currentTarget.src = `https://db.unenter.live/storage/v1/object/public/tank-chat-attachments/attachments/${id}.png`;
                      }}
                    />
                    <span className="font-mono text-[9px] font-bold text-cyan-300">
                      #{id}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const clean = chatInput
                          .replace(
                            new RegExp(`\\[image(?::)?${id}\\]`, "g"),
                            "",
                          )
                          .replace(/\s+/g, " ")
                          .trim();
                        onChatInputChange(clean);
                      }}
                      className="ml-0.5 text-slate-400 transition hover:text-red-400"
                      title="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {extractGifTokensFromText(chatInput).length > 0 && (
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 rounded border border-purple-500/40 bg-purple-950/40 px-2 py-1 text-xs">
                <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-purple-300">
                  <span className="py-0.2 rounded bg-gradient-to-r from-purple-600 to-pink-500 px-1 text-[8px] text-white">
                    GIF
                  </span>
                  Attached GIF:
                </span>
                {extractGifTokensFromText(chatInput).map((gifToken) => {
                  const isDirect = gifToken.startsWith("http");
                  const gifThumb = isDirect
                    ? gifToken
                    : `https://media.giphy.com/media/${gifToken}/200.webp`;
                  return (
                    <div
                      key={gifToken}
                      className="flex items-center gap-1.5 rounded border border-purple-500/40 bg-black/70 px-1.5 py-0.5 shadow-sm"
                    >
                      <img
                        src={gifThumb}
                        alt=""
                        className="h-5 w-5 rounded border border-white/20 object-cover"
                        onError={(e) => {
                          if (!isDirect)
                            e.currentTarget.src = `https://media.giphy.com/media/${gifToken}/200.gif`;
                        }}
                      />
                      <span className="font-mono text-[9px] font-bold text-purple-300">
                        GIPHY
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const clean = chatInput
                            .replace(
                              new RegExp(`\\[gif:${gifToken}\\]`, "g"),
                              "",
                            )
                            .replace(/\s+/g, " ")
                            .trim();
                          onChatInputChange(clean);
                        }}
                        className="ml-0.5 text-slate-400 transition hover:text-red-400"
                        title="Remove GIF"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <form onSubmit={handleChatSubmit} className="flex flex-col gap-1.5">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageFile(file);
                }}
              />

              {/* Accessory toolbar — full-width row of tool buttons */}
              <div className="flex flex-wrap items-center gap-1">
                {/* 1. Attach Image */}
                <ConsoleButton
                  variant="gray"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={!signedIn || uploadingImage}
                  ariaLabel="Attach Image"
                  className="!h-8 !px-2.5 text-cyan-400"
                  title="Attach Ephemeral Image (3h Lifespan)"
                >
                  {uploadingImage ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5 text-cyan-400" />
                  )}
                </ConsoleButton>

                {/* 2. GIF Picker */}
                <ConsoleButton
                  variant="gray"
                  onClick={() => {
                    setGifPickerOpen(true);
                    setEmojiPickerOpen(false);
                    setRngMenuOpen(false);
                  }}
                  disabled={!signedIn}
                  ariaLabel="GIF Picker"
                  className="!h-8 !px-2"
                  title="Search & Attach GIPHY GIFs"
                >
                  <span className="rounded bg-gradient-to-r from-purple-600 to-pink-500 px-1.5 py-0.5 text-[9px] font-black text-white shadow-sm">
                    GIF
                  </span>
                </ConsoleButton>

                {/* 3. Emoji Picker */}
                <ConsoleButton
                  variant="gray"
                  onClick={() => {
                    setEmojiPickerOpen((prev) => !prev);
                    setRngMenuOpen(false);
                  }}
                  disabled={!signedIn}
                  ariaLabel="Emoji Picker"
                  className="!h-8 !px-2.5"
                >
                  <Smile className="h-3.5 w-3.5" />
                </ConsoleButton>

                {/* 4. RNG Games */}
                <ConsoleButton
                  variant="orange"
                  onClick={() => {
                    setRngMenuOpen((prev) => !prev);
                    setEmojiPickerOpen(false);
                  }}
                  disabled={!signedIn}
                  ariaLabel="RNG Mini-Games"
                  className="!h-8 !px-2.5 font-black"
                  title="RNG Mini-Games (Dice, Coinflip, Slots, Roulette, Crates)"
                >
                  <Dices className="h-3.5 w-3.5" />
                </ConsoleButton>

                {/* 5. Super Chat — paid self-service pin, everyone */}
                <ConsoleButton
                  variant="gray"
                  onClick={() => {
                    setSuperChatOpen(true);
                    setEmojiPickerOpen(false);
                    setRngMenuOpen(false);
                  }}
                  disabled={!signedIn}
                  ariaLabel="Super Chat"
                  className="!h-8 !px-2.5 text-amber-400"
                  title="Super Chat — pay tokens to pin your message"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </ConsoleButton>

                {/* 6. Staff Pin (staff only) */}
                {isStaff && (
                  <ConsoleButton
                    variant="gray"
                    onClick={() => {
                      setPinModalOpen(true);
                      setEmojiPickerOpen(false);
                      setRngMenuOpen(false);
                    }}
                    disabled={!signedIn}
                    ariaLabel="Pin System Announcement"
                    className="!h-8 !px-2.5 text-cyan-400"
                    title="Pin System Announcement (3h, 12h, 24h, or Indefinite)"
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </ConsoleButton>
                )}
              </div>

              {mentionSuggestions.length > 0 && (
                <div
                  role="listbox"
                  aria-label="Mention suggestions"
                  className="overflow-hidden rounded border border-cyan-500/40 bg-[#111820] shadow-xl"
                >
                  <div className="border-b border-white/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-cyan-400/70">
                    Mention a room participant
                  </div>
                  {mentionSuggestions.map((candidate, index) => (
                    <button
                      key={candidate.userId || candidate.name}
                      type="button"
                      role="option"
                      aria-selected={index === mentionIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseMention(index)}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-bold text-white ${
                        index === mentionIndex
                          ? "bg-cyan-500/25 text-cyan-200"
                          : "hover:bg-white/10"
                      }`}
                    >
                      <span className="text-cyan-400">@</span>
                      <span className="truncate">{candidate.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Input row — full width so long messages are readable */}
              <div className="flex items-center gap-1.5">
                <TankChatInputField
                  inputRef={chatInputRef}
                  value={chatInput}
                  onChange={handleChatInputChangeWithMentions}
                  onKeyDown={handleMentionKeyDown}
                  onPasteImage={handleImageFile}
                  placeholder={
                    signedIn
                      ? PLACEHOLDER_PROMPTS[placeholderIndex]
                      : "Sign in to join chat..."
                  }
                  disabled={!signedIn || uploadingImage}
                  className="flex-1"
                />
                <ConsoleButton
                  variant="red"
                  type="submit"
                  disabled={sending || !signedIn || !chatInput.trim()}
                  ariaLabel="Send Message"
                  className="!h-9 shrink-0 !px-3"
                >
                  <Send className="h-4 w-4" />
                </ConsoleButton>
              </div>
            </form>
          </div>

          {/* Tavern — a full takeover of the chat panel's own bounds only,
              never the camera feeds or rest of the page (ChromePanel's root
              is already `relative`, this is `absolute inset-0` within it).
              Opened from the RNG mini-games/dice menu, closed like any
              other in-chat overlay. */}
          {tavernOverlayOpen && (
            <TavernPanel
              signedIn={signedIn}
              currentUserId={currentUserId}
              onClose={() => setTavernOverlayOpen(false)}
              onOpenSignIn={() => onOpenSignIn?.()}
            />
          )}
        </ChromePanel>

        {/* Super Chat — paid self-service pin. Portaled to <body>: rendered
            in place, `fixed inset-0` would be contained by whatever
            transformed ancestor wraps the chat widget (Next.js's animation
            wrappers among them) instead of the real viewport, squashing the
            modal into the chat panel's own box instead of centering on
            screen. PrizeMachineModal/TankMessengerOverlay don't need this —
            they're already rendered at TankExperience's top level. */}
        {superChatOpen &&
          typeof document !== "undefined" &&
          createPortal(
            <SuperChatModal
              isOpen={superChatOpen}
              onClose={() => setSuperChatOpen(false)}
              roomId={activeRoomKey}
              userTokens={liveUserTokens}
              onSent={(newBalance) => {
                setLiveUserTokens(newBalance);
                void loadPinnedMessage();
              }}
            />,
            document.body,
          )}

        {/* GIPHY GIF Picker Modal */}
        <GiphyPickerPopover
          isOpen={gifPickerOpen}
          onClose={() => setGifPickerOpen(false)}
          onSelectGif={handleSelectGif}
        />
      </div>
    </>
  );
}
export default ChatConsolePanel;
