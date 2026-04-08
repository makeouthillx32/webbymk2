## Guest Contract v1

A guest user must be able to:

* browse the shop (home/landing, collections, categories, product pages)
* search/filter/sort
* add/remove/update cart
* start checkout and complete purchase as guest
* view static pages (About, Terms, Privacy, etc.)

A guest user must NOT be able to:

* view `/profile/*`
* view order history / saved addresses
* access `/dashboard/*` or `/settings/*`

**All member-only pages must redirect cleanly to sign-in with a `next=` param. No "unauthorized" dead-ends.**

---

## Guest Identity Architecture

### What "guest" means in the database

A guest is **not** a `profiles` row. Guests are tracked in the `customers` table, which serves as the stable shopping identity for both guests and members.

| Field | Value for guests |
|---|---|
| `customers.type` | `'guest'` |
| `customers.auth_user_id` | `NULL` |
| `customers.guest_key` | UUID — matches the `dcg_guest_key` cookie |
| `customers.email` | Snapshot from checkout form |
| `customers.claimed_at` | `NULL` until they sign up |

Orders are linked to a guest customer via:
- `orders.customer_id` → `customers.id`
- `orders.guest_key` → mirrors the cookie for fast lookup without a join
- `orders.profile_id` → `NULL` (no auth account)
- `orders.auth_user_id` → `NULL`

### `dcg_guest_key` cookie

Set by `middleware.ts` on the very first request, before any auth logic runs. Lives for 1 year.

```
Name:     dcg_guest_key
Value:    UUID (e.g. ca9dfd57-a440-404e-9804-4b451ade14e1)
HttpOnly: true
SameSite: lax
Secure:   true (production only)
MaxAge:   31,536,000 (1 year)
```

This cookie is the stable identity for the browser session. The same guest can:
- Add to cart, come back the next day, still have their cart
- Place multiple orders — all roll up under the same `customers` row
- Later create an account — `claim_guest_orders()` links everything to their new auth identity

### Checkout flow (guest path)

1. Guest visits → `middleware.ts` sets `dcg_guest_key` cookie
2. Guest completes checkout → `POST /api/checkout/create-payment-intent`
3. API reads `dcg_guest_key` from `request.cookies`
4. Calls `upsert_guest_customer(guest_key, email, ...)` — finds or creates `customers` row
5. Order is inserted with `customer_id` + `guest_key` linked
6. Stripe PI metadata also carries `guest_key` + `customer_id` for support/reconciliation

### "Claim your orders" (future — when guest signs up)

Call `claim_guest_orders(auth_user_id, email, guest_key)` in the auth callback. This:
- Upgrades `customers.type` from `'guest'` to `'member'`
- Sets `customers.auth_user_id`
- Backfills `orders.auth_user_id` for all past guest orders

### Protected route enforcement — single source of truth

`lib/protectedRoutes.ts` is the **only** place protected prefixes are defined. Both `middleware.ts` (server) and `provider.tsx` (client fallback) import from it.

```ts
// lib/protectedRoutes.ts
export const PROTECTED_PREFIXES = ["/profile", "/dashboard", "/settings", "/protected"];
export const AUTH_ROUTES = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"];
export function isProtectedRoute(pathname: string): boolean { ... }
export function isAuthRoute(pathname: string): boolean { ... }
```

To add a new protected route, edit `protectedRoutes.ts` — both layers update automatically.

---

## Guest Test Script (incognito)

Do these in order and tell me the first failure.

### A) Public browsing (must work, no auth prompt)

1. `/` (or `/landing`) loads
2. Navigate to a category page
3. Navigate to a collection page
4. Open 3 different product pages
5. Any "featured/bestsellers" grids load without 401 errors

✅ Pass: no redirect to sign-in, no "unauthorized", no blank content.

### B) Cart (must work, persistent within the session)

6. Add product A to cart
7. Add product B to cart
8. Change quantity
9. Remove product B
10. Refresh page and verify cart still reflects current state

✅ Pass: cart persists through refresh (cookie or local cart id) and renders images/prices.

### C) Checkout as guest (must work end-to-end)

11. Click checkout
12. Enter shipping info + email
13. Proceed to payment step (Stripe)
14. Back out and return to cart (no broken state)
15. Complete test purchase (Stripe test card) **or** stop at payment creation

✅ Pass: guest can reach Stripe checkout/payment intent creation without being forced to sign in.

### C1) Guest identity verification (new — verify after checkout)

After a successful guest checkout, confirm in Supabase:

```sql
-- Should return 1 row with type = 'guest', auth_user_id = null
SELECT id, guest_key, email, type, order_count, auth_user_id
FROM customers
WHERE email = '<checkout email>';

-- Should return the order with customer_id populated
SELECT order_number, status, payment_status, customer_id, guest_key
FROM orders
WHERE email = '<checkout email>'
ORDER BY created_at DESC LIMIT 1;
```

✅ Pass: `customers` row exists, `type = 'guest'`, `auth_user_id = NULL`, order has matching `customer_id` and `guest_key`.

### D) Protected routes (must redirect nicely)

16. Go to `/profile/me`
17. Go to any `/dashboard/*` route you know exists
18. Go to `/settings/*`

✅ Pass: **redirect to** `/sign-in?next=...` (or your sign-in route)
❌ Fail: 401 JSON, "unauthorized" page, or infinite redirect loop.

---

## What I want you to capture (super quick)

For each fail, paste:

* the URL you were on
* what it did (redirect, error message, blank, toast)
* the Network request that failed (usually `/api/*` returning 401/403)

---

## The most common causes (so you know what we're hunting)

* A "public" page is calling an API route that **requires auth** (returns 401)
* Middleware/route group is unintentionally protecting routes that should be public
* Header/mobile drawer is rendering auth-only links and then causing a navigation into protected pages without redirect UX
* Cart/checkout endpoints are requiring auth instead of using guest cart id
* `dcg_guest_key` cookie not being set (check middleware is running on the route)
* `upsert_guest_customer` failing silently — check Vercel logs for `[checkout]` errors

---

## One concrete rule to implement while you test

If a guest hits a protected page, it should always go:

`/sign-in?next=<original-url>`

Not an error screen.

---

When you run the guest test, just reply with:

* **PASS** up to step X
* first failure details (url + what happened + 401/403 request)

…and we'll harden that exact spot first.