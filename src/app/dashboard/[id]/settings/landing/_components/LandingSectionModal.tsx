// settings/landing/_components/LandingSectionModal.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { LandingSectionRow } from "./types";

async function apiCreate(payload: any) {
  const res = await fetch("/api/landing/sections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.ok === false) throw new Error(body?.error?.message ?? "Create failed");
  return body;
}

async function apiUpdate(payload: any) {
  const res = await fetch("/api/landing/sections", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.ok === false) throw new Error(body?.error?.message ?? "Update failed");
  return body;
}

const TYPE_PRESETS: Record<string, Record<string, any>> = {
  top_banner: {},
  hero_carousel: {},
  categories_grid: { title: "Shop by Category", columns: 3 },
  static_html: { slug: "landing-qr-download", compact: true, showFooter: false },
  products_grid: { title: "Shop Bestsellers", limit: 4, sliceStart: 0, viewAllHref: "/shop" },
};

export default function LandingSectionModal({
  open,
  onOpenChange,
  onSaved,
  section,
  isCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  section: LandingSectionRow | null;
  isCreate?: boolean;
}) {
  const [position, setPosition] = useState<number>(1);
  const [type, setType] = useState<string>("static_html");
  const [active, setActive] = useState<boolean>(true);
  const [configText, setConfigText] = useState<string>("{}");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = open && !!section;

  useEffect(() => {
    if (!section) return;
    setPosition(Number(section.position ?? 1));
    setType(String(section.type ?? "static_html"));
    setActive(!!section.is_active);
    setConfigText(JSON.stringify(section.config ?? TYPE_PRESETS[String(section.type ?? "")] ?? {}, null, 2));
    setError(null);
  }, [section]);

  const parsedConfig = useMemo(() => {
    try {
      return JSON.parse(configText || "{}");
    } catch {
      return null;
    }
  }, [configText]);

  async function save() {
    if (!section) return;
    setError(null);

    if (!Number.isFinite(position) || position < 1) {
      setError("Position must be a positive number.");
      return;
    }

    if (!type.trim()) {
      setError("Type is required.");
      return;
    }

    if (!parsedConfig) {
      setError("Config must be valid JSON.");
      return;
    }

    setSaving(true);
    try {
      if (isCreate) {
        await apiCreate({
          position,
          type,
          is_active: active,
          config: parsedConfig,
        });
      } else {
        await apiUpdate({
          id: section.id,
          position,
          type,
          is_active: active,
          config: parsedConfig,
        });
      }

      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(nextType: string) {
    const preset = TYPE_PRESETS[nextType] ?? {};
    setType(nextType);
    setConfigText(JSON.stringify(preset, null, 2));
  }

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onMouseDown={() => onOpenChange(false)}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isCreate ? "Create Landing Section" : "Edit Landing Section"}</div>
            <div className="modal-subtitle">Type + JSON config control how the section renders.</div>
          </div>
          <button className="iconbtn" onClick={() => onOpenChange(false)} aria-label="Close">
            ✕
          </button>
        </div>

        {error ? <div className="modal-error">{error}</div> : null}

        <div className="modal-grid">
          <label className="field">
            <span>Position</span>
            <input
              type="number"
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
              className="input"
            />
          </label>

          <label className="field">
            <span>Type</span>
            <select
              className="input"
              value={type}
              onChange={(e) => applyPreset(e.target.value)}
            >
              <option value="top_banner">top_banner</option>
              <option value="hero_carousel">hero_carousel</option>
              <option value="categories_grid">categories_grid</option>
              <option value="static_html">static_html</option>
              <option value="products_grid">products_grid</option>
            </select>
          </label>

          <label className="field field-inline">
            <span>Active</span>
            <button className={`pillbtn ${active ? "on" : "off"}`} onClick={() => setActive((v) => !v)}>
              {active ? "On" : "Off"}
            </button>
          </label>

          <label className="field field-full">
            <span>Config (JSON)</span>
            <textarea
              className="textarea"
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              spellCheck={false}
            />
            {!parsedConfig ? (
              <div className="hint-error">Invalid JSON (fix before saving).</div>
            ) : (
              <div className="hint">
                Tip: for <code>products_grid</code> you can use <code>sliceStart</code> to reuse the same featured list
                (ex: 0 for Bestsellers, 4 for Curated).
              </div>
            )}
          </label>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
