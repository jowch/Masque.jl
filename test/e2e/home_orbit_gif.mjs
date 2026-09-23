// Record Home orbit.gif from a live Pluto notebook: fake cursor + real pointer
// drag on ViewInteractable (CairoMakie streams frames over with_js_link).
// Overlay-only harvest cannot do this. Run from test/e2e:
//
//   node home_orbit_gif.mjs <pluto-url> <notebook-abs-path> <frames-dir>
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [base, notebook, framesDir] = process.argv.slice(2);
if (!base || !notebook || !framesDir) {
  console.error("usage: node home_orbit_gif.mjs <pluto-url> <notebook-abs-path> <frames-dir>");
  process.exit(2);
}
mkdirSync(framesDir, { recursive: true });

const ID_MASQUE = "a1000000-0000-0000-0000-000000000003";
const runNotebook = join(tmpdir(), `masque-home-orbit-${Date.now()}-${process.pid}.jl`);
copyFileSync(notebook, runNotebook);
console.error(`fresh-kernel copy: ${notebook} -> ${runNotebook}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hotspot is the first point. A DOM cursor never landed inside this cell clip
// (Pluto's fixed containing block, plus pointer capture on the overlay), so the
// arrow is painted onto each screenshot at the Playwright coordinates.
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

  await page.goto(`${base.replace(/\/$/, "")}/open?path=${encodeURIComponent(runNotebook)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  const deadline = Date.now() + 20 * 60 * 1000;
  let ready = false;
  let tick = 0;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      const runBtn = [...document.querySelectorAll("button, a")].find((b) =>
        /run notebook code/i.test(b.innerText || b.title || "")
      );
      if (runBtn) runBtn.click();
      const hosts = [...document.querySelectorAll(".ip-host")];
      let surfaces = 0;
      for (const h of hosts) {
        let sr = null;
        h.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        if (sr && sr.querySelector(".surface")) surfaces++;
      }
      return {
        busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
        errored: document.querySelectorAll("pluto-cell.errored").length,
        errText: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).slice(0, 1).join(""),
        hosts: hosts.length,
        surfaces,
        title: document.title,
      };
    });
    if (st.errored) throw new Error(`notebook errored: ${st.errText.slice(0, 800)}`);
    if (/failed to load notebook/i.test(st.title) && tick >= 5) {
      throw new Error(`Pluto failed to load notebook (title=${JSON.stringify(st.title)})`);
    }
    if (!st.busy && st.hosts >= 1 && st.surfaces >= st.hosts) {
      ready = true;
      break;
    }
    if (tick % 10 === 0) {
      console.error(`  …[${tick}s] busy=${st.busy} hosts=${st.hosts} surfaces=${st.surfaces} title=${JSON.stringify(st.title)}`);
    }
    tick++;
    await sleep(1000);
  }
  if (!ready) throw new Error("timed out waiting for the orbit widget to mount");
  console.error("phase: widget mounted");

  await page.addStyleTag({
    content: `
      header, footer, pluto-helpbox, nav { display: none !important; }
      pluto-cell:not(#${ID_MASQUE}) { display: none !important; }
      pluto-shoulder, .add_cell_commands, .foldcode, .runcell, .cell_folder,
      .add_cell, .addcell, .runtime { display: none !important; }
      pluto-input-container > button { display: none !important; }
      html, body, main, pluto-notebook, pluto-cell, pluto-output {
        background: white !important;
        overflow: hidden !important;
      }
      pluto-cell { margin: 0 !important; }
      ::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
    `,
  });

  await page.evaluate((id) => {
    document.getElementById(id)?.scrollIntoView({ block: "start", inline: "nearest" });
  }, ID_MASQUE);
  await sleep(300);

  const rect = await page.evaluate((id) => {
    const cell = document.getElementById(id);
    const host = document.querySelector(".ip-host");
    const r1 = cell.getBoundingClientRect();
    const r2 = host.getBoundingClientRect();
    return {
      left: Math.min(r1.left, r2.left),
      top: Math.min(r1.top, r2.top),
      right: Math.max(r1.right, r2.right),
      bottom: Math.max(r1.bottom, r2.bottom),
    };
  }, ID_MASQUE);
  const margin = 12;
  const clip = {
    x: Math.max(0, Math.round(rect.left - margin)),
    y: Math.max(0, Math.round(rect.top - margin)),
    width: Math.round(rect.right - rect.left + 2 * margin),
    height: Math.round(rect.bottom - rect.top + 2 * margin),
  };
  console.error(`clip: ${JSON.stringify(clip)}`);

  const plotBox = await page.evaluate(() => {
    const host = document.querySelector(".ip-host");
    const media = host.querySelector("img, canvas");
    const b = media.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  const start = { x: plotBox.x + plotBox.w * 0.38, y: plotBox.y + plotBox.h * 0.52 };
  const mid = { x: plotBox.x + plotBox.w * 0.72, y: plotBox.y + plotBox.h * 0.42 };
  const end = { x: plotBox.x + plotBox.w * 0.55, y: plotBox.y + plotBox.h * 0.68 };

  const gestureStamp = () => page.evaluate(() => {
    const host = document.querySelector(".ip-host");
    return host?.dataset.masqueGestureFrame ?? null;
  });

  // Park on the knot before recording so the GIF is the drag, not the approach.
  await page.mouse.move(start.x, start.y);
  await sleep(200);
  let cur = { ...start };

  const moveTo = async (target, durationMs, steps = 20) => {
    const from = { ...cur };
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + (target.x - from.x) * t;
      const y = from.y + (target.y - from.y) * t;
      await page.mouse.move(x, y);
      cur = { x, y };
      await sleep(durationMs / steps);
    }
  };

  const frames = [];
  const t0 = Date.now();
  let done = false;
  const captureLoop = async () => {
    let i = 0;
    while (!done) {
      const started = Date.now();
      const path = join(framesDir, `frame_${String(i).padStart(4, "0")}.png`);
      const cx = cur.x;
      const cy = cur.y;
      await page.screenshot({ path, clip });
      frames.push({ file: path, t: started - t0, cx, cy });
      i++;
      const elapsed = Date.now() - started;
      const budget = 1000 / 15;
      if (elapsed < budget) await sleep(budget - elapsed);
    }
    const path = join(framesDir, `frame_${String(i).padStart(4, "0")}.png`);
    const cx = cur.x;
    const cy = cur.y;
    await page.screenshot({ path, clip });
    frames.push({ file: path, t: Date.now() - t0, cx, cy });
  };

  const timeline = async () => {
    await sleep(250);
    const stamp0 = await gestureStamp();
    await page.mouse.down();
    await sleep(40);
    await moveTo(mid, 1800, 36);
    await sleep(80);
    await moveTo(end, 1200, 24);
    await page.mouse.up();
    let stamp1 = stamp0;
    for (let i = 0; i < 80; i++) {
      stamp1 = await gestureStamp();
      if (stamp1 && stamp1 !== stamp0) break;
      await sleep(100);
    }
    if (!stamp1 || stamp1 === stamp0) {
      throw new Error(`orbit drag produced no gesture frame (stamp stayed ${JSON.stringify(stamp0)})`);
    }
    console.error(`OK  orbit gesture-frame ${stamp0} → ${stamp1}`);
    await sleep(900);
    done = true;
  };

  await Promise.all([captureLoop(), timeline()]);
  for (const f of frames) paintCursor(f.file, f.cx, f.cy, clip);
  writeFileSync(join(framesDir, "timestamps.json"), JSON.stringify(frames, null, 2));
  console.error(`captured ${frames.length} frames over ${(frames.at(-1).t / 1000).toFixed(2)}s`);
  console.log(`RECORD OK — orbit ${frames.length} frames`);
} catch (e) {
  failed = e;
  if (page) {
    try {
      await page.screenshot({ path: join(framesDir, "..", "orbit-failure.png"), fullPage: true });
    } catch { /* ignore */ }
  }
} finally {
  await browser.close();
  try { rmSync(runNotebook, { force: true }); } catch { /* best-effort */ }
}
if (failed) {
  console.error("RECORD FAIL:", failed.message);
  process.exit(1);
}
