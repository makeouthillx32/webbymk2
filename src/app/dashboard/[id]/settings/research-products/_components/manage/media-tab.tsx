import { useState } from "react";
import { Image as ImageIcon, UploadCloud, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageEditor } from "./image-editor";
import { parseVariantTag } from "./parse-variant-tag";
import type { ProductRow } from "../types";

interface MediaTabProps {
  detail: ProductRow;
  smartUploading: boolean;
  smartUploadImages: (
    taggedFiles: { file: File; label: string; imageType: "photo" | "lab_report" }[]
  ) => Promise<{ file: File; ok: boolean; variantTitle?: string; error?: string }[]>;
  deleteImage: (imgId: string) => void;
  onUpdated: () => void;
}

type TaggedFile = {
  file: File;
  preview: string;
  label: string;
  imageType: "photo" | "lab_report";
  matchedDosage: boolean;
  error?: string;
};

export function MediaTab({
  detail,
  smartUploading,
  smartUploadImages,
  deleteImage,
  onUpdated,
}: MediaTabProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [queue, setQueue] = useState<TaggedFile[]>([]);
  const [bulkLabel, setBulkLabel] = useState("");

  // Existing variant titles for this product — offered as autocomplete so a
  // typo doesn't spin up a near-duplicate variant (e.g. "5 mg" vs "5mg").
  const existingVariantTitles = Array.from(
    new Set((detail.product_variants ?? []).map((v: any) => v?.title).filter(Boolean))
  ) as string[];

  const addToQueue = (incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const next = Array.from(incoming)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => {
        const parsed = parseVariantTag(file.name);
        return {
          file,
          preview: URL.createObjectURL(file),
          label: parsed.label,
          imageType: parsed.imageType,
          matchedDosage: parsed.matchedDosage,
        };
      });
    if (next.length === 0) return;
    setQueue([...queue, ...next]);
  };

  const removeFromQueue = (idx: number) => {
    setQueue((q) => {
      const target = q[idx];
      if (target) URL.revokeObjectURL(target.preview);
      return q.filter((_, i) => i !== idx);
    });
  };

  const updateQueueItem = (idx: number, patch: Partial<TaggedFile>) => {
    setQueue((q) => q.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  // Apply one label to every queued file that didn't match a dosage pattern —
  // covers the common case of a whole batch (product photos + lab scans)
  // belonging to a single variant with no dosage token in any filename, so
  // you don't have to retype the same label into every row by hand.
  const applyBulkLabelToUnmatched = () => {
    const label = bulkLabel.trim();
    if (!label) return;
    setQueue((q) => q.map((item) => (item.matchedDosage ? item : { ...item, label })));
  };

  const applyBulkLabelToAll = () => {
    const label = bulkLabel.trim();
    if (!label) return;
    setQueue((q) => q.map((item) => ({ ...item, label })));
  };

  const runUpload = async () => {
    if (queue.length === 0) return;
    const results = await smartUploadImages(
      queue.map(({ file, label, imageType }) => ({ file, label, imageType }))
    );
    const errorByFile = new Map(results.filter((r) => !r.ok).map((r) => [r.file, r.error]));
    setQueue((q) =>
      q
        .filter((item) => errorByFile.has(item.file))
        .map((item) => ({ ...item, error: errorByFile.get(item.file) }))
    );
  };

  const needsReviewCount = queue.filter((q) => !q.matchedDosage).length;

  return (
    <div className="space-y-6">
      {/* Autocomplete source for variant-label inputs below — reduces typo'd
          near-duplicate variants (e.g. "5 mg" vs "5mg") by suggesting the
          product's existing variant titles. */}
      <datalist id="existing-variant-titles">
        {existingVariantTitles.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {/* Upload — auto-formats variant + type from filename, edit before saving */}
      <div className="border border-[hsl(var(--border))] rounded-lg p-4 bg-[hsl(var(--muted)/0.3)]">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <ImageIcon size={16} />
          Upload New Images
        </h3>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mb-3">
          Drop files in — each one is auto-tagged with a variant (from its filename, e.g.{" "}
          <code>10mg-vial.jpg</code>) and marked as a photo or, with a{" "}
          <code>-labs</code>/<code>-coa</code> suffix, a lab report. Adjust anything below, then
          upload.
        </p>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            addToQueue(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-[hsl(var(--sidebar-primary))] bg-[hsl(var(--sidebar-primary))]/10"
              : "border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted))]/40"
          }`}
        >
          <UploadCloud size={28} className="text-[hsl(var(--muted-foreground))]" />
          <p className="text-sm font-medium">Drag & drop images here, or click to browse</p>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addToQueue(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {queue.length > 0 && (
          <div className="mt-3 space-y-2">
            {needsReviewCount > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {needsReviewCount} file(s) didn't match a dosage pattern — check the label field
                  before uploading.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={bulkLabel}
                    onChange={(e) => setBulkLabel(e.target.value)}
                    placeholder="Set variant label, e.g. 5mg"
                    list="existing-variant-titles"
                    className="h-8 text-sm max-w-[220px]"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 px-2 text-xs"
                    disabled={!bulkLabel.trim()}
                    onClick={applyBulkLabelToUnmatched}
                  >
                    Apply to {needsReviewCount} unmatched
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    disabled={!bulkLabel.trim()}
                    onClick={applyBulkLabelToAll}
                  >
                    Apply to all {queue.length}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {queue.map((item, idx) => (
                <div
                  key={`${item.file.name}-${item.file.lastModified}-${idx}`}
                  className={`flex items-center gap-3 rounded-lg border p-2 ${
                    item.matchedDosage
                      ? "border-[hsl(var(--border))] bg-[hsl(var(--background))]"
                      : "border-amber-400/50 bg-amber-50 dark:bg-amber-500/10"
                  }`}
                >
                  <img
                    src={item.preview}
                    alt=""
                    className="w-12 h-12 rounded object-cover shrink-0 border border-[hsl(var(--border))]"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                      {item.file.name}
                    </p>
                    {item.error && (
                      <p className="text-xs text-red-600 dark:text-red-400">{item.error}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <Input
                        value={item.label}
                        onChange={(e) => updateQueueItem(idx, { label: e.target.value })}
                        placeholder="Variant label, e.g. 10mg"
                        list="existing-variant-titles"
                        className="h-8 text-sm"
                      />
                      <label className="flex items-center gap-1.5 text-xs whitespace-nowrap text-[hsl(var(--muted-foreground))]">
                        <input
                          type="checkbox"
                          checked={item.imageType === "lab_report"}
                          onChange={(e) =>
                            updateQueueItem(idx, {
                              imageType: e.target.checked ? "lab_report" : "photo",
                            })
                          }
                        />
                        <FileText size={12} />
                        Lab report
                      </label>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromQueue(idx)}
                    className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] shrink-0"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <Button onClick={runUpload} disabled={smartUploading} className="w-full">
              {smartUploading ? "Uploading…" : `Upload ${queue.length} image(s)`}
            </Button>
          </div>
        )}
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
