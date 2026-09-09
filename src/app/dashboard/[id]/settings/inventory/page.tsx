// app/dashboard/[id]/settings/inventory/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/utils/supabase/client";

import "./_components/inventory.scss";

import { LoadingState } from "./_components/LoadingState";
import { ErrorAlert } from "./_components/ErrorAlert";
import { InventoryActionBar } from "./_components/InventoryActionBar";
import { EditInventoryForm } from "./_components/EditInventoryForm";
import GroupedInventoryTable from "./_components/GroupedInventoryTable";
import InventoryCardGrid from "./_components/InventoryCardGrid";
import ShippingBoxes from "./_components/ShippingBoxes";

export type InventoryRow = {
  inventory_id: string;
  variant_id: string;
  product_id: string | null;
  product_title: string | null;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  track_inventory: boolean;
  allow_backorder: boolean;
  updated_at: string | null;
  /** Lives on the variant, not on inventory — edited here for convenience. */
  price_cents: number | null;
  /** Latest row from *_inventory_movements for this variant, if any. */
  last_movement_at: string | null;
  last_movement_reason: string | null;
  last_movement_delta: number | null;
  last_movement_note: string | null;
  /** Labs only: the substance, dose stripped. Groups doses onto one card. */
  compound: string | null;
  /** The dose portion of the product title — "10mg", "6mg/3mg". */
  dose: string | null;
};

export type ProductGroup = {
  product_id: string;
  product_title: string;
  variants: InventoryRow[];
};

/** Split "Tesamorelin 10mg" into its compound and the dose that remains. */
function splitDose(title: string | null, compound: string | null): string | null {
  if (!title) return null;
  if (!compound) return null;
  const rest = title.startsWith(compound) ? title.slice(compound.length) : title;
  return rest.replace(/^[\s,\-–/]+/, "").trim() || null;
}

/**
 * Which catalog this page manages.
 *
 * Shop and Labs keep entirely separate tables — inventory/product_variants/
 * products versus research_inventory/research_product_variants/
 * research_products — with byte-identical column shapes and a mirrored foreign
 * key chain. That makes one page serve both; forking it would leave two copies
 * of the stock-editing rules to drift apart, which matters more here than most
 * places because these numbers are what a customer is actually sold against.
 */
export type InventoryCatalog = "shop" | "labs";

const CATALOGS: Record<InventoryCatalog, {
  inventory: string;
  variants: string;
  products: string;
  movements: string;
  label: string;
}> = {
  shop: {
    inventory: "inventory",
    variants: "product_variants",
    products: "products",
    movements: "inventory_movements",
    label: "Inventory",
  },
  labs: {
    inventory: "research_inventory",
    variants: "research_product_variants",
    products: "research_products",
    movements: "research_inventory_movements",
    label: "Labs Inventory",
  },
};

export default function InventoryPage({
  catalog = "shop",
  showShippingBoxes,
}: {
  catalog?: InventoryCatalog;
  /**
   * Shipping boxes are a single shared set of package presets, not per-catalog.
   * Rendering the same editor on both pages would give two views of one table
   * that silently disagree after an edit, so it stays on the shop page.
   */
  showShippingBoxes?: boolean;
} = {}) {
  const cat = CATALOGS[catalog];
  const withBoxes = showShippingBoxes ?? catalog === "shop";

  const supabase = useMemo(() => createBrowserClient(), []);

  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showOnlyTracked, setShowOnlyTracked] = useState(false);
  const [showLowStock, setShowLowStock] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);

  // Cards default on Labs: ~880 variants across many product shapes is the case
  // a vertical table reads worst.
  const [view, setView] = useState<"cards" | "table">(catalog === "labs" ? "cards" : "table");
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<InventoryRow | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);

    // The embeds are ALIASED to `variant` / `product`. PostgREST otherwise keys
    // them by table name, which differs per catalog and would force two mappers.
    const { data, error } = await supabase
      .from(cat.inventory)
      .select(
        `
        id,
        variant_id,
        quantity,
        track_inventory,
        allow_backorder,
        updated_at,
        variant:${cat.variants} (
          id,
          title,
          sku,
          price_cents,
          product_id,
          product:${cat.products} (
            id,
            title
            ${catalog === "labs" ? ", compound" : ""}
          )
        )
      `
      )
      .order("updated_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const mapped: InventoryRow[] = (data ?? []).map((r: any) => ({
      inventory_id: r.id,
      variant_id: r.variant_id,
      product_id: r.variant?.product?.id ?? null,
      product_title: r.variant?.product?.title ?? null,
      variant_title: r.variant?.title ?? null,
      sku: r.variant?.sku ?? null,
      quantity: r.quantity ?? 0,
      track_inventory: !!r.track_inventory,
      allow_backorder: !!r.allow_backorder,
      updated_at: r.updated_at ?? null,
      price_cents: r.variant?.price_cents ?? null,
      last_movement_at: null,
      last_movement_reason: null,
      last_movement_delta: null,
      last_movement_note: null,
      compound: r.variant?.product?.compound ?? null,
      dose: splitDose(r.variant?.product?.title ?? null, r.variant?.product?.compound ?? null),
    }));

    // Movements are fetched separately: they key on variant_id with no foreign
    // key to inventory, so PostgREST cannot embed them. One ordered pull and a
    // first-wins map beats N queries — and the table is currently tiny.
    const { data: moves } = await supabase
      .from(cat.movements)
      .select("variant_id, delta_qty, reason, note, created_at")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (moves?.length) {
      const latest = new Map<string, any>();
      for (const m of moves as any[]) {
        if (!latest.has(m.variant_id)) latest.set(m.variant_id, m);
      }
      for (const row of mapped) {
        const m = latest.get(row.variant_id);
        if (!m) continue;
        row.last_movement_at = m.created_at ?? null;
        row.last_movement_reason = m.reason ?? null;
        row.last_movement_delta = m.delta_qty ?? null;
        row.last_movement_note = m.note ?? null;
      }
    }

    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  // Filter rows, then group by product
  const groups = useMemo<ProductGroup[]>(() => {
    const q = search.trim().toLowerCase();

    const filtered = rows.filter((r) => {
      if (showOnlyTracked && !r.track_inventory) return false;
      if (showLowStock) {
        if (!r.track_inventory) return false;
        if ((r.quantity ?? 0) > lowStockThreshold) return false;
      }
      if (!q) return true;
      const hay = [r.compound ?? "", r.product_title ?? "", r.variant_title ?? "", r.sku ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    // Group by COMPOUND on Labs, by product elsewhere.
    //
    // Labs sells one substance at many doses as separate products, so grouping
    // by product_id produced four Tesamorelin cards for one thing to restock.
    // Shop products have no compound and fall back to product_id unchanged.
    const map = new Map<string, ProductGroup>();
    for (const row of filtered) {
      const key = row.compound || row.product_id || "__unknown__";
      if (!map.has(key)) {
        map.set(key, {
          product_id: key,
          product_title: row.compound || row.product_title || "Unknown Product",
          variants: [],
        });
      }
      map.get(key)!.variants.push(row);
    }

    // Busiest first: a compound with the most to review is the one you came for.
    return Array.from(map.values()).sort((a, b) => b.variants.length - a.variants.length);
  }, [rows, search, showOnlyTracked, showLowStock, lowStockThreshold]);

  const handleEdit = (row: InventoryRow) => {
    setSelected(row);
    setEditOpen(true);
  };

  const handleSave = async (data: {
    inventory_id: string;
    quantity: number;
    track_inventory: boolean;
    allow_backorder: boolean;
  }) => {
    setErr(null);
    const { error } = await supabase
      .from(cat.inventory)
      .update({
        quantity: data.quantity,
        track_inventory: data.track_inventory,
        allow_backorder: data.allow_backorder,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.inventory_id);

    if (error) { setErr(error.message); return; }

    setRows((prev) =>
      prev.map((r) =>
        r.inventory_id === data.inventory_id
          ? { ...r, ...data, updated_at: new Date().toISOString() }
          : r
      )
    );
  };

  /** Quantity lives on the inventory row. */
  const handleSaveQuantity = async (row: InventoryRow, quantity: number) => {
    setErr(null);
    const { error } = await supabase
      .from(cat.inventory)
      .update({ quantity, updated_at: new Date().toISOString() })
      .eq("id", row.inventory_id);
    if (error) { setErr(error.message); return; }
    setRows((prev) =>
      prev.map((r) =>
        r.inventory_id === row.inventory_id
          ? { ...r, quantity, updated_at: new Date().toISOString() }
          : r,
      ),
    );
  };

  /** Price lives on the VARIANT — a different table from quantity. */
  const handleSavePrice = async (row: InventoryRow, price_cents: number) => {
    setErr(null);
    const { error } = await supabase
      .from(cat.variants)
      .update({ price_cents })
      .eq("id", row.variant_id);
    if (error) { setErr(error.message); return; }
    setRows((prev) =>
      prev.map((r) => (r.variant_id === row.variant_id ? { ...r, price_cents } : r)),
    );
  };

  const handleReseedMissing = async () => {
    setErr(null);
    const { data: variants, error: vErr } = await supabase
      .from(cat.variants)
      .select("id");
    if (vErr) { setErr(vErr.message); return; }

    const variantIds: string[] = (variants ?? []).map((v: any) => v.id);
    if (!variantIds.length) return;

    const { data: existing, error: eErr } = await supabase
      .from(cat.inventory)
      .select("variant_id");
    if (eErr) { setErr(eErr.message); return; }

    const existingSet = new Set((existing ?? []).map((x: any) => x.variant_id));
    const missing = variantIds.filter((id) => !existingSet.has(id));
    if (!missing.length) { await load(); return; }

    const insertRows = missing.map((id) => ({
      variant_id: id,
      quantity: 25,
      track_inventory: true,
      allow_backorder: false,
    }));

    const { error: iErr } = await supabase.from(cat.inventory).insert(insertRows);
    if (iErr) { setErr(iErr.message); return; }
    await load();
  };

  return (
    <div className="inventory-manager">
      <div className="inventory-header">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">{cat.label}</h1>
            <div className="inline-flex rounded-md border border-[hsl(var(--border))] p-0.5">
              {(["cards", "table"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={
                    "rounded px-2 py-0.5 text-xs capitalize transition " +
                    (view === v
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "text-[hsl(var(--muted-foreground))]")
                  }
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Manage stock per variant. Products collapse — click to expand variants.
          </p>
        </div>

        <InventoryActionBar
          search={search}
          onSearchChange={setSearch}
          showOnlyTracked={showOnlyTracked}
          onShowOnlyTrackedChange={setShowOnlyTracked}
          showLowStock={showLowStock}
          onShowLowStockChange={setShowLowStock}
          lowStockThreshold={lowStockThreshold}
          onLowStockThresholdChange={setLowStockThreshold}
          onRefresh={load}
          onReseedMissing={handleReseedMissing}
        />
      </div>

      {err && <ErrorAlert message={err} onRetry={load} />}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="inventory-table">
          {view === "cards" ? (
            <InventoryCardGrid
              groups={groups}
              lowStockThreshold={lowStockThreshold}
              onSaveQuantity={handleSaveQuantity}
              onSavePrice={handleSavePrice}
            />
          ) : (
            <GroupedInventoryTable
              groups={groups}
              lowStockThreshold={lowStockThreshold}
              onEdit={handleEdit}
              expandAll={!!search}
            />
          )}
        </div>
      )}

      <EditInventoryForm
        open={editOpen}
        row={selected}
        onClose={() => setEditOpen(false)}
        onSave={handleSave}
      />

      {/* ── Shipping Boxes ── shared presets, shop page only. */}
      {withBoxes && (
        <div className="mt-10 border-t pt-8">
          <ShippingBoxes />
        </div>
      )}
    </div>
  );
}