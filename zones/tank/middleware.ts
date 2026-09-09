// zones/tank/middleware.ts — bare-metal dev only.
// Next.js requires middleware.ts to live next to next.config.js; this zone's
// own next.config.js lives here, not at the repo root. Re-exports the real
// (shared, multi-zone-aware) middleware rather than duplicating it — a plain
// relative import, not the @/ alias, so it resolves the same way regardless
// of the tsconfig path-mapping tsconfig.json now carries for dev.
export { middleware, config } from "../../middleware";
