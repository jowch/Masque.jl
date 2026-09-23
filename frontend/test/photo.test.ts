import { describe, it, expect } from "vitest"
import { IDENTITY, mapPoint, residual, unmapPoint, wheelScale, zoomAt } from "../src/photo"

describe("photographic matrix", () => {
    it("three composed notches stay on the cursor", () => {
        let m = IDENTITY
        const cursors = [{ x: 200, y: 140 }, { x: 320, y: 80 }, { x: 60, y: 260 }]
        for (const local of cursors) {
            const before = mapPoint(m, local)
            m = zoomAt(m, local, 1.2)
            const after = mapPoint(m, local)
            expect(after.x).toBeCloseTo(before.x)
            expect(after.y).toBeCloseTo(before.y)
        }
        expect(m.s).toBeCloseTo(1.2 ** 3)
    })

    it("a scale that divides by the current scale is not this composition", () => {
        // The rejected form drifted off the cursor. This one does not, including at the
        // second notch where that drift showed up.
        let m = zoomAt(IDENTITY, { x: 200, y: 140 }, 1.2)
        const local = { x: 320, y: 80 }
        const before = mapPoint(m, local)
        m = zoomAt(m, local, 1.2)
        expect(mapPoint(m, local).x).toBeCloseTo(before.x)
        expect(mapPoint(m, local).y).toBeCloseTo(before.y)
    })

    it("residual is identity when the sent matrix is the live one, and 0px off otherwise", () => {
        let m = IDENTITY
        m = zoomAt(m, { x: 200, y: 140 }, 1.2)
        const sent = m
        expect(residual(sent, m)).toEqual({ s: 1, tx: 0, ty: 0 })
        m = zoomAt(m, { x: 320, y: 80 }, 1.2)
        const left = residual(sent, m)
        for (const p of [{ x: 200, y: 140 }, { x: 300, y: 180 }, { x: 40, y: 40 }, { x: 480, y: 300 }]) {
            const screenNow = mapPoint(m, p)
            const screenRes = mapPoint(left, mapPoint(sent, p))
            expect(screenRes.x).toBeCloseTo(screenNow.x)
            expect(screenRes.y).toBeCloseTo(screenNow.y)
        }
    })

    it("unmapPoint is the inverse of mapPoint", () => {
        const m = zoomAt(zoomAt(IDENTITY, { x: 200, y: 140 }, 1.2), { x: 80, y: 40 }, 1.1)
        const p = { x: 50, y: 70 }
        const back = unmapPoint(m, mapPoint(m, p))
        expect(back.x).toBeCloseTo(p.x)
        expect(back.y).toBeCloseTo(p.y)
    })

    it("wheel-up zooms in, and line/page deltas convert before the exponent", () => {
        expect(wheelScale(-100, 0)).toBeGreaterThan(1)
        expect(wheelScale(100, 0)).toBeLessThan(1)
        expect(wheelScale(-1, 1)).toBeCloseTo(wheelScale(-16, 0))
        expect(wheelScale(-1, 2)).toBeCloseTo(wheelScale(-400, 0))
    })

    it("scale clamps so a flick cannot request a degenerate window", () => {
        let m = IDENTITY
        for (let i = 0; i < 40; i++) m = zoomAt(m, { x: 10, y: 10 }, 2)
        expect(m.s).toBe(16)
        for (let i = 0; i < 40; i++) m = zoomAt(m, { x: 10, y: 10 }, 0.5)
        expect(m.s).toBeCloseTo(1 / 16)
    })
})
