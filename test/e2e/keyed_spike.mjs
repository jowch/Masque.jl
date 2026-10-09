// Spike (composite bond): drive keyed_spike.jl in a live Pluto and check each gesture fills its
// own slot of the keyed `@bind` value without clearing the others, on the backend the server's
// MASQUE_SPIKE_BACKEND names.
//
//   node keyed_spike.mjs <base-url> <notebook-abs-path> [screenshot-path]

import { chromium } from "playwright";
import { shutdownOpenSession } from "./fresh_session.mjs";

const [base, notebook, shot] = process.argv.slice(2);
const errors = [];
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const context = await browser.newContext({
    locale: "en-US", timezoneId: "UTC", viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  // Pluto's own update check is blocked by the cloud network policy; it is not ours.
  const NOISE = /pluto-available\.fonsp\.com|Failed to load resource: net::ERR_FAILED/
  page.on("console", (m) => { if (m.type() === "error" && !NOISE.test(m.text())) errors.push(m.text()) });

  await shutdownOpenSession(base, notebook);
  await page.goto(`${base}/open?path=${encodeURIComponent(notebook)}`, { waitUntil: "domcontentloaded" });
  const deadline = Date.now() + 900000;
  for (;;) {
    const st = await page.evaluate(() => {
      const run = [...document.querySelectorAll("button, a")].find((b) => /run notebook code/i.test(b.innerText || b.title || ""));
      if (run && !window.__ran) { run.click(); window.__ran = true }
      const host = document.querySelector(".ip-host");
      let sr = null; host?.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot });
      return {
        busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
        errored: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).join("\n"),
        ready: !!sr?.querySelector(".surface") && !!document.querySelector("#out_keyed"),
      };
    });
    if (st.errored) throw new Error(`cell errored:\n${st.errored.slice(0, 2000)}`);
    if (st.ready && st.busy === 0) break;
    if (Date.now() > deadline) throw new Error("notebook never became ready");
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(3000);

  const backend = (await page.textContent("#backend_keyed")).trim();
  console.log(`backend: ${backend}`);
  const manifest = JSON.parse(await page.textContent("#manifest_keyed"));
  const layer = (id) => manifest.layers.find((l) => l.id === id);
  const out = () => page.textContent("#out_keyed");
  // image px -> page px, through the base image/canvas the overlay sits on
  const rect = await page.evaluate(() => {
    const b = document.querySelector(".ip-host").querySelector("img, canvas").getBoundingClientRect();
    return { left: b.left + window.scrollX, top: b.top + window.scrollY, width: b.width };
  });
  await page.evaluate(() => document.querySelector(".ip-host").scrollIntoView({ block: "center" }));
  const r2 = await page.evaluate(() => {
    const b = document.querySelector(".ip-host").querySelector("img, canvas").getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width };
  });
  const s = r2.width / manifest.width;
  const at = (x, y) => ({ x: r2.left + x * s, y: r2.top + y * s });
  const selCount = () => page.evaluate(() => {
    let sr = null; document.querySelector(".ip-host").querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot });
    return [...sr.querySelectorAll("g.sel")].reduce((n, g) => n + g.children.length, 0);
  });
  const waitChange = async (prev) => {
    const t = Date.now() + 120000;
    for (;;) {
      const now = await out();
      if (now !== prev) { await page.waitForTimeout(500); return out() }
      if (Date.now() > t) return now;
      await page.waitForTimeout(250);
    }
  };
  void rect;

  const v0 = await out();
  console.log(v0);
  check("starts with every slot", /dots = nothing/.test(v0) && /cutoff = ThresholdEvent\(:cutoff, value = 6\.0\)/.test(v0) && /box = nothing/.test(v0), v0);
  check("manifest lists the slots", JSON.stringify(manifest.keyed) === JSON.stringify(["dots", "cutoff", "box"]));

  // 1. drag the threshold left by 60 image px
  const tg = layer("cutoff").geometry;
  const mid = (tg.span[0] + tg.span[1]) / 2;
  const p0 = tg.orientation === "h" ? at(mid, tg.pos) : at(tg.pos, mid);
  const p1 = tg.orientation === "h" ? at(mid, tg.pos + 60) : at(tg.pos - 60, mid);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, { steps: 4 });
  await page.mouse.move(p1.x, p1.y, { steps: 4 });
  await page.mouse.up();
  const v1 = await waitChange(v0);
  console.log(v1);
  check("threshold drag fills only its slot", !/cutoff = ThresholdEvent\(:cutoff, value = 6\.0\)/.test(v1) && /cutoff = ThresholdEvent/.test(v1) && /dots = nothing/.test(v1) && /box = nothing/.test(v1), v1);

  // 2. move the box by 30 image px (press inside, drag, release): it brushes pts
  const bg = layer("box").geometry;
  const c0 = at(bg.x + bg.w / 2, bg.y + bg.h / 2), c1 = at(bg.x + bg.w / 2 + 30, bg.y + bg.h / 2 - 30);
  await page.mouse.move(c0.x, c0.y);
  await page.mouse.down();
  await page.mouse.move(c1.x, c1.y, { steps: 6 });
  await page.mouse.up();
  const v2 = await waitChange(v1);
  console.log(v2);
  const cutoff1 = v1.match(/cutoff = (ThresholdEvent\([^)]*\))/)?.[1];
  check("box drag fills only its slot", /box = (Masque\.)?ElementEvent\[/.test(v2) && v2.includes(cutoff1) && /dots = nothing/.test(v2), v2);
  const brushed = await selCount();
  check("brush highlights marks", brushed > 0, `${brushed} sel nodes`);

  // 3. click the orange dot
  const dg = layer("dots").geometry;
  const d0 = at(dg[0], dg[1]);
  await page.mouse.move(d0.x, d0.y);
  await page.waitForTimeout(300);
  await page.mouse.click(d0.x, d0.y);
  const v3 = await waitChange(v2);
  console.log(v3);
  const box2 = v2.match(/box = (.*)\)$/)?.[1];
  check("click fills only its slot", /dots = (Masque\.)?ElementEvent\(:dots, 1/.test(v3) && v3.includes(cutoff1) && (box2 ? v3.includes(box2) : true), v3);
  const both = await selCount();
  check("click highlight adds to the brush highlight", both > brushed, `${brushed} -> ${both}`);

  // 4. hover the box's target outside the box: the tooltip still shows (inside the box body the
  // box takes the pointer, as it does without keyed)
  const pg = layer("pts").geometry;
  const h0 = at(pg[9], pg[10]);
  await page.mouse.move(h0.x + 30, h0.y + 30, { steps: 3 });
  await page.mouse.move(h0.x, h0.y, { steps: 3 });
  await page.waitForTimeout(400);
  const tip = await page.evaluate(() => {
    let sr = null; document.querySelector(".ip-host").querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot });
    return sr.querySelector(".masque-tip")?.textContent ?? "";
  });
  check("hover on the target shows its tooltip", tip === "d", JSON.stringify(tip));

  // 5. click the dot again: only its slot clears
  await page.mouse.click(d0.x, d0.y);
  const v4 = await waitChange(v3);
  console.log(v4);
  check("second click clears only its slot", /dots = nothing/.test(v4) && v4.includes(cutoff1), v4);
  check("brush highlight survives", (await selCount()) === brushed, `${await selCount()} vs ${brushed}`);

  if (shot) {
    await page.mouse.click(d0.x, d0.y);
    await waitChange(v4);
    await page.mouse.move(r2.left - 20, r2.top - 20);
    await page.waitForTimeout(500);
    await page.locator(".ip-host").screenshot({ path: shot });
  }
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
const bad = checks.filter((c) => !c.ok);
console.log(`${checks.length - bad.length}/${checks.length} passed`);
process.exit(bad.length ? 1 : 0);
