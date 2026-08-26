"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME, TANK_BACKGROUND_THEMES, getTankBackgroundTheme } from "../../theme";
import { safeStorage } from "@/lib/safeStorage";

export type TankSettings = {
  // Theme & Textures
  selectedPattern: string; // pattern ID or 'light-aluminum' default
  selectedBackgroundTheme?: string; // e.g. 'tank-arcade-green'
  animationsEnabled: boolean;
  // Sound
  sfxVolume: number; // 0 to 100
  mentionSound: boolean;
  ttsEnabled: boolean;
  // Chat
  babyMode: boolean;
  hideUsedItems: boolean;
  hideEmotes: boolean;
  blockedUsers: string[];
  filterWords: string[];
};

export const DEFAULT_SETTINGS: TankSettings = {
  selectedPattern: "light-aluminum",
  selectedBackgroundTheme: "tank-arcade-green",
  animationsEnabled: true,
  sfxVolume: 80,
  mentionSound: true,
  ttsEnabled: true,
  babyMode: false,
  hideUsedItems: false,
  hideEmotes: false,
  blockedUsers: [],
  filterWords: [],
};

export const PATTERNS_CATALOG = [
  { id: "none", label: "None", url: null },
  { id: "asphalt-light", label: "Asphalt Light", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-light.png" },
  { id: "asphalt-dark", label: "Asphalt Dark", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-dark.png" },
  { id: "otis-redding", label: "Otis Redding", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/otis-redding.png" },
  { id: "cardboard", label: "Cardboard", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/cardboard.png" },
  { id: "light-aluminum", label: "Light Aluminum", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/light-aluminum.png" },
  { id: "metal", label: "Heavy Metal", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/metal.png" },
  { id: "ice-age", label: "Ice Age", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/ice-age.png" },
  { id: "concrete", label: "Concrete", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/concrete-wall.png" },
  { id: "notebook", label: "Notebook", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/notebook.png" },
  { id: "old-husks", label: "Old Husks", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/old-husks.png" },
  { id: "wood", label: "Wood", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/dark-wood.png" },
  { id: "tire", label: "Tire", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/dark-tire.png" },
  { id: "leather", label: "Leather", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/leather.png" },
  { id: "brick", label: "Brick", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/brick-wall-dark.png" },
  { id: "snow", label: "Snow", url: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/snow.png" },
];

export type SettingsOverlayProps = {
  onClose: () => void;
  onSettingsSaved?: (settings: TankSettings) => void;
  currentSettings?: TankSettings;
};

export function SettingsOverlay({ onClose, onSettingsSaved, currentSettings }: SettingsOverlayProps) {
  const [activeTab, setActiveTab] = useState<"theme" | "sound" | "chat">("theme");
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

  const handleSave = () => {
    try {
      safeStorage.setItem("tank_settings_v1", JSON.stringify(settings));
    } catch {}
    if (onSettingsSaved) onSettingsSaved(settings);
    onClose();
  };

  const handleSelectPattern = (patternId: string) => {
    const updated = { ...settings, selectedPattern: patternId };
    setSettings(updated);
    if (onSettingsSaved) onSettingsSaved(updated);
    try {
      safeStorage.setItem("tank_settings_v1", JSON.stringify(updated));
    } catch {}
  };

  const handleSelectBackgroundTheme = (themeId: string) => {
    const updated = { ...settings, selectedBackgroundTheme: themeId };
    setSettings(updated);
    if (onSettingsSaved) onSettingsSaved(updated);
    try {
      safeStorage.setItem("tank_settings_v1", JSON.stringify(updated));
    } catch {}
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      safeStorage.removeItem("tank_settings_v1");
    } catch {}
    if (onSettingsSaved) onSettingsSaved(DEFAULT_SETTINGS);
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
        <ChromePanel withScrews className="w-full max-h-[90vh] flex flex-col overflow-hidden">
          {/* Header with Title and Red Close Box */}
          <div className="relative flex items-center justify-between pb-3 border-b border-black/40 px-1">
            <h2
              className="text-sm font-black uppercase tracking-wider text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              Settings
            </h2>
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
              Theme
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
          <div className="flex-1 overflow-y-auto max-h-[55vh] rounded-lg bg-black/60 p-3.5 border border-black/80 shadow-inner backdrop-blur-sm space-y-4 my-2">
            {/* ═══════════ THEME TAB ═══════════ */}
            {activeTab === "theme" && (
              <div className="space-y-4">
                {/* 1. Chassis Background & iOS Status Bar Theme */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-black text-white flex items-center gap-1.5">
                      <Palette className="h-3.5 w-3.5 text-cyan-400" />
                      Chassis Background & iOS Status Bar
                    </p>
                    <span className="text-[10px] font-mono text-cyan-300 font-bold">
                      {getTankBackgroundTheme(settings.selectedBackgroundTheme).label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 rounded-lg bg-black/80 p-2.5 shadow-inner border border-white/10">
                    {TANK_BACKGROUND_THEMES.map((t) => {
                      const isSelected = (settings.selectedBackgroundTheme || "tank-arcade-green") === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleSelectBackgroundTheme(t.id)}
                          className={`flex items-center gap-2 rounded-lg p-2 text-left transition-all ${
                            isSelected
                              ? "border-2 border-cyan-400 bg-cyan-950/60 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                              : "border border-white/10 hover:border-white/40 bg-white/5"
                          }`}
                        >
                          <div
                            className="h-8 w-8 shrink-0 rounded-md border border-white/20 shadow overflow-hidden"
                            style={{
                              backgroundColor: t.statusBarHex,
                              backgroundImage: `url(${t.backgroundUrl})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-black text-white truncate">{t.label}</p>
                            <p className="text-[10px] font-mono text-cyan-300/80">{t.statusBarHex}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Animations Switch */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-black text-white">
                      <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
                      Animations
                    </p>
                    <p className="text-[10px] text-slate-400">Enable smooth UI transitions & glow</p>
                  </div>
                  <ToggleSwitch
                    checked={settings.animationsEnabled}
                    onChange={(val) => setSettings({ ...settings, animationsEnabled: val })}
                  />
                </div>

                {/* Texture Swatches Grid */}
                <div>
                  <p className="text-xs font-black text-white mb-2">
                    Panel Texture Overlays
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 rounded-lg bg-black/80 p-2.5 shadow-inner border border-white/10">
                    {PATTERNS_CATALOG.map((p) => {
                      const isSelected = settings.selectedPattern === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleSelectPattern(p.id)}
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
                      setSettings({ ...settings, sfxVolume: Number(e.target.value) })
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
                    onChange={(val) => setSettings({ ...settings, mentionSound: val })}
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
                    onChange={(val) => setSettings({ ...settings, ttsEnabled: val })}
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
                    onChange={(val) => setSettings({ ...settings, babyMode: val })}
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
                    onChange={(val) => setSettings({ ...settings, hideUsedItems: val })}
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
                    onChange={(val) => setSettings({ ...settings, hideEmotes: val })}
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
              Reset
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
