// app/dashboard/[id]/settings/inventory/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

import "./_components/inventory.scss";

import { LoadingState } from "./_components/LoadingState";
import { ErrorAlert } from "./_components/ErrorAlert";
import { InventoryActionBar } from "./_components/InventoryActionBar";
import { EditInventoryForm } from "./_components/EditInventoryForm";
import GroupedInventoryTable from "./_components/GroupedInventoryTable";
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
};

export type ProductGroup = {
  product_id: string;
  product_title: string;
  variants: InventoryRow[];
};

export default function InventoryPage() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showOnlyTracked, setShowOnlyTracked] = useState(false);
  const [showLowStock, setShowLowStock] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);

  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<InventoryRow | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);

    const { data, error } = await supabase
      .from("inventory")
      .select(
        `
        id,
        variant_id,
        quantity,
        track_inventory,
        allow_backorder,
        updated_at,
        product_variants (
          id,
          title,
          sku,
          product_id,
          products (
            id,
            title
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
      product_id: r.product_variants?.products?.id ?? null,
      product_title: r.product_variants?.products?.title ?? null,
      variant_title: r.product_variants?.title ?? null,
      sku: r.product_variants?.sku ?? null,
      quantity: r.quantity ?? 0,
      track_inventory: !!r.track_inventory,
      allow_backorder: !!r.allow_backorder,
      updated_at: r.updated_at ?? null,
    }));

    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const hay = [r.product_title ?? "", r.variant_title ?? "", r.sku ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    // Group by product_id
    const map = new Map<string, ProductGroup>();
    for (const row of filtered) {
      const pid = row.product_id ?? "__unknown__";
      if (!map.has(pid)) {
        map.set(pid, {
          product_id: pid,
          product_title: row.product_title ?? "Unknown Product",
          variants: [],
        });
      }
      map.get(pid)!.variants.push(row);
    }
    return Array.from(map.values());
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
      .from("inventory")
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

  const handleReseedMissing = async () => {
    setErr(null);
    const { data: variants, error: vErr } = await supabase
      .from("product_variants")
      .select("id");
    if (vErr) { setErr(vErr.message); return; }

    const variantIds: string[] = (variants ?? []).map((v: any) => v.id);
    if (!variantIds.length) return;

    const { data: existing, error: eErr } = await supabase
      .from("inventory")
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

    const { error: iErr } = await supabase.from("inventory").insert(insertRows);
    if (iErr) { setErr(iErr.message); return; }
    await load();
  };

  return (
    <div className="inventory-manager">
      <div className="inventory-header">
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Inventory</h1>
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
          <GroupedInventoryTable
            groups={groups}
            lowStockThreshold={lowStockThreshold}
            onEdit={handleEdit}
            expandAll={!!search}
          />
        </div>
      )}

      <EditInventoryForm
        open={editOpen}
        row={selected}
        onClose={() => setEditOpen(false)}
        onSave={handleSave}
      />

      {/* ── Shipping Boxes ── */}
      <div className="mt-10 border-t pt-8">
        <ShippingBoxes />
      </div>
    </div>
  );
}