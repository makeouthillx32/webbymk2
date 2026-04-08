"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { BannerItemRow } from "./BannerItemsTable";

type ScheduleData = {
  // ISO weekdays: 1=Mon ... 7=Sun. Empty => every day (we send null to DB later)
  active_days?: number[] | null;

  // "HH:MM" (we can convert to TIME in page save)
  start_time?: string | null;
  end_time?: string | null;

  // "YYYY-MM-DD"
  start_date?: string | null;
  end_date?: string | null;

  timezone?: string | null;
};

type Props = {
  open: boolean;
  item?: (BannerItemRow & ScheduleData) | null;
  onClose: () => void;

  // IMPORTANT: Keep backward compatible.
  // Page can accept schedule fields and decide how to store them.
  onSave: (data: { text: string } & ScheduleData) => Promise<void> | void;
};

const ISO_DAYS: { iso: number; short: string }[] = [
  { iso: 1, short: "Mon" },
  { iso: 2, short: "Tue" },
  { iso: 3, short: "Wed" },
  { iso: 4, short: "Thu" },
  { iso: 5, short: "Fri" },
  { iso: 6, short: "Sat" },
  { iso: 7, short: "Sun" },
];

function normalizeDays(arr: any): number[] {
  if (!Array.isArray(arr)) return [];
  const nums = arr.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

// If Supabase returns TIME like "09:00:00", show "09:00"
function toHHMM(t: any): string {
  if (!t) return "";
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export function BannerItemModal({ open, item, onClose, onSave }: Props) {
  const isEdit = !!item;

  const [text, setText] = useState(item?.text ?? "");
  const [saving, setSaving] = useState(false);

  // schedule (optional)
  const [timezone, setTimezone] = useState(item?.timezone ?? "America/Chicago");
  const [activeDays, setActiveDays] = useState<number[]>(normalizeDays(item?.active_days));
  const [startTime, setStartTime] = useState<string>(toHHMM(item?.start_time));
  const [endTime, setEndTime] = useState<string>(toHHMM(item?.end_time));
  const [startDate, setStartDate] = useState<string>(item?.start_date ?? "");
  const [endDate, setEndDate] = useState<string>(item?.end_date ?? "");

  useEffect(() => {
    setText(item?.text ?? "");

    setTimezone(item?.timezone ?? "America/Chicago");
    setActiveDays(normalizeDays(item?.active_days));
    setStartTime(toHHMM(item?.start_time));
    setEndTime(toHHMM(item?.end_time));
    setStartDate(item?.start_date ?? "");
    setEndDate(item?.end_date ?? "");
  }, [item]);

  const scheduleSummary = useMemo(() => {
    const days =
      activeDays.length === 0
        ? "Every day"
        : activeDays
            .map((d) => ISO_DAYS.find((x) => x.iso === d)?.short ?? String(d))
            .join(", ");
    const timePart = startTime || endTime ? ` • ${startTime || "00:00"}–${endTime || "23:59"}` : "";
    const datePart = startDate || endDate ? ` • ${startDate || "…"} → ${endDate || "…"} ` : "";
    return `${days}${timePart}${datePart}• ${timezone || "America/Chicago"}`;
  }, [activeDays, startTime, endTime, startDate, endDate, timezone]);

  if (!open) return null;

  const handleSave = async () => {
    const t = text.trim();
    if (!t) return;

    // Send nulls when empty (page.tsx will convert to DB-friendly shapes)
    const payload: { text: string } & ScheduleData = {
      text: t,
      timezone: (timezone || "America/Chicago").trim() || "America/Chicago",
      active_days: activeDays.length ? activeDays : null,
      start_time: startTime.trim() ? startTime.trim() : null,
      end_time: endTime.trim() ? endTime.trim() : null,
      start_date: startDate.trim() ? startDate.trim() : null,
      end_date: endDate.trim() ? endDate.trim() : null,
    };

    try {
      setSaving(true);
      await onSave(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (iso: number) => {
    setActiveDays((prev) => {
      const set = new Set(prev);
      if (set.has(iso)) set.delete(iso);
      else set.add(iso);
      return Array.from(set).sort((a, b) => a - b);
    });
  };

  const clearSchedule = () => {
    setTimezone("America/Chicago");
    setActiveDays([]);
    setStartTime("");
    setEndTime("");
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <button aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="absolute left-1/2 top-1/2 w-[calc(100%-24px)] max-w-2xl -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-3">
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {isEdit ? "Edit banner group" : "Add banner group"}
            </h2>
            <button onClick={onClose} className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-5">
            {/* Group text */}
            <div>
              <label className="text-sm font-medium text-[hsl(var(--foreground))]">Group text</label>
              <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                This is the <b>full line</b> that marquee scrolls and slideshow/typewriter rotates.
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="Free shipping over $75 • New drops weekly • Easy returns"
                className="mt-2 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm text-[hsl(var(--foreground))]"
              />
            </div>

            {/* Schedule */}
            <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">Scheduling</div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    Leave days empty for <b>Every day</b>. Use a real timezone for DST safety.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearSchedule}
                  className="h-9 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm text-[hsl(var(--foreground))] hover:opacity-90"
                >
                  Clear
                </button>
              </div>

              {/* Timezone */}
              <label className="mt-3 flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                Timezone
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="America/Chicago"
                  className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm text-[hsl(var(--foreground))]"
                />
                <span className="text-[11px]">
                  Recommended: <b>America/Chicago</b> (“UTC-6-ish” with DST)
                </span>
              </label>

              {/* Days */}
              <div className="mt-3">
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Active days</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ISO_DAYS.map((d) => {
                    const on = activeDays.includes(d.iso);
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => toggleDay(d.iso)}
                        className={`h-9 rounded-[var(--radius)] border px-3 text-sm hover:opacity-90 ${
                          on
                            ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                            : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]"
                        }`}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                  Current: <b>{scheduleSummary}</b>
                </div>
              </div>

              {/* Time window */}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                  Start time
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm text-[hsl(var(--foreground))]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                  End time
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm text-[hsl(var(--foreground))]"
                  />
                </label>
              </div>

              {/* Date window */}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                  Start date
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm text-[hsl(var(--foreground))]"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                  End date
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm text-[hsl(var(--foreground))]"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-[var(--radius)] border border-[hsl(var(--border))] px-4 text-sm text-[hsl(var(--foreground))]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="h-9 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm text-[hsl(var(--primary-foreground))] disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save group"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
