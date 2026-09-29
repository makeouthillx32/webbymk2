// app/settings/tags/_components/EditTagForm.tsx
"use client";

// Tag editor.
//
// Tags deliberately have NO cover art. A tag answers "what is this product
// like" — it surfaces as a filter or a label attached to an item, and is never
// rendered as a card with its own picture. Collections are the taxonomy that
// exists to be displayed as artwork; conflating the two is what made this area
// confusing, since a tag image had nowhere to appear and no tag ever set one.
//
// The cover_image_* columns remain on the table — nothing was dropped — they
// are simply no longer written or offered here.

import { useEffect, useState } from "react";
import { TagModal } from "./TagModal";
import type { TagRow } from "./TagsTable";

export type TagSavePayload = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_home_section: boolean;
  is_active: boolean;
  eyebrow: string | null;
  tagline: string | null;
  subtitle: string | null;
  cta_label: string | null;
};

type Props = {
  open: boolean;
  tag: (TagRow & Partial<TagSavePayload>) | null;
  onClose: () => void;
  onSave: (data: TagSavePayload) => Promise<void> | void;
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function EditTagForm({ open, tag, onClose, onSave }: Props) {

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [showOnHome, setShowOnHome] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [eyebrow, setEyebrow] = useState("");
  const [tagline, setTagline] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tag) return;
    setName(tag.name);
    setSlug(tag.slug);
    setDescription(tag.description ?? "");
    setShowOnHome(tag.is_home_section ?? false);
    setIsActive(tag.is_active ?? true);
    setEyebrow(tag.eyebrow ?? "");
    setTagline(tag.tagline ?? "");
    setSubtitle(tag.subtitle ?? "");
    setCtaLabel(tag.cta_label ?? "");
    setError(null);
  }, [tag]);

  if (!open || !tag) return null;

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) return;
    try {
      setSaving(true);
      await onSave({
        id: tag.id,
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,

        is_home_section: showOnHome,
        is_active: isActive,
        // Empty must persist as NULL, not "" — the card renderer treats any
        // truthy value as "show this element".
        eyebrow: eyebrow.trim() || null,
        tagline: tagline.trim() || null,
        subtitle: subtitle.trim() || null,
        cta_label: ctaLabel.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const input =
    "mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm";
  const label = "text-sm font-medium text-[hsl(var(--foreground))]";

  return (
    <TagModal
      open={open}
      title="Edit tag"
      description="Cover art, details and card copy — same options as collections."
      onClose={onClose}
    >
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        {error && (
          <p className="rounded-md border border-[hsl(var(--destructive)/0.35)] bg-[hsl(var(--destructive)/0.1)] px-3 py-2 text-sm text-[hsl(var(--destructive))]">
            {error}
          </p>
        )}

        {/* Tags carry no artwork on purpose.
            A tag surfaces as a filter or a label ON a product; it is never
            rendered as a card with its own cover, which is exactly what
            separates it from a collection. The cover_image_* columns still
            exist on the table (nothing was dropped) but no tag has ever used
            one, and offering the upload here only invited the question of why
            it never appeared anywhere. */}
        <div>
          <label className={label}>Name</label>
          <input
            value={name}
            onChange={(e) => {
              const v = e.target.value;
              setName(v);
              setSlug(slugify(v));
            }}
            className={input}
          />
        </div>

        <div>
          <label className={label}>Slug</label>
          <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} className={input} />
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">URL: /{slug}</p>
        </div>

        <div>
          <label className={label}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
          />
        </div>

        {/* Optional editorial copy — same fields as categories/collections */}
        <div className="space-y-3 rounded-md border border-[hsl(var(--border))] p-3">
          <div>
            <p className={label}>Card copy (optional)</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Text laid over the cover image. Leave blank for the plain card.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium">Eyebrow</span>
              <input value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} maxLength={40} placeholder="UNENTER" className={input} />
            </label>
            <label className="block">
              <span className="text-xs font-medium">Tagline</span>
              <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={60} placeholder="EST. 2024 BUILT DIFFERENT" className={input} />
            </label>
            <label className="block">
              <span className="text-xs font-medium">Subtitle</span>
              <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={80} placeholder="FRESH DROPS. SAME ENERGY." className={input} />
            </label>
            <label className="block">
              <span className="text-xs font-medium">CTA label</span>
              <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={30} placeholder="SHOP NOW" className={input} />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={showOnHome} onChange={(e) => setShowOnHome(e.target.checked)} />
            <span className="text-sm">Show on homepage</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span className="text-sm">Active (visible on the front end)</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[var(--radius)] border border-[hsl(var(--border))] px-4 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="h-9 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </TagModal>
  );
}
