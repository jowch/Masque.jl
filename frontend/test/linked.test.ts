// @vitest-environment happy-dom
// Linked selections (#346): plots of one `linked(...)` group share one field of rows. A pick in
// any of them edits the rows, and every mark of a held row, in every plot, is drawn selected.
import { afterEach, describe, it, expect, vi } from "vitest"
import { mount } from "../src/overlay"
import { PARTNER_CAP, groupSelection } from "../src/linked"
import { selectionScope } from "../src/fade"
import type { Manifest, HitLayer, LinkGroup } from "../src/types"
import { fadeKept } from "./fadekeys"

const cleanups: Array<() => void> = []
afterEach(() => { while (cleanups.length) cleanups.pop()!() })

// Two panels side by side, image 1200x800 shown at 600x400 (client px are half).
const tf = (x: number) => ({ xlims: [0, 10] as [number, number], ylims: [0, 10] as [number, number], xscale: "identity", yscale: "identity",
    viewport: [x, 0, 600, 800] as [number, number, number, number], xreversed: false, yreversed: false })

// `a` on the left and `b` on the right draw the same three rows, at different places.
function panels(group: Partial<LinkGroup> = {}, extra: Partial<Manifest> = {}): Manifest {
    const layers: HitLayer[] = [
        { id: "a", kind: "circles", geometry: [100, 100, 20, 300, 300, 20, 500, 500, 20], payloads: [{}, {}, {}], axis: "ax1", events: ["click", "hover"], group: "cells" },
        { id: "b", kind: "circles", geometry: [1100, 700, 20, 900, 500, 20, 700, 300, 20], payloads: [{}, {}, {}], axis: "ax2", events: ["click", "hover"], group: "cells" },
    ]
    const g: LinkGroup = { id: "cells", members: ["a", "b"], n: 3, ...group }
    return {
        width: 1200, height: 800, scaling: 2, transforms: { ax1: tf(0), ax2: tf(600) }, layers,
        fields: ["cells"], groups: [g], initial: { cells: g.many ? { rows: [] } : null }, ...extra,
    }
}

function setup(m: Manifest) {
    const host = document.createElement("div")
    const img = document.createElement("img")
    img.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
    const script = document.createElement("script")
    host.append(img, script)
    document.body.append(host)
    cleanups.push(mount(script, m).cleanup)
    const shadow = (host.lastElementChild as HTMLElement).shadowRoot!
    const surface = shadow.querySelector(".surface") as HTMLElement
    const val = () => (host as unknown as { value: Record<string, unknown> }).value.cells
    return { host, shadow, surface, val }
}

const click = (s: HTMLElement, x: number, y: number, mod: MouseEventInit = {}) =>
    s.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: y, bubbles: true, ...mod }))
const ptr = (s: HTMLElement, type: string, x: number, y: number, mod: PointerEventInit = {}) =>
    s.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, ...mod }))
const drag = (s: HTMLElement, from: [number, number], to: [number, number], mod: PointerEventInit = {}) => {
    ptr(s, "pointerdown", from[0], from[1], mod)
    ptr(s, "pointermove", (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, mod)
    ptr(s, "pointermove", to[0], to[1], mod)
    ptr(s, "pointerup", to[0], to[1], mod)
    click(s, to[0], to[1], mod)
}
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
// The marks g.link draws, as their centres in image px.
const linkCentres = (shadow: ShadowRoot) =>
    [...shadow.querySelectorAll("svg.masque-edge g.link .masque-halo > circle.masque-hi")].map((c) => `${c.getAttribute("cx")},${c.getAttribute("cy")}`)

describe("linked selections (#346)", () => {
    it("a click in either panel picks the row in both; select = :many adds and takes out rows", () => {
        const { surface, shadow, val } = setup(panels({ many: true }))
        click(surface, 50, 50) // a:0
        expect(val()).toEqual({ rows: [0] })
        expect(fadeKept(shadow).sort()).toEqual(["a:0", "b:0"])
        click(surface, 450, 250) // b:1, row 1
        expect(val()).toEqual({ rows: [0, 1] })
        expect(fadeKept(shadow).sort()).toEqual(["a:0", "a:1", "b:0", "b:1"])
        click(surface, 550, 350) // b:0 takes row 0 out, from both panels
        expect(val()).toEqual({ rows: [1] })
        expect(fadeKept(shadow).sort()).toEqual(["a:1", "b:1"])
    })

    it("select = :one replaces the row, a click on its partner lets it go, and an empty click on either panel clears it", () => {
        const { surface, val } = setup(panels())
        click(surface, 50, 50)
        expect(val()).toEqual({ row: 0 })
        click(surface, 550, 350) // b:0 is the same row: it lets it go
        expect(val()).toBeNull()
        click(surface, 150, 150)
        expect(val()).toEqual({ row: 1 })
        click(surface, 350, 50) // empty, in the right panel
        expect(val()).toBeNull()
    })

    it("an empty click keeps a many group's rows, and Escape clears them", () => {
        const { surface, val } = setup(panels({ many: true }))
        click(surface, 50, 50)
        click(surface, 350, 50)
        expect(val()).toEqual({ rows: [0] })
        surface.focus()
        surface.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        expect(val()).toEqual({ rows: [] })
    })

    it("keys: marks that share a row are picked together, and a row only one panel has is marked there", () => {
        // a's first two marks are row 0; b has rows 1 and 0, and no row 2.
        const m = panels({ many: true, rows: { a: [0, 0, 2], b: [1, 0, 1] } })
        const { surface, shadow, val } = setup(m)
        click(surface, 50, 50) // a:0, row 0
        expect(val()).toEqual({ rows: [0] })
        expect(fadeKept(shadow).sort()).toEqual(["a:0", "a:1", "b:1"])
        click(surface, 250, 250) // a:2, row 2: no mark in b
        expect(val()).toEqual({ rows: [0, 2] })
        expect(fadeKept(shadow).sort()).toEqual(["a:0", "a:1", "a:2", "b:1"])
    })

    it("a box in one panel picks the rows of the marks inside, and marks them in the other", () => {
        const { surface, shadow, val } = setup(panels({ many: true }))
        drag(surface, [20, 20], [170, 170]) // a:0 and a:1
        expect(val()).toEqual({ rows: [0, 1] })
        expect(fadeKept(shadow).sort()).toEqual(["a:0", "a:1", "b:0", "b:1"])
        // A box that starts on a held mark, in the other panel, takes out what it covers.
        drag(surface, [450, 250], [560, 360]) // starts on b:1, covers b:0 and b:1
        expect(val()).toEqual({ rows: [] })
    })

    it("a select = :one group takes no box", () => {
        const { surface, shadow, val } = setup(panels())
        ptr(surface, "pointerdown", 20, 20)
        ptr(surface, "pointermove", 170, 170)
        expect(shadow.querySelector("rect.masque-marquee")).toBeNull()
        ptr(surface, "pointerup", 170, 170)
        expect(val()).toBeNull()
    })

    it("starts from its value: the rows Julia's selected= gives", () => {
        const { shadow } = setup(panels({ many: true }, { initial: { cells: { rows: [2, 9] } } }))
        expect(fadeKept(shadow).sort()).toEqual(["a:2", "b:2"]) // row 9 doesn't exist: dropped
    })

    it("hovering a mark outlines its partner in the other panel, and leaving fades it", async () => {
        const { surface, shadow } = setup(panels())
        ptr(surface, "pointermove", 50, 50) // a:0
        await frame()
        expect(linkCentres(shadow)).toEqual(["1100,700"])
        ptr(surface, "pointermove", 150, 150) // a:1
        await frame()
        expect(linkCentres(shadow)).toEqual(["900,500"])
        ptr(surface, "pointermove", 350, 50) // empty
        await frame()
        const left = [...shadow.querySelectorAll("svg.masque-edge g.link > .masque-halo")]
        expect(left.every((c) => c.classList.contains("masque-leave"))).toBe(true)
    })

    it("a row with more than PARTNER_CAP marks on an axis outlines none of them there", async () => {
        const n = PARTNER_CAP + 1
        const geom: number[] = []
        for (let k = 0; k < n; k++) geom.push(650 + (k % 10) * 50, 50 + Math.floor(k / 10) * 50, 5)
        const m = panels({ rows: { a: [0, 1, 2], b: Array(n).fill(0) } })
        m.layers[1] = { ...m.layers[1], geometry: geom, payloads: Array(n).fill({}) }
        const { surface, shadow } = setup(m)
        ptr(surface, "pointermove", 50, 50) // a:0, row 0: 51 marks in b
        await frame()
        expect(linkCentres(shadow)).toEqual([])
    })

    it("a legend entry over a linked plot picks its rows in every panel", () => {
        const m = panels({ many: true })
        m.layers.unshift({ id: "legend", kind: "rects", geometry: [500, 60, 80, 40], payloads: [{ label: "a" }], axis: "ax1",
            events: ["click", "hover"], links: [["a:1", "a:3"]], bond: "legend" })
        m.fields = ["legend", "cells"]
        m.initial = { legend: null, cells: { rows: [] } }
        const { host, shadow, surface } = setup(m)
        click(surface, 250, 30)
        const v = (host as unknown as { value: Record<string, unknown> }).value
        expect(v.cells).toEqual({ rows: [0, 2] })
        expect(fadeKept(shadow).sort()).toEqual(["a:0", "a:2", "b:0", "b:2"])
    })

    it("a group's picks fade every plot of the group, also one that holds none of them", () => {
        // `c` shares `a`'s axis and draws only row 3, which isn't picked; `d` is a member `onchange` hid.
        const m = panels({ many: true, n: 4, members: ["a", "b", "c", "d"], rows: { a: [0, 1, 2], b: [0, 1, 2], c: [3], d: [3] } })
        m.layers.push({ id: "c", kind: "circles", geometry: [550, 100, 20], payloads: [{}], axis: "ax1", events: ["click", "hover"], group: "cells" },
            { id: "d", kind: "circles", geometry: [560, 120, 20], payloads: [{}], axis: "ax1", events: [], hidden: true, group: "cells" } as HitLayer)
        const scope = selectionScope(m, new Map([["cells", groupSelection(m, m.groups![0], [0])]]))
        expect(scope.map((l) => l.id).sort()).toEqual(["a", "b", "c"])
        expect(selectionScope(m, new Map([["cells", groupSelection(m, m.groups![0], [])]]))).toEqual([])
    })

    it("a legend outside the bind value still picks a bound group's rows", () => {
        const m = panels({ many: true })
        m.layers.unshift({ id: "legend", kind: "rects", geometry: [500, 60, 80, 40], payloads: [{ label: "a" }], axis: "ax1",
            events: ["click", "hover"], links: [["a:1", "a:3"]], bond: "legend" })
        m.initial = { cells: { rows: [] } }
        const { host, shadow, surface, val } = setup(m)
        click(surface, 250, 30)
        expect((host as unknown as { value: Record<string, unknown> }).value).toEqual({ cells: { rows: [0, 2] } })
        expect(fadeKept(shadow).sort()).toEqual(["a:0", "a:2", "b:0", "b:2"])
        // A mark taken out leaves the panels, the legend drawing none of its own.
        click(surface, 50, 50)
        expect(val()).toEqual({ rows: [2] })
        expect(fadeKept(shadow).sort()).toEqual(["a:2", "b:2"])
        // Escape clears it all, and the entry picks again on the next click.
        surface.focus()
        surface.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        expect(val()).toEqual({ rows: [] })
        expect(fadeKept(shadow)).toEqual([])
        click(surface, 250, 30)
        expect(val()).toEqual({ rows: [0, 2] })
    })

    it("a legend outside the bind value picks again after undo", () => {
        const m = panels({ many: true })
        m.layers.unshift({ id: "legend", kind: "rects", geometry: [500, 60, 80, 40], payloads: [{ label: "a" }], axis: "ax1",
            events: ["click", "hover"], links: [["a:1", "a:3"]], bond: "legend" })
        m.initial = { cells: { rows: [] } }
        const { surface, val } = setup(m)
        click(surface, 250, 30)
        expect(val()).toEqual({ rows: [0, 2] })
        surface.focus()
        surface.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }))
        expect(val()).toEqual({ rows: [] })
        click(surface, 250, 30)
        expect(val()).toEqual({ rows: [0, 2] })
        click(surface, 250, 30) // every mark it names is held, so it takes them out
        expect(val()).toEqual({ rows: [] })
    })

    it("a legend outside the bind value fades its other series on a plain select = :many pick", () => {
        const L = (id: string, y: number, events: string[], many: boolean): HitLayer =>
            ({ id, kind: "circles", geometry: [100, y, 20, 300, y, 20], payloads: [{}, {}], axis: "ax1", events, ...(many ? { many: true } : {}) })
        const m: Manifest = { width: 1200, height: 800, scaling: 2, transforms: { ax1: tf(0) },
            layers: [
                { id: "legend", kind: "rects", geometry: [500, 60, 80, 40, 500, 160, 80, 40], payloads: [{ label: "a" }, { label: "b" }], axis: "ax1",
                    events: ["click", "hover"], links: [["a"], ["b"]], bond: "legend" },
                L("a", 300, ["click", "hover"], true), L("b", 600, ["hover"], false)],
            fields: ["a"], initial: { a: { items: [] } } }
        const { host, shadow, surface } = setup(m)
        const fading = () => [...shadow.querySelectorAll(".masque-fade")].flatMap((w) => ((w as HTMLElement).dataset.layers ?? "").split(",").filter(Boolean)).sort()
        // A mark's own pick fades its plot alone: no entry is held.
        click(surface, 50, 150)
        expect((host as unknown as { value: Record<string, unknown> }).value.a).toEqual({ items: [{ layer: "a", index: 0 }] })
        expect(fading()).toEqual(["a"])
        click(surface, 250, 30)
        expect((host as unknown as { value: Record<string, unknown> }).value.a).toEqual({ items: [{ layer: "a", index: 0 }, { layer: "a", index: 1 }] })
        expect(fading()).toEqual(["a", "b"])
    })

    it("undo puts the group's rows back", () => {
        const { surface, shadow, val } = setup(panels({ many: true }))
        click(surface, 50, 50)
        click(surface, 150, 150)
        surface.focus()
        surface.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }))
        expect(val()).toEqual({ rows: [0] })
        expect(fadeKept(shadow).sort()).toEqual(["a:0", "b:0"])
    })

    it("a member `onchange` hid draws no picks and no partners", async () => {
        const m = panels({ many: true })
        m.layers[1] = { ...m.layers[1], events: [], hidden: true } as HitLayer
        const { surface, shadow, val } = setup(m)
        click(surface, 50, 50) // a:0
        expect(val()).toEqual({ rows: [0] })
        expect(fadeKept(shadow)).toEqual(["a:0"])
        ptr(surface, "pointermove", 150, 150) // a:1
        await frame()
        expect(linkCentres(shadow)).toEqual([])
    })

    it("a held row's partners lose the hover outline, as the hovered mark does", async () => {
        const { surface, shadow } = setup(panels({ many: true }))
        ptr(surface, "pointermove", 50, 50) // a:0
        await frame()
        expect(linkCentres(shadow)).toEqual(["1100,700"])
        click(surface, 50, 50)
        await frame()
        const left = [...shadow.querySelectorAll("svg.masque-edge g.link > .masque-halo")]
        expect(left.every((c) => c.classList.contains("masque-leave"))).toBe(true)
    })

    it("moving to a mark without partners fades the partners out", async () => {
        const m = panels({ rows: { a: [0, 1, 2], b: [0, 0, 1] } }) // row 2 is only in a
        const { surface, shadow } = setup(m)
        ptr(surface, "pointermove", 50, 50) // a:0, partners b:0 and b:1
        await frame()
        expect(linkCentres(shadow).length).toBe(2)
        ptr(surface, "pointermove", 250, 250) // a:2, none
        await frame()
        const left = [...shadow.querySelectorAll("svg.masque-edge g.link > .masque-halo")]
        expect(left.length).toBe(2)
        expect(left.every((c) => c.classList.contains("masque-leave"))).toBe(true)
    })

    it("Enter on a focused member mark picks its row in both panels", () => {
        const { surface, shadow, val } = setup(panels({ many: true }))
        surface.focus()
        const down = (key: string) => surface.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
        down("ArrowRight")
        down("Enter")
        expect(val()).toEqual({ rows: [0] })
        expect(fadeKept(shadow).sort()).toEqual(["a:0", "b:0"])
    })

    it("a legend entry with Cmd/Ctrl adds its rows, and clicked again takes them out", () => {
        const m = panels({ many: true })
        m.layers.unshift({ id: "legend", kind: "rects", geometry: [500, 60, 80, 40], payloads: [{ label: "a" }], axis: "ax1",
            events: ["click", "hover"], links: [["a:2"]], bond: "legend" })
        m.fields = ["legend", "cells"]
        m.initial = { legend: null, cells: { rows: [] } }
        const { host, surface } = setup(m)
        const v = () => (host as unknown as { value: Record<string, unknown> }).value.cells
        click(surface, 50, 50) // row 0
        click(surface, 250, 30, { ctrlKey: true })
        expect(v()).toEqual({ rows: [0, 1] })
        click(surface, 250, 30)
        expect(v()).toEqual({ rows: [0] })
    })

    it("an onchange frame that hides a member keeps the rows and drops that member's marks", async () => {
        const m = panels({ many: true }, { onchange: true })
        const hidden = panels({ many: true }, { onchange: true })
        hidden.layers[1] = { ...hidden.layers[1], events: [], hidden: true } as HitLayer
        const host = document.createElement("div")
        const img = document.createElement("img")
        img.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect
        const script = document.createElement("script")
        host.append(img, script)
        document.body.append(host)
        const requestFrame = vi.fn(async () => ({ png: new Uint8Array([1, 2, 3]), manifest: hidden }))
        cleanups.push(mount(script, m, undefined, requestFrame).cleanup)
        const shadow = (host.lastElementChild as HTMLElement).shadowRoot!
        const surface = shadow.querySelector(".surface") as HTMLElement
        click(surface, 50, 50) // a:0
        await new Promise((r) => setTimeout(r, 0))
        expect(requestFrame).toHaveBeenCalled()
        img.dispatchEvent(new Event("load"))
        expect((host as unknown as { value: Record<string, unknown> }).value.cells).toEqual({ rows: [0] })
        expect(fadeKept(shadow)).toEqual(["a:0"])
    })
})
