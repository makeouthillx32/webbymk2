"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabasePublicUrlFromImage } from "@/lib/images";
import { safeReadJson } from "../utils";
import type { ProductImageRow } from "../types";

interface ImageEditorProps {
  img: ProductImageRow;
  idx: number;
  productId: string;
  onUpdated: () => void;
  onDeleted: () => void;
}

export function ImageEditor({
  img,
  idx,
  productId,
  onUpdated,
  onDeleted,
}: ImageEditorProps) {
  const [editingAlt, setEditingAlt] = useState(false);
  const [altValue, setAltValue] = useState(img.alt_text || "");
  const [saving, setSaving] = useState(false);

  const url = supabasePublicUrlFromImage(img);

  const saveAlt = async () => {
    if (!img.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/products/admin/${productId}/images/${img.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alt_text: altValue.trim() || null }),
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message ?? "Failed to update alt text");
      }
      toast.success("Alt text updated");
      setEditingAlt(false);
      onUpdated();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update alt text");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-3 items-start border border-[hsl(var(--border))] rounded-lg p-3 bg-[hsl(var(--card))]">
      <div className="relative group flex-shrink-0">
        <img
          src={url || "/placeholder.png"}
          alt={img.alt_text || ""}
          className="w-20 h-20 object-cover rounded border border-[hsl(var(--border))]"
        />
        {img.is_primary && (
          <Badge variant="secondary" className="absolute -top-2 -left-2 text-xs bg-blue-500 text-white">
            Primary
          </Badge>
        )}
      </div>

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            Position: {img.position ?? idx}
          </span>
          {img.is_public && <Badge variant="outline" className="text-xs">Public</Badge>}
        </div>

        {editingAlt ? (
          <div className="space-y-2">
            <Input
              value={altValue}
              onChange={(e) => setAltValue(e.target.value)}
              placeholder={`Alt text for image ${idx + 1}`}
              className="text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") saveAlt();
                if (e.key === "Escape") {
                  setEditingAlt(false);
                  setAltValue(img.alt_text || "");
                }
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveAlt} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingAlt(false);
                  setAltValue(img.alt_text || "");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-[hsl(var(--foreground))] mb-1">
              {img.alt_text || (
                <span className="text-[hsl(var(--muted-foreground))] italic">No alt text</span>
              )}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditingAlt(true)}
              className="h-7 px-2 text-xs"
            >
              Edit Alt Text
            </Button>
          </div>
        )}
      </div>

      <Button
        size="sm"
        variant="ghost"
        onClick={onDeleted}
        className="text-destructive hover:text-destructive flex-shrink-0"
        title="Delete image"
      >
        <X size={16} />
      </Button>
    </div>
  );
}