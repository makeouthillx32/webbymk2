// app/dashboard/[id]/settings/research-products/_components/ProductsCardGrid.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Card view of the research catalogue — one card per COMPOUND, dose chips
// across the top, matching the Labs Inventory grid.
//
// The table answers "tell me about this product". This answers "show me the
// shape of the catalogue" — 751 products across 311 compounds is a set you scan
// for gaps, not one you read row by row. Each card leads with the artwork,
// because a missing image is the most common gap and the fastest to spot
// visually.
//
// Every card surfaces the four axes at a glance — compound, form, dose, pack —
// plus the completeness signals the filters key on: image, COA, price.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import React, { useMemo, useState } from "react";
import { FlaskConical, ImageIcon, Settings2 } from "lucide-react";
import { getPrimaryImageUrl } from "@/lib/images";
import type { ProductRow } from "./ProductsTable";

/** Everything a product needs before it can go live. */
function completeness(p: ProductRow) {
  return {
    hasImage: (p.product_images?.length ?? 0) > 0,
    hasCoa: (p.lab_reports?.length ?? 0) > 0,
    hasPrice: (p.price_cents ?? 0) > 0,
  };
}

/** The dose portion of a title — what the compound name leaves behind. */
function doseOf(p: ProductRow): string {
  if (!p.compound) return p.title;
  const rest = p.title.startsWith(p.compound) ? p.title.slice(p.compound.length) : p.title;
  return rest.replace(/^[\s,\-–/]+/, "").trim() || "—";
}

export default function ProductsCardGrid({
  products,
  onManage,
  onManageCOA,
}: {
  products: ProductRow[];
  onManage: (p: ProductRow) => void;
  onManageCOA?: (p: ProductRow) => void;
}) {
  // Group by compound, falling back to the product's own id so a row with no
  // compound still renders rather than silently vanishing into a shared bucket.
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; items: ProductRow[] }>();
    for (const p of products) {
      const key = p.compound || p.id;
      if (!map.has(key)) map.set(key, { title: p.compound || p.title, items: [] });
      map.get(key)!.items.push(p);
    }
    return Array.from(map.entries())
      .map(([key, g]) => ({ key, ...g }))
      .sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title));
  }, [products]);

  if (!groups.length) {
    return (
      <p className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">
        No products match those filters.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
      {groups.map((g) => (
        <CompoundCard key={g.key} title={g.title} items={g.items} onManage={onManage} onManageCOA={onManageCOA} />
      ))}
    </div>
  );
}

function CompoundCard({
  title,
  items,
  onManage,
  onManageCOA,
}: {
  title: string;
  items: ProductRow[];
  onManage: (p: ProductRow) => void;
  onManageCOA?: (p: ProductRow) => void;
}) {
  const [focus, setFocus] = useState<string | null>(null);

  const forms = useMemo(
    () => Array.from(new Set(items.map((p) => p.form).filter(Boolean))) as string[],
    [items],
  );

  const gaps = useMemo(() => {
    let noImage = 0, noCoa = 0, noPrice = 0;
    for (const p of items) {
      const c = completeness(p);
      if (!c.hasImage) noImage++;
      if (!c.hasCoa) noCoa++;
      if (!c.hasPrice) noPrice++;
    }
    return { noImage, noCoa, noPrice };
  }, [items]);

  const shown = focus ? items.filter((p) => p.id === focus) : items;
  // The card's own artwork: first product that has any.
  const cover = useMemo(() => {
    for (const p of items) {
      const url = getPrimaryImageUrl(p.product_images ?? []);
      if (url) return url;
    }
    return null;
  }, [items]);

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <header className="flex items-start gap-3 border-b border-[hsl(var(--border))] p-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon size={16} className="text-[hsl(var(--muted-foreground))]" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-[hsl(var(--foreground))]" title={title}>
            {title}
          </h3>
          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
            {items.length} {items.length === 1 ? "product" : "products"}
            {forms.length > 0 && ` · ${forms.join(" · ")}`}
          </p>

          <div className="mt-1 flex flex-wrap gap-1">
            {gaps.noImage > 0 && <Gap label={`${gaps.noImage} no image`} />}
            {gaps.noCoa > 0 && <Gap label={`${gaps.noCoa} no COA`} />}
            {gaps.noPrice > 0 && <Gap label={`${gaps.noPrice} no price`} />}
          </div>
        </div>
      </header>

      {items.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-[hsl(var(--border))] px-3 py-2">
          <Chip active={focus === null} onClick={() => setFocus(null)}>All {items.length}</Chip>
          {items.map((p) => (
            <Chip key={p.id} active={focus === p.id} onClick={() => setFocus(focus === p.id ? null : p.id)}>
              {doseOf(p)}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex flex-col">
        {shown.map((p) => {
          const c = completeness(p);
          return (
            <div
              key={p.id}
              className="flex items-center gap-2 border-t border-[hsl(var(--border))]/60 px-3 py-2 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-[hsl(var(--foreground))]">
                  {doseOf(p)}
                  {p.status && p.status !== "active" && (
                    <span className="ml-1.5 rounded bg-[hsl(var(--muted))] px-1 py-px text-[9px] uppercase text-[hsl(var(--muted-foreground))]">
                      {p.status}
                    </span>
                  )}
                </p>
                <p className="truncate font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{p.slug}</p>
              </div>

              <span className={"text-xs font-semibold " + (c.hasPrice ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--destructive))]")}>
                {c.hasPrice ? `$${((p.price_cents ?? 0) / 100).toFixed(2)}` : "no price"}
              </span>

              <button
                type="button"
                onClick={() => (onManageCOA ? onManageCOA(p) : onManage(p))}
                title={c.hasCoa ? `${p.lab_reports!.length} COA attached` : "No COA — click to upload"}
                className={
                  "shrink-0 rounded p-1 transition " +
                  (c.hasCoa ? "text-emerald-500 hover:bg-emerald-500/10" : "text-amber-500 hover:bg-amber-500/10")
                }
              >
                <FlaskConical size={13} />
              </button>

              <button
                type="button"
                onClick={() => onManage(p)}
                title="Manage"
                className="shrink-0 rounded p-1 text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
              >
                <Settings2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Gap({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600 dark:text-amber-400">
      {label}
    </span>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-2 py-0.5 text-[11px] transition " +
        (active
          ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
          : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]")
      }
    >
      {children}
    </button>
  );
}
