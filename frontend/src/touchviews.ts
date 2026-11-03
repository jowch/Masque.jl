// Touch on plots with drag layers (#530, #537). The surface takes `touch-action: pan-x pan-y`,
// so a finger scrolls the page, and these non-passive touch listeners take a touch back only
// where there is something to move:
//
// - One finger on a threshold line, a band, or an ROI box (with its finger-sized grab area,
//   geometry.ts's Grab) cancels the page scroll, and bond.ts's drag owns the finger.
// - One finger on a view scrolls the page and shows "Use two fingers to move the plot" in the
//   corner note, the touch twin of the wheel's hint (#526).
// - Two fingers on a view pan it and pinch-zoom it around their midpoint, through the same
//   photograph and readout a drag uses. An Axis3 orbits with two fingers and a pinch zooms its
//   limits. Lifting a finger settles the view.
//
// `masque(...; touch = (; views = :onefinger))` keeps 0.4's one-finger pan: the surface takes
// `touch-action: none` and none of this runs.
import type { Drag, OverlayCtx, OverlayState } from "./state"
import { layoutImagePx } from "./state"
import type { HitLayer, Limits3, Manifest, ViewGeometry } from "./types"
import { hitTestAt, innermostView, matrixLimits, slopScale, zoomLimits3 } from "./geometry"
import { touchReach } from "./state"
import { clearWheelTimer, photoHeldByOther, settleCurrentPan, shownViewTransform } from "./bond"
import { hideTip, hideViewReadout, showViewReadout } from "./hover"
import { hideCross } from "./cross"
import { panTo, unmapPoint, clampScale } from "./photo"
import * as viewDrag from "./drag/view"

export const TWO_FINGER_HINT = "Use two fingers to move the plot"
// The pointer id a two-finger gesture's drag carries. No real pointer has it, so bond.ts's
// pointer handlers never steer, end or cancel the gesture.
export const TOUCH_PAIR_ID = -2
// A finger that moves this far (CSS px) on a view is scrolling the page.
const SCROLL_SLOP_PX = 10
// A pinch that changes the finger spread by less than this is a two-finger orbit, not a zoom.
const PINCH_MIN = 0.02

// What the surface's `touch-action` is: none for 0.4's one-finger views, pan-x pan-y for any
// other plot with a drag layer, and the browser's own for a plot without one. Decided up front:
// browsers read it at a touch's first contact.
export function surfaceTouchAction(manifest: Manifest): string {
    if (!manifest.layers.some((l) => l.events.includes("drag"))) return ""
    if (manifest.touchViews === "onefinger" && manifest.layers.some((l) => l.kind === "view")) return "none"
    return "pan-x pan-y"
}

// True when one finger would move a view here: 0.4's rule, on request.
export const oneFingerViews = (manifest: Manifest): boolean => manifest.touchViews === "onefinger"

// The drag layer a finger at this client point takes, other than a view: a threshold line, a
// band or an ROI box, hit with the finger's grab area.
export function handleAt(ctx: OverlayCtx, state: OverlayState, clientX: number, clientY: number): HitLayer | null {
    const layout = layoutImagePx(ctx.base_, ctx.manifest_, clientX, clientY)
    const slop = slopScale(ctx.manifest_, ctx.base_.getBoundingClientRect().width)
    const hit = hitTestAt(ctx.manifest_, layout.x, layout.y, state.photo_, "drag", state.photoViewId_, slop, touchReach(ctx.base_, ctx.manifest_, "touch"))
    return hit && hit.layer.kind !== "view" ? hit.layer : null
}

type ViewDrag = Extract<Drag, { kind: "view" }>

interface Pair {
    drag_: ViewDrag
    d_: number // the last finger spread, CSS px
    // Axis3: the limits the gesture started from, the pinch so far, and the last limits asked.
    base3_?: Limits3
    k3_: number
    zoomed3_?: boolean
    lim3_?: Limits3
}

const midpoint = (t: TouchList) => {
    const a = t[0], b = t[1]
    if (!a || !b) return null
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) }
}

export interface TouchViews {
    start_(e: TouchEvent): void
    move_(e: TouchEvent): void
    end_(e: TouchEvent): void
    cancel_(): void
}

export function touchViews(ctx: OverlayCtx, state: OverlayState, showHint: () => void): TouchViews {
    let pair: Pair | null = null
    // One finger's start on a view, until it scrolls (and shows the hint) or lifts.
    let one: { x: number; y: number } | null = null

    const begin = (e: TouchEvent): boolean => {
        if (state.drag_ || e.touches.length !== 2) return false
        const m = midpoint(e.touches)
        if (!m) return false
        const layout = layoutImagePx(ctx.base_, ctx.manifest_, m.x, m.y)
        const layer = innermostView(ctx.manifest_, layout.x, layout.y)
        if (!layer) return false
        const g = layer.geometry as ViewGeometry
        const t = ctx.manifest_.transforms[layer.axis]
        if (g.mode === "pan" && (!t || photoHeldByOther(state, layer.id))) return false
        const drag = viewDrag.begin(layer.id, g, t, layout.x, layout.y, TOUCH_PAIR_ID) as ViewDrag
        if (g.mode === "pan") {
            if (clearWheelTimer(state)) drag.settleOwed_ = true
            state.photoViewId_ = layer.id
            state.photoAnchor_ = unmapPoint(state.photo_, layout)
        } else if (clearWheelTimer(state)) drag.settleOwed_ = true
        state.drag_ = drag
        pair = { drag_: drag, d_: Math.max(m.d, 1), k3_: 1 }
        if (g.mode === "orbit" && g.limits) pair.base3_ = viewDrag.view3Base(state, layer.id, g.limits)
        hideTip(ctx, state)
        hideCross(ctx, state)
        ctx.surface_.classList.add("grabbing")
        return true
    }

    const apply = (p: Pair, e: TouchEvent) => {
        const d = p.drag_
        const m = midpoint(e.touches)
        if (!m) return
        const layout = layoutImagePx(ctx.base_, ctx.manifest_, m.x, m.y)
        const k = Math.max(m.d, 1) / p.d_
        if (d.g_.mode === "pan") {
            // The content under the fingers stays under them: the anchor follows the midpoint,
            // and the spread scales the photograph. Both are in the frame on screen now, which
            // a landing frame rebases (mount.ts's adoptPhoto).
            const anchor = state.photoAnchor_ ?? unmapPoint(state.photo_, layout)
            state.photoAnchor_ = anchor
            const next = panTo(anchor, layout, clampScale(state.photo_.s * k))
            const lim = matrixLimits(shownViewTransform(ctx, d.id_, d.t_), next)
            // A refused step keeps its spread for the next move.
            if (!lim) return
            p.d_ = Math.max(m.d, 1)
            state.photo_ = next
            state.photoViewId_ = d.id_
            ctx.photoPaint_(next)
            const input = { id: d.id_, ...lim, settle: false, s: next.s, tx: next.tx, ty: next.ty }
            ctx.gesture_.request(input)
            d.lastInput_ = input
            showViewReadout(ctx, state, viewDrag.limitsTip(lim, ctx.tipDigits_, d.t_, ctx.tipExplicit_))
            return
        }
        // Axis3: the midpoint orbits; the spread zooms the limits about their center. Once a
        // pinch zooms, every later request carries limits, so the settle and the remembered
        // view match what was last asked.
        p.d_ = Math.max(m.d, 1)
        p.k3_ *= k
        const input: Record<string, unknown> = viewDrag.requestInput(d, layout, false)
        if (p.base3_ !== undefined && Math.abs(p.k3_ - 1) > PINCH_MIN) p.zoomed3_ = true
        const zoomed = p.zoomed3_ === true
        if (zoomed) {
            const home = state.view3_.get(d.id_)?.home ?? (d.g_.limits as Limits3)
            p.lim3_ = zoomLimits3(p.base3_ as Limits3, p.k3_, home)
            input.limits = p.lim3_
        }
        ctx.gesture_.request(input)
        d.lastInput_ = input
        const text = zoomed && Math.hypot(layout.x - d.x0_, layout.y - d.y0_) < viewDrag.VIEW_MIN_PX
            ? viewDrag.limits3Tip(p.lim3_ as Limits3, ctx.tipDigits_, d.t_, ctx.tipExplicit_)
            : viewDrag.tip(d, layout, ctx.tipDigits_, ctx.tipExplicit_)
        showViewReadout(ctx, state, text)
    }

    const finish = () => {
        const p = pair
        if (!p) return
        pair = null
        const d = p.drag_
        if (state.drag_ === d) state.drag_ = null
        ctx.surface_.classList.remove("grabbing")
        hideViewReadout(ctx)
        if (d.g_.mode === "pan") {
            if (d.lastInput_ !== undefined || d.settleOwed_) settleCurrentPan(ctx, state, d)
            state.photoAnchor_ = null
        } else if (d.lastInput_ !== undefined) {
            ctx.gesture_.settle({ ...d.lastInput_, settle: true })
            if (p.lim3_ && d.g_.limits) viewDrag.rememberView3(state, d.id_, d.g_.limits, p.lim3_)
        }
        // The fingers lifting are no tap: no click picks a mark under them.
        state.justDragged_ = true
    }

    return {
        start_(e) {
            // `views = :onefinger` with a view sets touch-action none and attaches none of this;
            // without a view it still takes the handles below.
            const views = !oneFingerViews(ctx.manifest_)
            if (e.touches.length === 1) {
                const t = e.touches[0]
                if (!t) return
                // A finger on a handle drags it, so the page holds still under it.
                if (handleAt(ctx, state, t.clientX, t.clientY)) {
                    if (e.cancelable) e.preventDefault()
                    one = null
                    return
                }
                if (!views) return
                const layout = layoutImagePx(ctx.base_, ctx.manifest_, t.clientX, t.clientY)
                one = innermostView(ctx.manifest_, layout.x, layout.y) ? { x: t.clientX, y: t.clientY } : null
                return
            }
            one = null
            // Once the page is scrolling the browser owns the touch (not cancelable), and a
            // second finger keeps scrolling it.
            if (!views || pair || !e.cancelable) return
            if (begin(e)) e.preventDefault()
        },
        move_(e) {
            if (pair) {
                if (e.touches.length < 2) return
                if (e.cancelable) e.preventDefault()
                apply(pair, e)
                return
            }
            if (one && e.touches.length === 1) {
                const t = e.touches[0]
                if (t && Math.hypot(t.clientX - one.x, t.clientY - one.y) > SCROLL_SLOP_PX) {
                    one = null
                    showHint()
                }
            }
        },
        end_(e) {
            if (e.touches.length === 0) one = null
            if (pair && e.touches.length < 2) finish()
        },
        cancel_() {
            one = null
            finish()
        },
    }
}
