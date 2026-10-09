// Agent live-verify for keyboard navigation + ARIA. Drives the same kind_sweep_{cairo,webgl}.jl
// notebook kind_sweep.mjs/polish_verify.mjs use, but exercises the keyboard path: Tab-reachable
// focus, arrow/Home/End/PageUp/PageDown navigation, Enter's bond round-trip, Escape, Tab-away
// clearing focus, the live region, and that :grid stays out of the focus list.
//
//   node keyboard_a11y.mjs <base-url> <notebook-abs-path> <cairo|webgl> [artifact-dir]
import { chromium } from "playwright";
import { shutdownOpenSession } from "./fresh_session.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [base, notebook, backend, artifactDirArg] = process.argv.slice(2);
if (!base || !notebook || !backend) {
  console.error("usage: node keyboard_a11y.mjs <base-url> <notebook> <cairo|webgl> [artifact-dir]");
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
let page;
try {
  const context = await browser.newContext({
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
  page.on("console", (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));

  await shutdownOpenSession(base, notebook);
  await page.goto(`${base}/open?path=${encodeURIComponent(notebook)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const deadline = Date.now() + 1500000;
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
      let meta = null;
      try { meta = JSON.parse(document.querySelector("#kind_meta")?.textContent || ""); } catch { meta = null; }
      return {
        busy: document.querySelectorAll("pluto-cell.running, pluto-cell.queued").length,
        errored: document.querySelectorAll("pluto-cell.errored").length,
        hosts: hosts.length, surfaces, metaN: Array.isArray(meta) ? meta.length : 0,
        errText: [...document.querySelectorAll("pluto-cell.errored")].map((c) => c.innerText).slice(0, 1).join(""),
      };
    });
    if (st.errored) throw new Error(`${backend} errored: ${st.errText.slice(0, 500)}`);
    if (!st.busy && st.metaN >= 14 && st.surfaces >= st.metaN) { ready = true; break; }
    if (tick % 20 === 0) console.error(`  …${backend} [${tick}s] busy=${st.busy} surfaces=${st.surfaces} meta=${st.metaN}`);
    tick++;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error(`${backend} timed out waiting for kind-sweep widgets`);
  console.error(`phase: widgets mounted (${backend})`);

  const meta = await page.evaluate(() => JSON.parse(document.querySelector("#kind_meta").textContent));
  const layersOf = (key) => page.evaluate((k) => JSON.parse(document.querySelector(`#coords_${k}`).textContent), key);
  const textOf = (sel) => page.evaluate((q) => document.querySelector(q)?.innerText ?? "", sel);

  // Element handle for the shadow-root .surface of a given kind-sweep case, resolved the same
  // way kind_sweep.mjs does (coords_<key> span's DOM position -> nearest preceding .ip-host).
  const surfaceHandle = (key) => page.evaluateHandle((k) => {
    const span = document.querySelector(`#coords_${k}`);
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    return sr.querySelector(".surface");
  }, key);

  const state = (key) => page.evaluate((k) => {
    const span = document.querySelector(`#coords_${k}`);
    const hosts = [...document.querySelectorAll(".ip-host")];
    const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
    // Keyboard focus draws the same bare-shape highlight a hover would: svg.masque-fill's g.hi
    // (dodge fill half) and svg.masque-edge's g.hi (flat chrome stroke) for the default
    // split-blend recipe on a closed mark, svg.masque-plain's g.hi for an explicit `hoverstyle`
    // or an open seg (edge-only) — no wrapper either way, so masque-leave lives on the node
    // itself. Any populated layer is enough to prove a ring was drawn; grab whichever is first.
    const hi = sr.querySelector("svg.masque-fill g.hi > *")
      || sr.querySelector("svg.masque-edge g.hi > *")
      || sr.querySelector("svg.masque-plain g.hi > *");
    const live = sr.querySelector('[aria-live="polite"]');
    const surf = sr.querySelector(".surface");
    const oc = getComputedStyle(surf);
    return {
      focused: sr.activeElement === surf,
      // #168: the surface's own focus indicator, as the browser computes it.
      focusVisible: surf.matches(":focus-visible"),
      kbdRing: surf.classList.contains("kbd-ring"),
      outline: { style: oc.outlineStyle, width: oc.outlineWidth, offset: oc.outlineOffset, color: oc.outlineColor },
      chrome: getComputedStyle(sr.host).getPropertyValue("--masque-chrome").trim(),
      ring: hi ? { tag: hi.tagName.toLowerCase(), leaving: hi.classList.contains("masque-leave") } : null,
      liveText: live?.textContent ?? "",
      tipShown: sr.querySelector(".masque-tip")?.classList.contains("show") ?? false,
    };
  }, key);

  // scheduleAnnounce (keyboard.ts) writes the live region asynchronously, so a single read
  // right after the keypress can land before the text arrives (issue #96: 4 CI sightings, one
  // read, no poll). Bounded-poll for a non-empty match instead — same "poll with a cap, return
  // the last observation on timeout" shape as kind_sweep.mjs's stableClipShot — so a genuine
  // regression (announcement never arrives) still fails, just after the deadline instead of
  // instantly.
  const waitForLiveRegion = async (widgetKey, re, { tries = 20, interval = 150 } = {}) => {
    let s = null;
    for (let i = 0; i < tries; i++) {
      s = await state(widgetKey);
      if (re.test(s.liveText)) return s;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, interval));
    }
    return s;
  };

  // Element count per kind, matching selection.ts's layerNElements — used to pick an Enter
  // target index guaranteed to differ from whatever this layer's bond value already holds
  // (this notebook session is shared across kind_sweep.mjs/polish_verify.mjs, which already
  // click some of these layers; Pluto skips re-running a bond's dependent cell when the new
  // value equals the old one, so re-clicking the SAME index would look like a silent failure).
  const elementCount = (layer) => {
    const g = layer.geometry;
    if (layer.kind === "circles") return g.length / 3;
    if (layer.kind === "rects") return g.length / 4;
    if (layer.kind === "polygons") return g.length;
    throw new Error(`elementCount: unhandled kind ${layer.kind}`);
  };

  for (const key of ["scatter", "barplot", "poly"]) {
    const layers = await layersOf(key);
    const layer = layers[0];
    const n = elementCount(layer);
    const surface = await surfaceHandle(key);
    // The baked-`selected` index for this layer (poly bakes 0; scatter/barplot bake 1), or null
    // when nothing is baked — see kind_sweep_figures.jl's meta.
    const spec = meta.find((m) => m.key === key);
    const bakedSelected = spec?.selected ? spec.selectedIndex : null;

    await surface.focus();
    let s = await state(key);
    if (!s.focused) throw new Error(`${key}: surface.focus() did not set DOM focus (tabindex missing?)`);
    passed.push(`${key}/focusable`);

    // Landing index after k ArrowRight presses from an unfocused surface is k-1 (0-based).
    // Focusing (like hovering) an already-selected mark is a no-op — no highlight — so if the
    // first arrow would land on this layer's baked `selected` index, press one more ArrowRight
    // to land somewhere else before asserting the ring was drawn.
    await page.keyboard.press("ArrowRight");
    let landed = 0;
    if (bakedSelected === landed) {
      await page.keyboard.press("ArrowRight");
      landed = 1;
    }
    s = await state(key);
    if (!s.ring) throw new Error(`${key}: ArrowRight drew no ring`);
    if (!s.tipShown) throw new Error(`${key}: ArrowRight showed no tooltip`);
    passed.push(`${key}/arrow-ring+tip`);

    const liveRe = new RegExp(`element ${landed + 1} of ${n}`);
    s = await waitForLiveRegion(key, liveRe);
    if (!liveRe.test(s.liveText)) throw new Error(`${key}: live region text unexpected (timed out waiting for a match): ${JSON.stringify(s.liveText)}`);
    passed.push(`${key}/live-region`);

    const before = await textOf(`#out_${key}`);
    // The bond prints a 1-based Julia index. Arrow steps and `target` stay 0-based wire indices.
    const beforeIdxMatch = new RegExp(`:${layer.id},\\s*(\\d+)\\b`).exec(before);
    const beforeWire = beforeIdxMatch ? Number(beforeIdxMatch[1]) - 1 : -1;
    const target = (beforeWire + 1) % n; // guaranteed != beforeWire as long as n > 1
    // We're at `landed` — walk to `target`. ArrowRight/ArrowLeft clamp at the ends, they don't
    // wrap, so step in whichever direction `target` actually is from here.
    const delta = target - landed;
    const stepKey = delta >= 0 ? "ArrowRight" : "ArrowLeft";
    for (let i = 0; i < Math.abs(delta); i++) await page.keyboard.press(stepKey);
    await page.keyboard.press("Enter");
    let after = before;
    for (let i = 0; i < 40 && after === before; i++) { await page.waitForTimeout(100); after = await textOf(`#out_${key}`); }
    if (after === before) throw new Error(`${key}: Enter never updated #out_${key} (wire index ${target}, was ${beforeWire})`);
    const idRe = new RegExp(`:${layer.id}|${layer.id}`, "i");
    if (!idRe.test(after)) throw new Error(`${key}: Enter bond value missing layer id: ${after.slice(0, 200)}`);
    if (!new RegExp(`:${layer.id},\\s*${target + 1}\\b`).test(after)) {
      throw new Error(`${key}: Enter bond value expected Julia index ${target + 1}: ${after.slice(0, 200)}`);
    }
    passed.push(`${key}/enter-bind`);

    await page.keyboard.press("Escape");
    s = await state(key);
    if (s.focused) throw new Error(`${key}: Escape did not blur the surface`);
    if (s.ring && !s.ring.leaving) throw new Error(`${key}: Escape left a non-fading ring`);
    passed.push(`${key}/escape`);
  }

  // Tab-away (not just Escape) must clear keyboard focus — the case mount.ts's `focusout`
  // listener exists for: leaving the surface any other way (Tab onward, a click elsewhere)
  // must not leave the ring/tooltip pinned to the last-focused element indefinitely.
  {
    const key = "scatter";
    const surface = await surfaceHandle(key);
    await surface.focus();
    await page.keyboard.press("ArrowRight");
    let s = await state(key);
    // A warm re-run's Enter may have selected element 0, and focusing a selected mark draws no
    // ring. Step once more.
    if (!s.ring) { await page.keyboard.press("ArrowRight"); s = await state(key); }
    if (!s.ring) throw new Error(`${key}: ArrowRight (tab-away setup) drew no ring`);
    await page.keyboard.press("Tab");
    s = await state(key);
    if (s.focused) throw new Error(`${key}: Tab did not move DOM focus off the surface`);
    if (s.ring && !s.ring.leaving) throw new Error(`${key}: Tab-away left a non-fading ring`);
    passed.push(`${key}/tab-away-clears-focus`);
  }

  // A legend entry's linked highlight (g.link) is keyboard-reachable via the SAME focusTo ->
  // updateLinkForHit path pointer hover uses (keyboard.ts's focusTo calls updateLinkForHit
  // unconditionally, mirroring hover.ts) — this had zero prior driver coverage. `legend`'s
  // manifest sorts the LegendInteractable layer before the plot layers it labels (src/render.jl
  // ~line 259, regression-checked live by kind_sweep.mjs's legend-precedence assertions), so its
  // own rows are the FIRST FOCUSABLE_KINDS entries in the flat focus list.
  {
    const key = "legend";
    const linkGCount = (k) => page.evaluate((kk) => {
      const span = document.querySelector(`#coords_${kk}`);
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      const groups = ["svg.masque-fill", "svg.masque-edge", "svg.masque-plain"].map((sel) => sr.querySelector(sel)?.querySelector("g.link"));
      const populated = groups.find((g) => g && g.children.length > 0);
      return {
        count: groups.reduce((n, g) => n + (g?.children.length ?? 0), 0),
        leaving: populated ? populated.firstElementChild.classList.contains("masque-leave") : null,
      };
    }, k);

    const layers = await layersOf(key);
    const legendLayer = layers.find((l) => l.id === "legend");
    if (!legendLayer) throw new Error(`${key}: no "legend" layer in manifest`);
    const legendIdx = layers.indexOf(legendLayer);
    const countOf = (l) => {
      const g = l.geometry;
      if (l.kind === "circles") return g.length / 3;
      if (l.kind === "rects") return g.length / 4;
      if (l.kind === "segments") return g.length / 4;
      if (l.kind === "polyline") return Math.max(0, g.length / 2 - 1);
      if (l.kind === "lines") return g.length;
      if (l.kind === "polygons") return g.length;
      return 0; // :grid/:threshold/:roi/:view aren't in FOCUSABLE_KINDS
    };
    const FOCUSABLE = new Set(["circles", "rects", "polygons", "segments", "polyline", "lines"]);
    let before = 0;
    for (let i = 0; i < legendIdx; i++) if (FOCUSABLE.has(layers[i].kind)) before += countOf(layers[i]);
    // "pts" is legend row index 2 (kind_sweep_figures.jl's links.cases) -> flat focus index
    // before+2, landed after (before+3) ArrowRight presses (this file's k-presses-lands-k-1 rule).
    const target = before + 2;
    const surface = await surfaceHandle(key);
    await surface.focus();
    for (let i = 0; i <= target; i++) await page.keyboard.press("ArrowRight");
    const li = await linkGCount(key);
    if (li.count === 0) throw new Error(`${key}: keyboard focus on a legend row drew no g.link content`);
    passed.push("legend/keyboard-focus-draws-link");

    // Default legend has no visual card. The live region still names the entry ("pts" is row
    // index 2, the one this block focuses).
    let focused = await state(key);
    if (focused.tipShown) throw new Error(`${key}: default legend focus showed a tooltip`);
    focused = await waitForLiveRegion(key, /pts/);
    if (!/pts/.test(focused.liveText)) {
      throw new Error(`${key}: live region missing entry label: ${JSON.stringify(focused.liveText)}`);
    }
    passed.push("legend/no-default-tip+announces-label");

    await page.keyboard.press("Escape");
    const afterEsc = await linkGCount(key);
    if (afterEsc.count === 0) throw new Error(`${key}: Escape cleared g.link instantly (no remount fade)`);
    if (!afterEsc.leaving) throw new Error(`${key}: Escape did not apply masque-leave to g.link`);
    passed.push("legend/keyboard-escape-fades-link");

    // #304: a plot's Makie `label` names its layer, and the live region announces that name
    // before the position. Every plot here has one, so End's mark (the last focusable layer's
    // last element) starts with its plot's label.
    const named = Object.fromEntries(layers.filter((l) => FOCUSABLE.has(l.kind)).map((l) => [l.id, l.label]));
    if (named.lines !== "quad" || named.lines_2 !== "lin" || named.scatter !== "pts") {
      throw new Error(`${key}: plot layers not named after their Makie labels: ${JSON.stringify(named)}`);
    }
    const last = layers.filter((l) => FOCUSABLE.has(l.kind) && l.id !== "legend").at(-1);
    await surface.focus();
    await page.keyboard.press("End");
    const prefix = new RegExp(`^${last.label}, element \\d+ of \\d+`);
    const atEnd = await waitForLiveRegion(key, prefix);
    if (!prefix.test(atEnd.liveText)) {
      throw new Error(`${key}: live region does not start with the layer name: ${JSON.stringify(atEnd.liveText)}`);
    }
    passed.push("legend/plot-label-names-layer");
    await page.keyboard.press("Escape");
  }

  // :grid (heatmap) must never enter the focus list — arrowing must draw nothing.
  {
    const surface = await surfaceHandle("heatmap");
    await surface.focus();
    await page.keyboard.press("ArrowRight");
    const s = await state("heatmap");
    if (s.ring) throw new Error("heatmap: :grid unexpectedly focusable (ring drawn)");
    passed.push("grid-excluded");
  }

  // #168: exactly one keyboard-focus indicator. A real Tab onto a widget with nothing to arrow
  // through draws the surface's own inset chrome outline; a mark ring replaces it; a pointer
  // click draws neither.
  const rgbOf = (hex) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  };
  const assertSurfaceOutline = (s, where) => {
    if (!s.focused || !s.focusVisible) throw new Error(`${where}: expected keyboard focus (:focus-visible) ${JSON.stringify(s)}`);
    if (s.kbdRing) throw new Error(`${where}: kbd-ring set with no mark ring ${JSON.stringify(s)}`);
    const o = s.outline;
    if (o.style !== "solid" || o.width !== "2px" || o.offset !== "-2px" || o.color !== rgbOf(s.chrome)) {
      throw new Error(`${where}: expected a 2px solid inset outline in ${s.chrome}, got ${JSON.stringify(o)}`);
    }
  };
  {
    // Tab away and back, so focus arrives by keyboard, not by script.
    const surface = await surfaceHandle("heatmap");
    await surface.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    let s = await state("heatmap");
    assertSurfaceOutline(s, "heatmap/tab");
    await page.keyboard.press("ArrowRight");
    s = await state("heatmap");
    assertSurfaceOutline(s, "heatmap/after-arrow");
    passed.push("focus-outline-grid");

    const sc = await surfaceHandle("scatter");
    await sc.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    s = await state("scatter");
    assertSurfaceOutline(s, "scatter/before-arrow");
    await page.keyboard.press("ArrowRight");
    s = await state("scatter");
    if (!s.ring) { await page.keyboard.press("ArrowRight"); s = await state("scatter"); } // see tab-away above
    if (!s.kbdRing || !s.ring) throw new Error(`scatter: arrow drew no mark ring ${JSON.stringify(s)}`);
    if (s.outline.style !== "none") throw new Error(`scatter: surface outline still drawn under the mark ring ${JSON.stringify(s.outline)}`);
    passed.push("focus-outline-yields-to-ring");
    // Escape clears the ring and leaves the plot (keyboard.ts blurs the surface): no indicator.
    await page.keyboard.press("Escape");
    s = await state("scatter");
    if (s.focused || s.kbdRing || s.outline.style !== "none") {
      throw new Error(`scatter: Escape left an indicator ${JSON.stringify(s)}`);
    }
    passed.push("focus-outline-cleared-on-escape");

    // A pointer click focuses the surface (onDown only preventDefaults a drag) but is not
    // :focus-visible, so no outline. ElementHandle.click scrolls the surface into view first; a
    // raw page.mouse.click at its box can land off-screen and focus nothing, which would pass
    // this check for the wrong reason.
    await (await surfaceHandle("heatmap")).click();
    s = await state("heatmap");
    if (!s.focused || s.focusVisible || s.outline.style !== "none") {
      throw new Error(`heatmap: a pointer click drew a focus outline ${JSON.stringify(s)}`);
    }
    passed.push("focus-outline-not-on-click");
  }


  // Park the pointer off every plot first. The heatmap click above left it on the page, and once
  // a widget scrolls into view under it, the browser's synthetic mousemove counts as a hover:
  // a miss there hides the keyboard readout these checks wait for.
  await page.mouse.move(0, 0);

  // #169: each drag layer is its own tab stop after the plot surface. Arrows there nudge the
  // line, the box, or the camera; the readout updates per keydown and the bond (a view: the
  // settle) goes out once, on keyup, even after a held key's repeats.
  {
    // Tracks the stop, its layer's chrome, the bond writes (`input` events on the host) and
    // the gesture-frame stamp for one widget.
    const dragState = (key, layerId) => page.evaluate(([k, id]) => {
      const span = document.querySelector(`#coords_${k}`);
      const hosts = [...document.querySelectorAll(".ip-host")];
      const host = hosts.filter((h) => (h.compareDocumentPosition(span) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
      let sr = null; host.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) sr = el.shadowRoot; });
      window.__masqueKbdInputs ??= {};
      if (!(k in window.__masqueKbdInputs)) {
        window.__masqueKbdInputs[k] = 0;
        host.addEventListener("input", () => { window.__masqueKbdInputs[k] += 1; });
      }
      const stop = sr.querySelector(`.drag-stop[data-layer="${id}"]`);
      const oc = stop ? getComputedStyle(stop) : null;
      const line = sr.querySelector(".masque-threshold-line");
      const rect = sr.querySelector("svg.masque-plain rect.masque-hi");
      const live = sr.querySelector('[aria-live="polite"]');
      return {
        exists: !!stop,
        role: stop?.getAttribute("role") ?? null,
        valuetext: stop?.getAttribute("aria-valuetext") ?? null,
        hint: stop ? (sr.getElementById(stop.getAttribute("aria-describedby"))?.textContent ?? "") : "",
        focused: !!stop && sr.activeElement === stop,
        focusVisible: !!stop && stop.matches(":focus-visible"),
        outline: oc ? { style: oc.outlineStyle, width: oc.outlineWidth, color: oc.outlineColor } : null,
        chrome: getComputedStyle(sr.host).getPropertyValue("--masque-chrome").trim(),
        lineY: line ? Number(line.getAttribute("y1")) : null,
        rect: rect ? ["x", "y", "width", "height"].map((a) => Number(rect.getAttribute(a))) : null,
        tip: sr.querySelector(".masque-tip")?.classList.contains("show") ? sr.querySelector(".masque-tip").textContent : null,
        liveText: live?.textContent ?? "",
        inputs: window.__masqueKbdInputs[k],
        frame: host.dataset.masqueGestureFrame ? JSON.parse(host.dataset.masqueGestureFrame) : null,
        scrollY: window.scrollY,
        // Image px per CSS px: the overlay svg's viewBox is the manifest's image size.
        pxPerCss: Number(sr.querySelector("svg.masque-plain").getAttribute("viewBox").split(/\s+/)[2]) /
          sr.querySelector(".surface").getBoundingClientRect().width,
      };
    }, [key, layerId]);
    const rgbOfChrome = (hex) => {
      const n = parseInt(hex.replace("#", ""), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    // Reach the stop the way a keyboard user does: focus the plot, then Tab once.
    const tabToStop = async (key, layerId) => {
      const surface = await surfaceHandle(key);
      await surface.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await surface.focus();
      await page.keyboard.press("Tab");
      const s = await dragState(key, layerId);
      if (!s.exists) throw new Error(`${key}: no drag stop for layer ${layerId}`);
      if (!s.focused || !s.focusVisible) throw new Error(`${key}: Tab from the surface did not land on the drag stop ${JSON.stringify(s)}`);
      const o = s.outline;
      if (o.style !== "solid" || o.width !== "2px" || o.color !== rgbOfChrome(s.chrome)) {
        throw new Error(`${key}: drag stop focus outline ${JSON.stringify(o)}, expected 2px solid ${s.chrome}`);
      }
      return s;
    };
    // Hold a key through `n` keydowns (the first plus n-1 repeats), then release it.
    const hold = async (k, n, mid) => {
      for (let i = 0; i < n; i++) await page.keyboard.down(k);
      if (mid) await mid();
      await page.keyboard.up(k);
    };
    const waitFor = async (fn, what, tries = 60, ms = 200) => {
      let v = null;
      for (let i = 0; i < tries; i++) { v = await fn(); if (v.ok) return v; await page.waitForTimeout(ms); }
      throw new Error(`timed out waiting for ${what}: ${JSON.stringify(v)}`);
    };

    // Threshold: a horizontal line, so Up/Down move it and Left/Right are swallowed.
    {
      const key = "threshold", id = "threshold";
      let s = await tabToStop(key, id);
      if (s.role !== "slider") throw new Error(`${key}: stop role ${s.role}`);
      if (!/Up or Down/.test(s.hint)) throw new Error(`${key}: hint ${JSON.stringify(s.hint)}`);
      const pxPerCss = s.pxPerCss;
      const y0 = s.lineY, n0 = s.inputs, scroll0 = s.scrollY, before = await textOf(`#out_${key}`);
      await page.keyboard.press("ArrowLeft");
      s = await dragState(key, id);
      if (s.lineY !== y0 || s.inputs !== n0 || s.scrollY !== scroll0) throw new Error(`${key}: ArrowLeft moved the line, wrote the bond, or scrolled ${JSON.stringify(s)}`);
      passed.push(`${key}/cross-axis-swallowed`);
      let mid = null;
      await hold("ArrowUp", 5, async () => { await page.waitForTimeout(300); mid = await dragState(key, id); });
      if (mid.inputs !== n0) throw new Error(`${key}: bond written while the key was down (${mid.inputs - n0} writes)`);
      if (!mid.tip) throw new Error(`${key}: no readout while the key was down`);
      if (Math.abs((y0 - mid.lineY) - 5 * pxPerCss) > 0.5) throw new Error(`${key}: 5 presses moved ${y0 - mid.lineY} image px, expected ${5 * pxPerCss}`);
      s = await dragState(key, id);
      if (s.inputs !== n0 + 1) throw new Error(`${key}: expected one bond write on keyup, got ${s.inputs - n0}`);
      if (mid.valuetext === null || !mid.tip.includes(mid.valuetext)) throw new Error(`${key}: aria-valuetext ${mid.valuetext} vs readout ${mid.tip}`);
      const after = await waitFor(async () => { const t = await textOf(`#out_${key}`); return { ok: t !== before, t }; }, `${key} bond`);
      if (!/ThresholdEvent|:threshold/.test(after.t)) throw new Error(`${key}: bond readout ${after.t.slice(0, 200)}`);
      s = await waitForLiveRegion(key, /\d/);
      if (!/\d/.test(s.liveText)) throw new Error(`${key}: live region did not announce the value: ${JSON.stringify(s.liveText)}`);
      passed.push(`${key}/arrow-nudge+single-bind+announce`);
      await page.keyboard.press("Escape");
      s = await dragState(key, id);
      if (s.focused) throw new Error(`${key}: Escape did not blur the stop`);
      passed.push(`${key}/escape`);
    }

    // ROI: arrows translate, Alt+Arrow grows a side. Each release writes the bond once.
    {
      const key = "roi", id = "roi";
      let s = await tabToStop(key, id);
      const pxPerCss = s.pxPerCss;
      const r0 = s.rect, n0 = s.inputs, before = await textOf(`#out_${key}`);
      await hold("ArrowRight", 4);
      s = await dragState(key, id);
      if (Math.abs(s.rect[0] - r0[0] - 4 * pxPerCss) > 0.5 || s.rect[2] !== r0[2]) throw new Error(`${key}: ArrowRight ×4 gave ${JSON.stringify(s.rect)} from ${JSON.stringify(r0)}`);
      if (s.inputs !== n0 + 1) throw new Error(`${key}: expected one bond write, got ${s.inputs - n0}`);
      if (!/selected/.test(s.tip ?? "")) throw new Error(`${key}: selects readout missing: ${s.tip}`);
      await page.keyboard.press("Alt+ArrowDown");
      const s2 = await dragState(key, id);
      if (Math.abs(s2.rect[3] - s.rect[3] - pxPerCss) > 0.5 || s2.rect[1] !== s.rect[1]) throw new Error(`${key}: Alt+ArrowDown gave ${JSON.stringify(s2.rect)} from ${JSON.stringify(s.rect)}`);
      await page.keyboard.press("Alt+Shift+ArrowDown");
      const s3 = await dragState(key, id);
      if (Math.abs(s3.rect[3] - s.rect[3]) > 0.5) throw new Error(`${key}: Alt+Shift+ArrowDown did not shrink back: ${JSON.stringify(s3.rect)}`);
      if (s3.inputs !== n0 + 3) throw new Error(`${key}: expected three bond writes, got ${s3.inputs - n0}`);
      await waitFor(async () => { const t = await textOf(`#out_${key}`); return { ok: t !== before, t }; }, `${key} bond`);
      passed.push(`${key}/arrow-move+alt-resize+single-bind`);
      await page.keyboard.press("Escape");
    }

    // View (pan): arrows and + preview through the gesture channel and settle once on keyup.
    // The bond never moves.
    {
      const key = "view", id = "view";
      let s = await tabToStop(key, id);
      const n0 = s.inputs, before = await textOf(`#out_${key}`);
      // Earlier drivers may have panned this view, so measure one press against the window a
      // first press settled on.
      const settleAfter = (n, what) => waitFor(async () => {
        const d = await dragState(key, id);
        return { ok: d.frame && d.frame.n > n && d.frame.settle, f: d.frame };
      }, what);
      // Hold the first press until its preview frame lands: the frame brings a manifest, and
      // the readout must survive it until the key comes up.
      await page.keyboard.down("ArrowRight");
      const preview = await waitFor(async () => {
        const d = await dragState(key, id);
        return { ok: d.frame && d.frame.n > (s.frame?.n ?? 0), d };
      }, `${key} preview frame`);
      await page.waitForTimeout(200);
      const held = await dragState(key, id);
      if (!held.tip || !/x:\[/.test(held.tip)) throw new Error(`${key}: a preview frame hid the readout ${JSON.stringify({ tip: held.tip, frame: preview.d.frame })}`);
      await page.keyboard.up("ArrowRight");
      const first = await settleAfter(s.frame?.n ?? 0, `${key} settle frame`);
      await page.keyboard.press("ArrowRight");
      const settled = await settleAfter(first.f.n, `${key} second settle frame`);
      const span = first.f.xmax - first.f.xmin;
      if (Math.abs((settled.f.xmin - first.f.xmin) - 0.1 * span) > 0.02 * span) {
        throw new Error(`${key}: ArrowRight panned ${JSON.stringify(first.f)} -> ${JSON.stringify(settled.f)}, expected +10%`);
      }
      const f1 = settled.f.n;
      await page.keyboard.press("+");
      const zoomed = await settleAfter(f1, `${key} zoom frame`);
      if (!(zoomed.f.xmax - zoomed.f.xmin < span)) throw new Error(`${key}: + did not zoom in: ${JSON.stringify(zoomed.f)}`);
      s = await dragState(key, id);
      if (s.inputs !== n0) throw new Error(`${key}: a view nudge wrote the bond`);
      if ((await textOf(`#out_${key}`)) !== before) throw new Error(`${key}: a view nudge changed #out_${key}`);
      // Put the camera back for the drivers that run after this one.
      await page.keyboard.press("-");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(1500);
      passed.push(`${key}/arrow-pan+zoom+settle-no-bind`);
      await page.keyboard.press("Escape");
    }

    // Axis3 view (#321): + zooms the limits about their center, Shift+arrow pans them, and
    // a plain arrow still orbits. The bond never moves.
    {
      const key = "view3d", id = "view";
      let s = await tabToStop(key, id);
      const n0 = s.inputs, before = await textOf(`#out_${key}`);
      const settleAfter = (n, what) => waitFor(async () => {
        const d = await dragState(key, id);
        return { ok: d.frame && d.frame.n > n && d.frame.settle && Array.isArray(d.frame.limits), f: d.frame };
      }, what);
      const w = (l, i) => l[2 * i + 1] - l[2 * i];
      await page.keyboard.press("+");
      const zoomed = await settleAfter(s.frame?.n ?? 0, `${key} zoom frame`);
      await page.keyboard.press("+");
      const zoomed2 = await settleAfter(zoomed.f.n, `${key} second zoom frame`);
      if (!(w(zoomed2.f.limits, 0) < w(zoomed.f.limits, 0))) {
        throw new Error(`${key}: + did not zoom in from the last limits: ${JSON.stringify(zoomed.f)} -> ${JSON.stringify(zoomed2.f)}`);
      }
      await page.keyboard.press("Shift+ArrowRight");
      const panned = await settleAfter(zoomed2.f.n, `${key} pan frame`);
      const moved = panned.f.limits.some((v, i) => Math.abs(v - zoomed2.f.limits[i]) > 1e-3 * w(zoomed2.f.limits, Math.floor(i / 2)));
      if (!moved || Math.abs(w(panned.f.limits, 0) - w(zoomed2.f.limits, 0)) > 1e-6) {
        throw new Error(`${key}: Shift+ArrowRight did not pan: ${JSON.stringify(zoomed2.f)} -> ${JSON.stringify(panned.f)}`);
      }
      await page.keyboard.press("ArrowRight");
      const orbit = await settleAfter(panned.f.n, `${key} orbit frame`);
      if (!(Math.abs(orbit.f.azimuth - panned.f.azimuth) > 0.05)) throw new Error(`${key}: ArrowRight did not orbit: ${JSON.stringify(orbit.f)}`);
      s = await dragState(key, id);
      if (s.inputs !== n0) throw new Error(`${key}: a view nudge wrote the bond`);
      if ((await textOf(`#out_${key}`)) !== before) throw new Error(`${key}: a view nudge changed #out_${key}`);
      // Put the camera back for the drivers that run after this one.
      for (const k of ["ArrowLeft", "Shift+ArrowLeft", "-", "-"]) await page.keyboard.press(k);
      await page.waitForTimeout(1500);
      passed.push(`${key}/zoom+shift-pan+orbit-no-bind`);
      await page.keyboard.press("Escape");
    }
  }

  if (unexpected.length) throw new Error(`page errors: ${unexpected.join(" | ")}`);
  passed.push("no-console-errors");
  console.log(`KEYBOARD A11Y OK — ${backend}: ${passed.join(", ")}`);
} catch (e) {
  failed = e;
  // Mirrors the captureFailure shape kind_sweep.mjs/polish_verify.mjs use: screenshot + DOM
  // dump + console log, so a CI failure ships enough evidence to diagnose without re-running.
  if (artifactDir && page) {
    try {
      await page.screenshot({ path: join(artifactDir, `keyboard_a11y-${backend}-failure.png`), fullPage: true });
      const dump = await page.evaluate(() => ({
        title: document.title,
        url: location.href,
        cells: [...document.querySelectorAll("pluto-cell")].map((c) => ({ id: c.id, classes: c.className })),
        hosts: document.querySelectorAll(".ip-host").length,
        activeElement: document.activeElement?.tagName,
      }));
      writeFileSync(join(artifactDir, `keyboard_a11y-${backend}-dom.json`), JSON.stringify(dump, null, 2));
      writeFileSync(join(artifactDir, `keyboard_a11y-${backend}-console.log`), consoleLog.join("\n"));
      console.error(`artifact: wrote keyboard_a11y-${backend}-{failure.png,dom.json,console.log} to ${artifactDir}`);
    } catch (e2) {
      console.error("artifact capture failed:", e2.message);
    }
  }
} finally {
  await browser.close();
}
if (failed) {
  console.error(`KEYBOARD A11Y FAIL (${backend}, after ${passed.join(", ")}):`, failed.message);
  process.exit(1);
}
