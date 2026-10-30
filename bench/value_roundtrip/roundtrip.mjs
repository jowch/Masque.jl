// Click to `@bind` value cell on a plain scatter, split into stages (#479); the numbers in
// docs/dev/perf-findings.md ("Click to value cell") come from this script.
//
// Run Pluto headless on the warmed env (CLAUDE.md, "Pluto integration testing"), with
// MASQUE_DEV_ENV set and Playwright installed by `scripts/cloud-warm.sh e2e`, then:
//   node bench/value_roundtrip/roundtrip.mjs http://localhost:1234 $PWD/bench/value_roundtrip/cairo.jl [n] [out.json]
// and the same with webgl.jl, each on a fresh session (test/e2e/fresh_session.mjs).
// Stages per sample (ms from the click): commit = overlay fires "input"; send = Pluto's first
// websocket send after it; julia = the value cell's time() stamp (same machine clock); recv =
// first websocket message after the stamp; dom = the new stamp seen in the page.
const { chromium } = await import(new URL("../../test/e2e/node_modules/playwright/index.mjs", import.meta.url));
const [base, notebook, nArg, outFile] = process.argv.slice(2);
const N = +(nArg || 10);
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "en-US", timezoneId: "UTC", viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  window.__ws = [];
  const S = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { window.__ws.push({ d: "out", t: performance.now(), n: d.byteLength ?? d.length }); return S.call(this, d); };
  const W = window.WebSocket;
  window.WebSocket = function (...a) { const s = new W(...a); s.addEventListener("message", (e) => window.__ws.push({ d: "in", t: performance.now(), n: e.data.byteLength ?? e.data.size ?? e.data.length })); return s; };
  window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, W);
  window.__long = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: e.duration }); }).observe({ type: "longtask", buffered: true }); } catch {}
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}/open?path=${encodeURIComponent(notebook)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
const t0 = Date.now();
for (;;) {
  const s = await page.evaluate(() => {
    const run = [...document.querySelectorAll("button, a")].find((b) => /run notebook code/i.test(b.innerText || b.title || ""));
    if (run && !window.__ran) { window.__ran = true; run.click(); }
    return { busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
      err: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).join("\n").slice(0, 2000),
      c: !!document.querySelector("#coords"), hosts: document.querySelectorAll(".ip-host").length };
  });
  if (s.err) { console.error("cell error:\n" + s.err); process.exit(1); }
  if (s.c && s.busy === 0) break;
  if (Date.now() - t0 > 1800000) { console.error("timeout", s); process.exit(1); }
  await page.waitForTimeout(3000);
}
console.error(`ready after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await page.waitForTimeout(5000);
const C = JSON.parse(await page.evaluate(() => document.querySelector("#coords").textContent));

// cellId: the @bind cell; out: the stamp id; marker k (0/1) alternates so the value changes.
async function sample(cellId, out, k, view) {
  return page.evaluate(async ([cellId, out, k, C, view]) => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const stampT = () => +(document.getElementById(out)?.dataset.t ?? 0);
    const before = stampT();
    document.getElementById(view ?? cellId).scrollIntoView({ block: "center" });
    await new Promise((r) => setTimeout(r, 1000));
    const cell = document.getElementById(cellId);
    let target, fire;
    let tc = null;
    if (out === "out_s") {
      target = cell.querySelector("input");
      target.addEventListener("input", () => { tc ??= performance.now(); }, { once: true });
      fire = () => { target.value = String((+target.value + 1) % 1000); target.dispatchEvent(new Event("input", { bubbles: true })); };
    } else {
      const host = cell.querySelector(".ip-host");
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      host.addEventListener("input", () => { tc ??= performance.now(); }, { once: true, capture: true });
      const b = host.querySelector("img, canvas").getBoundingClientRect();
      const s = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
      const [ix, iy] = C[k];
      const o = { bubbles: true, composed: true, cancelable: true, clientX: b.left + ix * s, clientY: b.top + iy * s, pointerId: 1, pointerType: "mouse", isPrimary: true };
      const surface = sr.querySelector(".surface");
      fire = () => { surface.dispatchEvent(new PointerEvent("pointermove", o)); surface.dispatchEvent(new PointerEvent("pointerdown", o)); surface.dispatchEvent(new PointerEvent("pointerup", o)); surface.dispatchEvent(new MouseEvent("click", o)); };
    }
    await frame();
    const nws = window.__ws.length, nlong = window.__long.length;
    const t = performance.now();
    fire();
    const sync = performance.now() - t;
    let td = null;
    await new Promise((res) => {
      const mo = new MutationObserver(() => { if (stampT() !== before) { td = performance.now(); mo.disconnect(); res(); } });
      mo.observe(document.body, { subtree: true, childList: true, attributes: true });
      setTimeout(() => { mo.disconnect(); res(); }, 60000);
    });
    if (td === null) return { fail: tc === null ? "no commit" : "no stamp" };
    await frame(); await frame();
    const tp = performance.now();
    const tj = stampT() * 1000 - performance.timeOrigin;
    const ws = window.__ws.slice(nws);
    const send = ws.find((m) => m.d === "out" && m.t >= t);
    const recv = ws.find((m) => m.d === "in" && m.t >= tj);
    const long = window.__long.slice(nlong).filter((e) => e.t >= t - 50);
    const r = (x) => x == null ? null : +(x - t).toFixed(1);
    return { sync: +sync.toFixed(1), commit: r(tc), send: r(send?.t), julia: r(tj), recv: r(recv?.t), dom: r(td), paint: r(tp),
      longN: long.length, longMs: Math.round(long.reduce((a, e) => a + e.d, 0)), wsOut: ws.filter((m) => m.d === "out").length, wsIn: ws.filter((m) => m.d === "in").length };
  }, [cellId, out, k, C, view]);
}
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const cases = [["a4790000-0000-0000-0000-000000000005", "out_s", "slider (no Masque)"],
  ["a4790000-0000-0000-0000-000000000003", "out_c", "cairo, value cell"],
  ["a4790000-0000-0000-0000-000000000007", "out_c2", "cairo, re-renders cairo"]];
if (/webgl/.test(notebook)) cases.push(["a4790000-0000-0000-0000-000000000005", "out_s", "slider, webgl canvas in view", "a4790000-0000-0000-0000-000000000010"], ["a4790000-0000-0000-0000-000000000010", "out_w", "webgl, value cell"], ["a4790000-0000-0000-0000-000000000012", "out_w2", "webgl, re-renders webgl"]);
const out = { notebook, errors, cases: {} };
for (const [cell, id, name, view] of cases) {
  const runs = [];
  for (let i = 0; i < N; i++) { runs.push(await sample(cell, id, (i + 1) % 2, view)); await page.waitForTimeout(1500); }
  const keys = ["sync", "commit", "send", "julia", "recv", "dom", "paint", "longMs"];
  out.cases[name] = { median: Object.fromEntries(keys.map((k) => [k, med(runs.map((r) => r[k]))])), max: Math.max(...runs.map((r) => r.paint ?? Infinity)), runs };
  console.log(name.padEnd(26), JSON.stringify(out.cases[name].median), "max paint", out.cases[name].max);
}
// Idle main-thread check: long tasks over 5 s with nothing happening.
out.idle = await page.evaluate(async () => { document.getElementById("a4790000-0000-0000-0000-000000000010")?.scrollIntoView({ block: "center" }); await new Promise((r) => setTimeout(r, 1000)); const n = window.__long.length; let f = 0; const t = performance.now(); while (performance.now() - t < 5000) { await new Promise((r) => requestAnimationFrame(r)); f++; } const l = window.__long.slice(n); return { frames: f, longN: l.length, longMs: Math.round(l.reduce((a, e) => a + e.d, 0)) }; });
console.log("idle 5 s:", JSON.stringify(out.idle), "errors:", errors.length);
if (outFile) { const { writeFileSync } = await import("node:fs"); writeFileSync(outFile, JSON.stringify(out, null, 1)); }
await browser.close();
