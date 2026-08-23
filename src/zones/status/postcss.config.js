// Empty on purpose — this app uses plain CSS, no Tailwind/PostCSS plugins.
// Its real job is to stop Next.js's postcss-config search from walking up
// past this directory and finding the monorepo root's postcss.config.js
// (which references tailwindcss — a dependency this standalone app never
// installs, since Vercel only installs deps scoped to this Root Directory).
module.exports = { plugins: {} };
