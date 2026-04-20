# zones/blog/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# Build context: project root (Z:\WEBSITES\webbymk2\)
#
# Flat /app approach — no cross-directory wrapper configs.
# Root next.config.js, tsconfig.json, tailwind.config.ts, postcss.config.js
# are used as-is.  src/app/ is swapped:  core app pages are stripped,
# provider.tsx is preserved, blog zone pages are overlaid.
#
#   /app/
#     package.json  bun.lock        ← root deps
#     next.config.js  tsconfig.json  tailwind.config.ts  postcss.config.js
#     src/
#       app/                        ← blog pages only (swapped at build time)
#         provider.tsx              ← kept from core
#         layout.tsx  page.tsx  [slug]/page.tsx  globals.css  …
#       components/  lib/  …        ← ALL shared core code
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

# Root configs — used directly, no wrappers needed
COPY package.json next.config.js tsconfig.json tailwind.config.ts postcss.config.js ./

# Shared core (components, lib, styles, utils, etc.)
COPY src/ ./src/
COPY public/ ./public/

# Swap src/app/: keep only provider.tsx, then overlay blog zone pages
RUN cp src/app/provider.tsx /tmp/provider.tsx && \
    rm -rf src/app && \
    mkdir -p src/app && \
    mv /tmp/provider.tsx src/app/provider.tsx

# Also preserve any root-level type files that pages might reference
COPY zones/blog/src/app/ ./src/app/

# Bake zone identity
ENV NEXT_PUBLIC_ZONE=blog
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
ENV NEXT_PUBLIC_ZONE=blog
# Give bun a writable home so it can write its transpiler cache.
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
