// A plain page of three WGLMakie widgets outside Pluto (#300; page from standalone_webgl.jl).
// With the first URL serving WGLMakie's script, all three widgets draw their scene from
// one request and hovering a point shows its tooltip. With that URL down, the second one serves
// it. With the script altered, each widget's note says the published copy differs from the
// installed one; with every URL blocked, it says the page needs a connection. The page throws
// no error either way.
//
//   node standalone_webgl.mjs <dir with page.html, cdn.txt, WGLMakie.bundled.js>

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node standalone_webgl.mjs <dir>");
  process.exit(2);
}
const page = readFileSync(join(dir, "page.html"), "utf8");
const urls = readFileSync(join(dir, "cdn.txt"), "utf8").trim().split("\n");
const bundle = readFileSync(join(dir, "WGLMakie.bundled.js"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serveBundle = (body) => (r) => r.fulfill({
  contentType: "application/javascript; charset=utf-8",
  headers: { "access-control-allow-origin": "*" },
  body,
});

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

async function open(serves) {
  const ctx = await browser.newContext({ locale: "en-US", timezoneId: "UTC", viewport: { width: 1000, height: 900 } });
  const p = await ctx.newPage();
  const log = [];
  p.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
  p.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  const requests = urls.map(() => 0);
  await p.route("http://masque.test/", (r) => r.fulfill({ contentType: "text/html", body: page }));
  urls.forEach((u, i) => p.route(u, (r) => { requests[i]++; return serves[i](r); }));
  await p.goto("http://masque.test/", { waitUntil: "load" });
  return { ctx, p, log, requests };
}

// The overlay's shadow root is up and WGLMakie has drawn into the canvas. A canvas of one
// flat colour compresses to about 1 KB of PNG; a drawn plot, with its axes, ticks and
// marks, to several times that.
async function drawn(p) {
  const hosts = p.locator(".ip-host");
  const out = [];
  for (let i = 0; i < await hosts.count(); i++) {
    const h = hosts.nth(i);
    const ready = await h.evaluate((el) => [...el.querySelectorAll("*")].some((c) => c.shadowRoot?.querySelector(".surface"))
      && !!el.querySelector("canvas")?.wglmakie_screen);
    out.push(ready && (await h.locator("canvas").screenshot()).length > 3000);
  }
  return out;
}

async function hoverFirstPoint(p) {
  const host = p.locator(".ip-host").first();
  const pt = await host.evaluate((h) => {
    const man = JSON.parse(h.querySelector("script").textContent.match(/Masque\.mount\(canvas, (.*), new Promise/s)[1]);
    const layer = man.layers.find((l) => l.id === "scatter");
    const r = h.querySelector("canvas").getBoundingClientRect();
    const s = r.width / man.width;
    return { x: r.x + layer.geometry[0] * s, y: r.y + layer.geometry[1] * s };
  });
  let tip = "";
  for (let a = 0; a < 10 && !tip; a++) {
    await p.mouse.move(pt.x + 30, pt.y + 30);
    await p.mouse.move(pt.x, pt.y);
    await sleep(150);
    tip = await host.evaluate((h) => {
      let sr = null; h.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const t = sr && sr.querySelector(".masque-tip");
      return t && t.offsetParent !== null ? t.innerText.trim() : "";
    });
  }
  return tip;
}

// A URL this driver aborts logs a failed resource load; that is the case under test.
const errorsIn = (log) => log.filter((l) => (l.startsWith("pageerror:") || l.startsWith("error:")) && !l.includes("Failed to load resource"));

try {
  for (const [what, serves, want] of [
    ["first URL", [serveBundle(bundle), (r) => r.abort()], [1, 0]],
    ["first URL down, second serves", [(r) => r.abort(), serveBundle(bundle)], [1, 1]],
  ]) {
    const { ctx, p, log, requests } = await open(serves);
    await p.waitForFunction(() => document.querySelectorAll(".ip-host canvas").length === 3, null, { timeout: 20000 });
    let ok = [];
    for (let t = 0; t < 120 && !(ok.length === 3 && ok.every(Boolean)); t++) { await sleep(250); ok = await drawn(p); }
    if (!(ok.length === 3 && ok.every(Boolean))) throw new Error(`${what}: widgets never drew, ${JSON.stringify(ok)} | ${log.join(" | ")}`);
    if (JSON.stringify(requests) !== JSON.stringify(want)) throw new Error(`${what}: expected requests ${JSON.stringify(want)}, saw ${JSON.stringify(requests)}`);
    const tip = await hoverFirstPoint(p);
    if (!tip) throw new Error(`${what}: hovering the first point showed no tooltip`);
    const errs = errorsIn(log);
    if (errs.length) throw new Error(`${what}: page logged errors: ${errs.join(" | ")}`);
    await p.screenshot({ path: join(dir, `${what.replace(/\W+/g, "-")}.png`) });
    console.log(`E2E OK [WebGL page] ${what}: 3 widgets drew from ${requests.reduce((a, b) => a + b)} script request(s), hover tooltip ${JSON.stringify(tip)}`);
    await ctx.close();
  }

  for (const [what, serves, says] of [
    ["an altered script", urls.map(() => serveBundle(bundle.toString() + "\n//x")), "differs from the one installed"],
    ["blocked requests", urls.map(() => (r) => r.abort()), "needs an internet connection"],
  ]) {
    const { ctx, p, log } = await open(serves);
    await sleep(1500);
    const notes = await p.evaluate(() => [...document.querySelectorAll(".ip-host")].map((h) => h.querySelector(".masque-webgl-static")?.textContent ?? ""));
    if (notes.length !== 3 || notes.some((n) => !n.includes(says))) throw new Error(`${what}: expected a note saying "${says}" in each box, got ${JSON.stringify(notes)}`);
    if (log.some((l) => l.startsWith("pageerror:"))) throw new Error(`${what}: page threw | ${log.join(" | ")}`);
    console.log(`E2E OK [WebGL page] ${what}: each widget's note says it ${JSON.stringify(says)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
