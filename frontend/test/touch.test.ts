// @vitest-environment happy-dom
// A tap shows the mark's tooltip and keeps it up; a held finger scrubs (#529).
import { afterEach, describe, it, expect, vi } from "vitest"
import { mount as mountOverlay } from "../src/overlay"
import { withFields } from "./fields"
import { HOLD_MS } from "../src/touch"
import type { Manifest } from "../src/types"

const cleanups: Array<() => void> = []
afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
    vi.useRealTimers()
    document.body.innerHTML = ""
})

const manifest: Manifest = {
    width: 1200, height: 800, scaling: 2, transforms: {},
    layers: [{ id: "pts", kind: "circles", geometry: [600, 400, 20], payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"] }],
}

function setup(m: Manifest = manifest) {
    const host = document.createElement("div")
    const img = document.createElement("img")
    Object.defineProperty(img, "naturalWidth", { value: 1200 })
    img.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
    const script = document.createElement("script")
    host.append(img, script)
    document.body.append(host)
    cleanups.push(mountOverlay(script, withFields(m)).cleanup)
    const shadow = (host.lastElementChild as HTMLElement).shadowRoot!
    const surface = shadow.querySelector(".surface") as HTMLElement
    const tip = shadow.querySelector(".masque-tip") as HTMLElement
    return { host, surface, tip }
}

const ev = (type: string, x: number, y: number, pointerType: string) =>
    new PointerEvent(type, { clientX: x, clientY: y, pointerType, pointerId: 7, button: 0, bubbles: true })

// What a browser sends for a tap: down, up, leave, then click.
function tap(surface: HTMLElement, x: number, y: number, pointerType = "touch") {
    surface.dispatchEvent(ev("pointerdown", x, y, pointerType))
    surface.dispatchEvent(ev("pointerup", x, y, pointerType))
    surface.dispatchEvent(ev("pointerleave", x, y, pointerType))
    surface.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: y, bubbles: true }))
}

describe("touch tap", () => {
    it("selects the mark and keeps its tooltip up after the finger lifts", () => {
        const { host, surface, tip } = setup()
        tap(surface, 300, 200)
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.textContent).toContain("0")
        expect((host as unknown as { value: unknown }).value).toEqual({ pts: { layer: "pts", index: 0 } })
    })

    it("a mouse leaving the plot still hides the tooltip", () => {
        const { surface, tip } = setup()
        surface.dispatchEvent(ev("pointermove", 300, 200, "mouse"))
        expect(tip.classList.contains("show")).toBe(true)
        surface.dispatchEvent(ev("pointerleave", 300, 200, "mouse"))
        expect(tip.classList.contains("show")).toBe(false)
    })

    it("a mouse click shows no tooltip after the pointer leaves", () => {
        const { surface, tip } = setup()
        tap(surface, 300, 200, "mouse")
        expect(tip.classList.contains("show")).toBe(false)
    })

    it("a tap on empty space takes the tooltip down", () => {
        const { surface, tip } = setup()
        tap(surface, 300, 200)
        tap(surface, 20, 20)
        expect(tip.classList.contains("show")).toBe(false)
    })

    it("Escape takes the tooltip down", () => {
        const { surface, tip } = setup()
        tap(surface, 300, 200)
        surface.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        expect(tip.classList.contains("show")).toBe(false)
    })

    it("a scroll that moves the plot takes the tooltip down; one that doesn't keeps it", () => {
        const { surface, tip } = setup()
        let top = 0
        surface.getBoundingClientRect = () =>
            ({ left: 0, top, width: 600, height: 400, right: 600, bottom: top + 400, x: 0, y: top, toJSON() {} }) as DOMRect
        tap(surface, 300, 200)
        window.dispatchEvent(new Event("scroll"))
        expect(tip.classList.contains("show")).toBe(true)
        top = -40
        window.dispatchEvent(new Event("scroll"))
        expect(tip.classList.contains("show")).toBe(false)
    })

    it("a mouse moving off a mark after a tap takes the tooltip down", () => {
        const { surface, tip } = setup()
        tap(surface, 300, 200)
        surface.dispatchEvent(ev("pointermove", 20, 20, "mouse"))
        expect(tip.classList.contains("show")).toBe(false)
    })
})

describe("touch hold", () => {
    const touchmove = (surface: HTMLElement) => {
        const e = new Event("touchmove", { bubbles: true, cancelable: true })
        surface.dispatchEvent(e)
        return e.defaultPrevented
    }

    it("a held finger stops the page scroll for the rest of the touch", () => {
        vi.useFakeTimers()
        const { surface, tip } = setup()
        surface.dispatchEvent(ev("pointerdown", 300, 200, "touch"))
        expect(touchmove(surface)).toBe(false) // before the hold: the page may scroll
        vi.advanceTimersByTime(HOLD_MS)
        expect(tip.classList.contains("show")).toBe(true)
        expect(touchmove(surface)).toBe(true)
        surface.dispatchEvent(ev("pointerup", 300, 200, "touch"))
        expect(touchmove(surface)).toBe(false)
        expect(tip.classList.contains("show")).toBe(true)
    })

    it("a finger that moves before the hold is a scroll, not a scrub", () => {
        vi.useFakeTimers()
        const { surface } = setup()
        surface.dispatchEvent(ev("pointerdown", 300, 200, "touch"))
        surface.dispatchEvent(ev("pointermove", 300, 230, "touch"))
        vi.advanceTimersByTime(HOLD_MS)
        expect(touchmove(surface)).toBe(false)
    })

    it("the long-press menu is ours during a hold", () => {
        vi.useFakeTimers()
        const { surface } = setup()
        surface.dispatchEvent(ev("pointerdown", 300, 200, "touch"))
        const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
        surface.dispatchEvent(menu)
        expect(menu.defaultPrevented).toBe(true)
    })
})
