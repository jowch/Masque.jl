// Playwright against the quick start Pluto export on the Documenter page, then the image
// and box-select brush players, which must record every box a reader can draw.
// The iframe is #masque-gs-quickstart (home_quickstart.html, its value segment). Listed clicks
// swap the readout cell through the export's editor_state_set snapshots.
// Fails if the overlay never mounts, if host.value does not key a snapshot,
// or if an overlay click does not update that readout. Then, with jsDelivr blocked, the
// iframe must give way to its text twin (docs/player_fallback.jl): the `details` after it
// opens with the notebook's code, and the search index carries that code. The Brush a
// region page shows one notebook in two segments, which must share its value. On the Sliders
// and toggles page, the slider and the toggle redraw the figure from harvested `onchange`
// frames, and the notebook downloads. Players load the overlay script, pictures and state
// tables from shared files. The Backends
// page's two `@example` widgets, shown without Pluto, must hover to a tooltip, mount when
// their script runs from `<head>`, and show their figure with scripts off.
//
//   node docs_player.mjs <docs/build>

import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, normalize, sep } from "node:path";

const rootArg = process.argv[2];
if (!rootArg) {
  console.error("usage: node docs_player.mjs <docs/build>");
  process.exit(2);
}
const root = normalize(rootArg);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const POINTS = [
  { name: "one", y: "2.0" },
  { name: "two", y: "1.0" },
  { name: "three", y: "4.0" },
  { name: "four", y: "3.0" },
];

function gettingStartedPath() {
  if (existsSync(join(root, "getting-started", "index.html"))) return "/getting-started/";
  if (existsSync(join(root, "getting-started.html"))) return "/getting-started.html";
  throw new Error(`no getting-started page under ${root}`);
}

function serve(dir) {
  return createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = normalize(join(dir, p));
    const prefix = dir.endsWith(sep) ? dir : dir + sep;
    if (file !== dir && !file.startsWith(prefix)) {
      res.writeHead(403); res.end(); return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.setHeader("content-type", MIME[extname(file)] || "application/octet-stream");
    res.end(readFileSync(file));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Pluto's static export loads its editor from jsDelivr. On the docs CI runner
// that document reaches readyState "complete" and still never creates
// .ip-host. The same file boots when those scripts load. Serve the copy
// already in the Julia depot (the harvest that wrote the HTML used it).
function plutoFrontendDirs() {
  const depots = (process.env.JULIA_DEPOT_PATH || join(homedir(), ".julia")).split(":");
  const dirs = [];
  for (const depot of depots) {
    if (!depot) continue;
    const root = join(depot, "packages", "Pluto");
    if (!existsSync(root)) continue;
    for (const slug of readdirSync(root)) {
      const dist = join(root, slug, "frontend-dist");
      if (existsSync(dist)) dirs.push(dist);
    }
  }
  return dirs;
}

const plutoDists = plutoFrontendDirs();

function localPlutoAsset(url) {
  const marker = "/frontend-dist/";
  const i = url.indexOf(marker);
  if (i < 0) return null;
  let name = url.slice(i + marker.length).split("?")[0].split("#")[0];
  try { name = decodeURIComponent(name); } catch { return null; }
  if (!name || name.split("/").includes("..")) return null;
  for (const dir of plutoDists) {
    const file = normalize(join(dir, name));
    const prefix = dir.endsWith(sep) ? dir : dir + sep;
    if (file !== dir && !file.startsWith(prefix)) continue;
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

function mountSnapshot() {
  const host = document.querySelector(".ip-host");
  let shadowRoots = 0;
  let surface = false;
  if (host) {
    host.querySelectorAll("*").forEach((el) => {
      if (!el.shadowRoot) return;
      shadowRoots++;
      if (el.shadowRoot.querySelector(".surface")) surface = true;
    });
  }
  return {
    href: location.href,
    ready: document.readyState,
    host: !!host,
    editor: typeof window.editor_state_set,
    mount: window.Masque ? typeof window.Masque.mount : "undefined",
    shadowRoots,
    surface,
  };
}

// about:blank's readyState is already "complete", so the first contentFrame
// is not evidence that the embed loaded. Re-resolve the element each poll so
// a replaced node is not a detached frame, and ignore about:blank until the
// embed document is actually there.
async function waitMounted(iframe, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = "iframe has no document";
  while (Date.now() < deadline) {
    const handle = await iframe.elementHandle();
    const frame = handle && await handle.contentFrame();
    if (!frame) {
      last = "iframe has no contentFrame";
      await sleep(250);
      continue;
    }
    const url = frame.url();
    if (!url || url === "about:blank") {
      last = `iframe url ${url || "empty"}`;
      await sleep(250);
      continue;
    }
    const snap = await frame.evaluate(mountSnapshot).catch((e) => ({
      href: url,
      error: String(e).split("\n")[0],
    }));
    if (snap.host && snap.editor === "function" && snap.mount === "function" && snap.surface) return frame;
    last = JSON.stringify(snap);
    await sleep(250);
  }
  const tail = [...consoleLog, ...netLog]
    .filter((l) => l.startsWith("error:") || l.startsWith("pageerror:") || l.startsWith("failed ") || l.startsWith("cdn "))
    .slice(-8)
    .map((l) => l.slice(0, 240));
  const extra = tail.length ? ` | ${tail.join(" | ")}` : "";
  throw new Error(`quick start overlay never mounted within 20s: ${last}${extra}`);
}

async function readout(frame) {
  return frame.evaluate(() => {
    const outs = [...document.querySelectorAll("pluto-output")];
    for (const out of outs) {
      const t = (out.innerText || "").replace(/"/g, "").trim();
      if (t === "click a point" || / selected, y = /.test(t)) return t;
    }
    return "";
  });
}

async function waitReadout(frame, pred, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await readout(frame);
    if (pred(last)) return last;
    await sleep(100);
  }
  throw new Error(`readout stayed ${JSON.stringify(last)}`);
}

async function setHost(frame, value) {
  await frame.evaluate((v) => {
    const host = document.querySelector(".ip-host");
    if (!host) throw new Error("no .ip-host");
    host.value = v;
    host.dispatchEvent(new Event("input"));
  }, value);
}

async function clickPoint(frame, index) {
  return frame.evaluate((idx) => {
    const host = document.querySelector(".ip-host");
    if (!host) throw new Error("no .ip-host");
    let man = host.masqueManifest;
    if (!man || !man.layers) {
      const pubs = (window.editor_state && window.editor_state.notebook && window.editor_state.notebook.published_objects) || {};
      for (const v of Object.values(pubs)) {
        const obj = typeof v === "string" ? JSON.parse(v) : v;
        if (obj && obj.layers) { man = obj; break; }
      }
    }
    if (!man || !man.layers) throw new Error("quick start manifest missing");
    const layer = man.layers.find((l) => l.id === "scatter");
    if (!layer) throw new Error("no scatter layer on the quick start manifest");
    const cx = layer.geometry[3 * idx];
    const cy = layer.geometry[3 * idx + 1];
    let sr = null;
    host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const surface = sr && sr.querySelector(".surface");
    if (!surface) throw new Error("overlay .surface missing");
    const img = host.querySelector("img");
    const r = img.getBoundingClientRect();
    const scale = r.width / man.width;
    const clientX = r.x + cx * scale;
    const clientY = r.y + cy * scale;
    const o = {
      bubbles: true, composed: true, cancelable: true,
      clientX, clientY, pointerId: 1, pointerType: "mouse", isPrimary: true,
    };
    surface.dispatchEvent(new PointerEvent("pointermove", o));
    surface.dispatchEvent(new MouseEvent("click", o));
    return host.value?.scatter ?? null;
  }, index);
}

const path = gettingStartedPath();
const server = serve(root);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}${path}`;

const consoleLog = [];
const netLog = [];
const browser = await chromium.launch({ headless: true });
let failed = null;
try {
  // GitHub runners have a minimal locale. Pluto's frontend then throws
  // "Incorrect locale information provided" from a V8 Intl call and never
  // creates .ip-host. Same context the live Pluto click test uses.
  const context = await browser.newContext({ locale: "en-US", timezoneId: "UTC" });
  const page = await context.newPage();
  page.on("console", (msg) => consoleLog.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => consoleLog.push(`pageerror: ${err.message}`));
  const sharedFetched = [];
  page.on("request", (req) => { if (req.url().includes("/embeds/shared/")) sharedFetched.push(req.url()); });
  page.on("requestfailed", (req) => {
    const u = req.url();
    if (!u.includes("jsdelivr") && !u.includes("frontend-dist")) return;
    netLog.push(`failed ${u} ${req.failure()?.errorText || ""}`);
  });
  await page.route(/https:\/\/cdn\.jsdelivr\.net\/gh\/JuliaPluto\/Pluto\.jl@[^/]+\/frontend-dist\//, async (route) => {
    const file = localPlutoAsset(route.request().url());
    if (!file) {
      netLog.push(`cdn miss ${route.request().url()}`);
      await route.continue();
      return;
    }
    await route.fulfill({ path: file });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const iframe = page.locator("#masque-gs-quickstart");
  await iframe.waitFor({ state: "attached", timeout: 20000 });
  // The iframe is taller than the viewport, and Documenter keeps shifting
  // layout while fonts settle, so scroll via the element instead of waiting
  // for Playwright to call it stable. Force the embed fetch in case the
  // iframe is still sitting on about:blank.
  await iframe.evaluate((el) => {
    el.loading = "eager";
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const src = el.getAttribute("src");
    if (src) el.src = src;
  });
  const frame = await waitMounted(iframe);

  const mountType = await frame.evaluate(() => typeof window.Masque.mount);
  if (mountType !== "function") {
    throw new Error(`window.Masque.mount is ${mountType}, expected function`);
  }

  const idle = await waitReadout(frame, (t) => t === "click a point");
  if (idle !== "click a point") {
    throw new Error(`idle readout was ${JSON.stringify(idle)}`);
  }

  for (let i = 0; i < POINTS.length; i++) {
    // host.value holds one envelope per field (#335): the quick start's one field is `scatter`.
    await setHost(frame, { scatter: { layer: "scatter", index: i } });
    const want = `${POINTS[i].name} selected, y = ${POINTS[i].y}`;
    const text = await waitReadout(frame, (t) => t.includes(want));
    if (!text.includes(want)) {
      throw new Error(`host.value {layer:"scatter",index:${i}} did not key a snapshot; readout=${JSON.stringify(text)}`);
    }
    await setHost(frame, { scatter: null });
    await waitReadout(frame, (t) => t === "click a point");
  }

  for (let i = 0; i < POINTS.length; i++) {
    const got = await clickPoint(frame, i);
    if (!got || got.layer !== "scatter" || typeof got.index !== "number") {
      throw new Error(`point ${i} (${POINTS[i].name}) click emitted ${JSON.stringify(got)}`);
    }
    const want = `${POINTS[got.index].name} selected, y = ${POINTS[got.index].y}`;
    const text = await waitReadout(frame, (t) => t.includes(want));
    if (!text.includes(want)) {
      throw new Error(`listed click (aimed ${i}, hit ${got.index}) did not swap the readout; got ${JSON.stringify(text)}`);
    }
  }

  // The player carries none of its overlay script, pictures or state tables: it loads them from
  // `embeds/shared/`, each state's cells when the reader reaches it.
  const shipped = await frame.evaluate(() => ({
    overlay: [...document.querySelectorAll("head script[src]")].some((s) => /^shared\/[0-9a-f]{20}\.js$/.test(s.getAttribute("src"))),
    img: document.querySelector(".ip-host img")?.getAttribute("src") || "",
    inlineScript: Math.max(0, ...[...document.querySelectorAll("pluto-output script")].map((s) => s.textContent.length)),
    snaps: window.masquePlayer.table.snaps,
  }));
  const isShared = (f, ext) => new RegExp(`^shared/[0-9a-f]{20}\\.${ext}$`).test(f);
  if (!shipped.overlay || !isShared(shipped.img, "png") || shipped.inlineScript > 20000 || !shipped.snaps.every((f) => isShared(f, "json"))) {
    throw new Error(`the quick start still inlines its assets: ${JSON.stringify({ ...shipped, snaps: shipped.snaps.slice(0, 3) })}`);
  }
  if (!sharedFetched.some((u) => /\/embeds\/shared\/[0-9a-f]{20}\.json$/.test(u))) {
    throw new Error("the quick start's clicks fetched no state file");
  }

  const twinClosed = await page.evaluate(() => {
    const wrap = document.getElementById("masque-gs-quickstart").closest(".masque-embed-wrap");
    const twin = wrap.nextElementSibling;
    return {
      twin: !!(twin && twin.matches("details.admonition.is-details")),
      open: !!(twin && twin.open),
      wrapShown: getComputedStyle(wrap).display !== "none",
    };
  });
  if (!twinClosed.twin || twinClosed.open || !twinClosed.wrapShown) {
    throw new Error(`with the player rendered, the text twin must sit closed after a shown iframe: ${JSON.stringify(twinClosed)}`);
  }

  const errors = consoleLog.filter((l) => {
    if (l.startsWith("pageerror:")) return true;
    if (!l.startsWith("error:")) return false;
    if (l.includes("Failed to load resource") && l.includes("404")) return false;
    return true;
  });
  if (errors.length) throw new Error(`console errors: ${errors.join(" | ")}`);
  console.log("E2E OK [docs player] — mount callable, every listed host.value keyed, overlay clicks swapped the readout");

  // Brush players record every box a reader can draw (`brush_states` in
  // docs/player_pipeline.jl), so any release must key a snapshot exactly: the player logs
  // "no snapshot for" on a miss and leaves the page alone. Image: set the bond to several
  // windows; each must swap the readout. Box-select: drag the real box with the pointer;
  // whatever set it encloses must be recorded.
  const openPlayer = async (name, embed) => {
    const p = existsSync(join(root, "gallery", name, "index.html")) ? `/gallery/${name}/` : `/gallery/${name}.html`;
    const misses = [];
    const onConsole = (m) => { if (/no snapshot for/.test(m.text())) misses.push(m.text()); };
    page.on("console", onConsole);
    await page.goto(`http://127.0.0.1:${server.address().port}${p}`, { waitUntil: "domcontentloaded" });
    const el = page.locator(`iframe[data-masque-embed="${embed}"]`);
    await el.waitFor({ state: "attached", timeout: 20000 });
    await el.evaluate((f) => {
      f.loading = "eager";
      f.scrollIntoView({ block: "start", inline: "nearest" });
      const s = f.getAttribute("src");
      if (s) f.src = s;
    });
    const frame = await waitMounted(el, 40000);
    const outputs = () => frame.evaluate(() => [...document.querySelectorAll("pluto-output")].map((o) => o.innerHTML).join("\u0000"));
    const swapped = async (before, what) => {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        if (misses.length) throw new Error(`${embed}: ${what} has no recording (${misses[0]})`);
        if ((await outputs()) !== before) return;
        await sleep(100);
      }
      throw new Error(`${embed}: ${what} did not swap the page`);
    };
    return { el, frame, outputs, swapped, misses: () => misses, done: () => page.off("console", onConsole) };
  };

  {
    const img = await openPlayer("image", "gallery_image");
    // `bind = :img`: the value's one field is the grid's, holding the box's window.
    const win = (i0, i1, j0, j1) => ({ img: { items: [{ layer: "img", index: 0, payload: { i0, i1, j0, j1, xmin: 0, xmax: 1, ymin: 0, ymax: 1 } }] } });
    const windows = [[0, 7, 0, 5], [3, 3, 2, 2], [1, 4, 0, 3], [6, 7, 4, 5]];
    for (const [i0, i1, j0, j1] of windows) {
      const before = await img.outputs();
      await setHost(img.frame, win(i0, i1, j0, j1));
      await img.swapped(before, `window ${i0}-${i1} x ${j0}-${j1}`);
    }
    img.done();
    console.log(`E2E OK [docs player] — image brush: ${windows.length} different windows each swapped to their own recording`);
  }

  // Grab the resting box and drag it by each offset with the real pointer; each release
  // must key a recording. `describe` names what the release committed, for messages.
  // What the lookup keys on (points, or a grid window), not the raw value: two boxes pressed
  // against the same edge commit different bounds but the same window.
  const itemsKey = (items) => items.map((it) => `${it.layer}:${it.index}` + (it.payload ? `@${it.payload.i0}-${it.payload.i1}/${it.payload.j0}-${it.payload.j1}` : "")).join(",");
  const dragChecks = async (pl, embed, moves, describe) => {
    // A selecting box starts at what it holds (#330), so the page already shows that value: a
    // release with the same points leaves it as it is.
    // The box fills its target's field (#335), the one envelope holding `items`.
    let prevKey = await pl.frame.evaluate(() => {
      const v = document.querySelector(".ip-host").value;
      return Object.values(v ?? {}).find((e) => e && Array.isArray(e.items))?.items ?? null;
    }).then((items) => (items ? itemsKey(items) : ""));
    const boxCentre = () => pl.frame.evaluate(() => {
      const host = document.querySelector(".ip-host");
      let sr = null; host.querySelectorAll("*").forEach((n) => { if (n.shadowRoot) sr = n.shadowRoot; });
      const rs = [...sr.querySelectorAll("svg.masque-plain rect")].map((n) => n.getBoundingClientRect()).filter((q) => q.width > 20 && q.height > 20);
      rs.sort((a, b) => b.width * b.height - a.width * a.height);
      const q = rs[0];
      return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
    });
    for (const [dx, dy] of moves) {
      // The iframe is taller than the viewport: bring the box, not the iframe top, into view,
      // or the pointer lands outside the page and the drag never starts.
      const vh = page.viewportSize().height;
      const top = (await pl.el.boundingBox()).y + (await boxCentre()).y;
      if (top < 100 || top > vh - 100) {
        await page.evaluate((d) => window.scrollBy(0, d), top - vh / 2);
        await sleep(200);
      }
      const fb = await pl.el.boundingBox();
      const c = await pl.frame.evaluate(() => {
        const host = document.querySelector(".ip-host");
        let sr = null; host.querySelectorAll("*").forEach((n) => { if (n.shadowRoot) sr = n.shadowRoot; });
        const rs = [...sr.querySelectorAll("svg.masque-plain rect")].map((n) => n.getBoundingClientRect()).filter((q) => q.width > 20 && q.height > 20);
        rs.sort((a, b) => b.width * b.height - a.width * a.height);
        const q = rs[0];
        return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
      });
      const x = fb.x + c.x, y = fb.y + c.y;
      const before = await pl.outputs();
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let k = 1; k <= 10; k++) await page.mouse.move(x + dx * k / 10, y + dy * k / 10);
      await page.mouse.up();
      const items = await pl.frame.evaluate(() => {
        const v = document.querySelector(".ip-host").value;
        return Object.values(v ?? {}).find((e) => e && Array.isArray(e.items))?.items ?? null;
      });
      if (items === null) throw new Error(`${embed}: a drag did not commit an items value`);
      const what = describe(items);
      const v = itemsKey(items);
      // The same release as the last drag leaves the page as it was; a miss still fails.
      if (v !== prevKey) await pl.swapped(before, what);
      else await sleep(500);
      if (pl.misses().length) throw new Error(`${embed}: ${what} has no recording`);
      prevKey = v;
    }
  };

  {
    const img = await openPlayer("image", "gallery_image");
    await dragChecks(img, "gallery_image", [[40, 20], [-70, 30], [30, -40]], (items) => {
      const p = items[0] && items[0].payload;
      return p ? `a dragged box on window ${p.i0}-${p.i1} x ${p.j0}-${p.j1}` : "a dragged box off the grid";
    });
    img.done();
    console.log("E2E OK [docs player] — image brush: 3 pointer drags each swapped to their own recording");
  }

  {
    const bs = await openPlayer("boxselect", "gallery_boxselect");
    const moves = [[-40, 30], [70, -50], [-20, 60]];
    await dragChecks(bs, "gallery_boxselect", moves, (items) => `a dragged box enclosing ${items.length} points`);
    bs.done();
    console.log(`E2E OK [docs player] — box-select: ${moves.length} pointer drags each swapped to their own recording`);
  }

  // A notebook shown in two segments with prose between them (docs/player_segments.jl): the
  // Brush a region page's figure and table are one roi_table export in two iframes. Each
  // shows only its own cells, the sim chip stays with the widget, and dragging the box in
  // the figure's iframe swaps the table in the other one.
  {
    const p = existsSync(join(root, "roi", "index.html")) ? "/roi/" : "/roi.html";
    const misses = [];
    const onConsole = (m) => { if (/no snapshot for|no segment/.test(m.text())) misses.push(m.text()); };
    page.on("console", onConsole);
    await page.goto(`http://127.0.0.1:${server.address().port}${p}`, { waitUntil: "domcontentloaded" });
    const segEl = (name) => page.locator(`iframe[data-masque-embed="roi_table"][data-masque-segment="${name}"]`);
    for (const name of ["figure", "table"]) {
      await segEl(name).waitFor({ state: "attached", timeout: 20000 });
      await segEl(name).evaluate((f) => {
        f.loading = "eager";
        const s = f.getAttribute("src");
        if (s) f.src = s;
      });
    }
    await segEl("figure").evaluate((f) => f.scrollIntoView({ block: "start" }));
    const fig = await waitMounted(segEl("figure"), 40000);
    let table = null;
    for (const deadline = Date.now() + 40000; Date.now() < deadline && !table;) {
      const f = await (await segEl("table").elementHandle())?.contentFrame();
      const ok = f && await f.evaluate(() => typeof window.editor_state_set === "function" && !!document.querySelector("pluto-cell")).catch(() => false);
      if (ok) table = f; else await sleep(250);
    }
    if (!table) throw new Error("roi_table table segment never loaded its notebook");
    const shown = (frame) => frame.evaluate(() => ({
      want: window.masqueSegment,
      visible: [...document.querySelectorAll("pluto-notebook pluto-cell")].filter((c) => c.offsetParent !== null).map((c) => c.id),
      chip: !!document.querySelector(".masque-sim-chip") && document.querySelector(".masque-sim-chip").getClientRects().length > 0,
    }));
    for (const [name, frame, chip] of [["figure", fig, true], ["table", table, false]]) {
      const st = await shown(frame);
      if (!st.want || JSON.stringify(st.visible) !== JSON.stringify(st.want)) {
        throw new Error(`roi_table ${name} segment shows cells ${JSON.stringify(st.visible)}, wants ${JSON.stringify(st.want)}`);
      }
      if (st.chip !== chip) throw new Error(`roi_table ${name} segment: sim chip ${st.chip ? "shown" : "hidden"}`);
    }
    const tableOut = () => table.evaluate(() => [...document.querySelectorAll("pluto-output")].filter((o) => o.offsetParent !== null).map((o) => o.innerText).join("\u0000"));
    const boxCentre = () => fig.evaluate(() => {
      const host = document.querySelector(".ip-host");
      let sr = null; host.querySelectorAll("*").forEach((n) => { if (n.shadowRoot) sr = n.shadowRoot; });
      const rs = [...sr.querySelectorAll("svg.masque-plain rect")].map((n) => n.getBoundingClientRect()).filter((q) => q.width > 20 && q.height > 20);
      rs.sort((a, b) => b.width * b.height - a.width * a.height);
      return { x: rs[0].x + rs[0].width / 2, y: rs[0].y + rs[0].height / 2 };
    });
    const before = await tableOut();
    const vh = page.viewportSize().height;
    const top = (await segEl("figure").boundingBox()).y + (await boxCentre()).y;
    if (top < 100 || top > vh - 100) {
      await page.evaluate((d) => window.scrollBy(0, d), top - vh / 2);
      await sleep(200);
    }
    const fb = await segEl("figure").boundingBox();
    const c = await boxCentre();
    const [x, y] = [fb.x + c.x, fb.y + c.y];
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(x - 4 * k, y + 3 * k);
    await page.mouse.up();
    let after = before;
    for (const deadline = Date.now() + 8000; Date.now() < deadline && after === before;) {
      if (misses.length) throw new Error(`roi_table segments: ${misses[0]}`);
      await sleep(100);
      after = await tableOut();
    }
    if (after === before) throw new Error("roi_table: dragging the box in the figure segment did not swap the table segment");
    page.off("console", onConsole);
    console.log("E2E OK [docs player] — segments: roi_table's two iframes each show their own cells, and a drag in one swapped the table in the other");
  }

  // A segment whose picture swaps: on the Legend entries page, clicking legend entry "a" in
  // the widget segment must change the figure in the fade segment. That figure is a CairoMakie
  // cell, whose `data:image/png;base64, …` (with a space) the export moves to a shared file.
  {
    const p = existsSync(join(root, "legend", "index.html")) ? "/legend/" : "/legend.html";
    await page.goto(`http://127.0.0.1:${server.address().port}${p}`, { waitUntil: "domcontentloaded" });
    const segEl = (name) => page.locator(`iframe[data-masque-embed="legend_lines"][data-masque-segment="${name}"]`);
    for (const name of ["widget", "fade"]) {
      await segEl(name).waitFor({ state: "attached", timeout: 20000 });
      await segEl(name).evaluate((f) => {
        f.loading = "eager";
        const s = f.getAttribute("src");
        if (s) f.src = s;
      });
    }
    await segEl("widget").evaluate((f) => f.scrollIntoView({ block: "start" }));
    const widget = await waitMounted(segEl("widget"), 40000);
    let fade = null;
    for (const deadline = Date.now() + 40000; Date.now() < deadline && !fade;) {
      const f = await (await segEl("fade").elementHandle())?.contentFrame();
      const ok = f && await f.evaluate(() => typeof window.editor_state_set === "function" && !!document.querySelector("pluto-output img")).catch(() => false);
      if (ok) fade = f; else await sleep(250);
    }
    if (!fade) throw new Error("legend_lines fade segment never showed its figure");
    const fadeSrc = () => fade.evaluate(() => [...document.querySelectorAll("pluto-output img")].filter((i) => i.offsetParent !== null).map((i) => i.src).join(" "));
    const before = await fadeSrc();
    if (!before.includes("/embeds/shared/")) throw new Error(`legend_lines fade figure is not a shared picture: ${before.slice(0, 120)}`);
    await widget.evaluate(() => {
      const host = document.querySelector(".ip-host");
      let man = host.masqueManifest;
      if (!man || !man.layers) {
        const pubs = (window.editor_state && window.editor_state.notebook && window.editor_state.notebook.published_objects) || {};
        for (const v of Object.values(pubs)) {
          const obj = typeof v === "string" ? JSON.parse(v) : v;
          if (obj && obj.layers) { man = obj; break; }
        }
      }
      if (!man || !man.layers) throw new Error("legend_lines manifest missing");
      const layer = man.layers.find((l) => l.id.startsWith("legend"));
      if (!layer) throw new Error("no legend layer on the legend_lines manifest");
      let sr = null;
      host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const surface = sr && sr.querySelector(".surface");
      const r = host.querySelector("img").getBoundingClientRect();
      const scale = r.width / man.width;
      const o = {
        bubbles: true, composed: true, cancelable: true,
        clientX: r.x + layer.geometry[0] * scale, clientY: r.y + layer.geometry[1] * scale,
        pointerId: 1, pointerType: "mouse", isPrimary: true,
      };
      surface.dispatchEvent(new PointerEvent("pointermove", o));
      surface.dispatchEvent(new MouseEvent("click", o));
    });
    let after = before;
    for (const deadline = Date.now() + 8000; Date.now() < deadline && after === before;) {
      await sleep(100);
      after = await fadeSrc();
    }
    if (after === before) throw new Error("legend_lines: clicking a legend entry did not swap the fade segment's picture");
    console.log("E2E OK [docs player] — segments: a legend click in legend_lines' widget swapped the fade segment's picture");
  }

  // `onchange` replayed from harvested frames (docs/pluto_html_export.jl): on the Sliders and
  // toggles page, a key step on the slider and a click on the toggle each redraw the figure
  // from that setting's frame, and the value cell in the other iframe follows. The download
  // link sits with the widget and serves the notebook, and nothing says "not computed".
  {
    const p = existsSync(join(root, "controls", "index.html")) ? "/controls/" : "/controls.html";
    const frameReqs = [];
    const onReq = (r) => { if (/controls_wave\.frames\//.test(r.url())) frameReqs.push(r.url()); };
    page.on("request", onReq);
    await page.goto(`http://127.0.0.1:${server.address().port}${p}`, { waitUntil: "domcontentloaded" });
    const segEl = (name) => page.locator(`iframe[data-masque-embed="controls_wave"][data-masque-segment="${name}"]`);
    for (const name of ["widget", "value"]) {
      await segEl(name).waitFor({ state: "attached", timeout: 20000 });
      await segEl(name).evaluate((f) => {
        f.loading = "eager";
        const s = f.getAttribute("src");
        if (s) f.src = s;
      });
    }
    await segEl("widget").evaluate((f) => f.scrollIntoView({ block: "start" }));
    const w = await waitMounted(segEl("widget"), 40000);
    let v = null;
    for (const deadline = Date.now() + 40000; Date.now() < deadline && !v;) {
      const f = await (await segEl("value").elementHandle())?.contentFrame();
      const ok = f && await f.evaluate(() => typeof window.editor_state_set === "function" && !!document.querySelector("pluto-cell pluto-output")).catch(() => false);
      if (ok) v = f; else await sleep(250);
    }
    if (!v) throw new Error("controls_wave value segment never loaded its notebook");
    if (frameReqs.length) throw new Error(`controls_wave fetched frames before any control moved: ${frameReqs[0]}`);
    const valueText = () => v.evaluate(() => [...document.querySelectorAll("pluto-output")].filter((o) => o.offsetParent !== null).map((o) => o.innerText.replace(/\s+/g, " ").trim()).join(" | "));
    const picture = () => w.evaluate(() => document.querySelector(".ip-host img").src.slice(0, 40));
    const missShown = (frame) => frame.evaluate(() => { const m = document.querySelector(".masque-miss"); return !!m && !m.hidden; });
    const waitFor = async (what, read, pred, ms = 8000) => {
      let got = await read();
      for (const deadline = Date.now() + ms; Date.now() < deadline && !pred(got);) {
        await sleep(100);
        got = await read();
      }
      if (!pred(got)) throw new Error(`controls_wave: ${what} (got ${JSON.stringify(got)})`);
      return got;
    };
    const v0 = await waitFor("starting value", valueText, (t) => /1\.0/.test(t) && /false/.test(t));
    const p0 = await picture();
    const slider = w.locator('[data-masque-control="freq"] input');
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await waitFor("the slider's frame never replaced the picture", picture, (s) => s !== p0 && s.startsWith("blob:"));
    await waitFor("the value cell never followed the slider", valueText, (t) => t !== v0 && /1\.5/.test(t));
    // The slider keeps the keyboard once its frame has landed, so the next step moves it on.
    const p1a = await picture();
    await page.keyboard.press("ArrowRight");
    await waitFor("a second key step after the frame landed did nothing", picture, (s) => s !== p1a);
    const v1 = await waitFor("the value cell never followed the second step", valueText, (t) => /2\.0/.test(t));
    const p1 = await picture();
    await w.locator('[data-masque-control="dots"] input').click();
    await waitFor("the toggle's frame never replaced the picture", picture, (s) => s !== p1);
    await waitFor("the value cell never followed the toggle", valueText, (t) => t !== v1 && /true/.test(t));
    const note = await w.evaluate(() => document.querySelector(".ip-host").dataset.masqueOnchangeError || null);
    if (note) throw new Error(`controls_wave: the overlay says ${JSON.stringify(note)}`);
    if (await missShown(w) || await missShown(v)) throw new Error("controls_wave: a recorded setting shows the not-computed note");
    if (frameReqs.length < 2) throw new Error(`controls_wave fetched ${frameReqs.length} frame files`);
    const bar = (frame) => frame.evaluate(() => {
      const a = document.querySelector(".masque-download");
      return { shown: !!a && a.getClientRects().length > 0, href: a ? a.href : null };
    });
    const [wb, vb] = [await bar(w), await bar(v)];
    if (!wb.shown || vb.shown) throw new Error(`controls_wave: download link shown in widget part ${wb.shown}, value part ${vb.shown}`);
    const dl = await page.request.get(wb.href);
    const body = await dl.text();
    if (!dl.ok() || !body.startsWith("### A Pluto.jl notebook ###") || body.includes("PLUTO_MANIFEST_TOML_CONTENTS") || body.includes("PLUTO_PLAYER_TOML_CONTENTS")) {
      throw new Error(`controls_wave: the download (${dl.status()}) is not the notebook without its manifest and player TOML`);
    }
    page.off("request", onReq);
    console.log(`E2E OK [docs player] — onchange replay: the slider and the toggle redrew controls_wave from ${frameReqs.length} fetched frame files, the value part followed, and the download is the notebook`);
  }

  // Widgets shown by Documenter `@example` blocks, with no Pluto (#298): two CairoMakie and
  // one WGLMakie on one page, so no widget's script may collide with another's. Every one
  // mounts, the WGLMakie one draws its canvas, hovering a point with the real pointer shows
  // its tooltip, and the page logs no errors.
  {
    const p = existsSync(join(root, "publish", "index.html")) ? "/publish/" : "/publish.html";
    const before = consoleLog.length;
    await page.goto(`http://127.0.0.1:${server.address().port}${p}`, { waitUntil: "load" });
    await page.waitForFunction(() => {
      const hosts = [...document.querySelectorAll(".ip-host")];
      const mounted = (h) => [...h.querySelectorAll("*")].some((el) => el.shadowRoot?.querySelector(".surface"));
      return hosts.length === 3 && hosts.every(mounted) && !!hosts[2].querySelector("canvas");
    }, null, { timeout: 60000 }).catch(async () => {
      const st = await page.evaluate(() => [...document.querySelectorAll(".ip-host")].map((h) =>
        `surface=${[...h.querySelectorAll("*")].some((el) => el.shadowRoot?.querySelector(".surface"))} canvas=${!!h.querySelector("canvas")} text=${JSON.stringify(h.innerText.trim().slice(0, 80))}`));
      throw new Error(`@example widgets: expected 3 mounted overlays (the third a WGLMakie canvas), found ${st.length} hosts [${st.join("; ")}] | ${consoleLog.slice(before).join(" | ")}`);
    });
    const host = page.locator(".ip-host").first();
    await host.scrollIntoViewIfNeeded();
    // The manifest is inlined into the mount call; read the scatter's first point from it.
    const pt = await host.evaluate((h) => {
      const src = h.querySelector("script").textContent;
      const m = src.match(/mount\(img, (.*), new Promise/s);
      const man = JSON.parse(m[1]);
      const layer = man.layers.find((l) => l.id === "scatter");
      const r = h.querySelector("img").getBoundingClientRect();
      const s = r.width / man.width;
      return { x: r.x + layer.geometry[0] * s, y: r.y + layer.geometry[1] * s };
    });
    let tip = "";
    for (let a = 0; a < 10 && !tip; a++) {
      await page.mouse.move(pt.x + 30, pt.y + 30);
      await page.mouse.move(pt.x, pt.y);
      await sleep(150);
      tip = await host.evaluate((h) => {
        let sr = null; h.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        const t = sr && sr.querySelector(".masque-tip");
        return t && getComputedStyle(t).display !== "none" && t.offsetParent !== null ? t.innerText.trim() : "";
      });
    }
    if (!tip) throw new Error("@example widget: hovering the first point showed no tooltip");
    const errs = consoleLog.slice(before).filter((l) => l.startsWith("pageerror:") || (l.startsWith("error:") && !(l.includes("Failed to load resource") && l.includes("404"))));
    if (errs.length) throw new Error(`@example widgets logged errors: ${errs.join(" | ")}`);
    console.log(`E2E OK [docs @example] — 3 widgets mounted without Pluto (one WGLMakie), hover tooltip ${JSON.stringify(tip)}`);

    // The classic Jupyter Notebook inserts output HTML inertly and runs each script from
    // `<head>` (jQuery's globalEval). The widget must still find its own host and mount.
    const headMounted = await page.evaluate(async () => {
      const src = document.querySelector(".ip-host");
      const html = src.outerHTML.split(src.id).join("masque-headcopy");
      const box = document.createElement("div");
      document.body.appendChild(box);
      box.innerHTML = html;
      for (const old of box.querySelectorAll("script")) {
        const s = document.createElement("script");
        s.text = old.textContent;
        document.head.appendChild(s).remove();
      }
      await new Promise((r) => requestAnimationFrame(r));
      const host = document.getElementById("masque-headcopy");
      return [...host.querySelectorAll("*")].some((el) => el.shadowRoot?.querySelector(".surface"));
    });
    if (!headMounted) throw new Error("@example widget: a script run from <head> did not mount its host");
    console.log("E2E OK [docs @example] — a script run from <head>, as in the classic Jupyter Notebook, mounts its host");

    // With scripts off, the same page shows each widget's plain figure.
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const page3 = await noJs.newPage();
    await page3.goto(`http://127.0.0.1:${server.address().port}${p}`, { waitUntil: "load" });
    const widths = await page3.evaluate(() => [...document.querySelectorAll(".ip-host img")].map((i) => i.naturalWidth));
    await noJs.close();
    if (widths.length !== 2 || !widths.every((w) => w > 0)) throw new Error(`@example widgets with scripts off: image widths ${JSON.stringify(widths)}`);
    console.log("E2E OK [docs @example] — with scripts off, both widgets show their figure");
  }

  // Pluto's frontend unreachable: the iframe never draws a cell, so the page hides it and
  // opens the text twin, whose code, idle figure, and readout need no CDN.
  const blocked = await browser.newContext({ locale: "en-US", timezoneId: "UTC" });
  const page2 = await blocked.newPage();
  await page2.route(/https:\/\/cdn\.jsdelivr\.net\//, (route) => route.abort());
  await page2.goto(url, { waitUntil: "domcontentloaded" });
  await page2.locator("#masque-gs-quickstart").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page2.waitForFunction(() => {
    const wrap = document.getElementById("masque-gs-quickstart").closest(".masque-embed-wrap");
    const twin = wrap.nextElementSibling;
    return getComputedStyle(wrap).display === "none" && twin && twin.open;
  }, null, { timeout: 30000 }).catch(() => {
    throw new Error("with jsDelivr blocked, the quick start iframe never gave way to its text twin");
  });
  const twin = await page2.evaluate(async () => {
    const d = document.getElementById("masque-gs-quickstart").closest(".masque-embed-wrap").nextElementSibling;
    const img = d.querySelector("img");
    if (img && !img.complete) await new Promise((r) => { img.onload = img.onerror = r; });
    return {
      text: d.innerText,
      codeBlocks: d.querySelectorAll("pre code").length,
      img: img ? img.naturalWidth : -1,
    };
  });
  // The page shows the notebook in two segments: the figure cell, then the value's cells.
  const figureTwin = await page2.evaluate(() => {
    const d = document.getElementById("masque-gs-figure").closest(".masque-embed-wrap").nextElementSibling;
    return d && d.matches("details") ? d.textContent : "";
  });
  if (!figureTwin.includes("interactables(s; payloads = points)") || !twin.text.includes("@bind sel masque(fig, pts)")) {
    throw new Error(`text twins are missing the quick start code: ${JSON.stringify([figureTwin.slice(0, 200), twin.text.slice(0, 200)])}`);
  }
  if (!twin.text.includes("click a point")) throw new Error("text twin is missing the idle readout");
  if (!(twin.img > 0)) throw new Error(`text twin's idle figure did not load (naturalWidth ${twin.img})`);
  await blocked.close();

  const index = readFileSync(join(root, "search_index.js"), "utf8");
  if (!index.includes("interactables(s; payloads = points)")) {
    throw new Error("search_index.js does not carry the quick start's code");
  }
  console.log(`E2E OK [docs player] — CDN blocked: text twin opened (${twin.codeBlocks} code blocks, figure ${twin.img}px), code is in the search index`);
} catch (e) {
  failed = e;
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.error("E2E FAIL:", failed.message); process.exit(1); }
