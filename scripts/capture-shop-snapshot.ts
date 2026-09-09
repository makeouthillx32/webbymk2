// scripts/capture-shop-snapshot.ts
// Headless Playwright capture for shop.unenter.live (Desktop & Mobile)
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const targetDir = path.resolve(process.cwd(), ".openclaw-scratch/polish");
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const desktopPath = path.join(targetDir, `shop-desktop-${timestamp}.png`);
const mobilePath = path.join(targetDir, `shop-mobile-${timestamp}.png`);
const latestDesktop = path.join(targetDir, "shop-desktop-latest.png");
const latestMobile = path.join(targetDir, "shop-mobile-latest.png");

const baseUrl = process.env.SHOP_URL || "https://dev.shop.unenter.live";

console.log(`[snapshot] Capturing ${baseUrl} desktop snapshot...`);
execSync(
  `bunx playwright screenshot --channel msedge --viewport-size 1280,3800 --wait-for-timeout 9000 ${baseUrl} "${latestDesktop}"`,
  { stdio: "inherit" }
);
fs.copyFileSync(latestDesktop, desktopPath);

console.log(`[snapshot] Capturing ${baseUrl} mobile snapshot...`);
execSync(
  `bunx playwright screenshot --channel msedge --viewport-size 390,844 --wait-for-timeout 5000 ${baseUrl} "${latestMobile}"`,
  { stdio: "inherit" }
);
fs.copyFileSync(latestMobile, mobilePath);

console.log(`[snapshot] Captured:
- Desktop: ${latestDesktop}
- Mobile: ${latestMobile}
- Archived: ${timestamp}`);
