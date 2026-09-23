// Live-verify contourf holes on Cairo or WebGL through Pluto.
//   node contourf_holes.mjs <base-url> <notebook-abs-path> <cairo|webgl> [evidence-dir]
//
// A pointer in a hole misses that polygon. On the Gaussian the origin lands on the
// innermost disk. On the two-peak field the peak sits above the top edge, so the hole is empty.
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const [base, notebook, backend, evidenceArg] = process.argv.slice(2);
if (!base || !notebook || !backend) {
  console.error("usage: node contourf_holes.mjs <base-url> <notebook> <cairo|webgl> [evidence-dir]");
  process.exit(2);
}
const evidence = evidenceArg || ".";
fs.mkdirSync(evidence, { recursive: true });

function ringsOf(elem) {
  return typeof elem[0] === "number" ? [elem] : elem;
}
function pointInPolygon(px, py, ring) {
  let inside = false;
  const n = ring.length / 2;
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
function centroid(ring) {
  let sx = 0, sy = 0;
  const n = ring.length / 2;
  for (let i = 0; i < ring.length; i += 2) { sx += ring[i]; sy += ring[i + 1]; }
  return { x: sx / n, y: sy / n };
}
// A point in the filled band of a holed element: outside every hole, inside the exterior.
function annulusPoint(elem) {
  const rings = ringsOf(elem);
  if (rings.length < 2) throw new Error("annulusPoint: element has no hole");
  const holeC = centroid(rings[1]);
  let best = null, bestd = -1;
  const ext = rings[0];
  for (let i = 0; i < ext.length; i += 2) {
    const d = (ext[i] - holeC.x) ** 2 + (ext[i + 1] - holeC.y) ** 2;
    if (d > bestd) { bestd = d; best = { x: ext[i], y: ext[i + 1] }; }
  }
  for (let t = 0.2; t <= 0.9; t += 0.05) {
    const x = holeC.x + (best.x - holeC.x) * t;
    const y = holeC.y + (best.y - holeC.y) * t;
    if (pointInRings(x, y, rings)) return { x, y };
  }
  throw new Error("annulusPoint: no sample landed in the fill");
}
function projectAxis(t, x, y) {
  const [vx, vy, vw, vh] = t.viewport;
  let fx = (x - t.xlims[0]) / (t.xlims[1] - t.xlims[0]);
  let fy = (y - t.ylims[0]) / (t.ylims[1] - t.ylims[0]);
  if (t.xreversed) fx = 1 - fx;
  if (t.yreversed) fy = 1 - fy;
  return { x: vx + fx * vw, y: vy + (1 - fy) * vh };
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || undefined,
});
const context = await browser.newContext({
  locale: "en-US", timezoneId: "UTC",
  viewport: { width: 1100, height: 900 },
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
    const st = await page.evaluate(() => {
      const runBtn = [...document.querySelectorAll("button, a")].find((b) => /run notebook code/i.test(b.innerText || b.title || ""));
      if (runBtn && !window.__masqueClickedRun) { runBtn.click(); window.__masqueClickedRun = true; }
      const hosts = [...document.querySelectorAll(".ip-host")];
      let surfaces = 0;
      for (const h of hosts) {
        let sr = null;
        h.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        if (sr && sr.querySelector(".surface")) surfaces++;
      }
      return {
        busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
        errored: document.querySelectorAll("pluto-cell.errored").length,
        hosts: hosts.length,
        surfaces,
        gauss: !!document.querySelector("#coords_gauss")?.textContent,
        peaks: !!document.querySelector("#coords_peaks")?.textContent,
        backend: document.querySelector("#holes_backend")?.textContent?.trim() || "",
        errText: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).join("\n").slice(0, 800),
      };
    });
    if (st.errored) throw new Error(`${backend} notebook errored: ${st.errText}`);
    if (!st.busy && st.surfaces >= 2 && st.gauss && st.peaks) { ready = true; break; }
    if (tick % 15 === 0) console.error(`  …${backend} [${tick}s] busy=${st.busy} hosts=${st.hosts} surfaces=${st.surfaces}`);
    tick++;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error(`${backend} timed out waiting for contourf widgets`);
  const pageBackend = await page.evaluate(() => document.querySelector("#holes_backend")?.textContent?.trim());
  if (pageBackend !== backend) throw new Error(`notebook backend ${pageBackend} != ${backend}`);

  const read = async (key) => page.evaluate((k) => ({
    layers: JSON.parse(document.querySelector(`#coords_${k}`).textContent),
    axes: JSON.parse(document.querySelector(`#axes_${k}`).textContent),
    bond: document.querySelector(`#out_${k}`).textContent,
  }), key);

  const dispatchAt = async (key, x, y, type) => page.evaluate(async ([k, ix, iy, typ]) => {
    const span = document.querySelector(`#coords_${k}`);
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    let sr = null;
    host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const b = host.querySelector("img, canvas").getBoundingClientRect();
    const outW = sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
    const s = b.width / outW;
    const cx = b.left + ix * s, cy = b.top + iy * s;
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
      return {
        tag: el.tagName.toLowerCase(),
        fillRule: el.getAttribute("fill-rule"),
        d: el.getAttribute("d"),
        className: el.getAttribute("class"),
      };
    };
    const tip = sr.querySelector(".masque-tip");
    const shown = tip && tip.classList.contains("show") && tip.textContent.trim().length > 0;
    return { tip: shown ? tip.textContent.trim() : "", fill: hi("svg.masque-fill"), edge: hi("svg.masque-edge") };
  }, [key, x, y, type]);

  const gauss = await read("gauss");
  const gLayer = gauss.layers.find((l) => l.kind === "polygons");
  const gAxis = Object.values(gauss.axes)[0];
  const origin = projectAxis(gAxis, 0, 0);
  const originHit = hitIndex(gLayer.geometry, origin.x, origin.y);
  if (originHit < 0) throw new Error(`gaussian origin missed every polygon at ${JSON.stringify(origin)}`);
  const lows = gLayer.payloads.map((p) => p.low);
  const inner = lows.indexOf(Math.max(...lows));
  if (originHit !== inner) {
    throw new Error(`gaussian origin hit element ${originHit} (low=${lows[originHit]}) instead of innermost ${inner} (low=${lows[inner]})`);
  }
  const holed = gLayer.geometry.findIndex((e) => Array.isArray(e[0]));
  if (holed < 0) throw new Error("gaussian shipped no holed element");
  const holeC = centroid(ringsOf(gLayer.geometry[holed])[1]);
  const holeHit = hitIndex(gLayer.geometry, holeC.x, holeC.y);
  if (holeHit === holed) throw new Error(`hole centroid of element ${holed} still hits that element`);
  const ann = annulusPoint(gLayer.geometry[holed]);
  if (hitIndex(gLayer.geometry, ann.x, ann.y) !== holed) {
    throw new Error(`annulus sample ${JSON.stringify(ann)} is not a hit of holed element ${holed}`);
  }

  const annHover = await dispatchAt("gauss", ann.x, ann.y, "pointermove");
  for (const half of [annHover.fill, annHover.edge]) {
    if (!half || half.tag !== "path" || half.fillRule !== "evenodd") {
      throw new Error(`holed highlight is not an evenodd path: ${JSON.stringify(annHover)}`);
    }
    const zs = (half.d.match(/Z/g) || []).length;
    if (zs < 2) throw new Error(`holed highlight path has ${zs} subpaths, want the exterior and the hole: ${half.d}`);
  }
  if (!/masque-fillshape/.test(annHover.fill.className || "")) throw new Error(`fill half missing fillshape: ${annHover.fill.className}`);
  if (!/masque-hover/.test(annHover.edge.className || "")) throw new Error(`edge half missing hover: ${annHover.edge.className}`);

  // Before any click, so this hit is not the already-selected no-highlight path.
  const holeHover = await dispatchAt("gauss", holeC.x, holeC.y, "pointermove");
  const outerD = ringsPath(ringsOf(gLayer.geometry[holed]));
  if (holeHit < 0) {
    if (holeHover.tip || holeHover.fill || holeHover.edge) {
      throw new Error(`empty hole still highlighted: ${JSON.stringify(holeHover)}`);
    }
  } else {
    if (!holeHover.fill || !holeHover.edge) throw new Error(`inner polygon under the hole drew no highlight: ${JSON.stringify(holeHover)}`);
    if (holeHover.fill.d === outerD) throw new Error("hole hover painted the outer polygon");
    const innerLow = String(gLayer.payloads[holeHit].low);
    if (!holeHover.tip.includes(innerLow)) {
      throw new Error(`hole tooltip ${JSON.stringify(holeHover.tip)} is not element ${holeHit} low=${innerLow}`);
    }
  }

  await dispatchAt("gauss", ann.x, ann.y, "click");
  await page.waitForFunction(() => /ElementEvent\(:contourf,/.test(document.querySelector("#out_gauss").textContent), null, { timeout: 20000 });
  const gaussBond = await page.evaluate(() => document.querySelector("#out_gauss").textContent);
  const gm = /ElementEvent\(:contourf,\s*(\d+)/.exec(gaussBond);
  if (!gm || Number(gm[1]) !== holed + 1) throw new Error(`gaussian click bond ${gaussBond} is not element ${holed + 1}`);

  await dispatchAt("gauss", origin.x, origin.y, "click");
  await page.waitForFunction((want) => {
    const m = /ElementEvent\(:contourf,\s*(\d+)/.exec(document.querySelector("#out_gauss").textContent || "");
    return m && Number(m[1]) === want;
  }, inner + 1, { timeout: 20000 });

  const peaks = await read("peaks");
  const pLayer = peaks.layers.find((l) => l.kind === "polygons");
  const pAxis = Object.values(peaks.axes)[0];
  const peak = projectAxis(pAxis, 1.2, 0);
  const peakHit = hitIndex(pLayer.geometry, peak.x, peak.y);
  if (peakHit !== -1) {
    throw new Error(`unfilled peak hit element ${peakHit} payload ${JSON.stringify(pLayer.payloads[peakHit])}`);
  }
  const nested = pLayer.geometry.filter((e) => Array.isArray(e[0])).length;
  if (nested < 1) throw new Error("two-peak field shipped no ring group");
  if (pLayer.payloads.length !== pLayer.geometry.length) {
    throw new Error(`payload count ${pLayer.payloads.length} != elements ${pLayer.geometry.length}`);
  }
  const peakHover = await dispatchAt("peaks", peak.x, peak.y, "pointermove");
  if (peakHover.tip || peakHover.fill || peakHover.edge) {
    throw new Error(`unfilled peak still shows a hit: ${JSON.stringify(peakHover)}`);
  }

  if (unexpected.length) throw new Error(`console/page errors: ${unexpected.join(" | ")}`);

  const host = page.locator(".ip-host").first();
  await host.scrollIntoViewIfNeeded();
  await dispatchAt("gauss", ann.x, ann.y, "pointermove");
  await host.screenshot({ path: path.join(evidence, `contourf-holes-${backend}.png`) });
  console.error(`CONTOURF HOLES OK (${backend})`);
} finally {
  await browser.close();
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
