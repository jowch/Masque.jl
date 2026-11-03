// A finger has no hover (#529). A tap on a mark selects it, as a click does, and also shows
// the mark's tooltip, which stays after the finger lifts: until the next tap, Escape, focus
// leaving the plot, or a scroll that moves the plot. A press held still for HOLD_MS turns the
// rest of that touch into a scrub: the page stops scrolling and the tooltip or readout follows
// the finger. Mouse and pen never reach any of this: each handler reads the event's own
// pointerType, so a touchscreen laptop keeps hover for its mouse.
import type { OverlayCtx, OverlayState, TouchState } from "./state"
import { applyMove, onLeave } from "./hover"

export const HOLD_MS = 350
// A finger that moves this far (css px) before the hold fires is starting a scroll.
const HOLD_SLOP_PX = 10

const isTouch = (e: PointerEvent) => e.pointerType === "touch"

// A move that left the slop before HOLD_MS had passed, by the input's own timestamps, is a
// scroll even when a busy page ran the hold timer before it could deliver that move.
function movedEarly(t: TouchState, x: number, y: number, ts: number): boolean {
    const s = t.start_
    return !!s && ts - s.t < HOLD_MS && Math.hypot(x - s.x, y - s.y) > HOLD_SLOP_PX
}

// The hold, now: the finger stayed inside the slop for HOLD_MS.
function startScrub(ctx: OverlayCtx, state: OverlayState, e: PointerEvent): void {
    const t = state.touch_
    cancelHold(t)
    if (state.drag_) return
    t.scrub_ = true
    applyMove(ctx, state, e)
}

// A busy page runs input before an overdue timer, so the first move after a real hold can
// arrive while the hold is still pending. The move's own samples say which came first: one
// that left the slop before HOLD_MS is a scroll, one at HOLD_MS or later means the hold was due.
function holdDue(t: TouchState, e: PointerEvent): boolean {
    const s = t.start_
    if (!t.hold_ || !s || s.id !== e.pointerId) return false
    const samples = e.getCoalescedEvents?.() ?? []
    for (const p of samples.length ? samples : [e]) {
        if (p.timeStamp - s.t >= HOLD_MS) return true
        if (Math.hypot(p.clientX - s.x, p.clientY - s.y) > HOLD_SLOP_PX) return false
    }
    return false
}

function cancelHold(t: TouchState): void {
    if (t.hold_) clearTimeout(t.hold_.timer)
    t.hold_ = null
}

// The finger the hold and scrub follow is the first one down; start_ is keyed by its pointer id.
const otherFinger = (t: TouchState, e: PointerEvent) => t.start_ !== null && t.start_.id !== e.pointerId

// After onDown. A new touch takes the last tap's tooltip off its pin: if this touch turns into
// a scroll, the browser cancels it and pointerleave clears the tooltip as it does for a mouse.
// A second finger ends the first one's hold or scrub, so a pinch is never a scrub.
export function touchDown(ctx: OverlayCtx, state: OverlayState, e: PointerEvent): void {
    const t = state.touch_
    if (!isTouch(e)) return
    t.pin_ = null
    t.scrub_ = false
    cancelHold(t)
    if (otherFinger(t, e)) return
    t.last_ = e
    t.start_ = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }
    // A drag layer (threshold, ROI, view) took the press: it already owns the finger.
    if (state.drag_) return
    const id = e.pointerId
    t.hold_ = {
        id, x: e.clientX, y: e.clientY,
        timer: setTimeout(() => startScrub(ctx, state, t.last_ ?? e), HOLD_MS),
    }
}

export function touchMove(ctx: OverlayCtx, state: OverlayState, e: PointerEvent): void {
    const t = state.touch_
    // A mouse or pen moving over the plot owns hover again.
    if (!isTouch(e)) { t.pin_ = null; return }
    if (otherFinger(t, e)) return
    t.last_ = e
    if (holdDue(t, e)) { startScrub(ctx, state, e); return }
    if (t.scrub_ && movedEarly(t, e.clientX, e.clientY, e.timeStamp)) t.scrub_ = false
    const h = t.hold_
    if (h && h.id === e.pointerId && Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_SLOP_PX) cancelHold(t)
}

// After onUp, so a drag is already over. A tap, or the end of a scrub, leaves its tooltip up.
// A threshold or ROI press counts as a drag (justDragged_), and its readout goes with it.
export function touchUp(ctx: OverlayCtx, state: OverlayState, e: PointerEvent): boolean {
    const t = state.touch_
    if (!isTouch(e)) return false
    if (otherFinger(t, e)) return false
    t.start_ = null
    cancelHold(t)
    t.scrub_ = false
    if (state.drag_ || state.justDragged_) return false
    applyMove(ctx, state, e)
    if (!ctx.tip_.classList.contains("show")) return false
    const r = ctx.surface_.getBoundingClientRect()
    t.pin_ = { left: r.left, top: r.top }
    return true
}

export function touchCancel(state: OverlayState, e: PointerEvent): void {
    if (!isTouch(e)) return
    const t = state.touch_
    if (!otherFinger(t, e)) t.start_ = null
    cancelHold(t)
    t.scrub_ = false
}

// A tap ends with pointerleave, which clears hover. Keep what the tap showed.
export function keepOnLeave(state: OverlayState, e: PointerEvent): boolean {
    return isTouch(e) && state.touch_.pin_ !== null
}

// A scroll that moves the plot takes a tap's tooltip down. Returns true when it did.
export function unpinOnScroll(ctx: OverlayCtx, state: OverlayState): boolean {
    const p = state.touch_.pin_
    if (!p) return false
    const r = ctx.surface_.getBoundingClientRect()
    if (Math.abs(r.left - p.left) < 1 && Math.abs(r.top - p.top) < 1) return false
    state.touch_.pin_ = null
    onLeave(ctx, state)
    return true
}

// Non-passive touchmove on the surface: once the hold has fired, the finger scrubs and the
// page stays put for the rest of that touch.
export function onTouchMove(state: OverlayState, e: TouchEvent): void {
    const t = state.touch_
    if (!t.scrub_) return
    const p = e.touches?.length === 1 ? e.touches[0] : null
    if (p && movedEarly(t, p.clientX, p.clientY, e.timeStamp)) { t.scrub_ = false; return }
    if (e.cancelable) e.preventDefault()
}

// A held finger opens the long-press menu on Android; the hold is ours.
export function onContextMenu(state: OverlayState, e: MouseEvent): void {
    if (state.touch_.hold_ || state.touch_.scrub_) e.preventDefault()
}

export function disposeTouch(state: OverlayState): void {
    cancelHold(state.touch_)
}
