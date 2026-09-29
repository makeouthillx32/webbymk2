"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  Box,
  MessageSquare,
  Music2,
  Palette,
  Paintbrush,
  RotateCcw,
  Save,
  Type,
  Undo2,
  Waves,
  X,
} from "lucide-react";
import {
  TANK_BACKGROUND_THEMES,
  TANK_TEXTURE_PATTERNS,
  getTankBackgroundTheme,
  buildTankSpacingScale,
  resolveTankChromeTheme,
  type TankThemeBorders,
  type TankThemeColors,
  type TankThemeCustomOverrides,
  type TankThemeTextures,
} from "../../theme";
import { safeStorage } from "@/lib/safeStorage";
import {
  DEFAULT_SETTINGS,
  type SettingsOverlayProps,
  type TankSettings,
} from "./SettingsOverlay";

type SettingsTab = "theme" | "sound" | "chat";

const COLOR_FIELDS: Array<{ key: keyof TankThemeColors; label: string }> = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "tertiary", label: "Tertiary" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "link", label: "Link" },
  { key: "danger", label: "Danger" },
  { key: "lightText", label: "Light Text" },
  { key: "darkText", label: "Dark Text" },
];

const TEXTURE_FIELDS: Array<{ key: keyof TankThemeTextures; label: string }> = [
  { key: "background", label: "Background" },
  { key: "panel", label: "Panel" },
  { key: "innerPanel", label: "Inner Panel" },
  { key: "darkPanel", label: "Dark Panel" },
  { key: "metal", label: "Metal" },
];

const cloneSettings = (settings: TankSettings): TankSettings =>
  JSON.parse(JSON.stringify(settings)) as TankSettings;

const textureBackground = (value: string): string => {
  if (!value || value === "none") return "#111216";
  if (value.startsWith("url(") || value.includes("gradient(")) return value;
  return `url("${value}")`;
};

export function CompactSettingsOverlay({
  onClose,
  onSettingsSaved,
  currentSettings,
}: SettingsOverlayProps): ReactElement {
  const [activeTab, setActiveTab] = useState<SettingsTab>("theme");
  const [settings, setSettings] = useState<TankSettings>(() =>
    cloneSettings(currentSettings ?? DEFAULT_SETTINGS),
  );
  const [filterInput, setFilterInput] = useState("");
  const historyRef = useRef<TankSettings[]>([]);

  useEffect(() => {
    if (currentSettings) {
      setSettings(cloneSettings(currentSettings));
      historyRef.current = [];
      return;
    }
    try {
      const saved = safeStorage.getItem("tank_settings_v1");
      if (saved) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) } as TankSettings);
      }
    } catch {
      // A malformed local draft should never stop the settings panel opening.
    }
  }, [currentSettings]);

  const theme = useMemo(
    () => resolveTankChromeTheme(settings.customTheme),
    [settings.customTheme],
  );

  const update = (next: TankSettings | ((previous: TankSettings) => TankSettings)) => {
    setSettings((previous) => {
      historyRef.current = [...historyRef.current.slice(-19), cloneSettings(previous)];
      return typeof next === "function" ? next(previous) : next;
    });
  };

  const updateCustom = (patch: TankThemeCustomOverrides) => {
    update((previous) => ({
      ...previous,
      customTheme: mergeThemeOverrides(previous.customTheme, patch),
    }));
  };

  const handleSave = () => {
    const normalizedSettings: TankSettings = {
      ...settings,
      selectedBackgroundTheme: getTankBackgroundTheme(
        settings.selectedBackgroundTheme,
      ).id,
    };
    try {
      safeStorage.setItem(
        "tank_settings_v1",
        JSON.stringify(normalizedSettings),
      );
    } catch {
      // Parent persistence still receives the saved settings.
    }
    onSettingsSaved?.(normalizedSettings);
    onClose();
  };

  const handleUndo = () => {
    const previous = historyRef.current.pop();
    if (previous) setSettings(previous);
  };

  const handleReset = () => update(cloneSettings(DEFAULT_SETTINGS));

  const addFilterWord = () => {
    const word = filterInput.trim();
    if (!word || settings.filterWords.includes(word)) return;
    update((previous) => ({ ...previous, filterWords: [...previous.filterWords, word] }));
    setFilterInput("");
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 p-2 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tank-settings-title"
      style={{ "--tank-border-radius": theme.borders.radius } as CSSProperties}
    >
      <div className="relative flex max-h-[96dvh] w-full max-w-[440px] flex-col overflow-hidden border border-white/15 bg-[#202225] text-[#f2f2f2] shadow-[0_24px_80px_rgba(0,0,0,.72),inset_0_1px_0_rgba(255,255,255,.06)]" style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[.11]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 10%, white 0 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 0 1px, transparent 1px)",
            backgroundSize: "16px 17px, 23px 21px",
          }}
        />

        <header className="relative shrink-0 px-5 pb-2 pt-5">
          <h2 id="tank-settings-title" className="text-center text-base font-black tracking-tight">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center border border-red-300/30 bg-[#eb554b] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_3px_0_#a92f2a] transition active:translate-y-0.5 active:shadow-none"
            style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}
          >
            <X className="h-5 w-5 stroke-[2.5]" />
          </button>

          <nav className="mt-5 grid grid-cols-3 gap-3" aria-label="Settings categories">
            <SettingsTabButton active={activeTab === "theme"} tone="red" onClick={() => setActiveTab("theme")}>
              <Palette className="h-4 w-4" /> Theme
            </SettingsTabButton>
            <SettingsTabButton active={activeTab === "sound"} tone="green" onClick={() => setActiveTab("sound")}>
              <Music2 className="h-4 w-4" /> Sound
            </SettingsTabButton>
            <SettingsTabButton active={activeTab === "chat"} tone="gray" onClick={() => setActiveTab("chat")}>
              <MessageSquare className="h-4 w-4" /> Chat
            </SettingsTabButton>
          </nav>
        </header>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-3 [scrollbar-color:#56595e_transparent]">
          {activeTab === "theme" && (
            <div className="space-y-3">
              <SettingsSection
                icon={<Palette className="h-4 w-4" />}
                title="Background"
              >
                <div
                  className="grid grid-cols-2 gap-2"
                  aria-label="Approved Tank backgrounds"
                >
                  {TANK_BACKGROUND_THEMES.map((background) => {
                    const active =
                      getTankBackgroundTheme(settings.selectedBackgroundTheme)
                        .id === background.id;
                    return (
                      <button
                        type="button"
                        key={background.id}
                        aria-pressed={active}
                        onClick={() =>
                          update((previous) => ({
                            ...previous,
                            selectedBackgroundTheme: background.id,
                          }))
                        }
                        className={`flex min-w-0 items-center gap-2 border p-2 text-left transition ${
                          active
                            ? "border-cyan-300 bg-cyan-400/15 ring-1 ring-cyan-300/70"
                            : "border-white/10 bg-black/25 hover:border-white/25"
                        }`}
                        style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}
                      >
                        <span
                          className="h-10 w-10 shrink-0 border border-white/20 bg-cover bg-center shadow-inner"
                          style={{
                            borderRadius: "var(--tank-border-radius, 0.25rem)",
                            backgroundColor: background.palette.base,
                            backgroundImage: `url(${background.backgroundUrl})`,
                          }}
                        />
                        <span className="truncate text-xs font-black text-white">
                          {background.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </SettingsSection>

              <SettingsSection icon={<Type className="h-4 w-4" />} title="Fonts">
                <div className="grid grid-cols-2 gap-3">
                  <LabeledInput
                    label="Primary"
                    value={theme.fonts.primary}
                    onChange={(value) => updateCustom({ fonts: { primary: value } })}
                  />
                  <LabeledInput
                    label="Secondary"
                    value={theme.fonts.secondary}
                    onChange={(value) => updateCustom({ fonts: { secondary: value } })}
                  />
                </div>
              </SettingsSection>

              <SettingsSection icon={<Palette className="h-4 w-4" />} title="Colors">
                <div className="grid grid-cols-5 gap-x-2 gap-y-3">
                  {COLOR_FIELDS.map(({ key, label }) => (
                    <label key={key} className="min-w-0 cursor-pointer text-center">
                      <span
                        className="mx-auto block aspect-square w-full max-w-[54px] border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,.22),0_2px_4px_rgba(0,0,0,.4)]"
                        style={{ backgroundColor: theme.colors[key], borderRadius: "var(--tank-border-radius, 0.25rem)" }}
                      />
                      <span className="mt-1 block truncate text-[9px] font-bold text-white/80">{label}</span>
                      <input
                        type="color"
                        className="sr-only"
                        value={theme.colors[key]}
                        aria-label={`${label} color`}
                        onChange={(event) => updateCustom({ colors: { [key]: event.target.value } })}
                      />
                    </label>
                  ))}
                </div>
              </SettingsSection>

              <SettingsSection icon={<Waves className="h-4 w-4" />} title="Panel Textures">
                <div className="grid grid-cols-5 gap-2">
                  {TEXTURE_FIELDS.map(({ key, label }) => {
                    const isBackground = key === "background";
                    const selectedBackground = getTankBackgroundTheme(settings.selectedBackgroundTheme);
                    const current = isBackground
                      ? selectedBackground.backgroundUrl
                      : theme.textures[key];
                    const hasOption = isBackground || TANK_TEXTURE_PATTERNS.some((pattern) => (pattern.url ?? "none") === current);
                    return (
                      <label key={key} className="relative min-w-0 cursor-pointer text-center">
                        <span
                          className="mx-auto block aspect-square w-full max-w-[54px] border border-white/15 bg-cover shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_2px_4px_rgba(0,0,0,.4)]"
                          style={{ background: textureBackground(current), borderRadius: "var(--tank-border-radius, 0.25rem)" }}
                        />
                        <span className="mt-1 block truncate text-[9px] font-bold text-white/80">{label}</span>
                        <select
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label={`${label} texture`}
                          value={isBackground ? selectedBackground.id : current}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (isBackground) {
                              update((previous) => ({
                                ...previous,
                                selectedBackgroundTheme: getTankBackgroundTheme(value).id,
                              }));
                              return;
                            }
                            updateCustom({ textures: { [key]: value } });
                            if (key === "panel") {
                              const pattern = TANK_TEXTURE_PATTERNS.find((entry) => (entry.url ?? "none") === value);
                              if (pattern) update((previous) => ({ ...previous, selectedPattern: pattern.id }));
                            }
                          }}
                        >
                          {isBackground ? (
                            TANK_BACKGROUND_THEMES.map((background) => (
                              <option key={background.id} value={background.id}>{background.label}</option>
                            ))
                          ) : (
                            <>
                              {!hasOption && <option value={current}>Current</option>}
                              {TANK_TEXTURE_PATTERNS.map((pattern) => (
                                <option key={pattern.id} value={pattern.url ?? "none"}>{pattern.label}</option>
                              ))}
                            </>
                          )}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </SettingsSection>

              <SettingsSection icon={<Box className="h-4 w-4" />} title="Borders">
                <CompactRange
                  value={Number.parseFloat(theme.borders.radius) || 0}
                  min={0}
                  max={1.5}
                  step={0.125}
                  ariaLabel="Border roundness"
                  onChange={(value) => updateCustom({ borders: { radius: `${value}rem` } satisfies Partial<TankThemeBorders> })}
                />
              </SettingsSection>

              <SettingsSection icon={<Paintbrush className="h-4 w-4" />} title="Spacing">
                <CompactRange
                  value={Number.parseFloat(theme.spacing.base) || 1}
                  min={0.25}
                  max={2}
                  step={0.125}
                  ariaLabel="Interface spacing"
                  onChange={(value) =>
                    updateCustom({ spacing: buildTankSpacingScale(value) })
                  }
                />
              </SettingsSection>

              <div className="flex items-center justify-between py-1 text-xs font-black">
                <span className="flex items-center gap-2"><Waves className="h-4 w-4 text-[#ef453c]" /> Animations</span>
                <Toggle
                  checked={settings.animationsEnabled}
                  onChange={(checked) =>
                    update((previous) => ({
                      ...previous,
                      animationsEnabled: checked,
                      customTheme: {
                        ...previous.customTheme,
                        animations: { ...previous.customTheme?.animations, enabled: checked },
                      },
                    }))
                  }
                />
              </div>
            </div>
          )}

          {activeTab === "sound" && (
            <div className="space-y-3">
              <SettingsSection icon={<Music2 className="h-4 w-4" />} title="Sound">
                <p className="mb-2 text-xs text-white/60">Effects volume</p>
                <CompactRange
                  value={settings.sfxVolume}
                  min={0}
                  max={100}
                  step={1}
                  ariaLabel="Effects volume"
                  onChange={(value) => update((previous) => ({ ...previous, sfxVolume: value }))}
                />
                <SettingToggleRow label="Mention sound" checked={settings.mentionSound} onChange={(mentionSound) => update((previous) => ({ ...previous, mentionSound }))} />
                <SettingToggleRow label="Text-to-speech" checked={settings.ttsEnabled} onChange={(ttsEnabled) => update((previous) => ({ ...previous, ttsEnabled }))} />
              </SettingsSection>
            </div>
          )}

          {activeTab === "chat" && (
            <div className="space-y-3">
              <SettingsSection icon={<MessageSquare className="h-4 w-4" />} title="Chat">
                <SettingToggleRow label="Baby mode" checked={settings.babyMode} onChange={(babyMode) => update((previous) => ({ ...previous, babyMode }))} />
                <SettingToggleRow label="Show avatars" checked={settings.showAvatars !== false} onChange={(showAvatars) => update((previous) => ({ ...previous, showAvatars }))} />
                <SettingToggleRow label="Hide used items" checked={settings.hideUsedItems} onChange={(hideUsedItems) => update((previous) => ({ ...previous, hideUsedItems }))} />
                <SettingToggleRow label="Hide emotes" checked={settings.hideEmotes} onChange={(hideEmotes) => update((previous) => ({ ...previous, hideEmotes }))} />
              </SettingsSection>
              <SettingsSection icon={<X className="h-4 w-4" />} title="Filtered words">
                <div className="flex gap-2">
                  <input
                    value={filterInput}
                    onChange={(event) => setFilterInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addFilterWord();
                      }
                    }}
                    placeholder="Add a word"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#111216] px-3 py-2 text-xs outline-none focus:border-red-400"
                  />
                  <button type="button" onClick={addFilterWord} className="rounded-lg bg-[#555b62] px-3 text-xs font-black">Add</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {settings.filterWords.map((word) => (
                    <button
                      type="button"
                      key={word}
                      onClick={() => update((previous) => ({ ...previous, filterWords: previous.filterWords.filter((entry) => entry !== word) }))}
                      className="border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-white/75"
                      style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}
                    >
                      {word} ×
                    </button>
                  ))}
                </div>
              </SettingsSection>
            </div>
          )}
        </div>

        <footer className="relative grid shrink-0 grid-cols-3 gap-3 border-t border-white/10 bg-[#1b1d20] px-5 py-3">
          <FooterButton primary onClick={handleSave}><Save className="h-4 w-4" /> Save</FooterButton>
          <FooterButton onClick={handleReset}><RotateCcw className="h-4 w-4" /> Reset</FooterButton>
          <FooterButton disabled={historyRef.current.length === 0} onClick={handleUndo}><Undo2 className="h-4 w-4" /> Undo</FooterButton>
        </footer>
      </div>
    </div>
  );
}

function mergeThemeOverrides(
  current: TankThemeCustomOverrides | undefined,
  patch: TankThemeCustomOverrides,
): TankThemeCustomOverrides {
  return {
    ...current,
    ...patch,
    fonts: patch.fonts ? { ...current?.fonts, ...patch.fonts } : current?.fonts,
    colors: patch.colors ? { ...current?.colors, ...patch.colors } : current?.colors,
    textures: patch.textures ? { ...current?.textures, ...patch.textures } : current?.textures,
    borders: patch.borders ? { ...current?.borders, ...patch.borders } : current?.borders,
    spacing: patch.spacing ? { ...current?.spacing, ...patch.spacing } : current?.spacing,
    animations: patch.animations
      ? { ...current?.animations, ...patch.animations }
      : current?.animations,
  };
}

function SettingsTabButton({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "red" | "green" | "gray";
  onClick: () => void;
  children: ReactNode;
}) {
  const toneClass = {
    red: "border-red-300/35 bg-[#dc4a43] shadow-[inset_0_1px_0_rgba(255,255,255,.32),0_3px_0_#962e2a]",
    green: "border-emerald-200/30 bg-[#54a873] shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_3px_0_#326d49]",
    gray: "border-white/15 bg-[#545b62] shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_3px_0_#30353a]",
  }[tone];
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-w-0 items-center justify-center gap-1.5 border px-2 py-2 text-sm font-black transition ${toneClass} ${active ? "brightness-110 ring-2 ring-white/20" : "saturate-[.65] opacity-80 hover:opacity-100"}`}
      style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}
    >
      {children}
    </button>
  );
}

function SettingsSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-black text-white/90">
        <span className="text-[#ef453c]">{icon}</span>{title}
      </h3>
      <div className="border border-white/15 bg-black/20 p-3 shadow-[inset_0_1px_4px_rgba(0,0,0,.55)]" style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}>{children}</div>
    </section>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="min-w-0 text-[10px] font-bold text-white/70">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full border border-white/5 bg-[#101115] px-3 py-2 font-mono text-xs text-white outline-none focus:border-red-400"
        style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}
      />
    </label>
  );
}

function CompactRange({ value, min, max, step, ariaLabel, onChange }: { value: number; min: number; max: number; step: number; ariaLabel: string; onChange: (value: number) => void }) {
  return (
    <div className="border border-white/15 bg-[#121316] px-3 py-2 shadow-inner" style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer accent-[#e43d36]"
      />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full border transition ${checked ? "border-red-300/30 bg-[#df3f38]" : "border-white/10 bg-[#45494f]"}`}
    >
      <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all ${checked ? "left-[21px]" : "left-0.5"}`} />
    </button>
  );
}

function SettingToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2 last:border-0">
      <span className="text-xs font-bold text-white/85">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function FooterButton({ primary = false, disabled = false, onClick, children }: { primary?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-w-0 items-center justify-center gap-1.5 border px-2 py-2 text-xs font-black shadow-[inset_0_1px_0_rgba(255,255,255,.24),0_3px_0_rgba(0,0,0,.38)] transition active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-35 ${primary ? "border-red-300/30 bg-[#df4a42]" : "border-white/15 bg-[#45494e]"}`}
      style={{ borderRadius: "var(--tank-border-radius, 0.25rem)" }}
    >
      {children}
    </button>
  );
}
