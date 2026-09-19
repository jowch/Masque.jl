import { describe, it, expect } from "vitest"
import { echoHitsFor, layerNElements } from "../src/selection"
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

describe("echoHitsFor", () => {
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
        expect(echoHitsFor(hit(circles), manifest)).toEqual([hit(circles)])
    })

    it(":grid pins itself", () => {
        expect(echoHitsFor(hit(grid), manifest)).toEqual([hit(grid)])
    })

    it("a kind with no highlight geometry (e.g. :threshold) pins nothing", () => {
        expect(echoHitsFor(hit(threshold), manifest)).toEqual([])
    })

    it("a legend entry (layer.links present and non-empty) pins linkedHits' fan-out, not itself", () => {
        const result = echoHitsFor({ layer: legend, index: 0 }, manifest)
        expect(result).toEqual([{ layer: circles, index: 0, geom_: ["circle", 0, 0, 5] }])
    })

    it("a legend entry whose own links[index] is empty pins nothing, even though the layer has links", () => {
        // The guard is on the layer's links field, not legend.links[1]'s own (empty) entry —
        // must not fall through to pinning the swatch itself.
        expect(echoHitsFor({ layer: legend, index: 1 }, manifest)).toEqual([])
    })

    it("a layer with an empty links array (links: []) pins itself — SELECTED_KINDS with nothing wired as a legend", () => {
        expect(echoHitsFor(hit({ ...circles, links: [] }), manifest)).toEqual([hit({ ...circles, links: [] })])
    })
})
