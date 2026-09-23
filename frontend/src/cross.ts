// The overlay cross: both arms across the axis viewport (or colorbar bbox) under the pointer,
// plus optional stroke-only dots where a SliceInteractable samples a series. Drawn on
// svg.masque-plain. Opacity fades only when the cross turns on or off, not on each move.
import { SVG_NS } from "./highlight"
import type { OverlayCtx, OverlayState } from "./state"

const DOT_R = 3

export interface CrossEls {
    g_: SVGGElement
    v_: SVGLineElement
    h_: SVGLineElement
    dots_: SVGGElement
}

export interface CrossDot {
    px: number
    py: number
    color?: string
}

export function buildCross(svg: SVGSVGElement): CrossEls {
    const g = document.createElementNS(SVG_NS, "g")
    g.setAttribute("class", "masque-cross")
    const line = (): SVGLineElement => {
        const el = document.createElementNS(SVG_NS, "line")
        el.setAttribute("vector-effect", "non-scaling-stroke")
        return el
    }
    const v = line()
    const h = line()
    const dots = document.createElementNS(SVG_NS, "g")
    g.append(v, h, dots)
    svg.appendChild(g)
    return { g_: g, v_: v, h_: h, dots_: dots }
}

export function hideCross(ctx: OverlayCtx, state: OverlayState): void {
    if (!state.crossOn_) return
    state.crossOn_ = false
    ctx.cross_.g_.classList.remove("is-on")
}

export function syncCross(
    ctx: OverlayCtx, state: OverlayState, show: boolean,
    vx0: number, vy0: number, vx1: number, vy1: number,
    hx0: number, hy0: number, hx1: number, hy1: number,
    dots: CrossDot[],
): void {
    const g = ctx.cross_.g_
    if (show !== state.crossOn_) {
        state.crossOn_ = show
        g.classList.toggle("is-on", show)
    }
    if (!show) return
    const v = ctx.cross_.v_
    const h = ctx.cross_.h_
    v.setAttribute("x1", String(vx0))
    v.setAttribute("y1", String(vy0))
    v.setAttribute("x2", String(vx1))
    v.setAttribute("y2", String(vy1))
    h.setAttribute("x1", String(hx0))
    h.setAttribute("y1", String(hy0))
    h.setAttribute("x2", String(hx1))
    h.setAttribute("y2", String(hy1))
    const dotsG = ctx.cross_.dots_
    while (dotsG.children.length > dots.length) dotsG.removeChild(dotsG.lastElementChild!)
    for (let i = 0; i < dots.length; i++) {
        let c = dotsG.children[i] as SVGCircleElement | undefined
        if (!c) {
            c = document.createElementNS(SVG_NS, "circle")
            c.setAttribute("r", String(DOT_R))
            c.setAttribute("fill", "none")
            c.setAttribute("vector-effect", "non-scaling-stroke")
            dotsG.appendChild(c)
        }
        c.setAttribute("cx", String(dots[i].px))
        c.setAttribute("cy", String(dots[i].py))
        const color = dots[i].color
        if (color) c.style.stroke = color
        else c.style.removeProperty("stroke")
    }
}
