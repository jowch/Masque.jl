import { invertAxis } from "../geometry"
import { computeSelection } from "../selection"
import { SVG_NS, DEFAULT_STYLE, renderSelection } from "../highlight"
import { clampX, clampY, fmt } from "../state"
import type { Drag, OverlayCtx, OverlayState, ROIBox } from "../state"
import type { HitLayer, Manifest, ROIGeometry } from "../types"

// Drawn grip side, CSS px. The hit target stays the manifest `handle` (geometry.ts); this
// constant is only the painted square, so a wide figure doesn't grow the handles.
export const HANDLE_CSS = 7

// Half-side in image px. cssWidth 0 (not laid out yet) falls back to manifest.scaling.
export function handleDrawHalf(imageWidth: number, cssWidth: number, scaling = 2): number {
    const pxPerCss = cssWidth > 0 ? imageWidth / cssWidth : scaling
    return (HANDLE_CSS / 2) * pxPerCss
}

export function syncHandleDraw(
    boxes: Map<string, ROIBox>, imageWidth: number, cssWidth: number, scaling = 2,
): void {
    const draw = handleDrawHalf(imageWidth, cssWidth, scaling)
    for (const box of boxes.values()) {
        if (box.draw_ === draw) continue
        box.draw_ = draw
        setROI(box)
    }
}

// --- draggable + resizable ROI boxes (Tier 0) ---
// handles_[0..3] are the corners, in the same order geometry.ts checks. The four sides have
// no drawn grip: geometry.ts still hit-tests a square on each edge midpoint, so grabbing the
// middle of a side resizes that one edge.
export function setROI(box: ROIBox): void {
    const { x, y, w, h } = box.g_
    const d = box.draw_
    box.rect_.setAttribute("x", String(x)); box.rect_.setAttribute("y", String(y))
    box.rect_.setAttribute("width", String(w)); box.rect_.setAttribute("height", String(h))
    const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    for (let k = 0; k < 4; k++) {
        box.handles_[k].setAttribute("x", String(corners[k][0] - d))
        box.handles_[k].setAttribute("y", String(corners[k][1] - d))
        box.handles_[k].setAttribute("width", String(2 * d))
        box.handles_[k].setAttribute("height", String(2 * d))
    }
}

export function roiBounds(box: ROIBox): { xmin: number; xmax: number; ymin: number; ymax: number } {
    const a = invertAxis(box.t_, box.g_.x, box.g_.y), b = invertAxis(box.t_, box.g_.x + box.g_.w, box.g_.y + box.g_.h)
    const ax = a.x as number, bx = b.x as number, ay = a.y as number, by = b.y as number
    return { xmin: Math.min(ax, bx), xmax: Math.max(ax, bx), ymin: Math.min(ay, by), ymax: Math.max(ay, by) }
}

export function buildROIBoxes(manifest: Manifest, svg: SVGSVGElement, base: HTMLElement): Map<string, ROIBox> {
    const roiBoxes = new Map<string, ROIBox>()
    const rect0 = base.getBoundingClientRect()
    const draw = handleDrawHalf(manifest.width, rect0.width, manifest.scaling)
    for (const layer of manifest.layers) {
        if (layer.kind !== "roi") continue
        const rg = layer.geometry as ROIGeometry
        const st = layer.style ?? DEFAULT_STYLE
        const rect = document.createElementNS(SVG_NS, "rect")
        rect.classList.add("masque-hi")
        // 1px outline unless an explicit hoverstyle stroke names its own width.
        rect.setAttribute("stroke-width", st.stroke ? String(st.width) : "1")
        rect.setAttribute("vector-effect", "non-scaling-stroke")
        if (st.stroke) rect.style.setProperty("--masque-hi-stroke", st.stroke)
        svg.appendChild(rect)
        const handles: SVGRectElement[] = []
        for (let k = 0; k < 4; k++) {
            const hdl = document.createElementNS(SVG_NS, "rect")
            hdl.classList.add("masque-handle")
            hdl.setAttribute("stroke-width", "1")
            hdl.setAttribute("vector-effect", "non-scaling-stroke")
            if (st.stroke) hdl.style.setProperty("--masque-hi-stroke", st.stroke)
            svg.appendChild(hdl); handles.push(hdl)
        }
        // box.g_ aliases the manifest ROIGeometry so drag mutations stay visible to hitLayer,
        // which reads layer.geometry directly. `target_` is resolved once here, not per mousedown;
        // undefined when this ROI has no `selects` (bounds-only). draw_ is the painted square;
        // the hit half-size stays on the geometry (`handle`), which geometry.ts reads directly.
        const target = layer.selects ? (manifest.layers.find((l) => l.id === layer.selects) as HitLayer | undefined) : undefined
        const box: ROIBox = {
            rect_: rect, handles_: handles, g_: rg, draw_: draw,
            t_: manifest.transforms[layer.axis], target_: target,
        }
        setROI(box)
        roiBoxes.set(layer.id, box)
    }
    return roiBoxes
}

export function begin(
    id: string, box: ROIBox, mode: { corner: number } | { edge: "n" | "s" | "w" | "e" } | { move: true },
    ax: number, ay: number, pointerId: number,
): Drag {
    return { kind: "roi", id_: id, box_: box, mode_: mode, ax_: ax, ay_: ay, target_: box.target_, pointerId_: pointerId }
}

export function move(ctx: OverlayCtx, state: OverlayState, d: Extract<Drag, { kind: "roi" }>, p: { x: number; y: number }): string {
    const box = d.box_, [vx, vy, vw, vh] = box.t_.viewport
    if ("move" in d.mode_) {
        box.g_.x = Math.max(vx, Math.min(vx + vw - box.g_.w, p.x - d.ax_))
        box.g_.y = Math.max(vy, Math.min(vy + vh - box.g_.h, p.y - d.ay_))
    } else if ("edge" in d.mode_) {
        // One axis only — the perpendicular axis's extent is untouched, unlike a corner drag.
        // d.ax_/d.ay_ carry the single fixed opposite edge, precomputed by bond.ts's onDown.
        const cx = clampX(box.t_, p.x), cy = clampY(box.t_, p.y)
        switch (d.mode_.edge) {
            case "n": box.g_.y = Math.min(cy, d.ay_); box.g_.h = Math.abs(d.ay_ - cy); break
            case "s": box.g_.y = Math.min(cy, d.ay_); box.g_.h = Math.abs(cy - d.ay_); break
            case "w": box.g_.x = Math.min(cx, d.ax_); box.g_.w = Math.abs(d.ax_ - cx); break
            case "e": box.g_.x = Math.min(cx, d.ax_); box.g_.w = Math.abs(cx - d.ax_); break
        }
    } else {
        const cx = clampX(box.t_, p.x), cy = clampY(box.t_, p.y)
        box.g_.x = Math.min(d.ax_, cx); box.g_.y = Math.min(d.ay_, cy)
        box.g_.w = Math.abs(cx - d.ax_); box.g_.h = Math.abs(cy - d.ay_)
    }
    setROI(box)
    if (d.target_) {
        const sel = computeSelection(box.g_, d.target_, ctx.manifest_.transforms[d.target_.axis])
        state.selHits_ = sel.hits
        renderSelection(ctx, state)
        return `${sel.items.length} selected`
    }
    const b = roiBounds(box)
    return `x:[${fmt(b.xmin)}, ${fmt(b.xmax)}] y:[${fmt(b.ymin)}, ${fmt(b.ymax)}]`
}

export function end(
    ctx: OverlayCtx,
    state: OverlayState,
    d: Extract<Drag, { kind: "roi" }>,
): { items: unknown[] } | { layer: string; index: number; payload: unknown } {
    if (d.target_) {
        const sel = computeSelection(d.box_.g_, d.target_, ctx.manifest_.transforms[d.target_.axis])
        state.selHits_ = sel.hits
        renderSelection(ctx, state)
        return { items: sel.items }
    }
    return { layer: d.id_, index: 0, payload: roiBounds(d.box_) }
}
