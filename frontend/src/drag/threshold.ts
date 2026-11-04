import { invertAxis, projectAxis } from "../geometry"
import { SVG_NS, DEFAULT_STYLE } from "../highlight"
import { clampX, clampY } from "../state"
import { fmtCoord } from "../template"
import type { Drag } from "../state"
import type { AxisTransform, Manifest, ThresholdGeometry } from "../types"

// --- draggable threshold lines (Tier 0): persistent, inverted via AxisTransform on release ---
export function setLine(line: SVGLineElement, tg: ThresholdGeometry, pos: number): void {
    const [lo, hi] = tg.span
    const [x1, y1, x2, y2] = tg.orientation === "h" ? [lo, pos, hi, pos] : [pos, lo, pos, hi]
    line.setAttribute("x1", String(x1)); line.setAttribute("y1", String(y1))
    line.setAttribute("x2", String(x2)); line.setAttribute("y2", String(y2))
}

// Each line goes in `parentFor(axis)`, the chrome group of the axis it belongs to.
export function buildThresholdLines(manifest: Manifest, parentFor: (axis: string) => SVGElement): Map<string, SVGLineElement> {
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
        parentFor(layer.axis).appendChild(line) // outside every g.hi → never hover-cleared
        thresholdLines.set(layer.id, line)
    }
    return thresholdLines
}

// A data value's image-px position along a line's axis: a number, or on a categorical
// dimension a category's label (Makie places category k, 1-based, at data k). Null for a value
// this axis can't place, or a polar axis.
export function valuePos(t: AxisTransform, h: boolean, v: unknown): number | null {
    if (t.polar) return null
    const cats = h ? t.ycats : t.xcats
    const d = typeof v === "string" ? (cats?.indexOf(v) ?? -1) + 1 : v
    if (typeof d !== "number" || !Number.isFinite(d) || (typeof v === "string" && d === 0)) return null
    const at = h ? projectAxis(t, t.xlims[0], d) : projectAxis(t, d, t.ylims[0])
    const pos = h ? at.y : at.x
    return Number.isFinite(pos) ? pos : null
}

// Moves the line to a restored field value (#576): the manifest drew the starting one. Writes
// `tg.pos` too, as a drag does, so hit-testing follows. False leaves the line where it was.
export function placeValue(line: SVGLineElement, tg: ThresholdGeometry, t: AxisTransform | undefined, env: unknown): boolean {
    if (!t || !env || typeof env !== "object" || !("payload" in env)) return false
    const pos = valuePos(t, tg.orientation === "h", (env as { payload: unknown }).payload)
    if (pos === null) return false
    tg.pos = pos
    setLine(line, tg, pos)
    return true
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

export function move(d: Extract<Drag, { kind: "threshold" }>, p: { x: number; y: number }, digits: number, explicit = false): string {
    place(d, d.tg_.orientation === "h" ? clampY(d.t_, p.y) : clampX(d.t_, p.x))
    const v = invertAxis(d.t_, clampX(d.t_, p.x), clampY(d.t_, p.y))
    return d.tg_.orientation === "h" ? fmtCoord(v.y, d.t_.yfmt, digits, explicit, true) : fmtCoord(v.x, d.t_.xfmt, digits, explicit, true)
}

// The field a release here would set, without moving the line: what an in-drag `onchange`
// frame is sent.
export function envelopeAt(d: Extract<Drag, { kind: "threshold" }>, p: { x: number; y: number }): { layer: string; index: number; payload: unknown } {
    const v = invertAxis(d.t_, clampX(d.t_, p.x), clampY(d.t_, p.y))
    return { layer: d.id_, index: 0, payload: d.tg_.orientation === "h" ? v.y : v.x }
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
