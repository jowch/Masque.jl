// Shared visual-fidelity asserts for kind_sweep.mjs + polish_verify.mjs.
// Recipe: the "Visual language (settled)" section of docs/dev/live-interaction-checklist.md
// (cite, do not reopen). The shadow root holds THREE sibling top-level svgs, identical
// box/viewBox, in DOM order `svg.masque-fill` (`mix-blend-mode: color-dodge`, a fixed `#141414`
// source that brightens without rotating hue), `svg.masque-edge` (no blend: the halo, a
// `g.masque-halo` of casing, ink core and inner casing; hover and selected differ by the core's
// width), and `svg.masque-plain` (no blend). A closed mark's hover, and a grid cell's or region's
// pick, is a fill shape plus a halo of identical geometry; an open seg or a line's sample dot is
// the halo only; a `rectfill` (selects-ROI grid cell-block union) is fill-only. `svg.masque-plain`
// holds ROI/threshold and a layer with an explicit Julia `hoverstyle` stroke: single element,
// unblended, verbatim colour + 18%/35% tint (and the 2px/4px ring on its open picks). Hovering a
// mark already picked in an SVG recipe draws no highlight. Remount fade is a plain opacity fade
// (`masque-enter`/`masque-leave`) on each top-level element, 80-120ms.

export const ALERT_RED = "#ff3b30";
export const TEAL = "#3A6F7C";

// The fill layer's source colour (`color-dodge` against this near-black brightens without
// rotating hue — see mount.ts). The edge layer is the halo: an ink core between two casing bands,
// Pluto's off-black and off-white, ink on a light plot area and swapped on a dark one, the same
// colours for hover and selected (the core's width tells them apart). GREY is the control chrome
// (ROI box, threshold), unchanged.
export const DODGE_FILL = "rgb(20, 20, 20)";
export const GREY = {
  light: { stroke: "rgb(122, 122, 122)" },
  dark: { stroke: "rgb(200, 200, 200)" },
};
export const HALO = {
  light: { ink: "rgb(31, 31, 31)", casing: "rgb(250, 250, 250)" },
  dark: { ink: "rgb(250, 250, 250)", casing: "rgb(31, 31, 31)" },
};

// Page-side capture of a halo (highlight.ts's haloOf): pass `HALO_CAPTURE` into page.evaluate
// and rebuild it there with `new Function("g", HALO_CAPTURE)`. Returns null for anything that is
// not a `g.masque-halo`; else its core element and the bands' computed strokes and widths.
export const HALO_CAPTURE = `
  if (!g || !g.classList || !g.classList.contains("masque-halo")) return null;
  const sw = (el) => (el ? parseFloat(getComputedStyle(el).strokeWidth) : null);
  const outer = g.querySelector(":scope > .masque-halo-outer"), inner = g.querySelector(":scope > .masque-halo-inner");
  const host = g.getRootNode().host;
  return {
    core: g.querySelector(":scope > .masque-hi"),
    align: [...g.classList].map((c) => /^masque-halo-(mid|in|out|line)$/.exec(c)).find(Boolean)?.[1] ?? null,
    mode: g.classList.contains("masque-halo-hover") ? "hover" : "selected",
    caseStroke: outer ? getComputedStyle(outer).stroke : null,
    innerStroke: inner ? getComputedStyle(inner).stroke : null,
    outer: sw(outer), inner: sw(inner),
    u: host ? parseFloat(getComputedStyle(host).getPropertyValue("--masque-halo-u")) : null,
    clip: g.getAttribute("clip-path"), mask: g.getAttribute("mask"),
    classes: g.getAttribute("class"),
  };
`;

// A captured shape whose `halo` (HALO_CAPTURE's fields, less `core`) is set: ink core in the
// figure's tone with the opposite casing, the mode's class on the core, and the band widths the
// alignment gives (one band `u` wide; the core one band for hover, two for a pick; inside or
// outside an edge only half of each stroke shows, so those are twice as wide). `aligns` lists
// the alignments the caller accepts.
export function assertHalo(shape, where, mode, wantDark, aligns) {
  const h = shape?.halo;
  if (!h) throw new Error(`${where}: not a halo ${JSON.stringify(shape)}`);
  if (h.mode !== mode) throw new Error(`${where}: halo mode ${h.mode} (want ${mode}) ${JSON.stringify(h)}`);
  if (aligns && !aligns.includes(h.align)) throw new Error(`${where}: halo sits ${h.align} (want ${aligns.join("/")})`);
  const want = wantDark ? HALO.dark : HALO.light;
  if (shape.stroke !== want.ink) throw new Error(`${where}: halo core ${shape.stroke} (want ${want.ink})`);
  if (h.caseStroke !== want.casing) throw new Error(`${where}: halo casing ${h.caseStroke} (want ${want.casing})`);
  if (h.align !== "mid" && h.innerStroke !== want.casing) throw new Error(`${where}: inner casing ${h.innerStroke} (want ${want.casing})`);
  if (!hasClass(shape.className, "masque-hi") || !hasClass(shape.className, mode === "hover" ? "masque-hover" : "masque-wash")) {
    throw new Error(`${where}: halo core classes ${shape.className}`);
  }
  if (shape.fill !== "none") throw new Error(`${where}: halo core fill ${shape.fill} (want none)`);
  const u = h.u, core = Number(shape.width), near = (a, b) => Math.abs(a - b) < 0.05;
  if (!(u >= 0.5 && u <= 1)) throw new Error(`${where}: halo band ${u} (want max(1/dpr, 0.5) CSS px)`);
  const c = mode === "hover" ? u : 2 * u;
  if (h.align === "mid") {
    if (!near(core, c) || !near(h.outer, c + 2 * u)) throw new Error(`${where}: centred halo widths core ${core} outer ${h.outer} (want ${c}, ${c + 2 * u})`);
  } else if (h.align === "in" || h.align === "out") {
    if (!near(core, 2 * c + 2 * u) || !near(h.outer, 2 * c + 4 * u) || !near(h.inner, 2 * u)) {
      throw new Error(`${where}: ${h.align} halo widths ${h.outer}/${core}/${h.inner} (want ${2 * c + 4 * u}/${2 * c + 2 * u}/${2 * u})`);
    }
    if (h.align === "in" && !h.clip) throw new Error(`${where}: inset halo not clipped to its shape`);
    if (h.align === "out" && !h.mask) throw new Error(`${where}: outset halo not masked off its mark`);
  } else if (h.align === "line") {
    if (!(h.outer > core && core > h.inner && h.inner > 0) || !h.mask) throw new Error(`${where}: line halo ${JSON.stringify(h)} core ${core}`);
  }
}

// getComputedStyle serializes a colour back out in whatever functional notation the browser
// picked for the value's colour space — not necessarily rgb(). A color-mix(in lch, …) result in
// particular can come back as lch(), lab(), oklch(), or (Chromium, gamut-mapped) color(srgb …).
// Returns 0-100 (rgb/color(srgb) rescaled; lab/lch already 0-100; oklab/oklch rescaled from
// their 0-1 lightness), or null if unparseable.
function colorLightness(s) {
  const str = String(s || "").trim();
  let m = str.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const ch = m[1].split(",").slice(0, 3).map((x) => Number(x.trim()));
    if (ch.some(Number.isNaN)) return null;
    return (ch.reduce((a, b) => a + b, 0) / 3 / 255) * 100;
  }
  m = str.match(/^color\(srgb\s+([^)]+)\)$/i);
  if (m) {
    const ch = m[1].trim().split(/\s+/).slice(0, 3).map((x) => Number(x));
    if (ch.some(Number.isNaN)) return null;
    return (ch.reduce((a, b) => a + b, 0) / 3) * 100;
  }
  m = str.match(/^(ok)?(?:lab|lch)\(([^)]+)\)$/i);
  if (m) {
    const L = Number(m[2].trim().split(/\s+/)[0]);
    if (Number.isNaN(L)) return null;
    return m[1] ? L * 100 : L;
  }
  return null;
}
export { colorLightness };

export function assertNoAlertRed(blob, where) {
  const s = typeof blob === "string" ? blob : JSON.stringify(blob);
  if (/#ff3b30|rgba?\(\s*255[\s,]+59[\s,]+48(?:[\s,/][^)]*)?\)/i.test(s)) {
    throw new Error(`${where}: alert red ${ALERT_RED} leaked into the overlay`);
  }
}

// The old fixed steel-teal ring #3A6F7C is retired — every highlight now either draws the
// dodge fill / fixed-grey edge stroke, or, for an explicit `hoverstyle`, the caller's own
// verbatim colour, so this literal must never appear in the overlay.
export function assertNoTeal(blob, where) {
  const s = typeof blob === "string" ? blob : JSON.stringify(blob);
  if (/#3a6f7c|rgb\(\s*58[\s,]+111[\s,]+124\s*\)/i.test(s)) {
    throw new Error(`${where}: steel-teal ${TEAL} leaked (highlight must be the dodge fill / grey edge, or an explicit hoverstyle, not a fixed literal)`);
  }
}

function hasClass(className, want) {
  return String(className || "").trim().split(/\s+/).includes(want);
}

function realColor(c) {
  return !!c && c !== "none" && c !== "rgba(0, 0, 0, 0)" && c !== "transparent";
}

// Every capture site (kind_sweep.mjs's `inspect`/`dispatchAt`, polish_verify.mjs's `inspect`/
// `hoverAt`) hands assertWash/assertHoverRecipe an object `{ fill, edge, plain }`: `fill` is the
// shape (if any) found in `svg.masque-fill`'s g.sel/g.hi, `edge` the one in `svg.masque-edge`,
// `plain` the one in `svg.masque-plain` (an explicit-`hoverstyle` layer, or — only for
// assertRing below — a selected-open-geometry ring). Each captured shape is `{ layer, tag,
// className, stroke, fill, fillOpacity (all getComputedStyle), width, opacity (computed
// stroke-width without "px", and computed stroke-opacity with 1 read as null), blend
// (getComputedStyle(svg).mixBlendMode, null for `plain`), …
// geometry }`. `wantDark` selects the figure-relative grey edge stroke (GREY.dark on a dark
// figure, GREY.light otherwise) — irrelevant for the `plain` (explicit-hoverstyle) path.
export function assertWash(wash, where, wantDark) {
  const { fill, edge, plain } = wash || {};
  if (plain && !fill && !edge) {
    // Explicit `hoverstyle` stroke: unblended, single element, verbatim colour + 35% tint (the
    // pre-split recipe, unchanged).
    if (!hasClass(plain.className, "masque-hi") || !hasClass(plain.className, "masque-wash")) {
      throw new Error(`${where}: wash element missing masque-hi/masque-wash class ${JSON.stringify(plain)}`);
    }
    if (plain.width !== "2") throw new Error(`${where}: wash recipe ${JSON.stringify(plain)}`);
    if (!realColor(plain.fill) || plain.fill !== plain.stroke) {
      throw new Error(`${where}: wash fill/stroke mismatch ${JSON.stringify(plain)}`);
    }
    if (String(plain.fillOpacity) !== "0.35") {
      throw new Error(`${where}: wash fill-opacity ${plain.fillOpacity} (want 0.35)`);
    }
    assertNoAlertRed(plain, where);
    assertNoTeal(plain, where);
    return;
  }
  if (!fill || !edge) throw new Error(`${where}: wash missing fill/edge pair ${JSON.stringify(wash)}`);
  if (!hasClass(fill.className, "masque-hi") || !hasClass(fill.className, "masque-fillshape")) {
    throw new Error(`${where}: wash fill shape missing masque-hi/masque-fillshape class ${JSON.stringify(fill)}`);
  }
  if (fill.fill !== DODGE_FILL) throw new Error(`${where}: wash fill colour ${fill.fill} (want ${DODGE_FILL})`);
  if (String(fill.fillOpacity) !== "1") throw new Error(`${where}: wash fill-opacity ${fill.fillOpacity} (want 1)`);
  if (fill.stroke !== "none") throw new Error(`${where}: wash fill shape stroke ${fill.stroke} (want none)`);
  if (fill.blend !== "color-dodge") throw new Error(`${where}: wash fill blend ${fill.blend} (want color-dodge)`);

  // An area's halo sits inside it (centred when it is too small); a point's outside it.
  assertHalo(edge, where, "selected", wantDark, edge.tag === "circle" ? ["out"] : ["in", "mid"]);
  if (edge.blend !== "normal") {
    throw new Error(`${where}: wash edge blend ${edge.blend} (want normal)`);
  }
  assertNoAlertRed(wash, where);
  assertNoTeal(wash, where);
}

// Selected open geometry: a picked point on a line, or a whole line or segment that has nothing
// to fade, is a pick halo in svg.masque-edge, outside the point or cased along the line. A
// capture with no `halo` is the ring a layer with an explicit `hoverstyle` stroke still draws in
// svg.masque-plain (inner 2px + outer 4px @ 0.25).
export function assertRing(ring, where, wantDark = false) {
  if (ring?.halo) {
    const core = ring.circles?.[0] ?? ring.paths?.[0] ?? ring.lines?.[0];
    assertHalo({ ...core, halo: ring.halo }, where, "selected", wantDark, ring.circles?.length ? ["out"] : ["line"]);
    assertNoAlertRed(ring, where);
    assertNoTeal(ring, where);
    return;
  }
  // A per-segment ring is two <line>s; a whole-line ring is two <path>s; a picked point on a
  // line is two <circle>s. Same 2px/4px recipe.
  const strokes = ring?.paths?.length ? ring.paths : ring?.circles?.length ? ring.circles : ring?.lines;
  if (!ring || !strokes || strokes.length !== 2) throw new Error(`${where}: ring ${JSON.stringify(ring)}`);
  if (!strokes.every((l) => hasClass(l.className, "masque-hi"))) {
    throw new Error(`${where}: ring line missing masque-hi class ${JSON.stringify(ring)}`);
  }
  const widths = strokes.map((l) => l.width).sort().join(",");
  if (widths !== "2,4") throw new Error(`${where}: ring recipe ${JSON.stringify(ring)}`);
  const g = wantDark ? GREY.dark : GREY.light;
  const colors = strokes.map((l) => l.stroke);
  if (colors[0] !== colors[1] || colors[0] !== g.stroke) {
    throw new Error(`${where}: ring stroke ${JSON.stringify(ring)} (want ${g.stroke})`);
  }
  const outer = strokes.find((l) => l.width === "4");
  if (!outer || String(outer.opacity) !== "0.25") {
    throw new Error(`${where}: ring outer opacity ${outer?.opacity} (want 0.25)`);
  }
  assertNoAlertRed(ring, where);
  assertNoTeal(ring, where);
}

// `closed` distinguishes a closed mark (circle/rect/poly — fill shape present, edge shape gets
// the `masque-hover` tint class too even though its own fill is inert) from an open seg (line —
// edge-only, no fill shape at all) in the default split-blend path, and the two UNBLENDED
// `hoverstyle` variants (`hi.plain` set, `hi.fill`/`hi.edge` both absent) the same way the old
// single-svg recipe did. If `closed` is omitted it's inferred from whichever shape is present
// (a fill shape or a non-`line` plain tag means closed) — pass it explicitly when the caller
// hovered an open seg (no fill shape to infer from). `wantDark` selects GREY.dark/GREY.light for
// the edge stroke; irrelevant on the `plain` path.
export function assertHoverRecipe(hi, where, closed, wantDark) {
  const { fill, edge, plain } = hi || {};
  if (plain && !fill && !edge) {
    if (closed === undefined) closed = plain.tag !== "line";
    if (!hasClass(plain.className, "masque-hi")) {
      throw new Error(`${where}: hover element missing masque-hi class ${JSON.stringify(plain)}`);
    }
    if (plain.width !== "1.5" || plain.opacity !== null) {
      throw new Error(`${where}: hover recipe ${JSON.stringify(plain)}`);
    }
    if (!realColor(plain.stroke)) throw new Error(`${where}: hover stroke not resolved ${JSON.stringify(plain)}`);
    if (closed) {
      // Explicit `hoverstyle` stroke, closed shape: unblended, verbatim colour + 18% tint.
      if (!hasClass(plain.className, "masque-hover")) {
        throw new Error(`${where}: closed hover missing masque-hover tint class ${JSON.stringify(plain)}`);
      }
      if (!realColor(plain.fill) || plain.fill !== plain.stroke) {
        throw new Error(`${where}: hover tint fill/stroke mismatch ${JSON.stringify(plain)}`);
      }
      if (String(plain.fillOpacity) !== "0.18") {
        throw new Error(`${where}: hover fill-opacity ${plain.fillOpacity} (want 0.18)`);
      }
    } else {
      // Explicit `hoverstyle` stroke, open seg: unblended, stroke-only, no tint class.
      if (hasClass(plain.className, "masque-hover")) {
        throw new Error(`${where}: open hover unexpectedly has masque-hover tint class ${JSON.stringify(plain)}`);
      }
      if (plain.fill !== "none") throw new Error(`${where}: open hover fill ${plain.fill} (want none, stroke-only)`);
    }
    assertNoAlertRed(plain, where);
    assertNoTeal(plain, where);
    return;
  }

  if (!edge) throw new Error(`${where}: missing hover edge stroke ${JSON.stringify(hi)}`);
  if (closed === undefined) closed = !!fill;
  if (closed && !fill) throw new Error(`${where}: closed hover missing fill shape ${JSON.stringify(hi)}`);
  if (!closed && fill) throw new Error(`${where}: open hover unexpectedly has a fill shape ${JSON.stringify(hi)}`);

  if (edge.opacity !== null) throw new Error(`${where}: hover edge recipe ${JSON.stringify(edge)}`);
  // A point (or a line's sample dot) is outset, an area inset or centred, a line cased.
  const aligns = edge.tag === "circle" ? ["out"] : edge.tag === "line" || (!closed && edge.tag === "path") ? ["line"] : ["in", "mid"];
  assertHalo(edge, where, "hover", wantDark, aligns);
  if (edge.blend !== "normal") {
    throw new Error(`${where}: hover edge blend ${edge.blend} (want normal)`);
  }
  if (closed) {
    if (!hasClass(fill.className, "masque-hi") || !hasClass(fill.className, "masque-fillshape")) {
      throw new Error(`${where}: hover fill missing masque-hi/masque-fillshape class ${JSON.stringify(fill)}`);
    }
    if (fill.fill !== DODGE_FILL) throw new Error(`${where}: hover fill colour ${fill.fill} (want ${DODGE_FILL})`);
    if (String(fill.fillOpacity) !== "1") throw new Error(`${where}: hover fill-opacity ${fill.fillOpacity} (want 1)`);
    if (fill.stroke !== "none") throw new Error(`${where}: hover fill stroke ${fill.stroke} (want none)`);
    if (fill.blend !== "color-dodge") throw new Error(`${where}: hover fill blend ${fill.blend} (want color-dodge)`);
  }
  assertNoAlertRed(hi, where);
  assertNoTeal(hi, where);
}

// Hovering a mark that is already selected must NOT draw a hover highlight (both layers already
// carry the opaque selected wash — see the module comment). The tooltip and `@bind` still fire;
// only this is skipped.
export function assertNoHighlight(hi, where) {
  if (hi?.fill || hi?.edge || hi?.plain) {
    throw new Error(`${where}: highlight drawn on an already-selected mark ${JSON.stringify(hi)}`);
  }
}

// Circle highlight geometry: r must equal the underlying geometry r exactly (no more r+2 halo).
// Call once per shape present (a closed mark's hover/selected draws it into BOTH the fill and
// edge layers, identical geometry — callers check both).
export function assertCircleR(actualR, geomR, where) {
  if (String(Number(actualR)) !== String(Number(geomR))) {
    throw new Error(`${where}: circle r=${actualR} geom r=${geomR} (want equal, no halo)`);
  }
}

// #99 round 2: both functions below now read a durable MutationObserver log
// (transient_log.mjs's logSince/pollLog — an array of { t, type: "add"|"remove"|"attr"|
// "hostRemount", group, svg, id, classes } entries) instead of a single instant DOM snapshot.
// The transient they check (masque-enter/masque-leave, 80-120ms) was always racy to *sample*;
// recording every mutation as it happens and asserting on the recorded SEQUENCE removes that
// race rather than trying to catch it at exactly the right moment. `entries` is whatever
// logSince/pollLog returned for the relevant window (kind_sweep.mjs's per-key no-pulse window
// runs from just before the tooltip-establishing hover to just after the stability nudge;
// polish_verify.mjs mirrors the same shape for its single scatter check).
//
// `hostRemount` entries mean the widget's shadow-hosting element was replaced outright mid-check
// (mount.ts's mount() running again) — that would otherwise silently orphan the group observers
// (they'd keep watching a detached subtree that never mutates again), so it's surfaced as its
// own loud, distinct failure rather than read as "no entries recorded".
export function assertRemountStable(entries, where) {
  const hostRemounts = entries.filter((e) => e.type === "hostRemount");
  if (hostRemounts.length) {
    // A genuine remount is a failure mode THIS PR added detection for — it isn't one of #99's
    // two originally-proposed mechanisms (both falsified; see the PR body), so pointing a
    // future reader at #99 would send them to an issue about a coalesced pointermove and a
    // marker-radius miss, neither of which is what fired here.
    throw new Error(`${where}: overlay remounted mid-check (shadow host replaced ${hostRemounts.length}x) — see #129`);
  }
  // A closed mark (circle/rect/polygon) draws its hover into BOTH svg.masque-fill's g.hi AND
  // svg.masque-edge's g.hi (two elements, identical geometry — CLAUDE.md's "Overlay recipes");
  // an open seg draws edge-only; an explicit-hoverstyle layer draws plain-only. So a single,
  // un-remounted hover legitimately produces one add PER svg it draws into, not one add total —
  // "no remount" is a per-svg claim, not a flat count across all three.
  //
  // Order matters too, not just count: the window this is asked to check can legitimately open
  // with a leading `remove` that has nothing to do with the hover being tested — e.g. the
  // TINT_CHECK_KEYS tint check (kind_sweep.mjs) hovers a DIFFERENT point and leaves it just
  // before this window opens; clearHi's 100ms removal timer for THAT hover can still be pending
  // when the window opens, and the very next hover (this check's own) calls clearHiImmediate,
  // which removes that stale element before appending its own. That remove-then-add is normal
  // cleanup of an unrelated prior hover, not a remount of this one — only mutations AFTER the
  // first `add` in a given svg (i.e. after THIS check's own hover actually landed) count.
  const hiEntries = entries.filter((e) => e.group === "hi" && (e.type === "add" || e.type === "remove"));
  const bySvg = new Map();
  for (const e of hiEntries) {
    if (!bySvg.has(e.svg)) bySvg.set(e.svg, []);
    bySvg.get(e.svg).push(e);
  }
  let sawEnter = false;
  for (const [svg, seq] of bySvg) {
    const firstAddIdx = seq.findIndex((e) => e.type === "add");
    if (firstAddIdx === -1) continue; // nothing but a leading remove in this svg -- unrelated prior-hover cleanup
    sawEnter = true;
    const firstAdd = seq[firstAddIdx];
    if (!hasClass(firstAdd.classes, "masque-enter")) {
      throw new Error(`${where}: first hover missing masque-enter fade (svg=${svg}, classes=${firstAdd.classes})`);
    }
    const after = seq.slice(firstAddIdx + 1);
    if (after.length) {
      throw new Error(`${where}: hover remounted (svg=${svg}: ${after.length} mutation(s) recorded after the initial hover — ${JSON.stringify(after)})`);
    }
  }
  if (!sawEnter) throw new Error(`${where}: no hover node ever recorded`);
}

// `group` lets kind_sweep.mjs's links-fade check (g.link, not g.hi) reuse this exact logic —
// the two used to be separate, hand-duplicated inline checks; consolidating means the links case
// now also gets a `hostRemount` check and the three-way distinction below, which it didn't have
// before. The genuine-instant-clear branch keeps the exact "cleared instantly (no remount fade)"
// substring so it still matches every pre-#99 CI log and #99's own reviewer technique (diffing
// --log-failed output across commits) for the scatter/hi case that issue is actually about; the
// links case's message never carried that exact substring historically either (it read
// "${key}/links: cleared instantly ..." with no "hover"), so gaining the word "hover" here is a
// harmless, deliberate consolidation, not a regression against any tracked string.
export function assertLeaveFade(entries, where, group = "hi") {
  const hostRemounts = entries.filter((e) => e.type === "hostRemount");
  if (hostRemounts.length) {
    // Same reasoning as assertRemountStable's hostRemount branch above — point at this PR, not
    // #99, since a genuine remount is a failure mode this PR added detection for, not one of
    // #99's originally-proposed (and falsified) mechanisms.
    throw new Error(`${where}: overlay remounted mid-leave-check (shadow host replaced ${hostRemounts.length}x) — see #129`);
  }
  const removes = entries.filter((e) => e.group === group && e.type === "remove");
  const leaveClassSeen = entries.some((e) => e.group === group && hasClass(e.classes, "masque-leave"));
  if (!removes.length) {
    if (!leaveClassSeen) throw new Error(`${where}: leave did not apply masque-leave (no removal or class-add recorded within the wait window)`);
    // New relative to the pre-#99 behaviour: the class WAS applied (a fade genuinely started)
    // but the element was never actually removed within the wait window — a real, different
    // bug from either of the two below, previously indistinguishable from "leave did not apply
    // masque-leave" because nothing recorded the intermediate state.
    throw new Error(`${where}: hover started fading (masque-leave applied) but was never removed within the wait window — see #99`);
  }
  // A closed mark's remove comes from BOTH svg.masque-fill and svg.masque-edge (same reasoning
  // as assertRemountStable above) — `every`, not `some`: a fade is only "proper" if every
  // element that got removed was carrying masque-leave when it went, not just one of them.
  const removedProperly = removes.every((e) => hasClass(e.classes, "masque-leave"));
  if (!removedProperly) {
    throw new Error(`${where}: hover cleared instantly (no remount fade)`);
  }
  // Ordering alone (class applied, then removed) doesn't check DURATION — highlight.ts's
  // MOTION_MS is a real ~80-120ms fade (CLAUDE.md's "Overlay recipes" locks 80-120ms), and if
  // it ever collapsed to near-zero, every check above would still pass (a class WAS applied,
  // the removed node DID carry it). `id` correlates the `attr` entry that first added
  // masque-leave to an element with the `remove` entry for that SAME element (elements keep
  // their assigned id for their whole lifetime — transient_log.mjs), so the actual elapsed fade
  // time is measurable. Floor only, no ceiling: setTimeout can be delayed by load but never
  // fires early, so a floor is immune to a contended runner; a ceiling would be flaky there and
  // must not be added.
  const FADE_FLOOR_MS = 50;
  for (const rem of removes) {
    const armed = entries.find((e) => e.id === rem.id && e.type === "attr" && hasClass(e.classes, "masque-leave"));
    if (armed && rem.t - armed.t < FADE_FLOOR_MS) {
      throw new Error(`${where}: fade too short (${(rem.t - armed.t).toFixed(1)}ms, want >= ${FADE_FLOOR_MS}ms)`);
    }
  }
}

// The caret's visible apex — not the box `left`/`top` coordinates an e2e driver already reads
// elsewhere in this file — is the thing the "caret on the anchor" contract is actually about, and
// no jsdom/happy-dom unit test can check it (calc()/border-box geometry needs a real layout
// engine). apexX/anchorX are both real page-space px, measured in a live browser.
export function assertCaretAtAnchor(apexX, anchorX, where, tol = 1) {
  if (Math.abs(apexX - anchorX) > tol) {
    throw new Error(`${where}: caret apex at ${apexX.toFixed(1)}px, anchor at ${anchorX.toFixed(1)}px (want within ${tol}px)`);
  }
}

// Tooltip theme is derived from the FIGURE's own background (CSS relative-colour syntax,
// mount.ts), not just OS prefers-color-scheme — so this checks brightness *relationships*
// (bg/fg contrast in the expected direction), not hardcoded rgb literals: the exact sRGB a
// browser's lch(from …) resolves to isn't something to hand-compute and pin down here.
export function assertTipBrightness(cs, wantDark, where) {
  const bgL = colorLightness(cs.bg), fgL = colorLightness(cs.color);
  if (bgL === null || fgL === null) throw new Error(`${where}: could not parse tip colors ${JSON.stringify(cs)}`);
  const bgOk = wantDark ? bgL < 40 : bgL > 60;
  const fgOk = wantDark ? fgL > 60 : fgL < 40;
  if (!bgOk || !fgOk) {
    throw new Error(
      `${where}: tip ${JSON.stringify(cs)} not ${wantDark ? "dark" : "light"}-themed (bgL=${bgL.toFixed(1)} fgL=${fgL.toFixed(1)})`,
    );
  }
}

// The `@supports not (…)` block in mount.ts's STYLE is the fallback for browsers without CSS
// relative-colour syntax — it reproduces the old static-light / OS-dark behaviour verbatim, so
// its literals (#1e1e1e/#e8e8e8) still have to be present; their absence here means the legacy
// fallback path itself is missing, not that a modern browser is failing to go dark.
export function assertSchemeCss(css, where) {
  if (!/prefers-color-scheme:\s*dark/.test(css)) {
    throw new Error(`${where}: overlay CSS missing prefers-color-scheme: dark (relative-colour fallback path)`);
  }
  if (!/#1e1e1e/.test(css) || !/#e8e8e8/.test(css)) {
    throw new Error(`${where}: legacy no-relative-colour dark tooltip fallback tokens missing`);
  }
  assertNoAlertRed(css, where);
}

// sample.css() reads the injected stylesheet once. sample.computedFor("light"|"dark") hovers
// the corresponding figure (default-background vs. explicitly dark-background) and returns its
// tooltip's { bg, color }. Confirms both a light and a dark FIGURE get the right tooltip theme,
// and — the actual new contract — that OS colour-scheme alone does *not* flip a light figure's
// tooltip once the figure itself carries a background.
export async function assertTooltipColorScheme(page, sample) {
  assertSchemeCss(await sample.css(), "overlay-css");
  assertTipBrightness(await sample.computedFor("light"), false, "tooltip/light-figure");
  assertTipBrightness(await sample.computedFor("dark"), true, "tooltip/dark-figure");
  await page.emulateMedia({ colorScheme: "dark" });
  assertTipBrightness(await sample.computedFor("light"), false, "tooltip/light-figure-under-os-dark");
  await page.emulateMedia({ colorScheme: "light" });
}

// Tint-applied (dodge fill brightens the mark itself, screenshot-verified): mean luminance
// (0-255) of a small page.screenshot() clip centred INSIDE the mark (a small box well within the
// drawn edge, not overlapping the rim — the rim is the chrome edge stroke, sampling across it
// would mix the stroke into the fill-layer reading), taken before vs. after the hover highlight
// applies. `color-dodge` against the near-black fill source can only raise luminance, so both a
// light and a dark figure are expected to get BRIGHTER on hover. See PNG.sync.read (pngjs,
// already a devDependency here) for the buffer -> RGBA
// decode.
export function meanLuminance(png) {
  let sum = 0;
  const n = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4) {
    sum += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
  }
  return sum / n;
}

export function assertTintApplied(lumBefore, lumAfter, where, minDelta = 4) {
  const delta = lumAfter - lumBefore;
  if (delta < minDelta) {
    throw new Error(
      `${where}: luminance before=${lumBefore.toFixed(1)} after=${lumAfter.toFixed(1)} delta=${delta.toFixed(1)} ` +
      `(want >= +${minDelta} — the dodge fill brightens the interior on every figure)`,
    );
  }
}
