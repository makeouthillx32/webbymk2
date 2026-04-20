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

const zone         = process.env.NEXT_PUBLIC_ZONE ?? "unenter";
const assetPrefix  = process.env.NEXT_PUBLIC_ZONE_ASSET_PREFIX
  ?? ZONE_ASSET_PREFIXES[zone]
  ?? "";

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,

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
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port:     "8001",
        pathname: "/storage/v1/object/public/**",
      },
      // Production Supabase
      {
        protocol: "https",
        hostname: `**.${CORE_DOMAIN}`,
        pathname: "/storage/v1/object/public/**",
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
        // Cache Next.js static assets aggressively
        source: "/_next/static/(.*)",
        headers: [
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
