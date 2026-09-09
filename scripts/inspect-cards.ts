import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage();
  page.on("console", (msg) => console.log("BROWSER LOG:", msg.text()));
  page.on("pageerror", (err) => console.log("BROWSER ERROR:", err.message));
  page.on("requestfailed", (req) =>
    console.log("REQ FAILED:", req.url(), req.failure()?.errorText)
  );
  await page.goto("https://dev.shop.unenter.live", { waitUntil: "networkidle" });
  const cards = await page.$$eval('a[href*="/products/"]', (els) =>
    els.map((el) => {
      const img = el.querySelector("img");
      return {
        href: el.getAttribute("href"),
        hasImg: !!img,
        imgSrc: img ? img.src : null,
        imgNaturalWidth: img ? img.naturalWidth : 0,
        imgNaturalHeight: img ? img.naturalHeight : 0,
        imgOpacity: img ? window.getComputedStyle(img).opacity : null,
      };
    })
  );
  console.log("CARDS COUNT:", cards.length);
  console.log("CARDS:", JSON.stringify(cards, null, 2));
  await browser.close();
}

run().catch(console.error);
