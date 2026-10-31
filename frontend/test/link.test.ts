// @vitest-environment happy-dom
// Legend `links`: hovering/focusing a HitLayer element whose `links[index]` names other layers
// previews them as picked. Closed marks preview through the fade (fade.ts): the linked marks
// are kept and the legend's other series fade. Any other linked mark gets the selected recipe
// (a ring) in a dedicated g.link group, distinct from g.sel (the persistent picks of the bond's
// fields) and g.hi (the single hover ring).
import { describe, it, expect } from "vitest"
import { mount } from "../src/overlay"
import type { Manifest } from "../src/types"
import { withFields } from "./fields"
import { fadeKept } from "./fadekeys"

function setup(manifest: Manifest) {
    const host = document.createElement("div")
    const img = document.createElement("img")
    img.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
    const script = document.createElement("script")
    host.append(img, script)
    document.body.append(host)
    mount(script, withFields(manifest))
    const shadow = (host.lastElementChild as HTMLElement).shadowRoot!
    const surface = shadow.querySelector(".surface") as HTMLElement
    return { host, surface, shadow }
}

// display scale = manifest.width(1200) / base rect width(600) = 2, throughout.
const move = (surface: HTMLElement, clientX: number, clientY: number) =>
    surface.dispatchEvent(new PointerEvent("pointermove", { clientX, clientY, bubbles: true }))

const linkGroupSize = (shadow: ShadowRoot) => shadow.querySelectorAll("g.link > *").length
const faded = (shadow: ShadowRoot) => Number((shadow.querySelector(".masque-fade") as HTMLElement | null)?.dataset.faded ?? 0)

describe("legend links: hover", () => {
    // legend rect 0 (links to "pts"): image [80,120]x[90,110] -> client center (50,50)
    // legend rect 1 (links: []):      image [80,120]x[130,150] -> client center (50,70)
    // legend rect 2 (links to "qts"): image [80,120]x[170,190] -> client center (50,90)
    const manifest: Manifest = {
        width: 1200, height: 800, scaling: 2, transforms: {},
        layers: [
            {
                id: "legend", kind: "rects", axis: "ax1", events: ["click", "hover"],
                geometry: [100, 100, 40, 20, 100, 140, 40, 20, 100, 180, 40, 20],
                payloads: [{ name: "a" }, { name: "b" }, { name: "c" }],
                links: [["pts"], [], ["qts"]],
            },
            {
                id: "pts", kind: "circles", axis: "ax2", events: ["hover"],
                geometry: [600, 400, 20, 620, 420, 20, 640, 440, 20],
                payloads: [{}, {}, {}],
            },
            {
                id: "qts", kind: "circles", axis: "ax2", events: ["hover"],
                geometry: [900, 600, 20],
                payloads: [{}],
            },
        ],
    }

    it("hovering a linked legend element keeps its series and fades the legend's other series", () => {
        const { surface, shadow } = setup(manifest)
        move(surface, 50, 50)
        expect(fadeKept(shadow)).toEqual(["pts:0", "pts:1", "pts:2"])
        expect(faded(shadow)).toBe(1) // qts:0
        expect(linkGroupSize(shadow)).toBe(0) // closed marks draw no SVG recipe
    })

    it("hovering a non-linked legend element (links: []) previews nothing", () => {
        const { surface, shadow } = setup(manifest)
        move(surface, 50, 70)
        expect(fadeKept(shadow)).toEqual([])
        expect(linkGroupSize(shadow)).toBe(0)
    })

    it("moving between entries swaps the preview, and moving off ends it", async () => {
        const { surface, shadow } = setup(manifest)
        move(surface, 50, 50)
        expect(fadeKept(shadow)).toEqual(["pts:0", "pts:1", "pts:2"])
        await new Promise((r) => requestAnimationFrame(r)) // pointermoves coalesce per frame
        move(surface, 50, 90)
        await new Promise((r) => requestAnimationFrame(r))
        expect(fadeKept(shadow)).toEqual(["qts:0"])
        expect(faded(shadow)).toBe(3)
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        expect(fadeKept(shadow)).toEqual([])
    })

    it("a field's starting pick is kept through a legend hover and after it", () => {
        const selManifest: Manifest = {
            ...manifest,
            fields: ["qts"],
            initial: { qts: { layer: "qts", index: 0 } },
        }
        const { surface, shadow } = setup(selManifest)
        expect(fadeKept(shadow)).toEqual(["qts:0"])
        move(surface, 50, 50) // hover the entry linking to "pts"
        expect(new Set(fadeKept(shadow))).toEqual(new Set(["qts:0", "pts:0", "pts:1", "pts:2"]))
        surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        expect(fadeKept(shadow)).toEqual(["qts:0"])
        expect(shadow.querySelectorAll("g.sel > *").length).toBe(0)
    })

    it("a legend pick fades the legend's other series; hovering the picked entry changes nothing", () => {
        const pinnedManifest: Manifest = {
            ...manifest,
            // The legend's pick of entry 0 holds its whole series: all three "pts" circles.
            fields: ["legend"],
            initial: { legend: { layer: "legend", index: 0 } },
        }
        const { surface, shadow } = setup(pinnedManifest)
        expect(fadeKept(shadow)).toEqual(["pts:0", "pts:1", "pts:2"])
        expect(faded(shadow)).toBe(1)
        move(surface, 50, 50)
        expect(fadeKept(shadow)).toEqual(["pts:0", "pts:1", "pts:2"])
        expect(faded(shadow)).toBe(1)
        expect(linkGroupSize(shadow)).toBe(0)
    })
})

describe("legend links: no links field at all (ordinary layer) draws nothing", () => {
    const manifest: Manifest = {
        width: 1200, height: 800, scaling: 2, transforms: {},
        layers: [
            { id: "pts", kind: "circles", axis: "ax1", events: ["hover"], geometry: [600, 400, 20], payloads: [{}] },
        ],
    }

    it("hovering an element on a layer with no `links` property draws nothing", () => {
        const { surface, shadow } = setup(manifest)
        move(surface, 300, 200)
        expect(linkGroupSize(shadow)).toBe(0)
    })
})

describe("legend links: keyboard focus", () => {
    // legend rects layer is FOCUSABLE_KINDS-eligible (rects) — Tab/arrow nav reaches it directly.
    const manifest: Manifest = {
        width: 1200, height: 800, scaling: 2, transforms: {},
        layers: [
            {
                id: "legend", kind: "rects", axis: "ax1", events: ["click", "hover"],
                geometry: [100, 100, 40, 20],
                payloads: [{}],
                links: [["pts"]],
            },
            {
                id: "pts", kind: "circles", axis: "ax1", events: ["hover"],
                geometry: [600, 400, 20, 620, 420, 20],
                payloads: [{}, {}],
            },
        ],
    }

    const down = (surface: HTMLElement, key: string) =>
        surface.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))

    it("keyboard-focusing a linked legend element shows the same linked preview as hover", () => {
        const { surface, shadow } = setup(manifest)
        surface.focus()
        down(surface, "ArrowRight") // -> legend[0], the only focusable element
        // The legend's only series goes to the fade, kept; nothing else fades, and g.link is empty.
        expect(fadeKept(shadow)).toEqual(["pts:0", "pts:1"])
        expect(shadow.querySelectorAll("g.link > *").length).toBe(0)
    })

    it("blurring/moving focus away ends the linked preview", () => {
        const { surface, shadow } = setup(manifest)
        surface.focus()
        down(surface, "ArrowRight")
        expect(fadeKept(shadow)).toEqual(["pts:0", "pts:1"])
        down(surface, "Escape")
        expect(fadeKept(shadow)).toEqual([])
    })
})

describe("legend links: fan-out across kinds", () => {
    // legend rect at image [80,120]x[90,110] -> client center (50,50); links to a circles layer
    // (2 elements) AND a polyline layer (3 vertices -> 2 segments) — both must draw.
    const manifest: Manifest = {
        width: 1200, height: 800, scaling: 2, transforms: {},
        layers: [
            {
                id: "legend", kind: "rects", axis: "ax1", events: ["hover"],
                geometry: [100, 100, 40, 20],
                payloads: [{}],
                links: [["circ", "poly"]],
            },
            {
                id: "circ", kind: "circles", axis: "ax1", events: ["hover"],
                geometry: [600, 400, 20, 620, 420, 20],
                payloads: [{}, {}],
            },
            {
                id: "poly", kind: "polyline", axis: "ax1", events: ["hover"],
                geometry: [0, 0, 50, 50, 100, 100],
                payloads: [{}, {}],
            },
        ],
    }

    it("previews linked elements from both a circles and a polyline target layer", () => {
        const { surface, shadow } = setup(manifest)
        move(surface, 50, 50)
        // The 2 circles go to the fade, kept; they are the legend's only closed series, so
        // nothing fades and nothing is drawn on them in g.link. 2 polyline segments (a 3-vertex
        // polyline is 2 segments), each a selected halo cased along it in g.link, the two sharing
        // one mask that keeps their bands off the lines.
        expect(fadeKept(shadow)).toEqual(["circ:0", "circ:1"])
        expect(shadow.querySelector('.masque-fade[data-axis="ax1"]')!.getAttribute("data-faded")).toBe("0")
        expect(shadow.querySelectorAll("g.link .masque-halo-line.masque-halo-selected").length).toBe(2)
        const link = shadow.querySelector("svg.masque-edge g.link")!
        expect(link.getAttribute("mask")).toMatch(/^url\(#masque-halo-\d+\)$/)
        expect(shadow.querySelectorAll("g.link .masque-halo[mask]").length).toBe(0)
    })
})

describe("legend links: id:k pins one element of a multi-path :lines layer", () => {
    // legend rect at image [80,120]x[90,110] -> client center (50,50); links to series element 2
    // (Julia 1-based) of a 3-path :lines layer — must keep one line, not three.
    const manifest: Manifest = {
        width: 1200, height: 800, scaling: 2, transforms: {},
        layers: [
            {
                id: "legend", kind: "rects", axis: "ax1", events: ["hover"],
                geometry: [100, 100, 40, 20],
                payloads: [{}],
                links: [["series:2"]],
            },
            {
                id: "series", kind: "lines", axis: "ax1", events: ["hover"],
                geometry: [[0, 0, 50, 50], [10, 10, 60, 60], [20, 20, 70, 70]],
                payloads: [{}, {}, {}],
            },
        ],
    }

    it("keeps the pinned path and fades the layer's other series", () => {
        const { surface, shadow } = setup(manifest)
        move(surface, 50, 50)
        // A line is a series: the legend's hover previews by fading the other lines, as it fades
        // other closed marks, and draws nothing on the pinned one.
        expect(linkGroupSize(shadow)).toBe(0)
        expect(fadeKept(shadow)).toEqual(["series:1"])
        expect(faded(shadow)).toBe(2)
        // A preview on an axis that holds no picks leaves more of the rest showing.
        expect(shadow.querySelector(".masque-fade")!.classList.contains("masque-preview")).toBe(true)
    })
})
