// app/dashboard/[id]/settings/categories/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

import "./_components/categories.scss";

import { CategoryActionBar } from "./_components/CategoryActionBar";
import { CategoriesTable, type CategoryRow } from "./_components/CategoriesTable";
import { LoadingState } from "./_components/LoadingState";
import { ErrorAlert } from "./_components/ErrorAlert";
import { CreateCategoryModal } from "./_components/CreateCategoryModal";
import { EditCategoryForm } from "./_components/EditCategoryForm";
import { DeleteConfirmModal } from "./_components/DeleteConfirmModal";

type DbCategory = CategoryRow & {
  position?: number;
};

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function CategoriesPage() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [rows, setRows] = useState<DbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [selected, setSelected] = useState<DbCategory | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);

    const { data, error } = await supabase
      .from("categories")
      .select("id,name,slug,parent_id,position,cover_image_bucket,cover_image_path,cover_image_alt") // ✅ Added cover image fields
      .order("position", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as DbCategory[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const nextPositionForParent = useCallback(
    (parent_id: string | null, excludeId?: string) => {
      const siblings = rows.filter(
        (r) =>
          (r.parent_id ?? null) === (parent_id ?? null) &&
          (excludeId ? r.id !== excludeId : true)
      );
      const maxPos = Math.max(-1, ...siblings.map((s) => s.position ?? 0));
      return maxPos + 1;
    },
    [rows]
  );

  const safeCloseCreate = () => {
    if (busy) return;
    setCreateOpen(false);
  };

  const safeCloseEdit = () => {
    if (busy) return;
    setEditOpen(false);
  };

  const safeCloseDelete = () => {
    if (busy) return;
    setDeleteOpen(false);
  };

  // ✅ Create
  const handleCreate = async (data: { name: string; slug: string; parent_id: string | null }) => {
    setErr(null);
    setBusy(true);

    try {
      const slug = normalizeSlug(data.slug);

      // client-side duplicate guard (DB still enforces uniqueness)
      if (rows.some((r) => r.slug === slug)) {
        setErr(`Slug "${slug}" already exists.`);
        return;
      }

      const position = nextPositionForParent(data.parent_id);

      const { error } = await supabase.from("categories").insert({
        name: data.name.trim(),
        slug,
        parent_id: data.parent_id,
        position,
      });

      if (error) {
        setErr(error.message);
        return;
      }

      await load();
      setCreateOpen(false);
    } finally {
      setBusy(false);
    }
  };

  // ✅ Edit
  const handleEdit = (cat: CategoryRow) => {
    const full = rows.find((r) => r.id === cat.id) ?? (cat as DbCategory);
    setSelected(full);
    setEditOpen(true);
  };

  const handleSave = async (data: { id: string; name: string; slug: string; parent_id: string | null }) => {
    setErr(null);
    setBusy(true);

    try {
      const slug = normalizeSlug(data.slug);

      if (data.parent_id && data.parent_id === data.id) {
        setErr("A category cannot be its own parent.");
        return;
      }

      const current = rows.find((r) => r.id === data.id);
      const parentChanged = (current?.parent_id ?? null) !== (data.parent_id ?? null);
      const position = parentChanged
        ? nextPositionForParent(data.parent_id, data.id)
        : current?.position;

      const { error } = await supabase
        .from("categories")
        .update({
          name: data.name.trim(),
          slug,
          parent_id: data.parent_id,
          ...(parentChanged ? { position } : {}),
        })
        .eq("id", data.id);

      if (error) {
        setErr(error.message);
        return;
      }

      await load();
      setEditOpen(false);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  // ✅ Delete
  const handleDelete = (cat: CategoryRow) => {
    const full = rows.find((r) => r.id === cat.id) ?? (cat as DbCategory);
    setSelected(full);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async (cat: CategoryRow) => {
    setErr(null);
    setBusy(true);

    try {
      const { error } = await supabase.from("categories").delete().eq("id", cat.id);

      if (error) {
        setErr(error.message);
        return;
      }

      await load();
      setDeleteOpen(false);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="categories-manager">
      <div className="categories-header">
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Categories</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Manage your storefront category tree (header + shop navigation).
          </p>
        </div>

        <CategoryActionBar
          search={search}
          onSearchChange={setSearch}
          onCreate={() => setCreateOpen(true)}
        />
      </div>

      {err ? <ErrorAlert message={err} onRetry={load} /> : null}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="categories-table">
          <CategoriesTable categories={filtered} onEdit={handleEdit} onDelete={handleDelete} />
        </div>
      )}

      <CreateCategoryModal
        open={createOpen}
        categories={rows}
        onClose={safeCloseCreate}
        onCreate={handleCreate}
      />

      <EditCategoryForm
        open={editOpen}
        category={selected}
        categories={rows}
        onClose={safeCloseEdit}
        onSave={handleSave}
      />

      <DeleteConfirmModal
        open={deleteOpen}
        category={selected}
        onClose={safeCloseDelete}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}