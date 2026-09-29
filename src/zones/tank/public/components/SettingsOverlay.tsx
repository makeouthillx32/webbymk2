"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Palette,
  Volume2,
  MessageSquare,
  X,
  Sparkles,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Layers,
  Box,
  Paintbrush,
  Square,
  Zap,
  Check,
} from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import {
  ACTIVE_THEME,
  TANK_BACKGROUND_THEMES,
  getTankBackgroundTheme,
  TANK_DESIGN_THEMES,
  resolveTankChromeTheme,
  TANK_TEXTURE_PATTERNS,
  type TankDesignTheme,
  type TankThemeCustomOverrides,
  type TankThemeTextures,
  type TankThemeColors,
  type TankThemeBorders,
  type TankThemeAnimations,
} from "../../theme";
import { safeStorage } from "@/lib/safeStorage";

export type TankSettings = {
  // Theme & Textures (Wave 1-3 Token Architecture)
  selectedPattern: string; // pattern ID or 'light-aluminum' default (backward compatible)
  selectedBackgroundTheme?: string; // preset ID e.g. 'tank-arcade-blue'
  animationsEnabled: boolean;
  customTheme?: TankThemeCustomOverrides;
  // Sound
  sfxVolume: number; // 0 to 100
  mentionSound: boolean;
  ttsEnabled: boolean;
  // Chat
  babyMode: boolean;
  hideUsedItems: boolean;
  hideEmotes: boolean;
  /**
   * Show sender avatars in chat. Read by ChatConsolePanel as
   * `showAvatars !== false`, so an older saved settings object with no such
   * key keeps avatars on rather than silently hiding them.
   */
  showAvatars: boolean;
  blockedUsers: string[];
  filterWords: string[];
};

export const DEFAULT_SETTINGS: TankSettings = {
  selectedPattern: "light-aluminum",
  selectedBackgroundTheme: "tank-arcade-blue",
  animationsEnabled: true,
  sfxVolume: 80,
  mentionSound: true,
  ttsEnabled: true,
  babyMode: false,
  hideUsedItems: false,
  hideEmotes: false,
  showAvatars: true,
  blockedUsers: [],
  filterWords: [],
};

export const PATTERNS_CATALOG = TANK_TEXTURE_PATTERNS;

export type SettingsOverlayProps = {
  onClose: () => void;
  onSettingsSaved?: (settings: TankSettings) => void;
  currentSettings?: TankSettings;
};

type ThemeSubTab = "presets" | "textures" | "colors" | "borders" | "motion";

const TEXTURE_SLOTS: { id: keyof TankThemeTextures; label: string; desc: string }[] = [
  { id: "background", label: "Background Wallpaper", desc: "Full viewport wallpaper texture" },
  { id: "panel", label: "Outer Panel", desc: "Chassis & outer ChromePanel surfaces" },
  { id: "innerPanel", label: "Inner Camera Bay", desc: "Inset camera bay & video backdrops" },
  { id: "darkPanel", label: "Dark Bay / Chat", desc: "Chat feed container & terminal readouts" },
  { id: "metal", label: "Metal Plates & Bevels", desc: "Hardware plates & trim bezel trims" },
];

const COLOR_TOKENS: { key: keyof TankThemeColors; label: string; desc: string }[] = [
  { key: "primary", label: "Primary Accent", desc: "Interactive buttons & keyframes" },
  { key: "secondary", label: "Chassis Tone", desc: "Main console body & frames" },
  { key: "tertiary", label: "Subtle Highlight", desc: "Bevel borders & subtle dividing lines" },
  { key: "background", label: "Canvas / Viewport", desc: "Root canvas background & iOS status bar" },
  { key: "dark", label: "Recessed Dark", desc: "Deep chat & telemetry backdrops" },
  { key: "light", label: "Surface Light", desc: "Card surfaces & light bevels" },
  { key: "link", label: "Doorway / Link", desc: "Spatial doorways & interactive anchors" },
  { key: "danger", label: "Alert / REC", desc: "Recording indicator & urgent alerts" },
  { key: "lightText", label: "Light Text", desc: "High-contrast text on dark containers" },
  { key: "darkText", label: "Dark Text", desc: "Industrial stamped text on metal surfaces" },
];

const RADIUS_OPTIONS = [
  { label: "Sharp (4px)", value: "0.25rem" },
  { label: "Tactile (8px)", value: "0.5rem" },
  { label: "Rounded (12px)", value: "0.75rem" },
  { label: "Pill (16px)", value: "1rem" },
];

const BORDER_WIDTH_OPTIONS = [
  { label: "Thin (1px)", value: "1px" },
  { label: "Standard (2px)", value: "2px" },
  { label: "Heavy (3px)", value: "3px" },
  { label: "Chunky (4px)", value: "4px" },
];

const BORDER_STYLE_OPTIONS: { label: string; value: "outset" | "solid" | "groove" | "double" }[] = [
  { label: "Outset Bevel", value: "outset" },
  { label: "Solid Frame", value: "solid" },
  { label: "Groove Inset", value: "groove" },
  { label: "Double Rim", value: "double" },
];

const DURATION_OPTIONS = [
  { label: "Fast (100ms)", value: "100ms" },
  { label: "Balanced (150ms)", value: "150ms" },
  { label: "Cinematic (250ms)", value: "250ms" },
];

const GLOW_OPTIONS = [
  { label: "Subtle", value: "0 0 8px rgba(6, 182, 212, 0.4)" },
  { label: "Moderate", value: "0 0 12px rgba(6, 182, 212, 0.6)" },
  { label: "Intense", value: "0 0 20px rgba(6, 182, 212, 0.85)" },
  { label: "None", value: "none" },
];

export function SettingsOverlay({ onClose, onSettingsSaved, currentSettings }: SettingsOverlayProps) {
  const [activeTab, setActiveTab] = useState<"theme" | "sound" | "chat">("theme");
  const [themeSubTab, setThemeSubTab] = useState<ThemeSubTab>("presets");
  const [activeTextureSlot, setActiveTextureSlot] = useState<keyof TankThemeTextures>("panel");
  const [settings, setSettings] = useState<TankSettings>(() => currentSettings || DEFAULT_SETTINGS);
  const [filterInput, setFilterInput] = useState("");

  // Keep in sync with parent settings
  useEffect(() => {
    if (currentSettings) {
      setSettings(currentSettings);
    } else {
      try {
        const saved = safeStorage.getItem("tank_settings_v1");
        if (saved) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
        }
      } catch {}
    }
  }, [currentSettings]);

  // Compute live resolved theme combining base preset and granular overrides
  const effectiveTheme: TankDesignTheme = useMemo(() => {
    return resolveTankChromeTheme(settings.customTheme);
  }, [settings.customTheme]);

  const commitSettings = (updated: TankSettings) => {
    setSettings(updated);
    if (onSettingsSaved) onSettingsSaved(updated);
    try {
      safeStorage.setItem("tank_settings_v1", JSON.stringify(updated));
    } catch {}
  };

  const handleSave = () => {
    commitSettings(settings);
    onClose();
  };

  const handleReset = () => {
    commitSettings(DEFAULT_SETTINGS);
    try {
      safeStorage.removeItem("tank_settings_v1");
    } catch {}
  };

  const handleSelectBackgroundTheme = (themeId: string) => {
    const updated: TankSettings = {
      ...settings,
      selectedBackgroundTheme: themeId,
    };
    commitSettings(updated);
  };

  const handleResetCustomTheme = () => {
    const updated: TankSettings = {
      ...settings,
      customTheme: undefined,
    };
    commitSettings(updated);
  };

  const handleSelectTextureForSlot = (slot: keyof TankThemeTextures, patternUrl: string | null) => {
    const currentCustom = settings.customTheme || {};
    const currentTextures = currentCustom.textures || {};
    const updatedTextures: Partial<TankThemeTextures> = {
      ...currentTextures,
      [slot]: patternUrl ?? "none",
    };
    const updatedCustom: TankThemeCustomOverrides = {
      ...currentCustom,
      textures: updatedTextures,
    };

    // If panel texture changed, also sync backward-compatible selectedPattern
    const matchedPattern = PATTERNS_CATALOG.find((p) => p.url === patternUrl);
    const updated: TankSettings = {
      ...settings,
      customTheme: updatedCustom,
      ...(slot === "panel" ? { selectedPattern: matchedPattern?.id || "light-aluminum" } : {}),
    };
    commitSettings(updated);
  };

  const handleUpdateColor = (key: keyof TankThemeColors, hexValue: string) => {
    const currentCustom = settings.customTheme || {};
    const currentColors = currentCustom.colors || {};
    const updatedColors: Partial<TankThemeColors> = {
      ...currentColors,
      [key]: hexValue,
    };
    const updatedCustom: TankThemeCustomOverrides = {
      ...currentCustom,
      colors: updatedColors,
      ...(key === "background" ? { statusBarHex: hexValue } : {}),
    };
    const updated: TankSettings = {
      ...settings,
      customTheme: updatedCustom,
    };
    commitSettings(updated);
  };

  const handleUpdateBorder = (key: keyof TankThemeBorders, val: any) => {
    const currentCustom = settings.customTheme || {};
    const currentBorders = currentCustom.borders || {};
    const updatedBorders: Partial<TankThemeBorders> = {
      ...currentBorders,
      [key]: val,
    };
    const updatedCustom: TankThemeCustomOverrides = {
      ...currentCustom,
      borders: updatedBorders,
    };
    const updated: TankSettings = {
      ...settings,
      customTheme: updatedCustom,
    };
    commitSettings(updated);
  };

  const handleUpdateAnimation = (key: keyof TankThemeAnimations, val: any) => {
    const currentCustom = settings.customTheme || {};
    const currentAnimations = currentCustom.animations || {};
    const updatedAnimations: Partial<TankThemeAnimations> = {
      ...currentAnimations,
      [key]: val,
    };
    const updatedCustom: TankThemeCustomOverrides = {
      ...currentCustom,
      animations: updatedAnimations,
    };
    const updated: TankSettings = {
      ...settings,
      animationsEnabled: key === "enabled" ? Boolean(val) : settings.animationsEnabled,
      customTheme: updatedCustom,
    };
    commitSettings(updated);
  };

  const addFilterWord = () => {
    const word = filterInput.trim().toLowerCase();
    if (!word || settings.filterWords.includes(word)) return;
    setSettings({
      ...settings,
      filterWords: [...settings.filterWords, word],
    });
    setFilterInput("");
  };

  const removeFilterWord = (word: string) => {
    setSettings({
      ...settings,
      filterWords: settings.filterWords.filter((w) => w !== word),
    });
  };

  const hasCustomOverrides = Boolean(
    settings.customTheme &&
      Object.keys(settings.customTheme).some((k) => {
        const val = (settings.customTheme as any)[k];
        return val && Object.keys(val).length > 0;
      }),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg shadow-[0_12px_40px_rgba(0,0,0,0.9)]"
      >
        <ChromePanel withScrews className="w-full max-h-[92vh] flex flex-col overflow-hidden">
          {/* Header with Title and Close Button */}
          <div className="relative flex items-center justify-between pb-3 border-b border-black/40 px-1">
            <div className="flex items-center gap-2">
              <h2
                className="text-sm font-black uppercase tracking-wider text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                Settings Console
              </h2>
              {hasCustomOverrides && (
                <span className="rounded bg-cyan-950/80 border border-cyan-500/50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-cyan-300">
                  Custom Swatch Active
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-6 w-6 place-items-center rounded bg-[#e85a4f] text-white shadow transition-transform hover:scale-105 active:scale-95 border border-white/40"
            >
              <X className="h-3.5 w-3.5 stroke-[3]" />
            </button>
          </div>

          {/* 3 Top Category Tabs: Theme, Sound, Chat */}
          <div className="flex gap-2 pt-3 pb-2">
            <ConsoleButton
              variant={activeTab === "theme" ? "orange" : "gray"}
              active={activeTab === "theme"}
              onClick={() => setActiveTab("theme")}
              className="flex-1 !py-1.5"
            >
              <Palette className="h-3.5 w-3.5 mr-1 inline" />
              Theme Studio
            </ConsoleButton>
            <ConsoleButton
              variant={activeTab === "sound" ? "orange" : "gray"}
              active={activeTab === "sound"}
              onClick={() => setActiveTab("sound")}
              className="flex-1 !py-1.5"
            >
              <Volume2 className="h-3.5 w-3.5 mr-1 inline" />
              Sound
            </ConsoleButton>
            <ConsoleButton
              variant={activeTab === "chat" ? "orange" : "gray"}
              active={activeTab === "chat"}
              onClick={() => setActiveTab("chat")}
              className="flex-1 !py-1.5"
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1 inline" />
              Chat
            </ConsoleButton>
          </div>

          {/* Scrollable Content Inset Box */}
          <div className="flex-1 overflow-y-auto max-h-[58vh] rounded-lg bg-black/60 p-3 border border-black/80 shadow-inner backdrop-blur-sm space-y-3.5 my-2">
            {/* ═══════════ THEME TAB ═══════════ */}
            {activeTab === "theme" && (
              <div className="space-y-3.5">
                {/* Domain Pill Bar */}
                <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
                  <button
                    type="button"
                    onClick={() => setThemeSubTab("presets")}
                    className={`flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${
                      themeSubTab === "presets"
                        ? "bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                        : "bg-white/5 text-slate-300 hover:bg-white/15"
                    }`}
                  >
                    <Layers className="h-3 w-3" />
                    Presets
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeSubTab("textures")}
                    className={`flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${
                      themeSubTab === "textures"
                        ? "bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                        : "bg-white/5 text-slate-300 hover:bg-white/15"
                    }`}
                  >
                    <Box className="h-3 w-3" />
                    Textures
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeSubTab("colors")}
                    className={`flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${
                      themeSubTab === "colors"
                        ? "bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                        : "bg-white/5 text-slate-300 hover:bg-white/15"
                    }`}
                  >
                    <Paintbrush className="h-3 w-3" />
                    Colors
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeSubTab("borders")}
                    className={`flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${
                      themeSubTab === "borders"
                        ? "bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                        : "bg-white/5 text-slate-300 hover:bg-white/15"
                    }`}
                  >
                    <Square className="h-3 w-3" />
                    Borders
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeSubTab("motion")}
                    className={`flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${
                      themeSubTab === "motion"
                        ? "bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                        : "bg-white/5 text-slate-300 hover:bg-white/15"
                    }`}
                  >
                    <Zap className="h-3 w-3" />
                    Motion
                  </button>
                </div>

                {/* 1. PRESETS SUB-TAB */}
                {themeSubTab === "presets" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-white flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-cyan-400" />
                        Design Theme Presets
                      </p>
                      {hasCustomOverrides && (
                        <button
                          type="button"
                          onClick={handleResetCustomTheme}
                          className="flex items-center gap-1 text-[10px] font-bold text-amber-400 hover:text-amber-300 underline"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Clear Custom Swatches
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {TANK_DESIGN_THEMES.map((preset) => {
                        const isSelected =
                          (settings.selectedBackgroundTheme || "tank-arcade-blue") === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleSelectBackgroundTheme(preset.id)}
                            className={`flex items-start gap-2.5 rounded-lg p-2.5 text-left transition-all ${
                              isSelected
                                ? "border-2 border-cyan-400 bg-cyan-950/60 shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                                : "border border-white/10 hover:border-white/30 bg-white/5"
                            }`}
                          >
                            <div
                              className="h-10 w-10 shrink-0 rounded-md border border-white/20 shadow overflow-hidden relative"
                              style={{
                                backgroundColor: preset.statusBarHex,
                                backgroundImage: `url(${preset.textures.background})`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                              }}
                            >
                              {isSelected && (
                                <div className="absolute inset-0 grid place-items-center bg-black/40">
                                  <Check className="h-4 w-4 text-cyan-300 stroke-[3]" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <p className="text-xs font-black text-white truncate">{preset.name}</p>
                                <span className="font-mono text-[9px] text-cyan-300">
                                  {preset.statusBarHex}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                                {preset.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. TEXTURES SUB-TAB */}
                {themeSubTab === "textures" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-white flex items-center gap-1.5">
                        <Box className="h-3.5 w-3.5 text-yellow-400" />
                        Tactile Texture Bay
                      </p>
                      <span className="text-[10px] text-slate-400 font-mono">
                        5 Hardware Surfaces
                      </span>
                    </div>

                    {/* Slot Switcher Pills */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {TEXTURE_SLOTS.map((slot) => {
                        const isSlotActive = activeTextureSlot === slot.id;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setActiveTextureSlot(slot.id)}
                            className={`flex flex-col text-left p-1.5 rounded border transition ${
                              isSlotActive
                                ? "border-yellow-400 bg-yellow-950/40 shadow-[0_0_8px_rgba(250,204,21,0.3)]"
                                : "border-white/10 hover:border-white/30 bg-white/5"
                            }`}
                          >
                            <span className="text-[10px] font-black text-white truncate">
                              {slot.label}
                            </span>
                            <span className="text-[8px] text-slate-400 truncate">
                              {slot.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active Slot Swatch Catalog */}
                    <div className="rounded-lg bg-black/80 p-2.5 shadow-inner border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-yellow-400 uppercase">
                          Select Pattern for:{" "}
                          {TEXTURE_SLOTS.find((s) => s.id === activeTextureSlot)?.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const defaultUrl = resolveTankChromeTheme().textures[activeTextureSlot];
                            handleSelectTextureForSlot(activeTextureSlot, defaultUrl);
                          }}
                          className="text-[9px] text-slate-400 hover:text-white underline"
                        >
                          Reset Slot
                        </button>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto pr-1">
                        {PATTERNS_CATALOG.map((p) => {
                          const currentSlotTexture = effectiveTheme.textures[activeTextureSlot];
                          const isSelected =
                            p.url === null
                              ? currentSlotTexture === "none" || !currentSlotTexture
                              : currentSlotTexture?.includes(p.url.replace(/^url\("?|"?\)$/g, ""));

                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleSelectTextureForSlot(activeTextureSlot, p.url)}
                              className={`group flex flex-col items-center gap-1 rounded p-1 text-center transition-all ${
                                isSelected
                                  ? "border-2 border-yellow-400 bg-yellow-400/20 shadow-[0_0_8px_rgba(250,204,21,0.6)]"
                                  : "border border-white/10 hover:border-white/40 bg-white/5"
                              }`}
                            >
                              <div
                                className="relative aspect-square w-full rounded bg-slate-800 flex items-center justify-center overflow-hidden"
                                style={{
                                  backgroundImage: p.url ? `url(${p.url})` : "none",
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                }}
                              >
                                {p.id === "none" && (
                                  <X className="h-4 w-4 text-red-500 stroke-[3]" />
                                )}
                              </div>
                              <span
                                className={`text-[9px] font-bold leading-tight line-clamp-1 ${
                                  isSelected ? "text-yellow-300" : "text-slate-300"
                                }`}
                              >
                                {p.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. COLORS SUB-TAB */}
                {themeSubTab === "colors" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-white flex items-center gap-1.5">
                        <Paintbrush className="h-3.5 w-3.5 text-emerald-400" />
                        Design Color Matrix
                      </p>
                      <span className="text-[10px] text-slate-400 font-mono">
                        10 Design Tokens
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                      {COLOR_TOKENS.map((token) => {
                        const hex = effectiveTheme.colors[token.key];
                        return (
                          <div
                            key={token.key}
                            className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 p-2"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-black text-white truncate">{token.label}</p>
                              <p className="text-[9px] text-slate-400 truncate">{token.desc}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="font-mono text-[10px] text-slate-300 font-bold uppercase">
                                {hex}
                              </span>
                              <input
                                type="color"
                                value={hex.startsWith("#") ? hex : "#557194"}
                                onChange={(e) => handleUpdateColor(token.key, e.target.value)}
                                className="h-7 w-7 cursor-pointer rounded border border-white/20 bg-transparent p-0 overflow-hidden"
                                title={`Change ${token.label}`}
                                aria-label={`Change ${token.label}`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 4. BORDERS & SPACING SUB-TAB */}
                {themeSubTab === "borders" && (
                  <div className="space-y-3">
                    <p className="text-xs font-black text-white flex items-center gap-1.5">
                      <Square className="h-3.5 w-3.5 text-orange-400" />
                      Borders & Geometry
                    </p>

                    {/* Border Radius */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-300">
                        Border Corner Radius
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {RADIUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleUpdateBorder("radius", opt.value)}
                            className={`rounded px-2 py-1.5 text-xs font-bold transition border ${
                              effectiveTheme.borders.radius === opt.value
                                ? "border-orange-400 bg-orange-950/60 text-orange-300 shadow-[0_0_8px_rgba(249,115,22,0.4)]"
                                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/15"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Border Width */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-300">
                        Border Thickness
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {BORDER_WIDTH_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleUpdateBorder("width", opt.value)}
                            className={`rounded px-2 py-1.5 text-xs font-bold transition border ${
                              effectiveTheme.borders.width === opt.value
                                ? "border-orange-400 bg-orange-950/60 text-orange-300 shadow-[0_0_8px_rgba(249,115,22,0.4)]"
                                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/15"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Border Style */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-300">
                        Border Bevel Style
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {BORDER_STYLE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleUpdateBorder("style", opt.value)}
                            className={`rounded px-2 py-1.5 text-xs font-bold transition border ${
                              effectiveTheme.borders.style === opt.value
                                ? "border-orange-400 bg-orange-950/60 text-orange-300 shadow-[0_0_8px_rgba(249,115,22,0.4)]"
                                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/15"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. MOTION SUB-TAB */}
                {themeSubTab === "motion" && (
                  <div className="space-y-3.5">
                    <p className="text-xs font-black text-white flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-purple-400" />
                      Animations & Glow Dynamics
                    </p>

                    {/* Master Switch */}
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <div>
                        <p className="text-xs font-black text-white">Animations Enabled</p>
                        <p className="text-[10px] text-slate-400">
                          Smooth transitions, glows & tactile state changes
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={effectiveTheme.animations.enabled}
                        onChange={(val) => handleUpdateAnimation("enabled", val)}
                      />
                    </div>

                    {/* Duration */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-300">
                        Transition Duration
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {DURATION_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleUpdateAnimation("duration", opt.value)}
                            className={`rounded px-2 py-1.5 text-xs font-bold transition border ${
                              effectiveTheme.animations.duration === opt.value
                                ? "border-purple-400 bg-purple-950/60 text-purple-300 shadow-[0_0_8px_rgba(192,132,252,0.4)]"
                                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/15"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Glow Bloom */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-300">
                        LED / Neon Glow Bloom
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {GLOW_OPTIONS.map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => handleUpdateAnimation("glow", opt.value)}
                            className={`rounded px-2 py-1.5 text-xs font-bold transition border ${
                              effectiveTheme.animations.glow === opt.value
                                ? "border-purple-400 bg-purple-950/60 text-purple-300 shadow-[0_0_8px_rgba(192,132,252,0.4)]"
                                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/15"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══════════ SOUND TAB ═══════════ */}
            {activeTab === "sound" && (
              <div className="space-y-4">
                {/* SFX Volume */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-black text-white">
                    <span>SFX Volume</span>
                    <span className="text-yellow-400">{settings.sfxVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.sfxVolume}
                    onChange={(e) =>
                      commitSettings({ ...settings, sfxVolume: Number(e.target.value) })
                    }
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-black/80 accent-[#ff4d00]"
                  />
                </div>

                {/* Mention Sound */}
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <p className="text-xs font-black text-white">Mention Sound</p>
                    <p className="text-[10px] text-slate-400">Play chime when mentioned in chat</p>
                  </div>
                  <ToggleSwitch
                    checked={settings.mentionSound}
                    onChange={(val) => commitSettings({ ...settings, mentionSound: val })}
                  />
                </div>

                {/* TTS Audio */}
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <p className="text-xs font-black text-white">TTS Playback</p>
                    <p className="text-[10px] text-slate-400">Hear room text-to-speech audio</p>
                  </div>
                  <ToggleSwitch
                    checked={settings.ttsEnabled}
                    onChange={(val) => commitSettings({ ...settings, ttsEnabled: val })}
                  />
                </div>
              </div>
            )}

            {/* ═══════════ CHAT TAB ═══════════ */}
            {activeTab === "chat" && (
              <div className="space-y-3.5">
                {/* Baby Mode */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-white">Baby Mode</p>
                    <p className="text-[10px] text-slate-400">Auto-censor profanity in chat</p>
                  </div>
                  <ToggleSwitch
                    checked={settings.babyMode}
                    onChange={(val) => commitSettings({ ...settings, babyMode: val })}
                  />
                </div>

                {/* Hide Used Items */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-white">Hide Used Items</p>
                    <p className="text-[10px] text-slate-400">Dim consumed items in inventory</p>
                  </div>
                  <ToggleSwitch
                    checked={settings.hideUsedItems}
                    onChange={(val) => commitSettings({ ...settings, hideUsedItems: val })}
                  />
                </div>

                {/* Hide Emotes */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-white">Hide Emotes</p>
                    <p className="text-[10px] text-slate-400">Render emotes as plain text</p>
                  </div>
                  <ToggleSwitch
                    checked={settings.hideEmotes}
                    onChange={(val) => commitSettings({ ...settings, hideEmotes: val })}
                  />
                </div>

                {/* Filter Words */}
                <div className="pt-2">
                  <p className="text-xs font-black text-white mb-1.5">Custom Filter Words</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={filterInput}
                      onChange={(e) => setFilterInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addFilterWord()}
                      placeholder="Add word to filter..."
                      className="flex-1 rounded bg-black/80 px-2.5 py-1 text-xs text-white border border-white/20 placeholder-slate-500 focus:outline-none focus:border-yellow-400"
                    />
                    <button
                      type="button"
                      onClick={addFilterWord}
                      className="grid h-7 w-7 place-items-center rounded bg-white/20 text-white hover:bg-white/30"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {settings.filterWords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {settings.filterWords.map((word) => (
                        <span
                          key={word}
                          className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white border border-white/20"
                        >
                          {word}
                          <button type="button" onClick={() => removeFilterWord(word)}>
                            <Trash2 className="h-3 w-3 hover:text-red-400" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Save & Reset Action Bar */}
          <div className="flex items-center justify-between pt-2 border-t border-black/40">
            <ConsoleButton variant="orange" onClick={handleSave} className="!px-6 !py-1.5">
              <Save className="h-3.5 w-3.5 mr-1 inline" />
              Save
            </ConsoleButton>
            <ConsoleButton variant="gray" onClick={handleReset} className="!px-6 !py-1.5">
              <RotateCcw className="h-3.5 w-3.5 mr-1 inline" />
              Reset All
            </ConsoleButton>
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border border-black/80 bg-black/90 p-0.5 shadow-inner transition-colors duration-200"
      >
        <span
          className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-slate-300 shadow-md transition duration-200 ${
            checked ? "translate-x-5 !bg-[#39ff6a]" : "translate-x-0 !bg-slate-600"
          }`}
        />
      </button>
      <span className={`text-[10px] font-black ${checked ? "text-[#39ff6a]" : "text-slate-400"}`}>
        {checked ? "ON" : "OFF"}
      </span>
    </div>
  );
}
