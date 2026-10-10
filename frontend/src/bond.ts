import { findBin, hitTestAt, layoutSpaceLayer, lineReadout, matrixLimits, photoClip, resolvePayload } from "./geometry"
import { drawHover, renderSelection } from "./highlight"
import { onMove, hideTip, setTipText, setTipVisible, tipOffset, placeTip, setDragHoverChrome, setMarkAccent } from "./hover"
import { hideCross } from "./cross"
import { cellRange, elementPicks, legendEdit, linePointHit, linkedIndices, manyHits, picksPoints, selectionFor, SELECTED_KINDS } from "./selection"
import { emptyMask, encodeMask, maskCount, maskHit, setBlock } from "./gridmask"
import type { GridMask, MaskEnvelope } from "./gridmask"
import { layoutImagePx, cancelPendingMove, cancelPendingDrag } from "./state"
import type { Drag, FieldPick, FieldSelection, OverlayCtx, OverlayState } from "./state"
import * as thresholdDrag from "./drag/threshold"
import * as roiDrag from "./drag/roi"
import * as viewDrag from "./drag/view"
import * as marquee from "./drag/marquee"
import { contentPoint, panTo, unmapPoint } from "./photo"
import type { AxisTransform, GridGeometry, Hit, HitLayer, Limits3, Manifest, ThresholdGeometry, ViewGeometry } from "./types"

// setPointerCapture throws InvalidPointerId if the UA doesn't consider this pointerId active
// (observed live in Chromium for a synthetic/non-primary pointerId — real touch/pen input can
// hit the same path). An uncaught throw here would abort onDown before `e.preventDefault()`,
// so swallow it: the drag still proceeds on `drag`/"grabbing" state alone, just without the
// "events keep targeting `surface` even off-element" guarantee capture would otherwise add.
function tryCapture(surface: HTMLElement, pointerId: number): void {
    try {
        surface.setPointerCapture(pointerId)
    } catch {
        /* not capturable — drag proceeds uncaptured */
    }
}

function shownViewTransform(ctx: OverlayCtx, id: string, fallback: AxisTransform): AxisTransform {
    const layer = ctx.manifest_.layers.find((l) => l.id === id)
    return layer ? ctx.manifest_.transforms[layer.axis] ?? fallback : fallback
}

// Returns whether a live wheel-idle timer was cleared. That timer is the only
// settle:true a notch has, so the caller owes a settle of the current photo.
function clearWheelTimer(state: OverlayState): boolean {
    if (state.wheelTimer_ === null) return false
    clearTimeout(state.wheelTimer_)
    state.wheelTimer_ = null
    return true
}

function armPan(ctx: OverlayCtx, state: OverlayState, e: PointerEvent, viewId: string): void {
    const drag = state.drag_
    if (!drag || drag.kind !== "view" || drag.g_.mode !== "pan") return
    if (clearWheelTimer(state)) drag.settleOwed_ = true
    state.photoViewId_ = viewId
    // The base is untransformed, so this sample is a layout point. The anchor panTo
    // holds is the content pixel under that point.
    const layout = layoutImagePx(ctx.base_, ctx.manifest_, e.clientX, e.clientY)
    state.photoAnchor_ = unmapPoint(state.photo_, layout)
}

// An Axis3 pan's limits are where the next zoom or pan starts (#321).
function rememberSlide(state: OverlayState, d: Extract<Drag, { kind: "view" }>, input: Record<string, unknown>): void {
    if (d.base_ && Array.isArray(input.limits)) viewDrag.rememberView3(state, d.id_, d.base_, input.limits as Limits3)
}

function viewNeedsSettle(d: Extract<Drag, { kind: "view" }>): boolean {
    return d.lastInput_ !== undefined || d.settleOwed_ === true
}

export function settleCurrentPan(ctx: OverlayCtx, state: OverlayState, d: Extract<Drag, { kind: "view" }>): void {
    const lim = matrixLimits(shownViewTransform(ctx, d.id_, d.t_), state.photo_)
    if (lim) ctx.gesture_.settle({ id: d.id_, ...lim, settle: true, s: state.photo_.s, tx: state.photo_.tx, ty: state.photo_.ty })
}

// Takes the drag explicitly rather than reading `state.drag_` — onUp/onCancel null that out
// before this can run (see the reentrancy note there), so a stale read here would apply to a
// gesture that's already been discarded.
function pointerSpace(ctx: OverlayCtx, state: OverlayState, e: MouseEvent): { layout: { x: number; y: number }; content: { x: number; y: number } } {
    const layout = layoutImagePx(ctx.base_, ctx.manifest_, e.clientX, e.clientY)
    return { layout, content: contentPoint(state.photo_, layout) }
}

function applyDrag(ctx: OverlayCtx, state: OverlayState, d: Drag, e: PointerEvent): void {
    const { layout, content } = pointerSpace(ctx, state, e)
    let text: string
    if (d.kind === "marquee") {
        const readout = marquee.move(ctx, state, d, content, { x: e.clientX, y: e.clientY })
        if (readout === null) return // still a click
        text = readout
    } else if (d.kind === "threshold") {
        text = thresholdDrag.move(d, content, ctx.tipDigits_)
    } else if (d.kind === "view") {
        if (d.g_.mode === "orbit") {
            text = viewDrag.tip(d, layout, ctx.tipDigits_)
            if (Math.hypot(layout.x - d.x0_, layout.y - d.y0_) >= viewDrag.VIEW_MIN_PX) {
                const input = viewDrag.requestInput(d, layout, false)
                ctx.gesture_.request(input)
                d.lastInput_ = input
                rememberSlide(state, d, input)
            }
        } else {
            // Layout point. The base is not photographically transformed, so this is not
            // the content pixel — that is `photoAnchor_`, captured at pointerdown.
            const cur = layoutImagePx(ctx.base_, ctx.manifest_, e.clientX, e.clientY)
            const anchor = state.photoAnchor_ ?? unmapPoint(state.photo_, { x: d.x0_, y: d.y0_ })
            const next = panTo(anchor, cur, state.photo_.s)
            const lim = matrixLimits(shownViewTransform(ctx, d.id_, d.t_), next)
            text = lim ? viewDrag.limitsTip(lim, ctx.tipDigits_) : viewDrag.tip(d, layout, ctx.tipDigits_)
            if (Math.hypot(cur.x - d.x0_, cur.y - d.y0_) >= viewDrag.VIEW_MIN_PX && lim) {
                state.photo_ = next
                ctx.photoPaint_(next)
                const input = { id: d.id_, ...lim, settle: false, s: next.s, tx: next.tx, ty: next.ty }
                ctx.gesture_.request(input)
                d.lastInput_ = input
            }
        }
    } else {
        text = roiDrag.move(ctx, state, d, content)
    }
    setMarkAccent(ctx, null) // a drag readout is never a coloured element's tooltip
    setTipText(ctx, state, text)
    setTipVisible(ctx, true)
    const tp = tipOffset(ctx, e)
    placeTip(ctx, state, tp.x, tp.y)
}

// rAF-coalesce the drag path the same way hover's onMove coalesces hover: apply the first event
// of a burst immediately, then collapse any further events that land before the next frame into one.
function queueDrag(ctx: OverlayCtx, state: OverlayState, d: Drag, e: PointerEvent): void {
    if (state.pendingDrag_ !== null) { state.pendingDrag_ = e; return }
    applyDrag(ctx, state, d, e)
    if (typeof requestAnimationFrame !== "function") return
    state.pendingDrag_ = e
    state.dragRaf_ = requestAnimationFrame(() => {
        state.dragRaf_ = 0
        const last = state.pendingDrag_
        state.pendingDrag_ = null
        if (last && last !== e) applyDrag(ctx, state, d, last)
    })
}

// ctrl-click is a context menu on Apple platforms only.
function isApplePlatform(): boolean {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    const platform = nav.userAgentData?.platform
    if (platform) return platform === "macOS" || platform === "iOS"
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

function isMacContextClick(e: { button: number; ctrlKey: boolean }): boolean {
    return e.button === 0 && e.ctrlKey && isApplePlatform()
}

// The click that adds a pick to a `many` field, or takes one out: Cmd on Apple platforms, where
// Ctrl-click is the context menu, and Ctrl elsewhere.
export function isToggleClick(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
    return isApplePlatform() ? e.metaKey : e.ctrlKey
}

// The menu is hit-tested after pointerdown returns, or after pointerup on Windows.
// Restoring any sooner targets this surface again. The timer covers a press that never
// produces either event.
function passContextToBase(surface: HTMLElement, pointerId: number): void {
    surface.classList.add("passthrough")
    let restored = false
    let timer = 0
    const restore = () => {
        if (restored) return
        restored = true
        surface.classList.remove("passthrough")
        window.removeEventListener("contextmenu", onMenu, true)
        window.removeEventListener("pointerup", onPointerUp, true)
        window.removeEventListener("pointercancel", onPointerCancel, true)
        window.clearTimeout(timer)
    }
    const onMenu = () => { queueMicrotask(restore) }
    const onPointerUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        window.setTimeout(restore, 0)
    }
    const onPointerCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        restore()
    }
    window.addEventListener("contextmenu", onMenu, true)
    window.addEventListener("pointerup", onPointerUp, true)
    window.addEventListener("pointercancel", onPointerCancel, true)
    timer = window.setTimeout(restore, 1000)
}

// Cmd/Ctrl-marquee adds to the picks, or takes out what it covers when it starts on a mark or
// a grid cell that is already picked (as in Finder). Without the key it replaces them. One mode
// covers every field the box edits, so marks and cells always agree.
function marqueeMode(manifest: Manifest, state: OverlayState, e: PointerEvent, under: Hit | null, targets: HitLayer[], p: { x: number; y: number }): marquee.MarqueeMode {
    if (!isToggleClick(e)) return "replace"
    if (under === null || !targets.includes(under.layer)) return "add"
    const sel = state.sel_.get(under.layer.id)
    // On a line that takes points, the pick under the press is its nearest data point.
    const sample = picksPoints(under.layer) ? lineSample(manifest, under, p.x, p.y) : undefined
    const held = under.layer.kind === "grid" ?
        sel?.mask_?.[under.index] === 1 :
        (sel?.items_ ?? []).some((it) => it.index === under.index && it.sample === sample)
    return held ? "subtract" : "add"
}

export function onDown(ctx: OverlayCtx, state: OverlayState, e: PointerEvent): void {
    // A drag is already in progress (e.g. a second concurrent touch) — refuse to let a new
    // pointer overwrite the first one's `drag` and pointer capture mid-gesture.
    if (state.drag_) return
    cancelPendingMove(state)
    state.justDragged_ = false
    // preventDefault here suppresses the native menu.
    if (e.button !== 0 || isMacContextClick(e)) {
        if (e.button === 2 || isMacContextClick(e)) passContextToBase(ctx.surface_, e.pointerId)
        return
    }
    const { layout, content } = pointerSpace(ctx, state, e)
    // Shift+drag forces view (arbitration vs box-select / ROI / threshold).
    if (e.shiftKey) {
        const viewLayer = ctx.manifest_.layers.find((l) => {
            if (l.kind !== "view" || !l.events.includes("drag")) return false
            return hitTestAt({ ...ctx.manifest_, layers: [l] }, layout.x, layout.y, state.photo_, "drag", photoClip(ctx.manifest_, state.photo_, state.photoViewId_)) !== null
        })
        if (viewLayer) {
            const g = viewLayer.geometry as ViewGeometry
            // On an Axis3, Shift+drag pans the limits instead of orbiting (#321).
            const base = g.mode === "orbit" && g.limits ? viewDrag.view3Base(state, viewLayer.id, g.limits) : undefined
            state.drag_ = viewDrag.begin(viewLayer.id, g, ctx.manifest_.transforms[viewLayer.axis], layout.x, layout.y, e.pointerId, true, base)
            if (g.mode === "pan") armPan(ctx, state, e, viewLayer.id)
            hideCross(ctx, state)
            ctx.surface_.classList.add("grabbing")
            tryCapture(ctx.surface_, e.pointerId)
            e.preventDefault()
            return
        }
    }
    const hit = hitTestAt(ctx.manifest_, layout.x, layout.y, state.photo_, "drag", photoClip(ctx.manifest_, state.photo_, state.photoViewId_))
    // A marquee: a drag on a plot with no view, or Alt-drag on any plot, where a field holds
    // several picks. A threshold line or an ROI box under the press still takes the drag.
    if (!hit || (hit.layer.kind === "view" && e.altKey)) {
        const axis = marquee.marqueeAxis(ctx, axesAt(ctx, layout.x, layout.y))
        const targets = axis === null ? [] : marquee.marqueeTargets(ctx, axis)
        // A press on a legend inside the axis is a press on the legend.
        const under = targets.length ? hitTestAt(ctx.manifest_, layout.x, layout.y, state.photo_, "click", photoClip(ctx.manifest_, state.photo_, state.photoViewId_)) : null
        if (axis !== null && targets.length && !under?.layer.links) {
            state.drag_ = marquee.begin(state, axis, targets, marqueeMode(ctx.manifest_, state, e, under, targets, content), content.x, content.y, { x: e.clientX, y: e.clientY }, e.pointerId)
            tryCapture(ctx.surface_, e.pointerId)
            e.preventDefault()
            return
        }
    }
    if (!hit) return
    if (hit.layer.kind === "threshold") {
        const line = ctx.thresholdLines_.get(hit.layer.id)
        if (!line) return
        state.drag_ = thresholdDrag.begin(hit.layer.id, line, hit.layer.geometry as ThresholdGeometry, ctx.manifest_.transforms[hit.layer.axis], e.pointerId)
    } else if (hit.layer.kind === "roi" && hit.roiPart_) {
        const box = ctx.roiBoxes_.get(hit.layer.id)
        if (!box) return
        if (hit.roiPart_.move) {
            state.drag_ = roiDrag.begin(hit.layer.id, box, { move: true }, content.x - box.g_.x, content.y - box.g_.y, e.pointerId)
        } else if (hit.roiPart_.edge) {
            const edge = hit.roiPart_.edge
            // ax/ay carry the ONE fixed opposite edge for this drag (the other axis is untouched
            // by move()'s edge branch) — same "precompute the fixed reference point" convention
            // as the corner branch below, just one axis at a time.
            const ax = edge === "w" ? box.g_.x + box.g_.w : edge === "e" ? box.g_.x : content.x
            const ay = edge === "n" ? box.g_.y + box.g_.h : edge === "s" ? box.g_.y : content.y
            state.drag_ = roiDrag.begin(hit.layer.id, box, { edge }, ax, ay, e.pointerId)
        } else {
            const k = hit.roiPart_.corner as number
            const c = [[box.g_.x, box.g_.y], [box.g_.x + box.g_.w, box.g_.y], [box.g_.x + box.g_.w, box.g_.y + box.g_.h], [box.g_.x, box.g_.y + box.g_.h]]
            const opp = c[(k + 2) % 4]
            state.drag_ = roiDrag.begin(hit.layer.id, box, { corner: k }, opp[0], opp[1], e.pointerId)
        }
    } else if (hit.layer.kind === "view") {
        const g = hit.layer.geometry as ViewGeometry
        state.drag_ = viewDrag.begin(hit.layer.id, g, ctx.manifest_.transforms[hit.layer.axis], layout.x, layout.y, e.pointerId)
        if (g.mode === "pan") armPan(ctx, state, e, hit.layer.id)
    } else return
    hideCross(ctx, state)
    ctx.surface_.classList.add("grabbing")
    tryCapture(ctx.surface_, e.pointerId)
    e.preventDefault()
}

export function onUp(ctx: OverlayCtx, state: OverlayState, e: PointerEvent): void {
    cancelPendingMove(state)
    const d = state.drag_
    // Ignore a pointer that isn't the one that owns this drag (e.g. a second touch lifting
    // first) — without this, any pointer's up committed and ended whichever drag happened
    // to be in flight, at that pointer's own coordinates.
    if (!d || e.pointerId !== d.pointerId_) return
    cancelPendingDrag(state)
    // Claim (null out) `drag` BEFORE releasing capture: releasePointerCapture can synchronously
    // dispatch lostpointercapture (spec leaves the exact timing to "process pending pointer
    // capture", which runs between dispatches — implementation-dependent), and onLostCapture
    // also nulls `drag`. Reading `state.drag_` after that point would see null (or a new drag, if
    // one had already started) instead of the gesture this event belongs to — so everything
    // below operates on the locally-claimed `d`, never `state.drag_`.
    state.drag_ = null
    if (ctx.surface_.hasPointerCapture(e.pointerId)) ctx.surface_.releasePointerCapture(e.pointerId)
    if (d.kind === "marquee") {
        applyDrag(ctx, state, d, e)
        // A press that never became a drag is a click, which onClick handles.
        state.justDragged_ = marquee.active(d)
        if (state.justDragged_) ctx.commit_(marquee.end(ctx, state, d))
        hideTip(ctx, state)
        return
    }
    // Apply the release event's own position synchronously — a coalesced rAF frame may have
    // been dropped, and the commit below reads mutated drag state, not e, so the final visual
    // (and the value it derives from) must come from this event.
    applyDrag(ctx, state, d, e)
    const { layout, content } = pointerSpace(ctx, state, e)
    if (d.kind === "threshold") {
        ctx.commit_({ [d.id_]: thresholdDrag.end(d, content) })
    } else if (d.kind === "view") {
        // §12.3: a view gesture commits nothing — no bond write, no "input" event.
        // Settle is gated on whether a request actually went out during this drag
        // (`lastInput_`), NOT on the release point's own distance from x0/y0 (round-1 review,
        // finding #2): a drag that went out past VIEW_MIN_PX and drifted back near the start
        // before release still sent ppu=1 frames and owes the ppu restore, even though this
        // release point alone reads as a micro-drag. The payload itself still uses the fresh
        // release position, not the (possibly stale) last in-drag one.
        if (d.g_.mode === "pan") {
            if (viewNeedsSettle(d)) settleCurrentPan(ctx, state, d)
        } else if (d.lastInput_ !== undefined) {
            const input = viewDrag.requestInput(d, layout, true)
            ctx.gesture_.settle(input)
            rememberSlide(state, d, input)
        }
        state.photoAnchor_ = null
    } else {
        ctx.commit_(roiDrag.end(ctx, state, d))
    }
    hideTip(ctx, state); ctx.surface_.classList.remove("grabbing"); setDragHoverChrome(ctx, state, null)
    if (d.kind === "view") {
        const dist = Math.hypot(layout.x - d.x0_, layout.y - d.y0_)
        state.justDragged_ = dist >= viewDrag.VIEW_MIN_PX
    } else {
        state.justDragged_ = true
    }
}

// pointercancel: the interaction was aborted out from under us (browser-initiated gesture
// takeover, stylus leaving range, etc.) — unlike pointerup this is not a commit, just a clean
// reset so drag can't stay non-null with the cursor stuck in "grabbing". None of the three kinds
// roll back their visual state on cancel (the box/line intentionally stays put), so there's no
// per-kind cancel hook to call into here.
export function onCancel(ctx: OverlayCtx, state: OverlayState, e: PointerEvent): void {
    // Same pointerId gate as onUp — a non-owning pointer's cancel must not touch a drag it
    // didn't start.
    if (!state.drag_ || e.pointerId !== state.drag_.pointerId_) return
    const d = state.drag_ // claim before nulling, same reentrancy hazard onUp documents
    cancelPendingDrag(state)
    state.drag_ = null // claim before releasePointerCapture, same reentrancy hazard as onUp
    if (ctx.surface_.hasPointerCapture(e.pointerId)) ctx.surface_.releasePointerCapture(e.pointerId)
    ctx.surface_.classList.remove("grabbing"); setDragHoverChrome(ctx, state, null)
    hideTip(ctx, state)
    if (d.kind === "marquee") { marquee.cancel(ctx, state, d); return }
    // §12.5 (round-1 review, finding #2): a cancelled gesture is not a commit, but if it already
    // sent an in-drag (ppu=1) request it still owes the ppu restore — nothing else ever
    // re-renders this static widget, so skipping settle here strands it at low resolution
    // permanently. Unlike onUp this isn't a release in the commit sense, but the cancel event's
    // own position is the best available stand-in for "where the camera actually is now."
    if (d.kind === "view" && viewNeedsSettle(d)) {
        if (d.g_.mode === "pan") {
            // A micro press never moved the photo. Only a drag that already sent a frame
            // re-reads the pointer, and that read is the layout point.
            if (d.lastInput_ !== undefined) {
                const cur = layoutImagePx(ctx.base_, ctx.manifest_, e.clientX, e.clientY)
                const anchor = state.photoAnchor_ ?? unmapPoint(state.photo_, { x: d.x0_, y: d.y0_ })
                state.photo_ = panTo(anchor, cur, state.photo_.s)
                ctx.photoPaint_(state.photo_)
            }
            settleCurrentPan(ctx, state, d)
        } else if (d.lastInput_ !== undefined) {
            const p = layoutImagePx(ctx.base_, ctx.manifest_, e.clientX, e.clientY)
            const input = viewDrag.requestInput(d, p, true)
            ctx.gesture_.settle(input)
            rememberSlide(state, d, input)
        }
    }
    if (d.kind === "view") state.photoAnchor_ = null
}

// lostpointercapture fires after any capture release, including the explicit ones in onUp/
// onCancel above (where drag is already null by the time this runs — a no-op then). It's the
// safety net for capture being taken away some other way while a drag is still in progress.
export function onLostCapture(ctx: OverlayCtx, state: OverlayState): void {
    cancelPendingDrag(state)
    if (!state.drag_) return
    const d = state.drag_ // claim before nulling, same reentrancy hazard onUp documents
    ctx.surface_.classList.remove("grabbing"); setDragHoverChrome(ctx, state, null)
    hideTip(ctx, state)
    state.drag_ = null
    if (d.kind === "marquee") { marquee.cancel(ctx, state, d); return }
    // Same §12.5 obligation as onCancel — but this handler gets no event/position at all, so the
    // last camera a request actually carried is the only thing available to resettle with.
    if (d.kind === "view" && viewNeedsSettle(d)) {
        if (d.g_.mode === "pan") {
            settleCurrentPan(ctx, state, d)
        } else if (d.lastInput_ !== undefined) {
            ctx.gesture_.settle({ ...d.lastInput_, settle: true })
        }
    }
    if (d.kind === "view") state.photoAnchor_ = null
}

// Escape during a marquee drops the box and puts the picks back, as a pointercancel does, and
// swallows the click its release would send. Returns whether there was a marquee to drop.
export function abortMarquee(ctx: OverlayCtx, state: OverlayState): boolean {
    const d = state.drag_
    if (d?.kind !== "marquee") return false
    cancelPendingDrag(state)
    state.drag_ = null // claim before releasePointerCapture, same reentrancy hazard as onUp
    if (ctx.surface_.hasPointerCapture(d.pointerId_)) ctx.surface_.releasePointerCapture(d.pointerId_)
    hideTip(ctx, state)
    marquee.cancel(ctx, state, d)
    state.justDragged_ = true // onDown resets it at the next press
    return true
}

// The click→bond commit, factored out of onClick so keyboard.ts's Enter/Space can dispatch the
// identical bond value for a keyboard-focused hit — same highlight draw, same payload
// resolution, same "input" event.
export function commitClick(ctx: OverlayCtx, state: OverlayState, hit: Hit, px: number, py: number, toggle = false): void {
    if (hit.layer.many) { commitManyClick(ctx, state, hit, px, py, toggle); return }
    // A line picks the data point nearest the click, the one hover reads out. A click with no
    // sample to name (the nearest one is off screen) commits nothing, and returns before
    // drawHover: the pointer is already over the line, so its hover outline is already drawn.
    let sample: number | undefined
    let point: Hit | null = null
    if (picksPoints(hit.layer)) {
        sample = lineSample(ctx.manifest_, hit, px, py)
        point = sample === undefined ? null : linePointHit(ctx.manifest_, hit.layer, hit.index, sample)
        if (!point) return
    }
    // Must precede drawHi so its already-selected guard sees the new selKeys_ entry. `null`
    // means this click isn't a selection gesture at all (e.g. an :axis hit) — leave the
    // selection untouched rather than clearing it.
    const next = point ? [point] : selectionFor(hit, ctx.manifest_)
    // A second click on the element that made the field's pick takes it back: the highlight
    // clears and the field returns to `null`, its value before any click. Other fields keep theirs.
    const field = hit.layer.id
    const src = state.sel_.get(field)?.source_ ?? null
    const off = next !== null && src !== null && src.index === hit.index && src.sample === sample
    const source = sample === undefined ? { layer: field, index: hit.index } : { layer: field, index: hit.index, sample }
    const linked = legendPicks(ctx, state, hit, next !== null && !off, toggle)
    if (next !== null) {
        state.sel_.set(field, off ? { hits_: [], source_: null } : { hits_: next, source_: source })
        renderSelection(ctx, state)
    }
    drawHover(ctx, state, hit)
    // Keep keyboard focus in sync with the mouse, but ONLY once keyboard nav is already
    // engaged (state.focusIdx_ !== null) — gating on that, not just "click landed on a
    // focus-list element", matters for a PURE mouse user: setting state.focusHit_ unconditionally
    // regressed the locked hover-fade recipe, because restoreFocus's later redraw
    // (hover.ts:restoreFocus -> highlight.ts:drawHi) is a no-op when hiKey_ already matches —
    // so a click, then a miss, would leave the ring never fading at all for someone who never
    // touched the keyboard. Gated this way: arrowing to element A then mouse-clicking element B
    // still resyncs focusHit_ to B (so a later miss doesn't wrongly restore A's stale ring), but
    // clicking B with no prior keyboard focus leaves focusHit_ null and the plain hover-fade
    // path (clearHi) runs exactly as before this feature existed.
    syncFocus(ctx, state, hit)
    // No `payload` for an element kind: Julia already reconstructs it from the manifest
    // (`_bond_payload`), so uploading it here is dead weight the receiver discards (#109).
    // `resolvePayload` still resolves it for hover.ts's tooltip templates, which need it for
    // every kind including element ones — only the wire value skips it.
    let value: { layer: string; index: number; sample?: number; payload?: unknown } | null = null
    if (!off) {
        value = { ...source }
        if (!SELECTED_KINDS.has(hit.layer.kind)) value.payload = resolvePayload(hit, ctx.manifest_, px, py)
    }
    ctx.commit_({ ...linked, [field]: value })
}

// A legend click is also a tool on the plots its entry stands for. The entry's own field decides
// the gesture once, so the legend and its plots never disagree: an entry the click turns on
// gives each linked plot whose field holds several picks the entry's marks (Cmd/Ctrl adds them),
// and an entry it turns off takes them out (`legendEdit`). Returns the fields it changed.
function legendPicks(ctx: OverlayCtx, state: OverlayState, hit: Hit, on: boolean, toggle: boolean): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (!hit.layer.links?.length) return out
    const fields = ctx.manifest_.fields
    for (const [layer, picked] of linkedIndices(ctx.manifest_, hit.layer, hit.index)) {
        if (!layer.many || layer.brush || !layer.events.includes("click")) continue
        if (fields && !fields.includes(layer.id)) continue
        const items = legendEdit(state.sel_.get(layer.id)?.items_ ?? [], elementPicks(ctx.manifest_, layer, picked), on, toggle)
        state.sel_.set(layer.id, { hits_: manyHits(ctx.manifest_, items), source_: null, items_: items })
        out[layer.id] = { items }
    }
    return out
}

function syncFocus(ctx: OverlayCtx, state: OverlayState, hit: Hit): void {
    if (state.focusIdx_ === null) return
    // A click on a non-focus-list kind (e.g. :grid/:axis) while keyboard focus was already
    // on some other element must leave that focus alone, not clear it.
    const idx = ctx.focusable_.findIndex((r) => r.layer_ === hit.layer && r.index_ === hit.index)
    if (idx >= 0) {
        state.focusIdx_ = idx
        state.focusHit_ = hit
        state.focusTipHtml_ = null
        state.focusTipCss_ = null
    }
}

// A click on a `many` field: a plain click makes the mark the only pick, or clears the field
// when it already is; Cmd/Ctrl-click adds it, or takes it out when it is held. An axis spot is
// never "held": each click is a new spot.
// The data point a click on line `hit` names: the one its readout shows, else the nearest.
function lineSample(manifest: Manifest, hit: Hit, px: number, py: number): number | undefined {
    return (hit.pt_ ?? lineReadout(hit.layer, hit.index, px, py, manifest.transforms[hit.layer.axis]))?.[0]
}

function commitManyClick(ctx: OverlayCtx, state: OverlayState, hit: Hit, px: number, py: number, toggle: boolean): void {
    if (hit.layer.kind === "grid") { commitGridClick(ctx, state, hit, toggle); return }
    const field = hit.layer.id
    const items = state.sel_.get(field)?.items_ ?? []
    const element = SELECTED_KINDS.has(hit.layer.kind)
    // On a line, each pick is a point on it, as a single pick is.
    const sample = picksPoints(hit.layer) ? lineSample(ctx.manifest_, hit, px, py) : undefined
    if (picksPoints(hit.layer) && (sample === undefined || !linePointHit(ctx.manifest_, hit.layer, hit.index, sample))) return
    const at = element ? items.findIndex((it) => it.index === hit.index && it.sample === sample) : -1
    const pick: FieldPick = sample !== undefined ? { layer: field, index: hit.index, sample } :
        element ? { layer: field, index: hit.index } : { layer: field, index: hit.index, payload: resolvePayload(hit, ctx.manifest_, px, py) }
    const next = toggle ?
        (at >= 0 ? items.filter((_, k) => k !== at) : [...items, pick]) :
        (at >= 0 && items.length === 1 ? [] : [pick])
    const linked = legendPicks(ctx, state, hit, next.some((it) => it.index === hit.index), toggle)
    state.sel_.set(field, { hits_: manyHits(ctx.manifest_, next), source_: null, items_: next })
    renderSelection(ctx, state)
    drawHover(ctx, state, hit)
    syncFocus(ctx, state, hit)
    ctx.commit_({ ...linked, [field]: { items: next } })
}

// The same gestures on a `many` grid, cell by cell: a plain click makes the cell the only one
// selected (or clears the field when it already is), Cmd/Ctrl-click flips it.
function commitGridClick(ctx: OverlayCtx, state: OverlayState, hit: Hit, toggle: boolean): void {
    const mask = gridMaskOf(state, hit.layer)
    const held = mask[hit.index] === 1
    if (toggle) {
        mask[hit.index] = held ? 0 : 1
    } else {
        const only = held && maskCount(mask) === 1
        mask.fill(0)
        if (!only) mask[hit.index] = 1
    }
    setGridMask(ctx, state, hit.layer, mask)
    drawHover(ctx, state, hit)
}

// A copy of the grid field's mask, to edit and hand to setGridMask.
function gridMaskOf(state: OverlayState, layer: HitLayer): GridMask {
    const cur = state.sel_.get(layer.id)?.mask_
    return cur && cur.length === emptyMask(layer).length ? cur.slice() : emptyMask(layer)
}

function setGridMask(ctx: OverlayCtx, state: OverlayState, layer: HitLayer, mask: GridMask): void {
    ctx.commit_({ [layer.id]: showGridMask(ctx, state, layer, mask) })
}

// Holds and draws `mask` as the grid field's selection, and returns its envelope.
function showGridMask(ctx: OverlayCtx, state: OverlayState, layer: HitLayer, mask: GridMask): MaskEnvelope {
    const hit = maskHit(layer, mask)
    state.sel_.set(layer.id, { hits_: hit ? [hit] : [], source_: null, mask_: mask })
    renderSelection(ctx, state)
    return encodeMask(layer, mask)
}

// A marquee over a `many` grid, `box` in the layer's image px (as computeSelection takes it).
// `mode` is the marquee's, decided once at the press for every field: "replace" takes the cells
// the box overlaps, "add" adds them, "subtract" (Cmd/Ctrl from a held pick, as in Finder) takes
// them out. `before` is the field's selection at the press. Each call starts again from
// `before` and never reads the live mask, so the marquee calls it on every move to preview and
// once more on release; cancel restores `before` itself. A box that misses the grid replaces
// with nothing. Redraws the selection and returns the field's new envelope; the caller commits
// it with the release's other fields, so one release sends one value.
export function applyGridMarquee(
    ctx: OverlayCtx, state: OverlayState, layer: HitLayer,
    box: { x: number; y: number; w: number; h: number }, mode: "replace" | "add" | "subtract", before: FieldSelection | undefined,
): MaskEnvelope {
    const base = before?.mask_
    const from = base && base.length === emptyMask(layer).length ? base.slice() : emptyMask(layer)
    return showGridMask(ctx, state, layer, gridMarqueeMask(layer, from, box, mode))
}

// applyGridMarquee's new mask, written into `mask` (the gesture's base) and returned.
export function gridMarqueeMask(
    layer: HitLayer, mask: GridMask, box: { x: number; y: number; w: number; h: number }, mode: "replace" | "add" | "subtract",
): GridMask {
    const gg = layer.geometry as GridGeometry
    if (mode === "replace") mask.fill(0)
    const ci = cellRange(gg.xedges, box.x, box.x + box.w), cj = cellRange(gg.yedges, box.y, box.y + box.h)
    if (ci && cj) setBlock(mask, gg.ncols, ci[0], ci[1], cj[0], cj[1], mode !== "subtract")
    return mask
}

// Whether the field holds the cell under image px `pt`: a Cmd/Ctrl marquee pressed there
// subtracts.
export function gridCellHeld(state: OverlayState, layer: HitLayer, pt: { x: number; y: number }): boolean {
    const k = gridCellAt(layer.geometry as GridGeometry, pt.x, pt.y)
    return k !== null && state.sel_.get(layer.id)?.mask_?.[k] === 1
}

// The row-major index of the cell under image px (x, y), or null off the grid.
function gridCellAt(gg: GridGeometry, x: number, y: number): number | null {
    const i = findBin(gg.xedges, x), j = findBin(gg.yedges, y)
    return i < 0 || j < 0 ? null : j * gg.ncols + i
}

// Clears the picks of every click field on `axes` (every axis when it is null), leaving the
// controls and a box's target alone. A field that already holds nothing sends nothing.
export function clearPicks(ctx: OverlayCtx, state: OverlayState, axes: string[] | null): void {
    const cur = ctx.value_()
    const updates: Record<string, unknown> = {}
    for (const layer of ctx.manifest_.layers) {
        if (layer.brush || !layer.events.includes("click") || !(layer.id in cur)) continue
        if (axes !== null && !axes.includes(layer.axis)) continue
        const v = cur[layer.id] as { items?: unknown[]; runs?: unknown[]; bits?: string } | null
        if (v === null || v === undefined) continue
        if (layer.many && layer.kind === "grid") {
            const mask = state.sel_.get(layer.id)?.mask_
            if (!mask || maskCount(mask) === 0) continue
            state.sel_.set(layer.id, { hits_: [], source_: null, mask_: emptyMask(layer) })
            updates[layer.id] = { runs: [] }
            continue
        }
        if (layer.many && !v.items?.length) continue
        state.sel_.set(layer.id, layer.many ? { hits_: [], source_: null, items_: [] } : { hits_: [], source_: null })
        updates[layer.id] = layer.many ? { items: [] } : null
    }
    if (Object.keys(updates).length === 0) return
    renderSelection(ctx, state)
    ctx.commit_(updates)
}

// The plot axes under image px (x, y): every axis whose plot area holds the point, so twin
// axes and an inset's parent all count. A colorbar's readout is a hit, not a plot area, and a
// click inside a legend's box, even on its padding, is on the legend, so it finds none.
function axesAt(ctx: OverlayCtx, x: number, y: number): string[] {
    const legends = new Set(ctx.manifest_.layers.filter((l) => l.bond === "legend").map((l) => l.axis))
    const inside = (t: { viewport: [number, number, number, number] }) => {
        const [vx, vy, vw, vh] = t.viewport
        return x >= vx && x <= vx + vw && y >= vy && y <= vy + vh
    }
    const out: string[] = []
    for (const [id, t] of Object.entries(ctx.manifest_.transforms)) {
        if (!inside(t)) continue
        if (legends.has(id)) return []
        if (!t.valueaxis) out.push(id)
    }
    return out
}

export function onClick(ctx: OverlayCtx, state: OverlayState, e: MouseEvent): void {
    if (state.justDragged_) { state.justDragged_ = false; return }
    // Chromium still dispatches click after a Mac ctrl-click.
    if (isMacContextClick(e)) return
    const { layout, content } = pointerSpace(ctx, state, e)
    const hit = hitTestAt(ctx.manifest_, layout.x, layout.y, state.photo_, "click", photoClip(ctx.manifest_, state.photo_, state.photoViewId_))
    if (!hit) {
        // A click on an empty part of a plot clears the picks of the plots there. A mark that
        // only shows a tooltip isn't empty space, and a Cmd/Ctrl-click that misses keeps the
        // picks, as a modified miss does in a file browser.
        if (isToggleClick(e)) return
        if (hitTestAt(ctx.manifest_, layout.x, layout.y, state.photo_, "hover", photoClip(ctx.manifest_, state.photo_, state.photoViewId_))) return
        const axes = axesAt(ctx, layout.x, layout.y)
        if (axes.length > 0) clearPicks(ctx, state, axes)
        return
    }
    const sample = layoutSpaceLayer(hit.layer) ? layout : content
    commitClick(ctx, state, hit, sample.x, sample.y, isToggleClick(e))
}

// Single entry point for pointermove: while a drag owns the pointer, route to the
// rAF-coalesced drag path; otherwise it's hover. Pointer capture (set in onDown) keeps these
// events targeted at `surface` even once the pointer leaves its bounds or the viewport.
export function onPointerMove(ctx: OverlayCtx, state: OverlayState, e: PointerEvent): void {
    if (state.drag_) {
        // A second pointer's move (e.g. two-finger touch, now let through by touch-action:none)
        // must not steer a drag it didn't start — ignore it outright rather than falling through
        // to hover, which would fight the "grabbing" cursor and hi/tip state mid-drag.
        if (e.pointerId !== state.drag_.pointerId_) return
        queueDrag(ctx, state, state.drag_, e)
    } else onMove(ctx, state, e)
}
