import type { Anchor } from "./geometry"
import type { CrossEls } from "./cross"
import type { GestureChannel } from "./gesture"
import { IDENTITY, type PhotoMatrix } from "./photo"
import type { AxisTransform, FocusRef, Hit, HitLayer, Manifest, ThresholdGeometry, ViewGeometry } from "./types"

export const MOTION_MS = 100 // 80–120 ms window; prefers-reduced-motion disables below
export const VIEW_MIN_PX = 3 // image-px; ignore accidental micro-drags

export const fmt = (v: unknown): string => (typeof v === "number" ? v.toPrecision(4) : String(v))

export const clampX = (t: AxisTransform, x: number): number => Math.max(t.viewport[0], Math.min(t.viewport[0] + t.viewport[2], x))
export const clampY = (t: AxisTransform, y: number): number => Math.max(t.viewport[1], Math.min(t.viewport[1] + t.viewport[3], y))

export const prefersReducedMotion = (): boolean =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

export const hitKey = (h: Hit): string => `${h.layer.id}:${h.index}`

// Image-px scale comes from manifest.width, not the element's intrinsic size, so a
// <canvas> needs no sizer shim.
export const imgPx = (base: HTMLElement, manifest: Manifest, e: MouseEvent): { x: number; y: number } => {
    const r = base.getBoundingClientRect()
    const s = manifest.width / r.width // image-px per CSS-px (manifest renderWidth ÷ live rect; never the base's intrinsic size)
    return { x: (e.clientX - r.left) * s, y: (e.clientY - r.top) * s }
}

// Image pixel under the cursor in the base's border box. `offsetWidth` cancels, so a
// photographic CSS transform on that element would make this the content pixel. The base
// stays untransformed — the matrix is on the data copy — so this is the layout point a
// pan wants as `cur`. Wheel zoom and the grabbed pan anchor want the content pixel,
// `unmapPoint(photo, layoutImagePx(...))`. A zero `offsetWidth` (happy-dom, or not laid
// out yet) falls back to the border box.
export function layoutImagePx(base: HTMLElement, manifest: Manifest, clientX: number, clientY: number): { x: number; y: number } {
    const r = base.getBoundingClientRect()
    const boxW = base.offsetWidth > 0 ? base.offsetWidth : r.width
    const boxH = base.offsetHeight > 0 ? base.offsetHeight : r.height
    if (!(r.width > 0) || !(boxW > 0) || !(r.height > 0) || !(boxH > 0)) return { x: 0, y: 0 }
    // Same product as imgPx when the border box is the layout box. Dividing by
    // offsetWidth and multiplying back is a no-op that drifts a ulp.
    if (boxW === r.width && boxH === r.height) {
        return {
            x: (clientX - r.left) * (manifest.width / r.width),
            y: (clientY - r.top) * (manifest.height / r.height),
        }
    }
    const lx = (clientX - r.left) / r.width * boxW
    const ly = (clientY - r.top) / r.height * boxH
    return { x: lx / boxW * manifest.width, y: ly / boxH * manifest.height }
}

// Anchor (image px, from geometry.ts's anchorFor) → css px, for the tooltip placement math —
// shared by the pointer (hover.ts) and keyboard (keyboard.ts) paths so both convert identically.
// One getBoundingClientRect() per call — this runs on every hover-path mousemove for the
// mark-anchored kinds, same rAF-throttled budget as imgPx's own per-move read.
export const cssAnchor = (base: HTMLElement, manifest: Manifest, a: Anchor): Anchor => {
    const r = base.getBoundingClientRect()
    const s = manifest.width / r.width
    return { x: a.x / s, y: a.y / s, top: a.top / s }
}

// ROIBox/Drag/OverlayCtx/OverlayState/FocusRef are frontend-only interaction state — they
// never reach Julia, Pluto, or the DOM as object shapes (only individual field *values* do,
// copied out into the `@bind` payload by bond.ts/drag/*.ts). Every field below therefore
// takes the trailing-underscore convention esbuild's `mangleProps: /_$/` shortens in the
// bundle (see frontend-delivery.md's Bundle row). The `kind` discriminant is deliberately
// left unmangled: `.kind` is also how HitLayer's own boundary discriminant is spelled, and
// keeping the two textually identical avoids having to thread that distinction through every
// `.kind` read in bond.ts/hover.ts for a saving of a few bytes.
// The overlay's three coordinate-identical top-level <svg>s (mount.ts), in DOM/paint order:
// masque-fill (mix-blend-mode: color-dodge, brightens — FILL-only shapes), masque-edge (no
// blend — STROKE-only chrome grey), masque-plain (no blend — ROI rect/handles, threshold
// lines, explicit-hoverstyle highlights, the selected-open-geometry ring). The fill svg is its
// own element because mix-blend-mode has to live on the svg ELEMENT (Firefox won't blend
// nested SVG content). The edge svg stays a sibling so the stroke paints above that fill.
// Each svg has its own g.hi/g.sel; highlight.ts's drawHi/drawSelection/clearHi/clearSel take
// one of these per hi/sel role and route each element into whichever side(s) makeHiElement picked.
export interface HiGroups {
    fill_: SVGGElement
    edge_: SVGGElement
    plain_: SVGGElement
}

export interface ROIBox {
    rect_: SVGRectElement
    handles_: SVGRectElement[]
    g_: { x: number; y: number; w: number; h: number }
    draw_: number // painted half-size, image px — a fixed CSS-px grip scaled by the live display
    t_: AxisTransform
    target_?: HitLayer
}

// Every variant carries the pointerId that started it — onPointerMove/onUp/onCancel gate on
// this so a second concurrent pointer (e.g. two-finger touch, now let through by
// touch-action:none) can move/release/cancel without hijacking an in-flight drag it didn't
// start. onDown's `if (drag) return` only stops a second pointerDOWN; without this field the
// second pointer's move/up/cancel still routed into the first pointer's drag.
export type Drag =
    | { kind: "threshold"; id_: string; line_: SVGLineElement; tg_: ThresholdGeometry; t_: AxisTransform; pointerId_: number }
    | {
        kind: "roi"; id_: string; box_: ROIBox
        mode_: { corner: number } | { edge: "n" | "s" | "w" | "e" } | { move: true }
        ax_: number; ay_: number; target_?: HitLayer; pointerId_: number
    }
    | {
        kind: "view"; id_: string; g_: ViewGeometry; t_: AxisTransform; x0_: number; y0_: number; pointerId_: number
        // The last gesture-channel request payload actually sent for this drag — `undefined`
        // until the first one past VIEW_MIN_PX. bond.ts's terminal handlers
        // (onUp/onCancel/onLostCapture) settle when this is set, not from the release point's
        // distance: a drag that went out past VIEW_MIN_PX and back below it before release
        // still owes a settle (ppu=1 was sent at least once and has to be restored).
        lastInput_?: Record<string, unknown>
        // A pan pointerdown cleared a live wheel-idle timer. That timer was the only
        // settle:true for the notch. A press that never passes VIEW_MIN_PX leaves
        // `lastInput_` unset, so the terminal handlers settle the current photo from this
        // flag instead. A wheel whose timer already fired does not set it. A drag that
        // also sets `lastInput_` settles once.
        settleOwed_?: boolean
    }

// Construction-time DOM/manifest refs, built once by mount.ts and threaded read-mostly through
// hover/drag/bond as `ctx`. Distinct from OverlayState, which is the mutable interaction state.
export interface OverlayCtx {
    manifest_: Manifest
    host_: HTMLElement
    base_: HTMLElement
    surface_: HTMLElement
    tip_: HTMLElement
    hiGroup_: HiGroups
    selGroup_: HiGroups
    // Legend, colorbar, and axis rings. Siblings of the photograph clip, so a live matrix
    // neither slides nor clips them. Linked data marks stay in linkGroup_.
    hiFixed_: HiGroups
    selFixed_: HiGroups
    linkGroup_: HiGroups // transient legend-linked highlights (g.link), z-ordered between sel and hi
    thresholdLines_: Map<string, SVGLineElement>
    roiBoxes_: Map<string, ROIBox>
    shadowRoot_: ShadowRoot // for `shadowRoot.activeElement === surface` focus gating (keyboard.ts)
    focusable_: FocusRef[] // flat, manifest-order list of element-indexed hits — keyboard.ts's nav domain
    layerStarts_: number[] // computeLayerStarts(focusable), cached once — PageUp/PageDown's layer-jump index
    liveRegion_: HTMLElement // visually-hidden aria-live="polite" announcer (NOT the tooltip)
    cross_: CrossEls // slice hair on svg.masque-plain; sample dots in the photo group; opacity tracks crossOn_
    // `manifest_`/`thresholdLines_`/`roiBoxes_`/`focusable_`/`layerStarts_` above are
    // reassigned in place when a frame swaps in a new manifest (mount.ts's applyFrame) —
    // the one exception to "construction-time, read-mostly".
    gesture_: GestureChannel
    // Paints the photographic matrix onto the base and the overlay groups. Mount owns the DOM.
    photoPaint_: (m: PhotoMatrix) => void
}

export interface OverlayState {
    drag_: Drag | null
    justDragged_: boolean
    // Hover chrome still in g.hi, live or mid-leave. Null once those nodes are gone.
    // drawSelection reads it to drop a ring whose key just entered the selection (#97).
    hiKey_: string | null
    selKeys_: Set<string>
    // THE selection. Seeded at mount from the manifest's `selected=` hits (hydration only, an
    // initial value). Written by two gestures, both wholesale-REPLACING this, never unioning with
    // what was there: a click whose hit kind participates in the selection model (selection.ts's
    // `selectionFor` returns non-null — an element-indexed kind, :grid, or a legend link, which
    // may itself resolve to `[]`), and a selects-ROI move/release. A click on a kind that does
    // NOT participate (:axis/:threshold/:roi/:view — `selectionFor` returns `null`) leaves this
    // field untouched. Reset on remount falls out of createOverlayState() re-running, not a reset
    // this field needs of its own.
    selHits_: Hit[]
    hiLeaveTimer_: ReturnType<typeof setTimeout> | null
    // g.link (legend-linked highlight): keyed by hitKey() of the SOURCE element (the hovered/
    // focused legend entry), not any one target hit — one source can fan out to many target
    // hits across several layers, all drawn/cleared together. Same fade convention as hi/sel.
    linkKey_: string | null
    linkLeaveTimer_: ReturnType<typeof setTimeout> | null
    tipFlipTimer_: ReturnType<typeof setTimeout> | null
    pendingMove_: MouseEvent | null
    moveRaf_: number
    pendingDrag_: PointerEvent | null
    dragRaf_: number
    tipHtml_: string
    tipW_: number
    tipH_: number
    tipSized_: boolean
    surfaceW_: number
    surfaceH_: number
    surfaceSized_: boolean
    // Keyboard focus (keyboard.ts). focusIdx indexes OverlayCtx.focusable; focusHit/focusTipHtml/
    // focusTipCss are hover.ts's cache to redraw the ring/tooltip after a pointer miss clears
    // g.hi — see restoreFocus in hover.ts — without hover.ts importing keyboard.ts (no cycle).
    focusIdx_: number | null
    focusHit_: Hit | null
    focusTipHtml_: string | null
    focusTipCss_: Anchor | null
    announceTimer_: ReturnType<typeof setTimeout> | null
    // :threshold layer id currently drawn thicker for drag-hover feedback; cleared on any miss
    // (hover.ts's setDragHoverChrome) so it can never point at a line no longer under the cursor.
    hoveredThresholdId_: string | null
    // True while both masque-cross groups have .is-on. Toggled only when the cross appears or
    // disappears, so a move inside the viewport does not restart the opacity fade.
    crossOn_: boolean
    // Photographic pan/zoom of the frame on screen (#85). Image pixels of that frame.
    // `photoAnchor_` is the grabbed point during a 2D pan; null when the pointer is up.
    // `photoViewId_` is the pan view whose viewport stays fixed while the data inside it slides.
    photo_: PhotoMatrix
    photoAnchor_: { x: number; y: number } | null
    photoViewId_: string | null
    wheelTimer_: ReturnType<typeof setTimeout> | null
}

export function createOverlayState(): OverlayState {
    return {
        drag_: null,
        justDragged_: false,
        hiKey_: null,
        selKeys_: new Set(),
        selHits_: [],
        hiLeaveTimer_: null,
        linkKey_: null,
        linkLeaveTimer_: null,
        tipFlipTimer_: null,
        pendingMove_: null,
        moveRaf_: 0,
        pendingDrag_: null,
        dragRaf_: 0,
        tipHtml_: "",
        tipW_: 0,
        tipH_: 0,
        tipSized_: false,
        surfaceW_: 0,
        surfaceH_: 0,
        surfaceSized_: false,
        focusIdx_: null,
        focusHit_: null,
        focusTipHtml_: null,
        focusTipCss_: null,
        announceTimer_: null,
        hoveredThresholdId_: null,
        crossOn_: false,
        photo_: IDENTITY,
        photoAnchor_: null,
        photoViewId_: null,
        wheelTimer_: null,
    }
}

export function cancelPendingMove(state: OverlayState): void {
    if (state.moveRaf_) {
        cancelAnimationFrame(state.moveRaf_)
        state.moveRaf_ = 0
    }
    state.pendingMove_ = null
}

export function cancelPendingDrag(state: OverlayState): void {
    if (state.dragRaf_) {
        cancelAnimationFrame(state.dragRaf_)
        state.dragRaf_ = 0
    }
    state.pendingDrag_ = null
}
