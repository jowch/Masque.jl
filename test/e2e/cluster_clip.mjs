// Record the "Compare a cluster" clip from a live Pluto notebook: real pointer drags on a
// `selects` ROI, and the histogram cell recomputed by Julia after each release. The docs
// page shows this clip because the example has too many points for a player to record
// every box (docs/player_pipeline.jl, `brush_states`). Run from test/e2e with a Pluto
// server whose notebooks can load Masque (serve.jl + MASQUE_DEV_ENV):
//
//   node cluster_clip.mjs <pluto-url> <notebook-abs-path> <frames-dir>
//
// then docs/dev/clips/assemble_mp4.sh <frames-dir> docs/src/assets/example-cluster.mp4
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [base, notebook, framesDir] = process.argv.slice(2);
if (!base || !notebook || !framesDir) {
  console.error("usage: node cluster_clip.mjs <pluto-url> <notebook-abs-path> <frames-dir>");
  process.exit(2);
}
mkdirSync(framesDir, { recursive: true });

const ID_WIDGET = "a1420001-0001-4000-8000-000000000003";
const ID_HIST = "a1420001-0001-4000-8000-000000000004";
// The notebook's resting ROI, `bounds = (5.2, 9.2, 4.4, 7.8)`: its on-screen rect fixes the
// data-to-CSS map, since both axes are linear.
const REST = { xmin: 5.2, xmax: 9.2, ymin: 4.4, ymax: 7.8 };
const runNotebook = join(tmpdir(), `masque-cluster-clip-${Date.now()}-${process.pid}.jl`);
copyFileSync(notebook, runNotebook);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Painted onto each screenshot at the Playwright pointer: a DOM cursor does not show in a
// headless capture (see home_orbit_gif.mjs).
const CURSOR = [
  [1, 1], [1, 13], [4.5, 10.2], [6.8, 15], [9, 14], [6.7, 9.2], [11, 9],
];

function fillPolygon(png, pts, rgb) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(png.height - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const t = (y + 0.5 - y1) / (y2 - y1);
        xs.push(x1 + t * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i]));
      const xb = Math.min(png.width - 1, Math.floor(xs[i + 1]));
      for (let x = xa; x <= xb; x++) {
        const o = (png.width * y + x) << 2;
        png.data[o] = rgb[0];
        png.data[o + 1] = rgb[1];
        png.data[o + 2] = rgb[2];
        png.data[o + 3] = 255;
      }
    }
  }
}

function paintCursor(pngPath, cssX, cssY, clip) {
  const png = PNG.sync.read(readFileSync(pngPath));
  const sx = png.width / clip.width;
  const sy = png.height / clip.height;
  const hx = (cssX - clip.x) * sx;
  const hy = (cssY - clip.y) * sy;
  const scale = (28 / 16) * sx;
  const pts = CURSOR.map(([x, y]) => [hx + (x - 1) * scale, hy + (y - 1) * scale]);
  const halo = 2.4;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const dx = Math.cos(a) * halo;
    const dy = Math.sin(a) * halo;
    fillPolygon(png, pts.map(([x, y]) => [x + dx, y + dy]), [255, 255, 255]);
  }
  fillPolygon(png, pts, [0, 0, 0]);
  writeFileSync(pngPath, PNG.sync.write(png));
}


const browser = await chromium.launch({ headless: true });
let failed = null;
try {
  const context = await browser.newContext({
    locale: "en-US", timezoneId: "UTC",
    viewport: { width: 900, height: 1100 }, deviceScaleFactor: 1.5,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
  await page.goto(`${base.replace(/\/$/, "")}/open?path=${encodeURIComponent(runNotebook)}`, { waitUntil: "domcontentloaded", timeout: 60000 });

  const deadline = Date.now() + 20 * 60 * 1000;
  for (let tick = 0; ; tick++) {
    const st = await page.evaluate(() => {
      const runBtn = [...document.querySelectorAll("button, a")].find((b) => /run notebook code/i.test(b.innerText || b.title || ""));
      if (runBtn && !window.__clicked) { runBtn.click(); window.__clicked = true; }
      const host = document.querySelector(".ip-host");
      let sr = null; host?.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      return {
        busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
        err: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).join("\n").slice(0, 600),
        mounted: !!sr?.querySelector(".surface"),
      };
    });
    if (st.err) throw new Error(`notebook errored: ${st.err}`);
    if (!st.busy && st.mounted) break;
    if (Date.now() > deadline) throw new Error("timed out waiting for the widget to mount");
    if (tick % 10 === 0) console.error(`  …waiting (${tick}s) busy=${st.busy}`);
    await sleep(1000);
  }
  console.error("phase: widget mounted");

  await page.addStyleTag({ content: `
    header, footer, pluto-helpbox, nav { display: none !important; }
    pluto-cell:not(#${ID_WIDGET}):not(#${ID_HIST}) { display: none !important; }
    pluto-cell > pluto-input, pluto-shoulder, .add_cell_commands, .foldcode, .runcell, .cell_folder,
    .add_cell, .addcell, .runtime, pluto-input-container > button { display: none !important; }
    html, body, main, pluto-notebook, pluto-output, pluto-cell { background: white !important; }
    html, body { overflow: hidden !important; }
    pluto-cell { margin: 0 0 8px 0 !important; }
    ::-webkit-scrollbar { display: none !important; }
  ` });
  await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: "start" }), ID_WIDGET);
  await sleep(500);

  const clip = await page.evaluate(([a, b]) => {
    const r1 = document.getElementById(a).getBoundingClientRect();
    const r2 = document.getElementById(b).getBoundingClientRect();
    const m = 12;
    const left = Math.min(r1.left, r2.left) - m, top = Math.min(r1.top, r2.top) - m;
    const right = Math.max(r1.right, r2.right) + m, bottom = Math.max(r1.bottom, r2.bottom) + m;
    return { x: Math.max(0, Math.round(left)), y: Math.max(0, Math.round(top)), width: Math.round(right - left), height: Math.round(bottom - top) };
  }, [ID_WIDGET, ID_HIST]);
  console.error(`clip: ${JSON.stringify(clip)}`);

  const roiRect = await page.evaluate(() => {
    const host = document.querySelector(".ip-host");
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const rects = [...sr.querySelectorAll("svg.masque-plain rect")].map((e) => e.getBoundingClientRect()).filter((q) => q.width > 20 && q.height > 20);
    rects.sort((p, q) => q.width * q.height - p.width * p.height);
    const q = rects[0];
    return { x: q.x, y: q.y, w: q.width, h: q.height };
  });
  const sx = roiRect.w / (REST.xmax - REST.xmin), sy = roiRect.h / (REST.ymax - REST.ymin);
  const css = (x, y) => ({ x: roiRect.x + (x - REST.xmin) * sx, y: roiRect.y + (REST.ymax - y) * sy });

  const histSrc = () => page.evaluate((id) => document.getElementById(id)?.querySelector("img")?.src ?? "", ID_HIST);

  const frames = [];
  const t0 = Date.now();
  let cur = css(10.2, 2.0);
  let done = false;
  const capture = (async () => {
    for (let i = 0; !done; i++) {
      const started = Date.now();
      const path = join(framesDir, `frame_${String(i).padStart(4, "0")}.png`);
      const cx = cur.x, cy = cur.y;
      await page.screenshot({ path, clip });
      // The cursor is painted after capture: decoding and re-encoding each PNG here would
      // halve the frame rate during a drag.
      frames.push({ file: `frame_${String(i).padStart(4, "0")}.png`, t: started - t0, cx, cy });
      const rest = 40 - (Date.now() - started);
      if (rest > 0) await sleep(rest);
    }
  })();

  const glide = async (to, ms, steps = 24) => {
    const from = { ...cur };
    for (let k = 1; k <= steps; k++) {
      cur = { x: from.x + (to.x - from.x) * k / steps, y: from.y + (to.y - from.y) * k / steps };
      await page.mouse.move(cur.x, cur.y);
      await sleep(ms / steps);
    }
  };
  // Release, then hold until Julia has redrawn the histogram, plus a beat to read it.
  const releaseAndWait = async (hold = 1400) => {
    const before = await histSrc();
    await page.mouse.up();
    const until = Date.now() + 30000;
    while ((await histSrc()) === before && Date.now() < until) await sleep(100);
    if ((await histSrc()) === before) throw new Error("the histogram never redrew after a release");
    await sleep(hold);
  };

  await page.mouse.move(cur.x, cur.y);
  await sleep(900);
  // 1. Grab the resting box over the upper cluster and set it down: the histogram shows it.
  const mid = css((REST.xmin + REST.xmax) / 2, (REST.ymin + REST.ymax) / 2);
  await glide(mid, 700);
  await page.mouse.down();
  await glide({ x: mid.x + 6, y: mid.y + 4 }, 250, 6);
  await releaseAndWait();
  console.error("phase: upper cluster");
  // 2. Drag the box onto the lower cluster.
  await page.mouse.down();
  const lower = { x: mid.x + (3.3 - 7.2) * sx, y: mid.y - (3.0 - 6.1) * sy };
  await glide(lower, 2200, 60);
  await releaseAndWait();
  console.error("phase: lower cluster");
  // 3. Pull the top-right corner in to half the cluster.
  const box = await page.evaluate(() => {
    const host = document.querySelector(".ip-host");
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const rects = [...sr.querySelectorAll("svg.masque-plain rect")].map((e) => e.getBoundingClientRect()).filter((q) => q.width > 20 && q.height > 20);
    rects.sort((p, q) => q.width * q.height - p.width * p.height);
    const q = rects[0];
    return { x: q.x, y: q.y, w: q.width, h: q.height };
  });
  await glide({ x: box.x + box.w, y: box.y }, 700);
  await page.mouse.down();
  await glide({ x: box.x + box.w * 0.5, y: box.y + box.h * 0.35 }, 1600, 45);
  await releaseAndWait(1800);
  console.error("phase: half cluster");

  done = true;
  await capture;
  for (const f of frames) paintCursor(join(framesDir, f.file), f.cx, f.cy, clip);
  writeFileSync(join(framesDir, "timestamps.json"), JSON.stringify(frames));
  console.error(`captured ${frames.length} frames over ${(frames.at(-1).t / 1000).toFixed(1)}s`);
} catch (e) {
  failed = e;
} finally {
  await browser.close();
}
if (failed) { console.error("CLIP FAIL:", failed.message); process.exit(1); }
