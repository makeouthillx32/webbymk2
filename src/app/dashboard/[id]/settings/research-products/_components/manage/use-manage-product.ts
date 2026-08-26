"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { createBrowserClient } from "@/utils/supabase/client";
import { RESEARCH_IMAGE_BUCKET } from "@/lib/images";
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
  const [formBrand, setFormBrand] = useState("");
  const [formCasNumber, setFormCasNumber] = useState("");
  const [formPurity, setFormPurity] = useState("");
  const [formResearchUseOnly, setFormResearchUseOnly] = useState(true);
  const [formFeatured, setFormFeatured] = useState(false);

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
      const res = await fetch(`/api/research-products/admin/${productId}`, { cache: "no-store" });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed to load product");

      const data = json.data as ProductRow;
      setDetail(data);
      setFormTitle(data.title ?? "");
      setFormSlug(data.slug ?? "");
      setFormPrice(((data.price_cents ?? 0) / 100).toFixed(2));
      setFormDesc(data.description ?? "");
      setFormBadge(data.badge ?? "");
      setFormBrand(data.brand ?? "");
      setFormCasNumber(data.cas_number ?? "");
      setFormPurity(data.purity_percent != null ? String(data.purity_percent) : "");
      setFormResearchUseOnly(data.research_use_only ?? true);
      setFormFeatured(Boolean(data.is_featured));

      const catRes = await fetch("/api/research-categories?include=tree");
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

      const res = await fetch(`/api/research-products/admin/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          slug: formSlug.trim(),
          price_cents: cents,
          description: formDesc.trim() || null,
          badge: formBadge.trim() || null,
          brand: formBrand.trim() || null,
          cas_number: formCasNumber.trim() || null,
          purity_percent: formPurity.trim() ? Number(formPurity) : null,
          research_use_only: formResearchUseOnly,
          is_featured: formFeatured,
          // status intentionally omitted — managed inline on the catalog
          // table row now, not from within this modal.
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

    const supabase = createBrowserClient();
    const currentImages = detail.product_images ?? [];
    const maxPos = currentImages.reduce((m, img) => Math.max(m, img.position ?? 0), -1);

    // Batch-resilient: one bad file (bad format, flaky network, etc.) doesn't
    // sink the rest of a large drag-and-drop queue. Succeeded files are
    // removed from the queue; failed ones stay so they can be retried.
    const failed: File[] = [];
    let succeeded = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const webpFile = await convertToWebP(file);
        const object_path = `products/${detail.id}/${randId()}.webp`;

        const up = await supabase.storage.from(RESEARCH_IMAGE_BUCKET).upload(object_path, webpFile, {
          upsert: false,
          cacheControl: "3600",
          contentType: "image/webp",
        });

        if (up.error) throw new Error(up.error.message);

        const r2 = await fetch(`/api/research-products/admin/${detail.id}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bucket_name: RESEARCH_IMAGE_BUCKET,
            object_path,
            alt_text: alt.trim() || null,
            position: maxPos + succeeded + 1,
          }),
        });

        const j2 = await safeReadJson(r2);
        if (!r2.ok || !j2?.ok) throw new Error(j2?.error?.message ?? "Failed to save image");

        succeeded += 1;
      } catch (e: any) {
        console.error(`[uploadImages] Failed on "${file.name}":`, e);
        failed.push(file);
      }
    }

    try {
      if (succeeded > 0) {
        toast.success(
          failed.length > 0
            ? `Uploaded ${succeeded} image(s), ${failed.length} failed — still queued for retry`
            : `Uploaded ${succeeded} image(s)`
        );
        setFiles(failed);
        if (failed.length === 0) setAlt("");
        await load();
        onChanged();
      } else {
        toast.error("All uploads failed — check the files and try again");
      }
    } finally {
      setUploading(false);
    }
  };

  const [smartUploading, setSmartUploading] = useState(false);

  // Bulk drag-and-drop where each file already carries a parsed/edited
  // variant label ("10mg") + image type (photo vs lab_report). Finds a
  // matching variant by title/options.size, creates one if none exists yet
  // (reusing newly-created ones within the same batch instead of duplicating),
  // uploads the image, and links it. Returns a per-file result summary.
  const smartUploadImages = async (
    taggedFiles: { file: File; label: string; imageType: "photo" | "lab_report" }[]
  ): Promise<{ file: File; ok: boolean; variantTitle?: string; error?: string }[]> => {
    if (!detail || taggedFiles.length === 0) return [];
    setSmartUploading(true);

    const supabase = createBrowserClient();
    const results: { file: File; ok: boolean; variantTitle?: string; error?: string }[] = [];

    // Seed the label -> variant cache from what's already on the product.
    const variantByLabel = new Map<string, any>();
    for (const v of detail.product_variants ?? []) {
      const key = String(v.title ?? "").trim().toLowerCase();
      if (key) variantByLabel.set(key, v);
      const sizeKey = String(v.options?.size ?? "").trim().toLowerCase();
      if (sizeKey) variantByLabel.set(sizeKey, v);
    }

    for (const { file, label, imageType } of taggedFiles) {
      const key = label.trim().toLowerCase();
      try {
        // 1) Find or create the variant for this label.
        let variant = variantByLabel.get(key);
        if (!variant) {
          const res = await fetch(`/api/research-products/admin/${detail.id}/variants`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: label,
              options: { size: label },
              track_inventory: true,
              quantity: 0,
            }),
          });
          const json = await safeReadJson(res);
          if (!res.ok || !json?.ok) {
            throw new Error(json?.error?.message ?? "Failed to create variant");
          }
          variant = json.data.variant;
          variantByLabel.set(key, variant);
        }

        // 2) Upload the image itself.
        const webpFile = await convertToWebP(file);
        const object_path = `products/${detail.id}/${randId()}.webp`;

        const up = await supabase.storage.from(RESEARCH_IMAGE_BUCKET).upload(object_path, webpFile, {
          upsert: false,
          cacheControl: "3600",
          contentType: "image/webp",
        });
        if (up.error) throw new Error(up.error.message);

        const currentImages = detail.product_images ?? [];
        const maxPos = currentImages.reduce((m, img) => Math.max(m, img.position ?? 0), -1);

        const imgRes = await fetch(`/api/research-products/admin/${detail.id}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bucket_name: RESEARCH_IMAGE_BUCKET,
            object_path,
            // Lab-report images get a greppable "(COA/PDF)" tag in the alt text —
            // these are photos/scans of lab reports, not the structured
            // research_lab_reports data. Tagging them clearly lets us find and
            // batch-process them later (e.g. OCR into structured COA rows, or
            // bundle/convert into real downloadable PDFs) without having to
            // re-derive which images are lab reports from filenames again.
            alt_text: `${detail.title} — ${label}${imageType === "lab_report" ? " — Lab Report (COA/PDF)" : ""}`,
            position: maxPos + 1,
          }),
        });
        const imgJson = await safeReadJson(imgRes);
        if (!imgRes.ok || !imgJson?.ok) {
          throw new Error(imgJson?.error?.message ?? "Failed to save image");
        }
        const imageId = imgJson.data?.id ?? imgJson.data?.image?.id;
        if (!imageId) throw new Error("Image saved but no id was returned");

        // 3) Link the image to the resolved variant.
        const linkRes = await fetch(
          `/api/research-products/admin/${detail.id}/variants/${variant.id}/images`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_id: imageId, image_type: imageType }),
          }
        );
        const linkJson = await safeReadJson(linkRes);
        if (!linkRes.ok || !linkJson?.ok) {
          throw new Error(linkJson?.error?.message ?? "Failed to link image to variant");
        }

        results.push({ file, ok: true, variantTitle: variant.title });
      } catch (e: any) {
        console.error(`[smartUploadImages] Failed on "${file.name}":`, e);
        results.push({ file, ok: false, error: e?.message ?? "Upload failed" });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;
    if (succeeded > 0) {
      toast.success(
        failed > 0
          ? `Auto-linked ${succeeded} image(s), ${failed} failed`
          : `Auto-linked ${succeeded} image(s) to their variants`
      );
      await load();
      onChanged();
    } else {
      toast.error("All auto-linked uploads failed — check the files and try again");
    }

    setSmartUploading(false);
    return results;
  };

  const deleteImage = async (imgId: string) => {
    if (!detail || !confirm("Delete this image?")) return;
    try {
      const res = await fetch(`/api/research-products/admin/${detail.id}/images/${imgId}`, {
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
      const res = await fetch(`/api/research-products/admin/${productId}/tags`, {
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
      const res = await fetch(`/api/research-products/admin/${productId}/tags`, {
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
      smartUploading,
      detail,
      formTitle,
      formSlug,
      formPrice,
      formDesc,
      formBadge,
      formBrand,
      formCasNumber,
      formPurity,
      formResearchUseOnly,
      formFeatured,
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
      setFormBrand,
      setFormCasNumber,
      setFormPurity,
      setFormResearchUseOnly,
      setFormFeatured,
      setFiles,
      setAlt,
      setTagInput,
      autoSlug,
      saveDetails,
      uploadImages,
      smartUploadImages,
      deleteImage,
      addTag,
      removeTag,
      load,
    },
  };
}