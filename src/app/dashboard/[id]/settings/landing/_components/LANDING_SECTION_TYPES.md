# Landing Section Types Reference

## 📋 Overview

Your landing page system supports 5 different section types. Each serves a specific purpose and has different configuration requirements.

---

## 🎨 Section Types

### 1. Top Banner (Custom Component by unenter)

**Type:** `top_banner`  
**Label:** Top Banner (Custom by unenter)  
**Configuration:** ❌ None needed  

**Description:**
Announcement bar that appears at the very top of the landing page. This is a custom-built component that doesn't require any configuration.

**Usage:**
```json
{
  "type": "top_banner",
  "is_active": true,
  "config": {}
}
```

**Component Location:** Custom component handles all content
**Managed By:** unenter (developer)
**User Action:** Just add the section - it works automatically

---

### 2. Category Carousel (Custom Component by unenter)

**Type:** `hero_carousel`  
**Label:** Category Carousel (Custom by unenter)  
**Configuration:** ❌ None needed  

**Description:**
Displays a carousel of category images. This is a custom-built component that automatically pulls category images from your database.

**Usage:**
```json
{
  "type": "hero_carousel",
  "is_active": true,
  "config": {}
}
```

**Data Source:** Automatically pulls from `categories` table  
**Managed By:** unenter (developer)  
**User Action:** Just add the section - it works automatically

---

### 3. Categories Grid

**Type:** `categories_grid`  
**Label:** Categories Grid  
**Configuration:** ✅ Yes  

**Description:**
Displays product categories in a grid layout. Users can browse by category to find products.

**Configuration Options:**
- **title** (string): Section heading
- **columns** (number): 2, 3, 4, or 6 columns
- **showImages** (boolean): Show category images
- **categoryIds** (array): Specific categories to show (empty = all)

**Example:**
```json
{
  "type": "categories_grid",
  "is_active": true,
  "config": {
    "title": "Shop by Category",
    "columns": 3,
    "showImages": true,
    "categoryIds": []
  }
}
```

**Data Source:** `categories` table  
**Use Case:** Help customers browse by product type (Tops, Bottoms, Accessories, etc.)

---

### 4. Static Page Embed

**Type:** `static_html`  
**Label:** Static Page Embed  
**Configuration:** ✅ Yes  

**Description:**
Embeds a pre-made static page by its slug. Static pages are created through a separate upload/management flow.

**Configuration Options:**
- **slug** (string, required): The slug of the static page to embed
- **showTitle** (boolean): Display the page title
- **containerWidth** (string): "full", "contained", or "narrow"

**Example:**
```json
{
  "type": "static_html",
  "is_active": true,
  "config": {
    "slug": "landing-qr-download",
    "showTitle": false,
    "containerWidth": "full"
  }
}
```

**Data Source:** `static_pages` table (managed separately)  
**Use Case:** Custom content sections (QR code promo, brand story, special offers)

---

### 5. Collection Products Grid

**Type:** `products_grid`  
**Label:** Collection Products Grid  
**Configuration:** ✅ Yes  

**Description:**
Displays products from a specific collection. This is the main way to showcase products on your landing page.

**Configuration Options:**
- **title** (string): Section heading
- **description** (string, optional): Subtitle text
- **collection** (string, REQUIRED): Collection slug to display products from
- **limit** (number): Number of products to show (1-50)
- **sortBy** (string): "newest", "featured", "price-asc", "price-desc"
- **featured** (boolean): Show only featured products
- **viewAllHref** (string): Link to full collection page

**Example:**
```json
{
  "type": "products_grid",
  "is_active": true,
  "config": {
    "title": "Best Sellers",
    "description": "Our most-loved Western wear",
    "collection": "best-sellers",
    "limit": 8,
    "sortBy": "featured",
    "viewAllHref": "/collections/best-sellers"
  }
}
```

**Data Source:** 
- Products: `products` table
- Collection: `collections` table
- Relationship: `product_collections` junction table

**Important Notes:**
- Collection is REQUIRED (no "show all products" option)
- Products must be linked to the collection via `product_collections` table
- View All link should point to `/collections/{slug}` for best UX

**Use Case:** Feature specific product collections (New Arrivals, Best Sellers, Sale Items)

---

## 🏗️ Architecture Overview

### Custom Components (No Config)
```
top_banner ──────► Custom React Component
                   (Managed by developer)

hero_carousel ───► Category Images Component
                   (Pulls from categories table)
```

### Configurable Components
```
categories_grid ──► categories table
                    ↓
                    Renders category tiles

static_html ─────► static_pages table
                    ↓
                    Embeds page content

products_grid ───► collections table
                    ↓
                    product_collections junction
                    ↓
                    products table
                    ↓
                    Renders product grid
```

---

## 📝 Best Practices

### Top Banner
- ✅ Add once at position 0 (top of page)
- ❌ Don't add multiple banners
- ℹ️ Content changes require developer update

### Category Carousel
- ✅ Add once near top of page (position 1-2)
- ❌ Don't add multiple carousels
- ℹ️ Updates automatically when categories change

### Categories Grid
- ✅ Use to help customers browse
- ✅ Typically position 2-3 on page
- ✅ Leave categoryIds empty to show all
- ℹ️ Updates automatically when categories change

### Static Page Embed
- ✅ Use for custom content sections
- ✅ Manage actual content in static pages flow
- ❌ Don't use for products (use Collection Grid instead)
- ℹ️ Can add multiple with different slugs

### Collection Products Grid
- ✅ **ALWAYS** select a collection (required)
- ✅ Set viewAllHref to `/collections/{slug}`
- ✅ Can add multiple sections for different collections
- ✅ Use descriptive titles ("Best Sellers", "New Arrivals")
- ❌ Don't leave collection empty
- ℹ️ Shows only products linked to that collection

---

## 🔗 Database Relationships

### Collections → Products
```sql
-- Collections table
collections (id, slug, name, description)

-- Products in collection (many-to-many)
product_collections (product_id, collection_id, position)

-- Products table
products (id, slug, title, price_cents, status, is_featured)
```

### How It Works:
1. Create a collection: "best-sellers"
2. Link products to collection via `product_collections` table
3. Create landing section with `collection: "best-sellers"`
4. Section displays only products linked to that collection

---

## 🎯 Example Landing Page Structure

```
Position 0: Top Banner (Custom Component)
Position 1: Category Carousel (Custom Component)
Position 2: Categories Grid (config: show all categories)
Position 3: Static Page (slug: "welcome-message")
Position 4: Collection Grid (collection: "new-arrivals")
Position 5: Collection Grid (collection: "best-sellers")
Position 6: Static Page (slug: "qr-download-promo")
Position 7: Collection Grid (collection: "sale")
```

---

## ⚙️ Configuration Management

### Simple Form Mode (Recommended)
- User-friendly dropdowns and inputs
- Collection selector with product counts
- Auto-fill View All link button
- Real-time preview of configuration

### Advanced JSON Mode
- Direct JSON editing
- For power users
- Validate before saving

---

**Last Updated:** 2025-02-19  
**Version:** 1.0  
**Maintained By:** Development Team
