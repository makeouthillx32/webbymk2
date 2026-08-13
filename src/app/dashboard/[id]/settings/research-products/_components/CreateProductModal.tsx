"use client";

import React, { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Internal Modular Imports
import { useCreateProduct } from "./create/use-create-product";
import { CollapsibleSection } from "./create/collapsible-section";
import { ImageSection } from "./create/image-section";
import { VariantSection } from "./create/variant-section";
import { safeReadJson } from "./utils";

export default function CreateProductModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { state, actions } = useCreateProduct(onOpenChange, onCreated);

  // Separate UI-only state for section visibility
  const [secImagesOpen, setSecImagesOpen] = React.useState(false);
  const [secVariantsOpen, setSecVariantsOpen] = React.useState(false);
  const [secCategoriesOpen, setSecCategoriesOpen] = React.useState(false);

  // Load initial data for categories. Collections are a shop-only concept
  // (no research_collections table) so that fetch was removed here.
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const catRes = await fetch("/api/research-categories?include=tree");
        const catJson = await safeReadJson(catRes);
        if (catRes.ok && catJson?.ok) actions.setAvailableCategories(catJson.data || []);
      } catch (err) {
        console.error("Failed to load modal data", err);
      }
    })();
  }, [open]);

  // Recursively render category tree
  const renderCategoryTree = (nodes: any[], depth = 0) => {
    return (
      <div className="space-y-1">
        {nodes.map((n) => {
          const label = n.name ?? n.title ?? n.label ?? n.slug ?? "Untitled";
          const checked = state.selectedCategoryIds.includes(n.id);
          return (
            <div key={n.id}>
              <label className="flex items-center gap-2 text-sm" style={{ paddingLeft: `${depth * 12}px` }}>
                <input 
                  type="checkbox" 
                  checked={checked} 
                  onChange={() => actions.setSelectedCategoryIds(
                    checked ? state.selectedCategoryIds.filter(id => id !== n.id) : [...state.selectedCategoryIds, n.id]
                  )} 
                />
                <span>{label}</span>
              </label>
              {n.children?.length > 0 && <div className="mt-1">{renderCategoryTree(n.children, depth + 1)}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Research Chemical</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Title</label>
            <Input value={state.title} onChange={(e) => actions.setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Slug</label>
            <div className="flex gap-2">
              <Input value={state.slug} onChange={(e) => actions.setSlug(e.target.value)} />
              <Button type="button" variant="secondary" onClick={actions.autoSlug}>Auto</Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Price (USD)</label>
            <Input value={state.price} onChange={(e) => actions.setPrice(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Base SKU (Optional)</label>
              <div className="flex gap-2">
                <Input 
                  value={state.baseSku} 
                  onChange={(e) => actions.setBaseSku(e.target.value)}
                  placeholder="e.g., LC2542552-P1720"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={actions.autoBaseSku}
                >
                  Auto
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Brand (Optional)</label>
              <Input
                value={state.brand}
                onChange={(e) => actions.setBrand(e.target.value)}
                placeholder="e.g., Unenter Labs"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">CAS Number (Optional)</label>
              <Input
                value={state.casNumber}
                onChange={(e) => actions.setCasNumber(e.target.value)}
                placeholder="e.g., 12629-01-5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Purity % (Optional)</label>
              <Input
                value={state.purity}
                onChange={(e) => actions.setPurity(e.target.value)}
                placeholder="e.g., 99.0"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={state.researchUseOnly}
                  onChange={(e) => actions.setResearchUseOnly(e.target.checked)}
                />
                Research use only
              </label>
            </div>
          </div>

          <div className="text-xs text-muted-foreground -mt-2">
            Variants will use Base SKU + options + size (e.g., LC2542552-P1720-TEE-S, -CREW-M)
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Description</label>
            <Textarea value={state.description} onChange={(e) => actions.setDescription(e.target.value)} />
          </div>

          <CollapsibleSection title="Images" description="Upload product media" open={secImagesOpen} onToggle={() => setSecImagesOpen(!secImagesOpen)}>
            <ImageSection 
              images={state.images} 
              handleFilesSelected={actions.handleFilesSelected}
              updateImageAlt={actions.updateImageAlt}
              removeImage={actions.removeImage}
              setPrimaryImage={actions.setPrimaryImage}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Variants" description="Sizes, colors, custom options" open={secVariantsOpen} onToggle={() => setSecVariantsOpen(!secVariantsOpen)}>
            <VariantSection 
              variants={state.variants}
              baseSku={state.baseSku}
              availableSizes={state.availableSizes}
              availableColors={state.availableColors}
              customGroups={state.customGroups}
              actions={{
                ...actions,
                setCustomGroups: actions.setCustomGroups
              } as any} 
            />
          </CollapsibleSection>

          <CollapsibleSection title="Categories" open={secCategoriesOpen} onToggle={() => setSecCategoriesOpen(!secCategoriesOpen)}>
            <div className="max-h-[260px] overflow-auto">
              {state.availableCategories.length > 0 ? renderCategoryTree(state.availableCategories) : <p className="text-sm text-muted-foreground">None available.</p>}
            </div>
          </CollapsibleSection>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => { onOpenChange(false); actions.reset(); }} disabled={state.creating}>Cancel</Button>
            <Button onClick={actions.create} disabled={state.creating}>{state.creating ? "Creating..." : "Create Product"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}