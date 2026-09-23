// Live-verify contourf holes on busier fields (pedestal, island bump, dented ring).
//   node contourf_complex.mjs <base-url> <notebook-abs-path> <cairo|webgl> [evidence-dir]
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const [base, notebook, backend, evidenceArg] = process.argv.slice(2);
if (!base || !notebook || !backend) {
  console.error("usage: node contourf_complex.mjs <base-url> <notebook> <cairo|webgl> [evidence-dir]");
  process.exit(2);
}
const evidence = evidenceArg || ".";
fs.mkdirSync(evidence, { recursive: true });
const KEYS = ["pedestal", "bump", "dented"];

function ringsOf(elem) {
  return typeof elem[0] === "number" ? [elem] : elem;
}
function pointInPolygon(px, py, ring) {
  let inside = false;
  const n = ring.length / 2;
  if (n < 3) return false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[2 * i], yi = ring[2 * i + 1];
    const xj = ring[2 * j], yj = ring[2 * j + 1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInRings(px, py, rings) {
  let inside = false;
  for (const ring of rings) if (pointInPolygon(px, py, ring)) inside = !inside;
  return inside;
}
function hitIndex(geom, x, y) {
  for (let k = 0; k < geom.length; k++) if (pointInRings(x, y, ringsOf(geom[k]))) return k;
  return -1;
}
function ringsPath(rings) {
  let d = "";
  for (const ring of rings) {
    if (ring.length < 4) continue;
    d += `M${ring[0]} ${ring[1]}`;
    for (let k = 2; k < ring.length; k += 2) d += `L${ring[k]} ${ring[k + 1]}`;
    d += "Z";
  }
  return d;
}
// The browser truncates clientX/clientY to integer CSS px, which is about 2 image px here.
// A sample has to stay inside its region under a small nudge or the pointer lands on the neighbour.
function stable(x, y, pred) {
  for (const dx of [-3, 0, 3]) {
    for (const dy of [-3, 0, 3]) if (!pred(x + dx, y + dy)) return false;
  }
  return true;
}
// A point in the fill: step off an exterior edge until even-odd says inside.
function fillPoint(rings) {
  const ext = rings[0];
  const n = ext.length / 2;
  let loose = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const mx = (ext[2 * i] + ext[2 * j]) / 2;
    const my = (ext[2 * i + 1] + ext[2 * j + 1]) / 2;
    const dx = ext[2 * j] - ext[2 * i];
    const dy = ext[2 * j + 1] - ext[2 * i + 1];
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const nx = -dy / len, ny = dx / len;
    for (const s of [2, 4, 8, 14, 22]) {
      for (const sign of [1, -1]) {
        const x = mx + sign * s * nx, y = my + sign * s * ny;
        if (!pointInRings(x, y, rings)) continue;
        if (stable(x, y, (px, py) => pointInRings(px, py, rings))) return { x, y };
        loose = loose || { x, y };
      }
    }
  }
  return loose;
}
// Centroid, then a grid, so a concave hole still yields an interior point.
// `rings` is the parent; the point must sit in the hole and outside the parent, with margin.
function holePoint(hole, rings) {
  const candidates = [];
  let sx = 0, sy = 0;
  const n = hole.length / 2;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = hole[2 * i], y = hole[2 * i + 1];
    sx += x; sy += y;
    xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
    ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
  }
  candidates.push({ x: sx / n, y: sy / n });
  for (let a = 0; a < 28; a++) {
    for (let b = 0; b < 28; b++) {
      candidates.push({
        x: xmin + (xmax - xmin) * (a + 0.5) / 28,
        y: ymin + (ymax - ymin) * (b + 0.5) / 28,
      });
    }
  }
  const insideHole = (x, y) => pointInPolygon(x, y, hole) && !pointInRings(x, y, rings);
  let loose = null;
  for (const c of candidates) {
    if (!insideHole(c.x, c.y)) continue;
    if (stable(c.x, c.y, insideHole)) return c;
    loose = loose || c;
  }
  return loose;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || undefined,
});
const context = await browser.newContext({
  locale: "en-US", timezoneId: "UTC",
  viewport: { width: 1100, height: 1400 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const unexpected = [];
page.on("pageerror", (e) => {
  const msg = e.message;
  if (/Bonito\.(decode_binary|fetch_binary) is not a function/.test(msg)) return;
  unexpected.push(msg);
  console.error("PAGEERROR:", msg);
});

try {
  await page.goto(`${base}/open?path=${encodeURIComponent(notebook)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const deadline = Date.now() + 1500000;
  let ready = false, tick = 0;
  while (Date.now() < deadline) {
    const st = await page.evaluate((keys) => {
      const runBtn = [...document.querySelectorAll("button, a")].find((b) => /run notebook code/i.test(b.innerText || b.title || ""));
      if (runBtn && !window.__masqueClickedRun) { runBtn.click(); window.__masqueClickedRun = true; }
      const hosts = [...document.querySelectorAll(".ip-host")];
      let surfaces = 0;
      for (const h of hosts) {
        let sr = null;
        h.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        if (sr && sr.querySelector(".surface")) surfaces++;
      }
      const coords = keys.every((k) => !!document.querySelector(`#coords_${k}`)?.textContent);
      return {
        busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
        errored: document.querySelectorAll("pluto-cell.errored").length,
        hosts: hosts.length,
        surfaces,
        coords,
        backend: document.querySelector("#complex_backend")?.textContent?.trim() || "",
        errText: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).join("\n").slice(0, 800),
      };
    }, KEYS);
    if (st.errored) throw new Error(`${backend} notebook errored: ${st.errText}`);
    if (!st.busy && st.surfaces >= KEYS.length && st.coords) { ready = true; break; }
    if (tick % 15 === 0) console.error(`  …${backend} [${tick}s] busy=${st.busy} hosts=${st.hosts} surfaces=${st.surfaces}`);
    tick++;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error(`${backend} timed out waiting for complex contourf widgets`);
  const pageBackend = await page.evaluate(() => document.querySelector("#complex_backend")?.textContent?.trim());
  if (pageBackend !== backend) throw new Error(`notebook backend ${pageBackend} != ${backend}`);

  const dispatchAt = async (key, x, y, type) => page.evaluate(async ([k, ix, iy, typ]) => {
    const span = document.querySelector(`#coords_${k}`);
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    let sr = null;
    host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const b = host.querySelector("img, canvas").getBoundingClientRect();
    const svg = sr.querySelector("svg.masque-plain");
    const outW = svg.viewBox.baseVal.width;
    const outH = svg.viewBox.baseVal.height;
    const sx = b.width / outW, sy = b.height / outH;
    const cx = b.left + ix * sx, cy = b.top + iy * sy;
    const o = { bubbles: true, composed: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, pointerType: "mouse", isPrimary: true };
    const surface = sr.querySelector(".surface");
    surface.dispatchEvent(new PointerEvent(typ === "click" ? "pointermove" : typ, o));
    if (typ === "click") {
      surface.dispatchEvent(new PointerEvent("pointerdown", o));
      surface.dispatchEvent(new PointerEvent("pointerup", o));
      surface.dispatchEvent(new MouseEvent("click", o));
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    // A miss fades the previous highlight for ~100ms and drops the tooltip's `show` class
    // without clearing its text or setting display:none. A fading node is not a hit.
    const hi = (svgName) => {
      const el = sr.querySelector(svgName)?.querySelector("g.hi")?.firstElementChild;
      if (!el || el.classList.contains("masque-leave")) return null;
      return { tag: el.tagName.toLowerCase(), fillRule: el.getAttribute("fill-rule"), d: el.getAttribute("d"), className: el.getAttribute("class") };
    };
    const tip = sr.querySelector(".masque-tip");
    const shown = tip && tip.classList.contains("show") && tip.textContent.trim().length > 0;
    return { tip: shown ? tip.textContent.trim() : "", fill: hi("svg.masque-fill"), edge: hi("svg.masque-edge") };
  }, [key, x, y, type]);

  const shots = [];
  for (const key of KEYS) {
    const layers = await page.evaluate((k) => JSON.parse(document.querySelector(`#coords_${k}`).textContent), key);
    const layer = layers.find((l) => l.kind === "polygons");
    const geom = layer.geometry;
    if (geom.length !== layer.payloads.length) throw new Error(`${key}: payload count != elements`);
    let maxRings = 1;
    let shot = null;
    for (let k = 0; k < geom.length; k++) {
      const rings = ringsOf(geom[k]);
      if (rings.length < 2) continue;
      maxRings = Math.max(maxRings, rings.length);
      const fill = fillPoint(rings);
      if (!fill) throw new Error(`${key} elem ${k}: no fill sample`);
      if (hitIndex(geom, fill.x, fill.y) !== k) throw new Error(`${key} elem ${k}: fill sample hits a different element`);
      const hover = await dispatchAt(key, fill.x, fill.y, "pointermove");
      const want = ringsPath(rings);
      for (const half of [hover.fill, hover.edge]) {
        if (!half || half.tag !== "path" || half.fillRule !== "evenodd" || half.d !== want) {
          throw new Error(`${key} elem ${k}: fill highlight is not the evenodd ring group: ${JSON.stringify(half)}`);
        }
      }
      if (!shot || rings.length > shot.rings) shot = { x: fill.x, y: fill.y, rings: rings.length };
      const low = String(layer.payloads[k].low);
      if (!hover.tip.includes(low)) throw new Error(`${key} elem ${k}: tooltip ${JSON.stringify(hover.tip)} missing low=${low}`);

      for (let h = 1; h < rings.length; h++) {
        const pt = holePoint(rings[h], rings);
        if (!pt) throw new Error(`${key} elem ${k} hole ${h}: no interior`);
        if (pointInRings(pt.x, pt.y, rings)) throw new Error(`${key} elem ${k} hole ${h}: still inside the parent`);
        const hh = await dispatchAt(key, pt.x, pt.y, "pointermove");
        const parentD = want;
        if (hh.fill?.d === parentD || hh.edge?.d === parentD) {
          throw new Error(`${key} elem ${k} (${rings.length} rings) hole ${h}: hover painted the parent`);
        }
        const landed = hitIndex(geom, pt.x, pt.y);
        if (landed < 0) {
          if (hh.tip || hh.fill || hh.edge) throw new Error(`${key} elem ${k} hole ${h}: empty hole still shows a hit`);
        } else {
          if (!hh.fill || !hh.edge) throw new Error(`${key} elem ${k} hole ${h}: island drew no highlight`);
          const islandLow = String(layer.payloads[landed].low);
          if (!hh.tip.includes(islandLow)) throw new Error(`${key} elem ${k} hole ${h}: tooltip is not the island`);
        }
      }
    }
    if (maxRings < 2) throw new Error(`${key}: shipped no holed element`);
    if (key === "pedestal" && maxRings < 4) throw new Error(`pedestal max rings ${maxRings}, want at least 4`);
    shots.push({ key, ...shot });
    console.error(`  ${key}: max rings ${maxRings}`);
  }

  // One click on the busiest pedestal polygon, after the hovers, so selection doesn't hide them.
  const ped = shots.find((s) => s.key === "pedestal");
  await dispatchAt("pedestal", ped.x, ped.y, "click");
  await page.waitForFunction(() => /ElementEvent\(:contourf,/.test(document.querySelector("#out_pedestal").textContent), null, { timeout: 20000 });

  if (unexpected.length) throw new Error(`page errors: ${unexpected.join(" | ")}`);

  for (const shot of shots) {
    await dispatchAt(shot.key, shot.x, shot.y, "pointermove");
    const host = await page.evaluateHandle((k) => {
      const span = document.querySelector(`#out_${k}`);
      const hosts = [...document.querySelectorAll(".ip-host")];
      return hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    }, shot.key);
    const el = host.asElement();
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: path.join(evidence, `contourf-complex-${shot.key}-${backend}.png`) });
    await host.dispose();
  }
  console.error(`CONTOURF COMPLEX OK (${backend})`);
} finally {
  await browser.close();
}
