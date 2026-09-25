// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from "vitest"
import { mount as mountOverlay } from "../src/overlay"

// Each mount's wheel-settle timer and in-flight frame outlive the test. happy-dom then
// deletes HTMLCanvasElement, and the late frame throws. Cleanup runs before that teardown.
const mountedCleanups: Array<() => void> = []
afterEach(() => {
    while (mountedCleanups.length) mountedCleanups.pop()!()
})
function mount(...args: Parameters<typeof mountOverlay>): ReturnType<typeof mountOverlay> {
    const mounted = mountOverlay(...args)
    mountedCleanups.push(mounted.cleanup)
    return mounted
}
import { mapPoint, unmapPoint } from "../src/photo"
import { clearHi, drawHi, drawSelection } from "../src/highlight"
import { handleCornerRadius, handleDrawHalf } from "../src/drag/roi"
import { createOverlayState, MOTION_MS, type HiGroups } from "../src/state"
import type { GridGeometry, Hit, HitLayer, Manifest } from "../src/types"

// build a light-DOM host (img + script) like the Julia widget emits, with layout mocked
function setup() {
    const host = document.createElement("div")
    const img = document.createElement("img")
    Object.defineProperty(img, "naturalWidth", { value: 1200 })
    img.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
    const script = document.createElement("script")
    host.append(img, script)
    document.body.append(host)
    return { host, img, script }
}

const manifest: Manifest = {
    width: 1200, height: 800, scaling: 2, transforms: {},
    layers: [{ id: "pts", kind: "circles", geometry: [600, 400, 20], payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"] }],
}

const shadowOf = (host: HTMLElement) => (host.lastElementChild as HTMLElement).shadowRoot!

// Three coordinate-identical top-level <svg>s (mount.ts's svg.masque-fill / svg.masque-edge /
// svg.masque-plain), each with its own g.hi/g.sel — a highlight lands in whichever svg(s)
// highlight.ts's makeHiElement routed it to (no explicit style.stroke → a closed shape splits
// into fill+edge, an open/seg shape → edge only, a rectfill → fill only; explicit stroke, the
// selected-open ring, ROI, and threshold always → plain). These helpers combine all three sides
// so "the g.hi/g.sel content" reads the same regardless of which side(s) are live.
const hiGroupEls = (shadow: ShadowRoot): SVGGElement[] => [...shadow.querySelectorAll("g.hi")] as SVGGElement[]
const selGroupEls = (shadow: ShadowRoot): SVGGElement[] => [...shadow.querySelectorAll("g.sel")] as SVGGElement[]
const hiChildren = (shadow: ShadowRoot): SVGElement[] => hiGroupEls(shadow).flatMap((g) => [...g.children]) as SVGElement[]
const selChildren = (shadow: ShadowRoot): SVGElement[] => selGroupEls(shadow).flatMap((g) => [...g.children]) as SVGElement[]
// The specific fill/edge/plain-side group, regardless of content — for tests asserting a
// highlight landed on a particular side (or didn't).
const fillHiGroup = (shadow: ShadowRoot): SVGGElement => hiGroupEls(shadow).find((g) => g.closest("svg")!.classList.contains("masque-fill"))!
const edgeHiGroup = (shadow: ShadowRoot): SVGGElement => hiGroupEls(shadow).find((g) => g.closest("svg")!.classList.contains("masque-edge"))!
const plainHiGroup = (shadow: ShadowRoot): SVGGElement => hiGroupEls(shadow).find((g) => g.closest("svg")!.classList.contains("masque-plain"))!
const fillSelGroup = (shadow: ShadowRoot): SVGGElement => selGroupEls(shadow).find((g) => g.closest("svg")!.classList.contains("masque-fill"))!
const edgeSelGroup = (shadow: ShadowRoot): SVGGElement => selGroupEls(shadow).find((g) => g.closest("svg")!.classList.contains("masque-edge"))!
const plainSelGroup = (shadow: ShadowRoot): SVGGElement => selGroupEls(shadow).find((g) => g.closest("svg")!.classList.contains("masque-plain"))!

// onDrag/onMove are rAF-coalesced: a second pointermove dispatched before the browser has painted
// a frame only updates the pending event, it doesn't apply synchronously. Tests that need to see
// an intermediate drag/hover frame must await one of these between dispatches.
const flushFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

// Factory so each test gets a fresh geometry object — the alias fix (box.g = rg) mutates
// layer.geometry in-place, which would pollute a shared const across tests. Module scope so
// both the "mount" and pointer-capture describe blocks can use it.
const roiManifest = (): Manifest => ({
    width: 1200, height: 800, scaling: 2,
    transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
        viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
    layers: [{ id: "roi", kind: "roi", axis: "ax1", events: ["drag"], payloads: [],
        geometry: { x: 200, y: 200, w: 400, h: 400, handle: 16 } }],
})

describe("mount", () => {
    it("builds a shadow overlay and round-trips a click to host.value", () => {
        const { host, script } = setup()
        mount(script, manifest)
        const shadow = shadowOf(host)
        expect(shadow.querySelector("svg")).toBeTruthy()
        const surface = shadow.querySelector(".surface") as HTMLElement
        let fired = false
        host.addEventListener("input", () => { fired = true })
        // circle center image-px (600,400); display scale = 1200/600 = 2 → client (300,200)
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 200, bubbles: true }))
        expect(fired).toBe(true)
        // exact shape, not toMatchObject: an element hit carries no `payload` key on the wire
        // (#109) — Julia reconstructs it from `layer`/`index` — and toMatchObject would still
        // pass if a `payload` key crept back in.
        expect((host as unknown as { value: unknown }).value).toEqual({ layer: "pts", index: 0 })
    })

    it("mounts on a <canvas> base (no naturalWidth) and scales via manifest.width", () => {
        // WebGLBackend's base is a <canvas>, which has no naturalWidth — the overlay must take the
        // image-px scale from manifest.width, not the element's intrinsic size (M3.1, no sizer shim).
        const host = document.createElement("div")
        const canvas = document.createElement("canvas") // canvas.width defaults to 300, deliberately != manifest.width
        canvas.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
        const script = document.createElement("script")
        host.append(canvas, script)
        document.body.append(host)
        mount(script, manifest)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        let fired = false
        host.addEventListener("input", () => { fired = true })
        // same as the img case: manifest.width 1200 / rect 600 = 2 → client (300,200) hits circle (600,400)
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 200, bubbles: true }))
        expect(fired).toBe(true)
        expect((host as unknown as { value: { layer: string; index: number } }).value).toMatchObject({ layer: "pts", index: 0 })
    })

    it("click on empty space is a no-op (no round-trip)", () => {
        const { host, script } = setup()
        mount(script, manifest)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        let fired = false
        host.addEventListener("input", () => { fired = true })
        surface.dispatchEvent(new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true }))
        expect(fired).toBe(false)
    })

    it("removes the shadow host on invalidation", async () => {
        const { host, script } = setup()
        let resolve!: () => void
        const inval = new Promise<void>((r) => { resolve = r })
        mount(script, manifest, inval)
        expect(host.lastElementChild?.tagName).toBe("DIV") // shadow host present
        resolve()
        await inval
        await Promise.resolve()
        expect(host.lastElementChild?.tagName).toBe("SCRIPT") // shadow host gone, script remains
    })

    it("drags a threshold line and commits the inverted value on mouse-up", () => {
        const dragManifest: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "thr", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { orientation: "h", pos: 400, span: [0, 1200] } }],
        }
        const { host, script } = setup()
        mount(script, dragManifest)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const line = shadow.querySelector("line") as SVGLineElement
        expect(line).toBeTruthy()
        expect(line.getAttribute("y1")).toBe("400")              // persistent, drawn on mount
        let committed: { layer: string; index: number; payload: number } | null = null
        host.addEventListener("input", () => {
            committed = (host as unknown as { value: { layer: string; index: number; payload: number } }).value
        })
        // display scale = 1200/600 = 2 → client (300,200) == image (600,400) == on the line
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 300, bubbles: true }))
        expect(line.getAttribute("y1")).toBe("600")              // line followed the drag (image y = 2*300)
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 300, bubbles: true }))
        expect(committed).toMatchObject({ layer: "thr", index: 0 })
        // image (600,600): fy = 1 - 600/800 = 0.25; ylims [0,100] → 25
        expect(committed!.payload).toBeCloseTo(25)
    })

    it("re-grab works at the moved threshold position (hit-test tracks the drawn line)", () => {
        // Same class of bug as the ROI re-grab test: the drag moved the drawn line but hit-testing
        // read the manifest's original `pos`, so a second drag only grabbed the line where it
        // started. `move` now writes the live position back to the geometry.
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "thr", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { orientation: "h", pos: 400, span: [0, 1200] } }],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const line = shadow.querySelector("line") as SVGLineElement
        // First drag: image y 400 → 600.
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 300, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 300, bubbles: true }))
        expect(line.getAttribute("y1")).toBe("600")
        // Second grab at the moved line (image y 600), not the original one; drag to image y 700.
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 300, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 350, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 350, bubbles: true }))
        expect(line.getAttribute("y1")).toBe("700")
        // The original position no longer grabs the line.
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 100, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 100, bubbles: true }))
        expect(line.getAttribute("y1")).toBe("700")
    })

    it("synthesized click after drag does not overwrite threshold commit (justDragged guard)", () => {
        // Both a threshold layer and a click-enabled circles layer whose center sits at the drag-release point.
        // Release point: client (300,300) → image (600,600). Circle centered at (600,600) r=30 will be hit by click.
        const mixedManifest: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "thr", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { orientation: "h", pos: 400, span: [0, 1200] } },
                { id: "pts", kind: "circles", geometry: [600, 600, 30], payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"] },
            ],
        }
        const { host, script } = setup()
        mount(script, mixedManifest)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        // drag the threshold: mousedown on line (clientY=200 → image y=400 = threshold pos), release at clientY=300
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 300, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 300, bubbles: true }))
        const afterDrag = (host as unknown as { value: { layer: string; index: number; payload: number } }).value
        expect(afterDrag).toMatchObject({ layer: "thr", index: 0 })
        // synthesized click at the release point — browser fires this after mouseup; circle is at (600,600) and would be hit
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 300, bubbles: true }))
        const afterClick = (host as unknown as { value: { layer: string; index: number; payload: number } }).value
        // guard must have blocked the click — threshold commit must survive
        expect(afterClick.layer).toBe("thr")
    })

    it("draws an ROI box + 4 corner handles and commits inverted bounds after a move", () => {
        const { host, script } = setup()
        mount(script, roiManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const rects = shadow.querySelectorAll("rect")
        expect(rects.length).toBe(5)                 // 1 box + 4 corner handles; sides have no grip
        // setup img is 600 css px wide against manifest width 1200 → drawn half-side is 7 image px
        // (7 css px grip). Hit half-size stays the manifest handle (16). Corners: TL(200,200)
        // TR(600,200) BR(600,600) BL(200,600).
        const drawHalf = handleDrawHalf(1200, 600, 2)
        expect(drawHalf).toBe(7)
        // 1.5 CSS px × (1200/600) image-px per CSS-px = 3 image px
        const radius = handleCornerRadius(drawHalf)
        expect(radius).toBe(3)
        const handles = shadow.querySelectorAll("rect.masque-handle")
        expect(handles).toHaveLength(4)
        const cornerCenters = [...rects].slice(1).map((r) => ({
            x: Number(r.getAttribute("x")) + drawHalf, y: Number(r.getAttribute("y")) + drawHalf,
        }))
        expect(cornerCenters).toEqual([{ x: 200, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 600 }, { x: 200, y: 600 }])
        for (const h of handles) {
            expect(h.getAttribute("width")).toBe(String(2 * drawHalf))
            expect(h.getAttribute("stroke-width")).toBe("1")
            expect(h.getAttribute("rx")).toBe(String(radius))
            expect(h.getAttribute("ry")).toBe(String(radius))
        }
        expect(rects[0].getAttribute("rx")).toBeNull()
        const box = rects[0] as SVGRectElement
        expect(box.getAttribute("stroke-width")).toBe("1")
        expect(box.getAttribute("x")).toBe("200")
        let committed: { layer: string; index: number; payload: { xmin: number; xmax: number; ymin: number; ymax: number } } | null = null
        host.addEventListener("input", () => {
            committed = (host as unknown as { value: { layer: string; index: number; payload: { xmin: number; xmax: number; ymin: number; ymax: number } } }).value
        })
        // display scale 1200/600 = 2 → client (200,200) == image (400,400) == interior center
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true })) // image x 400→600
        expect(box.getAttribute("x")).toBe("400")    // origin moved +200 image px (clamped within viewport)
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 200, bubbles: true }))
        expect(committed).toMatchObject({ layer: "roi", index: 0 })
        // box x now [400,800] image → data [400/1200*10, 800/1200*10]
        expect(committed!.payload.xmin).toBeCloseTo(10 * 400 / 1200)
        expect(committed!.payload.xmax).toBeCloseTo(10 * 800 / 1200)
    })

    it("redraws ROI grips when the base CSS width changes, and falls back when it is zero", () => {
        expect(handleDrawHalf(1200, 0, 2)).toBe(7)
        const { host, img, script } = setup()
        mount(script, roiManifest())
        const shadow = shadowOf(host)
        const grip = shadow.querySelectorAll("rect")[1]
        expect(grip.getAttribute("width")).toBe("14")
        expect(grip.getAttribute("rx")).toBe("3")
        img.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect
        window.dispatchEvent(new Event("resize"))
        // 1200/300 = 4 image-px per css-px → half-side 14, drawn side 28, radius 1.5×4 = 6
        expect(grip.getAttribute("width")).toBe("28")
        expect(grip.getAttribute("rx")).toBe("6")
        expect(grip.getAttribute("ry")).toBe("6")
    })

    it("an explicit ROI hoverstyle stroke keeps its colour and width on the outline", () => {
        const m = roiManifest()
        m.layers[0].style = { stroke: "#123456", width: 3 }
        const { host, script } = setup()
        mount(script, m)
        const rects = shadowOf(host).querySelectorAll("rect")
        const box = rects[0] as SVGRectElement
        expect(box.getAttribute("stroke-width")).toBe("3")
        expect(box.style.getPropertyValue("--masque-hi-stroke")).toBe("#123456")
        const grip = rects[1] as SVGRectElement
        expect(grip.classList.contains("masque-handle")).toBe(true)
        expect(grip.getAttribute("stroke-width")).toBe("1")
        expect(grip.style.getPropertyValue("--masque-hi-stroke")).toBe("#123456")
    })

    it("resizes an ROI box from a corner with the opposite corner fixed", () => {
        const { host, script } = setup()
        mount(script, roiManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const box = shadow.querySelectorAll("rect")[0] as SVGRectElement
        let committed: { layer: string; index: number; payload: { xmin: number; xmax: number; ymin: number; ymax: number } } | null = null
        host.addEventListener("input", () => {
            committed = (host as unknown as { value: { layer: string; index: number; payload: { xmin: number; xmax: number; ymin: number; ymax: number } } }).value
        })
        // BR corner is image (600,600) == client (300,300); drag to image (800,800) == client (400,400)
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 300, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 400, clientY: 400, bubbles: true }))
        expect(box.getAttribute("x")).toBe("200")        // TL anchor unchanged
        expect(box.getAttribute("y")).toBe("200")
        expect(box.getAttribute("width")).toBe("600")    // 800 - 200
        expect(box.getAttribute("height")).toBe("600")
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 400, clientY: 400, bubbles: true }))
        // TL anchor (200,200), BR dragged to (800,800); viewport 1200x800
        expect(committed!.payload.xmin).toBeCloseTo(10 * 200 / 1200)
        expect(committed!.payload.xmax).toBeCloseTo(10 * 800 / 1200)
        expect(committed!.payload.ymin).toBeCloseTo(0)    // image y 800 → data 100*(1-800/800)=0
        expect(committed!.payload.ymax).toBeCloseTo(75)   // image y 200 → data 100*(1-200/800)=75
    })

    it("resizes an ROI box from a side midpoint, with no grip drawn there", () => {
        const { host, script } = setup()
        mount(script, roiManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const box = shadow.querySelectorAll("rect")[0] as SVGRectElement
        // east edge midpoint is image (600,400) == client (300,200); drag to image (800,400) == client (400,200)
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 400, clientY: 200, bubbles: true }))
        expect(box.getAttribute("x")).toBe("200")     // left edge untouched
        expect(box.getAttribute("y")).toBe("200")     // top/height untouched — an edge drag is one axis only
        expect(box.getAttribute("height")).toBe("400")
        expect(box.getAttribute("width")).toBe("600") // 800 - 200
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 400, clientY: 200, bubbles: true }))
    })

    it("an edge drag past its own fixed opposite edge flips, same as a corner", () => {
        const { host, script } = setup()
        mount(script, roiManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const box = shadow.querySelectorAll("rect")[0] as SVGRectElement
        // grab the east edge (image 600,400 == client 300,200; fixed opposite is the west
        // edge, image x=200) and drag PAST it to image x=100 == client 50,200
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 50, clientY: 200, bubbles: true }))
        expect(box.getAttribute("x")).toBe("100")     // min(200, 100)
        expect(box.getAttribute("width")).toBe("100") // |100 - 200|
        expect(box.getAttribute("y")).toBe("200")     // vertical extent untouched — still one axis only
        expect(box.getAttribute("height")).toBe("400")
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 50, clientY: 200, bubbles: true }))
    })

    it("resizes an ROI box from the north edge, moving only the top", () => {
        const { host, script } = setup()
        mount(script, roiManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const box = shadow.querySelectorAll("rect")[0] as SVGRectElement
        // north edge midpoint is image (400,200) == client (200,100); drag up to image (400,100) == client (200,50)
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 100, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 50, bubbles: true }))
        expect(box.getAttribute("x")).toBe("200")     // left/width untouched — one axis only
        expect(box.getAttribute("width")).toBe("400")
        expect(box.getAttribute("y")).toBe("100")     // top moved up
        expect(box.getAttribute("height")).toBe("500") // bottom (600) fixed: 600 - 100
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 50, bubbles: true }))
    })

    it("resizes an ROI box from the south edge, moving only the bottom", () => {
        const { host, script } = setup()
        mount(script, roiManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const box = shadow.querySelectorAll("rect")[0] as SVGRectElement
        // south edge midpoint is image (400,600) == client (200,300); drag down to image (400,700) == client (200,350)
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 300, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 350, bubbles: true }))
        expect(box.getAttribute("x")).toBe("200")     // left/width untouched
        expect(box.getAttribute("width")).toBe("400")
        expect(box.getAttribute("y")).toBe("200")     // top (fixed) unchanged
        expect(box.getAttribute("height")).toBe("500") // bottom moved down: 700 - 200
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 350, bubbles: true }))
    })

    it("resizes an ROI box from the west edge, moving only the left", () => {
        const { host, script } = setup()
        mount(script, roiManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const box = shadow.querySelectorAll("rect")[0] as SVGRectElement
        // west edge midpoint is image (200,400) == client (100,200); drag left to image (100,400) == client (50,200)
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 50, clientY: 200, bubbles: true }))
        expect(box.getAttribute("y")).toBe("200")     // top/height untouched
        expect(box.getAttribute("height")).toBe("400")
        expect(box.getAttribute("x")).toBe("100")     // left moved out
        expect(box.getAttribute("width")).toBe("500") // right (600) fixed: 600 - 100
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 50, clientY: 200, bubbles: true }))
    })

    it("hovering an ROI corner or side shows the matching directional resize cursor", async () => {
        const { host, script } = setup()
        mount(script, roiManifest())
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        // onMove rAF-coalesces bursts of moves (like hover's), so each move here needs a frame
        // to actually apply before asserting — see "coalesces extra same-frame mousemove".
        // TL corner image (200,200) == client (100,100) → "\" diagonal
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 100, clientY: 100, bubbles: true }))
        await flushFrame()
        expect(surface.classList.contains("cur-nwse")).toBe(true)
        // TR corner image (600,200) == client (300,100) → "/" diagonal
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 100, bubbles: true }))
        await flushFrame()
        expect(surface.classList.contains("cur-nesw")).toBe(true)
        expect(surface.classList.contains("cur-nwse")).toBe(false)
        // east edge midpoint image (600,400) == client (300,200) → horizontal resize
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        await flushFrame()
        expect(surface.classList.contains("cur-ew")).toBe(true)
        // north edge midpoint image (400,200) == client (200,100) → vertical resize
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 100, bubbles: true }))
        await flushFrame()
        expect(surface.classList.contains("cur-ns")).toBe(true)
        // south edge midpoint image (400,600) == client (200,300) → also vertical resize (the
        // "n" || "s" check's other operand)
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 300, bubbles: true }))
        await flushFrame()
        expect(surface.classList.contains("cur-ns")).toBe(true)
        // west edge midpoint image (200,400) == client (100,200) → horizontal resize
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 100, clientY: 200, bubbles: true }))
        await flushFrame()
        expect(surface.classList.contains("cur-ew")).toBe(true)
        // interior (move) image (400,400) == client (200,200)
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }))
        await flushFrame()
        expect(surface.classList.contains("cur-move")).toBe(true)
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        expect(surface.classList.contains("cur-move")).toBe(false)
    })

    it("resize flips past the anchor and clamps to the viewport", async () => {
        const { host, script } = setup()
        mount(script, roiManifest())
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        const box = shadowOf(host).querySelectorAll("rect")[0] as SVGRectElement
        // grab BR corner image (600,600)==client (300,300); anchor = TL (200,200)
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 300, bubbles: true }))
        // drag PAST the TL anchor to image (100,100)==client (50,50): box flips, stays non-degenerate
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 50, clientY: 50, bubbles: true }))
        expect(box.getAttribute("x")).toBe("100")        // min(200, 100)
        expect(box.getAttribute("y")).toBe("100")
        expect(box.getAttribute("width")).toBe("100")    // |100 - 200|
        expect(box.getAttribute("height")).toBe("100")
        // drag beyond the viewport image (1400,1000)==client (700,500): clamps to (1200,800)
        // rAF-coalesced: the first move above already consumed this frame's immediate apply, so
        // this second move only lands once the trailing frame runs.
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 700, clientY: 500, bubbles: true }))
        await flushFrame()
        expect(box.getAttribute("x")).toBe("200")        // min(200, 1200)
        expect(box.getAttribute("width")).toBe("1000")   // |1200 - 200|
        expect(box.getAttribute("height")).toBe("600")   // |800 - 200|
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 700, clientY: 500, bubbles: true }))
    })

    it("re-grab works at the moved box position (hit-test tracks live geometry)", () => {
        // Regression for: after drag, box.g (live state) diverged from layer.geometry (static manifest
        // copy), so hitLayer hit-tested the original footprint and missed the moved box on re-grab.
        // Fix: box.g is now an alias for the manifest ROIGeometry, keeping them in sync.
        const { host, script } = setup()
        mount(script, roiManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const box = shadow.querySelectorAll("rect")[0] as SVGRectElement
        // roiManifest: box at image [200,600]×[200,600], scaling=2 so client×2=image
        // First drag: grab interior at client(200,200)=image(400,400); move to client(300,200)=image(600,400)
        // ax = 400-200 = 200; new box.g.x = 600-200 = 400 → box now spans image x [400,800]
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(box.getAttribute("x")).toBe("400")
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 200, bubbles: true }))
        // Second grab: client(350,200)=image(700,400) is INSIDE the moved box [400,800]×[200,600]
        // but OUTSIDE the original [200,600]×[200,600] — so hit only lands if live geometry is used
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 350, clientY: 200, bubbles: true }))
        // Move to client(400,200)=image(800,400); ax=700-400=300; new box.g.x=max(0,min(800,800-300))=500
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 400, clientY: 200, bubbles: true }))
        // Second drag registered → box moved again (x went from 400 to 500)
        expect(box.getAttribute("x")).toBe("500")
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 400, clientY: 200, bubbles: true }))
    })

    // Factory so each test gets a fresh geometry object — drag mutates geometry in-place.
    const boxSelectManifest = (): Manifest => ({
        width: 1200, height: 800, scaling: 2,
        transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
            viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
        layers: [
            // three points (image px); box [200,600]×[200,600] encloses the first two
            { id: "pts", kind: "circles", geometry: [300, 300, 10, 500, 500, 10, 900, 700, 10],
                payloads: [{ i: 0 }, { i: 1 }, { i: 2 }], axis: "ax1", events: ["hover"] },
            { id: "roi", kind: "roi", axis: "ax1", events: ["drag"], payloads: [],
                selects: "pts", geometry: { x: 200, y: 200, w: 400, h: 400, handle: 16 } },
        ],
    })

    it("a click on a selects target point commits nothing, and it shows no pointer cursor", () => {
        // Julia ships a `selects` target hover-only (build_manifest drops "click"): the box owns
        // the bond, so a point click can't replace the brushed selection.
        const { host, script } = setup()
        mount(script, boxSelectManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        let inputs = 0
        host.addEventListener("input", () => { inputs++ })
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 200, bubbles: true }))
        // the click a browser fires after the drag's pointerup, which onClick swallows
        surface.dispatchEvent(new MouseEvent("click", { clientX: 200, clientY: 200, bubbles: true }))
        expect(inputs).toBe(1)
        const brushed = JSON.stringify((host as unknown as { value: unknown }).value)
        const sel = selChildren(shadow).map((el) => el.outerHTML)
        // pts[2] is image (900,700), outside the box [200,600]²: client (450,350).
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 450, clientY: 350, bubbles: true }))
        expect((shadow.querySelector(".masque-tip") as HTMLElement).textContent).not.toBe("") // hover still works
        expect(surface.classList.contains("hot")).toBe(false)
        surface.dispatchEvent(new MouseEvent("click", { clientX: 450, clientY: 350, bubbles: true }))
        expect(inputs).toBe(1)
        expect(JSON.stringify((host as unknown as { value: unknown }).value)).toBe(brushed)
        expect(selChildren(shadow).map((el) => el.outerHTML)).toEqual(sel)
    })

    it("box-select over points emits a Vector envelope of contained points + highlights them", () => {
        const { host, script } = setup()
        mount(script, boxSelectManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        let committed: { items: { layer: string; index: number }[] } | null = null
        host.addEventListener("input", () => {
            committed = (host as unknown as { value: { items: { layer: string; index: number }[] } }).value
        })
        // grab the box interior (image 400,400 = client 200,200), release without moving → emit current enclosure
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 200, bubbles: true }))
        // exact shape, not just index/layer: a selects-ROI item over an element (circles) target
        // carries no `payload` key on the wire (#109) — `.map`/`.every` above would still pass if
        // one crept back in.
        expect(committed!.items).toEqual([{ layer: "pts", index: 0 }, { layer: "pts", index: 1 }])
        // two persistent selection highlights drawn, each split into a fill + an edge shape
        expect(selChildren(shadow).length).toBe(4)
    })

    it("box-select with nothing enclosed emits an empty items envelope", () => {
        const { host, script } = setup()
        mount(script, boxSelectManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const box = shadow.querySelectorAll("rect")[0] as SVGRectElement
        let committed: { items: unknown[] } | null = null
        host.addEventListener("input", () => {
            committed = (host as unknown as { value: { items: unknown[] } }).value
        })
        // move the box up so it encloses no point: grab interior, drag origin up-left out of the cluster
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 350, clientY: 50, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 350, clientY: 50, bubbles: true }))
        expect(box).toBeTruthy()
        expect(committed!.items).toEqual([])
    })

    it("corner-resize of a selects-ROI recomputes the selection", () => {
        const { host, script } = setup()
        mount(script, boxSelectManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        let committed: { items: { index: number }[] } | null = null
        host.addEventListener("input", () => { committed = (host as unknown as { value: typeof committed }).value })
        // grab the BR corner (image 600,600 = client 300,300; anchor = TL 200,200) and drag it out to
        // image (950,750) = client (475,375), enclosing all three points ([200,950]×[200,750])
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 300, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 475, clientY: 375, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 475, clientY: 375, bubbles: true }))
        expect(committed!.items.map((e) => e.index)).toEqual([0, 1, 2])
        expect(selChildren(shadow).length).toBe(6) // 3 points × (fill shape + edge shape)
    })

    it("box-select containing a single point emits a one-element envelope", () => {
        const { host, script } = setup()
        mount(script, boxSelectManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        let committed: { items: { index: number }[] } | null = null
        host.addEventListener("input", () => { committed = (host as unknown as { value: typeof committed }).value })
        // move the box origin to image (50,50) ([50,450]²) so only the first point (300,300) is inside
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 125, clientY: 125, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 125, clientY: 125, bubbles: true }))
        expect(committed!.items.map((e) => e.index)).toEqual([0])
        expect(selChildren(shadow).length).toBe(2) // 1 point × (fill shape + edge shape)
    })

    it("a selects-ROI sweep over a keyboard-focused mark clears the stale hover/focus ring (forward ordering)", () => {
        // Reverse of "keyboard-focusing an already-selected element..." (keyboard.test.ts): here
        // the ring is drawn FIRST (keyboard focus), then the mark enters selKeys_ mid-sweep via a
        // selects-ROI drag, not via drawHi's own already-selected guard. Without drawSelection's
        // reconciliation, the stale 1.5px hover/focus edge would stay live on top of the 2px
        // selected wash until the next pointermove self-heals it.
        const { host, script } = setup()
        mount(script, boxSelectManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.focus()
        // ArrowRight focuses pts[0] (image 300,300) — manifest order puts "pts" before the
        // drag-only "roi" layer, which isn't in the focus list at all.
        surface.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }))
        expect(hiChildren(shadow).length).toBeGreaterThan(0)
        // grab the ROI box interior (image 400,400 = client 200,200) and release without moving —
        // encloses points 0 and 1 (see "box-select over points..." above), sweeping over the
        // still-focused pts[0] mid-drag.
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, bubbles: true }))
        // mid-sweep (before pointerup): the reconciliation runs on `move`, not only at `end`.
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }))
        expect(hiChildren(shadow).length).toBe(0)
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 200, bubbles: true }))
        // All three g.hi groups (fill/edge/plain) are empty; g.sel holds the wash for pts[0..1].
        expect(hiChildren(shadow).length).toBe(0)
        expect(selChildren(shadow).length).toBe(4) // 2 points × (fill shape + edge shape)
        // A miss restores keyboard focus's cached state (hover.ts's restoreFocus), but drawHi's
        // own already-selected guard keeps it a no-op while pts[0] stays selected.
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 5, clientY: 5, bubbles: true }))
        expect(hiChildren(shadow).length).toBe(0)
        expect(selChildren(shadow).length).toBe(4)
    })

    it("a selects-ROI drag onto a mark mid-leave clears the fading hover ring", async () => {
        // The test above keeps a keyboard-focus ring live, so hiKey_ is still set when the box
        // arrives. #97 is the other window: the pointer has already left the mark, clearHi has
        // started the fade, and the box then claims that mark before MOTION_MS.
        const { host, script } = setup()
        mount(script, boxSelectManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const at = (x: number, y: number, type: string) =>
            surface.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }))
        // pts[2] at image (900, 700) = client (450, 350), outside the initial box.
        at(450, 350, "pointermove")
        await flushFrame()
        expect(hiChildren(shadow).length).toBe(2)
        // Onto the ROI interior. The drag-hit branch starts the leave; the ring stays up.
        at(200, 200, "pointermove")
        const leaving = hiChildren(shadow)
        expect(leaving.length).toBe(2)
        expect(leaving.every((el) => el.classList.contains("masque-leave"))).toBe(true)
        // Grab the box and move it over pts[2]. The first drag move applies synchronously.
        at(200, 200, "pointerdown")
        at(450, 300, "pointermove")
        expect(hiChildren(shadow).length).toBe(0)
        expect(selChildren(shadow).length).toBe(2) // pts[2] × (fill + edge)
        await new Promise((r) => setTimeout(r, MOTION_MS + 40))
        // After the fade window, g.hi is still empty and the selected pair is still drawn.
        // The leave callback only removes g.hi children, so this wait does not show that the
        // timer was cancelled. The re-hover test below is the one that keeps a replacement ring.
        expect(hiChildren(shadow).length).toBe(0)
        expect(selChildren(shadow).length).toBe(2)
    })

    // Factory so each test gets a fresh geometry object — drag mutates geometry in-place.
    const gridSelectManifest = (): Manifest => ({
        width: 1200, height: 800, scaling: 2,
        transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
            viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
        layers: [
            { id: "img", kind: "grid", axis: "ax1", events: ["hover"], payloads: [],
                geometry: { xedges: [0, 200, 400, 600], yedges: [0, 200, 400, 600], ncols: 3, nrows: 3 } },
            { id: "roi", kind: "roi", axis: "ax1", events: ["drag"], payloads: [],
                selects: "img", geometry: { x: 100, y: 100, w: 300, h: 300, handle: 16 } },
        ],
    })

    it("box-select over a grid emits a single region (cell indices + data bounds)", () => {
        const { host, script } = setup()
        mount(script, gridSelectManifest())
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        let committed: { items: { layer: string; index: number; payload: Record<string, number> }[] } | null = null
        host.addEventListener("input", () => {
            committed = (host as unknown as { value: typeof committed }).value
        })
        // box is image [100,400]×[100,400]; grab interior (image 250,250 = client 125,125), release
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 125, clientY: 125, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 125, clientY: 125, bubbles: true }))
        expect(committed!.items.length).toBe(1)
        const r = committed!.items[0].payload
        expect([r.i0, r.i1, r.j0, r.j1]).toEqual([0, 1, 0, 1])    // cells covered by [100,400]
        expect(r.xmin).toBeCloseTo(10 * 100 / 1200)
        expect(r.xmax).toBeCloseTo(10 * 400 / 1200)
        expect(r.ymin).toBeCloseTo(50)                            // image y 400 → 100*(1-400/800)
        expect(r.ymax).toBeCloseTo(87.5)                          // image y 100 → 100*(1-100/800)
    })

    it("a click on the brushed grid outside the box commits nothing — the box owns the bond", () => {
        // Julia ships a `selects` target grid hover-only (build_manifest drops "click"), so a
        // cell click can't replace the brushed GridWindowEvent with a GridCellEvent.
        const { host, script } = setup()
        mount(script, gridSelectManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        let inputs = 0
        host.addEventListener("input", () => { inputs++ })
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 125, clientY: 125, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 125, clientY: 125, bubbles: true }))
        // the click a browser fires after the drag's pointerup, which onClick swallows
        surface.dispatchEvent(new MouseEvent("click", { clientX: 125, clientY: 125, bubbles: true }))
        expect(inputs).toBe(1)
        const brushed = JSON.stringify((host as unknown as { value: unknown }).value)
        const sel = selChildren(shadow).map((el) => el.outerHTML)
        // Cell (2,2) is image [400,600]², outside the box [100,400]²: client (250,250).
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 250, clientY: 250, bubbles: true }))
        surface.dispatchEvent(new MouseEvent("click", { clientX: 250, clientY: 250, bubbles: true }))
        expect(inputs).toBe(1)
        expect(JSON.stringify((host as unknown as { value: unknown }).value)).toBe(brushed)
        expect(selChildren(shadow).map((el) => el.outerHTML)).toEqual(sel)
    })

    it("the grid cell-block selection rect is fill-only (no stroke) — the ROI box is the outline", () => {
        // Regression: the cell-block rect used to draw the ordinary closed-selection stroke,
        // which sat right next to the ROI's own outline and read as two overlapping boxes with
        // parallel edges (docs gallery `image_widget`: RectInteractable(grid=...) + ROI selects).
        const { host, script } = setup()
        mount(script, gridSelectManifest())
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 125, clientY: 125, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 125, clientY: 125, bubbles: true }))
        // No explicit style.stroke on this layer, and a rectfill only ever gets a fill shape —
        // no edge shape at all, so it can't double the ROI box's own outline.
        const el = fillSelGroup(shadowOf(host)).firstElementChild as SVGElement
        expect(el.tagName.toLowerCase()).toBe("rect")
        expect(el.classList.contains("masque-hi")).toBe(true)
        expect(el.classList.contains("masque-fillshape")).toBe(true)
        expect(el.getAttribute("fill")).toBeNull()
        expect(el.getAttribute("stroke")).toBeNull()
        expect(edgeSelGroup(shadowOf(host)).children.length).toBe(0)
    })
})

// #97's timer contract, under drawHi/clearHi/drawSelection directly. The mount test above is the
// user path; these two lock the neighbours that path does not reach.
describe("hover leave key while a selection is drawn", () => {
    const layer: HitLayer = {
        id: "pts", kind: "circles", geometry: [], payloads: [], axis: "ax1", events: ["hover", "click"],
    }
    const hit = (index: number): Hit => ({ layer, index, geom_: ["circle", 10 + index, 10, 5] })
    const groups = (): HiGroups => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
        const fill_ = document.createElementNS("http://www.w3.org/2000/svg", "g")
        const edge_ = document.createElementNS("http://www.w3.org/2000/svg", "g")
        const plain_ = document.createElementNS("http://www.w3.org/2000/svg", "g")
        svg.append(fill_, edge_, plain_)
        document.body.append(svg)
        return { fill_, edge_, plain_ }
    }
    const count = (g: HiGroups) => g.fill_.children.length + g.edge_.children.length + g.plain_.children.length

    it("a leave whose key is absent from the new selection still fades out on its own", async () => {
        const state = createOverlayState()
        const hi = groups()
        const sel = groups()
        drawHi(state, hi, hit(2))
        clearHi(state, hi, true)
        drawSelection(state, sel, [hit(0)], hi)
        expect(hi.edge_.firstElementChild!.classList.contains("masque-leave")).toBe(true)
        expect(count(sel)).toBeGreaterThan(0)
        await new Promise((r) => setTimeout(r, MOTION_MS + 40))
        expect(count(hi)).toBe(0)
        expect(state.hiKey_).toBeNull()
        expect(count(sel)).toBeGreaterThan(0)
    })

    it("re-hovering the same mark during the leave replaces the ring, and the old timer does not remove it", async () => {
        const state = createOverlayState()
        const hi = groups()
        drawHi(state, hi, hit(2))
        clearHi(state, hi, true)
        drawHi(state, hi, hit(2))
        const edge = hi.edge_.firstElementChild as SVGElement
        expect(edge.classList.contains("masque-leave")).toBe(false)
        expect(edge.classList.contains("masque-enter")).toBe(true)
        expect(state.hiKey_).toBe("pts:2")
        await new Promise((r) => setTimeout(r, MOTION_MS + 40))
        expect(hi.edge_.firstElementChild).toBe(edge)
        expect(state.hiKey_).toBe("pts:2")
    })
})

// Pointer events: capture-driven drag lifecycle (issue: overlay pointer events / capture / rAF-coalesced drag).
describe("pointer capture, cancel, and coalesced drag release", () => {
    const thresholdManifest = (): Manifest => ({
        width: 1200, height: 800, scaling: 2,
        transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
            viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
        layers: [{ id: "thr", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [],
            geometry: { orientation: "h", pos: 400, span: [0, 1200] } }],
    })

    it("pointerdown on a draggable target sets pointer capture; release drops it", () => {
        const { host, script } = setup()
        mount(script, thresholdManifest())
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        expect(surface.hasPointerCapture(0)).toBe(true)
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 300, bubbles: true }))
        expect(surface.hasPointerCapture(0)).toBe(false)
    })

    it("pointerup after a drag clears the hover cursor and threshold-hover chrome, not just pointer capture", () => {
        const { host, script } = setup()
        mount(script, thresholdManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const line = shadow.querySelector(".masque-threshold-line") as SVGLineElement
        // establish the hover chrome the drag will inherit — onDown alone never sets it
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(surface.classList.contains("cur-ns")).toBe(true)
        expect(line.classList.contains("hovered")).toBe(true)
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 300, bubbles: true }))
        expect(surface.classList.contains("cur-ns")).toBe(false)
        expect(line.classList.contains("hovered")).toBe(false)
    })

    it("a throwing setPointerCapture (real Chromium: InvalidPointerId for a non-active pointerId) does not abort onDown", () => {
        // Live-verify finding: Chromium's setPointerCapture throws InvalidPointerId for a
        // pointerId the UA doesn't consider active (happy-dom's is a bare Set.add and never
        // throws, so this has to be forced here). A DOM listener's thrown exception is swallowed
        // by dispatchEvent itself (spec behavior, reproduced by happy-dom above) — so `threw`
        // can't distinguish an aborted onDown from a completed one. `e.preventDefault()` runs
        // AFTER setPointerCapture in onDown, so `defaultPrevented` is the signal: false means
        // onDown returned early at the throw, before reaching preventDefault.
        const { host, script } = setup()
        mount(script, thresholdManifest())
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        surface.setPointerCapture = () => {
            throw new DOMException("No active pointer with the given id is found.", "InvalidPointerId")
        }
        const down = new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true, cancelable: true })
        surface.dispatchEvent(down)
        expect(down.defaultPrevented).toBe(true)
        expect(surface.classList.contains("grabbing")).toBe(true)
        // the drag still commits normally on release, despite never having real capture
        let committed: { layer: string } | null = null
        host.addEventListener("input", () => {
            committed = (host as unknown as { value: typeof committed }).value
        })
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 300, bubbles: true }))
        expect(committed).toMatchObject({ layer: "thr" })
    })

    it("pointercancel mid-drag ends the drag cleanly: no commit, capture released, cursor unstuck", () => {
        const { host, script } = setup()
        mount(script, thresholdManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const line = shadow.querySelector(".masque-threshold-line") as SVGLineElement
        let fired = false
        host.addEventListener("input", () => { fired = true })
        // establish the hover chrome the drag will inherit — onDown alone never sets it
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(surface.classList.contains("cur-ns")).toBe(true)
        expect(line.classList.contains("hovered")).toBe(true)
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        expect(surface.classList.contains("grabbing")).toBe(true)
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 300, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }))
        expect(fired).toBe(false)                                  // cancel discards, it does not commit
        expect(surface.classList.contains("grabbing")).toBe(false) // cursor is not left stuck
        expect(surface.classList.contains("cur-ns")).toBe(false)   // nor the drag-target resize cursor
        expect(line.classList.contains("hovered")).toBe(false)     // nor the threshold hover-thicken
        expect(surface.hasPointerCapture(0)).toBe(false)
        // a stray pointerup arriving after cancel must not resurrect the drag or commit late
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 300, bubbles: true }))
        expect(fired).toBe(false)
    })

    it("lostpointercapture mid-drag resets state as a safety net (capture taken away some other way)", () => {
        const { host, script } = setup()
        mount(script, thresholdManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const line = shadow.querySelector(".masque-threshold-line") as SVGLineElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(surface.classList.contains("cur-ns")).toBe(true)
        expect(line.classList.contains("hovered")).toBe(true)
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        expect(surface.classList.contains("grabbing")).toBe(true)
        surface.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true }))
        expect(surface.classList.contains("grabbing")).toBe(false)
        expect(surface.classList.contains("cur-ns")).toBe(false)
        expect(line.classList.contains("hovered")).toBe(false)
        // the drag is gone — a plain pointerup now must not commit
        let fired = false
        host.addEventListener("input", () => { fired = true })
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 200, bubbles: true }))
        expect(fired).toBe(false)
    })

    it("applies the last move on pointerup even when its rAF frame never ran (not a dropped frame)", () => {
        const { host, script } = setup()
        mount(script, roiManifest())
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const box = shadow.querySelectorAll("rect")[0] as SVGRectElement
        let committed: { payload: { xmin: number; xmax: number } } | null = null
        host.addEventListener("input", () => {
            committed = (host as unknown as { value: typeof committed }).value
        })
        // grab the box interior: client(200,200) = image(400,400); box at [200,600]² → ax=ay=200
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, bubbles: true }))
        // move 1 applies synchronously (queueDrag's immediate apply) and schedules a trailing frame
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 220, clientY: 200, bubbles: true }))
        expect(box.getAttribute("x")).toBe("240") // image x 440 - ax 200
        // move 2 arrives before that frame runs — coalesced, NOT applied yet
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(box.getAttribute("x")).toBe("240") // still move 1's position — move 2 is pending
        // release at move 2's position with no requestAnimationFrame flush in between
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 200, bubbles: true }))
        expect(box.getAttribute("x")).toBe("400") // image x 600 - ax 200: release point, not the dropped frame
        expect(committed).not.toBeNull()
        expect(committed!.payload.xmax).toBeCloseTo(10 * 800 / 1200) // box right edge at image x 800
    })

    it("touch tap (no hover, pointerType touch) still round-trips a click via the normal click event", () => {
        const { host, script } = setup()
        mount(script, manifest) // click/hover circles layer, no drag
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        let fired = false
        host.addEventListener("input", () => { fired = true })
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true, pointerType: "touch" }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 200, bubbles: true, pointerType: "touch" }))
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 200, bubbles: true }))
        expect(fired).toBe(true)
    })

    it("sets touch-action:none only on surfaces with a drag-capable layer", () => {
        const hover = setup()
        mount(hover.script, manifest) // click/hover circles layer, no drag layer
        const hoverSurface = shadowOf(hover.host).querySelector(".surface") as HTMLElement
        expect(hoverSurface.style.touchAction).not.toBe("none") // page scroll must still work here

        const drag = setup()
        mount(drag.script, thresholdManifest())
        const dragSurface = shadowOf(drag.host).querySelector(".surface") as HTMLElement
        expect(dragSurface.style.touchAction).toBe("none")
    })

    it("a second pointer's move/up cannot hijack a drag it didn't start", () => {
        const { host, script } = setup()
        mount(script, thresholdManifest())
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        let committed: { payload: number } | null = null
        host.addEventListener("input", () => {
            committed = (host as unknown as { value: typeof committed }).value
        })
        // pointer 0 starts the drag
        surface.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 0, clientX: 300, clientY: 200, bubbles: true }))
        // pointer 1 (a second touch) arrives mid-drag: onDown's `if (drag) return` ignores its
        // down, but its move/up must not steer or end pointer 0's drag either
        surface.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 900, clientY: 700, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 900, clientY: 700, bubbles: true }))
        expect(committed).toBeNull()                               // pointer 1's up did not commit
        expect(surface.classList.contains("grabbing")).toBe(true)  // pointer 0's drag is still live
        expect(surface.hasPointerCapture(0)).toBe(true)
        // pointer 0 moves and releases — its own drag commits normally
        surface.dispatchEvent(new PointerEvent("pointermove", { pointerId: 0, clientX: 300, clientY: 300, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { pointerId: 0, clientX: 300, clientY: 300, bubbles: true }))
        expect(committed).not.toBeNull()
        expect(surface.classList.contains("grabbing")).toBe(false)
    })

    it("a second pointer's cancel cannot end a drag it didn't start", () => {
        const { host, script } = setup()
        mount(script, thresholdManifest())
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 0, clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }))
        expect(surface.classList.contains("grabbing")).toBe(true) // pointer 0's drag survives pointer 1's cancel
        surface.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 0, bubbles: true }))
        expect(surface.classList.contains("grabbing")).toBe(false)
    })

    it("pointerleave resets a drag left uncaptured (tryCapture's fallback path)", () => {
        const { host, script } = setup()
        mount(script, thresholdManifest())
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        // Force the same uncaptured fallback as the InvalidPointerId test above: onDown proceeds
        // on drag/"grabbing" state alone, with no real capture granted.
        surface.setPointerCapture = () => {
            throw new DOMException("No active pointer with the given id is found.", "InvalidPointerId")
        }
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        expect(surface.classList.contains("grabbing")).toBe(true)
        expect(surface.hasPointerCapture(0)).toBe(false) // no real capture — the fallback path
        // Without real capture, a pointer leaving the surface mid-drag fires pointerleave (capture
        // would otherwise suppress it) — the drag must not strand "grabbing" here.
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        expect(surface.classList.contains("grabbing")).toBe(false)
        let fired = false
        host.addEventListener("input", () => { fired = true })
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 300, bubbles: true }))
        expect(fired).toBe(false) // the drag is gone — a later pointerup must not commit
    })

    it("tooltip carries role=tooltip and aria-hidden tracks its visibility", () => {
        const { host, script } = setup()
        mount(script, manifest)
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        expect(tip.getAttribute("role")).toBe("tooltip")
        expect(tip.getAttribute("aria-hidden")).toBe("true")
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(tip.getAttribute("aria-hidden")).toBe("false")
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        expect(tip.getAttribute("aria-hidden")).toBe("true")
    })
})

// happy-dom does not retarget hit-tests.
describe("right-click passes through to the base image", () => {
    const dragManifests = (): { name: string; manifest: Manifest; x: number; y: number }[] => [
        { name: "threshold", x: 300, y: 200, manifest: {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "thr", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { orientation: "h", pos: 400, span: [0, 1200] } }],
        } },
        { name: "roi", x: 200, y: 200, manifest: roiManifest() },
        { name: "view", x: 100, y: 200, manifest: {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } }],
        } },
    ]

    const rightDown = (surface: HTMLElement, x: number, y: number, init: PointerEventInit = {}) => {
        const down = new PointerEvent("pointerdown", {
            button: 2, buttons: 2, pointerId: 4, clientX: x, clientY: y,
            bubbles: true, cancelable: true, ...init,
        })
        surface.dispatchEvent(down)
        return down
    }

    const flushMenu = async () => {
        window.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
        await Promise.resolve()
    }

    it("styles .passthrough as pointer-events none", () => {
        const { host, script } = setup()
        mount(script, manifest)
        const css = shadowOf(host).querySelector("style")!.textContent!
        expect(css).toContain(".surface.passthrough { pointer-events: none; }")
    })

    it.each(["threshold", "roi", "view"])("right-button pointerdown does not drag or capture on %s", async (name) => {
        const spec = dragManifests().find((s) => s.name === name)!
        const { host, script } = setup()
        mount(script, spec.manifest)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        let fired = false
        host.addEventListener("input", () => { fired = true })
        const down = rightDown(surface, spec.x, spec.y)
        expect(down.defaultPrevented).toBe(false)
        expect(surface.classList.contains("passthrough")).toBe(true)
        expect(surface.classList.contains("grabbing")).toBe(false)
        expect(surface.hasPointerCapture(4)).toBe(false)
        surface.dispatchEvent(new PointerEvent("pointermove", { pointerId: 4, button: 2, clientX: spec.x + 40, clientY: spec.y + 30, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { pointerId: 4, button: 2, clientX: spec.x + 40, clientY: spec.y + 30, bubbles: true }))
        expect(fired).toBe(false)
        expect(surface.classList.contains("grabbing")).toBe(false)
        await flushMenu()
        expect(surface.classList.contains("passthrough")).toBe(false)
    })

    it("shift+right-click does not start a view drag", async () => {
        const spec = dragManifests().find((s) => s.name === "view")!
        const { host, script } = setup()
        mount(script, spec.manifest)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        const down = rightDown(surface, spec.x, spec.y, { shiftKey: true })
        expect(down.defaultPrevented).toBe(false)
        expect(surface.classList.contains("grabbing")).toBe(false)
        expect(surface.classList.contains("passthrough")).toBe(true)
        await flushMenu()
    })

    it("middle-button pointerdown does not drag and does not drop hit-testing", () => {
        const spec = dragManifests()[0]
        const { host, script } = setup()
        mount(script, spec.manifest)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        const down = new PointerEvent("pointerdown", {
            button: 1, buttons: 4, pointerId: 4, clientX: spec.x, clientY: spec.y, bubbles: true, cancelable: true,
        })
        surface.dispatchEvent(down)
        expect(down.defaultPrevented).toBe(false)
        expect(surface.classList.contains("passthrough")).toBe(false)
        expect(surface.classList.contains("grabbing")).toBe(false)
        expect(surface.hasPointerCapture(4)).toBe(false)
    })

    it("restores hit-testing on pointerup when no contextmenu follows", async () => {
        const spec = dragManifests()[0]
        const { script } = setup()
        mount(script, spec.manifest)
        const surface = shadowOf(script.parentElement as HTMLElement).querySelector(".surface") as HTMLElement
        rightDown(surface, spec.x, spec.y)
        expect(surface.classList.contains("passthrough")).toBe(true)
        window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 4, button: 2, bubbles: true }))
        await new Promise((r) => setTimeout(r, 0))
        expect(surface.classList.contains("passthrough")).toBe(false)
    })

    it("restores hit-testing on pointercancel", () => {
        const spec = dragManifests()[0]
        const { script } = setup()
        mount(script, spec.manifest)
        const surface = shadowOf(script.parentElement as HTMLElement).querySelector(".surface") as HTMLElement
        rightDown(surface, spec.x, spec.y)
        expect(surface.classList.contains("passthrough")).toBe(true)
        window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 4, bubbles: true }))
        expect(surface.classList.contains("passthrough")).toBe(false)
    })

    it("restores hit-testing when neither menu nor pointerup arrives", () => {
        const spec = dragManifests()[0]
        const { script } = setup()
        mount(script, spec.manifest)
        const surface = shadowOf(script.parentElement as HTMLElement).querySelector(".surface") as HTMLElement
        vi.useFakeTimers()
        try {
            rightDown(surface, spec.x, spec.y)
            expect(surface.classList.contains("passthrough")).toBe(true)
            vi.advanceTimersByTime(999)
            expect(surface.classList.contains("passthrough")).toBe(true)
            vi.advanceTimersByTime(1)
            expect(surface.classList.contains("passthrough")).toBe(false)
        } finally {
            vi.useRealTimers()
        }
    })

    it("a left click still round-trips after the menu gesture", async () => {
        const { host, script } = setup()
        mount(script, manifest)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        rightDown(surface, 300, 200)
        await flushMenu()
        let fired = false
        host.addEventListener("input", () => { fired = true })
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 200, bubbles: true }))
        expect(fired).toBe(true)
        expect((host as unknown as { value: { layer: string; index: number } }).value).toEqual({ layer: "pts", index: 0 })
    })

    it("ctrl-click on a non-Apple platform still starts a drag", () => {
        const spec = dragManifests()[0]
        const { script } = setup()
        mount(script, spec.manifest)
        const surface = shadowOf(script.parentElement as HTMLElement).querySelector(".surface") as HTMLElement
        const down = new PointerEvent("pointerdown", {
            button: 0, buttons: 1, ctrlKey: true, clientX: spec.x, clientY: spec.y, bubbles: true, cancelable: true,
        })
        surface.dispatchEvent(down)
        expect(down.defaultPrevented).toBe(true)
        expect(surface.classList.contains("grabbing")).toBe(true)
        expect(surface.classList.contains("passthrough")).toBe(false)
    })

    it("Mac ctrl-click passes through instead of dragging", async () => {
        const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
        const prev = nav.userAgentData
        Object.defineProperty(navigator, "userAgentData", { configurable: true, value: { platform: "macOS" } })
        try {
            const spec = dragManifests()[0]
            const { host, script } = setup()
            const scaling = spec.manifest.scaling
            mount(script, {
                ...spec.manifest,
                layers: [
                    ...spec.manifest.layers,
                    { id: "pts", kind: "circles", axis: "ax1", events: ["click"], payloads: [{ i: 0 }],
                        geometry: [spec.x * scaling, spec.y * scaling, 20] },
                ],
            })
            const surface = shadowOf(host).querySelector(".surface") as HTMLElement
            let fired = false
            host.addEventListener("input", () => { fired = true })
            const down = new PointerEvent("pointerdown", {
                button: 0, buttons: 1, ctrlKey: true, pointerId: 4,
                clientX: spec.x, clientY: spec.y, bubbles: true, cancelable: true,
            })
            surface.dispatchEvent(down)
            expect(down.defaultPrevented).toBe(false)
            expect(surface.classList.contains("passthrough")).toBe(true)
            expect(surface.classList.contains("grabbing")).toBe(false)
            expect(surface.hasPointerCapture(4)).toBe(false)
            await flushMenu()
            expect(surface.classList.contains("passthrough")).toBe(false)
            surface.dispatchEvent(new MouseEvent("click", {
                button: 0, ctrlKey: true, clientX: spec.x, clientY: spec.y, bubbles: true,
            }))
            expect(fired).toBe(false)
            surface.dispatchEvent(new MouseEvent("click", {
                button: 0, clientX: spec.x, clientY: spec.y, bubbles: true,
            }))
            expect(fired).toBe(true)
        } finally {
            if (prev === undefined) delete nav.userAgentData
            else Object.defineProperty(navigator, "userAgentData", { configurable: true, value: prev })
        }
    })
})

// M2.3 tooltip glue in showTip: tipStyle application + the template / auto-table / suppress branches.
// (template.test.ts covers the escape/format logic in isolation; this locks the mount-level wiring.)
describe("tooltips (mount/showTip)", () => {
    // one circles layer at image-px (600,400) r=20 — hovered at client (300,200) since scale = 2
    const tipManifest = (extra: Partial<HitLayer>, tipStyle?: Record<string, string>): Manifest => ({
        width: 1200, height: 800, scaling: 2, transforms: {},
        layers: [{ id: "pts", kind: "circles", geometry: [600, 400, 20], payloads: [{ name: "Tokyo" }], axis: "ax1", events: ["click", "hover"], ...extra }],
        ...(tipStyle ? { tipStyle } : {}),
    })
    const hoverMarker = (shadow: ShadowRoot) =>
        (shadow.querySelector(".surface") as HTMLElement)
            .dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))

    it("a second hide before the first's flip-class cleanup fires replaces the pending timer, not stacks it", async () => {
        // hideTip schedules a delayed removal of flip-x/flip-y (so a fast re-show doesn't visibly
        // flash the caret back to its default side). Leaving twice in quick succession — e.g. the
        // pointer re-enters and leaves again before the first timer fires — must clear the stale
        // timer rather than let it fire later and race the second hide's own cleanup.
        const { host, script } = setup()
        mount(script, tipManifest({ template: ["<b>", { f: "name" }, "</b>"] }))
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        hoverMarker(shadow)
        expect(tip.classList.contains("show")).toBe(true)
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        expect(tip.classList.contains("show")).toBe(false)
        // second leave before MOTION_MS elapses — must replace, not duplicate, the pending timer
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        await new Promise((r) => setTimeout(r, 150))
        expect(tip.classList.contains("flip-x")).toBe(false)
        expect(tip.classList.contains("flip-y")).toBe(false)
    })

    it("applies tipStyle custom properties to the shadow host", () => {
        const { host, script } = setup()
        mount(script, tipManifest({}, { "--masque-tip-bg": "rgb(1,2,3)" }))
        expect((host.lastElementChild as HTMLElement).style.getPropertyValue("--masque-tip-bg")).toBe("rgb(1,2,3)")
    })

    it("applies the manifest's background as --masque-fig-bg on the shadow host", () => {
        const { host, script } = setup()
        mount(script, { ...tipManifest({}), background: "rgb(30,30,30)" })
        expect((host.lastElementChild as HTMLElement).style.getPropertyValue("--masque-fig-bg")).toBe("rgb(30,30,30)")
    })

    it("picks chrome grey from the figure's own background; fill source is theme-independent", () => {
        const { host: lightHost, script: lightScript } = setup()
        mount(lightScript, { ...tipManifest({}), background: "rgb(255,255,255)" })
        const lightStyle = (lightHost.lastElementChild as HTMLElement).style
        expect(lightStyle.getPropertyValue("--masque-chrome")).toBe("#7a7a7a")
        expect(lightStyle.getPropertyValue("--masque-hi-fill")).toBe("#141414")
        expect(lightStyle.getPropertyValue("--masque-hi-blend")).toBe("")
        expect(lightStyle.getPropertyValue("--masque-hi-line-hover")).toBe("")
        expect(lightStyle.getPropertyValue("--masque-hi-line-sel")).toBe("")

        const { host: darkHost, script: darkScript } = setup()
        mount(darkScript, { ...tipManifest({}), background: "rgb(38,38,38)" })
        const darkStyle = (darkHost.lastElementChild as HTMLElement).style
        expect(darkStyle.getPropertyValue("--masque-chrome")).toBe("#c8c8c8")
        expect(darkStyle.getPropertyValue("--masque-hi-fill")).toBe("#141414")

        const { host: bareHost, script: bareScript } = setup()
        mount(bareScript, { ...tipManifest({}) })
        expect((bareHost.lastElementChild as HTMLElement).style.getPropertyValue("--masque-chrome")).toBe("#7a7a7a")
    })

    it("mounts three coordinate-identical top-level svgs, fill/edge/plain in paint order", () => {
        const { host, script } = setup()
        mount(script, { ...tipManifest({}) })
        const shadow = (host.lastElementChild as HTMLElement).shadowRoot!
        const svgs = [...shadow.querySelectorAll("svg")]
        expect(svgs.length).toBe(3)
        expect(svgs[0].classList.contains("masque-fill")).toBe(true)
        expect(svgs[1].classList.contains("masque-edge")).toBe(true)
        expect(svgs[2].classList.contains("masque-plain")).toBe(true)
        for (const svg of svgs) {
            expect(svg.getAttribute("viewBox")).toBe(svgs[0].getAttribute("viewBox"))
            expect(svg.querySelector("g.sel")).toBeTruthy()
            expect(svg.querySelector("g.hi")).toBeTruthy()
        }
    })

    it("sets --masque-mark-border from the hovered element's colors, and clears it on an uncolored one", async () => {
        const { host, script } = setup()
        // two circles, side by side: "colored" carries a uniform accent colour, "plain" doesn't
        const twoLayerManifest: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [
                { id: "colored", kind: "circles", geometry: [600, 400, 20], payloads: [{ name: "a" }], axis: "ax1", events: ["hover"], colors: "rgb(9,9,9)" },
                { id: "plain", kind: "circles", geometry: [900, 400, 20], payloads: [{ name: "b" }], axis: "ax1", events: ["hover"] },
            ],
        }
        mount(script, twoLayerManifest)
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(tip.style.getPropertyValue("--masque-mark-border")).toBe("3px solid rgb(9,9,9)")
        // width-only twin the caret rule subtracts (mount.ts): the ::before is positioned off the
        // padding box, so a 3px accent would otherwise push the apex 2px right of the anchor
        expect(tip.style.getPropertyValue("--masque-mark-border-w")).toBe("3px")
        await flushFrame() // onMove rAF-coalesces; the pending move above must land before the next one
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 450, clientY: 200, bubbles: true }))
        expect(tip.style.getPropertyValue("--masque-mark-border")).toBe("")
        expect(tip.style.getPropertyValue("--masque-mark-border-w")).toBe("")
    })

    it("caret rule backs the accent border width out of --masque-caret-x", () => {
        const { host, script } = setup()
        mount(script, manifest)
        const css = shadowOf(host).querySelector("style")!.textContent ?? ""
        expect(css).toMatch(/\.masque-tip::before\s*\{[^}]*var\(--masque-mark-border-w, 1px\)/)
    })

    it("resolves a palette+index colors field per element", async () => {
        const { host, script } = setup()
        const palettedManifest: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "pts", kind: "circles", axis: "ax1", events: ["hover"],
                geometry: [600, 400, 20, 900, 400, 20],
                payloads: [{ name: "a" }, { name: "b" }],
                colors: { palette: ["rgb(1,1,1)", "rgb(2,2,2)"], index: [1, 0] },
            }],
        }
        mount(script, palettedManifest)
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(tip.style.getPropertyValue("--masque-mark-border")).toBe("3px solid rgb(2,2,2)")
        await flushFrame()
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 450, clientY: 200, bubbles: true }))
        expect(tip.style.getPropertyValue("--masque-mark-border")).toBe("3px solid rgb(1,1,1)")
    })

    it("renders a template tooltip as HTML on hover (markup live, data escaped)", () => {
        const { host, script } = setup()
        mount(script, tipManifest({ template: ["<b>", { f: "name" }, "</b>"], payloads: [{ name: "<x>" }] }))
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        hoverMarker(shadow)
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.innerHTML).toBe("<b>&lt;x&gt;</b>")   // the <b> stays live; the payload value is escaped
    })

    it("renders the auto-table default when no template is set", () => {
        const { host, script } = setup()
        mount(script, tipManifest({}))
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        hoverMarker(shadow)
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.innerHTML).toContain("masque-tip-row")
        expect(tip.innerHTML).toContain("Tokyo")
    })

    it("suppresses the tooltip when tooltip === false", () => {
        const { host, script } = setup()
        mount(script, tipManifest({ tooltip: false }))
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        hoverMarker(shadow)
        expect(tip.classList.contains("show")).toBe(false)
    })

    it("colorbar axis hover shows formatted value not x=undefined", () => {
        const { host, script } = setup()
        // colorbar: axis layer with bounded geometry [200,100,24,400] in image px, valueaxis:"y"
        const cbManifest: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { cb1: { xlims: [0, 1], ylims: [0, 10], xscale: "identity", yscale: "identity",
                viewport: [200, 100, 24, 400], xreversed: false, yreversed: false, valueaxis: "y" } },
            layers: [{ id: "colorbar", kind: "axis", geometry: [200, 100, 24, 400], payloads: [], axis: "cb1", events: ["hover"] }],
        }
        mount(script, cbManifest)
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        // client (110,150) → image px (220,300); inside bbox; fy=0.5 → value=5.0; fmt(5)="5.000"
        ;(shadow.querySelector(".surface") as HTMLElement)
            .dispatchEvent(new PointerEvent("pointermove", { clientX: 110, clientY: 150, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.innerHTML).toBe("5.000")
        expect(tip.innerHTML).not.toContain("undefined")
    })

    it("cursor-following tooltip offset uses the surface's real rect, not the raw event offset, when one is available", () => {
        // tipOffset falls back to e.offsetX/e.offsetY only when the surface's own
        // getBoundingClientRect is degenerate (width/height 0, as happy-dom defaults to) — with
        // a real rect it must use clientX/Y - rect.left/top instead. offsetX/Y are 0 in happy-dom
        // regardless, so a surface rect at a non-zero origin is the only way to tell the two
        // branches apart. Hit-testing itself goes through the BASE element's rect (unmocked here,
        // setup()'s default), not the surface's — client (110,150) is the same point the existing
        // "colorbar axis hover" test above uses, so it's a known hit; the surface rect below is
        // independent, only exercising the offset math.
        const { host, script } = setup()
        const cbManifest: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { cb1: { xlims: [0, 1], ylims: [0, 10], xscale: "identity", yscale: "identity",
                viewport: [200, 100, 24, 400], xreversed: false, yreversed: false, valueaxis: "y" } },
            layers: [{ id: "colorbar", kind: "axis", geometry: [200, 100, 24, 400], payloads: [], axis: "cb1", events: ["hover"] }],
        }
        mount(script, cbManifest)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        surface.getBoundingClientRect = () =>
            ({ left: 30, top: 20, width: 600, height: 400, right: 630, bottom: 420, x: 30, y: 20, toJSON() {} }) as DOMRect
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 110, clientY: 150, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.style.left).toBe(`${110 - 30 + 10}px`) // TIP_OFFSET = 10
        expect(tip.style.top).toBe(`${150 - 20 + 10}px`)
    })

    it("plain axis hover shows x=… y=… tooltip (no valueaxis)", () => {
        const { host, script } = setup()
        // plain axis: geometry null, transform has no valueaxis → x=/y= tooltip
        const plainManifest: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 5], ylims: [0, 5], xscale: "identity", yscale: "identity",
                viewport: [100, 100, 400, 400], xreversed: false, yreversed: false } },
            layers: [{ id: "axis", kind: "axis", geometry: null, payloads: [], axis: "ax1", events: ["hover"] }],
        }
        mount(script, plainManifest)
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        ;(shadow.querySelector(".surface") as HTMLElement)
            .dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.innerHTML).toContain("x=")
        expect(tip.innerHTML).toContain("y=")
        expect(tip.innerHTML).not.toContain("undefined")
    })

    it("selected= pre-highlights are persistent: all indices drawn, and they survive hover", async () => {
        const { host, script } = setup()
        // two circles pre-selected — the view-manip persistence contract: Julia re-derives
        // `selected` each render; the overlay must keep it visible through transient hovers
        const selManifest: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "pts", kind: "circles", geometry: [300, 200, 20, 600, 400, 20, 900, 600, 20],
                payloads: [{ i: 0 }, { i: 1 }, { i: 2 }], axis: "ax1", events: ["click", "hover"],
                selected: [0, 2],
            }],
        }
        mount(script, selManifest)
        const shadow = shadowOf(host)
        const sel = edgeSelGroup(shadow) // plain circles, no style.stroke → fill+edge split, wash lives on edge
        expect(sel.children.length).toBe(2)                 // BOTH indices, not just the last
        const surface = shadow.querySelector(".surface") as HTMLElement
        // (300,200) is index 0, already selected — no hover chrome is drawn for it (skip-when-
        // selected). Then empty space, which would fade g.hi if anything were there.
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 10, bubbles: true }))
        await new Promise<void>((r) => requestAnimationFrame(() => r()))
        expect(sel.children.length).toBe(2)                 // pre-selection survived the hovers
        const leaving = edgeHiGroup(shadow).firstElementChild
        expect(leaving === null || leaving.classList.contains("masque-leave")).toBe(true)
        expect(sel.querySelector("circle")!.classList.contains("masque-wash")).toBe(true)
    })

    // issue #39: selected= fail-loud on unsupported kinds / OOB (mirror Julia build_manifest)
    it("selected= on segments draws a ring (open-kind fallback)", () => {
        const { host, script } = setup()
        const segs: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "segs", kind: "segments", geometry: [0, 0, 100, 100, 200, 200, 300, 300],
                payloads: [{ i: 0 }, { i: 1 }], axis: "ax1", events: ["click", "hover"],
                selected: [0],
            }],
        }
        mount(script, segs)
        // Selected open geometry always renders as the unblended ring, in svg.masque-plain.
        const node = plainSelGroup(shadowOf(host)).firstElementChild as SVGElement
        expect(node.querySelectorAll("line").length).toBe(2)
    })

    it("selected= on polyline counts vertices-1 (not 0) and draws a ring", () => {
        const { host, script } = setup()
        // 3 vertices → 2 segments; Julia `_layer_n_elements(:polyline)` is length÷2 - 1
        const poly: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "line", kind: "polyline", geometry: [0, 0, 100, 100, 200, 50],
                payloads: [{ i: 0 }, { i: 1 }], axis: "ax1", events: ["click", "hover"],
                selected: [0],
            }],
        }
        mount(script, poly)
        const node = plainSelGroup(shadowOf(host)).firstElementChild as SVGElement
        expect(node.querySelectorAll("line").length).toBe(2)
    })

    it("selected= on lines draws one ring for the whole path, NaN gap included", () => {
        const { host, script } = setup()
        const lines: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "curves", kind: "lines",
                geometry: [[0, 0, 100, 0, NaN, NaN, 100, 80], [0, 200, 50, 200]],
                payloads: [{ i: 0 }, { i: 1 }], axis: "ax1", events: ["click", "hover"],
                selected: [0],
            }],
        }
        mount(script, lines)
        const node = plainSelGroup(shadowOf(host)).firstElementChild as SVGElement
        const paths = [...node.querySelectorAll("path")]
        expect(paths.length).toBe(2)
        expect(paths[0].getAttribute("d")).toBe("M0 0L100 0M100 80")
        expect(node.querySelector("line")).toBeNull()
    })

    it("selected= on grid fails loud at mount", () => {
        const { script } = setup()
        const bad: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "heat", kind: "grid",
                geometry: { xedges: [0, 100, 200], yedges: [0, 100, 200], ncols: 2, nrows: 2 },
                payloads: [], axis: "ax1", events: ["hover"], selected: [0],
            }],
        }
        expect(() => mount(script, bad)).toThrow(/selected/i)
    })

    it("selected= out-of-range index fails loud at mount", () => {
        const { script } = setup()
        const bad: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "pts", kind: "circles", geometry: [300, 200, 20, 600, 400, 20],
                payloads: [{ i: 0 }, { i: 1 }], axis: "ax1", events: ["click", "hover"],
                selected: [2],
            }],
        }
        expect(() => mount(script, bad)).toThrow(/selected|out of range|index/i)
    })

    it("a selects-ROI commit REPLACES the selected= hydration with its enclosure (hydration model)", () => {
        // selected= is pure hydration (an initial value): a selects-ROI move/release sets the
        // whole selection, it doesn't add to it.
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "pts", kind: "circles", geometry: [300, 300, 10, 500, 500, 10, 900, 700, 10],
                    payloads: [{ i: 0 }, { i: 1 }, { i: 2 }], axis: "ax1", events: ["hover"],
                    selected: [2] },  // only the third point pre-highlighted
                { id: "roi", kind: "roi", axis: "ax1", events: ["drag"], payloads: [],
                    selects: "pts", geometry: { x: 200, y: 200, w: 400, h: 400, handle: 16 } },
            ],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const sel = edgeSelGroup(shadow) // plain circles, no style.stroke → fill+edge split, one edge shape per selected point
        expect(sel.children.length).toBe(1)  // hydration alone (index 2)
        const surface = shadow.querySelector(".surface") as HTMLElement
        // commit current ROI enclosure (points 0 and 1) — replaces the index-2 hydration outright
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 200, bubbles: true }))
        expect(sel.children.length).toBe(2)  // points 0 and 1 only — index 2 is gone
    })

    // #102/§12.3: a view gesture commits nothing — the drag readout still lives entirely in
    // the browser (Tier 0), but nothing writes host.value or fires "input" for it anymore. This
    // used to be "drag-to-pan commits new limits on mouse-up (commit-on-release)"; changing what
    // it asserts is deliberate (docs/dev/architecture/12-gesture-channel.md §12.3), not a test
    // that quietly stopped testing — see the paired gesture-channel test below for what DOES
    // fire on this same drag.
    it("drag-to-pan keeps the live readout but commits nothing", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } }],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        let fired = false
        host.addEventListener("input", () => { fired = true })
        // display scale 2: client Δx=100 → image Δx=200 → 200/1200 of lims = 10/6 ≈ 1.667
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }))
        // Tier-0 readout is still live mid-drag, browser-only, no round trip needed for it.
        expect(tip.textContent).toContain("x:[")
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 200, bubbles: true }))
        expect(fired).toBe(false)
        expect((host as unknown as { value: unknown }).value).toBeNull()
    })

    it("gesture channel: a real pan drag requests frames and settles; a micro-drag requests none (VIEW_MIN_PX)", async () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } }],
        }
        const { host, script } = setup()
        const requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({ png: new Uint8Array([1, 2, 3]) }))
        mount(script, m, undefined, requestFrame)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement

        // Micro-drag (2 image-px, below VIEW_MIN_PX=3): no request at all — same "ignore
        // accidental micro-drags" guard the old commit check used, now protecting the channel.
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 101, clientY: 100, bubbles: true }))
        await Promise.resolve()
        expect(requestFrame).not.toHaveBeenCalled()

        // A real drag: at least one in-drag request (settle: false), and a terminal one
        // (settle: true) on release, carrying the pan payload the old commit used to.
        const img = host.querySelector("img") as HTMLImageElement
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }))
        // The base stays untransformed, so its border box is the layout box. pointerup
        // samples that same layout point and must not put the translation back to 0.
        expect(img.style.transform).toBe("")
        expect(host.dataset.masquePhoto).toBe("1,200,0")
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 200, bubbles: true }))
        expect(img.style.transform).toBe("")
        expect(host.dataset.masquePhoto).toBe("1,200,0")
        await Promise.resolve()
        expect(requestFrame).toHaveBeenCalled()
        const calls = requestFrame.mock.calls; const last = calls[calls.length - 1][0]
        expect(last).toMatchObject({ id: "view", settle: true })
        expect(last.xmin as number).toBeCloseTo(-10 * 200 / 1200)
        expect(last.xmax as number).toBeCloseTo(10 - 10 * 200 / 1200)
    })

    it("gesture channel: a canvas frame swaps the scene and the manifest together", async () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } }],
        }
        const host = document.createElement("div")
        const canvas = document.createElement("canvas") as HTMLCanvasElement & {
            masqueReplaceScene?: (scene: unknown, px?: number, w?: number, h?: number) => void
        }
        canvas.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
        const replace = vi.fn()
        canvas.masqueReplaceScene = replace
        const script = document.createElement("script")
        host.append(canvas, script)
        document.body.append(host)
        const moved: Manifest = {
            ...m,
            transforms: { ax1: { ...m.transforms.ax1, xlims: [1, 9], ylims: [2, 80] } },
        }
        const requestFrame = vi.fn(async () => ({ scene: { tag: "frame" }, pxPerUnit: 1, width: 400, height: 300, manifest: moved }))
        mount(script, m, undefined, requestFrame)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }))
        await Promise.resolve()
        await Promise.resolve()
        expect(replace).toHaveBeenCalledWith({ tag: "frame" }, 1, 400, 300)
        const stamp = JSON.parse((host as HTMLElement & { dataset: DOMStringMap }).dataset.masqueGestureFrame!)
        expect(stamp.n).toBe(1)
        expect(stamp.xmin).toBe(1)
        expect(stamp.xmax).toBe(9)
    })

    it("gesture channel: a canvas frame that lands before the replacer still swaps the manifest", async () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } }],
        }
        const host = document.createElement("div")
        const canvas = document.createElement("canvas") as HTMLCanvasElement & {
            masqueReplaceScene?: (scene: unknown, px?: number, w?: number, h?: number) => void
            masqueFlushPending?: () => void
            masquePendingFrame?: { input: Record<string, unknown>; r: { scene?: unknown } } | null
        }
        canvas.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
        const script = document.createElement("script")
        host.append(canvas, script)
        document.body.append(host)
        const moved: Manifest = {
            ...m,
            transforms: { ax1: { ...m.transforms.ax1, xlims: [1, 9], ylims: [2, 80] } },
        }
        const requestFrame = vi.fn(async () => ({ scene: { tag: "early" }, pxPerUnit: 1, width: 400, height: 300, manifest: moved }))
        mount(script, m, undefined, requestFrame)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }))
        await Promise.resolve()
        await Promise.resolve()
        expect(canvas.masquePendingFrame?.r.scene).toEqual({ tag: "early" })
        expect(host.dataset.masqueGestureFrame).toBeUndefined()
        const replace = vi.fn()
        canvas.masqueReplaceScene = replace
        canvas.masqueFlushPending?.()
        expect(canvas.masquePendingFrame).toBeNull()
        expect(replace).toHaveBeenCalledWith({ tag: "early" }, 1, 400, 300)
        const stamp = JSON.parse((host as HTMLElement & { dataset: DOMStringMap }).dataset.masqueGestureFrame!)
        expect(stamp.n).toBe(1)
        expect(stamp.xmin).toBe(1)
        expect(stamp.xmax).toBe(9)
    })

    it("retargets the overlay when the WebGL base is swapped, and stashes a frame on the host", async () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } }],
        }
        const host = document.createElement("div") as HTMLElement & {
            masqueRetargetBase?: (next: HTMLElement) => void
            masquePendingFrame?: { r: { scene?: unknown } } | null
            masqueRequestLive?: () => void
        }
        const canvas = document.createElement("canvas")
        canvas.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
        const script = document.createElement("script")
        host.append(canvas, script)
        document.body.append(host)
        const requestLive = vi.fn()
        host.masqueRequestLive = requestLive
        const requestFrame = vi.fn(async () => ({ scene: { tag: "asleep" }, pxPerUnit: 1, width: 400, height: 300, manifest: m }))
        mount(script, m, undefined, requestFrame)
        const img = document.createElement("img")
        img.getBoundingClientRect = () =>
            ({ left: 12, top: 8, width: 500, height: 300, right: 512, bottom: 308, x: 12, y: 8, toJSON() {} }) as DOMRect
        host.masqueRetargetBase!(img)
        const shadowHost = host.lastElementChild as HTMLElement
        expect(shadowHost.style.left).toBe("12px")
        expect(shadowHost.style.top).toBe("8px")
        expect(shadowHost.style.width).toBe("500px")
        expect(shadowHost.style.height).toBe("300px")
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }))
        await Promise.resolve()
        await Promise.resolve()
        expect(host.masquePendingFrame?.r.scene).toEqual({ tag: "asleep" })
        expect(requestLive).toHaveBeenCalled()
        expect(host.dataset.masqueGestureFrame).toBeUndefined()
    })

    // Round-1 review, finding #2: settle used to be gated on the RELEASE point's own distance
    // from the drag's start, so a drag that went out past VIEW_MIN_PX (sending ppu=1 in-drag
    // requests) and drifted back near its start before release read as a micro-drag at release
    // time and never settled — stranding the widget at ppu=1 forever, since nothing else
    // re-renders it.
    it("gesture channel: settles even when the release point drifts back near the drag's start", async () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } }],
        }
        const { host, script } = setup()
        const requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({ png: new Uint8Array([1, 2, 3]) }))
        mount(script, m, undefined, requestFrame)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement

        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 100, bubbles: true })) // out past VIEW_MIN_PX
        await flushFrame()
        expect(requestFrame).toHaveBeenCalledTimes(1)
        // drift back to within VIEW_MIN_PX (3 image-px = 1.5 client-px at this fixture's 2x scale)
        // of the drag's start before releasing.
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 101, clientY: 100, bubbles: true }))
        await flushFrame()

        const calls = requestFrame.mock.calls; const last = calls[calls.length - 1][0]
        expect(last).toMatchObject({ id: "view", settle: true }) // settled anyway — a request had already gone out
    })

    // Round-1 review, finding #2 (second half): onCancel/onLostCapture never settled at all, so
    // an aborted gesture (browser-initiated takeover, stylus leaving range, capture lost some
    // other way) that had already sent in-drag requests left the widget at ppu=1 permanently.
    it("gesture channel: pointercancel and lostpointercapture both settle if a request went out", async () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } }],
        }
        const { host, script } = setup()
        const requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({ png: new Uint8Array([1, 2, 3]) }))
        mount(script, m, undefined, requestFrame)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement

        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 100, bubbles: true }))
        await flushFrame()
        expect(requestFrame).toHaveBeenCalledTimes(1)
        surface.dispatchEvent(new PointerEvent("pointercancel", { clientX: 210, clientY: 100, bubbles: true }))
        await flushFrame()
        expect(requestFrame).toHaveBeenCalledTimes(2)
        expect(requestFrame.mock.calls[requestFrame.mock.calls.length - 1][0]).toMatchObject({ id: "view", settle: true })

        // A second drag, ended by lostpointercapture instead (no position available to that
        // handler at all — it has to resettle with the last request's own camera).
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 250, clientY: 100, bubbles: true }))
        await flushFrame()
        expect(requestFrame).toHaveBeenCalledTimes(3)
        surface.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true }))
        await flushFrame()
        expect(requestFrame).toHaveBeenCalledTimes(4)
        expect(requestFrame.mock.calls[requestFrame.mock.calls.length - 1][0]).toMatchObject({ id: "view", settle: true })
    })

    // Round-1 review, finding #3: a manifest-carrying frame swap tore down ROI/threshold and
    // re-keyed selection, but left g.hi (hover ring) drawn from the OLD geometry — §12.5 forbids
    // leaving the overlay live over a frame it no longer describes, and a view drag starting
    // from (or shortly after) a hovered point is a supported path, not an edge case.
    it("gesture channel: a manifest-swap frame clears the stale hover ring, not just selection", async () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "pts", kind: "circles", geometry: [600, 400, 20], payloads: [{ i: 0 }],
                    axis: "ax1", events: ["click", "hover"] },
                { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } },
            ],
        }
        const movedManifest: Manifest = {
            ...m,
            layers: [{ ...m.layers[0], geometry: [400, 400, 20] }, m.layers[1]],
        }
        const { host, script } = setup()
        const requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({ png: new Uint8Array([1, 2, 3]), manifest: movedManifest }))
        mount(script, m, undefined, requestFrame)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement

        // Hover the point first (image px 600,400 -> CSS 300,200 at this fixture's 2x scale).
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(hiChildren(shadow).length).toBeGreaterThan(0)

        // A view drag elsewhere on the surface — onDown/onPointerMove never re-evaluate hover
        // once a drag starts, so nothing but applyFrame's own cleanup can clear this ring.
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 200, bubbles: true }))
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
        // Cairo keeps the previous pixels until load. The manifest swap waits with them.
        host.querySelector("img")!.dispatchEvent(new Event("load"))

        expect(hiChildren(shadow).length).toBe(0) // not left describing the point's stale, pre-pan position
    })

    it("points+view: hover and click still work over the full-viewport view layer", async () => {
        // Regression: :view used to win every drag hitTest and suppress element hover/click.
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "pts", kind: "circles", geometry: [600, 400, 20], payloads: [{ i: 0 }],
                    axis: "ax1", events: ["click", "hover"] },
                { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } },
            ],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        // hover over the point (client 300,200 → image 600,400)
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(true)
        expect(surface.classList.contains("hot")).toBe(true)
        // empty area: grab cursor from view, no hover tip
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 50, clientY: 50, bubbles: true }))
        await new Promise<void>((r) => requestAnimationFrame(() => r()))
        expect(tip.classList.contains("show")).toBe(false)
        expect(surface.classList.contains("grab")).toBe(true)
        // tiny mousedown/up over the point must not swallow the subsequent click
        let clicked: { layer: string; index: number } | null = null
        host.addEventListener("input", () => {
            clicked = (host as unknown as { value: typeof clicked }).value
        })
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 301, clientY: 200, bubbles: true })) // 2 image-px
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 200, bubbles: true }))
        expect(clicked).toMatchObject({ layer: "pts", index: 0 })
    })

    it("a view-pan drag readout doesn't inherit the previously-hovered point's accent colour", async () => {
        // Regression: applyDrag sets the drag-readout text via setTipText/setTipVisible
        // directly, not applyTipHtml (the only place that calls setMarkAccent) — so a
        // --masque-mark-border left over from hovering a coloured point survived into the
        // readout tooltip for the whole drag, since applyMove keeps element hover alive
        // over a full-viewport :view hit (see the test above).
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "pts", kind: "circles", geometry: [600, 400, 20], payloads: [{ i: 0 }],
                    axis: "ax1", events: ["click", "hover"], colors: "rgb(9,9,9)" },
                { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } },
            ],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(tip.style.getPropertyValue("--masque-mark-border")).toBe("3px solid rgb(9,9,9)")
        // press-and-drag from that same spot starts a :view pan (a coloured point never
        // suppresses a :view drag hit) and shows the drag readout tooltip
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 320, clientY: 200, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.style.getPropertyValue("--masque-mark-border")).toBe("")
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 320, clientY: 200, bubbles: true }))
    })

    it("does not re-show hover after view-pan release when the surface moved during drag", async () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "pts", kind: "circles", geometry: [600, 400, 20], payloads: [{ i: 0 }],
                    axis: "ax1", events: ["click", "hover"] },
                { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } },
            ],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 50, clientY: 50, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 120, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 200, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(false)
        await new Promise<void>((r) => requestAnimationFrame(() => r()))
        expect(tip.classList.contains("show")).toBe(false)
        expect(hiChildren(shadow).length).toBe(0)
    })

    // #102/§12.3: Shift+drag still arbitrates to the view layer over an ROI underneath it (the
    // routing this test's name references) — what changed is that winning the arbitration no
    // longer means a bond commit. Without a `requestFrame` mock there'd be no observable signal
    // that Shift actually routed to VIEW rather than just silently doing nothing over the ROI,
    // so this asserts BOTH: the ROI does NOT commit under Shift, and the gesture channel DOES
    // receive an orbit request with the expected azimuth/elevation — the only way now to prove
    // arbitration picked view, not "this drag matched nothing at all."
    it("drag-to-orbit requests azimuth/elevation frames, commits nothing; Shift+drag beats ROI", async () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: {
                ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                    viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false },
                ax3: { xlims: [0, 1], ylims: [0, 1], xscale: "identity", yscale: "identity",
                    viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false, is3d: true },
            },
            layers: [
                { id: "roi", kind: "roi", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 200, y: 200, w: 400, h: 400, handle: 16 } },
                { id: "view", kind: "view", axis: "ax3", events: ["drag"], payloads: [],
                    geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "orbit", azimuth: 0.4, elevation: 0.5 } },
            ],
        }
        const { host, script } = setup()
        const requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({ png: new Uint8Array([1, 2, 3]) }))
        mount(script, m, undefined, requestFrame)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        let committed: { layer: string; payload: { azimuth: number; elevation: number } } | null = null
        host.addEventListener("input", () => {
            committed = (host as unknown as { value: typeof committed }).value
        })
        // without Shift: ROI wins over view (layer order) and still commits — ROI settling
        // bounds is a data interaction (§12.1), unaffected by #102.
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 250, clientY: 200, bubbles: true }))
        expect(committed!.layer).toBe("roi")
        expect(requestFrame).not.toHaveBeenCalled()
        // with Shift: view orbit wins even over ROI interior, but commits nothing.
        committed = null
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, bubbles: true, shiftKey: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 500, clientY: 200, bubbles: true, shiftKey: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 500, clientY: 200, bubbles: true, shiftKey: true }))
        await Promise.resolve()
        expect(committed).toBeNull()
        expect(requestFrame).toHaveBeenCalled()
        const calls = requestFrame.mock.calls; const last = calls[calls.length - 1][0]
        expect(last).toMatchObject({ id: "view", settle: true })
        // image Δx = 600; sens = π/1200 → Δaz = −π/2
        expect(last.azimuth as number).toBeCloseTo(0.4 - Math.PI / 2)
        expect(last.elevation as number).toBeCloseTo(0.5)
    })

    // #102 tripwire #3: a manifest swap mid-gesture must not drop a selection made before (or
    // even during) the drag — #107's "axis click preserves selection" regression lived in this
    // exact spot. The mock response's "pts" layer moves to a NEW position, simulating what a
    // real pan does to every layer on the panned axis; the selection ring has to track it.
    it("a frame swap with a new manifest preserves the live selection at its NEW coordinates", async () => {
        // Two points, unselected at mount — the test SELECTS index 1 itself (a real click), so
        // the assertion below can distinguish "applyFrame re-keyed the LIVE selection" from
        // "applyFrame re-hydrated from the new manifest's own selected=" (round-1 review's
        // sharpest nit): movedManifest below declares selected: [0] on this layer, a DIFFERENT
        // index than the one actually clicked. A re-hydration bug would show index 0 at its new
        // position; re-keying shows index 1 at ITS new position. The original fixture selected
        // index 0 via selected= in BOTH manifests, so it could not tell the two apart.
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "pts", kind: "circles", geometry: [200, 400, 20, 900, 400, 20], payloads: [{ i: 0 }, { i: 1 }],
                    axis: "ax1", events: ["click", "hover"] },
                { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } },
            ],
        }
        const movedManifest: Manifest = {
            ...m,
            transforms: { ax1: { ...m.transforms.ax1, xlims: [-10, 0] } },
            layers: [
                // both points panned 200px left; selected: [0] is deliberately NOT what the test
                // clicks (index 1) — see the comment above.
                { ...m.layers[0], geometry: [0, 400, 20, 700, 400, 20], selected: [0] },
                m.layers[1],
            ],
        }
        const { host, script } = setup()
        const requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({ png: new Uint8Array([1, 2, 3]), manifest: movedManifest }))
        mount(script, m, undefined, requestFrame)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement

        // Real click on index 1 (image px 900,400 -> CSS 450,200 at this fixture's 2x scale).
        surface.dispatchEvent(new MouseEvent("click", { clientX: 450, clientY: 200, bubbles: true }))
        expect(selChildren(shadow).length).toBe(2) // closed-shape selection draws BOTH fill+edge halves

        let fired = false
        host.addEventListener("input", () => { fired = true })
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 200, bubbles: true }))
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
        host.querySelector("img")!.dispatchEvent(new Event("load"))

        expect(selChildren(shadow).length).toBe(2) // selection survived the manifest swap (still fill+edge)
        // The ring is drawn at index 1's NEW position (cx=700) — not its stale pre-swap position
        // (900), and not index 0's new position (0), which is what a selected= re-hydration bug
        // would show instead.
        const drawn = selChildren(shadow).find((el) => el.tagName.toLowerCase() === "circle")
        expect(drawn?.getAttribute("cx")).toBe("700")
        expect(fired).toBe(false) // §12.3: the DRAG itself still commits nothing, even once a frame has landed
    })
})

// Overlay visual recipes (locked — a color-dodge fill of #141414 plus a flat chrome edge,
// #7a7a7a on a light figure and #c8c8c8 on a dark one; see CLAUDE.md — do not reopen).
// Units are necessary, not live-verify: agents still run
// docs/dev/live-interaction-checklist.md (kind_sweep.mjs + polish_verify.mjs)
// on Cairo and WGL for interaction AND visual.
describe("overlay visual polish", () => {
    it("keeps the hover node across mousemove on the same marker", async () => {
        const { host, script } = setup()
        mount(script, manifest)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        const a = edgeHiGroup(shadow).firstElementChild as SVGElement // plain circle, no style.stroke → edge side (the stroke half)
        expect(a.classList.contains("masque-enter")).toBe(true)
        // still inside r=20 at image (600,400); scale 2 → client (301,201) = image (602,402)
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 301, clientY: 201, bubbles: true }))
        await flushFrame()
        const b = edgeHiGroup(shadow).firstElementChild as SVGElement
        expect(b).toBe(a)
    })

    it("does not re-animate a same-key selection when the wash remounts", async () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "img", kind: "grid", axis: "ax1", events: ["hover"], payloads: [],
                    geometry: { xedges: [0, 200, 400, 600], yedges: [0, 200, 400, 600], ncols: 3, nrows: 3 } },
                { id: "roi", kind: "roi", axis: "ax1", events: ["drag"], payloads: [],
                    selects: "img", geometry: { x: 100, y: 100, w: 300, h: 300, handle: 16 } },
            ],
        })
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 125, clientY: 125, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 130, clientY: 125, bubbles: true }))
        const a = fillSelGroup(shadow).firstElementChild as SVGElement // rectfill → fill-only
        expect(a.classList.contains("masque-enter")).toBe(true)
        // rAF-coalesced: this second move lands on the trailing frame from the first, not synchronously.
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 135, clientY: 125, bubbles: true }))
        await flushFrame()
        const b = fillSelGroup(shadow).firstElementChild as SVGElement
        expect(b).not.toBe(a)
        expect(b.classList.contains("masque-enter")).toBe(false)
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 135, clientY: 125, bubbles: true }))
    })

    it("an explicit layer hoverstyle stroke sets --masque-hi-stroke verbatim, unwrapped (no blend)", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "pts", kind: "circles", geometry: [300, 200, 20],
                payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"], selected: [0],
                style: { stroke: "#123456", width: 2 },
            }],
        })
        // An explicit style.stroke → the unblended plain path: bare circle in svg.masque-plain,
        // no fill/edge svgs involved.
        const el = plainSelGroup(shadowOf(host)).firstElementChild as SVGElement
        expect(el.tagName.toLowerCase()).toBe("circle")
        expect(el.classList.contains("masque-wash")).toBe(true)
        expect(el.style.getPropertyValue("--masque-hi-stroke")).toBe("#123456")
        expect(fillSelGroup(shadowOf(host)).children.length).toBe(0) // nothing landed on the fill side
        expect(edgeSelGroup(shadowOf(host)).children.length).toBe(0) // nothing landed on the edge side
    })

    it("a plain mark with no colors and no style still gets a hover highlight, split across fill+edge", () => {
        const { host, script } = setup()
        mount(script, manifest)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        const fillEl = fillHiGroup(shadowOf(host)).firstElementChild as SVGElement
        const edgeEl = edgeHiGroup(shadowOf(host)).firstElementChild as SVGElement
        expect(fillEl.tagName.toLowerCase()).toBe("circle")
        expect(edgeEl.tagName.toLowerCase()).toBe("circle")
        expect(fillEl.style.getPropertyValue("--masque-hi-stroke")).toBe("")
        expect(edgeEl.style.getPropertyValue("--masque-hi-stroke")).toBe("")
        expect(plainHiGroup(shadowOf(host)).children.length).toBe(0) // nothing landed on the plain side
    })

    it("fades hover chrome out instead of instant remove", async () => {
        const { host, script } = setup()
        mount(script, manifest)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        // closed mark, no style.stroke → both fill and edge shapes fade together, as one unit.
        const leavingFill = fillHiGroup(shadow).firstElementChild as SVGElement
        const leavingEdge = edgeHiGroup(shadow).firstElementChild as SVGElement
        expect(leavingFill.classList.contains("masque-leave")).toBe(true)
        expect(leavingEdge.classList.contains("masque-leave")).toBe(true)
        await new Promise((r) => setTimeout(r, 120))
        expect(hiChildren(shadow).length).toBe(0)
    })

    it("hover on a closed mark splits into a fill shape (svg.masque-fill) and a stroke shape (svg.masque-edge), no colour/fill attributes, 1.5px, opaque", () => {
        const { host, script } = setup()
        mount(script, manifest)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        const fillEl = fillHiGroup(shadow).firstElementChild as SVGElement
        const edgeEl = edgeHiGroup(shadow).firstElementChild as SVGElement
        expect(fillEl.tagName.toLowerCase()).toBe("circle")
        expect(fillEl.classList.contains("masque-hi")).toBe(true)
        expect(fillEl.classList.contains("masque-fillshape")).toBe(true)
        expect(fillEl.getAttribute("fill")).toBeNull() // the svg.masque-fill stylesheet rule handles the tint
        expect(fillEl.closest("svg")!.classList.contains("masque-fill")).toBe(true)

        expect(edgeEl.tagName.toLowerCase()).toBe("circle")
        expect(edgeEl.classList.contains("masque-hi")).toBe(true)
        expect(edgeEl.classList.contains("masque-hover")).toBe(true)
        expect(edgeEl.classList.contains("masque-wash")).toBe(false)
        expect(edgeEl.getAttribute("stroke")).toBeNull() // colour comes from the stylesheet, not a presentation attribute
        expect(edgeEl.getAttribute("stroke-width")).toBe("1.5")
        expect(edgeEl.getAttribute("stroke-opacity")).toBeNull() // fully opaque
        // The stroke lives in svg.masque-edge; that svg does not blend.
        expect(edgeEl.closest("svg")!.classList.contains("masque-edge")).toBe(true)
    })

    it("hover on an open (seg) mark is edge-only — a line has no interior, so no fill shape is drawn", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "segs", kind: "segments", geometry: [100, 100, 400, 200],
                payloads: [{ i: 0 }], axis: "ax1", events: ["hover"],
            }],
        })
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 125, clientY: 75, bubbles: true }))
        const el = edgeHiGroup(shadowOf(host)).firstElementChild as SVGElement
        expect(el.tagName.toLowerCase()).toBe("line")
        expect(el.classList.contains("masque-hi")).toBe(true)
        expect(el.classList.contains("masque-hover")).toBe(true)
        expect(el.getAttribute("fill")).toBeNull()
        expect(el.getAttribute("stroke-width")).toBe("1.5")
        expect(fillHiGroup(shadowOf(host)).children.length).toBe(0) // no fill shape for an open mark
    })

    it("hovering an already-selected mark draws no hover highlight, but still shows its tooltip", async () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "pts", kind: "circles", geometry: [300, 200, 20],
                payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"], selected: [0],
            }],
        })
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        // the selected wash is already drawn at mount
        expect(edgeSelGroup(shadow).children.length).toBe(1)
        // circle centre is image (300,200); display scale 1200/600=2 -> client (150,100)
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 150, clientY: 100, bubbles: true }))
        await flushFrame()
        // no hover chrome anywhere — a 1.5px hover stroke over the 2px selected stroke would
        // thin the highlight, not add to it
        expect(hiChildren(shadow).length).toBe(0)
        // the selected wash is unaffected
        expect(edgeSelGroup(shadow).children.length).toBe(1)
        // the tooltip still shows — only the highlight is skipped
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        expect(tip.classList.contains("show")).toBe(true)
    })

    it("selected closed geometry splits too: wash class + 2px stroke on the edge shape, geometry r exactly on both (edge outline, not a halo)", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "pts", kind: "circles", geometry: [300, 200, 20],
                payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"], selected: [0],
            }],
        })
        const fillEl = fillSelGroup(shadowOf(host)).firstElementChild as SVGElement
        const edgeEl = edgeSelGroup(shadowOf(host)).firstElementChild as SVGElement
        expect(fillEl.tagName.toLowerCase()).toBe("circle")
        expect(fillEl.classList.contains("masque-fillshape")).toBe(true)
        expect(fillEl.getAttribute("fill")).toBeNull()
        expect(fillEl.getAttribute("r")).toBe("20")

        expect(edgeEl.tagName.toLowerCase()).toBe("circle")
        expect(edgeEl.classList.contains("masque-hi")).toBe(true)
        expect(edgeEl.classList.contains("masque-wash")).toBe(true)
        expect(edgeEl.getAttribute("fill")).toBeNull()
        expect(edgeEl.getAttribute("stroke")).toBeNull()
        expect(edgeEl.getAttribute("stroke-width")).toBe("2")
        expect(edgeEl.getAttribute("stroke-opacity")).toBeNull()
        // outline sits ON the mark's own edge now, not a halo outside it (was r + 2)
        expect(edgeEl.getAttribute("r")).toBe("20")
        expect(edgeEl.getAttribute("cx")).toBe("300")
        expect(edgeEl.getAttribute("cy")).toBe("200")
    })

    it("hover outline uses the geometry r exactly, concentric with the marker", () => {
        const { host, script } = setup()
        mount(script, manifest)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        const el = edgeHiGroup(shadowOf(host)).firstElementChild as SVGElement
        expect(el.getAttribute("r")).toBe("20") // geometry r=20, on the mark edge (no +2)
        expect(el.getAttribute("cx")).toBe("600")
        expect(el.getAttribute("cy")).toBe("400")
    })

    it("pins the overlay box to the base, not a smaller host (WGL/DPR offset)", () => {
        // Live bug: WGLMakie can size the <canvas> wider than .ip-host. Overlay was inset:0
        // on the host, so g.sel sat left of the marker. Pin to the base rect.
        const host = document.createElement("div")
        host.getBoundingClientRect = () =>
            ({ left: 10, top: 20, width: 680, height: 320, right: 690, bottom: 340, x: 10, y: 20, toJSON() {} }) as DOMRect
        const canvas = document.createElement("canvas")
        canvas.getBoundingClientRect = () =>
            ({ left: 10, top: 20, width: 720, height: 320, right: 730, bottom: 340, x: 10, y: 20, toJSON() {} }) as DOMRect
        const script = document.createElement("script")
        host.append(canvas, script)
        document.body.append(host)
        mount(script, {
            width: 1440, height: 640, scaling: 2, transforms: {},
            layers: [{
                id: "pts", kind: "circles", geometry: [100, 100, 20],
                payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"], selected: [0],
            }],
        })
        const overlay = host.lastElementChild as HTMLElement
        expect(overlay.style.width).toBe("720px")
        expect(overlay.style.height).toBe("320px")
        expect(overlay.style.left).toBe("0px")
        expect(overlay.style.top).toBe("0px")
        const sel = edgeSelGroup(shadowOf(host)).firstElementChild as SVGElement // plain circle, no style.stroke → fill+edge split
        expect(sel.getAttribute("cx")).toBe("100")
        expect(sel.getAttribute("cy")).toBe("100")
    })

    it("remount with a new selected= paints g.sel for the new index (click → bond → selected=)", () => {
        const { host, script } = setup()
        const layer = (sel: number[]): HitLayer => ({
            id: "pts", kind: "circles", geometry: [300, 200, 20, 600, 400, 20],
            payloads: [{ i: 0 }, { i: 1 }], axis: "ax1", events: ["click", "hover"], selected: [sel[0]],
        })
        const m = (sel: number[]): Manifest =>
            ({ width: 1200, height: 800, scaling: 2, transforms: {}, layers: [layer(sel)] })
        let resolve!: () => void
        const inval = new Promise<void>((r) => { resolve = r })
        mount(script, m([0]), inval)
        expect((edgeSelGroup(shadowOf(host)).firstElementChild as SVGElement).getAttribute("cx")).toBe("300")
        resolve()
        return inval.then(() => Promise.resolve()).then(() => {
            const script2 = document.createElement("script")
            host.append(script2)
            mount(script2, m([1]))
            const el = edgeSelGroup(shadowOf(host)).firstElementChild as SVGElement
            expect(el.getAttribute("cx")).toBe("600")
            expect(el.getAttribute("cy")).toBe("400")
            expect(el.classList.contains("masque-wash")).toBe(true)
            expect(el.getAttribute("r")).toBe("20")
        })
    })

    it("selected open geometry gets a ring (inner 2px + outer ~4px, class-based colour, fill none)", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "segs", kind: "segments", geometry: [100, 100, 400, 200],
                payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"], selected: [0],
            }],
        })
        // Selected open geometry always renders as the unblended ring, in svg.masque-plain.
        const node = plainSelGroup(shadowOf(host)).firstElementChild as SVGElement
        const lines = node.tagName.toLowerCase() === "g"
            ? [...node.querySelectorAll("line")]
            : [node]
        expect(lines.length).toBe(2)
        expect(lines.every((ln) => ln.classList.contains("masque-hi"))).toBe(true)
        expect(lines.every((ln) => ln.getAttribute("fill") === null)).toBe(true)
        expect(lines.every((ln) => ln.getAttribute("stroke") === null)).toBe(true)
        const widths = lines.map((ln) => ln.getAttribute("stroke-width")).sort()
        expect(widths).toEqual(["2", "4"])
        const outer = lines.find((ln) => ln.getAttribute("stroke-width") === "4")!
        expect(outer.getAttribute("stroke-opacity")).toBe("0.25")
    })

    it("threshold line gets masque-hi with no explicit --masque-hi-stroke when style is missing", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "thr", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { orientation: "h", pos: 400, span: [0, 1200] } }],
        })
        const line = shadowOf(host).querySelector("line") as SVGLineElement
        expect(line.classList.contains("masque-hi")).toBe(true)
        expect(line.getAttribute("stroke")).toBeNull()
        expect(line.style.getPropertyValue("--masque-hi-stroke")).toBe("")
    })

    it("tooltip show/hide uses a class so opacity can fade", () => {
        const { host, script } = setup()
        mount(script, manifest)
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        const surface = shadow.querySelector(".surface") as HTMLElement
        expect(tip.classList.contains("show")).toBe(false)
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(true)
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        expect(tip.classList.contains("show")).toBe(false)
    })

    it("overlay CSS honors prefers-reduced-motion", () => {
        const { host, script } = setup()
        mount(script, manifest)
        const css = shadowOf(host).querySelector("style")!.textContent!
        expect(css).toMatch(/prefers-reduced-motion:\s*reduce/)
        expect(css).toMatch(/opacity/)
    })

    it("tooltip CSS follows prefers-color-scheme (Pluto's only theme signal), not alert red", () => {
        const { host, script } = setup()
        mount(script, manifest)
        const css = shadowOf(host).querySelector("style")!.textContent!
        expect(css).toMatch(/prefers-color-scheme:\s*dark/)
        expect(css).toMatch(/#1e1e1e/)
        expect(css).toMatch(/#e8e8e8/)
        expect(css).toMatch(/#ffffff/)
        expect(css).not.toMatch(/#ff3b30/)
    })

    it("overlay CSS defines chrome ink, an unblended edge stroke, and the dodge-fill fallback", () => {
        const { host, script } = setup()
        mount(script, manifest)
        const css = shadowOf(host).querySelector("style")!.textContent!
        expect(css).toMatch(/--masque-ink/)
        expect(css).toMatch(/--masque-chrome/)
        expect(css).toMatch(/--masque-hi-stroke/)
        expect(css).toMatch(/\.masque-handle/)
        expect(css).toMatch(/svg\.masque-fill \{ mix-blend-mode: color-dodge/)
        expect(css).not.toMatch(/svg\.masque-edge \{ mix-blend-mode:/)
        expect(css).toMatch(/--masque-hi-c: var\(--masque-hi-stroke, var\(--masque-chrome\)\)/)
        expect(css).toMatch(/@supports not \(mix-blend-mode: color-dodge\) \{\s*svg\.masque-fill \.masque-hi\.masque-fillshape \{ fill: var\(--masque-chrome\); fill-opacity: 0\.18; \}/)
    })

    it("does not rewrite tooltip HTML on same-hit mousemove", async () => {
        const { host, script } = setup()
        mount(script, manifest)
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(true)
        const html = tip.innerHTML
        let writes = 0
        const desc = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML")!
        Object.defineProperty(tip, "innerHTML", {
            configurable: true,
            get() { return html },
            set(v: string) { writes++; desc.set!.call(this, v) },
        })
        const left0 = tip.style.left, top0 = tip.style.top
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 301, clientY: 201, bubbles: true }))
        await flushFrame()
        expect(writes).toBe(0)
        expect(tip.innerHTML).toBe(html)
        // Mark-anchored, not cursor-following: a circle's anchor is its own centre/top edge, so
        // moving the cursor within the same circle must NOT move the tooltip.
        expect(tip.style.left).toBe(left0)
        expect(tip.style.top).toBe(top0)
    })

    it("does not remeasure the tip on same-hit mousemove", async () => {
        const { host, script } = setup()
        mount(script, manifest)
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        const surface = shadow.querySelector(".surface") as HTMLElement
        let sizeReads = 0
        Object.defineProperty(tip, "offsetWidth", { configurable: true, get() { sizeReads++; return 120 } })
        Object.defineProperty(tip, "offsetHeight", { configurable: true, get() { sizeReads++; return 40 } })
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(sizeReads).toBeGreaterThan(0)
        const afterFirst = sizeReads
        const left0 = tip.style.left, top0 = tip.style.top
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 301, clientY: 201, bubbles: true }))
        await flushFrame()
        expect(sizeReads).toBe(afterFirst)
        // Mark-anchored: the tooltip position is derived from the circle's own geometry, not the
        // cursor, so it stays put while the cursor moves within the same circle.
        expect(tip.style.left).toBe(left0)
        expect(tip.style.top).toBe(top0)
    })

    it("remeasures the tip after a zero first layout and shifts it inside the surface via the caret, not flip-x", async () => {
        const { host, script } = setup()
        // same-hit HTML: a circle near the 600×400 surface corner (image 1160,760 → client 580,380)
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{ id: "pts", kind: "circles", geometry: [1160, 760, 20], payloads: [{ i: 0 }],
                axis: "ax1", events: ["click", "hover"] }],
        })
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 580, clientY: 380, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.classList.contains("flip-x")).toBe(false) // never used by the anchored path
        Object.defineProperty(tip, "offsetWidth", { configurable: true, value: 220 })
        Object.defineProperty(tip, "offsetHeight", { configurable: true, value: 80 })
        Object.defineProperty(surface, "clientWidth", { configurable: true, value: 600 })
        Object.defineProperty(surface, "clientHeight", { configurable: true, value: 400 })
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 581, clientY: 381, bubbles: true }))
        await flushFrame()
        // anchor css (580,380), top css 370: box fits above (280 >= EDGE_GAP) so it stays above
        // the mark (flip-y set — its "caret points down" meaning, not the cursor-following sense)
        // but the 220px-wide box centred on x=580 would clip the 600px-wide surface's right edge,
        // so it's shifted left and the caret moves to stay over the anchor instead of flip-x.
        expect(tip.classList.contains("flip-x")).toBe(false)
        expect(tip.classList.contains("flip-y")).toBe(true)
        expect(tip.style.left).toBe("372px")
        expect(tip.style.top).toBe("280px")
        expect(tip.style.getPropertyValue("--masque-caret-x")).toBe("208px")
    })

    it("a segment tooltip slides along the line as the pointer moves within the same hit", async () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{ id: "seg", kind: "segments", geometry: [0, 0, 1000, 0], payloads: [{ v: 1 }], axis: "ax1", events: ["hover"] }],
        })
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        const surface = shadow.querySelector(".surface") as HTMLElement
        // image (100,0) == client (50,0); still the same segment, hit-tol away from the line
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 50, clientY: 0, bubbles: true }))
        expect(tip.style.left).toBe("50px") // anchor.x = 100 image px -> 50 css px
        // image (400,0) == client (200,0): same hit, different point on the line
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 0, bubbles: true }))
        await flushFrame()
        expect(tip.style.left).toBe("200px")
    })

    it("a rect (bar) tooltip anchors at its top-centre, not its centre", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{ id: "bars", kind: "rects", geometry: [600, 400, 100, 200], payloads: [{ v: 1 }], axis: "ax1", events: ["hover"] }],
        })
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        // cy(400) - h/2(100) = 300 image px -> 150 css px; degenerate branch: left=x, top=top-10
        expect(tip.style.left).toBe("300px")
        expect(tip.style.top).toBe("140px")
    })

    it("coalesces extra same-frame mousemove to the last event", async () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 5], ylims: [0, 5], xscale: "identity", yscale: "identity",
                viewport: [100, 100, 400, 400], xreversed: false, yreversed: false } },
            layers: [{ id: "axis", kind: "axis", geometry: null, payloads: [], axis: "ax1", events: ["hover"] }],
        })
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        const surface = shadow.querySelector(".surface") as HTMLElement
        let writes = 0
        const desc = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML")!
        Object.defineProperty(tip, "innerHTML", {
            configurable: true,
            get() { return desc.get!.call(this) },
            set(v: string) { writes++; desc.set!.call(this, v) },
        })
        for (let i = 0; i < 8; i++) {
            surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200 + i, clientY: 200, bubbles: true }))
        }
        expect(writes).toBeLessThan(8)
        await new Promise<void>((r) => requestAnimationFrame(() => r()))
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.innerHTML).toContain("x=")
    })

    it("clamps the tip and flips the caret near the bottom-right edge", async () => {
        const { host, script } = setup()
        // axis layer: hover anywhere inside the viewport so we can park the cursor at the edge
        mount(script, {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 10], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "axis", kind: "axis", geometry: null, payloads: [], axis: "ax1", events: ["hover"] }],
        })
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        const surface = shadow.querySelector(".surface") as HTMLElement
        Object.defineProperty(tip, "offsetWidth", { configurable: true, value: 220 })
        Object.defineProperty(tip, "offsetHeight", { configurable: true, value: 80 })
        Object.defineProperty(surface, "clientWidth", { configurable: true, value: 600 })
        Object.defineProperty(surface, "clientHeight", { configurable: true, value: 400 })
        // client (580, 380) is inside the axis viewport and near the 600×400 surface corner
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 580, clientY: 380, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.classList.contains("flip-x")).toBe(true)
        expect(tip.classList.contains("flip-y")).toBe(true)
        const left = parseFloat(tip.style.left)
        const top = parseFloat(tip.style.top)
        expect(left + 220).toBeLessThanOrEqual(600)
        expect(top + 80).toBeLessThanOrEqual(400)
        expect(left).toBeGreaterThanOrEqual(0)
        expect(top).toBeGreaterThanOrEqual(0)
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        expect(tip.classList.contains("show")).toBe(false)
        expect(tip.classList.contains("flip-x")).toBe(true)
        expect(tip.classList.contains("flip-y")).toBe(true)
        await new Promise((r) => setTimeout(r, 120))
        expect(tip.classList.contains("flip-x")).toBe(false)
        expect(tip.classList.contains("flip-y")).toBe(false)
    })
})

describe("coverage gaps: grid-value tooltip, drag-target hover cursor, rects/polygons selected=, unsupported selects target", () => {
    it("grid hover tooltip shows '(i,j) = value' when values[] is present (not the no-value branch)", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{ id: "hm", kind: "grid", axis: "ax1", events: ["hover"], payloads: [],
                geometry: { xedges: [0, 10, 20], yedges: [0, 10, 20], ncols: 2, nrows: 2, values: [11, 12, 21, 22] } }],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        // scale = 1200/600 = 2 → client (7.5, 2.5) = image (15, 5), wire cell i=1,j=0 → values[0*2+1]=12
        // The tooltip prints the Julia 1-based cell, (2, 1).
        ;(shadow.querySelector(".surface") as HTMLElement)
            .dispatchEvent(new PointerEvent("pointermove", { clientX: 7.5, clientY: 2.5, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.innerHTML).toBe("(2,1) = 12")
    })

    it("grid sample hover shows the pixel-center value, and a NaN sample shows nothing", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{ id: "hm", kind: "grid", axis: "ax1", events: ["hover"], payloads: [],
                geometry: {
                    xedges: [0, 10, 20, 30], yedges: [0, 20], ncols: 3, nrows: 1,
                    sample: [7, 8], sncols: 2, snrows: 1,
                    sample_origin: [0, 0], sample_span: [30, 20], sample_px: 15,
                } }],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        const surface = shadow.querySelector(".surface") as HTMLElement
        // scale = 1200/600 = 2 → client (7.5, 5) = image (15, 10), the left edge of sample (1, 0).
        // That sample spans image x [15, 30], so its center is 22.5, source bin i=2 (between 20 and 30).
        // Tooltip is 1-based (3, 1) = the stored sample value 8.
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 7.5, clientY: 5, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.innerHTML).toBe("(3,1) = 8")
        const hi = shadow.querySelector("svg.masque-edge .masque-hi") as SVGRectElement
        expect(hi).not.toBeNull()
        expect(hi.getAttribute("width")).toBe("15")
        // An in-grid NaN is still that cell. A second move on the same mount is rAF-deferred,
        // so this is a fresh widget. Image (15, 10) is sample 1, center 22.5, source bin i=2.
        const nanM: Manifest = {
            ...m,
            layers: [{ ...m.layers[0], geometry: { ...(m.layers[0].geometry as GridGeometry), sample: [7, NaN] } }],
        }
        const host2 = setup()
        mount(host2.script, nanM)
        const shadow2 = shadowOf(host2.host)
        const tip2 = shadow2.querySelector(".masque-tip") as HTMLElement
        ;(shadow2.querySelector(".surface") as HTMLElement)
            .dispatchEvent(new PointerEvent("pointermove", { clientX: 7.5, clientY: 5, bubbles: true }))
        expect(tip2.classList.contains("show")).toBe(true)
        expect(tip2.innerHTML).toBe("(3,1) = NaN")
        expect(shadow2.querySelector("svg.masque-edge .masque-hi")).not.toBeNull()
        // The same point is a miss when the source edges stop before the sample center.
        const miss: Manifest = {
            ...m,
            layers: [{
                ...m.layers[0],
                geometry: {
                    ...(m.layers[0].geometry as GridGeometry),
                    xedges: [0, 10], ncols: 1, sample: [NaN, NaN],
                },
            }],
        }
        const host3 = setup()
        mount(host3.script, miss)
        const tip3 = shadowOf(host3.host).querySelector(".masque-tip") as HTMLElement
        ;(shadowOf(host3.host).querySelector(".surface") as HTMLElement)
            .dispatchEvent(new PointerEvent("pointermove", { clientX: 7.5, clientY: 5, bubbles: true }))
        expect(tip3.classList.contains("show")).toBe(false)
    })

    it("grid hover tooltip shows '(i,j)' with no value when values[] was dropped", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{ id: "hm", kind: "grid", axis: "ax1", events: ["hover"], payloads: [],
                geometry: { xedges: [0, 10, 20], yedges: [0, 10, 20], ncols: 2, nrows: 2 } }], // no values
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        ;(shadow.querySelector(".surface") as HTMLElement)
            .dispatchEvent(new PointerEvent("pointermove", { clientX: 7.5, clientY: 2.5, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.innerHTML).toBe("(2,1)")
    })

    it("hovering a drag-only target (no button pressed) shows a directional resize cursor and suppresses hover/tooltip", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "thr", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { orientation: "h", pos: 400, span: [0, 1200] } }],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        const line = shadow.querySelector("line") as SVGLineElement
        // client (300,200) = image (600,400), exactly on the threshold line — a drag hit with no pointerdown
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        // A horizontal threshold resizes vertically → ns-resize, not the generic grab cursor.
        expect(surface.classList.contains("cur-ns")).toBe(true)
        expect(surface.classList.contains("grab")).toBe(false)
        expect(surface.classList.contains("hot")).toBe(false)
        expect(tip.classList.contains("show")).toBe(false)
        expect(line.classList.contains("hovered")).toBe(true) // thicker-stroke hover chrome
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        expect(surface.classList.contains("cur-ns")).toBe(false)
        expect(line.classList.contains("hovered")).toBe(false)
    })

    it("a vertical threshold shows ew-resize on hover, not ns-resize", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [{ id: "thr", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { orientation: "v", pos: 600, span: [0, 800] } }],
        }
        const { host, script } = setup()
        mount(script, m)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        // client (300,200) = image (600,400), on the vertical threshold line
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true }))
        expect(surface.classList.contains("cur-ew")).toBe(true)
        expect(surface.classList.contains("cur-ns")).toBe(false)
    })

    it("selected= on a rects layer pre-highlights the right rect (hitLayerByIndex rects branch)", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{ id: "bars", kind: "rects", geometry: [100, 100, 40, 20, 300, 100, 40, 20],
                payloads: [{ i: 0 }, { i: 1 }], axis: "ax1", events: ["click", "hover"], selected: [1] }],
        })
        const edgeEl = edgeSelGroup(shadowOf(host)).firstElementChild as SVGElement // no style.stroke → fill+edge split
        expect(edgeEl.tagName.toLowerCase()).toBe("rect")
        expect(edgeEl.getAttribute("x")).toBe("280") // cx(300) - w/2(20)
        expect(edgeEl.getAttribute("y")).toBe("90")  // cy(100) - h/2(10)
        expect(edgeEl.getAttribute("width")).toBe("40")
        expect(edgeEl.getAttribute("height")).toBe("20")
        // An element-indexed rects selection keeps its stroke (edge shape) — only the grid
        // cell-block union rect from an ROI's `selects` (a distinct "rectfill" geom tag) is
        // fill-only, with no edge shape at all.
        expect(edgeEl.classList.contains("masque-hi")).toBe(true)
        expect(edgeEl.classList.contains("masque-nostroke")).toBe(false)
        expect(fillSelGroup(shadowOf(host)).firstElementChild).toBeTruthy() // fill shape also present
    })

    it("selected= on a polygons layer draws a polygon wash (hitLayerByIndex + makeHiElement poly branch)", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{ id: "polys", kind: "polygons", geometry: [[0, 0, 10, 0, 10, 10, 0, 10]],
                payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"], selected: [0] }],
        })
        const el = edgeSelGroup(shadowOf(host)).firstElementChild as SVGElement // no style.stroke → fill+edge split
        expect(el.tagName.toLowerCase()).toBe("polygon")
        expect(el.getAttribute("points")).toBe("0,0 10,0 10,10 0,10")
        expect(el.classList.contains("masque-wash")).toBe(true) // closed kind → wash, not a ring
    })

    it("selected= on a polygon with a hole draws an even-odd path, not a filled polygon", () => {
        const { host, script } = setup()
        const outer = [0, 0, 40, 0, 40, 40, 0, 40]
        const hole = [10, 10, 30, 10, 30, 30, 10, 30]
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{ id: "polys", kind: "polygons", geometry: [[outer, hole]],
                payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"], selected: [0] }],
        })
        const edge = edgeSelGroup(shadowOf(host)).firstElementChild as SVGElement
        const fill = fillSelGroup(shadowOf(host)).firstElementChild as SVGElement
        for (const el of [edge, fill]) {
            expect(el.tagName.toLowerCase()).toBe("path")
            expect(el.getAttribute("fill-rule")).toBe("evenodd")
            expect(el.getAttribute("d")).toBe("M0 0L40 0L40 40L0 40ZM10 10L30 10L30 30L10 30Z")
        }
        expect(edge.classList.contains("masque-wash")).toBe(true)
        expect(fill.classList.contains("masque-fillshape")).toBe(true)
    })

    it("plain axis hover on a categorical x-axis formats the label via String(), not toPrecision", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [1, 3], ylims: [0, 5], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false, xcats: ["a", "b", "c"] } },
            layers: [{ id: "axis", kind: "axis", geometry: null, payloads: [], axis: "ax1", events: ["hover"] }],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        // client (0,200) → image (0,400): leftmost x fraction → category "a"
        ;(shadow.querySelector(".surface") as HTMLElement)
            .dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 200, bubbles: true }))
        expect(tip.classList.contains("show")).toBe(true)
        expect(tip.innerHTML).toContain("x=a")
    })

    it("a selects-ROI targeting an unsupported kind emits an empty selection (computeSelection fallback)", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "segs", kind: "segments", geometry: [100, 100, 500, 500], payloads: [{ i: 0 }], axis: "ax1", events: ["hover"] },
                { id: "roi", kind: "roi", axis: "ax1", events: ["drag"], payloads: [],
                    selects: "segs", geometry: { x: 0, y: 0, w: 800, h: 800, handle: 16 } },
            ],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        let committed: { items: unknown[] } | null = null
        host.addEventListener("input", () => {
            committed = (host as unknown as { value: typeof committed }).value
        })
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 50, clientY: 50, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 50, clientY: 50, bubbles: true }))
        expect(committed!.items).toEqual([])
        expect(selChildren(shadow).length).toBe(0)
    })
})

describe("click-echo (#103)", () => {
    it("clicking an element-indexed mark draws the selected recipe in g.sel; g.hi stays empty", () => {
        const { host, script } = setup()
        mount(script, manifest) // module-level `manifest`: one circle at image (600,400), click+hover
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 200, bubbles: true }))
        const edge = edgeSelGroup(shadow).firstElementChild as SVGElement
        expect(edge.classList.contains("masque-wash")).toBe(true)
        const fill = fillSelGroup(shadow).firstElementChild as SVGElement
        expect(fill.classList.contains("masque-fillshape")).toBe(true)
        expect(hiChildren(shadow).length).toBe(0)
    })

    it("click mark A then click mark B leaves only B echoed (last pick wins), replacing the selected= hydration", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "pts", kind: "circles", geometry: [200, 200, 20, 600, 400, 20, 900, 600, 20],
                payloads: [{ i: 0 }, { i: 1 }, { i: 2 }], axis: "ax1", events: ["click", "hover"],
                selected: [2],
            }],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        expect(edgeSelGroup(shadow).children.length).toBe(1) // hydration (index 2) alone
        // click index 0: image (200,200) -> client (100,100) — replaces the hydration outright
        surface.dispatchEvent(new MouseEvent("click", { clientX: 100, clientY: 100, bubbles: true }))
        let cxs = [...edgeSelGroup(shadow).children].map((el) => el.getAttribute("cx"))
        expect(cxs).toEqual(["200"]) // echo(0) alone, index 2's hydration is gone
        // click index 1: image (600,400) -> client (300,200) — replaces the echo in turn
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 200, bubbles: true }))
        cxs = [...edgeSelGroup(shadow).children].map((el) => el.getAttribute("cx"))
        expect(cxs).toEqual(["600"]) // echo(1) alone
    })

    it("mount hydration is replaced, not merged: a click after selected= leaves only the clicked hit", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "pts", kind: "circles", geometry: [200, 200, 20, 600, 400, 20, 900, 600, 20],
                payloads: [{ i: 0 }, { i: 1 }, { i: 2 }], axis: "ax1", events: ["click", "hover"],
                selected: [2],
            }],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        expect([...edgeSelGroup(shadow).children].map((el) => el.getAttribute("cx"))).toEqual(["900"]) // index 2, from selected=
        // click index 0: image (200,200) -> client (100,100)
        surface.dispatchEvent(new MouseEvent("click", { clientX: 100, clientY: 100, bubbles: true }))
        expect(edgeSelGroup(shadow).children.length).toBe(1)
        expect([...edgeSelGroup(shadow).children].map((el) => el.getAttribute("cx"))).toEqual(["200"]) // ONLY index 0
    })

    it("clicking an :axis region leaves a hydrated selection untouched (does not participate in the selection model)", () => {
        // Element layer FIRST: hitTest returns the first matching layer, and the axis's
        // geometry: null hits the whole viewport, so an axis-first ordering would swallow
        // clicks meant for the marks.
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 5], ylims: [0, 5], xscale: "identity", yscale: "identity",
                viewport: [100, 100, 400, 400], xreversed: false, yreversed: false } },
            layers: [
                { id: "pts", kind: "circles", geometry: [300, 200, 20, 900, 600, 20],
                    payloads: [{ i: 0 }, { i: 1 }], axis: "ax1", events: ["click", "hover"], selected: [0] },
                { id: "axis", kind: "axis", geometry: null, payloads: [], axis: "ax1", events: ["click", "hover"] },
            ],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        expect([...edgeSelGroup(shadow).children].map((el) => el.getAttribute("cx"))).toEqual(["300"]) // hydrated index 0
        // Empty plot area, away from either mark, inside the axis viewport: image (500,500) -> client (250,250)
        surface.dispatchEvent(new MouseEvent("click", { clientX: 250, clientY: 250, bubbles: true }))
        expect((host as unknown as { value: { layer: string } }).value.layer).toBe("axis") // confirm the click actually hit :axis
        expect([...edgeSelGroup(shadow).children].map((el) => el.getAttribute("cx"))).toEqual(["300"]) // untouched
    })

    it("clicking a mark then re-hovering it later never draws hover chrome (drawHi's selKeys_ guard)", async () => {
        const { host, script } = setup()
        mount(script, manifest)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 10, bubbles: true })) // move away
        await flushFrame()
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 200, bubbles: true })) // hover it again
        await flushFrame()
        expect(fillHiGroup(shadow).children.length).toBe(0)
        expect(edgeHiGroup(shadow).children.length).toBe(0)
        expect(plainHiGroup(shadow).children.length).toBe(0)
    })

    it("clicking a legend entry pins every element of its linked target layer, not the swatch", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [
                { id: "pts", kind: "circles", geometry: [600, 400, 20, 620, 420, 20], payloads: [{ i: 0 }, { i: 1 }], axis: "ax1", events: ["click", "hover"] },
                { id: "legend", kind: "rects", axis: "ax1", events: ["click", "hover"],
                    geometry: [100, 100, 40, 20], payloads: [{ name: "a" }], links: [["pts"]] },
            ],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        // legend rect image [80,120]x[90,110] -> client center (50,50)
        surface.dispatchEvent(new MouseEvent("click", { clientX: 50, clientY: 50, bubbles: true }))
        // "pts" has 2 circles, each closed hit splitting into fill + edge -> 2 * 2 = 4
        expect(selChildren(shadow).length).toBe(4)
        const cxs = [...edgeSelGroup(shadow).children].map((el) => el.getAttribute("cx")).sort()
        expect(cxs).toEqual(["600", "620"]) // the linked circles, not the legend swatch (which has no cx)
    })

    it("clicking a legend entry whose own links[index] is empty clears a previously-echoed mark", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [
                { id: "pts", kind: "circles", geometry: [600, 400, 20], payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"] },
                { id: "legend", kind: "rects", axis: "ax1", events: ["click", "hover"],
                    geometry: [100, 100, 40, 20], payloads: [{ name: "a" }], links: [[]] },
            ],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 200, bubbles: true })) // click pts: echoed
        expect(selChildren(shadow).length).toBe(2) // fill + edge
        // legend rect image [80,120]x[90,110] -> client center (50,50)
        surface.dispatchEvent(new MouseEvent("click", { clientX: 50, clientY: 50, bubbles: true }))
        expect(selChildren(shadow).length).toBe(0)
    })

    it("clicking a grid cell pins that cell's rect in g.sel, replacing a previously-echoed mark", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 10], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "pts", kind: "circles", geometry: [600, 400, 20], payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"] },
                { id: "g", kind: "grid", axis: "ax1", events: ["click", "hover"], payloads: [],
                    geometry: { xedges: [0, 600, 1200], yedges: [0, 400, 800], ncols: 2, nrows: 2 } },
            ],
        }
        const { host, script } = setup()
        mount(script, m)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 200, bubbles: true })) // click pts: echoed
        expect(selChildren(shadow).length).toBe(2)
        // grid cell far from the circle: image (300,600) -> client (150,300)
        surface.dispatchEvent(new MouseEvent("click", { clientX: 150, clientY: 300, bubbles: true }))
        // pts echo gone (last-pick-wins), replaced by the grid cell — a normal closed "rect" wash
        // (not the box-select "rectfill" union), so it still splits into fill + edge.
        expect(selChildren(shadow).length).toBe(2)
        const rect = edgeSelGroup(shadow).firstElementChild as SVGElement
        expect(rect.tagName.toLowerCase()).toBe("rect")
        expect(rect.getAttribute("width")).toBe("600")
        expect(rect.getAttribute("height")).toBe("400")
    })
})

// host.value is what Pluto reads at mount, before any click — mount() used to force it to null
// unconditionally, overwriting Julia's initial_value and losing the selected= hydration.
describe("host.value seeded at mount from selected= (bond hydration, not just g.sel)", () => {
    it("several indices on a scalar layer highlight only — host.value stays null", () => {
        const { host, script } = setup()
        const selManifest: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "pts", kind: "circles", geometry: [300, 200, 20, 600, 400, 20, 900, 600, 20],
                payloads: [{ i: 0 }, { i: 1 }, { i: 2 }], axis: "ax1", events: ["click", "hover"],
                selected: [0, 2],
            }],
        }
        mount(script, selManifest)
        expect((host as unknown as { value: unknown }).value).toBeNull()
        expect(selChildren(shadowOf(host)).length).toBeGreaterThan(0)
    })

    it("one hydrated index seeds {layer, index} and no payload", () => {
        const { host, script } = setup()
        const one: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [{
                id: "pts", kind: "circles", geometry: [300, 200, 20, 600, 400, 20],
                payloads: [{ i: 0 }, { i: 1 }], axis: "ax1", events: ["click", "hover"],
                selected: [1],
            }],
        }
        mount(script, one)
        expect((host as unknown as { value: unknown }).value).toEqual({ layer: "pts", index: 1 })
    })

    it("selection: elements seeds {items}, including an explicit empty brush", () => {
        const { host, script } = setup()
        const brushed: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            selection: "elements", selectionTarget: "pts",
            layers: [{
                id: "pts", kind: "circles", geometry: [300, 200, 20, 600, 400, 20, 900, 600, 20],
                payloads: [{ i: 0 }, { i: 1 }, { i: 2 }], axis: "ax1", events: ["click", "hover"],
                selected: [0, 2],
            }],
        }
        mount(script, brushed)
        expect((host as unknown as { value: unknown }).value).toEqual({
            items: [
                { layer: "pts", index: 0 },
                { layer: "pts", index: 2 },
            ],
        })
        const { host: host2, script: script2 } = setup()
        const empty: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            selection: "elements", selectionTarget: "pts", hydrate: "items",
            layers: [{
                id: "pts", kind: "circles", geometry: [300, 200, 20],
                payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"],
            }],
        }
        mount(script2, empty)
        expect((host2 as unknown as { value: unknown }).value).toEqual({ items: [] })
    })

    it("no layer bakes selected= -> host.value stays null (keeps Pluto's first-value dedup working)", () => {
        const { host, script } = setup()
        mount(script, manifest) // module-level `manifest`: no selected= anywhere
        expect((host as unknown as { value: unknown }).value).toBeNull()
    })

    it("hydration across two scalar layers is highlight-only", () => {
        const { host, script } = setup()
        const twoLayer: Manifest = {
            width: 1200, height: 800, scaling: 2, transforms: {},
            layers: [
                { id: "a", kind: "circles", geometry: [100, 100, 10, 200, 200, 10],
                    payloads: [{ v: "a0" }, { v: "a1" }], axis: "ax1", events: ["click", "hover"], selected: [1] },
                { id: "b", kind: "rects", geometry: [300, 300, 10, 10, 400, 400, 10, 10],
                    payloads: [{ v: "b0" }, { v: "b1" }], axis: "ax1", events: ["click", "hover"], selected: [0, 1] },
            ],
        }
        mount(script, twoLayer)
        expect((host as unknown as { value: unknown }).value).toBeNull()
    })
})

describe("crosshair", () => {
    const ax: Manifest["transforms"] = {
        ax1: {
            xlims: [0, 10], ylims: [0, 10], xscale: "identity", yscale: "identity",
            viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false,
        },
    }
    const move = (surface: HTMLElement, clientX: number, clientY: number) => {
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX, clientY, bubbles: true }))
    }
    const crossOn = (shadow: ShadowRoot) =>
        shadow.querySelector(".masque-cross")!.classList.contains("is-on")

    it("leaves a grid cell on its own tooltip, with no hair", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: ax,
            layers: [{
                id: "hm", kind: "grid", axis: "ax1", events: ["hover"], payloads: [],
                geometry: { xedges: [200, 600, 1000], yedges: [100, 400, 700], ncols: 2, nrows: 2, values: [1, 2, 3, 4] },
            }],
        })
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        move(surface, 200, 100) // image (400, 200): grid cell (1, 1)
        expect(crossOn(shadow)).toBe(false)
        expect(surface.classList.contains("hot")).toBe(false)
        expect((shadow.querySelector(".masque-tip") as HTMLElement).innerHTML).toBe("(1,1) = 1")
    })

    it("draws no hair on empty space inside the viewport", () => {
        const { host, script } = setup()
        mount(script, { width: 1200, height: 800, scaling: 2, transforms: ax, layers: [] })
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        move(surface, 10, 10)
        expect(crossOn(shadow)).toBe(false)
        expect(surface.classList.contains("hot")).toBe(false)
    })

    it("draws no hair on an axis readout inside the viewport", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: ax,
            layers: [{ id: "axis", kind: "axis", geometry: null, payloads: [], axis: "ax1", events: ["hover"] }],
        })
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        move(surface, 10, 10) // image (20, 20)
        expect(crossOn(shadow)).toBe(false)
        expect(surface.classList.contains("hot")).toBe(false)
        expect((shadow.querySelector(".masque-tip") as HTMLElement).innerHTML).toContain("x=")
    })

    it("hides the cross on a circle", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: ax,
            layers: [{
                id: "pts", kind: "circles", geometry: [600, 200, 20], payloads: [{ i: 7 }],
                axis: "ax1", events: ["click", "hover"],
            }],
        })
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        move(surface, 300, 100) // image (600, 200)
        expect(surface.classList.contains("hot")).toBe(true)
        expect(crossOn(shadow)).toBe(false)
        expect((shadow.querySelector(".masque-tip") as HTMLElement).innerHTML).toContain("7")
    })

    it("hides the cross on a threshold drag-hover and keeps that line first", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: ax,
            layers: [{
                id: "thr", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [],
                geometry: { orientation: "h", pos: 400, span: [0, 1200] },
            }],
        })
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        move(surface, 100, 200) // image (200, 400) sits on the horizontal threshold
        expect(crossOn(shadow)).toBe(false)
        expect(surface.classList.contains("cur-ns")).toBe(true)
        const line = shadow.querySelector("line") as SVGLineElement
        expect(line.getAttribute("y1")).toBe("400")
        expect(line.classList.contains("masque-threshold-line")).toBe(true)
    })

    it("a covered polygon keeps crosshair and the slice tooltip; a circle keeps its own", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: ax,
            layers: [
                {
                    id: "pts", kind: "circles", geometry: [100, 100, 15], payloads: [{ i: 3 }],
                    axis: "ax1", events: ["hover"],
                },
                {
                    id: "fill", kind: "polygons", axis: "ax1", events: ["hover"],
                    geometry: [[200, 200, 1000, 200, 1000, 600, 200, 600]],
                    payloads: [{ name: "the-fill" }],
                },
                {
                    id: "slice", kind: "slice", axis: "ax1", events: ["hover"], payloads: [],
                    geometry: {
                        orientation: "v", crosshair: true, covers: ["fill"],
                        series: [
                            { id: "wide", color: "rgb(20, 80, 160)", xy: [0, 0, 10, 10] },
                            { id: "narrow", xy: [0, 10, 10, 0] },
                        ],
                    },
                },
            ],
        })
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        move(surface, 300, 200) // image (600, 400) → data (5, 5); inside the polygon, on both series
        expect(crossOn(shadow)).toBe(true)
        expect(surface.classList.contains("hot")).toBe(false)
        expect(tip.innerHTML).toContain("wide")
        expect(tip.innerHTML).toContain("narrow")
        expect(tip.innerHTML).not.toContain("the-fill")
        expect(hiChildren(shadow).length).toBe(0)
        const dots = [...shadow.querySelectorAll(".masque-cross circle")] as SVGCircleElement[]
        expect(dots.length).toBe(2)
        expect(dots[0].style.fill).toBe("rgb(20, 80, 160)")
        expect(dots[0].getAttribute("r")).toBe("4")
        expect(getComputedStyle(dots[1]).fill).toBe("#b0b0b0")
        const hairs = [...shadow.querySelectorAll(".masque-cross-hair")] as SVGLineElement[]
        expect(hairs.map((el) => el.style.display)).toEqual(["", "none"])
        const halo = shadow.querySelector(".masque-cross-halo") as SVGLineElement
        expect(getComputedStyle(halo).strokeWidth).toBe("1.5")
        const hair = hairs[0]
        expect(Number(getComputedStyle(hair).strokeOpacity)).toBeCloseTo(0.8)
        expect(getComputedStyle(hair).stroke).toBe("#b0b0b0")
    })

    it("a circle beside a slice keeps pointer and its own tooltip", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: ax,
            layers: [
                {
                    id: "pts", kind: "circles", geometry: [100, 100, 15], payloads: [{ i: 3 }],
                    axis: "ax1", events: ["click", "hover"],
                },
                {
                    id: "slice", kind: "slice", axis: "ax1", events: ["hover"], payloads: [],
                    geometry: {
                        orientation: "v", crosshair: true, covers: ["fill"],
                        series: [{ id: "wide", xy: [0, 0, 10, 10] }],
                    },
                },
            ],
        })
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        move(surface, 50, 50) // image (100, 100)
        expect(surface.classList.contains("hot")).toBe(true)
        expect(crossOn(shadow)).toBe(false)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        expect(tip.innerHTML).toContain("3")
        expect(tip.innerHTML).not.toContain("wide")
    })

    it("a hover-only circle beside a slice gets no pointer and no hair, and keeps its own tooltip", () => {
        // A `selects` target ships without "click". It is not clickable, so no pointer, but it is
        // still a discrete mark: the hair stays off and the tooltip is the mark's, not the slice's.
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: ax,
            layers: [
                {
                    id: "pts", kind: "circles", geometry: [100, 100, 15], payloads: [{ i: 3 }],
                    axis: "ax1", events: ["hover"],
                },
                {
                    id: "slice", kind: "slice", axis: "ax1", events: ["hover"], payloads: [],
                    geometry: {
                        orientation: "v", crosshair: true, covers: ["fill"],
                        series: [{ id: "wide", xy: [0, 0, 10, 10] }],
                    },
                },
            ],
        })
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        move(surface, 50, 50) // image (100, 100)
        expect(surface.classList.contains("hot")).toBe(false)
        expect(crossOn(shadow)).toBe(false)
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        expect(tip.innerHTML).toContain("3")
        expect(tip.innerHTML).not.toContain("wide")
    })

    it("a horizontal slice draws only the horizontal hair", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: ax,
            layers: [{
                id: "slice", kind: "slice", axis: "ax1", events: ["hover"], payloads: [],
                geometry: {
                    orientation: "h", crosshair: true, covers: [],
                    series: [{ id: "wide", xy: [0, 0, 10, 10] }],
                },
            }],
        })
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        move(surface, 10, 10)
        expect(crossOn(shadow)).toBe(true)
        const hairs = [...shadow.querySelectorAll(".masque-cross-hair")] as SVGLineElement[]
        expect(hairs.map((el) => el.style.display)).toEqual(["none", ""])
    })

    it("crosshair false keeps the sample tooltip and dots and draws no hair", () => {
        const { host, script } = setup()
        mount(script, {
            width: 1200, height: 800, scaling: 2, transforms: ax,
            layers: [{
                id: "slice", kind: "slice", axis: "ax1", events: ["hover"], payloads: [],
                geometry: {
                    orientation: "v", crosshair: false, covers: [],
                    series: [{ id: "wide", xy: [0, 0, 10, 10] }],
                },
            }],
        })
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        move(surface, 10, 10) // image (20, 20) → data x = 20/1200*10
        expect(crossOn(shadow)).toBe(true)
        const hairs = [...shadow.querySelectorAll(".masque-cross-hair")] as SVGLineElement[]
        expect(hairs.every((el) => el.style.display === "none")).toBe(true)
        expect(shadow.querySelectorAll(".masque-cross circle").length).toBe(1)
        expect((shadow.querySelector(".masque-tip") as HTMLElement).innerHTML).toContain("wide")
    })
})

describe("photographic pan / wheel zoom", () => {
    const viewManifest = (mode: "pan" | "orbit"): Manifest => ({
        width: 1200, height: 800, scaling: 2,
        transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
            viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
        layers: [{ id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
            geometry: { x: 0, y: 0, w: 1200, h: 800, mode } }],
    })
    const wheelAt = (surface: HTMLElement, deltaY: number) => {
        // happy-dom's WheelEvent init ignores clientX/clientY. A real browser sets both.
        const ev = new WheelEvent("wheel", {
            bubbles: true, cancelable: true, deltaY, ctrlKey: true,
        })
        Object.defineProperty(ev, "clientX", { value: 300 })
        Object.defineProperty(ev, "clientY", { value: 200 })
        surface.dispatchEvent(ev)
        return ev
    }

    it("a wheel zoom scales the photograph inside the host and keeps the tooltip outside it", async () => {
        const { host, img, script } = setup()
        let release: (r: { png: Uint8Array; manifest: Manifest }) => void = () => {}
        const requestFrame = vi.fn(() => new Promise<{ png: Uint8Array; manifest: Manifest }>((r) => { release = r }))
        mount(script, viewManifest("pan"), undefined, requestFrame)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const shadowHost = host.lastElementChild as HTMLElement
        expect(shadowHost.style.width).toBe("600px")
        img.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 700, height: 400, right: 700, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
        const ev = wheelAt(surface, -120)
        expect(ev.defaultPrevented).toBe(true)
        expect(img.style.transform).toBe("")
        expect(host.querySelector(".masque-data-clip")).toBeTruthy()
        expect(host.dataset.masquePhoto).not.toBe("")
        expect(shadowHost.style.width).toBe("600px")
        const photo = shadow.querySelector("svg.masque-plain g.masque-photo") as SVGGElement
        expect(photo.getAttribute("transform")).toContain("scale(")
        expect(photo.querySelector("g.sel")).toBeTruthy()
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        expect(tip.closest("g.masque-photo")).toBeNull()
        expect(tip.textContent).toContain("x:[")
        await Promise.resolve()
        release({ png: new Uint8Array([1, 2, 3]), manifest: viewManifest("pan") })
        await Promise.resolve()
        await Promise.resolve()
        if (host.dataset.masquePhoto) img.dispatchEvent(new Event("load"))
        expect(host.dataset.masquePhoto).toBe("")
        expect(host.querySelector(".masque-data-clip")).toBeNull()
        expect(img.style.transform).toBe("")
        expect(photo.getAttribute("transform")).toBeNull()
        expect(shadowHost.style.width).toBe("700px")
    })

    it("a wheel zoom leaves the axis frame unscaled and clips the data to the viewport", () => {
        const { host, img, script } = setup()
        const m = viewManifest("pan")
        m.transforms.ax1.viewport = [100, 80, 1000, 640]
        const g = m.layers[0].geometry as { x: number; y: number; w: number; h: number }
        g.x = 100; g.y = 80; g.w = 1000; g.h = 640
        const requestFrame = vi.fn(async () => ({ png: new Uint8Array([1]) }))
        mount(script, m, undefined, requestFrame)
        img.getBoundingClientRect = () =>
            ({ left: 10, top: 20, width: 600, height: 400, right: 610, bottom: 420, x: 10, y: 20, toJSON() {} }) as DOMRect
        host.getBoundingClientRect = () =>
            ({ left: 10, top: 20, width: 600, height: 400, right: 610, bottom: 420, x: 10, y: 20, toJSON() {} }) as DOMRect
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        wheelAt(surface, -120)
        expect(img.style.transform).toBe("")
        const clip = host.querySelector(".masque-data-clip") as HTMLElement
        // viewport (100, 80, 1000, 640) on a 1200×800 image laid out at 600×400 → half scale
        expect(clip.style.left).toBe("50px")
        expect(clip.style.top).toBe("40px")
        expect(clip.style.width).toBe("500px")
        expect(clip.style.height).toBe("320px")
        const copy = clip.firstElementChild as HTMLElement
        expect(copy.style.transform).toContain("scale(")
        const clipped = shadowOf(host).querySelector("svg.masque-plain g.masque-clip") as SVGGElement
        expect(clipped.getAttribute("clip-path")).toBe("url(#masque-clip-plain)")
        const rect = shadowOf(host).querySelector("#masque-clip-plain rect") as SVGRectElement
        expect(rect.getAttribute("width")).toBe("1000")
        expect(rect.getAttribute("height")).toBe("640")
    })

    it("an orbit ignores the wheel, and a wheel during a drag does nothing", async () => {
        const { host, script } = setup()
        const requestFrame = vi.fn(async () => ({ png: new Uint8Array([1]) }))
        mount(script, viewManifest("orbit"), undefined, requestFrame)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        const ev = wheelAt(surface, -120)
        expect(ev.defaultPrevented).toBe(false)
        expect(host.dataset.masquePhoto ?? "").toBe("")
        await Promise.resolve()
        expect(requestFrame).not.toHaveBeenCalled()

        const pan = setup()
        const panFrame = vi.fn(async () => ({ png: new Uint8Array([1]) }))
        mount(pan.script, viewManifest("pan"), undefined, panFrame)
        const panSurface = shadowOf(pan.host).querySelector(".surface") as HTMLElement
        panSurface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }))
        const during = wheelAt(panSurface, -120)
        expect(during.defaultPrevented).toBe(false)
        expect(panFrame).not.toHaveBeenCalled()
    })

    it("a second notch inside 150ms settles once", async () => {
        vi.useFakeTimers()
        try {
            const { host, script } = setup()
            const requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({}))
            mount(script, viewManifest("pan"), undefined, requestFrame)
            const surface = shadowOf(host).querySelector(".surface") as HTMLElement
            const settles = () => requestFrame.mock.calls.filter((c) => c[0].settle === true)
            wheelAt(surface, -80)
            await vi.advanceTimersByTimeAsync(100)
            wheelAt(surface, -80)
            await vi.advanceTimersByTimeAsync(149)
            expect(settles()).toHaveLength(0)
            expect(requestFrame.mock.calls.some((c) => c[0].settle === false)).toBe(true)
            await vi.advanceTimersByTimeAsync(1)
            expect(settles()).toHaveLength(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it("a dead channel clears the matrix", async () => {
        const { host, script } = setup()
        const requestFrame = vi.fn(async () => { throw new Error("no kernel") })
        mount(script, viewManifest("pan"), undefined, requestFrame)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        wheelAt(surface, -120)
        expect(host.dataset.masquePhoto).not.toBe("")
        await Promise.resolve()
        await Promise.resolve()
        expect(host.dataset.masquePhoto).toBe("")
        expect(host.querySelector(".masque-data-clip")).toBeNull()
        expect(host.querySelector("img")!.style.transform).toBe("")
    })

    it("a canvas frame drops the matrix in the same turn the scene swaps", async () => {
        const m = viewManifest("pan")
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
        const requestFrame = vi.fn(async () => ({ scene: { tag: "z" }, pxPerUnit: 1, width: 400, height: 300, manifest: m }))
        mount(script, m, undefined, requestFrame)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        wheelAt(surface, -120)
        expect(host.dataset.masquePhoto).not.toBe("")
        await Promise.resolve()
        await Promise.resolve()
        expect(canvas.masqueReplaceScene).toHaveBeenCalled()
        expect(host.dataset.masquePhoto).toBe("")
        const stamp = JSON.parse(host.dataset.masqueGestureFrame!)
        expect(stamp.settle).toBe(false)
    })

    it("a settle queued behind an in-flight preview leaves the photograph at identity (#165)", async () => {
        // One notch sends a preview. Its round trip outlasts the 150ms idle timer, so the
        // settle, built from the same live matrix relative to the SAME shown frame, queues
        // behind it. The preview lands first and adopts that matrix; the settle then carries a
        // matrix the shown frame already includes and must not re-apply its inverse.
        vi.useFakeTimers()
        try {
            const m = viewManifest("pan")
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
            const releases: ((r: unknown) => void)[] = []
            const requestFrame = vi.fn((_input: Record<string, unknown>) =>
                new Promise((r) => { releases.push(r) }))
            mount(script, m, undefined, requestFrame as never)
            const surface = shadowOf(host).querySelector(".surface") as HTMLElement
            wheelAt(surface, -120)
            expect(host.dataset.masquePhoto).not.toBe("")
            await vi.advanceTimersByTimeAsync(0)
            expect(requestFrame).toHaveBeenCalledTimes(1)
            await vi.advanceTimersByTimeAsync(150) // idle timer fires while the preview is in flight
            const frame = { scene: { tag: "z" }, pxPerUnit: 1, width: 400, height: 300, manifest: m }
            releases[0](frame) // preview lands: the matrix comes off
            await vi.advanceTimersByTimeAsync(0)
            expect(host.dataset.masquePhoto).toBe("")
            expect(requestFrame).toHaveBeenCalledTimes(2)
            expect(requestFrame.mock.calls[1][0].settle).toBe(true)
            releases[1](frame) // settle lands on the same limits
            await vi.advanceTimersByTimeAsync(0)
            expect(host.dataset.masquePhoto).toBe("")
            expect(host.querySelector(".masque-data-clip")).toBeNull()
        } finally {
            vi.useRealTimers()
        }
    })

    it("a pan released while its last move is in flight leaves the photograph at identity (#165)", async () => {
        // Same ordering as the wheel case: the pointer-up settle is built from the live matrix
        // while the move's frame is still in flight, and lands after that frame adopted it.
        const m = viewManifest("pan")
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
        const releases: ((r: unknown) => void)[] = []
        const requestFrame = vi.fn((_input: Record<string, unknown>) => new Promise((r) => { releases.push(r) }))
        mount(script, m, undefined, requestFrame as never)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }))
        // Let the move's request go out before release, or settle() supersedes it unsent.
        for (let i = 0; i < 2; i++) await Promise.resolve()
        expect(requestFrame).toHaveBeenCalledTimes(1)
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 200, bubbles: true }))
        expect(host.dataset.masquePhoto).not.toBe("")
        const frame = { scene: { tag: "p" }, pxPerUnit: 1, width: 400, height: 300, manifest: m }
        releases[0](frame) // the move's frame lands
        for (let i = 0; i < 4; i++) await Promise.resolve()
        expect(host.dataset.masquePhoto).toBe("")
        expect(requestFrame.mock.calls[requestFrame.mock.calls.length - 1][0].settle).toBe(true)
        releases[1](frame) // the settle lands on the same limits
        for (let i = 0; i < 4; i++) await Promise.resolve()
        expect(host.dataset.masquePhoto).toBe("")
    })

    it("a second wheel notch stays on the cursor", () => {
        const { host, script } = setup()
        mount(script, viewManifest("pan"), undefined, vi.fn(async () => ({})))
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        wheelAt(surface, -120)
        const mid = (host.dataset.masquePhoto ?? "").split(",").map(Number)
        const layout = { x: 100 / 600 * 1200, y: 200 / 400 * 800 }
        const content = unmapPoint({ s: mid[0], tx: mid[1], ty: mid[2] }, layout)
        const ev = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -120 })
        Object.defineProperty(ev, "clientX", { value: 100 })
        Object.defineProperty(ev, "clientY", { value: 200 })
        surface.dispatchEvent(ev)
        const next = (host.dataset.masquePhoto ?? "").split(",").map(Number)
        const screen = mapPoint({ s: next[0], tx: next[1], ty: next[2] }, content)
        expect(screen.x).toBeCloseTo(layout.x)
        expect(screen.y).toBeCloseTo(layout.y)
    })

    it("a pan during a live zoom keeps the grabbed content under the cursor", () => {
        const { host, script } = setup()
        mount(script, viewManifest("pan"), undefined, vi.fn(async () => ({})))
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        wheelAt(surface, -120)
        const mid = (host.dataset.masquePhoto ?? "").split(",").map(Number)
        const down = { x: 100 / 600 * 1200, y: 200 / 400 * 800 }
        const content = unmapPoint({ s: mid[0], tx: mid[1], ty: mid[2] }, down)
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }))
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 200, bubbles: true }))
        const next = (host.dataset.masquePhoto ?? "").split(",").map(Number)
        const screen = mapPoint({ s: next[0], tx: next[1], ty: next[2] }, content)
        expect(screen.x).toBeCloseTo(200 / 600 * 1200)
        expect(screen.y).toBeCloseTo(down.y)
        expect(host.querySelector("img")!.style.transform).toBe("")
    })

    it("clearing a live wheel timer still settles a pan that never passes VIEW_MIN_PX", async () => {
        vi.useFakeTimers()
        try {
            const { host, script } = setup()
            const requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({}))
            mount(script, viewManifest("pan"), undefined, requestFrame)
            const surface = shadowOf(host).querySelector(".surface") as HTMLElement
            const settles = () => requestFrame.mock.calls.filter((c) => c[0].settle === true)
            const micro = (init: PointerEventInit) => {
                surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true, ...init }))
                surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 100, clientY: 100, bubbles: true, ...init }))
            }

            wheelAt(surface, -80)
            micro({})
            await vi.advanceTimersByTimeAsync(0)
            expect(settles()).toHaveLength(1)
            await vi.advanceTimersByTimeAsync(200)
            expect(settles()).toHaveLength(1)

            wheelAt(surface, -80)
            surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }))
            surface.dispatchEvent(new PointerEvent("pointercancel", { clientX: 100, clientY: 100, bubbles: true }))
            await vi.advanceTimersByTimeAsync(0)
            expect(settles()).toHaveLength(2)

            wheelAt(surface, -80)
            surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }))
            surface.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true }))
            await vi.advanceTimersByTimeAsync(0)
            expect(settles()).toHaveLength(3)

            wheelAt(surface, -80)
            micro({ shiftKey: true })
            await vi.advanceTimersByTimeAsync(0)
            expect(settles()).toHaveLength(4)
            await vi.advanceTimersByTimeAsync(200)
            expect(settles()).toHaveLength(4)
        } finally {
            vi.useRealTimers()
        }
    })

    it("a wheel that already settled does not settle again on a micro pan", async () => {
        vi.useFakeTimers()
        try {
            const { host, script } = setup()
            const requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({}))
            mount(script, viewManifest("pan"), undefined, requestFrame)
            const surface = shadowOf(host).querySelector(".surface") as HTMLElement
            const settles = () => requestFrame.mock.calls.filter((c) => c[0].settle === true)
            wheelAt(surface, -80)
            await vi.advanceTimersByTimeAsync(150)
            expect(settles()).toHaveLength(1)
            surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }))
            surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 100, clientY: 100, bubbles: true }))
            await vi.advanceTimersByTimeAsync(0)
            expect(settles()).toHaveLength(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it("a real pan after a wheel settles once", async () => {
        vi.useFakeTimers()
        try {
            const { host, script } = setup()
            const requestFrame = vi.fn(async (_input: Record<string, unknown>) => ({}))
            mount(script, viewManifest("pan"), undefined, requestFrame)
            const surface = shadowOf(host).querySelector(".surface") as HTMLElement
            const settles = () => requestFrame.mock.calls.filter((c) => c[0].settle === true)
            wheelAt(surface, -80)
            surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 200, bubbles: true }))
            surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }))
            surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 200, bubbles: true }))
            await vi.advanceTimersByTimeAsync(0)
            expect(settles()).toHaveLength(1)
            await vi.advanceTimersByTimeAsync(200)
            expect(settles()).toHaveLength(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it("a load after cleanup does not reveal a dead widget", async () => {
        const { host, img, script } = setup()
        let release!: (r: { png: Uint8Array; manifest: Manifest }) => void
        const requestFrame = vi.fn(() => new Promise<{ png: Uint8Array; manifest: Manifest }>((r) => { release = r }))
        let resolveInval!: () => void
        const inval = new Promise<void>((r) => { resolveInval = r })
        mount(script, viewManifest("pan"), inval, requestFrame)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        wheelAt(surface, -120)
        await Promise.resolve()
        release({ png: new Uint8Array([1, 2, 3]), manifest: viewManifest("pan") })
        await Promise.resolve()
        await Promise.resolve()
        resolveInval()
        await inval
        await Promise.resolve()
        img.dispatchEvent(new Event("load"))
        expect((host as HTMLElement & { masqueDead?: boolean }).masqueDead).toBe(true)
        expect(host.dataset.masqueGestureFrame).toBeUndefined()
        expect(host.dataset.masquePhoto ?? "").toBe("")
    })

    it("a frame that lands after the canvas constructor is gone is not applied", async () => {
        const { host, script } = setup()
        let release!: (r: { png: Uint8Array; manifest: Manifest }) => void
        const requestFrame = vi.fn(() => new Promise<{ png: Uint8Array; manifest: Manifest }>((r) => { release = r }))
        mount(script, viewManifest("pan"), undefined, requestFrame)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        wheelAt(surface, -120)
        await Promise.resolve()
        const saved = globalThis.HTMLCanvasElement
        Object.defineProperty(globalThis, "HTMLCanvasElement", { value: undefined, configurable: true })
        try {
            release({ png: new Uint8Array([1]), manifest: viewManifest("pan") })
            await Promise.resolve()
            await Promise.resolve()
            expect(host.dataset.masqueGestureFrame).toBeUndefined()
        } finally {
            Object.defineProperty(globalThis, "HTMLCanvasElement", { value: saved, configurable: true })
        }
    })

    it("an image error clears the photographic matrix", async () => {
        const { host, img, script } = setup()
        const requestFrame = vi.fn(async () => ({ png: new Uint8Array([1]), manifest: viewManifest("pan") }))
        mount(script, viewManifest("pan"), undefined, requestFrame)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        wheelAt(surface, -120)
        expect(host.dataset.masquePhoto).not.toBe("")
        await Promise.resolve()
        await Promise.resolve()
        img.dispatchEvent(new Event("error"))
        expect(host.dataset.masquePhoto).toBe("")
        expect(host.dataset.masqueGestureFrame).toBeUndefined()
    })

    it("a thrown scene swap clears the photographic matrix", async () => {
        const m = viewManifest("pan")
        const host = document.createElement("div")
        const canvas = document.createElement("canvas") as HTMLCanvasElement & {
            masqueReplaceScene?: () => void
        }
        canvas.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
        canvas.masqueReplaceScene = () => { throw new Error("swap failed") }
        const script = document.createElement("script")
        host.append(canvas, script)
        document.body.append(host)
        const requestFrame = vi.fn(async () => ({ scene: { tag: "z" }, pxPerUnit: 1, width: 400, height: 300, manifest: m }))
        mount(script, m, undefined, requestFrame)
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        const err = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            wheelAt(surface, -120)
            expect(host.dataset.masquePhoto).not.toBe("")
            await Promise.resolve()
            await Promise.resolve()
            expect(host.dataset.masquePhoto).toBe("")
            expect(host.dataset.masqueGestureFrame).toBeUndefined()
        } finally {
            err.mockRestore()
        }
    })

    it("a frame during an ROI drag does not replace the box until the drag ends", async () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "roi", kind: "roi", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 200, y: 200, w: 400, h: 400, handle: 16 } },
                { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } },
            ],
        }
        const moved: Manifest = {
            ...m,
            layers: [
                { ...m.layers[0], geometry: { x: 100, y: 100, w: 500, h: 500, handle: 16 } },
                m.layers[1],
            ],
        }
        const { host, img, script } = setup()
        let release!: (r: { png: Uint8Array; manifest: Manifest }) => void
        const requestFrame = vi.fn(() => new Promise<{ png: Uint8Array; manifest: Manifest }>((r) => { release = r }))
        mount(script, m, undefined, requestFrame)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const rect = shadow.querySelector("svg.masque-plain rect.masque-hi") as SVGRectElement
        expect(rect.getAttribute("x")).toBe("200")
        wheelAt(surface, -120)
        await Promise.resolve()
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, bubbles: true }))
        release({ png: new Uint8Array([1, 2, 3]), manifest: moved })
        await Promise.resolve()
        await Promise.resolve()
        img.dispatchEvent(new Event("load"))
        expect(rect.isConnected).toBe(true)
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 260, clientY: 240, bubbles: true }))
        expect(rect.isConnected).toBe(true)
        expect(rect.getAttribute("x")).not.toBe("200")
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 260, clientY: 240, bubbles: true }))
        expect(rect.isConnected).toBe(false)
        const next = shadow.querySelector("svg.masque-plain rect.masque-hi") as SVGRectElement
        expect(next.getAttribute("x")).toBe("100")
    })

    it("a frame during a threshold drag does not replace the line until the drag ends", async () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "thr", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { orientation: "h", pos: 400, span: [0, 1200] } },
                { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } },
            ],
        }
        const moved: Manifest = {
            ...m,
            layers: [
                { ...m.layers[0], geometry: { orientation: "h", pos: 120, span: [0, 1200] } },
                m.layers[1],
            ],
        }
        const { host, img, script } = setup()
        let release!: (r: { png: Uint8Array; manifest: Manifest }) => void
        const requestFrame = vi.fn(() => new Promise<{ png: Uint8Array; manifest: Manifest }>((r) => { release = r }))
        mount(script, m, undefined, requestFrame)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const line = shadow.querySelector("line.masque-threshold-line") as SVGLineElement
        expect(line.getAttribute("y1")).toBe("400")
        wheelAt(surface, -120)
        await Promise.resolve()
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 200, bubbles: true }))
        release({ png: new Uint8Array([1, 2, 3]), manifest: moved })
        await Promise.resolve()
        await Promise.resolve()
        img.dispatchEvent(new Event("load"))
        expect(line.isConnected).toBe(true)
        surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 250, bubbles: true }))
        expect(line.isConnected).toBe(true)
        expect(line.getAttribute("y1")).not.toBe("400")
        surface.dispatchEvent(new PointerEvent("pointerup", { clientX: 300, clientY: 250, bubbles: true }))
        expect(line.isConnected).toBe(false)
        const next = shadow.querySelector("line.masque-threshold-line") as SVGLineElement
        expect(next.getAttribute("y1")).toBe("120")
    })

    it("a live zoom hits the mark where it is drawn and keeps legend chrome outside the clip", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "pts", kind: "circles", geometry: [600, 400, 20], payloads: [{ i: 0 }], axis: "ax1", events: ["click", "hover"] },
                { id: "legend", kind: "rects", bond: "legend", axis: "ax1", events: ["hover"],
                    geometry: [100, 100, 40, 20], payloads: [{ name: "a" }] },
                { id: "cb", kind: "axis", bond: "colorbar", axis: "ax1", events: ["click"], payloads: [],
                    geometry: [20, 600, 60, 80] },
                { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } },
            ],
        }
        const { host, script } = setup()
        mount(script, m, undefined, vi.fn(async () => ({})))
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const zoom = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -800 })
        Object.defineProperty(zoom, "clientX", { value: 100 })
        Object.defineProperty(zoom, "clientY", { value: 100 })
        surface.dispatchEvent(zoom)
        const parts = (host.dataset.masquePhoto ?? "").split(",").map(Number)
        const photo = { s: parts[0], tx: parts[1], ty: parts[2] }
        const screen = mapPoint(photo, { x: 600, y: 400 })
        const clickAt = (x: number, y: number) => {
            surface.dispatchEvent(new MouseEvent("click", {
                clientX: x / 1200 * 600, clientY: y / 800 * 400, bubbles: true,
            }))
        }
        clickAt(600, 400)
        expect((host as unknown as { value: unknown }).value).toBeNull()
        clickAt(screen.x, screen.y)
        expect((host as unknown as { value: unknown }).value).toEqual({ layer: "pts", index: 0 })
        const wash = shadow.querySelector("g.sel .masque-hi")
        expect(wash?.closest("g.masque-photo")).toBeTruthy()
        expect(wash?.closest("g.masque-fixed")).toBeNull()
        clickAt(50, 640)
        expect((host as unknown as { value: { layer: string } }).value.layer).toBe("cb")
        surface.dispatchEvent(new PointerEvent("pointermove", {
            clientX: 50, clientY: 50, bubbles: true,
        }))
        const ring = shadow.querySelector("g.masque-fixed .masque-hi")
        expect(ring).toBeTruthy()
        expect(ring!.closest("g.masque-clip")).toBeNull()
        expect(ring!.closest("g.masque-photo")).toBeNull()
    })

    it("an ROI drag grabs the handle where it is drawn", () => {
        // Fresh geometry each mount: the box aliases layer.geometry and a drag mutates it.
        const make = (): Manifest => ({
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "roi", kind: "roi", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 200, y: 200, w: 400, h: 400, handle: 16 } },
                { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } },
            ],
        })
        const zoomed = () => {
            const { host, script } = setup()
            mount(script, make(), undefined, vi.fn(async () => ({})))
            const surface = shadowOf(host).querySelector(".surface") as HTMLElement
            const zoom = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -405 })
            Object.defineProperty(zoom, "clientX", { value: 250 })
            Object.defineProperty(zoom, "clientY", { value: 250 })
            surface.dispatchEvent(zoom)
            const parts = (host.dataset.masquePhoto ?? "").split(",").map(Number)
            return { host, surface, photo: { s: parts[0], tx: parts[1], ty: parts[2] } }
        }
        const live = zoomed()
        const corner = mapPoint(live.photo, { x: 200, y: 200 })
        const down = { clientX: corner.x / 1200 * 600, clientY: corner.y / 800 * 400, bubbles: true }
        live.surface.dispatchEvent(new PointerEvent("pointerdown", down))
        live.surface.dispatchEvent(new PointerEvent("pointermove", {
            clientX: down.clientX + 40, clientY: down.clientY + 10, bubbles: true,
        }))
        const moved = shadowOf(live.host).querySelector("svg.masque-plain rect.masque-hi") as SVGRectElement
        expect(Number(moved.getAttribute("width"))).not.toBe(400)

        const old = zoomed()
        // Layout (200, 200) is where the corner was. The drawn handle has moved.
        expect(Math.hypot(corner.x - 200, corner.y - 200)).toBeGreaterThan(32)
        old.surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }))
        old.surface.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 110, bubbles: true }))
        const stayed = shadowOf(old.host).querySelector("svg.masque-plain rect.masque-hi") as SVGRectElement
        expect(stayed.getAttribute("width")).toBe("400")
    })

    it("pointerleave flushes chrome deferred by an uncaptured ROI drag", async () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 100], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "roi", kind: "roi", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 200, y: 200, w: 400, h: 400, handle: 16 } },
                { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } },
            ],
        }
        const moved: Manifest = {
            ...m,
            layers: [
                { ...m.layers[0], geometry: { x: 100, y: 100, w: 500, h: 500, handle: 16 } },
                m.layers[1],
            ],
        }
        const { host, img, script } = setup()
        let release!: (r: { png: Uint8Array; manifest: Manifest }) => void
        const requestFrame = vi.fn(() => new Promise<{ png: Uint8Array; manifest: Manifest }>((r) => { release = r }))
        mount(script, m, undefined, requestFrame)
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        surface.setPointerCapture = () => {
            throw new DOMException("No active pointer with the given id is found.", "InvalidPointerId")
        }
        const rect = shadow.querySelector("svg.masque-plain rect.masque-hi") as SVGRectElement
        wheelAt(surface, -120)
        await Promise.resolve()
        surface.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, clientY: 200, bubbles: true }))
        expect(surface.classList.contains("grabbing")).toBe(true)
        release({ png: new Uint8Array([1, 2, 3]), manifest: moved })
        await Promise.resolve()
        await Promise.resolve()
        img.dispatchEvent(new Event("load"))
        expect(rect.isConnected).toBe(true)
        expect(rect.getAttribute("x")).toBe("200")
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        expect(rect.isConnected).toBe(false)
        const next = shadow.querySelector("svg.masque-plain rect.masque-hi") as SVGRectElement
        expect(next.getAttribute("x")).toBe("100")
    })

    it("a click outside the pan view does not commit a cell the clip has hidden", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 10], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 800, 600], xreversed: false, yreversed: false } },
            layers: [
                { id: "cells", kind: "grid", axis: "ax1", events: ["click"], payloads: [],
                    geometry: { xedges: [0, 800], yedges: [0, 600], ncols: 1, nrows: 1, values: [1] } },
                { id: "cb", kind: "axis", bond: "colorbar", axis: "ax1", events: ["click"], payloads: [],
                    geometry: [900, 100, 80, 200] },
                { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 0, y: 0, w: 800, h: 600, mode: "pan" } },
            ],
        }
        const { host, script } = setup()
        mount(script, m, undefined, vi.fn(async () => ({})))
        const surface = shadowOf(host).querySelector(".surface") as HTMLElement
        const zoom = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -693 })
        Object.defineProperty(zoom, "clientX", { value: 200 })
        Object.defineProperty(zoom, "clientY", { value: 100 })
        surface.dispatchEvent(zoom)
        surface.dispatchEvent(new MouseEvent("click", { clientX: 470, clientY: 100, bubbles: true }))
        expect((host as unknown as { value: { layer: string } }).value.layer).toBe("cb")
    })

    it("a pan samples the slid series in content pixels and leaves the hair on the axis frame", () => {
        const m: Manifest = {
            width: 1200, height: 800, scaling: 2,
            transforms: { ax1: { xlims: [0, 10], ylims: [0, 10], xscale: "identity", yscale: "identity",
                viewport: [0, 0, 1200, 800], xreversed: false, yreversed: false } },
            layers: [
                { id: "thr", kind: "threshold", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { orientation: "h", pos: 100, span: [0, 1200] } },
                { id: "fill", kind: "polygons", axis: "ax1", events: ["hover"],
                    geometry: [[0, 0, 1200, 0, 1200, 800, 0, 800]], payloads: [{ name: "the-fill" }] },
                { id: "view", kind: "view", axis: "ax1", events: ["drag"], payloads: [],
                    geometry: { x: 0, y: 0, w: 1200, h: 800, mode: "pan" } },
                { id: "slice", kind: "slice", axis: "ax1", events: ["hover"], payloads: [],
                    geometry: {
                        orientation: "v", crosshair: true, covers: ["fill"],
                        series: [{ id: "wide", xy: [0, 0, 10, 10] }],
                    } },
            ],
        }
        const { host, script } = setup()
        mount(script, m, undefined, vi.fn(async () => ({})))
        const shadow = shadowOf(host)
        const surface = shadow.querySelector(".surface") as HTMLElement
        const at = (clientX: number, clientY: number, type: string) =>
            surface.dispatchEvent(new PointerEvent(type, { clientX, clientY, bubbles: true, pointerId: 1 }))
        at(100, 100, "pointerdown")
        at(300, 200, "pointermove")
        at(300, 200, "pointerup")
        at(300, 200, "pointermove")
        const tip = shadow.querySelector(".masque-tip") as HTMLElement
        expect(tip.innerHTML).toContain("1.667")
        expect(tip.innerHTML).not.toContain("5.000")
        expect(tip.innerHTML).not.toContain("the-fill")
        const hair = shadow.querySelector(".masque-cross-hair") as SVGLineElement
        expect(hair.getAttribute("x1")).toBe("600")
        expect(hair.closest("g.masque-photo")).toBeNull()
        const dot = shadow.querySelector(".masque-cross circle") as SVGCircleElement
        expect(dot.closest("g.masque-photo")).toBeTruthy()
        expect(Number(dot.getAttribute("cx"))).toBeCloseTo(200)
        expect(Number(dot.getAttribute("cy"))).toBeCloseTo(800 * 5 / 6)
        const line = shadow.querySelector("line") as SVGLineElement
        expect(line.classList.contains("masque-threshold-line")).toBe(true)
        expect(line.closest("g.masque-photo")).toBeTruthy()
    })
})
