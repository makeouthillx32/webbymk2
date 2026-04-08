# 🛒 Cart API Routes Installation Guide

## API Routes Created

### Core Cart Operations
1. ✅ `GET /api/cart` - Fetch or create cart
2. ✅ `DELETE /api/cart` - Clear entire cart
3. ✅ `POST /api/cart/items` - Add item to cart
4. ✅ `PATCH /api/cart/items/[id]` - Update item quantity
5. ✅ `DELETE /api/cart/items/[id]` - Remove item from cart

### Cart Sharing
6. ✅ `POST /api/cart/share` - Enable cart sharing
7. ✅ `DELETE /api/cart/share` - Disable cart sharing
8. ✅ `GET /api/share/cart/[token]` - View shared cart

---

## Installation Steps

### Step 1: Create Directory Structure

```bash
mkdir -p app/api/cart/items/[id]
mkdir -p app/api/cart/share
mkdir -p app/api/share/cart/[token]
```

### Step 2: Copy API Route Files

Copy each file to its location:

1. **`api-cart-route.ts`** → `app/api/cart/route.ts`
2. **`api-cart-items-route.ts`** → `app/api/cart/items/route.ts`
3. **`api-cart-items-id-route.ts`** → `app/api/cart/items/[id]/route.ts`
4. **`api-cart-share-route.ts`** → `app/api/cart/share/route.ts`
5. **`api-share-cart-token-route.ts`** → `app/api/share/cart/[token]/route.ts`

---

## File Structure

```
app/
└── api/
    ├── cart/
    │   ├── route.ts              # GET (fetch cart), DELETE (clear cart)
    │   ├── items/
    │   │   ├── route.ts          # POST (add item)
    │   │   └── [id]/
    │   │       └── route.ts      # PATCH (update qty), DELETE (remove item)
    │   └── share/
    │       └── route.ts          # POST (enable), DELETE (disable sharing)
    └── share/
        └── cart/
            └── [token]/
                └── route.ts      # GET (view shared cart)
```

---

## API Documentation

### 1. GET /api/cart
**Fetch current user's cart (or create if doesn't exist)**

**Headers:**
```
x-session-id: <session_id>  // Required for guests
```

**Response:**
```json
{
  "id": "cart-uuid",
  "items": [
    {
      "id": "item-uuid",
      "product_id": "product-uuid",
      "variant_id": "variant-uuid",
      "quantity": 2,
      "price_cents": 4499,
      "product_title": "Retro Aztec Sweatshirt",
      "product_slug": "retro-aztec-sweatshirt",
      "variant_title": "Ash Light Gray / M",
      "variant_sku": "WSP-RET-AZT-ASH-M",
      "options": { "size": "M", "color": {...} }
    }
  ],
  "item_count": 2,
  "subtotal_cents": 8998,
  "share_token": "abc123xyz",
  "share_enabled": true,
  "share_url": "https://desertcowgirl.co/share/cart/abc123xyz"
}
```

---

### 2. POST /api/cart/items
**Add item to cart**

**Headers:**
```
x-session-id: <session_id>
Content-Type: application/json
```

**Body:**
```json
{
  "variant_id": "variant-uuid",
  "quantity": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Item added to cart",
  "item_id": "item-uuid"
}
```

**Validation:**
- Checks stock availability
- Validates quantity (1-99)
- If item exists, adds to existing quantity
- Snapshots current price

---

### 3. PATCH /api/cart/items/[id]
**Update item quantity**

**Headers:**
```
x-session-id: <session_id>
Content-Type: application/json
```

**Body:**
```json
{
  "quantity": 3
}
```

**Response:**
```json
{
  "success": true,
  "message": "Quantity updated"
}
```

**Validation:**
- Checks stock availability
- Validates quantity (1-99)
- Verifies cart ownership

---

### 4. DELETE /api/cart/items/[id]
**Remove item from cart**

**Headers:**
```
x-session-id: <session_id>
```

**Response:**
```json
{
  "success": true,
  "message": "Item removed from cart"
}
```

---

### 5. DELETE /api/cart
**Clear entire cart**

**Headers:**
```
x-session-id: <session_id>
```

**Response:**
```json
{
  "success": true
}
```

---

### 6. POST /api/cart/share
**Enable cart sharing**

**Headers:**
```
x-session-id: <session_id>
Content-Type: application/json
```

**Body:**
```json
{
  "cart_id": "cart-uuid",
  "share_name": "Birthday Wishlist",
  "share_message": "Here are some gift ideas! 🎁",
  "days_valid": 30
}
```

**Response:**
```json
{
  "success": true,
  "share_token": "abc123xyz",
  "share_url": "https://desertcowgirl.co/share/cart/abc123xyz",
  "message": "Cart sharing enabled"
}
```

---

### 7. DELETE /api/cart/share
**Disable cart sharing**

**Headers:**
```
x-session-id: <session_id>
```

**Response:**
```json
{
  "success": true,
  "message": "Cart sharing disabled"
}
```

---

### 8. GET /api/share/cart/[token]
**View shared cart (public access)**

**Headers:**
```
x-session-id: <session_id>  // For analytics tracking
```

**Response:**
```json
{
  "id": "cart-uuid",
  "share_name": "Birthday Wishlist",
  "share_message": "Here are some gift ideas! 🎁",
  "items": [...],
  "item_count": 5,
  "subtotal_cents": 12999,
  "is_shared": true,
  "shared_by_user_id": "user-uuid"
}
```

**Analytics:**
- Tracks view in `shared_cart_views` table
- Records IP, user agent, referrer
- Identifies unique viewers

---

## Security Features

### RLS Policies
✅ Users can only access their own carts
✅ Anyone can view shared carts (if enabled + not expired)
✅ Stock validation on every add/update
✅ Price snapshots prevent price manipulation
✅ Cart ownership verified on all operations

### Guest Sessions
✅ Session ID stored in localStorage
✅ Cart persists across page refreshes
✅ Auto-merge on login (future feature)
✅ 30-day expiration on abandoned carts

### Validation
✅ Stock checks before add/update
✅ Quantity limits (1-99)
✅ Active variant checks
✅ Share link expiration
✅ Ownership verification

---

## Testing the APIs

### Test 1: Add Item to Cart
```bash
curl -X POST http://localhost:3001/api/cart/items \
  -H "Content-Type: application/json" \
  -H "x-session-id: test_session_123" \
  -d '{
    "variant_id": "71c5ddda-a240-4581-88b8-107158da619f",
    "quantity": 1
  }'
```

### Test 2: Get Cart
```bash
curl http://localhost:3001/api/cart \
  -H "x-session-id: test_session_123"
```

### Test 3: Enable Sharing
```bash
curl -X POST http://localhost:3001/api/cart/share \
  -H "Content-Type: application/json" \
  -H "x-session-id: test_session_123" \
  -d '{
    "cart_id": "<cart-id>",
    "share_name": "Test Wishlist",
    "share_message": "Check this out!",
    "days_valid": 30
  }'
```

### Test 4: View Shared Cart
```bash
curl http://localhost:3001/api/share/cart/<token>
```

---

## Error Handling

All routes return consistent error format:

```json
{
  "error": "Error message here"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad request (validation failed)
- `401` - Unauthorized (no session/user)
- `403` - Forbidden (not cart owner)
- `404` - Not found (cart/item doesn't exist)
- `410` - Gone (share link expired)
- `500` - Internal server error

---

## Next Steps

### Frontend Integration
The CartProvider (`lib/cart-context.tsx`) is already set up to call these APIs!

Just install the components:
1. Copy cart components to your project
2. Wrap StorefrontLayout with CartProvider
3. Add CartButton + CartDrawer to layout

### Additional Features to Build
- [ ] Cart merge on login (guest → member)
- [ ] "Copy items to my cart" from shared cart view
- [ ] Share cart modal UI
- [ ] Shared cart view page (`/share/cart/[token]`)
- [ ] Cart analytics dashboard (admin)

---

**Status:** ✅ All API routes ready to use!
**Next:** Install components + test the full flow!
