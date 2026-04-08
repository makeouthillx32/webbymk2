"use client";

import { Plus, Save } from "lucide-react";

export type BannerConfig = {
  display_mode: "static" | "marquee" | "slideshow" | "typewriter";
  animation_speed_ms: number;
  rotation_interval_ms: number;
  pause_on_hover: boolean;
  separator: string;
};

type Props = {
  enabled: boolean;
  onToggleEnabled: (value: boolean) => void;

  // groups
  onAddGroup: () => void;

  // config
  config: BannerConfig;
  onConfigChange: (next: BannerConfig) => void;
  dirty: boolean;
  onSaveConfig: () => void;
};

export function BannerActionBar({
  enabled,
  onToggleEnabled,
  onAddGroup,
  config,
  onConfigChange,
  dirty,
  onSaveConfig,
}: Props) {
  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-[hsl(var(--border))]"
          />
          Banner enabled
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onSaveConfig}
            disabled={!dirty}
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm font-medium text-[hsl(var(--foreground))] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            title={dirty ? "Save banner settings" : "No changes"}
          >
            <Save className="h-4 w-4" />
            Save settings
          </button>

          <button
            type="button"
            onClick={onAddGroup}
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Add group
          </button>
        </div>
      </div>

      {/* Config */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
          Mode
          <select
            value={config.display_mode}
            onChange={(e) =>
              onConfigChange({
                ...config,
                display_mode: e.target.value as BannerConfig["display_mode"],
              })
            }
            className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))]"
          >
            <option value="static">Static</option>
            <option value="marquee">Marquee</option>
            <option value="slideshow">Slideshow</option>
            <option value="typewriter">Typewriter</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
          Speed (ms)
          <input
            type="number"
            min={50}
            value={config.animation_speed_ms}
            onChange={(e) =>
              onConfigChange({
                ...config,
                animation_speed_ms: Number(e.target.value || 0),
              })
            }
            className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))]"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
          Interval (ms)
          <input
            type="number"
            min={300}
            value={config.rotation_interval_ms}
            onChange={(e) =>
              onConfigChange({
                ...config,
                rotation_interval_ms: Number(e.target.value || 0),
              })
            }
            className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))]"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))] sm:mt-6">
          <input
            type="checkbox"
            checked={config.pause_on_hover}
            onChange={(e) =>
              onConfigChange({ ...config, pause_on_hover: e.target.checked })
            }
            className="h-4 w-4 rounded border-[hsl(var(--border))]"
          />
          Pause on hover
        </label>

        <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
          Separator
          <input
            type="text"
            value={config.separator}
            onChange={(e) => onConfigChange({ ...config, separator: e.target.value })}
            placeholder=" • "
            className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))]"
          />
        </label>
      </div>

      <div className="text-xs text-[hsl(var(--muted-foreground))]">
        Scheduling is managed per group below (days of week + optional time/date window + timezone).
      </div>
    </div>
  );
}
