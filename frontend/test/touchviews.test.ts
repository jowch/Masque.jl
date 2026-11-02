// @vitest-environment happy-dom
// A finger scrolls the page past a view and two fingers move it (#537); a finger on a threshold
// line or an ROI grip takes it with a finger-sized grab area and holds the page still (#530).
import { afterEach, describe, it, expect, vi } from "vitest"
import { mount } from "../src/overlay"
import { TWO_FINGER_HINT } from "../src/touchviews"
import type { HitLayer, Manifest } from "../src/types"
import { withFields } from "./fields"

const cleanups: Array<() => void> = []
afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
    vi.useRealTimers()
    document.body.innerHTML = ""
})

// A 1200 x 800 image shown at 600 x 400: one CSS px is two image px.
function setup(m: Manifest, requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({ png: new Uint8Array([1]) }))) {
    const host = document.createElement("div")
    const img = document.createElement("img")
    Object.defineProperty(img, "naturalWidth", { value: 1200 })
    img.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
    const script = document.createElement("script")
    host.append(img, script)
    document.body.append(host)
    cleanups.push(mount(script, withFields(m), undefined, requestFrame).cleanup)
    const shadow = (host.lastElementChild as HTMLElement).shadowRoot!
    return {
        host, requestFrame,
        surface: shadow.querySelector(".surface") as HTMLElement,
        note: shadow.querySelector(".masque-note") as HTMLElement,
        readout: shadow.querySelector(".masque-readout") as HTMLElement | null,
    }
}

const ax = { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity", viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false }

const viewManifest = (mode: "pan" | "orbit", extra: Partial<Manifest> = {}): Manifest => ({
    width: 1200, height: 800, scaling: 2,
    transforms: { ax1: { ...ax } } as Manifest["transforms"],
    layers: [{
        id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
        geometry: mode === "pan" ? { x: 0, y: 0, w: 1200, h: 800, mode } :
            { x: 0, y: 0, w: 1200, h: 800, mode, azimuth: 0.4, elevation: 0.5, limits: [0, 10, 0, 10, 0, 10] },
    } as unknown as HitLayer],
    ...extra,
})

const touchEvent = (surface: HTMLElement, type: string, pts: [number, number][]) => {
    const ev = new Event(type, { bubbles: true, cancelable: true })
    const list = pts.map(([x, y], i) => ({ clientX: x, clientY: y, identifier: i }))
    Object.defineProperty(ev, "touches", { value: type === "touchend" || type === "touchcancel" ? list : list })
    Object.defineProperty(ev, "changedTouches", { value: list })
    surface.dispatchEvent(ev)
    return ev
}
const pointer = (surface: HTMLElement, type: string, x: number, y: number, pointerId = 1, pointerType = "touch") => {
    const ev = new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType, pointerId, button: 0 })
    surface.dispatchEvent(ev)
    return ev
}
const photoOf = (host: HTMLElement) => {
    const p = (host.dataset.masquePhoto ?? "").split(",").map(Number)
    return { s: p[0], tx: p[1], ty: p[2] }
}

describe("touch on a view (#537)", () => {
    it("lets a finger scroll the page but not pinch it", () => {
        const { surface } = setup(viewManifest("pan"))
        expect(surface.style.touchAction).toBe("pan-x pan-y")
    })

    it("one finger scrolls the page past a view and shows the two-finger hint", async () => {
        vi.useFakeTimers()
        const { host, surface, note, requestFrame } = setup(viewManifest("pan"))
        pointer(surface, "pointerdown", 300, 200)
        expect(touchEvent(surface, "touchstart", [[300, 200]]).defaultPrevented).toBe(false)
        pointer(surface, "pointermove", 300, 160)
        expect(touchEvent(surface, "touchmove", [[300, 160]]).defaultPrevented).toBe(false)
        expect(note.textContent).toBe(TWO_FINGER_HINT)
        expect(note.classList.contains("show")).toBe(true)
        pointer(surface, "pointerup", 300, 160)
        touchEvent(surface, "touchend", [])
        await vi.advanceTimersByTimeAsync(500)
        expect(host.dataset.masquePhoto ?? "").toBe("")
        expect(requestFrame).not.toHaveBeenCalled()
    })

    it("a tap on a view still clicks", () => {
        const m = viewManifest("pan")
        m.layers.unshift({ id: "pts", kind: "circles", geometry: [600, 400, 20], payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"] })
        const { host, surface } = setup(m)
        pointer(surface, "pointerdown", 300, 200)
        touchEvent(surface, "touchstart", [[300, 200]])
        pointer(surface, "pointerup", 300, 200)
        touchEvent(surface, "touchend", [])
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 200, bubbles: true }))
        expect((host as unknown as { value: Record<string, unknown> }).value.pts).toEqual({ layer: "pts", index: 0 })
    })

    it("two fingers pan and pinch-zoom the photograph about their midpoint, and lifting settles", async () => {
        vi.useFakeTimers()
        const { host, surface, readout, requestFrame } = setup(viewManifest("pan"))
        pointer(surface, "pointerdown", 200, 200, 1)
        touchEvent(surface, "touchstart", [[200, 200]])
        pointer(surface, "pointerdown", 300, 200, 2)
        expect(touchEvent(surface, "touchstart", [[200, 200], [300, 200]]).defaultPrevented).toBe(true)
        // Midpoint (250, 200) → layout (500, 400). Spread 100 → 200: twice as close, and the
        // midpoint moves 20 CSS px right.
        expect(touchEvent(surface, "touchmove", [[170, 200], [370, 200]]).defaultPrevented).toBe(true)
        const p = photoOf(host)
        expect(p.s).toBeCloseTo(2)
        // The content point under the old midpoint (500, 400) is now under the new one (540, 400).
        expect(p.s * 500 + p.tx).toBeCloseTo(540)
        expect(p.s * 400 + p.ty).toBeCloseTo(400)
        expect(readout?.classList.contains("show")).toBe(true)
        expect(readout?.textContent).toMatch(/^x:\[/)
        await vi.advanceTimersByTimeAsync(0)
        expect(requestFrame).toHaveBeenCalled()
        expect(requestFrame.mock.calls.at(-1)![0]).toMatchObject({ id: "view", settle: false })
        // One finger lifts: the gesture ends and settles; the other finger doesn't pan.
        touchEvent(surface, "touchend", [[370, 200]])
        pointer(surface, "pointerup", 170, 200, 1)
        await vi.advanceTimersByTimeAsync(500)
        expect(requestFrame.mock.calls.some((c) => (c[0] as Record<string, unknown>).settle === true)).toBe(true)
        expect(readout?.classList.contains("show")).toBe(false)
        const s = photoOf(host).s
        pointer(surface, "pointermove", 400, 300, 2)
        touchEvent(surface, "touchmove", [[400, 300]])
        expect(photoOf(host).s).toBe(s)
    })

    it("two fingers lifting are no tap: nothing is picked", () => {
        const m = viewManifest("pan")
        m.layers.unshift({ id: "pts", kind: "circles", geometry: [600, 400, 20], payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"] })
        const { host, surface } = setup(m)
        pointer(surface, "pointerdown", 300, 200, 1)
        touchEvent(surface, "touchstart", [[300, 200]])
        pointer(surface, "pointerdown", 320, 200, 2)
        touchEvent(surface, "touchstart", [[300, 200], [320, 200]])
        touchEvent(surface, "touchmove", [[290, 200], [330, 200]])
        touchEvent(surface, "touchend", [[330, 200]])
        touchEvent(surface, "touchend", [])
        pointer(surface, "pointerup", 290, 200, 1)
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 200, bubbles: true }))
        expect((host as unknown as { value?: Record<string, unknown> }).value?.pts ?? null).toBeNull()
    })

    it("Axis3: two fingers orbit, a pinch zooms the limits, and lifting settles both", async () => {
        vi.useFakeTimers()
        const { surface, requestFrame } = setup(viewManifest("orbit"))
        touchEvent(surface, "touchstart", [[200, 200]])
        expect(touchEvent(surface, "touchstart", [[200, 200], [300, 200]]).defaultPrevented).toBe(true)
        touchEvent(surface, "touchmove", [[175, 220], [375, 220]])
        await vi.advanceTimersByTimeAsync(0)
        const last = requestFrame.mock.calls.at(-1)![0] as Record<string, unknown>
        expect(last.id).toBe("view")
        expect(typeof last.azimuth).toBe("number")
        expect(last.azimuth).not.toBeCloseTo(0.4)
        const lim = last.limits as number[]
        // Twice as close about the center.
        expect(lim[1] - lim[0]).toBeCloseTo(5)
        touchEvent(surface, "touchend", [])
        await vi.advanceTimersByTimeAsync(500)
        const settled = requestFrame.mock.calls.map((c) => c[0] as Record<string, unknown>).find((c) => c.settle === true)
        expect(settled).toMatchObject({ id: "view", settle: true })
        expect((settled!.limits as number[])[1] - (settled!.limits as number[])[0]).toBeCloseTo(5)
    })

    it("touch = (; views = :onefinger) keeps 0.4's one-finger pan", async () => {
        vi.useFakeTimers()
        const { host, surface, note } = setup(viewManifest("pan", { touchViews: "onefinger" }))
        expect(surface.style.touchAction).toBe("none")
        pointer(surface, "pointerdown", 300, 200)
        expect(touchEvent(surface, "touchstart", [[300, 200]]).defaultPrevented).toBe(false)
        pointer(surface, "pointermove", 340, 200)
        await vi.advanceTimersByTimeAsync(50)
        expect(photoOf(host).tx).toBeCloseTo(80)
        expect(note.textContent).not.toBe(TWO_FINGER_HINT)
    })
})

describe("touch on a handle (#530)", () => {
    const threshold = (): Manifest => ({
        width: 1200, height: 800, scaling: 2,
        transforms: { ax1: { ...ax } } as Manifest["transforms"],
        layers: [{ id: "thr", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [],
            geometry: { orientation: "v", pos: 600, span: [0, 800] } } as unknown as HitLayer],
    })
    const roi = (): Manifest => ({
        width: 1200, height: 800, scaling: 2,
        transforms: { ax1: { ...ax } } as Manifest["transforms"],
        layers: [{ id: "roi", kind: "roi", axis: "ax1", events: ["drag"], payloads: [],
            geometry: { x: 200, y: 200, w: 400, h: 400, handle: 16 } } as unknown as HitLayer],
    })

    it("a finger takes a threshold line within the touch radius, and the page holds still", () => {
        const { surface } = setup(threshold())
        // Line at client x 300. 12 CSS px off is past the mouse's reach but within a finger's 16.
        pointer(surface, "pointerdown", 312, 200)
        expect(touchEvent(surface, "touchstart", [[312, 200]]).defaultPrevented).toBe(true)
        expect(surface.classList.contains("grabbing")).toBe(true)
        pointer(surface, "pointerup", 312, 200)
        touchEvent(surface, "touchend", [])
    })

    it("a mouse keeps its own reach on the line", () => {
        const { surface } = setup(threshold())
        pointer(surface, "pointerdown", 312, 200, 1, "mouse")
        expect(surface.classList.contains("grabbing")).toBe(false)
    })

    it("a finger away from the line scrolls the page", () => {
        const { surface } = setup(threshold())
        pointer(surface, "pointerdown", 400, 200)
        expect(touchEvent(surface, "touchstart", [[400, 200]]).defaultPrevented).toBe(false)
        expect(surface.classList.contains("grabbing")).toBe(false)
    })

    it("an ROI grip takes a finger anywhere in a 44 CSS px square around it", () => {
        const { surface } = setup(roi())
        // The top-left corner is client (100, 100); 19 CSS px left is outside the box and past
        // the mouse's 16 CSS px square, inside the finger's 22.
        pointer(surface, "pointerdown", 81, 100, 1, "mouse")
        expect(surface.classList.contains("grabbing")).toBe(false)
        pointer(surface, "pointerup", 81, 100, 1, "mouse")
        pointer(surface, "pointerdown", 81, 100)
        expect(touchEvent(surface, "touchstart", [[81, 100]]).defaultPrevented).toBe(true)
        expect(surface.classList.contains("grabbing")).toBe(true)
    })
})
