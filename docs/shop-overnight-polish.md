# Overnight Visual Polish Log: `shop.unenter.live`

Autonomous design and code refinement record for `https://shop.unenter.live`.

---

## Iteration 1: Product Card Image Bounding Box Polish
- **Timestamp**: 2026-09-07 22:50
- **Target Component**: [`src/components/shop/_components/SmartProductImage.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/shop/_components/SmartProductImage.tsx)
- **Problem Observed**:
  - For opaque photos (jeans, cardigans, sweatshirts, slippers), the component was applying `bg-[var(--sidebar)] rounded-lg border border-[var(--border)] p-3` with `aspect-square` and `object-contain`.
  - Non-square rectangular photos were letterboxed inside a rigid square border with dead padding on top/bottom or sides, creating an awkward double-box effect where the box failed to fit the image.
- **Solution Applied**:
  - For transparent cutout items: preserved floating transparent framing with natural drop shadow and `object-contain`.
  - For opaque photos: replaced the padded inner box with clean edge-to-edge container framing (`rounded-xl overflow-hidden bg-muted/20 border border-border/40`) and `object-cover`, eliminating dead padding gaps and letterboxing.
- **Status**: Completed & Verified on dev runtime (`shop-bottom.png`). Opaque photos cleanly fill the rounded cards edge-to-edge; cutouts float with drop shadow.

---

## Iteration 2: Taxonomy Grid, Hot Zone & Fallback Aesthetics
- **Timestamp**: 2026-09-07 23:12
- **Target Component**: [`src/components/shop/sections/CategoriesGridSection.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/shop/sections/CategoriesGridSection.tsx)
- **Problems Observed**:
  - In "Hot Zone", only 1 category ("TOPS") existed, but it rendered a full carousel with `basis-1/3`, leaving an 800px empty void and an orphan arrow button.
  - In "Shop by Category" (3 items), carousel navigation arrows sat directly on top of the first and last card images (`left-2` / `right-2`), blocking text and imagery.
  - "Tank Merch" lacked a cover image in Supabase and rendered as a washed-out, flat light-gray box.
- **Solution Applied**:
  - Added an adaptive layout: grids with $\le 3$ items automatically use a responsive CSS grid (`max-w-xs` for 1 item, 2-col for 2 items, 3-col for 3 items). Single-card sections like "Hot Zone" now center cleanly with zero orphan buttons.
  - Carousels ($>3$ items) now position arrows outside the card frame (`-left-4` / `-right-4`) with backdrop blur.
  - Replaced flat gray missing-image boxes with a dark editorial radial gradient and watermark (`bg-gradient-to-br from-neutral-900 via-neutral-800 to-stone-900`).
  - Standardized all taxonomy cards to `rounded-xl`.
- **Status**: Completed, restarted via UNAXIS IPC, and Verified (`shop-iteration2-verified-crop.png`).

---

## Iteration 3: Promo Card Luxury Redesign, Authentic Vector QR & Marquee Edge Masking
- **Timestamp**: 2026-09-07 23:34
- **Target Components**:
  - [`src/components/shop/_components/top-banner.scss`](file:///Z:/WEBSITES/webbymk2/src/components/shop/_components/top-banner.scss)
  - Supabase `static_pages` (`landing-qr-download`) via REST API
- **Problems Observed**:
  - The App download promo card displayed a literal black box with plain centered text `"QR CODE"` and basic text buttons beside the $30 off promo.
  - The top announcement ticker had harsh cutoff on the right edge during text wrap.
  - `--marquee-duration-ms` was missing from `top-banner.scss`, causing marquee speed to default incorrectly.
- **Solution Applied**:
  - Redesigned `landing-qr-download` static page:
    - Left Card: Modernized with `rounded-2xl`, deep obsidian luxury gradient (`#18181b` to `#09090b`), ambient blur orbs, `"Member Perk"` badge, and micro-animated `"Explore collection →"` link.
    - Right Card: Added `"Mobile Access"` badge, authentic vector QR code viewfinder with corner finder marks, animated scan beam pulse, and interactive `"Join the waitlist"` pill button.
  - Updated `top-banner.scss` to support `var(--marquee-duration-ms)` and added dual-edge CSS mask gradients (`linear-gradient(to right, transparent 0, black 28px, black calc(100% - 28px), transparent 100%)`) for soft, luxurious banner edge fade.
- **Status**: Completed, patched DB, restarted dev container via UNAXIS IPC, and Verified (`promo-loaded-crop.png` & `banner-loaded-crop.png`).

---

## Iteration 4: Cookie Consent Floating Glassmorphism & Micro-Typography
- **Timestamp**: 2026-09-08 00:03
- **Target Component**: [`src/components/CookieConsent.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/CookieConsent.tsx)
- **Problems Observed**:
  - The default cookie banner rendered an opaque, heavy rectangular white card with generic card headers and large padding, dominating the lower-left corner and blocking the shop's editorial visuals.
- **Solution Applied**:
  - Transformed the container into a modern floating glassmorphism widget (`rounded-2xl border border-border/60 bg-background/90 backdrop-blur-md shadow-2xl p-4`).
  - Added a dedicated cookie pill badge with crisp micro-typography.
  - Streamlined the action buttons into compact `rounded-xl h-8 text-xs font-semibold` controls with clear visual hierarchy (`Accept All` primary solid, `Decline` subtle outline, `Customize` ghost).
- **Status**: Completed, rebuilt dev container via UNAXIS IPC, and Verified (`cookie-banner-crop.png`).

---

## Iteration 5: Hero CTA Overlay Typography, Pill Styling & Skeleton Alignments
- **Timestamp**: 2026-09-08 00:25
- **Target Components**:
  - [`src/components/shop/_components/HeroSlideOverlay.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/shop/_components/HeroSlideOverlay.tsx)
  - [`src/components/shop/_components/LandingSkeleton.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/shop/_components/LandingSkeleton.tsx)
- **Problems Observed**:
  - Hero CTA text style lacked visual refinement; pill buttons didn't match the modern `rounded-xl` design language applied across the storefront.
  - Skeletons in `LandingSkeleton.tsx` still used old `rounded-lg` and `aspect-[3/4]`, causing visual layout shift on product card render.
- **Solution Applied**:
  - Standardized Hero CTA pill buttons to `rounded-xl` with micro-hover elevation (`hover:-translate-y-0.5`).
  - Elevated text CTAs with uppercase editorial letter-spacing (`tracking-wider` / `hover:tracking-widest`) and a crisp `border-b-2 border-current pb-0.5` bottom accent line.
  - Aligned all `LandingSkeleton` square and product card skeletons to `aspect-square rounded-xl border border-border/40`, perfectly mirroring `SmartProductImage.tsx`.
- **Status**: Completed, restarted via UNAXIS IPC, and Verified on desktop (`shop-desktop-v2.png`).

---

## Iteration 6: Device-Aware Hero Slides & Mobile Viewport Polish
- **Timestamp**: 2026-09-08 00:48
- **Target Components**:
  - [`src/components/shop/_components/Herocarousel.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/shop/_components/Herocarousel.tsx)
  - [`src/components/shop/_components/useHeroSlides.ts`](file:///Z:/WEBSITES/webbymk2/src/components/shop/_components/useHeroSlides.ts)
  - [`src/app/api/landing/hero-slides/route.ts`](file:///Z:/WEBSITES/webbymk2/src/app/api/landing/hero-slides/route.ts)
  - [`src/components/theme/_components/button.scss`](file:///Z:/WEBSITES/webbymk2/src/components/theme/_components/button.scss)
  - [`src/components/CookieConsent.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/CookieConsent.tsx)
- **Problems Observed (Audit via Mobile Viewport 390x844)**:
  - On mobile, `HeroCarousel` previously rendered desktop widescreen (25/9) banners inside a 75/98 portrait container, horizontally cropping off 72% of the artwork and cutting off headlines.
  - The database already had a dedicated mobile portrait slide (`slide-mobile-1788663256144.png`) explicitly marked with `target_device: 'mobile'`, but the front-end carousel ignored `target_device`.
  - On mobile, the floating accessibility button overlapped the cookie consent card text and buttons due to high `z-index: 100`.
- **Solution Applied**:
  - Wired `target_device` through `hero-slides` API route, `useHeroSlides` hook, and `HeroCarousel`.
  - Added device-aware slide filtering: mobile displays dedicated `mobile` or `all` slides (e.g. the 75/98 portrait slide); desktop displays `desktop` or `all` slides. Carousel indicators cleanly adapt (1 dot on mobile, 2 on desktop).
  - Adjusted accessibility button `z-index: 30` (below system banners at `z-50`) so `CookieConsent` sits cleanly on top without overlapping controls.
  - Polished `CookieConsent` wrapper positioning on mobile (`bottom-3 left-3 right-3 sm:left-4 sm:bottom-4 w-auto sm:max-w-md`) with tighter padding (`p-3.5 sm:p-4`) and zero double-margin overflow.
- **Status**: Completed, dev container rebuilt and restarted via UNAXIS IPC, and Verified on both desktop (`shop-desktop-v2.png`) and mobile (`shop-mobile-v3.png`).

---

## Iteration 7: Header Cart Integration & Snapshot Automation
- **Timestamp**: 2026-09-08 01:05
- **Target Components**:
  - [`src/components/Layouts/shop/Header.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/Layouts/shop/Header.tsx)
  - [`src/components/Layouts/overlays/cart/CartButton.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/Layouts/overlays/cart/CartButton.tsx)
  - [`scripts/capture-shop-snapshot.ts`](file:///Z:/WEBSITES/webbymk2/scripts/capture-shop-snapshot.ts)
- **Problems Observed**:
  - Storefront navigation lacked a primary cart action in the desktop/mobile header bar, relying solely on an intrusive floating bottom cart button (`CartButton.tsx`) even when the cart had 0 items.
  - Headless Playwright full-page screenshots missed lazy-loaded below-the-fold elements due to IntersectionObserver hydration boundaries.
- **Solution Applied**:
  - Integrated `ShoppingBag` trigger with dynamic pill item count badge (`bg-primary text-primary-foreground`) into `Header.tsx` action bar alongside Dark Mode and User Account.
  - Suppressed floating cart card when empty (`itemCount === 0`) in `CartButton.tsx` to keep viewport clean and uncluttered.
  - Upgraded snapshot automation in `scripts/capture-shop-snapshot.ts` with deep viewport height (3800px) and Edge headless runtime targeting `https://dev.shop.unenter.live`.
- **Status**: Completed, restarted via UNAXIS IPC, and Verified on desktop (`shop-desktop-latest.png`) and mobile (`shop-mobile-latest.png`).

---

## Iteration 8: AVIF Sharp Transcoding Artifact Elimination & Fallback Watermark Harmonization
- **Timestamp**: 2026-09-08 01:21
- **Target Components**:
  - [`src/components/shop/_components/SmartProductImage.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/shop/_components/SmartProductImage.tsx)
  - [`src/components/shop/sections/CategoriesGridSection.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/shop/sections/CategoriesGridSection.tsx)
  - [`scripts/capture-shop-snapshot.ts`](file:///Z:/WEBSITES/webbymk2/scripts/capture-shop-snapshot.ts)
- **Problems Observed**:
  - "Mens Ripples With Raisin Hell Sole" in "Curated for you" displayed severe rainbow static noise distortion. Root cause: Next.js internal `sharp` transcoder failed when re-encoding certain AVIF files with restricted ICC (`rICC`) profiles from Supabase.
  - The fallback background watermark in "Tank Merch" (`CategoriesGridSection`) collided with the bottom-left text slots (`Tank Merch` headline and `SHOP NOW →` CTA).
  - Snapshot timeouts were triggering before full client hydration under cold dev compilation.
- **Solution Applied**:
  - In `SmartProductImage.tsx`: Automatically pass `unoptimized={true}` to Next.js `<Image />` whenever the source is an AVIF or an already-transformed Supabase edge URL. This bypasses redundant server-side CPU transcode, preserving authentic pixel-perfect footwear imagery.
  - In `CategoriesGridSection.tsx`: Centered and dialed back the fallback category name watermark (`text-4xl sm:text-5xl font-black text-white/[0.03]`), preventing collisions with foreground headline slots.
  - In `scripts/capture-shop-snapshot.ts`: Increased hydration timeouts (9s desktop, 5s mobile) to ensure async data always settles before taking snapshots.
- **Status**: Completed, dev container hot-reloaded and verified (`shop-desktop-latest.png`). The rainbow noise is completely gone, revealing the genuine cowboy boots photo, and the taxonomy watermark is beautifully harmonized.

---

## Iteration 9: Dev Indicator UI Overlap Elimination & Top Marquee Edge Masking
- **Timestamp**: 2026-09-08 01:34
- **Target Components**:
  - [`next.config.js`](file:///Z:/WEBSITES/webbymk2/next.config.js)
  - [`src/components/shop/_components/top-banner.scss`](file:///Z:/WEBSITES/webbymk2/src/components/shop/_components/top-banner.scss)
- **Problems Observed**:
  - The Next.js 15 Turbopack dev indicator button (circular "N" overlay with `z-index: 9999`) was rendering at the bottom-left corner of the viewport, directly colliding with and covering the "Decline" button on the mobile cookie consent card.
  - The top marquee ticker had legacy `::before` and `::after` cap borders (`1px solid var(--cap-border)`) creating arbitrary vertical border lines that sliced through the ticker text during scroll.
- **Solution Applied**:
  - Configured `devIndicators: false` in `next.config.js`, completely suppressing the intrusive dev indicator overlay from live dev renders and automated captures.
  - In `top-banner.scss`: Removed legacy pseudo-element end-cap borders. Replaced them with pure CSS dual-edge alpha masks (`mask-image: linear-gradient(to right, transparent 0, black 36px, black calc(100% - 36px), transparent 100%)`) and increased vertical breathing room (`min-height: 38px`, `padding: 0.625rem 1.25rem`).
- **Status**: Completed, dev container cleanly restarted via UNAXIS IPC, and Verified on desktop (`shop-desktop-latest.png`) and mobile (`shop-mobile-latest.png`). The Decline button is 100% unobstructed, and the marquee text glides smoothly across the top of the storefront with zero vertical bars.

---

## Iteration 10: Dev Container Dynamic Route Resolution & Circular Module Overlay Fix
- **Timestamp**: 2026-09-08 02:00
- **Target Components**:
  - [`src/ink/dev-container.ts`](file:///Z:/WEBSITES/webbymk2/src/ink/dev-container.ts)
  - `dist/cli.js` (UNAXIS TUI bundle via `bun --cwd src/ink build.ts`)
- **Problems Observed**:
  - Category pages (`/tops`, `/bottoms`) and Product Detail Pages (`/products/[slug]`) hung indefinitely or threw 502/timeout in the dev container.
  - Root Cause: `devOverlayCommand` in `dev-container.ts` was copying `zones/shop/src/app/*` over the container's `/app/src/app`. `zones/shop/src/app` contained dummy shadow wrappers (`[categorySlug]`, `products`, `collections`) that re-exported from `@/zones/shop/...`, which re-exported from `@/app/.../page`. Because `src/app/...` had been replaced by the shadow wrapper itself, Turbopack hit an infinite circular module resolution loop that froze the compiler.
  - Windows Docker CLI `--env-file` was failing with exit code 125 due to untranslated Linux paths (`/mnt/z/...`).
- **Solution Applied**:
  - In `src/ink/dev-container.ts`:
    - Added `shopExtraDirs = " [categorySlug] products collections shop checkout '(auth-pages)'"` so all real shop core routes are copied into the container.
    - Explicitly filtered out phantom shadow wrappers with `case "$name" in "[categorySlug]"|"products"|"collections") continue ;; esac`.
    - Wrapped `envFile` with `dockerCliHostPath(envFile)` to translate paths to Windows format (`Z:\...`).
  - Rebuilt the UNAXIS TUI binary bundle with `bun --cwd src/ink build.ts`.
- **Status**: Completed, rebuilt UNAXIS, and Verified. All category and PDP routes compile cleanly in seconds (warm render <100ms).

---

## Iteration 11: Category Page Subcategory Chip Modernization & Desktop Nav Skeletons
- **Timestamp**: 2026-09-08 02:20
- **Target Components**:
  - [`src/app/[categorySlug]/_components/CategoryPageClient.tsx`](file:///Z:/WEBSITES/webbymk2/src/app/[categorySlug]/_components/CategoryPageClient.tsx)
  - [`src/components/Layouts/shop/DesktopNav.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/Layouts/shop/DesktopNav.tsx)
- **Problems Observed**:
  - On category pages (e.g. `/tops`), the `SUBCATEGORIES` section rendered a cavernous 4-column rectangular grid (`p-6 border rounded-lg`) containing a single lonely subcategory link, creating a massive awkward void.
  - Product cards on category pages had outdated card styling and didn't use `SmartProductImage`.
  - In `DesktopNav.tsx`, while categories were loading, the header rendered unstyled raw text: `"Loading..."` or `"No navigation available"`.
- **Solution Applied**:
  - In `CategoryPageClient.tsx`:
    - Replaced the bulky 4-column subcategory box with sleek, horizontal interactive filter chips (`rounded-full text-xs font-medium border border-border/70 bg-card/60 backdrop-blur-sm hover:border-primary hover:text-primary transition-all duration-200`) paired with subtle `ChevronRight` micro-icons.
    - Upgraded product cards to use `SmartProductImage` and standardized `rounded-[calc(var(--radius)*3)]` styling with micro-elevation (`hover:-translate-y-0.5 hover:shadow-lg`).
  - In `DesktopNav.tsx`:
    - Replaced raw "Loading..." text with 4 smooth pulsing skeleton pills matching navigation link dimensions, eliminating layout shift during initial load.
- **Status**: Completed and Verified on desktop (`shop-tops-desktop-verified.png`) and mobile (`shop-tops-mobile-verified.png`).

---

## Iteration 12: Supabase Storage AVIF Direct Delivery & Product Detail Image Restoration
- **Timestamp**: 2026-09-08 02:45
- **Target Components**:
  - [`src/lib/images.ts`](file:///Z:/WEBSITES/webbymk2/src/lib/images.ts)
  - [`src/app/products/[slug]/_components/ProductDetailClient.tsx`](file:///Z:/WEBSITES/webbymk2/src/app/products/[slug]/_components/ProductDetailClient.tsx)
- **Problems Observed**:
  - On the Product Detail Page (`/products/mens-ripples-with-raisin-hell-sole`), the main hero photo rendered as a full-screen block of blinding rainbow static pixel noise.
  - Root Cause: Supabase storage's `imgproxy` transcode service (`/storage/v1/render/image/public/...`) corrupts the color profile of certain AVIF images during server-side transformation. The raw source object in `/storage/v1/object/public/...` is a pristine 7.8 KB boot photo, but imgproxy transcoding mangled it into rainbow static.
- **Solution Applied**:
  - In `src/lib/images.ts`:
    - In `supabaseTransformedUrlFromImage`, added an automatic bypass for `.avif` source files (`if (img.object_path.toLowerCase().endsWith(".avif")) return supabasePublicUrlFromImage(img);`). Because AVIF files are already highly compressed (5–15 KB), routing them directly to the public object endpoint completely bypasses `imgproxy` while maintaining optimal bandwidth.
  - In `ProductDetailClient.tsx`:
    - Updated `shouldBypassNextOpt` to check for `.avif` extensions, preventing downstream Next.js sharp transcode bugs.
  - Restarted `dev-shop` via UNAXIS IPC (`ipc(['restart', 'shop'], conn=UNAXIS_DEV)`).
- **Status**: Completed and Verified on desktop (`shop-pdp-desktop-verified.png`). The hero image rendered crisp, authentic cowboy boots with the Tin Haul graphic sole; thumbnails and navigation skeleton pills operate in complete harmony.

---

## Iteration 13: Product Detail Page Mobile & Desktop Visual Polish
- **Timestamp**: 2026-09-08 02:55
- **Target Components**:
  - [`src/app/products/[slug]/_components/ProductDetailClient.tsx`](file:///Z:/WEBSITES/webbymk2/src/app/products/[slug]/_components/ProductDetailClient.tsx)
- **Problems Observed**:
  - On initial page load, `selectedOptions` was initialized to `{}`. Consequently, no size button was highlighted as active (`isSelected === false`), and the stock counter / Add to Cart button lacked clear visual linkage to the selected variant until clicked.
  - The variant size option buttons were styled as plain, basic rectangles (`border rounded-md px-3 py-1.5`) lacking tactile micro-elevation or modern luxury styling.
  - The gallery thumbnails were locked in a rigid `grid grid-cols-6 gap-2` layout, leaving large empty gaps when fewer than 6 images existed and compressing thumbnails on narrow mobile screens.
  - The hero image container used standard `rounded-lg` rather than the platform's standard `rounded-2xl` luxury framing.
- **Solution Applied**:
  - In `ProductDetailClient.tsx`:
    - Initialized `selectedOptions` to pre-select the first in-stock variant (`initialOptions`), so the active size is prominently highlighted with a primary solid pill badge from the moment the page loads.
    - Upgraded option buttons into tactile luxury controls (`min-w-[3rem] h-10 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 shadow-sm`) with clear active elevation (`bg-primary text-primary-foreground border-2 border-primary font-semibold scale-[1.02]`).
    - Redesigned the thumbnail rail with `flex items-center gap-3 overflow-x-auto py-1`, wrapping each thumbnail in a generous `w-16 h-16 sm:w-20 sm:h-20 rounded-xl` frame with active border scaling (`scale-105 shadow-md border-primary`).
    - Standardized the main image container to `rounded-2xl border border-border/60 shadow-sm` and added glassmorphic carousel buttons (`backdrop-blur-sm shadow-md hover:scale-110`).
    - Modernized the Add to Cart bar with standardized `h-12 rounded-xl` action buttons.
  - Deployed to running dev container via `docker cp`.
- **Status**: Completed and Verified on desktop (`shop-pdp-desktop-verified-v2.png`) and mobile (`shop-pdp-mobile-verified-v2.png`). Active size "8" is clearly highlighted, thumbnail navigation is responsive and tactile, and all action buttons adhere to the design system.

---

## Iteration 14: Cart Drawer & Checkout Flow — Crash, Race, and Noise Fixes
- **Timestamp**: 2026-09-08 03:25
- **Target Components**:
  - [`src/zones/shop/checkout/Page.tsx`](file:///Z:/WEBSITES/webbymk2/src/zones/shop/checkout/Page.tsx) → **DELETED** (no longer needed)
  - [`zones/shop/src/app/checkout/page.tsx`](file:///Z:/WEBSITES/webbymk2/zones/shop/src/app/checkout/page.tsx) → **DELETED** (shadow wrapper eliminated)
  - [`src/app/checkout/page.tsx`](file:///Z:/WEBSITES/webbymk2/src/app/checkout/page.tsx)
  - [`src/app/checkout/layout.tsx`](file:///Z:/WEBSITES/webbymk2/src/app/checkout/layout.tsx)
  - [`src/components/Layouts/LayoutBranches.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/Layouts/LayoutBranches.tsx)
  - [`src/components/Layouts/overlays/cart/CartDrawer.tsx`](file:///Z:/WEBSITES/webbymk2/src/components/Layouts/overlays/cart/CartDrawer.tsx)
  - [`src/ink/dev-container.ts`](file:///Z:/WEBSITES/webbymk2/src/ink/dev-container.ts)
- **Problems Observed & Fixed**:

  ### A — Checkout Runtime Crash (`metadata` exported from Client Component)
  - `src/zones/shop/checkout/Page.tsx` was marked `"use client"` but also exported `export const metadata: Metadata`. In Next.js App Router, this throws a hard runtime error: *"Attempted to call metadata() from the server but metadata is on the client"*.
  - **Fix**: Eliminated both the shadow wrapper in `src/zones/shop/checkout/` and the redundant `zones/shop/src/app/checkout/page.tsx`. The canonical checkout at `src/app/checkout/page.tsx` is now the sole source of truth — no re-export chain needed.
  - Moved `export const metadata` and `export const dynamic = "force-dynamic"` to `src/app/checkout/layout.tsx` (a Server Component), keeping the checkout page itself purely a Client Component.
  - Added `"checkout"` to the skip list in `devOverlayCommand` in `src/ink/dev-container.ts` so the dev overlay never overwrites the canonical checkout with a shadow wrapper.

  ### B — Premature Redirect Race Condition (empty cart on fresh page load)
  - `src/app/checkout/page.tsx` contained `useEffect(() => { if (itemCount === 0) router.push('/shop'); }, [itemCount])`. On initial mount, before `/api/cart` returned, `itemCount` was 0 — kicking all visitors back to `/shop` before the cart loaded.
  - **Fix**: Destructured `isLoading` from `useCart()`. Guarded redirect: `if (!isLoading && itemCount === 0) router.push('/shop')`. Added an animated skeleton layout rendered during `isLoading` state. Added `unoptimized` flag for `.avif` cart item images to prevent Next.js image distortions.

  ### C — 401 `/api/research-cart` Error Badge Eliminated
  - `ShopLayout` in `LayoutBranches.tsx` unconditionally mounted `<ResearchCartProvider>`, which triggered unauthenticated 401 calls to `/api/research-cart` on every shop page load, producing a red "1 Issue" dev overlay badge.
  - **Fix**: Scoped `<ResearchCartProvider>` strictly to `IS_LABS_ZONE ? <ResearchCartProvider>{innerContent}</ResearchCartProvider> : innerContent`. The "1 Issue" badge is eliminated on all shop routes.

  ### D — Duplicate Close Icon in Cart Drawer
  - `CartDrawer.tsx` rendered both the default `<Sheet>` close button and a custom X button, resulting in two overlapping close controls in the header.
  - **Fix**: Added `hideCloseButton` prop to `<SheetContent>` to suppress the default Sheet close button, leaving only the custom styled close button.

- **Verification**:
  - Cart drawer captured (desktop + mobile): single clean X close button, correct subtotal, "Proceed to Checkout" routes to `/checkout`.
  - Checkout page captured (desktop + mobile): cart items render with product image, size badge, quantity controls, promo code panel, order summary, and "Continue to Shipping" CTA. No "1 Issue" badge. No premature redirect.
  - Final URL confirmed: `https://dev.shop.unenter.live/checkout` ✓

---

## Summary: All Changes Ready for Shop Rebuild

The following source files were modified/deleted during Iterations 10–14 and are ready to be picked up by `next build` in the shop zone:

| File | Action |
|------|--------|
| `src/app/products/[slug]/_components/ProductDetailClient.tsx` | Modified (Iter 12–13: AVIF bypass, variant pre-select, thumbnail rail, luxury buttons) |
| `src/app/[categorySlug]/_components/CategoryPageClient.tsx` | Modified (Iter 11: subcategory chips, SmartProductImage product cards) |
| `src/components/Layouts/shop/DesktopNav.tsx` | Modified (Iter 11: skeleton loading pills) |
| `src/lib/images.ts` | Modified (Iter 12: AVIF direct-delivery bypass) |
| `src/app/checkout/page.tsx` | Modified (Iter 14: `isLoading` guard, skeleton, `unoptimized` AVIF images) |
| `src/app/checkout/layout.tsx` | Modified (Iter 14: metadata + `force-dynamic` moved here) |
| `src/components/Layouts/LayoutBranches.tsx` | Modified (Iter 14: `ResearchCartProvider` scoped to labs zone only) |
| `src/components/Layouts/overlays/cart/CartDrawer.tsx` | Modified (Iter 14: `hideCloseButton` on SheetContent) |
| `src/ink/dev-container.ts` | Modified (Iter 14: `checkout` added to skip list) |
| `src/zones/shop/checkout/Page.tsx` | **DELETED** |
| `zones/shop/src/app/checkout/page.tsx` | **DELETED** |

