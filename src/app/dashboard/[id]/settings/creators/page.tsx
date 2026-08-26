// app/settings/creators/page.tsx
"use client";

import { useEffect, useState } from "react";

import "./_components/creators.scss";

import { FilterTabs } from "@/components/dashboard/FilterTabs";
import { LoadingState } from "./_components/LoadingState";
import { ErrorAlert } from "./_components/ErrorAlert";
import { CreatorsTable, type CreatorRow } from "./_components/CreatorsTable";
import { CreateCreatorModal } from "./_components/CreateCreatorModal";
import { EditCreatorModal } from "./_components/EditCreatorModal";
import { CashoutsPanel } from "./_components/CashoutsPanel";

export default function CreatorsPage() {
  const [tab, setTab] = useState<"creators" | "cashouts">("creators");

  const [rows, setRows] = useState<CreatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<CreatorRow | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/creator");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load creators");
      setRows(data.creators ?? []);
    } catch (e: any) {
      setErr(e.message ?? "Failed to load creators");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "creators") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleCreate = async (data: { profile_id: string; tier_id: string; code: string }) => {
    const res = await fetch("/api/creator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error ?? "Failed to create creator");
    await load();
  };

  const handleEdit = (row: CreatorRow) => {
    setSelected(row);
    setEditOpen(true);
  };

  const handleSave = async (data: {
    id: string;
    tier_id: string;
    status: "active" | "paused" | "removed";
    code: string;
    notes: string;
    cashout_threshold_cents: number;
  }) => {
    const { id, ...patch } = data;
    const res = await fetch(`/api/creator/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error ?? "Failed to save creator");
    await load();
  };

  const handleToggleStatus = async (row: CreatorRow) => {
    setErr(null);
    const nextStatus = row.status === "active" ? "paused" : "active";
    const res = await fetch(`/api/creator/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const result = await res.json();
    if (!res.ok) {
      setErr(result.error ?? "Failed to update status");
      return;
    }
    await load();
  };

  return (
    <div className="creators-manager">
      <div className="creators-header">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Creators</h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Affiliate codes, tiers, and cash-out requests. Nothing here moves real money —
              it just tracks each creator&apos;s cut until it&apos;s time to pay them.
            </p>
          </div>

          {tab === "creators" && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
            >
              Make a creator
            </button>
          )}
        </div>

        <FilterTabs
          value={tab}
          onChange={(value) => setTab(value as typeof tab)}
          options={[
            { value: "creators", label: "Creators" },
            { value: "cashouts", label: "Cash-out requests" },
          ]}
        />
      </div>

      {tab === "creators" ? (
        <div className="creators-table">
          {err ? <ErrorAlert message={err} onRetry={load} /> : null}

          {loading ? (
            <LoadingState label="Loading creators..." />
          ) : (
            <CreatorsTable creators={rows} onEdit={handleEdit} onToggleStatus={handleToggleStatus} />
          )}
        </div>
      ) : (
        <CashoutsPanel />
      )}

      <CreateCreatorModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />

      <EditCreatorModal open={editOpen} creator={selected} onClose={() => setEditOpen(false)} onSave={handleSave} />
    </div>
  );
}
