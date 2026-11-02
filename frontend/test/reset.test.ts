// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest"
import { mount } from "../src/overlay"
import type { Manifest } from "../src/types"
import { withFields } from "./fields"

// Reset a moved view (#524): a double-click on empty plot area, or `0` on the view's stop,
// sends one settle request `{ id, reset: true }`. Julia holds where the view started.

const ax1 = {
    xlims: [0, 10] as [number, number], ylims: [0, 100] as [number, number], xscale: "identity", yscale: "identity",
    viewport: [0, 0, 1200, 800] as [number, number, number, number], xreversed: false, yreversed: false,
}

const manifestOf = (opts: { moved?: boolean; mode?: "pan" | "orbit" } = {}): Manifest => {
    const mode = opts.mode ?? "pan"
    const geometry: Record<string, unknown> = mode === "pan"
        ? { x: 0, y: 0, w: 1200, h: 800, mode }
        : { x: 0, y: 0, w: 1200, h: 800, mode, azimuth: 0, elevation: 0, limits: [0, 1, 0, 1, 0, 1], panx: [0.001, 0, 0], pany: [0, 0, -0.001] }
    if (opts.moved) geometry.moved = true
    return {
        width: 1200, height: 800, scaling: 2, transforms: { ax1 },
        layers: [
            // A mark at image (100, 100), CSS (50, 50).
            { id: "pts", kind: "circles", geometry: [100, 100, 10], payloads: [{ v: 1 }], axis: "ax1", events: ["click", "hover"] },
            { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [], geometry: geometry as never },
        ],
    }
}

// A WebGL-style canvas, so a frame lands without waiting on an image load.
// Julia's frames: away from home after a pan, zoom or orbit, at home after a reset.
const julia = (mode: "pan" | "orbit" = "pan") => (input: Record<string, unknown>) => manifestOf({ mode, moved: input.reset !== true })

function setup(manifest: Manifest, frame: (input: Record<string, unknown>) => Manifest = julia()) {
    const host = document.createElement("div")
    const canvas = document.createElement("canvas") as HTMLCanvasElement & {
        masqueReplaceScene?: (scene: unknown, px?: number, w?: number, h?: number) => void
    }
    canvas.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
    canvas.masqueReplaceScene = vi.fn()
    const script = document.createElement("script")
    host.append(canvas, script)
    document.body.append(host)
    const requestFrame = vi.fn(async (input: Record<string, unknown>) => ({ scene: {}, pxPerUnit: 1, width: 600, height: 400, manifest: frame(input) }))
    mount(script, withFields(manifest), undefined, requestFrame as never)
    const shadow = (host.lastElementChild as HTMLElement).shadowRoot!
    const surface = shadow.querySelector(".surface") as HTMLElement
    const stop = shadow.querySelector(`.drag-stop[data-layer="view"]`) as HTMLElement
    const inputs: unknown[] = []
    host.addEventListener("input", () => inputs.push((host as unknown as { value: unknown }).value))
    return { host, surface, stop, requestFrame, inputs }
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms))
const press = (el: HTMLElement, key: string, opts: KeyboardEventInit = {}): KeyboardEvent => {
    const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts })
    el.dispatchEvent(e)
    return e
}
const release = (el: HTMLElement, key: string) => el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }))
const click = (el: HTMLElement, x: number, y: number, type = "click", opts: MouseEventInit = {}): MouseEvent => {
    const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, ...opts })
    el.dispatchEvent(e)
    return e
}
const doubleClick = (el: HTMLElement, x: number, y: number, opts: MouseEventInit = {}): MouseEvent => {
    click(el, x, y, "click", opts)
    click(el, x, y, "click", opts)
    return click(el, x, y, "dblclick", opts)
}
const last = <T>(xs: T[]): T | undefined => xs[xs.length - 1]
const resets = (rf: ReturnType<typeof vi.fn>) => rf.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((i) => i.reset === true)

describe("reset a moved view (#524)", () => {
    it("0 sends nothing while the view is where it started, and resets once it has moved", async () => {
        const { stop, requestFrame, inputs } = setup(manifestOf())
        stop.focus()
        expect(press(stop, "0").defaultPrevented).toBe(true)
        await tick()
        expect(requestFrame).not.toHaveBeenCalled()
        press(stop, "ArrowRight")
        release(stop, "ArrowRight")
        await tick()
        press(stop, "0")
        await tick()
        expect(resets(requestFrame)).toEqual([{ id: "view", reset: true, settle: true }])
        // The reset's frame is at home, so a second 0 has nothing to undo.
        press(stop, "0")
        await tick()
        expect(resets(requestFrame)).toHaveLength(1)
        expect(inputs).toHaveLength(0)
    })

    it("a view mounted away from home (the masque cell re-ran after a pan) resets at once", async () => {
        const { stop, requestFrame, host } = setup(manifestOf({ moved: true }))
        stop.focus()
        press(stop, "0")
        await tick()
        expect(resets(requestFrame)).toHaveLength(1)
        const stamp = JSON.parse((host as HTMLElement & { dataset: DOMStringMap }).dataset.masqueGestureFrame!)
        expect(stamp).toMatchObject({ reset: true, settle: true, xmin: 0, xmax: 10 })
    })

    it("0 while an arrow is held drops that arrow's settle, so it cannot undo the reset", async () => {
        const { stop, requestFrame } = setup(manifestOf())
        stop.focus()
        press(stop, "ArrowRight")
        await tick()
        press(stop, "0")
        release(stop, "ArrowRight")
        await tick()
        const calls = requestFrame.mock.calls.map((c) => c[0] as Record<string, unknown>)
        expect(last(calls)).toMatchObject({ reset: true })
        expect(calls.filter((i) => i.settle === true && i.reset !== true)).toHaveLength(0)
    })

    it("an Axis3 view resets with 0 too", async () => {
        const { stop, requestFrame } = setup(manifestOf({ mode: "orbit", moved: true }), julia("orbit"))
        stop.focus()
        press(stop, "0")
        await tick()
        expect(resets(requestFrame)).toEqual([{ id: "view", reset: true, settle: true }])
    })

    it("a double-click on empty plot area resets; on a mark it does not", async () => {
        const { surface, requestFrame } = setup(manifestOf({ moved: true }))
        doubleClick(surface, 50, 50)
        await tick()
        expect(resets(requestFrame)).toHaveLength(0)
        const e = doubleClick(surface, 300, 300)
        expect(e.defaultPrevented).toBe(true)
        await tick()
        expect(resets(requestFrame)).toHaveLength(1)
    })

    it("an axis readout on the same axis, or a hover-only mark, does not stop the reset; a mark still does", async () => {
        const m = manifestOf({ moved: true })
        // The readout covers the whole viewport for click and hover, after the marks.
        m.layers.splice(1, 0,
            { id: "tip", kind: "circles", geometry: [400, 400, 10], payloads: [{ v: 2 }], axis: "ax1", events: ["hover"] },
            { id: "readout", kind: "axis", axis: "ax1", events: ["click", "hover"], payloads: [], geometry: null as never })
        const { surface, requestFrame } = setup(m)
        doubleClick(surface, 50, 50) // the clickable mark
        await tick()
        expect(resets(requestFrame)).toHaveLength(0)
        doubleClick(surface, 200, 200) // the hover-only mark
        await tick()
        expect(resets(requestFrame)).toHaveLength(1)
    })

    it("an axis readout's empty space resets", async () => {
        const m = manifestOf({ moved: true })
        m.layers.splice(1, 0, { id: "readout", kind: "axis", axis: "ax1", events: ["click", "hover"], payloads: [], geometry: null as never })
        const { surface, requestFrame } = setup(m)
        doubleClick(surface, 300, 300)
        await tick()
        expect(resets(requestFrame)).toHaveLength(1)
    })

    it("a Cmd/Ctrl double-click does not reset", async () => {
        const { surface, requestFrame } = setup(manifestOf({ moved: true }))
        const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true }
        doubleClick(surface, 300, 300, mod)
        await tick()
        expect(resets(requestFrame)).toHaveLength(0)
    })

    it("two quick pan strokes are not a double-click reset", async () => {
        const { surface, requestFrame } = setup(manifestOf())
        for (let k = 0; k < 2; k++) {
            surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 300, button: 0, bubbles: true, pointerId: 1 }))
            surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 340, clientY: 300, bubbles: true, pointerId: 1 }))
            await tick(20)
            surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 340, clientY: 300, button: 0, bubbles: true, pointerId: 1 }))
            click(surface, 340, 300)
        }
        click(surface, 340, 300, "dblclick")
        await tick()
        expect(requestFrame).toHaveBeenCalled()
        expect(resets(requestFrame)).toHaveLength(0)
    })

    it("a reset takes over a wheel zoom still waiting for its idle settle", async () => {
        const { surface, requestFrame } = setup(manifestOf())
        // happy-dom's WheelEvent drops clientX/clientY, so set them on the instance.
        const we = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true })
        Object.defineProperties(we, { clientX: { value: 300 }, clientY: { value: 300 } })
        surface.dispatchEvent(we)
        await tick()
        doubleClick(surface, 300, 300)
        await tick(400)
        const calls = requestFrame.mock.calls.map((c) => c[0] as Record<string, unknown>)
        expect(last(calls)).toMatchObject({ reset: true })
        expect(calls.filter((i) => i.settle === true && i.reset !== true)).toHaveLength(0)
    })
})
