// zones/tank/next.config.js
// ─────────────────────────────────────────────────────────────────────────────
// Bare-metal dev config for the Tank zone — NOT used by the Docker build
// (see ../Dockerfile, which copies files into a self-contained image and
// never reads this file at all). This exists so `next dev` can run directly
// on the host from this folder, sidestepping Docker Desktop/WSL2 entirely —
// measured live 2026-08-30: a single API route's first compile took 40s+
// inside the containerized dev server even after freeing its CPU cap,
// consistent with real Docker-VM resource contention (~25 containers
// running concurrently), not something a config tweak fixes. Native host
// process reading NTFS directly, no virtualization boundary, no shared VM.
//
// Deliberately minimal — this only needs to make `next dev` actually boot
// and render correctly, not replicate every production concern (asset
// prefixing for a multi-zone-in-one-deployment layout, aggressive static
// caching, etc. don't apply to a single-zone local dev loop).
// ─────────────────────────────────────────────────────────────────────────────

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Same reasoning as the root config's isDev branch: no CPU cap for `next
  // dev` — that cap exists only to survive `next build`'s SSG fork storm on
  // a shared, memory-overcommit-off host, and this file is dev-only.

  // Lets the dev server accept requests whose Host header doesn't match
  // localhost — needed if this is ever fronted by the proxy at
  // dev.tank.unenter.live instead of hit directly on localhost:3012.
  allowedDevOrigins: ["dev.tank.unenter.live", "dev.*.unenter.live"],

  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "**.unenter.live", pathname: "/storage/v1/object/public/**" },
    ],
  },

  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  async redirects() {
    return [
      {
        source: "/archive",
        destination: "/archives",
        permanent: true,
      },
      {
        source: "/rooms/:slug",
        destination: "/",
        permanent: true,
      },
      {
        source: "/room/:slug",
        destination: "/",
        permanent: true,
      },
      {
        source: "/rooms",
        destination: "/",
        permanent: true,
      },
    ];
  },

  webpack(config) {
    config.module = config.module ?? {};
    config.module.exprContextCritical = false;
    return config;
  },
};

module.exports = nextConfig;
