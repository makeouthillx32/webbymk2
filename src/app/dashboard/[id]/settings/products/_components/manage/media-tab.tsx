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
  return (
    <div className="space-y-6">
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
                placeholder="Alt text for all new images (optional)"
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