// app/dashboard/[id]/settings/products/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import { toast } from "react-hot-toast";

import LoadingState from "./_components/LoadingState";
import ErrorAlert from "./_components/ErrorAlert";
import ProductsSearchBar from "./_components/ProductsSearchBar";
import ProductActionBar from "./_components/ProductActionBar";
import ProductsTable, { ProductRow } from "./_components/ProductsTable";

import CreateProductModal from "./_components/CreateProductModal";
import ProductModal from "./_components/ProductModal";

import "./_components/products.scss";

async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: { code: "NON_JSON_RESPONSE", message: text.slice(0, 300) },
    };
  }
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);

  const [manageOpen, setManageOpen] = useState(false);
  const [manageProductId, setManageProductId] = useState<string | null>(null);

  // ✅ Ensure portals only render after mount (document exists)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const fetchProducts = async (mode: "initial" | "refresh" = "refresh") => {
    mode === "initial" ? setIsLoading(true) : setIsRefreshing(true);

    try {
      const url = new URL("/api/products/admin", window.location.origin);
      url.searchParams.set("limit", "50");
      url.searchParams.set("offset", "0");
      url.searchParams.set("status", "all");
      if (searchQuery.trim()) url.searchParams.set("q", searchQuery.trim());

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await safeReadJson(res);

      if (!res.ok || !json?.ok)
        throw new Error(json?.error?.message ?? `Failed: ${res.status}`);

      setProducts((json.data ?? []) as ProductRow[]);
      setError(null);

      if (mode !== "initial") toast.success("Products refreshed");
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to load products.");
    } finally {
      mode === "initial" ? setIsLoading(false) : setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProducts("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return products;

    return products.filter((p) =>
      [p.title, p.slug, p.badge ?? "", p.status ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [products, searchQuery]);

  const openManage = (productId: string | null | undefined) => {
    if (!productId || typeof productId !== "string") {
      toast.error("Missing product id");
      return;
    }
    setManageProductId(productId);
    setManageOpen(true);
  };

  return (
    <>
      <ShowcaseSection title="Products">
        <div className="products-page space-y-6">
          <div className="products-header flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <ProductsSearchBar
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onSubmitSearch={() => fetchProducts("refresh")}
            />

            <ProductActionBar
              isRefreshing={isRefreshing}
              onRefresh={() => fetchProducts("refresh")}
              onCreateProduct={() => setCreateOpen(true)}
            />
          </div>

          {isLoading && <LoadingState message="Loading products..." />}
          {error && (
            <ErrorAlert message={error} onDismiss={() => setError(null)} />
          )}

          {!isLoading && !error && (
            <ProductsTable
              products={filtered}
              isRefreshing={isRefreshing}
              onManage={(p) => openManage(p?.id)}
              onArchive={async (p) => {
                if (!p?.id) return toast.error("Missing product id");
                if (!confirm(`Archive "${p.title}"?`)) return;

                try {
                  const res = await fetch(`/api/products/admin/${p.id}`, {
                    method: "DELETE",
                  });
                  const json = await safeReadJson(res);
                  if (!res.ok || !json?.ok)
                    throw new Error(json?.error?.message ?? "Archive failed");
                  toast.success("Archived");
                  fetchProducts("refresh");
                } catch (e: any) {
                  toast.error(e?.message ?? "Archive failed");
                }
              }}
            />
          )}
        </div>
      </ShowcaseSection>

      {/* ✅ Portals: prevents cut-off/clipping from parent layout/overflow/transforms */}
      {mounted &&
        createPortal(
          <>
            <CreateProductModal
              open={createOpen}
              onOpenChange={setCreateOpen}
              onCreated={async () => {
                setCreateOpen(false);
                toast.success("Product created");
                await fetchProducts("refresh");
              }}
            />

            <ProductModal
              key={manageProductId ?? "no-product"} // ✅ remount per product (avoids stale layout)
              open={manageOpen}
              onOpenChange={(v) => {
                setManageOpen(v);
                if (!v) setManageProductId(null);
              }}
              productId={manageProductId}
              onChanged={() => fetchProducts("refresh")}
            />
          </>,
          document.body
        )}
    </>
  );
}
