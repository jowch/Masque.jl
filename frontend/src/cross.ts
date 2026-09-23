// The overlay guide for a SliceInteractable: one hairline (vertical or horizontal) across the
// axis viewport under the pointer, plus a filled dot per sampled series. The hair stays on
// svg.masque-plain, in layout pixels, because the axis frame does not move. The dots are
// parented in the photograph group so they ride the slid series. The hair is a
// figure-background halo under a quieter stroke. Opacity fades only when the guide turns on
// or off, not on each move. Plots without a slice draw nothing.
import { SVG_NS } from "./highlight"
import type { OverlayCtx, OverlayState } from "./state"

// Image px. At the usual scaling of 2 the disc is about 4 CSS px across, plus a 1 CSS px ring.
const DOT_R = 4

export interface CrossEls {
    g_: SVGGElement
    vHalo_: SVGLineElement
    vHair_: SVGLineElement
    hHalo_: SVGLineElement
    hHair_: SVGLineElement
    dots_: SVGGElement
}

export interface CrossDot {
    px: number
    py: number
    color?: string
}

export function buildCross(svg: SVGSVGElement, dotsParent: SVGElement): CrossEls {
    const g = document.createElementNS(SVG_NS, "g")
    g.setAttribute("class", "masque-cross")
    const line = (cls: string): SVGLineElement => {
        const el = document.createElementNS(SVG_NS, "line")
        el.setAttribute("class", cls)
        el.setAttribute("vector-effect", "non-scaling-stroke")
        return el
    }
    // Both halos, then both hairs, so the fringe is continuous and the hairline paints on top.
    const vHalo = line("masque-cross-halo")
    const hHalo = line("masque-cross-halo")
    const vHair = line("masque-cross-hair")
    const hHair = line("masque-cross-hair")
    g.append(vHalo, hHalo, vHair, hHair)
    svg.appendChild(g)
    const dots = document.createElementNS(SVG_NS, "g")
    dots.setAttribute("class", "masque-cross")
    dotsParent.appendChild(dots)
    return { g_: g, vHalo_: vHalo, hHalo_: hHalo, vHair_: vHair, hHair_: hHair, dots_: dots }
}

function setCrossOn(ctx: OverlayCtx, on: boolean): void {
    ctx.cross_.g_.classList.toggle("is-on", on)
    ctx.cross_.dots_.classList.toggle("is-on", on)
}

export function hideCross(ctx: OverlayCtx, state: OverlayState): void {
    if (!state.crossOn_) return
    state.crossOn_ = false
    setCrossOn(ctx, false)
}

function place(line: SVGLineElement, x1: number, y1: number, x2: number, y2: number): void {
    line.setAttribute("x1", String(x1))
    line.setAttribute("y1", String(y1))
    line.setAttribute("x2", String(x2))
    line.setAttribute("y2", String(y2))
}

function arm(lines: SVGLineElement[], on: boolean, x1: number, y1: number, x2: number, y2: number): void {
    for (const line of lines) {
        if (!on) {
            line.style.display = "none"
            continue
        }
        line.style.removeProperty("display")
        place(line, x1, y1, x2, y2)
    }
}

export function syncCross(
    ctx: OverlayCtx, state: OverlayState, show: boolean,
    vx0: number, vy0: number, vx1: number, vy1: number,
    hx0: number, hy0: number, hx1: number, hy1: number,
    dots: CrossDot[],
    arms: { v: boolean; h: boolean },
): void {
    if (show !== state.crossOn_) {
        state.crossOn_ = show
        setCrossOn(ctx, show)
    }
    if (!show) return
    const c = ctx.cross_
    arm([c.vHalo_, c.vHair_], arms.v, vx0, vy0, vx1, vy1)
    arm([c.hHalo_, c.hHair_], arms.h, hx0, hy0, hx1, hy1)
    const dotsG = c.dots_
    while (dotsG.children.length > dots.length) dotsG.removeChild(dotsG.lastElementChild!)
    for (let i = 0; i < dots.length; i++) {
        let el = dotsG.children[i] as SVGCircleElement | undefined
        if (!el) {
            el = document.createElementNS(SVG_NS, "circle")
            el.setAttribute("r", String(DOT_R))
            el.setAttribute("vector-effect", "non-scaling-stroke")
            dotsG.appendChild(el)
        }
        el.setAttribute("cx", String(dots[i].px))
        el.setAttribute("cy", String(dots[i].py))
        const color = dots[i].color
        if (color) el.style.fill = color
        else el.style.removeProperty("fill")
    }
}
