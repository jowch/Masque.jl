// A click on the kind-sweep notebook's scatter, timed until #out_scatter changes, with every other
// widget of that notebook on the page (#479; "Click to value cell" in docs/dev/perf-findings.md).
// Same setup as roundtrip.mjs, then:
//   node bench/value_roundtrip/kind_sweep_click.mjs http://localhost:1234 $PWD/test/e2e/kind_sweep_webgl.jl [n]
const { chromium } = await import(new URL("../../test/e2e/node_modules/playwright/index.mjs", import.meta.url));
const [base, notebook, nArg] = process.argv.slice(2);
const N = +(nArg || 8);
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "en-US", timezoneId: "UTC", viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: e.duration }); }).observe({ type: "longtask", buffered: true }); } catch {} });
const page = await ctx.newPage();
await page.goto(`${base}/open?path=${encodeURIComponent(notebook)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
const t0 = Date.now();
for (;;) {
  const s = await page.evaluate(() => {
    const run = [...document.querySelectorAll("button, a")].find((b) => /run notebook code/i.test(b.innerText || b.title || ""));
    if (run && !window.__ran) { window.__ran = true; run.click(); }
    return { busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length, c: !!document.querySelector("#coords_scatter"), n: document.querySelectorAll("pluto-cell").length };
  });
  if (s.c && s.busy === 0) break;
  if (Date.now() - t0 > 2400000) { console.error("timeout", s); process.exit(1); }
  await page.waitForTimeout(5000);
}
console.log(`ready after ${((Date.now() - t0) / 1000).toFixed(0)} s; canvases`, await page.evaluate(() => document.querySelectorAll("canvas").length));
await page.waitForTimeout(10000);
const runs = [];
for (let i = 0; i < N; i++) {
  const r = await page.evaluate(async (k) => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const out = () => document.getElementById("out_scatter")?.textContent;
    const outEl = document.getElementById("out_scatter");
    const cell = outEl.closest("pluto-cell").previousElementSibling;
    cell.scrollIntoView({ block: "center" });
    await new Promise((r) => setTimeout(r, 1000));
    const host = cell.querySelector(".ip-host");
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const layers = JSON.parse(document.getElementById("coords_scatter").textContent);
    const g = layers.find((l) => l.geometry).geometry;
    const b = host.querySelector("img, canvas").getBoundingClientRect();
    const s = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
    const o = { bubbles: true, composed: true, cancelable: true, clientX: b.left + g[3 * k] * s, clientY: b.top + g[3 * k + 1] * s, pointerId: 1, pointerType: "mouse", isPrimary: true };
    const surface = sr.querySelector(".surface");
    let tc = null; host.addEventListener("input", () => { tc ??= performance.now(); }, { once: true, capture: true });
    const before = out(); const nl = window.__long.length;
    await frame();
    const t = performance.now();
    for (const ty of ["pointermove", "pointerdown", "pointerup"]) surface.dispatchEvent(new PointerEvent(ty, o));
    surface.dispatchEvent(new MouseEvent("click", o));
    let td = null;
    await new Promise((res) => { const mo = new MutationObserver(() => { if (out() !== before) { td = performance.now(); mo.disconnect(); res(); } }); mo.observe(document.body, { subtree: true, childList: true, characterData: true }); setTimeout(() => { mo.disconnect(); res(); }, 60000); });
    const l = window.__long.slice(nl);
    const near = [...document.querySelectorAll("canvas")].filter((c) => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).length;
    return { commit: tc && +(tc - t).toFixed(1), dom: td && +(td - t).toFixed(1), longMs: Math.round(l.reduce((a, e) => a + e.d, 0)), canvasesInView: near };
  }, (i % 2) + 1);
  runs.push(r); console.log(JSON.stringify(r));
  await page.waitForTimeout(1500);
}
const idle = await page.evaluate(async () => { let f = 0; const t = performance.now(); while (performance.now() - t < 5000) { await new Promise((r) => requestAnimationFrame(r)); f++; } return f; });
console.log("idle frames in 5 s with scatter in view:", idle);
await browser.close();
