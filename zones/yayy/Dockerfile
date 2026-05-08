# zones/yayy/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# Build context: project root
# Zone: Yayy  (yayy.unenter.live)
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

COPY package.json next.config.js tsconfig.json tailwind.config.ts postcss.config.js ./
COPY src/ ./src/
COPY public/ ./public/

# Swap src/app/: keep core logic + provider.tsx + globals.css, overlay yayy zone pages.
# The directory list is LAYOUT-AWARE — landing zones use [slug] for blog posts,
# so copying [categorySlug] from shop routes would cause Next.js to crash:
#   "You cannot use different slug names for the same dynamic path"
# shop    → api actions _components [categorySlug] products collections checkout pages
# landing → api actions _components pages   (no shop dynamic segments)
# app     → api actions _components         (pure web app, no e-commerce routes)
# minimal → api actions _components         (bare canvas)
RUN mkdir -p /tmp/core-app && \
    for dir in api actions _components pages; do \
      if [ -d "src/app/$dir" ]; then cp -r "src/app/$dir" /tmp/core-app/; fi; \
    done && \
    if [ -f src/app/provider.tsx ]; then cp src/app/provider.tsx /tmp/core-app/; fi && \
    if [ -f src/app/globals.css ]; then cp src/app/globals.css /tmp/core-app/; fi && \
    rm -rf src/app && \
    mkdir -p src/app && \
    cp -r /tmp/core-app/* src/app/

# Zone overlay: copy everything from zones/yayy/src/app/ so any future
# loading.tsx / not-found.tsx / etc. gets picked up automatically.
COPY zones/yayy/src/app/ ./src/app/

# CRITICAL: restore core's globals.css on top of any zone copy.  The zone's
# globals.css (if it exists) is self-contained and DOES NOT @import
# layout-tokens.css, so it breaks AppHeader / ShopFooter theming.  Core's
# globals.css is the only one that imports layout-tokens, so it must win.
# This was the root cause of a white-header-and-footer bug on first scaffold.
RUN cp /tmp/core-app/globals.css src/app/globals.css 2>/dev/null || true

ENV NEXT_PUBLIC_ZONE=yayy
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_URL_BROWSER
ARG NEXT_PUBLIC_APP_TITLE
ARG NEXT_PUBLIC_COMPANY_NAME
ARG NEXT_PUBLIC_OWNER_USERNAME
ARG NEXT_PUBLIC_OWNER_EMAIL

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL_BROWSER=$NEXT_PUBLIC_SUPABASE_URL_BROWSER
ENV NEXT_PUBLIC_APP_TITLE=$NEXT_PUBLIC_APP_TITLE
ENV NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME
ENV NEXT_PUBLIC_OWNER_USERNAME=$NEXT_PUBLIC_OWNER_USERNAME
ENV NEXT_PUBLIC_OWNER_EMAIL=$NEXT_PUBLIC_OWNER_EMAIL

RUN bun run build

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM oven/bun:1.2-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_ZONE=yayy
ENV HOME=/tmp

RUN addgroup --system --gid 1001 nodejs &&     adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public           ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]
