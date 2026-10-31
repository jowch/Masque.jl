// @vitest-environment happy-dom
// Edges and limits: a mark exactly on a box's edge, a pointer exactly at the hit tolerance, a
// box dragged past the plot area, a key chord on the other platform. Each test here pins one
// comparison (`<=` against `<`, a clamp, a platform check) that the rest of the suite let
// change without failing.
import { afterEach, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { mount as mountOverlay } from "../src/overlay"
import { hitLayer, occludedAt, SEG_TOL } from "../src/geometry"
import { computeSelection } from "../src/selection"
import { historyKey } from "../src/history"
import { isLightBackground } from "../src/color"
import { withFields } from "./fields"
import type { AxisTransform, HitLayer, Manifest } from "../src/types"

const cleanups: Array<() => void> = []
afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
})

const tf: AxisTransform = {
    xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
    viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false,
}

const layer = (kind: HitLayer["kind"], geometry: unknown): HitLayer =>
    ({ id: "L", kind, axis: "ax1", events: ["click", "hover"], payloads: [{}], geometry }) as HitLayer

describe("a box picks the marks on its edges (the same marks as Julia)", () => {
    // Shared with test/core/selection_tests.jl, which runs bond.jl's _contained_indices on it.
    const fx = JSON.parse(readFileSync(join(__dirname, "..", "..", "test", "fixtures", "brush", "edges.json"), "utf8"))

    it("keeps every mark on an edge or a corner and none just outside", () => {
        const { items } = computeSelection(fx.box, layer("circles", fx.circles), tf)
        expect(items.map((it) => it.index)).toEqual(fx.inside)
    })
})

describe("a line or a threshold is hit at exactly its tolerance", () => {
    // A horizontal segment from (0, 100) to (200, 100); the pointer sits straight above its middle.
    it("segments", () => {
        const L = layer("segments", [0, 100, 200, 100])
        expect(hitLayer(L, 100, 100 - SEG_TOL)).not.toBeNull()
        expect(hitLayer(L, 100, 100 - SEG_TOL - 0.01)).toBeNull()
    })

    it("polyline", () => {
        const L = layer("polyline", [0, 100, 100, 100, 200, 100])
        expect(hitLayer(L, 50, 100 + SEG_TOL)).not.toBeNull()
        expect(hitLayer(L, 50, 100 + SEG_TOL + 0.01)).toBeNull()
    })

    it("lines", () => {
        const L = layer("lines", [[0, 100, 100, 100, 200, 100]])
        expect(hitLayer(L, 150, 100 - SEG_TOL)).not.toBeNull()
        expect(hitLayer(L, 150, 100 - SEG_TOL - 0.01)).toBeNull()
    })

    it("a layer's own tolerance", () => {
        const L = { ...layer("segments", [0, 100, 200, 100]), tol: 3 }
        expect(hitLayer(L, 100, 103)).not.toBeNull()
        expect(hitLayer(L, 100, 103.01)).toBeNull()
    })

    it("threshold", () => {
        const L = layer("threshold", { orientation: "h", pos: 100, span: [0, 200] })
        expect(hitLayer(L, 100, 100 + SEG_TOL)).not.toBeNull()
        expect(hitLayer(L, 100, 100 + SEG_TOL + 0.01)).toBeNull()
    })
})

describe("a legend over the plot hides the marks on its border too", () => {
    const L = layer("circles", [50, 50, 10])
    const m = { width: 1200, height: 800, scaling: 2, transforms: { ax1: tf }, layers: [L], occluders: [[100, 100, 200, 100]] } as Manifest

    it("counts the left, right, top and bottom edges as covered", () => {
        for (const [x, y] of [[100, 150], [300, 150], [200, 100], [200, 200], [300, 200]]) {
            expect(occludedAt(m, L, x, y)).toBe(true)
        }
    })

    it("leaves a point just outside uncovered", () => {
        for (const [x, y] of [[99.9, 150], [300.1, 150], [200, 99.9], [200, 200.1]]) {
            expect(occludedAt(m, L, x, y)).toBe(false)
        }
    })
})

describe("an ROI box moved past the plot area stops at its edge", () => {
    // The box sits at image (200, 200) to (600, 600) in a 1200 × 800 viewport; the img is drawn at
    // half size, so client px are image px / 2.
    const roiManifest = (): Manifest => ({
        width: 1200, height: 800, scaling: 2, transforms: { ax1: { ...tf } },
        layers: [{ id: "roi", kind: "roi", axis: "ax1", events: ["drag"], payloads: [],
            geometry: { x: 200, y: 200, w: 400, h: 400, handle: 16 } } as HitLayer],
    })
    const mounted = () => {
        const host = document.createElement("div")
        const img = document.createElement("img")
        Object.defineProperty(img, "naturalWidth", { value: 1200 })
        img.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
        const script = document.createElement("script")
        host.append(img, script)
        document.body.append(host)
        const m = mountOverlay(script, withFields(roiManifest()))
        cleanups.push(() => { m.cleanup(); host.remove() })
        const shadow = (host.lastElementChild as HTMLElement).shadowRoot!
        let committed: { xmin: number; xmax: number; ymin: number; ymax: number } | null = null
        host.addEventListener("input", () => {
            committed = (host as unknown as { value: { roi: { payload: typeof committed } } }).value.roi.payload
        })
        return {
            surface: shadow.querySelector(".surface") as HTMLElement,
            box: shadow.querySelector("rect") as SVGRectElement,
            committed: () => committed,
        }
    }
    const drag = (surface: HTMLElement, from: [number, number], to: [number, number]) => {
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: from[0], clientY: from[1], bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: to[0], clientY: to[1], bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: to[0], clientY: to[1], bubbles: true }))
    }

    it("to the left and top", () => {
        const { surface, box, committed } = mounted()
        drag(surface, [200, 200], [-500, -500])
        expect([box.getAttribute("x"), box.getAttribute("y")]).toEqual(["0", "0"])
        // 400 image px of a 1200 px, 0..10 x axis; 400 of an 800 px, 0..100 y axis, y up.
        expect(committed()!.xmin).toBeCloseTo(0)
        expect(committed()!.xmax).toBeCloseTo(10 * 400 / 1200)
        expect(committed()!.ymax).toBeCloseTo(100)
    })

    it("to the right and bottom", () => {
        const { surface, box, committed } = mounted()
        drag(surface, [200, 200], [2000, 2000])
        expect([box.getAttribute("x"), box.getAttribute("y")]).toEqual(["800", "400"])
        expect(committed()!.xmax).toBeCloseTo(10)
        expect(committed()!.ymin).toBeCloseTo(0)
    })
})

describe("undo and redo chords follow the platform", () => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    const onPlatform = (platform: string, fn: () => void) => {
        const had = Object.getOwnPropertyDescriptor(nav, "userAgentData")
        Object.defineProperty(navigator, "userAgentData", { configurable: true, value: { platform } })
        try { fn() } finally {
            if (had) Object.defineProperty(navigator, "userAgentData", had)
            else delete (nav as { userAgentData?: unknown }).userAgentData
        }
    }
    const chord = (key: string, mod: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }) =>
        historyKey({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mod })

    it("on macOS: Cmd+Z undoes, Cmd+Shift+Z redoes, Cmd+Y and Ctrl+Z do nothing", () => {
        onPlatform("macOS", () => {
            expect(chord("z", { metaKey: true })).toBe("undo")
            expect(chord("Z", { metaKey: true, shiftKey: true })).toBe("redo")
            expect(chord("y", { metaKey: true })).toBeNull()
            expect(chord("z", { ctrlKey: true })).toBeNull()
        })
    })

    it("elsewhere: Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo, Cmd+Z does nothing", () => {
        onPlatform("Windows", () => {
            expect(chord("z", { ctrlKey: true })).toBe("undo")
            expect(chord("y", { ctrlKey: true })).toBe("redo")
            expect(chord("Z", { ctrlKey: true, shiftKey: true })).toBe("redo")
            expect(chord("z", { metaKey: true })).toBeNull()
        })
    })
})

describe("light or dark chrome near the pivot", () => {
    // Masque pivots at lch lightness 49.44 (middle grey). These two blues sit either side of it,
    // and their red and green channels fall in sRGB's curved range, above the 0.03928 knee.
    it("rgb(100, 100, 255) is light (L* ≈ 50.7)", () => {
        expect(isLightBackground("rgb(100, 100, 255)")).toBe(true)
    })

    it("rgb(90, 90, 255) is dark (L* ≈ 48.0)", () => {
        expect(isLightBackground("rgb(90, 90, 255)")).toBe(false)
    })
})
