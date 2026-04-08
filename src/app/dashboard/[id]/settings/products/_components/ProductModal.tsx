"use client";

import React, { useEffect, useState } from "react";
import {
  Image as ImageIcon,
  Tag as TagIcon,
  Settings2,
  AlertTriangle,
  Package,
  Box,
  FolderTree,
  Grid3x3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { useManageProduct } from "./manage/use-manage-product";
import { DetailsTab } from "./manage/details-tab";
import { MediaTab } from "./manage/media-tab";
import { VariantsTab } from "./manage/variants-tab";
import { InventoryTab } from "./manage/inventory-tab";
import { CategoriesTab } from "./manage/categories-tab";
import { CollectionsTab } from "./manage/collections-tab";
import { TagsTab } from "./manage/tags-tab";
import { AdvancedTab } from "./manage/advanced-tab";
import type { TabType } from "./types";

export default function ProductModal({
  open,
  onOpenChange,
  productId,
  title = "Manage Product",
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string | null;
  title?: string;
  onChanged: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabType>("details");
  const { state, actions } = useManageProduct(productId, open, onChanged);

  // ✅ Prevent stale tab when switching products / reopening
  useEffect(() => {
    if (!open) setActiveTab("details");
  }, [open, productId]);

  const tabBtn = (key: TabType, icon: React.ReactNode, label: string) => {
    const active =
      activeTab === key
        ? "text-[hsl(var(--sidebar-primary))] border-b-2 border-[hsl(var(--sidebar-primary))]"
        : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors";

    return (
      <button
        type="button"
        className={`px-4 py-2 font-medium text-sm whitespace-nowrap ${active}`}
        onClick={() => setActiveTab(key)}
        disabled={!productId}
      >
        <span className="inline-flex items-center gap-2">
          {icon} {label}
        </span>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ✅ Make the modal fit the *actual* mobile viewport + only body scrolls */}
      <DialogContent
        className="
          max-w-4xl p-0
          w-[calc(100vw-1.5rem)] sm:w-full
          max-h-[calc(100dvh-1.5rem)]
          overflow-hidden
          flex flex-col
        "
      >
        {/* Header + Tabs (fixed) */}
        <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] shrink-0">
          <DialogHeader className="px-5 py-4">
            <DialogTitle className="flex items-center justify-between gap-3">
              <span className="truncate">{title}</span>

              {state.detail?.status && (
                <Badge variant="secondary">{state.detail.status}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex border-t border-[hsl(var(--border))] overflow-x-auto">
            {tabBtn("details", <Settings2 size={16} />, "Details")}
            {tabBtn("media", <ImageIcon size={16} />, "Photos")}
            {tabBtn("variants", <Package size={16} />, "Variants")}
            {tabBtn("inventory", <Box size={16} />, "Inventory")}
            {tabBtn("categories", <FolderTree size={16} />, "Categories")}
            {tabBtn("collections", <Grid3x3 size={16} />, "Collections")}
            {tabBtn("tags", <TagIcon size={16} />, "Tags")}
            {tabBtn("advanced", <AlertTriangle size={16} />, "Advanced")}
          </div>
        </div>

        {/* ✅ Scrollable Body (fills remaining space) */}
        <div className="flex-1 overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {!productId ? (
            <div className="text-sm text-[hsl(var(--muted-foreground))]">
              Select a product to manage.
            </div>
          ) : state.loading ? (
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</div>
          ) : !state.detail ? (
            <div className="text-sm text-[hsl(var(--muted-foreground))]">
              Couldn't load product.
            </div>
          ) : activeTab === "details" ? (
            <DetailsTab
              detail={state.detail}
              formTitle={state.formTitle}
              formSlug={state.formSlug}
              formPrice={state.formPrice}
              formBadge={state.formBadge}
              formMaterial={state.formMaterial}
              formMadeIn={state.formMadeIn}
              formDesc={state.formDesc}
              formFeatured={state.formFeatured}
              formStatus={state.formStatus}
              saving={state.saving}
              setFormTitle={actions.setFormTitle}
              setFormSlug={actions.setFormSlug}
              setFormPrice={actions.setFormPrice}
              setFormBadge={actions.setFormBadge}
              setFormMaterial={actions.setFormMaterial}
              setFormMadeIn={actions.setFormMadeIn}
              setFormDesc={actions.setFormDesc}
              setFormFeatured={actions.setFormFeatured}
              setFormStatus={actions.setFormStatus}
              autoSlug={actions.autoSlug}
              saveDetails={actions.saveDetails}
            />
          ) : activeTab === "media" ? (
            <MediaTab
              detail={state.detail}
              files={state.files}
              alt={state.alt}
              uploading={state.uploading}
              setFiles={actions.setFiles}
              setAlt={actions.setAlt}
              uploadImages={actions.uploadImages}
              deleteImage={actions.deleteImage}
              onUpdated={() => {
                actions.load();
                onChanged();
              }}
            />
          ) : activeTab === "variants" ? (
            <VariantsTab productId={productId} detail={state.detail} load={actions.load} />
          ) : activeTab === "inventory" ? (
            <InventoryTab detail={state.detail} load={actions.load} />
          ) : activeTab === "categories" ? (
            <CategoriesTab
              productId={productId}
              detail={state.detail}
              availableCategories={state.availableCategories}
              load={actions.load}
            />
          ) : activeTab === "collections" ? (
            <CollectionsTab
              productId={productId}
              detail={state.detail}
              availableCollections={state.availableCollections}
              load={actions.load}
            />
          ) : activeTab === "tags" ? (
            <TagsTab
              detail={state.detail}
              tagInput={state.tagInput}
              setTagInput={actions.setTagInput}
              addTag={actions.addTag}
              removeTag={actions.removeTag}
            />
          ) : activeTab === "advanced" ? (
            <AdvancedTab
              productId={productId}
              productTitle={state.detail.title}
              onDeleted={() => {
                onOpenChange(false);
                onChanged();
              }}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}