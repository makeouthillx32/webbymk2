"use client";
// Standalone image uploader: drag & drop or click to browse, upload into the
// blog-images bucket, record metadata, hand back the public URL. Used by the
// chrome manager for promo/banner artwork.
//
// The upload itself goes through lib/blog/images → lib/storage, so it obeys the
// same bucket, size and cache rules as every other upload in the dashboard.

import { useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { ImagePlus } from "lucide-react";
import DragDropUpload from "@/components/documents/DragDropUpload";
import { cn } from "@/utils/cn";
import { uploadLooseImage } from "@/lib/blog/images";

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
    setBusy(true);
    try {
      const uploaded = await uploadLooseImage({ postId, file, altText: altText || null });
      toast.success("Image uploaded");
      onUploaded(uploaded.publicUrl, altText);
      setAltText("");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleFiles = (files: File[]) => {
    const image = files.find((file) => file.type.startsWith("image/"));
    if (image) void upload(image);
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
          <ImagePlus size={22} className="text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
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
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />

      <input
        value={altText}
        onChange={(event) => setAltText(event.target.value)}
        placeholder="Alt text (optional, set before dropping)"
        className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-xs text-[hsl(var(--foreground))]"
      />
    </div>
  );
}
