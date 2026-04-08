# 🛒 Cart Components Installation Guide

## Files Created

1. ✅ `lib/cart-context.tsx` - CartProvider (React Context)
2. ✅ `components/cart/CartButton.tsx` - Floating cart icon
3. ✅ `components/cart/CartDrawer.tsx` - Slide-out panel
4. ✅ `components/cart/CartItem.tsx` - Individual item component
5. ✅ `components/cart/EmptyCart.tsx` - Empty state

---

## Installation Steps

### Step 1: Create Directory Structure

```bash
mkdir -p lib
mkdir -p components/cart
```

### Step 2: Copy Files

Copy the 5 files to their locations:
- `cart-context.tsx` → `lib/cart-context.tsx`
- `CartButton.tsx` → `components/cart/CartButton.tsx`
- `CartDrawer.tsx` → `components/cart/CartDrawer.tsx`
- `CartItem.tsx` → `components/cart/CartItem.tsx`
- `EmptyCart.tsx` → `components/cart/EmptyCart.tsx`

### Step 3: Update StorefrontLayout

Open `components/storefront/StorefrontLayout.tsx` and wrap it with CartProvider:

```tsx
// components/storefront/StorefrontLayout.tsx
import { CartProvider } from "@/lib/cart-context";
import CartButton from "@/components/cart/CartButton";
import CartDrawer from "@/components/cart/CartDrawer";
import StorefrontHeader from "./StorefrontHeader";
import StorefrontFooter from "./StorefrontFooter";

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="min-h-screen flex flex-col">
        <StorefrontHeader />
        <main className="flex-1">
          {children}
        </main>
        <StorefrontFooter />
        
        {/* Floating Cart Button */}
        <CartButton />
        
        {/* Cart Drawer (overlay) */}
        <CartDrawer />
      </div>
    </CartProvider>
  );
}
```

### Step 4: Update ProductDetailClient "Add to Cart" Button

Open `app/products/[slug]/_components/ProductDetailClient.tsx`:

```tsx
// At the top, import useCart
import { useCart } from "@/lib/cart-context";

// Inside the component
export default function ProductDetailClient({ product }: ProductDetailClientProps) {
  const { addItem } = useCart(); // Add this line
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  
  // ... rest of component
  
  // Update the Add to Cart button handler
  const handleAddToCart = async () => {
    if (!selectedVariant || !inStock) return;
    
    setIsAddingToCart(true);
    try {
      await addItem(selectedVariant.id, 1); // Adds 1 item
      // Cart drawer will open automatically!
    } catch (error) {
      console.error('Failed to add to cart:', error);
      // Optionally show error toast
    } finally {
      setIsAddingToCart(false);
    }
  };
  
  // Update the button
  <Button 
    size="lg" 
    className="flex-1"
    onClick={handleAddToCart}
    disabled={!inStock || isAddingToCart}
  >
    <ShoppingCart className="w-5 h-5 mr-2" />
    {isAddingToCart ? 'Adding...' : 'Add to Cart'}
  </Button>
```

---

## Features

### CartButton (Floating Icon)
- Fixed position bottom-right
- Shows item count badge
- Pulsing animation when items > 0
- Opens drawer on click

### CartDrawer (Overlay)
- Slides in from right
- Scrollable item list
- Subtotal display
- Checkout button
- Continue shopping button
- Empty state

### CartItem
- Product image (clickable to product page)
- Title (clickable to product page)
- Variant details
- SKU display
- Quantity controls (+/- buttons)
- Remove button
- Price per item + total
- Loading states

### EmptyCart
- Centered icon
- Friendly message
- "Start Shopping" CTA

---

## How It Works

1. **User clicks "Add to Cart"** on product page
   - Calls `addItem(variant_id, quantity)`
   - Item added to database via API
   - Cart refreshes automatically
   - Drawer opens to show item

2. **Cart badge updates** 
   - Real-time item count
   - Red badge with number
   - 99+ for large quantities

3. **User clicks cart icon**
   - Drawer slides in from right
   - Shows all cart items
   - Can adjust quantities
   - Can remove items
   - See running subtotal

4. **User clicks "Checkout"**
   - Drawer closes
   - Redirects to `/checkout`
   - Cart data passed to checkout

---

## API Routes Needed (Next Step)

The components are ready but need these API endpoints:

1. **GET /api/cart** - Fetch current cart
2. **POST /api/cart/items** - Add item to cart
3. **PATCH /api/cart/items/[id]** - Update quantity
4. **DELETE /api/cart/items/[id]** - Remove item
5. **DELETE /api/cart** - Clear cart

Would you like me to create these API routes next? 🚀

---

## Styling Notes

- Uses shadcn/ui components (Sheet, Button, Input, etc.)
- Responsive design (full width on mobile, 500px on desktop)
- Smooth animations (slide-in, fade)
- Muted background for footer
- Border separators
- Hover states on items

---

## Testing Checklist

Once API routes are created:

- [ ] Add item to cart from product page
- [ ] Cart badge shows correct count
- [ ] Click cart button opens drawer
- [ ] Items display correctly in drawer
- [ ] Can adjust quantity (+/- buttons)
- [ ] Can remove items
- [ ] Subtotal calculates correctly
- [ ] Empty state shows when no items
- [ ] "Continue Shopping" closes drawer
- [ ] "Checkout" redirects to /checkout
- [ ] Cart persists on page refresh

---

**Status:** ✅ Frontend components ready
**Next:** Create API routes for cart operations
