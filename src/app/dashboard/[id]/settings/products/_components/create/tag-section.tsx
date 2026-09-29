// app/dashboard/[id]/settings/products/_components/create/tag-section.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Tag picker for the upload flow.
//
// Tags are the one taxonomy you can extend from here. Categories and
// collections are deliberate structure — you decide those up front and pick
// from a fixed list. Tags are descriptive and open-ended ("Fem", "Limited",
// "Vintage Wash"), so the set only ever grows while you're actually looking at
// the product. The join endpoint upserts by slug, so a tag typed here is
// created and linked in the same call; no detour to the taxonomy manager.
//
// Tags carry no artwork on purpose — they surface as filters and labels ON an
// item, never as a card with its own cover. That's what separates them from
// collections, which exist precisely to be displayed as a picture.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type TagOption = { id?: string; slug: string; name: string };

/** Same shape the taxonomy manager uses, so a tag coined here matches one made there. */
export function slugifyTag(v: string): string {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function TagSection({
  available,
  selected,
  onChange,
}: {
  available: TagOption[];
  selected: TagOption[];
  onChange: (next: TagOption[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const isSelected = (slug: string) => selected.some((t) => t.slug === slug);

  const toggle = (tag: TagOption) => {
    onChange(
      isSelected(tag.slug)
        ? selected.filter((t) => t.slug !== tag.slug)
        : [...selected, { slug: tag.slug, name: tag.name }],
    );
  };

  const addDraft = () => {
    const name = draft.trim();
    if (!name) return;
    const slug = slugifyTag(name);
    if (!slug) return;
    // Re-select rather than duplicate if it already exists under this slug.
    if (!isSelected(slug)) onChange([...selected, { slug, name }]);
    setDraft("");
  };

  // Anything selected that isn't in the fetched list is new to the system.
  const coined = selected.filter((t) => !available.some((a) => a.slug === t.slug));

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder="Add a tag — e.g. Vintage Wash"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={addDraft} disabled={!draft.trim()}>
          Add
        </Button>
      </div>

      {coined.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {coined.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => toggle(t)}
              className="rounded-full bg-[hsl(var(--primary))] px-2.5 py-1 text-xs text-[hsl(var(--primary-foreground))]"
              title="New tag — will be created when the product saves"
            >
              {t.name} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      {available.length > 0 ? (
        <div className="flex max-h-[220px] flex-wrap gap-1.5 overflow-auto">
          {available.map((t) => {
            const on = isSelected(t.slug);
            return (
              <button
                key={t.slug}
                type="button"
                onClick={() => toggle(t)}
                className={
                  "rounded-full border px-2.5 py-1 text-xs transition " +
                  (on
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                    : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]")
                }
              >
                {t.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No tags yet — type above to create your first one.
        </p>
      )}
    </div>
  );
}
