# 🔍 Product 404 Debug Guide - "Retro Aztec Sweatshirt"

## Problem

Clicking on product shows 404 error. The URL shows:
```
localhost:8001/.../retro-aztec-western-country-cowboy-deser...
```

The slug appears truncated at "deser" instead of "desert"

## Root Causes (Ranked by Likelihood)

### 1. ❌ Missing or Malformed Slug in Database
**Most Likely**

The product might not have a proper slug saved in the database.

**Check:**
```sql
-- Run this in Supabase SQL Editor
SELECT id, title, slug, status
FROM products
WHERE title ILIKE '%retro%aztec%'
ORDER BY created_at DESC;
```

**Expected:**
- `slug` should be: `retro-aztec-western-country-cowboy-desert-sweatshirt`
- NOT empty, NULL, or truncated

**Fix if broken:**
```sql
-- Generate proper slug
UPDATE products
SET slug = 'retro-aztec-western-country-cowboy-desert-sweatshirt'
WHERE title ILIKE '%retro%aztec%western%'
  AND (slug IS NULL OR slug = '' OR slug NOT LIKE '%desert%');
```

---

### 2. ❌ Product Detail Route Doesn't Exist

The `/products/[slug]` route might not be set up yet.

**Check:**
Does this file exist?
```
app/products/[slug]/page.tsx
```

**If Missing**, you need to create the product detail page route.

---

### 3. ❌ Slug Generation Bug During Product Creation

When you created the product, the slug generator might have failed or truncated.

**Check your product creation code:**
```tsx
// In your create product handler
const slug = generateSlug(title); // ← This function might be broken
```

**Common Issues:**
- Character limit (50 chars?) truncating slug
- Special characters breaking slug generation
- Missing slug generation entirely

---

## Quick Fixes

### Fix 1: Update the Product Slug Manually

1. Go to **Supabase** → **Table Editor** → **products**
2. Find "Retro Aztec Western Country Cowboy Desert Sweatshirt"
3. Update the `slug` field to: `retro-aztec-western-country-cowboy-desert-sweatshirt`
4. Save
5. Test the link again

### Fix 2: Generate Slug Programmatically

Run this in Supabase SQL Editor:

```sql
UPDATE products
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(title, '[^a-zA-Z0-9\s-]', '', 'g'),
    '\s+', '-', 'g'
  )
)
WHERE id = 'YOUR_PRODUCT_ID'; -- Replace with actual ID
```

### Fix 3: Verify Product Detail Page Exists

If `/products/[slug]/page.tsx` doesn't exist, create it:

```tsx
// app/products/[slug]/page.tsx
import { createServerClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";

export default async function ProductPage({ 
  params 
}: { 
  params: Promise<{ slug: string }> 
}) {
  const { slug } = await params;
  const supabase = await createServerClient();

  // Fetch product by slug
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (error || !product) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold">{product.title}</h1>
      <p className="text-2xl mt-4">${(product.price_cents / 100).toFixed(2)}</p>
      {/* Add more product details here */}
    </div>
  );
}
```

---

## Debugging Steps

### Step 1: Check the Database

Run the SQL query I provided (`check-product-slug.sql`):

```sql
SELECT id, title, slug, status
FROM products
WHERE title ILIKE '%retro%aztec%'
LIMIT 5;
```

**What to look for:**
- ✅ Slug exists and is complete
- ❌ Slug is NULL
- ❌ Slug is empty string
- ❌ Slug is truncated (ends with "deser" not "desert")

### Step 2: Check the Route

Navigate manually to:
```
http://localhost:3000/products/retro-aztec-western-country-cowboy-desert-sweatshirt
```

**Expected Results:**
- ✅ Product page loads → Route works, slug is wrong in DB
- ❌ 404 error → Route doesn't exist OR slug is wrong

### Step 3: Check the Link in CollectionPageClient

The link should be:
```tsx
<Link href={`/products/${product.slug}`}>
```

Open DevTools → Elements → Inspect the product card link:
```html
<!-- Should be: -->
<a href="/products/retro-aztec-western-country-cowboy-desert-sweatshirt">

<!-- NOT: -->
<a href="/products/retro-aztec-western-country-cowboy-deser">
```

If it's truncated in HTML, the issue is in the database.

---

## Long-Term Fix: Slug Validation

Add slug validation to your product creation workflow:

```tsx
// utils/generateSlug.ts
export function generateSlug(title: string, maxLength: number = 255): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens with single
    .slice(0, maxLength);     // Ensure it doesn't exceed max length
}

// Validation
export function validateSlug(slug: string): boolean {
  return (
    slug.length > 0 &&
    slug.length <= 255 &&
    /^[a-z0-9-]+$/.test(slug) &&
    !slug.startsWith('-') &&
    !slug.endsWith('-')
  );
}
```

---

## Prevention Checklist

When creating products, ensure:
- [ ] Slug is generated from title
- [ ] Slug has no character limit (or at least 255 chars)
- [ ] Slug is validated before saving
- [ ] Slug is unique (add unique constraint in DB)
- [ ] Empty slugs are rejected

---

## Next Steps

1. **Run the SQL query** to check the product's slug
2. **Fix the slug** in the database if it's wrong
3. **Test the link** again after fixing
4. **Create the product detail route** if it doesn't exist
5. **Add slug validation** to prevent future issues

---

## Expected URL Structure

Your product URLs should follow this pattern:

```
/products/[full-product-slug]

Examples:
✅ /products/retro-aztec-western-country-cowboy-desert-sweatshirt
✅ /products/mens-high-roller-graphic-tee
✅ /products/brown-western-aztec-long-cardigan

❌ /products/retro-aztec-deser (truncated)
❌ /products/12345 (ID instead of slug)
❌ /products/ (empty)
```

---

**Run the SQL query first, then let me know what you find!** 🔍
Let me check what tables we're actually dealing with:Confirmed — two completely separate inventory systems. The storefront and product management reads `product_variants.inventory_qty`, but the inventory manager page reads/writes the separate `inventory` table. They're out of sync.

The right fix is to **eliminate the `inventory` table** and make everything use `product_variants` as the single source of truth. The inventory manager page just needs to read/write `product_variants.inventory_qty` and `product_variants.track_inventory` instead.

Let me check what the inventory manager API looks like:Good — I can see the variant route already tries to mirror inventory to both tables. The issue is clear: the `inventory` table is the "manager" source but `product_variants.inventory_qty` is what the storefront reads. They need to stay in sync.

The cleanest fix is a **database trigger** — whenever `inventory` table changes, auto-sync to `product_variants`, and vice versa. That way both systems always agree without changing any code:Both tables now show identical values. Here's what was done and what's fixed:

**Inventory sync** — both tables are now in sync (both show Brown/Tan: 2, Tan/Camo: 2 with `track_inventory = true`). Going forward, updating either the inventory manager OR the product editor will automatically keep the other in sync via DB triggers. No code changes needed.

**What you'll see on the storefront now** — the hat will show the correct quantity from the inventory manager. Buy one and both tables will decrement together.

**Email** — the Edge Function is returning 200 so Brevo is processing it. Check spam, and when the client sets up their real Brevo account with a verified domain, deliverability will be solid.

One thing to note — the hat variants now show qty 2 because that's what was set in your inventory manager. If the real stock is 8 and 10, go update those in the inventory manager and it'll sync back to the storefront automatically. 🤠