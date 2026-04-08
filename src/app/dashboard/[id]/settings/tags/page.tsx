// app/settings/tags/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

import "./_components/tags.scss";

import { LoadingState } from "./_components/LoadingState";
import { ErrorAlert } from "./_components/ErrorAlert";
import { TagsActionBar } from "./_components/TagsActionBar";
import { TagsTable, type TagRow } from "./_components/TagsTable";
import { CreateTagModal } from "./_components/CreateTagModal";
import { EditTagForm } from "./_components/EditTagForm";
import { DeleteConfirmModal } from "./_components/DeleteConfirmModal";

export default function TagsPage() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [rows, setRows] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [selected, setSelected] = useState<TagRow | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);

    const { data, error } = await supabase
      .from("tags")
      .select("id,name,slug")
      .order("name", { ascending: true });

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as TagRow[]) ?? []);
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
      return r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q);
    });
  }, [rows, search]);

  // ✅ Create
  const handleCreate = async (data: { name: string; slug: string }) => {
    setErr(null);

    const { error } = await supabase.from("tags").insert({
      name: data.name,
      slug: data.slug,
    });

    if (error) {
      setErr(error.message);
      return;
    }

    await load();
  };

  // ✅ Edit
  const handleEdit = (row: TagRow) => {
    setSelected(row);
    setEditOpen(true);
  };

  const handleSave = async (data: { id: string; name: string; slug: string }) => {
    setErr(null);

    const { error } = await supabase
      .from("tags")
      .update({
        name: data.name,
        slug: data.slug,
      })
      .eq("id", data.id);

    if (error) {
      setErr(error.message);
      return;
    }

    await load();
  };

  // ✅ Delete
  const handleDelete = (row: TagRow) => {
    setSelected(row);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async (row: TagRow) => {
    setErr(null);

    const { error } = await supabase.from("tags").delete().eq("id", row.id);

    if (error) {
      setErr(error.message);
      return;
    }

    await load();
  };

  return (
    <div className="tags-manager">
      <div className="tags-header">
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">
            Tags / Subcategories
          </h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Manage product tags. These can be used like subcategories and filters.
          </p>
        </div>

        <TagsActionBar
          search={search}
          onSearchChange={setSearch}
          onCreate={() => setCreateOpen(true)}
        />
      </div>

      {err ? <ErrorAlert message={err} onRetry={load} /> : null}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="tags-table">
          <TagsTable tags={filtered} onEdit={handleEdit} onDelete={handleDelete} />
        </div>
      )}

      <CreateTagModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />

      <EditTagForm
        open={editOpen}
        tag={selected}
        onClose={() => setEditOpen(false)}
        onSave={handleSave}
      />

      <DeleteConfirmModal
        open={deleteOpen}
        tag={selected}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}