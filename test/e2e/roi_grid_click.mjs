// `selects`-box live check (LOCAL — not CI), over a grid and over points. The box owns the
// `@bind` value: dragging it commits a GridWindowEvent or a Vector{ElementEvent}; a click on the
// target layer outside the box hovers (tooltip, no pointer cursor) but commits nothing, so the
// value stays what the box holds. Before #194 a grid cell click turned the bond into a
// GridCellEvent (`ArgumentError: … has no field i1`); before #195 a point click replaced the
// brushed vector with a one-point vector while the box stayed put.
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
      const surfaces = [...document.querySelectorAll(".ip-host")].filter((host) => {
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        return !!sr?.querySelector(".surface");
      }).length;
      return {
        busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
        errored: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).join("\n"),
        surface: surfaces >= 2,
        meta: !!document.querySelector("#meta_grid") && !!document.querySelector("#meta_points"),
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

  const errored = () => page.evaluate(() => [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).join("\n"));
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
  const drag = async (from, to) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
  };

  // One widget per case, in notebook order. `outside` is a target mark well outside the box;
  // `unit` is one data unit in image px along x (the box moves by it).
  const CASES = [
    {
      key: "grid", target: "img", mode: "grid", bond: /GridWindowEvent/, readout: /READOUT=i=/,
      unit: (t) => Math.abs(t.geometry.xedges[1] - t.geometry.xedges[0]),
      outside: (t) => ({ x: (t.geometry.xedges[10] + t.geometry.xedges[11]) / 2, y: (t.geometry.yedges[1] + t.geometry.yedges[2]) / 2 }),
    },
    {
      key: "points", target: "pts", mode: "elements", bond: /ElementEvent\[/, readout: /READOUT=n=[1-9]/,
      unit: (_t, roi) => roi.geometry.w / 4,
      outside: (t) => ({ x: t.geometry[3 * 4], y: t.geometry[3 * 4 + 1] }),
    },
  ];

  for (const [hostIdx, c] of CASES.entries()) {
    const meta = await page.evaluate((k) => JSON.parse(document.querySelector(`#meta_${k}`).textContent), c.key);
    const target = meta.layers.find((l) => l.id === c.target);
    const roi = meta.layers.find((l) => l.id === "roi");
    if (!target || !roi) throw new Error(`${c.key}: manifest lacks :${c.target}/:roi layers: ${meta.layers.map((l) => l.id)}`);
    console.error(`${c.key} manifest: selection=${meta.selection} target=${meta.selectionTarget} events=${JSON.stringify(target.events)}`);
    if (meta.selection !== c.mode || meta.selectionTarget !== c.target) {
      throw new Error(`${c.key}: manifest selection ${meta.selection}/${meta.selectionTarget}, expected ${c.mode}/${c.target}`);
    }
    // Recorded, not thrown: the click step below still runs, so a failure shows what the click did.
    if (target.events.includes("click")) problems.push(`${c.key}: selects target :${c.target} still lists "click" in events ${JSON.stringify(target.events)}`);
    else if (!target.events.includes("hover")) problems.push(`${c.key}: selects target :${c.target} lost "hover": ${JSON.stringify(target.events)}`);
    else passed.push(`${c.key}/manifest-target-hover-only`);

    const inHost = (fn) => page.evaluate(fn, hostIdx);
    await inHost((i) => document.querySelectorAll(".ip-host")[i].scrollIntoView({ block: "center" }));
    await page.waitForTimeout(300);
    const bb = await inHost((i) => {
      const r = document.querySelectorAll(".ip-host")[i].querySelector("img, canvas").getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const toPage = (p) => ({ x: bb.x + (p.x * bb.w) / meta.width, y: bb.y + (p.y * bb.h) / meta.height });
    const out = () => page.evaluate((k) => document.querySelector(`#out_${k}`)?.textContent ?? "", c.key);
    const readout = () => page.evaluate((k) => document.querySelector(`#readout_${k}`)?.textContent ?? "", c.key);
    const hostValue = () => inHost((i) => JSON.stringify(document.querySelectorAll(".ip-host")[i]?.value ?? null));
    const shadowState = () => inHost((i) => {
      const host = document.querySelectorAll(".ip-host")[i];
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const t = sr.querySelector(".masque-tip");
      const attrs = ["x", "y", "width", "height", "cx", "cy", "r", "d"];
      return {
        sel: [...sr.querySelectorAll("svg g.sel > *")].map((el) => `${el.tagName}:${attrs.map((a) => el.getAttribute(a)).join(",")}`),
        tip: t?.innerText ?? "",
        tipVisible: !!t && getComputedStyle(t).opacity !== "0" && getComputedStyle(t).display !== "none",
        hot: sr.querySelector(".surface")?.classList.contains("hot") ?? false,
      };
    });
    const g = roi.geometry;
    const u = c.unit(target, roi);
    const centre = { x: g.x + g.w / 2, y: g.y + g.h / 2 };

    // 1. Brush: drag the box one unit right. The bond becomes the box's value.
    const moved = { x: centre.x + u, y: centre.y };
    await drag(toPage(centre), toPage(moved));
    const brushed = await waitFor(out, (s) => c.bond.test(s), `${c.key}: brush -> ${c.bond}`);
    const brushedReadout = await waitFor(readout, (s) => c.readout.test(s), `${c.key}: brush readout`);
    console.error(`${c.key} brushed: ${brushed.slice(0, 200)} | ${brushedReadout}`);
    const brushedHost = await hostValue();
    const brushedSel = (await shadowState()).sel;
    passed.push(`${c.key}/brush`);

    // 2. Hover a target mark well outside the box: the tooltip still shows, with no pointer cursor.
    const outside = toPage(c.outside(target));
    await page.mouse.move(outside.x, outside.y, { steps: 3 });
    const hov = await waitFor(shadowState, (v) => v.tipVisible && v.tip.length > 0, `${c.key}: hover tooltip on the target`);
    console.error(`${c.key} hover tip: ${JSON.stringify(hov.tip)} hot=${hov.hot}`);
    if (hov.hot) problems.push(`${c.key}: hovering the selects target shows the pointer cursor`);
    else passed.push(`${c.key}/hover-tooltip-no-pointer`);

    // 3. Click it. The box owns the bond: host.value, the bond, the readout and the drawn
    //    selection are unchanged, and no cell errors.
    await page.mouse.click(outside.x, outside.y);
    await page.waitForTimeout(backend === "webgl" ? 4000 : 3000); // any round-trip would land by now
    const [afterHost, afterOut, afterReadout, afterErr, after] = [await hostValue(), await out(), await readout(), await errored(), await shadowState()];
    console.error(`${c.key} after click: host=${afterHost.slice(0, 200)} | ${afterOut.slice(0, 200)} | ${afterReadout}`);
    if (afterErr) throw new Error(`${c.key}: click on the target errored a cell: ${afterErr.slice(0, 400)}`);
    if (afterHost !== brushedHost) throw new Error(`${c.key}: click on the target changed host.value: ${brushedHost} -> ${afterHost}`);
    if (afterOut !== brushed) throw new Error(`${c.key}: click on the target changed the bond: ${brushed} -> ${afterOut}`);
    if (afterReadout !== brushedReadout) throw new Error(`${c.key}: click on the target changed the readout: ${brushedReadout} -> ${afterReadout}`);
    if (JSON.stringify(after.sel) !== JSON.stringify(brushedSel)) {
      throw new Error(`${c.key}: click on the target redrew the selection: ${JSON.stringify(brushedSel)} -> ${JSON.stringify(after.sel)}`);
    }
    passed.push(`${c.key}/click-no-commit`);
    if (artifactDir) await page.screenshot({ path: join(artifactDir, `roi_${c.key}_${backend}.png`) });

    // 4. The box still commits after that click (one more unit right and one up).
    await drag(toPage(moved), toPage({ x: moved.x + u, y: moved.y - u }));
    const rebrushed = await waitFor(out, (s) => c.bond.test(s) && s !== brushed, `${c.key}: second brush`);
    console.error(`${c.key} rebrushed: ${rebrushed.slice(0, 200)} | ${await readout()}`);
    passed.push(`${c.key}/rebrush`);
  }

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
