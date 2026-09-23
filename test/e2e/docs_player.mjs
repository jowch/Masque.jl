// Playwright against the quick start Pluto export on the Documenter page.
// The iframe is #masque-gs-quickstart (home_quickstart.html). Listed clicks
// swap the readout cell through the export's editor_state_set snapshots.
// Fails if the overlay never mounts, if host.value does not key a snapshot,
// or if an overlay click does not update that readout.
//
//   node docs_player.mjs <docs/build>

import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
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

async function waitMounted(frame, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await frame.evaluate(() => {
      const host = document.querySelector(".ip-host");
      if (!host || typeof window.editor_state_set !== "function") return false;
      let sr = null;
      host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      return !!(sr && sr.querySelector(".surface") && typeof window.Masque?.mount === "function");
    }).catch(() => false);
    if (ok) return;
    await sleep(250);
  }
  throw new Error("quick start overlay never mounted (host/.surface/window.Masque.mount within 20s)");
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

const browser = await chromium.launch({ headless: true });
let failed = null;
try {
  const page = await browser.newPage();
  const consoleLog = [];
  page.on("console", (msg) => consoleLog.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => consoleLog.push(`pageerror: ${err.message}`));
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const iframe = page.locator("#masque-gs-quickstart");
  await iframe.waitFor({ state: "attached", timeout: 20000 });
  // The quick start iframe is taller than the viewport, and Documenter
  // keeps shifting layout while fonts and the theme settle. Playwright's
  // actionability check then never calls the iframe stable.
  await iframe.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
  const handle = await iframe.elementHandle();
  let frame = null;
  const frameDeadline = Date.now() + 20000;
  while (Date.now() < frameDeadline) {
    frame = await handle.contentFrame();
    if (frame) {
      const hasDoc = await frame.evaluate(() => document.readyState).catch(() => null);
      if (hasDoc) break;
    }
    await sleep(250);
  }
  if (!frame) throw new Error("getting-started iframe has no contentDocument");

  await waitMounted(frame);

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
