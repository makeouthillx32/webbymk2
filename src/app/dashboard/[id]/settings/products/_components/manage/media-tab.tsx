import { Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageEditor } from "./image-editor";
import type { ProductRow } from "../types";

interface MediaTabProps {
  detail: ProductRow;
  files: File[];
  alt: string;
  uploading: boolean;
  setFiles: (files: File[]) => void;
  setAlt: (alt: string) => void;
  uploadImages: () => void;
  deleteImage: (imgId: string) => void;
  onUpdated: () => void;
}

export function MediaTab({
  detail,
  files,
  alt,
  uploading,
  setFiles,
  setAlt,
  uploadImages,
  deleteImage,
  onUpdated,
}: MediaTabProps) {
  const readiness = detail.provider_artwork_readiness;
  const missingColors = readiness?.colors.filter((color) => !color.hasArtwork) ?? [];

  return (
    <div className="space-y-6">
      {readiness?.managed && (
        <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 text-amber-950 dark:border-amber-700/70 dark:bg-amber-950/20 dark:text-amber-100">
          <h3 className="text-sm font-semibold">Printful color mockup readiness</h3>
          <p className="mt-1 text-xs opacity-80">
            Tag each finished mockup with its color name. A color becomes sellable only when its
            Printful variant is enabled and its artwork mockup is present.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {readiness.readyColors.map((color) => (
              <span key={`ready-${color}`} className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                {color}: ready
              </span>
            ))}
            {readiness.awaitingVendorColors.map((color) => (
              <span key={`vendor-${color}`} className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                {color}: enable in Printful
              </span>
            ))}
          </div>
          {missingColors.length > 0 && (
            <details className="mt-3" open={missingColors.length <= 8}>
              <summary className="cursor-pointer text-sm font-medium">
                Add artwork mockups for {missingColors.length} color{missingColors.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {missingColors.map((entry) => (
                  <button
                    key={entry.color}
                    type="button"
                    onClick={() => setAlt(entry.color)}
                    className="rounded-md border border-amber-300 bg-white/70 px-2.5 py-1 text-xs hover:bg-white dark:border-amber-700 dark:bg-black/20"
                    title={entry.vendorEnabled ? "Add a finished mockup" : "Add a finished mockup, then enable this color in Printful"}
                  >
                    Add mockup: {entry.color}{entry.vendorEnabled ? "" : " + enable vendor"}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Upload New Images Section */}
      <div className="border border-[hsl(var(--border))] rounded-lg p-4 bg-[hsl(var(--muted)/0.3)]">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ImageIcon size={16} />
          Upload New Images
        </h3>
        <div className="space-y-3">
          <Input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />

          {files.length > 0 && (
            <div className="space-y-2">
              <Input
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="Color tag, for example Yellow"
              />
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                This alt text will be applied to all {files.length} selected image(s). You can
                edit individual alt text after uploading.
              </p>
            </div>
          )}

          <Button onClick={uploadImages} disabled={uploading || files.length === 0}>
            {uploading ? "Uploading…" : `Upload ${files.length} image(s)`}
          </Button>
        </div>
      </div>

      {/* Existing Images Section */}
      <div>
        <h3 className="text-sm font-semibold mb-3">
          Existing Images ({(detail.product_images ?? []).length})
        </h3>

        {(detail.product_images ?? []).length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[hsl(var(--border))] rounded-lg">
            <ImageIcon size={32} className="mx-auto mb-2 text-[hsl(var(--muted-foreground))]" />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No images yet. Upload some above to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(detail.product_images ?? []).map((img, idx) => (
              <ImageEditor
                key={img.id || idx}
                img={img}
                idx={idx}
                productId={detail.id}
                onUpdated={onUpdated}
                onDeleted={() => img.id && deleteImage(img.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
