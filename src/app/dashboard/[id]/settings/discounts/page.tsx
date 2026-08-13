// app/settings/discounts/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

import "./_components/discounts.scss";

import { LoadingState } from "./_components/LoadingState";
import { ErrorAlert } from "./_components/ErrorAlert";
import { DiscountsActionBar } from "./_components/DiscountsActionBar";
import { DiscountsTable, type DiscountRow } from "./_components/DiscountsTable";
import { CreateDiscountModal } from "./_components/CreateDiscountModal";
import { EditDiscountForm } from "./_components/EditDiscountForm";
import { DeleteConfirmModal } from "./_components/DeleteConfirmModal";

async function readJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function DiscountsPage() {
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

    const res = await fetch("/api/discounts", { cache: "no-store" });
    const json = await readJson(res);

    if (!res.ok || !json?.ok) {
      setErr(json?.error?.message ?? "Failed to load discounts");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((json.data as DiscountRow[]) ?? []);
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

    const res = await fetch("/api/discounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await readJson(res);

    if (!res.ok || !json?.ok) {
      setErr(json?.error?.message ?? "Failed to create discount");
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

    const res = await fetch(`/api/discounts/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await readJson(res);

    if (!res.ok || !json?.ok) {
      setErr(json?.error?.message ?? "Failed to save discount");
      return;
    }

    await load();
  };

  // ✅ Toggle Active (quick switch)
  const handleToggleActive = async (row: DiscountRow, active: boolean) => {
    setErr(null);

    const res = await fetch(`/api/discounts/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: active }),
    });
    const json = await readJson(res);

    if (!res.ok || !json?.ok) {
      setErr(json?.error?.message ?? "Failed to update discount");
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

    const res = await fetch(`/api/discounts/${row.id}`, { method: "DELETE" });
    const json = await readJson(res);

    if (!res.ok || !json?.ok) {
      setErr(json?.error?.message ?? "Failed to delete discount");
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
