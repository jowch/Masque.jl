// Take the Examples page's card pictures from the docs players: each figure mid-interaction
// (a click picked, the pointer's tooltip showing), at 2×. Run from test/e2e against a docs
// build, or the deployed site once it shows what you want:
//
//   node gallery_thumbs.mjs https://jowch.github.io/Masque.jl/dev ../../docs/src/assets/gallery
//
// The "Compare a cluster" card is a frame of its clip instead: see
// docs/dev/gallery-thumbs/README.md.
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error("usage: node gallery_thumbs.mjs <docs-url> <out-dir>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Moves are in fractions of the figure's picture, and "leave" moves the pointer off it so its
// tooltip doesn't cover the pick; `hosts` lists the figures to keep, side by side.
const CARDS = [
  { out: "heatmap-trace", embed: "example_heatmap_trace", moves: [["click", 0, 0.68, 0.38]] },
  { out: "bars", embed: "gallery_bars", moves: [["click", 0, 0.257, 0.3]] },
  { out: "polygons", embed: "gallery_polygons", moves: [["click", 0, 0.515, 0.635], ["leave"]] },
  { out: "text", embed: "gallery_text", moves: [["click", 0, 0.53, 0.155], ["leave"]] },
  { out: "boxselect", embed: "gallery_boxselect", moves: [["hover", 0, 0.196, 0.47]] },
  { out: "image", embed: "gallery_image", moves: [["hover", 0, 0.46, 0.57]] },
  { out: "selection", embed: "gallery_selection", hosts: [0, 1], moves: [["click", 0, 0.743, 0.156]] },
];

const browser = await chromium.launch({ headless: true });
let failed = false;
try {
  const context = await browser.newContext({
    locale: "en-US", timezoneId: "UTC", viewport: { width: 760, height: 900 }, deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => { failed = true; console.error("PAGEERROR:", e.message); });
  for (const card of CARDS) {
    await page.goto(`${base.replace(/\/$/, "")}/embeds/${card.embed}.html`, { waitUntil: "load" });
    await page.addStyleTag({ content: ".masque-sim-chip, .masque-bar, .masque-miss { display: none !important; }" });
    await sleep(1500);
    const pics = page.locator(".ip-host img, .ip-host canvas");
    for (const [kind, h, fx, fy] of card.moves) {
      if (kind === "leave") {
        await page.mouse.move(2, 2, { steps: 8 });
        await sleep(900);
        continue;
      }
      const pic = pics.nth(h);
      await pic.scrollIntoViewIfNeeded();
      const b = await pic.boundingBox();
      const at = { x: b.x + fx * b.width, y: b.y + fy * b.height };
      await page.mouse.move(at.x - 30, at.y - 20);
      await page.mouse.move(at.x, at.y, { steps: 8 });
      if (kind === "click") await page.mouse.click(at.x, at.y);
      await sleep(900);
    }
    const shots = [];
    for (const h of card.hosts ?? [0]) {
      const file = join(tmpdir(), `masque-thumb-${card.out}-${h}.png`);
      // The host, not the picture: a tooltip can reach past the picture's edge.
      await page.locator(".ip-host").nth(h).screenshot({ path: file });
      shots.push(PNG.sync.read(readFileSync(file)));
    }
    const W = shots.reduce((w, s) => w + s.width, 0), H = Math.max(...shots.map((s) => s.height));
    const out = new PNG({ width: W, height: H });
    out.data.fill(255);
    let x = 0;
    for (const s of shots) { PNG.bitblt(s, out, 0, 0, s.width, s.height, x, 0); x += s.width; }
    writeFileSync(join(outDir, `${card.out}.png`), PNG.sync.write(out));
    console.error(`OK  ${card.out}.png ${W}x${H}`);
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
