"use client";

import React, { useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserClient } from "@/utils/supabase/client";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/images";

function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "jpg";
}

function id() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { 
      ok: false, 
      error: { 
        code: "NON_JSON_RESPONSE", 
        message: text.slice(0, 300) 
      } 
    };
  }
}

export function ProductImageUploader({
  productId,
  onUploaded,
}: {
  productId: string;
  onUploaded?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const upload = async () => {
    if (!file) return toast.error("Choose an image first");

    setIsUploading(true);
    try {
      const supabase = createBrowserClient();

      // ✅ ALWAYS use products/ prefix for consistency
      const object_path = `products/${productId}/${id()}.jpg`;

      console.log('[ProductImageUploader] Uploading to:', object_path);

      // 1) Upload file to bucket
      const up = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(object_path, file, {
        upsert: false,
        cacheControl: "3600",
        contentType: file.type || "image/jpeg",
      });

      if (up.error) {
        console.error('[ProductImageUploader] Storage error:', up.error);
        throw new Error(up.error.message);
      }

      console.log('[ProductImageUploader] Storage success:', up.data);

      // 2) Insert row into product_images via your API (DB metadata)
      const res = await fetch(`/api/products/admin/${productId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket_name: PRODUCT_IMAGE_BUCKET,
          object_path, // ✅ Includes products/ prefix
          alt_text: altText.trim() ? altText.trim() : null,
          is_public: true,
          is_primary: false,
          sort_order: 0,
        }),
      });

      const json = await safeReadJson(res);

      console.log('[ProductImageUploader] DB insert response:', json);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message ?? `Image insert failed: ${res.status}`);
      }

      toast.success("Image uploaded");
      setFile(null);
      setAltText("");
      onUploaded?.();
    } catch (e: any) {
      console.error('[ProductImageUploader] Error:', e);
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <Input
        value={altText}
        onChange={(e) => setAltText(e.target.value)}
        placeholder="Alt text (optional)"
      />
      <Button onClick={upload} disabled={!file || isUploading}>
        {isUploading ? "Uploading…" : "Upload Image"}
      </Button>
      <div className="text-xs text-[hsl(var(--muted-foreground))]">
        Uploads to: <code>{PRODUCT_IMAGE_BUCKET}/products/[productId]/</code>
      </div>
    </div>
  );
}