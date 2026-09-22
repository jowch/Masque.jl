import { describe, it, expect } from "vitest"
import { layerNElements, selectionFor, linkedHits } from "../src/selection"
import type { Hit, HitLayer, Manifest } from "../src/types"

// layerNElements' other kind branches (circles/rects/polygons/segments/polyline) are exercised
// indirectly via overlay.test.ts's `selected=` pre-highlight cases (through hitLayerByIndex,
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

    it("an exact layer id containing a colon is not parsed as an element pin", () => {
        const pinLegend: HitLayer = { ...legend, links: [["series:2"]] }
        const m: Manifest = { width: 100, height: 100, scaling: 1, layers: [namedPin, pinLegend], transforms: {} }
        const hits = linkedHits(m, pinLegend, 0)
        expect(hits).toHaveLength(1)
        expect(hits[0].layer).toBe(namedPin)
        expect(hits[0].index).toBe(0)
    })
})
