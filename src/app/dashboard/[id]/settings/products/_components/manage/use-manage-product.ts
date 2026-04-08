"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { createBrowserClient } from "@/utils/supabase/client";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/images";
import { safeReadJson, moneyToCents, slugify, randId, convertToWebP } from "../utils";
import type { ProductRow } from "../types";

export function useManageProduct(
  productId: string | null,
  open: boolean,
  onChanged: () => void
) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [detail, setDetail] = useState<ProductRow | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formBadge, setFormBadge] = useState("");
  const [formMaterial, setFormMaterial] = useState("");
  const [formMadeIn, setFormMadeIn] = useState("");
  const [formFeatured, setFormFeatured] = useState(false);
  const [formStatus, setFormStatus] = useState<"draft" | "active" | "archived">("draft");

  // Media state
  const [files, setFiles] = useState<File[]>([]);
  const [alt, setAlt] = useState("");

  // Tags state
  const [tagInput, setTagInput] = useState("");

  // Categories & Collections
  const [availableCategories, setAvailableCategories] = useState<any[]>([]);
  const [availableCollections, setAvailableCollections] = useState<any[]>([]);

  const load = async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/products/admin/${productId}`, { cache: "no-store" });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed to load product");

      const data = json.data as ProductRow;
      setDetail(data);
      setFormTitle(data.title ?? "");
      setFormSlug(data.slug ?? "");
      setFormPrice(((data.price_cents ?? 0) / 100).toFixed(2));
      setFormDesc(data.description ?? "");
      setFormBadge(data.badge ?? "");
      setFormMaterial(data.material ?? "");
      setFormMadeIn(data.made_in ?? "");
      setFormFeatured(Boolean(data.is_featured));
      setFormStatus((data.status as any) ?? "draft");

      const catRes = await fetch("/api/categories?include=tree");
      const catJson = await safeReadJson(catRes);
      if (catRes.ok && catJson?.ok) {
        setAvailableCategories(catJson.data || []);
      }

      const colRes = await fetch("/api/collections");
      const colJson = await safeReadJson(colRes);
      if (colRes.ok && colJson?.ok) {
        setAvailableCollections(colJson.data || []);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to load product");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && productId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productId]);

  const autoSlug = () => setFormSlug(slugify(formTitle));

  const saveDetails = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const cents = moneyToCents(formPrice);
      if (cents === null || cents < 0) throw new Error("Invalid price");

      const res = await fetch(`/api/products/admin/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          slug: formSlug.trim(),
          price_cents: cents,
          description: formDesc.trim() || null,
          badge: formBadge.trim() || null,
          material: formMaterial.trim() || null,
          made_in: formMadeIn.trim() || null,
          is_featured: formFeatured,
          status: formStatus,
        }),
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed to save");

      toast.success("Details saved");
      await load();
      onChanged();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const uploadImages = async () => {
    if (!detail || files.length === 0) return;
    setUploading(true);
    try {
      const supabase = createBrowserClient();
      const currentImages = detail.product_images ?? [];
      const maxPos = currentImages.reduce((m, img) => Math.max(m, img.position ?? 0), -1);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const webpFile = await convertToWebP(file);
        const object_path = `products/${detail.id}/${randId()}.webp`;

        const up = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(object_path, webpFile, {
          upsert: false,
          cacheControl: "3600",
          contentType: "image/webp",
        });

        if (up.error) throw new Error(up.error.message);

        const r2 = await fetch(`/api/products/admin/${detail.id}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bucket_name: PRODUCT_IMAGE_BUCKET,
            object_path,
            alt_text: alt.trim() || null,
            position: maxPos + i + 1,
          }),
        });

        const j2 = await safeReadJson(r2);
        if (!r2.ok || !j2?.ok) throw new Error(j2?.error?.message ?? "Failed to save image");
      }

      toast.success("Images uploaded");
      setFiles([]);
      setAlt("");
      await load();
      onChanged();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to upload images");
    } finally {
      setUploading(false);
    }
  };

  const deleteImage = async (imgId: string) => {
    if (!detail || !confirm("Delete this image?")) return;
    try {
      const res = await fetch(`/api/products/admin/${detail.id}/images/${imgId}`, {
        method: "DELETE",
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed to delete");

      toast.success("Image deleted");
      await load();
      onChanged();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to delete image");
    }
  };

  const addTag = async () => {
    if (!productId || !tagInput.trim()) return;
    try {
      const res = await fetch(`/api/products/admin/${productId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: tagInput.trim() }),
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed to add tag");

      toast.success("Tag added");
      setTagInput("");
      await load();
      onChanged();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to add tag");
    }
  };

  const removeTag = async (tagIdOrSlug: string) => {
    if (!productId) return;
    try {
      const res = await fetch(`/api/products/admin/${productId}/tags`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: tagIdOrSlug }),
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed to remove tag");

      toast.success("Tag removed");
      await load();
      onChanged();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to remove tag");
    }
  };

  return {
    state: {
      loading,
      saving,
      uploading,
      detail,
      formTitle,
      formSlug,
      formPrice,
      formDesc,
      formBadge,
      formMaterial,
      formMadeIn,
      formFeatured,
      formStatus,
      files,
      alt,
      tagInput,
      availableCategories,
      availableCollections,
    },
    actions: {
      setFormTitle,
      setFormSlug,
      setFormPrice,
      setFormDesc,
      setFormBadge,
      setFormMaterial,
      setFormMadeIn,
      setFormFeatured,
      setFormStatus,
      setFiles,
      setAlt,
      setTagInput,
      autoSlug,
      saveDetails,
      uploadImages,
      deleteImage,
      addTag,
      removeTag,
      load,
    },
  };
}