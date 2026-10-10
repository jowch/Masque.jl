import { SVG_NS, renderSelection } from "../highlight"
import { indicesInBox, manyHits } from "../selection"
import { clampX, clampY, VIEW_MIN_PX } from "../state"
import type { Drag, FieldPick, FieldSelection, OverlayCtx, OverlayState } from "../state"
import type { HitLayer } from "../types"

// --- marquee: drag a box over a plot to pick the marks inside (#335) ---
// It edits the picks of every `select = :many` field on that axis, the way a click does, and
// holds no value of its own. The box is drawn with the ROI outline recipe and is gone on release.

type Marquee = Extract<Drag, { kind: "marquee" }>
export type MarqueeMode = "replace" | "add" | "subtract"

// The plot a marquee pressed among `axes` (axesAt's list) draws in: the innermost one, so a box
// started in an inset stays in the inset. Null when there is none.
export function marqueeAxis(ctx: OverlayCtx, axes: string[]): string | null {
    const area = (id: string) => { const v = ctx.manifest_.transforms[id].viewport; return v[2] * v[3] }
    return axes.reduce<string | null>((best, id) => best === null || area(id) < area(best) ? id : best, null)
}

// The fields a marquee on `axis` edits: the `many` fields of the bind drawn there or on a twin
// that shares its plot area. A box's target is the box's alone, so it is left out.
export function marqueeTargets(ctx: OverlayCtx, axis: string): HitLayer[] {
    const fields = ctx.manifest_.fields
    const tfs = ctx.manifest_.transforms
    const vp = tfs[axis].viewport
    const same = (id: string | undefined) => id !== undefined && tfs[id] !== undefined && !tfs[id].valueaxis &&
        tfs[id].viewport.every((v, k) => v === vp[k])
    return ctx.manifest_.layers.filter((l) =>
        same(l.axis) && l.many === true && !l.brush && l.events.includes("click") &&
        (!fields || fields.includes(l.id)),
    )
}

export function begin(
    state: OverlayState, axis: string, targets: HitLayer[], mode: MarqueeMode,
    x: number, y: number, pointerId: number,
): Drag {
    const before = new Map<string, FieldSelection | undefined>()
    for (const t of targets) before.set(t.id, state.sel_.get(t.id))
    return {
        kind: "marquee", axis_: axis, targets_: targets, mode_: mode, x0_: x, y0_: y,
        box_: { x, y, w: 0, h: 0 }, rect_: null, before_: before, pointerId_: pointerId,
    }
}

function picksOf(sel: FieldSelection | undefined): FieldPick[] {
    return sel?.items_ ?? []
}

// What field `t` holds with the box where it is now.
function nextPicks(d: Marquee, t: HitLayer): FieldPick[] {
    const inside = indicesInBox(t, d.box_)
    const held = picksOf(d.before_.get(t.id))
    if (d.mode_ === "replace") return inside.map((index) => ({ layer: t.id, index }))
    const ins = new Set(inside)
    if (d.mode_ === "subtract") return held.filter((it) => !ins.has(it.index))
    const have = new Set(held.map((it) => it.index))
    return [...held, ...inside.filter((k) => !have.has(k)).map((index) => ({ layer: t.id, index }))]
}

function setPicks(ctx: OverlayCtx, state: OverlayState, t: HitLayer, items: FieldPick[]): void {
    state.sel_.set(t.id, { hits_: manyHits(ctx.manifest_, items), source_: null, items_: items })
}

// A press that hasn't moved VIEW_MIN_PX yet is still a click.
export function active(d: Marquee): boolean {
    return d.rect_ !== null
}

// Moves the box's free corner to `p` (content px, clamped to the plot area) and shows what a
// release would pick. Returns the readout, or null while the press is still a click.
export function move(ctx: OverlayCtx, state: OverlayState, d: Marquee, p: { x: number; y: number }): string | null {
    const t = ctx.manifest_.transforms[d.axis_] // marqueeAxis took the axis from these
    const cx = clampX(t, p.x), cy = clampY(t, p.y)
    if (d.rect_ === null) {
        if (Math.hypot(p.x - d.x0_, p.y - d.y0_) < VIEW_MIN_PX) return null
        const rect = document.createElementNS(SVG_NS, "rect")
        rect.classList.add("masque-hi", "masque-roi", "masque-marquee")
        rect.setAttribute("vector-effect", "non-scaling-stroke")
        ctx.chrome_.appendChild(rect)
        d.rect_ = rect
    }
    const x0 = clampX(t, d.x0_), y0 = clampY(t, d.y0_)
    d.box_ = { x: Math.min(x0, cx), y: Math.min(y0, cy), w: Math.abs(cx - x0), h: Math.abs(cy - y0) }
    d.rect_.setAttribute("x", String(d.box_.x)); d.rect_.setAttribute("y", String(d.box_.y))
    d.rect_.setAttribute("width", String(d.box_.w)); d.rect_.setAttribute("height", String(d.box_.h))
    let n = 0
    for (const tl of d.targets_) {
        if (tl.kind === "grid") continue // a grid's cells are a mask, not element picks
        const items = nextPicks(d, tl)
        setPicks(ctx, state, tl, items)
        n += items.length
    }
    renderSelection(ctx, state)
    return `${n} selected`
}

// The fields a release sets: each target's picks, for the ones the box changed.
export function end(ctx: OverlayCtx, state: OverlayState, d: Marquee): Record<string, unknown> {
    remove(d)
    const out: Record<string, unknown> = {}
    for (const t of d.targets_) {
        if (t.kind === "grid") continue // a grid's cells are a mask, not element picks
        const items = nextPicks(d, t)
        setPicks(ctx, state, t, items)
        const was = picksOf(d.before_.get(t.id))
        const same = was.length === items.length && was.every((it, k) => it.index === items[k].index)
        if (!same) out[t.id] = { items }
    }
    renderSelection(ctx, state)
    return out
}

// An aborted marquee puts every target's picks back as they were.
export function cancel(ctx: OverlayCtx, state: OverlayState, d: Marquee): void {
    remove(d)
    for (const [id, sel] of d.before_) {
        state.sel_.set(id, sel ?? { hits_: [], source_: null, items_: [] })
    }
    renderSelection(ctx, state)
}

function remove(d: Marquee): void {
    d.rect_?.remove()
    d.rect_ = null
}
