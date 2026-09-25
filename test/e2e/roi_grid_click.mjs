// ROI-over-grid live check (LOCAL — not CI). A `selects` box brushing a grid owns the `@bind`
// value: dragging the box commits a GridWindowEvent; a click on a grid cell outside the box
// hovers (tooltip) but commits nothing, so the bond stays the brushed window and a readout
// that does `region.i1:region.i2` keeps working. Before the fix, that click posted a single
// cell and the bond became a GridCellEvent (`ArgumentError: … has no field i1`).
//
//   node roi_grid_click.mjs <base-url> <notebook-abs-path> <cairo|webgl> [artifact-dir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [base, notebook, backend, artifactDirArg] = process.argv.slice(2);
if (!base || !notebook || !backend) {
  console.error("usage: node roi_grid_click.mjs <base-url> <notebook> <cairo|webgl> [artifact-dir]");
  process.exit(2);
}
const artifactDir = artifactDirArg || process.env.E2E_ARTIFACT_DIR || null;
if (artifactDir) mkdirSync(artifactDir, { recursive: true });

const SHIM_LEAK = /\b(?:Bonito|comm)\.\w+ is not a function/;
const ALLOWED = [/Bonito\.decode_binary is not a function/, /Bonito\.fetch_binary is not a function/];
const PLUTO_MS = 60000;

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const passed = [];
const unexpected = [];
const problems = [];
let failed = null;
let page;
try {
  const context = await browser.newContext({
    locale: "en-US", timezoneId: "UTC", viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 2,
  });
  page = await context.newPage();
  page.on("pageerror", (e) => {
    const benign = SHIM_LEAK.test(e.message) && ALLOWED.some((re) => re.test(e.message));
    if (!benign) unexpected.push(e.message);
    console.error(benign ? "PAGEERROR (known-benign):" : "PAGEERROR:", e.message);
  });

  await page.goto(`${base}/open?path=${encodeURIComponent(notebook)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const deadline = Date.now() + 1500000;
  let ready = false, tick = 0;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      const runBtn = [...document.querySelectorAll("button, a")].find((b) => /run notebook code/i.test(b.innerText || b.title || ""));
      if (runBtn && !window.__masqueClickedRun) { runBtn.click(); window.__masqueClickedRun = true; }
      const host = document.querySelector(".ip-host");
      let sr = null; host?.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      return {
        busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
        errored: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).join("\n"),
        surface: !!sr?.querySelector(".surface"),
        meta: !!document.querySelector("#roi_grid_meta"),
      };
    });
    if (st.errored) throw new Error(`${backend} errored at load: ${st.errored.slice(0, 500)}`);
    if (!st.busy && st.surface && st.meta) { ready = true; break; }
    if (tick % 20 === 0) console.error(`  …${backend} [${tick}s] busy=${st.busy} surface=${st.surface} meta=${st.meta}`);
    tick++;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error(`${backend} timed out waiting for the widget`);
  if (backend === "webgl") await page.waitForTimeout(3000); // let Bonito's canvas churn settle
  const pageBackend = await page.evaluate(() => document.querySelector("#roi_grid_backend")?.textContent?.trim());
  if (pageBackend !== backend) throw new Error(`notebook backend ${pageBackend} != requested ${backend}`);

  const meta = await page.evaluate(() => JSON.parse(document.querySelector("#roi_grid_meta").textContent));
  const grid = meta.layers.find((l) => l.id === "img");
  const roi = meta.layers.find((l) => l.id === "roi");
  if (!grid || !roi) throw new Error(`manifest lacks :img/:roi layers: ${meta.layers.map((l) => l.id)}`);
  console.error(`manifest: selection=${meta.selection} target=${meta.selectionTarget} img.events=${JSON.stringify(grid.events)}`);
  if (meta.selection !== "grid" || meta.selectionTarget !== "img") {
    throw new Error(`manifest selection ${meta.selection}/${meta.selectionTarget}, expected grid/img`);
  }
  // Recorded, not thrown: the click step below still runs, so a failure shows what the click did.
  if (grid.events.includes("click")) problems.push(`brushed grid :img still lists "click" in events ${JSON.stringify(grid.events)}`);
  else if (!grid.events.includes("hover")) problems.push(`brushed grid :img lost "hover": ${JSON.stringify(grid.events)}`);
  else passed.push("manifest/brushed-grid-hover-only");

  // image px (top-left) -> page coords
  const baseBox = async () => page.evaluate(() => {
    const r = document.querySelector(".ip-host img, .ip-host canvas").getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const bb = await baseBox();
  const toPage = (p) => ({ x: bb.x + (p.x * bb.w) / meta.width, y: bb.y + (p.y * bb.h) / meta.height });
  const out = () => page.evaluate(() => document.querySelector("#out_region")?.textContent ?? "");
  const readout = () => page.evaluate(() => document.querySelector("#readout_region")?.textContent ?? "");
  const errored = () => page.evaluate(() => [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).join("\n"));
  const hostValue = () => page.evaluate(() => JSON.stringify(document.querySelector(".ip-host")?.value ?? null));
  const selGeoms = () => page.evaluate(() => {
    const host = document.querySelector(".ip-host");
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    return [...sr.querySelectorAll("svg g.sel > *")].map((el) => `${el.tagName}:${["x", "y", "width", "height"].map((a) => el.getAttribute(a)).join(",")}`);
  });
  const tip = () => page.evaluate(() => {
    const host = document.querySelector(".ip-host");
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const t = sr.querySelector(".masque-tip");
    return { text: t?.innerText ?? "", visible: !!t && getComputedStyle(t).opacity !== "0" && getComputedStyle(t).display !== "none" };
  });
  const waitFor = async (fn, pred, what) => {
    const end = Date.now() + PLUTO_MS;
    let v;
    while (Date.now() < end) {
      v = await fn();
      if (pred(v)) return v;
      await page.waitForTimeout(250);
    }
    throw new Error(`${backend}: timed out waiting for ${what}; last=${JSON.stringify(v)}`);
  };
  const cellCentre = (i, j) => ({ x: (grid.geometry.xedges[i] + grid.geometry.xedges[i + 1]) / 2, y: (grid.geometry.yedges[j] + grid.geometry.yedges[j + 1]) / 2 });
  const g = roi.geometry;

  // 1. Brush: drag the box one cell right. The bond becomes a GridWindowEvent.
  const cw = Math.abs(grid.geometry.xedges[1] - grid.geometry.xedges[0]);
  const from = toPage({ x: g.x + g.w / 2, y: g.y + g.h / 2 });
  const to = toPage({ x: g.x + g.w / 2 + cw, y: g.y + g.h / 2 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, from.y, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  const brushed = await waitFor(out, (s) => /GridWindowEvent/.test(s), "brush -> GridWindowEvent");
  const brushedReadout = await waitFor(readout, (s) => /READOUT=i=/.test(s), "brush readout");
  console.error(`brushed: ${brushed} | ${brushedReadout}`);
  const brushedHost = await hostValue();
  const brushedSel = await selGeoms();
  passed.push("brush/GridWindowEvent");

  // 2. Hover a grid cell well outside the box: the tooltip still shows the cell.
  const outside = toPage(cellCentre(10, 1));
  await page.mouse.move(outside.x, outside.y, { steps: 3 });
  const t = await waitFor(tip, (v) => v.visible && v.text.length > 0, "hover tooltip on brushed grid");
  console.error(`hover tip: ${JSON.stringify(t.text)}`);
  passed.push("hover/tooltip");

  // 3. Click it. The box owns the bond: host.value, the bond, the readout and the drawn
  //    selection are unchanged, and no cell errors.
  await page.mouse.click(outside.x, outside.y);
  await page.waitForTimeout(backend === "webgl" ? 4000 : 3000); // any round-trip would land by now
  const [afterHost, afterOut, afterReadout, afterErr, afterSel] = [await hostValue(), await out(), await readout(), await errored(), await selGeoms()];
  console.error(`after click: host=${afterHost} | ${afterOut} | ${afterReadout}`);
  if (afterErr) throw new Error(`click on brushed grid errored a cell: ${afterErr.slice(0, 400)}`);
  if (afterHost !== brushedHost) throw new Error(`click on brushed grid changed host.value: ${brushedHost} -> ${afterHost}`);
  if (afterOut !== brushed) throw new Error(`click on brushed grid changed the bond: ${brushed} -> ${afterOut}`);
  if (afterReadout !== brushedReadout) throw new Error(`click on brushed grid changed the readout: ${brushedReadout} -> ${afterReadout}`);
  if (JSON.stringify(afterSel) !== JSON.stringify(brushedSel)) {
    throw new Error(`click on brushed grid redrew the selection: ${JSON.stringify(brushedSel)} -> ${JSON.stringify(afterSel)}`);
  }
  passed.push("click/no-commit");
  if (artifactDir) await page.screenshot({ path: join(artifactDir, `roi_grid_${backend}.png`) });

  // 4. The box still commits after that click.
  const from2 = to;
  const to2 = toPage({ x: g.x + g.w / 2 + cw, y: g.y + g.h / 2 + cw });
  await page.mouse.move(from2.x, from2.y);
  await page.mouse.down();
  await page.mouse.move(to2.x, to2.y, { steps: 6 });
  await page.mouse.up();
  const rebrushed = await waitFor(out, (s) => /GridWindowEvent/.test(s) && s !== brushed, "second brush");
  console.error(`rebrushed: ${rebrushed} | ${await readout()}`);
  passed.push("rebrush/GridWindowEvent");

  if (problems.length) throw new Error(problems.join(" | "));
  if (unexpected.length) throw new Error(`page errors: ${unexpected.join(" | ")}`);
} catch (e) {
  failed = e;
  if (artifactDir && page) await page.screenshot({ path: join(artifactDir, `roi_grid_${backend}_fail.png`) }).catch(() => {});
} finally {
  await browser.close();
}
console.log(`roi_grid ${backend}: passed ${passed.join(", ")}`);
if (failed) {
  console.error(`roi_grid ${backend}: FAILED — ${failed.message}`);
  process.exit(1);
}
