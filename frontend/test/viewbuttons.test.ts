// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest"
import { mount } from "../src/overlay"
import { placeButtons, viewsWithButtons, boxLength, boxBreadth, CORNERS } from "../src/viewbuttons"
import type { AxisTransform, HitLayer, Manifest } from "../src/types"
import { withFields } from "./fields"

// Corner view buttons (#525).

const tf = (viewport: [number, number, number, number]): AxisTransform => ({
    xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
    viewport, xreversed: false, yreversed: false,
})
const view = (id: string, axis: string, [x, y, w, h]: number[], extra: Record<string, unknown> = {}): HitLayer =>
    ({ id, kind: "view", axis, events: ["drag"], payloads: [], geometry: { x, y, w, h, mode: "pan", ...extra } as never })

// A 1200×800 image shown at 600×400 CSS px: k = 2 image px per CSS px.
const K = 2
const one = (opts: { occluders?: Array<[number, number, number, number]>; vp?: [number, number, number, number] } = {}): Manifest => {
    const vp = opts.vp ?? [100, 100, 1000, 600]
    return { width: 1200, height: 800, scaling: 2, transforms: { ax1: tf(vp) }, layers: [view("view", "ax1", vp)], occluders: opts.occluders }
}

describe("where the buttons go", () => {
    it("top right of a roomy axis, a 24 px stack", () => {
        const m = one()
        expect(placeButtons(m, m.layers[0], K, false)).toEqual({ corner: "tr", row: false, size: 24 })
    })

    it("a legend in the top-right corner sends them top left, then bottom right", () => {
        // An axislegend: 8 CSS px in from the top-right corner.
        const tr: [number, number, number, number] = [900, 116, 184, 120]
        let m = one({ occluders: [tr] })
        expect(placeButtons(m, m.layers[0], K, false)?.corner).toBe("tl")
        m = one({ occluders: [tr, [116, 116, 184, 120]] })
        expect(placeButtons(m, m.layers[0], K, false)?.corner).toBe("br")
    })

    it("never bottom left, even when the other three corners are covered", () => {
        // The bottom-left corner is free; the top-right one is the least covered.
        const m = one({ occluders: [[1060, 110, 40, 60], [100, 100, 200, 300], [900, 400, 200, 300]] })
        const p = placeButtons(m, m.layers[0], K, false)
        expect(p?.corner).toBe("tr")
        expect(CORNERS).not.toContain("bl")
    })

    it("a short axis gets a row, a tiny one none", () => {
        // 200 CSS px tall: a 76 px stack is more than half. 400 wide: the row fits.
        let m = one({ vp: [0, 0, 800, 280] })
        expect(placeButtons(m, m.layers[0], K, false)).toEqual({ corner: "tr", row: true, size: 24 })
        // 60 × 60 CSS px: neither.
        m = one({ vp: [0, 0, 120, 120] })
        expect(placeButtons(m, m.layers[0], K, false)).toBeNull()
        // Exactly half the height takes the stack.
        const h = 2 * boxLength(24) * K
        m = one({ vp: [0, 0, 800, h] })
        expect(placeButtons(m, m.layers[0], K, false)?.row).toBe(false)
    })

    it("on touch, 44 px when it fits, else 24 px", () => {
        let m = one()
        expect(placeButtons(m, m.layers[0], K, true)?.size).toBe(44)
        // 200 CSS px tall: a 136 px stack is too tall, a 136 px row fits in 500 wide.
        m = one({ vp: [0, 0, 1000, 400] })
        expect(placeButtons(m, m.layers[0], K, true)).toEqual({ corner: "tr", row: true, size: 44 })
        // 160 CSS px wide and tall: no 44 px box fits, the 24 px stack does.
        m = one({ vp: [0, 0, 320, 320] })
        expect(placeButtons(m, m.layers[0], K, true)).toEqual({ corner: "tr", row: false, size: 24 })
    })

    it("an inset axis covers its parent's corner; the parent does not cover the inset's", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { main: tf([100, 100, 1000, 600]), inset: tf([700, 120, 400, 400]) },
            layers: [view("v1", "main", [100, 100, 1000, 600]), view("v2", "inset", [700, 120, 400, 400])],
        }
        expect(placeButtons(m, m.layers[0], K, false)?.corner).toBe("tl")
        expect(placeButtons(m, m.layers[1], K, false)?.corner).toBe("tr")
    })

    it("twin axes on one viewport share one stack, the first view's", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { a: tf([100, 100, 1000, 600]), b: tf([100, 100, 1000, 600]) },
            layers: [view("v1", "a", [100, 100, 1000, 600]), view("v2", "b", [100, 100, 1000, 600])],
        }
        expect(viewsWithButtons(m).map((l) => l.id)).toEqual(["v1"])
        // Twins don't cover each other's corners.
        expect(placeButtons(m, m.layers[0], K, false)?.corner).toBe("tr")
        // `controls = :none` on the first leaves the cell without buttons.
        ;(m.layers[0].geometry as unknown as Record<string, unknown>).controls = "none"
        expect(viewsWithButtons(m)).toEqual([])
    })

    it("an axis running off the picture places the stack in the part that shows", () => {
        // Viewport 400..1600 in a 1200-wide image: the right corner is the image edge.
        const m = one({ vp: [400, 100, 1200, 600] })
        const p = placeButtons(m, m.layers[0], K, false)
        expect(p?.corner).toBe("tr")
    })
})

// The live widget, as reset.test.ts drives it.
const manifestOf = (opts: { moved?: boolean; controls?: string; mode?: "pan" | "orbit"; picks?: boolean; rect?: [number, number, number, number]; occluders?: Array<[number, number, number, number]> } = {}): Manifest => {
    const mode = opts.mode ?? "pan"
    const [x, y, w, h] = opts.rect ?? [0, 0, 1200, 800]
    const geometry: Record<string, unknown> = mode === "pan"
        ? { x, y, w, h, mode }
        : { x, y, w, h, mode, azimuth: 0, elevation: 0, limits: [0, 1, 0, 1, 0, 1], panx: [0.001, 0, 0], pany: [0, 0, -0.001] }
    if (opts.moved) geometry.moved = true
    if (opts.controls) geometry.controls = opts.controls
    return {
        width: 1200, height: 800, scaling: 2, transforms: { ax1: tf([x, y, w, h]) }, occluders: opts.occluders,
        layers: [
            { id: "pts", kind: "circles", geometry: [100, 100, 10], payloads: [{ v: 1 }], axis: "ax1", events: ["click", "hover"] },
            { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [], geometry: geometry as never },
        ],
    }
}

function setup(manifest: Manifest, live = true) {
    const host = document.createElement("div")
    const canvas = document.createElement("canvas") as HTMLCanvasElement & { masqueReplaceScene?: unknown }
    canvas.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
    canvas.masqueReplaceScene = vi.fn()
    const script = document.createElement("script")
    host.append(canvas, script)
    document.body.append(host)
    const frame = (input: Record<string, unknown>) => ({ ...manifest, layers: manifest.layers.map((l) => l.kind !== "view" ? l : { ...l, geometry: { ...(l.geometry as object), moved: input.reset !== true } as never }) })
    const requestFrame = vi.fn(async (input: Record<string, unknown>) => ({ scene: {}, pxPerUnit: 1, width: 600, height: 400, manifest: frame(input) }))
    mount(script, withFields(manifest), undefined, live ? requestFrame as never : undefined)
    const shadow = (host.lastElementChild as HTMLElement).shadowRoot!
    const surface = shadow.querySelector(".surface") as HTMLElement
    const stop = shadow.querySelector(`.drag-stop[data-layer="view"]`) as HTMLElement
    const box = shadow.querySelector(".masque-vb") as HTMLElement | null
    const inputs: unknown[] = []
    host.addEventListener("input", () => inputs.push((host as unknown as { value: unknown }).value))
    return { host, shadow, surface, stop, box, requestFrame, inputs }
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms))
const pointer = (el: HTMLElement, type: string, x: number, y: number, pointerType = "mouse", extra: PointerEventInit = {}) =>
    el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, pointerType, ...extra }))
const calls = (rf: ReturnType<typeof vi.fn>) => rf.mock.calls.map((c) => c[0] as Record<string, unknown>)
const btn = (box: HTMLElement, k: string) => box.querySelector(`.masque-vb-${k}`) as HTMLElement

describe("the corner buttons on a live widget", () => {
    it("show on hover over the axis and go when the pointer leaves", () => {
        const { surface, box } = setup(manifestOf())
        expect(box).not.toBeNull()
        expect(box!.dataset.corner).toBe("tr")
        expect(box!.classList.contains("show")).toBe(false)
        pointer(surface, "pointermove", 300, 200)
        expect(box!.classList.contains("show")).toBe(true)
        pointer(surface, "pointerleave", 700, 200)
        expect(box!.classList.contains("show")).toBe(false)
    })

    it("show while the view's keyboard stop has focus, and after a touch", () => {
        const { surface, stop, box } = setup(manifestOf())
        stop.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }))
        expect(box!.classList.contains("show")).toBe(true)
        stop.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }))
        expect(box!.classList.contains("show")).toBe(false)
        pointer(surface, "pointerdown", 300, 200, "touch")
        pointer(surface, "pointerup", 300, 200, "touch")
        pointer(surface, "pointerleave", 300, 200, "touch")
        expect(box!.classList.contains("show")).toBe(true)
    })

    it("reset joins only once the view has moved, and leaves after a reset", async () => {
        const { box, requestFrame } = setup(manifestOf())
        expect(box!.classList.contains("moved")).toBe(false)
        btn(box!, "in").click()
        expect(box!.classList.contains("moved")).toBe(true)
        await tick()
        btn(box!, "reset").click()
        expect(box!.classList.contains("moved")).toBe(false)
        await tick()
        expect(calls(requestFrame).filter((i) => i.reset === true)).toHaveLength(1)
        expect(box!.classList.contains("moved")).toBe(false)
    })

    it("zoom in and out each send one settled step about the centre, the step of + and -", async () => {
        const { box, requestFrame } = setup(manifestOf())
        btn(box!, "in").click()
        await tick()
        const zin = calls(requestFrame)[0]
        expect(zin).toMatchObject({ id: "view", settle: true })
        expect(zin.s as number).toBeGreaterThan(1)
        // The centre stays put: s·c + t = c.
        expect((zin.s as number) * 600 + (zin.tx as number)).toBeCloseTo(600)
        expect((zin.s as number) * 400 + (zin.ty as number)).toBeCloseTo(400)
        // The same factor as one + press.
        const keyed = setup(manifestOf())
        keyed.stop.focus()
        keyed.stop.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true, cancelable: true }))
        keyed.stop.dispatchEvent(new KeyboardEvent("keyup", { key: "+", bubbles: true }))
        await tick()
        expect(calls(keyed.requestFrame).slice(-1)[0].s).toBeCloseTo(zin.s as number)
        btn(box!, "out").click()
        await tick()
        // Relative to the zoomed frame now on screen: back out by the same factor.
        expect(calls(requestFrame).slice(-1)[0].s as number).toBeCloseTo(1 / (zin.s as number))
    })

    it("an Axis3 zooms its limits", async () => {
        const { box, requestFrame } = setup(manifestOf({ mode: "orbit" }))
        btn(box!, "in").click()
        await tick()
        const c = calls(requestFrame)[0]
        expect(c).toMatchObject({ id: "view", settle: true })
        const lim = c.limits as number[]
        expect(lim[1] - lim[0]).toBeLessThan(1)
    })

    it("a press is not a click on the plot: no pick cleared, nothing hit-tested", async () => {
        const { host, surface, box, inputs } = setup(manifestOf())
        // Pick the mark at CSS (50, 50).
        surface.dispatchEvent(new MouseEvent("click", { clientX: 50, clientY: 50, bubbles: true, cancelable: true }))
        expect(inputs).toHaveLength(1)
        // Past the shadow root: the page (Pluto, a drag in progress on window) never sees the press.
        const seen: string[] = []
        for (const t of ["pointerdown", "pointerup", "mousedown", "click", "dblclick"]) host.addEventListener(t, () => seen.push(t))
        const b = btn(box!, "in")
        b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, composed: true }))
        b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, composed: true }))
        b.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, composed: true }))
        b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }))
        b.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, composed: true }))
        await tick()
        expect(seen).toEqual([])
        expect(inputs).toHaveLength(1)
    })

    it("+ and - stay put when reset joins: the box is placed by where all three start", () => {
        // A 1200x800 picture at 600x400 CSS px. Stack in `tr`; row in `tr` (a short axis);
        // stack in `br` (both top corners covered).
        const L = boxLength(24), B = boxBreadth(24)
        const cases: Array<[string, Manifest, string, string]> = [
            ["tr stack", manifestOf(), `calc(100% - ${8 + B}px)`, "calc(0% + 8px)"],
            ["tr row", manifestOf({ rect: [0, 0, 1200, 200] }), `calc(100% - ${8 + L}px)`, "calc(0% + 8px)"],
            ["br stack", manifestOf({ occluders: [[1000, 0, 200, 200], [0, 0, 200, 200]] }), `calc(100% - ${8 + B}px)`, `calc(100% - ${8 + L}px)`],
        ]
        for (const [name, m, left, top] of cases) {
            const { box } = setup(m)
            const at = () => [box!.style.left, box!.style.top, box!.style.right, box!.style.bottom]
            expect(at(), name).toEqual([left, top, "", ""])
            btn(box!, "in").click()
            expect(box!.classList.contains("moved"), name).toBe(true)
            expect(at(), name).toEqual([left, top, "", ""])
            // Reset is the last button: it joins at the far end, after + and -.
            expect([...box!.querySelectorAll("button")].map((b) => b.className), name).toEqual(["masque-vb-in", "masque-vb-out", "masque-vb-reset"])
        }
    })

    it("a wheel over the box is the plot's: Ctrl+wheel zooms, a plain wheel scrolls the page", async () => {
        // happy-dom drops ctrlKey and clientX/Y from a WheelEvent init (#526); the box rebuilds
        // the event for the surface, so give it a WheelEvent that keeps them.
        const Base = WheelEvent
        class Kept extends Base {
            constructor(type: string, init: WheelEventInit = {}) {
                super(type, init)
                for (const k of ["ctrlKey", "metaKey", "clientX", "clientY"] as const) Object.defineProperty(this, k, { value: init[k] ?? (k.endsWith("Key") ? false : 0) })
            }
        }
        vi.stubGlobal("WheelEvent", Kept)
        const { box, requestFrame } = setup(manifestOf())
        const plain = new WheelEvent("wheel", { deltaY: -100, clientX: 590, clientY: 10, bubbles: true, cancelable: true, composed: true })
        box!.dispatchEvent(plain)
        expect(plain.defaultPrevented).toBe(false)
        await tick(50)
        expect(requestFrame).not.toHaveBeenCalled()
        const ctrl = new WheelEvent("wheel", { deltaY: -100, clientX: 590, clientY: 10, ctrlKey: true, bubbles: true, cancelable: true, composed: true })
        box!.dispatchEvent(ctrl)
        expect(ctrl.defaultPrevented).toBe(true)
        await tick(50)
        expect(requestFrame).toHaveBeenCalled()
        vi.unstubAllGlobals()
    })

    it("focus on a twin's keyboard stop shows the shared stack", () => {
        const m = manifestOf()
        m.transforms.ax2 = tf([0, 0, 1200, 800])
        m.layers.push({ ...m.layers[1], id: "view_2", axis: "ax2" })
        const { shadow, box } = setup(m)
        expect(shadow.querySelectorAll(".masque-vb")).toHaveLength(1)
        const stop2 = shadow.querySelector(`.drag-stop[data-layer="view_2"]`) as HTMLElement
        stop2.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }))
        expect(box!.classList.contains("show")).toBe(true)
        stop2.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }))
        expect(box!.classList.contains("show")).toBe(false)
    })

    it("a touch outside the widget puts a touch-shown box away", () => {
        const { surface, box } = setup(manifestOf())
        pointer(surface, "pointerdown", 300, 200, "touch")
        pointer(surface, "pointerup", 300, 200, "touch")
        expect(box!.classList.contains("show")).toBe(true)
        pointer(document.body, "pointerdown", 900, 900, "touch")
        expect(box!.classList.contains("show")).toBe(false)
    })

    it("controls = :always shows them without hover; :none leaves them out", () => {
        expect(setup(manifestOf({ controls: "always" })).box!.classList.contains("show")).toBe(true)
        expect(setup(manifestOf({ controls: "none" })).box).toBeNull()
    })

    it("no buttons without a live channel, and they go once it dies", async () => {
        expect(setup(manifestOf(), false).box).toBeNull()
        const host = document.createElement("div")
        const canvas = document.createElement("canvas")
        canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
        const script = document.createElement("script")
        host.append(canvas, script)
        document.body.append(host)
        mount(script, withFields(manifestOf({ controls: "always" })), undefined, (async () => { throw new Error("gone") }) as never)
        const box = (host.lastElementChild as HTMLElement).shadowRoot!.querySelector(".masque-vb") as HTMLElement
        expect(box.classList.contains("show")).toBe(true)
        btn(box, "in").click()
        await tick()
        expect(box.classList.contains("show")).toBe(false)
    })
})
