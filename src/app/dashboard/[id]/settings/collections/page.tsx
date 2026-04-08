// app/dashboard/[id]/settings/collections/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

import "./_components/collections.scss";

import { LoadingState } from "./_components/LoadingState";
import { ErrorAlert } from "./_components/ErrorAlert";
import { CollectionsActionBar } from "./_components/CollectionsActionBar";
import { CollectionsTable, type CollectionRow } from "./_components/CollectionsTable";
import CreateCollectionModal from "./_components/CreateCollectionModal";
import { EditCollectionForm } from "./_components/EditCollectionForm";
import { DeleteConfirmModal } from "./_components/DeleteConfirmModal";

export default function CollectionsPage() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [selected, setSelected] = useState<CollectionRow | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);

    let query = supabase
      .from("collections")
      .select(
        `
        id,
        name,
        slug,
        description,
        position,
        is_home_section,
        cover_image_bucket,
        cover_image_path,
        cover_image_alt,
        product_collections(count)
      `
      )
      .order("position", { ascending: true })
      .order("name", { ascending: true });

    const q = search.trim();
    if (q) {
      query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%,description.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    // Flatten: product_collections: [{ count }] -> product_count
    const normalized: CollectionRow[] = ((data ?? []) as any[]).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      position: c.position,
      is_home_section: c.is_home_section,
      cover_image_bucket: c.cover_image_bucket,
      cover_image_path: c.cover_image_path,
      cover_image_alt: c.cover_image_alt,
      product_count: c.product_collections?.[0]?.count ?? 0,
    }));

    setRows(normalized);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-load when search changes (so counts + results match)
  useEffect(() => {
    const t = setTimeout(() => load(), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ✅ Create
  // IMPORTANT: your CreateCollectionModal already inserts into Supabase (and uploads cover),
  // so do NOT insert here again. Just refresh.
  const handleCreate = async (_data: {
    name: string;
    slug: string;
    description: string | null;
    is_home_section: boolean;
  }) => {
    setErr(null);
    await load();
    setCreateOpen(false);
  };

  // ✅ Edit
  const handleEdit = (row: CollectionRow) => {
    setSelected(row);
    setEditOpen(true);
  };

  const handleSave = async (data: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    is_home_section: boolean;
  }) => {
    setErr(null);

    const { error } = await supabase
      .from("collections")
      .update({
        name: data.name,
        slug: data.slug,
        description: data.description,
        is_home_section: data.is_home_section,
      })
      .eq("id", data.id);

    if (error) {
      setErr(error.message);
      return;
    }

    await load();
    setEditOpen(false);
  };

  // ✅ Delete
  const handleDelete = (row: CollectionRow) => {
    setSelected(row);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async (row: CollectionRow) => {
    setErr(null);

    const { error } = await supabase.from("collections").delete().eq("id", row.id);

    if (error) {
      setErr(error.message);
      return;
    }

    await load();
    setDeleteOpen(false);
  };

  return (
    <div className="collections-manager">
      <div className="collections-header">
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Collections</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Manage storefront collections (used in /collections/* and footer links).
          </p>
        </div>

        <CollectionsActionBar
          search={search}
          onSearchChange={setSearch}
          onCreate={() => setCreateOpen(true)}
        />
      </div>

      {err ? <ErrorAlert message={err} onRetry={load} /> : null}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="collections-table">
          <CollectionsTable collections={rows} onEdit={handleEdit} onDelete={handleDelete} />
        </div>
      )}

      <CreateCollectionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />

      <EditCollectionForm
        open={editOpen}
        collection={selected}
        onClose={() => setEditOpen(false)}
        onSave={handleSave}
      />

      <DeleteConfirmModal
        open={deleteOpen}
        collection={selected}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
