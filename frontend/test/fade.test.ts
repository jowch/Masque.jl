// @vitest-environment happy-dom
// The closed-mark selected look (fade.ts, #394): once a plot holds picks, its unpicked marks fade,
// a pick an unpicked mark covers is repainted, and a lone pick is outlined. happy-dom has no 2D
// canvas, so these read what the fade records on each axis's wrapper, not the pixels; the e2e
// drivers check the pixels.
import { afterEach, describe, it, expect } from "vitest"
import { mount } from "../src/overlay"
import { fadesSome } from "../src/fade"
import type { Manifest } from "../src/types"
import { withFields } from "./fields"
import { fadeKept, fadeLone } from "./fadekeys"

const cleanups: Array<() => void> = []
afterEach(() => { while (cleanups.length) cleanups.pop()!() })

function setup(manifest: Manifest) {
    const host = document.createElement("div")
    const img = document.createElement("img")
    img.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
    const script = document.createElement("script")
    host.append(img, script)
    document.body.append(host)
    cleanups.push(mount(script, withFields(manifest)).cleanup)
    const shadowHost = host.lastElementChild as HTMLElement
    const shadow = shadowHost.shadowRoot!
    const surface = shadow.querySelector(".surface") as HTMLElement
    const wrap = (axis = "ax1") => shadow.querySelector(`.masque-fade[data-axis="${axis}"]`) as HTMLElement | null
    return { host, shadowHost, shadow, surface, wrap }
}

const move = (surface: HTMLElement, x: number, y: number) =>
    surface.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true }))
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

// image px; client px are half. 0 and 1 overlap (1 is drawn on top of 0); 2 and 3 stand apart.
const pts = (initial: number[], extra: Partial<Manifest["layers"][number]> = {}): Manifest => ({
    width: 1200, height: 800, scaling: 2, transforms: {},
    layers: [
        { id: "pts", kind: "circles", geometry: [200, 200, 20, 220, 200, 20, 600, 400, 20, 1000, 600, 20],
            payloads: [{}, {}, {}, {}], axis: "ax1", events: ["click", "hover"], many: true, ...extra },
        { id: "other", kind: "circles", geometry: [900, 100, 20], payloads: [{}], axis: "ax1", events: ["hover"] },
    ],
    fields: ["pts"],
    initial: { pts: { items: initial.map((index) => ({ layer: "pts", index })) } },
})

describe("the fade (closed-mark selected look)", () => {
    it("draws nothing until a plot holds picks", () => {
        const { wrap } = setup(pts([]))
        expect(wrap()).toBeNull()
    })

    it("fades only the plot that holds picks: another plot on the axis is untouched", () => {
        const { wrap } = setup(pts([2]))
        expect(wrap()!.dataset.layers).toBe("pts")
        expect(wrap()!.dataset.kept).toBe("1")
        expect(wrap()!.dataset.faded).toBe("3")
    })

    it("hides the canvases again when the last pick goes", () => {
        const { surface, wrap } = setup(pts([2]))
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 200, bubbles: true })) // takes out pts 2
        expect(wrap()!.style.display).toBe("none")
        expect(wrap()!.dataset.kept).toBeUndefined()
    })

    it("outlines a pick only when no other pick is near it", () => {
        const { shadow } = setup(pts([0, 1, 3]))
        expect(fadeLone(shadow)).toEqual(["pts:3"])
    })

    it("outlines bars by the same rule: neighbours within one half-width are a crowd", () => {
        const { shadow } = setup({
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{ id: "bars", kind: "rects", geometry: [100, 400, 40, 200, 150, 400, 40, 200, 400, 400, 40, 200],
                payloads: [{}, {}, {}], axis: "ax1", events: ["click", "hover"], many: true }],
            fields: ["bars"],
            initial: { bars: { items: [0, 1, 2].map((index) => ({ layer: "bars", index })) } },
        })
        expect(fadeLone(shadow)).toEqual(["bars:2"]) // 0 and 1 are 10px apart; 2 stands alone
    })

    it("repaints a pick only when an unpicked mark drawn after it covers it, and only with a known colour", () => {
        // 1 is drawn after 0 and overlaps it: picking 0 alone needs a repaint, picking 1 doesn't.
        expect(setup(pts([0], { colors: "#ff0000" })).wrap()!.dataset.raised).toBe("1")
        expect(setup(pts([1], { colors: "#ff0000" })).wrap()!.dataset.raised).toBe("0")
        expect(setup(pts([0])).wrap()!.dataset.raised).toBe("0") // no colour: left as the image draws it
        // `order` lists the top mark first: with 0 on top, picking 0 needs no repaint.
        expect(setup(pts([0], { colors: "#ff0000", order: [0, 1, 2, 3] })).wrap()!.dataset.raised).toBe("0")
    })

    it("lifts the fade off a hovered unpicked mark, and puts it back when the pointer leaves", async () => {
        const { surface, wrap } = setup(pts([2]))
        move(surface, 500, 300) // pts 3, unpicked
        expect(wrap()!.dataset.lift).toBe("pts:3")
        await frame()
        move(surface, 300, 200) // pts 2, a pick: nothing to lift
        expect(wrap()!.dataset.lift).toBeUndefined()
        await frame()
        move(surface, 500, 300)
        expect(wrap()!.dataset.lift).toBe("pts:3")
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        expect(wrap()!.dataset.lift).toBeUndefined()
    })

    it("keeps a lift through a redraw while the mark stays hovered and unpicked", async () => {
        const { surface, wrap, shadow, host } = setup(pts([2]))
        move(surface, 500, 300)
        expect(wrap()!.dataset.lift).toBe("pts:3")
        // A restored value redraws the selection while the pointer stays put.
        ;(host as unknown as { value: unknown }).value = { pts: { items: [{ layer: "pts", index: 0 }] } }
        expect(fadeKept(shadow)).toEqual(["pts:0"])
        expect(wrap()!.dataset.lift).toBe("pts:3")
    })

    it("sets the fade strength from the unpicked_opacity overlaystyle key", () => {
        const { shadowHost } = setup({ ...pts([2]), overlayStyle: { "--masque-unpicked-opacity": "0.5" } })
        expect(shadowHost.style.getPropertyValue("--masque-unpicked-opacity")).toBe("0.5")
        const css = shadowHost.shadowRoot!.querySelector("style")!.textContent!
        expect(css).toContain("opacity: calc(1 - var(--masque-unpicked-opacity, 0.2))")
    })

    it("keeps grid cells and lines on their SVG recipes", () => {
        const { shadow, wrap } = setup({
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 10], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "g", kind: "grid", axis: "ax1", events: ["click", "hover"], payloads: [],
                    geometry: { xedges: [0, 600, 1200], yedges: [0, 400, 800], ncols: 2, nrows: 2 } },
                { id: "segs", kind: "segments", geometry: [100, 100, 400, 200], payloads: [{}], axis: "ax1", events: ["click", "hover"] },
            ],
            fields: ["g", "segs"],
            initial: { g: { layer: "g", index: 0 }, segs: { layer: "segs", index: 0 } },
        })
        expect(wrap()).toBeNull()
        expect(shadow.querySelectorAll("g.sel > *").length).toBe(3) // the cell's fill + edge, the segment's ring
    })

    it("knows when keeping some marks fades nothing: every drawn mark of the scope kept", () => {
        const a = { id: "a", kind: "circles", axis: "ax1", events: [], payloads: [{}, {}, {}],
            geometry: [10, 10, 5, 30, 10, 5, 50, 10, 5], order: [2, 0] } as Manifest["layers"][number]
        const b = { id: "b", kind: "circles", axis: "ax1", events: [], payloads: [{}],
            geometry: [90, 10, 5] } as Manifest["layers"][number]
        const hit = (layer: typeof a, index: number) => ({ layer, index, geom_: ["circle"] }) as never
        expect(fadesSome([hit(a, 0)], [a])).toBe(true)
        // Element 1 is not drawn (`order` leaves it out), so keeping 0 and 2 keeps all of a.
        expect(fadesSome([hit(a, 0), hit(a, 2)], [a])).toBe(false)
        expect(fadesSome([hit(a, 0), hit(a, 2)], [a, b])).toBe(true)
        expect(fadesSome([], [])).toBe(false)
    })

    it("fades toward the axis's own plot area colour when it has one, else the figure's", () => {
        const m = pts([0])
        m.background = "rgb(31,31,31)"
        expect(setup(m).wrap()?.dataset.fill).toBe("rgb(31,31,31)")
        const m2 = pts([0])
        m2.background = "rgb(31,31,31)"
        m2.transforms = { ax1: { xlims: [0, 10], ylims: [0, 10], xscale: "identity", yscale: "identity",
            viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false, fill: "rgb(51,51,51)" } }
        expect(setup(m2).wrap()?.dataset.fill).toBe("rgb(51,51,51)")
    })
})
