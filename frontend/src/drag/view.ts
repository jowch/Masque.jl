import { panLimits, orbitAngles, panLimits3, zoomLimits3 } from "../geometry"
import { fmt, VIEW_MIN_PX } from "../state"
import type { Drag, OverlayState } from "../state"
import type { AxisTransform, Limits3, ViewGeometry } from "../types"

export { VIEW_MIN_PX }

// `slide` is an Axis3 Shift+drag (#321): it pans the limits from `base` instead of orbiting.
export function begin(id: string, g: ViewGeometry, t: AxisTransform, x0: number, y0: number, pointerId: number, slide = false, base?: Limits3): Drag {
    const d: Drag = { kind: "view", id_: id, g_: g, t_: t, x0_: x0, y0_: y0, pointerId_: pointerId }
    if (slide && g.mode === "orbit" && base) { d.slide_ = true; d.base_ = base }
    return d
}

export function tip(d: Extract<Drag, { kind: "view" }>, p: { x: number; y: number }, digits: number): string {
    if (d.slide_ && d.base_) return limits3Tip(panLimits3(d.g_, d.base_, p.x - d.x0_, p.y - d.y0_), digits)
    if (d.g_.mode === "orbit") {
        const o = orbitAngles(d.g_, d.x0_, d.y0_, p.x, p.y)
        return `az=${fmt(o.azimuth, digits)} el=${fmt(o.elevation, digits)}`
    }
    return limitsTip(panLimits(d.t_, d.x0_, d.y0_, p.x, p.y), digits)
}

export function limitsTip(lim: { xmin: number; xmax: number; ymin: number; ymax: number }, digits: number): string {
    return `x:[${fmt(lim.xmin, digits)}, ${fmt(lim.xmax, digits)}] y:[${fmt(lim.ymin, digits)}, ${fmt(lim.ymax, digits)}]`
}

export function limits3Tip(l: Limits3, digits: number): string {
    return `x:[${fmt(l[0], digits)}, ${fmt(l[1], digits)}] y:[${fmt(l[2], digits)}, ${fmt(l[3], digits)}] z:[${fmt(l[4], digits)}, ${fmt(l[5], digits)}]`
}

// The Axis3 limits the next zoom or pan starts from: the last ones asked for, else `shown`, the
// limits of the frame on screen. A frame's limits can trail the requests still in flight.
export function view3Base(state: OverlayState, id: string, shown: Limits3): Limits3 {
    return state.view3_.get(id)?.limits ?? shown
}

// The first remembered limits' `shown` frame is the home the zoom is bounded around.
export function rememberView3(state: OverlayState, id: string, shown: Limits3, limits: Limits3): void {
    state.view3_.set(id, { limits, home: state.view3_.get(id)?.home ?? shown })
}

// One Axis3 zoom step from the remembered limits.
export function zoom3(state: OverlayState, id: string, shown: Limits3, k: number): Limits3 {
    const next = zoomLimits3(view3Base(state, id, shown), k, state.view3_.get(id)?.home ?? shown)
    rememberView3(state, id, shown, next)
    return next
}

// The gesture-channel request body for one frame (§12.6/#102): the same camera value `tip`
// reads for its readout, tagged with this drag's layer id (so Julia knows which
// ViewInteractable to drive) and whether this is the terminal ("settle") request — the flag
// that decides `px_per_unit` on the Julia side (dropped to 1 mid-gesture, restored on settle).
// `Masque._view_render_frame` tells the shapes apart by key: `azimuth` (orbit), `limits`
// (Axis3 zoom or pan, #321), else 2D pan limits.
export function requestInput(d: Extract<Drag, { kind: "view" }>, p: { x: number; y: number }, settle: boolean): Record<string, unknown> {
    if (d.slide_ && d.base_) return { id: d.id_, limits: panLimits3(d.g_, d.base_, p.x - d.x0_, p.y - d.y0_), settle }
    const payload = d.g_.mode === "orbit" ? orbitAngles(d.g_, d.x0_, d.y0_, p.x, p.y) : panLimits(d.t_, d.x0_, d.y0_, p.x, p.y)
    return { id: d.id_, ...payload, settle }
}
