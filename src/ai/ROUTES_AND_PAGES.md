# Product Engine API Routes (Supabase-backed)

This section documents the Product Engine endpoints implemented under `app/api/*` (Next.js App Router route handlers).

All endpoints return a consistent JSON envelope:

- Success: `{ "ok": true, "data": <payload>, "meta"?: <meta> }`
- Error: `{ "ok": false, "error": { "code": string, "message": string, "details"?: any } }`

---

## Public Storefront Endpoints (no admin privileges)

### GET `/api/products`
**Purpose:** List active products for the storefront.

**Auth:** Public  
**Filters (query params):**
- `q` (string, optional) — search against `search_text`
- `limit` (number, optional, default `20`)
- `offset` (number, optional, default `0`)

**Returns:** Product list with basic fields + embedded `product_images` (ordered by `position`).

**File:** `app/api/products/route.ts`

---

### GET `/api/products/[slug]`
**Purpose:** Product detail page by slug (active products only).

**Auth:** Public  
**Query params:**
- `include=inventory` (optional) — includes variant inventory fields when present in schema

**Returns:**
- product core fields
- `product_images[]` (sorted by `position`)
- `product_variants[]` (sorted by `position`)
- `categories[]` (flattened from `product_categories`)
- `primary_image` (first image by position)

**File:** `app/api/products/[slug]/route.ts`

---

### GET `/api/categories`
**Purpose:** List categories (flat) or return a nested tree.

**Auth:** Public  
**Query params:**
- `q` (string, optional)
- `include=tree` (optional) — returns nested tree format

**Returns:** category list or tree

**File:** `app/api/categories/route.ts`

---

### GET `/api/tags`
**Purpose:** List tags.

**Auth:** Public  
**Query params:**
- `q` (string, optional)

**File:** `app/api/tags/route.ts`

---

### GET `/api/collections`
**Purpose:** List collections.

**Auth:** Public  
**Query params:**
- `q` (string, optional)

**File:** `app/api/collections/route.ts`

---

## Admin Catalog Endpoints (requires auth + role gating)

> NOTE: Role gating is currently a placeholder in these handlers:
> authenticated user == allowed (until wired to your role system).
> Replace the `requireAdmin()` helper logic with your real role rules (admin/catalog manager).

---

### POST `/api/products`
**Purpose:** Create a new product (starts as `draft`).

**Auth:** Admin  
**Body (JSON):**
- `slug` (string, required)
- `title` (string, required)
- `price_cents` (number, required)
- `description` (string|null, optional)
- `compare_at_price_cents` (number|null, optional)
- `currency` (string, optional, default `"USD"`)
- `badge` (string|null, optional)
- `is_featured` (boolean, optional)

**File:** `app/api/products/route.ts`

---

### GET `/api/products/admin/[id]`
**Purpose:** Admin product detail (any status) including images, variants, categories.

**Auth:** Admin  
**File:** `app/api/products/admin/[id]/route.ts`

---

### PATCH `/api/products/admin/[id]`
**Purpose:** Update product fields (partial).

**Auth:** Admin  
**Body (JSON):** any subset of:
- `slug`, `title`, `description`
- `price_cents`, `compare_at_price_cents`, `currency`
- `badge`, `is_featured`, `status` (`active|draft|archived`)
- `seo_title`, `seo_description`, `og_image_override_url`
- `search_text`

**File:** `app/api/products/admin/[id]/route.ts`

---

### DELETE `/api/products/admin/[id]`
**Purpose:** Soft-delete by archiving product (`status = "archived"`).

**Auth:** Admin  
**File:** `app/api/products/admin/[id]/route.ts`

---

## Product Images (Admin)

### POST `/api/products/admin/[id]/images`
**Purpose:** Add a product image record.

**Auth:** Admin  
**Body (JSON):**
- `storage_path` (string, required)
- `alt` (string|null, optional)
- `position` (number, optional; defaults to append)

**File:** `app/api/products/admin/[id]/images/route.ts`

---

### PATCH `/api/products/admin/[id]/images/[imageId]`
**Purpose:** Update image metadata.

**Auth:** Admin  
**Body (JSON):** any subset of:
- `alt` (string|null)
- `position` (number >= 0)

**File:** `app/api/products/admin/[id]/images/[imageId]/route.ts`

---

### DELETE `/api/products/admin/[id]/images/[imageId]`
**Purpose:** Delete image record (does NOT delete the underlying storage object).

**Auth:** Admin  
**File:** `app/api/products/admin/[id]/images/[imageId]/route.ts`

---

## Product Variants (Admin)

### POST `/api/products/admin/[id]/variants`
**Purpose:** Add a new variant to a product.

**Auth:** Admin  
**Body (JSON):**
- `title` (string, required)
- `sku` (string|null, optional)
- `price_cents` (number, optional; defaults to product price)
- `compare_at_price_cents` (number|null, optional)
- `position` (number, optional; defaults to append)
- `inventory_enabled` (boolean, optional)
- `stock_on_hand` (number, optional; default `0`)
- `low_stock_threshold` (number, optional; default `0`)

**File:** `app/api/products/admin/[id]/variants/route.ts`

---

### PATCH `/api/products/admin/[id]/variants/[variantId]`
**Purpose:** Update variant fields (partial).

**Auth:** Admin  
**Body (JSON):** any subset of:
- `title`, `sku`
- `price_cents`, `compare_at_price_cents`
- `position`
- `inventory_enabled`, `stock_on_hand`, `low_stock_threshold`

**File:** `app/api/products/admin/[id]/variants/[variantId]/route.ts`

---

### DELETE `/api/products/admin/[id]/variants/[variantId]`
**Purpose:** Delete variant (scoped to product).

**Auth:** Admin  
**File:** `app/api/products/admin/[id]/variants/[variantId]/route.ts`

---

## Inventory Movements (Admin)

### POST `/api/inventory/movements`
**Purpose:** Insert an inventory movement row. Database trigger applies stock math.

**Auth:** Admin  
**Body (JSON):**
- `variant_id` (string, required)
- `movement_type` (string, required): `restock | sale | adjustment | damage | return`
- `quantity` (positive integer, required)
- `note` (string|null, optional)
- `reference` (string|null, optional)

**File:** `app/api/inventory/movements/route.ts`

---

## Product Assignments (Admin)

These endpoints connect products to categories/tags/collections through join tables.

> Tables assumed:
> - `product_categories(product_id, category_id)`
> - `product_tags(product_id, tag_id)`
> - `product_collections(product_id, collection_id)`

---

### POST `/api/products/admin/[id]/categories`
**Body:** `{ "category_id": "uuid" }`  
**File:** `app/api/products/admin/[id]/categories/route.ts`

### DELETE `/api/products/admin/[id]/categories?category_id=uuid`
**File:** `app/api/products/admin/[id]/categories/route.ts`

---

### POST `/api/products/admin/[id]/tags`
**Body:** `{ "tag_id": "uuid" }`  
**File:** `app/api/products/admin/[id]/tags/route.ts`

### DELETE `/api/products/admin/[id]/tags?tag_id=uuid`
**File:** `app/api/products/admin/[id]/tags/route.ts`

---

### POST `/api/products/admin/[id]/collections`
**Body:** `{ "collection_id": "uuid" }`  
**File:** `app/api/products/admin/[id]/collections/route.ts`

### DELETE `/api/products/admin/[id]/collections?collection_id=uuid`
**File:** `app/api/products/admin/[id]/collections/route.ts`

---
Perfect timing — this is the **last core utility** you need before wiring real data.

Below is a **clean, future-proof image helper** that works with **Supabase Storage** and keeps **all image logic out of components**.

No guessing, no hardcoded URLs.

---

## 1️⃣ Create: `lib/images.ts`

**Path**

```
Z:\WEBSITES\DCG.CO\lib\images.ts
```

```ts
/**
 * Central image helpers for Supabase Storage
 *
 * Assumptions:
 * - Images are stored in Supabase Storage
 * - You store `storage_path` in the DB (NOT full URLs)
 *   example: "products/abc123/main.jpg"
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ??
  "";

if (!SUPABASE_URL) {
  console.warn("⚠️ NEXT_PUBLIC_SUPABASE_URL is not set");
}

/**
 * CHANGE THIS to your actual bucket name
 * Common values:
 * - "public"
 * - "product-images"
 * - "images"
 */
export const PRODUCT_IMAGE_BUCKET = "product-images";

/**
 * Build a public Supabase Storage URL from a storage path
 *
 * @example
 * storagePathToUrl("products/123/main.jpg")
 * → https://xyz.supabase.co/storage/v1/object/public/product-images/products/123/main.jpg
 */
export function storagePathToUrl(storagePath?: string | null): string | null {
  if (!storagePath) return null;
  if (!SUPABASE_URL) return null;

  return `${SUPABASE_URL}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${storagePath}`;
}

/**
 * Returns the first image URL (or fallback)
 */
export function getPrimaryImageUrl(
  images: { storage_path: string }[] | null | undefined,
  fallback: string = "/images/placeholder.png"
): string {
  if (!images || images.length === 0) return fallback;

  const url = storagePathToUrl(images[0].storage_path);
  return url ?? fallback;
}
```

---

## 2️⃣ (Optional but smart) Create a placeholder image

Put **one fallback image** here so broken products never look bad:

```
public/images/placeholder.png
```

Even a gray square is fine for now.

---

## 3️⃣ Example usage (Featured product card)

When you swap from placeholder → real product cards, this is how images plug in:

```tsx
import Image from "next/image";
import { getPrimaryImageUrl } from "@/lib/images";
import { formatMoney } from "@/lib/money";
import type { StoreProductListItem } from "@/types/store";

export function ProductCard({ product }: { product: StoreProductListItem }) {
  const imageUrl = getPrimaryImageUrl(product.product_images);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="aspect-square relative">
        <Image
          src={imageUrl}
          alt={product.title}
          fill
          className="object-cover"
        />
      </div>

      <div className="p-3">
        <div className="font-semibold text-sm">{product.title}</div>
        <div className="text-sm text-[var(--muted-foreground)] mt-1">
          {formatMoney(product.price_cents, product.currency)}
        </div>
      </div>
    </div>
  );
}
```

---

## 4️⃣ Why this setup is important (quick)

* ✅ DB stores **paths**, not URLs (portable, clean)
* ✅ Changing buckets = **one line**
* ✅ Signed URLs later = **swap function**
* ✅ Components stay dumb (good React)

---

## 5️⃣ Next logical steps (your choice)

Say one of these and we go **exactly there**:

* **“swap featured products”** → replace placeholders with `/api/products`
* **“swap category tiles”** → fully live landing categories
* **“product grid page”** → `/shop` page wired to backend
* **“product detail page”** → slug page with variants & images

You’re in the *clean part* of the build now — everything after this is just plugging in data.

---
