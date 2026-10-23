// Record a docs clip from a live Pluto notebook: real pointer and key input on the widget,
// with every redraw and readout in the clip computed by Julia. The guide pages show these
// clips where the example redraws the figure (controls, `onchange`, linked cameras) or holds
// several picks at once (`select = :many`), which a docs player cannot record
// (docs/dev/clips/README.md). Run from test/e2e with a Pluto server whose notebooks can load
// Masque (serve.jl + MASQUE_DEV_ENV):
//
//   node docs_clip.mjs <pluto-url> <notebook-abs-path> <frames-dir> <clip>
//
// then docs/dev/clips/assemble_mp4.sh <frames-dir> docs/src/assets/<clip>.mp4. <clip> is a
// key of CLIPS below; its notebook is docs/dev/clips/<notebook> in the same table.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { paintCursor } from "./clip_frames.mjs";
import { shutdownOpenSession } from "./fresh_session.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each clip: the notebook's cell-id prefix (`c1d500NN`, cells 3 = widget, 4 = readout,
// 5 = the hidden manifest the recorder aims from) and the moves it makes.
const CLIPS = {
  "controls": {
    notebook: "controls_notebook.jl", nn: 1,
    async run(c) {
      // Drag the frequency up and back while the curve follows, then flip the toggle.
      await c.glide(c.slider("freq", 0), 700);
      await c.page.mouse.down();
      await c.glide(c.slider("freq", 6), 2600, 60);
      await c.page.mouse.up();
      await c.settle(1200);
      await c.glide(c.control("dots"), 900);
      await c.click(c.control("dots"));
      await c.settle(1400);
      await c.glide(c.slider("freq", 6), 900);
      await c.page.mouse.down();
      await c.glide(c.slider("freq", 3), 1800, 45);
      await c.page.mouse.up();
      await c.settle(1800);
    },
  },
  "onchange": {
    notebook: "onchange_notebook.jl", nn: 2,
    async run(c) {
      // Pick four points one at a time (the line refits from the second), then take one out.
      for (const k of [1, 6, 3, 7]) {
        await c.glide(c.circle("pts", k), 800);
        await c.click(c.circle("pts", k));
        await c.settle(1100);
      }
      await c.glide(c.circle("pts", 3), 800);
      await c.click(c.circle("pts", 3));
      await c.settle(1800);
    },
  },
  "linkcameras": {
    notebook: "linkcameras_notebook.jl", nn: 3,
    async run(c) {
      // Turn the left panel; the right one follows.
      const a = c.px(c.mf.width * 0.25, c.mf.height * 0.55);
      await c.glide(a, 700);
      await c.page.mouse.down();
      await c.glide({ x: a.x + 150, y: a.y }, 2200, 55);
      await c.glide({ x: a.x + 150, y: a.y + 60 }, 1200, 30);
      await c.page.mouse.up();
      await c.settle(1200);
      await c.page.mouse.down();
      await c.glide({ x: a.x - 40, y: a.y + 20 }, 2200, 55);
      await c.page.mouse.up();
      await c.settle(1800);
    },
  },
  "linkaxes": {
    notebook: "linkaxes_notebook.jl", nn: 8,
    async run(c) {
      // Pan the left axis; the right one follows.
      const a = c.px(c.mf.width * 0.27, c.mf.height * 0.5);
      await c.glide(a, 700);
      await c.page.mouse.down();
      await c.glide({ x: a.x - 120, y: a.y - 30 }, 2000, 50);
      await c.page.mouse.up();
      await c.settle(1200);
      await c.page.mouse.down();
      await c.glide({ x: a.x + 20, y: a.y + 10 }, 1800, 45);
      await c.page.mouse.up();
      await c.settle(1800);
    },
  },
  "selection-many": {
    notebook: "selection_many_notebook.jl", nn: 4,
    async run(c) {
      // Click three cities, click one again to take it out, then drag a box over two more.
      for (const k of [0, 2, 3]) {
        await c.glide(c.circle("cities", k), 800);
        await c.click(c.circle("cities", k));
        await c.settle(900);
      }
      await c.glide(c.circle("cities", 2), 800);
      await c.click(c.circle("cities", 2));
      await c.settle(1200);
      // A box over Mexico City, Lima and São Paulo adds the two not picked yet.
      const from = c.data("cities", -106, 30);
      const to = c.data("cities", -35, -30);
      await c.glide(from, 900);
      await c.page.mouse.down();
      await c.glide(to, 1600, 40);
      await c.page.mouse.up();
      await c.settle(2000);
    },
  },
  "grid-many": {
    notebook: "grid_many_notebook.jl", nn: 5,
    async run(c) {
      // Click three cells, take one out, then box a block.
      for (const [i, j] of [[1, 1], [2, 1], [7, 4]]) {
        await c.glide(c.gridCell("region", i, j), 700);
        await c.click(c.gridCell("region", i, j));
        await c.settle(900);
      }
      await c.glide(c.gridCell("region", 2, 1), 700);
      await c.click(c.gridCell("region", 2, 1));
      await c.settle(1200);
      await c.glide(c.gridCell("region", 4, 2), 900);
      await c.page.mouse.down();
      await c.glide(c.gridCell("region", 6, 4), 1500, 40);
      await c.page.mouse.up();
      await c.settle(1800);
    },
  },
  "grid-regions": {
    notebook: "grid_regions_notebook.jl", nn: 6,
    async run(c) {
      // Hover an object, click two, click the background, then take the first one out.
      await c.glide(c.gridCell("objects", 4, 4), 900);
      await sleep(700);
      await c.click(c.gridCell("objects", 4, 4));
      await c.settle(1000);
      await c.glide(c.gridCell("objects", 16, 12), 900);
      await sleep(500);
      await c.click(c.gridCell("objects", 16, 12));
      await c.settle(1000);
      await c.glide(c.gridCell("objects", 12, 8), 800);
      await c.click(c.gridCell("objects", 12, 8));
      await c.settle(1000);
      await c.glide(c.gridCell("objects", 5, 3), 900);
      await c.click(c.gridCell("objects", 5, 3));
      await c.settle(1800);
    },
  },
  // The two short loops on Pan and orbit show only the figure. The pointer rests on the `grab`
  // point (a fraction of the figure) and every drag ends there on the view it started from, so
  // the last frame matches the first and the clip loops cleanly.
  "view-pan": {
    notebook: "view_pan_notebook.jl", nn: 9, figure: true, grab: [0.45, 0.5],
    async run(c) {
      // Pan the points to the right and back.
      const a = { ...c.rest };
      await c.page.mouse.down();
      await c.glide({ x: a.x + 110, y: a.y - 25 }, 900, 30);
      await c.glide(a, 900, 30);
      await c.page.mouse.up();
    },
  },
  "view-orbit": {
    notebook: "view_orbit_notebook.jl", nn: 10, figure: true, grab: [0.5, 0.55],
    async run(c) {
      // Turn the camera one way and back.
      const a = { ...c.rest };
      await c.page.mouse.down();
      await c.glide({ x: a.x + 120, y: a.y + 30 }, 1000, 30);
      await c.glide(a, 1000, 30);
      await c.page.mouse.up();
    },
  },
  "grid-brush": {
    notebook: "grid_brush_notebook.jl", nn: 7,
    async run(c) {
      // Move the box to the middle of the grid, then pull its corner out.
      let r = await c.roiRect();
      const mid = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      await c.glide(mid, 900);
      await c.page.mouse.down();
      await c.glide({ x: mid.x + r.w * 1.1, y: mid.y - r.h * 1.2 }, 1800, 45);
      await c.page.mouse.up();
      await c.settle(1400);
      r = await c.roiRect();
      await c.glide({ x: r.x + r.w, y: r.y }, 900);
      await c.page.mouse.down();
      await c.glide({ x: r.x + r.w * 1.7, y: r.y - r.h * 0.9 }, 1600, 40);
      await c.page.mouse.up();
      await c.settle(1800);
    },
  },
};

const [base, notebook, framesDir, name] = process.argv.slice(2);
const spec = CLIPS[name];
if (!base || !notebook || !framesDir || !spec) {
  console.error(`usage: node docs_clip.mjs <pluto-url> <notebook-abs-path> <frames-dir> <${Object.keys(CLIPS).join("|")}>`);
  process.exit(2);
}
mkdirSync(framesDir, { recursive: true });
const cellId = (k) => `c1d500${String(spec.nn).padStart(2, "0")}-0001-4000-8000-00000000000${k}`;
const ID_WIDGET = cellId(3);
const ID_READOUT = cellId(4);
const runNotebook = join(tmpdir(), `masque-clip-${name}-${Date.now()}-${process.pid}.jl`);
copyFileSync(notebook, runNotebook);

const browser = await chromium.launch({ headless: true });
let failed = null;
let stopCapture = () => {};
try {
  const context = await browser.newContext({
    locale: "en-US", timezoneId: "UTC",
    viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("CONSOLE:", m.text()); });
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
        err: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).join("\n").slice(0, 800),
        mounted: !!sr?.querySelector(".surface"),
        manifest: !!document.getElementById("clip_manifest"),
      };
    });
    if (st.err) throw new Error(`notebook errored: ${st.err}`);
    if (!st.busy && st.mounted && st.manifest) break;
    if (Date.now() > deadline) throw new Error("timed out waiting for the widget to mount");
    if (tick % 10 === 0) console.error(`  …waiting (${tick}s) busy=${st.busy}`);
    await sleep(1000);
  }
  console.error("phase: widget mounted");

  const hasReadout = await page.evaluate((id) => !!document.getElementById(id), ID_READOUT);
  const shown = hasReadout ? [ID_WIDGET, ID_READOUT] : [ID_WIDGET];
  await page.addStyleTag({ content: `
    header, footer, pluto-helpbox, nav { display: none !important; }
    ${shown.map((id) => `pluto-cell:not(#${id})`).join("")} { display: none !important; }
    pluto-cell > pluto-input, pluto-shoulder, .add_cell_commands, .foldcode, .runcell, .cell_folder,
    .add_cell, .addcell, .runtime, pluto-input-container > button, pluto-runarea { display: none !important; }
    html, body, main, pluto-notebook, pluto-output, pluto-cell { background: white !important; }
    html, body { overflow: hidden !important; }
    pluto-cell { margin: 0 0 8px 0 !important; }
    pluto-output pre { font-size: 15px !important; }
    ::-webkit-scrollbar { display: none !important; }
  ` });
  await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: "start" }), ID_WIDGET);
  await sleep(600);

  // A clip shows the widget's cell and the readout's; a `figure` clip shows only the figure.
  const clip = await page.evaluate(([ids, figure]) => {
    const rs = figure
      ? [document.getElementById(ids[0]).querySelector(".ip-host img, .ip-host canvas").getBoundingClientRect()]
      : ids.map((id) => document.getElementById(id).getBoundingClientRect());
    const m = figure ? 0 : 12;
    const left = Math.min(...rs.map((r) => r.left)) - m, top = Math.min(...rs.map((r) => r.top)) - m;
    const right = Math.max(...rs.map((r) => r.right)) + m, bottom = Math.max(...rs.map((r) => r.bottom)) + m;
    return { x: Math.max(0, Math.round(left)), y: Math.max(0, Math.round(top)), width: Math.round(right - left), height: Math.round(bottom - top) };
  }, [shown, !!spec.figure]);
  console.error(`clip: ${JSON.stringify(clip)}`);

  const mf = await page.evaluate(() => JSON.parse(document.getElementById("clip_manifest").textContent));
  const imgRect = await page.evaluate((id) => {
    const r = document.getElementById(id).querySelector(".ip-host img, .ip-host canvas").getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width };
  }, ID_WIDGET);
  const k = imgRect.w / mf.width;
  const layerOf = (id) => {
    const L = mf.layers.find((l) => l.id === id);
    if (!L) throw new Error(`no layer ${id} in ${mf.layers.map((l) => l.id)}`);
    return L;
  };
  // Every target below is in image px (the manifest's units), then CSS.
  const px = (x, y) => ({ x: imgRect.x + x * k, y: imgRect.y + y * k });
  const ctrlBoxes = await page.evaluate((id) => {
    const host = document.getElementById(id).querySelector(".ip-host");
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const out = {};
    sr.querySelectorAll("[data-masque-control]").forEach((el) => {
      const r = el.getBoundingClientRect();
      out[el.dataset.masqueControl] = { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    return out;
  }, ID_WIDGET);
  const c = {
    page, mf, px,
    circle(id, i) {
      const g = layerOf(id).geometry;
      return px(g[3 * i], g[3 * i + 1]);
    },
    // A data coordinate on the axis of layer `id` (linear axes).
    data(id, x, y) {
      const t = mf.transforms[String(layerOf(id).axis)];
      const [vx, vy, vw, vh] = t.viewport;
      const fx = (x - t.xlims[0]) / (t.xlims[1] - t.xlims[0]);
      const fy = (y - t.ylims[0]) / (t.ylims[1] - t.ylims[0]);
      return px(vx + fx * vw, vy + (1 - fy) * vh);
    },
    // The centre of grid cell (i, j), 1-based as in Julia.
    gridCell(id, i, j) {
      const g = layerOf(id).geometry;
      return px((g.xedges[i - 1] + g.xedges[i]) / 2, (g.yedges[j - 1] + g.yedges[j]) / 2);
    },
    control(id) {
      const b = ctrlBoxes[id];
      if (!b) throw new Error(`no control ${id}`);
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    },
    // Where a slider's knob sits at index i (frontend/src/controls.ts, `indexAt`).
    slider(id, i) {
      const b = ctrlBoxes[id];
      const n = layerOf(id).geometry.n;
      const knob = Math.min(b.w, b.h);
      return { x: b.x + knob / 2 + (i / Math.max(1, n - 1)) * (b.w - knob), y: b.y + b.h / 2 };
    },
    roiRect: () => page.evaluate((id) => {
      const host = document.getElementById(id).querySelector(".ip-host");
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const rects = [...sr.querySelectorAll("svg.masque-plain rect")].map((e) => e.getBoundingClientRect()).filter((q) => q.width > 20 && q.height > 20);
      rects.sort((p, q) => q.width * q.height - p.width * p.height);
      const q = rects[0];
      return { x: q.x, y: q.y, w: q.width, h: q.height };
    }, ID_WIDGET),
  };

  // What Julia changes: the figure's frame and the readout's text.
  const signature = () => page.evaluate((ids) => ids.map((id) => {
    const el = document.getElementById(id);
    const img = el?.querySelector("img");
    return (img?.src?.length ?? 0) + ":" + (img?.src?.slice(-64) ?? "") + "|" + (el?.querySelector("pluto-output")?.innerText ?? "");
  }).join("#"), shown);

  const frames = [];
  const t0 = Date.now();
  const rest = spec.grab
    ? px(mf.width * spec.grab[0], mf.height * spec.grab[1])
    : { x: clip.x + clip.width - 30, y: clip.y + clip.height - 20 };
  c.rest = rest;
  let cur = { ...rest };
  let done = false;
  stopCapture = () => { done = true; };
  const capture = (async () => {
    for (let i = 0; !done; i++) {
      const started = Date.now();
      const file = `frame_${String(i).padStart(4, "0")}.png`;
      const cx = cur.x, cy = cur.y;
      await page.screenshot({ path: join(framesDir, file), clip });
      frames.push({ file, t: started - t0, cx, cy });
      const gap = 40 - (Date.now() - started);
      if (gap > 0) await sleep(gap);
    }
  })().catch((e) => { if (!done) throw e; });

  c.glide = async (to, ms, steps = 24) => {
    const from = { ...cur };
    for (let s = 1; s <= steps; s++) {
      cur = { x: from.x + (to.x - from.x) * s / steps, y: from.y + (to.y - from.y) * s / steps };
      await page.mouse.move(cur.x, cur.y);
      await sleep(ms / steps);
    }
  };
  let lastSig = await signature();
  c.click = async (at) => {
    cur = { ...at };
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await sleep(90);
    await page.mouse.up();
  };
  // Hold until Julia has answered the last move (a new frame or readout), plus `hold` to read it.
  c.settle = async (hold) => {
    const until = Date.now() + 30000;
    let sig = await signature();
    while (sig === lastSig && Date.now() < until) { await sleep(100); sig = await signature(); }
    if (sig === lastSig) throw new Error("nothing redrew after the last move");
    await sleep(300);
    lastSig = await signature();
    await sleep(hold);
  };

  await page.mouse.move(cur.x, cur.y);
  if (spec.grab) {
    await sleep(500);
    await spec.run(c);
    await sleep(500);
  } else {
    await sleep(900);
    await spec.run(c);
    // End off the figure, so the last frames show no hover.
    await c.glide(rest, 700);
    await sleep(1200);
  }

  done = true;
  await capture;
  for (const f of frames) paintCursor(join(framesDir, f.file), f.cx, f.cy, clip);
  writeFileSync(join(framesDir, "timestamps.json"), JSON.stringify(frames));
  console.error(`captured ${frames.length} frames over ${(frames.at(-1).t / 1000).toFixed(1)}s`);
} catch (e) {
  failed = e;
  stopCapture();
  await sleep(300);
} finally {
  await browser.close();
  // Each open notebook keeps a Julia process; free it for the next clip.
  await shutdownOpenSession(base, runNotebook).catch((e) => console.error(`shutdown: ${e.message}`));
}
if (failed) { console.error("CLIP FAIL:", failed.message); process.exit(1); }
