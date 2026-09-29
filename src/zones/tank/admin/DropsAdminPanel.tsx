"use client";

import { useEffect, useState } from "react";
import { Gift, Plus, Trash2, X, Zap } from "lucide-react";
import {
  listAllDropCampaignsAction,
  createDropCampaignAction,
  setDropCampaignActiveAction,
  deleteDropCampaignAction,
} from "../server/dropCampaigns";
import type { DropCampaign, DropRewardType, DropTier } from "../dropCampaignTypes";

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-border p-5">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

const EMPTY_TIER: DropTier = { minutes: 15, rewardType: "tokens", rewardValue: 15, label: "" };

function TierEditor({
  tiers,
  onChange,
}: {
  tiers: DropTier[];
  onChange: (tiers: DropTier[]) => void;
}) {
  const update = (i: number, patch: Partial<DropTier>) =>
    onChange(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const remove = (i: number) => onChange(tiers.filter((_, idx) => idx !== i));
  const add = () => onChange([...tiers, { ...EMPTY_TIER }]);

  return (
    <div className="space-y-2">
      {tiers.map((tier, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5">
          <input
            type="number"
            min={1}
            value={tier.minutes}
            onChange={(e) => update(i, { minutes: Math.max(1, Number(e.target.value) || 1) })}
            className="w-16 rounded border border-border bg-background px-2 py-1 text-sm"
            title="Minutes to unlock"
          />
          <span className="text-xs text-muted-foreground">min →</span>
          <select
            value={tier.rewardType}
            onChange={(e) => update(i, { rewardType: e.target.value as DropRewardType })}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="tokens">Tokens</option>
            <option value="xp">XP</option>
            <option value="item">Item</option>
          </select>
          {tier.rewardType === "item" ? (
            <input
              type="text"
              value={tier.itemSlug ?? ""}
              onChange={(e) => update(i, { itemSlug: e.target.value.trim() })}
              placeholder="item slug"
              className="w-32 rounded border border-border bg-background px-2 py-1 text-sm"
            />
          ) : (
            <input
              type="number"
              min={0}
              value={tier.rewardValue ?? 0}
              onChange={(e) => update(i, { rewardValue: Math.max(0, Number(e.target.value) || 0) })}
              className="w-20 rounded border border-border bg-background px-2 py-1 text-sm"
            />
          )}
          <input
            type="text"
            value={tier.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Tier label (shown to viewers)"
            className="min-w-[140px] flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500"
            aria-label="Remove tier"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" /> Add tier
      </button>
    </div>
  );
}

export function DropsAdminPanel() {
  const [campaigns, setCampaigns] = useState<DropCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [roomKey, setRoomKey] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<string>("");
  const [tiers, setTiers] = useState<DropTier[]>([{ ...EMPTY_TIER }]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    void listAllDropCampaignsAction()
      .then((res) => setCampaigns(Array.isArray(res) ? res : []))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim() || tiers.some((t) => !t.label.trim())) {
      setError("Title and every tier's label are required.");
      return;
    }
    setCreating(true);
    try {
      const res = await createDropCampaignAction({
        title,
        description: description || undefined,
        roomKey: roomKey.trim() || null,
        tiers,
        durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      });
      if (!res.success) {
        setError(res.error ?? "Failed to create campaign.");
        return;
      }
      setTitle("");
      setDescription("");
      setRoomKey("");
      setDurationMinutes("");
      setTiers([{ ...EMPTY_TIER }]);
      refresh();
    } finally {
      setCreating(false);
    }
  };

  const flashDrop = async () => {
    setCreating(true);
    try {
      await createDropCampaignAction({
        title: "Flash Drop",
        description: "Spontaneous high-energy watch reward.",
        roomKey: null,
        durationMinutes: 15,
        tiers: [{ minutes: 15, rewardType: "tokens", rewardValue: 50, label: "Flash Drop Bonus" }],
      });
      refresh();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel
        title="Active & past campaigns"
        description="Toggle a campaign off to pause it instantly; viewer progress is kept."
        action={
          <button
            type="button"
            onClick={flashDrop}
            disabled={creating}
            className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" /> Trigger Flash Drop (15 min, all rooms)
          </button>
        }
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No campaigns yet — create one below.</p>
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {c.title}
                    {c.roomKey && <span className="ml-2 text-xs font-normal text-muted-foreground">room: {c.roomKey}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.tiers.length} tier{c.tiers.length !== 1 ? "s" : ""}
                    {c.endsAt ? ` · ends ${new Date(c.endsAt).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void setDropCampaignActiveAction(c.id, !c.isActive).then(refresh)}
                    className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                      c.isActive ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.isActive ? "Active" : "Paused"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteDropCampaignAction(c.id).then(refresh)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500"
                    aria-label="Delete campaign"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="New campaign" description="Grants live to the Drops HUD widget the moment it's created.">
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="rounded bg-red-500/10 px-3 py-2 text-xs font-bold text-red-500">{error}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-muted-foreground">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Night Owl Campaign"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-muted-foreground">Room key (optional)</label>
              <input
                type="text"
                value={roomKey}
                onChange={(e) => setRoomKey(e.target.value)}
                placeholder="kitchen — blank = all rooms"
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-muted-foreground">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="w-48">
            <label className="mb-1 block text-xs font-bold text-muted-foreground">Duration, minutes (optional)</label>
            <input
              type="number"
              min={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder="blank = no end time"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-muted-foreground">Tiers</label>
            <TierEditor tiers={tiers} onChange={setTiers} />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <Gift className="h-4 w-4" /> Create campaign
          </button>
        </form>
      </Panel>
    </div>
  );
}

export default DropsAdminPanel;
