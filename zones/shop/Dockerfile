# zones/shop/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# Build context: project root (Z:\WEBSITES\webbymk2\)
#
# Flat /app approach — same as blog zone but simpler:
# ALL shop pages already live in the core (src/app/shop, products, collections,
# checkout, share, [categorySlug], api/cart, api/checkout, api/products, etc.)
# so we do NOT strip src/app at all.
#
# The only overlay is the root layout.tsx (shop-specific metadata) and
# globals.css. Everything else — components, utils, lib, styles — is shared
# core code used as-is.
#
#   /app/
#     package.json  bun.lock        ← root deps
#     next.config.js  tsconfig.json  tailwind.config.ts  postcss.config.js
#     src/
#       app/                        ← ALL core pages kept (shop pages live here)
#         layout.tsx                ← overridden with shop-specific metadata
#         globals.css               ← overridden with self-contained CSS vars
#         shop/  products/  collections/  checkout/  share/  [categorySlug]/
#         (auth-pages)/  auth/  actions/  api/cart/  api/checkout/  ...
#       components/  lib/  utils/   ← shared core, untouched
#     public/
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM oven/bun:1.2 AS deps

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM oven/bun:1.2 AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Root configs — used directly, no wrappers
COPY package.json next.config.js tsconfig.json tailwind.config.ts postcss.config.js ./

# Full core — all shared components, utils, lib, styles, AND all app pages
COPY src/ ./src/
COPY public/ ./public/

# Overlay only the root layout.tsx and page.tsx with shop-specific versions.
# layout.tsx: shop-specific metadata.
# page.tsx: replaces the core's 3D video hero with the shop landing (HomePage).
# globals.css is NOT overridden — the core's version has all shop styles
# (Google sign-in button, shop components, etc.) and is used as-is.
# The layout.tsx import of "./globals.css" resolves to the core's file.
COPY zones/shop/src/app/layout.tsx ./src/app/layout.tsx
COPY zones/shop/src/app/page.tsx   ./src/app/page.tsx

# Bake zone identity
ENV NEXT_PUBLIC_ZONE=shop
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_URL_BROWSER
ARG NEXT_PUBLIC_APP_TITLE
ARG NEXT_PUBLIC_COMPANY_NAME
ARG NEXT_PUBLIC_OWNER_USERNAME
ARG NEXT_PUBLIC_OWNER_EMAIL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL_BROWSER=$NEXT_PUBLIC_SUPABASE_URL_BROWSER
ENV NEXT_PUBLIC_APP_TITLE=$NEXT_PUBLIC_APP_TITLE
ENV NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME
ENV NEXT_PUBLIC_OWNER_USERNAME=$NEXT_PUBLIC_OWNER_USERNAME
ENV NEXT_PUBLIC_OWNER_EMAIL=$NEXT_PUBLIC_OWNER_EMAIL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

RUN bun run build

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM oven/bun:1.2-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_ZONE=shop
ENV HOME=/tmp

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]
