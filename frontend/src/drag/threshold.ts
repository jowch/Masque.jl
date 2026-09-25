import { invertAxis, projectAxis } from "../geometry"
import { SVG_NS, DEFAULT_STYLE } from "../highlight"
import { clampX, clampY, fmt } from "../state"
import type { Drag } from "../state"
import type { AxisTransform, Manifest, ThresholdGeometry } from "../types"

// --- draggable threshold lines (Tier 0): persistent, inverted via AxisTransform on release ---
export function setLine(line: SVGLineElement, tg: ThresholdGeometry, pos: number): void {
    const [lo, hi] = tg.span
    const [x1, y1, x2, y2] = tg.orientation === "h" ? [lo, pos, hi, pos] : [pos, lo, pos, hi]
    line.setAttribute("x1", String(x1)); line.setAttribute("y1", String(y1))
    line.setAttribute("x2", String(x2)); line.setAttribute("y2", String(y2))
}

export function buildThresholdLines(manifest: Manifest, svg: SVGElement): Map<string, SVGLineElement> {
    const thresholdLines = new Map<string, SVGLineElement>()
    for (const layer of manifest.layers) {
        if (layer.kind !== "threshold") continue
        const tg = layer.geometry as ThresholdGeometry
        const line = document.createElementNS(SVG_NS, "line")
        setLine(line, tg, tg.pos)
        const st = layer.style ?? DEFAULT_STYLE
        line.classList.add("masque-hi")
        if (st.stroke) line.style.setProperty("--masque-hi-stroke", st.stroke)
        // Base width goes through a CSS custom property + class (not the stroke-width attribute)
        // so the hover-thicken class (mount.ts's .masque-threshold-line.hovered, applied by
        // hover.ts's setDragHoverChrome) can calc() off it — a presentation attribute would win
        // over the class's rule at equal specificity, silently defeating the hover thickening.
        line.classList.add("masque-threshold-line")
        line.style.setProperty("--masque-line-w", String(st.width))
        line.setAttribute("vector-effect", "non-scaling-stroke")
        svg.appendChild(line) // sibling of hiGroup → never hover-cleared
        thresholdLines.set(layer.id, line)
    }
    return thresholdLines
}

export function begin(id: string, line: SVGLineElement, tg: ThresholdGeometry, t: AxisTransform, pointerId: number): Drag {
    return { kind: "threshold", id_: id, line_: line, tg_: tg, t_: t, pointerId_: pointerId }
}

// `tg_` is the manifest's own geometry object (hitTestAt returns the layer), so writing `pos`
// keeps hit-testing on the drawn line: without it a second drag only grabbed the line where the
// manifest first put it. Same aliasing as the ROI box's `g_`.
function place(d: Extract<Drag, { kind: "threshold" }>, pos: number): void {
    d.tg_.pos = pos
    setLine(d.line_, d.tg_, pos)
}

export function move(d: Extract<Drag, { kind: "threshold" }>, p: { x: number; y: number }): string {
    place(d, d.tg_.orientation === "h" ? clampY(d.t_, p.y) : clampX(d.t_, p.x))
    const v = invertAxis(d.t_, clampX(d.t_, p.x), clampY(d.t_, p.y))
    return fmt(d.tg_.orientation === "h" ? v.y : v.x)
}

export function end(d: Extract<Drag, { kind: "threshold" }>, p: { x: number; y: number }): { layer: string; index: number; payload: unknown } {
    const v = invertAxis(d.t_, clampX(d.t_, p.x), clampY(d.t_, p.y))
    const h = d.tg_.orientation === "h"
    const payload = h ? v.y : v.x
    // On a categorical dimension the payload is the nearest category's label (`mapAxis`), so move
    // the line onto that category: Makie places category k (1-based) at data k.
    const cats = h ? d.t_.ycats : d.t_.xcats
    const k = cats && typeof payload === "string" ? cats.indexOf(payload) + 1 : 0
    if (k > 0) {
        const at = projectAxis(d.t_, h ? 0 : k, h ? k : 0)
        place(d, h ? at.y : at.x)
    }
    return { layer: d.id_, index: 0, payload }
}
