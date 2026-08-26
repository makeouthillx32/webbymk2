"use client";

// Shared uploader/gallery for Tank's bucket-only image assets (art + emoji).
// No database table backs either — folder listing is the source of truth,
// same convention as blog images (see lib/storage/upload.ts).

import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { ImagePlus, Trash2 } from "lucide-react";
import DragDropUpload from "@/components/documents/DragDropUpload";
import { cn } from "@/utils/cn";
import { uploadToFolder, listFolder, removeObjects, type StoredObject } from "@/lib/storage/upload";
import type { StorageBucket } from "@/lib/storage/buckets";

export function TankImageBucketManager({
  bucket,
  folder,
  title,
  description,
}: {
  bucket: StorageBucket;
  folder: string;
  title: string;
  description: string;
}) {
  const [objects, setObjects] = useState<StoredObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setObjects(await listFolder({ bucket, folder }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, folder]);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await uploadToFolder({ bucket, folder, file });
      toast.success("Uploaded");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (path: string) => {
    if (!confirm("Delete this file?")) return;
    try {
      await removeObjects({ bucket, paths: [path] });
      toast.success("Deleted");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Delete failed");
    }
  };

  const handleFiles = (files: File[]) => {
    const image = files.find((file) => file.type.startsWith("image/"));
    if (image) void upload(image);
    else toast.error("No image in the dropped files");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">{title}</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
      </div>

      <DragDropUpload onFilesDropped={handleFiles}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[hsl(var(--border))] px-4 py-8 text-center transition",
            "hover:border-primary hover:bg-primary/5",
            busy && "opacity-60",
          )}
        >
          <ImagePlus size={24} className="text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <span className="text-sm text-[hsl(var(--muted-foreground))]">
            {busy ? "Uploading…" : "Drag & drop an image, or click to browse"}
          </span>
        </button>
      </DragDropUpload>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />

      {loading ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
      ) : objects.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Nothing uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {objects.map((object) => (
            <div
              key={object.path}
              className="group relative aspect-square overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={object.publicUrl} alt={object.name} className="h-full w-full object-contain p-2" />
              <button
                type="button"
                onClick={() => void remove(object.path)}
                className="absolute right-1 top-1 hidden rounded-full bg-black/70 p-1.5 text-white group-hover:block"
                aria-label={`Delete ${object.name}`}
              >
                <Trash2 size={12} />
              </button>
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 text-[10px] text-white">
                {object.name.replace(/\.[^.]+$/, "")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
