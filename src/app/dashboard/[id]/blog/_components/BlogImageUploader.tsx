"use client";
// Blog image uploader: drag & drop (reuses the shared DragDropUpload wrapper)
// or click to browse. Uploads straight to the public blog-images bucket,
// records metadata, hands back the public URL.

import { useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { ImagePlus } from "lucide-react";
import DragDropUpload from "@/components/documents/DragDropUpload";
import { createBrowserClient } from "@/utils/supabase/client";
import { cn } from "@/utils/cn";

const BUCKET = "blog-images";

function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "jpg";
}
function rid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function BlogImageUploader({
  postId,
  label = "Drag & drop an image, or click to browse",
  onUploaded,
}: {
  postId: string | null;
  label?: string;
  onUploaded: (publicUrl: string, altText: string) => void;
}) {
  const [altText, setAltText] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Not an image file");
    setBusy(true);
    try {
      const supabase = createBrowserClient();
      const object_path = `posts/${postId ?? "unattached"}/${rid()}.${ext(file.name)}`;

      const up = await supabase.storage.from(BUCKET).upload(object_path, file, {
        upsert: false,
        cacheControl: "3600",
        contentType: file.type || "image/jpeg",
      });
      if (up.error) throw new Error(up.error.message);

      // Metadata row (non-fatal — the file is already usable)
      await fetch(`/api/blog/admin/${postId ?? "unattached"}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket_name: BUCKET, object_path, alt_text: altText || null }),
      }).catch(() => null);

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(object_path);
      toast.success("Image uploaded");
      onUploaded(data.publicUrl, altText);
      setAltText("");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleFiles = (files: File[]) => {
    const image = files.find((f) => f.type.startsWith("image/"));
    if (image) upload(image);
    else toast.error("No image in the dropped files");
  };

  return (
    <div className="space-y-2">
      <DragDropUpload onFilesDropped={handleFiles}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[hsl(var(--border))] px-4 py-6 text-center transition",
            "hover:border-primary hover:bg-primary/5",
            busy && "opacity-60",
          )}
        >
          <ImagePlus size={22} className="text-[hsl(var(--muted-foreground))]" />
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {busy ? "Uploading…" : label}
          </span>
        </button>
      </DragDropUpload>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />

      <input
        value={altText}
        onChange={(e) => setAltText(e.target.value)}
        placeholder="Alt text (optional, set before dropping)"
        className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-xs text-[hsl(var(--foreground))]"
      />
    </div>
  );
}
