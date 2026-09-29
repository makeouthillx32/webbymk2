"use client";

// Ad-campaign planner — marketing role's calendar for drafting and
// scheduling ad campaigns across platforms. Reuses the existing CalenderBox
// grid component (src/components/CalenderBox) rather than building a new
// calendar UI, and stores campaigns in tank_house_events via
// /api/dashboard/ad-campaigns (see that route for why that table).
//
// This is planning/scheduling only — no platform is actually connected yet.
// Each platform card below shows "Not connected" until real OAuth apps
// exist for that platform (Meta Business, Google Ads API, TikTok for
// Business, LinkedIn Marketing Developer Platform, X Ads API — all
// external, business-side setup, not something this app can do on its own).
import { useEffect, useState, useCallback } from "react";
import CalendarBox from "@/components/CalenderBox";
import { X, Plus, Loader2 } from "lucide-react";
import type { AdPlatform, AdZone } from "@/app/api/dashboard/ad-campaigns/route";

type Campaign = {
  id: string;
  body: string;
  execute_at: string;
  status: string;
  payload: {
    platform: AdPlatform;
    zone: AdZone;
    budget_cents: number | null;
    audience: string | null;
    copy: string | null;
  };
  created_at: string;
};

type CalendarEventShape = {
  id: string;
  title: string;
  description?: string;
  event_date: string;
  start_time: string;
  end_time: string;
  event_type: string;
  color_code: string;
  status: string;
  duration_minutes: number;
};

const PLATFORM_META: Record<AdPlatform, { label: string; color: string }> = {
  meta: { label: "Meta (Facebook/Instagram)", color: "#1877F2" },
  tiktok: { label: "TikTok", color: "#EE1D52" },
  linkedin: { label: "LinkedIn", color: "#0A66C2" },
  google: { label: "Google Ads", color: "#4285F4" },
  x: { label: "X (Twitter)", color: "#1D9BF0" },
  youtube: { label: "YouTube", color: "#FF0000" },
};

const ZONE_META: Record<AdZone, { label: string }> = {
  core: { label: "unenter.live (site-wide)" },
  shop: { label: "Shop" },
  labs: { label: "Labs" },
  tank: { label: "Tank" },
  blog: { label: "Blog" },
};

function toEventShape(c: Campaign): CalendarEventShape {
  const d = new Date(c.execute_at);
  const event_date = d.toISOString().slice(0, 10);
  const start_time = d.toISOString().slice(11, 16);
  const zoneLabel = ZONE_META[c.payload?.zone]?.label ?? c.payload?.zone;
  return {
    id: c.id,
    title: zoneLabel ? `[${zoneLabel}] ${c.body}` : c.body,
    description: c.payload?.copy ?? undefined,
    event_date,
    start_time,
    end_time: start_time,
    event_type: "Ad Campaign",
    color_code: PLATFORM_META[c.payload?.platform]?.color ?? "#6B7280",
    status: c.status,
    duration_minutes: 0,
  };
}

export default function CampaignCalendar({ userRole }: { userRole: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [createDefaultDate, setCreateDefaultDate] = useState<Date | null>(null);
  const [selected, setSelected] = useState<Campaign | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/ad-campaigns");
      const data = await res.json();
      setCampaigns(res.ok ? data.campaigns ?? [] : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const events = campaigns.map(toEventShape);

  function handleEventClick(evt: CalendarEventShape) {
    const campaign = campaigns.find((c) => c.id === evt.id);
    if (campaign) setSelected(campaign);
  }

  function handleCreateEvent(date?: Date) {
    setCreateDefaultDate(date ?? new Date());
    setShowCreate(true);
  }

  async function handleCancel(campaign: Campaign) {
    await fetch(`/api/dashboard/ad-campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    setSelected(null);
    load();
  }

  async function handleDelete(campaign: Campaign) {
    await fetch(`/api/dashboard/ad-campaigns/${campaign.id}`, { method: "DELETE" });
    setSelected(null);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm hover:bg-[hsl(var(--muted))]"
          >
            &larr;
          </button>
          <span className="text-sm font-semibold text-[hsl(var(--foreground))] min-w-[9rem] text-center">
            {currentDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
          <button
            type="button"
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm hover:bg-[hsl(var(--muted))]"
          >
            &rarr;
          </button>
        </div>

        <button
          type="button"
          onClick={() => handleCreateEvent()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-bold text-[hsl(var(--primary-foreground))] hover:opacity-90"
        >
          <Plus size={16} /> New Campaign
        </button>
      </div>

      <CalendarBox
        currentDate={currentDate}
        events={events}
        userRole={userRole}
        loading={loading}
        onEventClick={handleEventClick}
        onDateClick={() => {}}
        onLogHours={() => {}}
        onCreateEvent={handleCreateEvent}
      />

      {showCreate && (
        <CreateCampaignModal
          defaultDate={createDefaultDate}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {selected && (
        <CampaignDetailModal
          campaign={selected}
          onClose={() => setSelected(null)}
          onCancel={() => handleCancel(selected)}
          onDelete={() => handleDelete(selected)}
        />
      )}
    </div>
  );
}

function CreateCampaignModal({
  defaultDate,
  onClose,
  onCreated,
}: {
  defaultDate: Date | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<AdPlatform>("meta");
  const [zone, setZone] = useState<AdZone>("core");
  const [date, setDate] = useState(() => {
    const d = defaultDate ?? new Date();
    return d.toISOString().slice(0, 16);
  });
  const [budget, setBudget] = useState("");
  const [audience, setAudience] = useState("");
  const [copy, setCopy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/dashboard/ad-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        platform,
        zone,
        execute_at: new Date(date).toISOString(),
        budget_cents: budget ? Math.round(parseFloat(budget) * 100) : null,
        audience: audience || null,
        copy: copy || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Failed to create campaign.");
      setSubmitting(false);
      return;
    }

    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[hsl(var(--card-foreground))]">New Ad Campaign</h2>
          <button type="button" onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-[hsl(var(--card-foreground))] mb-1">Campaign Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fall promo — 20% off"
              className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[hsl(var(--card-foreground))] mb-1">Zone *</label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value as AdZone)}
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              >
                {Object.entries(ZONE_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[hsl(var(--card-foreground))] mb-1">Platform *</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as AdPlatform)}
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              >
                {Object.entries(PLATFORM_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[hsl(var(--card-foreground))] mb-1">Go live *</label>
            <input
              type="datetime-local"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[hsl(var(--card-foreground))] mb-1">
              Budget (USD) <span className="font-normal text-[hsl(var(--muted-foreground))]">Optional</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="500.00"
              className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[hsl(var(--card-foreground))] mb-1">
              Post Content
            </label>
            <p className="mb-1.5 text-xs text-[hsl(var(--muted-foreground))]">
              The actual ad copy/post text for {ZONE_META[zone].label} on {PLATFORM_META[platform].label}.
            </p>
            <textarea
              rows={6}
              value={copy}
              onChange={(e) => setCopy(e.target.value)}
              placeholder="Write the post..."
              className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[hsl(var(--card-foreground))] mb-1">
              Target Audience <span className="font-normal text-[hsl(var(--muted-foreground))]">Optional</span>
            </label>
            <input
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. 25-45, US, interest in streaming"
              className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
          </div>

          {error && <p className="text-xs font-semibold text-[hsl(var(--destructive))]">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-semibold hover:bg-[hsl(var(--muted))]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-bold text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Schedule Campaign
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CampaignDetailModal({
  campaign,
  onClose,
  onCancel,
  onDelete,
}: {
  campaign: Campaign;
  onClose: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const meta = PLATFORM_META[campaign.payload?.platform];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[hsl(var(--card-foreground))]">{campaign.body}</h2>
          <button type="button" onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <p>
            <span className="font-semibold">Zone:</span>{" "}
            {ZONE_META[campaign.payload?.zone]?.label ?? campaign.payload?.zone ?? "—"}
          </p>
          <p>
            <span className="font-semibold">Platform:</span>{" "}
            <span style={{ color: meta?.color }}>{meta?.label ?? campaign.payload?.platform}</span>
          </p>
          <p>
            <span className="font-semibold">Go live:</span>{" "}
            {new Date(campaign.execute_at).toLocaleString()}
          </p>
          <p>
            <span className="font-semibold">Status:</span> <span className="capitalize">{campaign.status}</span>
          </p>
          {campaign.payload?.budget_cents != null && (
            <p>
              <span className="font-semibold">Budget:</span> ${(campaign.payload.budget_cents / 100).toFixed(2)}
            </p>
          )}
          {campaign.payload?.audience && (
            <p>
              <span className="font-semibold">Audience:</span> {campaign.payload.audience}
            </p>
          )}
          {campaign.payload?.copy && (
            <p className="whitespace-pre-wrap">
              <span className="font-semibold">Post Content:</span> {campaign.payload.copy}
            </p>
          )}
          <p className="text-xs text-[hsl(var(--muted-foreground))] pt-2">
            Not connected to {meta?.label ?? "this platform"} yet — this campaign is a draft/schedule only.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          {campaign.status !== "cancelled" && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-semibold hover:bg-[hsl(var(--muted))]"
            >
              Cancel Campaign
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg bg-[hsl(var(--destructive))] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
