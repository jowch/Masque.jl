import { findBin, invertAxis, polygonRings, samplePoint, SEG_TOL } from "./geometry"
import { surfacePointHit } from "./surface"
import type { AxisTransform, GridGeometry, Hit, HitLayer, Manifest, SurfaceGeometry } from "./types"
import type { FieldPick } from "./state"
import { decodeMask, maskHit } from "./gridmask"
import type { GridMask } from "./gridmask"

// Bond item shape emitted per contained element in a selects-ROI { items: SelectionItem[] }.
// `payload` is present only for a computed (non-element) target — a `:grid` cell range, since
// `:circles` is an element kind and Julia already reconstructs its payload from the manifest
// (#109); omitted rather than sent and discarded.
export type SelectionItem = { layer: string; index: number; payload?: unknown }
export type SelectionResult = { items: SelectionItem[]; hits: Hit[] }

// How far into a neighbouring cell a box edge may reach before that cell counts (#337). The
// manifest's cell edges are whole pixels, so a box edge placed on a data cell edge lands up to
// half a pixel either side of it.
export const EDGE_SLACK = 0.5

// [lo,hi] pixel span over an edge array → inclusive cell-index range clamped to the grid, or null if no overlap.
// An end cell the span only grazes (by EDGE_SLACK or less, and not all of it) is left out.
export function cellRange(edges: number[], lo: number, hi: number): [number, number] | null {
    const gmin = Math.min(edges[0], edges[edges.length - 1]), gmax = Math.max(edges[0], edges[edges.length - 1])
    const clo = Math.max(lo, gmin), chi = Math.min(hi, gmax)
    if (chi < clo) return null
    const a = findBin(edges, clo), b = findBin(edges, chi)
    if (a < 0 || b < 0) return null
    let i0 = Math.min(a, b), i1 = Math.max(a, b)
    const grazes = (k: number) => {
        const e0 = Math.min(edges[k], edges[k + 1]), e1 = Math.max(edges[k], edges[k + 1])
        const overlap = Math.min(chi, e1) - Math.max(clo, e0)
        return overlap <= EDGE_SLACK && overlap < e1 - e0
    }
    if (i0 < i1 && grazes(i0)) i0++
    if (i0 < i1 && grazes(i1)) i1--
    return [i0, i1]
}

// Box pixel-rect → contained items + highlight hits, dispatched by target kind.
export function computeSelection(
    box: { x: number; y: number; w: number; h: number },
    target: HitLayer,
    t: AxisTransform
): SelectionResult {
    const xlo = box.x, xhi = box.x + box.w, ylo = box.y, yhi = box.y + box.h
    if (target.kind === "circles" && Array.isArray(target.geometry)) {
        const a = target.geometry as number[]
        const items: SelectionItem[] = [], hits: Hit[] = []
        for (let k = 0; k < Math.floor(a.length / 3); k++) {
            const cx = a[3 * k], cy = a[3 * k + 1]
            if (cx >= xlo && cx <= xhi && cy >= ylo && cy <= yhi) {
                // no payload: an element hit, Julia reconstructs it from the manifest (#109)
                items.push({ layer: target.id, index: k })
                hits.push({ layer: target, index: k, geom_: ["circle", cx, cy, a[3 * k + 2]] })
            }
        }
        return { items, hits }
    }
    if (target.kind === "grid") {
        const gg = target.geometry as GridGeometry
        const ci = cellRange(gg.xedges, xlo, xhi), cj = cellRange(gg.yedges, ylo, yhi)
        if (!ci || !cj) return { items: [], hits: [] }
        const [i0, i1] = ci, [j0, j1] = cj
        // i0..j1 are cell indices clamped to the grid; xmin..ymax are the unclamped drawn-box
        // bounds — the two differ when the box overhangs the grid.
        const a = invertAxis(t, xlo, ylo), b = invertAxis(t, xhi, yhi)
        const ax = a.x as number, bx = b.x as number, ay = a.y as number, by = b.y as number
        const payload = {
            i0, i1, j0, j1,
            xmin: Math.min(ax, bx), xmax: Math.max(ax, bx),
            ymin: Math.min(ay, by), ymax: Math.max(ay, by),
        }
        return { items: [{ layer: target.id, index: 0, payload }], hits: [gridBlockHit(target, i0, i1, j0, j1)] }
    }
    return { items: [], hits: [] } // unsupported target kind
}

// The highlight for a brushed block of grid cells, inclusive cell indices.
// "rectfill", not "rect": this block sits beside the continuous ROI outline the user is
// actually dragging, so it must not draw its own stroke on top of/next to that outline
// (a stroked rect here reads as two overlapping boxes with parallel edges after release —
// see highlight.ts's makeHiElement). An element-indexed :rects selection (selects on a
// rects-kind target, or `selected=`) keeps its stroke; only this cell-block union rect
// — which exists only because a grid target isn't itself element-selectable — is fill-only.
function gridBlockHit(target: HitLayer, i0: number, i1: number, j0: number, j1: number): Hit {
    const gg = target.geometry as GridGeometry
    const rx0 = gg.xedges[i0], rx1 = gg.xedges[i1 + 1], ry0 = gg.yedges[j0], ry1 = gg.yedges[j1 + 1]
    return { layer: target, index: 0,
        geom_: ["rectfill", (rx0 + rx1) / 2, (ry0 + ry1) / 2, Math.abs(rx1 - rx0), Math.abs(ry1 - ry0)] }
}

// One clicked grid cell by its row-major index, drawn as geometry.ts's hitLayer draws a
// clicked cell. A sub-pixel grid's click highlights the sample pixel under the cursor, which
// a bare index no longer knows, so that cell is drawn at least one sample pixel wide.
function gridCellHit(layer: HitLayer, index: number): Hit | null {
    const gg = layer.geometry as GridGeometry
    if (!Number.isInteger(index) || index < 0 || index >= gg.ncols * gg.nrows) return null
    const i = index % gg.ncols, j = Math.floor(index / gg.ncols)
    const x0 = gg.xedges[i], x1 = gg.xedges[i + 1], y0 = gg.yedges[j], y1 = gg.yedges[j + 1]
    const min = gg.sample ? gg.sample_px ?? 0 : 0
    return { layer, index, grid_: [i, j, gg.values?.[index]],
        geom_: ["rect", (x0 + x1) / 2, (y0 + y1) / 2, Math.max(Math.abs(x1 - x0), min), Math.max(Math.abs(y1 - y0), min)] }
}

// A selected surface point, re-keyed onto a new frame's layer. An in-drag frame ships no
// surface geometry, so the point stays selected with nothing to draw until the release frame
// brings its geometry back (the highlight hides during the drag, by design). A point the layer
// can't draw otherwise (out of range, not drawn) is not selected.
export function surfaceSelection(layer: HitLayer, index: number): Hit | null {
    if ((layer.geometry as { suspended?: boolean }).suspended) return Number.isInteger(index) && index >= 0 ? { layer, index } : null
    const h = surfacePointHit(layer, index)
    return h ? { layer, ...h } : null
}

// A line takes picks as its data points: the pick is the sample nearest the click, as hover
// reads it out, not the whole line. A line without `points` (one on an Axis3) has no samples to
// pick, so its pick stays the whole line.
export const picksPoints = (layer: HitLayer): boolean => layer.kind === "lines" && Array.isArray(layer.points)

// Picked sample `s` of line `index`, drawn as a ring around the point, its radius the line's
// hit slack. null when that sample is not on screen.
export function linePointHit(manifest: Manifest, layer: HitLayer, index: number, s: number): Hit | null {
    const p = samplePoint(layer, index, s, manifest.transforms[layer.axis])
    return p ? { layer, index, sample_: s, geom_: ["point", p.x, p.y, layer.tol ?? SEG_TOL] } : null
}

// Kinds that can be drawn as a persistent pre-highlight (mirrors Julia `_SELECTED_KINDS`).
// Open kinds (segments / polyline) use the selected-ring recipe; closed kinds use the wash.
export const SELECTED_KINDS = new Set(["circles", "rects", "polygons", "segments", "polyline", "lines"])

// Order matters: a legend entry is `rects` kind AND carries `links`, so the links branch is
// tested first, gated at LAYER level — an entry whose own links[index] is empty still must not
// fall through to pinning the swatch itself (that's a selection gesture that resolved to
// nothing: `[]`). :axis/:threshold/:roi/:view return `null`, not `[]` — a click on one of these
// is not a selection gesture at all (an axis click is a `:click`-kind gesture with nowhere to
// put a highlight, not a click that selected zero elements), so `commitClick` must leave
// its field's entry in `state.sel_` untouched rather than clearing it.
export function selectionFor(hit: Hit, manifest: Manifest): Hit[] | null {
    if (hit.layer.links && hit.layer.links.length) return linkedHits(manifest, hit.layer, hit.index)
    if (SELECTED_KINDS.has(hit.layer.kind) || hit.layer.kind === "grid" || hit.layer.kind === "surface") return [hit]
    return null
}

export function layerNElements(layer: HitLayer): number {
    const g = layer.geometry
    if (layer.kind === "circles" && Array.isArray(g)) return Math.floor((g as number[]).length / 3)
    if (layer.kind === "rects" && Array.isArray(g)) return Math.floor((g as number[]).length / 4)
    if (layer.kind === "polygons" && Array.isArray(g)) return (g as number[][]).length
    if (layer.kind === "segments" && Array.isArray(g)) return Math.floor((g as number[]).length / 4)
    if (layer.kind === "polyline" && Array.isArray(g)) return Math.max(0, Math.floor((g as number[]).length / 2) - 1)
    if (layer.kind === "lines" && Array.isArray(g)) return (g as number[][]).length
    if (layer.kind === "grid" && g && typeof g === "object" && "ncols" in (g as object)) {
        const gg = g as GridGeometry
        return gg.ncols * gg.nrows
    }
    return 0
}

// Fail loud on unsupported kinds / OOB indices — defense in depth for a stale manifest, since
// Julia `build_manifest` validates the same thing.
export function hitLayerByIndex(layer: HitLayer, index: number): Omit<Hit, "layer"> {
    if (!SELECTED_KINDS.has(layer.kind)) {
        throw new Error(
            `selected: layer ${layer.id} has kind ${layer.kind}, which does not support pre-highlight ` +
                `(supported: ${[...SELECTED_KINDS].join(", ")})`,
        )
    }
    const n = layerNElements(layer)
    if (index < 0 || index >= n) {
        throw new Error(
            `selected: layer ${layer.id} index ${index} out of range for ${n} elements` +
                (n > 0 ? ` (valid: 0:${n - 1})` : ""),
        )
    }
    const g = layer.geometry
    if (layer.kind === "circles" && Array.isArray(g)) {
        const a = g as number[]
        return { index, geom_: ["circle", a[3 * index], a[3 * index + 1], a[3 * index + 2]] }
    }
    if (layer.kind === "rects" && Array.isArray(g)) {
        const a = g as number[]
        return { index, geom_: ["rect", a[4 * index], a[4 * index + 1], a[4 * index + 2], a[4 * index + 3]] }
    }
    if (layer.kind === "segments" && Array.isArray(g)) {
        const a = g as number[]
        return { index, geom_: ["seg", a[4 * index], a[4 * index + 1], a[4 * index + 2], a[4 * index + 3]] }
    }
    if (layer.kind === "polyline" && Array.isArray(g)) {
        const a = g as number[]
        return { index, geom_: ["seg", a[2 * index], a[2 * index + 1], a[2 * index + 2], a[2 * index + 3]] }
    }
    if (layer.kind === "lines" && Array.isArray(g)) {
        return { index, geom_: ["path", (g as number[][])[index]] }
    }
    // polygons (only remaining closed SELECTED_KINDS entry). A ring group stays one element.
    const rings = polygonRings((g as (number[] | number[][])[])[index])
    return { index, geom_: ["poly", rings.length === 1 ? rings[0] : rings] }
}

// A :polyline's flat [x,y,…] vertex array uses NaN as Julia's gap sentinel (interactables.jl's
// `_q`) — geometry.ts's hitLayer already skips a segment with either endpoint NaN for mouse
// hover/click (`Number.isNaN(x0) || Number.isNaN(x1)`, checked on x only since a real gap
// always carries through both coordinates of the same vertex). Shared by keyboard.ts's
// buildFocusable and hitsForLayer below, so neither draws/announces/highlights a segment the
// mouse can never reach.
// Element k is not on screen: a :polyline edge touching a NaN gap, or, once a zoomed Axis3
// clips it (#321), a :segments pair, :circles centre, or whole :lines path with no finite spot,
// or a :rects box (a text label whose anchor an Axis3 clips).
export function isGapElement(layer: HitLayer, k: number): boolean {
    switch (layer.kind) {
        case "polyline": {
            const a = layer.geometry as number[]
            return Number.isNaN(a[2 * k]) || Number.isNaN(a[2 * k + 2])
        }
        case "segments": {
            const a = layer.geometry as number[]
            return Number.isNaN(a[4 * k]) || Number.isNaN(a[4 * k + 2])
        }
        case "circles":
            return Number.isNaN((layer.geometry as number[])[3 * k])
        case "rects":
            return Number.isNaN((layer.geometry as number[])[4 * k])
        case "lines":
            return !((layer.geometry as number[][])[k] ?? []).some((v) => Number.isFinite(v))
        default:
            return false
    }
}

// Every element of a layer as a Hit, for the "highlight the whole target layer" case (a legend
// entry's `links`) — same building blocks (layerNElements + hitLayerByIndex) mount.ts uses for
// `selected=`. Elements not on screen (isGapElement) are skipped, same as buildFocusable.
export function hitsForLayer(layer: HitLayer): Hit[] {
    const n = layerNElements(layer)
    const hits: Hit[] = []
    for (let i = 0; i < n; i++) {
        if (isGapElement(layer, i)) continue
        hits.push({ layer, ...hitLayerByIndex(layer, i) })
    }
    return hits
}

// The linked-highlight fan-out for one legend element: every spec in `layer.links[index]`,
// flattened into one Hit[] for drawLink. A spec is a layer id (every element of that layer)
// or `id:k` pinning element k (Julia 1-based → JS 0-based). An exact layer id wins, so a
// real layer named `foo:1` is not parsed as an element pin. Julia guarantees each layer
// exists, is SELECTED_KINDS, and that a `:k` pin is in range; a stale manifest degrades to
// skipping that target rather than throwing.
function resolveLinkedTarget(manifest: Manifest, spec: string): Hit[] {
    const exact = manifest.layers.find((l) => l.id === spec)
    if (exact) return hitsForLayer(exact)
    const m = /^(.*):(\d+)$/.exec(spec)
    if (!m) return []
    const target = manifest.layers.find((l) => l.id === m[1])
    if (!target) return []
    const i = Number(m[2]) - 1
    const n = layerNElements(target)
    if (i < 0 || i >= n) return []
    if (isGapElement(target, i)) return []
    return [{ layer: target, ...hitLayerByIndex(target, i) }]
}

export function linkedHits(manifest: Manifest, layer: HitLayer, index: number): Hit[] {
    const ids = layer.links?.[index]
    if (!ids || !ids.length) return []
    const hits: Hit[] = []
    for (const id of ids) hits.push(...resolveLinkedTarget(manifest, id))
    return hits
}

// What a restored bond value selects: the hits to highlight, and the element a second click
// on would clear. `null` leaves the selection as it is, the same as a click that is not a
// selection gesture (an axis click, a threshold or ROI value). An entry that no longer
// matches the manifest is dropped, the way a frame's re-key in mount.ts drops it.
export type SelSource = { layer: string; index: number; sample?: number }
export function selectionForValue(manifest: Manifest, v: unknown, field?: string): { hits: Hit[]; source: SelSource | null; items?: FieldPick[]; mask?: GridMask } | null {
    // A `many` grid's value is its mask, which names no layer: the field says which.
    const grid = field === undefined ? undefined : manifest.layers.find((l) => l.id === field && l.many && l.kind === "grid")
    if (grid) {
        const mask = decodeMask(grid, v)
        if (!mask) return null
        const hit = maskHit(grid, mask)
        return { hits: hit ? [hit] : [], source: null, mask }
    }
    if (v === null || v === undefined) return { hits: [], source: null }
    if (typeof v !== "object") return null
    const o = v as { layer?: unknown; index?: unknown; items?: unknown }
    const many = Array.isArray(o.items) && o.items.length > 0 ? manifest.layers.find((l) => l.id === (o.items as { layer?: unknown }[])[0]?.layer) : undefined
    if (many?.many) {
        const items: FieldPick[] = []
        for (const item of o.items as { layer?: unknown; index?: unknown; payload?: unknown }[]) {
            if (item?.layer !== many.id || typeof item.index !== "number") continue
            const sample = (item as { sample?: unknown }).sample
            items.push(
                typeof sample === "number" ? { layer: many.id, index: item.index, sample } :
                    item.payload === undefined ? { layer: many.id, index: item.index } : { layer: many.id, index: item.index, payload: item.payload },
            )
        }
        const kept = keptPicks(manifest, items)
        return { hits: manyHits(manifest, kept), source: null, items: kept }
    }
    if (Array.isArray(o.items)) {
        const hits: Hit[] = []
        for (const item of o.items) {
            const it = item as { layer?: unknown; index?: unknown; sample?: unknown; payload?: unknown }
            const layer = manifest.layers.find((l) => l.id === it?.layer)
            if (!layer || typeof it.index !== "number") continue
            const p = it.payload as { i0?: unknown; i1?: unknown; j0?: unknown; j1?: unknown } | undefined
            if (layer.kind === "grid" && p && [p.i0, p.i1, p.j0, p.j1].every(Number.isInteger)) {
                const gg = layer.geometry as GridGeometry
                const [i0, i1, j0, j1] = [p.i0, p.i1, p.j0, p.j1] as number[]
                if (i0 >= 0 && j0 >= 0 && i0 <= i1 && j0 <= j1 && i1 < gg.ncols && j1 < gg.nrows) hits.push(gridBlockHit(layer, i0, i1, j0, j1))
                continue
            }
            const hit = typeof it.sample === "number" && picksPoints(layer) ? linePointHit(manifest, layer, it.index, it.sample) : elementHit(layer, it.index)
            if (hit) hits.push(hit)
        }
        return { hits, source: null }
    }
    const layer = manifest.layers.find((l) => l.id === o.layer)
    if (!layer || typeof o.index !== "number") return null
    const sample = (o as { sample?: unknown }).sample
    if (typeof sample === "number" && picksPoints(layer)) {
        const hit = linePointHit(manifest, layer, o.index, sample)
        return hit ? { hits: [hit], source: { layer: layer.id, index: o.index, sample } } : null
    }
    const index = layer.kind === "surface" ? surfaceIndexOf(layer, (o as { payload?: unknown }).payload) : o.index
    if (index === null) return null
    const hit = elementHit(layer, index)
    const hits = hit ? selectionFor(hit, manifest) : null
    return hits === null ? null : { hits, source: { layer: layer.id, index } }
}

// What a `many` field's picks highlight: each one's own selection (a legend entry's linked
// marks, a mark itself), drawn together. A pick with nothing to draw, such as an axis spot, adds none.
// The picks that still match the manifest: a mark's index must name an element of its layer.
// An axis spot carries its own payload and has no element, so it is kept while its layer is.
export function keptPicks(manifest: Manifest, items: FieldPick[]): FieldPick[] {
    return items.filter((it) => {
        const layer = manifest.layers.find((l) => l.id === it.layer)
        if (!layer) return false
        if (it.sample !== undefined) return picksPoints(layer) && linePointHit(manifest, layer, it.index, it.sample) !== null
        return !SELECTED_KINDS.has(layer.kind) || elementHit(layer, it.index) !== null
    })
}

export function manyHits(manifest: Manifest, items: FieldPick[]): Hit[] {
    const out: Hit[] = []
    for (const it of items) {
        const layer = manifest.layers.find((l) => l.id === it.layer)
        if (layer && it.sample !== undefined) {
            const point = picksPoints(layer) ? linePointHit(manifest, layer, it.index, it.sample) : null
            if (point) out.push(point)
            continue
        }
        const hit = layer ? elementHit(layer, it.index) : null
        if (hit) out.push(...(selectionFor(hit, manifest) ?? []))
    }
    return out
}

// A surface value's shipped-point index, found from its source (i, j) rather than its stored
// index: the stride, and so every index, changes with the axis size between runs. A point the
// new stride doesn't ship is not selected.
function surfaceIndexOf(layer: HitLayer, payload: unknown): number | null {
    const g = layer.geometry as SurfaceGeometry
    const p = payload as { i?: unknown; j?: unknown } | undefined
    if (g.suspended || !g.i || !p || !Number.isInteger(p.i) || !Number.isInteger(p.j)) return null
    const a = g.i.indexOf(p.i as number), b = g.j.indexOf(p.j as number)
    return a < 0 || b < 0 ? null : a + b * g.ni
}

function elementHit(layer: HitLayer, index: number): Hit | null {
    if (!Number.isInteger(index)) return null
    if (layer.kind === "grid") return gridCellHit(layer, index)
    if (layer.kind === "surface") return surfaceSelection(layer, index)
    if (!SELECTED_KINDS.has(layer.kind)) return null
    try {
        return { layer, ...hitLayerByIndex(layer, index) }
    } catch {
        return null
    }
}

// Structural equality for bond values, which are JSON-shaped: Pluto hands back an equal copy,
// never the object we wrote.
export function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
    if (Array.isArray(a) !== Array.isArray(b)) return false
    const ka = Object.keys(a), kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

// Where a marquee looks for element k: a marker's centre, a bar's or label's centre, a
// segment's midpoint, the middle of a polygon's or a whole line's extent. Null when the
// element isn't drawn.
function elementCentre(layer: HitLayer, k: number): [number, number] | null {
    if (isGapElement(layer, k)) return null
    const g = layer.geometry
    switch (layer.kind) {
        case "circles": {
            const a = g as number[]
            return [a[3 * k], a[3 * k + 1]]
        }
        case "rects": {
            if (layer.order && !layer.order.includes(k)) return null
            const a = g as number[]
            return [a[4 * k], a[4 * k + 1]]
        }
        case "segments": {
            const a = g as number[]
            return [(a[4 * k] + a[4 * k + 2]) / 2, (a[4 * k + 1] + a[4 * k + 3]) / 2]
        }
        case "polyline": {
            const a = g as number[]
            return [(a[2 * k] + a[2 * k + 2]) / 2, (a[2 * k + 1] + a[2 * k + 3]) / 2]
        }
        case "polygons":
            return extentCentre(polygonRings((g as (number[] | number[][])[])[k])[0] ?? [])
        case "lines":
            return extentCentre((g as number[][])[k] ?? [])
        default:
            return null
    }
}

function extentCentre(flat: number[]): [number, number] | null {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (let i = 0; i + 1 < flat.length; i += 2) {
        const x = flat[i], y = flat[i + 1]
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
    return x0 <= x1 ? [(x0 + x1) / 2, (y0 + y1) / 2] : null
}

// The elements of a layer a marquee box holds, in element order: those whose centre is inside.
export function indicesInBox(layer: HitLayer, box: { x: number; y: number; w: number; h: number }): number[] {
    const out: number[] = []
    if (!SELECTED_KINDS.has(layer.kind)) return out
    const n = layerNElements(layer)
    for (let k = 0; k < n; k++) {
        const c = elementCentre(layer, k)
        if (c && c[0] >= box.x && c[0] <= box.x + box.w && c[1] >= box.y && c[1] <= box.y + box.h) out.push(k)
    }
    return out
}

// Every element of a layer on screen, by index: what a legend click selects of its plot.
export function drawnIndices(layer: HitLayer): number[] {
    const out: number[] = []
    const n = layerNElements(layer)
    for (let k = 0; k < n; k++) if (!isGapElement(layer, k)) out.push(k)
    return out
}

// The picks a marquee box holds on one layer, in element order. A mark counts when its centre
// is inside; on a line that takes points (#353), each data point inside is its own pick, as a
// click picks one.
export function picksInBox(manifest: Manifest, layer: HitLayer, box: { x: number; y: number; w: number; h: number }): FieldPick[] {
    if (!picksPoints(layer)) return indicesInBox(layer, box).map((index) => ({ layer: layer.id, index }))
    const inside = (p: { x: number; y: number }) => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h
    return linePicks(manifest, layer, drawnIndices(layer), inside)
}

// The picks that stand for elements `indices` of a layer: the elements themselves, or every
// data point on screen of a line that takes points. What a legend entry selects of its plot.
export function elementPicks(manifest: Manifest, layer: HitLayer, indices: number[]): FieldPick[] {
    if (!picksPoints(layer)) return indices.map((index) => ({ layer: layer.id, index }))
    return linePicks(manifest, layer, indices, () => true)
}

function linePicks(manifest: Manifest, layer: HitLayer, indices: number[], keep: (p: { x: number; y: number }) => boolean): FieldPick[] {
    const out: FieldPick[] = []
    const t = manifest.transforms[layer.axis]
    for (const index of indices) {
        const n = (layer.points?.[index]?.length ?? 0) / 2
        for (let sample = 0; sample < n; sample++) {
            const p = samplePoint(layer, index, sample, t)
            if (p && keep(p)) out.push({ layer: layer.id, index, sample })
        }
    }
    return out
}

// Picks are the same mark when their element and data point agree.
export const pickKey = (it: { index: number; sample?: number }): string => it.sample === undefined ? `${it.index}` : `${it.index}:${it.sample}`

// A legend entry's edit of a linked `many` field: an entry turned on makes `picked` the field's
// picks, or adds the ones it lacks with `toggle`; an entry turned off takes them out. Picks keep
// the order they were made in.
export function legendEdit(items: FieldPick[], picked: FieldPick[], on: boolean, toggle: boolean): FieldPick[] {
    const want = new Set(picked.map(pickKey))
    if (!on) return items.filter((it) => !want.has(pickKey(it)))
    if (!toggle) return picked
    const held = new Set(items.map(pickKey))
    return [...items, ...picked.filter((it) => !held.has(pickKey(it)))]
}

// The marks one legend entry links to, by layer: every drawn element of a linked layer, or the
// one element a `id:k` pin names. Resolved as resolveLinkedTarget resolves them for the highlight.
export function linkedIndices(manifest: Manifest, layer: HitLayer, index: number): Map<HitLayer, number[]> {
    const out = new Map<HitLayer, number[]>()
    const add = (l: HitLayer, ks: number[]) => {
        const cur = out.get(l) ?? []
        for (const k of ks) if (!cur.includes(k)) cur.push(k)
        out.set(l, cur)
    }
    for (const spec of layer.links?.[index] ?? []) {
        const exact = manifest.layers.find((l) => l.id === spec)
        if (exact) { add(exact, drawnIndices(exact)); continue }
        const m = /^(.*):(\d+)$/.exec(spec)
        const target = m ? manifest.layers.find((l) => l.id === m[1]) : undefined
        if (!m || !target) continue
        const i = Number(m[2]) - 1
        if (i >= 0 && i < layerNElements(target) && !isGapElement(target, i)) add(target, [i])
    }
    return out
}
