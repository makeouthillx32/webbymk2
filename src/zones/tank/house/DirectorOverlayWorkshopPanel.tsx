"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Copy,
  ExternalLink,
  LayoutGrid,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import type { DerivedRoom } from "../contracts";
import { ChromePanel } from "../public/components/ChromePanel";
import {
  DIRECTOR_OVERLAY_WORKSHOP,
  type DirectorOverlayId,
  type DirectorOverlayValues,
} from "./directorOverlayWorkshop";

// Where a director overlay is TUNED. OBS Studio is where it is PLACED.
//
// The URL below carries no query string on purpose. Settings are stored against
// the overlay and pushed to every running browser source over realtime, so the
// address is pasted into OBS once and never touched again — changing a caption
// here changes it on air without a re-paste and without a reload.
//
// A query parameter still beats a stored value (see overlaySettings.ts). That
// keeps every URL already pasted into OBS working, but it does mean a setting
// pinned in a URL cannot be changed from here — which is why the note under the
// address says so rather than leaving someone to wonder why saving did nothing.
//
// The whole form renders from DIRECTOR_OVERLAY_WORKSHOP, so every control is
// guaranteed to correspond to a parameter the overlay actually reads. A field
// that writes something nothing parses looks identical to one that works, right
// up until it is on air.

type Props = {
  rooms: DerivedRoom[];
  overlayId: DirectorOverlayId;
};

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Overlays that legitimately show nothing most of the time.
 *
 * Added after an operator reported "none of them are rendering" in OBS: some are
 * event-driven, and an idle overlay looks exactly like a broken one.
 */
const IDLE_BY_DESIGN: Partial<Record<DirectorOverlayId, string>> = {
  attention:
    "the banner only appears while the director holds an attention lock.",
  goal: "nothing is drawn unless a goal is switched on in the Stream Goals deck.",
};

/**
 * How to prove THIS overlay is alive, naming a control it actually has.
 *
 * Derived from the definition rather than written per overlay, because the
 * hand-written version told the (since-removed) Programme Audio operator to "turn on Hold
 * visible" — a toggle that overlay does not have and never had. An instruction
 * naming a control that is not on screen is worse than no instruction: it reads
 * as the feature being broken.
 */
function verificationHint(
  definition: (typeof DIRECTOR_OVERLAY_WORKSHOP)[number],
): string {
  const has = (key: string) =>
    definition.fields.some((field) => field.key === key);
  if (has("preview")) {
    return "Turn on “Hold visible” above to prove it is working and to position it.";
  }
  if (has("debug")) {
    return "Turn on “Show debug readout” above to confirm it is connected and hearing a room.";
  }
  return "There is no way to force it on — watch for it during the next camera cut.";
}

export function DirectorOverlayWorkshopPanel({ rooms, overlayId }: Props) {
  const definition = useMemo(
    () => DIRECTOR_OVERLAY_WORKSHOP.find((entry) => entry.id === overlayId),
    [overlayId],
  );

  const [values, setValues] = useState<DirectorOverlayValues>({});
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Decks are URL-driven, so moving between them is a URL change.
  const router = useRouter();
  const searchParams = useSearchParams();
  const onPlaceInStudio = useCallback(() => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("deck", "director");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://tank.unenter.live";
  const url = definition ? `${origin}${definition.route}` : "";

  // Load what is actually stored, so the form shows the live configuration
  // rather than defaults that would overwrite it on the next save.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSaveState("idle");
    (async () => {
      try {
        const response = await fetch("/api/tank/overlay-settings", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (cancelled) return;
        setValues((body?.settings?.[overlayId] as DirectorOverlayValues) ?? {});
        setError(null);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [overlayId]);

  const save = useCallback(async () => {
    setSaveState("saving");
    setError(null);
    try {
      const response = await fetch("/api/tank/overlay-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overlayId, settings: values }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [overlayId, values]);

  if (!definition) return null;

  const set = (key: string, value: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaveState("idle");
  };

  const boolOf = (key: string, fallback: boolean) =>
    typeof values[key] === "boolean" ? (values[key] as boolean) : fallback;

  return (
    <ChromePanel withScrews>
      <div className="space-y-4 p-1">
        <header className="border-b border-black/15 pb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700">
            Director overlay
          </p>
          <h3 className="mt-1 text-base font-black uppercase tracking-wide text-[#241f14]">
            {definition.title}
          </h3>
          <p className="mt-1 max-w-3xl text-[11px] font-semibold leading-relaxed text-slate-600">
            {definition.description}
          </p>

          {/* Sizing is the single most common reason an overlay "does not
              render": these anchor to the viewport, so the browser source IS
              their coordinate space. Sized to a small box, the overlay
              re-anchors inside that box rather than cropping to it. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded border border-emerald-600/40 bg-emerald-500/10 px-2 py-1 font-mono text-[11px] font-black text-emerald-700">
              Browser source size: {definition.recommendedWidth} ×{" "}
              {definition.recommendedHeight}
            </span>
            <span className="text-[10px] font-semibold text-slate-500">
              {definition.sizingNote}
            </span>
          </div>

          {/* Three of these five draw nothing until something happens, which is
              indistinguishable from being broken. Say so rather than letting
              someone conclude the overlay does not work. */}
          {IDLE_BY_DESIGN[definition.id] ? (
            <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold leading-snug text-amber-800">
              Draws nothing right now — {IDLE_BY_DESIGN[definition.id]} That is
              correct, not broken. {verificationHint(definition)}
            </p>
          ) : null}
        </header>

        {loading ? (
          <p className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading saved settings…
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {definition.fields.map((field) => (
            <label key={field.key} className="space-y-1">
              <span className="block text-[10px] font-black uppercase tracking-wide text-[#5a5442]">
                {field.label}
              </span>

              {field.kind === "text" ? (
                <input
                  value={
                    typeof values[field.key] === "string"
                      ? (values[field.key] as string)
                      : ""
                  }
                  onChange={(e) => set(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded border border-slate-700 bg-black/50 px-2 py-1.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-600"
                />
              ) : null}

              {field.kind === "room" ? (
                <select
                  value={
                    typeof values[field.key] === "string"
                      ? (values[field.key] as string)
                      : ""
                  }
                  onChange={(e) => set(field.key, e.target.value)}
                  className="w-full rounded border border-slate-700 bg-black/50 px-2 py-1.5 font-mono text-[11px] text-slate-200"
                >
                  <option value="">Follow the director</option>
                  {/* `roomKey`, not a display label — this is what the overlays
                      match a room lock against. */}
                  {rooms.map((room) => (
                    <option key={room.roomKey} value={room.roomKey}>
                      {room.title}
                    </option>
                  ))}
                </select>
              ) : null}

              {field.kind === "choice" ? (
                <>
                  <select
                    value={
                      typeof values[field.key] === "string"
                        ? (values[field.key] as string)
                        : field.value
                    }
                    onChange={(e) => set(field.key, e.target.value)}
                    className="w-full rounded border border-slate-700 bg-black/50 px-2 py-1.5 font-mono text-[11px] text-slate-200"
                  >
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {/* The hint for the SELECTED option, not all of them — an
                      operator picking a texture wants to know what this one
                      does, not read the catalogue. */}
                  {(() => {
                    const current =
                      typeof values[field.key] === "string"
                        ? (values[field.key] as string)
                        : field.value;
                    const hint = field.options.find(
                      (o) => o.value === current,
                    )?.hint;
                    return hint ? (
                      <span className="mt-1 block text-[9px] text-slate-500">
                        {hint}
                      </span>
                    ) : null;
                  })()}
                </>
              ) : null}

              {field.kind === "toggle" ? (
                <button
                  type="button"
                  onClick={() =>
                    set(field.key, !boolOf(field.key, field.value))
                  }
                  className={`w-full rounded border px-2 py-1.5 text-[11px] font-black uppercase transition ${
                    boolOf(field.key, field.value)
                      ? "border-emerald-500/50 bg-emerald-600/20 text-emerald-300"
                      : "border-slate-700 bg-black/50 text-slate-400"
                  }`}
                >
                  {boolOf(field.key, field.value) ? "On" : "Off"}
                </button>
              ) : null}

              {field.kind === "number" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={
                      typeof values[field.key] === "number"
                        ? (values[field.key] as number)
                        : field.value
                    }
                    onChange={(e) => set(field.key, Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-black/50 px-2 py-1.5 font-mono text-[11px] text-slate-200"
                  />
                  {field.unit ? (
                    <span className="font-mono text-[10px] font-bold text-slate-500">
                      {field.unit}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {field.help ? (
                <span className="block text-[10px] leading-snug text-slate-500">
                  {field.help}
                </span>
              ) : null}
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-black/15 pt-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saveState === "saving" || loading}
            className="inline-flex items-center gap-1.5 rounded bg-orange-600 px-4 py-1.5 text-[10px] font-black uppercase text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saveState === "saving" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : saveState === "saved" ? (
              <Check className="h-3 w-3" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Live on air"
                : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setValues({});
              setSaveState("idle");
            }}
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-[10px] font-black uppercase text-slate-400 transition hover:border-slate-500"
          >
            <RotateCcw className="h-3 w-3" />
            Clear
          </button>
          <span className="text-[10px] font-semibold text-slate-500">
            Saving applies to every running browser source immediately — no
            reload, no re-paste.
          </span>
        </div>

        {error ? (
          <p className="rounded border border-red-500/40 bg-red-950/30 px-2 py-1 font-mono text-[10px] text-red-300">
            {error}
          </p>
        ) : null}

        <div className="space-y-2 border-t border-black/15 pt-3">
          <span className="block text-[10px] font-black uppercase tracking-wide text-[#5a5442]">
            Browser source URL — paste once, never again
          </span>
          <code className="block overflow-x-auto whitespace-nowrap rounded border border-slate-700 bg-black/60 px-2 py-2 font-mono text-[11px] text-emerald-300">
            {url}
          </code>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-[10px] font-black uppercase text-slate-300 transition hover:border-slate-500"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "Copied" : "Copy URL"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-[10px] font-black uppercase text-slate-300 transition hover:border-slate-500"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
            {/* The return trip. Tuning an overlay and then positioning it are
                two halves of one job, and having to find the other deck by hand
                is what made them feel like separate tools. */}
            <button
              type="button"
              onClick={onPlaceInStudio}
              className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-[10px] font-black uppercase text-slate-300 transition hover:border-slate-500"
            >
              <LayoutGrid className="h-3 w-3" />
              Place in OBS Studio
            </button>
          </div>
          <p className="text-[10px] leading-snug text-slate-500">
            No query string needed — the settings above travel with it. If an
            existing OBS URL sets one of these as a parameter (
            <code>?label=…</code>), that parameter wins and the saved value is
            ignored for that source.
          </p>
        </div>
      </div>
    </ChromePanel>
  );
}

export default DirectorOverlayWorkshopPanel;
