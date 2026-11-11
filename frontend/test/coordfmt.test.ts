import { describe, it, expect } from "vitest"
import { coordFields, fmtCoord, plainTextForHit, renderAutoTable, renderAutoTablePlain, rowNames } from "../src/template"
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
    it("prints a hand-placed tick's label for a value exactly on it, not while live (#606)", () => {
        const T: CoordFormat = { ticks: [[1, "a"], [2, "b"]] }
        expect(fmtCoord(1, T, 4, false)).toBe("a")
        expect(fmtCoord(2, T, 4, false, true)).toBe("2.000")
        expect(fmtCoord(1.5, T, 4, false)).toBe("1.5")
        expect(fmtCoord(2, { ...T, label: "group" }, 4, false)).toBe("b")
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
        const L = layerOf([{ index: 1, x: Math.PI / 2, y: 2 }], { coords: { x: "x", y: "y" } })
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
        const L = layerOf([{ name: "a", x: Math.PI / 2, y: 2 }], { coords: { x: "x", y: "y" } })
        expect(renderAutoTablePlain(L.payloads[0], 4, coordFields(POLAR, L, L.payloads[0], []))).toBe("name a, θ 90°, r 2")
    })
    it("formats a bar's fields along its value axis, keeping their names", () => {
        const L = layerOf([{ low: 0, high: 3.5, value: 3.5 }], { kind: "rects", coords: { low: "y", high: "y", value: "y" } } as Partial<HitLayer>)
        const t = { xfmt: PCT, yfmt: MV } as unknown as AxisTransform
        expect(renderAutoTablePlain(L.payloads[0], 4, coordFields(t, L, L.payloads[0], []))).toBe("low 0.0 mV, high 3.5 mV, value 3.5 mV")
        const h = layerOf([{ value: 3, low: 0.25, high: 0.5 }], { kind: "rects", coords: { value: "y", low: "x", high: "x" } } as Partial<HitLayer>)
        expect(renderAutoTablePlain(h.payloads[0], 4, coordFields(t, h, h.payloads[0], []))).toBe("value 3.0 mV, low 25%, high 50%")
    })
    it("takes a format's label only for the axis's own field", () => {
        const L = layerOf([{ value: 2, y: 2 }], { coords: { value: "y", y: "y" } })
        expect(renderAutoTablePlain(L.payloads[0], 4, coordFields(POLAR, L, L.payloads[0], []))).toBe("value 2, r 2")
    })
    it("formats a line readout's x/y but not a payload field that shadows one", () => {
        const L = layerOf([{ index: 1, y: 9 }])
        const c = coordFields({ xfmt: MV, yfmt: MV } as unknown as AxisTransform, L, L.payloads[0], ["x", "y"])
        expect(Object.keys(c!)).toEqual(["x"])
    })
    it("formats an Axis3 line readout's z with the z tick format", () => {
        const L = layerOf([{ index: 1 }], { kind: "lines" } as Partial<HitLayer>)
        const t = { zfmt: { suffix: " K", spec: ".2f" } } as unknown as AxisTransform
        const hit = { layer: L, index: 0, pt_: [0, 1, 2, 3.14159] } as unknown as Hit
        expect(plainTextForHit(hit, 4, t)).toBe("index 1, x 1, y 2, z 3.14 K")
        const flat = { layer: L, index: 0, pt_: [0, 1, 2] } as unknown as Hit
        expect(plainTextForHit(flat, 4, t)).toBe("index 1, x 1, y 2")
    })
    it("gives nothing for an axis with no formats", () => {
        expect(coordFields({} as AxisTransform, layerOf([{}], { coords: { x: "x", y: "y" } }), {}, ["x"])).toBeUndefined()
        expect(coordFields(undefined, layerOf([{}], { coords: { x: "x", y: "y" } }), {}, ["x"])).toBeUndefined()
    })
    it("reaches the hover tooltip and the keyboard announcement", () => {
        const L = layerOf([{ index: 1, x: 0.5, y: 3.4721 }], { coords: { x: "x", y: "y" } })
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
        const L = layerOf([{ index: 1, x: Math.PI / 2, y: 2 }], { coords: { x: "x", y: "y" }, template: ["x=", { f: "x" }] } as Partial<HitLayer>)
        expect(plainTextForHit({ layer: L, index: 0 } as Hit, 4, POLAR)).toBe("x=1.571")
    })
})

describe("axis labels as row names", () => {
    const LAB = { xfmt: { label: "Time (s)" }, yfmt: { suffix: " mV", spec: ".1f", label: "Voltage" } } as unknown as AxisTransform
    it("names Masque's x/y by the axis labels, plain or formatted", () => {
        const L = layerOf([{ index: 1, x: 2.345, y: 3.4721 }], { coords: { x: "x", y: "y" } })
        const c = coordFields(LAB, L, L.payloads[0], [])
        expect(renderAutoTablePlain(L.payloads[0], 4, c)).toBe("index 1, Time (s) 2.345, Voltage 3.5 mV")
        expect(renderAutoTable(L.payloads[0], 4, c)).toContain(">Time (s)<")
    })
    it("names a line readout's nearest sample by the labels", () => {
        const L = layerOf([{ index: 1 }], { kind: "lines" } as Partial<HitLayer>)
        expect(plainTextForHit({ layer: L, index: 0, pt_: [0, 1, 2] } as unknown as Hit, 4, LAB)).toBe("index 1, Time (s) 1, Voltage 2.0 mV")
    })
    it("keeps a user's own x, labelling only the y Masque filled in", () => {
        const L = layerOf([{ site: "B4", x: 0.812, y: 2 }], { coords: { y: "y" } })
        expect(renderAutoTablePlain(L.payloads[0], 4, coordFields(LAB, L, L.payloads[0], []))).toBe("site B4, x 0.812, Voltage 2.0 mV")
    })
    it("keeps a number on one line, but lets text wrap", () => {
        const html = renderAutoTable({ text: "a note", y: 3.5 }, 4, { y: { suffix: " mV", label: "A long label" } })
        expect(html).toContain('<span class="masque-tip-val masque-tip-num">3.5 mV</span>')
        expect(html).toContain('<span class="masque-tip-val">a note</span>')
    })
    it("drops a label that clashes with another row", () => {
        expect(rowNames(["value", "x"], { x: { label: "value" } })).toEqual({ value: "value", x: "x" })
        expect(rowNames(["x", "y"], { x: { label: "Position" }, y: { label: "Position" } })).toEqual({ x: "x", y: "y" })
        expect(rowNames(["x", "y"], { x: { label: "Position" }, y: { label: "Height" } })).toEqual({ x: "Position", y: "Height" })
    })
})
