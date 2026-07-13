"use client";
// Predictable post-image slots: cover + image-1, image-2, … stored at
// blog-images/posts/<slug>/<slot>.<ext>. Write post://<slot> in markdown —
// even before the file exists — and the renderer resolves it at read time.

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Copy, ImagePlus, Trash2 } from "lucide-react";
import DragDropUpload from "@/components/documents/DragDropUpload";
import { createBrowserClient } from "@/utils/supabase/client";
import { cn } from "@/utils/cn";

const BUCKET = "blog-images";

function extOf(file: File): string {
  if (file.type.includes("png")) return "png";
  if (file.type.includes("gif")) return "gif";
  if (file.type.includes("webp")) return "webp";
  if (file.type.includes("svg")) return "svg";
  return "jpg";
}

export function PostImageSlots({
  slug,
  onCoverChange,
  onInsertRef,
  onMapChange,
}: {
  /** Post slug — the storage folder key. Must be non-empty to upload. */
  slug: string;
  onCoverChange: (url: string | null) => void;
  onInsertRef: (markdown: string) => void;
  onMapChange: (map: Record<string, string>) => void;
}) {
  const [slots, setSlots] = useState<Record<string, string>>({}); // slot → public URL
  const [busy, setBusy]   = useState<string | null>(null);

  // Load existing slots for this slug
  useEffect(() => {
    if (!slug) return;
    const supabase = createBrowserClient();
    supabase.storage
      .from(BUCKET)
      .list(`posts/${slug}`, { limit: 100 })
      .then(({ data }) => {
        const found: Record<string, string> = {};
        for (const f of data ?? []) {
          const slot = f.name.replace(/\.[^.]+$/, "");
          found[slot] = supabase.storage.from(BUCKET).getPublicUrl(`posts/${slug}/${f.name}`).data.publicUrl;
        }
        setSlots(found);
        onMapChange(found);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const upload = async (slot: string, file: File) => {
    if (!slug) return toast.error("Set a title or slug first — slots are stored under the post's slug");
    if (!file.type.startsWith("image/")) return toast.error("Not an image file");
    setBusy(slot);
    try {
      const supabase = createBrowserClient();
      const object_path = `posts/${slug}/${slot}.${extOf(file)}`;

      // one slot = one file: evict same-slot files with other extensions
      const { data: existing } = await supabase.storage.from(BUCKET).list(`posts/${slug}`, { limit: 100 });
      const stale = (existing ?? [])
        .filter((f) => f.name.replace(/\.[^.]+$/, "") === slot && `posts/${slug}/${f.name}` !== object_path)
        .map((f) => `posts/${slug}/${f.name}`);
      if (stale.length > 0) await supabase.storage.from(BUCKET).remove(stale);

      const { error } = await supabase.storage.from(BUCKET).upload(object_path, file, {
        upsert: true,
        cacheControl: "3600",
        contentType: file.type,
      });
      if (error) throw new Error(error.message);

      const url = `${supabase.storage.from(BUCKET).getPublicUrl(object_path).data.publicUrl}?v=${Date.now()}`;
      const next = { ...slots, [slot]: url };
      setSlots(next);
      onMapChange(next);
      if (slot === "cover") onCoverChange(url.split("?")[0]);
      toast.success(`${slot} uploaded`);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (slot: string) => {
    const supabase = createBrowserClient();
    const { data: existing } = await supabase.storage.from(BUCKET).list(`posts/${slug}`, { limit: 100 });
    const paths = (existing ?? [])
      .filter((f) => f.name.replace(/\.[^.]+$/, "") === slot)
      .map((f) => `posts/${slug}/${f.name}`);
    if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
    const next = { ...slots };
    delete next[slot];
    setSlots(next);
    onMapChange(next);
    if (slot === "cover") onCoverChange(null);
  };

  const copyRef = (slot: string) => {
    const ref = slot === "cover" ? "post://cover" : `![](post://${slot})`;
    navigator.clipboard.writeText(ref).then(
      () => toast.success(`Copied ${ref}`),
      () => toast.error("Clipboard unavailable"),
    );
  };

  const numbered = Object.keys(slots)
    .filter((s) => /^image-\d+$/.test(s))
    .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
  const nextSlot = `image-${numbered.length > 0 ? Number(numbered[numbered.length - 1].slice(6)) + 1 : 1}`;

  const SlotTile = ({ slot }: { slot: string }) => (
    <div className="flex items-center gap-3 rounded border border-[hsl(var(--border))] p-2">
      {slots[slot] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slots[slot]} alt={slot} className="h-12 w-16 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-[hsl(var(--muted))]">
          <ImagePlus size={16} className="text-[hsl(var(--muted-foreground))]" />
        </div>
      )}
      <div className="min-w-0 grow">
        <p className="truncate font-mono text-xs text-[hsl(var(--foreground))]">post://{slot}</p>
        <div className="mt-1 flex gap-3 text-xs">
          <label className="cursor-pointer font-medium text-primary hover:underline">
            {busy === slot ? "Uploading…" : slots[slot] ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(slot, f);
                e.target.value = "";
              }}
            />
          </label>
          {slots[slot] && (
            <>
              <button onClick={() => copyRef(slot)} className="inline-flex items-center gap-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                <Copy size={11} /> copy ref
              </button>
              {slot !== "cover" && (
                <button onClick={() => onInsertRef(`\n![](post://${slot})\n`)} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                  insert
                </button>
              )}
              <button onClick={() => remove(slot)} className="inline-flex items-center gap-1 text-[hsl(var(--destructive))] hover:opacity-80">
                <Trash2 size={11} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <DragDropUpload onFilesDropped={(files) => {
      const img = files.find((f) => f.type.startsWith("image/"));
      if (img) upload(slots.cover ? nextSlot : "cover", img);
    }}>
      <div className={cn("space-y-2", !slug && "pointer-events-auto opacity-70")}>
        <SlotTile slot="cover" />
        {numbered.map((s) => <SlotTile key={s} slot={s} />)}
        <SlotTile slot={nextSlot} />
        <p className="text-[11px] leading-snug text-[hsl(var(--muted-foreground))]">
          Slots live at posts/{slug || "<slug>"}/. Reference them in markdown as{" "}
          <code>post://image-1</code> — before or after uploading; the blog resolves
          them at render time. Drop an image anywhere here to fill the next slot.
        </p>
      </div>
    </DragDropUpload>
  );
}
