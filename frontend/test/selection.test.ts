import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { cellRange, computeSelection, layerNElements, selectionFor, linkedHits, selectionForValue, sameValue } from "../src/selection"
import type { Hit, HitLayer, Manifest } from "../src/types"

// layerNElements' other kind branches (circles/rects/polygons/segments/polyline) are exercised
// indirectly via overlay.test.ts's starting-pick (`initial`) pre-highlight cases (through hitLayerByIndex,
// which gates on SELECTED_KINDS before calling in). :grid is not in SELECTED_KINDS — that path
// never reaches this branch — so it needs a direct call to cover.
describe("layerNElements", () => {
    it("computes a grid layer's element count as ncols * nrows", () => {
        const layer: HitLayer = {
            id: "hm", kind: "grid", axis: "ax1", events: ["hover"], payloads: [],
            geometry: { xedges: [0, 1, 2], yedges: [0, 1, 2, 3], ncols: 2, nrows: 3 },
        }
        expect(layerNElements(layer)).toBe(6)
    })
})

// The cell edges are whole pixels and a box keeps its fractional corners, so a box placed on data
// cell edges reaches up to half a pixel into the neighbouring cells. That sliver is not overlap (#337).
describe("cellRange", () => {
    const asc = [100, 200, 300, 400], desc = [400, 300, 200, 100]
    it("leaves out an end cell the span only grazes by half a pixel or less", () => {
        expect(cellRange(asc, 199.6, 300.4)).toEqual([1, 1])
        expect(cellRange(asc, 199.5, 300.5)).toEqual([1, 1])
        expect(cellRange(desc, 199.6, 300.4)).toEqual([1, 1])
    })
    it("keeps an end cell the span reaches into by more than half a pixel", () => {
        expect(cellRange(asc, 199.4, 300.6)).toEqual([0, 2])
        expect(cellRange(desc, 199.4, 300.6)).toEqual([0, 2])
    })
    it("keeps a sliver-wide span on one edge to one cell, never none", () => {
        expect(cellRange(asc, 199.8, 200.2)).toEqual([1, 1])
        expect(cellRange(asc, 150, 150.1)).toEqual([0, 0])
    })
    it("keeps an end cell narrower than the slack when the span covers all of it", () => {
        expect(cellRange([0, 0.4, 10, 20], 0, 15)).toEqual([0, 2])
    })
    it("clamps an overhanging span to the grid and returns null off it", () => {
        expect(cellRange(asc, 50, 250)).toEqual([0, 1])
        expect(cellRange(asc, 450, 500)).toBeNull()
    })
})

describe("selectionFor", () => {
    const circles: HitLayer = { id: "pts", kind: "circles", geometry: [0, 0, 5], payloads: [{}], axis: "ax1", events: ["click"] }
    const grid: HitLayer = {
        id: "hm", kind: "grid", axis: "ax1", events: ["hover"], payloads: [],
        geometry: { xedges: [0, 1], yedges: [0, 1], ncols: 1, nrows: 1 },
    }
    const threshold: HitLayer = { id: "th", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [], geometry: null }
    const legend: HitLayer = { ...circles, id: "legend", kind: "rects", geometry: [0, 0, 1, 1], links: [["pts"], []] }

    const manifest: Manifest = { width: 100, height: 100, scaling: 1, layers: [circles, grid, legend], transforms: {} }
    const hit = (layer: HitLayer, index = 0): Hit => ({ layer, index })

    it("a plain SELECTED_KINDS layer (no links) pins itself", () => {
        expect(selectionFor(hit(circles), manifest)).toEqual([hit(circles)])
    })

    it(":grid pins itself", () => {
        expect(selectionFor(hit(grid), manifest)).toEqual([hit(grid)])
    })

    it("a kind not in the selection model (e.g. :threshold) returns null, not []: not a selection gesture at all", () => {
        expect(selectionFor(hit(threshold), manifest)).toBeNull()
    })

    it(":axis returns null, not []: not a selection gesture at all", () => {
        const axis: HitLayer = { id: "ax", kind: "axis", axis: "ax1", events: ["click", "hover"], payloads: [], geometry: null }
        expect(selectionFor(hit(axis), manifest)).toBeNull()
    })

    it("a legend entry (layer.links present and non-empty) pins linkedHits' fan-out, not itself", () => {
        const result = selectionFor({ layer: legend, index: 0 }, manifest)
        expect(result).toEqual([{ layer: circles, index: 0, geom_: ["circle", 0, 0, 5] }])
    })

    it("a legend entry whose own links[index] is empty returns [] (a selection gesture that resolved to nothing), not null", () => {
        // The guard is on the layer's links field, not legend.links[1]'s own (empty) entry —
        // must not fall through to pinning the swatch itself.
        expect(selectionFor({ layer: legend, index: 1 }, manifest)).toEqual([])
    })

    it("a layer with an empty links array (links: []) pins itself — SELECTED_KINDS with nothing wired as a legend", () => {
        expect(selectionFor(hit({ ...circles, links: [] }), manifest)).toEqual([hit({ ...circles, links: [] })])
    })
})

describe("linkedHits", () => {
    const traces: HitLayer = {
        id: "series", kind: "lines", axis: "ax1", events: ["hover"],
        geometry: [[0, 0, 10, 10], [0, 5, 10, 15], [0, 10, 10, 20]],
        payloads: [{}, {}, {}],
    }
    const legend: HitLayer = {
        id: "legend", kind: "rects", axis: "ax1", events: ["hover"],
        geometry: [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
        payloads: [{}, {}, {}],
        links: [["series:1"], ["series:2"], ["series"]],
    }
    const namedPin: HitLayer = {
        id: "series:2", kind: "circles", axis: "ax1", events: ["hover"],
        geometry: [1, 1, 5], payloads: [{}],
    }
    const manifest: Manifest = {
        width: 100, height: 100, scaling: 1, layers: [traces, legend], transforms: {},
    }

    it("id:k pins one element (Julia 1-based → JS 0-based), not every path of the layer", () => {
        const hits = linkedHits(manifest, legend, 1)
        expect(hits).toHaveLength(1)
        expect(hits[0].layer).toBe(traces)
        expect(hits[0].index).toBe(1)
    })

    it("a bare layer id still fans out to every element", () => {
        const hits = linkedHits(manifest, legend, 2)
        expect(hits.map((h) => h.index)).toEqual([0, 1, 2])
    })

    it("a linked element a zoomed Axis3 clipped off screen highlights nothing (#321)", () => {
        const edges: HitLayer = {
            id: "edges", kind: "segments", axis: "ax1", events: ["hover"],
            geometry: [NaN, NaN, NaN, NaN, 0, 0, 10, 10], payloads: [{}, {}],
        }
        const link: HitLayer = { ...legend, links: [["edges:1"], ["edges:2"], ["edges"]] }
        const m: Manifest = { width: 100, height: 100, scaling: 1, layers: [edges, link], transforms: {} }
        expect(linkedHits(m, link, 0)).toEqual([])
        expect(linkedHits(m, link, 1).map((h) => h.index)).toEqual([1])
        expect(linkedHits(m, link, 2).map((h) => h.index)).toEqual([1])
    })

    it("an exact layer id containing a colon is not parsed as an element pin", () => {
        const pinLegend: HitLayer = { ...legend, links: [["series:2"]] }
        const m: Manifest = { width: 100, height: 100, scaling: 1, layers: [namedPin, pinLegend], transforms: {} }
        const hits = linkedHits(m, pinLegend, 0)
        expect(hits).toHaveLength(1)
        expect(hits[0].layer).toBe(namedPin)
        expect(hits[0].index).toBe(0)
    })
})

// A value Pluto restores into host.value (#272), mapped back to what it highlights.
describe("selectionForValue", () => {
    const m: Manifest = {
        width: 400, height: 400, scaling: 2, transforms: {},
        layers: [
            { id: "pts", kind: "circles", geometry: [10, 10, 5, 50, 50, 5], payloads: [{}, {}], axis: "ax1", events: ["click"] },
            { id: "heat", kind: "grid", axis: "ax1", events: ["hover"], payloads: [],
                geometry: { xedges: [0, 100, 200, 300], yedges: [0, 100, 200], ncols: 3, nrows: 2 } },
        ],
    }

    it("maps a brushed grid block to one block highlight and skips what no longer fits", () => {
        const sel = selectionForValue(m, { items: [
            { layer: "heat", index: 0, payload: { i0: 1, i1: 2, j0: 0, j1: 1 } },
            { layer: "heat", index: 0, payload: { i0: 2, i1: 3, j0: 0, j1: 0 } }, // past the last column
            { layer: "gone", index: 0 },
            { layer: "pts", index: "1" },
            { layer: "pts", index: 1 },
        ] })!
        expect(sel.source).toBeNull()
        expect(sel.hits.map((h) => [h.layer.id, h.geom_])).toEqual([
            ["heat", ["rectfill", 200, 100, 200, 200]],
            ["pts", ["circle", 50, 50, 5]],
        ])
    })

    it("clears on null or undefined and leaves the selection on other scalars", () => {
        expect(selectionForValue(m, undefined)).toEqual({ hits: [], source: null })
        expect(selectionForValue(m, "pts")).toBeNull()
    })

    it("sameValue compares structurally", () => {
        expect(sameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
        expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false)
        expect(sameValue([1], { 0: 1 })).toBe(false)
        expect(sameValue(null, {})).toBe(false)
    })
})

// The `{items}` a selecting box's target starts at: its field in the manifest's `initial`.
function startItems(m: Manifest, target: HitLayer): { layer: string; index: number; payload?: Record<string, number> }[] {
    const field = m.initial?.[target.id] as { items?: [] } | null | undefined
    return field?.items ?? []
}

// A selecting box's bond starts at what Julia computes its starting bounds contain (#330).
// These goldens are Julia manifests (test/parity_corpus.jl); a release of the untouched box
// runs computeSelection, so the two must agree or the value would change on a no-op drag.
describe("a selecting box's starting value matches computeSelection (Julia parity)", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "test", "fixtures", "parity")
    for (const name of ["roiselect", "roigrid", "roiedge", "roigridover"]) {
        for (const backend of ["cairo", "webgl"]) {
            it(`${name}.${backend}`, () => {
                const m = JSON.parse(readFileSync(join(dir, `${name}.${backend}.json`), "utf8")) as Manifest
                const roi = m.layers.find((l) => l.kind === "roi") as HitLayer
                const target = m.layers.find((l) => l.id === roi.selects) as HitLayer
                const box = roi.geometry as { x: number; y: number; w: number; h: number }
                const got = computeSelection(box, target, m.transforms[target.axis]).items
                // The target's field starts at `{items}`: the marks or the cell block the box holds.
                type Item = { layer: string; index: number; payload?: Record<string, number> }
                const want: Item[] = startItems(m, target)
                expect(got.length).toBeGreaterThan(0)
                expect(got.map(({ layer, index }) => ({ layer, index }))).toEqual(want.map(({ layer, index }) => ({ layer, index })))
                for (let k = 0; k < got.length; k++) {
                    const p = got[k].payload as Record<string, number> | undefined, q = want[k].payload
                    if (!p || !q) { expect(p).toEqual(q); continue }
                    for (const c of ["i0", "i1", "j0", "j1"]) expect(p[c]).toBe(q[c])
                    // Julia sends the bounds it was given; the browser inverts the box's corners.
                    for (const c of ["xmin", "xmax", "ymin", "ymax"]) expect(p[c]).toBeCloseTo(q[c], 4)
                }
            })
        }
    }
})
