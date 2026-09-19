import { describe, it, expect } from "vitest"
import { isEchoable, layerNElements } from "../src/selection"
import type { Hit, HitLayer } from "../src/types"

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

describe("isEchoable", () => {
    const circles: HitLayer = { id: "pts", kind: "circles", geometry: [0, 0, 5], payloads: [{}], axis: "ax1", events: ["click"] }
    const grid: HitLayer = {
        id: "hm", kind: "grid", axis: "ax1", events: ["hover"], payloads: [],
        geometry: { xedges: [0, 1], yedges: [0, 1], ncols: 1, nrows: 1 },
    }
    const legend: HitLayer = { ...circles, id: "legend", kind: "rects", links: [["pts"], []] }

    const hit = (layer: HitLayer): Hit => ({ layer, index: 0 })

    it("a plain SELECTED_KINDS layer (no links) is echoable", () => {
        expect(isEchoable(hit(circles))).toBe(true)
    })

    it("a kind outside SELECTED_KINDS (e.g. grid) is not echoable", () => {
        expect(isEchoable(hit(grid))).toBe(false)
    })

    it("a legend entry (layer.links present and non-empty) is not echoable, even for an index whose own links[] is empty", () => {
        // The guard is on the layer's links field, not legend.links[1]'s own (empty) entry.
        expect(isEchoable({ layer: legend, index: 1 })).toBe(false)
        expect(isEchoable({ layer: legend, index: 0 })).toBe(false)
    })

    it("a layer with an empty links array (links: []) is echoable — SELECTED_KINDS with nothing wired as a legend", () => {
        expect(isEchoable(hit({ ...circles, links: [] }))).toBe(true)
    })
})
