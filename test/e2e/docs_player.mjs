// Playwright against the harvested getting-started player on the Documenter page.
// Design lock: docs/build/, not a standalone player file. Fails if wrap left
// window.Masque.mount uncallable, if overlay host.value does not key a snapshot,
// or if a listed city click does not swap #masque-out.
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

const CITIES = ["Tokyo", "Delhi", "Shanghai", "São Paulo", "Mexico City", "Cairo", "Mumbai", "Beijing"];

async function waitMounted(frame, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await frame.evaluate(() => {
      const host = document.querySelector(".ip-host");
      if (!host) return false;
      let sr = null;
      host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      return !!(sr && sr.querySelector(".surface") && typeof window.Masque?.mount === "function");
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("player overlay never mounted (host/.surface/window.Masque.mount within 20s)");
}

async function outText(frame) {
  return frame.evaluate(() => (document.getElementById("masque-out")?.innerText || "").trim());
}

async function clickCity(frame, index) {
  await frame.evaluate((idx) => {
    const host = document.querySelector(".ip-host");
    const man = host.masqueManifest;
    if (!man) throw new Error("host.masqueManifest missing — wrap did not attach the inlined manifest");
    const layer = man.layers.find((l) => l.id === "cities");
    if (!layer) throw new Error("no cities layer on inlined manifest");
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

  const iframe = page.locator("#masque-gs-player");
  await iframe.waitFor({ state: "attached", timeout: 20000 });
  await iframe.scrollIntoViewIfNeeded();
  const handle = await iframe.elementHandle();
  const frame = await handle.contentFrame();
  if (!frame) throw new Error("getting-started iframe has no contentDocument");

  await waitMounted(frame);

  const mountType = await frame.evaluate(() => typeof window.Masque.mount);
  if (mountType !== "function") {
    throw new Error(`wrap left window.Masque.mount ${mountType}, expected function`);
  }

  const snapKeys = await frame.evaluate(() => {
    const host = document.querySelector(".ip-host");
    return Object.keys(host.masqueManifest?.snapshots || {}).sort();
  });
  const wantKeys = ["null", ...CITIES.map((_, i) => `cities:${i}`)].sort();
  if (JSON.stringify(snapKeys) !== JSON.stringify(wantKeys)) {
    throw new Error(`snapshot keys ${JSON.stringify(snapKeys)} !== ${JSON.stringify(wantKeys)}`);
  }

  const idle = await outText(frame);
  if (!/Hover a city/i.test(idle)) {
    throw new Error(`idle #masque-out was ${JSON.stringify(idle)}`);
  }

  // host.value setter — the applyFromHost / keyOf path, no overlay hit-test.
  await frame.evaluate(() => {
    const host = document.querySelector(".ip-host");
    host.value = { layer: "cities", index: 0 };
    host.dispatchEvent(new Event("input"));
  });
  const keyed = await outText(frame);
  if (!keyed.includes("Tokyo selected")) {
    throw new Error(`host.value {layer,index:0} did not key a snapshot; #masque-out=${JSON.stringify(keyed)}`);
  }

  for (let i = 0; i < CITIES.length; i++) {
    await clickCity(frame, i);
    const text = await outText(frame);
    const want = `${CITIES[i]} selected — index ${i}`;
    if (!text.includes(want)) {
      throw new Error(`city ${i} (${CITIES[i]}) click did not swap #masque-out; got ${JSON.stringify(text)}`);
    }
  }

  const errors = consoleLog.filter((l) => l.startsWith("error:") || l.startsWith("pageerror:"));
  if (errors.length) throw new Error(`console errors: ${errors.join(" | ")}`);
  console.log("E2E OK [docs player] — mount callable, host.value keyed tokyo, all eight cities swapped #masque-out");
} catch (e) {
  failed = e;
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.error("E2E FAIL:", failed.message); process.exit(1); }
