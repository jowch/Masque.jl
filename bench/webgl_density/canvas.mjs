// The `:webgl` canvas density numbers in docs/dev/perf-findings.md ("Canvas density (#548)").
// For each page pages.jl wrote: the canvas size, the time to the first mounted scene, and the
// median cost of one frame (WGLMakie's own render loop, timed around renderer.render plus a
// 1-pixel readPixels so the software GPU has finished), over `runs` loads. It also saves a
// screenshot at device pixel ratio 2 for checking sharpness, and one with a tooltip up.
//   node bench/webgl_density/canvas.mjs <dir from pages.jl> [runs = 3]
const { chromium } = await import(new URL("../../test/e2e/node_modules/playwright/index.mjs", import.meta.url));
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2]; const runs = +(process.argv[3] ?? 3);
const urls = readFileSync(join(dir, "cdn.txt"), "utf8").trim().split("\n");
const bundle = readFileSync(join(dir, "WGLMakie.bundled.js"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const pages = readdirSync(dir).filter((f) => f.endsWith(".html")).sort();
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const out = [];
for (const file of pages) {
  const html = readFileSync(join(dir, file), "utf8");
  const firsts = [], frames = [];
  let info = null;
  for (let run = 0; run < runs; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const log = [];
    p.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
    p.on("console", (m) => { if (m.type() === "error") log.push(`console: ${m.text()}`); });
    await p.route("http://masque.test/", (r) => r.fulfill({ contentType: "text/html", body: html }));
    for (const u of urls) await p.route(u, (r) => r.fulfill({ contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: bundle }));
    const t0 = Date.now();
    await p.goto("http://masque.test/", { waitUntil: "load" });
    await p.waitForFunction(() => !!document.querySelector("canvas")?.wglmakie_screen?.root_scene, null, { timeout: 120000 });
    firsts.push(Date.now() - t0);
    await sleep(1500);
    // time the render loop's own frames
    const ms = await p.evaluate(async () => {
      const c = document.querySelector("canvas"); const scr = c.wglmakie_screen; const r = scr.renderer;
      const gl = r.getContext(); const px = new Uint8Array(4); const orig = r.render.bind(r); const ts = [];
      let pending = 0;
      r.render = (...a) => { const t = performance.now(); orig(...a); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); pending += performance.now() - t; };
      // a frame = all render() calls inside one rAF tick
      const end = performance.now() + 4000;
      await new Promise((res) => { const tick = () => { if (pending > 0) { ts.push(pending); pending = 0; } performance.now() < end ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); });
      r.render = orig; return ts;
    });
    frames.push(...ms);
    if (run === 0) {
      const box = await p.locator("canvas").boundingBox();
      info = await p.evaluate(() => { const c = document.querySelector("canvas"); return { cw: c.width, ch: c.height, cssw: c.getBoundingClientRect().width }; });
      await p.locator("canvas").screenshot({ path: join(dir, file.replace(".html", ".png")) });
      // hover a red marker: scan the canvas for the first red pixel cluster via the overlay tooltip
      const pts = [];
      for (let fx = 0.05; fx < 0.98; fx += 0.01) for (const fy of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) pts.push([fx, fy]);
      let tip = null;
      for (const [fx, fy] of pts) {
        await p.mouse.move(box.x + fx * box.width, box.y + fy * box.height);
        await sleep(30);
        tip = await p.evaluate(() => { for (const el of document.querySelectorAll("*")) { const t = el.shadowRoot?.querySelector(".tooltip, .ip-tooltip, [role=tooltip]"); if (t && t.textContent.trim() && getComputedStyle(t).opacity !== "0" && getComputedStyle(t).display !== "none") return t.textContent.trim(); } return null; });
        if (tip) { await sleep(1500); await p.screenshot({ path: join(dir, file.replace(".html", "-hover.png")), clip: box }); break; }
      }
      info.tip = tip; info.errors = log;
    }
    await ctx.close();
  }
  out.push({ file, ...info, first_ms: med(firsts), frame_p50: +med(frames).toFixed(2), frames: frames.length });
  console.log(JSON.stringify(out.at(-1)));
}
writeFileSync(join(dir, "perf.json"), JSON.stringify(out, null, 1));
await browser.close();
