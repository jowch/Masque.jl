// Corner view buttons (#525): zoom in, zoom out and reset in a small box inside the corner of
// each axis that has a view. The look is settled ("Visual language (settled)" in
// docs/dev/live-interaction-checklist.md): a joined stack in the tooltip's theme, 24 CSS px
// buttons (44 under `any-pointer: coarse`), 8 px from the viewport corner. Shown while the
// pointer is over the axis, while the view's keyboard stop has focus, and after a touch on the
// axis; always with `controls = :always`; never with `:none`. Reset joins the stack only once
// the view has moved (`state.viewMoved_`, #524). A press goes over the gesture channel as one
// settled request, like a released key, and never reaches the plot's own click handling.

import { resetView } from "./bond"
import { matrixLimits } from "./geometry"
import { hideTip } from "./hover"
import { unmapPoint, wheelScale, zoomAt, ZOOM_NOTCH } from "./photo"
import * as viewDrag from "./drag/view"
import { MOTION_MS } from "./state"
import type { OverlayCtx, OverlayState } from "./state"
import type { HitLayer, Manifest, ViewGeometry } from "./types"

export const INSET = 8 // CSS px from the viewport corner, as .masque-note
export const FINE = 24 // button side, CSS px
export const COARSE = 44 // button side under any-pointer: coarse
const BUTTONS = 3

// Preference order. Bottom-left is never a candidate: it holds the .masque-note stack (#537).
export type Corner = "tr" | "tl" | "br"
export const CORNERS: readonly Corner[] = ["tr", "tl", "br"]

export interface Placement {
    corner: Corner
    row: boolean // the buttons side by side: the axis is too short for the stack
    size: number // button side, CSS px
}

type Rect = [number, number, number, number] // x, y, w, h

// The box's long side and short side, CSS px: the buttons, a 1 px divider between each, and
// the 1 px border. Sized for all three buttons, so reset joining never moves the box.
export function boxLength(size: number, n = BUTTONS): number { return n * size + (n - 1) + 2 }
export function boxBreadth(size: number): number { return size + 2 }

function intersect(a: Rect, b: Rect): Rect | null {
    const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1])
    const x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3])
    return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null
}

function contains(outer: Rect, inner: Rect, slack = 1): boolean {
    return outer[0] <= inner[0] + slack && outer[1] <= inner[1] + slack &&
        outer[0] + outer[2] >= inner[0] + inner[2] - slack && outer[1] + outer[3] >= inner[1] + inner[3] - slack
}

function sameRect(a: Rect, b: Rect, slack = 1): boolean {
    return a.every((v, i) => Math.abs(v - b[i]) <= slack)
}

// The part of a view's viewport that is on the picture (columns wider than the figure push
// part of an axis off it), image px.
export function visibleViewport(m: Manifest, g: ViewGeometry): Rect | null {
    return intersect([g.x, g.y, g.w, g.h], [0, 0, m.width, m.height])
}

// What covers the corners of `own`, image px: a legend or other opaque box Makie draws over the
// plots (`occluders`), and any other axis or colorbar box overlapping it. An inset covers its
// parent's corner; the parent, which holds the inset whole, does not cover the inset's. A twin
// axis on the same viewport is the same cell, not a cover (it shares one stack).
export function coversOf(m: Manifest, axis: string, own: Rect): Rect[] {
    const out: Rect[] = [...(m.occluders ?? [])]
    for (const [id, t] of Object.entries(m.transforms)) {
        if (id === axis) continue
        const v = t.viewport as Rect
        if (!intersect(v, own) || contains(v, own)) continue
        out.push(v)
    }
    return out
}

function coverage(box: Rect, covers: Rect[]): number {
    let a = 0
    for (const c of covers) {
        const i = intersect(box, c)
        if (i) a += i[2] * i[3]
    }
    return a
}

// The box's rect at `corner` of `vp`, image px, for a box `w` × `h` CSS px.
function boxAt(vp: Rect, corner: Corner, w: number, h: number, k: number): Rect {
    const [x, y, vw, vh] = vp
    const bw = w * k, bh = h * k, inset = INSET * k
    const left = corner === "tl" ? x + inset : x + vw - inset - bw
    const top = corner === "br" ? y + vh - inset - bh : y + inset
    return [left, top, bw, bh]
}

// Where a view's buttons go, or null when they don't fit. `k` is image px per CSS px. The box
// may take at most half the axis along its long side: a stack at most half the height, else a
// row at most half the width, and its short side plus both insets must fit across. On a coarse
// pointer the 44 px size is tried first, then 24 px. The corner is the first in preference
// order that nothing covers, else the least covered.
export function placeButtons(m: Manifest, layer: HitLayer, k: number, coarse: boolean): Placement | null {
    const g = layer.geometry as ViewGeometry
    const vp = visibleViewport(m, g)
    if (!vp || !(k > 0)) return null
    const vw = vp[2] / k, vh = vp[3] / k
    const covers = coversOf(m, layer.axis, vp)
    for (const size of coarse ? [COARSE, FINE] : [FINE]) {
        const len = boxLength(size), br = boxBreadth(size)
        const fitsStack = len <= vh / 2 && br + 2 * INSET <= vw
        const fitsRow = !fitsStack && len <= vw / 2 && br + 2 * INSET <= vh
        if (!fitsStack && !fitsRow) continue
        const [w, h] = fitsStack ? [br, len] : [len, br]
        let best: Corner = CORNERS[0], least = Infinity
        for (const c of CORNERS) {
            const a = coverage(boxAt(vp, c, w, h, k), covers)
            if (a < least) { least = a; best = c }
            if (a === 0) break
        }
        return { corner: best, row: fitsRow, size }
    }
    return null
}

// The views that get a stack: each view not set to `:none`, one per viewport. Twin axes on one
// cell share the first one's, which is the view the wheel and a drag there drive.
export function viewsWithButtons(m: Manifest): HitLayer[] {
    const out: HitLayer[] = []
    for (const l of m.layers) {
        if (l.kind !== "view" || !l.events.includes("drag")) continue
        const g = l.geometry as ViewGeometry
        const r: Rect = [g.x, g.y, g.w, g.h]
        // The first view on a viewport owns it, even with `controls = :none`.
        const taken = m.layers.some((o) => o !== l && o.kind === "view" && m.layers.indexOf(o) < m.layers.indexOf(l) &&
            sameRect(r, [(o.geometry as ViewGeometry).x, (o.geometry as ViewGeometry).y, (o.geometry as ViewGeometry).w, (o.geometry as ViewGeometry).h]))
        if (taken || g.controls === "none") continue
        out.push(l)
    }
    return out
}

// One zoom step about the viewport centre: the step of `+` and `-` on the view's keyboard stop.
// Settled at once, as a released key is. `dir` is +1 in, -1 out.
export function zoomStep(ctx: OverlayCtx, state: OverlayState, id: string, dir: 1 | -1): void {
    const l = ctx.manifest_.layers.find((x) => x.id === id && x.kind === "view")
    if (!l || state.drag_) return
    const g = l.geometry as ViewGeometry
    const t = ctx.manifest_.transforms[l.axis]
    const k = wheelScale(-dir * ZOOM_NOTCH, 0)
    if (state.wheelTimer_ !== null) { clearTimeout(state.wheelTimer_); state.wheelTimer_ = null }
    hideTip(ctx, state)
    if (g.mode === "orbit") {
        if (!g.limits) return
        const lim = viewDrag.zoom3(state, id, g.limits, k)
        void ctx.gesture_.settle({ id, limits: lim, settle: true })
        return
    }
    if (!t || !(g.w > 0) || !(g.h > 0)) return
    state.photoViewId_ = id
    const m = state.photo_
    const next = zoomAt(m, unmapPoint(m, { x: g.x + g.w / 2, y: g.y + g.h / 2 }), k)
    const lim = matrixLimits(t, next)
    if (!lim) return
    state.photo_ = next
    ctx.photoPaint_(next)
    void ctx.gesture_.settle({ id, ...lim, settle: true, s: next.s, tx: next.tx, ty: next.ty })
}

const ICONS = {
    in: '<path d="M12 6v12M6 12h12"/>',
    out: '<path d="M6 12h12"/>',
    reset: '<path d="M5.5 9.5A7 7 0 1 1 5 13.5"/><path d="M5 5v4.5h4.5"/>',
}
const LABELS = { in: "Zoom in", out: "Zoom out", reset: "Reset view" }

export const VIEW_BUTTONS_STYLE = `
.masque-vb { position: absolute; display: flex; flex-direction: column; box-sizing: border-box;
       opacity: 0; pointer-events: none; z-index: 12; overflow: hidden;
       background: var(--masque-tip-bg-resolved); color: var(--masque-tip-color-resolved);
       border: 1px solid var(--masque-tip-border-resolved); border-radius: var(--masque-tip-radius, 4px);
       box-shadow: var(--masque-tip-shadow, 0 2px 4px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08));
       transition: opacity ${MOTION_MS}ms ease-out; }
.masque-vb.row { flex-direction: row; }
.masque-vb.show { opacity: 1; pointer-events: auto; }
.masque-vb button { all: unset; box-sizing: border-box; width: var(--masque-vb-size, 24px); height: var(--masque-vb-size, 24px);
       display: grid; place-items: center; cursor: pointer; color: inherit; }
.masque-vb button + button { border-top: 1px solid var(--masque-tip-border-resolved); }
.masque-vb.row button + button { border-top: none; border-left: 1px solid var(--masque-tip-border-resolved); }
.masque-vb button svg { width: var(--masque-vb-icon, 14px); height: var(--masque-vb-icon, 14px); pointer-events: none; }
.masque-vb .masque-vb-reset { display: none; }
.masque-vb.moved .masque-vb-reset { display: grid; animation: masque-vb-join ${MOTION_MS}ms ease-out; }
@keyframes masque-vb-join { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-color-scheme: dark) {
  .masque-vb { box-shadow: var(--masque-tip-shadow, 0 2px 4px rgba(0,0,0,0.4), 0 8px 16px rgba(0,0,0,0.3)); }
}
@media (prefers-reduced-motion: reduce) {
  .masque-vb { transition: none; }
  .masque-vb.moved .masque-vb-reset { animation: none; }
}
`

export interface ViewButtons {
    // Re-read the manifest and the widget's size: re-place every box. Cheap when nothing changed.
    layout_: () => void
    // Which views have moved: reset joins or leaves.
    sync_: () => void
    // A pointer at image px (x, y) over the plot, or null when it left. `touch` keeps the box
    // up after the finger lifts, until a touch lands elsewhere.
    pointer_: (p: { x: number; y: number } | null, touch: boolean) => void
    // Whether an event target is one of the boxes (a pointer leaving the plot onto a box).
    owns_: (target: EventTarget | null) => boolean
    // The channel is dead (a static export, a kernel gone): the buttons go.
    dead_: () => void
    remove_: () => void
}

interface Box {
    id: string
    el: HTMLDivElement
    vp: [number, number, number, number] | null
    always: boolean
}

export function buildViewButtons(ctx: OverlayCtx, state: OverlayState, shadow: ShadowRoot, pxPerCss: () => number): ViewButtons {
    const boxes = new Map<string, Box>()
    let hovered: string | null = null
    let touched: string | null = null
    let focused: string | null = null
    let dead = false
    let lastKey = ""
    const coarseQuery = typeof window.matchMedia === "function" ? window.matchMedia("(any-pointer: coarse)") : null

    const shown = (b: Box) => !dead && (b.always || b.id === hovered || b.id === touched || b.id === focused)
    const paint = () => {
        for (const b of boxes.values()) {
            b.el.classList.toggle("show", shown(b) && b.vp !== null)
            b.el.classList.toggle("moved", state.viewMoved_.has(b.id))
        }
    }

    const make = (l: HitLayer): Box => {
        const el = document.createElement("div")
        el.className = "masque-vb"
        el.dataset.view = l.id
        el.setAttribute("role", "group")
        el.setAttribute("aria-label", "View controls")
        for (const key of ["in", "out", "reset"] as const) {
            const b = document.createElement("button")
            b.type = "button"
            b.className = `masque-vb-${key}`
            b.setAttribute("aria-label", LABELS[key])
            b.title = LABELS[key]
            // Not tab stops: the view's own stop has +, - and 0 for these.
            b.tabIndex = -1
            b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key]}</svg>`
            b.addEventListener("click", (e) => {
                e.preventDefault(); e.stopPropagation()
                if (key === "reset") resetView(ctx, state, l.id)
                else zoomStep(ctx, state, l.id, key === "in" ? 1 : -1)
                paint()
            })
            el.appendChild(b)
        }
        // A press is the box's, not the plot's: no pick, no clear, no pan, no focus moved.
        const own = (e: Event) => { e.stopPropagation() }
        el.addEventListener("pointerdown", own)
        el.addEventListener("pointerup", own)
        el.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation() })
        el.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation() })
        el.addEventListener("wheel", own)
        el.addEventListener("pointerleave", (e) => {
            if (e.pointerType !== "touch" && hovered === l.id && !(e.relatedTarget === ctx.surface_)) { hovered = null; paint() }
        })
        shadow.appendChild(el)
        return { id: l.id, el, vp: null, always: false }
    }

    const layout = () => {
        if (dead) return
        const m = ctx.manifest_
        const k = pxPerCss()
        const coarse = coarseQuery?.matches === true
        const views = viewsWithButtons(m)
        const key = JSON.stringify([k, coarse, m.width, m.height, m.occluders ?? null,
            views.map((l) => [l.id, (l.geometry as ViewGeometry).x, (l.geometry as ViewGeometry).y, (l.geometry as ViewGeometry).w, (l.geometry as ViewGeometry).h, (l.geometry as ViewGeometry).controls ?? ""]),
            Object.values(m.transforms).map((t) => t.viewport)])
        if (key === lastKey) { paint(); return }
        lastKey = key
        const keep = new Set(views.map((l) => l.id))
        for (const [id, b] of boxes) if (!keep.has(id)) { b.el.remove(); boxes.delete(id) }
        for (const l of views) {
            const b = boxes.get(l.id) ?? make(l)
            boxes.set(l.id, b)
            const g = l.geometry as ViewGeometry
            b.always = g.controls === "always"
            const p = placeButtons(m, l, k, coarse)
            const vp = p ? visibleViewport(m, g) : null
            b.vp = vp
            b.el.hidden = !p
            if (!p || !vp) continue
            b.el.classList.toggle("row", p.row)
            b.el.dataset.corner = p.corner
            b.el.style.setProperty("--masque-vb-size", `${p.size}px`)
            b.el.style.setProperty("--masque-vb-icon", `${p.size === COARSE ? 24 : 14}px`)
            // Percentages of the figure, so the box follows the widget's width without a re-place;
            // the inset is CSS px.
            const W = m.width, H = m.height
            const [x, y, w, h] = vp
            b.el.style.left = p.corner === "tl" ? `calc(${(x / W) * 100}% + ${INSET}px)` : ""
            b.el.style.right = p.corner === "tl" ? "" : `calc(${((W - x - w) / W) * 100}% + ${INSET}px)`
            b.el.style.top = p.corner === "br" ? "" : `calc(${(y / H) * 100}% + ${INSET}px)`
            b.el.style.bottom = p.corner === "br" ? `calc(${((H - y - h) / H) * 100}% + ${INSET}px)` : ""
        }
        paint()
    }

    const at = (p: { x: number; y: number }): string | null => {
        for (const b of boxes.values()) {
            const v = b.vp
            if (v && p.x >= v[0] && p.x <= v[0] + v[2] && p.y >= v[1] && p.y <= v[1] + v[3]) return b.id
        }
        return null
    }

    // The view's keyboard stop (dragkeys.ts): focus there shows its box.
    const onFocusIn = (e: Event) => {
        const t = e.target as HTMLElement | null
        const id = t?.classList?.contains("drag-stop") ? t.dataset.layer ?? null : null
        focused = id && boxes.has(id) ? id : null
        paint()
    }
    const onFocusOut = (e: FocusEvent) => {
        const t = e.target as HTMLElement | null
        if (t?.dataset?.layer === focused) { focused = null; paint() }
    }
    shadow.addEventListener("focusin", onFocusIn)
    shadow.addEventListener("focusout", onFocusOut as EventListener)
    const onCoarse = () => layout()
    coarseQuery?.addEventListener?.("change", onCoarse)

    layout()
    return {
        layout_: layout,
        sync_: paint,
        pointer_: (p, touch) => {
            const id = p ? at(p) : null
            if (touch) touched = id
            else hovered = id
            paint()
        },
        owns_: (target) => [...boxes.values()].some((b) => target instanceof Node && b.el.contains(target)),
        dead_: () => { dead = true; paint() },
        remove_: () => {
            shadow.removeEventListener("focusin", onFocusIn)
            shadow.removeEventListener("focusout", onFocusOut as EventListener)
            coarseQuery?.removeEventListener?.("change", onCoarse)
            for (const b of boxes.values()) b.el.remove()
            boxes.clear()
        },
    }
}
