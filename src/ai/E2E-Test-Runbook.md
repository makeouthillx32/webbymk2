# DCG End-to-End Test Runbook
**Version:** 1.0 — Member Checkout + Admin Fulfillment  
**Last updated:** February 2026  
**URL:** https://dcg-co.vercel.app

---

## Overview

This runbook covers the full loop:

1. Sign in as Member Man
2. Browse the shop and add items to cart
3. Checkout with a Stripe test card
4. Sign out → sign in as Admin
5. Find the order in the Orders Manager
6. Print the shipping slip
7. Mark the order as fulfilled

Run this in order. Each section has a ✅ pass condition and a 🔴 what to note if it fails.

---

## Stripe Test Cards

Use these at the payment step. All use any future expiry date and any 3-digit CVC.

| Card Number | Result |
|---|---|
| `4242 4242 4242 4242` | ✅ Payment succeeds |
| `4000 0025 0000 3155` | Requires 3D Secure auth |
| `4000 0000 0000 9995` | ❌ Payment declined |

**Recommended for this test:** `4242 4242 4242 4242`  
**Expiry:** any future date (e.g. `12/30`)  
**CVC:** any 3 digits (e.g. `123`)  
**ZIP:** any 5 digits (e.g. `90210`)

---

## Accounts

### Member Man (buyer)
| Field | Value |
|---|---|
| Email | `makeouthillx32@gmail.com` |
| Role | `member` |
| Sign-in URL | https://dcg-co.vercel.app/sign-in |

### Admin (fulfillment)
| Field | Value |
|---|---|
| Email | _(your admin account)_ |
| Role | `admin` |
| Dashboard | https://dcg-co.vercel.app/dashboard/me/Orders |

---

## Phase 1 — Sign In as Member

1. Go to https://dcg-co.vercel.app/sign-in
2. Enter Member Man's email and password
3. Press **Sign In**

✅ **Pass:** Redirected to home or profile. Navigation shows account menu (not Sign In button).  
🔴 **Fail:** Error toast, redirect loop, or Sign In button still showing after login → check Supabase Auth console for the session.

---

## Phase 2 — Add Items to Cart

1. Go to https://dcg-co.vercel.app/shop
2. Click any product that has a variant (size or color)
3. Select a variant (e.g. size **M** or color **Black**)
4. Click **Add to Cart**
5. Verify the cart drawer opens and shows the item
6. Go back to shop, pick a **second product**, add it too

✅ **Pass:** Cart badge shows 2 items (or 2 qty). Both items visible in the drawer with correct titles and prices.  
🔴 **Fail:** "Add to Cart" does nothing, drawer doesn't open, or item count doesn't update → note the product slug and variant selected.

> **Tip:** If you want to test with the golden test products:
> - Howdy Darlin' Hat — any color variant
> - Wranglin' Sweatshirt — size XL

---

## Phase 3 — Checkout

### 3A — Cart Review
1. Click **Proceed to Checkout** in the cart drawer
2. Confirm items and quantities look correct on `/checkout`
3. Click **Continue to Shipping**

✅ **Pass:** Shipping form loads at `/checkout/shipping`.

---

### 3B — Shipping Info
Fill in the shipping form with any real-looking test address:

| Field | Test value |
|---|---|
| First Name | `Test` |
| Last Name | `Member` |
| Email | `makeouthillx32@gmail.com` |
| Address | `123 Rodeo Lane` |
| City | `Austin` |
| State | `TX` |
| ZIP | `78701` |
| Country | `United States` |

1. Select a **shipping method** (any option that appears)
2. Click **Continue to Payment**

✅ **Pass:** Payment page loads at `/checkout/payment`. No redirect back to cart.  
🔴 **Fail:** "No shipping rates available" or page redirects back → note the error message shown.

---

### 3C — Payment
1. In the Stripe payment form, enter:
   - Card number: **`4242 4242 4242 4242`**
   - Expiry: **`12/30`**
   - CVC: **`123`**
   - ZIP: **`90210`**
2. Click **Pay Now**
3. Wait for processing (usually 2–4 seconds)

✅ **Pass:** Redirected to `/checkout/confirmation/[order-id]`. Order number shown (e.g. `DCG-000-...`). 
🔴 **Fail:** "Payment failed" message → try card `4242 4242 4242 4242` again. If stripe shows a different error, note the exact message.

---

### 3D — Confirm the Order
On the confirmation page:

1. Note the **order number** — you'll look it up in the admin in Phase 5
2. Confirm the email shown matches `makeouthillx32@gmail.com`
3. Confirm items listed match what you added

✅ **Pass:** Order number visible, items correct, email correct.

---

## Phase 4 — Sign Out and Sign In as Admin

1. Click your account menu (top right or footer)
2. Click **Sign Out**

✅ **Pass:** Returned to home/shop as guest. Account menu gone.

3. Go to https://dcg-co.vercel.app/sign-in
4. Sign in with your **admin account**

✅ **Pass:** Admin account signed in. Footer or nav shows Dashboard link.

---

## Phase 5 — Find the Order in Orders Manager

1. Go to https://dcg-co.vercel.app/dashboard/me/Orders
2. The order list loads (newest first)
3. Look for the order number from Phase 3D — it should be at or near the top

✅ **Pass:** Order visible in the list with:
- Correct order number
- Email `makeouthillx32@gmail.com`
- Fulfillment badge showing **Unfulfilled** (amber)
- Payment badge showing **PAID** (green)

🔴 **Fail:** Order not in list → check filters. Make sure "All Fulfillment" and "All Payments" are selected. If still missing, go to Supabase → Table Editor → `orders` and search by email.

---

## Phase 6 — Open Order Details

1. Click the order row to open the **Order Details dialog**
2. Verify:
   - Ship To address matches what you entered (Austin, TX)
   - Items listed correctly with SKUs
   - Totals add up
   - Weight section shows oz per item (or "no weight" if variants don't have weight data yet)

✅ **Pass:** Dialog opens, address and items are correct.  
🔴 **Fail:** Dialog opens but address is blank or items missing → note which field is empty.

---

## Phase 7 — Print Shipping Slip (Optional but Recommended)

1. In the Order Details dialog, click **Print Slip**
2. Your browser's print dialog opens
3. You should see a clean shipping slip with:
   - Desert Cowgirl Co. header
   - Ship To address block
   - Package weight (in oz)
   - Packing list with qty, item name, variant, SKU, price
   - Order totals
4. Click **Cancel** — no need to actually print

✅ **Pass:** Print preview shows the slip layout with real order data.  
🔴 **Fail:** Print dialog opens but shows blank page or all content → check browser. Chrome and Safari handle print CSS best.

> **Note:** If items show "Weigh manually" instead of oz — that's expected if the product variants don't have `weight_grams` set yet. Add weights in Products → Variants to fix for real orders.

---

## Phase 8 — Mark as Fulfilled

1. Still in the Order Details dialog, scroll to **Mark Fulfilled**
2. In the **Tracking number** field, enter any fake USPS tracking number:
   ```
   9400111899223397658538
   ```
3. Click **Mark as Fulfilled**
4. Watch for the button to say "Marking fulfilled…" then the green banner:
   > ✅ This order has been fulfilled. `9400111899223397658538`

✅ **Pass:** Green "fulfilled" banner appears. Dialog shows Fulfilled badge.

5. Close the dialog
6. Confirm the order row in the grid now shows **Fulfilled** badge (green) instead of Unfulfilled (amber)

✅ **Pass:** Badge updated in grid without a page reload.  
🔴 **Fail:** Error toast or badge doesn't change → note the error message and check Vercel logs for `[API /orders/[id]/fulfill]`.

---

## Phase 9 — Verify in Supabase (Bonus)

Run these SQL queries in Supabase → SQL Editor to confirm the database side is correct.

### Check the order
```sql
SELECT 
  order_number,
  status,
  payment_status,
  email,
  total_cents,
  tracking_number,
  created_at
FROM orders
WHERE email = 'makeouthillx32@gmail.com'
ORDER BY created_at DESC
LIMIT 5;
```
**Expected:** `status = 'fulfilled'`, `payment_status = 'paid'`, `tracking_number` = what you entered.

---

### Check the fulfillment record
```sql
SELECT 
  f.id,
  f.status,
  f.created_at,
  count(fi.id) as item_count
FROM fulfillments f
JOIN orders o ON o.id = f.order_id
LEFT JOIN fulfillment_items fi ON fi.fulfillment_id = f.id
WHERE o.email = 'makeouthillx32@gmail.com'
GROUP BY f.id, f.status, f.created_at
ORDER BY f.created_at DESC
LIMIT 3;
```
**Expected:** One row with `status = 'fulfilled'` and `item_count >= 1`.

---

### Check tracking
```sql
SELECT 
  ft.tracking_number,
  ft.carrier,
  ft.created_at
FROM fulfillment_tracking ft
JOIN fulfillments f ON f.id = ft.fulfillment_id
JOIN orders o ON o.id = f.order_id
WHERE o.email = 'makeouthillx32@gmail.com'
ORDER BY ft.created_at DESC
LIMIT 3;
```
**Expected:** One row with your fake tracking number.

---

## Phase 10 — Filter Test (Bonus)

Back in the Orders Manager:

1. Set the **Fulfillment** filter dropdown to **Unfulfilled**
2. Confirm the just-fulfilled order is **no longer visible**
3. Set the filter to **Fulfilled**
4. Confirm the order **is now visible**
5. Set the filter back to **All Fulfillment**
6. Type the order number in the **search box**
7. Confirm the order appears and the search clears when you delete the text

✅ **Pass:** All filter + search behaviors work as expected.

---

## Quick Reference — Test Card Cheat Sheet

```
Success:     4242 4242 4242 4242
3D Secure:   4000 0025 0000 3155
Declined:    4000 0000 0000 9995

Expiry: any future date  (12/30)
CVC:    any 3 digits     (123)
ZIP:    any 5 digits     (90210)
```

---

## Quick Reference — Key URLs

| Step | URL |
|---|---|
| Shop | /shop |
| Sign In | /sign-in |
| Cart Checkout | /checkout |
| Shipping | /checkout/shipping |
| Payment | /checkout/payment |
| Orders Manager | /dashboard/me/Orders |

---

## What to Log if Something Fails

Paste these details when reporting a failure:

- **Step number** (e.g. Step 3C)
- **URL** you were on
- **What happened** (error message, blank page, redirect, etc.)
- **Network tab** — any red requests (401, 500) with the path (e.g. `/api/checkout/create-payment-intent`)
- **Console errors** if any (F12 → Console)

The most common failure points are:
- Step 3B: No shipping rates → shipping_rates table may be empty
- Step 3C: Payment declined → wrong card number, not `4242 4242 4242 4242`
- Step 5: Order missing → Stripe webhook may not have fired → check Vercel logs for `[webhook/stripe]`
- Step 8: Fulfill fails → check Vercel runtime logs for the fulfill API route

---

*Desert Cowgirl Co. — Internal Test Runbook*
