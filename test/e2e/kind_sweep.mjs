// Agent kind-sweep live-verify (LOCAL — not CI). Drives docs/dev/live-interaction-checklist.md
// — interaction AND visual — across every interactable kind on one backend.
// A 2-plot kitchen-sink is not enough. polish_verify.mjs is the required visual-chrome
// sibling (fade + prefers-color-scheme). This file asserts fade / no-pulse per kind
// and prefers-color-scheme once (scatter).
//
//   node kind_sweep.mjs <base-url> <notebook-abs-path> <cairo|webgl> [artifact-dir]
import { chromium } from "playwright";
import { shutdownOpenSession } from "./fresh_session.mjs";
import { surfacePoint } from "./kind_sweep_point.mjs";
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

// A layer id as an event prints it: a recipe part's `head.part` shows as
// `head, part = (:part,)`, regex-escaped so it can sit inside a `new RegExp`.
const jlLayer = (id) => {
  const [h, ...p] = id.split(".");
  const s = p.length === 0 ? h : `${h}, part = (${p.map((x) => ":" + x).join(", ")}${p.length === 1 ? "," : ""})`;
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
const jlLayerText = (id) => jlLayer(id).replace(/\\(.)/g, "$1");

// Mirrors selection.ts's selectionFor: these kinds (plus :grid) pin the clicked hit itself; a
// legend layer (has `links`) pins its linked target(s) instead.
const SELF_PIN_KINDS = new Set(["circles", "rects", "polygons", "segments", "polyline", "lines", "grid", "surface"]);

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
  if (l.kind === "lines") return g.length;
  if (l.kind === "polygons") return g.length;
  if (l.kind === "grid") return g.ncols * g.nrows;
  if (l.kind === "surface") return g.ni * g.nj;
  throw new Error(`layerElementCount: unhandled kind ${l.kind}`);
}

// A whole-line highlight is one SVG path through every finite vertex, not one chord.
// Tokenize numeric literals so `"10 20"` is not a substring of `"110 20"`.
// null when `d` covers every finite vertex; otherwise a reason string.
function pathCoverError(d, verts) {
  if (!d || !verts) return "whole-line highlight has no path";
  const nums = (d.match(/-?(?:NaN|Infinity|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi) || []).map(Number);
  let finite = 0;
  for (let i = 0; i < verts.length; i += 2) {
    const x = verts[i], y = verts[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    finite++;
    let found = false;
    for (let j = 0; j + 1 < nums.length; j++) {
      if (nums[j] === x && nums[j + 1] === y) { found = true; break; }
    }
    if (!found) return `path missing vertex ${x},${y} in ${d}`;
  }
  if (finite < 2) return "path has fewer than 2 finite vertices";
  return null;
}

function assertPathCovers(d, verts, where) {
  const err = pathCoverError(d, verts);
  if (err) throw new Error(`${where}: ${err}`);
}

// Legend `links` specs: exact layer id (every element) or `id:k` (Julia 1-based element pin).
// An exact layer id wins, so a real layer named `foo:1` is not parsed as an element pin.
function resolveLinkSpec(layers, spec) {
  const exact = layers.find((l) => l.id === spec);
  if (exact) return { layer: exact, index: null };
  const m = /^(.*):(\d+)$/.exec(spec);
  if (!m) return null;
  const layer = layers.find((l) => l.id === m[1]);
  if (!layer) return null;
  return { layer, index: Number(m[2]) - 1 };
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
  if (k === "lines") {
    const a = g[index];
    for (let i = 0; i < a.length / 2 - 1; i++) {
      const x0 = a[2 * i], y0 = a[2 * i + 1], x1 = a[2 * i + 2], y1 = a[2 * i + 3];
      if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, x1: x0, y1: y0, x2: x1, y2: y1 };
    }
    throw new Error(`lines path ${index} has no finite segment`);
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
  if (k === "surface") return surfacePoint(g, index);
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

function projectAxisJs(t, x, y) {
  const [vx, vy, vw, vh] = t.viewport;
  const unmap = (lims, scale, v) => {
    if (scale === "log10" || scale === "log") {
      const a = Math.log10(lims[0]), b = Math.log10(lims[1]);
      return (Math.log10(v) - a) / (b - a);
    }
    return (v - lims[0]) / (lims[1] - lims[0]);
  };
  let fx = unmap(t.xlims, t.xscale, x);
  let fy = unmap(t.ylims, t.yscale, y);
  if (t.xreversed) fx = 1 - fx;
  if (t.yreversed) fy = 1 - fy;
  return { x: vx + fx * vw, y: vy + (1 - fy) * vh };
}

const browser = await chromium.launch({
  headless: true,
  // kind_sweep_webgl.jl mounts one live canvas (= one WebGL context) per widget — Chromium's
  // default active-context cap is 16, and this notebook is at 22 (series, series-legend, legend-template, slice lines, slice density).
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

  await shutdownOpenSession(base, notebook);
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

  // A spec's `byBackend[backend]` entries replace its own on this backend.
  const meta = (await page.evaluate(() => JSON.parse(document.querySelector("#kind_meta").textContent)))
    .map(({ byBackend, ...s }) => ({ ...s, ...(byBackend?.[backend] ?? {}) }));
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

  // The `@bind` value is one envelope per field (#335): `bond` is the field the spec is about
  // (its `field`, else its `layerId`), `bondAll` the whole `host.value`.
  const fieldOf = new Map(meta.map((s) => [s.key, s.field ?? s.layerId]));
  const inspect = async (key) => {
    const r = await inspectRaw(key);
    const f = fieldOf.get(key);
    r.bond = f === "*" ? r.bondAll : (r.bondAll?.[f] ?? null);
    return r;
  };
  const inspectRaw = (key) => page.evaluate((k) => {
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
    const kidsOf = (svg, layerName) => [...(svg?.querySelectorAll("g.masque-photo > g.sel") ?? [])].flatMap((g) => [...g.children]).map((el) => {
      if (el.tagName.toLowerCase() === "g") {
        return {
          layer: layerName, kind: "ring",
          lines: [...el.querySelectorAll("line")].map((ln) => {
            const cs = getComputedStyle(ln);
            return {
              className: ln.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
              width: String(parseFloat(cs.strokeWidth)), opacity: (cs.strokeOpacity === "1" ? null : cs.strokeOpacity),
              x1: ln.getAttribute("x1"), y1: ln.getAttribute("y1"),
              x2: ln.getAttribute("x2"), y2: ln.getAttribute("y2"),
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
        layer: layerName, kind: "closed", tag: el.tagName.toLowerCase(),
        className: el.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
        width: String(parseFloat(cs.strokeWidth)),
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
      // A pick on a closed kind is drawn by the fade (a canvas per axis), not in g.sel. It
      // counts as the two shapes (fill and edge) a pick drawn in g.sel has, so a count below
      // means the same for every kind; `picked`/`kept`/`lone` are the fade's own keys.
      sel: count("g.sel") + 2 * fadeOf(sr).picked.length,
      ...fadeOf(sr),
      hi: count("g.hi"),
      // The overlay's own bond value, read before any kernel round-trip.
      bondAll: host.value ?? null,
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

  // A real mouse click at image px (x, y), through Chromium's own input path rather than a
  // synthetic event, so the browser's focus handling runs as it would for a user (#380). The
  // plot is scrolled into view first; the click itself must not scroll the page or draw the
  // keyboard focus ring. Returns the surface's focus state after the click.
  const mouseClickAt = async (key, x, y) => {
    const at = await page.evaluate(([k, ix, iy]) => {
      const span = document.querySelector(`#coords_${k}`);
      const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      host.scrollIntoView({ block: "center" });
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const b = host.querySelector("img, canvas").getBoundingClientRect();
      const s = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
      return { x: b.left + ix * s, y: b.top + iy * s, scrollY: window.scrollY };
    }, [key, x, y]);
    await page.mouse.click(at.x, at.y);
    const after = await page.evaluate((k) => {
      const span = document.querySelector(`#coords_${k}`);
      const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const surface = sr.querySelector(".surface");
      return { scrollY: window.scrollY, focused: sr.activeElement === surface, outline: getComputedStyle(surface).outlineStyle };
    }, key);
    if (after.scrollY !== at.scrollY) throw new Error(`${key}: a mouse click scrolled the page from ${at.scrollY} to ${after.scrollY}`);
    if (!after.focused) throw new Error(`${key}: a mouse click left the figure without keyboard focus, so Escape cannot clear (#380)`);
    if (after.outline !== "none") throw new Error(`${key}: a mouse click drew the keyboard focus outline (${after.outline})`);
    return null;
  };

  const dispatchAt = async (key, x, y, type, mod = {}) => page.evaluate(async ([k, ix, iy, typ, md]) => {
    const span = document.querySelector(`#coords_${k}`);
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    const b = host.querySelector("img, canvas").getBoundingClientRect();
    const outW = sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
    const s = b.width / outW;
    const cx = b.left + ix * s, cy = b.top + iy * s;
    const o = { bubbles: true, composed: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, pointerType: "mouse", isPrimary: true, ...md };
    const surface = sr.querySelector(".surface");
    surface.dispatchEvent(new PointerEvent(typ === "click" ? "pointermove" : typ, o));
    if (typ === "click") {
      surface.dispatchEvent(new PointerEvent("pointerdown", o));
      surface.dispatchEvent(new PointerEvent("pointerup", o));
      surface.dispatchEvent(new MouseEvent("click", o));
    }
    // hover.ts coalesces pointermove onto one animation frame: a move that arrives while a
    // frame is already pending is stored and not applied until that frame. A legend card used
    // to reject that stale frame, because the tip still named the previous entry. With the
    // card suppressed, the stale frame also has a hidden tip, so the sweep would read the
    // previous entry's highlight (webgl kind sweep: series_legend/links[1] saw series 1's path).
    // Flush one frame so the DOM matches this event before we read it.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const tip = sr.querySelector(".masque-tip");
    // Bare shape in g.hi — svg.masque-fill (fill half) + svg.masque-edge (edge half) for the
    // default split-blend recipe, svg.masque-plain for an explicit `hoverstyle` (no wrapper
    // either way). At most one of {fill|edge} vs. plain is populated for a given hit; an open
    // seg or an already-selected mark can leave fill/edge both empty.
    const svgFill = sr.querySelector("svg.masque-fill"), svgEdge = sr.querySelector("svg.masque-edge"), svgPlain = sr.querySelector("svg.masque-plain");
    // Legend, colorbar, and axis rings live in g.masque-fixed, a sibling of the photograph
    // clip. The data g.hi is created first and is empty for those hits.
    const groupWithChild = (svg, sel) => {
      const groups = [...(svg?.querySelectorAll(sel) ?? [])];
      return groups.find((g) => g.firstElementChild) ?? groups[0] ?? null;
    };
    const childCount = (svg, sel) => [...(svg?.querySelectorAll(sel) ?? [])].reduce((n, g) => n + g.children.length, 0);
    const capture = (svg, layerName) => {
      const el = groupWithChild(svg, "g.hi")?.firstElementChild;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        layer: layerName, tag: el.tagName.toLowerCase(), className: el.getAttribute("class"),
        fill: cs.fill, stroke: cs.stroke, fillOpacity: cs.fillOpacity,
        width: String(parseFloat(cs.strokeWidth)), opacity: (cs.strokeOpacity === "1" ? null : cs.strokeOpacity),
        blend: layerName === "plain" ? null : getComputedStyle(svg).mixBlendMode,
        r: el.getAttribute("r"), cx: el.getAttribute("cx"), cy: el.getAttribute("cy"),
        x: el.getAttribute("x"), y: el.getAttribute("y"),
        w: el.getAttribute("width"), h: el.getAttribute("height"),
        x1: el.getAttribute("x1"), y1: el.getAttribute("y1"), x2: el.getAttribute("x2"), y2: el.getAttribute("y2"),
        d: el.getAttribute("d"),
      };
    };
    return {
      show: tip?.classList.contains("show"),
      text: (tip?.innerText || "").replace(/\s+/g, " ").trim(),
      hi: { fill: capture(svgFill, "fill"), edge: capture(svgEdge, "edge"), plain: capture(svgPlain, "plain") },
      sel: childCount(svgFill, "g.sel") + childCount(svgEdge, "g.sel") + childCount(svgPlain, "g.sel") + 2 * fadeOf(sr).picked.length,
      ...fadeOf(sr),
      cross: sr.querySelector(".masque-cross")?.classList.contains("is-on") ?? false,
    };
  }, [key, x, y, type, mod]);

  const textOf = (sel) => page.evaluate((q) => document.querySelector(q)?.innerText ?? "", sel);

  // A small css-px page.screenshot() clip centred on an image-space point — used by the
  // tint-applied check to sample real pixels before/after the hover blend applies (a page
  // screenshot, not a canvas readback, so it works on both Cairo <img> and WGL <canvas>).
  // Default size is small (8) so the box stays inside the mark's interior, off the chrome
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
  // The reverse: after `act`, `sel` still reads `before` once a round trip would have landed.
  const waitSame = async (sel, before, what, ms = 1500) => {
    await new Promise((r) => setTimeout(r, ms));
    const t = await textOf(sel);
    if (t !== before) throw new Error(`${what}: ${sel} changed from ${JSON.stringify(before)} to ${JSON.stringify(t)}`);
    return t;
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

    // Two plots claim the hovered pixel (#301): the one drawn last must sort first, so the
    // generic hover/click checks below prove it answers. The pixel has to sit inside one of the
    // plot underneath's circles, or the pair doesn't overlap and those checks prove nothing.
    if (spec.overlapsLayer) {
      const under = layers.find((l) => l.id === spec.overlapsLayer);
      if (!under) throw new Error(`${key}: no layer "${spec.overlapsLayer}" in manifest`);
      if (!(layers.indexOf(layer) < layers.indexOf(under))) {
        throw new Error(`${key}: layer "${layer.id}" does not sort before "${under.id}"`);
      }
      if (under.kind !== "circles") throw new Error(`${key}: overlapsLayer must be a circles layer, got ${under.kind}`);
      const hp = hitPoint(layer, spec.hoverIndex);
      const contested = Array.from({ length: under.geometry.length / 3 }, (_, i) => hitPoint(under, i))
        .some((c) => Math.hypot(hp.x - c.x, hp.y - c.y) < c.r);
      if (!contested) throw new Error(`${key}: hover pixel ${JSON.stringify(hp)} is not inside any "${under.id}" circle`);
      passed.push(`${key}/overlap-order`);
      passed.push(`${key}/overlap-pixel-contested`);
    }

    // Two elements of one layer claim the hovered pixel (#292, #331, #340): the one drawn on
    // top must come first in the layer's `order`, or, with no `order`, be listed after the one
    // underneath, so the generic hover/click checks below prove it answers.
    if (spec.overlapsElement !== undefined) {
      const order = layer.order;
      const top = spec.hoverIndex, under = spec.overlapsElement;
      if (Array.isArray(order)) {
        const front = order.indexOf(top), behind = order.indexOf(under);
        if (front < 0 || behind < 0 || !(front < behind)) {
          throw new Error(`${key}: order ${JSON.stringify(order)} doesn't put ${top} before ${under}`);
        }
      } else if (!(top > under)) {
        throw new Error(`${key}: no order, and ${top} is not listed after ${under}`);
      }
      const hp = hitPoint(layer, top), b = hitPoint(layer, under);
      const inBox = (r) => {
        const xs = r.filter((_, i) => i % 2 === 0), ys = r.filter((_, i) => i % 2 === 1);
        return Math.min(...xs) < hp.x && hp.x < Math.max(...xs) && Math.min(...ys) < hp.y && hp.y < Math.max(...ys);
      };
      const inside = layer.kind === "circles" ? Math.hypot(hp.x - b.x, hp.y - b.y) < b.r
        : layer.kind === "polygons" ? inBox(b.ring) // the sweep's overlapping shapes are rectangles
        : Math.abs(hp.x - b.x) < b.w / 2 && Math.abs(hp.y - b.y) < b.h / 2;
      if (!inside) {
        throw new Error(`${key}: hover pixel ${JSON.stringify(hp)} is not inside element ${under}'s shape ${JSON.stringify(b)}`);
      }
      passed.push(`${key}/overlap-order`);
      passed.push(`${key}/overlap-pixel-contested`);
    }

    // Several fields at once (#335): a click on a point sets `scatter`, a drag of the threshold
    // sets its own field, both print in the `@bind` value, and a default line beside them shows
    // its tooltip but has no field and takes no click.
    if (spec.mode === "composite") {
      const all0 = await textOf(`#bond_${key}`);
      const ctl = spec.control, start = spec.controlStart;
      const ctlRe = (v) => new RegExp(`${ctl} = ThresholdEvent\\(:${ctl}, value = ${v === null ? "(-?[\\d.e+-]+)" : (Number.isInteger(v) ? v.toFixed(1) : String(v)).replace(".", "\\.") + "\\b"}`);
      if (!/scatter = nothing/.test(all0) || !ctlRe(start).test(all0)) {
        throw new Error(`${key}: mount value ${JSON.stringify(all0)}, want scatter = nothing and ${ctl} at ${start}`);
      }
      const m0 = await inspect(key);
      const keys0 = Object.keys(m0.bondAll ?? {}).sort();
      if (JSON.stringify(keys0) !== JSON.stringify([...spec.fields].sort())) {
        throw new Error(`${key}: host.value keys ${JSON.stringify(keys0)}, want ${JSON.stringify(spec.fields)}`);
      }
      passed.push(`${key}/fields-at-mount`);

      // The default line: tooltip, no click, no field.
      const line = layers.find((l) => l.id === spec.line);
      if (!line) throw new Error(`${key}: no line layer "${spec.line}" in ${layers.map((l) => l.id)}`);
      if (line.events.includes("click") || !line.events.includes("hover")) {
        throw new Error(`${key}: default line events ${JSON.stringify(line.events)}, want hover without click`);
      }
      const lp = hitPoint(line, 0);
      const lineHit = await dispatchAt(key, lp.x, lp.y, "click");
      if (!lineHit.show) throw new Error(`${key}: hovering the default line showed no tooltip ${JSON.stringify(lineHit)}`);
      await new Promise((r) => setTimeout(r, 1500));
      if ((await textOf(`#bond_${key}`)) !== all0) throw new Error(`${key}: a click on the default line changed the value`);
      if (lineHit.sel !== 0) throw new Error(`${key}: a click on the default line drew a pick (g.sel=${lineHit.sel})`);
      passed.push(`${key}/default-line-hover-only`);

      // A point: its field takes the pick, the control's keeps its start.
      const pt = hitPoint(layer, spec.clickIndex);
      const picked = await dispatchAt(key, pt.x, pt.y, "click");
      const all1 = await waitChange(`#bond_${key}`, all0, `${key}/pick`);
      if (!new RegExp(`scatter = ElementEvent\\(:scatter, ${spec.clickIndex + 1},`).test(all1) || !ctlRe(start).test(all1)) {
        throw new Error(`${key}/pick: value ${JSON.stringify(all1)}, want scatter = :scatter ${spec.clickIndex + 1} and ${ctl} still ${start}`);
      }
      if (picked.sel !== 2) throw new Error(`${key}/pick: g.sel=${picked.sel}, want one closed pick (2 shapes)`);
      const pickedAll = (await inspect(key)).bondAll;
      if (pickedAll?.scatter?.index !== spec.clickIndex || pickedAll?.[ctl]?.payload !== start) {
        throw new Error(`${key}/pick: host.value ${JSON.stringify(pickedAll)}`);
      }
      passed.push(`${key}/pick-own-field`);
      await dispatchAt(key, 1, 1, "pointermove");

      // The threshold: its field moves, the pick stays (in the value and on screen).
      const ctlLayer = layers.find((l) => l.id === ctl);
      if (!ctlLayer) throw new Error(`${key}: no control layer "${ctl}"`);
      const cp = hitPoint(ctlLayer, 0);
      await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        host?.scrollIntoView({ block: "center", inline: "nearest" });
      }, key);
      await drag(key, cp.x, cp.y, cp.x + 80, cp.y, false);
      const all2 = await waitChange(`#bond_${key}`, all1, `${key}/drag`, 120);
      const mv = ctlRe(null).exec(all2);
      if (!mv || !(Number(mv[1]) > start)) throw new Error(`${key}/drag: value ${JSON.stringify(all2)}, want ${ctl} moved right of ${start}`);
      if (!new RegExp(`scatter = ElementEvent\\(:scatter, ${spec.clickIndex + 1},`).test(all2)) {
        throw new Error(`${key}/drag: the drag dropped the scatter's pick: ${JSON.stringify(all2)}`);
      }
      const afterDrag = await inspect(key);
      if (afterDrag.sel !== 2) throw new Error(`${key}/drag: g.sel=${afterDrag.sel} after the drag, want the pick still drawn (2)`);
      passed.push(`${key}/drag-own-field`);
      passed.push(`${key}/bind-shows-both`);
      console.error(`OK  ${key} — ${all2.slice(0, 160)}`);
      continue;
    }

    // Makie blocks as controls (#345): each named block is a native HTML control over the box
    // its layout cell gave it, and the picture under it is empty. The slider drives the red line
    // through `onchange` (keyboard and pointer), the toggle hides it, and the interval slider,
    // checkbox and menu each change their own field of the `@bind` value.
    if (spec.mode === "controls") {
      const t = JSON.parse(await textOf(`#axes_${key}`));
      const ax = Object.values(t).find((tt) => tt.viewport && tt.ylims);
      const [, vy, , vh] = ax.viewport;
      const yPx = (v) => vy + vh * (1 - (v - ax.ylims[0]) / (ax.ylims[1] - ax.ylims[0]));
      const ctl = (id, sel = "input") => page.locator(`[data-masque-control="${id}"] ${sel}`);
      const geo = (id) => layers.find((l) => l.id === id).geometry;
      // Screen px of an image-px box, and the image px of a screen row.
      const screenOf = async () => page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        host.scrollIntoView({ block: "center", inline: "nearest" });
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        const b = host.querySelector("img, canvas").getBoundingClientRect();
        return { left: b.left, top: b.top, sc: b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width };
      }, key);
      const redRow = async () => {
        const s0 = await screenOf();
        const x = s0.left + (ax.viewport[0] + ax.viewport[2] * 0.5) * s0.sc;
        const png = PNG.sync.read(await page.screenshot({ clip: { x: x - 1, y: s0.top + vy * s0.sc, width: 3, height: vh * s0.sc } }));
        const rows = [];
        for (let r = 0; r < png.height; r++) {
          const o = (r * png.width + 1) * 4;
          if (png.data[o] > 180 && png.data[o + 1] < 90 && png.data[o + 2] < 90) rows.push(r);
        }
        return rows.length ? vy + ((rows[0] + rows.at(-1)) / 2) * vh / png.height : null;
      };
      const expectLevel = async (level, what) => {
        let got = null;
        for (let i = 0; i < (backend === "webgl" ? 60 : 40); i++) {
          got = await redRow();
          if (level === null ? got === null : got !== null && Math.abs(got - yPx(level)) <= 6) return;
          await new Promise((r) => setTimeout(r, 250));
        }
        throw new Error(`${key}/${what}: red line at image y ${got}, want ${level === null ? "none" : yPx(level).toFixed(1)}`);
      };
      const bondHas = async (re, before, what) => {
        const v = before === null ? await textOf(`#bond_${key}`) : await waitChange(`#bond_${key}`, before, `${key}/${what}`);
        if (!re.test(v)) throw new Error(`${key}/${what}: value ${JSON.stringify(v)} doesn't match ${re}`);
        return v;
      };

      // Each control sits on its block's box.
      const s0 = await screenOf();
      for (const id of ["level", "show", "span", "fine", "pick", "tall", "grid"]) {
        const g = geo(id);
        if (layers.find((l) => l.id === id)?.kind !== "control") throw new Error(`${key}: no control layer ${id}`);
        const bb = await page.locator(`[data-masque-control="${id}"]`).boundingBox();
        const want = { x: s0.left + g.x * s0.sc, y: s0.top + g.y * s0.sc, w: g.w * s0.sc, h: g.h * s0.sc };
        if (!bb || Math.abs(bb.x - want.x) > 2 || Math.abs(bb.y - want.y) > 2 || Math.abs(bb.width - want.w) > 2 || Math.abs(bb.height - want.h) > 2) {
          throw new Error(`${key}/${id}: control box ${JSON.stringify(bb)}, want ${JSON.stringify(want)}`);
        }
      }
      passed.push(`${key}/controls-on-blocks`);

      // The picture under the controls is empty: with the HTML hidden, every pixel in each box
      // is the figure's background. (The grid's box keeps its slider's name in the picture.)
      await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        sr.querySelector(".masque-controls").style.visibility = "hidden";
      }, key);
      // The grid's name labels stay in the picture, so its sliders and value labels are
      // checked box by box.
      const boxes = ["level", "show", "span", "fine", "pick", "tall"].map((id) => [id, geo(id)]);
      geo("grid").sliders.forEach((s, i) => boxes.push([`grid-${i}`, s], [`grid-${i}-value`, s.valueLabel]));
      for (const [id, g] of boxes) {
        const png = PNG.sync.read(await page.screenshot({ clip: { x: s0.left + g.x * s0.sc + 1, y: s0.top + g.y * s0.sc + 1, width: Math.max(1, g.w * s0.sc - 2), height: Math.max(1, g.h * s0.sc - 2) } }));
        let ink = 0;
        for (let o = 0; o < png.data.length; o += 4) if (png.data[o] < 235 || png.data[o + 1] < 235 || png.data[o + 2] < 235) ink++;
        if (ink > 0) throw new Error(`${key}/${id}: ${ink} drawn pixels in the block's box; Makie's own drawing should be hidden`);
      }
      await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        sr.querySelector(".masque-controls").style.visibility = "";
      }, key);
      passed.push(`${key}/block-drawing-hidden`);

      let v = await bondHas(/level = 3, show = true, span = \(2, 4\), fine = false, pick = "a"/, null, "mount");
      await expectLevel(spec.controlStart, "mount");
      passed.push(`${key}/start-values`);

      // Keyboard: two steps right on the focused slider.
      await ctl("level").focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      v = await bondHas(/level = 5,/, v, "keyboard");
      await expectLevel(5, "keyboard");
      passed.push(`${key}/slider-keyboard`);

      // Pointer: drag the knob to the right end. The line follows while the knob moves.
      const sb = await ctl("level").boundingBox();
      const knobX = sb.x + sb.width * 0.5, y = sb.y + sb.height / 2;
      await page.mouse.move(knobX, y);
      await page.mouse.down();
      await page.mouse.move(sb.x + sb.width - 1, y, { steps: 8 });
      await page.mouse.up();
      v = await bondHas(/level = 10,/, v, "drag");
      await expectLevel(10, "drag");
      passed.push(`${key}/slider-drag`);

      // The toggle hides the line, and its knob slides to Makie's off end (#427).
      const knobAt = async (want, what) => {
        const g = geo("show"), sc = (await screenOf()).sc;
        const bb = await page.locator(`[data-masque-control="show"]`).boundingBox();
        for (let i = 0; i < 20; i++) {
          const kb = await ctl("show", ".masque-toggle-knob").boundingBox();
          // The knob grows by 15% under the pointer, around its centre.
          const cx = kb.x + kb.width / 2 - bb.x, cy = kb.y + kb.height / 2 - bb.y;
          if (Math.abs(cx - want[0] * sc) <= 2 && Math.abs(cy - want[1] * sc) <= 2) return;
          if (i === 19) throw new Error(`${key}/${what}: toggle knob centre (${cx}, ${cy}), want ${JSON.stringify(want.map((c) => c * sc))} (${JSON.stringify(g)})`);
          await new Promise((r) => setTimeout(r, 100));
        }
      };
      await knobAt(geo("show").knobOn, "toggle-knob-on");
      // The vertical toggle's track is turned upright and fills its box, so a slip in the
      // turn or its origin shows here (#427).
      {
        const bb = await page.locator(`[data-masque-control="tall"]`).boundingBox();
        const tb = await ctl("tall", ".masque-toggle-track").boundingBox();
        if (!(tb.height > 1.5 * tb.width) || Math.abs(tb.x - bb.x) > 2 || Math.abs(tb.y - bb.y) > 2 || Math.abs(tb.width - bb.width) > 2 || Math.abs(tb.height - bb.height) > 2) {
          throw new Error(`${key}/toggle-vertical: track ${JSON.stringify(tb)}, want upright and filling ${JSON.stringify(bb)}`);
        }
        passed.push(`${key}/toggle-vertical`);
      }
      await ctl("show").click();
      v = await bondHas(/show = false,/, v, "toggle");
      await expectLevel(null, "toggle");
      await knobAt(geo("show").knobOff, "toggle-knob-off");
      passed.push(`${key}/toggle`);

      // The interval slider's high knob, the checkbox and the menu change only their own field.
      await ctl("span", "input >> nth=1").focus();
      await page.keyboard.press("ArrowRight");
      v = await bondHas(/span = \(2, 5\),/, v, "interval");
      // Pointer: drag the low knob (index 1 of 0..4) to the bar's start. The high input sits
      // over the whole box, so this proves each knob takes its own drag.
      const ib = await ctl("span", "input >> nth=0").boundingBox();
      const knob = Math.min(ib.width, ib.height), iy = ib.y + ib.height / 2;
      const at = (k) => ib.x + knob / 2 + (k / 4) * (ib.width - knob);
      await page.mouse.move(at(1), iy);
      await page.mouse.down();
      await page.mouse.move(ib.x + 1, iy, { steps: 6 });
      await page.mouse.up();
      v = await bondHas(/span = \(1, 5\),/, v, "interval-low-drag");
      passed.push(`${key}/interval-low-knob-drag`);
      // The checkbox swaps the menu's options in `onchange`: the menu follows, with nothing chosen.
      await ctl("fine").click();
      for (let i = 0; ; i++) {
        v = await textOf(`#bond_${key}`);
        if (/fine = true, pick = nothing/.test(v)) break;
        if (i > 120) throw new Error(`${key}/checkbox: value ${JSON.stringify(v)}, want fine = true, pick = nothing`);
        await new Promise((r) => setTimeout(r, 250));
      }
      const opts = await page.locator(`[data-masque-control="pick"] option:not([disabled])`).allTextContents();
      if (opts.join(",") !== "x,y,z") throw new Error(`${key}/menu-follows: options ${JSON.stringify(opts)}, want x,y,z`);
      passed.push(`${key}/menu-follows-onchange`);
      await ctl("pick", "select").selectOption("2");
      v = await bondHas(/level = 10, show = false, span = \(1, 5\), fine = true, pick = "z"/, v, "menu");
      passed.push(`${key}/interval-checkbox-menu`);
      // The slider grid's slider moves its field and its value label, which Julia formatted.
      {
        const lab = ctl("grid", ".masque-vlabel");
        if ((await lab.textContent()) !== "2 dB") throw new Error(`${key}/grid: value label ${await lab.textContent()}, want 2 dB`);
        await ctl("grid", "input").focus();
        await page.keyboard.press("ArrowRight");
        // Focus rings only the focused slider's knob, not every knob in the figure.
        const ringed = await page.evaluate(() => {
          const out = [];
          for (const h of document.querySelectorAll(".ip-host")) h.querySelectorAll("*").forEach((el) => {
            if (!el.shadowRoot) return;
            el.shadowRoot.querySelectorAll(".masque-knob").forEach((k) => {
              if (getComputedStyle(k).outlineStyle !== "none") out.push(k.closest("[data-masque-control]").dataset.masqueControl);
            });
          });
          return out;
        });
        if (ringed.length !== 1 || ringed[0] !== "grid-0") throw new Error(`${key}/grid: focus ring on ${JSON.stringify(ringed)}, want only grid-0`);
        v = await bondHas(/grid = \(3,\)/, v, "grid");
        if ((await lab.textContent()) !== "3 dB") throw new Error(`${key}/grid: value label ${await lab.textContent()}, want 3 dB`);
        passed.push(`${key}/slider-grid`);
      }
      console.error(`OK  ${key} — ${v.slice(0, 120)}`);
      continue;
    }

    // `onchange` (#334): the red level line is redrawn at cutoff + picks on every click and
    // threshold drag, on both backends, without the cell running again. The line is found in
    // the picture's own pixels, so a frame that arrives with stale plot data (the WebGL
    // failure the spike hit) fails here. `bind = :pts`: the drag moves the line but leaves the
    // `@bind` value, which only a pick changes.
    if (spec.mode === "onchange") {
      const t = JSON.parse(await textOf(`#axes_${key}`))[layer.axis];
      const [, vy, , vh] = t.viewport;
      const yPx = (v) => vy + vh * (1 - (v - t.ylims[0]) / (t.ylims[1] - t.ylims[0]));
      const xData = (px) => t.xlims[0] + (px - t.viewport[0]) / t.viewport[2] * (t.xlims[1] - t.xlims[0]);
      const stamp = async () => {
        const raw = await page.evaluate((k) => {
          const span = document.querySelector(`#coords_${k}`);
          const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
          return host?.dataset.masqueGestureFrame ?? "";
        }, key);
        return raw ? JSON.parse(raw) : null;
      };
      const waitFrame = async (after, what) => {
        for (let i = 0; i < (backend === "webgl" ? 60 : 40); i++) {
          await new Promise((r) => setTimeout(r, 250));
          const st = await stamp();
          if (st && st.onchange && st.settle && st.n > (after?.n ?? 0)) return st;
        }
        throw new Error(`${key}/${what}: no settled onchange frame after ${JSON.stringify(after)}`);
      };
      // The image-px row of the red line in a column clear of the points: the middle of the
      // reddest run in a thin page screenshot down the plot area.
      const redRow = async () => {
        const g = await page.evaluate(([k, ix, top, h]) => {
          const span = document.querySelector(`#coords_${k}`);
          const host = [...document.querySelectorAll(".ip-host")].filter((hh) => (hh.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
          host.scrollIntoView({ block: "center", inline: "nearest" });
          let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
          const b = host.querySelector("img, canvas").getBoundingClientRect();
          const sc = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
          return { x: b.left + ix * sc, y: b.top + top * sc, h: h * sc };
        }, [key, t.viewport[0] + t.viewport[2] * 0.95, vy, vh]);
        const png = PNG.sync.read(await page.screenshot({ clip: { x: g.x - 1, y: g.y, width: 3, height: g.h } }));
        const rows = [];
        for (let r = 0; r < png.height; r++) {
          const o = (r * png.width + 1) * 4, R = png.data[o], G = png.data[o + 1], B = png.data[o + 2];
          if (R > 180 && G < 90 && B < 90) rows.push(r);
        }
        if (!rows.length) return null;
        const mid = (rows[0] + rows[rows.length - 1]) / 2;
        return vy + mid * vh / png.height;
      };
      const expectLevel = async (level, what) => {
        const want = yPx(level);
        let got = null;
        for (let i = 0; i < 12; i++) {
          got = await redRow();
          if (got !== null && Math.abs(got - want) <= 6) return;
          await new Promise((r) => setTimeout(r, 250));
        }
        throw new Error(`${key}/${what}: red line at image y ${got}, want ${want.toFixed(1)} (level ${level})`);
      };

      const v0 = await textOf(`#bond_${key}`);
      if (!/^(Masque\.)?ElementEvent\[\]$/.test(v0.trim())) throw new Error(`${key}: mount value ${JSON.stringify(v0)}, want ElementEvent[] (bind = :pts)`);
      await expectLevel(spec.controlStart, "mount");
      passed.push(`${key}/drawn-from-start-state`);

      // A pick: the value changes and the line moves up by one.
      const s0 = await stamp();
      const pt = hitPoint(layer, spec.clickIndex);
      await dispatchAt(key, pt.x, pt.y, "click");
      const v1 = await waitChange(`#bond_${key}`, v0, `${key}/pick`);
      if (!new RegExp(`ElementEvent\\(:pts, ${spec.clickIndex + 1},`).test(v1)) throw new Error(`${key}/pick: value ${JSON.stringify(v1)}`);
      const s1 = await waitFrame(s0, "pick");
      await expectLevel(spec.controlStart + 1, "pick");
      passed.push(`${key}/pick-redraws`);
      await dispatchAt(key, 1, 1, "pointermove");

      // A threshold drag: the line follows the threshold, the value stays.
      const ctlLayer = layers.find((l) => l.id === spec.control);
      const cp = hitPoint(ctlLayer, 0);
      await drag(key, cp.x, cp.y, cp.x + 120, cp.y, false);
      await waitFrame(s1, "drag");
      const lineX = await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        return Number(sr.querySelector(".masque-threshold-line")?.getAttribute("x1"));
      }, key);
      const cutoff = xData(lineX);
      if (!(cutoff > spec.controlStart + 0.5)) throw new Error(`${key}/drag: threshold at ${cutoff}, want it moved right of ${spec.controlStart}`);
      await expectLevel(cutoff + 1, "drag");
      if ((await textOf(`#bond_${key}`)) !== v1) throw new Error(`${key}/drag: the threshold drag changed the value; it is not in bind`);
      const after = await inspect(key);
      if (after.sel !== 2) throw new Error(`${key}/drag: g.sel=${after.sel}, want the pick still drawn (2)`);
      passed.push(`${key}/drag-redraws`);
      passed.push(`${key}/state-outside-bind`);
      console.error(`OK  ${key} — cutoff ${cutoff.toFixed(2)}, ${v1.slice(0, 80)}`);
      continue;
    }

    // `select = :many` (#335, #358): a click adds a pick or takes it out, with or without Ctrl
    // (Linux Chromium, so Ctrl rather than Cmd), a click on empty plot space keeps them (#384),
    // and Escape on the focused figure clears them. Each step checks the printed `@bind` value,
    // host.value's `{items}`, and how many picks are drawn.
    // A grid with `select = :many` (#335, #358): a click flips one cell, with or without Ctrl, a
    // click on the axis off the grid keeps the cells (#384), and Escape clears them. Each step checks the printed
    // `GridSelection` count, host.value's `{runs}`, and the drawing: one fill path over the
    // cells and one edge path around their outline (an inner side would be a 5th subpath for
    // two cells side by side), and no hover on a selected cell.
    if (spec.mode === "many_grid") {
      const g = layer.geometry;
      if (!layer.many) throw new Error(`${key}: layer ${layer.id} ships no many flag`);
      const v0 = await textOf(`#bond_${key}`);
      if (!/GridSelection\(:region, 0 of 12 cells\)/.test(v0)) throw new Error(`${key}: mount value ${JSON.stringify(v0)}, want an empty GridSelection`);
      passed.push(`${key}/empty-mask-at-mount`);
      const at = (i, j) => ({ x: (g.xedges[i] + g.xedges[i + 1]) / 2, y: (g.yedges[j] + g.yedges[j + 1]) / 2 });
      const selPaths = () => page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        const d = (svg) => sr.querySelector(`svg.${svg} g.sel path`)?.getAttribute("d") ?? null;
        const edge = sr.querySelector("svg.masque-edge g.sel path");
        return { fill: d("masque-fill"), edge: d("masque-edge"), edgeWidth: edge ? getComputedStyle(edge).strokeWidth : null };
      }, key);
      const step = async (what, before, act, wantCount, wantRuns, wantSel) => {
        const r = await act();
        const t = await waitChange(`#bond_${key}`, before, `${key}/${what}`);
        if (!t.includes(`GridSelection(:region, ${wantCount} of 12 cells)`)) throw new Error(`${key}/${what}: value ${JSON.stringify(t)}, want ${wantCount} cells`);
        const runs = (await inspect(key)).bondAll?.region?.runs;
        if (JSON.stringify(runs) !== JSON.stringify(wantRuns)) throw new Error(`${key}/${what}: host.value runs ${JSON.stringify(runs)}, want ${JSON.stringify(wantRuns)}`);
        const sel = r?.sel ?? (await inspect(key)).sel;
        if (sel !== wantSel) throw new Error(`${key}/${what}: g.sel=${sel}, want ${wantSel}`);
        passed.push(`${key}/${what}`);
        return t;
      };
      let t = await step("click-picks-one", v0, () => dispatchAt(key, at(1, 1).x, at(1, 1).y, "click"), 1, [1, 1, 1], 2);
      t = await step("click-adds", t, () => dispatchAt(key, at(2, 1).x, at(2, 1).y, "click"), 2, [1, 1, 2], 2);
      const p = await selPaths();
      if ((p.fill?.match(/M/g) ?? []).length !== 1) throw new Error(`${key}: fill path ${p.fill}, want one rect for the two cells`);
      if ((p.edge?.match(/M/g) ?? []).length !== 4) throw new Error(`${key}: edge path ${p.edge}, want the outline only (4 sides)`);
      if (parseFloat(p.edgeWidth) !== 2) throw new Error(`${key}: edge stroke ${p.edgeWidth}, want the 2px selected width`);
      passed.push(`${key}/outline-only`);
      const hov = await dispatchAt(key, at(1, 1).x, at(1, 1).y, "pointermove");
      if (hov.hi.fill || hov.hi.edge || hov.hi.plain) throw new Error(`${key}: hovering a selected cell drew ${JSON.stringify(hov.hi)}`);
      if (!hov.show) throw new Error(`${key}: hovering a selected cell hid its tooltip`);
      passed.push(`${key}/no-hover-on-selected`);
      t = await step("ctrl-click-adds-row", t, () => dispatchAt(key, at(0, 2).x, at(0, 2).y, "click", { ctrlKey: true }), 3, [1, 1, 2, 2, 0, 1], 2);
      t = await step("click-removes", t, () => dispatchAt(key, at(1, 1).x, at(1, 1).y, "click"), 2, [1, 2, 1, 2, 0, 1], 2);
      t = await step("click-adds-keeps-others", t, () => dispatchAt(key, at(3, 0).x, at(3, 0).y, "click"), 3, [0, 3, 1, 1, 2, 1, 2, 0, 1], 2);
      // The axis runs to y = 4; the grid stops at 3.
      const off = { x: at(1, 2).x, y: g.yedges[3] - (g.yedges[2] - g.yedges[3]) / 2 };
      {
        const r = await dispatchAt(key, off.x, off.y, "click");
        const want = [0, 3, 1, 1, 2, 1, 2, 0, 1];
        const runs = (await inspect(key)).bondAll?.region?.runs;
        if (JSON.stringify(runs) !== JSON.stringify(want)) throw new Error(`${key}/empty-click-keeps: host.value runs ${JSON.stringify(runs)}, want ${JSON.stringify(want)}`);
        if (r.sel !== 2) throw new Error(`${key}/empty-click-keeps: g.sel=${r.sel}, want the cells still drawn (2)`);
        t = await waitSame(`#bond_${key}`, t, `${key}/empty-click-keeps`);
        passed.push(`${key}/empty-click-keeps`);
      }
      // A real mouse click, then a real Escape with no focus() in between: the click itself
      // must give the figure focus (#380).
      t = await step("mouse-click-again", t, () => mouseClickAt(key, at(0, 0).x, at(0, 0).y), 4, [0, 0, 1, 0, 3, 1, 1, 2, 1, 2, 0, 1], 2);
      t = await step("escape-after-click-clears", t, () => page.keyboard.press("Escape"), 0, [], 0);
      // Ctrl+Z on the focused figure brings back what Escape cleared (#386).
      t = await step("undo-after-escape", t, () => page.keyboard.press("ControlOrMeta+z"), 4, [0, 0, 1, 0, 3, 1, 1, 2, 1, 2, 0, 1], 2);
      t = await step("redo", t, () => page.keyboard.press("ControlOrMeta+Shift+z"), 0, [], 0);
      // A marquee adds the cells the box touches, and one from a held cell takes them out,
      // with or without Ctrl (#335, #358).
      const gdrag = async (from, to, mod = {}) => {
        await dispatchAt(key, from.x, from.y, "pointerdown", mod);
        await dispatchAt(key, (from.x + to.x) / 2, (from.y + to.y) / 2, "pointermove", mod);
        await dispatchAt(key, to.x, to.y, "pointermove", mod);
        return dispatchAt(key, to.x, to.y, "pointerup", mod);
      };
      t = await step("marquee-takes-touched-cells", t, () => gdrag(at(1, 0), at(2, 1)), 4, [0, 1, 2, 1, 1, 2], 2);
      t = await step("marquee-from-held-removes", t, () => gdrag(at(1, 0), at(2, 0)), 2, [1, 1, 2], 2);
      t = await step("marquee-adds-to-held", t, () => gdrag(at(3, 0), at(3, 1)), 4, [0, 3, 1, 1, 1, 3], 2);
      t = await step("ctrl-marquee-from-held-removes", t, () => gdrag(at(3, 0), at(3, 1), { ctrlKey: true }), 2, [1, 1, 2], 2);
      await dispatchAt(key, 1, 1, "pointermove");
      console.error(`OK  ${key} — ${t.slice(0, 160)}`);
      continue;
    }

    // The same grid started with `selected=` (#356): before any gesture, the printed value holds
    // the two seeded cells, host.value's `{runs}` names them, and they draw as one outlined area
    // (one fill rect, a 4-sided edge). Ctrl-click then takes a seeded cell out, a plain click puts
    // it back, and a plain click elsewhere adds to the seeds, as on a grid that started empty.
    // The same grid cut into regions (#359), rows along x: row 0 is 1 1 2 0, row 1 is 1 3 2 0,
    // row 2 is 3 3 2 2 (0 = no region). Hover outlines the whole region with the hover edge,
    // keeps one highlight while the pointer moves inside it, and names it; a click picks the
    // whole region, a click with or without Ctrl adds or drops one, a cell in no region is picked
    // alone, and a box inside one cell adds that cell's whole region. The value counts the whole regions.
    if (spec.mode === "many_grid_regions") {
      const g = layer.geometry;
      if (!layer.many) throw new Error(`${key}: layer ${layer.id} ships no many flag`);
      if (JSON.stringify(g.regions) !== JSON.stringify([1, 2, 2, 1, 0, 1, 1, 1, 3, 1, 2, 1, 0, 1, 3, 2, 2, 2])) {
        throw new Error(`${key}: regions ${JSON.stringify(g.regions)}, want the region runs`);
      }
      const v0 = await textOf(`#bond_${key}`);
      if (!/GridSelection\(:region, 0 of 12 cells\)/.test(v0)) throw new Error(`${key}: mount value ${JSON.stringify(v0)}, want empty`);
      const at = (i, j) => ({ x: (g.xedges[i] + g.xedges[i + 1]) / 2, y: (g.yedges[j] + g.yedges[j + 1]) / 2 });
      const h1 = await dispatchAt(key, at(0, 0).x, at(0, 0).y, "pointermove");
      if (h1.text !== "region 1") throw new Error(`${key}: hover tip ${JSON.stringify(h1.text)}, want "region 1"`);
      if (!h1.hi.edge || !/masque-w-hover/.test(h1.hi.edge.className ?? "")) throw new Error(`${key}: hover edge ${JSON.stringify(h1.hi.edge)}, want the hover edge`);
      if ((h1.hi.edge.d?.match(/M/g) ?? []).length !== 6) throw new Error(`${key}: hover edge ${h1.hi.edge.d}, want region 1's 6-sided outline`);
      if (!h1.hi.fill || h1.hi.fill.blend !== "color-dodge") throw new Error(`${key}: hover fill ${JSON.stringify(h1.hi.fill)}, want the dodge fill`);
      const h2 = await dispatchAt(key, at(1, 0).x, at(1, 0).y, "pointermove");
      if (h2.hi.edge?.d !== h1.hi.edge.d || h2.text !== "region 1") throw new Error(`${key}: moving inside region 1 drew ${h2.hi.edge?.d} / ${h2.text}`);
      passed.push(`${key}/hover-outlines-region`);
      const words = (n, r) => `GridSelection(:region, ${n} of 12 cells${r ? `, ${r} region${r === 1 ? "" : "s"}` : ""})`;
      const step = async (what, before, act, wantCount, wantRegions, wantRuns) => {
        await act();
        const t = await waitChange(`#bond_${key}`, before, `${key}/${what}`);
        if (!t.includes(words(wantCount, wantRegions))) throw new Error(`${key}/${what}: value ${JSON.stringify(t)}, want ${words(wantCount, wantRegions)}`);
        const m = await inspect(key);
        if (JSON.stringify(m.bondAll?.region?.runs) !== JSON.stringify(wantRuns)) throw new Error(`${key}/${what}: host.value runs ${JSON.stringify(m.bondAll?.region?.runs)}, want ${JSON.stringify(wantRuns)}`);
        if (m.sel !== 2) throw new Error(`${key}/${what}: g.sel=${m.sel}, want one fill and one outline`);
        passed.push(`${key}/${what}`);
        return t;
      };
      let t = await step("click-picks-region", v0, () => dispatchAt(key, at(0, 0).x, at(0, 0).y, "click"), 3, 1, [0, 0, 2, 1, 0, 1]);
      const hs = await dispatchAt(key, at(0, 1).x, at(0, 1).y, "pointermove");
      if (hs.hi.fill || hs.hi.edge || hs.hi.plain) throw new Error(`${key}: hovering a selected region drew ${JSON.stringify(hs.hi)}`);
      passed.push(`${key}/no-hover-on-selected-region`);
      t = await step("click-adds-region", t, () => dispatchAt(key, at(2, 2).x, at(2, 2).y, "click"), 7, 2, [0, 0, 3, 1, 0, 1, 1, 2, 1, 2, 2, 2]);
      t = await step("ctrl-click-drops-region", t, () => dispatchAt(key, at(1, 0).x, at(1, 0).y, "click", { ctrlKey: true }), 4, 1, [0, 2, 1, 1, 2, 1, 2, 2, 2]);
      t = await step("click-cell-in-no-region", t, () => dispatchAt(key, at(3, 0).x, at(3, 0).y, "click"), 5, 1, [0, 2, 2, 1, 2, 1, 2, 2, 2]);
      // A box well inside cell (1, 1), of region 3, takes the whole region.
      const c = at(1, 1), dx = (g.xedges[2] - g.xedges[1]) / 4, dy = (g.yedges[2] - g.yedges[1]) / 4;
      const gdrag = async (from, to) => {
        await dispatchAt(key, from.x, from.y, "pointerdown");
        await dispatchAt(key, (from.x + to.x) / 2, (from.y + to.y) / 2, "pointermove");
        await dispatchAt(key, to.x, to.y, "pointermove");
        return dispatchAt(key, to.x, to.y, "pointerup");
      };
      t = await step("box-takes-touched-region", t, () => gdrag({ x: c.x - dx, y: c.y - dy }, { x: c.x + dx, y: c.y + dy }), 8, 2, [0, 2, 2, 1, 1, 2, 2, 0, 4]);
      await dispatchAt(key, 1, 1, "pointermove");
      console.error(`OK  ${key} — ${t.slice(0, 160)}`);
      continue;
    }

    if (spec.mode === "many_grid_seeded") {
      const g = layer.geometry;
      if (!layer.many) throw new Error(`${key}: layer ${layer.id} ships no many flag`);
      const v0 = await textOf(`#bond_${key}`);
      if (!/GridSelection\(:region, 2 of 12 cells\)/.test(v0)) throw new Error(`${key}: mount value ${JSON.stringify(v0)}, want the 2 seeded cells`);
      const m0 = await inspect(key);
      if (JSON.stringify(m0.bondAll?.region?.runs) !== "[1,1,2]") throw new Error(`${key}: mount runs ${JSON.stringify(m0.bondAll?.region)}, want [1,1,2]`);
      if (m0.sel !== 2) throw new Error(`${key}: mount g.sel=${m0.sel}, want the seeded cells drawn`);
      const p0 = await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        const d = (svg) => sr.querySelector(`svg.${svg} g.sel path`)?.getAttribute("d") ?? null;
        return { fill: d("masque-fill"), edge: d("masque-edge") };
      }, key);
      if ((p0.fill?.match(/M/g) ?? []).length !== 1) throw new Error(`${key}: mount fill path ${p0.fill}, want one rect for the two cells`);
      if ((p0.edge?.match(/M/g) ?? []).length !== 4) throw new Error(`${key}: mount edge path ${p0.edge}, want the outline only (4 sides)`);
      passed.push(`${key}/seeded-at-mount`);
      const at = (i, j) => ({ x: (g.xedges[i] + g.xedges[i + 1]) / 2, y: (g.yedges[j] + g.yedges[j + 1]) / 2 });
      const step = async (what, before, act, wantCount, wantRuns) => {
        await act();
        const t = await waitChange(`#bond_${key}`, before, `${key}/${what}`);
        if (!t.includes(`GridSelection(:region, ${wantCount} of 12 cells)`)) throw new Error(`${key}/${what}: value ${JSON.stringify(t)}, want ${wantCount} cells`);
        const m = await inspect(key);
        if (JSON.stringify(m.bondAll?.region?.runs) !== JSON.stringify(wantRuns)) throw new Error(`${key}/${what}: host.value runs ${JSON.stringify(m.bondAll?.region?.runs)}, want ${JSON.stringify(wantRuns)}`);
        if (m.sel !== 2) throw new Error(`${key}/${what}: g.sel=${m.sel}, want 2`);
        passed.push(`${key}/${what}`);
        return t;
      };
      let t = await step("ctrl-click-removes-seed", v0, () => dispatchAt(key, at(1, 1).x, at(1, 1).y, "click", { ctrlKey: true }), 1, [1, 2, 1]);
      t = await step("click-adds-back", t, () => dispatchAt(key, at(1, 1).x, at(1, 1).y, "click"), 2, [1, 1, 2]);
      t = await step("click-adds-to-seeds", t, () => dispatchAt(key, at(3, 0).x, at(3, 0).y, "click"), 3, [0, 3, 1, 1, 1, 2]);
      await dispatchAt(key, 1, 1, "pointermove");
      console.error(`OK  ${key} — ${t.slice(0, 160)}`);
      continue;
    }

    if (spec.mode === "many") {
      const picks = (t) => [...t.matchAll(/ElementEvent\(:scatter, (\d+),/g)].map((m) => Number(m[1]));
      const items = async () => ((await inspect(key)).bondAll?.scatter?.items ?? null)?.map((i) => i.index);
      const v0 = await textOf(`#bond_${key}`);
      if (!/ElementEvent\[\]/.test(v0)) throw new Error(`${key}: mount value ${JSON.stringify(v0)}, want an empty ElementEvent[]`);
      if (!layer.many) throw new Error(`${key}: layer ${layer.id} ships no many flag`);
      passed.push(`${key}/empty-vector-at-mount`);
      const p = [0, 1, 2].map((i) => hitPoint(layer, i));
      const step = async (what, before, act, want, wantSel) => {
        const r = await act();
        const t = await waitChange(`#bond_${key}`, before, `${key}/${what}`);
        const got = picks(t);
        if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${key}/${what}: value ${JSON.stringify(t)}, want picks ${JSON.stringify(want)}`);
        const it = await items();
        if (JSON.stringify(it) !== JSON.stringify(want.map((i) => i - 1))) throw new Error(`${key}/${what}: host.value items ${JSON.stringify(it)}`);
        const sel = r?.sel ?? (await inspect(key)).sel;
        if (sel !== wantSel) throw new Error(`${key}/${what}: g.sel=${sel}, want ${wantSel}`);
        passed.push(`${key}/${what}`);
        return t;
      };
      // A closed pick draws 2 shapes (fill + edge), as in the composite case.
      let t = await step("click-picks-one", v0, () => dispatchAt(key, p[0].x, p[0].y, "click"), [1], 2);
      t = await step("click-adds", t, () => dispatchAt(key, p[2].x, p[2].y, "click"), [1, 3], 4);
      t = await step("ctrl-click-removes", t, () => dispatchAt(key, p[0].x, p[0].y, "click", { ctrlKey: true }), [3], 2);
      t = await step("click-adds-keeps-others", t, () => dispatchAt(key, p[1].x, p[1].y, "click"), [3, 2], 4);
      t = await step("click-removes", t, () => dispatchAt(key, p[2].x, p[2].y, "click"), [2], 2);
      {
        const r = await dispatchAt(key, (p[0].x + p[1].x) / 2, p[2].y, "click");
        const it = await items();
        if (JSON.stringify(it) !== JSON.stringify([1])) throw new Error(`${key}/empty-click-keeps: host.value items ${JSON.stringify(it)}, want [1]`);
        if (r.sel !== 2) throw new Error(`${key}/empty-click-keeps: g.sel=${r.sel}, want the pick still drawn (2)`);
        t = await waitSame(`#bond_${key}`, t, `${key}/empty-click-keeps`);
        passed.push(`${key}/empty-click-keeps`);
      }
      // A real mouse click, then a real Escape with no focus() in between (#380).
      t = await step("mouse-click-again", t, () => mouseClickAt(key, p[0].x, p[0].y), [2, 1], 4);
      t = await step("escape-after-click-clears", t, () => page.keyboard.press("Escape"), [], 0);
      t = await step("undo-after-escape", t, () => page.keyboard.press("ControlOrMeta+z"), [2, 1], 4);
      t = await step("redo", t, () => page.keyboard.press("ControlOrMeta+Shift+z"), [], 0);
      await dispatchAt(key, 1, 1, "pointermove");
      console.error(`OK  ${key} — ${t.slice(0, 160)}`);
      continue;
    }

    // Linked selections (#346). Every plot of a `linked(...)` group is one field of rows: a
    // pick in any plot edits the rows, and every mark of a held row, in every plot, is drawn
    // picked (the fade's `kept`). Hovering a mark outlines its partners with the hover recipe
    // in g.link and lifts their fade. Each step checks host.value's rows, the printed `@bind`
    // value, and the marks drawn picked.
    if (spec.mode === "linked_pos" || spec.mode === "linked_keys" || spec.mode === "linked_one") {
      const field = spec.field;
      const out = `#out_${key}`;
      const prefix = `${key.toUpperCase()}=`;
      const byId = Object.fromEntries(layers.map((l) => [l.id, l]));
      const members = layers.filter((l) => l.group === field);
      if (members.length < 2) throw new Error(`${key}: ${members.length} layers carry group ${field}, want 2 or more`);
      for (const l of members) {
        if (!l.events.includes("click")) throw new Error(`${key}: member ${l.id} takes no click`);
        if (l.many) throw new Error(`${key}: member ${l.id} ships its own many flag`);
      }
      passed.push(`${key}/members-carry-group`);
      const at = (id, i) => hitPoint(byId[id], i);
      const rowsNow = async () => {
        const v = (await inspect(key)).bondAll?.[field];
        return v === null || v === undefined ? null : (v.rows ?? (v.row === undefined ? null : [v.row]));
      };
      const keptNow = async () => (await inspect(key)).kept.slice().sort();
      const look = () => page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        const live = (sel) => [...sr.querySelectorAll(sel)].filter((e) => !e.classList.contains("masque-leave"));
        const circles = live("svg.masque-edge g.link circle").map((c) => {
          const cs = getComputedStyle(c);
          return { cx: Number(c.getAttribute("cx")), cy: Number(c.getAttribute("cy")), stroke: cs.stroke, width: parseFloat(cs.strokeWidth) };
        });
        const fills = live("svg.masque-fill g.link > *").length;
        const rects = live("svg.masque-edge g.link rect").length;
        const lift = [...sr.querySelectorAll(".masque-fade")].flatMap((w) => (w.dataset.lift ? w.dataset.lift.split(" ") : []));
        return { circles, fills, rects, lift: lift.sort() };
      }, key);
      const wantOut = (rows) => {
        if (spec.mode === "linked_one") return rows.length ? String(rows[0] + 1) : "nothing";
        if (spec.mode === "linked_keys") return rows.length ? `[${rows.map((r) => `"c${r + 1}"`).join(", ")}]` : "String[]";
        return rows.length ? `[${rows.map((r) => r + 1).join(", ")}]` : "Int64[]";
      };
      const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
      let t = await textOf(out);
      const empty = spec.mode === "linked_one" ? null : [];
      if (t !== prefix + wantOut([])) throw new Error(`${key}: mount value ${JSON.stringify(t)}, want ${prefix + wantOut([])}`);
      if (JSON.stringify(await rowsNow()) !== JSON.stringify(empty)) throw new Error(`${key}: host.value at mount ${JSON.stringify(await rowsNow())}`);
      passed.push(`${key}/empty-at-mount`);
      // `rows` in pick order, unless `anyOrder` (a box adds the marks it covers in layer order).
      const step = async (what, act, rows, kept, anyOrder = false) => {
        await act();
        t = await waitChange(out, t, `${key}/${what}`);
        const got = await rowsNow();
        const want = spec.mode === "linked_one" && !rows.length ? null : rows;
        const okRows = anyOrder ? got && sameSet(got, rows) : JSON.stringify(got) === JSON.stringify(want);
        if (!okRows) throw new Error(`${key}/${what}: host.value rows ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
        const wantT = prefix + wantOut(anyOrder ? got : rows);
        if (t !== wantT) throw new Error(`${key}/${what}: @bind value ${JSON.stringify(t)}, want ${JSON.stringify(wantT)}`);
        // Off the marks first: hovering a legend entry previews its marks in the fade too.
        await dispatchAt(key, 1, 1, "pointermove");
        const k = await keptNow();
        if (!sameSet(k, kept)) throw new Error(`${key}/${what}: drawn picked ${JSON.stringify(k)}, want ${JSON.stringify(kept.slice().sort())}`);
        passed.push(`${key}/${what}`);
      };
      const hoverPartners = async (what, id, i, want) => {
        const p = at(id, i);
        await dispatchAt(key, p.x, p.y, "pointermove");
        await new Promise((r) => setTimeout(r, 100));
        const lk = await look();
        const centres = lk.circles.map((c) => `${Math.round(c.cx)},${Math.round(c.cy)}`).sort();
        const wantC = want.circles.map(([pid, j]) => { const q = at(pid, j); return `${Math.round(q.x)},${Math.round(q.y)}`; }).sort();
        if (JSON.stringify(centres) !== JSON.stringify(wantC)) throw new Error(`${key}/${what}: partner circles at ${JSON.stringify(centres)}, want ${JSON.stringify(wantC)}`);
        if (lk.rects !== (want.rects ?? 0)) throw new Error(`${key}/${what}: ${lk.rects} partner rects, want ${want.rects ?? 0}`);
        // The hover recipe: a fill half in svg.masque-fill and a 1px-class chrome edge.
        if (lk.fills !== lk.circles.length + lk.rects) throw new Error(`${key}/${what}: ${lk.fills} fill halves for ${lk.circles.length + lk.rects} partners`);
        for (const c of lk.circles) if (!(c.width > 0) || c.stroke === "none") throw new Error(`${key}/${what}: partner edge ${JSON.stringify(c)}`);
        if (want.lift) {
          const wl = [`${id}:${i}`, ...want.lift].sort();
          if (!sameSet(lk.lift, wl)) throw new Error(`${key}/${what}: fade lifts ${JSON.stringify(lk.lift)}, want ${JSON.stringify(wl)}`);
        }
        passed.push(`${key}/${what}`);
      };
      const leave = async (what, x, y) => {
        await dispatchAt(key, x, y, "pointermove");
        await new Promise((r) => setTimeout(r, 100));
        const lk = await look();
        if (lk.circles.length || lk.rects) throw new Error(`${key}/${what}: partners still drawn after leaving ${JSON.stringify(lk)}`);
        if (lk.lift.length) throw new Error(`${key}/${what}: fade still lifts ${JSON.stringify(lk.lift)} after leaving`);
        passed.push(`${key}/${what}`);
      };
      const click = (id, i, mod = {}) => () => { const p = at(id, i); return dispatchAt(key, p.x, p.y, "click", mod); };
      const pad = 30;
      const boxDrag = async (pts, mod = {}) => {
        const x0 = Math.min(...pts.map((p) => p.x)) - pad, y0 = Math.min(...pts.map((p) => p.y)) - pad;
        const x1 = Math.max(...pts.map((p) => p.x)) + pad, y1 = Math.max(...pts.map((p) => p.y)) + pad;
        await dispatchAt(key, x0, y0, "pointermove", mod);
        await dispatchAt(key, x0, y0, "pointerdown", mod);
        await dispatchAt(key, (x0 + x1) / 2, (y0 + y1) / 2, "pointermove", mod);
        await dispatchAt(key, x1, y1, "pointermove", mod);
        await dispatchAt(key, x1, y1, "pointerup", mod);
      };

      if (spec.mode === "linked_pos") {
        // Row k is mark k of u, p and labels. u and labels share the left axis, p is on the right.
        await hoverPartners("hover-outlines-partners", "u", 0, { circles: [["p", 0]], rects: 1 });
        await leave("leave-clears-partners", 1, 1);
        await step("click-picks-row-everywhere", click("u", 0), [0], ["u:0", "p:0", "labels:0"]);
        await step("click-other-panel-adds", click("p", 2), [0, 2], ["u:0", "p:0", "labels:0", "u:2", "p:2", "labels:2"]);
        await step("click-label-takes-out", click("labels", 0), [2], ["u:2", "p:2", "labels:2"]);
        // A faded mark's partners lose their fade while it is hovered.
        await hoverPartners("hover-lifts-partner-fade", "p", 1, { circles: [["u", 1]], rects: 1, lift: ["u:1", "labels:1"] });
        await leave("leave-restores-fade", 1, 1);
        await step("box-in-right-panel-adds", () => boxDrag([at("p", 0), at("p", 1)]), [2, 0, 1],
          ["u:0", "p:0", "labels:0", "u:1", "p:1", "labels:1", "u:2", "p:2", "labels:2"], true);
        {
          const e = { x: (at("u", 0).x + at("u", 1).x) / 2, y: at("u", 0).y };
          await mouseClickAt(key, e.x, e.y);
          t = await waitSame(out, t, `${key}/empty-click-keeps`);
          passed.push(`${key}/empty-click-keeps`);
        }
        await step("escape-clears", () => page.keyboard.press("Escape"), [], []);
        await step("undo-puts-rows-back", () => page.keyboard.press("ControlOrMeta+z"), [2, 0, 1],
          ["u:0", "p:0", "labels:0", "u:1", "p:1", "labels:1", "u:2", "p:2", "labels:2"], true);
        // A box that starts on a held mark takes out the rows it covers.
        await step("box-on-held-takes-out", async () => {
          const a = at("u", 1), b = at("u", 0);
          await dispatchAt(key, a.x, a.y, "pointermove");
          await dispatchAt(key, a.x, a.y, "pointerdown");
          await dispatchAt(key, (a.x + b.x) / 2 - pad, (a.y + b.y) / 2 + pad, "pointermove");
          await dispatchAt(key, b.x - pad, b.y + pad, "pointermove");
          await dispatchAt(key, b.x - pad, b.y + pad, "pointerup");
        }, [2], ["u:2", "p:2", "labels:2"], true);
        await step("escape-clears-again", () => page.keyboard.press("Escape"), [], []);
      } else if (spec.mode === "linked_keys") {
        // Row k is cell c(k+1): A holds c1, c2; B holds c3, c4; `every` draws c4, c3, c2, c1.
        const leg = byId.legend;
        if (!leg) throw new Error(`${key}: no legend layer`);
        await hoverPartners("hover-outlines-keyed-partner", "A", 1, { circles: [["every", 2]] });
        await leave("leave-clears-partners", 1, 1);
        // The case binds only `cells`, so the legend sits outside the bind value and keeps its click.
        if (!leg.events.includes("click")) throw new Error(`${key}: the legend takes no click under bind = :cells`);
        passed.push(`${key}/legend-keeps-click-under-bind`);
        await step("click-picks-cell", click("A", 0), [0], ["A:0", "every:3"]);
        // B holds none of the picks and still fades: every plot of the group fades.
        const fading = await page.evaluate((k) => {
          const span = document.querySelector(`#coords_${k}`);
          const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
          let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
          return [...sr.querySelectorAll(".masque-fade")].flatMap((w) => (w.dataset.layers ? w.dataset.layers.split(",") : []));
        }, key);
        if (!fading.includes("B")) throw new Error(`${key}: fading ${JSON.stringify(fading)} leaves out B, a member with no picks`);
        passed.push(`${key}/unpicked-member-fades`);
        await step("click-other-panel-adds", click("every", 0), [0, 3], ["A:0", "every:3", "B:1", "every:0"]);
        const entry = (j) => () => { const p = hitPoint(leg, j); return dispatchAt(key, p.x, p.y, "click"); };
        const ia = leg.links.findIndex((ls) => ls.includes("A"));
        await step("legend-picks-cluster", entry(ia), [0, 1], ["A:0", "A:1", "every:3", "every:2"]);
        // The legend sits outside the bind value: after an undo, the same entry picks again.
        await step("undo-legend-pick", () => page.keyboard.press("ControlOrMeta+z"), [0, 3], ["A:0", "every:3", "B:1", "every:0"]);
        await step("legend-picks-after-undo", entry(ia), [0, 1], ["A:0", "A:1", "every:3", "every:2"]);
        await step("legend-again-takes-out", entry(ia), [], []);
        await step("click-picks-again", click("B", 0), [2], ["B:0", "every:1"]);
        await step("ctrl-legend-adds", () => { const p = hitPoint(leg, ia); return dispatchAt(key, p.x, p.y, "click", { ctrlKey: true }); }, [2, 0, 1],
          ["B:0", "every:1", "A:0", "A:1", "every:3", "every:2"]);
        await step("box-adds-cells", () => boxDrag([at("every", 0)]), [2, 0, 1, 3],
          ["A:0", "A:1", "B:0", "B:1", "every:0", "every:1", "every:2", "every:3"], true);
        await mouseClickAt(key, (at("A", 0).x + at("A", 1).x) / 2, at("A", 0).y - 60);
        await step("escape-clears", () => page.keyboard.press("Escape"), [], []);
      } else {
        await step("click-picks-row-in-both", click("u", 0), [0], ["u:0", "p:0"]);
        await step("click-partner-lets-go", click("p", 0), [], []);
        await step("click-other-row", click("p", 1), [1], ["u:1", "p:1"]);
        await step("click-replaces", click("u", 2), [2], ["u:2", "p:2"]);
        await step("empty-click-clears", () => dispatchAt(key, (at("p", 0).x + at("p", 1).x) / 2, at("p", 1).y + 60, "click"), [], []);
      }
      await dispatchAt(key, 1, 1, "pointermove");
      console.error(`OK  ${key} — ${t.slice(0, 160)}`);
      continue;
    }

    // Marquee and legend picks under `select = :many` (#335, #358). Left axis (no view): a
    // drag adds the marks inside, with or without Ctrl, and one starting on a picked mark takes
    // out what it covers; a legend click picks every mark of `a`. Right axis (pan view):
    // Alt-drag picks, a plain drag pans and picks nothing. Mid-drag the box is the ROI outline
    // recipe (1px chrome, no fill); on release it is gone. Each step checks host.value, the
    // printed `@bind` value, and how many picks are drawn.
    if (spec.mode === "marquee") {
      const la = layers.find((l) => l.id === "a"), lb = layers.find((l) => l.id === "b");
      const leg = layers.find((l) => l.links?.some((ls) => ls.includes("a")));
      if (!la?.many || !lb?.many) throw new Error(`${key}: a/b ship no many flag`);
      if (!leg) throw new Error(`${key}: no legend entry linked to a`);
      const pa = [0, 1, 2].map((i) => hitPoint(la, i)), pb = [0, 1, 2].map((i) => hitPoint(lb, i));
      const held = async () => {
        const v = (await inspect(key)).bondAll ?? {};
        return { a: v.a?.items?.map((i) => i.index) ?? null, b: v.b?.items?.map((i) => i.index) ?? null };
      };
      const boxNow = () => page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        const r = sr.querySelector("rect.masque-marquee");
        if (!r) return null;
        const cs = getComputedStyle(r);
        return { svg: r.closest("svg").getAttribute("class"), stroke: cs.stroke, fill: cs.fill, width: parseFloat(cs.strokeWidth), w: Number(r.getAttribute("width")) };
      }, key);
      const drag = async (from, to, mod, checkBox) => {
        await dispatchAt(key, from.x, from.y, "pointermove", mod);
        await dispatchAt(key, from.x, from.y, "pointerdown", mod);
        await dispatchAt(key, (from.x + to.x) / 2, (from.y + to.y) / 2, "pointermove", mod);
        await dispatchAt(key, to.x, to.y, "pointermove", mod);
        const box = await boxNow();
        if (checkBox === true) {
          if (!box || box.svg !== "masque-plain" || box.fill !== "none" || box.width !== 1 || !(box.w > 0)) throw new Error(`${key}: mid-drag box ${JSON.stringify(box)}, want the ROI outline`);
          if (!/rgb\((122, 122, 122|200, 200, 200)\)/.test(box.stroke)) throw new Error(`${key}: box stroke ${box.stroke}, want chrome grey`);
        } else if (checkBox === false && box) throw new Error(`${key}: a box drew where the drag should pan`);
        await dispatchAt(key, to.x, to.y, "pointerup", mod);
        await page.evaluate(([k, x, y, md]) => {
          const span = document.querySelector(`#coords_${k}`);
          const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
          let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
          const b = host.querySelector("img, canvas").getBoundingClientRect();
          const s = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
          sr.querySelector(".surface").dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, cancelable: true, clientX: b.left + x * s, clientY: b.top + y * s, ...md }));
        }, [key, to.x, to.y, mod]);
        if (await boxNow()) throw new Error(`${key}: the box stayed after release`);
      };
      const v0 = await textOf(`#bond_${key}`);
      let h = await held();
      if (JSON.stringify(h) !== JSON.stringify({ a: [], b: [] })) throw new Error(`${key}: mount value ${JSON.stringify(h)}`);
      passed.push(`${key}/empty-at-mount`);
      let t = v0;
      const step = async (what, act, want, wantSel) => {
        await act();
        t = await waitChange(`#bond_${key}`, t, `${key}/${what}`);
        h = await held();
        if (JSON.stringify(h) !== JSON.stringify(want)) throw new Error(`${key}/${what}: host.value ${JSON.stringify(h)}, want ${JSON.stringify(want)}`);
        const na = [...t.matchAll(/ElementEvent\(:a, /g)].length, nb = [...t.matchAll(/ElementEvent\(:b, /g)].length;
        if (na !== want.a.length || nb !== want.b.length) throw new Error(`${key}/${what}: @bind value ${JSON.stringify(t)}`);
        const sel = (await dispatchAt(key, 1, 1, "pointermove")).sel;
        if (wantSel !== null && sel !== wantSel) throw new Error(`${key}/${what}: g.sel=${sel}, want ${wantSel}`);
        passed.push(`${key}/${what}`);
      };
      const pad = 30;
      // a closed pick draws 2 shapes (fill + edge)
      await step("drag-picks-inside", () => drag({ x: pa[0].x - pad, y: pa[1].y - pad }, { x: pa[1].x + pad, y: pa[0].y + pad }, {}, true), { a: [0, 1], b: [] }, 4);
      await step("ctrl-drag-adds", () => drag({ x: pa[2].x - pad, y: pa[2].y - pad }, { x: pa[2].x + pad, y: pa[2].y + pad }, { ctrlKey: true }, true), { a: [0, 1, 2], b: [] }, 6);
      await step("drag-on-picked-removes", () => drag({ x: pa[1].x, y: pa[1].y }, { x: pa[2].x + pad, y: pa[2].y + pad }, {}, true), { a: [0], b: [] }, 2);
      await step("drag-adds", () => drag({ x: pa[2].x - pad, y: pa[2].y - pad }, { x: pa[2].x + pad, y: pa[2].y + pad }, {}, true), { a: [0, 2], b: [] }, 4);
      const e = hitPoint(leg, leg.links.findIndex((ls) => ls.includes("a")));
      await step("legend-click-picks-plot", () => dispatchAt(key, e.x, e.y, "click"), { a: [0, 1, 2], b: [] }, null);
      // The entry's own field decides: clicked again it turns off and its marks go with it.
      await step("legend-click-again-takes-out", () => dispatchAt(key, e.x, e.y, "click"), { a: [], b: [] }, null);
      await step("legend-click-picks-again", () => dispatchAt(key, e.x, e.y, "click"), { a: [0, 1, 2], b: [] }, null);
      await step("alt-drag-on-view", () => drag({ x: pb[0].x - pad, y: pb[1].y - pad }, { x: pb[1].x + pad, y: pb[0].y + pad }, { altKey: true }, true), { a: [0, 1, 2], b: [0, 1] }, null);
      const before = await textOf(`#bond_${key}`);
      await drag({ x: pb[2].x + 10, y: pb[1].y }, { x: pb[2].x - 60, y: pb[1].y + 40 }, {}, false);
      await new Promise((r) => setTimeout(r, 1500));
      h = await held();
      if (JSON.stringify(h) !== JSON.stringify({ a: [0, 1, 2], b: [0, 1] }) || (await textOf(`#bond_${key}`)) !== before) throw new Error(`${key}: a plain drag on the view changed the picks: ${JSON.stringify(h)}`);
      passed.push(`${key}/plain-drag-pans`);
      console.error(`OK  ${key} — ${before.slice(0, 160)}`);
      continue;
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
        if (!layers.some((l) => mountBond.includes(`:${jlLayerText(l.id)},`))) {
          throw new Error(`${key}: mount bond ${JSON.stringify(mountBond)} doesn't name any of this widget's own layers`);
        }
      } else if (!mountBond.includes(`:${jlLayerText(spec.layerId)}`)) {
        throw new Error(`${key}: mount bond ${JSON.stringify(mountBond)} doesn't name layer :${spec.layerId}`);
      }
      passed.push(`${key}/hydrated-bond`);
    } else if (/=\s*nothing$/.test(mountBond)) {
      passed.push(`${key}/hydrated-bond-control`);
    } else if (/Event\(/.test(mountBond) && layers.some((l) => mountBond.includes(`:${jlLayerText(l.id)},`))) {
      // A prior kind_sweep.mjs run against this SAME warm Pluto session leaves the bond holding
      // its last value — Pluto's normal reconnect hydration (a bond keeps its value across a
      // page reload), not a regression of the mount.ts "force host.value = null" bug the check
      // above guards against. A `nothing`-baked spec can legitimately mount non-`nothing` on a
      // warm re-run (#114): accept any well-formed leftover naming one of THIS widget's own
      // layers — a `selects`-ROI's bond names its TARGET layer (e.g. `:pts`), never its own
      // `:roi` id, so this checks membership in `layers`, not `spec.layerId` specifically. The
      // trailing comma anchors on the id boundary the event `show` always emits right
      // after it (`ElementEvent(:id, index, …)`) — layer ids can nest (`lines`/`lines_2`,
      // `scatter`/`scatter_dark`), so an unanchored `includes` could false-match a leftover that
      // actually names neither this widget's layer nor any real one (e.g. `:linesX,`).
      passed.push(`${key}/hydrated-bond-control-warm`);
    } else {
      throw new Error(
        `${key}: mount bond ${JSON.stringify(mountBond)} is neither "nothing" nor a recognizable ` +
        `leftover naming one of this widget's own layers (warm-session carryover, #114)`,
      );
    }

    // A threshold, a box, or a colorbar is a field of its own (#335). Its field starts at the
    // control's value (`spec.owner.initial`, a regex on the whole value, #bond), and another layer
    // of the same widget shows its tooltip. With `otherClicks` that layer is a field too: a click
    // on it sets its own field and leaves the control's. Without (a `selects` box's target), it
    // takes no click: the overlay drops its "click" event, and a real click leaves the value.
    let ownerMountAll = null;
    if (spec.owner) {
      const mountAll = await textOf(`#bond_${key}`);
      ownerMountAll = mountAll;
      if (!new RegExp(spec.owner.initial).test(mountAll)) {
        throw new Error(`${key}: mount value ${JSON.stringify(mountAll)}, want /${spec.owner.initial}/`);
      }
      passed.push(`${key}/owner-initial-bond`);
      const other = layers.find((l) => l.id === spec.owner.layer);
      if (!other) throw new Error(`${key}: no layer "${spec.owner.layer}" in ${layers.map((l) => l.id)}`);
      const otherClicks = !!spec.owner.otherClicks;
      if (other.events.includes("click") !== otherClicks || !other.events.includes("hover")) {
        throw new Error(`${key}: :${other.id} events ${JSON.stringify(other.events)}, want hover ${otherClicks ? "and" : "without"} click`);
      }
      const op = hitPoint(other, 0);
      const hov = await dispatchAt(key, op.x, op.y, "pointermove");
      if (!hov.show || !hov.text) throw new Error(`${key}: hovering :${other.id} showed no tooltip ${JSON.stringify(hov)}`);
      passed.push(`${key}/owner-other-hover`);
      // A selecting box starts with the marks inside its bounds highlighted, as after a release (#330).
      if (spec.owner.startsSelected) {
        if (!(hov.sel > 0)) throw new Error(`${key}: no starting selection drawn at mount (${hov.sel})`);
        passed.push(`${key}/owner-start-highlight`);
      }
      const clicked = await dispatchAt(key, op.x, op.y, "click");
      if (otherClicks) {
        // The other layer's field takes the pick; the control's field (#out) keeps its value.
        const afterAll = await waitChange(`#bond_${key}`, mountAll, `${key}/owner-other-click`);
        const want = other.kind === "grid" ? `${other.id} = GridCellEvent(:${other.id}, i = 1, j = 1` : `${other.id} = ElementEvent(:${other.id}, 1,`;
        if (!afterAll.includes(want)) throw new Error(`${key}: clicking :${other.id} gave ${JSON.stringify(afterAll)}, want ${JSON.stringify(want)}`);
        if (!new RegExp(spec.owner.initial).test(afterAll)) {
          throw new Error(`${key}: clicking :${other.id} changed the control's field: ${JSON.stringify(afterAll)}`);
        }
        const afterOut = await textOf(`#out_${key}`);
        if (afterOut !== mountBond) throw new Error(`${key}: clicking :${other.id} changed #out ${JSON.stringify(mountBond)} -> ${JSON.stringify(afterOut)}`);
        if (!(clicked.sel > hov.sel)) throw new Error(`${key}: clicking :${other.id} drew no pick (${hov.sel} -> ${clicked.sel})`);
        const keys = Object.keys((await inspect(key)).bondAll ?? {}).sort();
        if (!keys.includes(other.id) || !keys.includes(layer.id)) {
          throw new Error(`${key}: host.value keys ${JSON.stringify(keys)}, want :${other.id} and :${layer.id}`);
        }
        passed.push(`${key}/owner-other-click-own-field`);
        // Take the pick back, so the checks below start from the control's own value.
        await dispatchAt(key, op.x, op.y, "click");
        await waitChange(`#bond_${key}`, afterAll, `${key}/owner-other-unclick`);
      } else {
        await new Promise((r) => setTimeout(r, 1500));
        const afterAll = await textOf(`#bond_${key}`);
        if (afterAll !== mountAll) throw new Error(`${key}: clicking :${other.id} changed the value ${JSON.stringify(mountAll)} -> ${JSON.stringify(afterAll)}`);
        if (clicked.sel !== hov.sel) throw new Error(`${key}: clicking :${other.id} changed the selection (${hov.sel} -> ${clicked.sel})`);
        passed.push(`${key}/owner-other-no-click`);
      }
      await dispatchAt(key, 1, 1, "pointermove");
      console.error(`OK  ${key}/owner — starts ${mountAll.slice(0, 120)}, :${other.id} ${otherClicks ? "its own field" : "hover-only"}`);
    }
    if (spec.mode === "owner") continue;

    if (key === "view3d_linked") {
      // `linkcameras!` (#362): orbiting the left panel turns the right one. The right panel's
      // picture must change and its points must answer where they are drawn now, not where
      // they were at mount.
      const pts2 = layers.find((l) => l.id === "pts2");
      if (!pts2) throw new Error(`${key}: no pts2 layer`);
      const hostRect = () => page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        host.scrollIntoView({ block: "center", inline: "nearest" });
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        const b = host.querySelector("img, canvas").getBoundingClientRect();
        const vb = sr.querySelector("svg.masque-plain").viewBox.baseVal;
        return { left: b.left, top: b.top, s: b.width / vb.width, w: vb.width, h: vb.height };
      }, key);
      const stamp = () => page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        return host?.dataset.masqueGestureFrame ? JSON.parse(host.dataset.masqueGestureFrame) : null;
      }, key);
      // The right half of the image, where the follower is drawn.
      const shotRight = async () => {
        const r = await hostRect();
        return page.screenshot({ clip: { x: r.left + (r.w / 2) * r.s, y: r.top, width: (r.w / 2) * r.s, height: r.h * r.s } });
      };
      const old = [0, 1].map((i) => hitPoint(pts2, i));
      for (const p of old) {
        const r = await dispatchAt(key, p.x, p.y, "pointermove");
        if (!r.show) throw new Error(`${key}: the follower's point at ${JSON.stringify(p)} should hover before the orbit`);
      }
      await dispatchAt(key, 1, 1, "pointermove");
      const shot0 = await shotRight();
      const s0 = await stamp();
      const g = layer.geometry;
      const c = { x: g.x + g.w / 2, y: g.y + g.h / 2 };
      await drag(key, c.x, c.y, c.x + 90, c.y + 20, false);
      const tries = backend === "webgl" ? 50 : 25;
      const delayMs = backend === "webgl" ? 300 : 200;
      let st = null;
      for (let i = 0; i < tries; i++) {
        await new Promise((r) => setTimeout(r, delayMs));
        st = await stamp();
        if (st && st.n > (s0?.n ?? 0) && st.settle === true && Math.abs(st.azimuth - g.azimuth) > 0.05) break;
        st = null;
      }
      if (!st) throw new Error(`${key}: no settled orbit frame landed (last ${JSON.stringify(await stamp())})`);
      await dispatchAt(key, 1, 1, "pointermove");
      await new Promise((r) => setTimeout(r, backend === "webgl" ? 600 : 100));
      const shot1 = await shotRight();
      if (Buffer.compare(shot0, shot1) === 0) throw new Error(`${key}: the follower panel's picture did not change after the orbit`);
      passed.push(`${key}/follower-redrawn`);
      // The corner point (index 1, at (4, 4, 4)) moves on screen when the camera turns; its old
      // spot must go quiet, and a scan of the right panel must find it again somewhere else.
      const moved = old[1];
      const rOld = await dispatchAt(key, moved.x, moved.y, "pointermove");
      const rect = await hostRect();
      // A grid finer than the marker's hit radius over the right panel, stopping at the first hit
      // away from the old spot. Probed nearest-first: an orbit moves the point a short way, and
      // each probe waits a frame, so a top-left-first scan took 3.5–5 min on WebGL.
      const hits = [];
      const step = Math.max(4, Math.floor(moved.r));
      const grid = [];
      for (let y = 4; y < rect.h; y += step) {
        for (let x = rect.w / 2 + 4; x < rect.w; x += step) grid.push({ x, y, d: Math.hypot(x - moved.x, y - moved.y) });
      }
      grid.sort((a, b) => a.d - b.d);
      let far = null;
      for (const { x, y, d } of grid) {
        const r = await dispatchAt(key, x, y, "pointermove");
        if (!r.show || !/\bx 4\b.*\by 4\b.*\bz 4\b/.test(r.text ?? "")) continue;
        hits.push({ x, y });
        if (d > moved.r + 6) { far = { x, y, text: r.text }; break; }
      }
      if (!far) throw new Error(`${key}: the follower's corner point answers nowhere new after the orbit (old spot show=${rOld.show}; ${hits.length} hits near the old spot)`);
      passed.push(`${key}/follower-hits-moved`);
      await dispatchAt(key, 1, 1, "pointermove");
      // Wheel a1, then a2, then a1. Each zoom must start from the limits both panels share now,
      // so the third is narrower than the second; starting from a1's own earlier request would
      // throw a2's zoom away. That a1's base moved at all also shows a2's zoom reached a1.
      const g2 = layers.find((l) => l.id === "view2")?.geometry;
      if (!g2) throw new Error(`${key}: no view2 layer`);
      const wheelOn = async (vg, prev) => {
        await page.evaluate(([k, ix, iy]) => {
          const span = document.querySelector(`#coords_${k}`);
          const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
          let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
          const b = host.querySelector("img, canvas").getBoundingClientRect();
          const sc = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
          sr.querySelector(".surface").dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: b.left + ix * sc, clientY: b.top + iy * sc, deltaY: -300 }));
        }, [key, vg.x + vg.w / 2, vg.y + vg.h / 2]);
        for (let i = 0; i < tries; i++) {
          await new Promise((r) => setTimeout(r, delayMs));
          const s2 = await stamp();
          if (s2 && s2.n > prev.n && s2.settle === true && Array.isArray(s2.limits)) return s2;
        }
        throw new Error(`${key}: no settled zoom frame (last ${JSON.stringify(await stamp())})`);
      };
      const wx = (l) => l[1] - l[0];
      const z1 = await wheelOn(g, st);
      const z2 = await wheelOn(g2, z1);
      const z3 = await wheelOn(g, z2);
      if (!(wx(z2.limits) < 0.95 * wx(z1.limits))) throw new Error(`${key}: the second panel's zoom did not start from the first's (${wx(z1.limits)} -> ${wx(z2.limits)})`);
      if (!(wx(z3.limits) < 0.95 * wx(z2.limits))) throw new Error(`${key}: zooming the first panel again dropped the second panel's zoom (${wx(z1.limits)}, ${wx(z2.limits)}, ${wx(z3.limits)})`);
      passed.push(`${key}/alternating-zoom`);
      console.error(`OK  ${key} — orbit az ${g.azimuth.toFixed(2)} -> ${st.azimuth.toFixed(2)}, follower redrawn, its point answers at ${JSON.stringify(far)}; zoom widths ${[z1, z2, z3].map((z) => wx(z.limits).toFixed(3)).join(" > ")}`);
      continue;
    }

    if (key === "view3d") {
      // Axis3 zoom and pan (#321). The wheel scales the limits about their center, so the
      // middle point stays put on screen and the corner leaves the limits: it is clipped from
      // the picture and must stop hitting. Shift+drag then pans the limits; a plain drag orbits.
      const stamp3 = async () => {
        const raw = await page.evaluate((k) => {
          const span = document.querySelector(`#coords_${k}`);
          const hosts = [...document.querySelectorAll(".ip-host")];
          const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
          return host?.dataset.masqueGestureFrame ?? "";
        }, key);
        return raw ? JSON.parse(raw) : null;
      };
      const waitStamp = async (after, what, ok) => {
        const tries = backend === "webgl" ? 50 : 25;
        const delayMs = backend === "webgl" ? 300 : 200;
        for (let i = 0; i < tries; i++) {
          await new Promise((r) => setTimeout(r, delayMs));
          const st = await stamp3();
          if (st && st.n > (after?.n ?? 0) && st.settle === true && ok(st)) return st;
        }
        throw new Error(`${key}-${what}: no settled gesture frame with the expected camera (last ${JSON.stringify(await stamp3())})`);
      };
      const pts3 = layers.find((l) => l.id === "pts");
      if (!pts3) throw new Error(`${key}: no pts layer`);
      const inP = hitPoint(pts3, spec.inside), outP = hitPoint(pts3, spec.outside);
      const line3 = layers.find((l) => l.id === "line");
      if (!line3) throw new Error(`${key}: no line layer`);
      const lineP = { x: line3.geometry[0][2], y: line3.geometry[0][3] };   // the vertex inside the zoom
      await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1)?.scrollIntoView({ block: "center", inline: "nearest" });
      }, key);
      for (const [p, what] of [[inP, "inside"], [outP, "outside"], [lineP, "line"]]) {
        const r = await dispatchAt(key, p.x, p.y, "pointermove");
        if (!r.show) throw new Error(`${key}: the ${what} point should hover before the zoom`);
      }
      const before = await textOf(`#out_${key}`);
      const g = layer.geometry;
      const lim0 = g.limits;
      if (!Array.isArray(lim0) || lim0.length !== 6) throw new Error(`${key}: view geometry has no Axis3 limits: ${JSON.stringify(g)}`);
      const s0 = await stamp3();
      const prevented = await page.evaluate(([k, ix, iy]) => {
        const span = document.querySelector(`#coords_${k}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        const b = host.querySelector("img, canvas").getBoundingClientRect();
        const s = b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width;
        const ev = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: b.left + ix * s, clientY: b.top + iy * s, deltaY: -600 });
        sr.querySelector(".surface").dispatchEvent(ev);
        return ev.defaultPrevented;
      }, [key, g.x + g.w / 2, g.y + g.h / 2]);
      if (!prevented) throw new Error(`${key}-wheel: the wheel was not taken by the Axis3 view`);
      const w = (l, i) => l[2 * i + 1] - l[2 * i];
      const zs = await waitStamp(s0, "wheel", (st) => Array.isArray(st.limits) && [0, 1, 2].every((i) => w(st.limits, i) < 0.75 * w(lim0, i)));
      passed.push(`${key}/wheel-zoom`);
      const rOut = await dispatchAt(key, outP.x, outP.y, "pointermove");
      if (rOut.show) throw new Error(`${key}: the corner point is outside the zoomed limits but still hovers (${rOut.text})`);
      const rIn = await dispatchAt(key, inP.x, inP.y, "pointermove");
      if (!rIn.show) throw new Error(`${key}: the middle point should still hover after a center zoom`);
      // The data is symmetric about the middle point, so the limits' center projects there and a
      // center zoom by k moves every visible point k times farther from it on screen. The line's
      // ends are now outside the limits; its middle vertex is inside and must still hover.
      const k = w(lim0, 0) / w(zs.limits, 0);
      const lineZ = { x: inP.x + k * (lineP.x - inP.x), y: inP.y + k * (lineP.y - inP.y) };
      const rLine = await dispatchAt(key, lineZ.x, lineZ.y, "pointermove");
      if (!rLine.show) throw new Error(`${key}: the line still drawn inside the zoomed limits should hover at ${JSON.stringify(lineZ)}`);
      passed.push(`${key}/zoom-clips-hits`);
      await drag(key, inP.x, inP.y, inP.x + 80, inP.y, true);
      const ps = await waitStamp(zs, "shift-drag", (st) => Array.isArray(st.limits) &&
        st.limits.some((v, i) => Math.abs(v - zs.limits[i]) > 1e-3 * w(zs.limits, Math.floor(i / 2))) &&
        [0, 1, 2].every((i) => Math.abs(w(st.limits, i) - w(zs.limits, i)) < 1e-6 * Math.abs(w(zs.limits, i)) + 1e-9) &&
        Math.abs(st.azimuth - zs.azimuth) < 1e-9);
      passed.push(`${key}/shift-drag-pan`);
      await drag(key, inP.x, inP.y, inP.x + 80, inP.y, false);
      await waitStamp(ps, "orbit", (st) => Math.abs(st.azimuth - ps.azimuth) > 0.05);
      passed.push(`${key}/drag-orbit`);
      const after = await textOf(`#out_${key}`);
      if (after !== before) throw new Error(`${key}: a view gesture must not commit (${before} -> ${after})`);
      console.error(`OK  ${key} — wheel zoom ${JSON.stringify(zs.limits)}, clipped corner, pan, orbit`);
      continue;
    }

    if (spec.mode === "drag" && spec.layerKind === "view") {
      // #102/§12.3: a view gesture commits nothing anymore — the OLD assertion here waited for
      // #out_view's bond text to change and would now fail for the right reason (nothing ever
      // commits) for the WRONG reason (the test still expects a commit). Asserting "the bond
      // stayed put" alone would pass just as well if the drag did nothing at all — the #99
      // failure shape (a green assertion unable to fail for the right reason) — so this checks
      // three things: the bond truly didn't move, AND mount.ts's `host.dataset.masqueGestureFrame`
      // stamp — written atomically in the same block that swaps the frame + manifest — advanced
      // with a well-formed new camera, proving a REAL frame landed from the CURRENT drag rather
      // than sampling stale state.
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

      const tries = backend === "webgl" ? 50 : 25;
      const delayMs = backend === "webgl" ? 300 : 200;
      let stampAfter = stampBefore;
      for (let i = 0; i < tries && stampAfter === stampBefore; i++) {
        await new Promise((r) => setTimeout(r, delayMs));
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

      // #363: an axis tied by `linkaxes!` lands at the pan's limits too (it used to snap back).
      const links = layer.geometry?.links ?? [];
      for (const l of links) {
        const lim = cam[`linked:${l.axis}`];
        const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
        // Only a shared dimension follows: a `linkxaxes!` twin keeps its own y.
        const xOk = !l.x || (close(lim?.[0], cam.xmin) && close(lim?.[1], cam.xmax));
        const yOk = !l.y || (close(lim?.[2], cam.ymin) && close(lim?.[3], cam.ymax));
        if (!Array.isArray(lim) || !xOk || !yOk) {
          throw new Error(`${key}-drag: linked axis ${l.axis} did not follow the pan: ${stampAfter}`);
        }
      }
      if (links.length) {
        passed.push(`${key}/linked-pan`);
        console.error(`OK  ${key}/linked — ${links.length} linked axis followed the pan`);
      }

      if (layer.geometry && layer.geometry.mode === "pan") {
        // #379: a mark on each axis off the pan axis. The drag above moved a linked axis's
        // marks off this page's manifest, so there the probe is its pick's ring, which the
        // overlay draws where that axis now has the mark; an unlinked axis's first mark has not
        // moved since the page was built.
        const viewAxis = layer.axis;
        const linkedAxes = links.map((l) => l.axis);
        // #391: axes whose pixels sit in the pan's sliding copy (a twin in the same cell, an
        // inset) move with the pan axis, so their marks are probed by their picks' rings.
        const withPan = [...new Set((spec.previewWithPan ?? []).map((id) => layers.find((l) => l.id === id)?.axis))];
        if (withPan.some((a) => !a)) throw new Error(`${key}: previewWithPan names a layer not on the page: ${JSON.stringify(spec.previewWithPan)}`);
        const offAxis = layers.filter((l) => l.kind === "circles" && l.axis !== viewAxis && !linkedAxes.includes(l.axis) && !withPan.includes(l.axis))
          .map((l) => ({ axis: l.axis, x: l.geometry[0], y: l.geometry[1] }));
        const zoom = await page.evaluate(([k, ix, iy, marks, pickTip, panAxis]) => {
          const span = document.querySelector(`#coords_${k}`);
          const hosts = [...document.querySelectorAll(".ip-host")];
          const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
          let sr = null;
          host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
          const surface = sr.querySelector(".surface");
          const b = host.querySelector("img, canvas").getBoundingClientRect();
          const vb = sr.querySelector("svg.masque-plain").viewBox.baseVal;
          const s = b.width / vb.width;
          const ev = new WheelEvent("wheel", {
            bubbles: true, cancelable: true,
            clientX: b.left + ix * s, clientY: b.top + iy * s, deltaY: -120,
          });
          surface.dispatchEvent(ev);
          const base = host.querySelector("img, canvas");
          const engaged = {
            photo: host.dataset.masquePhoto || "",
            clip: !!host.querySelector(".masque-data-clip"),
            windows: host.querySelectorAll(".masque-data-clip").length,
            baseTransform: base?.style.transform || "",
          };
          // #368: each axis's selection home, with the matrix and clip the preview gave it.
          const homes = [...sr.querySelectorAll("svg.masque-edge g.masque-clip[data-axis]")]
            .filter((c) => c.querySelector(":scope > g.masque-photo > g.sel"))
            .map((c) => {
              const id = /url\(#(.+)\)/.exec(c.getAttribute("clip-path") ?? "")?.[1];
              const r = id ? sr.getElementById(id)?.firstElementChild : null;
              return {
                axis: c.dataset.axis,
                transform: c.firstElementChild.getAttribute("transform"),
                clip: r ? ["x", "y", "width", "height"].map((a) => Number(r.getAttribute(a))) : null,
                picks: c.querySelectorAll("g.sel > *").length,
              };
            });
          // A closed mark's pick is on its axis's fade canvases (#394), moved and clipped with
          // the same preview.
          const fadeWraps = [...sr.querySelectorAll(".masque-fade[data-axis]")];
          const fades = fadeWraps.map((w) => ({
            axis: w.dataset.axis,
            transform: w.querySelector("canvas")?.style.transform ?? "",
            clip: w.style.clipPath,
            picks: w.masqueFade?.picked.length ?? 0,
          }));
          // #379: hover mid-preview finds a mark where its own axis draws it. A pick shows its
          // tooltip and draws no hover ring (hover-on-selected), any other mark draws one.
          const tip = () => {
            const el = sr.querySelector(".masque-tip");
            return el?.classList.contains("show") ? el.textContent : null;
          };
          // Synchronous, so the preview is still live when each probe is read (a WebGL frame
          // can land within two animation frames). A move right after another is coalesced
          // to an animation frame; leaving the surface first drops that wait.
          const hoverAt = (x, y) => {
            surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
            surface.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y }));
          };
          const midHover = [];
          for (const c of sr.querySelectorAll("svg.masque-edge g.masque-clip[data-axis]")) {
            const ring = c.querySelector(":scope > g.masque-photo > g.sel > *");
            const moved = !!c.firstElementChild.getAttribute("transform");
            if (!ring || !moved) continue;
            const r = ring.getBoundingClientRect();
            hoverAt(r.left + r.width / 2, r.top + r.height / 2);
            const t = tip();
            midHover.push({ axis: c.dataset.axis, pick: true, hit: !!t && t.startsWith(pickTip), tip: t, live: !!host.dataset.masquePhoto });
          }
          // A fade-drawn pick: its centre on the moved canvas, which covers the axis viewport
          // from its own corner (left/top in percent of the image).
          for (const w of fadeWraps) {
            const cv = w.querySelector("canvas");
            const at = w.masqueFade?.pickedAt ?? [];
            if (!cv || !cv.style.transform || !at.length) continue;
            const r = cv.getBoundingClientRect();
            const ex = (parseFloat(cv.style.left) / 100) * vb.width, ey = (parseFloat(cv.style.top) / 100) * vb.height;
            const [px, py] = at[0];
            hoverAt(r.left + ((px - ex) * r.width) / cv.width, r.top + ((py - ey) * r.height) / cv.height);
            const t = tip();
            midHover.push({ axis: w.dataset.axis, pick: true, hit: !!t && t.startsWith(pickTip), tip: t, live: !!host.dataset.masquePhoto });
          }
          for (const mk of marks) {
            hoverAt(b.left + mk.x * s, b.top + mk.y * s);
            const hit = !!sr.querySelector(`svg g.masque-clip[data-axis="${mk.axis}"] g.hi > *`);
            midHover.push({ axis: mk.axis, pick: false, hit, tip: tip(), live: !!host.dataset.masquePhoto });
          }
          // #391: each axis's threshold lines and ROI boxes, in that axis's chrome group, with
          // the matrix the preview gave it; and a hover on each moved line, where it is drawn.
          const chrome = [...sr.querySelectorAll("svg.masque-plain g.masque-clip[data-axis]")]
            .filter((c) => c.querySelector(":scope > g.masque-photo > g.chrome > *"))
            .map((c) => {
              const g = c.querySelector(":scope > g.masque-photo:has(> g.chrome)");
              const lines = [...g.querySelectorAll("line.masque-threshold-line")];
              const moved = !!g.getAttribute("transform");
              const hovered = moved ? lines.map((ln) => {
                const r = ln.getBoundingClientRect();
                hoverAt(r.left + r.width / 2, r.top + r.height / 2);
                return ln.classList.contains("hovered") && !!host.dataset.masquePhoto;
              }) : [];
              return { axis: c.dataset.axis, transform: g.getAttribute("transform"), lines: lines.length, hovered };
            });
          const panHome = homes.find((h) => h.axis === panAxis);
          return {
            homes,
            fades,
            midHover,
            chrome,
            panTransform: panHome?.transform ?? null,
            ...engaged,
            prevented: ev.defaultPrevented,
          };
        }, [key, p.x, p.y, offAxis, spec.previewPickTip ?? "index", viewAxis]);
        if (!zoom.prevented || !zoom.photo || !zoom.clip || zoom.baseTransform) {
          throw new Error(`${key}-wheel: photographic zoom did not engage (${JSON.stringify(zoom)})`);
        }
        // #363: each linked axis's data slides in a window of its own.
        if (zoom.windows !== 1 + links.length) {
          throw new Error(`${key}-wheel: expected ${1 + links.length} sliding windows, got ${zoom.windows}`);
        }
        // #368: a pick on a linked axis keeps its ring through the preview, moved by that axis's
        // own matrix and clipped to that axis's window, not the pan axis's.
        // A fade-drawn pick: its axis's canvases take the same scale as that axis's svg home.
        const scaleOf = (t) => Number(/scale\(([-\d.e]+)/.exec(t ?? "")?.[1]);
        for (const l of links) {
          const home = zoom.homes.find((h) => h.axis === l.axis);
          // The page shows the clip as Float32 in its shortest form (515.90247); the overlay
          // holds the full value (515.9024658…).
          const sameClip = home?.clip && home.clip.every((v, i) => Math.abs(v - l.clip[i]) < 1e-3);
          const fade = zoom.fades.find((f) => f.axis === l.axis);
          const fadeOk = fade && fade.picks >= 1 && fade.clip && Math.abs(scaleOf(fade.transform) - scaleOf(home?.transform)) < 1e-3;
          if (!home || !home.transform || !sameClip || (home.picks < 1 && !fadeOk)) {
            throw new Error(`${key}-wheel: linked axis ${l.axis}'s ring is not on its own matrix and window ${JSON.stringify(l.clip)}: ${JSON.stringify({ homes: zoom.homes, fades: zoom.fades })}`);
          }
        }
        // #379: every mid-preview hover above ran while the matrix was still live, on each
        // linked axis's pick and each unlinked axis's mark.
        const probed = (axis) => zoom.midHover.some((h) => h.axis === axis);
        if (zoom.midHover.some((h) => !h.live) || !linkedAxes.every(probed) || !offAxis.every((m) => probed(m.axis))) {
          throw new Error(`${key}-wheel: the mid-preview hover did not run on a live preview: ${JSON.stringify(zoom.midHover)}`);
        }
        if (zoom.midHover.some((h) => !h.hit)) {
          throw new Error(`${key}-wheel: hover mid-preview missed a mark where its own axis draws it: ${JSON.stringify(zoom.midHover)}`);
        }
        // #391: a twin or inset axis's picks and chrome move by the pan axis's own matrix, and
        // a hover on its slid threshold line finds the line.
        if (withPan.length) {
          // A scatter pick is on the axis's fade canvases (#394), which take the pan's scale too.
          const homesOf = (axis) => [...zoom.homes.filter((h) => h.axis === axis), ...zoom.chrome.filter((c) => c.axis === axis)];
          const panScale = scaleOf(zoom.panTransform);
          const bad = withPan.filter((axis) => {
            const hs = homesOf(axis);
            const fs = zoom.fades.filter((f) => f.axis === axis && f.picks > 0);
            return !zoom.panTransform || !hs.length || hs.some((h) => h.transform !== zoom.panTransform) ||
              fs.some((f) => Math.abs(scaleOf(f.transform) - panScale) > 1e-3);
          });
          // Each such axis has a pick, probed above where the pan draws it.
          const unprobed = withPan.filter((axis) => !zoom.midHover.some((h) => h.axis === axis && h.pick));
          if (unprobed.length) throw new Error(`${key}-wheel: no mid-preview pick probe on ${JSON.stringify(unprobed)}: ${JSON.stringify(zoom.midHover)}`);
          const lines = zoom.chrome.filter((c) => withPan.includes(c.axis) && c.lines > 0);
          // A threshold layer named in previewWithPan must be drawn and hover-tested.
          const wantLines = (spec.previewWithPan ?? []).some((id) => layers.find((l) => l.id === id)?.kind === "threshold");
          if (bad.length || (wantLines && !lines.length) || lines.some((c) => c.hovered.length !== c.lines || !c.hovered.every(Boolean))) {
            throw new Error(`${key}-wheel: an axis inside the pan window did not move with it: ${JSON.stringify({ withPan, pan: zoom.panTransform, homes: zoom.homes, chrome: zoom.chrome })}`);
          }
          passed.push(`${key}/preview-with-pan`);
          console.error(`OK  ${key}/preview-with-pan — ${JSON.stringify(zoom.chrome)}`);
        }
        if (zoom.midHover.length) {
          passed.push(`${key}/preview-hover`);
          console.error(`OK  ${key}/preview-hover — ${JSON.stringify(zoom.midHover)}`);
        }
        if (links.length) {
          passed.push(`${key}/linked-ring`);
          console.error(`OK  ${key}/linked-ring — ${JSON.stringify(zoom.homes)}`);
        }
        let photo = zoom.photo;
        let zoomStamp = stampAfter;
        // A settle:false frame can clear the matrix as soon as it matches. The sample is the
        // terminal frame (stamp.settle), once that matrix is gone, and its camera must have zoomed.
        for (let i = 0; i < tries; i++) {
          await new Promise((r) => setTimeout(r, delayMs));
          const snap = await page.evaluate((k) => {
            const span = document.querySelector(`#coords_${k}`);
            const hosts = [...document.querySelectorAll(".ip-host")];
            const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
            return { photo: host?.dataset.masquePhoto || "", stamp: host?.dataset.masqueGestureFrame || "" };
          }, key);
          photo = snap.photo;
          zoomStamp = snap.stamp || zoomStamp;
          if (photo || !snap.stamp) continue;
          let parsed = null;
          try { parsed = JSON.parse(snap.stamp); } catch { parsed = null; }
          if (parsed && parsed.settle === true && parsed.n > cam.n) break;
        }
        if (photo) throw new Error(`${key}-wheel: matrix still applied after the frame (${photo})`);
        if (!zoomStamp || zoomStamp === stampAfter) {
          throw new Error(`${key}-wheel: gesture-channel frame never landed (stamp stayed ${JSON.stringify(stampAfter)})`);
        }
        const zcam = JSON.parse(zoomStamp);
        if (!(zcam.n > cam.n)) throw new Error(`${key}-wheel: gesture frame counter did not advance (${cam.n} -> ${zcam.n})`);
        if (zcam.settle !== true) throw new Error(`${key}-wheel: sampled a settle:false frame (${zoomStamp})`);
        const xSpan = (c) => c.xmax - c.xmin;
        const ySpan = (c) => c.ymax - c.ymin;
        if (!(xSpan(zcam) < xSpan(cam) && ySpan(zcam) < ySpan(cam))) {
          throw new Error(`${key}-wheel: camera limits did not zoom (${stampAfter} -> ${zoomStamp})`);
        }
        passed.push(`${key}/wheel-zoom`);
        console.error(`OK  ${key}/wheel — photo cleared, zoomed gesture frame ${zoomStamp}`);
      }
      continue;
    }

    if (spec.mode === "drag") {
      const p = hitPoint(layer, 0);
      if (spec.layerKind === "threshold") {
        const hover = await dispatchAt(key, p.x, p.y, "pointermove");
        if (hover.cross) throw new Error(`${key}: cross should be off while hovering the threshold line`);
        passed.push(`${key}/cross-off`);
      }
      const before = await textOf(`#out_${key}`);
      // A categorical threshold releases onto another category's row: a ±50 px drag stays in the
      // starting category's bin, so a warm re-run (#114) would commit the text the bond already
      // holds and never change. The target also differs from that leftover category, so the
      // release always changes the bond, and "nearest category" is observable.
      let catTarget = null;
      if (spec.categorical) {
        const t = (await transformsOf(key))[layer.axis];
        const leftover = /category\s*=\s*"([^"]*)"/.exec(before)?.[1];
        const i = (t?.ycats ?? []).findIndex((c) => c !== spec.startCategory && c !== leftover);
        if (i < 0) throw new Error(`${key}: no target category in ${JSON.stringify(t?.ycats)} (start ${spec.startCategory}, leftover ${leftover})`);
        catTarget = { k: i + 1, label: t.ycats[i], y: projectAxisJs(t, t.xlims[0], i + 1).y };
      }
      const ends = catTarget
        ? [[p.x, catTarget.y]]
        : spec.layerKind === "threshold"
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
      const re = spec.layerKind === "roi" ? /:roi|ElementEvent\[|BoundsEvent/i : /:threshold|:thr|ThresholdEvent/i;
      if (!re.test(after)) throw new Error(`${key}-drag: readout mismatch ${JSON.stringify(after).slice(0, 200)}`);
      passed.push(`${key}/drag-bind`);
      // A `selects` box's release sets both of its fields (#335): its bounds (#out) and its
      // target's, which now holds what the moved box contains (points (1, 1) and (3, 3) here,
      // where it started with (3, 3) and (5, 5)).
      if (spec.owner?.startsSelected) {
        const tgt = spec.owner.layer;
        const targetOf = (t) => new RegExp(`${tgt} = (.*), ${spec.layerId} = `).exec(t)?.[1] ?? null;
        const bounds = after.replace(/^[A-Z_]+=/, "");
        let all = await textOf(`#bond_${key}`);
        for (let i = 0; i < 40 && !all.includes(bounds); i++) {
          await new Promise((r) => setTimeout(r, 200));
          all = await textOf(`#bond_${key}`);
        }
        const t0 = targetOf(ownerMountAll ?? ""), t1 = targetOf(all);
        if (!all.includes(bounds) || t0 === null || t1 === null || t1 === t0) {
          throw new Error(`${key}-drag: whole value ${JSON.stringify(all).slice(0, 300)}, want the released bounds and a new :${tgt} (was ${JSON.stringify(t0)})`);
        }
        passed.push(`${key}/drag-sets-target-field`);
        console.error(`OK  ${key}/drag target — ${tgt} = ${t1.slice(0, 160)}`);
      }
      if (catTarget) {
        // The release commits the target category's 1-based position and its label (#192), and
        // the line lands on that category's row (#199). This fixture is a horizontal threshold, so
        // the category axis is y.
        const m = /value\s*=\s*(-?[\d.]+),\s*category\s*=\s*"([^"]*)"/.exec(after);
        if (!m || Number(m[1]) !== catTarget.k || m[2] !== catTarget.label) {
          throw new Error(`${key}-drag: expected value = ${catTarget.k}, category = "${catTarget.label}", got ${JSON.stringify(after).slice(0, 200)}`);
        }
        passed.push(`${key}/category-position`);
        const lineY = await page.evaluate((kk) => {
          const span = document.querySelector(`#coords_${kk}`);
          const hosts = [...document.querySelectorAll(".ip-host")];
          const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
          let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
          return Number(sr.querySelector(".masque-threshold-line")?.getAttribute("y1"));
        }, key);
        if (!(Math.abs(lineY - catTarget.y) <= 1.5)) {
          throw new Error(`${key}-drag: line at y=${lineY} after release, expected category ${catTarget.k} at y=${catTarget.y.toFixed(1)} (#199 snap)`);
        }
        passed.push(`${key}/line-snaps-to-category`);
      }
      console.error(`OK  ${key}/drag — ${after.slice(0, 100)}`);
      continue;
    }

    if (spec.mode === "slice") {
      const axes = await transformsOf(key);
      const t = Object.values(axes).find((tr) => !tr.is3d && !tr.ispolar);
      if (!t) throw new Error(`${key}: no 2D transform`);
      for (const probe of spec.probes) {
        const y = probe.y ?? (t.ylims[0] + t.ylims[1]) / 2;
        const pt = projectAxisJs(t, probe.x, y);
        let tip = null;
        for (let a = 0; a < 8; a++) {
          tip = await dispatchAt(key, pt.x, pt.y, "pointermove");
          if (tip?.show && tip.cross && probe.contains.every((s) => tip.text.includes(s))) break;
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!tip?.cross) throw new Error(`${key}: cross off at data (${probe.x}, ${y}) tip=${JSON.stringify(tip)}`);
        for (const s of probe.contains) {
          if (!tip.text.includes(s)) throw new Error(`${key}: tooltip ${JSON.stringify(tip?.text)} missing ${JSON.stringify(s)}`);
        }
        for (const s of probe.excludes ?? []) {
          if (tip.text.includes(s)) throw new Error(`${key}: tooltip ${JSON.stringify(tip.text)} should not show ${JSON.stringify(s)}`);
        }
      }
      passed.push(`${key}/slice`);
      console.error(`OK  ${key}/slice`);
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
    if (spec.mode === "axis_cat") {
      // A click on a categorical y axis commits the category's 1-based position and its label
      // (#192); the hover card reads the label, as the ticks do.
      const t = (await transformsOf(key))[layer.axis];
      if (!t || !t.ycats) throw new Error(`${key}: expected a categorical y transform, got ${JSON.stringify(t)}`);
      const [vx, , vw] = t.viewport;
      const pt = { x: vx + 0.1 * vw, y: projectAxisJs(t, t.xlims[0], spec.position).y };
      const hover = await dispatchAt(key, pt.x, pt.y, "pointermove");
      if (!hover.show || !hover.text.includes(`y=${spec.category}`)) {
        throw new Error(`${key}/hover: card should read y=${spec.category}, got ${JSON.stringify(hover.text)}`);
      }
      if (hover.cross) throw new Error(`${key}/hover: a readout with no slice draws no hairline`);
      passed.push(`${key}/hover-shows-category`);
      // Poll for the expected value rather than for a change: a warm re-run (#114) already holds
      // this exact repr, the same reason the numeric axis case uses clickAndMatch.
      const re = /AxisEvent\(:axis,\s*x\s*=\s*(-?[\d.e-]+),\s*y\s*=\s*(-?[\d.e-]+),\s*ycat\s*=\s*"([^"]*)"\)/;
      const matches = (text) => {
        const m = re.exec(text);
        return !!m && Number(m[2]) === spec.position && m[3] === spec.category;
      };
      let after = null;
      for (let attempt = 0; attempt < 3 && !(after && matches(after)); attempt++) {
        await dispatchAt(key, pt.x, pt.y, "click");
        for (let i = 0; i < 30; i++) {
          after = await textOf(`#out_${key}`);
          if (matches(after)) break;
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      if (!matches(after)) {
        throw new Error(`${key}/click: expected AxisEvent with y = ${spec.position}, ycat = "${spec.category}", got ${JSON.stringify(after).slice(0, 200)}`);
      }
      passed.push(`${key}/click-position-and-category`);
      console.error(`OK  ${key}/click — ${after.slice(0, 100)}`);
      continue;
    }

    if (spec.mode === "axis_polar") {
      // AxisInteractable on a PolarAxis (#170): the pointer on a marker Julia projected reads
      // that marker's (θ, r), and a pixel in the letterbox past the disc still reads a number.
      const t = (await transformsOf(key))[layer.axis];
      if (!t?.ispolar || !t.polar) throw new Error(`${key}: expected a polar transform, got ${JSON.stringify(t)}`);
      const anchor = (await layersOf(spec.anchorKey)).find((l) => l.kind === "circles");
      const pt = { x: anchor.geometry[3 * spec.anchorIndex], y: anchor.geometry[3 * spec.anchorIndex + 1] };
      const read = (text) => {
        const m = /x=(-?[\d.e+-]+), y=(-?[\d.e+-]+)/.exec(text ?? "");
        return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
      };
      const near = (v, want, tol) => v !== null && Math.abs(v - want) <= tol;
      // The anchor is rounded to whole image px, and Chromium truncates a synthetic click's
      // clientX/Y to whole CSS px (2 image px here; a pointermove keeps the fraction), so allow
      // 3 image px: in r that is 3 px of the Cartesian window, and in θ that arc at radius r.
      const perPx = (t.xlims[1] - t.xlims[0]) / t.viewport[2];
      const tolR = 3 * perPx, tolT = tolR / spec.r;
      const hover = await dispatchAt(key, pt.x, pt.y, "pointermove");
      const hv = read(hover?.text);
      if (!hover?.show || !hv || !near(hv.x, spec.theta, tolT) || !near(hv.y, spec.r, tolR)) {
        throw new Error(`${key}/hover: card should read θ≈${spec.theta}, r≈${spec.r}, got ${JSON.stringify(hover?.text)}`);
      }
      if (hover.cross) throw new Error(`${key}/hover: a readout with no slice draws no hairline`);
      passed.push(`${key}/hover-reads-theta-r`);
      const [vx, vy, , vh] = t.viewport;
      const edge = read((await dispatchAt(key, vx + 2, vy + vh / 2, "pointermove"))?.text);
      if (!edge || !near(edge.x, Math.PI, 0.1) || !(edge.y > spec.rmax)) {
        throw new Error(`${key}/letterbox: left edge should read θ≈π past r=${spec.rmax}, got ${JSON.stringify(edge)}`);
      }
      passed.push(`${key}/letterbox-extrapolates`);
      const re = /AxisEvent\(:axis,\s*x\s*=\s*(-?[\d.e+-]+),\s*y\s*=\s*(-?[\d.e+-]+)/;
      const matches = (text) => {
        const m = re.exec(text ?? "");
        return !!m && near(Number(m[1]), spec.theta, tolT) && near(Number(m[2]), spec.r, tolR);
      };
      let after = null;
      for (let attempt = 0; attempt < 3 && !matches(after); attempt++) {
        await dispatchAt(key, pt.x, pt.y, "click");
        for (let i = 0; i < 30; i++) {
          after = await textOf(`#out_${key}`);
          if (matches(after)) break;
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      if (!matches(after)) throw new Error(`${key}/click: expected AxisEvent at θ≈${spec.theta}, r≈${spec.r}, got ${JSON.stringify(after).slice(0, 200)}`);
      passed.push(`${key}/click-theta-r`);
      console.error(`OK  ${key}/click — ${after.slice(0, 100)} (tolerance r ±${tolR.toFixed(3)}, θ ±${tolT.toFixed(3)})`);
      continue;
    }

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
      if (axisTip.cross) throw new Error(`${key}/axis-hover: a readout draws no hairline`);
      passed.push(`${key}/cross-off`);
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
      if (cbTip.cross) throw new Error(`${key}/colorbar-hover: a readout draws no hairline`);
      passed.push(`${key}/colorbar-cross-off`);
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
      // `manifest["initial"]`, which `masque()` bakes fresh into the mount HTML every
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

      // AxisEvent(:axis, x = …, y = …). The numbers are the click's data coordinates.
      const parseBondAxisXY = (t) => {
        const m = new RegExp(`:${spec.layerId},\\s*x\\s*=\\s*(-?[\\d.]+(?:e-?\\d+)?)\\s*,\\s*y\\s*=\\s*(-?[\\d.]+(?:e-?\\d+)?)`).exec(t);
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

      // ColorbarEvent(:colorbar, value = …). A different hit-test branch from the axis catch-all.
      const parseBondValue = (t) => {
        const m = new RegExp(`:${spec.colorbarLayerId},\\s*value\\s*=\\s*(-?[\\d.]+(?:e-?\\d+)?)`).exec(t);
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
      // Each layer has its own field (#335): the axis and colorbar clicks set theirs and the
      // `pts` pick stays in its own.
      if (!/pts = ElementEvent\(:pts, 2,/.test(cbAfter) || !/axis = AxisEvent\(:axis,/.test(cbAfter)) {
        throw new Error(`${key}/fields-kept: after the axis and colorbar clicks the value is ${JSON.stringify(cbAfter).slice(0, 260)}, want pts = :pts 2 and an axis = AxisEvent`);
      }
      passed.push(`${key}/fields-kept`);
      console.error(`OK  ${key}/colorbar-click — ${cbAfter.slice(0, 110)}`);
      continue;
    }

    // A closed data mark's pick is drawn by the fade (#394): the rest of its plot fades, the
    // pick keeps its own pixels. Layout-space marks still take the wash in g.sel.
    const selFaded = spec.selected === "wash" && m.picked.includes(`${layer.id}:${spec.selectedIndex}`);
    if (selFaded) {
      if (m.kids.some((k) => k.kind === "closed")) {
        throw new Error(`${key}: the fade's pick is also washed in g.sel ${JSON.stringify(m.kids)}`);
      }
      // An unpicked mark of a one-colour layer (`colors` a single colour) now reads fainter: its
      // pixels moved toward the plot area's colour from the colour it is drawn in.
      const rawLum = rawColorLuminance(layer.colors);
      if (TINT_CHECK_KEYS.has(key) && rawLum !== null) {
        const cp = hitPoint(layer, spec.clickIndex);
        const lum = meanLuminance(PNG.sync.read(await stableClipShot(key, cp.x, cp.y)));
        const toward = wantDark ? rawLum - lum : lum - rawLum;
        if (toward < 15) {
          throw new Error(`${key}/unpicked-faded: unpicked mark luminance ${lum.toFixed(1)} vs its colour ${rawLum.toFixed(1)}, want it ≥15 closer to the ${wantDark ? "dark" : "light"} plot area`);
        }
        passed.push(`${key}/unpicked-faded`);
      }
      passed.push(`${key}/selected-fade`);
    } else if (spec.selected === "wash") {
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
        // polar is PointInteractable(ax, pts) beside scatter!(markersize=22), figure width
        // 480 so px_per_unit is 2. The drawn :circle is ≈0.3525·22·2 image px. The old
        // points-constructor default (radius 9) quantizes to 18 and halos the marker.
        if (key === "polar") {
          const drawn = Math.round(0.3525 * 22 * 2);
          if (Math.abs(Number(hp.r) - drawn) > 1) {
            throw new Error(`${key}: points-constructor r=${hp.r} is not the drawn marker (~${drawn}); radius 9 logical px would be 18`);
          }
          passed.push(`${key}/drawn-r`);
        }
        // Per-point markersize: every mark ships its own drawn radius (≈0.3525·ms·2 at
        // px_per_unit 2), so the selected smallest mark's wash is not the largest mark's size.
        if (spec.markersizes) {
          spec.markersizes.forEach((ms, k) => {
            const r = Number(hitPoint(layer, k).r);
            const drawn = Math.round(0.3525 * ms * 2);
            if (Math.abs(r - drawn) > 1) {
              throw new Error(`${key}: element ${k} r=${r} is not its own drawn marker (~${drawn}, markersize ${ms})`);
            }
          });
          passed.push(`${key}/per-point-r`);
        }
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
    } else if (spec.selected === "point") {
      // A bound line's pick is a data point on it (#335): the selected ring around that point,
      // and none around the line.
      const ring = m.kids.find((k) => k.kind === "ring");
      assertRing(ring, key, wantDark);
      const c = ring.circles[0], v = layer.geometry[spec.selectedIndex];
      const ex = v[2 * spec.selectedSample], ey = v[2 * spec.selectedSample + 1];
      if (Math.abs(Number(c.cx) - ex) > 1.2 || Math.abs(Number(c.cy) - ey) > 1.2) {
        throw new Error(`${key}: point ring ${JSON.stringify(c)} not on sample ${spec.selectedSample} at (${ex}, ${ey})`);
      }
      if (ring.paths.length) throw new Error(`${key}: the picked point's whole line is ringed too ${JSON.stringify(ring)}`);
      passed.push(`${key}/selected-point`);
    } else if (spec.selected === "ring") {
      const ring = m.kids.find((k) => k.kind === "ring");
      assertRing(ring, key, wantDark);
      if (layer.kind === "lines") {
        assertPathCovers(ring.paths[0].d, layer.geometry[spec.selectedIndex], `${key}/selected-ring`);
      } else {
        const hp = hitPoint(layer, spec.selectedIndex);
        const ln = ring.lines[0];
        if (hp.x1 != null && (Math.abs(Number(ln.x1) - hp.x1) > 1.2 || Math.abs(Number(ln.y1) - hp.y1) > 1.2)) {
          throw new Error(`${key}: ring not on segment ${JSON.stringify(ln)} vs ${JSON.stringify(hp)}`);
        }
      }
      passed.push(`${key}/selected-ring`);
    } else if (m.sel !== 0) {
      throw new Error(`${key}: unexpected g.sel=${m.sel} on unsupported kind`);
    }

    const hoverIndex = spec.hoverIndex;
    const hoverTip = spec.hoverTip;
    // A legend's default (and `tooltip = false`) ships `tooltip: false`: the card must stay
    // hidden. A hidden card is not which entry was hit — every suppressed hover has one —
    // so the row highlight has to sit on hoverPt. Every other element kind still requires
    // a visible card, matched to hoverTip.
    const tipSuppressed = layer.tooltip === false;
    const hiOnPoint = (t, pt) => {
      const el = t?.hi?.fill || t?.hi?.edge || t?.hi?.plain;
      if (!el || !pt) return false;
      if (el.cx != null && el.cy != null) {
        return Math.abs(Number(el.cx) - pt.x) <= 1.2 && Math.abs(Number(el.cy) - pt.y) <= 1.2;
      }
      if (el.x != null && el.y != null && el.w != null && el.h != null) {
        const cx = Number(el.x) + Number(el.w) / 2;
        const cy = Number(el.y) + Number(el.h) / 2;
        return Math.abs(cx - pt.x) <= 1.2 && Math.abs(cy - pt.y) <= 1.2;
      }
      return false;
    };
    const tipHit = (t) => {
      if (tipSuppressed) return !!(t && !t.show && hiOnPoint(t, hoverPt));
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
      // A faded unpicked mark is not drawn in its own colour, so a fade-drawn spec tints its pick,
      // which keeps its pixels and takes the hover recipe like any other mark.
      const tintIndex = spec.tintIndex ?? (selFaded ? spec.selectedIndex : spec.selected ? spec.clickIndex : spec.selectedIndex);
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
    if (tip.cross) {
      throw new Error(`${key}: a hairline drew without a slice (kind ${layer.kind})`);
    }
    passed.push(`${key}/cross`);
    // Open (edge-only, no fill shape) kinds are line-geometry layers (polyline/segments/lines);
    // every other element-kind layer (circles/rects/polygons/grid) is closed (fill + edge).
    // A one-element line with a baked selection has nowhere else to hover: that hover is the
    // already-selected mark, which draws no highlight. The series row (several whole lines)
    // is what exercises the hover stroke.
    const closedHover = layer.kind !== "polyline" && layer.kind !== "segments" && layer.kind !== "lines";
    // A picked point is not its line: hovering the line still outlines it.
    // A fade-drawn pick has no selected stroke, so hovering it draws the hover recipe.
    const hoverIsSelected = !!(spec.selected && spec.selected !== "point" && !selFaded && hoverIndex === spec.selectedIndex);
    if (hoverIsSelected) {
      assertNoHighlight(tip.hi, `${key}/hover-on-selected`);
      if (tip.sel < 1) throw new Error(`${key}: g.sel gone while hovering the selected mark`);
      passed.push(`${key}/tooltip`);
      passed.push(`${key}/hover-on-selected-noop`);
    } else {
    assertHoverRecipe(tip.hi, key, closedHover, wantDark);
    if (layer.kind === "lines") {
      if (tip.hi.edge?.tag !== "path") {
        throw new Error(`${key}: whole-line hover is not a path ${JSON.stringify(tip.hi.edge)}`);
      }
      assertPathCovers(tip.hi.edge.d, layer.geometry[hoverIndex], `${key}/hover-path`);
    }
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
    }
    let afterLeave = await inspect(key);
    for (let a = 0; a < 8 && afterLeave.hi !== 0; a++) {
      await new Promise((r) => setTimeout(r, 25));
      afterLeave = await inspect(key);
    }
    if (afterLeave.hi !== 0) throw new Error(`${key}: g.hi lingered ${afterLeave.hi}`);
    if (spec.selected && afterLeave.sel < 1) throw new Error(`${key}: g.sel dropped on unhover`);
    if (spec.selected) passed.push(`${key}/selected-survives-unhover`);

    // #262: a hover just past a plotted point reads out that point, not one between samples.
    if (spec.readout) {
      const verts = layer.geometry[hoverIndex];
      const k = spec.readout.vertex;
      const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
      const want = spec.readout.text.map(norm);
      let t = null;
      for (let a = 0; a < 8; a++) {
        t = await dispatchAt(key, verts[2 * k] + 2, verts[2 * k + 1], "pointermove");
        if (t?.show && want.every((w) => norm(t.text).includes(w))) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!(t?.show && want.every((w) => norm(t.text).includes(w)))) {
        throw new Error(`${key}: readout at vertex ${k} wanted ${JSON.stringify(spec.readout.text)}, tooltip ${JSON.stringify(t?.text)}`);
      }
      await page.evaluate((k2) => {
        const span = document.querySelector(`#coords_${k2}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        sr.querySelector(".surface").dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      }, key);
      passed.push(`${key}/readout`);
    }

    // #308: a payload is merged onto the mark's own fields, so the default table shows both.
    if (spec.hoverFields) {
      const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
      const want = spec.hoverFields.map(norm);
      const p = hitPoint(layer, hoverIndex);
      let t = null;
      for (let a = 0; a < 8; a++) {
        t = await dispatchAt(key, p.x, p.y, "pointermove");
        if (t?.show && want.every((w) => norm(t.text).includes(w))) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!(t?.show && want.every((w) => norm(t.text).includes(w)))) {
        throw new Error(`${key}: hover table wanted ${JSON.stringify(spec.hoverFields)}, tooltip ${JSON.stringify(t?.text)}`);
      }
      await dispatchAt(key, p.x, p.y, "pointerleave");
      passed.push(`${key}/payload-merge`);
    }

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
        const kidsOf = (svg, layerName) => [...(svg?.querySelectorAll("g.masque-photo > g.link") ?? [])].flatMap((g) => [...g.children]).map((el) => {
          if (el.tagName.toLowerCase() === "g") {
            return {
              layer: layerName, kind: "ring",
              lines: [...el.querySelectorAll("line")].map((ln) => {
                const cs = getComputedStyle(ln);
                return {
                  className: ln.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
                  width: String(parseFloat(cs.strokeWidth)), opacity: (cs.strokeOpacity === "1" ? null : cs.strokeOpacity),
                  x1: ln.getAttribute("x1"), y1: ln.getAttribute("y1"),
                  x2: ln.getAttribute("x2"), y2: ln.getAttribute("y2"),
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
            layer: layerName, kind: "closed", tag: el.tagName.toLowerCase(),
            className: el.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
            width: String(parseFloat(cs.strokeWidth)),
            blend: layerName === "plain" ? null : getComputedStyle(svg).mixBlendMode,
            r: el.getAttribute("r"), cx: el.getAttribute("cx"), cy: el.getAttribute("cy"),
          };
        });
        const kFill = kidsOf(svgFill, "fill"), kEdge = kidsOf(svgEdge, "edge"), kPlain = kidsOf(svgPlain, "plain");
        const kids = [...kFill, ...kEdge, ...kPlain];
        // Element count: a closed target draws fill+edge PAIRS (count once via fill), an open
        // target draws a single plain ring per element — same convention as layerElementCount.
        // A closed series beside another closed series is previewed by the fade (#394), not in
        // g.link: its marks kept beyond the picks count one each.
        const f = fadeOf(sr);
        const count = kFill.filter((x) => x.kind === "closed").length + kPlain.filter((x) => x.kind === "ring").length
          + f.kept.length - f.picked.length;
        const sel = [svgFill, svgEdge, svgPlain]
          .reduce((n, svg) => n + (svg?.querySelectorAll("g.masque-photo > g.sel > *").length ?? 0), 0) + 2 * f.picked.length;
        const firstPopulated = [svgFill, svgEdge, svgPlain]
          .flatMap((svg) => [...(svg?.querySelectorAll("g.masque-photo > g.link") ?? [])])
          .find((g) => g.children.length > 0);
        const leaving = firstPopulated ? firstPopulated.firstElementChild.classList.contains("masque-leave") : null;
        return { count, kids, sel, leaving, kept: f.kept };
      }, k);

      for (const c of spec.links.cases) {
        const targetIds = (layer.links && layer.links[c.index]) || [];
        if (!targetIds.length) throw new Error(`${key}/links[${c.index}]: legend entry "${c.label}" has no links`);
        const resolved = targetIds.map((tid) => {
          const r = resolveLinkSpec(layers, tid);
          if (!r) throw new Error(`${key}/links[${c.index}]: target ${tid} missing from manifest`);
          return r;
        });
        const hp = hitPoint(layer, c.index);
        // Geometry: the first linked element must sit ON the plotted mark, not beside it.
        const tl0 = resolved[0].layer;
        const idx0 = resolved[0].index ?? 0;
        const hp0 = hitPoint(tl0, idx0);

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
        const wantCard = layer.tooltip !== false;
        // A hidden card is every legend hover once the default tip is off, so it cannot
        // tell this entry from the previous one. pointermove is also coalesced onto one
        // frame (hover.ts). Leave first so the previous g.link is not this case's answer,
        // then wait until the linked geometry is the pin for this entry.
        const linkLanded = (li) => {
          if (tl0.kind === "lines") {
            const ringKid = li.kids.find((kk) => kk.layer === "plain" && kk.kind === "ring");
            return pathCoverError(ringKid?.paths?.[0]?.d, tl0.geometry[idx0]) === null;
          }
          if (tl0.kind === "polyline" || tl0.kind === "segments") {
            const ringKid = li.kids.find((kk) => kk.layer === "plain" && kk.kind === "ring");
            const ln = ringKid?.lines?.[0];
            return !!ln && Math.abs(Number(ln.x1) - hp0.x1) <= 1.2 && Math.abs(Number(ln.y1) - hp0.y1) <= 1.2;
          }
          // A closed target is previewed by the fade (#394), kept.
          if (tl0.kind === "circles") return li.kept.includes(`${tl0.id}:${idx0}`);
          return false;
        };
        await page.evaluate((k) => {
          const span = document.querySelector(`#coords_${k}`);
          const hosts = [...document.querySelectorAll(".ip-host")];
          const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
          let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
          sr.querySelector(".surface").dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        }, key);
        let t = null;
        let landed = false;
        for (let a = 0; a < 8; a++) {
          t = await dispatchAt(key, hp.x, hp.y, "pointermove");
          const cardOk = wantCard
            ? !!(t?.show && norm(t.text).includes(norm(c.label)))
            : !!(t && !t.show);
          if (cardOk && linkLanded(await linkInspect(key))) { landed = true; break; }
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!landed) {
          throw new Error(`${key}/links[${c.index}]: linked highlight did not match the pinned geometry (tooltip ${JSON.stringify(t)})`);
        }
        if (wantCard) {
          if (!t?.show || !norm(t.text).includes(norm(c.label))) {
            throw new Error(`${key}/links[${c.index}]: tooltip ${JSON.stringify(t)} (want "${c.label}")`);
          }
        } else if (t?.show) {
          throw new Error(`${key}/links[${c.index}]: default legend tooltip should stay hidden ${JSON.stringify(t)}`);
        }
        assertHoverRecipe(t.hi, `${key}/links[${c.index}]/legend-row-hover`);

        const li = await linkInspect(key);
        let expected = 0;
        for (const r of resolved) {
          // layerElementCount's :grid case (ncols*nrows) is untested here — no fixture links a
          // legend entry to a :grid target today, and the DOM-side count this feeds (`li.count`,
          // from linkInspect's fill/edge/ring fan-out) has no defined per-cell convention for a
          // grid hit. If a future fixture adds one, verify that convention before trusting this.
          expected += r.index === null ? layerElementCount(r.layer) : 1;
        }
        if (li.count !== expected) {
          throw new Error(`${key}/links[${c.index}]: g.link has ${li.count} elements, want ${expected} (targets ${JSON.stringify(targetIds)})`);
        }
        if (li.sel !== afterLeave.sel) throw new Error(`${key}/links[${c.index}]: g.sel changed during legend hover (${li.sel})`);

        if (tl0.kind === "circles") {
          // The legend's only closed series ("pts") fades nothing, as a click on it would
          // (#394): no wash in g.link, and the mark keeps its own pixels.
          if (li.kids.some((kk) => kk.kind === "closed")) throw new Error(`${key}/links[${c.index}]: a closed series drew in g.link ${JSON.stringify(li.kids)}`);
          await new Promise((r) => setTimeout(r, 200));
          const lumAfter = meanLuminance(PNG.sync.read(await stableClipShot(key, hp0.x, hp0.y)));
          if (Math.abs(lumAfter - lumBefore) > 8) {
            throw new Error(`${key}/links[${c.index}]/kept: the mark's luminance moved ${lumBefore.toFixed(1)} -> ${lumAfter.toFixed(1)} on a preview that fades nothing`);
          }
          passed.push(`${key}/links[${c.index}]/kept`);
        } else if (tl0.kind === "polyline" || tl0.kind === "segments") {
          const ringKid = li.kids.find((kk) => kk.layer === "plain" && kk.kind === "ring");
          if (!ringKid) throw new Error(`${key}/links[${c.index}]: no ring in g.link`);
          assertRing(ringKid, `${key}/links[${c.index}]/ring`, wantDark);
          const ln = ringKid.lines[0];
          if (Math.abs(Number(ln.x1) - hp0.x1) > 1.2 || Math.abs(Number(ln.y1) - hp0.y1) > 1.2) {
            throw new Error(`${key}/links[${c.index}]: link ring off-mark ${JSON.stringify(ln)} vs ${JSON.stringify(hp0)}`);
          }
        } else if (tl0.kind === "lines") {
          const ringKid = li.kids.find((kk) => kk.layer === "plain" && kk.kind === "ring");
          if (!ringKid) throw new Error(`${key}/links[${c.index}]: no ring in g.link`);
          assertRing(ringKid, `${key}/links[${c.index}]/ring`, wantDark);
          assertPathCovers(ringKid.paths[0].d, tl0.geometry[idx0], `${key}/links[${c.index}]/ring`);
        }
        passed.push(`${key}/links[${c.index}]`);
      }

      // Moving off the last-hovered legend entry fades g.link (not an instant clear), same
      // contract as g.hi. #99 round 2: reads the durable log (group: "link") the same way the
      // g.hi remount-fade check above does, via the shared assertLeaveFade(entries, where,
      // group) — see transient_log.mjs / visual_assert.mjs.
      // A closed series previewed by the fade leaves g.link empty (#394): then only the
      // preview's end is checked.
      const linkHeld = (await linkInspect(key)).kids.length > 0;
      const linkFadeCursor = await logCursor(page, key);
      await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const hosts = [...document.querySelectorAll(".ip-host")];
        const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        sr.querySelector(".surface").dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      }, key);
      if (linkHeld) {
        const linkFadeEntries = await pollLog(page, key, linkFadeCursor, (es) => (
          es.some((e) => e.group === "link" && e.type === "remove") || es.some((e) => e.type === "hostRemount")
        ));
        assertLeaveFade(linkFadeEntries, `${key}/links`, "link");
      }
      let afterLinkLeave = await linkInspect(key);
      for (let a = 0; a < 8 && afterLinkLeave.count !== 0; a++) {
        await new Promise((r) => setTimeout(r, 25));
        afterLinkLeave = await linkInspect(key);
      }
      if (afterLinkLeave.count !== 0) throw new Error(`${key}/links: g.link lingered ${afterLinkLeave.count}`);
      passed.push(`${key}/links-fade`);
    }

    // A default line shows its tooltip and takes no click (#335): the layer has no "click" event
    // and no field, and a click on it draws no pick and leaves the value as it was.
    if (spec.hoverOnly) {
      if (layer.events.includes("click")) throw new Error(`${key}: default line :${layer.id} events ${JSON.stringify(layer.events)}, want no click`);
      const beforeAll = await textOf(`#bond_${key}`);
      const p = hitPoint(layer, spec.clickIndex);
      const r = await dispatchAt(key, p.x, p.y, "click");
      if (!r.show) throw new Error(`${key}: no tooltip on the hover-only line ${JSON.stringify(r)}`);
      await new Promise((res) => setTimeout(res, 1500));
      const afterAll = await textOf(`#bond_${key}`);
      if (afterAll !== beforeAll) throw new Error(`${key}: a click on the hover-only line changed the value ${JSON.stringify(beforeAll)} -> ${JSON.stringify(afterAll)}`);
      if (r.sel !== 0) throw new Error(`${key}: a click on the hover-only line drew a pick (g.sel=${r.sel})`);
      const valueKeys = Object.keys((await inspect(key)).bondAll ?? {});
      if (valueKeys.includes(layer.id)) throw new Error(`${key}: host.value has a field for the hover-only line: ${JSON.stringify(r.bondAll)}`);
      passed.push(`${key}/hover-only-no-click`);
      console.error(`OK  ${key} — hover-only, value ${afterAll}`);
      continue;
    }

    let clickIdx = spec.clickIndex;
    const before = await textOf(`#out_${key}`);
    // The overlay's hit index stays 0-based. The bond prints the Julia 1-based index. A bound
    // line with data points picks one (#335): the spec clicks on its `clickSample`, and the
    // index printed is that point's, with `line` naming the line.
    const clickSample = spec.clickSample ?? null;
    const juliaIdx = () => (clickSample === null ? clickIdx : clickSample) + 1;
    const already = new RegExp(`:${jlLayer(spec.layerId)},\\s*${juliaIdx()}\\b`);
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
    // Whether `after` can't show this click (see below). Starts true on `skipChangeWait`, and the
    // seed-clear path clears it once both of its round-trips have printed.
    let staleAfter = false;
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
        // with no kernel round-trip, so it is the one check this path actually carries. The
        // exception is when the first click clears the `selected=` seed: then both round-trips
        // print, `after` is live, and the checks count (`staleAfter`).
        skipChangeWait = true;
        staleAfter = true;
      } else {
        throw new Error(
          `${key}-click: layer "${spec.layerId}" (${layer.kind}, ${count} element${count === 1 ? "" : "s"}) has no ` +
          `alternative index to click — index ${clickIdx} is already bound from a previous run and there is no ` +
          `other in-range element on this layer to disambiguate a fresh click (warm-session collision fallback, #114)`,
        );
      }
    }
    if (key === "scatter") scatterClickIdx = clickIdx;
    const clickPt = clickSample === null ? hitPoint(layer, clickIdx)
      : { x: layer.geometry[clickIdx][2 * clickSample], y: layer.geometry[clickIdx][2 * clickSample + 1] };
    let after = before;
    if (skipChangeWait) {
      // This holds unless the click clears the `selected=` seed (handled after the dispatch):
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
      // The one element may be the `selected=` seed, which a click now clears (the toggle off).
      // Click once more so the checks below see it selected.
      if ((await inspect(key)).bond === null) {
        // Let the clear's `nothing` print before reselecting. Until it lands, #out_${key} still
        // shows the seed, so polling for "not nothing" right after the second click can stop on
        // the stale seed and then read the `nothing` that arrives next.
        const cleared = await waitChange(`#out_${key}`, before, `${key}-click (seed clear)`);
        if (!/=nothing\s*$/.test(cleared)) {
          throw new Error(`${key}-click: clearing the seed printed ${JSON.stringify(cleared).slice(0, 220)}, expected nothing`);
        }
        await dispatchAt(key, clickPt.x, clickPt.y, "click");
        await waitChange(`#out_${key}`, cleared, `${key}-click (reselect)`);
        // Both the clear and the reselect printed, so `after` below is this click's own value.
        staleAfter = false;
      }
      after = await textOf(`#out_${key}`);
    } else {
      for (let a = 0; a < 3; a++) {
        // A second click on the element the first one selected would clear it, so retry the
        // click only when the overlay never took the first one.
        const held = (await inspect(key)).bond;
        if (a === 0 || !(held && held.layer === layer.id && held.index === clickIdx && (held.sample ?? null) === clickSample)) {
          await dispatchAt(key, clickPt.x, clickPt.y, "click");
        }
        try {
          after = await waitChange(`#out_${key}`, before, `${key}-click`);
          break;
        } catch (e) {
          if (a === 2) throw e;
        }
      }
    }
    const idRe = new RegExp(`:${jlLayer(spec.layerId)}|${jlLayer(spec.layerId)}`, "i");
    if (!idRe.test(after)) throw new Error(`${key}-click: no layer in ${JSON.stringify(after).slice(0, 220)}`);
    if (spec.layerKind === "surface") {
      // A surface point binds as a GridCellEvent of its source (i, j) and its z (#259).
      const g = layer.geometry, a = clickIdx % g.ni, b = Math.floor(clickIdx / g.ni);
      const m = new RegExp(`:${spec.layerId},\\s*i = (\\d+), j = (\\d+), value = (-?[\\d.eE+-]+)`).exec(after);
      if (!m || Number(m[1]) !== g.i[a] + 1 || Number(m[2]) !== g.j[b] + 1 || Math.abs(Number(m[3]) - g.z[clickIdx]) > 1e-4) {
        throw new Error(`${key}-click: expected GridCellEvent i=${g.i[a] + 1}, j=${g.j[b] + 1}, value≈${g.z[clickIdx]}: ${after.slice(0, 220)}`);
      }
    } else if (spec.layerKind !== "grid") {
      if (!new RegExp(`:${jlLayer(spec.layerId)},\\s*${juliaIdx()}\\b`).test(after)) {
        throw new Error(`${key}-click: expected Julia index ${juliaIdx()}: ${after.slice(0, 220)}`);
      }
      if (clickSample !== null && !new RegExp(`\\bline = ${clickIdx + 1}\\b`).test(after)) {
        throw new Error(`${key}-click: expected the point on line ${clickIdx + 1}: ${after.slice(0, 220)}`);
      }
    }
    if (spec.layerId === "legend" && !/LegendEvent\(/.test(after)) {
      throw new Error(`${key}-click: expected LegendEvent: ${after.slice(0, 220)}`);
    }
    // A grid with per-cell payloads (#290): the bond carries the clicked cell's own payload.
    if (spec.bindPayloadField) {
      const want = `${spec.bindPayloadField} = ${JSON.stringify(layer.payloads[clickIdx][spec.bindPayloadField])}`;
      if (!after.includes(want)) throw new Error(`${key}-click: expected ${want} in ${after.slice(0, 220)}`);
      if (!staleAfter) passed.push(`${key}/click-payload`);
    }
    if (!staleAfter) passed.push(`${key}/click-bind`);

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
      // A picked point keeps its line's hover outline under the pointer; a closed mark's pick
      // is drawn by the fade and keeps its hover fill and edge (#394); any other pick is the
      // hovered mark itself, which draws no hover chrome once selected.
      const fadePick = echo.picked.includes(`${layer.id}:${clickIdx}`);
      const wantHi = fadePick ? 2 : clickSample === null ? 0 : 1;
      if (echo.hi !== wantHi) throw new Error(`${key}/click-echo: g.hi=${echo.hi} over the echo, expected ${wantHi}`);
      const expectSel = closedHover ? 2 : 1;
      if (echo.sel !== expectSel) {
        throw new Error(`${key}/click-echo: g.sel=${echo.sel}, expected ${expectSel} for one echoed ${closedHover ? "closed" : "open"} hit (was ${afterLeave.sel} before the click)`);
      }
      passed.push(`${key}/click-echo`);
    } else if (echo.sel !== afterLeave.sel) {
      throw new Error(`${key}/click-echo: unpinned ${layer.kind} click changed g.sel ${afterLeave.sel} -> ${echo.sel}`);
    }

    // Click-again deselect: a second click on the selected element clears g.sel and sends
    // `nothing` through the bond; a third selects it again, so later checks see the click above.
    if (echo.sel > 0 && (hasLinks || SELF_PIN_KINDS.has(layer.kind))) {
      await dispatchAt(key, clickPt.x, clickPt.y, "click");
      const off = await inspect(key);
      if (off.sel !== 0 || off.bond !== null) {
        throw new Error(`${key}/click-deselect: second click left g.sel=${off.sel}, bond=${JSON.stringify(off.bond)}`);
      }
      const cleared = await waitChange(`#out_${key}`, after, `${key}/click-deselect`);
      if (!/=nothing\s*$/.test(cleared)) {
        throw new Error(`${key}/click-deselect: bond printed ${JSON.stringify(cleared).slice(0, 220)}, expected nothing`);
      }
      await dispatchAt(key, clickPt.x, clickPt.y, "click");
      const on = await inspect(key);
      if (on.sel !== echo.sel) throw new Error(`${key}/click-deselect: third click g.sel=${on.sel}, expected ${echo.sel}`);
      const back = await waitChange(`#out_${key}`, cleared, `${key}/click-deselect`);
      if (back !== after) throw new Error(`${key}/click-deselect: bond after reselect ${JSON.stringify(back).slice(0, 220)} != ${JSON.stringify(after).slice(0, 220)}`);
      passed.push(`${key}/click-deselect`);
    }

    // Every event prints `Type(:layerId, …)`. The ":<layerId>," prefix pins which layer won
    // the hit-test (a grid cell continues `i = …`, a legend entry continues its 1-based index).
    // Belt-and-suspenders on top of the index regex above: this fails loud specifically on
    // "resolved to the wrong layer", not just "wrong index".
    // When `staleAfter` holds, `after` is stale (see above) so this re-check is vacuous for THIS
    // click — but the real regression test for `legend`-before-`:grid` layer precedence already
    // ran once per spec, unconditionally, before any click (`legend-precedence-order`/
    // `legend-precedence-pixel-contested`, pushed above using `spec.selectedIndex`), so the
    // structural property this guards is still covered even when this echo of it isn't.
    if (spec.overlapsGrid && new RegExp(`:${spec.overlapsGrid},`).test(after)) {
      throw new Error(`${key}-click: bond resolved to grid layer "${spec.overlapsGrid}", not legend: ${after.slice(0, 220)}`);
    }
    // A `:rects` layer with `tol` (bars with a drawn outline, #246) answers past each rect's
    // edge: a hover `tol - 1` image px right of the last bar's edge, outside the rect itself,
    // must still hit that bar and highlight the bar's own rect.
    if (layer.kind === "rects" && layer.tol) {
      const n = layer.geometry.length / 4 - 1;
      const hp = hitPoint(layer, n);
      const out = await dispatchAt(key, hp.x + hp.w / 2 + layer.tol - 1, hp.y, "pointermove");
      const shape = out.hi.fill || out.hi.edge || out.hi.plain;
      if (!out.show || !shape || Math.abs(Number(shape.w) - hp.w) > 1.2) {
        throw new Error(`${key}/stroke-reach: hover ${layer.tol - 1} px outside bar ${n} gave ${JSON.stringify(out)}`);
      }
      const far = await dispatchAt(key, hp.x + hp.w / 2 + layer.tol + 3, hp.y, "pointermove");
      if (far.show) throw new Error(`${key}/stroke-reach: hover past the reach still hit: ${far.text}`);
      await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        sr.querySelector(".surface").dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      }, key);
      passed.push(`${key}/stroke-reach`);
    }
    // bar_stroke's scatter has markersize 20 and strokewidth 8, like its bars' outline. Its hit
    // radius reaches the outline's outer edge: half the stroke past the marker on Cairo, the
    // whole stroke on WebGL. The bars' `tol` (half the stroke, scaled) gives the image scale.
    const stroked = key === "bar_stroke" && layers.find((l) => l.kind === "circles");
    if (key === "bar_stroke") {
      if (!stroked || !layer.tol) throw new Error(`${key}/marker-stroke: no stroked scatter or bar tol in ${layers.map((l) => l.id + ":" + l.kind)}`);
      const s = layer.tol / 4, share = backend === "webgl" ? 1 : 0.5;
      const hp = hitPoint(stroked, 0), want = (0.3525 * 20 + 8 * share) * s;
      if (Math.abs(hp.r - want) > 1.5) {
        throw new Error(`${key}/marker-stroke: hit radius ${hp.r} image px, want ${want.toFixed(1)} on ${backend}`);
      }
      const on = await dispatchAt(key, hp.x + hp.r - 1, hp.y, "pointermove");
      if (!on.show) throw new Error(`${key}/marker-stroke: hover on the outline's outer edge missed: ${JSON.stringify(on)}`);
      await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        sr.querySelector(".surface").dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      }, key);
      passed.push(`${key}/marker-stroke`);
    }
    // #259: an in-drag orbit frame ships no surface geometry, so the selected point's highlight
    // hides while the pointer is down, and the release frame brings it back on the new view.
    // The click above left the point selected. Shift forces the view gesture over the surface.
    if (spec.orbitSuspends) {
      const sel0 = (await inspect(key)).sel;
      if (sel0 < 1) throw new Error(`${key}/orbit-suspend: no selected point before the orbit (g.sel=${sel0})`);
      const readStamp = () => page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        return host?.dataset.masqueGestureFrame ?? null;
      }, key);
      // In view first, as the view case does: an off-screen :webgl canvas can lose its context.
      // The base's box is read once, before the drag: on :webgl a frame can swap the canvas
      // while the drag is under way.
      const box = await page.evaluate((k) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        host.scrollIntoView({ block: "center", inline: "nearest" });
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        const b = host.querySelector("img, canvas").getBoundingClientRect();
        return { left: b.left, top: b.top, s: b.width / sr.querySelector("svg.masque-plain").viewBox.baseVal.width };
      }, key);
      const pointer = (type, ix, iy) => page.evaluate(([k, t, cx, cy]) => {
        const span = document.querySelector(`#coords_${k}`);
        const host = [...document.querySelectorAll(".ip-host")].filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
        sr.querySelector(".surface").dispatchEvent(new PointerEvent(t, {
          bubbles: true, composed: true, cancelable: true, shiftKey: true, buttons: t === "pointerup" ? 0 : 1,
          clientX: cx, clientY: cy, pointerId: 1, pointerType: "mouse", isPrimary: true,
        }));
      }, [key, type, box.left + ix * box.s, box.top + iy * box.s]);
      const tries = backend === "webgl" ? 50 : 25, delayMs = backend === "webgl" ? 300 : 200;
      const stamp0 = await readStamp();
      const n0 = stamp0 ? JSON.parse(stamp0).n : 0;
      await pointer("pointerdown", clickPt.x, clickPt.y);
      let mid = null;
      for (let step = 1; step <= tries && !mid; step++) {
        await pointer("pointermove", clickPt.x + 4 * step, clickPt.y);
        await new Promise((r) => setTimeout(r, delayMs));
        const st = await readStamp();
        const parsed = st ? JSON.parse(st) : null;
        if (parsed && parsed.n > n0 && parsed.settle === false) mid = parsed;
      }
      if (!mid) {
        await pointer("pointerup", clickPt.x, clickPt.y);
        throw new Error(`${key}/orbit-suspend: no in-drag frame landed`);
      }
      const during = await inspect(key);
      if (during.sel !== 0) {
        await pointer("pointerup", clickPt.x, clickPt.y);
        throw new Error(`${key}/orbit-suspend: the selected point still draws ${during.sel} shape(s) mid-drag`);
      }
      passed.push(`${key}/orbit-suspend`);
      await pointer("pointerup", clickPt.x + 4 * tries, clickPt.y);
      let settled = null;
      for (let i = 0; i < tries && !settled; i++) {
        await new Promise((r) => setTimeout(r, delayMs));
        const st = await readStamp();
        const parsed = st ? JSON.parse(st) : null;
        if (parsed && parsed.n > mid.n && parsed.settle === true) settled = parsed;
      }
      if (!settled) throw new Error(`${key}/orbit-suspend: the release frame never landed`);
      let back = await inspect(key);
      for (let i = 0; i < 10 && back.sel !== sel0; i++) {
        await new Promise((r) => setTimeout(r, 100));
        back = await inspect(key);
      }
      if (back.sel !== sel0) throw new Error(`${key}/orbit-restore: g.sel=${back.sel} after release, expected ${sel0}`);
      if (/=\s*nothing$/.test(await textOf(`#out_${key}`))) throw new Error(`${key}/orbit-restore: the orbit cleared the bond`);
      passed.push(`${key}/orbit-restore`);
    }

    console.error(`OK  ${key} — ${after.slice(0, 110)}`);

    if (spec.links) {
      // On a real click-wait, click-bind above already confirmed index==clickIdx; this confirms
      // the bond's payload actually carries label/targets (not just the index). On
      // `staleAfter`, both `after` and these checks are stale/tautological for the same
      // reason click-bind's are (see the comment above the change-wait) — pushed only when
      // `after` is live, matching click-bind's own gating.
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
      if (!staleAfter) passed.push(`${key}/links-click-payload`);
    }
  }

  // Hover on a pick (#394): scatter's CURRENTLY-selected element is drawn by the fade (its own
  // pixels, the rest of the plot faded), with no selected stroke, so hovering it draws the
  // usual hover recipe, and the pick stays held. Under the hydration model, scatter's earlier click-echo (above) REPLACED its baked
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
      throw new Error(`scatter/hover-on-pick: clickIndex collided and landed on index ${idx} — no known tooltip text to assert`);
    }
    const tipOk = (t) => !!(t && t.show && new RegExp(expectTip, "i").test(t.text));
    const selPt = hitPoint(layer, idx);
    let noop = null;
    for (let a = 0; a < 8; a++) {
      noop = await dispatchAt("scatter", selPt.x, selPt.y, "pointermove");
      if (tipOk(noop)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!tipOk(noop)) throw new Error(`scatter/hover-on-pick: tooltip ${JSON.stringify(noop)}`);
    assertHoverRecipe(noop.hi, "scatter/hover-on-pick", true, false);
    if (noop.sel < 1) throw new Error("scatter/hover-on-pick: the pick dropped while hovering it");
    passed.push("scatter/hover-on-pick");
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
