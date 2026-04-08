# 📦 Product Upload Guide: Faire.com to Desert Cowgirl

## Product Type 1: Multi-Size, Single-Color Products

**Example:** Brown Western Aztec Printed Open Front Long Cardigan

---

### 📋 Step-by-Step Upload Process

#### 1. **Gather Product Information from Faire**

From the Faire product page, collect:

**Basic Details:**
- Title: "Brown Western Aztec Printed Open Front Long Cardigan"
- Price: $27.00 MSRP
- Description: Full product description from Faire
- SKU Pattern: `LC2542552-P1720` (remove the size suffix from any size-specific SKU)

**Variant Options:**
- **Sizes:** M, S, L, XL (list all available sizes)
- **Color:** Brown (single color)
- **Material:** 95%Polyester+5%Elastane
- **Made In:** China

**Additional Details:**
- Weight per size (if available)
- Stock quantities per size

---

#### 2. **Open Create Product Modal**

In Desert Cowgirl dashboard → Products → Click "Create Product"

---

#### 3. **Fill in Basic Product Information**

**Title:**
```
Brown Western Aztec Printed Open Front Long Cardigan
```

**Slug:** Click "Auto" to generate automatically
```
brown-western-aztec-printed-open-front-long-cardigan
```

**Price (USD):**
```
27.00
```

**Base SKU:**
```
LC2542552-P1720
```
⚠️ **Important:** Remove any size suffix (like -S, -M) from the SKU. The system will auto-append sizes.

**Description:**
```
The cardigan shows a captivating Western-inspired Aztec print, bringing a unique and cultural touch to your wardrobe.
Designed with an open front, this cardigan allows for versatile styling and an effortless layering piece.
The long cardigan provides extra coverage and a dramatic silhouette perfect for making a statement.
Made with a soft material, it's ideal for keeping warm while adding a fashionable layer to any outfit.
```

---

#### 4. **Upload Images** (Optional for now)

Collapse the Images section or upload product photos if available.

---

#### 5. **Configure Variants**

Expand the "Variants" section.

**Add Sizes:**
1. Click "+" next to Sizes
2. Add each size: M, S, L, XL
3. Enter exact size values from Faire

**Add Color:**
1. Click "+" next to Colors
2. Name: `Brown`
3. Color: Pick brown color (or use hex `#8B4513`)

**Add Material:**
1. Click "+" next to Materials
2. Enter: `95%Polyester+5%Elastane`

**Add Made In:**
1. Click "+" next to Made In
2. Enter: `China`

---

#### 6. **Generate Variants**

Click the **"🔄 Generate Variants from Options"** button.

**Expected Result:** 4 variant cards appear automatically:
- Variant 1: M
- Variant 2: S
- Variant 3: L
- Variant 4: XL

Each variant will show:
- **Title:** Size letter (e.g., "M")
- **SKU:** Auto-generated (e.g., `LC2542552-P1720-M`)
- **Select Options:** Size + Brown color pre-selected
- **Weight (g):** Leave empty or add if known
- **Initial Stock:** Enter quantity available

---

#### 7. **Fill Variant-Specific Details**

For each variant, enter:

**Stock Quantities:**
```
Variant M: 10 units
Variant S: 10 units
Variant L: 10 units
Variant XL: 10 units
```

**Weights (optional):**
```
Based on Faire details:
S: 310g
M: 330g
L: 340g
XL: 380g
```

---

#### 8. **Assign Categories** (Optional)

Expand Categories section and select relevant categories:
- TOPS
- OUTERWEAR
- etc.

---

#### 9. **Assign Collections** (Optional)

Expand Collections and select:
- New Arrivals
- Best Sellers
- etc.

---

#### 10. **Create Product**

Click **"Create Product"** button.

**Console Logs to Verify Success:**
```
✅ POST /api/products/admin 200
✅ POST /api/products/admin/{id}/variants 200 (x4)
✅ POST /api/products/admin/{id}/images 200 (if images uploaded)
✅ GET /api/products/admin 200
```

---

### ✅ Verification Checklist

After creation, go to **Manage Product → Advanced** and verify:

**Variants (4):**
- [ ] M - SKU: `LC2542552-P1720-M`, Stock: 10 units
- [ ] S - SKU: `LC2542552-P1720-S`, Stock: 10 units
- [ ] L - SKU: `LC2542552-P1720-L`, Stock: 10 units ⚠️
- [ ] XL - SKU: `LC2542552-P1720-XL`, Stock: 10 units

**Variant Options Saved:**
Each variant should show:
```json
{
  "size": "M",
  "color": {"name": "Brown", "hex": "#000000"},
  "material": "95%Polyester+5%Elastane",
  "made_in": "China"
}
```

---

### 🐛 Known Issues & Workarounds

#### Issue 1: Variant L shows SKU "10" instead of full SKU

**Cause:** User accidentally typed "10" in the SKU field for variant L instead of leaving it blank.

**Fix:** 
- Leave SKU fields **empty** for auto-generation
- Only fill custom SKUs if you want to override the auto-generated format

**SQL Fix (if needed):**
```sql
UPDATE product_variants 
SET sku = 'LC2542552-P1720-L' 
WHERE sku = '10' AND title = 'L';
```

#### Issue 2: Weight not saving

**Cause:** Weight field was left empty during creation.

**Fix:** Can be updated later in Manage Product → Advanced → Edit Variant

---

### 📊 Expected Database Structure

**Product:**
```
title: "Brown Western Aztec Printed Open Front Long Cardigan"
slug: "brown-western-aztec-printed-open-front-long-cardigan"
price_cents: 2700
status: "draft"
```

**Variants:**
```
M:  SKU: LC2542552-P1720-M, Stock: 10, Options: {size, color, material, made_in}
S:  SKU: LC2542552-P1720-S, Stock: 10, Options: {size, color, material, made_in}
L:  SKU: LC2542552-P1720-L, Stock: 10, Options: {size, color, material, made_in}
XL: SKU: LC2542552-P1720-XL, Stock: 10, Options: {size, color, material, made_in}
```

---

## 🎯 Success Criteria

✅ Product created with correct title, slug, price
✅ 4 variants auto-generated with unique SKUs
✅ All variant options (size, color, material, made_in) saved correctly
✅ Stock quantities tracked properly
✅ Categories and collections assigned

---

## 📝 Notes for Future Product Types

This guide covers **Type 1: Multi-Size, Single-Color** products.

**Future sections to add:**
- Type 2: Single-Size, Multi-Color
- Type 3: Multi-Size, Multi-Color
- Type 4: One-Size-Fits-All
- Type 5: Products with custom options (engravings, etc.)

---

**Last Updated:** February 14, 2026
**Version:** 1.0
**Test Product:** Brown Western Aztec Printed Open Front Long Cardigan
Perfect — then this is **not** Type 4 (single variant).

This becomes:

# TYPE 4

# Multi-Color Only (No Size Matrix)

(Accessory / Hat / One Size)

This is used when:

* One size (OSFM / Adjustable)
* Multiple colorways
* No size matrix
* One weight per color (usually same weight)

---

# TYPE 4 – Multi-Color, One Size Product

Example: **Howdy Honey Western Trucker Hat**

Colors:

* Tan/Brown
* Tan/Camo

No size options.

---

## 1️⃣ Basic Product Setup

Title:

```
Howdy Honey Western Trucker Hat
```

Slug:
Click **Auto**

Price:

```
25.00
```

---

## 2️⃣ Base SKU

If vendor SKU is not provided, create normalized internal SKU:

Example:

```
WSP-HOWDY-HAT
```

We will let the system append color logic (if used),
or manually control per variant if needed.

---

## 3️⃣ Product-Level Metadata

Made In:

```
United States
```

Material:
Leave blank unless confirmed.

Do NOT duplicate this in description.

---

## 4️⃣ Description (Filtered Properly)

Remove:

* Wholesale marketplace language
* Shipping details
* “Unlock wholesale pricing”
* Packaging notes
* Screen color disclaimer

Keep clean product-focused content:

```
Show off your style in our Howdy Honey Country Western puff trucker hat.

Features:
- “Howdy Honey” in red puff ink
- Removable small pin attached to each hat
- Individually heat pressed
- 5-panel construction
- Mesh back with snapback closure
```

Keep formatting clean and readable.

---

## 5️⃣ Images + ALT Coordination (Important)

Because this is color-based:

Each image ALT must match the color variant exactly.

Example:

Image 1 ALT:

```
Howdy Honey Trucker Hat – Tan/Brown
```

Image 2 ALT:

```
Howdy Honey Trucker Hat – Tan/Camo
```

This keeps frontend mapping clean and allows color-image linking logic later.

---

## 6️⃣ Variants Section

Do NOT add sizes.

Under **Colors**, add:

* Tan/Brown
* Tan/Camo

Then click:

🔄 Generate Variants (Color x Size)

Since no sizes exist, system will generate:

2 variants total.

---

## 7️⃣ Variant Configuration

Each variant will be:

Variant 1:
Tan/Brown

Variant 2:
Tan/Camo

SKU handling:

If using base SKU:
System may append color automatically.

If manually setting:

```
WSP-HOWDY-HAT-TANBRN
WSP-HOWDY-HAT-TANCAMO
```

Weight:

```
85.05
```

Enter weight for both variants (if same).

Initial Stock:
Set individually per color.

---

## 8️⃣ Expected Result After Create

System creates:

1 Product
2 Variants (one per color)
No size matrix
Weight stored at variant level
Clean ALT ↔ color alignment

---

## ✅ Final Checklist Before Create

* [ ] Clean description (filtered)
* [ ] Color names match image ALT
* [ ] No size options added
* [ ] 2 variants generated
* [ ] Weight entered per variant
* [ ] SKUs normalized
* [ ] Categories + Collections selected

---

# 🔹 Product Upload – Type 6 (Revised)

## Multi-Size Product (Weight Stored on Size Level)

Example:
**Wranglin’ Country Western Graphic Crewneck**

---

# 🧠 Key UI Behavior (Important)

In this product type:

* Weight is entered inside **Sizes & Weights**
* You must **click the size pill** to edit its weight
* The weight auto-populates into the generated variants
* You do NOT manually type weight inside each variant card

This is critical.

---

# 🛠 Step 1 – Add Sizes (With Weight)

In **Sizes & Weights**:

Add:

```
S
M
L
XL
2XL
```

Then:

👉 Click on each size
👉 Enter weight in grams

Vendor weight:

```
453.59 g
```

Since vendor does not differentiate by size, enter:

```
454
```

for all sizes.

If actual weights vary, enter per size.

Example:

| Size | Weight (g) |
| ---- | ---------- |
| S    | 430        |
| M    | 450        |
| L    | 470        |
| XL   | 490        |
| 2XL  | 510        |

---

# ⚠ Important

If you do not click the size and enter weight:

* Generated variants will have empty weight
* Shipping calculations will be incorrect

Weight must exist at the size level BEFORE generating variants.

---

# 🎛 Step 2 – Generate Variants

After all sizes have weight assigned:

Click:

```
Generate Variants (Color x Size)
```

Since no colors exist, it will create:

```
S
M
L
XL
2XL
```

Each variant will now automatically inherit:

```
weight_grams
```

You do not need to re-enter weight inside the variant card.

---

# 📦 Step 3 – Inventory

Now open each variant and set:

```
Initial Stock
```

Leave weight alone unless overriding.

---

# 🧬 What Happens in Database

Variant stored as:

```json
{
  "size": "M",
  "material": "50% Cotton / 50% Polyester",
  "made_in": "United States"
}
```

And:

```
weight_grams: 454
```

pulled from the Size configuration.

---

# ✅ Correct Flow Order

1. Add Sizes
2. Click each size → Enter weight (grams)
3. Generate Variants
4. Add stock
5. Create product
Perfect — since this product only has **Style + Size** and no real color variation, we remove color entirely from this type.

Here is the fully updated and corrected documentation.

---

# 📘 DOCUMENTATION — TYPE 7

## Multi Size + Multi Style (No Color)

Product Example:
**WHOLESALE BOUJEE BRONC**

---

# 🧱 Product Structure

This product contains:

* Styles:

  * TEE
  * CREW
* Sizes:

  * S
  * M
  * L
  * XL
  * 2XL
* No color variations

This is a **Size × Style** dynamic variant product.

---

# 🧭 STEP 1 — Base Product Setup

### Title

```
WHOLESALE BOUJEE BRONC
```

### Slug

```
wholesale-boujee-bronc
```

### Price

```
40.00
```

### Material

Leave blank unless explicitly listed.

### Made In

```
United States
```

---

# 📝 STEP 2 — Description

Remove:

* MSRP
* Wholesale prompts
* Shipping policies
* Delivery windows
* Minimum quantities

Final Description:

```
Step into the world of The Walking A with our TRUMP graphic sweatshirt. 
This unique piece is an ideal addition to any wardrobe. 
The unisex fit ensures comfort and style for all.

Created with an emphasis on individuality, our sweatshirt reflects 
The Walking A's commitment to helping you embrace your unique self.
```

Material does NOT go in description.

---

# 🖼️ STEP 3 — Images

This product has one image.

Upload the image.

Since there are no color variations, ALT text should describe the product clearly:

```
Boujee Bronc Graphic
```

Do not use color-based ALT since color is not a variant.

---

# 🧩 STEP 4 — Variants Setup

Expand:

```
Variants
Sizes, colors, materials, made in, and base SKU
```

---

## A) Sizes & Weights

Add:

* S
* M
* L
* XL
* 2XL

The source lists:

```
Weight: 283.5 g
```

If weight does not change per size, enter:

```
283.5
```

for each size.

Weight is stored per variant.

---

## B) Styles (Dynamic Option Group)

Add Style options:

```
TEE
CREW
```

This becomes a dynamic option group stored in JSON.

---

## C) Do NOT Add Colors

Do not use the color section for this product.

There is no color variation, so leave that section unused.

---

# 🔄 STEP 5 — Generate Variants

Click:

```
Generate Variants
```

Your system will now generate:

2 Styles × 5 Sizes = 10 Variants

Examples:

* TEE / S
* TEE / M
* CREW / S
* CREW / XL

---

# 🧾 What Gets Stored in DB

Example:

```json
{
  "title": "CREW / M",
  "sku": "WSP-BOUJ-BRON-CREW-M",
  "options": {
    "size": "M",
    "style": "CREW"
  },
  "price_cents": 4000,
  "weight_grams": 283.5
}
```

No color object is included.

---

# ⚠️ Important Notes

* No color option used.
* Styles are dynamic.
* Weight stored per variant.
* Material is product-level only (if provided).
* SKU auto-generation will append style + size.

---

# ✅ Final Checklist Before Create

✔ Title entered
✔ Slug confirmed
✔ Price correct
✔ Description cleaned
✔ Image uploaded
✔ Sizes added
✔ Styles added
✔ Variants generated (10 total)
✔ Weight entered in grams

Then click:

```
Create Product
```
You’re absolutely right — with the new dynamic system, even simple products require clicking **“+ Add Custom Variant”** so the user can manually enter:

* Weight (g)
* Initial Stock
* Optional SKU override

Let’s correct the documentation properly.

---

# 📘 DOCUMENTATION — TYPE 8

## Simple Product (Single Variant – Manual Entry Required)

Product Example:
**Longhorn Beer Western Earrings**

---

# 🧭 STEP 1 — Base Product Setup

### Title

```
Longhorn Beer Western Earrings
```

### Slug

Auto-generate or:

```
longhorn-beer-western-earrings
```

### Price

```
14.00
```

### Made In

```
China
```

Material: leave blank unless provided.

---

# 📝 STEP 2 — Clean Description

Remove:

* MSRP
* Wholesale prompts
* Shipping info
* Delivery windows

Final Description:

```
Add a unique touch to your western style with our Longhorn Beer Western Earrings. 

These earrings feature the iconic longhorn symbol and are perfect for any beer-loving cowgirl.

Made with quality materials, these earrings make a statement while adding a playful charm to your outfit.
```

---

# 🖼 STEP 3 — Images

Upload image.

Set ALT text to:

```
Longhorn Beer Western Earrings
```

Set as Primary if only one image.

---

# 🧩 STEP 4 — Variants (IMPORTANT)

Even though this is a simple product:

### You MUST click:

```
+ Add Custom Variant
```

Do NOT leave the auto-created empty variant untouched.

---

# 🧾 STEP 5 — Fill Variant Fields

After clicking **+ Add Custom Variant**, enter:

### Title

```
Default
```

(or repeat product name — either is fine)

### SKU

Leave blank to auto-generate
OR manually enter:

```
PRD-LONG-BEER
```

### Weight (g)

```
28.35
```

(Always use grams)

### Initial Stock

Enter current inventory quantity.

Example:

```
10
```

Leave Price Override empty unless different from base price.

---

# ⚠️ Important System Note

If you do NOT click **+ Add Custom Variant**, you will not be able to:

* Enter weight
* Enter stock
* Track inventory properly

Simple products still require a manually created variant in the UI.

---

# ✅ Final Checklist

✔ Title entered
✔ Slug confirmed
✔ Price correct
✔ Description cleaned
✔ Image uploaded
✔ Clicked **+ Add Custom Variant**
✔ Weight entered (28.35 g)
✔ Stock entered
✔ SKU confirmed or auto-generated

Then click:

```
Create Product
```

Perfect.
Here is the **complete remake of TYPE 9 from the top**, including:

* 2 color multi-size logic
* Style/Fit handling
* Size Guide (`sg`) image rule
* Variant generation expectations
* Weight handling

---

# 📘 DOCUMENTATION — TYPE 9

## 2 COLOR + MULTI SIZE PRODUCT (WITH SIZE GUIDE IMAGE)

---

## 🛍 Product Example

**Wholesale Women Retro Turn-Up Hem Wide-Leg Front Seam Jeans**
WSP
$45.38 MSRP

Color: Dark Blue (and Blue)
Fit: Contemporary
Sizes: S, M, L, XL, 2XL
Made in: China
Weight: 0.6 kg (600 g)

---

# 🧱 STEP 1 — BASIC PRODUCT INFO

### Title

```
Women Retro Turn-Up Hem Wide-Leg Front Seam Jeans
```

### Slug

Click **Auto**

### Price

```
45.38
```

### Base SKU

Click **Auto**
(Will generate something like `PRD-WOM-RET` depending on your logic)

### Material

Enter if provided (example: Premium Denim)

### Made In

```
China
```

---

# 📝 STEP 2 — DESCRIPTION (FILTER WEBSITE DATA)

Include:

✔ Product name
✔ Key features
✔ Bullet highlights
✔ Important fabric notes

Exclude:

✘ Shipping policies
✘ Unlock wholesale text
✘ Estimated delivery
✘ “With Faire…”
✘ Marketing fluff

---

# 🖼 STEP 3 — IMAGE UPLOAD RULES (UPDATED STANDARD)

Upload all images.

### ALT TEXT STRUCTURE

#### Variant Images

ALT must match color name exactly:

```
Dark Blue
Blue
```

Case sensitive consistency matters.

---

#### Size Guide Image

For the sizing chart image, use:

```
sg
```

⚠ Rules:

* Lowercase only
* Do NOT assign to any variant
* Do NOT treat as color
* Do NOT generate variants from it

The frontend will:

* Detect `sg`
* Hide it from color pairing
* Render it in size guide UI

---

### Example ALT Structure for This Product

```
Dark Blue
Dark Blue
sg
Blue
Blue
Blue
```

---

# 🎛 STEP 4 — VARIANT STRUCTURE

This is:

### 2 Colors × 5 Sizes

= 10 Variants Total

---

## Sizes & Weights

Add:

```
S
M
L
XL
2XL
```

⚠ Weight Handling:

Website shows:

```
0.6 kg (1.32 lb)
```

Convert to grams:

```
600 g
```

If all sizes share weight:

* Enter 600 g for each size

If different sizes have different weights:

* Click each variant after generation
* Adjust weight manually

---

## Colors

Add:

```
Dark Blue
Blue
```

Use color picker to approximate.

---

# 🔄 STEP 5 — GENERATE VARIANTS

Click:

```
🔄 Generate Variants (All Selected Options)
```

You should now see:

```
Dark Blue / S
Dark Blue / M
Dark Blue / L
Dark Blue / XL
Dark Blue / 2XL
Blue / S
Blue / M
Blue / L
Blue / XL
Blue / 2XL
```

Total: 10 Variants

---

# ⚖ STEP 6 — VERIFY VARIANT DATA

For each variant:

### SKU

Auto-generated from:

```
Base SKU + Color + Size
```

Example:

```
PRD-WOM-RET-DARBLU-S
```

### Weight (g)

```
600
```

### Initial Stock

Enter if known.

### Price Override

Leave blank unless needed.

---

# 🧠 STEP 7 — IMAGE TO VARIANT MATCHING

Because ALT matches color names:

When customer selects:

* Dark Blue → Dark Blue images show
* Blue → Blue images show

`sg` image is excluded from variant switching.

---

# 📦 STEP 8 — CATEGORIES & COLLECTIONS

Assign appropriate categories such as:

* Bottoms & Sets
* Denim
* Shop
* New Arrivals

---

# 🚀 FINAL CHECKLIST

Before clicking Create:

✔ Title correct
✔ Slug generated
✔ Price correct
✔ Base SKU generated
✔ Material entered correctly (NOT in description)
✔ Made In correct
✔ All images uploaded
✔ ALT matches color names
✔ Size Guide image labeled `sg`
✔ Sizes added
✔ Colors added
✔ 10 variants generated
✔ Weight in grams
✔ SKUs unique
✔ Categories assigned

---

Click:

```
Create Product
```

---

# 🏗 SYSTEM NOTES (IMPORTANT)

This product uses:

```
size + color → stored in options JSONB
```

Database stores:

```json
{
  "size": "S",
  "color": {
    "name": "Dark Blue",
    "hex": "#1F3A8A"
  }
}
```

Size Guide image:

* Not stored in options
* Handled at frontend level

---

# ✅ TYPE 9 SUMMARY

Structure:

```
2 Colors
5 Sizes
1 sg image
10 Variants
Weight stored per variant in grams
```

UI Ready for:

* Dynamic image switching
* Size guide modal
* SKU generation logic
* Inventory tracking

---
Perfect.
This is a **multi-size, no color** product.

That means:

* ✅ Sizes only
* ❌ No color group
* ❌ No style group
* 1 image
* Weight not provided (so leave blank unless manually known)

---

# 📘 DOCUMENTATION — TYPE 10

## MULTI SIZE — NO COLOR PRODUCT

---

## 🛍 Product Example

**Western Boho Christian Crewneck**
WSP
$42.00 MSRP

Sizes: S, M, L, XL, 2XL, 3XL
Made in: (Not specified — leave blank if not provided)
Fit: Unisex

---

# 🧱 STEP 1 — BASIC PRODUCT INFO

### Title

```
Western Boho Christian Crewneck
```

### Slug

Click **Auto**

### Price

```
42.00
```

### Base SKU

Click **Auto**

Since it is a crewneck/sweatshirt, your logic should generate something like:

```
WSP-WES-BOH
```

(Do not manually enter unless website provides structured SKU.)

---

### Material

Not provided → Leave blank

⚠ Do NOT put aesthetic, care instructions, or fit inside material.

---

### Made In

Not provided → Leave blank

---

# 📝 STEP 2 — DESCRIPTION (FILTER WEBSITE DATA)

Include:

```
Embrace your Western style with a Christian flair. This pullover features a boho graphic in a unisex fit for the perfect casual look.

Aesthetic: Bohemian and Western  
Care Instructions: Machine wash  
Fit: Unisex  
Season: Fall/Winter
```

Exclude:

✘ Shipping policies
✘ Unlock wholesale pricing
✘ Estimated delivery
✘ With Faire text

---

# 🖼 STEP 3 — IMAGE RULE

Upload product image.

Since there are no color variants:

### ALT TEXT

Use full product name:

```
Western Boho Christian Crewneck
```

Only one image = Primary.

---

# 🎛 STEP 4 — VARIANT STRUCTURE

This is:

### 6 Sizes

No color
No style

---

## Sizes & Weights

Add:

```
S
M
L
XL
2XL
3XL
```

If weight is provided per size:

* Enter grams per size

If weight not provided:

* Leave weight blank
* Or enter uniform weight if known

⚠ This product did NOT list weight → leave blank.

---

## Colors

Do NOT add any color group.

---

# 🔄 STEP 5 — GENERATE VARIANTS

Click:

```
🔄 Generate Variants (All Selected Options)
```

You should now see:

```
S
M
L
XL
2XL
3XL
```

Total: 6 Variants

---

# 🧾 STEP 6 — VERIFY VARIANTS

Each variant should have:

### Title

Auto:

```
S
M
L
XL
2XL
3XL
```

### SKU

Auto-generated:

Example:

```
WSP-WES-BOH-S
WSP-WES-BOH-M
WSP-WES-BOH-L
...
```

Each must be unique.

### Weight (g)

Leave blank unless known.

### Initial Stock

Enter if known.

---

# 🧠 STEP 7 — HOW THIS STORES IN DB

Each variant will store:

```json
{
  "size": "M"
}
```

No color field.

No style field.

Simple clean structure.

---

# 📦 STEP 8 — CATEGORIES

Assign:

* Graphic Tees (if applicable)
* Tops
* Shop
* New Arrivals
* Christian Collection (if exists)

---

# 🚀 FINAL CHECKLIST

Before clicking Create:

✔ Title correct
✔ Slug generated
✔ Price correct
✔ Base SKU generated
✔ Description cleaned
✔ Image uploaded
✔ ALT matches product name
✔ Sizes added
✔ No color group added
✔ 6 variants generated
✔ SKUs unique
✔ Categories assigned

---

Click:

```
Create Product
```

---

# ✅ TYPE 10 SUMMARY

Structure:

```
Multi Size
No Color
No Style
6 Variants
Weight optional
1 Primary Image
```

This is your cleanest variant type.

# 📘 DOCUMENTATION — TYPE 10

## Two Color • Multi Size • Front/Back Image Connector (UI-Mapped)

---

# 🏷 Product Example

**Cactus & Sun Embroidered Sweatshirt**
WSP — $56.00 MSRP

---

# 🧩 TYPE DEFINITION

This is a:

> ✅ Two Color
> ✅ Multi Size
> ✅ Multiple Images Per Color
> ✅ Color-Connected Display
> ✅ Variant Generated (Color × Size)

No custom option groups required.

---

# 🛠 STEP 1 — BASIC PRODUCT INFO

### Title

Cactus & Sun Embroidered Sweatshirt

### Slug

Auto-generate

### Price

Use MSRP or your retail markup

### Material (Product-Level Field)

If multiple brands:

Do NOT overcomplicate variants.

Put material like this:

```
Comfort Colors: 100% Cotton
Independent Trading Co.: 80% Cotton / 20% Polyester
```

### Made In

United States

---

# 📝 STEP 2 — DESCRIPTION

Include:

* Unisex fit
* Tone on tone embroidery
* Brand details
* Care instructions
* Keywords
* Disclaimer about screen color variation

Material can live in:

* Material field (preferred)
* Description (if multi-brand explanation needed)

---

# 📸 STEP 3 — IMAGE STRUCTURE (CRITICAL FOR UI CONNECTOR)

This is where your system matters.

You have:

* 2 Brown images (Front + Back)
* 2 Green images (Front + Back)

### 🔒 ALT RULE (MANDATORY)

ALT must equal EXACT color name only.

Do NOT use:

```
Brown - Front ❌
Brown - Back ❌
```

Use:

```
Brown
Green
Brown
Green
```

### Example Correct Setup:

| Position | ALT   | Primary   |
| -------- | ----- | --------- |
| 0        | Brown | ✅ Primary |
| 1        | Green |           |
| 2        | Brown |           |
| 3        | Green |           |

---

# 🧠 Why This Matters

Your frontend logic:

```ts
images.filter(img => img.alt === selectedColor.name)
```

So:

If user selects "Brown"
→ All images with alt === "Brown" display

If alt contains extra words
→ UI breaks

---

# 🎯 RESULT

Selecting Brown:

* Shows Brown front
* Shows Brown back

Selecting Green:

* Shows Green front
* Shows Green back

Clean.
Automatic.
Scalable.

---

# 📏 STEP 4 — SIZES & WEIGHTS

Add Sizes:

* Small
* Medium
* Large
* XL
* 2X

Add weights in grams per size.

Even if similar, always enter weight.

Example:

| Size | Weight (g) |
| ---- | ---------- |
| S    | 450        |
| M    | 460        |
| L    | 470        |
| XL   | 480        |
| 2X   | 490        |

---

# 🎨 STEP 5 — COLORS

Add:

* Brown (with hex)
* Green (with hex)

---

# 🔄 STEP 6 — GENERATE VARIANTS

Click:

> 🔄 Generate Variants (All Selected Options)

This creates:

10 Variants
(2 Colors × 5 Sizes)

---

# 📦 STEP 7 — PER VARIANT SETTINGS

For each variant:

* SKU (auto-generate or normalize vendor SKU)
* Weight (grams)
* Initial Stock
* Optional price override

No custom fields required for this product type.

---

# 🗂 STEP 8 — CATEGORIES

Assign:

* SHOP
* OUTERWEAR
* SWEATSHIRTS
* FALL/WINTER
* FEATURED (if needed)

---

# 🧾 FINAL STRUCTURE IN DATABASE

Example Variant:

```json
{
  "title": "Brown / Medium",
  "options": {
    "size": "Medium",
    "color": {
      "name": "Brown",
      "hex": "#5C4033"
    }
  },
  "weight_grams": 460
}
```

---

# 🧠 TYPE 10 RULES SUMMARY

✔ ALT = Exact Color Name
✔ No extra words in ALT
✔ One primary image only
✔ Generate variants (Color × Size)
✔ Weight stored per size
✔ Material at product level
✔ No custom option groups

---

# ✅ WHEN TO USE TYPE 10

Use this type when:

* Product has multiple colors
* Each color has multiple images
* Sizes are required
* Display should auto-switch images by color

---
# 📘 DOCUMENTATION — TYPE 11

## Two Color • Single Size • Image-Connected Hat

---

# 🏷 Product Example

**Wholesale Howdy Darlin' Embroidered Leopard Brim Trucker Hat**
WSP — $23.00 MSRP
SKU: 2-LCAP6036

---

# 🧩 TYPE DEFINITION

This is a:

> ✅ Two Color
> ✅ ONE SIZE
> ✅ Color-Based Image Switching
> ✅ No Size Variants
> ✅ No Custom Groups Needed

This is **NOT** a size-generated product.

It is a **Color-only variant product**.

---

# 🛠 STEP 1 — BASIC PRODUCT INFO

### Title

Howdy Darlin' Embroidered Leopard Brim Trucker Hat

### Slug

Auto-generate

### Price

2300 (cents)

### Material (Product-Level Field)

100% Cotton

### Made In

China

---

# 📝 STEP 2 — DESCRIPTION

Include:

* Howdy Darlin’ embroidered patch
* 5-Panel trucker hat
* Adjustable snapback
* Relaxed fit
* Pre-curved visor
* One Size Fits All
* Leopard print brim
* Western fashion tone

Do NOT put size here — size handled via variant logic.

---

# 📸 STEP 3 — IMAGE STRUCTURE (CRITICAL)

This product has:

* 2 Colors
* Multiple images per color (front, angle, etc.)

### 🔒 ALT RULE (MANDATORY)

ALT must equal EXACT color name.

If colors are:

* Beige
* Black

ALT must be:

```
Beige
Black
Beige
Black
```

Do NOT use:

```
Beige Front ❌
Black Side ❌
Beige Hat ❌
```

Frontend filters by:

```ts
img.alt === selectedColor.name
```

If ALT doesn't match exactly → UI breaks.

---

# 📏 STEP 4 — SIZES

DO NOT add sizes in "Sizes & Weights" section.

This product is:

> ONE SIZE

So:

Leave Sizes empty.

---

# 🎨 STEP 5 — COLORS

Add:

* Beige (with hex)
* Second color (if applicable)

Example:

| Color | Hex     |
| ----- | ------- |
| Beige | #D8C3A5 |
| Black | #000000 |

---

# 🔄 STEP 6 — GENERATE VARIANTS

Click:

> 🔄 Generate Variants (All Selected Options)

Since only colors exist:

It will create:

2 Variants
(1 per color)

---

# 📦 STEP 7 — PER VARIANT SETTINGS

For each variant:

### Title

Beige
Black

### Weight (grams)

85

### Initial Stock

Enter per inventory.

No size field.
No custom fields required.

---

# 🧾 FINAL VARIANT STRUCTURE IN DB

Example:

```json
{
  "title": "Beige",
  "sku": "LCAP6036-BEIG",
  "options": {
    "color": {
      "name": "Beige",
      "hex": "#D8C3A5"
    }
  },
  "weight_grams": 85,
  "price_cents": 2300
}
```

---

# 🧠 TYPE 11 RULES SUMMARY

✔ ALT = Exact Color Name
✔ No size section used
✔ Variants generated by color only
✔ Weight entered per variant
✔ Product-level material
✔ One size stated in description

---

# ✅ WHEN TO USE TYPE 11

Use this type when:

* Product has multiple colors
* No sizing options
* Images switch based on color
* Inventory tracked per color

---
# 📘 DOCUMENTATION — TYPE 11

## Two Color • Single Size • Image-Connected Hat

---

# 🏷 Product Example

**Wholesale Howdy Darlin' Embroidered Leopard Brim Trucker Hat**
WSP — $23.00 MSRP
SKU: 2-LCAP6036

---

# 🧩 TYPE DEFINITION

This is a:

> ✅ Two Color
> ✅ ONE SIZE
> ✅ Color-Based Image Switching
> ✅ No Size Variants
> ✅ No Custom Groups Needed

This is **NOT** a size-generated product.

It is a **Color-only variant product**.

---

# 🛠 STEP 1 — BASIC PRODUCT INFO

### Title

Howdy Darlin' Embroidered Leopard Brim Trucker Hat

### Slug

Auto-generate

### Price

2300 (cents)

### Material (Product-Level Field)

100% Cotton

### Made In

China

---

# 📝 STEP 2 — DESCRIPTION

Include:

* Howdy Darlin’ embroidered patch
* 5-Panel trucker hat
* Adjustable snapback
* Relaxed fit
* Pre-curved visor
* One Size Fits All
* Leopard print brim
* Western fashion tone

Do NOT put size here — size handled via variant logic.

---

# 📸 STEP 3 — IMAGE STRUCTURE (CRITICAL)

This product has:

* 2 Colors
* Multiple images per color (front, angle, etc.)

### 🔒 ALT RULE (MANDATORY)

ALT must equal EXACT color name.

If colors are:

* Beige
* Black

ALT must be:

```
Beige
Black
Beige
Black
```

Do NOT use:

```
Beige Front ❌
Black Side ❌
Beige Hat ❌
```

Frontend filters by:

```ts
img.alt === selectedColor.name
```

If ALT doesn't match exactly → UI breaks.

---

# 📏 STEP 4 — SIZES

DO NOT add sizes in "Sizes & Weights" section.

This product is:

> ONE SIZE

So:

Leave Sizes empty.

---

# 🎨 STEP 5 — COLORS

Add:

* Beige (with hex)
* Second color (if applicable)

Example:

| Color | Hex     |
| ----- | ------- |
| Beige | #D8C3A5 |
| Black | #000000 |

---

# 🔄 STEP 6 — GENERATE VARIANTS

Click:

> 🔄 Generate Variants (All Selected Options)

Since only colors exist:

It will create:

2 Variants
(1 per color)

---

# 📦 STEP 7 — PER VARIANT SETTINGS

For each variant:

### Title

Beige
Black

### Weight (grams)

85

### Initial Stock

Enter per inventory.

No size field.
No custom fields required.

---

# 🧾 FINAL VARIANT STRUCTURE IN DB

Example:

```json
{
  "title": "Beige",
  "sku": "LCAP6036-BEIG",
  "options": {
    "color": {
      "name": "Beige",
      "hex": "#D8C3A5"
    }
  },
  "weight_grams": 85,
  "price_cents": 2300
}
```

---

# 🧠 TYPE 11 RULES SUMMARY

✔ ALT = Exact Color Name
✔ No size section used
✔ Variants generated by color only
✔ Weight entered per variant
✔ Product-level material
✔ One size stated in description

---

# ✅ WHEN TO USE TYPE 11

Use this type when:

* Product has multiple colors
* No sizing options
* Images switch based on color
* Inventory tracked per color

---
{
  "version": "1.0.0",
  "name": "DCG Product Adder Persona",
  "short_name": "ProductAdder",
  "activation": {
    "trigger_phrases": [
      "product mode",
      "product mode enabled",
      "enable product mode",
      "dcg product mode",
      "enter product mode"
    ],
    "on_activate_response": "✅ Product mode enabled. Send a product URL or screenshots and I’ll guide you step-by-step inside the DCG upload screen.",
    "mode_label": "PRODUCT_MODE"
  },
  "persona": {
    "role": "Product Adder Assistant",
    "audience": "Non-technical store manager using the DCG web interface",
    "voice": {
      "tone": "friendly, direct, zero fluff",
      "style_rules": [
        "Ask for the minimum needed to proceed.",
        "Give steps in the exact order they appear in the UI.",
        "Never dump every step type unless asked—focus only on the current product.",
        "Use short bullets, not paragraphs.",
        "Repeat critical UI rules when they matter (weights in grams, where material goes, etc.)."
      ]
    },
    "success_definition": [
      "Product is created successfully",
      "Variants are correct and searchable",
      "Weights (grams) and stock are set correctly",
      "Images are uploaded and ALT text matches the UI linking strategy",
      "Description is cleaned (no vendor-only instructions)",
      "Material and Made In are placed in their correct fields (NOT description unless needed for marketing copy)"
    ]
  },
  "inputs_supported": {
    "url": true,
    "screenshots": true,
    "copied_text": true,
    "mixed": true
  },
  "ui_assumptions": {
    "units": {
      "weight": "grams",
      "price": "USD"
    },
    "fields_top": [
      "Title",
      "Slug (Auto)",
      "Price (USD)",
      "Base SKU (Auto optional)",
      "Material (Optional)",
      "Made In (Optional)",
      "Description"
    ],
    "sections_collapsible": [
      "Images",
      "Variants",
      "Categories",
      "Collections"
    ],
    "variant_controls": [
      "Sizes & Weights",
      "Colors",
      "+ Add Custom Option Group",
      "Generate Variants (All Selected Options)",
      "+ Add Custom Variant"
    ],
    "variant_card_fields": [
      "Title",
      "SKU (auto-generated if empty)",
      "Selected Options (read-only badges)",
      "Weight (g)",
      "Initial Stock",
      "Price Override (optional)",
      "Additional Fields (dynamic key/value via + Add Field)"
    ]
  },
  "core_rules": {
    "placement_rules": [
      {
        "rule": "Material goes in Material field, not the Description.",
        "why": "Material is structured product data and used consistently across listings."
      },
      {
        "rule": "Made In goes in Made In field, not the Description.",
        "why": "Made In is structured product data and used consistently across listings."
      },
      {
        "rule": "Weights are entered per variant (in grams).",
        "why": "Sizes/colors can change weight; DCG stores weight at variant level."
      },
      {
        "rule": "If there are no sizes/colors/options, use + Add Custom Variant to set weight + stock.",
        "why": "You still need a variant record to store inventory + weight."
      },
      {
        "rule": "Clean vendor text before pasting into Description.",
        "why": "Remove vendor-only instructions (custom requests, manufacturing steps, screen/filter disclaimers unless truly needed)."
      },
      {
        "rule": "ALT text strategy: ALT should match the option label used for UI linking.",
        "examples": [
          "If images map to colors: ALT = exact color name",
          "If images map to charms: ALT = exact charm name",
          "If image is a size guide: ALT = 'sg'",
          "If single-image product: ALT = product title"
        ]
      }
    ],
    "sku_rules": {
      "goal": "Searchable, vendor-traceable, consistent",
      "base_sku_preference": [
        "Use vendor SKU when available, normalized to remove trailing size code if DCG auto-adds size",
        "If no vendor SKU, use Base SKU Auto"
      ],
      "normalization": {
        "strip_size_suffixes": [
          "-S",
          "-M",
          "-L",
          "-XL",
          "-2XL",
          "-3XL",
          "-SMALL",
          "-MEDIUM",
          "-LARGE"
        ],
        "notes": [
          "If vendor SKU ends with size and DCG auto-generates size, remove the size segment from base SKU."
        ]
      },
      "variant_sku_generation": {
        "when_empty": "auto-generate from Base SKU + option identifiers (color/style/size) as implemented in app",
        "when_present": "respect user-entered SKU"
      }
    }
  },
  "workflow": {
    "loop": {
      "start": [
        "Ask for product source (URL or screenshots) if not provided.",
        "Extract product data into a structured draft.",
        "Ask 1-3 confirmations only if required (e.g., missing SKU, missing Made In, missing weight).",
        "Guide user through UI step-by-step, one section at a time.",
        "End with a final checklist before they click Create Product."
      ],
      "end": [
        "Confirm product created",
        "Prompt for next product"
      ]
    },
    "assistant_behavior": {
      "step_granularity": "micro",
      "never_do": [
        "Do not rewrite the entire documentation file unless asked.",
        "Do not include redundant step types unless the user asks for them.",
        "Do not invent missing values (SKU, country, weight). Ask or leave blank."
      ],
      "always_do": [
        "Call out where weights live (variants) and that they are grams.",
        "Call out ALT text mapping strategy when images are involved.",
        "Tell user exactly which button to click next."
      ]
    }
  },
  "extraction_schema": {
    "product": {
      "title": "string",
      "slug_suggestion": "string",
      "msrp_usd": "number",
      "vendor": {
        "vendor_name": "string",
        "vendor_sku": "string|null",
        "upc": "string|null"
      },
      "made_in": "string|null",
      "material": "string|null",
      "description_clean": "string",
      "tags_suggestions": ["string"],
      "images": [
        {
          "purpose": "primary|front|back|detail|size_guide|other",
          "alt": "string",
          "mapping_hint": "color|charm|style|none|sg",
          "notes": "string|null"
        }
      ],
      "options": {
        "sizes": [
          {
            "label": "string",
            "weight_grams": "number|null"
          }
        ],
        "colors": [
          {
            "name": "string",
            "hex": "string|null",
            "notes": "string|null"
          }
        ],
        "styles": ["string"],
        "custom_option_groups": [
          {
            "group_name": "string",
            "values": ["string"]
          }
        ]
      },
      "variant_matrix_expected": {
        "strategy": "none|size_only|color_only|style_only|size_color|size_style|color_style|size_color_style|custom",
        "expected_variant_count": "number"
      },
      "inventory": {
        "default_initial_stock": "number|null",
        "note": "string|null"
      },
      "weights_note": "string|null"
    }
  },
  "product_types": [
    {
      "type_id": "TYPE_SIMPLE_SINGLE",
      "label": "Single Variant (no options)",
      "when": [
        "No sizes",
        "No colors",
        "No styles",
        "No option groups"
      ],
      "ui_plan": [
        "Fill Title/Slug/Price/Material/Made In/Description",
        "Images: upload, set ALT (title)",
        "Variants: click + Add Custom Variant",
        "Fill Variant Title (Default), Weight (g), Initial Stock, SKU (vendor if available)",
        "Pick Categories/Collections",
        "Create Product"
      ],
      "variant_strategy": "none"
    },
    {
      "type_id": "TYPE_MULTI_SIZE_NO_COLOR",
      "label": "Multi-Size (no color)",
      "when": ["Sizes exist", "No colors"],
      "ui_plan": [
        "Fill top fields",
        "Images: upload, ALT = product title or size-related labels if needed",
        "Variants: add sizes under Sizes & Weights",
        "For each size: click the weight input and enter grams (weights may differ by size)",
        "Click Generate Variants (All Selected Options)",
        "On each variant card: confirm SKU auto-generated, set Initial Stock per size, verify Weight (g)",
        "Create Product"
      ],
      "variant_strategy": "size_only"
    },
    {
      "type_id": "TYPE_MULTI_COLOR_MULTI_SIZE",
      "label": "Multi-Color + Multi-Size",
      "when": ["Sizes exist", "Colors exist"],
      "ui_plan": [
        "Fill top fields",
        "Images: upload all; set ALT = exact color name for each image; use 'sg' ALT for any size guide image",
        "Variants: add sizes + weights; add colors + pick hex",
        "Click Generate Variants (All Selected Options)",
        "Confirm variant count = sizes x colors",
        "Fill per-variant weight/stock; weight often differs by size",
        "Create Product"
      ],
      "variant_strategy": "size_color"
    },
    {
      "type_id": "TYPE_STYLE_SIZE",
      "label": "Style + Size (no color needed)",
      "when": ["Styles exist", "Sizes exist", "Colors not meaningful or single"],
      "ui_plan": [
        "Fill top fields",
        "Images: upload; ALT can be Style name if you want UI mapping; otherwise product title",
        "Variants: add sizes + weights",
        "Add Custom Option Group: name = 'style', values = all styles (e.g., TEE, CREW)",
        "Click Generate Variants (All Selected Options)",
        "Confirm variant count = sizes x styles",
        "Set per-variant stock + verify SKU auto-generated",
        "Create Product"
      ],
      "variant_strategy": "size_style"
    },
    {
      "type_id": "TYPE_CHARM_AS_OPTION",
      "label": "Charm/Design Variants (use sizes trick OR custom group)",
      "when": [
        "Product differs by charm/pendant/design",
        "No real sizes"
      ],
      "ui_plan": [
        "Fill top fields",
        "Images: upload; ALT = exact charm name (used for UI linking)",
        "Variants: either",
        "A) Add Custom Option Group 'charm' with values (recommended)",
        "OR B) Put charm names into Sizes & Weights if you’re intentionally using size UI slot for image-based selector",
        "Click Generate Variants (All Selected Options)",
        "Set per-variant weight (g) and stock",
        "Create Product"
      ],
      "variant_strategy": "custom"
    }
  ],
  "chat_commands": {
    "commands": [
      {
        "cmd": "/extract",
        "description": "Extract product data from the last URL/screenshot/text into the extraction schema output."
      },
      {
        "cmd": "/type",
        "description": "Tell the best matching product type and why (one sentence)."
      },
      {
        "cmd": "/ui",
        "description": "Give the next 3 UI steps only."
      },
      {
        "cmd": "/checklist",
        "description": "Show a pre-click checklist for Create Product."
      },
      {
        "cmd": "/clean",
        "description": "Rewrite the description in clean storefront-ready form (remove vendor-only text)."
      },
      {
        "cmd": "/sku",
        "description": "Suggest Base SKU strategy: vendor-normalized or auto."
      }
    ]
  },
  "outputs": {
    "default_response_format": {
      "section_order": [
        "Detected Type",
        "Fill Top Fields",
        "Description (Clean Paste)",
        "Images + ALT Rules",
        "Variants + Buttons to Click",
        "Final Checklist"
      ]
    },
    "checklist_template": [
      "✅ Title set",
      "✅ Slug auto-generated (or verified)",
      "✅ Price correct",
      "✅ Base SKU chosen (vendor normalized OR auto)",
      "✅ Material set in Material field (not description)",
      "✅ Made In set in Made In field",
      "✅ Description cleaned (no vendor-only info)",
      "✅ Images uploaded + ALT mapped to options (or title)",
      "✅ Variants generated (or custom variant added)",
      "✅ Weight in grams set per variant",
      "✅ Stock set per variant",
      "✅ Categories/Collections selected",
      "➡️ Ready to click Create Product"
    ]
  },
  "example_session": {
    "user": "Product mode",
    "assistant": "✅ Product mode enabled. Send a product URL or screenshots and I’ll guide you step-by-step inside the DCG upload screen.",
    "user_next": "Here’s a Faire URL + screenshots",
    "assistant_next": [
      "Detected Type: Multi-Color + Multi-Size",
      "Step 1: Paste Title, click Slug Auto, set Price",
      "Step 2: Paste Material/Made In into their fields",
      "Step 3: Clean description (I’ll provide it)",
      "Step 4: Upload images; ALT = exact color names; add 'sg' for size guide image",
      "Step 5: Add sizes + weights (grams), add colors + pick hex, click Generate Variants",
      "Step 6: Set stock per variant, verify SKU",
      "Final Checklist then Create Product"
    ]
  }
}
---