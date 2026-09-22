// Record Home feature GIFs from harvested docs players (static overlay HTML).
// Run from test/e2e. Docs must already be served at BASE:
//
//   node home_feature_gifs.mjs http://localhost:8765 <scenario> <frames-dir>
//
// Scenarios: hover | click | brush | legend | export
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [base, scenario, framesDir] = process.argv.slice(2);
if (!base || !scenario || !framesDir) {
  console.error("usage: node record.mjs <base-url> <hover|click|brush|legend> <frames-dir>");
  process.exit(2);
}
mkdirSync(framesDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SPECS = {
  hover: { path: "/embeds/home_hover_stars.html", showOut: false },
  click: { path: "/embeds/getting_started.html", showOut: true },
  brush: { path: "/embeds/home_brush_stations.html", showOut: true },
  legend: { path: "/embeds/home_legend_classes.html", showOut: true },
};

const spec = SPECS[scenario];
if (!spec) {
  console.error(`unknown scenario ${scenario}; want ${Object.keys(SPECS).join("|")}`);
  process.exit(2);
}

function hitPoint(layer, index) {
  const k = layer.kind, g = layer.geometry;
  if (k === "circles") return { x: g[3 * index], y: g[3 * index + 1] };
  if (k === "rects") {
    return { x: g[4 * index] + g[4 * index + 2] / 2, y: g[4 * index + 1] + g[4 * index + 3] / 2 };
  }
  if (k === "grid") {
    const i = index % g.ncols, j = Math.floor(index / g.ncols);
    return { x: (g.xedges[i] + g.xedges[i + 1]) / 2, y: (g.yedges[j] + g.yedges[j + 1]) / 2 };
  }
  if (k === "roi") return { x: g.x + g.w / 2, y: g.y + g.h / 2, w: g.w, h: g.h };
  throw new Error(`hitPoint: unhandled kind ${k}`);
}

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

let failed = null;
let page;
try {
  const context = await browser.newContext({
    locale: "en-US",
    timezoneId: "UTC",
    viewport: { width: 900, height: 800 },
    deviceScaleFactor: 2,
    reducedMotion: "no-preference",
  });
  page = await context.newPage();
  page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));

  await page.goto(`${base.replace(/\/$/, "")}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 30000 });

  const deadline = Date.now() + 20000;
  let ready = false;
  while (Date.now() < deadline) {
    const ok = await page.evaluate(() => {
      const host = document.querySelector(".ip-host");
      if (!host || !host.masqueManifest) return false;
      let sr = null;
      host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      return !!(sr && sr.querySelector(".surface"));
    });
    if (ok) { ready = true; break; }
    await sleep(150);
  }
  if (!ready) throw new Error("overlay never mounted");

  await page.addStyleTag({
    content: `
      .masque-sim-chip { display: none !important; }
      ${spec.showOut ? "" : "#masque-out, pluto-cell:has(#masque-out) { display: none !important; }"}
      body { background: white !important; padding: 8px 0 !important; }
      pluto-cell { margin: 0 !important; }
    `,
  });

  await page.evaluate(() => {
    const c = document.createElement("div");
    c.id = "__fake_cursor";
    c.style.cssText = "position:fixed;left:0;top:0;width:16px;height:16px;z-index:2147483647;pointer-events:none;transform:translate(-2px,-2px);";
    c.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 1 L1 13 L4.5 10.2 L6.8 15 L9 14 L6.7 9.2 L11 9 Z" fill="black" stroke="white" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
    document.body.appendChild(c);
    document.addEventListener("mousemove", (e) => {
      c.style.left = `${e.clientX}px`;
      c.style.top = `${e.clientY}px`;
    }, true);
  });

  await sleep(200);

  const rect = await page.evaluate((showOut) => {
    const host = document.querySelector(".ip-host");
    const out = document.getElementById("masque-out");
    const r1 = host.getBoundingClientRect();
    const cell = showOut && out ? out.closest("pluto-cell") : null;
    const r2 = cell ? cell.getBoundingClientRect() : r1;
    return {
      left: Math.min(r1.left, r2.left),
      top: Math.min(r1.top, r2.top),
      right: r1.right,
      bottom: Math.max(r1.bottom, r2.bottom),
    };
  }, spec.showOut);
  const margin = 12;
  const clip = {
    x: Math.max(0, Math.round(rect.left - margin)),
    y: Math.max(0, Math.round(rect.top - margin)),
    width: Math.round(rect.right - rect.left + 2 * margin),
    height: Math.round(rect.bottom - rect.top + 2 * margin),
  };
  console.error(`clip: ${JSON.stringify(clip)}`);

  const toCss = (ix, iy) => page.evaluate(([x, y]) => {
    const host = document.querySelector(".ip-host");
    let sr = null;
    host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const b = host.querySelector("img, canvas").getBoundingClientRect();
    const outW = sr.querySelector("svg").viewBox.baseVal.width;
    const s = b.width / outW;
    return { x: b.left + x * s, y: b.top + y * s };
  }, [ix, iy]);

  const layers = await page.evaluate(() => document.querySelector(".ip-host").masqueManifest.layers);
  const tip = () => page.evaluate(() => {
    const host = document.querySelector(".ip-host");
    let sr = null;
    host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const t = sr.querySelector(".masque-tip");
    return { show: !!(t && t.classList.contains("show")), text: (t?.innerText || "").replace(/\s+/g, " ").trim() };
  });
  const outText = () => page.evaluate(() => (document.getElementById("masque-out")?.innerText || "").trim());

  let cur = { x: clip.x + 20, y: clip.y + 20 };
  await page.mouse.move(cur.x, cur.y);

  const moveTo = async (target, durationMs, steps = 18) => {
    const start = { ...cur };
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = start.x + (target.x - start.x) * t;
      const y = start.y + (target.y - start.y) * t;
      await page.mouse.move(x, y);
      await sleep(durationMs / steps);
    }
    cur = { ...target };
  };

  const frames = [];
  const t0 = Date.now();
  let done = false;
  const captureLoop = async () => {
    let i = 0;
    while (!done) {
      const started = Date.now();
      const path = join(framesDir, `frame_${String(i).padStart(4, "0")}.png`);
      await page.screenshot({ path, clip });
      frames.push({ file: path, t: started - t0 });
      i++;
      const elapsed = Date.now() - started;
      const budget = 1000 / 15;
      if (elapsed < budget) await sleep(budget - elapsed);
    }
    const path = join(framesDir, `frame_${String(i).padStart(4, "0")}.png`);
    await page.screenshot({ path, clip });
    frames.push({ file: path, t: Date.now() - t0 });
  };

  const timeline = async () => {
    if (scenario === "hover") {
      const layer = layers.find((l) => l.id === "stars");
      const pts = [0, 5, 7].map((i) => hitPoint(layer, i));
      const css = await Promise.all(pts.map((p) => toCss(p.x, p.y)));
      await sleep(350);
      for (const p of css) {
        await moveTo(p, 400);
        await sleep(150);
        const t = await tip();
        if (!t.show) throw new Error(`hover: tooltip not showing at ${JSON.stringify(p)} — ${JSON.stringify(t)}`);
        console.error(`OK  tooltip: ${t.text}`);
        await sleep(700);
      }
      await moveTo({ x: clip.x + 24, y: clip.y + 24 }, 400);
      await sleep(600);
    } else if (scenario === "click") {
      const layer = layers.find((l) => l.id === "cities");
      const a = hitPoint(layer, 0);
      const b = hitPoint(layer, 3);
      const [ptA, ptB] = await Promise.all([toCss(a.x, a.y), toCss(b.x, b.y)]);
      await sleep(350);
      await moveTo(ptA, 400);
      await sleep(150);
      const t = await tip();
      if (!t.show || !/tokyo/i.test(t.text)) throw new Error(`click hover: ${JSON.stringify(t)}`);
      await sleep(600);
      await moveTo(ptB, 450);
      await sleep(150);
      const before = await outText();
      await page.mouse.down();
      await sleep(40);
      await page.mouse.up();
      let after = before;
      for (let i = 0; i < 40; i++) {
        after = await outText();
        if (after !== before && /são paulo|sao paulo/i.test(after)) break;
        await sleep(80);
      }
      if (!/são paulo|sao paulo/i.test(after)) {
        throw new Error(`click: readout did not update — before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
      }
      console.error(`OK  click: ${after}`);
      await sleep(1100);
    } else if (scenario === "brush") {
      const roi = layers.find((l) => l.kind === "roi");
      const pts = layers.find((l) => l.id === "pts");
      const start = hitPoint(roi, 0);
      const n0 = hitPoint(pts, 0);
      const n1 = hitPoint(pts, 1);
      const n2 = hitPoint(pts, 2);
      const dest = { x: (n0.x + n1.x + n2.x) / 3, y: (n0.y + n1.y + n2.y) / 3 };
      const [from, to] = await Promise.all([toCss(start.x, start.y), toCss(dest.x, dest.y)]);
      await sleep(350);
      await moveTo(from, 400);
      await sleep(200);
      const before = await outText();
      await page.mouse.down();
      await sleep(40);
      await moveTo(to, 700, 24);
      await page.mouse.up();
      let after = before;
      for (let i = 0; i < 40; i++) {
        after = await outText();
        if (after !== before && /Seattle|Cascadia/i.test(after)) break;
        await sleep(80);
      }
      if (after === before) {
        console.error(`WARN  brush: readout unchanged (${JSON.stringify(before)}); keeping box-move gif`);
      } else {
        console.error(`OK  brush: ${after.slice(0, 120)}`);
      }
      await sleep(1100);
    } else if (scenario === "legend") {
      const legend = layers.find((l) => l.id === "legend");
      const a = hitPoint(legend, 0);
      const b = hitPoint(legend, 2);
      const [ptA, ptB] = await Promise.all([toCss(a.x, a.y), toCss(b.x, b.y)]);
      const imgTail = () => page.evaluate(() => (document.querySelector(".ip-host img")?.src || "").slice(-32));
      await sleep(350);
      await moveTo(ptA, 450);
      await sleep(800);
      await moveTo(ptB, 400);
      await sleep(200);
      const before = await outText();
      const beforePng = await imgTail();
      await page.mouse.down();
      await sleep(40);
      await page.mouse.up();
      let after = before;
      let afterPng = beforePng;
      for (let i = 0; i < 40; i++) {
        after = await outText();
        afterPng = await imgTail();
        if (after !== before && /gentoo/i.test(after) && afterPng !== beforePng) break;
        await sleep(80);
      }
      if (!/gentoo/i.test(after)) throw new Error(`legend: readout did not update — ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      if (afterPng === beforePng) throw new Error("legend: PNG did not remount (fade missing)");
      console.error(`OK  legend: ${after}`);
      await sleep(1100);
    }
    done = true;
  };

  await Promise.all([captureLoop(), timeline()]);
  writeFileSync(join(framesDir, "timestamps.json"), JSON.stringify(frames, null, 2));
  console.error(`captured ${frames.length} frames over ${(frames.at(-1).t / 1000).toFixed(2)}s`);
  console.log(`RECORD OK — ${scenario} ${frames.length} frames`);
} catch (e) {
  failed = e;
  if (page) {
    try {
      await page.screenshot({ path: join(framesDir, "..", `${scenario}-failure.png`), fullPage: true });
    } catch { /* ignore */ }
  }
} finally {
  await browser.close();
}
if (failed) {
  console.error("RECORD FAIL:", failed.message);
  process.exit(1);
}
