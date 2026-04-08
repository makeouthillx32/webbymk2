# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM oven/bun:1.1 AS deps

WORKDIR /app

# Copy lockfile and package manifest first for layer caching
COPY package.json bun.lockb* ./

# Install all deps (including dev — needed for build)
RUN bun install --frozen-lockfile

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM oven/bun:1.1 AS builder

WORKDIR /app

# Bring in node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build args for env vars that need to be baked in at build time
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Next.js collects anonymous telemetry — disable it
ENV NEXT_TELEMETRY_DISABLED=1

RUN bun run build

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM oven/bun:1.1-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only what's needed to run
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]