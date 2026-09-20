// Agent kind-sweep live-verify (LOCAL — not CI). Drives docs/dev/live-interaction-checklist.md
// — interaction AND visual — across every interactable kind on one backend.
// A 2-plot kitchen-sink is not enough. polish_verify.mjs is the required visual-chrome
// sibling (fade + prefers-color-scheme). This file asserts fade / no-pulse per kind
// and prefers-color-scheme once (scatter).
//
//   node kind_sweep.mjs <base-url> <notebook-abs-path> <cairo|webgl> [artifact-dir]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import {
  assertNoAlertRed, assertNoTeal, assertWash, assertRing, assertHoverRecipe, assertNoHighlight,
  assertCircleR, assertRemountStable, assertLeaveFade, assertTooltipColorScheme,
  meanLuminance, assertTintApplied,
} from "./visual_assert.mjs";
import { installRecorder, logCursor, logSince, pollLog } from "./transient_log.mjs";

// Kinds whose hover draws a masque-hi masque-fillshape tint (closed shapes) get the
// screenshot-based tint-applied check below; :grid (heatmap/image) hits a "rect" geom_ too
// (geometry.ts's grid case), so its hover is closed/filled the same as circles/rects/polygons.
const TINT_CHECK_KEYS = new Set(["scatter", "scatter_dark", "barplot", "heatmap", "poly"]);

// Mirrors selection.ts's selectionFor: these kinds (plus :grid) pin the clicked hit itself; a
// legend layer (has `links`) pins its linked target(s) instead.
const SELF_PIN_KINDS = new Set(["circles", "rects", "polygons", "segments", "polyline", "grid"]);

const [base, notebook, backend, artifactDirArg] = process.argv.slice(2);
if (!base || !notebook || !backend) {
  console.error("usage: node kind_sweep.mjs <base-url> <notebook> <cairo|webgl> [artifact-dir]");
  process.exit(2);
}
const artifactDir = artifactDirArg || process.env.E2E_ARTIFACT_DIR || null;
if (artifactDir) mkdirSync(artifactDir, { recursive: true });
const consoleLog = [];

const SHIM_LEAK = /\b(?:Bonito|comm)\.\w+ is not a function/;
const ALLOWED = [/Bonito\.decode_binary is not a function/, /Bonito\.fetch_binary is not a function/];

// Element count for a layer's own geometry — the click-collision fallback (below) and the
// legend links fan-out check both need this to derive an IN-RANGE alternative index rather than
// assume one exists (#114): grid's count is ncols*nrows, mirroring hitPoint's own i/j decoding.
function layerElementCount(l) {
  const g = l.geometry;
  if (l.kind === "circles") return g.length / 3;
  if (l.kind === "rects") return g.length / 4;
  if (l.kind === "segments") return g.length / 4;
  if (l.kind === "polyline") return Math.max(0, g.length / 2 - 1);
  if (l.kind === "polygons") return g.length;
  if (l.kind === "grid") return g.ncols * g.nrows;
  throw new Error(`layerElementCount: unhandled kind ${l.kind}`);
}

function hitPoint(layer, index) {
  const k = layer.kind, g = layer.geometry;
  if (k === "circles") {
    return { x: g[3 * index], y: g[3 * index + 1], r: g[3 * index + 2] };
  }
  if (k === "rects") {
    return { x: g[4 * index], y: g[4 * index + 1], w: g[4 * index + 2], h: g[4 * index + 3] };
  }
  if (k === "segments") {
    return {
      x: (g[4 * index] + g[4 * index + 2]) / 2,
      y: (g[4 * index + 1] + g[4 * index + 3]) / 2,
      x1: g[4 * index], y1: g[4 * index + 1], x2: g[4 * index + 2], y2: g[4 * index + 3],
    };
  }
  if (k === "polyline") {
    return {
      x: (g[2 * index] + g[2 * index + 2]) / 2,
      y: (g[2 * index + 1] + g[2 * index + 3]) / 2,
      x1: g[2 * index], y1: g[2 * index + 1], x2: g[2 * index + 2], y2: g[2 * index + 3],
    };
  }
  if (k === "polygons") {
    const ring = g[index];
    let sx = 0, sy = 0, n = ring.length / 2;
    for (let i = 0; i < ring.length; i += 2) { sx += ring[i]; sy += ring[i + 1]; }
    return { x: sx / n, y: sy / n, ring };
  }
  if (k === "grid") {
    const ncols = g.ncols;
    const i = index % ncols, j = Math.floor(index / ncols);
    return {
      x: (g.xedges[i] + g.xedges[i + 1]) / 2,
      y: (g.yedges[j] + g.yedges[j + 1]) / 2,
    };
  }
  if (k === "threshold") {
    const [s0, s1] = g.span;
    return g.orientation === "h"
      ? { x: (s0 + s1) / 2, y: g.pos, x1: s0, y1: g.pos, x2: s1, y2: g.pos }
      : { x: g.pos, y: (s0 + s1) / 2, x1: g.pos, y1: s0, x2: g.pos, y2: s1 };
  }
  if (k === "roi" || k === "view") {
    return { x: g.x + g.w / 2, y: g.y + g.h / 2, w: g.w, h: g.h };
  }
  throw new Error(`no hitPoint for kind=${k}`);
}

// Mirrors geometry.ts's invertAxis/mapAxis for the identity/log10/log, non-categorical case —
// every fixture axis here is linear and non-reversed, so this only needs to match those branches,
// not the categorical/reversed ones.
function invertAxisJs(t, px, py) {
  const [vx, vy, vw, vh] = t.viewport;
  let fx = (px - vx) / vw;
  if (t.xreversed) fx = 1 - fx;
  let fy = 1 - (py - vy) / vh;
  if (t.yreversed) fy = 1 - fy;
  const mapAxis = (lims, scale, f) => {
    if (scale === "log10" || scale === "log") {
      const a = Math.log10(lims[0]), b = Math.log10(lims[1]);
      return Math.pow(10, a + f * (b - a));
    }
    return lims[0] + f * (lims[1] - lims[0]);
  };
  return { x: mapAxis(t.xlims, t.xscale, fx), y: mapAxis(t.ylims, t.yscale, fy) };
}

const browser = await chromium.launch({
  headless: true,
  // kind_sweep_webgl.jl mounts one live canvas (= one WebGL context) per widget — Chromium's
  // default active-context cap is 16, and this notebook is at 17 as of #113's `axis` widget.
  // Past the cap, Chromium silently evicts the OLDEST context ("Too many active WebGL
  // contexts. Oldest context will be lost."), which reads here as a null host/canvas on
  // whichever widget got evicted — nondeterministic, and not a Masque bug. Raised well above
  // the current count so the notebook has headroom to grow further.
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--max-active-webgl-contexts=64"],
});
const passed = [];
const unexpected = [];
let failed = null;
let context, page;
let lastWglChurnAt = 0;
let wglChurnCount = 0; // #99: surfaced in the failure message below, so a future red run ties directly to this evidence
try {
  context = await browser.newContext({
    locale: "en-US", timezoneId: "UTC",
    viewport: { width: 1100, height: 1400 },
    deviceScaleFactor: 2,
    reducedMotion: "no-preference",
  });
  page = await context.newPage();
  page.on("pageerror", (e) => {
    const shim = SHIM_LEAK.test(e.message);
    const benign = shim && ALLOWED.some((re) => re.test(e.message));
    if (!benign) unexpected.push(e.message);
    console.error(benign ? "PAGEERROR (known-benign):" : "PAGEERROR:", e.message);
  });
  // On :webgl, WGLMakie/Bonito can keep tearing down and rebuilding canvas contexts
  // ("removing WGL context, canvas is not in the DOM anymore!") for a while after Pluto's own
  // cell-busy signal clears — seen in CI (not reproduced locally) as an instant, fade-less hi
  // clear: the churn wipes a host's overlay group between our hover check and the following
  // leave check. Require a quiet window with no such message before calling the page ready.
  const WGL_CHURN_RE = /removing WGL context/;
  const WGL_QUIET_MS = 3000;
  page.on("console", (m) => {
    const text = m.text();
    consoleLog.push(`[${m.type()}] ${text}`);
    if (WGL_CHURN_RE.test(text)) { lastWglChurnAt = Date.now(); wglChurnCount++; }
  });

  await page.goto(`${base}/open?path=${encodeURIComponent(notebook)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const deadline = Date.now() + 1500000;
  let ready = false, tick = 0;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      // Click the "Run notebook code" safe-preview banner exactly once per page: it can stay
      // in the DOM (just visually superseded) for the whole first-open precompile, and a
      // repeated click on an already-running notebook re-triggers Pluto's reactive run,
      // interrupting the in-flight cell (surfaces as InterruptException under slow/contended
      // precompilation — seen when Cairo and WGL open concurrently on a loaded box).
      const runBtn = [...document.querySelectorAll("button, a")].find((b) => /run notebook code/i.test(b.innerText || b.title || ""));
      if (runBtn && !window.__masqueClickedRun) { runBtn.click(); window.__masqueClickedRun = true; }
      const hosts = [...document.querySelectorAll(".ip-host")];
      let surfaces = 0;
      for (const h of hosts) {
        let sr = null; h.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        if (sr && sr.querySelector(".surface")) surfaces++;
      }
      let meta = null;
      try { meta = JSON.parse(document.querySelector("#kind_meta")?.textContent || ""); } catch { meta = null; }
      return {
        busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
        errored: document.querySelectorAll("pluto-cell.errored").length,
        hosts: hosts.length, surfaces,
        metaN: Array.isArray(meta) ? meta.length : 0,
        backend: document.querySelector("#kind_backend")?.textContent?.trim() || "",
        errText: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).slice(0, 1).join(""),
        title: document.title,
        url: location.href,
      };
    });
    if (st.errored) throw new Error(`${backend} errored: ${st.errText.slice(0, 500)}`);
    const wglQuiet = !lastWglChurnAt || (Date.now() - lastWglChurnAt) > WGL_QUIET_MS;
    if (!st.busy && st.metaN >= 14 && st.surfaces >= st.metaN && wglQuiet) { ready = true; break; }
    if (tick % 20 === 0) {
      console.error(`  …${backend} [${tick}s] busy=${st.busy} hosts=${st.hosts} surfaces=${st.surfaces} meta=${st.metaN} wglQuiet=${wglQuiet} title=${JSON.stringify(st.title || "")} url=${st.url || ""}`);
    }
    tick++;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error(`${backend} timed out waiting for kind-sweep widgets`);
  console.error(`phase: widgets mounted (${backend})`);
  // Diagnostic only (not an assertion): reports whether MASQUE_DEV_ENV propagated from serve.jl
  // into Pluto's notebook worker process, so a CI job log shows which Pkg path the run took.
  const usedDevEnv = await page.evaluate(() => document.querySelector("#kind_env")?.textContent?.trim());
  console.error(`MASQUE_DEV_ENV propagated to notebook worker: ${usedDevEnv === "true" ? "yes" : usedDevEnv === "false" ? "no (portable path taken)" : "unknown (#kind_env missing)"}`);

  const meta = await page.evaluate(() => JSON.parse(document.querySelector("#kind_meta").textContent));
  const pageBackend = await page.evaluate(() => document.querySelector("#kind_backend")?.textContent?.trim());
  if (pageBackend && pageBackend !== backend) {
    throw new Error(`notebook backend ${pageBackend} != requested ${backend}`);
  }

  const shadowOf = (key) => page.evaluate((k) => {
    const span = document.querySelector(`#coords_${k}`);
    if (!span) return null;
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    if (!host) return null;
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    return { ok: !!(sr && sr.querySelector(".surface")) };
  }, key);

  const inspect = (key) => page.evaluate((k) => {
    const span = document.querySelector(`#coords_${k}`);
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const baseEl = host.querySelector("img, canvas");
    // THREE sibling overlay svgs, same box/viewBox: svg.masque-fill (mix-blend-mode:
    // color-dodge — the brightening half) and svg.masque-edge (multiply/screen — the darkening
    // half) together draw a closed mark's hover/selected highlight as two identical-geometry
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
    const kidsOf = (svg, layerName) => [...(svg?.querySelector("g.sel")?.children ?? [])].map((el) => {
      if (el.tagName.toLowerCase() === "g") {
        return {
          layer: layerName, kind: "ring",
          lines: [...el.querySelectorAll("line")].map((ln) => {
            const cs = getComputedStyle(ln);
            return {
              className: ln.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
              width: ln.getAttribute("stroke-width"), opacity: ln.getAttribute("stroke-opacity"),
              x1: ln.getAttribute("x1"), y1: ln.getAttribute("y1"),
              x2: ln.getAttribute("x2"), y2: ln.getAttribute("y2"),
            };
          }),
        };
      }
      const cs = getComputedStyle(el);
      return {
        layer: layerName, kind: "closed", tag: el.tagName.toLowerCase(),
        className: el.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
        width: el.getAttribute("stroke-width"),
        blend: layerName === "plain" ? null : getComputedStyle(svg).mixBlendMode,
        r: el.getAttribute("r"), cx: el.getAttribute("cx"), cy: el.getAttribute("cy"),
        x: el.getAttribute("x"), y: el.getAttribute("y"),
        w: el.getAttribute("width"), h: el.getAttribute("height"),
        points: el.getAttribute("points"),
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
      sel: count("g.sel"),
      hi: count("g.hi"),
    };
  }, key);

  const layersOf = (key) => page.evaluate((k) => JSON.parse(document.querySelector(`#coords_${k}`).textContent), key);
  const findLayer = (layers, spec) => {
    const L = layers.find((l) => l.id === spec.layerId) || layers.find((l) => l.kind === spec.layerKind);
    if (!L) throw new Error(`${spec.key}: no layer ${spec.layerId}/${spec.layerKind} in ${layers.map((l) => l.id + ":" + l.kind)}`);
    return L;
  };
  // Manifest `transforms` dict for the `axis` widget only (#axes_axis, kind_sweep_figures.jl) —
  // an `:axis`-kind layer's geometry is `nothing` (AxisInteractable) or a bbox with no lims of
  // its own, so hitting/verifying it needs the AxisTransform (viewport + lims), not just the
  // layer dict every other kind gets by from `layersOf`.
  const transformsOf = (key) => page.evaluate((k) => JSON.parse(document.querySelector(`#axes_${k}`).textContent), key);

  const dispatchAt = async (key, x, y, type) => page.evaluate(([k, ix, iy, typ]) => {
    const span = document.querySelector(`#coords_${k}`);
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
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
    const tip = sr.querySelector(".masque-tip");
    // Bare shape in g.hi — svg.masque-fill (fill half) + svg.masque-edge (edge half) for the
    // default split-blend recipe, svg.masque-plain for an explicit `hoverstyle` (no wrapper
    // either way). At most one of {fill|edge} vs. plain is populated for a given hit; an open
    // seg or an already-selected mark can leave fill/edge both empty.
    const svgFill = sr.querySelector("svg.masque-fill"), svgEdge = sr.querySelector("svg.masque-edge"), svgPlain = sr.querySelector("svg.masque-plain");
    const capture = (svg, layerName) => {
      const el = svg?.querySelector("g.hi")?.firstElementChild;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        layer: layerName, tag: el.tagName.toLowerCase(), className: el.getAttribute("class"),
        fill: cs.fill, stroke: cs.stroke, fillOpacity: cs.fillOpacity,
        width: el.getAttribute("stroke-width"), opacity: el.getAttribute("stroke-opacity"),
        blend: layerName === "plain" ? null : getComputedStyle(svg).mixBlendMode,
        r: el.getAttribute("r"), cx: el.getAttribute("cx"), cy: el.getAttribute("cy"),
        x1: el.getAttribute("x1"), y1: el.getAttribute("y1"), x2: el.getAttribute("x2"), y2: el.getAttribute("y2"),
      };
    };
    return {
      show: tip?.classList.contains("show"),
      text: (tip?.innerText || "").replace(/\s+/g, " ").trim(),
      hi: { fill: capture(svgFill, "fill"), edge: capture(svgEdge, "edge"), plain: capture(svgPlain, "plain") },
      sel: (svgFill?.querySelector("g.sel")?.children.length ?? 0)
        + (svgEdge?.querySelector("g.sel")?.children.length ?? 0)
        + (svgPlain?.querySelector("g.sel")?.children.length ?? 0),
    };
  }, [key, x, y, type]);

  const textOf = (sel) => page.evaluate((q) => document.querySelector(q)?.innerText ?? "", sel);

  // A small css-px page.screenshot() clip centred on an image-space point — used by the
  // tint-applied check to sample real pixels before/after the hover blend applies (a page
  // screenshot, not a canvas readback, so it works on both Cairo <img> and WGL <canvas>).
  // Default size is small (8) so the box stays inside the mark's interior, off the darkening
  // edge stroke — scatter's drawn r is ≈15.5 image px ≈7.75 css px at the usual px_per_unit 2.
  const clipShot = async (key, ix, iy, size = 8) => {
    const pt = await page.evaluate(([k, x, y]) => {
      const span = document.querySelector(`#coords_${k}`);
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      host.scrollIntoView({ block: "center", inline: "nearest" });
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const b = host.querySelector("img, canvas").getBoundingClientRect();
      const outW = sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
      const s = b.width / outW;
      return { x: b.left + x * s, y: b.top + y * s };
    }, [key, ix, iy]);
    return page.screenshot({ clip: { x: pt.x - size / 2, y: pt.y - size / 2, width: size, height: size } });
  };

  // A HitLayer's `colors` manifest field is a plain "rgb(r,g,b)" string when every element
  // shares one resolvable colour (scatter/scatter_dark's `color=`, and a legend link target with
  // a resolvable colour) — parse it to the luminance the mark's own interior must read at, before
  // any hover tint. A `colors` palette dict (per-index categorical) or an absent field (barplot,
  // poly, heatmap today) isn't parsed here; callers treat a null return as "no expectation".
  const rawColorLuminance = (colors) => {
    if (typeof colors !== "string") return null;
    const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(colors);
    if (!m) return null;
    return 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]);
  };
  // Resolve the colour a TINT_CHECK_KEYS spot check must expect: `colors` whenever it's a
  // parseable "rgb(r,g,b)" string, else `spec.tintColor` — a colour BAKED once into
  // kind_sweep_figures.jl's `kind_sweep_meta()` from an actual CairoMakie raster sample at the
  // manifest's own projected element centre (barplot/heatmap/poly have no resolvable `colors` at
  // all). `??` alone would be wrong here: a `{palette, index}` per-index dict is non-null but
  // unparseable, so the check has to be "does rawColorLuminance actually parse it", not bare
  // nullness.
  const expectedColorFor = (colors, tintColor) => (typeof colors === "string" ? colors : (tintColor ?? null));
  const RAW_COLOR_TOLERANCE = 20; // margin for AA/rim bleed inside the small clip box, tight enough to catch a stale/blank frame

  // A WGL <canvas>'s compositor frame isn't guaranteed fresh the first time a host is scrolled
  // into view for a page.screenshot() clip (Cairo's baked <img> has no such gap) — seen in CI as
  // a `tint-applied` false negative: the very first clipShot() on a given host (always the
  // "before" sample of a case with no earlier screenshot-based check on it, e.g. a legend link
  // target reached only after a long scroll) returned a stale/blank frame that stayed constant
  // across repeats — a plain "retry until two reads agree" loop would exit on that SAME wrong
  // reading, since a stuck frame is trivially self-consistent. When `expectLum` is available
  // (from `rawColorLuminance`, resolved via `expectedColorFor` so a kind with no resolvable
  // `colors` still gets one from its baked `spec.tintColor`), retry until the reading actually
  // matches it instead; only fall back to inter-frame stability (no expectation to check against)
  // when neither is available. Every `TINT_CHECK_KEYS` key now asserts a non-null `expectLum`
  // before this is ever called (see the `doTintCheck` block below), so that fallback can no
  // longer be the only guard for those checks.
  const stableClipShot = async (key, ix, iy, { size = 8, retries = 6, tol = 1.5, expectLum = null } = {}) => {
    let prevLum = null, buf = null;
    for (let i = 0; i < retries; i++) {
      buf = await clipShot(key, ix, iy, size);
      const lum = meanLuminance(PNG.sync.read(buf));
      if (expectLum !== null) {
        if (Math.abs(lum - expectLum) <= RAW_COLOR_TOLERANCE) return buf;
      } else if (prevLum !== null && Math.abs(lum - prevLum) < tol) {
        return buf;
      }
      prevLum = lum;
      await new Promise((r) => setTimeout(r, 150));
    }
    return buf;
  };

  const assertRawColorMatch = (lumBefore, colors, where) => {
    const expected = rawColorLuminance(colors);
    if (expected === null) return;
    if (Math.abs(lumBefore - expected) > RAW_COLOR_TOLERANCE) {
      throw new Error(
        `${where}: lumBefore=${lumBefore.toFixed(1)} doesn't match the mark's own resolved colour ${colors} ` +
        `(expected luminance ≈${expected.toFixed(1)}) — the clip likely sampled a stale/blank frame, not the mark`,
      );
    }
  };

  const drag = async (key, x0, y0, x1, y1, shift = false) => {
    const a = await page.evaluate(([k, ix, iy]) => {
      const span = document.querySelector(`#coords_${k}`);
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const b = host.querySelector("img, canvas").getBoundingClientRect();
      const outW = sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
      const s = b.width / outW;
      return { cx: b.left + ix * s, cy: b.top + iy * s };
    }, [key, x0, y0]);
    const b = await page.evaluate(([k, ix, iy]) => {
      const span = document.querySelector(`#coords_${k}`);
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const box = host.querySelector("img, canvas").getBoundingClientRect();
      const outW = sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
      const s = box.width / outW;
      return { cx: box.left + ix * s, cy: box.top + iy * s };
    }, [key, x1, y1]);
    await page.evaluate(([k, ax, ay, bx, by, shift]) => {
      const span = document.querySelector(`#coords_${k}`);
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const surface = sr.querySelector(".surface");
      // dispatchEvent bypasses hit-testing/capture redirection entirely — it always fires on the
      // element you call it on — so drive move/up on `surface` directly (matching what real pointer
      // capture, set by onDown for an actual user gesture, would route there anyway).
      const pid = { pointerId: 1, pointerType: "mouse", isPrimary: true };
      const down = { bubbles: true, composed: true, cancelable: true, clientX: ax, clientY: ay, shiftKey: shift, ...pid };
      surface.dispatchEvent(new PointerEvent("pointerdown", down));
      for (let t = 0.25; t <= 1.0; t += 0.25) {
        surface.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true, cancelable: true, shiftKey: shift, ...pid,
          clientX: ax + (bx - ax) * t, clientY: ay + (by - ay) * t,
        }));
      }
      surface.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, shiftKey: shift, clientX: bx, clientY: by, ...pid }));
    }, [key, a.cx, a.cy, b.cx, b.cy, shift]);
  };

  const waitChange = async (sel, before, what, tries = 80) => {
    for (let i = 0; i < tries; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const t = await textOf(sel);
      if (t !== before && t.length) return t;
    }
    throw new Error(`${what}: ${sel} never changed from ${JSON.stringify(before)}`);
  };

  const expectBase = backend === "webgl" ? "canvas" : "img";

  // Set below when the loop reaches "scatter" — the hover-on-selected-noop check after the loop
  // needs the INDEX actually clicked (not just spec.clickIndex), since the collision-avoidance
  // bump a few lines down can move it.
  let scatterClickIdx = null;

  for (const spec of meta) {
    const key = spec.key;
    const wantDark = key === "scatter_dark"; // the only dark-figure case in kind_sweep_figures.jl
    const sh = await shadowOf(key);
    if (!sh?.ok) throw new Error(`${key}: overlay surface missing`);
    // #99: installed once per widget, before anything below can draw a hover — the no-pulse
    // window (below) opens at the tooltip-establishing hover, not here, but the recorder has to
    // already be watching by then to catch that add.
    await installRecorder(page, key);
    const m = await inspect(key);
    if (m.baseTag !== expectBase) throw new Error(`${key}: expected ${expectBase}, got ${m.baseTag}`);
    for (const [name, svgBox] of [["masque-fill", m.svgFill], ["masque-edge", m.svgEdge], ["masque-plain", m.svgPlain]]) {
      const dx = Math.abs(svgBox.x - m.base.x), dy = Math.abs(svgBox.y - m.base.y);
      const dw = Math.abs(svgBox.w - m.base.w), dh = Math.abs(svgBox.h - m.base.h);
      if (dx > 2 || dy > 2 || dw > 3 || dh > 3) {
        throw new Error(`${key}: overlay/base offset svg.${name}=${JSON.stringify(svgBox)} base=${JSON.stringify(m.base)}`);
      }
    }
    passed.push(`${key}/overlay-on-base`);

    const layers = await layersOf(key);
    const layer = findLayer(layers, spec);

    // Regression check for the `build_manifest` precedence fix (src/render.jl ~line 259):
    // a `LegendInteractable` layer drawn over filled plot geometry must sort BEFORE that
    // geometry's layer in the manifest, or the frontend's first-match `hitTest` gives every
    // contested pixel to the plot underneath instead of the legend.
    if (spec.overlapsGrid) {
      const gridLayer = layers.find((l) => l.id === spec.overlapsGrid);
      if (!gridLayer) throw new Error(`${key}: no grid layer "${spec.overlapsGrid}" in manifest`);
      const legendIdx = layers.indexOf(layer);
      const gridIdx = layers.indexOf(gridLayer);
      if (!(legendIdx < gridIdx)) {
        throw new Error(`${key}: legend layer index ${legendIdx} not before grid layer "${spec.overlapsGrid}" index ${gridIdx}`);
      }
      // Prove the test is meaningful: the pixel the generic hover/click checks below use must
      // genuinely fall inside BOTH layers' claimed geometry, not just two non-overlapping boxes.
      const hp = hitPoint(layer, spec.selectedIndex);
      const g = gridLayer.geometry;
      // Pixel space: xedges/yedges keep their original edge order, which can be descending
      // (top-left-origin, y-flipped projection) — sort before treating as [min, max].
      const xs = [g.xedges[0], g.xedges.at(-1)].sort((a, b) => a - b);
      const ys = [g.yedges[0], g.yedges.at(-1)].sort((a, b) => a - b);
      const inGrid = hp.x >= xs[0] && hp.x <= xs[1] && hp.y >= ys[0] && hp.y <= ys[1];
      if (!inGrid) {
        throw new Error(`${key}: legend test pixel ${JSON.stringify(hp)} not inside grid extent x[${xs}] y[${ys}]`);
      }
      passed.push(`${key}/legend-precedence-order`);
      passed.push(`${key}/legend-precedence-pixel-contested`);
    }

    // mount.ts used to force host.value = null unconditionally, so the real Pluto bond settled
    // on `nothing` at mount even with selected= baked in. Read #out_${key} (repr(ev) off the
    // actual bond) before any click/drag on this widget to catch that directly.
    const mountBond = await textOf(`#out_${key}`);
    // `pinLayerId` (the `axis` spec, #113) means this widget bakes a REAL `selected=` too, just
    // on a layer other than `spec.layerId` — it must not fall through to the "no selection was
    // ever expected" branch below, or a mount.ts regression (bond forced to `nothing` despite
    // `selected=`) reports as `hydrated-bond-control` instead of failing loud.
    if (spec.selected || spec.pinLayerId) {
      if (/=\s*nothing$/.test(mountBond)) {
        throw new Error(`${key}: bond reads "nothing" at mount despite selected= (${JSON.stringify(mountBond)})`);
      }
      if (spec.pinLayerId) {
        // Unlike a single-layer spec (checked below via the strict `:${spec.layerId}` match),
        // this widget's bond can legitimately mount naming ANY of its own layers, not only the
        // one `selected=` bakes on a cold start: confirmed empirically that a warm re-run's
        // leftover value (Pluto keeps a bond's last value across a page reload, #114) can name
        // `:colorbar` or `:axis` here just as easily as `:pts`, depending which this block
        // clicked last, last time it ran against this same server. The invariant actually being
        // guarded — never literally `nothing` when a real selection is baked — is already
        // checked above; which of the widget's OWN layers a non-`nothing` value names is not
        // itself a regression.
        if (!layers.some((l) => mountBond.includes(`:${l.id},`))) {
          throw new Error(`${key}: mount bond ${JSON.stringify(mountBond)} doesn't name any of this widget's own layers`);
        }
      } else if (!mountBond.includes(`:${spec.layerId}`)) {
        throw new Error(`${key}: mount bond ${JSON.stringify(mountBond)} doesn't name layer :${spec.layerId}`);
      }
      passed.push(`${key}/hydrated-bond`);
    } else if (/=\s*nothing$/.test(mountBond)) {
      passed.push(`${key}/hydrated-bond-control`);
    } else if (/InteractionEvent/.test(mountBond) && layers.some((l) => mountBond.includes(`:${l.id},`))) {
      // A prior kind_sweep.mjs run against this SAME warm Pluto session leaves the bond holding
      // its last value — Pluto's normal reconnect hydration (a bond keeps its value across a
      // page reload), not a regression of the mount.ts "force host.value = null" bug the check
      // above guards against. A `nothing`-baked spec can legitimately mount non-`nothing` on a
      // warm re-run (#114): accept any well-formed leftover naming one of THIS widget's own
      // layers — a `selects`-ROI's bond names its TARGET layer (e.g. `:pts`), never its own
      // `:roi` id, so this checks membership in `layers`, not `spec.layerId` specifically. The
      // trailing comma anchors on the id boundary Julia's positional `repr` always emits right
      // after it (`InteractionEvent(:id, index, …)`) — layer ids can nest (`lines`/`lines_2`,
      // `scatter`/`scatter_dark`), so an unanchored `includes` could false-match a leftover that
      // actually names neither this widget's layer nor any real one (e.g. `:linesX,`).
      passed.push(`${key}/hydrated-bond-control-warm`);
    } else {
      throw new Error(
        `${key}: mount bond ${JSON.stringify(mountBond)} is neither "nothing" nor a recognizable ` +
        `leftover naming one of this widget's own layers (warm-session carryover, #114)`,
      );
    }

    if (spec.mode === "drag" && spec.layerKind === "view") {
      // #102/§12.3: a view gesture commits nothing anymore — the OLD assertion here waited for
      // #out_view's bond text to change and would now fail for the right reason (nothing ever
      // commits) for the WRONG reason (the test still expects a commit). Asserting "the bond
      // stayed put" alone would pass just as well if the drag did nothing at all — the #99
      // failure shape (a green assertion unable to fail for the right reason) — so this checks
      // three things: the bond truly didn't move, AND (on `:cairo`, where the gesture channel is
      // implemented) mount.ts's `host.dataset.masqueGestureFrame` stamp — written atomically in
      // the same block that swaps the frame + manifest — advanced with a well-formed new camera,
      // proving a REAL frame landed from the CURRENT drag rather than sampling stale state. On
      // `:webgl` (no live-preview mechanism yet, architecture §12.10) the stamp must never
      // appear at all — the readout still works, but nothing repaints.
      const p = hitPoint(layer, 0);
      const before = await textOf(`#out_${key}`);
      const readStamp = () => page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        return host?.dataset.masqueGestureFrame ?? null;
      }, key);
      const stampBefore = await readStamp();
      await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        host?.scrollIntoView({ block: "center", inline: "nearest" });
      }, key);
      await drag(key, p.x, p.y, p.x + 80, p.y, true);

      const after = await textOf(`#out_${key}`);
      if (after !== before) {
        throw new Error(`${key}-drag: a view gesture must not commit a bond value, but #out_${key} changed ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
      }

      if (backend === "cairo") {
        let stampAfter = stampBefore;
        for (let i = 0; i < 25 && stampAfter === stampBefore; i++) {
          await new Promise((r) => setTimeout(r, 200));
          stampAfter = await readStamp();
        }
        if (!stampAfter || stampAfter === stampBefore) {
          throw new Error(`${key}-drag: gesture-channel frame never landed (stamp stayed ${JSON.stringify(stampBefore)})`);
        }
        const cam = JSON.parse(stampAfter);
        const nBefore = stampBefore ? JSON.parse(stampBefore).n : 0;
        if (!(cam.n > nBefore)) throw new Error(`${key}-drag: gesture frame counter did not advance (${nBefore} -> ${cam.n})`);
        const camKeys = "azimuth" in cam ? ["azimuth", "elevation"] : ["xmin", "xmax", "ymin", "ymax"];
        if (!camKeys.every((k2) => typeof cam[k2] === "number" && Number.isFinite(cam[k2]))) {
          throw new Error(`${key}-drag: gesture frame stamp missing camera fields: ${stampAfter}`);
        }
        passed.push(`${key}/view-gesture-frame`);
        console.error(`OK  ${key}/drag — no commit (§12.3), gesture frame ${stampAfter}`);
      } else {
        const stampAfter = await readStamp();
        if (stampAfter !== stampBefore) {
          throw new Error(`${key}-drag: :webgl produced a gesture-channel frame, but no mechanism is implemented for it (architecture §12.10)`);
        }
        passed.push(`${key}/view-no-commit-no-webgl-frame`);
        console.error(`OK  ${key}/drag — no commit, no frame (webgl has no live-preview mechanism yet)`);
      }
      continue;
    }

    if (spec.mode === "drag") {
      const p = hitPoint(layer, 0);
      const before = await textOf(`#out_${key}`);
      const ends = spec.layerKind === "threshold"
        ? [[p.x, p.y - 50], [p.x, p.y + 50]]
        : spec.layerKind === "roi"
          ? (() => {
            const pts = layers.find((l) => l.kind === "circles");
            if (!pts) return [[p.x + (p.w || 40), p.y], [p.x - (p.w || 40), p.y]];
            const a = hitPoint(pts, 0), b = hitPoint(pts, Math.max(0, Math.floor(pts.geometry.length / 3) - 1));
            return [[a.x, a.y], [b.x, b.y]];
          })()
          : [[p.x + 80, p.y], [p.x - 80, p.y]];
      let after = before;
      for (const [x1, y1] of ends) {
        await page.evaluate((k) => {
          const span = document.querySelector(`#coords_${k}`);
          const hosts = [...document.querySelectorAll(".ip-host")];
          const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
          host?.scrollIntoView({ block: "center", inline: "nearest" });
        }, key);
        await drag(key, p.x, p.y, x1, y1, false);
        try {
          after = await waitChange(`#out_${key}`, before, `${key}-drag`, 120);
          break;
        } catch {
          after = before;
        }
      }
      if (after === before) throw new Error(`${key}-drag: #out_${key} never changed from ${JSON.stringify(before)}`);
      const re = spec.layerKind === "roi" ? /:roi|InteractionEvent\[/i : /:threshold|:thr/i;
      if (!re.test(after)) throw new Error(`${key}-drag: readout mismatch ${JSON.stringify(after).slice(0, 200)}`);
      passed.push(`${key}/drag-bind`);
      console.error(`OK  ${key}/drag — ${after.slice(0, 100)}`);
      continue;
    }

    // #113: :axis is the one clickable kind whose click is NOT a selection gesture — an
    // AxisInteractable's whole-image catch-all and a ColorbarInteractable's bounded bbox share
    // this widget with a real, pre-existing `:pts` selection so a click on either can be proven
    // not to clear it (the #107 round-1 regression). No highlight geometry, no element index
    // (always -1) and no collision-avoidance guard applies here (layerElementCount has nothing
    // to count for a catch-all/bbox layer) — a click's outcome is checked by MATCHING the bond
    // text against a value computed the same way the browser computes it, not by requiring the
    // text to CHANGE, so a warm-session re-run whose click reproduces byte-identical geometry
    // and hence a byte-identical payload (#114's collision hazard, deliberately sidestepped
    // rather than hit) still passes.
    if (spec.mode === "axis") {
      const axisLayer = layers.find((l) => l.id === spec.layerId && l.kind === "axis");
      const cbLayer = layers.find((l) => l.id === spec.colorbarLayerId && l.kind === "axis");
      const ptsLayer = layers.find((l) => l.id === spec.pinLayerId);
      if (!axisLayer || !cbLayer || !ptsLayer) {
        throw new Error(`${key}: missing axis/colorbar/pin layers in ${JSON.stringify(layers.map((l) => l.id + ":" + l.kind))}`);
      }
      const axes = await transformsOf(key);
      const axisT = axes[axisLayer.axis], cbT = axes[cbLayer.axis];
      if (!axisT || !cbT) throw new Error(`${key}: missing transforms for axis(${axisLayer.axis})/colorbar(${cbLayer.axis})`);

      const leave = () => page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        sr.querySelector(".surface").dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      }, key);

      // A pixel inside the axis viewport but well clear of every `:pts` mark, so it is
      // unambiguously an axis-catch-all hit, not a mark hit that happens to sort after it.
      const [avx, avy, avw, avh] = axisT.viewport;
      const axisPt = { x: avx + 0.08 * avw, y: avy + 0.08 * avh };
      const nPts = layerElementCount(ptsLayer);
      for (let i = 0; i < nPts; i++) {
        const hp = hitPoint(ptsLayer, i);
        if (Math.hypot(axisPt.x - hp.x, axisPt.y - hp.y) < (hp.r ?? 0) + 8) {
          throw new Error(`${key}: axis test pixel ${JSON.stringify(axisPt)} too close to pts[${i}] ${JSON.stringify(hp)}`);
        }
      }
      const [cvx, cvy, cvw, cvh] = cbT.viewport;
      const cbPt = { x: cvx + cvw / 2, y: cvy + cvh / 2 };
      // A pixel between the main axis and the colorbar, outside the colorbar's own bbox — proves
      // ColorbarInteractable's hit test is genuinely BOUNDED (geometry.ts's bbox branch actually
      // returns null outside it), not a second catch-all. The midpoint of the gap is used rather
      // than a fixed offset so this doesn't need its own `:pts`-mark-proximity guard (unlike
      // `axisPt` above): fail loud if a future layout ever closes the gap to nothing, rather than
      // silently falling back to an unguarded pixel that could land on a mark.
      const gapX = (avx + avw + cvx) / 2;
      if (!(gapX > avx + avw && gapX < cvx)) {
        throw new Error(`${key}: no gap between the axis viewport (right edge ${avx + avw}) and the colorbar bbox (left edge ${cvx}) to place a bounded-bbox-exclusion test pixel in`);
      }
      const gapPt = { x: gapX, y: cvy + cvh / 2 };

      // --- item 3: hover shows a coordinate readout inverted from the axis transform ---
      // `dispatchAt` round-trips image px -> a synthetic event's `clientX`/`clientY` (IDL
      // `long` — fractional values get rounded on read) -> back to image px in `imgPx`, so the
      // pixel the browser actually hit-tests at can be off by ~1 CSS px from the one this driver
      // asked for. A few image px of slack (`AXIS_TOL_PX`, converted to data units via the same
      // slope `mapAxis` uses) absorbs that without weakening what this check exists to catch: a
      // wrong viewport, wrong lims, a missing y-flip, a reversed axis, or reading the wrong
      // transform entirely — all of which are off by far more than a few px.
      const AXIS_TOL_PX = 3;
      const parseAxisTip = (s) => {
        const m = /^x\s*=\s*(-?[\d.eE+-]+)\s*,\s*y\s*=\s*(-?[\d.eE+-]+)$/.exec(String(s || "").trim());
        if (!m) return null;
        const x = Number(m[1]), y = Number(m[2]);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
      };
      const expAxis = invertAxisJs(axisT, axisPt.x, axisPt.y);
      const tolX = AXIS_TOL_PX * Math.abs(axisT.xlims[1] - axisT.xlims[0]) / avw;
      const tolY = AXIS_TOL_PX * Math.abs(axisT.ylims[1] - axisT.ylims[0]) / avh;
      const axisTipNear = (got) => got && Math.abs(got.x - expAxis.x) <= tolX && Math.abs(got.y - expAxis.y) <= tolY;
      let axisTip = null, gotAxis = null;
      for (let a = 0; a < 8; a++) {
        axisTip = await dispatchAt(key, axisPt.x, axisPt.y, "pointermove");
        gotAxis = axisTip?.show ? parseAxisTip(axisTip.text) : null;
        if (axisTipNear(gotAxis)) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!axisTipNear(gotAxis)) {
        throw new Error(
          `${key}/axis-hover: tooltip ${JSON.stringify(axisTip)} parsed=${JSON.stringify(gotAxis)}, ` +
          `want x≈${expAxis.x} (±${tolX.toFixed(4)}) y≈${expAxis.y} (±${tolY.toFixed(4)})`,
        );
      }
      // An :axis hit has no discrete mark to anchor a highlight on — no shape should draw.
      if (axisTip.hi.fill || axisTip.hi.edge || axisTip.hi.plain) {
        throw new Error(`${key}/axis-hover: unexpected highlight ${JSON.stringify(axisTip.hi)}`);
      }
      passed.push(`${key}/axis-hover-coords`);
      await leave();

      // ColorbarInteractable reports a bare 1-D `value` off whichever axis is `valueaxis`
      // (`:y` for the vertical colorbar this fixture builds) — not hardcoded, so this still
      // reads correctly if the fixture ever switches to a horizontal one.
      const cbValKey = cbT.valueaxis;
      const cbLims = cbValKey === "x" ? cbT.xlims : cbT.ylims;
      const cbSpan = cbValKey === "x" ? cvw : cvh;
      const expCbVal = invertAxisJs(cbT, cbPt.x, cbPt.y)[cbValKey];
      const tolCb = AXIS_TOL_PX * Math.abs(cbLims[1] - cbLims[0]) / cbSpan;
      const parseValueTip = (s) => {
        const v = Number(String(s || "").trim());
        return Number.isFinite(v) ? v : null;
      };
      let cbTip = null, gotCb = null;
      for (let a = 0; a < 8; a++) {
        cbTip = await dispatchAt(key, cbPt.x, cbPt.y, "pointermove");
        gotCb = cbTip?.show ? parseValueTip(cbTip.text) : null;
        if (gotCb !== null && Math.abs(gotCb - expCbVal) <= tolCb) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (gotCb === null || Math.abs(gotCb - expCbVal) > tolCb) {
        throw new Error(`${key}/colorbar-hover: tooltip ${JSON.stringify(cbTip)} parsed=${gotCb}, want ≈${expCbVal} (±${tolCb.toFixed(4)})`);
      }
      passed.push(`${key}/colorbar-hover-coords`);

      // The gap pixel must read as the axis catch-all's 2-D "x=…, y=…" text, not the colorbar's
      // bare 1-D value — proving the bbox check actually excludes it.
      let gapTip = null;
      for (let a = 0; a < 8; a++) {
        gapTip = await dispatchAt(key, gapPt.x, gapPt.y, "pointermove");
        if (gapTip?.show && /x\s*=/.test(gapTip.text)) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!gapTip?.show || !/x\s*=/.test(gapTip.text)) {
        throw new Error(`${key}/colorbar-bbox-bounded: pixel just outside the colorbar bbox read as ${JSON.stringify(gapTip)}, want the axis catch-all's x=…,y=… form`);
      }
      passed.push(`${key}/colorbar-bbox-bounded`);
      await leave();

      // --- item 1: a click on either :axis-kind layer must leave the pre-existing :pts
      // selection untouched (the #107 round-1 regression) ---
      //
      // This widget's own precondition — a REAL :pts selection to click past — is checked here
      // explicitly, not inferred from the generic mount-bond chain above: that chain (with the
      // `pinLayerId` branch) now vouches that the BOND is a real, non-`nothing` value naming one
      // of this widget's own layers, but on a warm re-run that value can legitimately be `:axis`
      // or `:colorbar` rather than `:pts` (#114 — whichever this block clicked last, last time it
      // ran against this same server), so bond text alone can't confirm `:pts` is what's
      // currently selected. What item 1 actually needs is a VISUAL fact — `g.sel` reflects
      // `manifest["layers"]["selected"]`, which `masque()` bakes fresh into the mount HTML every
      // time, independent of bond history — not a bond-text fact, so it holds cold or warm.
      const beforeClicks = await inspect(key);
      if (beforeClicks.sel < 1) throw new Error(`${key}: expected a baked :pts selection before any click, got g.sel=${beforeClicks.sel}`);
      passed.push(`${key}/pts-selection-rendered-at-mount`);

      // Match-based, not diff-based (see the block comment above): dispatch, then poll until
      // `matchFn` accepts the bond text, retrying the dispatch a few times in case an event is
      // dropped. A warm-session re-run whose click computes the identical value the bond already
      // holds satisfies this on the very first poll — there is nothing to wait for. `matchFn`
      // checks the parsed VALUE against the same `exp*`/`tol*` the hover check above uses (not
      // just that the payload has the right shape) — a click and a hover are separate call sites
      // into `resolvePayload` (`geometry.ts`), so a coordinate regression specific to the click
      // path (unscaled `clientX`/`clientY`, stale `pointerdown` coordinates, a dropped viewport
      // origin, …) would otherwise produce a well-formed but WRONG `(x = …, y = …)` that a
      // shape-only regex can't tell from a correct one, while the hover check — which never
      // exercises that call site — stayed green.
      const clickAndMatch = async (px, py, matchFn, what) => {
        let last = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          await dispatchAt(key, px, py, "click");
          for (let i = 0; i < 30; i++) {
            const t = await textOf(`#out_${key}`);
            last = t;
            if (matchFn(t)) return t;
            await new Promise((r) => setTimeout(r, 200));
          }
        }
        throw new Error(`${what}: #out_${key} never matched (last seen: ${JSON.stringify(last)})`);
      };

      // --- item 2: the payload is the browser-computed value, converted Julia-side into a flat
      // NamedTuple — (; x, y) for AxisInteractable, index -1 ---
      // `[^)]*?`, not `[\s\S]*?`, between `-1` and the field it's paired with: this bond text is
      // a single flat span with no `$`-anchor to stop at, and a `:grid` payload's own `value =`
      // field (`(i = …, j = …, value = …)`, `_computed_payload`) has the identical field name —
      // stopping at the payload's own closing paren keeps this from ever crossing into a
      // DIFFERENT tuple's fields, even though nothing in this fixture reaches that today.
      const parseBondAxisXY = (t) => {
        const m = new RegExp(`:${spec.layerId},\\s*-1\\b[^)]*?x\\s*=\\s*(-?[\\d.]+(?:e-?\\d+)?)\\s*,\\s*y\\s*=\\s*(-?[\\d.]+(?:e-?\\d+)?)`).exec(t);
        if (!m) return null;
        const x = Number(m[1]), y = Number(m[2]);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
      };
      const axisAfter = await clickAndMatch(
        axisPt.x, axisPt.y,
        (t) => {
          const got = parseBondAxisXY(t);
          return !!got && Math.abs(got.x - expAxis.x) <= tolX && Math.abs(got.y - expAxis.y) <= tolY;
        },
        `${key}/axis-click`,
      );
      passed.push(`${key}/axis-click-payload-value`);
      const afterAxisClick = await inspect(key);
      if (afterAxisClick.sel !== beforeClicks.sel) {
        throw new Error(`${key}/axis-click-preserves-selection: g.sel ${beforeClicks.sel} -> ${afterAxisClick.sel} after an axis click (#107 regression)`);
      }
      passed.push(`${key}/axis-click-preserves-selection`);
      console.error(`OK  ${key}/axis-click — ${axisAfter.slice(0, 110)}`);

      // --- item 4: ColorbarInteractable's bounded bbox is a different hit-test branch from the
      // axis catch-all, but the same conversion applies — (; value), index -1 ---
      const parseBondValue = (t) => {
        const m = new RegExp(`:${spec.colorbarLayerId},\\s*-1\\b[^)]*?value\\s*=\\s*(-?[\\d.]+(?:e-?\\d+)?)`).exec(t);
        if (!m) return null;
        const v = Number(m[1]);
        return Number.isFinite(v) ? v : null;
      };
      const cbAfter = await clickAndMatch(
        cbPt.x, cbPt.y,
        (t) => {
          const got = parseBondValue(t);
          return got !== null && Math.abs(got - expCbVal) <= tolCb;
        },
        `${key}/colorbar-click`,
      );
      passed.push(`${key}/colorbar-click-payload-value`);
      const afterCbClick = await inspect(key);
      if (afterCbClick.sel !== beforeClicks.sel) {
        throw new Error(`${key}/colorbar-click-preserves-selection: g.sel ${beforeClicks.sel} -> ${afterCbClick.sel} after a colorbar click`);
      }
      passed.push(`${key}/colorbar-click-preserves-selection`);
      console.error(`OK  ${key}/colorbar-click — ${cbAfter.slice(0, 110)}`);
      continue;
    }

    if (spec.selected === "wash") {
      const wash = {
        fill: m.kids.find((k) => k.layer === "fill" && k.kind === "closed"),
        edge: m.kids.find((k) => k.layer === "edge" && k.kind === "closed"),
        plain: m.kids.find((k) => k.layer === "plain" && k.kind === "closed"),
      };
      assertWash(wash, key, wantDark);
      if (spec.circle) {
        // `hp.r` is whatever geometry the manifest shipped, not a fixed literal here — for
        // `scatter`/`scatter_dark` (markersize=22, built from the Scatter plot object) it's the
        // marker's drawn radius, ≈0.3525·22·2 (px_per_unit) ≈ 15.5 image px, not markersize/2.
        // The fill and edge shapes are identical geometry — check both.
        const hp = hitPoint(layer, spec.selectedIndex);
        for (const shape of [wash.fill, wash.edge].filter(Boolean)) {
          assertCircleR(shape.r, hp.r, `${key}/${shape.layer}`);
          if (Math.abs(Number(shape.cx) - hp.x) > 0.6 || Math.abs(Number(shape.cy) - hp.y) > 0.6) {
            throw new Error(`${key}: selected not centered (${shape.layer}) cx=${shape.cx},${shape.cy} geom=${hp.x},${hp.y}`);
          }
        }
        passed.push(`${key}/circle-r`);
      }
      if (layer.kind === "rects") {
        const hp = hitPoint(layer, spec.selectedIndex);
        const ex = hp.x - hp.w / 2, ey = hp.y - hp.h / 2;
        for (const shape of [wash.fill, wash.edge].filter(Boolean)) {
          if (Math.abs(Number(shape.x) - ex) > 1.2 || Math.abs(Number(shape.y) - ey) > 1.2) {
            throw new Error(`${key}: rect highlight offset (${shape.layer}) ${JSON.stringify(shape)} vs ${JSON.stringify(hp)}`);
          }
        }
      }
      passed.push(`${key}/selected-wash`);
    } else if (spec.selected === "ring") {
      const ring = m.kids.find((k) => k.kind === "ring");
      assertRing(ring, key);
      const hp = hitPoint(layer, spec.selectedIndex);
      const ln = ring.lines[0];
      if (hp.x1 != null && (Math.abs(Number(ln.x1) - hp.x1) > 1.2 || Math.abs(Number(ln.y1) - hp.y1) > 1.2)) {
        throw new Error(`${key}: ring not on segment ${JSON.stringify(ln)} vs ${JSON.stringify(hp)}`);
      }
      passed.push(`${key}/selected-ring`);
    } else if (m.sel !== 0) {
      throw new Error(`${key}: unexpected g.sel=${m.sel} on unsupported kind`);
    }

    const hoverIndex = spec.hoverIndex;
    const hoverTip = spec.hoverTip;
    const tipHit = (t) => {
      if (!hoverTip) return !!(t && t.show);
      const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
      return !!(t && t.show && norm(t.text).includes(norm(hoverTip)));
    };
    const hoverPt = hitPoint(layer, hoverIndex);
    // Tint-applied (screenshot): the interior of the mark must get BRIGHTER on hover on every
    // figure (the fill layer's color-dodge can only raise luminance) — the only thing left to
    // prove live, since neither the fill nor the edge colour derives from the mark any more.
    // Must run on an UNSELECTED point (`tintIndex` if the spec sets one — heatmap needs a
    // brighter cell than its baked `selectedIndex`'s darkest-viridis one — else `clickIndex` on
    // a key with a baked `selected`, since `selectedIndex` already carries the persistent wash;
    // where `selected` is null, `selectedIndex` is already clean).
    const doTintCheck = TINT_CHECK_KEYS.has(key);
    if (doTintCheck) {
      const tintIndex = spec.tintIndex ?? (spec.selected ? spec.clickIndex : spec.selectedIndex);
      const tintPt = hitPoint(layer, tintIndex);
      const expectColor = expectedColorFor(layer.colors, spec.tintColor);
      const expectLum = rawColorLuminance(expectColor);
      // Sanity check: every TINT_CHECK_KEYS key must resolve a real expectation, or stableClipShot
      // silently falls back to its "two reads agree" loop — trivially satisfied by a stuck/stale
      // frame (see stableClipShot's own comment above) — and the whole point of this check is lost.
      if (expectLum === null) {
        throw new Error(
          `${key}/tint-applied: no expectation to check against ` +
          `(layer.colors=${JSON.stringify(layer.colors)}, spec.tintColor=${JSON.stringify(spec.tintColor)}) — ` +
          `give this kind a resolvable \`colors\` or bake a \`tintColor\` in kind_sweep_figures.jl`,
        );
      }
      const lumBefore = meanLuminance(PNG.sync.read(
        await stableClipShot(key, tintPt.x, tintPt.y, { expectLum }),
      ));
      assertRawColorMatch(lumBefore, expectColor, `${key}/tint-applied`);
      await dispatchAt(key, tintPt.x, tintPt.y, "pointermove");
      await new Promise((r) => setTimeout(r, 200)); // let the 80-120ms enter fade settle
      const lumAfter = meanLuminance(PNG.sync.read(await stableClipShot(key, tintPt.x, tintPt.y)));
      assertTintApplied(lumBefore, lumAfter, `${key}/tint-applied`);
      passed.push(`${key}/tint-applied`);
      await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        sr.querySelector(".surface").dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      }, key);
    }

    // #99 round 2: the no-pulse/firstEnter window opens HERE, before the tooltip-establishing
    // hover just below — that hover is the "enter" this check is actually about. Opening it at
    // the stability nudge instead (the original placement) finds drawHi's same-key early-return
    // already taken (already drawn, not leaving) and records zero adds, making "exactly one add"
    // fail on every key — see transient_log.mjs / assertRemountStable.
    const noPulseCursor = await logCursor(page, key);

    let tip = null;
    for (let a = 0; a < 8; a++) {
      tip = await dispatchAt(key, hoverPt.x, hoverPt.y, "pointermove");
      if (tipHit(tip)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!tipHit(tip)) throw new Error(`${key}: tooltip ${JSON.stringify(tip)}`);
    // Open (edge-only, no fill shape) kinds are line-geometry layers (polyline/segments); every
    // other element-kind layer (circles/rects/polygons/grid) is closed (fill + edge).
    const closedHover = layer.kind !== "polyline" && layer.kind !== "segments";
    assertHoverRecipe(tip.hi, key, closedHover, wantDark);
    assertNoAlertRed(m.kids, `${key}/sel`);
    assertNoTeal(m.kids, `${key}/sel`);

    // The stability nudge: real geometry never misses here (scatter's smallest marker draws at
    // r=16 image px + geometry.ts's 4px HIT_TOL vs. this 1-CSS-px nudge, ~2 image px at this
    // notebook's px_per_unit — confirmed live against a real WGLMakie kernel), so drawHi's
    // same-key early-return means this should add nothing further to the log. If it ever does
    // (a genuine remount, or a miss followed by a re-hover), the read below now sees it instead
    // of a snapshot silently sampling past it.
    await page.evaluate(([k, ix, iy]) => {
      const span = document.querySelector(`#coords_${k}`);
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const b = host.querySelector("img, canvas").getBoundingClientRect();
      const outW = sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
      const s = b.width / outW;
      const o = {
        bubbles: true, composed: true, cancelable: true,
        clientX: b.left + ix * s, clientY: b.top + iy * s,
        pointerId: 1, pointerType: "mouse", isPrimary: true,
      };
      const surface = sr.querySelector(".surface");
      surface.dispatchEvent(new PointerEvent("pointermove", o));
      surface.dispatchEvent(new PointerEvent("pointermove", { ...o, clientX: o.clientX + 1, clientY: o.clientY + 1 }));
    }, [key, hoverPt.x, hoverPt.y]);
    assertRemountStable(await logSince(page, key, noPulseCursor), key);
    passed.push(`${key}/no-pulse`);
    if (spec.circle) {
      const hp = hitPoint(layer, hoverIndex);
      for (const shape of [tip.hi.fill, tip.hi.edge].filter(Boolean)) {
        assertCircleR(shape.r, hp.r, `${key}/hover-${shape.layer}`);
        if (Math.abs(Number(shape.cx) - hp.x) > 0.6 || Math.abs(Number(shape.cy) - hp.y) > 0.6) {
          throw new Error(`${key}: hover not centered (${shape.layer})`);
        }
      }
    }
    if (spec.selected && tip.sel < 1) throw new Error(`${key}: g.sel gone during hover`);
    passed.push(`${key}/tooltip`);
    passed.push(`${key}/hover`);

    // #99 round 2: read the durable log instead of an instant DOM snapshot right after
    // dispatching the leave (see transient_log.mjs / assertLeaveFade's header comment for why —
    // the earlier round-1 fix of this PR added a pre/post snapshot pair here, which is now
    // superseded: the log records everything that snapshot pair could show and more). pollLog
    // waits, bounded, for a removal (or a hostRemount) to actually land before assertLeaveFade
    // decides, rather than reading whatever DOM state happens to exist right after dispatch.
    const fadeCursor = await logCursor(page, key);
    await page.evaluate((k) => {
      const span = document.querySelector(`#coords_${k}`);
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      sr.querySelector(".surface").dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    }, key);
    const fadeEntries = await pollLog(page, key, fadeCursor, (es) => (
      es.some((e) => e.group === "hi" && e.type === "remove") || es.some((e) => e.type === "hostRemount")
    ));
    assertLeaveFade(fadeEntries, key);
    passed.push(`${key}/remount-fade`);
    let afterLeave = await inspect(key);
    for (let a = 0; a < 8 && afterLeave.hi !== 0; a++) {
      await new Promise((r) => setTimeout(r, 25));
      afterLeave = await inspect(key);
    }
    if (afterLeave.hi !== 0) throw new Error(`${key}: g.hi lingered ${afterLeave.hi}`);
    if (spec.selected && afterLeave.sel < 1) throw new Error(`${key}: g.sel dropped on unhover`);
    if (spec.selected) passed.push(`${key}/selected-survives-unhover`);

    // A legend entry's linked highlight (HitLayer.links) draws the SELECTED recipe for every
    // element of the target layer(s) into g.link — distinct from g.sel/g.hi. Generic: skipped
    // for every spec except the one(s) that carry a "links" meta key. Runs BEFORE the click
    // below: a legend click pins its linked series into g.sel (#103) and drawLink deliberately
    // skips anything already pinned, so hovering the clicked entry afterwards would correctly
    // draw nothing — these assertions need a pristine selection to mean anything.
    if (spec.links) {
      // g.link exists in ALL THREE sibling svgs (mount.ts's `linkGroup` — fill_/edge_/plain_,
      // same as g.sel/g.hi), and `drawLink` fans a SELECTED-recipe element into whichever
      // group(s) each hit's geometry calls for (closed -> fill+edge pair, open -> plain-only
      // ring) — mirror `inspect()`'s existing `kidsOf` fan-out (tagged `layer: "fill"|"edge"|
      // "plain"`) instead of reading a single `g.link` (which would only ever see svg.masque-
      // fill's group, in DOM order first, and be empty for any ring-only case).
      const linkInspect = (k) => page.evaluate((kk) => {
        const span = document.querySelector(`#coords_${kk}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        const svgFill = sr.querySelector("svg.masque-fill"), svgEdge = sr.querySelector("svg.masque-edge"), svgPlain = sr.querySelector("svg.masque-plain");
        const kidsOf = (svg, layerName) => [...(svg?.querySelector("g.link")?.children ?? [])].map((el) => {
          if (el.tagName.toLowerCase() === "g") {
            return {
              layer: layerName, kind: "ring",
              lines: [...el.querySelectorAll("line")].map((ln) => {
                const cs = getComputedStyle(ln);
                return {
                  className: ln.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
                  width: ln.getAttribute("stroke-width"), opacity: ln.getAttribute("stroke-opacity"),
                  x1: ln.getAttribute("x1"), y1: ln.getAttribute("y1"),
                  x2: ln.getAttribute("x2"), y2: ln.getAttribute("y2"),
                };
              }),
            };
          }
          const cs = getComputedStyle(el);
          return {
            layer: layerName, kind: "closed", tag: el.tagName.toLowerCase(),
            className: el.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
            width: el.getAttribute("stroke-width"),
            blend: layerName === "plain" ? null : getComputedStyle(svg).mixBlendMode,
            r: el.getAttribute("r"), cx: el.getAttribute("cx"), cy: el.getAttribute("cy"),
          };
        });
        const kFill = kidsOf(svgFill, "fill"), kEdge = kidsOf(svgEdge, "edge"), kPlain = kidsOf(svgPlain, "plain");
        const kids = [...kFill, ...kEdge, ...kPlain];
        // Element count: a closed target draws fill+edge PAIRS (count once via fill), an open
        // target draws a single plain ring per element — same convention as layerElementCount.
        const count = kFill.filter((x) => x.kind === "closed").length + kPlain.filter((x) => x.kind === "ring").length;
        const sel = (svgFill?.querySelector("g.sel")?.children.length ?? 0)
          + (svgEdge?.querySelector("g.sel")?.children.length ?? 0)
          + (svgPlain?.querySelector("g.sel")?.children.length ?? 0);
        const firstPopulated = [svgFill, svgEdge, svgPlain]
          .map((svg) => svg?.querySelector("g.link"))
          .find((g) => g && g.children.length > 0);
        const leaving = firstPopulated ? firstPopulated.firstElementChild.classList.contains("masque-leave") : null;
        return { count, kids, sel, leaving };
      }, k);

      for (const c of spec.links.cases) {
        const targetIds = (layer.links && layer.links[c.index]) || [];
        if (!targetIds.length) throw new Error(`${key}/links[${c.index}]: legend entry "${c.label}" has no links`);
        const hp = hitPoint(layer, c.index);
        // Geometry: the first linked element must sit ON the plotted mark, not beside it.
        const tl0 = layers.find((l) => l.id === targetIds[0]);
        if (!tl0) throw new Error(`${key}/links[${c.index}]: target layer ${targetIds[0]} missing from manifest`);
        const hp0 = hitPoint(tl0, 0);

        // Visibility (screenshot-based, closed/circles targets only): DOM shape alone can't
        // catch a z-order or blend surprise that leaves the nodes present but invisible — same
        // method as the TINT_CHECK_KEYS block above (`color-dodge` against the near-black fill
        // source can only raise luminance). Sampled BEFORE this case's hover dispatch below.
        let lumBefore = null;
        if (tl0.kind === "circles") {
          // The `tintColor` fallback must come from the TARGET layer's own spec, not this
          // legend widget's `spec` (#98) — a legend spec's `tintColor` (if it ever gains one)
          // describes the legend row's own baked colour, not the plot layer the row links to.
          // `layerId` isn't a global key, though: it's kind-based and repeats across UNRELATED
          // widgets (heatmap/image both use "cells"; the legend figure's embedded `scatter!`
          // gets auto-id "scatter", same as the entirely separate standalone `scatter` widget,
          // which is a different Figure with a different baked colour: :gray there vs :orange
          // here). A bare `meta.find(m => m.layerId === tl0.id)` would silently borrow that
          // unrelated widget's spec. `meta.find((m) => m.key === key)` is already unique per
          // widget (`key` is `spec.key`), so scoping to `m.key === key` reduces the lookup to
          // "is `spec` itself the target's spec" — today it never is, because no `meta` entry
          // describes a layer embedded inside ANOTHER widget's figure (the legend's linked
          // "scatter"/"lines" layers have no entry of their own). That leaves `tl0.colors` as
          // the only baseline source until the schema grows a per-target entry; guard it the
          // same way the TINT_CHECK_KEYS block above does (:586-594) so a future non-string
          // `colors` (e.g. a categorical palette) fails loudly instead of `stableClipShot`
          // falling back to its "two reads agree" loop and `assertRawColorMatch` early-returning
          // on a null expectation — a silent, permanent pass rather than a check.
          const targetSpec = meta.find((m) => m.key === key && m.layerId === tl0.id);
          const expectColor = expectedColorFor(tl0.colors, targetSpec?.tintColor);
          const baselineFrom = typeof tl0.colors === "string"
            ? `target layer "${tl0.id}" colors=${JSON.stringify(tl0.colors)}`
            : targetSpec
              ? `spec "${targetSpec.key}" tintColor`
              : `NO baseline source (no meta entry for key "${key}" layerId "${tl0.id}")`;
          const expectLum = rawColorLuminance(expectColor);
          if (expectLum === null) {
            throw new Error(
              `${key}/links[${c.index}]/tint-applied: no expectation to check against ` +
              `(target layer "${tl0.id}" colors=${JSON.stringify(tl0.colors)}, baseline: ${baselineFrom}) — ` +
              `give the target layer a resolvable \`colors\` or a matching \`meta\` entry with \`tintColor\``,
            );
          }
          lumBefore = meanLuminance(PNG.sync.read(
            await stableClipShot(key, hp0.x, hp0.y, { expectLum }),
          ));
          assertRawColorMatch(lumBefore, expectColor, `${key}/links[${c.index}]/tint-applied (baseline: ${baselineFrom})`);
        }

        const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
        let t = null;
        for (let a = 0; a < 8; a++) {
          t = await dispatchAt(key, hp.x, hp.y, "pointermove");
          if (t?.show && norm(t.text).includes(norm(c.label))) break;
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!t?.show || !norm(t.text).includes(norm(c.label))) {
          throw new Error(`${key}/links[${c.index}]: tooltip ${JSON.stringify(t)} (want "${c.label}")`);
        }
        assertHoverRecipe(t.hi, `${key}/links[${c.index}]/legend-row-hover`);

        const li = await linkInspect(key);
        let expected = 0;
        for (const tid of targetIds) {
          const tl = layers.find((l) => l.id === tid);
          if (!tl) throw new Error(`${key}/links[${c.index}]: target layer ${tid} missing from manifest`);
          // layerElementCount's :grid case (ncols*nrows) is untested here — no fixture links a
          // legend entry to a :grid target today, and the DOM-side count this feeds (`li.count`,
          // from linkInspect's fill/edge/ring fan-out) has no defined per-cell convention for a
          // grid hit. If a future fixture adds one, verify that convention before trusting this.
          expected += layerElementCount(tl);
        }
        if (li.count !== expected) {
          throw new Error(`${key}/links[${c.index}]: g.link has ${li.count} elements, want ${expected} (targets ${JSON.stringify(targetIds)})`);
        }
        if (li.sel !== afterLeave.sel) throw new Error(`${key}/links[${c.index}]: g.sel changed during legend hover (${li.sel})`);

        if (tl0.kind === "circles") {
          const wash = {
            fill: li.kids.find((kk) => kk.layer === "fill" && kk.kind === "closed"),
            edge: li.kids.find((kk) => kk.layer === "edge" && kk.kind === "closed"),
            plain: li.kids.find((kk) => kk.layer === "plain" && kk.kind === "closed"),
          };
          assertWash(wash, `${key}/links[${c.index}]/wash`, wantDark);
          const circleKid = wash.fill || wash.edge;
          if (!circleKid) throw new Error(`${key}/links[${c.index}]: no circle in g.link`);
          if (Math.abs(Number(circleKid.cx) - hp0.x) > 0.6 || Math.abs(Number(circleKid.cy) - hp0.y) > 0.6) {
            throw new Error(`${key}/links[${c.index}]: link circle off-mark ${JSON.stringify(circleKid)} vs ${JSON.stringify(hp0)}`);
          }
          assertCircleR(circleKid.r, hp0.r, `${key}/links[${c.index}]/circle-r`);
          await new Promise((r) => setTimeout(r, 200)); // let the 80-120ms enter fade settle
          const lumAfter = meanLuminance(PNG.sync.read(await stableClipShot(key, hp0.x, hp0.y)));
          assertTintApplied(lumBefore, lumAfter, `${key}/links[${c.index}]/tint-applied`);
          passed.push(`${key}/links[${c.index}]/tint-applied`);
        } else if (tl0.kind === "polyline" || tl0.kind === "segments") {
          const ringKid = li.kids.find((kk) => kk.layer === "plain" && kk.kind === "ring");
          if (!ringKid) throw new Error(`${key}/links[${c.index}]: no ring in g.link`);
          assertRing(ringKid, `${key}/links[${c.index}]/ring`);
          const ln = ringKid.lines[0];
          if (Math.abs(Number(ln.x1) - hp0.x1) > 1.2 || Math.abs(Number(ln.y1) - hp0.y1) > 1.2) {
            throw new Error(`${key}/links[${c.index}]: link ring off-mark ${JSON.stringify(ln)} vs ${JSON.stringify(hp0)}`);
          }
        }
        passed.push(`${key}/links[${c.index}]`);
      }

      // Moving off the last-hovered legend entry fades g.link (not an instant clear), same
      // contract as g.hi. #99 round 2: reads the durable log (group: "link") the same way the
      // g.hi remount-fade check above does, via the shared assertLeaveFade(entries, where,
      // group) — see transient_log.mjs / visual_assert.mjs.
      const linkFadeCursor = await logCursor(page, key);
      await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        sr.querySelector(".surface").dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      }, key);
      const linkFadeEntries = await pollLog(page, key, linkFadeCursor, (es) => (
        es.some((e) => e.group === "link" && e.type === "remove") || es.some((e) => e.type === "hostRemount")
      ));
      assertLeaveFade(linkFadeEntries, `${key}/links`, "link");
      let afterLinkLeave = await linkInspect(key);
      for (let a = 0; a < 8 && afterLinkLeave.count !== 0; a++) {
        await new Promise((r) => setTimeout(r, 25));
        afterLinkLeave = await linkInspect(key);
      }
      if (afterLinkLeave.count !== 0) throw new Error(`${key}/links: g.link lingered ${afterLinkLeave.count}`);
      passed.push(`${key}/links-fade`);
    }

    let clickIdx = spec.clickIndex;
    const before = await textOf(`#out_${key}`);
    const already = new RegExp(`:${spec.layerId},\\s*${clickIdx}\\b`);
    // Collision-avoidance (#114): re-running this driver against a warm Pluto session (no
    // restart) can start a spec with its bond ALREADY holding the index we're about to click —
    // clicking the same index again produces byte-identical `repr(ev)` text, so `waitChange`
    // below would hang waiting for a change that never comes. The fallback must be TOTAL: derive
    // an in-range alternative from the layer's OWN element count, never assume `spec.selectedIndex`
    // exists (it can be `null`/`undefined` for a spec with nothing baked) or that `clickIdx + 1`
    // stays in range (a legend's `selectedIndex === clickIndex` case overran a 3-entry layer this
    // way and produced the reported NaN `clientX`). `spec.layerKind === "grid"` shares this same
    // fallback, so it gets the same fix — though its own `index[=:]` disjunct below is dead under
    // the current payload contract (a :grid bond's `repr` names fields `i`/`j`, never `index`;
    // `src/render.jl`'s `_computed_payload`). `heatmap`/`image` are still covered, but via the
    // generic `already` regex on `:cells,\s*idx` above, not via this disjunct. Left in place
    // rather than removed, since it's harmless and a future payload shape could reintroduce a
    // field this would catch.
    let skipChangeWait = false;
    if (already.test(before) || (spec.layerKind === "grid" && new RegExp(`index[=:]\\s*${clickIdx}\\b`).test(before))) {
      // layerElementCount throws for a kind with no indexable elements at all (e.g. a future
      // `:axis` spec, #113) — that isn't a driver bug, it's exactly the "nothing to click"
      // case below, so treat it as count 0 rather than let its own generic message mask the
      // actionable one this block is required to give.
      let count = 0;
      try {
        count = layerElementCount(layer);
      } catch { /* kind has no indexable elements — count stays 0, handled below */ }
      let alt = null;
      for (let i = 0; i < count; i++) {
        if (i !== clickIdx) { alt = i; break; }
      }
      if (alt !== null) {
        clickIdx = alt;
      } else if (count === 1) {
        // Exactly one element and the bond already holds it (warm-session carryover): the click
        // is still legitimate, it just can't be proven via a text diff on #out_${key} (same index
        // in, same index out) — skip the change-wait below. The post-click index/layer/payload
        // assertions read that same stale text, so they can't tell "landed correctly" from
        // "missed entirely" here and are NOT pushed to `passed` on this path (see the comment
        // above the change-wait); only click-echo (further down) reads live client-side state
        // with no kernel round-trip, so it is the one check this path actually carries.
        skipChangeWait = true;
      } else {
        throw new Error(
          `${key}-click: layer "${spec.layerId}" (${layer.kind}, ${count} element${count === 1 ? "" : "s"}) has no ` +
          `alternative index to click — index ${clickIdx} is already bound from a previous run and there is no ` +
          `other in-range element on this layer to disambiguate a fresh click (warm-session collision fallback, #114)`,
        );
      }
    }
    if (key === "scatter") scatterClickIdx = clickIdx;
    const clickPt = hitPoint(layer, clickIdx);
    let after = before;
    if (skipChangeWait) {
      // `after` is read with no settle and no retry: the bond round-trips browser -> kernel ->
      // reactive re-render, `dispatchAt` returns as soon as the synchronous DOM dispatch is done
      // (long before that round-trip lands), and even if it DID land in time the text would be
      // byte-identical to `before` by this branch's own premise (same index in, same index out).
      // So `after` here is not evidence the click landed correctly — it is effectively always a
      // copy of `before`. The checks below still run (cheap, harmless, and would catch a
      // genuinely malformed `before`), but they are NOT pushed to `passed`: they cannot
      // distinguish "the click hit this element" from "the click missed entirely" when the
      // bond's text can't move. Only click-echo (below) reads live, client-side shadow-DOM state
      // with no kernel round-trip, so it is the one signal this branch can actually push. One
      // dispatch (no retry loop) is deliberate, not an oversight: the retry below exists to
      // out-wait `waitChange`'s polling for a text change that can happen on any of a few ticks;
      // there is nothing to retry toward here; a genuine dispatch failure would still throw from
      // `dispatchAt` itself.
      await dispatchAt(key, clickPt.x, clickPt.y, "click");
      after = await textOf(`#out_${key}`);
    } else {
      for (let a = 0; a < 3; a++) {
        await dispatchAt(key, clickPt.x, clickPt.y, "click");
        try {
          after = await waitChange(`#out_${key}`, before, `${key}-click`);
          break;
        } catch (e) {
          if (a === 2) throw e;
        }
      }
    }
    const idRe = new RegExp(`:${spec.layerId}|${spec.layerId}`, "i");
    if (!idRe.test(after)) throw new Error(`${key}-click: no layer in ${JSON.stringify(after).slice(0, 220)}`);
    if (spec.layerKind !== "grid") {
      if (!new RegExp(`:${spec.layerId},\\s*${clickIdx}\\b`).test(after)) {
        throw new Error(`${key}-click: expected index ${clickIdx}: ${after.slice(0, 220)}`);
      }
    }
    if (!skipChangeWait) passed.push(`${key}/click-bind`);

    // Click-echo (#103/#107): the overlay pins the picked hit(s) in g.sel itself, with no bond
    // fed back through Julia — so this also proves the echo SURVIVES the reactive round-trip
    // `waitChange` just awaited (a widget remount would reset it to the baked `selected=` alone,
    // which is the whole reason the five-cell `selected=` workaround existed).
    const hasLinks = !!(layer.links && layer.links.length);
    const echo = await inspect(key);
    if (hasLinks) {
      // A legend entry pins its linked series, never the swatch itself — the swatch keeps
      // whatever hover chrome it earned, so only g.sel's growth is asserted here.
      const targetIds = layer.links[clickIdx] || [];
      if (!targetIds.length) {
        if (echo.sel !== afterLeave.sel) {
          throw new Error(`${key}/click-echo: legend entry ${clickIdx} has no links but g.sel changed ${afterLeave.sel} -> ${echo.sel}`);
        }
      } else if (echo.sel <= afterLeave.sel) {
        throw new Error(`${key}/click-echo: g.sel ${afterLeave.sel} -> ${echo.sel} after clicking legend entry ${clickIdx}`);
      }
      passed.push(`${key}/click-echo`);
    } else if (SELF_PIN_KINDS.has(layer.kind)) {
      // Hydration model: a click REPLACES the whole selection, so g.sel after the click holds
      // exactly the clicked hit's own recipe (2 shapes — fill+edge — for a closed kind, 1 ring
      // for an open one), independent of whatever `selected=` hydration was there before — a
      // spec that bakes a `selected=` index no longer "grows" g.sel on click, it's simply reset.
      if (echo.hi !== 0) throw new Error(`${key}/click-echo: hover chrome drawn over the echo (g.hi=${echo.hi})`);
      const expectSel = closedHover ? 2 : 1;
      if (echo.sel !== expectSel) {
        throw new Error(`${key}/click-echo: g.sel=${echo.sel}, expected ${expectSel} for one echoed ${closedHover ? "closed" : "open"} hit (was ${afterLeave.sel} before the click)`);
      }
      passed.push(`${key}/click-echo`);
    } else if (echo.sel !== afterLeave.sel) {
      throw new Error(`${key}/click-echo: unpinned ${layer.kind} click changed g.sel ${afterLeave.sel} -> ${echo.sel}`);
    }

    // `InteractionEvent` has no custom `show`, so `repr(ev)` is Julia's default positional
    // struct print: `InteractionEvent(:legend, 0, …)` — the ":<layerId>," prefix pins which
    // layer actually won the hit-test. Belt-and-suspenders on top of the index regex above:
    // this fails loud specifically on "resolved to the wrong layer", not just "wrong index".
    // On `skipChangeWait`, `after` is stale (see above) so this re-check is vacuous for THIS
    // click — but the real regression test for `legend`-before-`:grid` layer precedence already
    // ran once per spec, unconditionally, before any click (`legend-precedence-order`/
    // `legend-precedence-pixel-contested`, pushed above using `spec.selectedIndex`), so the
    // structural property this guards is still covered even when this echo of it isn't.
    if (spec.overlapsGrid && new RegExp(`:${spec.overlapsGrid},\\s*\\d+\\b`).test(after)) {
      throw new Error(`${key}-click: bond resolved to grid layer "${spec.overlapsGrid}", not legend: ${after.slice(0, 220)}`);
    }
    console.error(`OK  ${key} — ${after.slice(0, 110)}`);

    if (spec.links) {
      // On a real click-wait, click-bind above already confirmed index==clickIdx; this confirms
      // the bond's payload actually carries label/targets (not just the index). On
      // `skipChangeWait`, both `after` and these checks are stale/tautological for the same
      // reason click-bind's are (see the comment above the change-wait) — pushed only when the
      // change-wait actually ran, matching click-bind's own gating.
      const clickTargets = (layer.links && layer.links[clickIdx]) || [];
      if (!clickTargets.length || !clickTargets.every((tid) => new RegExp(tid, "i").test(after))) {
        throw new Error(`${key}/links: click payload missing targets ${JSON.stringify(clickTargets)}: ${after.slice(0, 220)}`);
      }
      // spec.tip is the label for spec.clickIndex specifically; the collision fallback above can
      // move the actual click to a different index (#114) — look up the label for the index
      // ACTUALLY clicked among spec.links.cases instead of assuming clickIdx === spec.clickIndex,
      // and fail loud (not silently skip) if that index's label isn't known.
      const expectTip = clickIdx === spec.clickIndex
        ? spec.tip
        : spec.links.cases.find((c) => c.index === clickIdx)?.label;
      if (expectTip == null) {
        throw new Error(`${key}/links: clickIndex collided and landed on index ${clickIdx}, with no known label to assert (warm-session fallback, #114)`);
      }
      if (!new RegExp(expectTip, "i").test(after)) {
        throw new Error(`${key}/links: click payload missing label "${expectTip}": ${after.slice(0, 220)}`);
      }
      if (!skipChangeWait) passed.push(`${key}/links-click-payload`);
    }
  }

  // Hover-on-selected is a no-op: hovering scatter's CURRENTLY-selected element must draw NO
  // highlight at all (fill and edge both empty) — the mark keeps its opaque selected wash
  // instead, since a 1.5px hover stroke over the 2px selected stroke would read as *weaker*, not
  // stronger. The tooltip and `@bind` still work for that hit; only the highlight is skipped.
  // Under the hydration model, scatter's earlier click-echo (above) REPLACED its baked
  // `selected=` (spec.selectedIndex, "beta") with the clicked index — so this must target
  // `scatterClickIdx`, the element that IS selected now, not the no-longer-selected bake.
  {
    const spec = meta.find((s) => s.key === "scatter");
    const layers = await layersOf("scatter");
    const layer = findLayer(layers, spec);
    const idx = scatterClickIdx ?? spec.clickIndex;
    // hoverTip is the label for spec.clickIndex (scatter's hoverIndex/clickIndex both being 0 by
    // convention); tip is the label for spec.selectedIndex. A warm-session re-run's collision
    // fallback (#114) routinely lands the actual click on selectedIndex (the one guaranteed to
    // differ from a just-clicked clickIndex) — derive the expected tooltip from WHICHEVER of
    // those two known indices idx actually landed on, rather than assuming clickIndex. Rather
    // than silently degrading the check to "a tooltip showed, any tooltip", fail loud for any
    // other index — this driver has no known tip text to assert there.
    const expectTip = idx === spec.clickIndex ? spec.hoverTip
      : idx === spec.selectedIndex ? spec.tip
      : null;
    if (expectTip == null) {
      throw new Error(`scatter/hover-on-selected: clickIndex collided and landed on index ${idx} — no known tooltip text to assert`);
    }
    const tipOk = (t) => !!(t && t.show && new RegExp(expectTip, "i").test(t.text));
    const selPt = hitPoint(layer, idx);
    let noop = null;
    for (let a = 0; a < 8; a++) {
      noop = await dispatchAt("scatter", selPt.x, selPt.y, "pointermove");
      if (tipOk(noop)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!tipOk(noop)) throw new Error(`scatter/hover-on-selected: tooltip ${JSON.stringify(noop)}`);
    assertNoHighlight(noop.hi, "scatter/hover-on-selected");
    if (noop.sel < 1) throw new Error("scatter/hover-on-selected: g.sel missing while hovering the selected mark");
    passed.push("scatter/hover-on-selected-noop");
    await page.evaluate(() => {
      const span = document.querySelector("#coords_scatter");
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      sr.querySelector(".surface").dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    });
  }

  const lightSpec = meta.find((s) => s.key === "scatter");
  const darkSpec = meta.find((s) => s.key === "scatter_dark");
  if (!lightSpec || !darkSpec) throw new Error("no scatter/scatter_dark spec for tooltip theme");
  {
    const cssKey = lightSpec.key;
    const computedFor = async (which) => {
      const spec = which === "dark" ? darkSpec : lightSpec;
      const layers = await layersOf(spec.key);
      const layer = findLayer(layers, spec);
      const pt = hitPoint(layer, spec.selectedIndex);
      await dispatchAt(spec.key, pt.x, pt.y, "pointermove");
      return page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        const t = sr.querySelector(".masque-tip");
        const cs = getComputedStyle(t);
        return { bg: cs.backgroundColor, color: cs.color, show: t?.classList.contains("show") };
      }, spec.key);
    };
    await assertTooltipColorScheme(page, {
      css: () => page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        return sr.querySelector("style")?.textContent || "";
      }, cssKey),
      computedFor,
    });
    passed.push("tooltip-theme-follows-figure-bg");
  }

  if (unexpected.length) throw new Error(`page errors: ${unexpected.join(" | ")}`);
  passed.push("no-console-errors");
  console.log(`KIND SWEEP OK — ${backend}: ${passed.join(", ")}`);
} catch (e) {
  failed = e;
  // Mirrors the captureFailure shape #67 added to bind_click.mjs: screenshot + DOM dump +
  // console log, so a CI failure ships enough evidence to diagnose without re-running locally.
  if (artifactDir && page) {
    try {
      await page.screenshot({ path: join(artifactDir, `kind_sweep-${backend}-failure.png`), fullPage: true });
      const dump = await page.evaluate(() => ({
        title: document.title,
        url: location.href,
        cells: [...document.querySelectorAll("pluto-cell")].map((c) => ({ id: c.id, classes: c.className })),
        hosts: document.querySelectorAll(".ip-host").length,
      }));
      writeFileSync(join(artifactDir, `kind_sweep-${backend}-dom.json`), JSON.stringify(dump, null, 2));
      writeFileSync(join(artifactDir, `kind_sweep-${backend}-console.log`), consoleLog.join("\n"));
      console.error(`artifact: wrote kind_sweep-${backend}-{failure.png,dom.json,console.log} to ${artifactDir}`);
    } catch (e2) {
      console.error("artifact capture failed:", e2.message);
    }
  }
} finally {
  await browser.close();
}
if (failed) {
  // #99: WGLMakie/Bonito canvas churn ("removing WGL context...") is the leading suspect for
  // this job's flake (5/5 historical failing-run artifacts showed it; see the PR body) — ties
  // any future failure to that evidence directly, without a separate artifact download.
  const churnNote = wglChurnCount
    ? ` [wgl churn: ${wglChurnCount}x, last ${Date.now() - lastWglChurnAt}ms before this failure]`
    : " [wgl churn: none observed this run]";
  console.error(`KIND SWEEP FAIL (${backend}, after ${passed.join(", ")}):`, failed.message + churnNote);
  process.exit(1);
}
