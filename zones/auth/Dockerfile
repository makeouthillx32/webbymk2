# zones/auth/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# Build context: project root (Z:\WEBSITES\webbymk2\)
#
# Flat /app approach — identical to the blog/shop zone strategy.
# ALL auth pages already live in the core:
#   src/app/(auth-pages)/   sign-in, sign-up, forgot-password
#   src/app/auth/           callback/oauth, logout
#   src/app/actions/auth/   server actions
#   src/app/api/auth/       session route
#
# We overlay only:
#   layout.tsx  — auth-specific metadata (robots: noindex, zone title)
#   page.tsx    — redirects "/" → "/sign-in"
#
# Everything else — components, providers, lib, utils, styles — is shared
# core code used as-is. No ClientLayout wrapper (no nav/sidebar on auth pages).
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

# Root configs
COPY package.json next.config.js tsconfig.json tailwind.config.ts postcss.config.js ./

# Full core — all shared components, utils, lib, styles, AND all app pages
COPY src/ ./src/
COPY public/ ./public/

# Overlay root layout and page with auth-zone-specific versions.
# layout.tsx: auth metadata (noindex), strips nav/sidebar — just <Providers>.
# page.tsx:   hard-redirects "/" → "/sign-in".
COPY zones/auth/src/app/layout.tsx ./src/app/layout.tsx
COPY zones/auth/src/app/page.tsx   ./src/app/page.tsx

# Bake zone identity
ENV NEXT_PUBLIC_ZONE=auth
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
ENV NEXT_PUBLIC_ZONE=auth
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
