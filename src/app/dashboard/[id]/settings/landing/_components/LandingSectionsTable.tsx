// settings/landing/_components/LandingSectionsTable.tsx
"use client";

import React, { useMemo, useState } from "react";
import type { LandingSectionRow } from "./types";
import LandingSectionModal from "./LandingSectionModal";
import DeleteConfirmModal from "./DeleteConfirmModal";
import "./landing.scss";

async function apiPatch(payload: any) {
  const res = await fetch("/api/landing/sections", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.ok === false) throw new Error(body?.error?.message ?? "Update failed");
  return body;
}

async function apiDelete(id: string) {
  const res = await fetch(`/api/landing/sections?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.ok === false) throw new Error(body?.error?.message ?? "Delete failed");
  return body;
}

export default function LandingSectionsTable({
  rows,
  onChange,
}: {
  rows: LandingSectionRow[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<LandingSectionRow | null>(null);
  const [deleting, setDeleting] = useState<LandingSectionRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  async function toggleActive(id: string) {
    setErr(null);
    setBusyId(id);
    try {
      const row = byId.get(id);
      await apiPatch({ id, is_active: !row?.is_active });
      onChange();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function move(id: string, dir: -1 | 1) {
    setErr(null);
    setBusyId(id);
    try {
      const current = rows.find((r) => r.id === id);
      if (!current) return;

      const idx = rows.findIndex((r) => r.id === id);
      const target = rows[idx + dir];
      if (!target) return;

      // swap positions
      await apiPatch({
        swap: [
          { id: current.id, position: target.position },
          { id: target.id, position: current.position },
        ],
      });

      onChange();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="table-wrap">
      {err ? (
        <div className="inline-error">
          {err}
        </div>
      ) : null}

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 90 }}>Order</th>
            <th style={{ width: 170 }}>Type</th>
            <th>Config</th>
            <th style={{ width: 120 }}>Active</th>
            <th style={{ width: 240 }}>Actions</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="mono">
                <div className="order-cell">
                  <button
                    className="iconbtn"
                    disabled={busyId === row.id}
                    onClick={() => move(row.id, -1)}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <span className="order-num">{row.position}</span>
                  <button
                    className="iconbtn"
                    disabled={busyId === row.id}
                    onClick={() => move(row.id, 1)}
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>
              </td>

              <td className="mono">{row.type}</td>

              <td className="config-cell">
                <div className="config-title">
                  {row.config?.title ? String(row.config.title) : null}
                  {row.config?.slug ? (
                    <span className="pill">slug: {String(row.config.slug)}</span>
                  ) : null}
                </div>

                <pre className="config-pre">
                  {JSON.stringify(row.config ?? {}, null, 2)}
                </pre>
              </td>

              <td>
                <button
                  className={`pillbtn ${row.is_active ? "on" : "off"}`}
                  disabled={busyId === row.id}
                  onClick={() => toggleActive(row.id)}
                >
                  {row.is_active ? "On" : "Off"}
                </button>
              </td>

              <td>
                <div className="row-actions">
                  <button className="btn" onClick={() => setEditing(row)}>
                    Edit
                  </button>
                  <button className="btn btn-danger" onClick={() => setDeleting(row)}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="empty">
                No landing sections found.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <LandingSectionModal
        open={!!editing}
        section={editing}
        onOpenChange={(v) => (!v ? setEditing(null) : null)}
        onSaved={() => {
          setEditing(null);
          onChange();
        }}
      />

      <DeleteConfirmModal
        open={!!deleting}
        title="Delete section?"
        description="This will permanently remove the landing section."
        confirmText="Delete"
        onOpenChange={(v) => (!v ? setDeleting(null) : null)}
        onConfirm={async () => {
          if (!deleting) return;
          setErr(null);
          setBusyId(deleting.id);
          try {
            await apiDelete(deleting.id);
            setDeleting(null);
            onChange();
          } catch (e: any) {
            setErr(e?.message ?? "Delete failed");
          } finally {
            setBusyId(null);
          }
        }}
      />
    </div>
  );
}