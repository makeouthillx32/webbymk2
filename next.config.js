// next.config.js
// ─────────────────────────────────────────────────────────────────────────────
// Multi-zone aware Next.js configuration.
//
// NEXT_PUBLIC_ZONE env var tells this build which zone it serves.
// In the monolith (all zones in one app) leave it unset → defaults to "unenter".
// When a zone is split into its own deployment, set NEXT_PUBLIC_ZONE to the
// zone name and NEXT_PUBLIC_ZONE_ASSET_PREFIX to the zone's public origin.
// ─────────────────────────────────────────────────────────────────────────────

/** @type {import('next').NextConfig} */

const CORE_DOMAIN = "unenter.live";

// Asset prefix — prevents CSS/JS collisions when multiple Next.js instances
// share the same CDN or proxy. Blank for the core zone.
const ZONE_ASSET_PREFIXES = {
  unenter:   "",
  dashboard: `https://dashboard.${CORE_DOMAIN}`,
  shop:      `https://shop.${CORE_DOMAIN}`,
  app:       `https://app.${CORE_DOMAIN}`,
};

const isDev = process.env.NODE_ENV !== "production";
const zone         = process.env.NEXT_PUBLIC_ZONE ?? "unenter";
const assetPrefix  = isDev
  ? ""
  : (process.env.NEXT_PUBLIC_ZONE_ASSET_PREFIX ?? ZONE_ASSET_PREFIXES[zone] ?? "");
const devNoStoreHeaders = [
  {
    key:   "Cache-Control",
    value: "no-store, no-cache, max-age=0, must-revalidate",
  },
  {
    key:   "CDN-Cache-Control",
    value: "no-store",
  },
  {
    key:   "Surrogate-Control",
    value: "no-store",
  },
  {
    key:   "Pragma",
    value: "no-cache",
  },
  {
    key:   "Expires",
    value: "0",
  },
];

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,

  // ── Build-worker count ───────────────────────────────────────────────────
  // The build VM has 32 cores + ~31 GB, BUT it concurrently runs ~25 containers
  // (core Supabase + ~14 zone apps + runtime DB instances). With memory
  // overcommit OFF, each SSG worker fork() RESERVES the full multi-GB parent
  // size, so the usable worker count is bounded by *free* RAM, not core count.
  // On a loaded box, 8 workers reserve more than the free headroom → fork fails
  // the instant SSG starts → buildkit drops the stream (Unavailable/EOF), the
  // "Generating static pages (0/N)" hang. 2 is the proven safe value here.
  //
  // To actually USE the 32 cores: enable overcommit in the Docker VM
  // (vm.overcommit_memory=1) so forks are copy-on-write-cheap and decouple from
  // resident memory — then this can rise to 16-32 regardless of what else runs.
  // That's the real fix; this cap is the "works today on a packed box" setting.
  //
  // Dev-only exemption: this cap was written for `next build`'s SSG fork
  // storm on a shared, memory-overcommit-off build host — it has nothing to
  // do with `next dev`'s Turbopack compiler, which was inheriting the same
  // 2-core throttle and paying for it on every cold route compile (measured
  // live 2026-08-30: a heavy route routinely outran the proxy's request
  // timeout under this cap, on hardware with far more than 2 cores free).
  // `next dev` always runs with NODE_ENV=development, so gating on that is
  // exact — no risk of accidentally uncapping a real production build.
  experimental: {
    cpus: isDev
      ? undefined
      : (process.env.NEXT_BUILD_CPUS ? parseInt(process.env.NEXT_BUILD_CPUS, 10) : 4),
  },
  // ── Dev origins ────────────────────────────────────────────────────────────
  // Suppresses the "Cross origin request detected" warning when accessing the
  // app via dev.unenter.live (the Docker dev proxy host) instead of localhost.
  allowedDevOrigins: [
    `dev.${CORE_DOMAIN}`,
    `dev.*.${CORE_DOMAIN}`,
  ],

  // ── Multi-zone ─────────────────────────────────────────────────────────────
  assetPrefix,

  // When splitting zones, set basePath = zone's path prefix so Next.js
  // internal routes (__nextjs_original-stack-frames, etc.) don't clash.
  // Leave blank while running as monolith.
  // basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",

  // ── Images ─────────────────────────────────────────────────────────────────
  images: {
    remotePatterns: [
      // Local Supabase (dev)
      {
        protocol: "http",
        hostname: "localhost",
        port:     "8000",
        pathname: "/storage/v1/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port:     "8001",
        pathname: "/storage/v1/**",
      },
      // Production Supabase
      {
        protocol: "https",
        hostname: `**.${CORE_DOMAIN}`,
        pathname: "/storage/v1/**",
      },
    ],
  },

  // ── Build ──────────────────────────────────────────────────────────────────
  eslint:     { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors:  true },

  // ── Security / response headers ────────────────────────────────────────────
  async headers() {
    return [
      {
        // Auth pages must never reuse old RSC/client chunks during dev auth work.
        source: "/sign-in",
        headers: devNoStoreHeaders,
      },
      {
        // Apply to every route
        source: "/(.*)",
        headers: [
          // Prevent clickjacking — allow same origin + known zone origins
          {
            key:   "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          // CSP — tighten as zones mature
          {
            key:   "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key:   "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key:   "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          // HSTS (only meaningful behind HTTPS — proxy enforces TLS)
          {
            key:   "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Cache Next.js static assets aggressively in prod. In dev, avoid stale
        // client chunks after container rebuilds and mounted-volume cache churn.
        source: "/_next/static/(.*)",
        headers: isDev
          ? devNoStoreHeaders
          : [
              {
                key:   "Cache-Control",
                value: "public, max-age=31536000, immutable",
              },
            ],
      },
      {
        // Don't cache API responses by default
        source: "/api/(.*)",
        headers: [
          {
            key:   "Cache-Control",
            value: "no-store",
          },
        ],
      },
    ];
  },

  // ── Redirects ──────────────────────────────────────────────────────────────
  async redirects() {
    return [
      // Normalise trailing slashes
      {
        source:      "/:path+/",
        destination: "/:path+",
        permanent:   true,
      },
    ];
  },

  // ── Webpack ────────────────────────────────────────────────────────────────
  webpack(config) {
    config.module = config.module ?? {};
    config.module.exprContextCritical = false;
    return config;
  },
};

export default nextConfig;
