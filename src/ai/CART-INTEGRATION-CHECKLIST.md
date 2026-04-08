# 🎯 Cart System - Final Integration Steps

## Files to Update

### 1. StorefrontLayout.tsx ✅
**Location:** `components/storefront/StorefrontLayout.tsx`

**Changes:**
- Import `CartProvider`, `CartButton`, `CartDrawer`
- Wrap entire layout with `<CartProvider>`
- Add `<CartButton />` before closing `</div>`
- Add `<CartDrawer />` before closing `</div>`

**File provided:** `StorefrontLayout-UPDATED.tsx`

---

### 2. ProductDetailClient.tsx ✅
**Location:** `app/products/[slug]/_components/ProductDetailClient.tsx`

**Changes:**
- Import `useCart` hook
- Add `isAddingToCart` state
- Create `handleAddToCart` async function
- Update "Add to Cart" button with onClick handler

**File provided:** `ProductDetailClient-CART-INTEGRATION.tsx`

---

## Installation Checklist

### Step 1: Install Cart Context & Components
- [ ] Copy `lib/cart-context.tsx` to your project
- [ ] Create `components/cart/` directory
- [ ] Copy `CartButton.tsx` to `components/cart/`
- [ ] Copy `CartDrawer.tsx` to `components/cart/`
- [ ] Copy `CartItem.tsx` to `components/cart/`
- [ ] Copy `EmptyCart.tsx` to `components/cart/`

### Step 2: Install API Routes
- [ ] Copy `api-cart-route.ts` to `app/api/cart/route.ts`
- [ ] Copy `api-cart-items-route.ts` to `app/api/cart/items/route.ts`
- [ ] Copy `api-cart-items-id-route.ts` to `app/api/cart/items/[id]/route.ts`
- [ ] Copy `api-cart-share-route.ts` to `app/api/cart/share/route.ts`
- [ ] Copy `api-share-cart-token-route.ts` to `app/api/share/cart/[token]/route.ts`

### Step 3: Update Existing Files
- [ ] Replace `StorefrontLayout.tsx` with updated version
- [ ] Update `ProductDetailClient.tsx` with cart integration

### Step 4: Verify Dependencies
Ensure these shadcn/ui components are installed:
- [ ] Sheet
- [ ] Button
- [ ] Input
- [ ] Badge
- [ ] ScrollArea
- [ ] Separator

If missing, install with:
```bash
npx shadcn@latest add sheet
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add badge
npx shadcn@latest add scroll-area
npx shadcn@latest add separator
```

---

## Testing Flow

### Test 1: View Cart (Empty State)
1. Navigate to any product page
2. Cart button should appear bottom-right
3. Click cart button
4. Empty cart state should show

**Expected:**
- ✅ "Your cart is empty" message
- ✅ "Start Shopping" button
- ✅ No errors in console

### Test 2: Add Item to Cart
1. Navigate to product page
2. Select variant options (if applicable)
3. Click "Add to Cart"
4. Button shows "Adding..."
5. Cart drawer opens automatically

**Expected:**
- ✅ Item appears in cart drawer
- ✅ Badge shows "1" on cart button
- ✅ Subtotal calculated correctly
- ✅ Product image, title, variant shown
- ✅ No errors in console

### Test 3: Update Quantity
1. Click +/- buttons in cart drawer
2. Quantity updates
3. Item total updates
4. Subtotal updates

**Expected:**
- ✅ Quantity changes immediately
- ✅ Totals recalculate
- ✅ Badge updates
- ✅ Database updated (verify in Supabase)

### Test 4: Remove Item
1. Click X button on cart item
2. Item removed from cart
3. If last item, show empty state

**Expected:**
- ✅ Item disappears
- ✅ Badge updates
- ✅ Empty state if no items
- ✅ Database updated

### Test 5: Checkout Button
1. Add items to cart
2. Click "Proceed to Checkout"
3. Redirects to /checkout

**Expected:**
- ✅ Drawer closes
- ✅ Redirects to checkout page
- ✅ (Checkout page not built yet, will show 404)

### Test 6: Continue Shopping
1. Open cart drawer
2. Click "Continue Shopping"
3. Drawer closes

**Expected:**
- ✅ Drawer closes smoothly
- ✅ Cart badge still shows count

### Test 7: Cart Persistence
1. Add items to cart
2. Refresh page
3. Cart should still have items

**Expected:**
- ✅ Items persist after refresh
- ✅ Badge shows correct count
- ✅ Session ID maintained

### Test 8: Multiple Items
1. Add multiple different products
2. Add same product with different variants
3. Verify all display correctly

**Expected:**
- ✅ All items shown
- ✅ Correct images/titles/variants
- ✅ Subtotal accurate
- ✅ Can manage each item independently

---

## Debugging Tips

### Cart Not Loading?
- Check browser console for errors
- Verify API routes are in correct locations
- Check Supabase connection
- Verify RLS policies are enabled

### Can't Add to Cart?
- Check product has active variants
- Verify variant has stock (inventory_qty > 0)
- Check API route `/api/cart/items` for errors
- Verify session_id in localStorage

### Cart Button Not Showing?
- Verify StorefrontLayout wrapped with CartProvider
- Check CartButton component import
- Verify z-index not blocked by other elements
- Check console for React errors

### Images Not Showing?
- Cart API needs to fetch product images
- Update GET /api/cart to include image URLs
- Add product_images join to query
- Return first image URL in response

---

## Optional Enhancements

### Add Image URLs to Cart API
Update `app/api/cart/route.ts`:

```typescript
// In the GET handler, update the cart query:
.select(`
  id,
  status,
  cart_items (
    id,
    product_id,
    variant_id,
    quantity,
    price_cents,
    products (
      id,
      title,
      slug,
      product_images (
        object_path,
        bucket_name,
        alt_text,
        position,
        is_primary
      )
    ),
    // ... rest of query
  )
`)

// Then in the formatting logic:
const images = product?.product_images || [];
const primaryImage = images.find((img: any) => img.is_primary) || images[0];
const imageUrl = primaryImage 
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${primaryImage.bucket_name}/${primaryImage.object_path}`
  : null;
```

### Add Toast Notifications
Install sonner:
```bash
npm install sonner
```

In ProductDetailClient:
```typescript
import { toast } from "sonner";

const handleAddToCart = async () => {
  // ...
  try {
    await addItem(selectedVariant.id, 1);
    toast.success('Added to cart!');
  } catch (error) {
    toast.error('Failed to add to cart');
  }
  // ...
};
```

### Add Loading Skeleton
Show skeleton while cart loads initially in CartDrawer.

---

## 🎉 Success Criteria

Your cart system is working when:
- ✅ Cart button visible on all storefront pages
- ✅ Can add items from product pages
- ✅ Cart drawer opens/closes smoothly
- ✅ Items display with images, titles, variants
- ✅ Can adjust quantities
- ✅ Can remove items
- ✅ Subtotal calculates correctly
- ✅ Cart persists on page refresh
- ✅ Badge shows correct count
- ✅ Empty state shows when no items
- ✅ No console errors

---

## Next Steps

After cart is working:
1. Build checkout page (`/checkout`)
2. Add cart sharing UI (modal to generate links)
3. Build shared cart view page (`/share/cart/[token]`)
4. Add cart merge on login (guest → member)
5. Add cart analytics dashboard (admin)

---

**Need Help?**
If you encounter any issues during integration, let me know which test is failing and I can help debug! 🚀
