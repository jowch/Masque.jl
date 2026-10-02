// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest"
import { mount } from "../src/overlay"
import type { Manifest } from "../src/types"

// Image 1200×800 drawn at 600×400 CSS px: one CSS px is two image px.
function setup(manifest: Manifest, requestFrame?: (input: Record<string, unknown>) => Promise<unknown>) {
    const host = document.createElement("div")
    const img = document.createElement("img")
    img.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
    const script = document.createElement("script")
    host.append(img, script)
    document.body.append(host)
    mount(script, manifest, undefined, requestFrame as never)
    const shadow = (host.lastElementChild as HTMLElement).shadowRoot!
    const inputs: unknown[] = []
    host.addEventListener("input", () => inputs.push((host as unknown as { value: unknown }).value))
    return { host, shadow, inputs }
}

const ax1 = {
    xlims: [0, 10] as [number, number], ylims: [0, 100] as [number, number], xscale: "identity", yscale: "identity",
    viewport: [0, 0, 1200, 800] as [number, number, number, number], xreversed: false, yreversed: false,
}

const press = (el: HTMLElement, key: string, opts: KeyboardEventInit = {}): KeyboardEvent => {
    const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts })
    el.dispatchEvent(e)
    return e
}
const release = (el: HTMLElement, key: string) => el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }))

const thresholdManifest = (orientation: "h" | "v" = "h"): Manifest => ({
    width: 1200, height: 800, scaling: 2, transforms: { ax1 },
    layers: [
        { id: "pts", kind: "circles", geometry: [100, 100, 10], payloads: [{ v: 1 }], axis: "ax1", events: ["click", "hover"] },
        { id: "thr", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [],
            geometry: { orientation, pos: orientation === "h" ? 400 : 600, span: orientation === "h" ? [0, 1200] : [0, 800] } },
    ],
})

const roiManifest = (selects = false): Manifest => ({
    width: 1200, height: 800, scaling: 2, transforms: { ax1 },
    layers: [
        { id: "pts", kind: "circles", geometry: [250, 250, 5, 1100, 250, 5], payloads: [{ v: 1 }, { v: 2 }], axis: "ax1", events: ["hover"] },
        { id: "roi", kind: "roi", axis: "ax1", events: ["drag"], payloads: [], ...(selects ? { selects: "pts" } : {}),
            geometry: { x: 200, y: 200, w: 400, h: 400, handle: 16 } },
    ],
})

const viewManifest = (mode: "pan" | "orbit"): Manifest => ({
    width: 1200, height: 800, scaling: 2, transforms: { ax1 },
    layers: [{ id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
        geometry: mode === "pan" ? { x: 0, y: 0, w: 1200, h: 800, mode } : { x: 0, y: 0, w: 1200, h: 800, mode, azimuth: 0, elevation: 0 } }],
})

const stopOf = (shadow: ShadowRoot, id: string) => shadow.querySelector(`.drag-stop[data-layer="${id}"]`) as HTMLElement

describe("drag-layer tab stops", () => {
    it("adds one stop per drag layer after the surface, and none for marks", () => {
        const { shadow } = setup(roiManifest())
        const order = [...shadow.querySelectorAll("[tabindex='0']")]
        expect(order).toHaveLength(2)
        expect(order[0].classList.contains("surface")).toBe(true)
        expect((order[1] as HTMLElement).dataset.layer).toBe("roi")
        const hint = shadow.getElementById(order[1].getAttribute("aria-describedby")!)
        expect(hint?.textContent).toMatch(/Alt/)
    })

    it("threshold: slider semantics along the free axis", () => {
        const { shadow } = setup(thresholdManifest("h"))
        const stop = stopOf(shadow, "thr")
        expect(stop.getAttribute("role")).toBe("slider")
        expect(stop.getAttribute("aria-orientation")).toBe("vertical")
        expect(stop.getAttribute("aria-valuetext")).toBe("50.00")
        const v = setup(thresholdManifest("v"))
        expect(stopOf(v.shadow, "thr").getAttribute("aria-orientation")).toBe("horizontal")
    })

    it("threshold: Up moves one CSS px, repeats do not write the bond, keyup writes it once", () => {
        const { shadow, inputs } = setup(thresholdManifest("h"))
        const stop = stopOf(shadow, "thr")
        const line = shadow.querySelector(".masque-threshold-line") as SVGLineElement
        stop.focus()
        const e = press(stop, "ArrowUp")
        expect(e.defaultPrevented).toBe(true)
        expect(line.getAttribute("y1")).toBe("398")
        press(stop, "ArrowUp", { repeat: true })
        press(stop, "ArrowUp", { repeat: true })
        expect(line.getAttribute("y1")).toBe("394")
        expect(inputs).toHaveLength(0)
        release(stop, "ArrowUp")
        expect(inputs).toHaveLength(1)
        // image y 394: 1 - 394/800 = 0.5075 → 50.75
        expect((inputs[0] as { payload: number }).payload).toBeCloseTo(50.75)
        expect(inputs[0]).toMatchObject({ layer: "thr", index: 0 })
    })

    it("threshold: the cross-axis pair is consumed without moving; Page is 10 CSS px; Home/End reach the ends", () => {
        const { shadow, inputs } = setup(thresholdManifest("h"))
        const stop = stopOf(shadow, "thr")
        const line = shadow.querySelector(".masque-threshold-line") as SVGLineElement
        stop.focus()
        const e = press(stop, "ArrowLeft")
        expect(e.defaultPrevented).toBe(true)
        expect(line.getAttribute("y1")).toBe("400")
        release(stop, "ArrowLeft")
        expect(inputs).toHaveLength(0)
        press(stop, "PageUp")
        expect(line.getAttribute("y1")).toBe("380")
        press(stop, "End")
        expect(line.getAttribute("y1")).toBe("0")
        press(stop, "Home")
        expect(line.getAttribute("y1")).toBe("800")
        release(stop, "Home")
        expect((inputs[inputs.length - 1] as { payload: number }).payload).toBeCloseTo(0)
    })

    it("threshold: a vertical line takes Left and Right", () => {
        const { shadow, inputs } = setup(thresholdManifest("v"))
        const stop = stopOf(shadow, "thr")
        const line = shadow.querySelector(".masque-threshold-line") as SVGLineElement
        stop.focus()
        press(stop, "ArrowUp")
        expect(line.getAttribute("x1")).toBe("600")
        press(stop, "ArrowRight")
        expect(line.getAttribute("x1")).toBe("602")
        release(stop, "ArrowRight")
        expect((inputs[inputs.length - 1] as { payload: number }).payload).toBeCloseTo(5.0167, 3)
    })

    it("arrows on the plot surface still walk marks, not the line", () => {
        const { shadow, inputs } = setup(thresholdManifest("h"))
        const surface = shadow.querySelector(".surface") as HTMLElement
        const line = shadow.querySelector(".masque-threshold-line") as SVGLineElement
        surface.focus()
        press(surface, "ArrowUp")
        expect(line.getAttribute("y1")).toBe("400")
        expect(shadow.querySelector(".hi > *")).toBeTruthy()
        expect(inputs).toHaveLength(0)
    })

    it("blur commits a nudge whose key never came up; Escape blurs", () => {
        const { shadow, inputs } = setup(thresholdManifest("h"))
        const stop = stopOf(shadow, "thr")
        stop.focus()
        press(stop, "ArrowDown")
        const esc = press(stop, "Escape")
        expect(esc.defaultPrevented).toBe(true)
        expect(shadow.activeElement).not.toBe(stop)
        expect(inputs).toHaveLength(1)
    })

    it("leaves Ctrl/Cmd chords and Tab to the browser", () => {
        const { shadow } = setup(viewManifest("pan"))
        const stop = stopOf(shadow, "view")
        stop.focus()
        expect(press(stop, "+", { ctrlKey: true }).defaultPrevented).toBe(false)
        expect(press(stop, "Tab").defaultPrevented).toBe(false)
    })

    it("ROI: arrows translate, Alt+Arrow grows that side, Alt+Shift+Arrow shrinks it, one bond write per release", () => {
        const { shadow, inputs } = setup(roiManifest())
        const stop = stopOf(shadow, "roi")
        const rect = shadow.querySelector("rect.masque-hi") as SVGRectElement
        stop.focus()
        press(stop, "ArrowRight")
        press(stop, "ArrowRight", { repeat: true })
        expect(rect.getAttribute("x")).toBe("204")
        expect(rect.getAttribute("width")).toBe("400")
        release(stop, "ArrowRight")
        expect(inputs).toHaveLength(1)
        press(stop, "ArrowLeft", { altKey: true })
        expect(rect.getAttribute("x")).toBe("202")
        expect(rect.getAttribute("width")).toBe("402")
        press(stop, "ArrowDown", { altKey: true })
        expect(rect.getAttribute("height")).toBe("402")
        press(stop, "ArrowDown", { altKey: true, shiftKey: true })
        expect(rect.getAttribute("height")).toBe("400")
        press(stop, "PageDown")
        expect(rect.getAttribute("y")).toBe("220")
        release(stop, "PageDown")
        expect(inputs).toHaveLength(2)
        expect((inputs[1] as { payload: { xmin: number } }).payload.xmin).toBeCloseTo(202 / 120)
    })

    it("ROI: translation clamps at the viewport edge and shrinking never flips the box", () => {
        const { shadow } = setup(roiManifest())
        const stop = stopOf(shadow, "roi")
        const rect = shadow.querySelector("rect.masque-hi") as SVGRectElement
        stop.focus()
        for (let i = 0; i < 30; i++) press(stop, "PageUp")
        expect(rect.getAttribute("y")).toBe("0")
        for (let i = 0; i < 30; i++) press(stop, "PageUp", { altKey: true, shiftKey: true })
        // Shrinking the north side moves it down and stops one CSS px short of the south side.
        expect(rect.getAttribute("height")).toBe("2")
        expect(rect.getAttribute("y")).toBe("398")
    })

    it("ROI with selects: the selection follows while the key is down, the bond waits for keyup", () => {
        const { shadow, inputs } = setup(roiManifest(true))
        const stop = stopOf(shadow, "roi")
        stop.focus()
        // Box [200,600]×[200,600] holds the point at x=250. 30 CSS px right (60 image px)
        // leaves it.
        for (let i = 0; i < 3; i++) press(stop, "ArrowRight", { repeat: i > 0 })
        expect(shadow.querySelector(".masque-tip")?.textContent).toBe("1 selected")
        for (let i = 0; i < 30; i++) press(stop, "ArrowRight", { repeat: true })
        expect(shadow.querySelector(".masque-tip")?.textContent).toBe("0 selected")
        expect(inputs).toHaveLength(0)
        release(stop, "ArrowRight")
        expect(inputs).toEqual([{ items: [] }])
    })

    it("view pan: arrows request a preview frame, keyup settles once, the bond is never written", async () => {
        const requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({ png: new Uint8Array([1, 2, 3]) }))
        const { shadow, inputs } = setup(viewManifest("pan"), requestFrame)
        const stop = stopOf(shadow, "view")
        stop.focus()
        press(stop, "ArrowRight")
        await new Promise((r) => setTimeout(r, 0))
        const first = requestFrame.mock.calls[0][0]
        // 10% of the viewport: the window shows x in [1, 11].
        expect(first).toMatchObject({ id: "view", settle: false })
        expect(first.xmin as number).toBeCloseTo(1)
        expect(first.xmax as number).toBeCloseTo(11)
        release(stop, "ArrowRight")
        await new Promise((r) => setTimeout(r, 10))
        const last = requestFrame.mock.calls[requestFrame.mock.calls.length - 1][0]
        expect(last).toMatchObject({ id: "view", settle: true })
        expect(inputs).toHaveLength(0)
    })

    it("view pan: + zooms in around the viewport centre, Ctrl/Cmd + does nothing", async () => {
        const requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({ png: new Uint8Array([1, 2, 3]) }))
        const { shadow } = setup(viewManifest("pan"), requestFrame)
        const stop = stopOf(shadow, "view")
        stop.focus()
        const e = press(stop, "+")
        expect(e.defaultPrevented).toBe(true)
        await new Promise((r) => setTimeout(r, 0))
        const first = requestFrame.mock.calls[0][0]
        expect((first.xmin as number) + (first.xmax as number)).toBeCloseTo(10)
        expect((first.xmax as number) - (first.xmin as number)).toBeLessThan(10)
    })

    it("view orbit: arrows rotate by 10% of the viewport through orbitAngles; + is consumed but sends nothing", async () => {
        const requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({ png: new Uint8Array([1, 2, 3]) }))
        const { shadow, inputs } = setup(viewManifest("orbit"), requestFrame)
        const stop = stopOf(shadow, "view")
        stop.focus()
        expect(press(stop, "+").defaultPrevented).toBe(true)
        await new Promise((r) => setTimeout(r, 0))
        expect(requestFrame).not.toHaveBeenCalled()
        press(stop, "ArrowRight")
        await new Promise((r) => setTimeout(r, 0))
        // 120 image px at π/1200 per px.
        expect(requestFrame.mock.calls[0][0].azimuth as number).toBeCloseTo(-Math.PI / 10)
        release(stop, "ArrowRight")
        await new Promise((r) => setTimeout(r, 10))
        expect(requestFrame.mock.calls[requestFrame.mock.calls.length - 1][0]).toMatchObject({ settle: true })
        // A second press starts from the camera the first one asked for, even though no frame
        // carrying it has replaced the geometry.
        press(stop, "ArrowRight")
        await new Promise((r) => setTimeout(r, 0))
        expect(requestFrame.mock.calls[requestFrame.mock.calls.length - 1][0].azimuth as number).toBeCloseTo(-Math.PI / 5)
        expect(inputs).toHaveLength(0)
    })

    it("cleanup removes the stops' listeners", () => {
        const host = document.createElement("div")
        const img = document.createElement("img")
        const script = document.createElement("script")
        host.append(img, script)
        document.body.append(host)
        const m = mount(script, thresholdManifest("h"))
        const shadow = (host.lastElementChild as HTMLElement).shadowRoot!
        const stop = stopOf(shadow, "thr")
        m.cleanup()
        expect(press(stop, "ArrowUp").defaultPrevented).toBe(false)
    })
})
