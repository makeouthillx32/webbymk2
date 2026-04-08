// app/settings/discounts/_components/EditDiscountForm.tsx
"use client";

import { useEffect, useState } from "react";
import { DiscountModal } from "./DiscountModal";
import type { DiscountRow } from "./DiscountsTable";

type Props = {
  open: boolean;
  discount: DiscountRow | null;
  onClose: () => void;
  onSave: (data: {
    id: string;
    code: string;
    type: "percentage" | "fixed_amount";
    percent_off: number | null;
    amount_off_cents: number | null;
    max_uses: number | null;
    starts_at: string | null;
    ends_at: string | null;
    is_active: boolean;
  }) => Promise<void> | void;
};

export function EditDiscountForm({ open, discount, onClose, onSave }: Props) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percentage" | "fixed_amount">("percentage");
  const [percentOff, setPercentOff] = useState(0);
  const [amountOffDollars, setAmountOffDollars] = useState(0);
  const [maxUses, setMaxUses] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState<string>("");
  const [endsAt, setEndsAt] = useState<string>("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!discount) return;
    setCode(discount.code ?? "");
    setType(discount.type);
    setPercentOff(discount.percent_off ?? 0);
    setAmountOffDollars(((discount.amount_off_cents ?? 0) / 100) || 0);
    setMaxUses(discount.max_uses ?? null);
    setStartsAt(discount.starts_at ? discount.starts_at.slice(0, 16) : "");
    setEndsAt(discount.ends_at ? discount.ends_at.slice(0, 16) : "");
    setActive(!!discount.is_active);
  }, [discount]);

  if (!open || !discount) return null;

  const submit = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;

    const payload =
      type === "percentage"
        ? {
            id: discount.id,
            code: c,
            type,
            percent_off: Math.max(0, Math.min(100, Number(percentOff) || 0)),
            amount_off_cents: null,
            max_uses: maxUses == null ? null : Math.max(0, Number(maxUses) || 0),
            starts_at: startsAt ? new Date(startsAt).toISOString() : null,
            ends_at: endsAt ? new Date(endsAt).toISOString() : null,
            is_active: active,
          }
        : {
            id: discount.id,
            code: c,
            type,
            percent_off: null,
            amount_off_cents: Math.max(0, Math.round((Number(amountOffDollars) || 0) * 100)),
            max_uses: maxUses == null ? null : Math.max(0, Number(maxUses) || 0),
            starts_at: startsAt ? new Date(startsAt).toISOString() : null,
            ends_at: endsAt ? new Date(endsAt).toISOString() : null,
            is_active: active,
          };

    try {
      setSaving(true);
      await onSave(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <DiscountModal
      open={open}
      title="Edit discount"
      description="Update the discount code and rules."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
          >
            <option value="percentage">Percentage</option>
            <option value="fixed_amount">Fixed amount</option>
          </select>
        </div>

        {type === "percentage" ? (
          <div>
            <label className="text-sm font-medium text-[hsl(var(--foreground))]">Percent off</label>
            <input
              type="number"
              value={percentOff}
              onChange={(e) => setPercentOff(Number(e.target.value))}
              className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
            />
          </div>
        ) : (
          <div>
            <label className="text-sm font-medium text-[hsl(var(--foreground))]">Amount off ($)</label>
            <input
              type="number"
              value={amountOffDollars}
              onChange={(e) => setAmountOffDollars(Number(e.target.value))}
              className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
            />
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Max uses (optional)</label>
          <input
            type="number"
            value={maxUses ?? ""}
            onChange={(e) => setMaxUses(e.target.value === "" ? null : Number(e.target.value))}
            className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-[hsl(var(--foreground))]">Starts at</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[hsl(var(--foreground))]">Ends at</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-[hsl(var(--border))]"
          />
          Active
        </label>

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
            Save
          </button>
        </div>
      </div>
    </DiscountModal>
  );
}