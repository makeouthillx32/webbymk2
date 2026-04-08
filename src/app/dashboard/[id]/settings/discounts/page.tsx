// app/settings/discounts/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

import "./_components/discounts.scss";

import { LoadingState } from "./_components/LoadingState";
import { ErrorAlert } from "./_components/ErrorAlert";
import { DiscountsActionBar } from "./_components/DiscountsActionBar";
import { DiscountsTable, type DiscountRow } from "./_components/DiscountsTable";
import { CreateDiscountModal } from "./_components/CreateDiscountModal";
import { EditDiscountForm } from "./_components/EditDiscountForm";
import { DeleteConfirmModal } from "./_components/DeleteConfirmModal";

export default function DiscountsPage() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [rows, setRows] = useState<DiscountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [selected, setSelected] = useState<DiscountRow | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);

    // NOTE: max_uses + uses_count only exist if you added them (recommended).
    // If you did not, remove them from this select list.
    const { data, error } = await supabase
      .from("discounts")
      .select(
        "id,code,type,percent_off,amount_off_cents,is_active,starts_at,ends_at,max_uses,uses_count"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as DiscountRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      return (
        r.code.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  // ✅ Create
  const handleCreate = async (data: {
    code: string;
    type: "percentage" | "fixed_amount";
    percent_off: number | null;
    amount_off_cents: number | null;
    max_uses: number | null;
    starts_at: string | null;
    ends_at: string | null;
    is_active: boolean;
  }) => {
    setErr(null);

    const payload: any = {
      code: data.code,
      type: data.type,
      percent_off: data.type === "percentage" ? data.percent_off : null,
      amount_off_cents: data.type === "fixed_amount" ? data.amount_off_cents : null,
      is_active: data.is_active,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      updated_at: new Date().toISOString(),
    };

    // Only include these fields if they exist in your table
    if (data.max_uses !== undefined) payload.max_uses = data.max_uses;

    const { error } = await supabase.from("discounts").insert(payload);

    if (error) {
      setErr(error.message);
      return;
    }

    await load();
  };

  // ✅ Edit
  const handleEdit = (row: DiscountRow) => {
    setSelected(row);
    setEditOpen(true);
  };

  const handleSave = async (data: {
    id: string;
    code: string;
    type: "percentage" | "fixed_amount";
    percent_off: number | null;
    amount_off_cents: number | null;
    max_uses: number | null;
    starts_at: string | null;
    ends_at: string | null;
    is_active: boolean;
  }) => {
    setErr(null);

    const payload: any = {
      code: data.code,
      type: data.type,
      percent_off: data.type === "percentage" ? data.percent_off : null,
      amount_off_cents: data.type === "fixed_amount" ? data.amount_off_cents : null,
      is_active: data.is_active,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      updated_at: new Date().toISOString(),
    };

    if (data.max_uses !== undefined) payload.max_uses = data.max_uses;

    const { error } = await supabase.from("discounts").update(payload).eq("id", data.id);

    if (error) {
      setErr(error.message);
      return;
    }

    await load();
  };

  // ✅ Toggle Active (quick switch)
  const handleToggleActive = async (row: DiscountRow, active: boolean) => {
    setErr(null);

    const { error } = await supabase
      .from("discounts")
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    if (error) {
      setErr(error.message);
      return;
    }

    // optimistic UI
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: active } : r)));
  };

  // ✅ Delete
  const handleDelete = (row: DiscountRow) => {
    setSelected(row);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async (row: DiscountRow) => {
    setErr(null);

    const { error } = await supabase.from("discounts").delete().eq("id", row.id);

    if (error) {
      setErr(error.message);
      return;
    }

    await load();
  };

  return (
    <div className="discounts-manager">
      <div className="discounts-header">
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Discounts</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Manage discount codes (percent or fixed amount).
          </p>
        </div>

        <DiscountsActionBar
          search={search}
          onSearchChange={setSearch}
          onCreate={() => setCreateOpen(true)}
        />
      </div>

      {err ? <ErrorAlert message={err} onRetry={load} /> : null}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="discounts-table">
          <DiscountsTable
            discounts={filtered}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
          />
        </div>
      )}

      <CreateDiscountModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />

      <EditDiscountForm
        open={editOpen}
        discount={selected}
        onClose={() => setEditOpen(false)}
        onSave={handleSave}
      />

      <DeleteConfirmModal
        open={deleteOpen}
        discount={selected}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}