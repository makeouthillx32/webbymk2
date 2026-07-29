"use client";
// Predictable image slots for a post: posts/<slug>/cover|image-N.<ext>.
// Presentational — all upload/remove logic lives in usePostSlots.

import { Copy, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/utils/cn";
import DragDropUpload from "@/components/documents/DragDropUpload";
import { COVER_SLOT } from "@/lib/blog/constants";
import { slotMarkdown, slotRef } from "@/lib/blog/images";
import type { UsePostSlotsResult } from "@/hooks/blog/usePostSlots";

function SlotTile({
  slot,
  url,
  busy,
  disabled,
  isCover,
  onUpload,
  onRemove,
  onInsert,
  onMakeCover,
}: {
  slot: string;
  url?: string;
  busy: boolean;
  disabled: boolean;
  isCover: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
  onInsert: () => void;
  onMakeCover: () => void;
}) {
  const copyRef = () => {
    const snippet = slot === COVER_SLOT ? slotRef(slot) : slotMarkdown(slot).trim();
    navigator.clipboard.writeText(snippet).then(
      () => toast.success(`Copied ${snippet}`),
      () => toast.error("Clipboard unavailable"),
    );
  };

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius)] border border-[hsl(var(--border))] p-2">
      {url ? (
        <button
          type="button"
          onClick={copyRef}
          title={`Tap to copy ${slotRef(slot)} — paste it into the markdown`}
          aria-label={`Copy image reference for ${slot}`}
          className="shrink-0 rounded-[var(--radius)] transition active:scale-95 active:opacity-70"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={slot} className="h-12 w-16 rounded-[var(--radius)] object-cover" />
        </button>
      ) : (
        <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[hsl(var(--muted))]">
          {busy ? (
            <Loader2 size={15} className="animate-spin text-primary" aria-hidden="true" />
          ) : (
            <ImagePlus size={16} className="text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          )}
        </div>
      )}

      <div className="min-w-0 grow">
        <p className="flex items-center gap-1.5 truncate font-mono text-xs text-[hsl(var(--foreground))]">
          {slotRef(slot)}
          {isCover ? <Star size={11} className="fill-primary text-primary" aria-label="cover" /> : null}
        </p>

        <div className="mt-1 flex flex-wrap gap-3 text-xs">
          <label
            className={cn(
              "cursor-pointer font-medium text-primary hover:underline",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            {busy ? "Uploading…" : url ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={disabled || busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onUpload(file);
              }}
            />
          </label>

          {url ? (
            <>
              {slot !== COVER_SLOT ? (
                <>
                  <button
                    type="button"
                    onClick={onInsert}
                    className="-m-1 rounded p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  >
                    insert
                  </button>
                  {!isCover ? (
                    <button
                      type="button"
                      onClick={onMakeCover}
                      className="-m-1 rounded p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    >
                      make cover
                    </button>
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                onClick={copyRef}
                className="-m-1 inline-flex items-center gap-1 rounded p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                <Copy size={11} aria-hidden="true" /> ref
              </button>
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${slot}`}
                className="-m-1 inline-flex items-center gap-1 rounded p-1 text-[hsl(var(--destructive))] hover:opacity-80"
              >
                <Trash2 size={11} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PostImageSlots({
  slug,
  slots,
  coverImage,
  onSetCover,
  onInsert,
}: {
  slug: string;
  slots: UsePostSlotsResult;
  coverImage: string | null;
  onSetCover: (ref: string | null) => void;
  onInsert: (snippet: string) => void;
}) {
  const disabled = !slug;
  const visible = [COVER_SLOT, ...slots.imageSlots, slots.nextSlot];

  return (
    <DragDropUpload
      onFilesDropped={(files) => {
        const image = files.find((file) => file.type.startsWith("image/"));
        if (!image) return;
        void slots.upload(slots.slots[COVER_SLOT] ? slots.reserveSlot() : COVER_SLOT, image);
      }}
    >
      <div className={cn("space-y-2", disabled && "opacity-70")}>
        {visible.map((slot) => (
          <SlotTile
            key={slot}
            slot={slot}
            url={slots.slots[slot]}
            busy={slots.isBusy(slot)}
            disabled={disabled}
            isCover={coverImage === slotRef(slot)}
            onUpload={(file) => void slots.upload(slot, file)}
            onRemove={() => void slots.remove(slot)}
            onInsert={() => onInsert(slotMarkdown(slot))}
            onMakeCover={() => onSetCover(slotRef(slot))}
          />
        ))}

        <p className="text-[11px] leading-snug text-[hsl(var(--muted-foreground))]">
          Slots live at <code>posts/{slug || "<slug>"}/</code>. Reference them as{" "}
          <code>post://image-1</code> — before or after uploading; the blog resolves them at
          render time. Drop an image here to fill the next one.
        </p>
      </div>
    </DragDropUpload>
  );
}
