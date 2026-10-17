import { pathData, polygonRings, ringsPathData, screenFixedLayer } from "./geometry"
import { hitKey, prefersReducedMotion, selectedHits, MOTION_MS } from "./state"
import type { HiGroups, HiSet, OverlayCtx, OverlayState } from "./state"
import { regionCells } from "./regions"
import type { Hit, HitLayer, LayerStyle } from "./types"

export const SVG_NS = "http://www.w3.org/2000/svg"

export const DEFAULT_STYLE: LayerStyle = { width: 2 }

// --- highlight element factory (shared by hover drawHi and box-selection selGroup) ---
type HiMode = "hover" | "selected"

// hit.layer.colors is per-LAYER (a single string, or a layer-wide palette + one index per
// element) — never resolved per the specific hit here beyond that one palette lookup, so an
// out-of-range index (a payload/colors length mismatch) degrades to no accent rather than
// throwing.
export function markColorFor(hit: Hit): string | null {
    const c = hit.layer.colors
    if (!c) return null
    if (typeof c === "string") return c
    return c.palette[c.index[hit.index]] ?? null
}

// An explicit per-layer hoverstyle stroke from Julia (wins outright, used verbatim). Shared by
// every unblended (mount.ts's svg.masque-plain) highlight element — the explicit-stroke path
// below, rings, the ROI outline, the threshold line. ROI grips set the same property themselves.
// A resolved mark colour no longer feeds
// a highlight's own colour (mount.ts's blend-tint path replaces that); markColorFor is still
// exported for hover.ts's tooltip accent border.
function setHiStroke(el: SVGElement | SVGGElement, stroke: string | undefined): void {
    if (stroke) el.style.setProperty("--masque-hi-stroke", stroke)
}

export function makeRing(shape: SVGElement, stroke: string | undefined): SVGGElement {
    const g = document.createElementNS(SVG_NS, "g")
    const inner = shape
    const outer = shape.cloneNode(true) as SVGElement
    for (const el of [inner, outer]) {
        el.classList.add("masque-hi")
        el.setAttribute("vector-effect", "non-scaling-stroke")
    }
    inner.classList.add("masque-ring-inner")
    outer.classList.add("masque-ring-outer")
    setHiStroke(g, stroke) // custom property inherits — set once on the wrapper
    g.append(outer, inner) // outer under inner so the 2px stroke stays crisp
    return g
}

// Which svg(s) a highlight lands in. An explicit hoverstyle stroke, or the selected-open ring,
// is unblended → plain only. Otherwise a closed shape splits into a brightening fill shape
// (fill svg) and a flat chrome stroke (edge svg) of identical geometry; an open (seg) shape
// has no interior, so hover on it is edge-only; a rectfill (grid cell-block union rect) is
// fill-only, since the ROI box itself already draws that outline.
export interface HiResult {
    fill?: SVGElement
    edge?: SVGElement
    plain?: SVGElement
}

export function makeHiElement(hit: Hit, mode: HiMode = "hover"): HiResult | null {
    if (!hit.geom_) return null
    const st = hit.layer.style ?? DEFAULT_STYLE
    if (hit.geom_[0] === "mask") return maskElements(hit.geom_ as [string, string, string], st.stroke, mode)
    const g = hit.geom_ as [string, ...number[]] | [string, number[]]
    let el: SVGElement | null = null
    if (g[0] === "circle" || g[0] === "point") {
        el = document.createElementNS(SVG_NS, "circle")
        el.setAttribute("cx", String(g[1])); el.setAttribute("cy", String(g[2])); el.setAttribute("r", String(g[3]))
    } else if (g[0] === "rect" || g[0] === "rectfill") {
        el = document.createElementNS(SVG_NS, "rect")
        el.setAttribute("x", String((g[1] as number) - (g[3] as number) / 2))
        el.setAttribute("y", String((g[2] as number) - (g[4] as number) / 2))
        el.setAttribute("width", String(g[3])); el.setAttribute("height", String(g[4]))
    } else if (g[0] === "seg") {
        el = document.createElementNS(SVG_NS, "line")
        el.setAttribute("x1", String(g[1])); el.setAttribute("y1", String(g[2]))
        el.setAttribute("x2", String(g[3])); el.setAttribute("y2", String(g[4]))
    } else if (g[0] === "path") {
        // Whole plotted line. fill none so the open stroke doesn't paint an interior; a NaN
        // gap is a new subpath, not a second element.
        el = document.createElementNS(SVG_NS, "path")
        el.setAttribute("d", pathData(g[1] as number[]))
        el.setAttribute("fill", "none")
    } else if (g[0] === "poly") {
        const rings = polygonRings(g[1] as number[] | number[][])
        if (rings.length < 2) {
            el = document.createElementNS(SVG_NS, "polygon")
            const ring = rings[0] ?? []
            let pts = ""
            for (let k = 0; k < ring.length; k += 2) pts += `${ring[k]},${ring[k + 1]} `
            el.setAttribute("points", pts.trim())
        } else {
            // One subpath per ring. evenodd leaves each hole unfilled and strokes its outline.
            el = document.createElementNS(SVG_NS, "path")
            el.setAttribute("fill-rule", "evenodd")
            el.setAttribute("d", ringsPathData(rings))
        }
    }
    if (!el) return null
    // A picked point on a line is open too: a ring around the point, the line showing through.
    const open = g[0] === "seg" || g[0] === "path" || g[0] === "point"
    const rectfill = g[0] === "rectfill"

    // Explicit hoverstyle stroke: today's single unblended element in svg.masque-plain, unchanged.
    if (st.stroke) {
        if (mode === "selected" && open) return { plain: makeRing(el, st.stroke) }
        el.classList.add("masque-hi")
        el.setAttribute("vector-effect", "non-scaling-stroke")
        setHiStroke(el, st.stroke)
        if (mode === "hover") {
            el.classList.add("masque-w-hover")
            if (!open) el.classList.add("masque-hover")
        } else if (rectfill) {
            el.classList.add("masque-wash", "masque-nostroke")
        } else {
            el.classList.add("masque-wash", "masque-w-selected")
        }
        return { plain: el }
    }

    // Selected open geometry always renders as the unblended ring, in svg.masque-plain, whether
    // or not this layer would otherwise split — a bare stroke ring reads fine unblended, and
    // mount.ts's ring rules never gained a fill/edge variant.
    if (mode === "selected" && open) return { plain: makeRing(el, undefined) }

    if (rectfill) {
        // Fill only: the ROI box itself already draws the outline, so an edge shape here would
        // double it into two parallel edges that persist after release.
        el.classList.add("masque-hi", "masque-fillshape")
        return { fill: el }
    }

    if (open) {
        // A line has no interior — hover is edge (stroke) only, no fill shape.
        el.classList.add("masque-hi", "masque-hover", "masque-w-hover")
        el.setAttribute("vector-effect", "non-scaling-stroke")
        return { edge: el }
    }

    // Closed geometry: two shapes of identical geometry, cloned before either is modified — a
    // brightening fill (no stroke) and a flat chrome stroke (no fill). Hover and selected share
    // that stroke colour; the edge width (1.5 vs 2) is what separates them.
    const fillEl = el
    const edgeEl = el.cloneNode(true) as SVGElement
    fillEl.classList.add("masque-hi", "masque-fillshape")
    edgeEl.classList.add("masque-hi")
    edgeEl.setAttribute("vector-effect", "non-scaling-stroke")
    if (mode === "hover") {
        edgeEl.classList.add("masque-hover", "masque-w-hover")
    } else {
        edgeEl.classList.add("masque-wash", "masque-w-selected")
    }
    return { fill: fillEl, edge: edgeEl }
}

// A grid's selected cells (gridmask.ts's maskHit), or a hovered region (regions.ts): the
// closed-mark recipe, with the fill over the cells and the edge on the outline only, so the
// cells inside the area show no grid lines. Square caps close the corners where a row side
// meets a column side. Hover draws the hover edge (1.5px), a selection the selected one (2px).
function maskElements(g: [string, string, string], stroke: string | undefined, mode: HiMode): HiResult {
    const edgeClasses = mode === "hover" ? ["masque-hover", "masque-w-hover"] : ["masque-wash", "masque-w-selected"]
    const fill = document.createElementNS(SVG_NS, "path")
    fill.setAttribute("d", g[1])
    const edge = document.createElementNS(SVG_NS, "path")
    edge.setAttribute("d", g[2])
    edge.setAttribute("fill", "none")
    edge.setAttribute("stroke-linecap", "square")
    edge.setAttribute("vector-effect", "non-scaling-stroke")
    if (stroke) {
        const wrap = document.createElementNS(SVG_NS, "g")
        setHiStroke(wrap, stroke)
        fill.classList.add("masque-hi", "masque-wash", "masque-nostroke")
        edge.classList.add("masque-hi", ...edgeClasses)
        edge.style.setProperty("fill", "none")
        wrap.append(fill, edge)
        return { plain: wrap }
    }
    fill.classList.add("masque-hi", "masque-fillshape")
    edge.classList.add("masque-hi", ...edgeClasses)
    return { fill, edge }
}

// --- highlight/selection DOM-lifecycle: keyed by OverlayState.hiKey_ / selKeys_ ---
// Every function below takes a whole HiSet: all three groups (fill_/edge_/plain_) on every
// axis, since a single hover/selection can land in one or two of them, and a redraw or clear
// must not leave a stale element behind in a group it isn't using this time (e.g. a hover moving
// off an explicit-stroke mark onto a plain one switches which svg(s) hold the live element). A
// mark lands in its own axis's home, so it slides and clips with that axis (#368).

// Fade-out is hover-only (leave / miss). selects-ROI remounts g.sel every drag
// frame — a leave class there would wash the box-select on every pointer tick.
function hiNodes(set: HiSet): SVGGElement[] {
    return set.all_().flatMap((g) => [g.fill_, g.edge_, g.plain_])
}

function firstHiChild(set: HiSet): Element | null {
    for (const g of hiNodes(set)) if (g.firstElementChild) return g.firstElementChild
    return null
}

function emptyAll(set: HiSet): void {
    for (const g of hiNodes(set)) while (g.firstChild) g.removeChild(g.firstChild)
}

function placeMade(groups: HiGroups, made: HiResult, enter: boolean): void {
    for (const [el, g] of [[made.fill, groups.fill_], [made.edge, groups.edge_], [made.plain, groups.plain_]] as const) {
        if (!el) continue
        if (enter) el.classList.add("masque-enter")
        g.appendChild(el)
    }
}

// `also` is the other hover home (data vs screen-fixed). A ring only lives in one of them,
// and a clear has to drop both or the one you left keeps painting.
export function clearHiImmediate(state: OverlayState, hiGroups: HiSet, also?: HiSet): void {
    if (state.hiLeaveTimer_ != null) { clearTimeout(state.hiLeaveTimer_); state.hiLeaveTimer_ = null }
    state.hiKey_ = null
    for (const groups of also ? [hiGroups, also] : [hiGroups]) emptyAll(groups)
}

export function clearHi(state: OverlayState, hiGroups: HiSet, fade = false, also?: HiSet): void {
    const sets = also ? [hiGroups, also] : [hiGroups]
    const cur = firstHiChild(hiGroups) ?? (also ? firstHiChild(also) : null)
    if (!fade || !cur || prefersReducedMotion()) {
        clearHiImmediate(state, hiGroups, also)
        return
    }
    // Keep hiKey_ until the nodes are gone. drawSelection reconciles from it, and nulling
    // it here left a mid-leave ring sitting on the new selected chrome for MOTION_MS (#97).
    const fadingKey = state.hiKey_
    for (const groups of sets) {
        for (const hiGroup of hiNodes(groups)) {
            for (const el of [...hiGroup.children]) {
                el.classList.remove("masque-enter")
                el.classList.add("masque-leave")
            }
        }
    }
    if (state.hiLeaveTimer_ != null) clearTimeout(state.hiLeaveTimer_)
    state.hiLeaveTimer_ = setTimeout(() => {
        state.hiLeaveTimer_ = null
        for (const groups of sets) emptyAll(groups)
        if (state.hiKey_ === fadingKey) state.hiKey_ = null
    }, MOTION_MS)
}

export function clearSel(selGroups: HiSet): void {
    emptyAll(selGroups)
}

// Hovering an already-selected mark draws no hover chrome at all: both layers are opaque, so a
// 1.5px hover stroke painting over the 2px selected stroke would thin it, reading as WEAKER, not
// added emphasis — the selected wash/ring already shows this element. The tooltip is unaffected;
// callers (hover.ts, keyboard.ts) show it via a separate call. This is the draw-time half of the
// guard; the other direction — a hover/focus ring already on-screen when its key ENTERS the
// selection, including one mid-leave (clearHi keeps hiKey_ until those nodes are gone) — is
// reconciled by drawSelection below, which clears the stale hiGroups the moment the key
// becomes selected.
export function drawHi(state: OverlayState, hiGroups: HiSet, hit: Hit, also?: HiSet): void {
    const key = hitKey(hit)
    if (state.selKeys_.has(key) || maskHolds(state, key, hit.layer)) { clearHiImmediate(state, hiGroups, also); return }
    const cur = firstHiChild(hiGroups)
    if (key === state.hiKey_ && cur && !cur.classList.contains("masque-leave")) return
    clearHiImmediate(state, hiGroups, also)
    const made = makeHiElement(hit, "hover")
    if (!made) return
    placeMade(hiGroups.at_(hit.layer.axis), made, true)
    state.hiKey_ = key
}

// Screen-fixed chrome (legend, colorbar, axis) is drawn outside the photograph clip.
// Data marks stay in the clipped, transformed groups so the ring slides with them.
export function drawHover(ctx: OverlayCtx, state: OverlayState, hit: Hit): void {
    const fixed = screenFixedLayer(hit.layer)
    drawHi(state, fixed ? ctx.hiFixed_ : ctx.hiGroup_, hit, fixed ? ctx.hiGroup_ : ctx.hiFixed_)
}

export function clearHover(ctx: OverlayCtx, state: OverlayState, fade = false): void {
    clearHi(state, ctx.hiGroup_, fade, ctx.hiFixed_)
}

// --- g.link lifecycle: a legend entry's linked highlight, keyed by the SOURCE hit (not the
// individual target hits it fans out to) — mirrors drawHi/clearHi's single-key convention, just
// over a whole hit array instead of one element, and over all three fill_/edge_/plain_ groups
// like drawHi/drawSelection above.

export function clearLinkImmediate(state: OverlayState, linkGroups: HiSet): void {
    if (state.linkLeaveTimer_ != null) { clearTimeout(state.linkLeaveTimer_); state.linkLeaveTimer_ = null }
    state.linkKey_ = null
    emptyAll(linkGroups)
}

export function clearLink(state: OverlayState, linkGroups: HiSet, fade = false): void {
    const cur = firstHiChild(linkGroups)
    if (!fade || !cur || prefersReducedMotion()) {
        clearLinkImmediate(state, linkGroups)
        return
    }
    state.linkKey_ = null
    for (const linkGroup of hiNodes(linkGroups)) {
        for (const el of [...linkGroup.children]) {
            el.classList.remove("masque-enter")
            el.classList.add("masque-leave")
        }
    }
    if (state.linkLeaveTimer_ != null) clearTimeout(state.linkLeaveTimer_)
    state.linkLeaveTimer_ = setTimeout(() => {
        state.linkLeaveTimer_ = null
        emptyAll(linkGroups)
    }, MOTION_MS)
}

// Same-key repeat (still hovering/focusing the same legend element) is a no-op, like drawHi.
// A different key replaces the whole set immediately (no leave-fade in between) — cheap since
// this only ever swaps between two legend entries' worth of selected-recipe elements — and the
// new set enters with the usual fade-in.
export function drawLink(state: OverlayState, linkGroups: HiSet, key: string, hits: Hit[]): void {
    const cur = firstHiChild(linkGroups)
    if (key === state.linkKey_ && cur && !cur.classList.contains("masque-leave")) return
    clearLinkImmediate(state, linkGroups)
    // A hit already pinned in g.sel would double the fill/stroke opacity if drawn again here
    // (same reasoning as drawHi's guard).
    for (const h of hits) {
        if (state.selKeys_.has(hitKey(h))) continue
        const made = makeHiElement(h, "selected")
        if (made) placeMade(linkGroups.at_(h.layer.axis), made, true)
    }
    state.linkKey_ = key
}

function placeSel(selGroups: HiSet, hits: Hit[], entering: Set<string>): void {
    clearSel(selGroups)
    for (const h of hits) {
        const made = makeHiElement(h, "selected")
        if (made) placeMade(selGroups.at_(h.layer.axis), made, entering.has(hitKey(h)))
    }
}

export function drawSelection(state: OverlayState, selGroups: HiSet, hits: Hit[], hiGroups: HiSet): void {
    const next = new Set(hits.map(hitKey))
    const entering = new Set<string>()
    for (const k of next) if (!state.selKeys_.has(k)) entering.add(k)
    placeSel(selGroups, hits, entering)
    state.selKeys_ = next
    // A hover/focus ring already on-screen when its key enters selection — live, or mid-leave,
    // since hiKey_ still names those nodes — would otherwise sit on top of the wash just drawn
    // above until the next pointermove self-heals it via drawHi's own guard. Clear it now so the
    // stale chrome never paints, mid-sweep included.
    if (state.hiKey_ !== null && next.has(state.hiKey_)) clearHiImmediate(state, hiGroups)
}

// The single funnel to g.sel — every writer of state.sel_ calls this after assigning it.
// Screen-fixed hits (a legend entry) land outside the photograph clip. Linked data marks stay in.
export function renderSelection(ctx: OverlayCtx, state: OverlayState): void {
    const data: Hit[] = []
    const fixed: Hit[] = []
    const hits = selectedHits(state)
    for (const h of hits) (screenFixedLayer(h.layer) ? fixed : data).push(h)
    const next = new Set(hits.map(hitKey))
    const entering = new Set<string>()
    for (const k of next) if (!state.selKeys_.has(k)) entering.add(k)
    placeSel(ctx.selGroup_, data, entering)
    placeSel(ctx.selFixed_, fixed, entering)
    state.selKeys_ = next
    const hi = state.hiKey_
    if (hi !== null && (next.has(hi) || maskHolds(state, hi, ctx.manifest_.layers.find((l) => l.id === hi.slice(0, hi.lastIndexOf(":")))))) {
        clearHiImmediate(state, ctx.hiGroup_, ctx.hiFixed_)
    }
}

// A grid cell a mask holds counts as selected for the hover guard above, though the mask is
// drawn as one hit rather than a key per cell. A region's key (`:r<id>`) is held when every
// one of its cells is: a `selected=` seed can cut through a region.
function maskHolds(state: OverlayState, key: string, layer: HitLayer | undefined): boolean {
    const at = key.lastIndexOf(":")
    const mask = state.sel_.get(key.slice(0, at))?.mask_
    if (mask === undefined) return false
    const tail = key.slice(at + 1)
    if (tail.startsWith("r")) {
        const cells = layer ? regionCells(layer, Number(tail.slice(1))) : []
        return cells.length > 0 && cells.every((c) => mask[c] === 1)
    }
    return mask[Number(tail)] === 1
}
