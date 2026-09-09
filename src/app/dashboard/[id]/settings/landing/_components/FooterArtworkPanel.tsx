"use client";

// FooterArtworkPanel
// ─────────────────────────────────────────────────────────────────────────────
// Upload slots for the two decorative shapes in the landing footer, shown on
// the Home Heroes tab.
//
// This is the artwork-replacement surface — distinct from the `footer_chrome`
// SECTION, which only restyles the built-in shapes (tint/opacity/size). Here
// you replace the artwork itself, and it takes effect with no rebuild:
// upload → site_assets row → the footer picks it up on next load.
//
// Uploaded art is previewed and rendered through <img>, never inlined. An
// uploaded SVG is untrusted markup that can contain <script>; inlining one
// would be stored XSS for every visitor. <img> does not execute script.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from "react";

type SlotId = "polygon" | "orb";

type SlotState = {
  slot: SlotId;
  key: string;
  url: string | null;
  format: string | null;
  updatedAt: string | null;
};

const SLOT_META: Record<SlotId, { title: string; hint: string }> = {
  polygon: {
    title: "Polygon (bottom-left)",
    hint: "Angular gradient shape anchored to the lower-left of the footer.",
  },
  orb: {
    title: "Orb (top-right)",
    hint: "Soft blurred circle anchored to the upper-right of the footer.",
  },
};

const ACCEPT = "image/svg+xml,image/png,image/webp,image/avif";

export default function FooterArtworkPanel() {
  const [slots, setSlots] = useState<SlotState[] | null>(null);
  const [busy, setBusy] = useState<SlotId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputs = useRef<Partial<Record<SlotId, HTMLInputElement | null>>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/landing/footer-artwork", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `load failed (${res.status})`);
      setSlots(body.slots as SlotState[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load footer artwork");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(slot: SlotId, file: File) {
    setBusy(slot);
    setError(null);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append("slot", slot);
      fd.append("file", file);
      const res = await fetch("/api/landing/footer-artwork", { method: "POST", body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `upload failed (${res.status})`);
      setNotice(`${SLOT_META[slot].title} updated — live now, no rebuild needed.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
      if (inputs.current[slot]) inputs.current[slot]!.value = "";
    }
  }

  async function revert(slot: SlotId) {
    setBusy(slot);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/landing/footer-artwork?slot=${slot}`, { method: "DELETE" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `revert failed (${res.status})`);
      setNotice(`${SLOT_META[slot].title} reverted to the built-in shape.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revert failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">Footer Artwork</h3>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm text-[hsl(var(--primary))] hover:underline"
        >
          Refresh
        </button>
      </div>
      <p className="mb-5 text-sm text-[hsl(var(--muted-foreground))]">
        Replace the two decorative shapes in the site footer. Uploads go live immediately —
        no rebuild or redeploy. Leave a slot empty to use the built-in shape, which follows
        your theme colour automatically.
      </p>

      {error && (
        <p className="mb-4 rounded-md border border-[hsl(var(--destructive)/0.35)] bg-[hsl(var(--destructive)/0.1)] px-3 py-2 text-sm text-[hsl(var(--destructive))]">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-md border border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.1)] px-3 py-2 text-sm text-[hsl(var(--primary))]">
          {notice}
        </p>
      )}

      {slots === null ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {slots.map((s) => {
            const meta = SLOT_META[s.slot];
            const isBusy = busy === s.slot;
            return (
              <div
                key={s.slot}
                className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="font-medium text-[hsl(var(--foreground))]">{meta.title}</h4>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (s.url
                        ? "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                        : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]")
                    }
                  >
                    {s.url ? `custom · ${s.format}` : "built-in"}
                  </span>
                </div>
                <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">{meta.hint}</p>

                <div className="mb-3 flex h-28 items-center justify-center rounded-md border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)]">
                  {s.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${s.url}?v=${encodeURIComponent(s.updatedAt ?? "")}`}
                      alt={`${meta.title} artwork`}
                      className="max-h-24 max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      Using built-in shape
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={(el) => {
                      inputs.current[s.slot] = el;
                    }}
                    type="file"
                    accept={ACCEPT}
                    disabled={isBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(s.slot, f);
                    }}
                    className="block w-full text-xs text-[hsl(var(--muted-foreground))] file:mr-3 file:rounded file:border-0 file:bg-[hsl(var(--primary))] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[hsl(var(--primary-foreground))]"
                  />
                  {s.url && (
                    <button
                      type="button"
                      onClick={() => void revert(s.slot)}
                      disabled={isBusy}
                      className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] transition hover:text-[hsl(var(--destructive))] disabled:opacity-50"
                    >
                      Revert to built-in
                    </button>
                  )}
                </div>

                {isBusy && (
                  <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Working…</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-xs text-[hsl(var(--muted-foreground))]">
        SVG, PNG, WebP or AVIF · max 2 MB per slot. Artwork is served from storage and
        rendered as an image (never inlined), so an uploaded SVG cannot run scripts on the site.
      </p>
    </section>
  );
}
