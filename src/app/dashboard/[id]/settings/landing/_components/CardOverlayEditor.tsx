// app/dashboard/[id]/settings/landing/_components/CardOverlayEditor.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Editor for the categories_grid card overlay: five slots, each independently
// anchored and offset, plus the look shared by every card in the grid.
//
// The preview renders CardOverlaySlots — the exact component the storefront
// uses — over a real category cover. Because that component sizes everything in
// container-query units, the preview is truthful at whatever width the box
// happens to be, and the desktop/mobile toggle is a genuine comparison rather
// than a redrawn approximation.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import React, { useState } from "react";
import {
  CardOverlaySlots,
  CardScrim,
  SLOTS,
  SLOT_DEFAULTS,
  ANCHORS,
  resolveSlot,
  type Anchor,
  type SlotKey,
  type CardOverlayStyle,
  type CardCopy,
} from "@/components/shop/_components/CardOverlaySlots";

const TEXT_COLOR_TOKENS = [
  { value: "", label: "Default (white)" },
  { value: "foreground", label: "Foreground" },
  { value: "primary", label: "Primary" },
  { value: "accent", label: "Accent" },
  { value: "muted-foreground", label: "Muted" },
  { value: "card-foreground", label: "Card foreground" },
  { value: "background", label: "Background (for dark art)" },
];

/** Sample copy so every slot is visible even before a category is filled in. */
const SAMPLE: CardCopy = {
  eyebrow: "UNENTER",
  tagline: "EST. 2024\nBUILT DIFFERENT",
  name: "New Arrivals",
  subtitle: "Fresh drops. Same energy.",
  cta_label: "Shop now",
};

export type PreviewCategory = CardCopy & {
  id: string;
  name: string;
  coverImageUrl?: string | null;
};

export function CardOverlayEditor({
  config,
  updateField,
  categories,
}: {
  config: Record<string, any>;
  updateField: (field: string, value: any) => void;
  /** Real categories selected in this section, used for a truthful preview. */
  categories: PreviewCategory[];
}) {
  const [openSlot, setOpenSlot] = useState<SlotKey | null>("headline");
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [previewIdx, setPreviewIdx] = useState(0);

  const style: CardOverlayStyle = {
    slots: config.cardSlots,
    colorToken: config.cardColorToken,
    underline: config.cardUnderline,
    shadow: config.cardShadow,
    scrimOpacity: config.cardScrimOpacity,
    scrimStyle: config.cardScrimStyle,
  };

  /** Write one field of one slot, preserving the rest of the slot map. */
  const setSlot = (key: SlotKey, patch: Partial<(typeof SLOT_DEFAULTS)[SlotKey]>) => {
    const current = config.cardSlots ?? {};
    updateField("cardSlots", {
      ...current,
      [key]: { ...resolveSlot(style, key), ...patch },
    });
  };

  const resetSlot = (key: SlotKey) => {
    const current = { ...(config.cardSlots ?? {}) };
    delete current[key];
    updateField("cardSlots", Object.keys(current).length ? current : null);
  };

  const card = categories[previewIdx];

  // Sample copy stands in for empty fields so a slot's PLACEMENT is visible
  // before any words exist. That substitution has to be called out: without it
  // the preview looks like a configured card, and the storefront then renders
  // only the fields that actually hold copy — which reads as a broken deploy
  // rather than as empty data.
  const placeholders: string[] = [];
  const useCopy = (key: SlotKey, real: string | null | undefined, sample: string | null | undefined) => {
    if (real) return real;
    const label = SLOTS.find((s) => s.key === key)?.label ?? key;
    if (resolveSlot(style, key).on) placeholders.push(label);
    return sample;
  };

  const previewCopy: CardCopy = {
    name:      useCopy("headline", card?.name, SAMPLE.name),
    eyebrow:   useCopy("brand", card?.eyebrow, SAMPLE.eyebrow),
    tagline:   useCopy("kicker", card?.tagline, SAMPLE.tagline),
    subtitle:  useCopy("subtitle", card?.subtitle, SAMPLE.subtitle),
    cta_label: useCopy("cta", card?.cta_label, SAMPLE.cta_label),
    text_color_token: card?.text_color_token,
  };

  return (
    <div className="form-field" style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: 16, marginTop: 8 }}>
      <label className="form-label">Card overlay</label>
      <p className="form-hint">
        Placement is set here and applies to every card in this grid. The words come from each
        category, so cards share a look without sharing copy.
      </p>

      {/* ── Preview ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 8px" }}>
        <div style={{ display: "inline-flex", border: "1px solid hsl(var(--border))", borderRadius: 6, padding: 2 }}>
          {(["desktop", "mobile"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              style={{
                borderRadius: 4,
                padding: "2px 10px",
                fontSize: 12,
                textTransform: "capitalize",
                background: view === v ? "hsl(var(--primary))" : "transparent",
                color: view === v ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
              }}
            >
              {v}
            </button>
          ))}
        </div>

        {categories.length > 1 && (
          <select
            className="form-input"
            style={{ width: "auto", flex: 1 }}
            value={previewIdx}
            onChange={(e) => setPreviewIdx(Number(e.target.value))}
          >
            {categories.map((c, i) => (
              <option key={c.id} value={i}>
                Preview: {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div
        className="group relative overflow-hidden"
        style={{
          // The storefront card is square; mobile is simply narrower, and the
          // cqw sizing keeps the composition proportional between them.
          width: view === "mobile" ? 260 : "100%",
          maxWidth: view === "mobile" ? 260 : 460,
          aspectRatio: "1 / 1",
          borderRadius: 8,
          background: "hsl(var(--muted))",
        }}
      >
        {card?.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.coverImageUrl}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              color: "hsl(var(--muted-foreground))",
            }}
          >
            Pick a category with a cover image to preview over real artwork
          </div>
        )}

        <CardScrim opacity={style.scrimOpacity} variant={style.scrimStyle} />
        <CardOverlaySlots card={previewCopy} style={style} />
      </div>

      {placeholders.length > 0 && (
        <p
          className="form-hint"
          style={{ marginTop: 8, color: "hsl(var(--destructive))" }}
        >
          Showing placeholder text for {placeholders.join(", ")} — {card?.name ?? "this item"} has
          no copy in {placeholders.length > 1 ? "those fields" : "that field"} yet, so
          {placeholders.length > 1 ? " they" : " it"} will not appear on the storefront. Add the
          words in Taxonomy.
        </p>
      )}

      {card && !card.coverImageUrl && (
        <p className="form-hint" style={{ marginTop: 6, color: "hsl(var(--destructive))" }}>
          {card.name} has no cover image — it renders as a flat placeholder card.
        </p>
      )}

      {/* ── Per-slot controls ───────────────────────────────────────────── */}
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        {SLOTS.map(({ key, label, field, hint }) => {
          const cfg = resolveSlot(style, key);
          const isOpen = openSlot === key;

          return (
            <div key={key} style={{ border: "1px solid hsl(var(--border))", borderRadius: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
                <input
                  type="checkbox"
                  checked={cfg.on}
                  onChange={(e) => setSlot(key, { on: e.target.checked })}
                  title={`Show the ${label.toLowerCase()}`}
                />
                <button
                  type="button"
                  onClick={() => setOpenSlot(isOpen ? null : key)}
                  style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 500, opacity: cfg.on ? 1 : 0.5 }}
                >
                  {label}{" "}
                  <span style={{ fontWeight: 400, color: "hsl(var(--muted-foreground))" }}>
                    — from {field}
                  </span>
                </button>
                <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                  {cfg.anchor.replace("-", " ")}
                </span>
                <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {isOpen && (
                <div style={{ borderTop: "1px solid hsl(var(--border))", padding: 10 }}>
                  <p className="form-hint" style={{ marginTop: 0 }}>{hint}</p>

                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, alignItems: "start" }}>
                    {/* 3x3 anchor picker */}
                    <div>
                      <label className="form-label" style={{ fontSize: 12 }}>Anchor</label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 26px)", gap: 3, marginTop: 4 }}>
                        {ANCHORS.map((a) => (
                          <button
                            key={a}
                            type="button"
                            title={a.replace("-", " ")}
                            onClick={() => setSlot(key, { anchor: a as Anchor })}
                            style={{
                              height: 26,
                              borderRadius: 4,
                              border: "1px solid hsl(var(--border))",
                              background:
                                cfg.anchor === a ? "hsl(var(--primary))" : "hsl(var(--background))",
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 12 }}>
                          Across — {cfg.x}px
                        </label>
                        <input
                          type="range" min={-160} max={280} step={2}
                          value={cfg.x}
                          onChange={(e) => setSlot(key, { x: parseInt(e.target.value) })}
                          className="form-input"
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 12 }}>
                          Down — {cfg.y}px
                        </label>
                        <input
                          type="range" min={-160} max={280} step={2}
                          value={cfg.y}
                          onChange={(e) => setSlot(key, { y: parseInt(e.target.value) })}
                          className="form-input"
                        />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <label className="form-label" style={{ fontSize: 12 }}>Size — {cfg.size}%</label>
                          <input
                            type="range" min={40} max={220} step={5}
                            value={cfg.size}
                            onChange={(e) => setSlot(key, { size: parseInt(e.target.value) })}
                            className="form-input"
                          />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: 12 }}>Text align</label>
                          <select
                            className="form-input"
                            value={cfg.align}
                            onChange={(e) => setSlot(key, { align: e.target.value as any })}
                          >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => resetSlot(key)}
                        style={{ justifySelf: "start", fontSize: 12, color: "hsl(var(--muted-foreground))", textDecoration: "underline" }}
                      >
                        Reset this slot
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Shared look ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
        <div>
          <label className="form-label">Text colour</label>
          <select
            className="form-input"
            value={config.cardColorToken || ""}
            onChange={(e) => updateField("cardColorToken", e.target.value)}
          >
            {TEXT_COLOR_TOKENS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <p className="form-hint">Theme token, never a fixed hex. A category can override its own.</p>
        </div>

        <div>
          <label className="form-label">Image darkening</label>
          <select
            className="form-input"
            value={config.cardScrimStyle || "flat"}
            onChange={(e) => updateField("cardScrimStyle", e.target.value)}
          >
            <option value="flat">Even wash</option>
            <option value="gradient">Fade from bottom</option>
          </select>
        </div>

        <div>
          <label className="form-label">
            Darkening amount — {Math.round((config.cardScrimOpacity ?? 0.25) * 100)}%
          </label>
          <input
            type="range" min={0} max={0.8} step={0.05}
            value={config.cardScrimOpacity ?? 0.25}
            onChange={(e) => updateField("cardScrimOpacity", parseFloat(e.target.value))}
            className="form-input"
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={config.cardUnderline === true}
              onChange={(e) => updateField("cardUnderline", e.target.checked)}
            />
            Underline the call to action
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={config.cardShadow !== false}
              onChange={(e) => updateField("cardShadow", e.target.checked)}
            />
            Text shadow
          </label>
        </div>
      </div>
    </div>
  );
}
