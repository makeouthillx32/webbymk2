# syntax=docker/dockerfile:1.7
# zones/test12/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# Test12 zone  ·  test12.unenter.live
#
# Build context: project root.  This image packages your zone as a standalone
# Next.js app that still inherits the shared Unenter brand.  The build plays
# out in three short stages — deps install, build (with overlay), final
# runner — and the overlay step is how a zone gets its own pages while still
# speaking the same theme / providers / globals as core.
#
# HOW THE OVERLAY WORKS
# ─────────────────────
#   1. Start with the whole repo's  src/  tree.
#   2. Stash the pieces every zone needs to share with core:
#        • essential routes (api, actions, products, collections, etc.)
#        • provider.tsx  — Providers context (auth/session/theme/roles)
#        • globals.css   — @imports layout-tokens.css so --gp-* / --lt-*
#                          tokens resolve for AppHeader / ShopFooter / etc.
#   3. Empty  src/app/  and lay the stashed core files back down.
#   4. Overlay  zones/test12/src/app/  on top — your zone's layout.tsx and
#      route pages win.
#   5. Restore core's globals.css so theme tokens are guaranteed to resolve
#      in the shared header + footer.
#
# Edit this file freely if your zone needs extra build-time files (e.g. a
# custom next.config, additional public assets, or env vars) — it's your zone.
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM oven/bun:1.3.14 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY package.json next.config.js tsconfig.json tailwind.config.ts postcss.config.js ./
COPY src/ ./src/
COPY public/ ./public/

# Stash the core pieces every branded zone needs: shared routes/APIs, the
# Providers context (provider.tsx), and globals.css.  globals.css @imports
# ../style/layout-tokens.css, which is what makes --gp-* / --lt-* theme tokens
# resolve in the shared AppHeader / ShopFooter — without it, the header
# renders unthemed (white).  Keeping core's globals.css here is how your zone
# automatically gets the shared look and feel.
RUN mkdir -p /tmp/core-app && \
    for dir in api actions _components [categorySlug] products collections checkout pages; do \
      if [ -d "src/app/$dir" ]; then cp -r "src/app/$dir" /tmp/core-app/; fi; \
    done && \
    if [ -f src/app/provider.tsx ]; then cp src/app/provider.tsx /tmp/core-app/; fi && \
    if [ -f src/app/globals.css ]; then cp src/app/globals.css /tmp/core-app/; fi && \
    rm -rf src/app && \
    mkdir -p src/app && \
    cp -r /tmp/core-app/* src/app/

# Zone overlay — anything you add under  zones/test12/src/app/  (pages,
# layouts, loading.tsx, error boundaries, route groups) gets picked up
# automatically.  This is how your zone ships its own pages on top of the
# shared shell.
COPY zones/test12/src/app/ ./src/app/

# Always use core's globals.css so shared theme tokens resolve inside the
# branded header + footer.  Zones do NOT scaffold their own globals.css —
# the restore step here ensures the shared design tokens (--gp-*, --lt-*)
# are always present.  If a zone needs custom styles, create zone-styles.css
# and import it from the page component, not layout.tsx.
RUN cp /tmp/core-app/globals.css src/app/globals.css 2>/dev/null || true

ENV NEXT_PUBLIC_ZONE=test12
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

RUN --mount=type=cache,target=/app/.next/cache,id=nextcache-test12 bun run build

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM oven/bun:1.3.14-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_ZONE=test12
ENV HOME=/tmp

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public           ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]
