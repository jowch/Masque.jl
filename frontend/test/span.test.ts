// @vitest-environment happy-dom
import { afterEach, describe, it, expect } from "vitest"
import { mount as mountOverlay } from "../src/overlay"
import { hitLayer } from "../src/geometry"
import { GRIP_LONG_CSS, GRIP_THICK_CSS } from "../src/drag/span"
import type { AxisTransform, HitLayer, Manifest, SpanGeometry } from "../src/types"
import { withFields } from "./fields"

// A band (#500): two edges, the picture outside them faded, a grip on each edge.

const cleanups: Array<() => void> = []
afterEach(() => { while (cleanups.length) cleanups.pop()!() })

// Image 1200×800 drawn at 600×400 CSS px: one CSS px is two image px.
function setup(manifest: Manifest) {
    const host = document.createElement("div")
    const img = document.createElement("img")
    Object.defineProperty(img, "naturalWidth", { value: 1200 })
    img.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
    const script = document.createElement("script")
    host.append(img, script)
    document.body.append(host)
    cleanups.push(mountOverlay(script, withFields(manifest)).cleanup)
    const shadow = (host.lastElementChild as HTMLElement).shadowRoot!
    const surface = shadow.querySelector(".surface") as HTMLElement
    const inputs: Record<string, unknown>[] = []
    host.addEventListener("input", () => inputs.push((host as unknown as { value: Record<string, unknown> }).value))
    return { host, shadow, surface, inputs }
}

const ax1: AxisTransform = {
    xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
    viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false,
}

// x window [3, 6] on ax1: edges at image x 360 and 720.
const xSpan = (extra: HitLayer[] = []): Manifest => ({
    width: 1200, height: 800, scaling: 2, background: "rgb(255,255,255)", transforms: { ax1 },
    layers: [...extra, { id: "span", kind: "span", axis: "ax1", events: ["drag"], payloads: [],
        geometry: { orientation: "v", lo: 360, hi: 720, span: [0, 800] } }],
})

// y band [25, 50] on ax1: lo at image y 600, hi at 400 (a larger y value sits higher).
const ySpan = (): Manifest => ({
    width: 1200, height: 800, scaling: 2, transforms: { ax1 },
    layers: [{ id: "span", kind: "span", axis: "ax1", events: ["drag"], payloads: [],
        geometry: { orientation: "h", lo: 600, hi: 400, span: [0, 1200] } }],
})

const pointer = (el: HTMLElement, type: string, x: number, y: number) =>
    el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
const drag = (el: HTMLElement, from: [number, number], to: [number, number]) => {
    pointer(el, "pointerdown", ...from)
    pointer(el, "pointermove", ...to)
    pointer(el, "pointerup", ...to)
}
const attr = (el: Element, k: string) => Number(el.getAttribute(k))
type SpanValue = { layer: string; index: number; payload: { lo: number; hi: number } }
const last = (inputs: Record<string, unknown>[]) => inputs[inputs.length - 1].span as SpanValue

describe("span hit-test", () => {
    const layer = xSpan().layers[0]
    const g = layer.geometry as SpanGeometry
    it("grabs an edge near its line, the inside between them, and nothing outside", () => {
        expect(hitLayer(layer, 365, 400, ax1)?.spanPart_).toEqual({ edge: "lo" })
        expect(hitLayer(layer, 714, 400, ax1)?.spanPart_).toEqual({ edge: "hi" })
        expect(hitLayer(layer, 500, 400, ax1)?.spanPart_).toEqual({ move: true })
        expect(hitLayer(layer, 200, 400, ax1)).toBeNull()
        expect(hitLayer(layer, 900, 400, ax1)).toBeNull()
    })
    it("an edge reaches a little past the ends of its line, where the grip overhangs a narrow bar", () => {
        expect(hitLayer(layer, 360, -6, ax1)?.spanPart_).toEqual({ edge: "lo" })
        expect(hitLayer(layer, 500, -6, ax1)).toBeNull() // the inside does not
        expect(g.span).toEqual([0, 800])
    })
    it("two edges close together give the nearer one", () => {
        const near = { ...layer, geometry: { ...g, lo: 500, hi: 506 } }
        expect(hitLayer(near, 499, 400, ax1)?.spanPart_).toEqual({ edge: "lo" })
        expect(hitLayer(near, 507, 400, ax1)?.spanPart_).toEqual({ edge: "hi" })
    })
})

describe("span chrome", () => {
    it("draws two fades outside the band, two edge lines and two grips", () => {
        const { shadow } = setup(xSpan())
        const dims = [...shadow.querySelectorAll(".masque-span-dim")]
        expect(dims).toHaveLength(2)
        expect([attr(dims[0], "x"), attr(dims[0], "width")]).toEqual([0, 360])
        expect([attr(dims[1], "x"), attr(dims[1], "width")]).toEqual([720, 480])
        expect((dims[0] as SVGElement).style.fill).toBe("rgb(255,255,255)")
        const lines = [...shadow.querySelectorAll("line.masque-threshold-line")]
        expect(lines.map((l) => attr(l, "x1"))).toEqual([360, 720])
        const grips = [...shadow.querySelectorAll("rect.masque-handle")]
        expect(grips).toHaveLength(2)
        // 6 × 16 CSS px at two image px per CSS px, centred on the edge and across the axis.
        expect(attr(grips[0], "width")).toBe(2 * GRIP_THICK_CSS)
        expect(attr(grips[0], "height")).toBe(2 * GRIP_LONG_CSS)
        expect(attr(grips[0], "x") + GRIP_THICK_CSS).toBe(360)
        expect(attr(grips[0], "y") + GRIP_LONG_CSS).toBe(400)
    })
    it("takes the plot area's own colour for the fade when the axis has one", () => {
        const m = xSpan()
        m.transforms.ax1 = { ...ax1, fill: "rgb(10,20,30)" }
        const { shadow } = setup(m)
        expect((shadow.querySelector(".masque-span-dim") as SVGElement).style.fill).toBe("rgb(10,20,30)")
    })
})

describe("span drag", () => {
    it("an edge drag moves that edge and commits the sorted (lo, hi)", () => {
        const { shadow, surface, inputs } = setup(xSpan())
        // lo edge at image x 360 = client 180; drag to client 120 (image 240, x = 2).
        drag(surface, [180, 200], [120, 200])
        const lines = [...shadow.querySelectorAll("line.masque-threshold-line")]
        expect(attr(lines[0], "x1")).toBe(240)
        expect(attr(lines[1], "x1")).toBe(720)
        expect(last(inputs)).toMatchObject({ layer: "span", index: 0 })
        expect(last(inputs).payload.lo).toBeCloseTo(2)
        expect(last(inputs).payload.hi).toBeCloseTo(6)
    })
    it("an edge stops at the other edge, so lo never passes hi", () => {
        const { shadow, surface, inputs } = setup(xSpan())
        drag(surface, [180, 200], [500, 200])
        const lines = [...shadow.querySelectorAll("line.masque-threshold-line")]
        expect(attr(lines[0], "x1")).toBe(720)
        expect(last(inputs).payload.lo).toBeCloseTo(6)
        expect(last(inputs).payload.hi).toBeCloseTo(6)
    })
    it("the inside moves both edges, stopping at the end of the axis", () => {
        const { shadow, surface, inputs } = setup(xSpan())
        drag(surface, [270, 200], [300, 200]) // +60 image px
        let lines = [...shadow.querySelectorAll("line.masque-threshold-line")]
        expect(lines.map((l) => attr(l, "x1"))).toEqual([420, 780])
        expect(last(inputs).payload.lo).toBeCloseTo(3.5)
        expect(last(inputs).payload.hi).toBeCloseTo(6.5)
        drag(surface, [300, 200], [600, 200]) // far past the right end
        lines = [...shadow.querySelectorAll("line.masque-threshold-line")]
        expect(lines.map((l) => attr(l, "x1"))).toEqual([840, 1200])
        expect(last(inputs).payload.hi).toBeCloseTo(10)
    })
    it("on a y band the lower value is the lower edge on screen", () => {
        const { surface, inputs } = setup(ySpan())
        // hi edge at image y 400 = client 200; drag it up to client 100 (image 200, y = 75).
        drag(surface, [300, 200], [300, 100])
        expect(last(inputs).payload.lo).toBeCloseTo(25)
        expect(last(inputs).payload.hi).toBeCloseTo(75)
        // The lo edge cannot cross above it.
        drag(surface, [300, 300], [300, 20])
        expect(last(inputs).payload.lo).toBeCloseTo(75)
    })
    it("a press inside the band on a mark keeps the mark's click instead of moving the band", () => {
        const pts: HitLayer = { id: "pts", kind: "circles", geometry: [540, 400, 20], payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"] }
        const { shadow, surface } = setup(xSpan([pts]))
        drag(surface, [270, 200], [300, 200])
        const lines = [...shadow.querySelectorAll("line.masque-threshold-line")]
        expect(lines.map((l) => attr(l, "x1"))).toEqual([360, 720])
    })
})

describe("span hover", () => {
    it("an edge takes the resize cursor and thickens; the inside keeps a mark's hover", async () => {
        const frame = () => new Promise((r) => setTimeout(r, 40)) // onMove coalesces moves per frame
        const pts: HitLayer = { id: "pts", kind: "circles", geometry: [540, 400, 20], payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"] }
        const { shadow, surface } = setup(xSpan([pts]))
        pointer(surface, "pointermove", 180, 200)
        const lines = [...shadow.querySelectorAll("line.masque-threshold-line")]
        expect(lines[0].classList.contains("hovered")).toBe(true)
        expect(surface.classList.contains("cur-ew")).toBe(true)
        await frame()
        pointer(surface, "pointermove", 270, 200) // on the mark inside the band
        expect(lines[0].classList.contains("hovered")).toBe(false)
        expect(surface.classList.contains("hot")).toBe(true)
        await frame()
        pointer(surface, "pointermove", 320, 120) // inside, off the mark
        expect(surface.classList.contains("hot")).toBe(false)
        expect(surface.classList.contains("cur-move")).toBe(true)
    })
})

describe("span keyboard", () => {
    const stop = (shadow: ShadowRoot) => shadow.querySelector('.drag-stop[data-layer="span"]') as HTMLElement
    const key = (el: HTMLElement, k: string, opts: KeyboardEventInit = {}) => {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }))
        el.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true }))
    }
    it("arrows move the band; Alt moves the edge on that side out, Alt+Shift in; Home reaches the end", () => {
        const { shadow, inputs } = setup(xSpan())
        const el = stop(shadow)
        expect(el.getAttribute("aria-label")).toBe("Band")
        el.focus()
        key(el, "ArrowRight") // one CSS px = two image px
        expect(last(inputs).payload.lo).toBeCloseTo(3 + 2 / 120)
        expect(last(inputs).payload.hi).toBeCloseTo(6 + 2 / 120)
        key(el, "ArrowRight", { altKey: true })
        expect(last(inputs).payload.hi).toBeCloseTo(6 + 4 / 120)
        key(el, "ArrowLeft", { altKey: true, shiftKey: true }) // the left edge, moved in
        expect(last(inputs).payload.lo).toBeCloseTo(3 + 4 / 120)
        key(el, "Home")
        expect(last(inputs).payload.lo).toBeCloseTo(0)
        key(el, "ArrowUp") // not this band's axis: consumed, nothing moves
        expect(last(inputs).payload.lo).toBeCloseTo(0)
    })
})
