import { describe, it, expect } from "vitest"
import { coordFields, fmtCoord, plainTextForHit, renderAutoTable, renderAutoTablePlain } from "../src/template"
import { tipHtmlForHit } from "../src/hover"
import type { OverlayCtx } from "../src/state"
import type { AxisTransform, CoordFormat, Hit, HitLayer } from "../src/types"

// The formats Julia's `_coord_format` sends for the design's examples (#510).
const MV: CoordFormat = { suffix: " mV", spec: ".1f" }
const MV0: CoordFormat = { suffix: " mV", spec: ".0f" }
const USD: CoordFormat = { prefix: "$", group: true, spec: ",.2f" }
const PCT: CoordFormat = { scale: 100, suffix: "%", spec: ".0f" }
const DEG: CoordFormat = { scale: 180 / Math.PI, suffix: "°", label: "θ" }
const PI: CoordFormat = { scale: 1 / Math.PI, suffix: "π" }

describe("fmtCoord", () => {
    it("follows a format string's precision by default (rule 3)", () => {
        expect(fmtCoord(3.4721, MV, 4, false)).toBe("3.5 mV")
        expect(fmtCoord(3.4721, MV0, 4, false)).toBe("3 mV")
        expect(fmtCoord(12345.678, USD, 4, false)).toBe("$12,345.68")
        expect(fmtCoord(0.43721, PCT, 4, false)).toBe("44%")
    })
    it("uses 4 significant figures with the axis's scale and affixes when the format states no precision (rule 4)", () => {
        expect(fmtCoord(Math.PI / 2, DEG, 4, false)).toBe("90°")
        expect(fmtCoord(1, DEG, 4, false)).toBe("57.3°")
        expect(fmtCoord(4.7124, PI, 4, false)).toBe("1.5π")
        expect(fmtCoord(1234567.8, { group: true }, 4, false)).toBe("1,234,568")
        expect(fmtCoord(-1234.5, { group: true, prefix: "$" }, 4, false)).toBe("$-1,235")
    })
    it("lets a set tooltip_sigdigits outrank the format's precision (rule 2)", () => {
        expect(fmtCoord(3.4721, MV, 6, true)).toBe("3.4721 mV")
        expect(fmtCoord(3.4721, MV0, 6, true)).toBe("3.4721 mV")
        expect(fmtCoord(12345.678, USD, 6, true)).toBe("$12,345.7")
        expect(fmtCoord(0.43721, PCT, 6, true)).toBe("43.721%")
        expect(fmtCoord(Math.PI / 2, DEG, 6, true)).toBe("90°")
        expect(fmtCoord(1, DEG, 6, true)).toBe("57.2958°")
    })
    it("prints scientific notation for an `e` format", () => {
        expect(fmtCoord(12345, { exp: true }, 4, false)).toBe("1.235e+4")
        expect(fmtCoord(12345, { exp: true, spec: ".1e" }, 4, false)).toBe("1.2e+4")
    })
    it("keeps trailing zeros on a live readout", () => {
        expect(fmtCoord(Math.PI / 2, DEG, 4, false, true)).toBe("90.00°")
        expect(fmtCoord(2.5, undefined, 4, false, true)).toBe("2.500")
        expect(fmtCoord(3.4721, MV, 4, false, true)).toBe("3.5 mV")
    })
    it("leaves a number with no format, NaN, and non-numbers as they were", () => {
        expect(fmtCoord(0.30000000000000004, undefined, 4, false)).toBe("0.3")
        expect(fmtCoord(7, undefined, 4, false)).toBe("7")
        expect(fmtCoord(NaN, MV, 4, false)).toBe("NaN")
        expect(fmtCoord("Mon", MV, 4, false)).toBe("Mon")
        expect(fmtCoord(2, { label: "r" }, 4, false)).toBe("2")
    })
    it("falls back to significant figures when a spec does not parse", () => {
        expect(fmtCoord(3.4721, { spec: ".2.2f", suffix: " mV" }, 4, false)).toBe("3.472 mV")
    })
})

const POLAR = { xfmt: DEG, yfmt: { label: "r" } } as unknown as AxisTransform
const layerOf = (payloads: unknown[], extra: Partial<HitLayer> = {}) =>
    ({ id: "s", kind: "circles", axis: "ax1", events: ["hover"], geometry: [], payloads, ...extra }) as unknown as HitLayer

describe("coordinate fields in the default table", () => {
    it("formats Masque's default x/y and renames them θ/r on a PolarAxis", () => {
        const L = layerOf([{ index: 1, x: Math.PI / 2, y: 2 }], { coords: ["x", "y"] })
        const c = coordFields(POLAR, L, L.payloads[0], [])
        const html = renderAutoTable(L.payloads[0], 4, c)
        expect(html).toContain(">θ<")
        expect(html).toContain(">90°<")
        expect(html).toContain(">r<")
        expect(html).toContain(">index<")
        expect(renderAutoTablePlain(L.payloads[0], 4, c)).toBe("index 1, θ 90°, r 2")
    })
    it("leaves a user's own payload fields plain", () => {
        const L = layerOf([{ name: "a", x: Math.PI / 2, y: 2 }])
        const html = renderAutoTable(L.payloads[0], 4, coordFields(POLAR, L, L.payloads[0], []))
        expect(html).toContain(">x<")
        expect(html).toContain(">1.571<")
    })
    it("formats the x/y Masque merged in beside a user's own fields", () => {
        const L = layerOf([{ name: "a", x: Math.PI / 2, y: 2 }], { coords: ["x", "y"] })
        expect(renderAutoTablePlain(L.payloads[0], 4, coordFields(POLAR, L, L.payloads[0], []))).toBe("name a, θ 90°, r 2")
    })
    it("formats a line readout's x/y but not a payload field that shadows one", () => {
        const L = layerOf([{ index: 1, y: 9 }])
        const c = coordFields({ xfmt: MV, yfmt: MV } as unknown as AxisTransform, L, L.payloads[0], ["x", "y"])
        expect(Object.keys(c!)).toEqual(["x"])
    })
    it("gives nothing for an axis with no formats", () => {
        expect(coordFields({} as AxisTransform, layerOf([{}], { coords: ["x", "y"] }), {}, ["x"])).toBeUndefined()
        expect(coordFields(undefined, layerOf([{}], { coords: ["x", "y"] }), {}, ["x"])).toBeUndefined()
    })
    it("reaches the hover tooltip and the keyboard announcement", () => {
        const L = layerOf([{ index: 1, x: 0.5, y: 3.4721 }], { coords: ["x", "y"] })
        const t = { xfmt: PCT, yfmt: MV } as unknown as AxisTransform
        const hit = { layer: L, index: 0 } as Hit
        const ctx = { manifest_: { layers: [L], transforms: { ax1: t } }, tipDigits_: 4, tipExplicit_: false } as unknown as OverlayCtx
        const html = tipHtmlForHit(ctx, hit, 0, 0)!
        expect(html).toContain(">50%<")
        expect(html).toContain(">3.5 mV<")
        expect(plainTextForHit(hit, 4, t)).toBe("index 1, x 50%, y 3.5 mV")
        expect(plainTextForHit(hit, 6, t, true)).toBe("index 1, x 50%, y 3.4721 mV")
    })
    it("leaves a template's fields raw", () => {
        const L = layerOf([{ index: 1, x: Math.PI / 2, y: 2 }], { coords: ["x", "y"], template: ["x=", { f: "x" }] } as Partial<HitLayer>)
        expect(plainTextForHit({ layer: L, index: 0 } as Hit, 4, POLAR)).toBe("x=1.571")
    })
})
