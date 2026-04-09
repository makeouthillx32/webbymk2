/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the Docker standalone build (copies only what's needed to run)
  output: "standalone",

  // React 19 / Next 15 — strict mode on
  reactStrictMode: true,

  // Suppress the "X-Powered-By: Next.js" header in prod
  poweredByHeader: false,

  // Image domains — add your CDN / Supabase storage URL here
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/storage/v1/object/public/**",
      },
      // Add production Supabase URL here when you deploy:
      // { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },

  // ESLint and TypeScript build configuration
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Webpack tweaks for Three.js / R3F
  webpack(config) {
    // Silence "Critical dependency: the request of a CommonJS module..." from three
    config.module = config.module ?? {};
    config.module.exprContextCritical = false;
    return config;
  },
};

export default nextConfig;