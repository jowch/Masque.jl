import { isLightBackground, parseRGB } from "./color"
import { layoutSpaceLayer, polygonRings } from "./geometry"
import type { AxisFrame } from "./geometry"
import { isGapElement, layerNElements } from "./selection"
import type { FieldSelection } from "./state"
import type { Hit, HitLayer, Manifest } from "./types"

// The selected look for closed marks (circles, rects, polygons), drawn on two canvases per axis
// instead of SVG nodes, so its cost follows the plot's marks, not its picks (#394). Once a plot
// holds picks, its unpicked marks fade toward the plot area's colour: the dim canvas covers them
// in that colour and the stylesheet sets how much shows through (overlaystyle `unpicked_opacity`).
// The picks keep the image's own pixels. On the top canvas, a pick an unpicked mark drawn after
// it covers is repainted in its own colour, and a pick with no other pick near it gets a 1px
// outline in a shade of its own colour, so a few picks in a dense plot can still be found while
// a crowd of picks reads by its colour alone; a mark whose colour is unknown is outlined in its
// layer's hoverstyle stroke, or the chrome grey. Lines, picked points on a line, grid cells and
// regions keep their SVG recipes (highlight.ts).

export const FADE_KINDS = new Set(["circles", "rects", "polygons"])

// Image px a faded mark's cover reaches past its edge (antialiasing, a thin outline), and a
// pick's punch-out past its own.
const PAD_DIM = 1.5
const PAD_KEEP = 0.5
// A pick is lone when no other pick lies within this many of its radii of its edge: centres 3
// radii apart for two equal circles.
const LONE_GAP = 1
// How far a lone pick's outline moves its own colour toward black (light plot area) or white (dark).
const OUTLINE_MIX = 0.45

// A hit drawn by this look rather than by an SVG recipe: an element of a closed data layer.
export function fadeLook(hit: Hit): boolean {
    if (!FADE_KINDS.has(hit.layer.kind) || layoutSpaceLayer(hit.layer)) return false
    const g = hit.geom_
    return !!g && (g[0] === "circle" || g[0] === "rect" || g[0] === "poly")
}

const fadeLayer = (l: HitLayer | undefined): l is HitLayer => !!l && FADE_KINDS.has(l.kind) && !layoutSpaceLayer(l)

// The layers a legend entry's links can name, all of its entries together: picking or hovering
// one series of a legend fades the legend's other series.
function legendLayers(manifest: Manifest, legend: HitLayer): HitLayer[] {
    const out = new Set<HitLayer>()
    for (const specs of legend.links ?? []) {
        for (const spec of specs) {
            const exact = manifest.layers.find((l) => l.id === spec)
            const m = exact ? null : /^(.*):(\d+)$/.exec(spec)
            const l = exact ?? (m ? manifest.layers.find((x) => x.id === m[1]) : undefined)
            if (fadeLayer(l)) out.add(l)
        }
    }
    return [...out]
}

// The layers a selection fades: each layer a field's picks are on, and, for a legend's field,
// every series the legend names.
export function selectionScope(manifest: Manifest, sel: Map<string, FieldSelection>): HitLayer[] {
    const out = new Set<HitLayer>()
    for (const [field, s] of sel) {
        if (!s.hits_.length) continue
        const own = manifest.layers.find((l) => l.id === field)
        if (own?.links?.length) for (const l of legendLayers(manifest, own)) out.add(l)
        for (const h of s.hits_) if (fadeLook(h)) out.add(h.layer)
    }
    return [...out]
}

// What a legend entry's hover previews: its own series kept, the legend's other series faded.
export function previewScope(manifest: Manifest, legend: HitLayer): HitLayer[] {
    return legendLayers(manifest, legend)
}

// The elements a layer draws, bottom first: `order` lists them top first and leaves out the
// ones not drawn; without it the last element is on top.
function paintOrder(layer: HitLayer): number[] {
    if (layer.order && (layer.kind === "circles" || layer.kind === "rects")) return [...layer.order].reverse()
    const n = layerNElements(layer)
    const out: number[] = []
    for (let k = 0; k < n; k++) out.push(k)
    return out
}

// The colour faded marks go toward: the axis's empty plot area, which is the figure's
// background unless the axis has its own.
const plotFill = (m: Manifest, axis: string): string => m.transforms[axis]?.fill ?? m.background ?? "#ffffff"

// Whether keeping `hits` fades any mark of `scope`. When it fades none (a legend's only closed
// series, every mark of a plot picked), the fade would show nothing, so those hits take the
// SVG selected recipe instead.
export function fadesSome(hits: Hit[], scope: HitLayer[]): boolean {
    const kept = new Map<HitLayer, Set<number>>()
    for (const h of hits) {
        let s = kept.get(h.layer)
        if (!s) kept.set(h.layer, (s = new Set()))
        s.add(h.index)
    }
    for (const layer of scope) {
        const ks = kept.get(layer)
        for (const k of paintOrder(layer)) if (!ks?.has(k) && !isGapElement(layer, k)) return true
    }
    return false
}

export interface FadeHost {
    root_: HTMLElement // the shadow-root container the axis canvases go in, below every svg
    style_: HTMLElement // the shadow host, for the chrome grey the stylesheet resolves
    manifest_: () => Manifest
    frame_: (axis: string) => AxisFrame | null // the live photograph's move of an axis
    cssScale_: () => number // image px per CSS px on screen
}

export interface Fade {
    // The selection's closed-mark picks, and the layers they fade.
    select_(hits: Hit[], scope: HitLayer[]): void
    // A legend entry's hover preview (`key` names the entry), drawn with the selection. The
    // same key again changes nothing; null ends it.
    preview_(key: string | null, hits: Hit[] | null, scope: HitLayer[]): void
    // Hovering or focusing a faded mark shows it at full strength while it is hovered.
    lift_(hit: Hit | null): void
    // Moves and clips an axis's canvases with a live photograph.
    place_(axis: string, f: AxisFrame | null): void
    // Redraws what is shown (the display size changed, so a 1px outline is a different width).
    refresh_(): void
}

// An axis's wrapper, with the keys (`layer:index`) of the marks it keeps (the selection and
// any legend preview), of the selection's picks alone, and of the picks it outlines. `draws`
// counts the redraws.
export type FadeEl = HTMLDivElement & { masqueFade?: { kept: string[]; picked: string[]; lone: string[]; draws: number } }

interface AxisHome { wrap: HTMLDivElement; dim: HTMLCanvasElement; top: HTMLCanvasElement }
type Box = [number, number, number, number] // x0, y0, x1, y1

export function createFade(host: FadeHost): Fade {
    const homes = new Map<string, AxisHome>()
    let selKept = new Map<HitLayer, Set<number>>()
    let selScope: HitLayer[] = []
    let preKept: Map<HitLayer, Set<number>> | null = null
    let preScope: HitLayer[] = []
    let preKey: string | null = null
    // What is drawn now, by axis: each faded layer with the elements it keeps.
    let drawn = new Map<string, Map<HitLayer, Set<number>>>()
    let lifted: { layer: HitLayer; index: number } | null = null
    let lastScale = 0

    const keptBy = (hits: Hit[]): Map<HitLayer, Set<number>> => {
        const out = new Map<HitLayer, Set<number>>()
        for (const h of hits) {
            if (!fadeLook(h)) continue
            let s = out.get(h.layer)
            if (!s) out.set(h.layer, (s = new Set()))
            s.add(h.index)
        }
        return out
    }

    const home = (axis: string): AxisHome => {
        let h = homes.get(axis)
        if (h) return h
        const wrap = document.createElement("div")
        wrap.className = "masque-fade"
        wrap.dataset.axis = axis
        const dim = document.createElement("canvas")
        dim.className = "masque-dim"
        const top = document.createElement("canvas")
        top.className = "masque-top"
        wrap.append(dim, top)
        host.root_.appendChild(wrap)
        h = { wrap, dim, top }
        homes.set(axis, h)
        place(axis, host.frame_(axis))
        return h
    }

    function place(axis: string, f: AxisFrame | null): void {
        const h = homes.get(axis)
        if (!h) return
        const m = host.manifest_()
        if (!f) {
            h.wrap.style.clipPath = ""
            for (const c of [h.dim, h.top]) c.style.transform = ""
            return
        }
        const [x, y, w, hh] = f.clip
        const pct = (v: number, of: number) => `${(v / of) * 100}%`
        h.wrap.style.clipPath = `inset(${pct(y, m.height)} ${pct(m.width - x - w, m.width)} ${pct(m.height - y - hh, m.height)} ${pct(x, m.width)})`
        const t = `translate(${pct(f.tx, m.width)}, ${pct(f.ty, m.height)}) scale(${f.sx}, ${f.sy})`
        for (const c of [h.dim, h.top]) c.style.transform = t
    }

    // Element k's bounding box, or null when it is not drawn.
    const boxOf = (layer: HitLayer, k: number): Box | null => {
        if (isGapElement(layer, k)) return null
        const g = layer.geometry as number[]
        if (layer.kind === "circles") {
            const x = g[3 * k], y = g[3 * k + 1], r = g[3 * k + 2]
            return [x - r, y - r, x + r, y + r]
        }
        if (layer.kind === "rects") {
            const x = g[4 * k], y = g[4 * k + 1], w = Math.abs(g[4 * k + 2]) / 2, h = Math.abs(g[4 * k + 3]) / 2
            return [x - w, y - h, x + w, y + h]
        }
        const ring = polygonRings((layer.geometry as (number[] | number[][])[])[k])[0] ?? []
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
        for (let i = 0; i + 1 < ring.length; i += 2) {
            const x = ring[i], y = ring[i + 1]
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
        }
        return x0 <= x1 ? [x0, y0, x1, y1] : null
    }

    // Adds element k's outline, grown by `pad` image px, to the current path. A polygon is filled
    // and stroked on its own (`each`), since its holes need even-odd and a shared path would
    // cancel where two polygons overlap.
    const addShape = (c: CanvasRenderingContext2D, layer: HitLayer, k: number, pad: number): boolean => {
        const g = layer.geometry as number[]
        if (layer.kind === "circles") {
            const x = g[3 * k], y = g[3 * k + 1], r = g[3 * k + 2] + pad
            c.moveTo(x + r, y)
            c.arc(x, y, r, 0, 2 * Math.PI)
            return true
        }
        if (layer.kind === "rects") {
            const w = Math.abs(g[4 * k + 2]), h = Math.abs(g[4 * k + 3])
            c.rect(g[4 * k] - w / 2 - pad, g[4 * k + 1] - h / 2 - pad, w + 2 * pad, h + 2 * pad)
            return true
        }
        return false
    }

    const fillPoly = (c: CanvasRenderingContext2D, layer: HitLayer, k: number, pad: number): void => {
        c.beginPath()
        for (const ring of polygonRings((layer.geometry as (number[] | number[][])[])[k])) {
            for (let i = 0; i + 1 < ring.length; i += 2) {
                if (i === 0) c.moveTo(ring[i], ring[i + 1])
                else c.lineTo(ring[i], ring[i + 1])
            }
            c.closePath()
        }
        c.fill("evenodd")
        if (pad > 0) {
            c.lineWidth = 2 * pad
            c.lineJoin = "round"
            c.stroke()
        }
    }

    // Fills elements `ks` of a layer, grown by `pad`, in the current fill style and composite.
    const fillShapes = (c: CanvasRenderingContext2D, layer: HitLayer, ks: Iterable<number>, pad: number): void => {
        if (layer.kind === "polygons") {
            c.strokeStyle = c.fillStyle
            for (const k of ks) if (!isGapElement(layer, k)) fillPoly(c, layer, k, pad)
            return
        }
        c.beginPath()
        for (const k of ks) if (!isGapElement(layer, k)) addShape(c, layer, k, pad)
        c.fill()
    }

    const colourCache = new Map<string, [number, number, number] | null>()
    // A mark's colour as rgb, for its outline's shade. Anything parseRGB can't read is resolved
    // through a canvas, which normalises any CSS colour.
    const rgbOf = (c: CanvasRenderingContext2D, css: string): [number, number, number] | null => {
        if (colourCache.has(css)) return colourCache.get(css) ?? null
        let rgb = parseRGB(css)
        if (!rgb) {
            const was = c.fillStyle
            c.fillStyle = "#000000"
            c.fillStyle = css
            rgb = parseRGB(String(c.fillStyle))
            c.fillStyle = was
        }
        colourCache.set(css, rgb)
        return rgb
    }

    const colourOf = (layer: HitLayer, k: number): string | null => {
        const c = layer.colors
        if (!c) return null
        if (typeof c === "string") return c
        return c.palette[c.index[k]] ?? null
    }

    // The picks an unpicked mark drawn after them covers: only those are repainted, so a pick
    // nothing covers keeps the image's pixels (its stroke, its marker shape).
    const coveredPicks = (layer: HitLayer, kept: Set<number>): number[] => {
        if (layer.kind !== "circles" || !layer.colors) return []
        const g = layer.geometry as number[]
        const order = paintOrder(layer)
        const z = new Map<number, number>()
        order.forEach((k, i) => z.set(k, i))
        let rmax = 0
        for (const k of order) rmax = Math.max(rmax, g[3 * k + 2] || 0)
        const cell = Math.max(1, 2 * rmax)
        const grid = new Map<string, number[]>()
        for (const k of order) {
            if (kept.has(k) || isGapElement(layer, k)) continue
            const key = `${Math.floor(g[3 * k] / cell)},${Math.floor(g[3 * k + 1] / cell)}`
            const list = grid.get(key)
            if (list) list.push(k)
            else grid.set(key, [k])
        }
        const out: number[] = []
        for (const k of kept) {
            const zk = z.get(k)
            if (zk === undefined || isGapElement(layer, k)) continue
            const x = g[3 * k], y = g[3 * k + 1], r = g[3 * k + 2]
            const cx = Math.floor(x / cell), cy = Math.floor(y / cell)
            let hit = false
            for (let a = -1; a <= 1 && !hit; a++) {
                for (let b = -1; b <= 1 && !hit; b++) {
                    for (const j of grid.get(`${cx + a},${cy + b}`) ?? []) {
                        if ((z.get(j) ?? -1) > zk && Math.hypot(g[3 * j] - x, g[3 * j + 1] - y) < r + g[3 * j + 2] - PAD_KEEP) { hit = true; break }
                    }
                }
            }
            if (hit) out.push(k)
        }
        return out
    }

    // The picks on an axis with no other pick within LONE_GAP of their own radii.
    const lonePicks = (kept: Map<HitLayer, Set<number>>): Array<{ layer: HitLayer; k: number; box: Box }> => {
        const all: Array<{ layer: HitLayer; k: number; box: Box; rho: number }> = []
        let span = 0
        for (const [layer, ks] of kept) {
            for (const k of ks) {
                const box = boxOf(layer, k)
                if (!box) continue
                const w = box[2] - box[0], h = box[3] - box[1]
                const rho = Math.min(w, h) / 2
                all.push({ layer, k, box, rho })
                span = Math.max(span, Math.max(w, h) + LONE_GAP * rho)
            }
        }
        const cell = Math.max(1, span)
        const grid = new Map<string, number[]>()
        const cellOf = (b: Box) => [Math.floor((b[0] + b[2]) / 2 / cell), Math.floor((b[1] + b[3]) / 2 / cell)]
        all.forEach((p, i) => {
            const [cx, cy] = cellOf(p.box)
            const key = `${cx},${cy}`
            const list = grid.get(key)
            if (list) list.push(i)
            else grid.set(key, [i])
        })
        const out: Array<{ layer: HitLayer; k: number; box: Box }> = []
        all.forEach((p, i) => {
            const [cx, cy] = cellOf(p.box)
            for (let a = -1; a <= 1; a++) {
                for (let b = -1; b <= 1; b++) {
                    for (const j of grid.get(`${cx + a},${cy + b}`) ?? []) {
                        if (j === i) continue
                        const q = all[j].box
                        const dx = Math.max(0, q[0] - p.box[2], p.box[0] - q[2])
                        const dy = Math.max(0, q[1] - p.box[3], p.box[1] - q[3])
                        if (Math.hypot(dx, dy) < LONE_GAP * p.rho) return
                    }
                }
            }
            out.push(p)
        })
        return out
    }

    const strokeShape = (c: CanvasRenderingContext2D, layer: HitLayer, k: number, box: Box, lw: number): void => {
        c.beginPath()
        if (layer.kind === "circles") {
            const g = layer.geometry as number[]
            const x = g[3 * k], y = g[3 * k + 1], r = g[3 * k + 2] + lw / 2
            c.arc(x, y, r, 0, 2 * Math.PI)
        } else if (layer.kind === "rects") {
            c.rect(box[0] - lw / 2, box[1] - lw / 2, box[2] - box[0] + lw, box[3] - box[1] + lw)
        } else {
            for (const ring of polygonRings((layer.geometry as (number[] | number[][])[])[k])) {
                for (let i = 0; i + 1 < ring.length; i += 2) {
                    if (i === 0) c.moveTo(ring[i], ring[i + 1])
                    else c.lineTo(ring[i], ring[i + 1])
                }
                c.closePath()
            }
        }
        c.stroke()
    }

    const sizeCanvas = (cv: HTMLCanvasElement, m: Manifest): void => {
        if (cv.width !== m.width) cv.width = m.width
        if (cv.height !== m.height) cv.height = m.height
    }

    const drawAxis = (axis: string, kept: Map<HitLayer, Set<number>>): void => {
        const h = home(axis)
        const m = host.manifest_()
        h.wrap.style.display = ""
        sizeCanvas(h.dim, m)
        sizeCanvas(h.top, m)
        const bg = plotFill(m, axis)
        let faded = 0, nkept = 0, raised = 0
        for (const [layer, ks] of kept) {
            nkept += ks.size
            for (const k of paintOrder(layer)) if (!ks.has(k) && !isGapElement(layer, k)) faded++
        }
        const lone = lonePicks(kept)
        const dc = h.dim.getContext("2d")
        const tc = h.top.getContext("2d")
        if (dc && tc) {
            dc.clearRect(0, 0, h.dim.width, h.dim.height)
            dc.globalCompositeOperation = "source-over"
            dc.fillStyle = bg
            for (const [layer, ks] of kept) fillShapes(dc, layer, paintOrder(layer).filter((k) => !ks.has(k)), PAD_DIM)
            dc.globalCompositeOperation = "destination-out"
            dc.fillStyle = "#000000"
            for (const [layer, ks] of kept) fillShapes(dc, layer, ks, PAD_KEEP)
            dc.globalCompositeOperation = "source-over"

            tc.clearRect(0, 0, h.top.width, h.top.height)
            for (const [layer, ks] of kept) {
                const g = layer.geometry as number[]
                for (const k of coveredPicks(layer, ks)) {
                    const css = colourOf(layer, k)
                    if (!css) continue
                    tc.fillStyle = css
                    tc.beginPath()
                    tc.arc(g[3 * k], g[3 * k + 1], g[3 * k + 2], 0, 2 * Math.PI)
                    tc.fill()
                    raised++
                }
            }
            const light = isLightBackground(bg)
            const chrome = getComputedStyle(host.style_).getPropertyValue("--masque-chrome").trim() || (light ? "#7a7a7a" : "#c8c8c8")
            const toward = light ? 0 : 255
            const lw = host.cssScale_()
            lastScale = lw
            tc.lineWidth = lw
            for (const p of lone) {
                const css = colourOf(p.layer, p.k)
                const rgb = css ? rgbOf(tc, css) : null
                tc.strokeStyle = rgb
                    ? `rgb(${rgb.map((v) => Math.round(v + (toward - v) * OUTLINE_MIX)).join(",")})`
                    : p.layer.style?.stroke ?? chrome
                strokeShape(tc, p.layer, p.k, p.box, lw)
            }
        } else {
            for (const [layer, ks] of kept) raised += coveredPicks(layer, ks).length
        }
        // What the canvases hold, for tests and the e2e drivers (the pixels are not inspectable
        // in every environment): the counts as attributes, the keys as a property.
        ;(h.wrap as FadeEl).masqueFade = {
            kept: [...kept].flatMap(([layer, ks]) => [...ks].map((k) => `${layer.id}:${k}`)),
            picked: [...kept.keys()].flatMap((layer) => [...(selKept.get(layer) ?? [])].map((k) => `${layer.id}:${k}`)),
            lone: lone.map((p) => `${p.layer.id}:${p.k}`),
            draws: ((h.wrap as FadeEl).masqueFade?.draws ?? 0) + 1,
        }
        h.wrap.dataset.layers = [...kept.keys()].map((l) => l.id).join(",")
        h.wrap.dataset.fill = bg
        h.wrap.dataset.faded = String(faded)
        h.wrap.dataset.kept = String(nkept)
        h.wrap.dataset.lone = String(lone.length)
        h.wrap.dataset.raised = String(raised)
        delete h.wrap.dataset.lift
    }

    const clearAxis = (axis: string): void => {
        const h = homes.get(axis)
        if (!h) return
        h.wrap.style.display = "none"
        for (const cv of [h.dim, h.top]) cv.getContext("2d")?.clearRect(0, 0, cv.width, cv.height)
        for (const k of ["layers", "fill", "faded", "kept", "lone", "raised", "lift"]) delete h.wrap.dataset[k]
        ;(h.wrap as FadeEl).masqueFade = { kept: [], picked: [], lone: [], draws: (h.wrap as FadeEl).masqueFade?.draws ?? 0 }
    }

    const redraw = (): void => {
        const layers = new Set<HitLayer>([...selScope, ...(preKept ? preScope : [])])
        const next = new Map<string, Map<HitLayer, Set<number>>>()
        for (const layer of layers) {
            const ks = new Set<number>([...(selKept.get(layer) ?? []), ...(preKept?.get(layer) ?? [])])
            let byAxis = next.get(layer.axis)
            if (!byAxis) next.set(layer.axis, (byAxis = new Map()))
            byAxis.set(layer, ks)
        }
        for (const axis of drawn.keys()) if (!next.has(axis)) clearAxis(axis)
        for (const [axis, kept] of next) drawAxis(axis, kept)
        drawn = next
        const was = lifted
        lifted = null
        if (was) lift(was)
    }

    // The elements the axis keeps whose box meets `box`, punched back out after a lifted mark's
    // cover is put back.
    const repunch = (c: CanvasRenderingContext2D, axis: string, box: Box): void => {
        c.globalCompositeOperation = "destination-out"
        c.fillStyle = "#000000"
        for (const [layer, ks] of drawn.get(axis) ?? []) {
            const near: number[] = []
            for (const k of ks) {
                const b = boxOf(layer, k)
                if (b && b[0] <= box[2] && b[2] >= box[0] && b[1] <= box[3] && b[3] >= box[1]) near.push(k)
            }
            if (near.length) fillShapes(c, layer, near, PAD_KEEP)
        }
        c.globalCompositeOperation = "source-over"
    }

    function lift(next: { layer: HitLayer; index: number } | null): void {
        if (lifted && next && lifted.layer === next.layer && lifted.index === next.index) return
        if (lifted) {
            const { layer, index } = lifted
            const h = homes.get(layer.axis)
            const c = h?.dim.getContext("2d")
            const box = boxOf(layer, index)
            if (h && c && box) {
                c.globalCompositeOperation = "source-over"
                c.fillStyle = plotFill(host.manifest_(), layer.axis)
                fillShapes(c, layer, [index], PAD_DIM)
                repunch(c, layer.axis, [box[0] - PAD_DIM, box[1] - PAD_DIM, box[2] + PAD_DIM, box[3] + PAD_DIM])
            }
            if (h) delete h.wrap.dataset.lift
            lifted = null
        }
        if (!next) return
        const ks = drawn.get(next.layer.axis)?.get(next.layer)
        if (!ks || ks.has(next.index) || isGapElement(next.layer, next.index)) return
        const h = homes.get(next.layer.axis)
        if (!h) return
        const c = h.dim.getContext("2d")
        if (c) {
            c.globalCompositeOperation = "destination-out"
            c.fillStyle = "#000000"
            fillShapes(c, next.layer, [next.index], PAD_DIM)
            c.globalCompositeOperation = "source-over"
        }
        h.wrap.dataset.lift = `${next.layer.id}:${next.index}`
        lifted = next
    }

    return {
        select_(hits, scope) {
            selKept = keptBy(hits)
            selScope = scope
            redraw()
        },
        preview_(key, hits, scope) {
            if (key === preKey && (key === null || preKept)) return
            preKey = hits ? key : null
            preKept = hits ? keptBy(hits) : null
            preScope = hits ? scope : []
            redraw()
        },
        lift_(hit) {
            lift(hit && fadeLook(hit) ? { layer: hit.layer, index: hit.index } : null)
        },
        place_: place,
        refresh_() {
            if (!drawn.size || host.cssScale_() === lastScale) return
            redraw()
        },
    }
}
