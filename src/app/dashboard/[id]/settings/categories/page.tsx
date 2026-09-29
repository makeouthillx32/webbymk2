// app/dashboard/[id]/settings/categories/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/utils/supabase/client";

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
  section?: string;
  // Optional editorial copy (2026-09-05) — rendered over the cover image on the
  // shop front end. Null on every existing row, so cards look unchanged.
  eyebrow?: string | null;
  tagline?: string | null;
  subtitle?: string | null;
  cta_label?: string | null;
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

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * One category list, two concerns.
 *
 *   structure — the nav tree: name, slug, nesting. Browse Structure.
 *   display   — the card artwork and the copy over it. Featured Rows.
 *
 * Both read and write the same rows; only the editor's fields differ, so a
 * category never has to exist twice to be both a nav link and a picture.
 */
export default function CategoriesPage({
  embedded = false,
  mode = "structure",
  table = "categories",
  bucket = "category-covers",
  defaultSection = "shop",
}: {
  embedded?: boolean;
  mode?: "structure" | "display";
  /**
   * Which taxonomy table this manages. Labs points at research_categories,
   * which carries the identical shape — nesting, section, cover and card copy
   * — so the whole manager is reused rather than forked.
   */
  table?: "categories" | "research_categories";
  bucket?: string;
  /**
   * Section this manager opens on and creates into.
   *
   * `section` partitions a taxonomy table into independent trees. It was
   * hardcoded to "shop", which is invisible until a second catalog arrives:
   * every research_categories row has section NULL, so a Labs manager pinned
   * to "shop" would have listed nothing at all and looked simply broken.
   */
  defaultSection?: string;
} = {}) {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  // ── Section state ──────────────────────────────────────────────────────────
  const [sections, setSections] = useState<string[]>([defaultSection]);
  const [activeSection, setActiveSection] = useState<string>(defaultSection);

  // ── Category state ─────────────────────────────────────────────────────────
  const [rows, setRows] = useState<DbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // ── Modal state ────────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<DbCategory | null>(null);

  // ── Load distinct sections ─────────────────────────────────────────────────
  const loadSections = useCallback(async () => {
    const { data } = await supabase
      .from(table)
      .select("section")
      .order("section", { ascending: true });

    if (data) {
      const unique = Array.from(new Set(data.map((r: any) => r.section as string).filter(Boolean)));
      // This catalog's own section leads; the rest follow.
      const ordered = [defaultSection, ...unique.filter((s) => s !== defaultSection)];
      setSections(ordered);
    }
  }, [supabase, table, defaultSection]);

  // ── Load categories for active section ────────────────────────────────────
  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);

    const { data, error } = await supabase
      .from(table)
      .select("id,name,slug,parent_id,position,cover_image_bucket,cover_image_path,cover_image_alt,section,eyebrow,tagline,subtitle,cta_label")
      .eq("section", activeSection)
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
  }, [supabase, activeSection]);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Search filter ──────────────────────────────────────────────────────────
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

  const safeCloseCreate = () => { if (!busy) setCreateOpen(false); };
  const safeCloseEdit   = () => { if (!busy) setEditOpen(false); };
  const safeCloseDelete = () => { if (!busy) setDeleteOpen(false); };

  // ── Create ─────────────────────────────────────────────────────────────────
  const handleCreate = async (data: {
    name: string;
    slug: string;
    parent_id: string | null;
    coverFile?: File | null;
  }) => {
    setErr(null);
    setBusy(true);

    try {
      const slug = normalizeSlug(data.slug);

      if (rows.some((r) => r.slug === slug)) {
        setErr(`Slug "${slug}" already exists in this section.`);
        return;
      }

      const position = nextPositionForParent(data.parent_id);

      // Need the new id back: the cover path is keyed by it, so the row has to
      // exist before the file can be uploaded.
      const { data: created, error } = await supabase.from(table).insert({
        name: data.name.trim(),
        slug,
        parent_id: data.parent_id,
        position,
        section: activeSection,
      }).select("id").single();

      if (error) { setErr(error.message); return; }

      // Cover is optional and arrives only from Featured Rows. A failure here
      // must not read as "create failed" — the category exists and is usable;
      // only its artwork is missing, and that is fixable by editing it.
      if (data.coverFile && created?.id) {
        const ext = data.coverFile.name.split(".").pop() ?? "jpg";
        const path = `${created.id}/cover.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(path, data.coverFile, { upsert: true });

        if (upErr) {
          setErr(`Category created, but the cover upload failed: ${upErr.message}`);
        } else {
          const { error: linkErr } = await supabase
            .from(table)
            .update({
              cover_image_bucket: bucket,
              cover_image_path: path,
              cover_image_alt: data.name.trim(),
            })
            .eq("id", created.id);

          if (linkErr) {
            setErr(`Category created and image uploaded, but linking it failed: ${linkErr.message}`);
          }
        }
      }

      await load();
      await loadSections(); // refresh tabs in case this is a first row in a new section
      setCreateOpen(false);
    } finally {
      setBusy(false);
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const handleEdit = (cat: CategoryRow) => {
    const full = rows.find((r) => r.id === cat.id) ?? (cat as DbCategory);
    setSelected(full);
    setEditOpen(true);
  };

  const handleSave = async (data: { id: string; name: string; slug: string; parent_id: string | null; eyebrow?: string | null; tagline?: string | null; subtitle?: string | null; cta_label?: string | null }) => {
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
        .from(table)
        .update({
          name: data.name.trim(),
          slug,
          eyebrow: data.eyebrow ?? null,
          tagline: data.tagline ?? null,
          subtitle: data.subtitle ?? null,
          cta_label: data.cta_label ?? null,
          parent_id: data.parent_id,
          ...(parentChanged ? { position } : {}),
        })
        .eq("id", data.id);

      if (error) { setErr(error.message); return; }

      await load();
      setEditOpen(false);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = (cat: CategoryRow) => {
    const full = rows.find((r) => r.id === cat.id) ?? (cat as DbCategory);
    setSelected(full);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async (cat: CategoryRow) => {
    setErr(null);
    setBusy(true);

    try {
      const { error } = await supabase.from(table).delete().eq("id", cat.id);
      if (error) { setErr(error.message); return; }

      await load();
      await loadSections(); // a section with 0 rows won't appear in next load
      setDeleteOpen(false);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  // ── Section switch ─────────────────────────────────────────────────────────
  const handleSectionChange = (section: string) => {
    setSearch("");
    setSelected(null);
    setActiveSection(section);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="categories-manager">
      <div className="categories-header">
        {!embedded && (
          <div>
            <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Browse Structure (Categories)</h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              What a product IS — drives storefront nav and browse pages. Hierarchical. For time-based pushes use Featured Rows; for cross-cutting traits use Attributes.
            </p>
          </div>
        )}

        <CategoryActionBar
          search={search}
          onSearchChange={setSearch}
          onCreate={() => setCreateOpen(true)}
        />
      </div>

      {/* ── Section tabs ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-[hsl(var(--border))] mb-5">
        {sections.map((section) => (
          <button
            key={section}
            type="button"
            onClick={() => handleSectionChange(section)}
            className={[
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeSection === section
                ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]"
                : "border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
            ].join(" ")}
          >
            {capitalize(section)}
          </button>
        ))}
      </div>

      {err ? <ErrorAlert message={err} onRetry={load} /> : null}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="categories-table">
          <CategoriesTable categories={filtered} onEdit={handleEdit} onDelete={handleDelete} showCover={mode === "display"} variant={mode === "display" ? "cards" : "tree"} />
        </div>
      )}

      <CreateCategoryModal
        mode={mode}
        open={createOpen}
        categories={rows}
        activeSection={activeSection}
        onClose={safeCloseCreate}
        onCreate={handleCreate}
      />

      <EditCategoryForm
        mode={mode}
        bucket={bucket}
        table={table}
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
