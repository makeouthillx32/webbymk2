import React, { useState } from "react";
import { X, UploadCloud } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ImageWithAlt } from "../types";

interface ImageSectionProps {
  images: ImageWithAlt[];
  handleFilesSelected: (fileList: FileList | null) => void;
  updateImageAlt: (index: number, alt: string) => void;
  removeImage: (index: number) => void;
  setPrimaryImage: (index: number) => void;
}

export function ImageSection({
  images,
  handleFilesSelected,
  updateImageAlt,
  removeImage,
  setPrimaryImage,
}: ImageSectionProps) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFilesSelected(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-[hsl(var(--sidebar-primary))] bg-[hsl(var(--sidebar-primary))]/10"
            : "border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 hover:bg-[hsl(var(--muted))]/40"
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
            handleFilesSelected(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {images.length > 0 && (
        <div className="space-y-2">
          {images.map((img, idx) => (
            <div
              key={idx}
              className="flex gap-3 items-start border border-[hsl(var(--border))] rounded-lg p-3"
            >
              <img
                src={img.preview}
                alt={img.alt || "Preview"}
                className="w-20 h-20 object-cover rounded"
              />
              <div className="flex-1 space-y-2">
                <Input
                  value={img.alt}
                  onChange={(e) => updateImageAlt(idx, e.target.value)}
                  placeholder={`Alt text for image ${idx + 1}`}
                />
                <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                  <span>Position: {img.position}</span>
                  {img.isPrimary && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                      Primary
                    </span>
                  )}
                  {!img.isPrimary && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setPrimaryImage(idx)}
                    >
                      Set as Primary
                    </Button>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeImage(idx)}
              >
                <X size={16} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
