// app/dashboard/[id]/settings/inventory/_components/InventoryCardGrid.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Dense card view of stock — one card per COMPOUND on Labs (per product on
// shop), dose chips across the top, one row per variant.
//
// The grouped table is built for reading a catalog top to bottom. This view is
// built for the opposite job: scanning many product TYPES at once, spotting the
// one that is wrong, and fixing it in place. Labs carries ~880 variants across
// a lot of shapes (vials, kits, capsules, sprays), and a vertical table makes
// that shape impossible to see.
//
// Price and quantity are edited inline, on the row, because the whole point is
// not to open a modal to change one number. They live in DIFFERENT tables —
// quantity on inventory, price on the variant — so each field saves through its
// own handler rather than one combined write.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import React, { useMemo, useState } from "react";
import type { InventoryRow, ProductGroup } from "../page";
import { fulfillmentProviderLabel } from "@/lib/fulfillment/provider-metadata";

function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

/** Compact relative time. Absolute dates make "is this stale?" a mental sum. */
function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "never";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
}

function EditableNumber({
  value,
  onCommit,
  prefix,
  width = 68,
  title,
}: {
  value: number | null;
  onCommit: (next: number) => Promise<void> | void;
  prefix?: string;
  width?: number;
  title?: string;
}) {
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Re-sync when the row's value changes underneath an untouched field, so a
  // refresh or another edit isn't masked by stale local state.
  React.useEffect(() => {
    if (!dirty) setDraft(value == null ? "" : String(value));
  }, [value, dirty]);

  const commit = async () => {
    if (!dirty) return;
    const n = Number(draft);
    if (!Number.isFinite(n)) {
      setDraft(value == null ? "" : String(value));
      setDirty(false);
      return;
    }
    setBusy(true);
    try {
      await onCommit(n);
      setDirty(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inv-edit" title={title}>
      {prefix && <span className="inv-edit__prefix">{prefix}</span>}
      <input
        type="number"
        value={draft}
        disabled={busy}
        style={{ width }}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value == null ? "" : String(value));
            setDirty(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={"inv-edit__input" + (dirty ? " is-dirty" : "")}
      />
    </span>
  );
}

export default function InventoryCardGrid({
  groups,
  lowStockThreshold,
  onSaveQuantity,
  onSavePrice,
}: {
  groups: ProductGroup[];
  lowStockThreshold: number;
  onSaveQuantity: (row: InventoryRow, quantity: number) => Promise<void>;
  onSavePrice: (row: InventoryRow, priceCents: number) => Promise<void>;
}) {
  if (!groups.length) {
    return (
      <div className="inv-cards__empty">
        Nothing matches those filters.
      </div>
    );
  }

  return (
    <div className="inv-cards">
      {groups.map((g) => (
        <ProductCard
          key={g.product_id}
          group={g}
          lowStockThreshold={lowStockThreshold}
          onSaveQuantity={onSaveQuantity}
          onSavePrice={onSavePrice}
        />
      ))}
    </div>
  );
}

function ProductCard({
  group,
  lowStockThreshold,
  onSaveQuantity,
  onSavePrice,
}: {
  group: ProductGroup;
  lowStockThreshold: number;
  onSaveQuantity: (row: InventoryRow, quantity: number) => Promise<void>;
  onSavePrice: (row: InventoryRow, priceCents: number) => Promise<void>;
}) {
  // Highlighting a chip filters the rows below rather than navigating: on a
  // compound with 12 doses, finding the one you meant is the slow part.
  const [focus, setFocus] = useState<string | null>(null);

  // A Labs card now holds every dose of one compound, so the chips key on dose
  // and fall back to variant title for shop cards, which have no dose.
  const doses = useMemo(() => {
    const seen = new Map<string, number>();
    for (const v of group.variants) {
      const key = v.dose || v.variant_title || "Default";
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return Array.from(seen.entries());
  }, [group.variants]);

  const totals = useMemo(() => {
    const tracked = group.variants.filter((v) => v.track_inventory);
    return {
      tracked: tracked.length,
      units: tracked.reduce((n, v) => n + (v.quantity ?? 0), 0),
      out: tracked.filter((v) => (v.quantity ?? 0) <= 0).length,
      low: tracked.filter(
        (v) => (v.quantity ?? 0) > 0 && (v.quantity ?? 0) <= lowStockThreshold,
      ).length,
    };
  }, [group.variants, lowStockThreshold]);

  const shown = focus
    ? group.variants.filter((v) => (v.dose || v.variant_title || "Default") === focus)
    : group.variants;

  return (
    <section className="inv-card">
      <header className="inv-card__head">
        <h3 className="inv-card__title" title={group.product_title}>
          {group.product_title}
        </h3>
        <div className="inv-card__stats">
          {group.variants.some((variant) => variant.supplier_managed) && (
            <span className="inv-pill">Supplier managed</span>
          )}
          {totals.out > 0 && <span className="inv-pill inv-pill--out">{totals.out} out</span>}
          {totals.low > 0 && <span className="inv-pill inv-pill--low">{totals.low} low</span>}
          {totals.tracked > 0 && <span className="inv-pill">{totals.units} units</span>}
        </div>
      </header>

      {doses.length > 1 && (
        <div className="inv-card__chips">
          <button
            type="button"
            className={"inv-chip" + (focus === null ? " is-active" : "")}
            onClick={() => setFocus(null)}
          >
            All {group.variants.length}
          </button>
          {doses.map(([label, n]) => (
            <button
              key={label}
              type="button"
              className={"inv-chip" + (focus === label ? " is-active" : "")}
              onClick={() => setFocus(focus === label ? null : label)}
              title={n > 1 ? `${label} — ${n} variants` : label}
            >
              {label}
              {n > 1 && <span className="inv-chip__n">{n}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="inv-card__rows">
        {shown.map((v) => {
          const qty = v.quantity ?? 0;
          const state = !v.track_inventory
            ? "untracked"
            : qty <= 0
              ? "out"
              : qty <= lowStockThreshold
                ? "low"
                : "ok";

          return (
            <div key={v.variant_id} className={`inv-row inv-row--${state}`}>
              <div className="inv-row__id">
                <span className="inv-row__variant">
                  {v.dose && <span className="inv-row__dose">{v.dose}</span>}
                  {v.variant_title || "Default"}
                </span>
                <span className="inv-row__sku">{v.sku || "no SKU"}</span>
              </div>

              <div className="inv-row__fields">
                <EditableNumber
                  title="Price — saved to the variant"
                  prefix="$"
                  width={72}
                  value={v.price_cents == null ? null : v.price_cents / 100}
                  onCommit={(n) => onSavePrice(v, Math.round(n * 100))}
                />
                {v.supplier_managed ? (
                  <span className="inv-pill" title="Availability is managed by the fulfillment supplier">
                    {fulfillmentProviderLabel(v.fulfillment_provider)}
                  </span>
                ) : (
                  <EditableNumber
                    title="Stock on hand"
                    width={62}
                    value={qty}
                    onCommit={(n) => onSaveQuantity(v, Math.round(n))}
                  />
                )}
              </div>

              <div className="inv-row__meta">
                {/* The distinction that matters when stock looks wrong: did an
                    ORDER move this, or did a person? reference_type carries it. */}
                <span className="inv-row__move" title={v.last_movement_note ?? undefined}>
                  {v.last_movement_at
                    ? `${v.last_movement_reason ?? "moved"} ${v.last_movement_delta != null ? (v.last_movement_delta > 0 ? `+${v.last_movement_delta}` : v.last_movement_delta) : ""} · ${ago(v.last_movement_at)}`
                    : "no movement recorded"}
                </span>
                <span className="inv-row__touched">edited {ago(v.updated_at)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Money helper is exported for the table view to share the same formatting. */
export { money };
