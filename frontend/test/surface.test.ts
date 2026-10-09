import { describe, it, expect } from "vitest"
import { anchorFor, hitLayer, resolvePayload } from "../src/geometry"
import { selectionFor, selectionForValue, surfaceSelection } from "../src/selection"
import { tipHtmlForHit } from "../src/hover"
import type { OverlayCtx } from "../src/state"
import { dualCell, surfaceFields } from "../src/surface"
import type { HitLayer, Manifest, SurfaceGeometry } from "../src/types"

// A 3×3 grid of points 10 px apart, on screen as a flat square from (0, 0) to (20, 20).
// Point (a, b) sits at (10a, 10b). Quads 0..3 are (a, b) = (0,0), (1,0), (0,1), (1,1).
function flat(order: number[] = [0, 1, 2, 3], over: Partial<SurfaceGeometry> = {}): SurfaceGeometry {
    const xy: number[] = []
    for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) xy.push(10 * a, 10 * b)
    return {
        ni: 3, nj: 3, i: [0, 2, 4], j: [0, 3, 6], xy, order,
        x: [1, 2, 3], y: [10, 20, 30], z: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        ...over,
    }
}
const layer = (g: SurfaceGeometry, payloads: unknown[] = []): HitLayer =>
    ({ id: "surface", kind: "surface", axis: "ax1", events: ["click", "hover"], payloads, geometry: g, bond: "gridcell" })

describe(":surface hit test", () => {
    it("answers with the nearest corner of the quad under the pointer", () => {
        const L = layer(flat())
        const h = hitLayer(L, 3, 2)
        expect(h?.index).toBe(0) // point (0, 0)
        expect(hitLayer(L, 8, 9)?.index).toBe(4) // point (1, 1), the centre
        expect(hitLayer(L, 19, 1)?.index).toBe(2) // point (2, 0)
    })

    it("reports source indices and z for the bond", () => {
        const L = layer(flat())
        const h = hitLayer(L, 19, 19)!
        expect(h.index).toBe(8)
        expect(h.grid_).toEqual([4, 6, 8]) // shipped (2, 2) is source (4, 6), 0-based
        const m = { layers: [L] } as unknown as Manifest
        expect(resolvePayload({ layer: L, ...h }, m, 19, 19)).toEqual({ i: 4, j: 6, value: 8 })
    })

    it("misses outside every quad", () => {
        expect(hitLayer(layer(flat()), 25, 5)).toBeNull()
        expect(hitLayer(layer(flat()), -1, 5)).toBeNull()
    })

    it("tries quads in the shipped order, so the front one wins an overlap", () => {
        // Fold quad 3 back over quad 0: point (2, 2) projects onto (2, 2) px.
        const g = flat([3, 0, 1, 2])
        g.xy[16] = 2; g.xy[17] = 2
        const L = layer(g)
        // (6, 4) lies in quad 0 and in the folded quad 3; quad 3 is first, so its corner wins.
        expect(hitLayer(L, 6, 4)?.index).toBe(8)
        // In the other order, quad 0 is in front and its nearest corner (1, 0) answers.
        expect(hitLayer(layer({ ...g, order: [0, 1, 2, 3] }), 6, 4)?.index).toBe(1)
    })

    it("skips quads left out of order (a NaN corner or a clipped one)", () => {
        const g = flat([1, 2, 3]) // quad 0 not drawn
        g.xy[0] = NaN; g.xy[1] = NaN
        expect(hitLayer(layer(g), 2, 2)).toBeNull()
        expect(hitLayer(layer(g), 12, 2)?.index).toBe(1)
    })

    it("has no hit area while suspended (an in-drag frame)", () => {
        const L = layer({ suspended: true } as SurfaceGeometry)
        expect(hitLayer(L, 5, 5)).toBeNull()
    })
})

describe(":surface highlight and tooltip", () => {
    it("draws an interior point's dual cell through edge midpoints and quad centres", () => {
        const ring = dualCell(flat(), 4)
        // 4 edge midpoints + 4 quad centres around (10, 10).
        expect(ring.length).toBe(16)
        const xs = ring.filter((_, k) => k % 2 === 0), ys = ring.filter((_, k) => k % 2 === 1)
        expect(Math.min(...xs)).toBe(5); expect(Math.max(...xs)).toBe(15)
        expect(Math.min(...ys)).toBe(5); expect(Math.max(...ys)).toBe(15)
    })

    it("passes through a corner point itself", () => {
        const ring = dualCell(flat(), 0)
        expect(ring).toContain(0)
        const pts: [number, number][] = []
        for (let k = 0; k < ring.length; k += 2) pts.push([ring[k], ring[k + 1]])
        expect(pts).toContainEqual([0, 0])
        expect(pts).toContainEqual([5, 5])
    })

    it("anchors the tooltip above the point, clear of its cell", () => {
        const L = layer(flat())
        const h = { layer: L, ...hitLayer(L, 9, 9)! }
        expect(anchorFor(h, { x: 9, y: 9 })).toEqual({ x: 10, y: 10, top: 5 })
    })

    it("shows 1-based i, j and the data x, y, z (vector grid)", () => {
        expect(surfaceFields(layer(flat()), 5)).toEqual({ i: 5, j: 4, x: 3, y: 20, z: 5 })
    })

    it("reads a matrix grid's x, y per point, and value when shipped", () => {
        const g = flat(undefined, { x: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((v) => v * 10), y: [0, 1, 2, 3, 4, 5, 6, 7, 8], value: [9, 8, 7, 6, 5, 4, 3, 2, 1] })
        expect(surfaceFields(layer(g), 5)).toEqual({ i: 5, j: 4, x: 50, y: 5, z: 5, value: 4 })
    })

    it("selects like a grid cell and keeps the selection through a suspended frame", () => {
        const L = layer(flat())
        const h = { layer: L, ...hitLayer(L, 9, 9)! }
        expect(selectionFor(h, { layers: [L] } as unknown as Manifest)).toEqual([h])
        const suspended = layer({ suspended: true } as SurfaceGeometry)
        const kept = surfaceSelection(suspended, 4)
        expect(kept).toEqual({ layer: suspended, index: 4 }) // nothing to draw, still selected
        expect(surfaceSelection(L, 4)?.geom_?.[0]).toBe("poly")
        expect(surfaceSelection(L, 99)).toBeNull()
    })
})

describe(":surface tooltip and restored selection", () => {
    const ctx = (L: HitLayer) => ({ manifest_: { layers: [L] }, tipDigits_: 4 }) as unknown as OverlayCtx

    it("shows the point's fields, with a payload's own fields winning a clash", () => {
        const L = layer(flat(), Array.from({ length: 9 }, (_, k) => ({ name: `p${k}`, z: -1 })))
        const h = { layer: L, ...hitLayer(L, 19, 19)! }
        const html = tipHtmlForHit(ctx(L), h, 19, 19)!
        expect(html).toContain("p8")
        expect(html).toContain("-1") // the payload's z, not the point's 8
        expect(html).not.toMatch(/>8</)
    })

    it("fills a template from the same fields", () => {
        const L = { ...layer(flat()), template: ["z=", { f: "z" }] } as unknown as HitLayer
        const h = { layer: L, ...hitLayer(L, 19, 19)! }
        expect(tipHtmlForHit(ctx(L), h, 19, 19)).toContain("z=8")
    })

    it("draws nothing for a layer with its tooltip turned off", () => {
        const L = { ...layer(flat()), tooltip: false } as HitLayer
        expect(tipHtmlForHit(ctx(L), { layer: L, ...hitLayer(L, 19, 19)! }, 19, 19)).toBeNull()
    })

    it("maps a restored bond value back to the point's cell", () => {
        const L = layer(flat())
        const m = { width: 40, height: 40, scaling: 1, transforms: {}, layers: [L] } as unknown as Manifest
        const sel = selectionForValue(m, { layer: "surface", index: 4, payload: { i: 2, j: 3, value: 4 } })!
        expect(sel.hits).toHaveLength(1)
        expect(sel.hits[0].geom_?.[0]).toBe("poly")
        expect(selectionForValue(m, { layer: "surface", index: 99 })).toBeNull() // like any other kind
    })
})
