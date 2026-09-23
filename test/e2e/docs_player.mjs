// Playwright against the quick start Pluto export on the Documenter page.
// The iframe is #masque-gs-quickstart (home_quickstart.html). Listed clicks
// swap the readout cell through the export's editor_state_set snapshots.
// Fails if the overlay never mounts, if host.value does not key a snapshot,
// or if an overlay click does not update that readout.
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
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const POINTS = [
  { name: "one", y: "1.0" },
  { name: "two", y: "4.0" },
  { name: "three", y: "9.0" },
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
      if (t === "click a point" || / selected — y = /.test(t)) return t;
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
    return host.value;
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
    await setHost(frame, { layer: "scatter", index: i });
    const want = `${POINTS[i].name} selected — y = ${POINTS[i].y}`;
    const text = await waitReadout(frame, (t) => t.includes(want));
    if (!text.includes(want)) {
      throw new Error(`host.value {layer:"scatter",index:${i}} did not key a snapshot; readout=${JSON.stringify(text)}`);
    }
    await setHost(frame, null);
    await waitReadout(frame, (t) => t === "click a point");
  }

  for (let i = 0; i < POINTS.length; i++) {
    const got = await clickPoint(frame, i);
    if (!got || got.layer !== "scatter" || typeof got.index !== "number") {
      throw new Error(`point ${i} (${POINTS[i].name}) click emitted ${JSON.stringify(got)}`);
    }
    const want = `${POINTS[got.index].name} selected — y = ${POINTS[got.index].y}`;
    const text = await waitReadout(frame, (t) => t.includes(want));
    if (!text.includes(want)) {
      throw new Error(`listed click (aimed ${i}, hit ${got.index}) did not swap the readout; got ${JSON.stringify(text)}`);
    }
  }

  const errors = consoleLog.filter((l) => {
    if (l.startsWith("pageerror:")) return true;
    if (!l.startsWith("error:")) return false;
    if (l.includes("Failed to load resource") && l.includes("404")) return false;
    return true;
  });
  if (errors.length) throw new Error(`console errors: ${errors.join(" | ")}`);
  console.log("E2E OK [docs player] — mount callable, every listed host.value keyed, overlay clicks swapped the readout");
} catch (e) {
  failed = e;
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.error("E2E FAIL:", failed.message); process.exit(1); }
