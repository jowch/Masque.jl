// Overlay visual-fidelity driver (LOCAL — not CI). Required by
// docs/dev/live-interaction-checklist.md together with kind_sweep.mjs.
// Runs on the kind-sweep notebooks. Asserts wash/ring/hover (dodge fill + flat chrome edge
// stroke)/overlay-pin, remount fade / no pulse, the split recipe on a dark figure too (not fixed
// steel-teal, not #ff3b30), a Cairo-only flush-radius pixel check, and Pluto/OS
// prefers-color-scheme (official Pluto has no notebook toggle).
//
//   node polish_verify.mjs <base-url> <notebook-abs-path> <cairo|webgl> [artifact-dir]
import { chromium } from "playwright";
import { shutdownOpenSession } from "./fresh_session.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertNoAlertRed, assertNoTeal, assertWash, assertRing, assertHoverRecipe, assertCircleR,
  assertRemountStable, assertLeaveFade, assertTooltipColorScheme, assertCaretAtAnchor,
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
const passed = [];
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
        styled: !!document.querySelector("#coords_scatter_styled"),
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

  const inspect = (key) => page.evaluate((k) => {
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
    const kidsOf = (svg, layerName) => [...(svg?.querySelector("g.sel")?.children ?? [])].map((el) => {
      if (el.tagName.toLowerCase() === "g") {
        return {
          layer: layerName, kind: "ring",
          lines: [...el.querySelectorAll("line")].map((ln) => {
            const cs = getComputedStyle(ln);
            return {
              className: ln.getAttribute("class"), stroke: cs.stroke, fill: cs.fill, fillOpacity: cs.fillOpacity,
              width: String(parseFloat(cs.strokeWidth)), opacity: (cs.strokeOpacity === "1" ? null : cs.strokeOpacity),
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
        width: String(parseFloat(cs.strokeWidth)), r: el.getAttribute("r"),
        cx: el.getAttribute("cx"), cy: el.getAttribute("cy"),
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
      sel: count("g.sel"),
    };
  }, key);

  const layersOf = (key) => page.evaluate((k) => JSON.parse(document.querySelector(`#coords_${k}`).innerText), key);

  const hoverAt = (key, x, y) => page.evaluate(([k, ix, iy]) => {
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
      const el = groupWithChild(svg, "g.hi")?.firstElementChild;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        layer: layerName, className: el.getAttribute("class"),
        fill: cs.fill, stroke: cs.stroke, fillOpacity: cs.fillOpacity,
        width: String(parseFloat(cs.strokeWidth)), opacity: (cs.strokeOpacity === "1" ? null : cs.strokeOpacity),
        r: el.getAttribute("r"), enter: el.classList.contains("masque-enter"),
        blend: layerName === "plain" ? null : getComputedStyle(svg).mixBlendMode,
      };
    };
    const cs = t ? getComputedStyle(t) : null;
    return {
      show: t?.classList.contains("show"), text: t?.innerText ?? "",
      bg: cs?.backgroundColor, color: cs?.color,
      hi: { fill: capture(svgFill, "fill"), edge: capture(svgEdge, "edge"), plain: capture(svgPlain, "plain") },
      sel: childCount(svgFill, "g.sel") + childCount(svgEdge, "g.sel") + childCount(svgPlain, "g.sel"),
    };
  }, [key, x, y]);

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
  const scatter = await inspect("scatter");
  pin(scatter, "scatter");
  passed.push(`base-${scatter.baseTag}`);
  passed.push("overlay-on-base");
  assertNoAlertRed(scatter.css, "overlay-css");
  assertNoAlertRed(scatter.kids, "scatter/sel");
  assertNoTeal(scatter.css, "overlay-css");
  assertNoTeal(scatter.kids, "scatter/sel");

  const wash = {
    fill: scatter.kids.find((k) => k.layer === "fill" && k.kind === "closed"),
    edge: scatter.kids.find((k) => k.layer === "edge" && k.kind === "closed"),
    plain: scatter.kids.find((k) => k.layer === "plain" && k.kind === "closed"),
  };
  assertWash(wash, "scatter", false);
  passed.push("selected-wash");

  const pts = (await layersOf("scatter")).find((l) => l.kind === "circles");
  // `rGeom` is whatever geometry the manifest shipped, not a fixed literal — the scatter
  // notebook's markersize=22 built from the Scatter plot object, so this is the marker's drawn
  // radius, ≈0.3525·22·2 (px_per_unit) ≈ 15.5 image px, not the old markersize/2. Fill and edge
  // shapes are identical geometry — check both.
  const rGeom = pts.geometry[5]; // selectedIndex 1 → r at 3*1+2
  for (const shape of [wash.fill, wash.edge].filter(Boolean)) {
    assertCircleR(shape.r, rGeom, `scatter/selected-${shape.layer}`);
  }
  passed.push("circle-r");

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
  const dwash = {
    fill: dark.kids.find((k) => k.layer === "fill" && k.kind === "closed"),
    edge: dark.kids.find((k) => k.layer === "edge" && k.kind === "closed"),
    plain: dark.kids.find((k) => k.layer === "plain" && k.kind === "closed"),
  };
  assertWash(dwash, "scatter_dark", true);
  assertNoAlertRed(dark.kids, "scatter_dark");
  assertNoTeal(dark.kids, "scatter_dark");
  passed.push("dark-figure-wash");

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
    return (sr.querySelector("svg.masque-fill g.sel")?.children.length ?? 0)
      + (sr.querySelector("svg.masque-edge g.sel")?.children.length ?? 0)
      + (sr.querySelector("svg.masque-plain g.sel")?.children.length ?? 0);
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
  // selection's edge and a hover's edge both take that colour; the dodge fill half is unchanged.
  const STYLED = "rgb(0, 102, 204)";
  const styled = await inspect("scatter_styled");
  pin(styled, "scatter_styled");
  const sEdge = styled.kids.find((k) => k.layer === "edge" && k.kind === "closed");
  if (!sEdge || sEdge.stroke !== STYLED || sEdge.width !== "4") {
    throw new Error(`scatter_styled: selected edge ${JSON.stringify(sEdge)} (want stroke ${STYLED}, width 4)`);
  }
  if (!styled.kids.some((k) => k.layer === "fill" && k.kind === "closed")) {
    throw new Error("scatter_styled: selected dodge fill missing");
  }
  const stPts = (await layersOf("scatter_styled")).find((l) => l.kind === "circles");
  let sTip = null;
  for (let a = 0; a < 8; a++) {
    sTip = await hoverAt("scatter_styled", stPts.geometry[0], stPts.geometry[1]);
    if (sTip.hi.edge) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!sTip?.hi.edge || sTip.hi.edge.stroke !== STYLED || sTip.hi.edge.width !== "3" || !sTip.hi.fill) {
    throw new Error(`scatter_styled: hover ${JSON.stringify(sTip?.hi)} (want edge ${STYLED} at width 3, plus the fill)`);
  }
  passed.push("overlaystyle");

  // Axis3 kinds (#301): the baked selection and a hover on another mark sit on the projected
  // mark. `overlap3d` hovers the front marker of a pair: the highlight must take the marker's
  // circle, not the sphere's behind it.
  for (const [key, layerId, sel, hov] of [
    ["scatter3d", "scatter", 1, 0],
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
        const w = {
          fill: m.kids.find((k) => k.layer === "fill" && k.kind === "closed"),
          edge: m.kids.find((k) => k.layer === "edge" && k.kind === "closed"),
          plain: m.kids.find((k) => k.layer === "plain" && k.kind === "closed"),
        };
        assertWash(w, key, false);
        for (const shape of [w.fill, w.edge].filter(Boolean)) {
          assertCircleR(shape.r, g[3 * sel + 2], `${key}/selected-${shape.layer}`);
          if (Math.abs(Number(shape.cx) - g[3 * sel]) > 0.6 || Math.abs(Number(shape.cy) - g[3 * sel + 1]) > 0.6) {
            throw new Error(`${key}: selected wash off the mark (${shape.cx},${shape.cy}) vs (${g[3 * sel]},${g[3 * sel + 1]})`);
          }
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
          if (key === "meshscatter3d") {
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

  // The axis readout's cursor-following tooltip: the caret apex sits on the pointer, both in
  // open space and where the box clamps at the right edge (the caret then moves along the box).
  // The bottom flip (.flip-y) leaves this horizontal apex unchanged; overlay.test.ts pins it. Before, it sat a fixed 14px into a box offset
  // 10px from the pointer, so it pointed beside the crosshair cursor.
  for (const [fx, fy, where] of [[0.15, 0.25, "open"], [0.8, 0.25, "right-edge"]]) {
    const r = await page.evaluate(async ([fx, fy]) => {
      const span = document.querySelector("#coords_axis");
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const b = host.querySelector("img, canvas").getBoundingClientRect();
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
