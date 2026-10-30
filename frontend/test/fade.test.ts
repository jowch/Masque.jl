// @vitest-environment happy-dom
// The closed-mark selected look (fade.ts, #394): once a plot holds picks, its unpicked marks fade,
// a pick an unpicked mark covers is repainted, and a lone pick is outlined. happy-dom has no 2D
// canvas, so these read what the fade records on each axis's wrapper, not the pixels; the e2e
// drivers check the pixels.
import { afterEach, describe, it, expect, vi } from "vitest"
import { mount } from "../src/overlay"
import type { Manifest } from "../src/types"
import { withFields } from "./fields"
import { fadeDraws, fadeKept, fadeLone } from "./fadekeys"
import { punchSteps } from "../src/fade"
import type { FadeEl } from "../src/fade"

const cleanups: Array<() => void> = []
afterEach(() => { while (cleanups.length) cleanups.pop()!() })

function setup(manifest: Manifest, requestFrame?: Parameters<typeof mount>[3]) {
    const host = document.createElement("div")
    const img = document.createElement("img")
    img.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
    const script = document.createElement("script")
    host.append(img, script)
    document.body.append(host)
    cleanups.push(mount(script, withFields(manifest), undefined, requestFrame).cleanup)
    const shadowHost = host.lastElementChild as HTMLElement
    const shadow = shadowHost.shadowRoot!
    const surface = shadow.querySelector(".surface") as HTMLElement
    const wrap = (axis = "ax1") => shadow.querySelector(`.masque-fade[data-axis="${axis}"]`) as HTMLElement | null
    return { host, img, shadowHost, shadow, surface, wrap }
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

    it("sets a preview's strength from the preview_opacity overlaystyle key", () => {
        const { shadowHost } = setup({ ...pts([2]), overlayStyle: { "--masque-preview-opacity": "0.5" } })
        expect(shadowHost.style.getPropertyValue("--masque-preview-opacity")).toBe("0.5")
        const css = shadowHost.shadowRoot!.querySelector("style")!.textContent!
        expect(css).toContain(".masque-fade.masque-preview canvas.masque-dim { opacity: calc(1 - var(--masque-preview-opacity, 0.35)); }")
    })

    it("keeps grid cells and line segments on their SVG recipes", () => {
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
        expect(shadow.querySelectorAll("g.sel > *").length).toBe(3) // the cell's fill + halo, the segment's halo
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
    it("clips the canvases to the axis at rest: a mark past the limits is not drawn", () => {
        const m = pts([2])
        m.transforms = { ax1: { xlims: [0, 10], ylims: [0, 10], xscale: "identity", yscale: "identity",
            viewport: [120, 80, 600, 400], xreversed: false, yreversed: false } }
        expect(setup(m).wrap()!.style.clipPath).toBe("inset(10% 40% 40% 10%)")
    })

    it("keeps the plot area colour and the overlay colour through a pan frame", async () => {
        const transforms = (fill?: string): Manifest["transforms"] => ({ ax1: { xlims: [0, 10], ylims: [0, 10],
            xscale: "identity", yscale: "identity", viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false,
            ...(fill ? { fill } : {}) } })
        const view = { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
            geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } } as Manifest["layers"][number]
        const m = pts([2])
        m.transforms = transforms("rgb(51,51,51)")
        m.layers.push(view)
        m.background = "rgb(31,31,31)"
        m.overlayStyle = { "--masque-chrome": "#ff8800" }
        // A frame's manifest: new geometry, the axis's own fill, no figure-level styles.
        const next = pts([])
        next.transforms = transforms("rgb(51,51,51)")
        next.layers.push(view)
        delete next.initial
        const requestFrame = vi.fn(async () => ({ png: new Uint8Array([1]), manifest: withFields(next) }))
        const { img, surface, wrap } = setup(m, requestFrame)
        const ev = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -120, ctrlKey: true })
        Object.defineProperty(ev, "clientX", { value: 300 })
        Object.defineProperty(ev, "clientY", { value: 200 })
        surface.dispatchEvent(ev)
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
        img.dispatchEvent(new Event("load"))
        expect(requestFrame).toHaveBeenCalled()
        expect(wrap()!.dataset.fill).toBe("rgb(51,51,51)")
        expect((wrap() as FadeEl).masqueFade!.draws).toBeGreaterThan(1)
        expect(next.background).toBe("rgb(31,31,31)")
        expect(next.overlayStyle).toEqual({ "--masque-chrome": "#ff8800" })
    })
})

describe("the lone pick's outline colour", () => {
    // happy-dom has no 2D canvas: a stand-in context records nothing, so drawAxis runs its
    // canvas path and records each outline's colour.
    const realGetContext = HTMLCanvasElement.prototype.getContext
    afterEach(() => { HTMLCanvasElement.prototype.getContext = realGetContext })
    const stub = () => {
        const noop = () => {}
        HTMLCanvasElement.prototype.getContext = function () {
            return new Proxy({ fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1, globalCompositeOperation: "source-over" }, {
                get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : noop),
            })
        } as unknown as typeof realGetContext
    }
    const outlines = (shadow: ShadowRoot) =>
        ([...shadow.querySelectorAll(".masque-fade")] as FadeEl[]).flatMap((w) => w.masqueFade?.outlines ?? [])

    it("is the mark's own colour moved 45% toward black on a light plot area, toward white on a dark one", () => {
        stub()
        expect(outlines(setup(pts([3], { colors: "#3366cc" })).shadow)).toEqual(["rgb(28,56,112)"])
        const dark = pts([3], { colors: "#3366cc" })
        dark.background = "rgb(20,20,20)"
        expect(outlines(setup(dark).shadow)).toEqual(["rgb(143,171,227)"])
    })

    it("is the layer's hoverstyle stroke, else the overlay colour, else the chrome grey with no mark colour", () => {
        stub()
        expect(outlines(setup(pts([3], { colors: "#3366cc", style: { stroke: "#00aa00", width: 1.5 } })).shadow)).toEqual(["#00aa00"])
        const fig = pts([3], { colors: "#3366cc" })
        fig.overlayStyle = { "--masque-chrome": "#ff8800" }
        expect(outlines(setup(fig).shadow)).toEqual(["#ff8800"])
        expect(outlines(setup(pts([3])).shadow)).toEqual(["#7a7a7a"])
    })
})

// Lines are series: hovering one, or a legend entry's hover or pick, fades the other lines.
describe("lines join the fade", () => {
    const t1 = { xlims: [0, 10] as [number, number], ylims: [0, 10] as [number, number], xscale: "identity" as const, yscale: "identity" as const,
        viewport: [0, 0, 1200, 800] as [number, number, number, number], xreversed: false, yreversed: false }
    // Three lines on one axis, one point each at x = 100, 300, 500 image px; a legend for them.
    const lines = (extra: Partial<Manifest> = {}): Manifest => ({
        width: 1200, height: 800, scaling: 2, transforms: { ax1: t1 },
        layers: [
            { id: "a", kind: "lines", geometry: [[100, 200, 300, 200, 500, 200]], points: [[1, 1, 2, 1, 3, 1]], linewidth: 3,
                payloads: [{}], axis: "ax1", events: ["click", "hover"] },
            { id: "b", kind: "lines", geometry: [[100, 400, 300, 400, 500, 400]], points: [[1, 2, 2, 2, 3, 2]], linewidth: 3,
                payloads: [{}], axis: "ax1", events: ["click", "hover"] },
            { id: "c", kind: "lines", geometry: [[100, 600, 300, 600, 500, 600]], points: [[1, 3, 2, 3, 3, 3]], linewidth: 3,
                payloads: [{}], axis: "ax1", events: ["click", "hover"] },
            { id: "legend", kind: "rects", axis: "ax1", events: ["click", "hover"], geometry: [1000, 100, 40, 20, 1000, 150, 40, 20],
                payloads: [{}, {}], links: [["a"], ["b"]] },
        ],
        ...extra,
    } as Manifest)

    it("hovering a line fades the other lines and marks its sample with a dot outside it", async () => {
        const { shadow, surface, wrap } = setup(lines())
        move(surface, 150, 201) // line b, near sample 1 (300, 400)
        await frame()
        expect(fadeKept(shadow)).toEqual(["b:0"])
        expect(wrap()!.dataset.faded).toBe("2")
        expect(wrap()!.classList.contains("masque-preview")).toBe(true)
        const dot = shadow.querySelector("svg.masque-edge g.hi .masque-halo-out > circle.masque-hi")!
        expect([dot.getAttribute("cx"), dot.getAttribute("cy")]).toEqual(["300", "400"])
        // No stroke along the line itself.
        expect(shadow.querySelector("svg.masque-edge g.hi path")).toBeNull()
        // The dot follows the pointer from sample to sample.
        move(surface, 250, 201)
        await frame()
        const next = shadow.querySelector("svg.masque-edge g.hi .masque-halo-out > circle.masque-hi")!
        expect(next.getAttribute("cx")).toBe("500")
        // Leaving ends the preview.
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        expect(wrap()!.style.display).toBe("none")
    })

    it("a line alone on its axis fades nothing: the dot alone marks it", async () => {
        const one = lines()
        one.layers = one.layers.filter((l) => l.id === "a")
        const { shadow, surface, wrap } = setup(one)
        move(surface, 150, 101)
        await frame()
        expect(wrap()).toBeNull()
        expect(shadow.querySelector("svg.masque-edge g.hi .masque-halo-out > circle.masque-hi")).not.toBeNull()
    })

    it("moving along a lone line beside held picks never redraws the fade", async () => {
        const m = lines()
        m.layers = [m.layers[0], { id: "pts", kind: "circles", geometry: [900, 700, 20, 1000, 700, 20], payloads: [{}, {}],
            axis: "ax1", events: ["click", "hover"], many: true }]
        m.fields = ["pts"]
        m.initial = { pts: { items: [{ layer: "pts", index: 0 }] } }
        const { shadow, surface } = setup(m)
        // Past the overlay's first frames, which re-place (and here, with no 2D canvas, redraw) it.
        for (let k = 0; k < 30; k++) await frame()
        const before = fadeDraws(shadow)
        for (const x of [60, 80, 120, 160, 200, 240]) {
            move(surface, x, 101)
            await frame()
        }
        expect(fadeDraws(shadow)).toBe(before)
        expect(shadow.querySelector("svg.masque-edge g.hi .masque-halo-out")).not.toBeNull()
    })

    it("a legend entry's hover fades the other lines, and draws no outline on the kept one", async () => {
        const { shadow, surface, wrap } = setup(lines())
        move(surface, 500, 50) // legend entry 0 → line a
        await frame()
        expect(fadeKept(shadow)).toEqual(["a:0"])
        expect(fadeLone(shadow)).toEqual([])
        expect(shadow.querySelectorAll("g.link > *").length).toBe(0)
        expect(wrap()!.classList.contains("masque-preview")).toBe(true)
    })

    it("a legend pick fades the other lines at the pick's strength, and puts no wash on the picked line", () => {
        const { shadow, wrap } = setup(lines({ fields: ["legend"], initial: { legend: { layer: "legend", index: 1 } } }))
        expect(fadeKept(shadow)).toEqual(["b:0"])
        expect(fadeLone(shadow)).toEqual([]) // a line has no lone-pick outline
        expect(wrap()!.classList.contains("masque-preview")).toBe(false)
        expect(shadow.querySelector("g.sel path")).toBeNull()
    })

    it("hovering a line while a legend pick holds another keeps both at full strength", async () => {
        const { shadow, surface, wrap } = setup(lines({ fields: ["legend"], initial: { legend: { layer: "legend", index: 1 } } }))
        move(surface, 150, 301) // line c
        await frame()
        expect(fadeKept(shadow).sort()).toEqual(["b:0", "c:0"])
        expect(wrap()!.classList.contains("masque-preview")).toBe(false)
    })
})

describe("a legend's hover on closed marks (D4)", () => {
    it("fades the other series and outlines none of the hovered one's marks", async () => {
        const { shadow, surface } = setup({
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [
                { id: "p", kind: "circles", geometry: [200, 200, 20, 800, 600, 20], payloads: [{}, {}], axis: "ax1", events: ["hover"] },
                { id: "q", kind: "circles", geometry: [600, 200, 20], payloads: [{}], axis: "ax1", events: ["hover"] },
                { id: "legend", kind: "rects", axis: "ax1", events: ["hover"], geometry: [1000, 100, 40, 20, 1000, 150, 40, 20],
                    payloads: [{}, {}], links: [["p"], ["q"]] },
            ],
        } as Manifest)
        move(surface, 500, 50)
        await frame()
        expect(fadeKept(shadow)).toEqual(["p:0", "p:1"])
        expect(fadeLone(shadow)).toEqual([])
    })
})

// A faded line drawn over a kept mark stays faded where they meet (#462): punching the kept mark
// out shows the image's pixels, which there are the faded line's, so its cover is put back. Each
// layer's `draw` says which is on top.
describe("a faded line crossing a kept mark", () => {
    // Four lines: s1 and s4 run across, s2 and s3 run down through both; drawn s1, s2, s3, s4.
    const line = (id: string, geometry: number[]) => ({ id, kind: "lines" as const, geometry: [geometry], points: [[0, 0]],
        linewidth: 3, payloads: [{}], axis: "ax1", events: ["hover" as const] })
    const four = () => [
        line("s1", [100, 200, 900, 200]), line("s2", [300, 100, 300, 700]),
        line("s3", [600, 100, 600, 700]), line("s4", [100, 500, 900, 500]),
    ].map((l, i) => ({ ...l, draw: i + 1 }))
    const box = (l: Manifest["layers"][number]): [number, number, number, number] => {
        const v = (l.geometry as number[][])[0]
        return [Math.min(v[0], v[2]) - 1.5, Math.min(v[1], v[3]) - 1.5, Math.max(v[0], v[2]) + 1.5, Math.max(v[1], v[3]) + 1.5]
    }
    const steps = (layers: Manifest["layers"], keep: string[], within?: [number, number, number, number]) =>
        punchSteps(layers, new Map(layers.map((l) => [l, new Set(keep.includes(l.id) ? [0] : [])])), (l) => box(l), 1.5, within)
            .map((s) => `${s.keep ? "punch" : "cover"} ${s.layer.id}`)

    it("puts back the cover of the faded lines drawn after a kept one, in paint order", () => {
        // s2 and s3 kept: s4, drawn after both and crossing both, goes back over them; s1 is drawn
        // first, so the kept lines are already over it in the image.
        expect(steps(four(), ["s2", "s3"])).toEqual(["punch s2", "punch s3", "cover s4"])
    })

    it("puts back nothing when every kept line is drawn over the faded ones", () => {
        const ls = [0, 3, 1, 2].map((i, k) => ({ ...four()[i], draw: k + 1 }))
        expect(steps(ls, ["s2", "s3"])).toEqual(["punch s2", "punch s3"])
    })

    it("puts back nothing a kept line does not meet", () => {
        const ls = four()
        ls[3] = { ...line("s4", [700, 600, 900, 600]), draw: 4 } // right of s3, below s1: crosses no kept line
        expect(steps(ls, ["s2"])).toEqual(["punch s2"])
    })

    it("puts back a faded line between two kept ones, then punches the later kept one over it", () => {
        const ls = [1, 0, 2, 3].map((i, k) => ({ ...four()[i], draw: k + 1 }))
        expect(steps(ls, ["s2", "s3"])).toEqual(["punch s2", "cover s1", "punch s3", "cover s4"])
    })

    it("with a box, only the kept marks that meet it, and what is drawn over them", () => {
        expect(steps(four(), ["s2", "s3"], [580, 480, 620, 520])).toEqual(["punch s3", "cover s4"])
    })

    it("reads which layer is on top from `draw`, never from the manifest's order", () => {
        // The manifest lists s1 first: `draw` says s4 is on top all the same.
        expect(steps(four(), ["s2"])).toEqual(["punch s2", "cover s4"])
        expect(steps([...four()].reverse(), ["s2"])).toEqual(["punch s2", "cover s4"])
        // Without `draw` (layers listed by hand), no layer is put back over another.
        const bare = four().map(({ draw: _, ...l }) => l)
        expect(steps(bare, ["s2"])).toEqual(["punch s2"])
        const ls = four()
        // A scatter drawn over the lines keeps its markers where a faded line crosses them.
        const pts: Manifest["layers"][number] = { id: "p", kind: "circles", geometry: [300, 200, 20], payloads: [{}], axis: "ax1",
            events: ["hover"], draw: 5 }
        const withPts = new Map([...ls.map((l) => [l, new Set<number>()] as const), [pts, new Set([0])]])
        expect(punchSteps([...ls, pts], withPts, (l) => l === pts ? [280, 180, 320, 220] : box(l), 1.5).map((s) => s.keep))
            .toEqual([true])
    })

    it("puts nothing back on a 3D axis, where depth decides which line is in front", () => {
        const ls = four()
        const kept = new Map(ls.map((l) => [l, new Set(l.id === "s2" ? [0] : [])]))
        expect(punchSteps(ls, kept, (l) => box(l), 1.5, undefined, true).map((s) => s.keep)).toEqual([true])
    })

    it("leaves closed marks over closed marks alone", () => {
        const pts: Manifest["layers"][number] = { id: "p", kind: "circles", geometry: [200, 200, 20, 210, 200, 20], payloads: [{}, {}],
            axis: "ax1", events: ["click"] }
        const out = punchSteps([pts], new Map([[pts, new Set([0])]]), (_, k) => [180 + 10 * k, 180, 220 + 10 * k, 220], 1.5)
        expect(out.map((s) => s.keep)).toEqual([true])
    })

    it("a legend pick of s2 and a hover of s3 keep s1 and s4 faded at every crossing", async () => {
        const m = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 10], xscale: "identity", yscale: "identity", viewport: [0, 0, 1200, 800],
                xreversed: false, yreversed: false } },
            layers: [...four(), { id: "legend", kind: "rects", axis: "ax1", events: ["click", "hover"],
                geometry: [1000, 100, 40, 20, 1000, 150, 40, 20, 1000, 200, 40, 20, 1000, 250, 40, 20],
                payloads: [{}, {}, {}, {}], links: [["s1"], ["s2"], ["s3"], ["s4"]] }],
            fields: ["legend"], initial: { legend: { layer: "legend", index: 1 } },
        } as unknown as Manifest
        const { shadow, surface, wrap } = setup(m)
        expect(fadeKept(shadow)).toEqual(["s2:0"])
        // s4 crosses s2 after it and goes back over it; s1 is drawn under s2, and s3 never meets it.
        expect(wrap()!.dataset.covered).toBe("1")
        move(surface, 500, 100) // legend entry s3
        await frame()
        expect(fadeKept(shadow).sort()).toEqual(["s2:0", "s3:0"])
        // s3 kept too: s4 goes back over both, and s1 stays under them.
        expect(wrap()!.dataset.covered).toBe("1")
        expect(wrap()!.dataset.faded).toBe("2")
    })
})

// A legend Makie draws over the plot hides the marks under it, so the overlay leaves its box
// (`occluders`) out of every mark's highlight and fade, but not out of Masque's own tools (#437).
describe("a legend over the plot", () => {
    const realGetContext = HTMLCanvasElement.prototype.getContext
    afterEach(() => { HTMLCanvasElement.prototype.getContext = realGetContext })
    // A stand-in context that records each clearRect.
    const stub = () => {
        const cleared: number[][] = []
        const noop = () => {}
        HTMLCanvasElement.prototype.getContext = function () {
            const t: Record<string, unknown> = { fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1, globalCompositeOperation: "source-over",
                clearRect: (...a: number[]) => cleared.push(a) }
            return new Proxy(t, { get: (o, k) => (k in o ? o[k as string] : noop) })
        } as unknown as typeof realGetContext
        return cleared
    }
    const box: [number, number, number, number] = [880, 60, 200, 100] // over "other" at (900, 100)
    const covered = (initial: number[]): Manifest => ({ ...pts(initial), occluders: [box] })

    it("empties the legend's box on both canvases after each draw", () => {
        const cleared = stub()
        setup(covered([2]))
        expect(cleared.filter((a) => a.join() === box.join()).length).toBe(2)
    })

    it("empties it again when a lifted mark's fade is put back", async () => {
        const cleared = stub()
        const { surface } = setup(covered([2]))
        move(surface, 500, 300) // pts 3, unpicked: lifted
        await frame()
        const before = cleared.filter((a) => a.join() === box.join()).length
        move(surface, 5, 395) // nothing: pts 3's fade goes back
        await frame()
        expect(cleared.filter((a) => a.join() === box.join()).length).toBe(before + 1)
    })

    it("clips the marks' highlights to leave the box out, and not Masque's own tools", () => {
        const { shadow } = setup(covered([2]))
        for (const kind of ["fill", "edge", "plain"]) {
            const svg = shadow.querySelector(`svg.masque-${kind}`)!
            const path = svg.querySelector(`clipPath#masque-occluders-${kind} > path`)!
            expect(path.getAttribute("clip-rule")).toBe("evenodd")
            expect(path.getAttribute("d")).toContain("M880 60h200v100h-200z")
            for (const role of ["sel", "link", "hi"]) {
                const photo = svg.querySelector(`g.masque-photo:has(> g.${role})`)!
                expect(photo.getAttribute("clip-path")).toBe(`url(#masque-occluders-${kind})`)
            }
            expect(svg.querySelector("g.masque-photo:has(> g.chrome)")!.hasAttribute("clip-path")).toBe(false)
        }
    })

    it("clips nothing when no legend covers the plot", () => {
        const { shadow } = setup(pts([2]))
        expect(shadow.querySelector("clipPath[id^=masque-occluders]")).toBeNull()
        expect(shadow.querySelector("g.masque-photo[clip-path]")).toBeNull()
    })
})
