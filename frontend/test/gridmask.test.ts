import { describe, it, expect } from "vitest"
import { decodeMask, emptyMask, encodeMask, maskHit, setBlock } from "../src/gridmask"
import { gridCellHeld, gridMarqueeMask } from "../src/bond"
import type { OverlayState } from "../src/state"
import type { HitLayer } from "../src/types"

// A 4×3 grid, cells 10 px square; y edges descending as a y-up axis projects them.
const layer = (ncols = 4, nrows = 3): HitLayer => ({
    id: "g", kind: "grid", axis: "ax1", events: ["click"], payloads: [], many: true,
    geometry: {
        xedges: Array.from({ length: ncols + 1 }, (_, k) => 10 * k),
        yedges: Array.from({ length: nrows + 1 }, (_, k) => 10 * (nrows - k)),
        ncols, nrows,
    },
})

describe("grid masks (#335)", () => {
    it("encode as row runs, and decode back", () => {
        const L = layer()
        const m = emptyMask(L)
        setBlock(m, 4, 1, 2, 0, 1, true)
        m[11] = 1
        const env = encodeMask(L, m)
        expect(env).toEqual({ runs: [0, 1, 2, 1, 1, 2, 2, 3, 1] })
        expect(decodeMask(L, env)).toEqual(m)
        expect(decodeMask(L, null)).toEqual(emptyMask(L))
    })

    it("fall back to packed bits when runs would be longer, and decode them", () => {
        const L = layer(64, 64)
        const m = emptyMask(L)
        for (let k = 0; k < m.length; k += 2) m[k] = 1 // every other cell: the runs' worst case
        const env = encodeMask(L, m) as { bits: string }
        expect(typeof env.bits).toBe("string")
        expect(env.bits.length).toBe(Math.ceil(64 * 64 / 8 / 3) * 4)
        expect(decodeMask(L, env)).toEqual(m)
    })

    it("refuse a value that doesn't fit the grid", () => {
        const L = layer()
        expect(decodeMask(L, { runs: [0, 3, 2] })).toBeNull()
        expect(decodeMask(L, { runs: [3, 0, 1] })).toBeNull()
        expect(decodeMask(L, { runs: [0, 1] })).toBeNull()
        expect(decodeMask(L, { bits: "AAAA" })).toBeNull()
        expect(decodeMask(L, "x")).toBeNull()
        expect(decodeMask(L, { runs: [0, 1.5, 1] })).toBeNull()
        expect(decodeMask(L, { bits: "!!" })).toBeNull()
        expect(decodeMask(L, { items: [] })).toBeNull()
        expect(maskHit(L, new Uint8Array(3))).toBeNull()
    })

    it("outline a shape with a hole along its outer and inner edges only", () => {
        const L = layer(3, 3)
        const m = emptyMask(L)
        setBlock(m, 3, 0, 2, 0, 2, true)
        m[4] = 0
        const h = maskHit(L, m)!
        expect(h.index).toBe(-1)
        const [, fill, edge] = h.geom_ as [string, string, string]
        expect(fill.split("Z").length - 1).toBe(4) // rows 0 and 2 whole, row 1 in two runs
        // Outer: 2 horizontal + 2 vertical; hole: 2 + 2.
        expect(edge.split("M").length - 1).toBe(8)
        expect(maskHit(L, emptyMask(L))).toBeNull()
    })

    it("marquee: replace, add and subtract", () => {
        const L = layer()
        // Cells (0..1, 0..1): x 0..20, y 30..10 px (row 0 at the bottom).
        let m = emptyMask(L)
        m[11] = 1
        m = gridMarqueeMask(L, m, { x: 1, y: 11, w: 18, h: 18 }, "replace")
        expect(encodeMask(L, m)).toEqual({ runs: [0, 0, 2, 1, 0, 2] })
        m = gridMarqueeMask(L, m, { x: 21, y: 11, w: 8, h: 18 }, "add")
        expect(encodeMask(L, m)).toEqual({ runs: [0, 0, 3, 1, 0, 3] })
        m = gridMarqueeMask(L, m, { x: 1, y: 21, w: 28, h: 8 }, "subtract")
        expect(encodeMask(L, m)).toEqual({ runs: [1, 0, 3] })
        // A replacing box off the grid empties it.
        m = gridMarqueeMask(L, m, { x: 100, y: 100, w: 5, h: 5 }, "replace")
        expect(encodeMask(L, m)).toEqual({ runs: [] })
    })

    it("marquee: each move starts again from the gesture's base, so the drag previews live", () => {
        const L = layer()
        const base = emptyMask(L)
        base[11] = 1
        const step = (w: number) => encodeMask(L, gridMarqueeMask(L, base.slice(), { x: 21, y: 11, w, h: 18 }, "add"))
        expect(step(4)).toEqual({ runs: [0, 2, 1, 1, 2, 1, 2, 3, 1] })
        expect(step(14)).toEqual({ runs: [0, 2, 2, 1, 2, 2, 2, 3, 1] })
        // Shrinking the box takes back what the larger box added.
        expect(step(4)).toEqual({ runs: [0, 2, 1, 1, 2, 1, 2, 3, 1] })
        expect(base[11]).toBe(1)
    })
    it("a press on a held cell is where a Cmd/Ctrl marquee subtracts", () => {
        const L = layer()
        const m = emptyMask(L)
        m[6] = 1 // cell (2, 1): x 20..30, y 20..10
        const state = { sel_: new Map([["g", { hits_: [], source_: null, mask_: m }]]) } as unknown as OverlayState
        expect(gridCellHeld(state, L, { x: 25, y: 15 })).toBe(true)
        expect(gridCellHeld(state, L, { x: 15, y: 15 })).toBe(false)
        expect(gridCellHeld(state, L, { x: 99, y: 15 })).toBe(false)
        expect(gridCellHeld({ sel_: new Map() } as unknown as OverlayState, L, { x: 25, y: 15 })).toBe(false)
    })
})
