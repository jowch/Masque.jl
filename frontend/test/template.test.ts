import { describe, it, expect, vi } from "vitest"
import { esc, renderTemplate, renderAutoTable, fmtNum, withReadout } from "../src/template"
import type { AxisTransform, Hit, HitLayer } from "../src/types"

// d3-format's own specs never throw once parsed (a bad spec throws at parse time, already
// covered above) — so exercising applySpec's *second* try/catch (the formatter call itself
// throwing) needs a formatter that parses fine but throws on invocation.
vi.mock("d3-format", async (importOriginal) => {
    const actual = await importOriginal<typeof import("d3-format")>()
    return {
        ...actual,
        format: (spec: string) => (spec === "__throw_on_call__" ? () => { throw new Error("boom") } : actual.format(spec)),
    }
})

describe("esc", () => {
    it("escapes the 5 HTML chars", () => {
        expect(esc(`<img onerror="x" & '`)).toBe("&lt;img onerror=&quot;x&quot; &amp; &#39;")
    })
})

describe("renderTemplate", () => {
    it("keeps literal markup live, escapes data", () => {
        const segs = ["<b>", { f: "name" }, "</b>"]
        expect(renderTemplate(segs, { name: "<script>" })).toBe("<b>&lt;script&gt;</b>")
    })
    it("applies a d3-format spec to numbers", () => {
        expect(renderTemplate([{ f: "pop", spec: "," }], { pop: 37000000 })).toBe("37,000,000")
        expect(renderTemplate([{ f: "r", spec: ".1%" }], { r: 0.123 })).toBe("12.3%")
    })
    it("missing field → empty, bad spec → raw", () => {
        expect(renderTemplate([{ f: "nope" }], { x: 1 })).toBe("")
        expect(renderTemplate([{ f: "v", spec: ".2z" }], { v: 5 })).toBe("5")
    })
    it("non-finite numeric values skip formatting and fall back to plain escaping", () => {
        expect(renderTemplate([{ f: "v", spec: "," }], { v: NaN })).toBe("NaN")
        expect(renderTemplate([{ f: "v", spec: "," }], { v: Infinity })).toBe("Infinity")
        expect(renderTemplate([{ f: "v", spec: "," }], { v: -Infinity })).toBe("-Infinity")
    })
    it("caches a spec formatter across repeated fields (bad and good spec both reused)", () => {
        // second use of the same bad spec must hit the cached fallback (still catches, no throw)
        expect(renderTemplate([{ f: "a", spec: ".2z" }, " ", { f: "b", spec: ".2z" }], { a: 1, b: 2 })).toBe("1 2")
        expect(renderTemplate([{ f: "a", spec: "," }, " ", { f: "b", spec: "," }], { a: 1000, b: 2000 })).toBe("1,000 2,000")
    })
    it("a payload that isn't an object (or is null/undefined) renders every field as missing", () => {
        expect(renderTemplate([{ f: "x" }, "!"], "just a string")).toBe("!")
        expect(renderTemplate([{ f: "x" }, "!"], null)).toBe("!")
        expect(renderTemplate([{ f: "x" }, "!"], 42)).toBe("!")
    })
    it("a value with no spec that isn't a string is still escaped via String()", () => {
        expect(renderTemplate([{ f: "obj" }], { obj: { a: 1 } })).toBe(esc(String({ a: 1 })))
    })
    it("a spec that parses fine but throws when invoked falls back to plain escaping", () => {
        expect(renderTemplate([{ f: "v", spec: "__throw_on_call__" }], { v: 5 })).toBe("5")
    })
})

describe("renderAutoTable", () => {
    it("renders escaped name/value rows", () => {
        const html = renderAutoTable({ city: "Tokyo", n: "<b>" })
        expect(html).toContain("Tokyo")
        expect(html).toContain("&lt;b&gt;")
        expect(html).toContain("masque-tip-row")
    })

    it("renders the text-button payload (; text, index, x, y)", () => {
        const html = renderAutoTable({ text: "Hello", index: 0, x: 1.5, y: 2 })
        expect(html).toContain("text")
        expect(html).toContain("Hello")
        expect(html).toContain("1.5")
    })
    it("null/undefined payload renders nothing", () => {
        expect(renderAutoTable(null)).toBe("")
        expect(renderAutoTable(undefined)).toBe("")
    })
    it("a non-object payload (scalar) is escaped directly, not tabulated", () => {
        expect(renderAutoTable(42)).toBe("42")
        expect(renderAutoTable("<b>raw</b>")).toBe("&lt;b&gt;raw&lt;/b&gt;")
    })
    it("a nested object value stringifies via String() and is escaped", () => {
        const html = renderAutoTable({ point: { x: 1, y: 2 } })
        expect(html).toContain(esc(String({ x: 1, y: 2 })))
    })
})

describe("fmtNum (a tooltip number with no format spec)", () => {
    it("rounds to 4 significant figures by default and drops trailing zeros", () => {
        expect(fmtNum(0.30000000000000004)).toBe("0.3")
        expect(fmtNum(Math.PI)).toBe("3.142")
        expect(fmtNum(2.5)).toBe("2.5")
        expect(fmtNum(-0.000123456)).toBe("-0.0001235")
    })
    it("keeps integers whole", () => {
        expect(fmtNum(42)).toBe("42")
        expect(fmtNum(123456789)).toBe("123456789")
        expect(fmtNum(0)).toBe("0")
    })
    it("keeps the whole-number part at or above 10^digits instead of zeroing digits", () => {
        expect(fmtNum(123456.789)).toBe("123457")
        expect(fmtNum(9999.6)).toBe("10000")
        expect(fmtNum(999.96)).toBe("1000")
    })
    it("takes the digits setting", () => {
        expect(fmtNum(Math.PI, 2)).toBe("3.1")
        expect(fmtNum(Math.PI, 8)).toBe("3.1415927")
        expect(fmtNum(123.456, 2)).toBe("123")
    })
    it("passes non-numbers and non-finite numbers through String()", () => {
        expect(fmtNum("0.30000000000000004")).toBe("0.30000000000000004")
        expect(fmtNum(NaN)).toBe("NaN")
        expect(fmtNum(Infinity)).toBe("Infinity")
        expect(fmtNum(true)).toBe("true")
        expect(fmtNum(null)).toBe("null")
    })
})

describe("rounding in the tooltip renderers", () => {
    it("the auto table rounds each number", () => {
        const html = renderAutoTable({ index: 3, x: 0.1 + 0.2, y: 2.718281828 })
        expect(html).toContain(">0.3<")
        expect(html).toContain(">2.718<")
        expect(html).toContain(">3<")
        expect(html).not.toContain("0.30000000000000004")
    })
    it("the auto table takes the digits setting, and rounds a scalar payload", () => {
        expect(renderAutoTable({ y: 2.718281828 }, 2)).toContain(">2.7<")
        expect(renderAutoTable(2.718281828, 3)).toBe("2.72")
    })
    it("a bare template field rounds; a field with a spec follows the spec alone", () => {
        const segs = [{ f: "x" }, " | ", { f: "x", spec: ".6f" }]
        expect(renderTemplate(segs, { x: 0.1 + 0.2 })).toBe("0.3 | 0.300000")
        expect(renderTemplate([{ f: "x" }], { x: Math.PI }, 2)).toBe("3.1")
    })
})

describe("withReadout", () => {
    const layer = { id: "l", kind: "lines", geometry: [], payloads: [], axis: "ax1", events: ["hover"] } as HitLayer
    const t = { xcats: ["a", "b"] } as unknown as AxisTransform
    it("names a category position by its label, and keeps a position past the labels as a number", () => {
        const hit = (x: number): Hit => ({ layer, index: 0, pt_: [0, x, 1] })
        expect(withReadout({ label: "s" }, hit(2), t, false)).toEqual({ label: "s", x: "b", y: 1 })
        expect(withReadout({ label: "s" }, hit(3), t, false)).toEqual({ label: "s", x: 3, y: 1 })
    })
    it("adds the 1-based index for a template only, and leaves a scalar payload alone", () => {
        const hit: Hit = { layer, index: 0, pt_: [4, 1, 2] }
        expect(withReadout({}, hit, undefined, true)).toEqual({ i: 5, x: 1, y: 2 })
        expect(withReadout("text", hit, undefined, true)).toBe("text")
    })
    it("lets the payload's own fields win a clash, as every mark's defaults do", () => {
        const hit: Hit = { layer, index: 0, pt_: [4, 1, 2] }
        const out = withReadout({ x: "mine", name: "s" }, hit, undefined, true)
        expect(out).toEqual({ x: "mine", name: "s", i: 5, y: 2 })
        expect(Object.keys(out as object)).toEqual(["x", "name", "i", "y"])
    })
})
