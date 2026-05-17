"use client";

import React, { useState } from "react";
import { X, Check } from "lucide-react";

// ── Template definitions ────────────────────────────────────────────────────

export type SectionTemplate = "blank" | "blog" | "portfolio" | "landing" | "shop";

interface Template {
  id: SectionTemplate;
  label: string;
  emoji: string;
  tagline: string;
  preview: string[];   // category names shown as chips inside the card
  color: string;       // accent colour class for the card border/highlight
}

const TEMPLATES: Template[] = [
  {
    id: "blank",
    label: "Blank",
    emoji: "🗒️",
    tagline: "Start completely fresh — you name every category.",
    preview: [],
    color: "border-[hsl(var(--border))]",
  },
  {
    id: "blog",
    label: "Blog",
    emoji: "✍️",
    tagline: "Ready-made editorial sections. Just add your posts.",
    preview: ["News", "Tutorials", "Reviews", "Opinion"],
    color: "border-blue-400 dark:border-blue-500",
  },
  {
    id: "portfolio",
    label: "Portfolio",
    emoji: "🎨",
    tagline: "Show your work, case studies, and experiments.",
    preview: ["Work", "Case Studies", "Experiments", "About"],
    color: "border-violet-400 dark:border-violet-500",
  },
  {
    id: "landing",
    label: "Landing",
    emoji: "🚀",
    tagline: "Classic conversion structure, ready to wire up.",
    preview: ["Features", "Pricing", "FAQ", "Testimonials"],
    color: "border-amber-400 dark:border-amber-500",
  },
  {
    id: "shop",
    label: "Shop",
    emoji: "🛍️",
    tagline: "Clone of a shop nav — All, New In, Collections, Sale.",
    preview: ["All", "New In", "Collections", "Sale"],
    color: "border-emerald-400 dark:border-emerald-500",
  },
];

// ── Props ────────────────────────────────────────────────────────────────────

interface CreateSectionModalProps {
  open: boolean;
  existingSections: string[];
  onClose: () => void;
  onCreate: (sectionName: string, template: SectionTemplate) => Promise<void>;
}

// ── Component ────────────────────────────────────────────────────────────────

function slugifySection(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function CreateSectionModal({
  open,
  existingSections,
  onClose,
  onCreate,
}: CreateSectionModalProps) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<SectionTemplate>("blank");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = slugifySection(name);
  const conflict = existingSections.includes(slug);

  const reset = () => {
    setName("");
    setPicked("blank");
    setError(null);
  };

  const handleClose = () => { if (!saving) { reset(); onClose(); } };

  const handleSubmit = async () => {
    if (!slug) { setError("Section name is required."); return; }
    if (conflict) { setError(`A section named "${slug}" already exists.`); return; }
    setSaving(true);
    setError(null);
    try {
      await onCreate(slug, picked);
      reset();
    } catch (e: any) {
      setError(e?.message ?? "Unexpected error.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative z-10 w-full max-w-2xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-xl shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border))] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">New Section</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              Pick a template — or start blank and build your own tree.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">

          {/* Section name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              Section name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="e.g. blog, portfolio, zone-rappers"
              className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] font-mono placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/30"
            />
            {slug && (
              <p className={`text-xs ${conflict ? "text-red-500" : "text-[hsl(var(--muted-foreground))]"}`}>
                {conflict ? `⚠ section "${slug}" already exists` : `section key: "${slug}"`}
              </p>
            )}
          </div>

          {/* Template cards */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">Choose a starting template</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {TEMPLATES.map((tmpl) => {
                const isActive = picked === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => setPicked(tmpl.id)}
                    className={[
                      "relative text-left rounded-lg border-2 p-4 transition-all duration-150",
                      isActive
                        ? `${tmpl.color} bg-[hsl(var(--muted))/60] shadow-sm`
                        : "border-[hsl(var(--border))] hover:border-[hsl(var(--ring))/50] hover:bg-[hsl(var(--muted))/30]",
                    ].join(" ")}
                  >
                    {/* Checkmark */}
                    {isActive && (
                      <span className="absolute top-2.5 right-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--primary))]">
                        <Check size={10} className="text-[hsl(var(--primary-foreground))]" />
                      </span>
                    )}

                    <span className="text-2xl mb-2 block">{tmpl.emoji}</span>
                    <span className="block text-sm font-semibold text-[hsl(var(--foreground))] mb-1">
                      {tmpl.label}
                    </span>
                    <span className="block text-xs text-[hsl(var(--muted-foreground))] leading-relaxed mb-3">
                      {tmpl.tagline}
                    </span>

                    {/* Category preview chips */}
                    {tmpl.preview.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {tmpl.preview.map((cat) => (
                          <span
                            key={cat}
                            className="text-[10px] leading-none px-1.5 py-1 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))] italic">
                        No categories — you build the tree.
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 rounded-md">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[hsl(var(--border))] shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !slug || conflict}
            className="px-4 py-2 text-sm rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
          >
            {saving ? "Creating…" : `Create "${slug || "…"}" section`}
          </button>
        </div>
      </div>
    </div>
  );
}
