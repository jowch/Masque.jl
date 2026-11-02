import { invertAxis } from "../geometry"
import { SVG_NS, DEFAULT_STYLE } from "../highlight"
import { fmt } from "../state"
import type { Drag, SpanBand } from "../state"
import type { AxisTransform, Manifest, SpanGeometry } from "../types"
import { HANDLE_RADIUS_CSS } from "./roi"

// --- draggable bands (#500): two edges, the picture outside them faded, a grip on each edge ---
// The edges are threshold lines (same class, width and hover thickening). Outside the band
// each side gets a rect in the plot area's colour at the preview fade's strength
// (`.masque-span-dim`, mount.ts), so the band reads as the part left showing, as a pick does.
// Each edge carries a grip in the ROI grips' style, so an edge on a narrow colorbar can be
// found and grabbed.

// Painted grip, CSS px: thickness along the drag, length across the edge. The hit target is
// geometry.ts's SEG_TOL around the edge, which covers it.
export const GRIP_THICK_CSS = 6
export const GRIP_LONG_CSS = 16

// Image px per CSS px. cssWidth 0 (not laid out yet) falls back to manifest.scaling.
export function gripScale(imageWidth: number, cssWidth: number, scaling = 2): number {
    return cssWidth > 0 ? imageWidth / cssWidth : scaling
}

export function syncGripDraw(bands: Map<string, SpanBand>, imageWidth: number, cssWidth: number, scaling = 2): void {
    const k = gripScale(imageWidth, cssWidth, scaling)
    for (const band of bands.values()) {
        if (band.k_ === k) continue
        band.k_ = k
        setSpan(band)
    }
}

// The along-axis extent the band and its fades live in: the axis viewport, or the bar.
function extent(band: SpanBand): [number, number] {
    const [vx, vy, vw, vh] = band.t_.viewport
    return band.g_.orientation === "h" ? [vy, vy + vh] : [vx, vx + vw]
}

function place(el: SVGRectElement, h: boolean, p0: number, p1: number, s0: number, s1: number): void {
    const a = Math.min(p0, p1), len = Math.abs(p1 - p0)
    const [x, y, w, hh] = h ? [s0, a, s1 - s0, len] : [a, s0, len, s1 - s0]
    el.setAttribute("x", String(x)); el.setAttribute("y", String(y))
    el.setAttribute("width", String(w)); el.setAttribute("height", String(hh))
}

export function setSpan(band: SpanBand): void {
    const g = band.g_, h = g.orientation === "h"
    const [s0, s1] = g.span
    const [e0, e1] = extent(band)
    const a = Math.min(g.lo, g.hi), b = Math.max(g.lo, g.hi)
    place(band.dims_[0], h, e0, a, s0, s1)
    place(band.dims_[1], h, b, e1, s0, s1)
    const mid = (s0 + s1) / 2, half = (GRIP_LONG_CSS / 2) * band.k_, t = (GRIP_THICK_CSS / 2) * band.k_
    const r = String(HANDLE_RADIUS_CSS * band.k_)
    const edges = [g.lo, g.hi]
    for (let k = 0; k < 2; k++) {
        const p = edges[k], line = band.lines_[k]
        const [x1, y1, x2, y2] = h ? [s0, p, s1, p] : [p, s0, p, s1]
        line.setAttribute("x1", String(x1)); line.setAttribute("y1", String(y1))
        line.setAttribute("x2", String(x2)); line.setAttribute("y2", String(y2))
        place(band.grips_[k], h, p - t, p + t, mid - half, mid + half)
        band.grips_[k].setAttribute("rx", r); band.grips_[k].setAttribute("ry", r)
    }
}

// Each band goes in `parentFor(axis)`, the chrome group of the axis it belongs to: fades
// first, then the edges, then the grips on top.
export function buildSpanBands(manifest: Manifest, parentFor: (axis: string) => SVGElement, base: HTMLElement): Map<string, SpanBand> {
    const bands = new Map<string, SpanBand>()
    const k = gripScale(manifest.width, base.getBoundingClientRect().width, manifest.scaling)
    for (const layer of manifest.layers) {
        if (layer.kind !== "span") continue
        const g = layer.geometry as SpanGeometry
        const t = manifest.transforms[layer.axis]
        const svg = parentFor(layer.axis)
        const st = layer.style ?? DEFAULT_STYLE
        const fill = t.fill ?? manifest.background ?? "#ffffff"
        const dims = [0, 1].map(() => {
            const r = document.createElementNS(SVG_NS, "rect")
            r.classList.add("masque-span-dim")
            r.style.fill = fill
            svg.appendChild(r)
            return r
        }) as [SVGRectElement, SVGRectElement]
        const lines = [0, 1].map(() => {
            const line = document.createElementNS(SVG_NS, "line")
            line.classList.add("masque-hi", "masque-threshold-line")
            if (st.stroke) line.style.setProperty("--masque-hi-stroke", st.stroke)
            line.style.setProperty("--masque-line-w", String(st.width))
            line.setAttribute("vector-effect", "non-scaling-stroke")
            svg.appendChild(line)
            return line
        }) as [SVGLineElement, SVGLineElement]
        const grips = [0, 1].map(() => {
            const r = document.createElementNS(SVG_NS, "rect")
            r.classList.add("masque-handle")
            r.setAttribute("vector-effect", "non-scaling-stroke")
            if (st.stroke) r.style.setProperty("--masque-hi-stroke", st.stroke)
            svg.appendChild(r)
            return r
        }) as [SVGRectElement, SVGRectElement]
        // `g_` aliases the manifest geometry, so hit-testing follows the drawn band (as the ROI
        // box's `g_` does).
        const band: SpanBand = { g_: g, t_: t, dims_: dims, lines_: lines, grips_: grips, k_: k }
        setSpan(band)
        bands.set(layer.id, band)
    }
    return bands
}

export function removeSpanBand(band: SpanBand): void {
    for (const el of [...band.dims_, ...band.lines_, ...band.grips_]) el.remove()
}

// +1 when a larger value sits at a larger pixel along the drag, -1 when it sits at a smaller
// one (a y axis, unless reversed).
function direction(g: SpanGeometry, t: AxisTransform): number {
    return g.orientation === "v" ? (t.xreversed ? -1 : 1) : (t.yreversed ? 1 : -1)
}

export function begin(id: string, band: SpanBand, part: { edge?: "lo" | "hi"; move?: boolean }, along: number, pointerId: number): Drag {
    const mode: "lo" | "hi" | "move" = part.edge ?? "move"
    return { kind: "span", id_: id, band_: band, mode_: mode, at_: along, lo0_: band.g_.lo, hi0_: band.g_.hi, pointerId_: pointerId }
}

// The band's (lo, hi) in data space, sorted.
export function spanValues(band: SpanBand): { lo: number; hi: number } {
    const g = band.g_, t = band.t_
    const mid = (g.span[0] + g.span[1]) / 2
    const at = (p: number): number => (g.orientation === "h" ? invertAxis(t, mid, p).y : invertAxis(t, p, mid).x) as number
    const a = at(g.lo), b = at(g.hi)
    return { lo: Math.min(a, b), hi: Math.max(a, b) }
}

export function move(d: Extract<Drag, { kind: "span" }>, p: { x: number; y: number }, digits: number): string {
    const band = d.band_, g = band.g_
    const along = g.orientation === "h" ? p.y : p.x
    const [e0, e1] = extent(band)
    const clamp = (v: number): number => Math.max(e0, Math.min(e1, v))
    if (d.mode_ === "move") {
        const lo = Math.min(d.lo0_, d.hi0_), hi = Math.max(d.lo0_, d.hi0_)
        const shift = Math.max(e0 - lo, Math.min(e1 - hi, along - d.at_))
        g.lo = d.lo0_ + shift
        g.hi = d.hi0_ + shift
    } else {
        // An edge stops at the other one, so lo never passes hi.
        const dir = direction(g, band.t_)
        const v = clamp(along)
        if (d.mode_ === "lo") g.lo = dir > 0 ? Math.min(v, g.hi) : Math.max(v, g.hi)
        else g.hi = dir > 0 ? Math.max(v, g.lo) : Math.min(v, g.lo)
    }
    setSpan(band)
    const s = spanValues(band)
    return `[${fmt(s.lo, digits)}, ${fmt(s.hi, digits)}]`
}

// The field a release here would set: what an in-drag `onchange` frame is sent, and the commit.
export function envelope(d: Extract<Drag, { kind: "span" }>): { layer: string; index: number; payload: unknown } {
    return { layer: d.id_, index: 0, payload: spanValues(d.band_) }
}
