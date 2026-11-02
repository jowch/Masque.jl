// Overlay visual-fidelity driver, run locally and by CI's kind-sweep job. Required by
// docs/dev/live-interaction-checklist.md together with kind_sweep.mjs.
// Runs on the kind-sweep notebooks. Asserts wash/ring/hover (dodge fill + flat chrome edge
// stroke)/overlay-pin, remount fade / no pulse, the split recipe on a dark figure too (not fixed
// steel-teal, not #ff3b30), a Cairo-only flush-radius pixel check, and Pluto/OS
// prefers-color-scheme (official Pluto has no notebook toggle).
//
//   node polish_verify.mjs <base-url> <notebook-abs-path> <cairo|webgl> [artifact-dir]
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { timedChecks } from "./check_timer.mjs";
import { shutdownOpenSession } from "./fresh_session.mjs";
import { surfacePoint } from "./kind_sweep_point.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertNoAlertRed, assertNoTeal, assertWash, assertRing, assertHoverRecipe, assertCircleR,
  assertRemountStable, assertLeaveFade, assertTooltipColorScheme, assertCaretAtAnchor, HALO_CAPTURE,
} from "./visual_assert.mjs";
import { installRecorder, logCursor, logSince, pollLog } from "./transient_log.mjs";

const [base, notebook, backend, artifactDirArg] = process.argv.slice(2);
if (!base || !notebook || !backend) {
  console.error("usage: node polish_verify.mjs <base-url> <notebook> <cairo|webgl> [artifact-dir]");
  process.exit(2);
}
const artifactDir = artifactDirArg || process.env.E2E_ARTIFACT_DIR || null;
if (artifactDir) mkdirSync(artifactDir, { recursive: true });
const consoleLog = [];

const SHIM_LEAK = /\b(?:Bonito|comm)\.\w+ is not a function/;
const ALLOWED = [/Bonito\.decode_binary is not a function/, /Bonito\.fetch_binary is not a function/];

const browser = await chromium.launch({
  headless: true,
  // See kind_sweep.mjs's identical comment: this notebook mounts 20 WGL canvases (one per
  // widget) and Chromium's default active-context cap is 16 — past it, the OLDEST context is
  // silently evicted, regardless of which widgets this driver itself inspects.
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--max-active-webgl-contexts=64"],
});
const passed = timedChecks("polish_verify");
const unexpected = [];
let failed = null;
let context, page;
try {
  context = await browser.newContext({
    locale: "en-US", timezoneId: "UTC",
    viewport: { width: 1000, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  page = await context.newPage();
  // The fade's picks in a widget's shadow root (#394), every axis together; see fade.ts.
  await page.addInitScript(() => {
    window.fadeOf = (sr) => {
      const out = { picked: [], kept: [], lone: [], outlines: [] };
      for (const w of sr?.querySelectorAll(".masque-fade") ?? []) {
        for (const k of Object.keys(out)) out[k].push(...(w.masqueFade?.[k] ?? []));
      }
      return out;
    };
  });
  page.on("pageerror", (e) => {
    const shim = SHIM_LEAK.test(e.message);
    const benign = shim && ALLOWED.some((re) => re.test(e.message));
    if (!benign) unexpected.push(e.message);
    console.error(benign ? "PAGEERROR (known-benign):" : "PAGEERROR:", e.message);
  });
  // See kind_sweep.mjs: on :webgl, WGLMakie/Bonito canvas-context churn can outlast Pluto's
  // own cell-busy signal and wipe a host's overlay group mid-check. Require a quiet window.
  let lastWglChurnAt = 0;
  const WGL_CHURN_RE = /removing WGL context/;
  const WGL_QUIET_MS = 3000;
  page.on("console", (m) => {
    const text = m.text();
    consoleLog.push(`[${m.type()}] ${text}`);
    if (WGL_CHURN_RE.test(text)) lastWglChurnAt = Date.now();
  });

  await shutdownOpenSession(base, notebook);
  await page.goto(`${base}/open?path=${encodeURIComponent(notebook)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const deadline = Date.now() + 900000;
  let ready = false, tick = 0;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      // See kind_sweep.mjs: click the safe-preview banner exactly once — a repeated click on
      // an already-running notebook re-triggers Pluto's reactive run and can interrupt the
      // in-flight cell (InterruptException) under slow/contended first-open precompilation.
      const runBtn = [...document.querySelectorAll("button, a")].find((b) => /run notebook code/i.test(b.innerText || b.title || ""));
      if (runBtn && !window.__masqueClickedRun) { runBtn.click(); window.__masqueClickedRun = true; }
      const hosts = [...document.querySelectorAll(".ip-host")];
      let surfaces = 0;
      for (const h of hosts) {
        let sr = null; h.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        if (sr && sr.querySelector(".surface")) surfaces++;
      }
      return {
        busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
        errored: document.querySelectorAll("pluto-cell.errored").length,
        hosts: hosts.length, surfaces,
        scatter: !!document.querySelector("#coords_scatter"),
        lines: !!document.querySelector("#coords_lines"),
        dark: !!document.querySelector("#coords_scatter_dark"),
        styled: !!document.querySelector("#coords_scatter_styled") && !!document.querySelector("#coords_fade_pan"),
        errText: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).slice(0, 1).join(""),
      };
    });
    if (st.errored) throw new Error(`${backend} errored: ${st.errText.slice(0, 400)}`);
    const wglQuiet = !lastWglChurnAt || (Date.now() - lastWglChurnAt) > WGL_QUIET_MS;
    if (!st.busy && st.surfaces >= 3 && st.scatter && st.lines && st.dark && st.styled && wglQuiet) { ready = true; break; }
    if (tick % 20 === 0) console.error(`  …${backend} [${tick}s] busy=${st.busy} hosts=${st.hosts} surfaces=${st.surfaces} wglQuiet=${wglQuiet}`);
    tick++;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error(`${backend} timed out`);
  passed.mark("notebook ran");

  const inspect = (key) => page.evaluate(([k, haloCapture]) => {
    const haloOf = new Function("g", haloCapture);
    const span = document.querySelector(`#coords_${k}`);
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const baseEl = host.querySelector("img, canvas");
    // THREE sibling overlay svgs, same box/viewBox: svg.masque-fill (mix-blend-mode:
    // color-dodge — the brightening half) and svg.masque-edge (no blend — the flat chrome
    // stroke) together draw a closed mark's hover/selected highlight as two identical-geometry
    // shapes, one per svg; svg.masque-plain (no blend) holds ROI/threshold, the selected-open
    // ring, and any explicit-`hoverstyle` highlight. Firefox only honours `mix-blend-mode` on a
    // top-level svg, not nested SVG content, which is why each is its own sibling svg rather
    // than a per-element wrapper.
    const svgFill = sr.querySelector("svg.masque-fill");
    const svgEdge = sr.querySelector("svg.masque-edge");
    const svgPlain = sr.querySelector("svg.masque-plain");
    const bb = baseEl.getBoundingClientRect();
    const hb = host.getBoundingClientRect();
    const sbFill = svgFill.getBoundingClientRect(), sbEdge = svgEdge.getBoundingClientRect(), sbPlain = svgPlain.getBoundingClientRect();
    const kidsOf = (svg, layerName) => [...(svg?.querySelectorAll("g.masque-photo > g.sel") ?? [])].flatMap((g) => [...g.children]).map((top) => {
      // A halo is read as its ink core: a point's or a line's as the "ring" open geometry
      // draws, an area's as the closed edge shape, with the bands' strokes alongside.
      const halo = haloOf(top);
      const el = halo?.core ?? top;
      if (halo && (halo.align === "out" || halo.align === "line")) {
        const cs = getComputedStyle(el), tag = el.tagName.toLowerCase();
        const info = {
          className: el.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
          width: String(parseFloat(cs.strokeWidth)), opacity: (cs.strokeOpacity === "1" ? null : cs.strokeOpacity),
          cx: el.getAttribute("cx"), cy: el.getAttribute("cy"), r: el.getAttribute("r"), d: el.getAttribute("d"),
        };
        return { layer: layerName, kind: "ring", halo: { ...halo, core: undefined },
          lines: tag === "line" ? [info] : [], circles: tag === "circle" ? [info] : [], paths: tag === "path" ? [info] : [] };
      }
      if (!halo && el.tagName.toLowerCase() === "g") {
        return {
          layer: layerName, kind: "ring",
          lines: [...el.querySelectorAll("line")].map((ln) => {
            const cs = getComputedStyle(ln);
            return {
              className: ln.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
              width: String(parseFloat(cs.strokeWidth)), opacity: (cs.strokeOpacity === "1" ? null : cs.strokeOpacity),
            };
          }),
          circles: [...el.querySelectorAll("circle")].map((c) => {
            const cs = getComputedStyle(c);
            return {
              className: c.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
              width: String(parseFloat(cs.strokeWidth)), opacity: (cs.strokeOpacity === "1" ? null : cs.strokeOpacity),
              cx: c.getAttribute("cx"), cy: c.getAttribute("cy"), r: c.getAttribute("r"),
            };
          }),
          paths: [...el.querySelectorAll("path")].map((p) => {
            const cs = getComputedStyle(p);
            return {
              className: p.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
              width: String(parseFloat(cs.strokeWidth)), opacity: (cs.strokeOpacity === "1" ? null : cs.strokeOpacity),
              d: p.getAttribute("d"),
            };
          }),
        };
      }
      const cs = getComputedStyle(el);
      return {
        halo: halo && { ...halo, core: undefined },
        layer: layerName, kind: "closed", tag: el.tagName.toLowerCase(),
        className: el.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
        width: String(parseFloat(cs.strokeWidth)), r: el.getAttribute("r"),
        cx: el.getAttribute("cx"), cy: el.getAttribute("cy"), points: el.getAttribute("points"),
        blend: layerName === "plain" ? null : getComputedStyle(svg).mixBlendMode,
      };
    });
    const kids = [...kidsOf(svgFill, "fill"), ...kidsOf(svgEdge, "edge"), ...kidsOf(svgPlain, "plain")];
    const count = (sel) => (svgFill.querySelector(sel)?.children.length ?? 0)
      + (svgEdge.querySelector(sel)?.children.length ?? 0)
      + (svgPlain.querySelector(sel)?.children.length ?? 0);
    return {
      baseTag: baseEl.tagName.toLowerCase(),
      host: { w: hb.width, h: hb.height },
      base: { w: bb.width, h: bb.height, x: bb.x, y: bb.y },
      svgFill: { w: sbFill.width, h: sbFill.height, x: sbFill.x, y: sbFill.y },
      svgEdge: { w: sbEdge.width, h: sbEdge.height, x: sbEdge.x, y: sbEdge.y },
      svgPlain: { w: sbPlain.width, h: sbPlain.height, x: sbPlain.x, y: sbPlain.y },
      kids,
      css: sr.querySelector("style")?.textContent || "",
      hi: count("g.hi"),
      // A pick on a closed kind is drawn by the fade (a canvas per axis), not in g.sel. It
      // counts as the two shapes (fill and edge) a pick drawn in g.sel has, so a count below
      // means the same for every kind; `picked`/`kept`/`lone` are the fade's own keys.
      sel: count("g.sel") + 2 * fadeOf(sr).picked.length,
      ...fadeOf(sr),
    };
  }, [key, HALO_CAPTURE]);

  const layersOf = (key) => page.evaluate((k) => JSON.parse(document.querySelector(`#coords_${k}`).innerText), key);

  const hoverAt = (key, x, y) => page.evaluate(([k, ix, iy, haloCapture]) => {
    const haloOf = new Function("g", haloCapture);
    const span = document.querySelector(`#coords_${k}`);
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const b = host.querySelector("img, canvas").getBoundingClientRect();
    const outW = sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
    const s = b.width / outW;
    sr.querySelector(".surface").dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, composed: true, cancelable: true,
      clientX: b.left + ix * s, clientY: b.top + iy * s,
      pointerId: 1, pointerType: "mouse", isPrimary: true,
    }));
    const t = sr.querySelector(".masque-tip");
    // Bare shape in g.hi — svg.masque-fill (fill half) + svg.masque-edge (edge half) for the
    // default split-blend recipe, svg.masque-plain for an explicit `hoverstyle` (no wrapper
    // either way).
    const svgFill = sr.querySelector("svg.masque-fill"), svgEdge = sr.querySelector("svg.masque-edge"), svgPlain = sr.querySelector("svg.masque-plain");
    const groupWithChild = (svg, sel) => {
      const groups = [...(svg?.querySelectorAll(sel) ?? [])];
      return groups.find((g) => g.firstElementChild) ?? groups[0] ?? null;
    };
    const childCount = (svg, sel) => [...(svg?.querySelectorAll(sel) ?? [])].reduce((n, g) => n + g.children.length, 0);
    const capture = (svg, layerName) => {
      const top = groupWithChild(svg, "g.hi")?.firstElementChild;
      if (!top) return null;
      // A halo is captured as its ink core, with the bands' strokes alongside; the fade class
      // sits on the halo group.
      const halo = haloOf(top);
      const el = halo?.core ?? top;
      const cs = getComputedStyle(el);
      return {
        halo: halo && { ...halo, core: undefined },
        layer: layerName, className: el.getAttribute("class"), tag: el.tagName.toLowerCase(),
        fill: cs.fill, stroke: cs.stroke, fillOpacity: cs.fillOpacity,
        width: String(parseFloat(cs.strokeWidth)), opacity: (cs.strokeOpacity === "1" ? null : cs.strokeOpacity),
        r: el.getAttribute("r"), enter: top.classList.contains("masque-enter"), points: el.getAttribute("points"),
        blend: layerName === "plain" ? null : getComputedStyle(svg).mixBlendMode,
      };
    };
    const cs = t ? getComputedStyle(t) : null;
    return {
      show: t?.classList.contains("show"), text: t?.innerText ?? "",
      bg: cs?.backgroundColor, color: cs?.color,
      radius: cs?.borderTopLeftRadius, caret: t ? getComputedStyle(t, "::before").display : null,
      hi: { fill: capture(svgFill, "fill"), edge: capture(svgEdge, "edge"), plain: capture(svgPlain, "plain") },
      sel: childCount(svgFill, "g.sel") + childCount(svgEdge, "g.sel") + childCount(svgPlain, "g.sel") + 2 * fadeOf(sr).picked.length,
      ...fadeOf(sr),
    };
  }, [key, x, y, HALO_CAPTURE]);

  const expectBase = backend === "webgl" ? "canvas" : "img";
  const pin = (m, key) => {
    if (m.baseTag !== expectBase) throw new Error(`${key}: expected ${expectBase}, got ${m.baseTag}`);
    for (const [name, svgBox] of [["masque-fill", m.svgFill], ["masque-edge", m.svgEdge], ["masque-plain", m.svgPlain]]) {
      const dx = Math.abs(svgBox.x - m.base.x), dy = Math.abs(svgBox.y - m.base.y);
      const dw = Math.abs(svgBox.w - m.base.w), dh = Math.abs(svgBox.h - m.base.h);
      if (dx > 1.5 || dy > 1.5 || dw > 2 || dh > 2) {
        throw new Error(`${key}: overlay/base offset svg.${name}=${JSON.stringify(svgBox)} base=${JSON.stringify(m.base)}`);
      }
    }
  };
  // A screenshot of a widget's figure, overlay included, as RGBA pixels. `perImg` is screenshot
  // px per image px; `mean(x, y, r)` averages the RGB inside radius r around image px (x, y).
  const screenOf = async (key) => {
    // WGLMakie repaints a canvas scrolled into view on a later frame, so a screenshot taken
    // straight after the scroll can catch it blank.
    await page.evaluate(async (k) => {
      const span = document.querySelector(`#coords_${k}`);
      const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      host.scrollIntoView({ block: "center" });
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    }, key);
    if (backend === "webgl") await new Promise((r) => setTimeout(r, 250));
    const box = await page.evaluate((k) => {
      const span = document.querySelector(`#coords_${k}`);
      const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      host.scrollIntoView({ block: "center" });
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const r = host.querySelector("img, canvas").getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, s: r.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width };
    }, key);
    const png = PNG.sync.read(await page.screenshot({ clip: { x: box.left, y: box.top, width: box.width, height: box.height } }));
    // Decoded here, not in the page: sending millions of pixel values back from the page as an
    // array took ~15 s per screenshot (#492). pngjs reads the same pixels.
    const shot = { w: png.width, h: png.height, data: Array.from(png.data) };
    // Screenshot px -> image px: CSS px per screenshot px, then image px per CSS px.
    shot.perImg = shot.w / box.width * box.s;
    shot.mean = (x, y, r) => {
      const sum = [0, 0, 0];
      let n = 0;
      for (let j = Math.floor((y - r) * shot.perImg); j <= (y + r) * shot.perImg; j++) {
        for (let i = Math.floor((x - r) * shot.perImg); i <= (x + r) * shot.perImg; i++) {
          if (i < 0 || j < 0 || i >= shot.w || j >= shot.h || Math.hypot(i / shot.perImg - x, j / shot.perImg - y) > r) continue;
          const o = 4 * (j * shot.w + i);
          for (let c = 0; c < 3; c++) sum[c] += shot.data[o + c];
          n++;
        }
      }
      return sum.map((v) => v / Math.max(n, 1));
    };
    return shot;
  };

  const scatter = await inspect("scatter");
  pin(scatter, "scatter");
  passed.push(`base-${scatter.baseTag}`);
  passed.push("overlay-on-base");
  assertNoAlertRed(scatter.css, "overlay-css");
  assertNoAlertRed(scatter.kids, "scatter/sel");
  assertNoTeal(scatter.css, "overlay-css");
  assertNoTeal(scatter.kids, "scatter/sel");

  // The selected look on a closed mark (#394): the pick keeps its own pixels, the plot's other
  // marks fade toward the figure background, and a pick with no other pick near it is outlined.
  // Read off the screen: the pick's interior still reads its own colour, an unpicked marker's
  // interior has moved most of the way toward the background.
  const pts = (await layersOf("scatter")).find((l) => l.kind === "circles");
  const rGeom = pts.geometry[5]; // selectedIndex 1 → r at 3*1+2
  const assertFade = async (key, m, layer, dark) => {
    const want = `${layer.id}:1`;
    if (!m.picked.includes(want) || !m.lone.includes(want)) {
      throw new Error(`${key}/fade: want ${want} picked and outlined, got ${JSON.stringify({ picked: m.picked, lone: m.lone })}`);
    }
    if (m.kids.some((k) => k.kind === "closed")) throw new Error(`${key}/fade: the pick is also washed in g.sel`);
    const g = layer.geometry;
    const shot = await screenOf(key);
    const at = (k) => shot.mean(g[3 * k], g[3 * k + 1], 0.4 * g[3 * k + 2]);
    const raw = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(layer.colors ?? "");
    if (!raw) throw new Error(`${key}/fade: no single colour in the manifest (${JSON.stringify(layer.colors)})`);
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    // The fade goes toward the plot area: scatter_dark's axis is gray20 on a gray12 figure.
    const own = lum(raw.slice(1).map(Number)), bg = dark ? lum([51, 51, 51]) : 255;
    const picked = lum(at(1)), unpicked = lum(at(0));
    if (Math.abs(picked - own) > 20) throw new Error(`${key}/fade: the pick reads ${picked.toFixed(0)}, want its own colour ${own.toFixed(0)}`);
    if (Math.abs(unpicked - bg) > 0.5 * Math.abs(own - bg)) {
      throw new Error(`${key}/fade: an unpicked marker reads ${unpicked.toFixed(0)}, want it over halfway from its colour ${own.toFixed(0)} to the background ${bg.toFixed(0)}`);
    }
  };
  await assertFade("scatter", scatter, pts, false);
  passed.push("selected-fade");

  // Flush-radius pixel test (Cairo only — the base is an <img>; a WGL <canvas> readback isn't
  // reliable across GPU/driver combos, so this only proves the recipe where it can be proven).
  // Confirms the highlight `r` sits ON the marker's drawn edge, not offset from it: sample the
  // rendered marker (not the SVG overlay — the highlight is unhit/unhovered here) at r+3 (just
  // outside) and r-3 (just inside) along +x from its centre. r+3 must read as the figure
  // background (near-white — the scatter notebook uses the default white Figure background);
  // r-3 must read as the marker's own (non-background) colour.
  if (backend === "cairo") {
    const scx = pts.geometry[3], scy = pts.geometry[4]; // element 1 ("beta"), same point as hx/hy below
    const flush = await page.evaluate(([k, cx, cy, r]) => {
      const span = document.querySelector(`#coords_${k}`);
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      const img = host.querySelector("img");
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const sample = (x, y) => {
        const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return { r: d[0], g: d[1], b: d[2] };
      };
      return { outside: sample(cx + r + 3, cy), inside: sample(cx + r - 3, cy) };
    }, ["scatter", scx, scy, Number(rGeom)]);
    const isBg = (p) => p.r > 240 && p.g > 240 && p.b > 240;
    if (!isBg(flush.outside)) {
      throw new Error(`scatter/flush-radius: pixel at r+3 not figure background ${JSON.stringify(flush.outside)}`);
    }
    if (isBg(flush.inside)) {
      throw new Error(`scatter/flush-radius: pixel at r-3 is background — marker not flush with r ${JSON.stringify(flush.inside)}`);
    }
    passed.push("flush-radius");
  } else {
    passed.push("flush-radius-skipped-webgl"); // canvas readback of a WGL <canvas> isn't reliable
  }

  const lines = await inspect("lines");
  pin(lines, "lines");
  const ring = lines.kids.find((k) => k.kind === "ring");
  assertRing(ring, "lines");
  passed.push("selected-ring");

  const dark = await inspect("scatter_dark");
  pin(dark, "scatter_dark");
  await assertFade("scatter_dark", dark, (await layersOf("scatter_dark")).find((l) => l.kind === "circles"), true);
  assertNoAlertRed(dark.kids, "scatter_dark");
  assertNoTeal(dark.kids, "scatter_dark");
  passed.push("dark-figure-fade");

  // Element 0 ("alpha"), NOT the baked-selected element 1 ("beta"): hovering an already-selected
  // mark is a no-op (no highlight — see CLAUDE.md/kind_sweep.mjs's dedicated
  // hover-on-selected-noop check), so the standard hover-recipe check here needs its own,
  // distinct target to have anything to assert.
  const hx = pts.geometry[0], hy = pts.geometry[1];
  // #99 round 2: installed before the tooltip-establishing hover below, which is the "enter"
  // the no-pulse window (further down) is actually about — see kind_sweep.mjs's identical
  // placement and transient_log.mjs for why.
  await installRecorder(page, "scatter");
  const noPulseCursor = await logCursor(page, "scatter");
  let tip = null;
  for (let a = 0; a < 8; a++) {
    tip = await hoverAt("scatter", hx, hy);
    if (tip.show && /alpha/i.test(tip.text) && (tip.hi.fill || tip.hi.edge)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!tip?.show || !/alpha/i.test(tip.text)) throw new Error(`tooltip ${JSON.stringify(tip)}`);
  assertHoverRecipe(tip.hi, "scatter", true, false); // scatter is a closed (circle) mark: fill + edge, light figure
  if (tip.sel < 1) throw new Error("g.sel gone during hover");
  passed.push("tooltip");
  passed.push("hover-distinct");

  // Caret apex vs. anchor: a real-layout check (calc()/border-box math no jsdom/happy-dom unit
  // test can do) that the "caret on the anchor" contract actually holds on screen, not just that
  // --masque-caret-x was assigned some value. hx/hy is element 0's circle centre, i.e. exactly its
  // anchor (anchorFor's circle case) — so the anchor's page-space x is the same b.left+hx*s the
  // hover itself was dispatched at.
  const caret = await page.evaluate(([ix]) => {
    const span = document.querySelector("#coords_scatter");
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const b = host.querySelector("img, canvas").getBoundingClientRect();
    const outW = sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
    const s = b.width / outW;
    const t = sr.querySelector(".masque-tip");
    const tipRect = t.getBoundingClientRect();
    const tipBorderLeft = parseFloat(getComputedStyle(t).borderLeftWidth);
    const before = getComputedStyle(t, "::before");
    const pseudoLeft = parseFloat(before.left);
    const pseudoBorderLeft = parseFloat(before.borderLeftWidth);
    const apexX = tipRect.left + tipBorderLeft + pseudoLeft + pseudoBorderLeft;
    return { apexX, anchorX: b.left + ix * s };
  }, [hx]);
  assertCaretAtAnchor(caret.apexX, caret.anchorX, "scatter/caret");
  passed.push("caret-at-anchor");

  // #99 round 2: the stability nudge itself -- see kind_sweep.mjs's identical block for why
  // this should add nothing further to the durable log (drawHi's same-key early-return) for
  // real geometry, and why a snapshot-based compare here was vacuous in the first place.
  await page.evaluate(([ix, iy]) => {
    const span = document.querySelector("#coords_scatter");
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const b = host.querySelector("img, canvas").getBoundingClientRect();
    const outW = sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
    const s = b.width / outW;
    const o = {
      bubbles: true, composed: true, cancelable: true, clientX: b.left + ix * s, clientY: b.top + iy * s,
      pointerId: 1, pointerType: "mouse", isPrimary: true,
    };
    const surface = sr.querySelector(".surface");
    surface.dispatchEvent(new PointerEvent("pointermove", o));
    surface.dispatchEvent(new PointerEvent("pointermove", { ...o, clientX: o.clientX + 1, clientY: o.clientY + 1 }));
  }, [hx, hy]);
  assertRemountStable(await logSince(page, "scatter", noPulseCursor), "scatter");
  passed.push("no-pulse");

  // #99 round 2: reads the durable log the same way kind_sweep.mjs's remount-fade check does;
  // `sel` is stable state (unaffected by the fade), so it stays a plain inline query.
  const fadeCursor = await logCursor(page, "scatter");
  await page.evaluate(() => {
    const span = document.querySelector("#coords_scatter");
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    sr.querySelector(".surface").dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
  });
  const fadeEntries = await pollLog(page, "scatter", fadeCursor, (es) => (
    es.some((e) => e.group === "hi" && e.type === "remove") || es.some((e) => e.type === "hostRemount")
  ));
  assertLeaveFade(fadeEntries, "scatter");
  const selAfterLeave = await page.evaluate(() => {
    const span = document.querySelector("#coords_scatter");
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    return sr.querySelectorAll("svg g.masque-photo > g.sel > *").length + 2 * fadeOf(sr).picked.length;
  });
  if (selAfterLeave < 1) throw new Error(`g.sel dropped on unhover: sel=${selAfterLeave}`);
  passed.push("remount-fade");
  let afterLeave = await inspect("scatter");
  for (let a = 0; a < 8 && afterLeave.hi !== 0; a++) {
    await new Promise((r) => setTimeout(r, 25));
    afterLeave = await inspect("scatter");
  }
  if (afterLeave.hi !== 0) throw new Error(`g.hi lingered ${afterLeave.hi}`);
  if (afterLeave.sel < 1) throw new Error("g.sel dropped after fade");
  passed.push("selected-survives-unhover");

  const darkPts = (await layersOf("scatter_dark")).find((l) => l.kind === "circles");
  // Element 0, same reasoning as `hx`/`hy` above — element 1 is scatter_dark's baked-selected
  // index and hovering it is a no-op.
  const dhx = darkPts.geometry[0], dhy = darkPts.geometry[1];

  // Split recipe on the dark figure: what's left to check on scatter_dark's hover is that the
  // fill layer still dodges (colour-independent of figure background) and the edge layer picks
  // the dark-figure chrome stroke, unblended, same as its wash did above.
  const darkTip = await hoverAt("scatter_dark", dhx, dhy);
  assertHoverRecipe(darkTip.hi, "scatter_dark", true, true);
  passed.push("dark-figure-hover");

  // overlaystyle (#181): the figure sets color, hover_width 3 and selected_width 4. The baked
  // pick, alone on its plot, is outlined in that colour (#394), and a hover's edge takes it too;
  // the dodge fill half is unchanged.
  const STYLED = "rgb(0, 102, 204)";
  const styled = await inspect("scatter_styled");
  pin(styled, "scatter_styled");
  if (styled.lone.length !== 1 || styled.outlines[0]?.replace(/\s/g, "") !== STYLED.replace(/\s/g, "")) {
    throw new Error(`scatter_styled: the lone pick's outline ${JSON.stringify({ lone: styled.lone, outlines: styled.outlines })} (want ${STYLED})`);
  }
  const stPts = (await layersOf("scatter_styled")).find((l) => l.kind === "circles");
  let sTip = null;
  for (let a = 0; a < 8; a++) {
    sTip = await hoverAt("scatter_styled", stPts.geometry[0], stPts.geometry[1]);
    if (sTip.hi.edge) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  // The halo's core band is `hover_width` wide; outside a marker only half its stroke shows, so
  // the stroke is twice the band plus the inner casing.
  const e = sTip?.hi.edge, band = e?.halo?.align === "out" ? (Number(e.width) - 2 * e.halo.u) / 2 : Number(e?.width);
  if (!e || e.stroke !== STYLED || Math.abs(band - 3) > 0.05 || !sTip.hi.fill) {
    throw new Error(`scatter_styled: hover ${JSON.stringify(sTip?.hi)} (want edge ${STYLED} at width 3, plus the fill)`);
  }
  passed.push("overlaystyle");

  // tooltipstyle (#305): the same figure sets the card's background, text colour and radius,
  // and hides the caret.
  if (!sTip.show || sTip.bg !== "rgb(20, 30, 60)" || sTip.color !== "rgb(240, 240, 200)"
      || sTip.radius !== "9px" || sTip.caret !== "none") {
    throw new Error(`scatter_styled: tooltip ${JSON.stringify({ show: sTip.show, bg: sTip.bg, color: sTip.color, radius: sTip.radius, caret: sTip.caret })} (want bg rgb(20, 30, 60), color rgb(240, 240, 200), radius 9px, no caret)`);
  }
  passed.push("tooltipstyle");

  // The fade on a dark plot area, through a pan (#394). fade_pan is a gray20 axis on a gray12
  // figure with one pick and two marks past the axis's right limit. Before and after a pan, the
  // fade goes toward gray20 (a frame's manifest once lost the figure's colours and faded toward
  // white), and nothing is drawn outside the axis (the canvases once painted the marks the
  // backend clips).
  {
    const key = "fade_pan";
    const FIG = [31, 31, 31];
    const view = (await layersOf(key)).find((l) => l.id === "view").geometry;
    const pts = (await layersOf(key)).find((l) => l.kind === "circles").geometry;
    const fadeState = () => page.evaluate((k) => {
      const span = document.querySelector(`#coords_${k}`);
      const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const w = sr.querySelector(".masque-fade");
      const stamp = host.dataset.masqueGestureFrame ? JSON.parse(host.dataset.masqueGestureFrame) : null;
      return { fill: w?.dataset.fill ?? null, faded: w?.dataset.faded ?? null, draws: w?.masqueFade?.draws ?? 0, stamp, photo: host.dataset.masquePhoto || "" };
    }, key);
    // Every screenshot pixel in the image-px box [x0, x1] x [y0, y1] passes `ok`; the first that
    // fails, else null.
    const firstBad = (shot, [x0, y0, x1, y1], ok) => {
      for (let j = Math.ceil(y0 * shot.perImg); j < y1 * shot.perImg; j++) {
        for (let i = Math.ceil(x0 * shot.perImg); i < x1 * shot.perImg; i++) {
          const o = 4 * (j * shot.w + i), px = shot.data.slice(o, o + 3);
          if (!ok(px)) return { x: i / shot.perImg, y: j / shot.perImg, px };
        }
      }
      return null;
    };
    const inset = 4;
    const insideAxis = [view.x + inset, view.y + inset, view.x + view.w - inset, view.y + view.h - inset];
    const checkShot = async (when) => {
      const shot = await screenOf(key);
      const right = [view.x + view.w + inset, view.y + inset, shot.w / shot.perImg - 2, view.y + view.h - inset];
      const out = firstBad(shot, right, (px) => px.every((v, c) => Math.abs(v - FIG[c]) <= 6));
      if (out) throw new Error(`${key}/${when}: a pixel right of the axis at ${JSON.stringify(out)} is not the figure background ${FIG}`);
      const white = firstBad(shot, insideAxis, (px) => px.some((v) => v <= 200));
      if (white) throw new Error(`${key}/${when}: a pixel inside the dark axis at ${JSON.stringify(white)} is near white`);
      return shot;
    };
    const st0 = await fadeState();
    if (st0.fill?.replace(/\s/g, "") !== "rgb(51,51,51)") throw new Error(`${key}: the fade's fill ${st0.fill} (want the axis's rgb(51,51,51))`);
    const shot0 = await checkShot("rest");
    // Element 2 is in the limits and unpicked: gray marks faded 80% toward gray20 read about 66.
    const m2 = shot0.mean(pts[6], pts[7], 0.5 * pts[8]);
    if (m2.some((v) => v > 100)) throw new Error(`${key}/rest: unpicked mark 2 reads ${m2.map(Math.round)} (want faded toward gray20, about 66)`);
    passed.push(`${key}/rest`);

    const box = await page.evaluate((k) => {
      const span = document.querySelector(`#coords_${k}`);
      const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      host.scrollIntoView({ block: "center" });
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const b = host.querySelector("img, canvas").getBoundingClientRect();
      return { left: b.left, top: b.top, s: b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width };
    }, key);
    const cx = box.left + (view.x + view.w / 2) * box.s, cy = box.top + (view.y + view.h / 2) * box.s;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(cx + 5 * i, cy + 2 * i);
    await page.mouse.up();
    let st = null;
    for (let i = 0; i < (backend === "webgl" ? 50 : 25); i++) {
      await new Promise((r) => setTimeout(r, backend === "webgl" ? 300 : 200));
      st = await fadeState();
      if (st.stamp && st.stamp.n > (st0.stamp?.n ?? 0) && st.stamp.settle === true && !st.photo && st.draws > st0.draws) break;
      st = null;
    }
    if (!st) throw new Error(`${key}: no settled pan frame redrew the fade (${JSON.stringify(await fadeState())})`);
    if (st.fill?.replace(/\s/g, "") !== "rgb(51,51,51)") throw new Error(`${key}/pan: the fade's fill after the pan is ${st.fill} (want rgb(51,51,51))`);
    await new Promise((r) => setTimeout(r, 300));
    await checkShot("pan");
    passed.push(`${key}/pan`);
  }

  // A legend over marks (#437): Makie draws the legend over two `hid` points and part of a
  // third, so with `hid` faded, and with the pointer on a hidden point, every pixel of the
  // legend's box stays as it was at rest. A visible point's fade and ring still
  // show, so the screenshots do see the overlay.
  {
    const key = "legend_hidden";
    const boxes = await page.evaluate((k) => JSON.parse(document.querySelector(`#occluders_${k}`).innerText), key);
    if (boxes.length !== 1) throw new Error(`${key}: want one occluder, got ${JSON.stringify(boxes)}`);
    const [bx, by, bw, bh] = boxes[0];
    const hid = (await layersOf(key)).find((l) => l.id === "hid").geometry;
    const at = (k) => [hid[3 * k], hid[3 * k + 1]];
    for (const k of [2, 3]) {
      const [x, y] = at(k);
      if (!(x > bx && x < bx + bw && y > by && y < by + bh)) throw new Error(`${key}: hid ${k} at ${[x, y]} is not under the legend ${boxes[0]}`);
    }
    // The first screenshot pixel inside the box (1 image px in from its edge) that moved from `a`.
    const moved = (a, b) => {
      for (let j = Math.ceil((by + 1) * a.perImg); j < (by + bh - 1) * a.perImg; j++) {
        for (let i = Math.ceil((bx + 1) * a.perImg); i < (bx + bw - 1) * a.perImg; i++) {
          const o = 4 * (j * a.w + i);
          if ([0, 1, 2].some((c) => Math.abs(a.data[o + c] - b.data[o + c]) > 8)) {
            return { x: i / a.perImg, y: j / a.perImg, was: a.data.slice(o, o + 3), now: b.data.slice(o, o + 3) };
          }
        }
      }
      return null;
    };
    const clickAt = (x, y) => page.evaluate(([k, ix, iy]) => {
      const span = document.querySelector(`#coords_${k}`);
      const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const b = host.querySelector("img, canvas").getBoundingClientRect();
      const s = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
      const o = { bubbles: true, composed: true, cancelable: true, clientX: b.left + ix * s, clientY: b.top + iy * s, pointerId: 1, pointerType: "mouse", isPrimary: true };
      const surface = sr.querySelector(".surface");
      for (const t of ["pointermove", "pointerdown", "pointerup"]) surface.dispatchEvent(new PointerEvent(t, o));
      surface.dispatchEvent(new MouseEvent("click", o));
    }, [key, x, y]);
    const away = () => hoverAt(key, 2, 2);
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const r = hid[2];

    await away();
    const rest = await screenOf(key);
    await clickAt(...at(0));
    const mp = await inspect(key);
    if (!mp.picked.includes("hid:0")) throw new Error(`${key}: clicking hid 0 picked ${JSON.stringify(mp.picked)}`);
    const picked = await screenOf(key);
    const restOne = lum(rest.mean(...at(1), 0.4 * r)), fadedOne = lum(picked.mean(...at(1), 0.4 * r));
    if (fadedOne - restOne < 0.4 * (255 - restOne)) throw new Error(`${key}/fade: hid 1 reads ${fadedOne.toFixed(0)} with hid 0 picked (${restOne.toFixed(0)} at rest), want it faded`);
    let bad = moved(rest, picked);
    if (bad) throw new Error(`${key}/fade: the fade drew over the legend at ${JSON.stringify(bad)}`);
    passed.push(`${key}/fade-off-legend`);

    // The pointer on a hidden point, inside the legend, reaches the legend and not the point
    // (#472): no ring, nothing on screen moves, and a click picks nothing.
    // A ring still leaving from the last hover is not a hit.
    const ringOf = (h) => [h.hi.fill, h.hi.edge, h.hi.plain].some((c) => c && !/masque-leave/.test(c.className ?? ""));
    for (const k of [2, 3]) {
      await away(); await page.waitForTimeout(600); // let the last ring finish leaving
      if (ringOf(await hoverAt(key, ...at(k)))) throw new Error(`${key}/hover: the pointer reached hid ${k} through the legend`);
      bad = moved(rest, await screenOf(key));
      if (bad) throw new Error(`${key}/hover: hovering hid ${k} under the legend drew over it at ${JSON.stringify(bad)}`);
      await clickAt(...at(k));
      const after = (await inspect(key)).picked;
      if (after.includes(`hid:${k}`)) throw new Error(`${key}/click: clicking hid ${k} through the legend picked it: ${JSON.stringify(after)}`);
    }
    passed.push(`${key}/no-hover-through-legend`);

    // hid 4 shows past the legend's bottom edge: that part still takes the pointer, and its ring
    // and lifted fade stay out of the legend's box (#437).
    const [ex, ey] = [at(4)[0], by + bh + 0.3 * (at(4)[1] + r - by - bh)];
    if (!(at(4)[1] < by + bh && at(4)[1] + r > by + bh + 2)) throw new Error(`${key}: hid 4 at ${at(4)} doesn't straddle the legend's bottom edge (box ${boxes[0]}, r ${r})`);
    await away(); await page.waitForTimeout(600);
    if (!ringOf(await hoverAt(key, ex, ey))) throw new Error(`${key}/hover: no ring for the part of hid 4 below the legend`);
    bad = moved(rest, await screenOf(key));
    if (bad) throw new Error(`${key}/hover: the hidden point's ring or lifted fade drew over the legend at ${JSON.stringify(bad)}`);
    await away();
    bad = moved(rest, await screenOf(key));
    if (bad) throw new Error(`${key}/unhover: the fade put back over the hidden point drew over the legend at ${JSON.stringify(bad)}`);
    passed.push(`${key}/hover-off-legend`);

    // A visible point's ring does show, so a screenshot taken this way sees the overlay.
    await hoverAt(key, ...at(1));
    const ringed = await screenOf(key);
    const edge = [at(1)[0] + r + 1, at(1)[1]];
    if (Math.abs(lum(ringed.mean(...edge, 1)) - lum(picked.mean(...edge, 1))) < 30) throw new Error(`${key}/control: no ring visible around hid 1`);
    await away();
    await clickAt(...at(0)); // deselect
    passed.push(`${key}/control-ring-visible`);
  }

  // A plot drawn with `visible = false` (#484): picking legend entry "a" fades line c and leaves
  // the hidden line b's path alone, so the gridlines under it stay whole; hovering b's path
  // shows nothing.
  {
    const key = "hidden_plot";
    const layers = await layersOf(key);
    const shown = layers.filter((l) => l.kind === "lines" && !l.hidden);
    const hidden = layers.filter((l) => l.kind === "lines" && l.hidden);
    const legend = layers.find((l) => l.links?.length);
    if (shown.length !== 2 || hidden.length !== 1 || !legend) throw new Error(`${key}: want two shown lines, one hidden line and a legend, got ${JSON.stringify(layers.map((l) => [l.id, l.kind, !!l.hidden]))}`);
    if (hidden[0].events.length) throw new Error(`${key}: the hidden line takes ${JSON.stringify(hidden[0].events)}`);
    // Entry 0 names line a; the other shown line is c.
    const a = shown.find((l) => l.id === legend.links[0][0]), c = shown.find((l) => l !== a);
    if (!a) throw new Error(`${key}: legend entry 0 names ${JSON.stringify(legend.links[0])}, not a shown line`);
    const [x0, y, x1] = hidden[0].geometry[0];
    const [, cy] = c.geometry[0].slice(0, 2);
    // Wide enough to take in the selected recipe's ring around the line, not only its stroke.
    const lw = 3 * (hidden[0].linewidth ?? 8);
    // The first screenshot pixel along the hidden line's path, out past its ring, that moved.
    const moved = (a, b) => {
      for (let j = Math.ceil((y - lw) * a.perImg); j < (y + lw) * a.perImg; j++) {
        for (let i = Math.ceil((x0 + 2) * a.perImg); i < (x1 - 2) * a.perImg; i++) {
          const o = 4 * (j * a.w + i);
          if ([0, 1, 2].some((c) => Math.abs(a.data[o + c] - b.data[o + c]) > 8)) {
            return { x: i / a.perImg, y: j / a.perImg, was: a.data.slice(o, o + 3), now: b.data.slice(o, o + 3) };
          }
        }
      }
      return null;
    };
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const clickLegend = (k) => page.evaluate(([key, ix, iy]) => {
      const span = document.querySelector(`#coords_${key}`);
      const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const b = host.querySelector("img, canvas").getBoundingClientRect();
      const s = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
      const o = { bubbles: true, composed: true, cancelable: true, clientX: b.left + ix * s, clientY: b.top + iy * s, pointerId: 1, pointerType: "mouse", isPrimary: true };
      const surface = sr.querySelector(".surface");
      for (const t of ["pointermove", "pointerdown", "pointerup"]) surface.dispatchEvent(new PointerEvent(t, o));
      surface.dispatchEvent(new MouseEvent("click", o));
    }, [key, legend.geometry[4 * k], legend.geometry[4 * k + 1]]);
    const away = () => hoverAt(key, 2, 2);
    const mid = (x0 + x1) / 2;

    await away();
    const rest = await screenOf(key);
    await clickLegend(0);
    await away();
    await page.waitForTimeout(400);
    const kept = (await inspect(key)).kept;
    if (!kept.includes(`${a.id}:0`)) throw new Error(`${key}: clicking legend entry "a" kept ${JSON.stringify(kept)}`);
    const picked = await screenOf(key);
    const cRest = lum(rest.mean(mid, cy, 1)), cNow = lum(picked.mean(mid, cy, 1));
    if (cNow - cRest < 0.4 * (255 - cRest)) throw new Error(`${key}/fade: line c reads ${cNow.toFixed(0)} with "a" picked (${cRest.toFixed(0)} at rest), want it faded`);
    let bad = moved(rest, picked);
    if (bad) throw new Error(`${key}/fade: the fade drew over the hidden line's path at ${JSON.stringify(bad)}`);
    passed.push(`${key}/fade-skips-hidden`);

    // The pointer on the hidden line's path finds no line: no ring, no tooltip, nothing moves.
    const h = await hoverAt(key, mid, y);
    if (h.show || [h.hi.fill, h.hi.edge, h.hi.plain].some((c) => c && !/masque-leave/.test(c.className ?? ""))) throw new Error(`${key}/hover: the hidden line took the pointer (tip ${JSON.stringify(h.text)})`);
    bad = moved(picked, await screenOf(key));
    if (bad) throw new Error(`${key}/hover: hovering the hidden line's path drew over it at ${JSON.stringify(bad)}`);
    passed.push(`${key}/no-hover-hidden`);
    await away();
    await clickLegend(0); // deselect

    // The hidden line's own entry: hovering it and picking it draw nothing along the hidden
    // line, no ring in g.link or g.sel, and the shown lines fade.
    const chrome = () => page.evaluate((key) => {
      const span = document.querySelector(`#coords_${key}`);
      const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const n = (sel) => [...sr.querySelectorAll(sel)].reduce((k, g) => k + [...g.children].filter((c) => !/masque-leave/.test(c.getAttribute("class") ?? "")).length, 0);
      return { link: n("g.link"), sel: n("g.sel") };
    }, key);
    await page.waitForTimeout(600); // let the last ring finish leaving
    await hoverAt(key, legend.geometry[4], legend.geometry[5]);
    await page.waitForTimeout(200);
    let ch = await chrome();
    if (ch.link || ch.sel) throw new Error(`${key}/hover-hidden-entry: hovering entry "b" drew ${JSON.stringify(ch)}`);
    await clickLegend(1);
    await away();
    await page.waitForTimeout(400);
    ch = await chrome();
    if (ch.link || ch.sel) throw new Error(`${key}/pick-hidden-entry: picking entry "b" drew ${JSON.stringify(ch)}`);
    const own = await screenOf(key);
    if (lum(own.mean(mid, cy, 1)) - cRest < 0.4 * (255 - cRest)) throw new Error(`${key}/pick-hidden-entry: line c is not faded with "b" picked`);
    bad = moved(rest, own);
    if (bad) throw new Error(`${key}/pick-hidden-entry: something drew along the hidden line's path at ${JSON.stringify(bad)}`);
    passed.push(`${key}/hidden-entry-draws-nothing`);
    await clickLegend(1); // deselect
  }

  // A plot added after the figure was shown once (#508): the second widget holds the scatter and
  // the added line, and hovering the line shows its tooltip with the ring on the line.
  {
    const key = "added_plot";
    const layers = await layersOf(key);
    const line = layers.find((l) => l.kind === "lines"), pts = layers.find((l) => l.id === "scatter");
    if (!line || !pts) throw new Error(`${key}: want a scatter and the added line, got ${JSON.stringify(layers.map((l) => [l.id, l.kind]))}`);
    const [x0, y0, x1] = line.geometry[0];
    const t = await hoverAt(key, (x0 + x1) / 2, y0);
    if (!t?.show) throw new Error(`${key}: no tooltip on the added line ${JSON.stringify(t)}`);
    if (!(t.hi.fill || t.hi.edge || t.hi.plain)) throw new Error(`${key}: no hover ring on the added line`);
    await hoverAt(key, 2, 2);
    passed.push(`${key}/added-line-hovers`);
  }

  // Linked selections (#346): a pick in the left panel is drawn picked in both panels, and the
  // rest of each panel fades. Hovering an unpicked mark in the right panel outlines its partner
  // on the left with the same hover recipe as the hovered mark (dodge fill half, chrome edge)
  // and lifts the partner's fade with the hovered mark's, so on screen the two read alike.
  {
    const key = "linked_pos";
    const layers = await layersOf(key);
    const u = layers.find((l) => l.id === "u").geometry, p = layers.find((l) => l.id === "p").geometry;
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const sendAt = (x, y, type) => page.evaluate(([k, ix, iy, typ]) => {
      const span = document.querySelector(`#coords_${k}`);
      const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const b = host.querySelector("img, canvas").getBoundingClientRect();
      const s = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
      const o = { bubbles: true, composed: true, cancelable: true, clientX: b.left + ix * s, clientY: b.top + iy * s, pointerId: 1, pointerType: "mouse", isPrimary: true };
      const surface = sr.querySelector(".surface");
      surface.dispatchEvent(new PointerEvent("pointermove", o));
      if (typ === "click") {
        surface.dispatchEvent(new PointerEvent("pointerdown", o));
        surface.dispatchEvent(new PointerEvent("pointerup", o));
        surface.dispatchEvent(new MouseEvent("click", o));
      }
    }, [key, x, y, type]);
    const partners = () => page.evaluate((k) => {
      const span = document.querySelector(`#coords_${k}`);
      const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const style = (svg, sel) => {
        // A shape's halo, read as its ink core (the fill shape stays bare); one leaving fades as a group.
        const el = [...sr.querySelectorAll(`svg.${svg} ${sel} > *`)].filter((e) => !e.classList.contains("masque-leave"))
          .map((e) => (e.classList.contains("masque-halo") ? e.querySelector(":scope > circle.masque-hi") : e.tagName === "circle" ? e : null)).find(Boolean);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { fill: cs.fill, stroke: cs.stroke, width: parseFloat(cs.strokeWidth), blend: getComputedStyle(sr.querySelector(`svg.${svg}`)).mixBlendMode, cx: Number(el.getAttribute("cx")) };
      };
      return { fill: style("masque-fill", "g.link"), edge: style("masque-edge", "g.link"), hiFill: style("masque-fill", "g.hi"), hiEdge: style("masque-edge", "g.hi") };
    }, key);
    const dist = (a, b) => Math.abs(lum(a) - lum(b));

    await sendAt(u[0], u[1], "click");
    await new Promise((r) => setTimeout(r, 300));
    const m = await inspect(key);
    if (JSON.stringify(m.kept.slice().sort()) !== JSON.stringify(["labels:0", "p:0", "u:0"])) throw new Error(`${key}: drawn picked ${JSON.stringify(m.kept)}, want row 0 in both panels`);
    let shot = await screenOf(key);
    const at = (g, k) => shot.mean(g[3 * k], g[3 * k + 1], 0.4 * g[3 * k + 2]);
    const own = lum([128, 128, 128]);
    for (const [name, g] of [["left", u], ["right", p]]) {
      const pk = lum(at(g, 0)), un = lum(at(g, 1));
      if (Math.abs(pk - own) > 20) throw new Error(`${key}/${name}: the pick reads ${pk.toFixed(0)}, want its gray ${own.toFixed(0)}`);
      if (Math.abs(un - 255) > 0.5 * Math.abs(own - 255)) throw new Error(`${key}/${name}: an unpicked mark reads ${un.toFixed(0)}, want it over halfway to white`);
    }
    passed.push(`${key}/fade-both-panels`);

    await sendAt(p[3], p[4], "pointermove"); // p:1, row 1, unpicked
    await new Promise((r) => setTimeout(r, 400));
    const pr = await partners();
    if (!pr.fill || !pr.edge || !pr.hiFill || !pr.hiEdge) throw new Error(`${key}: hover or partner missing ${JSON.stringify(pr)}`);
    if (Math.round(pr.edge.cx) !== Math.round(u[3])) throw new Error(`${key}: the partner sits at x ${pr.edge.cx}, want u:1's ${u[3]}`);
    for (const f of ["fill", "blend"]) if (pr.fill[f] !== pr.hiFill[f]) throw new Error(`${key}: partner fill half ${f} ${pr.fill[f]}, the hover's is ${pr.hiFill[f]}`);
    for (const f of ["stroke", "width", "blend"]) if (pr.edge[f] !== pr.hiEdge[f]) throw new Error(`${key}: partner edge ${f} ${pr.edge[f]}, the hover's is ${pr.hiEdge[f]}`);
    if (pr.fill.blend !== "color-dodge") throw new Error(`${key}: partner fill half blends ${pr.fill.blend}, want color-dodge`);
    shot = await screenOf(key);
    const hovered = at(p, 1), partner = at(u, 1);
    if (dist(hovered, partner) > 15) throw new Error(`${key}: the partner reads ${lum(partner).toFixed(0)}, the hovered mark ${lum(hovered).toFixed(0)}`);
    passed.push(`${key}/partner-hover-recipe`);

    await sendAt(1, 1, "pointermove");
    await new Promise((r) => setTimeout(r, 600));
    shot = await screenOf(key);
    if (Math.abs(lum(at(u, 1)) - 255) > 0.5 * Math.abs(own - 255)) throw new Error(`${key}: after leaving, u:1 reads ${lum(at(u, 1)).toFixed(0)}, want faded again`);
    passed.push(`${key}/partner-leave-fades`);
    await sendAt(u[0], u[1], "click");
    await sendAt(1, 1, "pointermove");
  }

  // Axis3 kinds (#301): the baked selection and a hover on another mark sit on the projected
  // mark. `overlap3d` hovers the front marker of a pair: the highlight must take the marker's
  // circle, not the sphere's behind it.
  for (const [key, layerId, sel, hov] of [
    ["scatter3d", "scatter", 1, 0],
    ["scatter3d_data", "scatter", 1, 0],
    ["meshscatter3d", "meshscatter", 1, 0],
    ["wireframe3d", "wireframe", 0, 3],
    ["overlap3d", "scatter", null, 0],
  ]) {
    const m = await inspect(key);
    pin(m, key);
    const layer = (await layersOf(key)).find((l) => l.id === layerId);
    if (!layer) throw new Error(`${key}: no layer ${layerId}`);
    const g = layer.geometry;
    const circles = layer.kind === "circles";
    if (sel !== null) {
      if (circles) {
        // The pick is drawn by the fade (#394): kept on its axis's canvases, nothing in g.sel.
        if (!m.picked.includes(`${layer.id}:${sel}`) || m.kids.some((k) => k.kind === "closed")) {
          throw new Error(`${key}: selected mark ${sel} not drawn by the fade ${JSON.stringify({ picked: m.picked, kids: m.kids })}`);
        }
      } else {
        const r = m.kids.find((k) => k.kind === "ring");
        assertRing(r, key, false);
        const ln = r.lines[0];
        if (Math.abs(Number(ln.x1) - g[4 * sel]) > 1.2 || Math.abs(Number(ln.y1) - g[4 * sel + 1]) > 1.2) {
          throw new Error(`${key}: ring off the edge ${JSON.stringify(ln)} vs ${g.slice(4 * sel, 4 * sel + 4)}`);
        }
      }
    }
    const [hx3, hy3] = circles
      ? [g[3 * hov], g[3 * hov + 1]]
      : [(g[4 * hov] + g[4 * hov + 2]) / 2, (g[4 * hov + 1] + g[4 * hov + 3]) / 2];
    let t3 = null;
    for (let a = 0; a < 8; a++) {
      t3 = await hoverAt(key, hx3, hy3);
      if (t3.show && (t3.hi.fill || t3.hi.edge)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!t3?.show) throw new Error(`${key}: no tooltip on hover ${JSON.stringify(t3)}`);
    assertHoverRecipe(t3.hi, key, circles, false);
    if (circles) {
      for (const shape of [t3.hi.fill, t3.hi.edge].filter(Boolean)) {
        assertCircleR(shape.r, g[3 * hov + 2], `${key}/hover-${shape.layer}`);
      }
    }
    passed.push(`${key}/highlight`);

    // The checks above compare the overlay with the manifest it was drawn from, so they pass
    // even when the manifest is off the drawn mark. On Cairo, read the rendered PNG at the
    // hit geometry instead (same canvas readback as flush-radius above): every tested mark's
    // centre (an edge's midpoint) must be drawn, and `overlap3d`'s must be the black front
    // marker, not the grey sphere behind it. Axis3 stretches each axis differently, so a sphere
    // draws as an ellipse and its hit circle is the ellipse's long radius: no sphere 3 px past `r`
    // in any of 16 directions, and the sphere drawn 3 px inside `r` in at least one.
    if (backend === "cairo") {
      const n = circles ? g.length / 3 : g.length / 4;
      const probes = [];
      const reachGroups = [];
      for (let i = 0; i < n; i++) {
        if (!circles && i !== sel && i !== hov) continue;
        if (circles) {
          const [cx, cy, r] = [g[3 * i], g[3 * i + 1], g[3 * i + 2]];
          probes.push({ x: cx, y: cy, want: key === "overlap3d" ? "dark" : "mark", what: `${i}/centre` });
          if (key === "meshscatter3d" || key === "scatter3d_data") {
            const reach = [];
            for (let a = 0; a < 16; a++) {
              const [dx, dy] = [Math.cos((a * Math.PI) / 8), Math.sin((a * Math.PI) / 8)];
              probes.push({ x: cx + dx * (r + 3), y: cy + dy * (r + 3), want: "off", what: `${i}/outside@${a * 22.5}°` });
              reach.push(probes.length);
              probes.push({ x: cx + dx * (r - 3), y: cy + dy * (r - 3), want: "any", what: `${i}/inside@${a * 22.5}°` });
            }
            reachGroups.push({ what: `${i}/reaches-r`, idx: reach });
          }
        } else {
          probes.push({ x: (g[4 * i] + g[4 * i + 2]) / 2, y: (g[4 * i + 1] + g[4 * i + 3]) / 2, want: "mark", what: `${i}/mid` });
        }
      }
      const px = await page.evaluate(([k, ps]) => {
        const span = document.querySelector(`#coords_${k}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        const img = host.querySelector("img");
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ps.map((p) => {
          const d = ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
          return { r: d[0], g: d[1], b: d[2] };
        });
      }, [key, probes]);
      // Axis3 gridlines are light grey (~233), so they count as background here.
      const isBg = (p) => p.r > 225 && p.g > 225 && p.b > 225;
      probes.forEach((p, i) => {
        const c = px[i];
        // "off" the grey sphere: anything outside its shading (57-138 on this figure), such as
        // background, gridlines, or the Axis3 frame's black lines that pass beside it.
        const v = Math.max(c.r, c.g, c.b);
        const ok = p.want === "any" ||
          (p.want === "bg" ? isBg(c) : p.want === "off" ? v < 40 || v > 190 : p.want === "dark" ? v < 60 : !isBg(c));
        if (!ok) throw new Error(`${key}/on-drawn-mark: ${p.what} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) wanted ${p.want}, read ${JSON.stringify(c)}`);
      });
      for (const grp of reachGroups) {
        if (!grp.idx.some((k) => !isBg(px[k]))) throw new Error(`${key}/on-drawn-mark: ${grp.what}: the sphere is drawn 3 px inside r in no direction`);
      }
      passed.push(`${key}/on-drawn-mark`);
    } else {
      passed.push(`${key}/on-drawn-mark-skipped-webgl`);
    }
  }

  // Text on Axis3 (#292): where "front" (listed first) overlaps "back", the hover answers with
  // the label drawn on top, and draws the closed-mark recipe on its box: front on WebGL, which
  // depth-tests text, and back on Cairo, which paints labels in list order.
  {
    const key = "text3d";
    const m = await inspect(key);
    pin(m, key);
    const layer = (await layersOf(key)).find((l) => l.id === "text");
    if (!layer || layer.kind !== "rects") throw new Error(`${key}: no :rects text layer`);
    const g = layer.geometry, hov = backend === "cairo" ? 1 : 0;
    const [top, under] = hov === 1 ? ["back", "front"] : ["front", "back"];
    let t = null;
    for (let a = 0; a < 8; a++) {
      t = await hoverAt(key, g[4 * hov], g[4 * hov + 1]);
      if (t.show && t.hi.fill && t.hi.edge) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!t?.show) throw new Error(`${key}: no tooltip on hover ${JSON.stringify(t)}`);
    assertHoverRecipe(t.hi, key, true, false);
    if (!t.text.includes(top) || t.text.includes(under)) throw new Error(`${key}: tooltip ${JSON.stringify(t.text)} is not the ${top} label`);
    passed.push(`${key}/highlight`);
  }

  // Overlapping marks within one plot (#331, #340). The screen shows the blue mark over the
  // red one where they overlap, on both backends (read from a screenshot, so WebGL's own draw
  // order is checked too), and the hover there answers with the blue mark and highlights its
  // shape, not the one underneath.
  for (const [key, layerId, top, under, topLabel, underLabel] of [
    ["scatter_overlap", "scatter", 1, 0, "over", "under"],
    ["text_overlap", "text", 1, 0, "over", "under"],
    ["poly_overlap", "poly", 1, 0, "over", "under"],
    ["spheres3d", "meshscatter", 0, 1, "front", "back"],
  ]) {
    const m = await inspect(key);
    pin(m, key);
    const layer = (await layersOf(key)).find((l) => l.id === layerId);
    if (!layer) throw new Error(`${key}: no layer ${layerId}`);
    const g = layer.geometry, circles = layer.kind === "circles";
    // A polygon is taken as its bounding box: the sweep's overlapping shapes are rectangles.
    const ringBox = (r) => {
      const xs = r.filter((_, i) => i % 2 === 0), ys = r.filter((_, i) => i % 2 === 1);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    };
    const shape = (k) => circles ? { x: g[3 * k], y: g[3 * k + 1], r: g[3 * k + 2] }
      : layer.kind === "polygons" ? ringBox(g[k])
      : { x: g[4 * k], y: g[4 * k + 1], w: g[4 * k + 2], h: g[4 * k + 3] };
    // Inside a shape's drawn part: 0.8 of a circle's hit radius (which reaches past the mark),
    // or the box.
    const inside = (s, x, y) => circles ? Math.hypot(x - s.x, y - s.y) < 0.8 * s.r
      : Math.abs(x - s.x) < s.w / 2 && Math.abs(y - s.y) < s.h / 2;
    const a = shape(top), b = shape(under);
    const shot = await screenOf(key);
    const perImg = shot.perImg;
    let blue = 0, red = 0;
    for (let j = 0; j < shot.h; j++) {
      for (let i = 0; i < shot.w; i++) {
        const x = i / perImg, y = j / perImg;
        if (!inside(a, x, y) || !inside(b, x, y)) continue;
        const o = 4 * (j * shot.w + i), [r, gg, bb] = shot.data.slice(o, o + 3);
        if (bb > 150 && r < 100 && gg < 100) blue++;
        if (r > 150 && gg < 100 && bb < 100) red++;
      }
    }
    if (!(blue > 20 && blue > 1.5 * red)) {
      throw new Error(`${key}/top-drawn: where ${topLabel} and ${underLabel} overlap the screen shows ${blue} blue and ${red} red px; want blue (${topLabel}) on top`);
    }
    passed.push(`${key}/top-drawn`);

    // Hover a pixel both shapes claim: the top mark's centre.
    let t = null;
    for (let n = 0; n < 8; n++) {
      t = await hoverAt(key, a.x, a.y);
      if (t.show && (t.hi.fill || t.hi.edge)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!t?.show) throw new Error(`${key}: no tooltip on hover ${JSON.stringify(t)}`);
    if (!t.text.includes(topLabel) || t.text.includes(underLabel)) {
      throw new Error(`${key}: tooltip ${JSON.stringify(t.text)} is not the ${topLabel} mark`);
    }
    assertHoverRecipe(t.hi, key, true, false);
    if (circles) {
      for (const sh of [t.hi.fill, t.hi.edge].filter(Boolean)) assertCircleR(sh.r, a.r, `${key}/hover-${sh.layer}`);
    }
    passed.push(`${key}/hover-top`);
  }

  // A surface point (#259) is highlighted as its dual cell: a closed polygon through the midpoints
  // of its grid edges and the centres of its quads, so the polygon surrounds the point. The hover
  // and the selection use the closed-mark recipe; the tooltip sits over the point. On Cairo the
  // point itself must be on the drawn surface. The polar cases (#514) are the same layer kind
  // on a PolarAxis, full circle and sector.
  // The sector's data runs past its limits: points `hidden` lie where the axis masks the
  // surface (θ = 5π/6, and r = 0.5 inside the inner radius), so hovering there shows nothing.
  for (const [key, hov, sel, hovIJ, hidden] of [
    ["surface3d", 12, 13, [3, 3], []], ["surface_polar", 11, 22, [3, 2], []],
    ["surface_sector", 22, 30, [2, 4], [26, 1]],
  ]) {
    const m = await inspect(key);
    pin(m, key);
    const layer = (await layersOf(key)).find((l) => l.id === "surface");
    if (!layer || layer.kind !== "surface") throw new Error(`${key}: no :surface layer`);
    const g = layer.geometry;
    const pt = (k) => { const p = surfacePoint(g, k); return [p.x, p.y]; };
    const surrounds = (points, [x, y]) => {
      const v = (points || "").trim().split(/[\s,]+/).map(Number);
      if (v.length < 6 || v.some((n) => !Number.isFinite(n))) return false;
      const xs = v.filter((_, i) => i % 2 === 0), ys = v.filter((_, i) => i % 2 === 1);
      return Math.min(...xs) < x && x < Math.max(...xs) && Math.min(...ys) < y && y < Math.max(...ys);
    };
    let t = null;
    for (let a = 0; a < 8; a++) {
      t = await hoverAt(key, ...pt(hov));
      if (t.show && t.hi.fill && t.hi.edge) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!t?.show) throw new Error(`${key}: no tooltip on hover ${JSON.stringify(t)}`);
    assertHoverRecipe(t.hi, key, true, false);
    for (const shape of [t.hi.fill, t.hi.edge]) {
      if (shape.tag !== "polygon" || !surrounds(shape.points, pt(hov))) {
        throw new Error(`${key}: hover ${shape.layer} is not a cell around the point ${pt(hov)}: ${shape.tag} ${shape.points}`);
      }
    }
    if (!new RegExp(`i\\s*${hovIJ[0]}\\s*j\\s*${hovIJ[1]}\\b`).test(t.text.replace(/\s+/g, " "))) {
      throw new Error(`${key}: tooltip ${JSON.stringify(t.text)} is not point (${hovIJ})`);
    }
    passed.push(`${key}/highlight`);
    for (const k of hidden) {
      // Off the figure first, and let the last tooltip and ring finish leaving.
      await hoverAt(key, 2, 2); await page.waitForTimeout(600);
      const h = await hoverAt(key, ...pt(k));
      const ring = [h.hi.fill, h.hi.edge, h.hi.plain].some((c) => c && !/masque-leave/.test(c.className ?? ""));
      if (h.show || ring) throw new Error(`${key}: masked point ${k} answers hover: ${JSON.stringify(h.text)}`);
    }
    if (hidden.length) passed.push(`${key}/masked-silent`);

    // Select point `sel` (kind_sweep may already have), check the wash, and leave it as found.
    const clickAt = (x, y) => page.evaluate(([k, ix, iy]) => {
      const span = document.querySelector(`#coords_${k}`);
      const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const b = host.querySelector("img, canvas").getBoundingClientRect();
      const s = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
      const o = { bubbles: true, composed: true, cancelable: true, clientX: b.left + ix * s, clientY: b.top + iy * s, pointerId: 1, pointerType: "mouse", isPrimary: true };
      const surface = sr.querySelector(".surface");
      surface.dispatchEvent(new PointerEvent("pointermove", o));
      surface.dispatchEvent(new PointerEvent("pointerdown", o));
      surface.dispatchEvent(new PointerEvent("pointerup", o));
      surface.dispatchEvent(new MouseEvent("click", o));
    }, [key, x, y]);
    const wasSelected = (await inspect(key)).sel > 0;
    if (!wasSelected) await clickAt(...pt(sel));
    const ms = await inspect(key);
    const w = {
      fill: ms.kids.find((k) => k.layer === "fill" && k.kind === "closed"),
      edge: ms.kids.find((k) => k.layer === "edge" && k.kind === "closed"),
      plain: ms.kids.find((k) => k.layer === "plain" && k.kind === "closed"),
    };
    assertWash(w, key, false);
    if (!wasSelected) {
      if (!surrounds(w.edge?.points, pt(sel))) throw new Error(`${key}: selected cell ${w.edge?.points} is not around ${pt(sel)}`);
      await clickAt(...pt(sel)); // deselect again
    }
    passed.push(`${key}/selected`);

    if (backend === "cairo") {
      const px = await page.evaluate(([k, ps]) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        const img = host.querySelector("img");
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ps.map(([x, y]) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)]);
      }, [key, [pt(hov), pt(sel)]]);
      for (const [i, c] of px.entries()) {
        if (c.every((v) => v > 225)) throw new Error(`${key}/on-drawn-mark: point ${[hov, sel][i]} reads background ${c}`);
      }
      passed.push(`${key}/on-drawn-mark`);
    } else {
      passed.push(`${key}/on-drawn-mark-skipped-webgl`);
    }
  }

  // Axis3 wheel zoom (#321): the limits readout is the same tooltip card as a hover, in the
  // figure's theme, shown while the wheel turns and gone once the zoom settles. Zooming back
  // out leaves the view as the other drivers found it.
  {
    const lightTip = await hoverAt("scatter", hx, hy);
    const view3 = (await layersOf("view3d")).find((l) => l.id === "view").geometry;
    const wheel3 = (deltaY) => page.evaluate(async ([k, ix, iy, dy]) => {
      const span = document.querySelector(`#coords_${k}`);
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      host.scrollIntoView({ block: "center", inline: "nearest" });
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const b = host.querySelector("img, canvas").getBoundingClientRect();
      const s = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
      sr.querySelector(".surface").dispatchEvent(new WheelEvent("wheel", {
        bubbles: true, cancelable: true, clientX: b.left + ix * s, clientY: b.top + iy * s, deltaY: dy,
      }));
      // Read in the same turn as the wheel: the readout hides 150 ms after the last notch, and
      // on a loaded software-GL page two animation frames can take longer than that.
      const t = sr.querySelector(".masque-tip");
      const cs = getComputedStyle(t);
      const during = { show: t.classList.contains("show"), text: t.innerText, bg: cs.backgroundColor, color: cs.color };
      await new Promise((res) => setTimeout(res, 600));   // past the wheel's idle settle
      return { during, after: t.classList.contains("show") };
    }, ["view3d", view3.x + view3.w / 2, view3.y + view3.h / 2, deltaY]);
    const r = await wheel3(-300);
    if (!r.during.show) throw new Error("view3d/zoom-readout: no limits readout while the wheel turns");
    if (!/x:\[/.test(r.during.text) || !/z:\[/.test(r.during.text)) throw new Error(`view3d/zoom-readout: readout does not show the x and z limits: ${JSON.stringify(r.during.text)}`);
    if (r.during.bg !== lightTip.bg || r.during.color !== lightTip.color) {
      throw new Error(`view3d/zoom-readout: readout theme ${r.during.bg}/${r.during.color} differs from the hover tooltip's ${lightTip.bg}/${lightTip.color}`);
    }
    if (r.after) throw new Error("view3d/zoom-readout: the readout is still showing after the zoom settled");
    await wheel3(300);
    passed.push("view3d/zoom-readout");
  }

  // The axis readout's cursor-following tooltip: the caret apex sits on the pointer, both in
  // open space and where the box clamps at the right edge (the caret then moves along the box).
  // The box may extend past the figure and clamps at the window's edge instead, so the
  // right-edge case scrolls the figure into view and slides its cell right until the pointer
  // is 40px from that edge.
  // The bottom flip (.flip-y) leaves this horizontal apex unchanged; overlay.test.ts pins it. Before, it sat a fixed 14px into a box offset
  // 10px from the pointer, so it pointed beside the crosshair cursor.
  // Park the real mouse off the figures: the scroll and slide below make the browser re-hit-test
  // it, and a real pointer left over a figure would leave it and hide the tooltip.
  await page.mouse.move(1, 1);
  for (const [fx, fy, where] of [[0.15, 0.25, "open"], [0.8, 0.25, "right-edge"]]) {
    const r = await page.evaluate(async ([fx, fy]) => {
      const span = document.querySelector("#coords_axis");
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      // On screen: a box whose pointer is outside the window is placed unclamped (hover.ts).
      host.scrollIntoView({ block: "center", behavior: "instant" });
      // Let the scroll and the browser's own pointer update after it settle before hovering.
      await new Promise((res) => setTimeout(res, 300));
      const cell = host.closest("pluto-cell");
      cell.style.transform = "";
      let b = host.querySelector("img, canvas").getBoundingClientRect();
      if (fx > 0.5) {
        const want = document.documentElement.clientWidth - 40;
        cell.style.transform = `translateX(${want - (b.left + fx * b.width)}px)`;
        b = host.querySelector("img, canvas").getBoundingClientRect();
        if (Math.abs(b.left + fx * b.width - want) > 1) throw new Error(`axis/caret-right-edge: the slide did not move the figure (pointer at ${b.left + fx * b.width}, want ${want})`);
      }
      const x = b.left + fx * b.width, y = b.top + fy * b.height;
      sr.querySelector(".surface").dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y,
        pointerId: 1, pointerType: "mouse", isPrimary: true,
      }));
      // A move inside the frame of the previous one is queued for the next animation frame
      // (hover.ts's onMove), so read the tooltip after that frame has run.
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const t = sr.querySelector(".masque-tip");
      const tipRect = t.getBoundingClientRect();
      const before = getComputedStyle(t, "::before");
      const apexX = tipRect.left + parseFloat(getComputedStyle(t).borderLeftWidth)
        + parseFloat(before.left) + parseFloat(before.borderLeftWidth);
      cell.style.transform = "";
      return { show: t.classList.contains("show"), text: t.innerText, apexX, x, shifted: tipRect.left > x - 14 + 1 || tipRect.left < x - 14 - 1 };
    }, [fx, fy]);
    if (!r.show) throw new Error(`axis/caret-${where}: no tooltip at ${fx},${fy}`);
    assertCaretAtAnchor(r.apexX, r.x, `axis/caret-${where}`);
    if (where === "right-edge" && !r.shifted) throw new Error("axis/caret-right-edge: the box did not clamp, so this case tests nothing");
  }
  passed.push("readout-caret-on-pointer");

  await assertTooltipColorScheme(page, {
    css: () => inspect("scatter").then((m) => m.css),
    computedFor: async (which) => {
      const t = which === "dark" ? await hoverAt("scatter_dark", dhx, dhy) : await hoverAt("scatter", hx, hy);
      return { bg: t.bg, color: t.color };
    },
  });
  passed.push("tooltip-theme-follows-figure-bg");

  if (unexpected.length) throw new Error(`page errors: ${unexpected.join(" | ")}`);
  passed.push("no-console-errors");

  console.log(`POLISH VERIFY OK — ${backend}: ${passed.join(", ")}`);
} catch (e) {
  failed = e;
  // Mirrors the captureFailure shape #67 added to bind_click.mjs: screenshot + DOM dump +
  // console log, so a CI failure ships enough evidence to diagnose without re-running locally.
  if (artifactDir && page) {
    try {
      await page.screenshot({ path: join(artifactDir, `polish_verify-${backend}-failure.png`), fullPage: true });
      const dump = await page.evaluate(() => ({
        title: document.title,
        url: location.href,
        cells: [...document.querySelectorAll("pluto-cell")].map((c) => ({ id: c.id, classes: c.className })),
        hosts: document.querySelectorAll(".ip-host").length,
      }));
      writeFileSync(join(artifactDir, `polish_verify-${backend}-dom.json`), JSON.stringify(dump, null, 2));
      writeFileSync(join(artifactDir, `polish_verify-${backend}-console.log`), consoleLog.join("\n"));
      console.error(`artifact: wrote polish_verify-${backend}-{failure.png,dom.json,console.log} to ${artifactDir}`);
    } catch (e2) {
      console.error("artifact capture failed:", e2.message);
    }
  }
} finally {
  await browser.close();
}
if (failed) {
  console.error(`POLISH VERIFY FAIL (${backend}, after ${passed.join(", ")}):`, failed.message);
  process.exit(1);
}
