// app/settings/creators/_components/EditCreatorModal.tsx
"use client";

import { useEffect, useState } from "react";
import { CreatorModal } from "./CreatorModal";
import type { CreatorRow } from "./CreatorsTable";

type Tier = { id: string; name: string; percent_off: number };

type Props = {
  open: boolean;
  creator: CreatorRow | null;
  onClose: () => void;
  onSave: (data: {
    id: string;
    tier_id: string;
    status: "active" | "paused" | "removed";
    code: string;
    notes: string;
    cashout_threshold_cents: number;
  }) => Promise<void> | void;
};

export function EditCreatorModal({ open, creator, onClose, onSave }: Props) {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [tierId, setTierId] = useState("");
  const [status, setStatus] = useState<"active" | "paused" | "removed">("active");
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");
  const [thresholdDollars, setThresholdDollars] = useState(100);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/creator/tiers")
      .then((res) => res.json())
      .then((data) => setTiers(data.tiers ?? []))
      .catch(() => setTiers([]));
  }, [open]);

  useEffect(() => {
    if (!creator) return;
    setTierId(creator.creator_tiers?.id ?? "");
    setStatus(creator.status);
    setCode(creator.discounts?.code ?? "");
    setNotes(creator.notes ?? "");
    setThresholdDollars((creator.cashout_threshold_cents ?? 10000) / 100);
    setError(null);
  }, [creator]);

  if (!open || !creator) return null;

  const submit = async () => {
    setError(null);
    const c = code.trim().toUpperCase();
    if (!c) return setError("Code can't be empty.");

    try {
      setSaving(true);
      await onSave({
        id: creator.id,
        tier_id: tierId,
        status,
        code: c,
        notes,
        cashout_threshold_cents: Math.max(0, Math.round((Number(thresholdDollars) || 0) * 100)),
      });
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CreatorModal
      open={open}
      title="Edit creator"
      description="Promote/demote their tier, rename their code, or pause them."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Tier</label>
          <select
            value={tierId}
            onChange={(e) => setTierId(e.target.value)}
            className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
          >
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.percent_off}%
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Discount code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm font-mono"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="removed">Removed</option>
          </select>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Pausing or removing also deactivates their code at checkout.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Cash-out minimum ($)</label>
          <input
            type="number"
            value={thresholdDollars}
            onChange={(e) => setThresholdDollars(Number(e.target.value))}
            className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Notes (internal)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[var(--radius)] border border-[hsl(var(--border))] px-4 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="h-9 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </CreatorModal>
  );
}
