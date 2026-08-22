/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin this standalone app's own directory as the tracing root — without
  // this, Next.js walks up to the monorepo root (it sees the root
  // package-lock.json + this app's own bun.lock and gets confused about
  // which is the workspace). On Vercel, "include files outside root
  // directory" is off for this project, so nothing outside this folder
  // exists in the build context anyway.
  outputFileTracingRoot: __dirname,
};

module.exports = nextConfig;
