// A page of two widgets that load the overlay script from jsDelivr (#311; page from
// standalone_cdn.jl). With jsDelivr serving this checkout's bundle, both widgets mount from
// one request and hovering a point shows its tooltip. With the script altered, or the
// request blocked, each widget stays a plain figure and the page throws no error.
//
//   node standalone_cdn.mjs <dir with page.html, cdn.txt>

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node standalone_cdn.mjs <dir>");
  process.exit(2);
}
const page = readFileSync(join(dir, "page.html"), "utf8");
const cdn = readFileSync(join(dir, "cdn.txt"), "utf8").trim();
const bundle = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "overlay.js"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const mounted = (p) => p.evaluate(() => [...document.querySelectorAll(".ip-host")].map((h) => [...h.querySelectorAll("*")].some((el) => el.shadowRoot?.querySelector(".surface"))));

async function open(serve) {
  const ctx = await browser.newContext({ locale: "en-US", timezoneId: "UTC" });
  const p = await ctx.newPage();
  const log = [];
  p.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
  p.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  let requests = 0;
  await p.route("http://masque.test/", (r) => r.fulfill({ contentType: "text/html", body: page }));
  await p.route(cdn, (r) => { requests++; return serve(r); });
  await p.goto("http://masque.test/", { waitUntil: "load" });
  return { ctx, p, log, requests: () => requests };
}

try {
  {
    const { ctx, p, log, requests } = await open((r) => r.fulfill({
      contentType: "application/javascript; charset=utf-8",
      headers: { "access-control-allow-origin": "*" },
      body: bundle,
    }));
    await p.waitForFunction(() => [...document.querySelectorAll(".ip-host")].every((h) => [...h.querySelectorAll("*")].some((el) => el.shadowRoot?.querySelector(".surface"))), null, { timeout: 20000 })
      .catch(() => { throw new Error(`widgets never mounted from the CDN script | ${log.join(" | ")}`); });
    if (requests() !== 1) throw new Error(`expected one request for the overlay script, saw ${requests()}`);
    const host = p.locator(".ip-host").first();
    const pt = await host.evaluate((h) => {
      const man = JSON.parse(h.querySelector("script").textContent.match(/mount\(img, (.*), new Promise/s)[1]);
      const layer = man.layers.find((l) => l.id === "scatter");
      const r = h.querySelector("img").getBoundingClientRect();
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
    if (!tip) throw new Error("hovering the first point showed no tooltip");
    const errs = log.filter((l) => l.startsWith("pageerror:") || l.startsWith("error:"));
    if (errs.length) throw new Error(`page logged errors: ${errs.join(" | ")}`);
    console.log(`E2E OK [CDN] — 2 widgets mounted from 1 script request, hover tooltip ${JSON.stringify(tip)}`);
    await ctx.close();
  }

  for (const [what, serve] of [
    ["an altered script", (r) => r.fulfill({ contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: bundle.toString() + "\n//x" })],
    ["a blocked request", (r) => r.abort()],
  ]) {
    const { ctx, p, log } = await open(serve);
    await sleep(1000);
    const m = await mounted(p);
    const imgs = await p.evaluate(() => [...document.querySelectorAll(".ip-host img")].map((i) => i.naturalWidth));
    if (m.length !== 2 || m.some(Boolean)) throw new Error(`${what}: expected no overlays, got ${JSON.stringify(m)}`);
    if (!imgs.every((w) => w > 0)) throw new Error(`${what}: figures missing, widths ${JSON.stringify(imgs)}`);
    if (log.some((l) => l.startsWith("pageerror:"))) throw new Error(`${what}: page threw | ${log.join(" | ")}`);
    if (log.filter((l) => l.includes("overlay script didn't load")).length !== 2) throw new Error(`${what}: expected a warning per widget | ${log.join(" | ")}`);
    console.log(`E2E OK [CDN] — ${what}: both widgets show their plain figure`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
