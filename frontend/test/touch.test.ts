import { describe, it, expect } from "vitest"
import { hitTestAt, nearestInLayer, TOUCH_RADIUS } from "../src/geometry"
import type { HitLayer, Manifest } from "../src/types"

// A finger picks the nearest point or line within its reach (#528). Image px = CSS px × 2 here,
// as in Pluto, so the default 16 CSS px reach is 32 image px.
const ID = { s: 1, tx: 0, ty: 0 }
const FINGER = { pxPerCss_: 2 }

const circles = (id: string, g: number[], extra: Partial<HitLayer> = {}): HitLayer =>
    ({ id, kind: "circles", axis: "ax", events: ["click", "hover"], payloads: g.map(() => ({})), geometry: g, ...extra })
const manifest = (layers: HitLayer[], extra: Partial<Manifest> = {}): Manifest =>
    ({ width: 800, height: 600, scaling: 2, transforms: {}, layers, ...extra })

describe("touch hit test", () => {
    it("reaches the nearest marker within the radius, which a mouse misses", () => {
        const m = manifest([circles("pts", [100, 100, 5])])
        // 25 image px from the centre, 20 from the edge: past the mouse's 4 px slack.
        expect(hitTestAt(m, 125, 100, ID, "click")).toBeNull()
        expect(hitTestAt(m, 125, 100, ID, "click", null, 1, FINGER)?.index).toBe(0)
        // The reach is 16 CSS px = 32 image px from the marker's edge, and no further.
        expect(hitTestAt(m, 100 + 5 + 32, 100, ID, "click", null, 1, FINGER)?.index).toBe(0)
        expect(hitTestAt(m, 100 + 5 + 33, 100, ID, "click", null, 1, FINGER)).toBeNull()
        expect(TOUCH_RADIUS).toBe(16)
    })

    it("picks the nearest marker, not the one drawn on top", () => {
        // Element 1 is drawn last (on top) and is 20 px away; element 0 is 6 px away.
        const m = manifest([circles("pts", [100, 100, 3, 130, 100, 3])])
        // A mouse there, past both slacks, gets nothing; a finger gets the nearer, 0.
        expect(hitTestAt(m, 109, 100, ID, "click", null, 1, FINGER)?.index).toBe(0)
        expect(hitTestAt(m, 121, 100, ID, "click", null, 1, FINGER)?.index).toBe(1)
        // Inside two overlapping markers, the one drawn on top still wins.
        const o = manifest([circles("pts", [100, 100, 10, 105, 100, 10])])
        expect(hitTestAt(o, 102, 100, ID, "click", null, 1, FINGER)?.index).toBe(1)
        // `order` lists the top first (an Axis3's depth): it decides the tie.
        const d = manifest([circles("pts", [100, 100, 10, 105, 100, 10], { order: [0, 1] })])
        expect(hitTestAt(d, 102, 100, ID, "click", null, 1, FINGER)?.index).toBe(0)
    })

    it("compares points and lines across layers, nearest first", () => {
        const line: HitLayer = {
            id: "line", kind: "lines", axis: "ax", events: ["click"], payloads: [{}],
            geometry: [[0, 200, 400, 200]], linewidth: 4,
        }
        const m = manifest([circles("pts", [100, 150, 4]), line])
        // 30 px below the marker's edge, 18 above the line's stroke: the line.
        expect(hitTestAt(m, 100, 180, ID, "click", null, 1, FINGER)?.layer.id).toBe("line")
        // 6 below the marker's edge, 42 above the stroke: the marker.
        expect(hitTestAt(m, 100, 160, ID, "click", null, 1, FINGER)?.layer.id).toBe("pts")
        // On the stroke is on the line, even with no reach.
        const exact = { ...m, touch: { radius: 0 } }
        expect(hitTestAt(exact, 300, 201.5, ID, "click", null, 1, FINGER)?.layer.id).toBe("line")
        expect(hitTestAt(exact, 300, 203, ID, "click", null, 1, FINGER)).toBeNull()
    })

    it("reaches segments and polylines from the stroke's edge", () => {
        const segs: HitLayer = {
            id: "segs", kind: "segments", axis: "ax", events: ["click"], payloads: [{}, {}],
            geometry: [0, 100, 50, 100, 200, 100, 250, 100], linewidth: 2,
        }
        const m = manifest([segs])
        expect(hitTestAt(m, 25, 120, ID, "click", null, 1, FINGER)?.index).toBe(0)
        expect(hitTestAt(m, 175, 100, ID, "click", null, 1, FINGER)?.index).toBe(1)
        const poly: HitLayer = { ...segs, id: "poly", kind: "polyline", geometry: [0, 0, 100, 0, NaN, NaN, 200, 0, 300, 0], payloads: [{}, {}, {}, {}] }
        const p = manifest([poly])
        // The gap is no segment: a finger in it reaches the nearer real one.
        expect(hitTestAt(p, 175, 5, ID, "click", null, 1, FINGER)?.index).toBe(3)
        expect(hitTestAt(p, 120, 5, ID, "click", null, 1, FINGER)?.index).toBe(0)
    })

    it("keeps shapes inside-only, and an exact hit beats a near one", () => {
        const bars: HitLayer = {
            id: "bars", kind: "rects", axis: "ax", events: ["click"], payloads: [{}], geometry: [300, 300, 40, 100], tol: 6,
        }
        // The mouse's outline reach takes a pointer 4 px off the bar; a finger's doesn't.
        const m = manifest([bars])
        expect(hitTestAt(m, 324, 300, ID, "click")?.layer.id).toBe("bars")
        expect(hitTestAt(m, 324, 300, ID, "click", null, 1, FINGER)).toBeNull()
        expect(hitTestAt(m, 310, 300, ID, "click", null, 1, FINGER)?.layer.id).toBe("bars")
        // Inside the bar is an exact hit: it beats a marker drawn over the bar that is only
        // within reach, and loses to one the finger is on.
        const over = manifest([circles("pts", [300, 260, 4]), bars])
        expect(hitTestAt(over, 300, 280, ID, "click", null, 1, FINGER)?.layer.id).toBe("bars")
        expect(hitTestAt(over, 300, 262, ID, "click", null, 1, FINGER)?.layer.id).toBe("pts")
        // Above the bar, the marker's reach takes the tap.
        expect(hitTestAt(over, 300, 240, ID, "click", null, 1, FINGER)?.layer.id).toBe("pts")
        // A marker drawn under it (listed after) doesn't: the bar hides it.
        const under = manifest([bars, circles("pts", [300, 260, 4])])
        expect(hitTestAt(under, 300, 280, ID, "click", null, 1, FINGER)?.layer.id).toBe("bars")
    })

    it("takes the radius from the widget, then the layer", () => {
        const m = manifest([circles("pts", [100, 100, 5])], { touch: { radius: 4 } })
        expect(hitTestAt(m, 112, 100, ID, "click", null, 1, FINGER)?.index).toBe(0)
        expect(hitTestAt(m, 115, 100, ID, "click", null, 1, FINGER)).toBeNull()
        const own = manifest([circles("pts", [100, 100, 5], { touch: 10 })], { touch: { radius: 4 } })
        expect(hitTestAt(own, 124, 100, ID, "click", null, 1, FINGER)?.index).toBe(0)
        expect(hitTestAt(own, 126, 100, ID, "click", null, 1, FINGER)).toBeNull()
        // A layer's 0 is exact hits only.
        const zero = manifest([circles("pts", [100, 100, 5], { touch: 0 })])
        expect(hitTestAt(zero, 104, 100, ID, "click", null, 1, FINGER)?.index).toBe(0)
        expect(hitTestAt(zero, 106, 100, ID, "click", null, 1, FINGER)).toBeNull()
    })

    it("follows the screen: a smaller picture reaches further in image px", () => {
        const m = manifest([circles("pts", [100, 100, 5])])
        // At 4 image px per CSS px, 16 CSS px is 64 image px.
        expect(hitTestAt(m, 165, 100, ID, "click", null, 1, { pxPerCss_: 4 })?.index).toBe(0)
        expect(hitTestAt(m, 165, 100, ID, "click", null, 1, FINGER)).toBeNull()
    })

    it("gives a finger the mouse's rule with touch = false", () => {
        const m = manifest([circles("pts", [100, 100, 3, 130, 100, 3])], { touch: false })
        expect(hitTestAt(m, 125, 100, ID, "click", null, 1, FINGER)?.index).toBe(1)
        expect(hitTestAt(m, 115, 100, ID, "click", null, 1, FINGER)).toBeNull()
    })

    it("shrinks the reach by a live zoom, so it stays the same on screen", () => {
        const view = { id: "view", kind: "view", axis: "ax", events: ["drag"], payloads: [], geometry: { x: 0, y: 0, w: 800, h: 600, mode: "pan" } } as HitLayer
        const m = manifest([circles("pts", [100, 100, 5]), view])
        const zoom = { s: 2, tx: -100, ty: -100 }
        // The marker is drawn at (100, 100) with radius 10 on screen; 32 image px of reach on
        // screen is 16 in its own space.
        expect(hitTestAt(m, 100 + 10 + 31, 100, zoom, "click", null, 1, FINGER)?.index).toBe(0)
        expect(hitTestAt(m, 100 + 10 + 34, 100, zoom, "click", null, 1, FINGER)).toBeNull()
    })

    it("reads out the nearest sample of a line a finger reaches", () => {
        const line: HitLayer = {
            id: "line", kind: "lines", axis: "ax", events: ["click", "hover"], payloads: [{}],
            geometry: [[0, 100, 100, 100, 200, 100]], linewidth: 2, points: [[1, 5, 2, 6, 3, 7]],
        }
        const n = nearestInLayer(line, 190, 120, 32)
        expect(n?.dist).toBeCloseTo(19)
        expect(n?.hit.pt_?.[0]).toBe(2)
    })

    it("picks a sphere a finger is inside, by its drawn outline", () => {
        // A wide ellipse (60 × 10) around a small hit circle: inside the outline is on it.
        const m = manifest([circles("sph", [100, 100, 5], { ellipses: [900, 0, 25] })], { touch: { radius: 0 } })
        expect(hitTestAt(m, 125, 100, ID, "click", null, 1, FINGER)?.index).toBe(0)
        expect(hitTestAt(m, 100, 108, ID, "click", null, 1, FINGER)).toBeNull()
    })
})
