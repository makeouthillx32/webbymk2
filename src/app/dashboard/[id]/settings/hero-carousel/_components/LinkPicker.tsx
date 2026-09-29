"use client";

// LinkPicker
// ─────────────────────────────────────────────────────────────────────────────
// Destination picker for hero-slide CTA buttons.
//
// Replaces the free-text href inputs, where a typo ("/colletions/new") produced
// a silently broken button that nothing validated. Now you pick from what
// actually exists: public zones, collections, categories, published static
// pages, plus the handful of fixed app routes.
//
// Deliberately keeps a "Custom URL…" escape hatch. A picker that can ONLY
// choose known destinations would block external links and any route the
// lists don't know about, so the manual path stays — it is just no longer the
// default way to do the common thing.
//
// Sources reuse the endpoints the landing SectionConfigForm already calls, so
// there is no new API surface to keep in sync.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react";

const CUSTOM = "__custom__";

/** Fixed app routes that aren't in any table. */
const FIXED_ROUTES: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/search", label: "Search" },
  { href: "/cart", label: "Cart" },
  { href: "/collections", label: "All collections" },
  { href: "/contact", label: "Contact" },
];

type Option = { href: string; label: string };
type Group = { label: string; options: Option[] };

export default function LinkPicker({
  id,
  value,
  onChange,
  required,
  disabled,
  placeholder = "/shop",
}: {
  id: string;
  value: string;
  onChange: (href: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const next: Group[] = [{ label: "Pages", options: FIXED_ROUTES }];
      try {
        const [zonesRes, colRes, catRes, pagesRes] = await Promise.allSettled([
          fetch("/api/public/zones"),
          fetch("/api/collections"),
          fetch("/api/categories"),
          fetch("/api/static-pages/slugs"),
        ]);

        const json = async (r: PromiseSettledResult<Response>) => {
          if (r.status !== "fulfilled" || !r.value.ok) return null;
          return r.value.json().catch(() => null);
        };

        const zones = await json(zonesRes);
        if (zones?.ok && Array.isArray(zones.data) && zones.data.length) {
          next.push({
            label: "Zones",
            options: zones.data.map((z: { href: string; label: string }) => ({
              href: z.href,
              label: z.label,
            })),
          });
        }

        const cols = await json(colRes);
        const colList = cols?.data ?? cols;
        if (Array.isArray(colList) && colList.length) {
          next.push({
            label: "Collections",
            options: colList
              .filter((c: { slug?: string }) => c.slug)
              .map((c: { slug: string; name?: string; title?: string }) => ({
                href: `/collections/${c.slug}`,
                label: c.name ?? c.title ?? c.slug,
              })),
          });
        }

        const cats = await json(catRes);
        const catList = cats?.data ?? cats;
        if (Array.isArray(catList) && catList.length) {
          next.push({
            label: "Categories",
            options: catList
              .filter((c: { slug?: string }) => c.slug)
              .map((c: { slug: string; name?: string; title?: string }) => ({
                href: `/${c.slug}`,
                label: c.name ?? c.title ?? c.slug,
              })),
          });
        }

        const pages = await json(pagesRes);
        const pageList = pages?.data ?? pages;
        if (Array.isArray(pageList) && pageList.length) {
          next.push({
            label: "Static pages",
            options: pageList
              // An unpublished page is a dead link — don't offer it.
              .filter((p: { slug?: string; is_published?: boolean }) => p.slug && p.is_published !== false)
              .map((p: { slug: string; title?: string }) => ({
                href: `/${p.slug}`,
                label: p.title ?? p.slug,
              })),
          });
        }
      } catch {
        // Any source failing just means fewer groups — the fixed routes and the
        // custom escape hatch always remain, so the field never becomes unusable.
      }
      if (!cancelled) {
        setGroups(next);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const known = useMemo(
    () => new Set(groups.flatMap((g) => g.options.map((o) => o.href))),
    [groups]
  );

  // A value that isn't in any list (external URL, hand-typed path, or a list
  // that hasn't loaded yet) must show as Custom with the text box populated —
  // otherwise opening an existing slide would appear to blank its link.
  const isCustom = !loading && value !== "" && !known.has(value);
  const selectValue = value === "" ? "" : isCustom ? CUSTOM : value;

  const inputClass =
    "w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20";

  return (
    <div className="space-y-2">
      <select
        id={id}
        className={inputClass}
        value={selectValue}
        disabled={disabled || loading}
        required={required}
        onChange={(e) => {
          const v = e.target.value;
          // Switching to Custom keeps whatever was there so the field isn't
          // cleared out from under the editor.
          if (v === CUSTOM) onChange(value || "");
          else onChange(v);
        }}
      >
        <option value="">{loading ? "Loading destinations…" : "Select a destination…"}</option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={`${g.label}:${o.href}`} value={o.href}>
                {o.label} — {o.href}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>Custom URL…</option>
      </select>

      {isCustom && (
        <input
          type="text"
          className={inputClass}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Custom URL"
        />
      )}
    </div>
  );
}
