import { panLimits, orbitAngles } from "../geometry"
import { fmt, VIEW_MIN_PX } from "../state"
import type { Drag } from "../state"
import type { AxisTransform, ViewGeometry } from "../types"

export { VIEW_MIN_PX }

export function begin(id: string, g: ViewGeometry, t: AxisTransform, x0: number, y0: number, pointerId: number): Drag {
    return { kind: "view", id_: id, g_: g, t_: t, x0_: x0, y0_: y0, pointerId_: pointerId }
}

export function tip(d: Extract<Drag, { kind: "view" }>, p: { x: number; y: number }): string {
    if (d.g_.mode === "orbit") {
        const o = orbitAngles(d.g_, d.x0_, d.y0_, p.x, p.y)
        return `az=${fmt(o.azimuth)} el=${fmt(o.elevation)}`
    }
    const lim = panLimits(d.t_, d.x0_, d.y0_, p.x, p.y)
    return `x:[${fmt(lim.xmin)}, ${fmt(lim.xmax)}] y:[${fmt(lim.ymin)}, ${fmt(lim.ymax)}]`
}

// The gesture-channel request body for one frame (§12.6/#102): the same camera value `tip`
// reads for its readout, tagged with this drag's layer id (so Julia knows which
// ViewInteractable to drive) and whether this is the terminal ("settle") request — the flag
// that decides `px_per_unit` on the Julia side (dropped to 1 mid-gesture, restored on settle).
// `haskey(input, "azimuth")` is how `Masque._view_render_frame` tells pan from orbit; the two
// payload shapes are mutually exclusive by construction, same as `end`'s old commit payload was.
export function requestInput(d: Extract<Drag, { kind: "view" }>, p: { x: number; y: number }, settle: boolean): Record<string, unknown> {
    const payload = d.g_.mode === "orbit" ? orbitAngles(d.g_, d.x0_, d.y0_, p.x, p.y) : panLimits(d.t_, d.x0_, d.y0_, p.x, p.y)
    return { id: d.id_, ...payload, settle }
}
