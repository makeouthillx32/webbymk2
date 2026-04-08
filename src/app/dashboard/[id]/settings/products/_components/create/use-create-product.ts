import { useState, useMemo } from "react";
import { toast } from "react-hot-toast";
import { createBrowserClient } from "@/utils/supabase/client";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/images";
import {
  slugify,
  safeReadJson,
  moneyToCents,
  buildObjectPath,
  convertToWebP,
} from "../utils";
import {
  CategoryNode,
  CollectionRow,
  ImageWithAlt,
  SizeOption,
  ColorOption,
  MaterialOption,
  MadeInOption,
  VariantInput
} from "../types";

// ✅ Add OptionGroup type
interface OptionGroup {
  id: string;
  name: string;
  type: "size" | "color" | "custom";
  options: Array<{
    id: string;
    value: string;
    hex?: string;
    weight?: string;
  }>;
}

export function useCreateProduct(onOpenChange: (v: boolean) => void, onCreated: () => void) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [baseSku, setBaseSku] = useState(""); // ✅ UI-only, not saved to DB
  const [price, setPrice] = useState("0.00");
  const [description, setDescription] = useState("");
  const [material, setMaterial] = useState(""); // ✅ Product-level
  const [madeIn, setMadeIn] = useState(""); // ✅ Product-level
  const [images, setImages] = useState<ImageWithAlt[]>([]);
  const [availableSizes, setAvailableSizes] = useState<SizeOption[]>([]);
  const [availableColors, setAvailableColors] = useState<ColorOption[]>([]);
  const [availableMaterials, setAvailableMaterials] = useState<MaterialOption[]>([]);
  const [availableMadeIn, setAvailableMadeIn] = useState<MadeInOption[]>([]);
  const [variants, setVariants] = useState<VariantInput[]>([]);
  const [availableCategories, setAvailableCategories] = useState<CategoryNode[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [availableCollections, setAvailableCollections] = useState<CollectionRow[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [customGroups, setCustomGroups] = useState<OptionGroup[]>([]); // ✅ Add custom groups state

  const cents = useMemo(() => moneyToCents(price), [price]);
  const autoSlug = () => setSlug(slugify(title));
  const autoBaseSku = () => {
    const words = title
      .replace(/['']/g, "")
      .toUpperCase()
      .split(/\s+/)
      .filter(Boolean);

    const prefix = words.includes("SWEATSHIRT") || words.includes("CREWNECK")
      ? "WSP"
      : "PRD";

    const shortWords = words
      .filter(w => !["THE", "A", "AN", "AND", "OF", "WITH", "COUNTRY", "WESTERN", "GRAPHIC"].includes(w))
      .slice(0, 2);

    const code = shortWords.map(w => w.substring(0, 3)).join("-");

    setBaseSku(`${prefix}-${code}`);
  };


  // Reusable ID generator that works in all browser contexts
  const generateId = () => Math.random().toString(36).substring(7);

  const reset = () => {
    images.forEach(img => URL.revokeObjectURL(img.preview));
    setTitle("");
    setSlug("");
    setBaseSku("");
    setPrice("0.00");
    setDescription("");
    setMaterial("");
    setMadeIn("");
    setImages([]);
    setAvailableSizes([]);
    setAvailableColors([]);
    setAvailableMaterials([]);
    setAvailableMadeIn([]);
    setVariants([]);
    setSelectedCategoryIds([]);
    setSelectedCollectionIds([]);
    setCustomGroups([]); // ✅ Reset custom groups
  };

  const generateVariantSku = (variant: VariantInput, customGroups?: Array<{ id: string; name: string; options: Array<{ id: string; value: string }> }>) => {
    const base = baseSku.trim();
    if (!base) return variant.sku;

    const parts = [base];

    // Add color if present (handles both color swatches AND charm variants)
    const colorId = variant.selectedColors?.[0];
    const colorObj = colorId ? availableColors.find(c => c.id === colorId) : null;
    if (colorObj?.name) {
      const colorName = colorObj.name.trim();

      // Extract meaningful identifier from color name
      // Handles cases like "Steerhead", "Wild West", "Brushed Silver", etc.
      const cleanColor = colorName
        .replace(/[^a-zA-Z0-9\s]/g, "") // Remove special chars but keep spaces
        .trim()
        .split(/\s+/) // Split by whitespace
        .map(word => word.substring(0, 4).toUpperCase()) // Take first 4 chars of each word
        .join("") // Join without separator
        .substring(0, 6); // Max 6 chars total for color identifier

      if (cleanColor) parts.push(cleanColor);
    }

    // ✅ Add custom option groups (e.g., Style: TEE, CREW)
    if (customGroups) {
      customGroups.forEach(group => {
        const selectionKey = `group_${group.id}_selection`;
        const selectedIds = (variant.customOptions[selectionKey] as string[]) || [];

        if (selectedIds.length > 0) {
          const selectedValues = selectedIds
            .map(id => group.options.find(opt => opt.id === id)?.value)
            .filter(Boolean);

          if (selectedValues.length > 0) {
            // Use first 3-4 chars of each selected value
            const identifier = selectedValues
              .map(val => val.replace(/[^a-zA-Z0-9]/g, "").substring(0, 4).toUpperCase())
              .join("");

            if (identifier) parts.push(identifier);
          }
        }
      });
    }

    // Add size if present
    const sizeId = variant.selectedSizes?.[0];
    const sizeVal = sizeId ? availableSizes.find(s => s.id === sizeId)?.value : null;
    if (sizeVal) {
      const cleanSize = sizeVal.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      parts.push(cleanSize);
    }

    // ✅ Fallback: If no differentiators added, use variant title
    if (parts.length === 1 && variant.title.trim()) {
      const titleIdentifier = variant.title
        .trim()
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .split(/\s+/)
        .map(word => word.substring(0, 3).toUpperCase())
        .join("")
        .substring(0, 6);

      if (titleIdentifier) parts.push(titleIdentifier);
    }

    return parts.length > 1 ? parts.join("-") : base;
  };

  const addSize = () => setAvailableSizes([...availableSizes, { id: generateId(), value: "" }]);
  const updateSize = (id: string, value: string) => setAvailableSizes(availableSizes.map(s => (s.id === id ? { ...s, value } : s)));
  const removeSize = (id: string) => {
    setAvailableSizes(availableSizes.filter(s => s.id !== id));
    setVariants(variants.map(v => ({ ...v, selectedSizes: v.selectedSizes.filter(sid => sid !== id) })));
  };

  const addColor = () => setAvailableColors([...availableColors, { id: generateId(), name: "", hex: "#000000" }]);
  const updateColor = (id: string, field: "name" | "hex", value: string) => setAvailableColors(availableColors.map(c => (c.id === id ? { ...c, [field]: value } : c)));
  const removeColor = (id: string) => {
    setAvailableColors(availableColors.filter(c => c.id !== id));
    setVariants(variants.map(v => ({ ...v, selectedColors: v.selectedColors.filter(cid => cid !== id) })));
  };

  const addMaterial = () => setAvailableMaterials([...availableMaterials, { id: generateId(), value: "" }]);
  const updateMaterial = (id: string, value: string) => setAvailableMaterials(availableMaterials.map(m => (m.id === id ? { ...m, value } : m)));
  const removeMaterial = (id: string) => {
    setAvailableMaterials(availableMaterials.filter(m => m.id !== id));
    setVariants(variants.map(v => ({ ...v, selectedMaterials: v.selectedMaterials.filter(mid => mid !== id) })));
  };

  const addMadeIn = () => setAvailableMadeIn([...availableMadeIn, { id: generateId(), value: "" }]);
  const updateMadeIn = (id: string, value: string) => setAvailableMadeIn(availableMadeIn.map(m => (m.id === id ? { ...m, value } : m)));
  const removeMadeIn = (id: string) => {
    setAvailableMadeIn(availableMadeIn.filter(m => m.id !== id));
    setVariants(variants.map(v => ({ ...v, selectedMadeIn: v.selectedMadeIn.filter(mid => mid !== id) })));
  };

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    const newImages: ImageWithAlt[] = Array.from(fileList).map((file, idx) => ({
      file,
      alt: "",
      preview: URL.createObjectURL(file),
      position: images.length + idx,
      isPrimary: images.length === 0 && idx === 0,
    }));
    setImages([...images, ...newImages]);
  };

  const updateImageAlt = (index: number, alt: string) => {
    const updated = [...images];
    updated[index].alt = alt;
    setImages(updated);
  };

  const removeImage = (index: number) => {
    const imgToRemove = images[index];
    if (imgToRemove) URL.revokeObjectURL(imgToRemove.preview);
    const updated = images.filter((_, i) => i !== index);
    updated.forEach((img, i) => {
      img.position = i;
      if (i === 0 && !updated.some(x => x.isPrimary)) img.isPrimary = true;
    });
    setImages(updated);
  };

  const setPrimaryImage = (index: number) => setImages(images.map((img, i) => ({ ...img, isPrimary: i === index })));

  const addVariant = () => {
    const last = variants[variants.length - 1];
    const newVariant: VariantInput = last ? {
      id: generateId(),
      title: last.title,
      sku: last.sku,
      selectedSizes: [...last.selectedSizes],
      selectedColors: [...last.selectedColors],
      selectedMaterials: [...last.selectedMaterials],
      selectedMadeIn: [...last.selectedMadeIn],
      customOptions: { ...last.customOptions },
      weight_grams: last.weight_grams,
      price_override: last.price_override,
      initial_stock: last.initial_stock,
    } : {
      id: generateId(),
      title: "", sku: "", selectedSizes: [], selectedColors: [], selectedMaterials: [],
      selectedMadeIn: [], customOptions: {}, weight_grams: "", price_override: "", initial_stock: "",
    };
    setVariants([...variants, newVariant]);
  };

  const updateVariant = (id: string, field: keyof VariantInput, value: any) => setVariants(variants.map(v => (v.id === id ? { ...v, [field]: value } : v)));
  const removeVariant = (id: string) => setVariants(variants.filter(v => v.id !== id));

  const buildVariantOptions = (variant: VariantInput, customGroups?: Array<{ id: string; name: string; options: Array<{ id: string; value: string }> }>) => {
    const options: Record<string, any> = {};

    // Size from variant selections
    if (variant.selectedSizes.length > 0) {
      const vals = variant.selectedSizes.map(id => availableSizes.find(s => s.id === id)?.value).filter(Boolean);
      options.size = vals.length === 1 ? vals[0] : vals.join(", ");
    }

    // Color from variant selections
    if (variant.selectedColors.length > 0) {
      const objs = variant.selectedColors.map(id => availableColors.find(c => c.id === id)).filter(Boolean);
      if (objs.length === 1) options.color = { name: objs[0]!.name, hex: objs[0]!.hex };
      else options.colors = objs.map(c => ({ name: c!.name, hex: c!.hex }));
    }

    // ✅ Add product-level material and made_in to variant options
    if (material.trim()) {
      options.material = material.trim();
    }
    if (madeIn.trim()) {
      options.made_in = madeIn.trim();
    }

    // ✅ Custom option groups (convert selection arrays to readable values)
    if (customGroups) {
      customGroups.forEach(group => {
        const selectionKey = `group_${group.id}_selection`;
        const selectedIds = (variant.customOptions[selectionKey] as string[]) || [];

        if (selectedIds.length > 0) {
          const selectedValues = selectedIds
            .map(id => group.options.find(opt => opt.id === id)?.value)
            .filter(Boolean);

          if (selectedValues.length > 0) {
            // Use the group name (lowercased) as the key in options
            const optionKey = group.name.toLowerCase().replace(/\s+/g, '_');
            options[optionKey] = selectedValues.length === 1 ? selectedValues[0] : selectedValues.join(", ");
          }
        }
      });
    }

    // ✅ Legacy custom options (string key-value pairs)
    Object.entries(variant.customOptions).forEach(([k, v]) => {
      // Skip custom group selections (they're handled above)
      if (k.startsWith('group_') && k.endsWith('_selection')) return;

      const val = typeof v === "string" ? v.trim() : "";
      if (val) options[k] = val;
    });

    return options;
  };

  const create = async () => {
    if (!title.trim()) return toast.error("Title is required");
    const finalSlug = (slug.trim() || slugify(title)).trim();
    if (!finalSlug) return toast.error("Slug is required");
    if (cents === null || cents < 0) return toast.error("Price must be valid");

    // ✅ PRE-FLIGHT VALIDATION: Only validate variants if they exist
    if (variants.length > 0) {
      const generatedSkus = new Set<string>();

      for (const variant of variants) {
        let finalSku: string;

        if (variant.sku.trim()) {
          finalSku = variant.sku.trim();
        } else {
          finalSku = generateVariantSku(variant, customGroups);
        }

        // ✅ For simple products (no sizes, colors, or custom groups), SKU can equal base SKU
        if (!finalSku) {
          return toast.error(`Variant "${variant.title}" has invalid SKU. Each variant needs a unique identifier (size, color, or custom SKU).`);
        }

        if (generatedSkus.has(finalSku)) {
          return toast.error(`Duplicate SKU detected: "${finalSku}". Each variant must have a unique combination of attributes.`);
        }

        generatedSkus.add(finalSku);
      }

      // ✅ Only validate stock if variants have inventory tracking enabled
      const hasInvalidStock = variants.some(
        (v) => v.initial_stock.trim() !== "" && Number(v.initial_stock) < 0
      );
      if (hasInvalidStock) {
        return toast.error("Stock levels cannot be negative");
      }
    }

    setCreating(true);
    let productId: string | null = null;

    try {
      const res = await fetch("/api/products/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: finalSlug,
          description: description.trim() || null,
          material: material.trim() || null,
          made_in: madeIn.trim() || null,
          price_cents: cents,
          status: "draft"
        }),
      });

      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed to create product");
      productId = json.data?.id;

      // ✅ Create variants OR default variant
      try {
        if (variants.length > 0) {
          // Create user-defined variants
          for (const variant of variants) {
            const weight = variant.weight_grams.trim() === "" ? null : Number(variant.weight_grams);
            const override = variant.price_override.trim() === "" ? null : moneyToCents(variant.price_override);
            const stock = variant.initial_stock.trim() === "" ? null : Number(variant.initial_stock);

            let finalVariantSku: string | null = null;
            if (variant.sku.trim()) {
              finalVariantSku = variant.sku.trim();
            } else {
              finalVariantSku = generateVariantSku(variant, customGroups);
            }

            const vRes = await fetch(`/api/products/admin/${productId}/variants`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: variant.title.trim() || "Default",
                sku: finalVariantSku,
                options: buildVariantOptions(variant),
                weight_grams: weight,
                price_cents: override ?? cents,
                track_inventory: stock !== null && stock > 0,
                quantity: stock ?? 0,
              }),
            });

            const vJson = await safeReadJson(vRes);
            if (!vRes.ok || !vJson?.ok) {
              console.error("Variant creation failed:", vJson);
              throw new Error(vJson?.error?.message ?? `Failed to create variant: ${variant.title || finalVariantSku}`);
            }
          }
        } else {
          // ✅ NO VARIANTS: Create a default variant for simple products
          const defaultOptions: Record<string, any> = {};
          if (material.trim()) defaultOptions.material = material.trim();
          if (madeIn.trim()) defaultOptions.made_in = madeIn.trim();

          const vRes = await fetch(`/api/products/admin/${productId}/variants`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: "Default",
              sku: baseSku.trim() || `${finalSlug.toUpperCase()}-DEFAULT`,
              options: defaultOptions,
              weight_grams: null,
              price_cents: cents,
              track_inventory: false, // Simple products don't track inventory by default
              quantity: 0,
            }),
          });

          const vJson = await safeReadJson(vRes);
          if (!vRes.ok || !vJson?.ok) {
            console.error("Default variant creation failed:", vJson);
            throw new Error(vJson?.error?.message ?? "Failed to create default variant");
          }
        }
      } catch (variantError: any) {
        // ✅ ROLLBACK: Delete the product if variant creation fails
        if (productId) {
          await fetch(`/api/products/admin/${productId}`, { method: "DELETE" });
        }
        throw new Error(`Product creation rolled back - ${variantError.message}`);
      }

      await Promise.all([
        ...selectedCategoryIds.map(id => fetch(`/api/products/admin/${productId}/categories`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category_id: id })
        })),
        ...selectedCollectionIds.map(id => fetch(`/api/products/admin/${productId}/collections`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection_id: id })
        }))
      ]);

      if (images.length) {
        const supabase = createBrowserClient();
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const webpFile = await convertToWebP(img.file);
          const path = buildObjectPath(productId!, i + 1, "webp");
          const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, webpFile, {
            upsert: false,
            cacheControl: "3600",
            contentType: "image/webp",
          });
          if (error) throw error;

          await fetch(`/api/products/admin/${productId}/images`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bucket_name: PRODUCT_IMAGE_BUCKET,
              object_path: path,
              alt_text: img.alt.trim() || null,
              position: img.position,
              is_primary: img.isPrimary,
            }),
          });
        }
      }

      toast.success("Product created successfully");
      onOpenChange(false);
      onCreated();
      reset();
    } catch (e: any) {
      toast.error(e?.message ?? "Create failed");
    } finally {
      setCreating(false);
    }
  };

  return {
    state: {
      title, slug, baseSku, price, description, material, madeIn, images, availableSizes, availableColors,
      availableMaterials, availableMadeIn, variants, availableCategories,
      selectedCategoryIds, availableCollections, selectedCollectionIds, creating, customGroups
    },
    actions: {
      setTitle, setSlug, setBaseSku, setPrice, setDescription, setMaterial, setMadeIn, autoSlug, autoBaseSku,
      addSize, updateSize, removeSize,
      addColor, updateColor, removeColor,
      addMaterial, updateMaterial, removeMaterial,
      addMadeIn, updateMadeIn, removeMadeIn,
      handleFilesSelected, updateImageAlt, removeImage, setPrimaryImage,
      addVariant, updateVariant, removeVariant,
      setVariants,
      setSelectedCategoryIds, setSelectedCollectionIds,
      setAvailableCategories, setAvailableCollections,
      setCustomGroups, // ✅ Export setCustomGroups
      create, reset
    }
  };
}