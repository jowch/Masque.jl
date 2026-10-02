import { invertAxis, matrixLimits, projectAxis } from "./geometry"
import { hideTip, placeTip, setMarkAccent, setTipText, setTipVisible } from "./hover"
import { scheduleAnnounce } from "./keyboard"
import { settleCurrentPan } from "./bond"
import { fmt } from "./state"
import type { Drag, OverlayCtx, OverlayState } from "./state"
import * as thresholdDrag from "./drag/threshold"
import * as roiDrag from "./drag/roi"
import * as viewDrag from "./drag/view"
import { mapPoint, unmapPoint, wheelScale, zoomAt } from "./photo"
import type { HitLayer, ThresholdGeometry, ViewGeometry } from "./types"

// Keyboard path for the three drag kinds (#169). Each drag layer gets its own tab stop after
// the plot surface, so arrows on the surface keep walking marks (keyboard.ts) and arrows here
// nudge the line, the box, or the camera. The stops reuse the pointer path's geometry
// (drag/*.ts and bond.ts's settle) and keep the pointer's commit rule: the readout updates on
// every keydown, the bond (or, for a view, the settle) goes out once, on keyup.

const STEP_CSS = 1
const PAGE_CSS = 10
const VIEW_STEP = 0.1 // fraction of the axis viewport per arrow press, pan and orbit alike
const ZOOM_NOTCH = 100 // one wheel notch, in wheelScale's pixel units

const NUDGE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", "+", "=", "-", "_"])

export interface DragStops {
    // Re-place each stop over its line, box, or viewport. Cheap: a handful of style writes.
    sync_: () => void
    cleanup_: () => void
}

const HINTS = {
    thresholdH: "Use Up or Down arrow to move the line, Page Up or Page Down for a larger step, Home or End for the ends.",
    thresholdV: "Use Left or Right arrow to move the line, Page Up or Page Down for a larger step, Home or End for the ends.",
    roi: "Use arrow keys to move the box, Page Up or Page Down for a larger step. " +
        "Alt with an arrow grows that side; Alt and Shift with an arrow shrinks it.",
    pan: "Use arrow keys to pan, plus or minus to zoom.",
    orbit: "Use arrow keys to rotate the view.",
}

function layerById(ctx: OverlayCtx, id: string): HitLayer | undefined {
    return ctx.manifest_.layers.find((l) => l.id === id)
}

// Image px per CSS px: the manifest's render width over the live width. 0 before layout.
function pxPerCss(ctx: OverlayCtx): number {
    const w = ctx.base_.getBoundingClientRect().width
    return w > 0 ? ctx.manifest_.width / w : ctx.manifest_.scaling
}

function thresholdValue(layer: HitLayer, ctx: OverlayCtx): string {
    const tg = layer.geometry as ThresholdGeometry
    const t = ctx.manifest_.transforms[layer.axis]
    if (!t) return ""
    const [lo, hi] = tg.span
    const mid = (lo + hi) / 2
    const v = tg.orientation === "h" ? invertAxis(t, mid, tg.pos).y : invertAxis(t, tg.pos, mid).x
    return fmt(v, ctx.tipDigits_)
}

export function buildDragStops(ctx: OverlayCtx, state: OverlayState, shadow: ShadowRoot): DragStops {
    const stops: { place: () => void; off: () => void }[] = []
    let hintN = 0

    for (const layer of ctx.manifest_.layers) {
        if (!layer.events.includes("drag")) continue
        if (layer.kind !== "threshold" && layer.kind !== "roi" && layer.kind !== "view") continue
        const id = layer.id
        const el = document.createElement("div")
        el.className = `drag-stop drag-stop-${layer.kind}`
        el.setAttribute("tabindex", "0")
        el.dataset.layer = id
        const hint = document.createElement("div")
        hint.id = `masque-drag-hint-${hintN++}`
        hint.className = "sr-only"
        el.setAttribute("aria-describedby", hint.id)

        if (layer.kind === "threshold") {
            const h = (layer.geometry as ThresholdGeometry).orientation === "h"
            el.setAttribute("role", "slider")
            // A horizontal line moves vertically: the slider's orientation is the free axis.
            el.setAttribute("aria-orientation", h ? "vertical" : "horizontal")
            el.setAttribute("aria-label", layer.label ?? "Threshold")
            el.setAttribute("aria-valuetext", thresholdValue(layer, ctx))
            hint.textContent = h ? HINTS.thresholdH : HINTS.thresholdV
        } else if (layer.kind === "roi") {
            el.setAttribute("role", "application")
            el.setAttribute("aria-label", layer.label ?? "Selection box")
            hint.textContent = HINTS.roi
        } else {
            const orbit = (layer.geometry as ViewGeometry).mode === "orbit"
            el.setAttribute("role", "application")
            el.setAttribute("aria-label", layer.label ?? (orbit ? "Rotate view" : "Pan view"))
            hint.textContent = orbit ? HINTS.orbit : HINTS.pan
        }

        // What keyup (or blur) still owes: the bond write for a line or box, the settle for a
        // view. Null between presses. `held` is the keys whose keydown changed the gesture and
        // are still down: the commit waits for the last of them, so a key the stop swallows, or
        // the first key let go from a chord, does not commit in the middle of a hold.
        let pending: (() => void) | null = null
        const held = new Set<string>()
        // Orbit has no matrix to accumulate into, so it keeps the camera it last asked for.
        // A frame's geometry carries the camera it rendered, which can trail a held key's
        // later requests, so it is only the starting point; leaving the stop drops this.
        let orbitCam: { azimuth: number; elevation: number } | null = null

        const flush = () => {
            const p = pending
            pending = null
            held.clear()
            p?.()
        }

        const showReadout = (text: string) => {
            setMarkAccent(ctx, null)
            setTipText(ctx, state, text)
            setTipVisible(ctx, true)
            const s = pxPerCss(ctx)
            const r = el.style
            const cx = (parseFloat(r.left) + parseFloat(r.width) / 2) / 100 * ctx.manifest_.width / s
            const cy = (parseFloat(r.top) + parseFloat(r.height) / 2) / 100 * ctx.manifest_.height / s
            placeTip(ctx, state, Number.isFinite(cx) ? cx : 0, Number.isFinite(cy) ? cy : 0)
            scheduleAnnounce(ctx, state, text)
        }

        const nudgeThreshold = (l: HitLayer, e: KeyboardEvent): boolean => {
            const tg = l.geometry as ThresholdGeometry
            const t = ctx.manifest_.transforms[l.axis]
            const line = ctx.thresholdLines_.get(id)
            if (!t || !line) return false
            const h = tg.orientation === "h"
            const [vx, vy, vw, vh] = t.viewport
            // Arrows and Page keys are spatial: Up and Page Up move the line up, Right moves it
            // right. Home and End follow the value, so they swap on a reversed axis.
            const cats = h ? t.ycats : t.xcats
            let step = pxPerCss(ctx) * (e.key === "PageUp" || e.key === "PageDown" ? PAGE_CSS : STEP_CSS)
            // A categorical axis snaps to the nearest category on release, so a sub-category
            // step would snap straight back. Step one category instead.
            if (cats && cats.length > 1) {
                const a = projectAxis(t, h ? 0 : 1, h ? 1 : 0), b = projectAxis(t, h ? 0 : 2, h ? 2 : 0)
                step = Math.abs(h ? b.y - a.y : b.x - a.x)
            }
            const up = h ? -1 : 1 // pixel direction of "more" along the free axis, unreversed
            const rev = h ? t.yreversed : t.xreversed
            const lo = h ? vy + vh : vx, hi = h ? vy : vx + vw // pixel ends of the smallest/largest value
            let pos = tg.pos
            switch (e.key) {
                case "ArrowUp": if (!h) return true; pos -= step; break
                case "ArrowDown": if (!h) return true; pos += step; break
                case "ArrowLeft": if (h) return true; pos -= step; break
                case "ArrowRight": if (h) return true; pos += step; break
                case "PageUp": pos += up * step; break
                case "PageDown": pos -= up * step; break
                case "Home": pos = rev ? hi : lo; break
                case "End": pos = rev ? lo : hi; break
                default: return false
            }
            const d = thresholdDrag.begin(id, line, tg, t, -1) as Extract<Drag, { kind: "threshold" }>
            const mid = (tg.span[0] + tg.span[1]) / 2
            const p = h ? { x: mid, y: pos } : { x: pos, y: mid }
            const text = thresholdDrag.move(d, p, ctx.tipDigits_)
            el.setAttribute("aria-valuetext", text)
            place()
            showReadout(text)
            pending = () => {
                (ctx.host_ as unknown as { value: unknown }).value = thresholdDrag.end(d, { x: h ? mid : d.tg_.pos, y: h ? d.tg_.pos : mid })
                ctx.host_.dispatchEvent(new CustomEvent("input"))
                el.setAttribute("aria-valuetext", thresholdValue(l, ctx))
                place()
            }
            return true
        }

        const nudgeROI = (e: KeyboardEvent): boolean => {
            const box = ctx.roiBoxes_.get(id)
            if (!box) return false
            const g = box.g_
            const step = pxPerCss(ctx) * (e.key === "PageUp" || e.key === "PageDown" ? PAGE_CSS : STEP_CSS)
            let dx = 0, dy = 0
            switch (e.key) {
                case "ArrowUp": dy = -step; break
                case "ArrowDown": dy = step; break
                case "ArrowLeft": dx = -step; break
                case "ArrowRight": dx = step; break
                // Page keys are the larger step, vertical: Up and Down, as in a scrolled list.
                case "PageUp": dy = -step; break
                case "PageDown": dy = step; break
                default: return false
            }
            let d: Extract<Drag, { kind: "roi" }>
            let p: { x: number; y: number }
            if (e.altKey) {
                // The arrow names the side; Shift turns grow into shrink. Shrinking stops one
                // step short of the opposite side so the box never flips.
                const edge = dx < 0 ? "w" : dx > 0 ? "e" : dy < 0 ? "n" : "s"
                const sign = e.shiftKey ? -1 : 1
                const amt = Math.abs(dx || dy)
                const room = (edge === "w" || edge === "e" ? g.w : g.h) - pxPerCss(ctx)
                const by = sign > 0 ? amt : -Math.max(0, Math.min(amt, room))
                switch (edge) {
                    case "w": d = roiDrag.begin(id, box, { edge }, g.x + g.w, 0, -1) as typeof d; p = { x: g.x - by, y: 0 }; break
                    case "e": d = roiDrag.begin(id, box, { edge }, g.x, 0, -1) as typeof d; p = { x: g.x + g.w + by, y: 0 }; break
                    case "n": d = roiDrag.begin(id, box, { edge }, 0, g.y + g.h, -1) as typeof d; p = { x: 0, y: g.y - by }; break
                    default: d = roiDrag.begin(id, box, { edge }, 0, g.y, -1) as typeof d; p = { x: 0, y: g.y + g.h + by }; break
                }
            } else {
                d = roiDrag.begin(id, box, { move: true }, 0, 0, -1) as typeof d
                p = { x: g.x + dx, y: g.y + dy }
            }
            const text = roiDrag.move(ctx, state, d, p)
            place()
            showReadout(text)
            pending = () => {
                (ctx.host_ as unknown as { value: unknown }).value = roiDrag.end(ctx, state, d)
                ctx.host_.dispatchEvent(new CustomEvent("input"))
            }
            return true
        }

        const nudgeView = (l: HitLayer, e: KeyboardEvent): boolean => {
            const g = l.geometry as ViewGeometry
            const t = ctx.manifest_.transforms[l.axis]
            if (!t || !(g.w > 0) || !(g.h > 0)) return false
            let dx = 0, dy = 0, zoom = 0
            switch (e.key) {
                case "ArrowUp": dy = -1; break
                case "ArrowDown": dy = 1; break
                case "ArrowLeft": dx = -1; break
                case "ArrowRight": dx = 1; break
                case "+": case "=": zoom = 1; break
                case "-": case "_": zoom = -1; break
                default: return false
            }
            if (g.mode === "orbit") {
                if (zoom !== 0) return true // wheel zoom is pan-only; consume so the page stays put
                const cam = orbitCam ?? { azimuth: g.azimuth ?? 0, elevation: g.elevation ?? 0 }
                // One press is a mouse drag of a tenth of the viewport, from the last camera.
                const o = viewDrag.begin(id, { ...g, ...cam }, t, 0, 0, -1) as Extract<Drag, { kind: "view" }>
                const p = { x: dx * VIEW_STEP * g.w, y: dy * VIEW_STEP * g.h }
                const input = viewDrag.requestInput(o, p, false)
                orbitCam = { azimuth: input.azimuth as number, elevation: input.elevation as number }
                state.keyView_ = true
                ctx.gesture_.request(input)
                showReadout(viewDrag.tip(o, p, ctx.tipDigits_))
                pending = () => { state.keyView_ = false; ctx.gesture_.settle({ ...input, settle: true }) }
                return true
            }
            const d = viewDrag.begin(id, g, t, g.x + g.w / 2, g.y + g.h / 2, -1) as Extract<Drag, { kind: "view" }>
            // A live wheel-idle timer was that notch's only settle. The keyup settle below
            // covers the current photo, so the timer can go.
            if (state.wheelTimer_ !== null) { clearTimeout(state.wheelTimer_); state.wheelTimer_ = null }
            state.photoViewId_ = id
            const m = state.photo_
            // Right shows data further right: the content slides left.
            const next = zoom !== 0
                ? zoomAt(m, unmapPoint(m, { x: d.x0_, y: d.y0_ }), wheelScale(-zoom * ZOOM_NOTCH, 0))
                : { s: m.s, tx: m.tx - dx * VIEW_STEP * g.w, ty: m.ty - dy * VIEW_STEP * g.h }
            const lim = matrixLimits(t, next)
            if (!lim) return true
            state.photo_ = next
            ctx.photoPaint_(next)
            state.keyView_ = true
            ctx.gesture_.request({ id, ...lim, settle: false, s: next.s, tx: next.tx, ty: next.ty })
            showReadout(viewDrag.limitsTip(lim, ctx.tipDigits_))
            pending = () => { state.keyView_ = false; settleCurrentPan(ctx, state, d) }
            return true
        }

        // Image-px box → percentages of the figure, so a resize needs no re-place.
        const setBox = (x: number, y: number, w: number, hgt: number) => {
            const W = ctx.manifest_.width, H = ctx.manifest_.height
            if (!(W > 0) || !(H > 0)) return
            el.style.left = `${(x / W) * 100}%`
            el.style.top = `${(y / H) * 100}%`
            el.style.width = `${(w / W) * 100}%`
            el.style.height = `${(hgt / H) * 100}%`
        }
        // The line and the box ride the photographic matrix with the data; the view's
        // viewport does not move.
        function place(): void {
            const l = layerById(ctx, id)
            if (!l) return
            if (l.kind === "threshold") {
                const tg = l.geometry as ThresholdGeometry
                const [a, b] = tg.orientation === "h"
                    ? [{ x: tg.span[0], y: tg.pos }, { x: tg.span[1], y: tg.pos }]
                    : [{ x: tg.pos, y: tg.span[0] }, { x: tg.pos, y: tg.span[1] }]
                const p = mapPoint(state.photo_, a), q = mapPoint(state.photo_, b)
                setBox(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(q.x - p.x), Math.abs(q.y - p.y))
            } else if (l.kind === "roi") {
                const g = ctx.roiBoxes_.get(id)?.g_
                if (!g) return
                const p = mapPoint(state.photo_, { x: g.x, y: g.y })
                setBox(p.x, p.y, g.w * state.photo_.s, g.h * state.photo_.s)
            } else {
                const g = l.geometry as ViewGeometry
                setBox(g.x, g.y, g.w, g.h)
            }
        }

        const onKeydown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault(); e.stopPropagation()
                el.blur()
                return
            }
            // Ctrl or Cmd with + is browser zoom; leave every modified chord to the browser.
            if (e.ctrlKey || e.metaKey || !NUDGE_KEYS.has(e.key)) return
            const l = layerById(ctx, id)
            // A pointer drag owns the geometry until it is released.
            if (!l || state.drag_) return
            const before = pending
            const handled = l.kind === "threshold" ? nudgeThreshold(l, e)
                : l.kind === "roi" ? nudgeROI(e)
                    : l.kind === "view" ? nudgeView(l, e) : false
            if (pending !== before) held.add(e.key)
            if (handled) { e.preventDefault(); e.stopPropagation() }
        }
        const onKeyup = (e: KeyboardEvent) => {
            if (!held.delete(e.key) || held.size > 0) return
            flush()
        }
        const onFocus = () => place()
        const onBlur = () => {
            flush()
            orbitCam = null
            hideTip(ctx, state)
        }
        el.addEventListener("keydown", onKeydown)
        el.addEventListener("keyup", onKeyup)
        el.addEventListener("focus", onFocus)
        el.addEventListener("blur", onBlur)
        place()
        shadow.append(el, hint)
        stops.push({
            place,
            off: () => {
                el.removeEventListener("keydown", onKeydown)
                el.removeEventListener("keyup", onKeyup)
                el.removeEventListener("focus", onFocus)
                el.removeEventListener("blur", onBlur)
            },
        })
    }

    return {
        sync_: () => { for (const s of stops) s.place() },
        cleanup_: () => { for (const s of stops) s.off() },
    }
}
