# 📚 Complete Workflow: Collections → Landing Page Display

## Overview

This guide documents the complete end-to-end workflow for creating a new product collection and displaying it on your landing page. Your system is already 100% ready for this workflow!

---

## 🎯 What Are Collections?

**Collections** are curated groups of products for marketing purposes. Think of them as "featured playlists" of your products.

### Collections vs Categories

| Feature | **Collections** (Marketing) | **Categories** (Catalog) |
|---------|---------------------------|------------------------|
| **Purpose** | Marketing features | Product organization |
| **Examples** | "New Arrivals", "Best Sellers", "Valentine's Day" | "Boots", "Denim", "Accessories" |
| **Product membership** | Manually curated | By product type |
| **On landing page?** | ✅ Yes, via products_grid sections | ✅ Yes, via categories_grid section |

---

## 🗂️ Your Current Collections

You currently have **6 collections** set up:

1. **New Arrivals** (`new`) - 11 products
2. **Best Sellers** (`best-sellers`) - 3 products
3. **Shop All** (`all`) - 2 products
4. **Sale** (`sale`) - 0 products
5. **Cowboy Valentine** (`cowboy-valentine`) - 1 product
6. **Restocks** (`restocks`) - 5 products

---

## 🔄 Complete Workflow

### Step 1: Create a New Collection

**Option A: Via Dashboard (Recommended)**

1. Navigate to **Dashboard → Settings → Collections**
2. Click **"Add Collection"**
3. Fill in the details:
   - **Name**: `Spring Cowgirl Essentials`
   - **Slug**: `spring-essentials` (auto-generated from name)
   - **Description**: `Perfect pieces for your spring wardrobe`
   - **Position**: `6` (or leave it to auto-sort)
4. Click **"Create Collection"**

**Option B: Via Supabase SQL**

```sql
INSERT INTO collections (slug, name, description, position)
VALUES (
  'spring-essentials',
  'Spring Cowgirl Essentials',
  'Perfect pieces for your spring wardrobe',
  6
);
```

### Step 2: Add Products to the Collection

**Option A: Via Dashboard**

1. Go to **Dashboard → Settings → Collections**
2. Click on your new collection (`Spring Cowgirl Essentials`)
3. Click **"Add Products"**
4. Select the products you want to feature
5. Click **"Save"**

**Option B: Via Supabase SQL**

```sql
-- Get the collection ID
SELECT id FROM collections WHERE slug = 'spring-essentials';

-- Add products to the collection (replace with actual product IDs)
INSERT INTO product_collections (collection_id, product_id, position)
VALUES
  ('<collection-id>', '<product-id-1>', 0),
  ('<collection-id>', '<product-id-2>', 1),
  ('<collection-id>', '<product-id-3>', 2),
  ('<collection-id>', '<product-id-4>', 3);
```

### Step 3: Display Collection on Landing Page

**Via Landing Page Manager**

1. Navigate to **Dashboard → Settings → Landing Page**
2. Click **"Add Section"**
3. Configure the section:
   - **Type**: `products_grid`
   - **Active**: ✅ Checked
   - **Config**:
   ```json
   {
     "title": "Spring Cowgirl Essentials",
     "collection": "spring-essentials",
     "limit": 4,
     "viewAllHref": "/shop/collection/spring-essentials"
   }
   ```
4. Click **"Create Section"**
5. **Drag** the new section to your desired position

**Via Supabase SQL** (if you prefer)

```sql
INSERT INTO landing_sections (position, type, is_active, config)
VALUES (
  7, -- position after existing sections
  'products_grid',
  true,
  '{
    "title": "Spring Cowgirl Essentials",
    "collection": "spring-essentials",
    "limit": 4,
    "viewAllHref": "/shop/collection/spring-essentials"
  }'::jsonb
);
```

### Step 4: Preview Your Landing Page

1. Visit your storefront: **`https://yourdomain.com`**
2. Scroll to see your new section
3. The section will display:
   - ✅ Collection title
   - ✅ Up to 4 products from the collection
   - ✅ "View All →" button linking to full collection page

---

## 🎨 Landing Section Config Options

When creating a `products_grid` section, you can customize it with these config options:

```json
{
  "title": "Display Title",           // Section heading
  "collection": "collection-slug",    // Which collection to show
  "limit": 4,                         // How many products (default: 4)
  "startIndex": 0,                    // Start from which product (default: 0)
  "viewAllHref": "/shop/collection/slug"  // "View All" link
}
```

### Common Patterns

**Pattern 1: Show First 4 Products**
```json
{
  "title": "New Arrivals",
  "collection": "new",
  "limit": 4,
  "startIndex": 0
}
```

**Pattern 2: Show Next 4 Products (from same collection)**
```json
{
  "title": "More New Arrivals",
  "collection": "new",
  "limit": 4,
  "startIndex": 4
}
```

**Pattern 3: Show All Products (8)**
```json
{
  "title": "Featured Collection",
  "collection": "best-sellers",
  "limit": 8
}
```

---

## 🔧 How It Works Behind the Scenes

### Database Structure

```
collections                  product_collections           products
┌──────────────┐            ┌──────────────┐             ┌──────────┐
│ id           │────────────│ collection_id│             │ id       │
│ slug         │            │ product_id   │─────────────│ title    │
│ name         │            │ position     │             │ slug     │
│ description  │            └──────────────┘             │ price    │
│ position     │                                         └──────────┘
└──────────────┘
```

### API Flow

```
User visits landing page
    ↓
Landing component fetches /api/landing/sections
    ↓
Gets all active sections, finds products_grid types
    ↓
ProductsGridSection component uses useLandingData() hook
    ↓
Hook fetches /api/landing/data
    ↓
API queries products WHERE collection = 'collection-slug'
    ↓
Returns products for display
    ↓
Renders on page!
```

### Key Files

**Landing Rendering:**
- `components/shop/Landing-Dynamic.tsx` - Main landing renderer
- `components/shop/sections/ProductsGridSection.tsx` - Products grid component
- `components/shop/_components/useLandingData.ts` - Data fetching hook

**Collection Management:**
- `app/dashboard/[id]/settings/collections/*` - Collection manager
- `app/api/collections/*` - Collection API endpoints

**Landing Management:**
- `app/dashboard/[id]/settings/landing/*` - Landing section manager
- `app/api/landing/sections/route.ts` - Sections CRUD API

---

## 💡 Real-World Example

Let's say you want to create a **"Valentine's Day Western Romance"** collection:

### 1. Create Collection
```sql
INSERT INTO collections (slug, name, description, position)
VALUES (
  'valentine-western',
  'Valentine''s Day Western Romance',
  'Heart-stopping western wear for your special day',
  7
);
```

### 2. Add 6 Products to Collection
```sql
-- Get your collection ID
SELECT id FROM collections WHERE slug = 'valentine-western';
-- Returns: abc123-def456-ghi789

-- Add products (replace with actual product IDs)
INSERT INTO product_collections (collection_id, product_id, position)
VALUES
  ('abc123-def456-ghi789', '<red-boots-id>', 0),
  ('abc123-def456-ghi789', '<heart-belt-id>', 1),
  ('abc123-def456-ghi789', '<rose-hat-id>', 2),
  ('abc123-def456-ghi789', '<pink-denim-id>', 3),
  ('abc123-def456-ghi789', '<fringe-jacket-id>', 4),
  ('abc123-def456-ghi789', '<love-necklace-id>', 5);
```

### 3. Add to Landing Page
```sql
INSERT INTO landing_sections (position, type, is_active, config)
VALUES (
  5, -- Between existing sections
  'products_grid',
  true,
  '{
    "title": "Valentine''s Day Western Romance ❤️",
    "collection": "valentine-western",
    "limit": 4,
    "viewAllHref": "/shop/collection/valentine-western"
  }'::jsonb
);
```

### 4. Result

Your landing page now shows:
```
┌─────────────────────────────────────┐
│ Valentine's Day Western Romance ❤️   │ View All →
├─────────────────────────────────────┤
│ [Red Boots]  [Heart Belt]           │
│                                     │
│ [Rose Hat]   [Pink Denim]           │
└─────────────────────────────────────┘
```

---

## 🎯 Best Practices

### Collection Strategy
1. **Keep collections focused** - 4-12 products works best
2. **Update seasonally** - Rotate collections for holidays/seasons
3. **Use descriptive names** - "Spring Essentials" not "Collection 3"
4. **Test positions** - Drag sections around to find optimal placement

### Landing Page Organization
```
Suggested order:
1. Top Banner (announcements)
2. Hero Carousel (main visual)
3. Categories Grid (browse by type)
4. Static HTML (promo/QR codes)
5-8. Product Grids (multiple collections)
```

### Performance Tips
- **Limit products per section** to 4-8 for fast loading
- **Use meaningful slugs** for SEO (`spring-essentials` not `col-1`)
- **Add descriptions** for better context

---

## 🚀 Advanced Workflows

### Seasonal Collection Rotation

**Before Valentine's Day:**
```sql
-- Hide old holiday collection
UPDATE landing_sections 
SET is_active = false 
WHERE config->>'collection' = 'christmas-special';

-- Show Valentine's collection
UPDATE landing_sections 
SET is_active = true 
WHERE config->>'collection' = 'valentine-western';
```

### A/B Testing Collections

**Test two different collections in same position:**
```sql
-- Version A: Show "New Arrivals" to 50% of users
-- Version B: Show "Best Sellers" to 50% of users
-- (Requires custom logic in ProductsGridSection component)
```

### Dynamic Collection Updates

**Auto-update "New Arrivals" collection weekly:**
```sql
-- Remove old products
DELETE FROM product_collections 
WHERE collection_id = (SELECT id FROM collections WHERE slug = 'new')
AND created_at < NOW() - INTERVAL '30 days';

-- Add newly created products
INSERT INTO product_collections (collection_id, product_id, position)
SELECT 
  (SELECT id FROM collections WHERE slug = 'new'),
  id,
  0
FROM products
WHERE created_at > NOW() - INTERVAL '7 days'
  AND status = 'active'
ORDER BY created_at DESC
LIMIT 8;
```

---

## ✅ Quick Reference

### Create Collection → Display on Landing (Speed Run)

```sql
-- 1. Create collection (5 seconds)
INSERT INTO collections (slug, name, position)
VALUES ('my-collection', 'My Collection', 100);

-- 2. Add products (10 seconds)
INSERT INTO product_collections (collection_id, product_id)
SELECT 
  (SELECT id FROM collections WHERE slug = 'my-collection'),
  id
FROM products 
WHERE status = 'active' 
LIMIT 4;

-- 3. Add to landing page (5 seconds)
INSERT INTO landing_sections (position, type, config)
VALUES (
  100,
  'products_grid',
  '{"title": "My Collection", "collection": "my-collection", "limit": 4}'::jsonb
);
```

**Total time: ~20 seconds** ⚡

---

## 🎉 Summary

Your system is **fully functional** and ready to go! The workflow is:

1. ✅ **Create Collection** (Dashboard or SQL)
2. ✅ **Add Products** (Dashboard or SQL)
3. ✅ **Add Landing Section** (Drag-and-drop manager)
4. ✅ **Collection Auto-Displays** on landing page!

No code changes needed - everything is database-driven and managed through your dashboard! 🚀
