import { describe, it, expect } from "vitest"
import { dequantize } from "../src/wire"
import type { Manifest } from "../src/types"

// Julia ships a circles layer's centres and radii in quarters of an image px (#588).
describe("dequantize", () => {
    const manifest = (geometry: unknown, q?: number): Manifest => ({
        width: 100, height: 100,
        layers: [{ id: "s", kind: "circles", axis: "ax1", geometry, payloads: [], events: [], ...(q ? { q } : {}) }],
    } as unknown as Manifest)

    it("turns quarter-pixel integers into image px, once", () => {
        const m = manifest([1382, 1383, 56], 4)
        dequantize(m)
        expect(m.layers[0].geometry).toEqual([345.5, 345.75, 14])
        expect(m.layers[0].q).toBeUndefined()
        dequantize(m) // a second mount of the same manifest leaves it alone
        expect(m.layers[0].geometry).toEqual([345.5, 345.75, 14])
    })

    it("reads a typed array without truncating", () => {
        const m = manifest(new Int32Array([5, 6, 7]), 4)
        dequantize(m)
        expect(m.layers[0].geometry).toEqual([1.25, 1.5, 1.75])
    })

    it("keeps a NaN gap and leaves a layer without q as it is", () => {
        const m = manifest([NaN, 8, 4], 4)
        dequantize(m)
        expect(m.layers[0].geometry).toEqual([NaN, 2, 1])
        const plain = manifest([3, 4, 5])
        dequantize(plain)
        expect(plain.layers[0].geometry).toEqual([3, 4, 5])
    })
})
