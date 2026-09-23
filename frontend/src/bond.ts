import { hitTestAt, layoutSpaceLayer, matrixLimits, resolvePayload } from "./geometry"
import { drawHover, renderSelection } from "./highlight"
import { onMove, hideTip, setTipText, setTipVisible, tipOffset, placeTip, setDragHoverChrome, setMarkAccent } from "./hover"
import { selectionFor, SELECTED_KINDS } from "./selection"
import { layoutImagePx, cancelPendingMove, cancelPendingDrag } from "./state"
import type { Drag, OverlayCtx, OverlayState } from "./state"
import * as thresholdDrag from "./drag/threshold"
import * as roiDrag from "./drag/roi"
import * as viewDrag from "./drag/view"
import { contentPoint, panTo, unmapPoint } from "./photo"
import type { AxisTransform, Hit, ThresholdGeometry, ViewGeometry } from "./types"

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

function viewNeedsSettle(d: Extract<Drag, { kind: "view" }>): boolean {
    return d.lastInput_ !== undefined || d.settleOwed_ === true
}

function settleCurrentPan(ctx: OverlayCtx, state: OverlayState, d: Extract<Drag, { kind: "view" }>): void {
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
    if (d.kind === "threshold") {
        text = thresholdDrag.move(d, content)
    } else if (d.kind === "view") {
        if (d.g_.mode === "orbit") {
            text = viewDrag.tip(d, layout)
            if (Math.hypot(layout.x - d.x0_, layout.y - d.y0_) >= viewDrag.VIEW_MIN_PX) {
                const input = viewDrag.requestInput(d, layout, false)
                ctx.gesture_.request(input)
                d.lastInput_ = input
            }
        } else {
            // Layout point. The base is not photographically transformed, so this is not
            // the content pixel — that is `photoAnchor_`, captured at pointerdown.
            const cur = layoutImagePx(ctx.base_, ctx.manifest_, e.clientX, e.clientY)
            const anchor = state.photoAnchor_ ?? unmapPoint(state.photo_, { x: d.x0_, y: d.y0_ })
            const next = panTo(anchor, cur, state.photo_.s)
            const lim = matrixLimits(shownViewTransform(ctx, d.id_, d.t_), next)
            text = lim ? viewDrag.limitsTip(lim) : viewDrag.tip(d, layout)
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
            return hitTestAt({ ...ctx.manifest_, layers: [l] }, layout.x, layout.y, state.photo_, "drag") !== null
        })
        if (viewLayer) {
            const g = viewLayer.geometry as ViewGeometry
            state.drag_ = viewDrag.begin(viewLayer.id, g, ctx.manifest_.transforms[viewLayer.axis], layout.x, layout.y, e.pointerId)
            if (g.mode === "pan") armPan(ctx, state, e, viewLayer.id)
            ctx.surface_.classList.add("grabbing")
            tryCapture(ctx.surface_, e.pointerId)
            e.preventDefault()
            return
        }
    }
    const hit = hitTestAt(ctx.manifest_, layout.x, layout.y, state.photo_, "drag")
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
    // Apply the release event's own position synchronously — a coalesced rAF frame may have
    // been dropped, and the commit below reads mutated drag state, not e, so the final visual
    // (and the value it derives from) must come from this event.
    applyDrag(ctx, state, d, e)
    const { layout, content } = pointerSpace(ctx, state, e)
    if (d.kind === "threshold") {
        (ctx.host_ as unknown as { value: unknown }).value = thresholdDrag.end(d, content)
        ctx.host_.dispatchEvent(new CustomEvent("input"))
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
            ctx.gesture_.settle(viewDrag.requestInput(d, layout, true))
        }
        state.photoAnchor_ = null
    } else {
        (ctx.host_ as unknown as { value: unknown }).value = roiDrag.end(ctx, state, d)
        ctx.host_.dispatchEvent(new CustomEvent("input"))
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
            ctx.gesture_.settle(viewDrag.requestInput(d, p, true))
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

// The click→bond commit, factored out of onClick so keyboard.ts's Enter/Space can dispatch the
// identical bond value for a keyboard-focused hit — same highlight draw, same payload
// resolution, same "input" event.
export function commitClick(ctx: OverlayCtx, state: OverlayState, hit: Hit, px: number, py: number): void {
    // Must precede drawHi so its already-selected guard sees the new selKeys_ entry. `null`
    // means this click isn't a selection gesture at all (e.g. an :axis hit) — leave the
    // selection untouched rather than clearing it.
    const next = selectionFor(hit, ctx.manifest_)
    if (next !== null) { state.selHits_ = next; renderSelection(ctx, state) }
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
    if (state.focusIdx_ !== null) {
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
    // No `payload` for an element kind: Julia already reconstructs it from the manifest
    // (`_bond_payload`), so uploading it here is dead weight the receiver discards (#109).
    // `resolvePayload` still resolves it for hover.ts's tooltip templates, which need it for
    // every kind including element ones — only the wire value skips it.
    const value: { layer: string; index: number; payload?: unknown } = { layer: hit.layer.id, index: hit.index }
    if (!SELECTED_KINDS.has(hit.layer.kind)) value.payload = resolvePayload(hit, ctx.manifest_, px, py)
    ;(ctx.host_ as unknown as { value: unknown }).value = value
    ctx.host_.dispatchEvent(new CustomEvent("input"))
}

export function onClick(ctx: OverlayCtx, state: OverlayState, e: MouseEvent): void {
    if (state.justDragged_) { state.justDragged_ = false; return }
    // Chromium still dispatches click after a Mac ctrl-click.
    if (isMacContextClick(e)) return
    const { layout, content } = pointerSpace(ctx, state, e)
    const hit = hitTestAt(ctx.manifest_, layout.x, layout.y, state.photo_, "click")
    if (!hit) return // miss = no-op, no round-trip
    const sample = layoutSpaceLayer(hit.layer) ? layout : content
    commitClick(ctx, state, hit, sample.x, sample.y)
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
