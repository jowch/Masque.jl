import { isLightBackground, layerColor, parseRGB } from "./color"
import { layoutSpaceLayer, polygonRings } from "./geometry"
import type { AxisFrame } from "./geometry"
import { isGapElement, layerNElements } from "./selection"
import { legendEntryHeld } from "./linked"
import type { FieldSelection } from "./state"
import type { Hit, HitLayer, Manifest } from "./types"

// The selected look for closed marks (circles, rects, polygons), drawn on two canvases per axis
// instead of SVG nodes, so its cost follows the plot's marks, not its picks (#394). Once a plot
// holds picks, its unpicked marks fade toward the plot area's colour: the dim canvas covers them
// in that colour and the stylesheet sets how much shows through (overlaystyle `unpicked_opacity`).
// The picks keep the image's own pixels. On the top canvas, a pick an unpicked mark drawn after
// it covers is repainted in its own colour, and a pick with no other pick near it gets a 1px
// outline in a shade of its own colour, so a few picks in a dense plot can still be found while
// a crowd of picks reads by its colour alone. An explicit overlay colour (the layer's hoverstyle
// stroke, the figure's overlaystyle `color`) outlines instead, and a mark whose colour is unknown
// is outlined in the chrome grey.
//
// Lines fade the same way, since a line is a whole series: a picked line (a legend's pick, or a
// line with no samples to pick) keeps its own colour while the other lines fade, and hovering a
// line previews that (`hover_`). A line has no lone-pick outline. Picked points on a line, grid
// cells and regions keep their SVG recipes (highlight.ts).

export const FADE_KINDS = new Set(["circles", "rects", "polygons", "lines"])

// A line's drawn width, image px: the manifest's, else Makie's default line width.
export const lineWidthOf = (layer: HitLayer, scaling = 1): number => layer.linewidth ?? 1.5 * scaling

// Image px a mark's cover reaches past its edge (antialiasing, a thin outline), and a pick's
// punch-out of the cover, which stays small so a neighbour's covered edge stays faded. How much
// two circles must overlap for one to cover the other is PAD_KEEP too.
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
    return !!g && (g[0] === "circle" || g[0] === "rect" || g[0] === "poly" || (g[0] === "path" && hit.sample_ === undefined))
}

// Whether keeping `hits` fades anything in `scope`: some drawn element of it is not among them.
// A line picked or hovered alone on its axis has nothing to fade, so it keeps its halo.
export function fadesOthers(scope: HitLayer[], hits: Hit[]): boolean {
    const kept = new Map<HitLayer, Set<number>>()
    for (const h of hits) {
        let s = kept.get(h.layer)
        if (!s) kept.set(h.layer, (s = new Set()))
        s.add(h.index)
    }
    return scope.some((l) => drawnOrder(l).some((k) => !kept.get(l)?.has(k)))
}

// The line layers drawn on `axis`, which hovering one of them fades.
export function lineScope(manifest: Manifest, axis: string): HitLayer[] {
    return manifest.layers.filter((l) => l.kind === "lines" && l.axis === axis && !l.hidden && fadeLayer(l))
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
        // A linked group's picks fade every plot of the group, also one that holds none of them
        // (#346), as a legend's pick fades its other series. A plot `onchange` hid stays out.
        const group = s.rows_ ? manifest.groups?.find((g) => g.id === field) : undefined
        for (const id of group?.members ?? []) {
            const l = manifest.layers.find((x) => x.id === id)
            if (fadeLayer(l) && !l.hidden) out.add(l)
        }
        for (const h of s.hits_) if (fadeLook(h)) out.add(h.layer)
    }
    // A legend outside the bind value holds no picks of its own, so its series fade together
    // while its plots hold every mark of one of its entries, as a bound legend's pick fades them.
    for (const legend of manifest.layers) {
        if (!legend.links?.length || !manifest.fields || manifest.fields.includes(legend.id)) continue
        if (legend.links.some((_, k) => legendEntryHeld(manifest, sel, legend, k))) for (const l of legendLayers(manifest, legend)) out.add(l)
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

// A layer's drawn elements bottom first, gaps left out, kept per layer: a layer's geometry never
// changes (a new figure is a new manifest).
const drawnCache = new WeakMap<HitLayer, number[]>()
function drawnOrder(layer: HitLayer): number[] {
    let ks = drawnCache.get(layer)
    if (!ks) drawnCache.set(layer, (ks = paintOrder(layer).filter((k) => !isGapElement(layer, k))))
    return ks
}

// The colour faded marks go toward: the axis's empty plot area, which is the figure's
// background unless the axis has its own.
const plotFill = (m: Manifest, axis: string): string => m.transforms[axis]?.fill ?? m.background ?? "#ffffff"

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
    // A hovered line's preview, the same way: the axis's other lines fade.
    hover_(key: string | null, hits: Hit[] | null, scope: HitLayer[]): void
    // Hovering or focusing a faded mark shows it at full strength while it is hovered, with
    // the partners a linked mark's hover outlines.
    lift_(hit: Hit | null, partners?: Hit[]): void
    // Moves and clips an axis's canvases with a live photograph.
    place_(axis: string, f: AxisFrame | null): void
    // Redraws what is shown (the display size changed, so a 1px outline is a different width).
    refresh_(): void
}

// An axis's wrapper, with the keys (`layer:index`) of the marks it keeps (the selection and
// any legend preview), of the selection's picks alone, and of the picks it outlines, with each
// outline's colour where the canvas draws. `draws` counts the redraws.
export type FadeEl = HTMLDivElement & { masqueFade?: { kept: string[]; picked: string[]; pickedAt?: number[][]; lone: string[]; outlines?: string[]; draws: number } }

interface AxisHome { wrap: HTMLDivElement; dim: HTMLCanvasElement; top: HTMLCanvasElement }
type Box = [number, number, number, number] // x0, y0, x1, y1
// The image-px rectangle an axis's canvases cover, x, y, w, h: its viewport, whole pixels.
type Extent = [number, number, number, number]

// An axis's canvases cover only its viewport, since the backend draws nothing of its plots
// outside it; a figure of many axes then holds no full-figure canvas per axis. An axis with no
// transform covers the whole image.
function extentOf(m: Manifest, axis: string): Extent {
    const v = m.transforms[axis]?.viewport
    if (!v) return [0, 0, m.width, m.height]
    const x0 = Math.max(0, Math.floor(v[0])), y0 = Math.max(0, Math.floor(v[1]))
    const x1 = Math.min(m.width, Math.ceil(v[0] + v[2])), y1 = Math.min(m.height, Math.ceil(v[1] + v[3]))
    return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)]
}

interface Slot { key: string | null; kept: Map<HitLayer, Set<number>> | null; scope: HitLayer[] }

export function createFade(host: FadeHost): Fade {
    const homes = new Map<string, AxisHome>()
    let selKept = new Map<HitLayer, Set<number>>()
    let selScope: HitLayer[] = []
    // The two previews: a legend entry's hover, and a hovered line.
    const slots: Record<"legend" | "line", Slot> = { legend: { key: null, kept: null, scope: [] }, line: { key: null, kept: null, scope: [] } }
    // What is drawn now, by axis: each faded layer with the elements it keeps.
    let drawn = new Map<string, Map<HitLayer, Set<number>>>()
    let lifted: { layer: HitLayer; index: number }[] = []
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
        const pct = (v: number, of: number) => `${(v / of) * 100}%`
        // At rest the canvases are clipped to the axis, as the backend clips its plot: a mark
        // past the limits keeps its projected position in the manifest but is never drawn.
        const clip = f ? f.clip : m.transforms[axis]?.viewport
        if (clip) {
            const [x, y, w, hh] = clip
            h.wrap.style.clipPath = `inset(${pct(y, m.height)} ${pct(m.width - x - w, m.width)} ${pct(m.height - y - hh, m.height)} ${pct(x, m.width)})`
        } else h.wrap.style.clipPath = ""
        // The photograph maps image point p to s*p + t. A canvas whose corner sits at v moves
        // by s*v + t - v and scales by s about that corner (transform-origin 0 0).
        const [ex, ey, ew, eh] = extentOf(m, axis)
        const t = f ? `translate(${pct(f.sx * ex + f.tx - ex, ew)}, ${pct(f.sy * ey + f.ty - ey, eh)}) scale(${f.sx}, ${f.sy})` : ""
        for (const c of [h.dim, h.top]) {
            c.style.left = pct(ex, m.width)
            c.style.top = pct(ey, m.height)
            c.style.width = pct(ew, m.width)
            c.style.height = pct(eh, m.height)
            c.style.transform = t
        }
    }

    const widthOf = (layer: HitLayer): number => lineWidthOf(layer, host.manifest_().scaling || 1)

    // Element k's bounding box, or null when it is not drawn.
    const boxOf = (layer: HitLayer, k: number): Box | null => {
        if (isGapElement(layer, k)) return null
        const g = layer.geometry as number[]
        if (layer.kind === "lines") {
            const v = (layer.geometry as number[][])[k] ?? [], w = widthOf(layer) / 2
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
            for (let i = 0; i + 1 < v.length; i += 2) {
                if (!Number.isFinite(v[i]) || !Number.isFinite(v[i + 1])) continue
                x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1])
            }
            return x0 <= x1 ? [x0 - w, y0 - w, x1 + w, y1 + w] : null
        }
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

    // Lines `ks` stroked at their drawn width grown by `pad` each side, in the fill style. A
    // non-finite vertex starts a new subpath (a NaN gap).
    const strokeLines = (c: CanvasRenderingContext2D, layer: HitLayer, ks: Iterable<number>, pad: number): void => {
        c.strokeStyle = c.fillStyle
        c.lineWidth = widthOf(layer) + 2 * pad
        c.lineCap = "round"
        c.lineJoin = "round"
        c.beginPath()
        for (const k of ks) {
            const v = (layer.geometry as number[][])[k] ?? []
            let open = false
            for (let i = 0; i + 1 < v.length; i += 2) {
                if (!Number.isFinite(v[i]) || !Number.isFinite(v[i + 1])) { open = false; continue }
                if (open) c.lineTo(v[i], v[i + 1])
                else { c.moveTo(v[i], v[i + 1]); open = true }
            }
        }
        c.stroke()
    }

    // Fills elements `ks` of a layer, grown by `pad`, in the current fill style and composite.
    const fillShapes = (c: CanvasRenderingContext2D, layer: HitLayer, ks: Iterable<number>, pad: number): void => {
        if (layer.kind === "lines") { strokeLines(c, layer, ks, pad); return }
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

    // A circles layer's drawn marks in a grid of cells two radii wide, with each mark's place in
    // the paint order, built once per layer for coveredPicks.
    const gridCache = new WeakMap<HitLayer, { cell: number; z: Map<number, number>; grid: Map<number, number[]> }>()
    const cellKey = (cx: number, cy: number): number => cx * 1048576 + cy
    const circleGrid = (layer: HitLayer) => {
        let c = gridCache.get(layer)
        if (c) return c
        const g = layer.geometry as number[]
        const order = drawnOrder(layer)
        const z = new Map<number, number>()
        order.forEach((k, i) => z.set(k, i))
        let rmax = 0
        for (const k of order) rmax = Math.max(rmax, g[3 * k + 2] || 0)
        const cell = Math.max(1, 2 * rmax)
        const grid = new Map<number, number[]>()
        for (const k of order) {
            const key = cellKey(Math.floor(g[3 * k] / cell), Math.floor(g[3 * k + 1] / cell))
            const list = grid.get(key)
            if (list) list.push(k)
            else grid.set(key, [k])
        }
        gridCache.set(layer, (c = { cell, z, grid }))
        return c
    }

    // The picks an unpicked mark drawn after them covers: only those are repainted, so a pick
    // nothing covers keeps the image's pixels (its stroke, its marker shape).
    const coveredPicks = (layer: HitLayer, kept: Set<number>): number[] => {
        if (layer.kind !== "circles" || !layer.colors) return []
        const g = layer.geometry as number[]
        const { cell, z, grid } = circleGrid(layer)
        const out: number[] = []
        for (const k of kept) {
            const zk = z.get(k)
            if (zk === undefined) continue
            const x = g[3 * k], y = g[3 * k + 1], r = g[3 * k + 2]
            const cx = Math.floor(x / cell), cy = Math.floor(y / cell)
            let hit = false
            for (let a = -1; a <= 1 && !hit; a++) {
                for (let b = -1; b <= 1 && !hit; b++) {
                    for (const j of grid.get(cellKey(cx + a, cy + b)) ?? []) {
                        if (kept.has(j) || (z.get(j) ?? -1) <= zk) continue
                        if (Math.hypot(g[3 * j] - x, g[3 * j + 1] - y) < r + g[3 * j + 2] - PAD_KEEP) { hit = true; break }
                    }
                }
            }
            if (hit) out.push(k)
        }
        return out
    }

    // The selection's picks on an axis with no other pick within LONE_GAP of their own radii. A
    // preview's marks are not picks, and a line has no outline.
    const lonePicks = (kept: Map<HitLayer, Set<number>>): Array<{ layer: HitLayer; k: number; box: Box }> => {
        const all: Array<{ layer: HitLayer; k: number; box: Box; rho: number }> = []
        let span = 0
        for (const layer of kept.keys()) {
            if (layer.kind === "lines") continue
            for (const k of selKept.get(layer) ?? []) {
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

    // Sizes a canvas to an extent and returns its context, drawing in image px.
    const sized = (cv: HTMLCanvasElement, e: Extent): CanvasRenderingContext2D | null => {
        if (cv.width !== e[2]) cv.width = e[2]
        if (cv.height !== e[3]) cv.height = e[3]
        const c = cv.getContext("2d")
        c?.setTransform(1, 0, 0, 1, -e[0], -e[1])
        return c
    }

    // Each axis's cover of every drawn mark of a set of layers in the plot area's colour, drawn
    // once and copied onto the dim canvas on each redraw, so a click costs the picks it punches
    // out, not the plot's marks. The last three sets are kept per axis (the selection, and it with
    // a legend's or a line's preview); a new manifest starts over.
    // Keyed by layer object, not id: a frame brings new layers under the same ids, and a cover
    // drawn from the old geometry must not be found for the new.
    const serials = new WeakMap<HitLayer, number>()
    const serial = (l: HitLayer): number => {
        let n = serials.get(l)
        if (n === undefined) serials.set(l, (n = nextSerial++))
        return n
    }
    let nextSerial = 0
    let coverManifest: Manifest | null = null
    const covers = new Map<string, Array<{ key: string; cv: HTMLCanvasElement }>>()
    const coverOf = (axis: string, layers: HitLayer[], m: Manifest, bg: string): HTMLCanvasElement | null => {
        if (coverManifest !== m) {
            covers.clear()
            coverManifest = m
        }
        const e = extentOf(m, axis)
        const key = `${e.join(",")} ${bg} ${layers.map(serial).join(",")}`
        const list = covers.get(axis) ?? []
        const hit = list.find((e) => e.key === key)
        if (hit) return hit.cv
        const cv = document.createElement("canvas")
        const c = sized(cv, e)
        if (!c) return null
        c.fillStyle = bg
        for (const layer of layers) fillShapes(c, layer, drawnOrder(layer), PAD_DIM)
        covers.set(axis, [{ key, cv }, ...list].slice(0, 3))
        return cv
    }

    const drawAxis = (axis: string, kept: Map<HitLayer, Set<number>>): void => {
        const h = home(axis)
        const m = host.manifest_()
        h.wrap.style.display = ""
        place(axis, host.frame_(axis))
        const e = extentOf(m, axis)
        const bg = plotFill(m, axis)
        let faded = 0, nkept = 0, raised = 0
        const outlines: string[] = []
        for (const [layer, ks] of kept) {
            nkept += ks.size
            let drawnKept = 0
            for (const k of ks) if (!isGapElement(layer, k)) drawnKept++
            faded += drawnOrder(layer).length - drawnKept
        }
        const lone = lonePicks(kept)
        const dc = sized(h.dim, e)
        const tc = sized(h.top, e)
        if (dc && tc) {
            dc.clearRect(e[0], e[1], e[2], e[3])
            dc.globalCompositeOperation = "source-over"
            const cover = coverOf(axis, [...kept.keys()], m, bg)
            if (cover) dc.drawImage(cover, e[0], e[1])
            dc.globalCompositeOperation = "destination-out"
            dc.fillStyle = "#000000"
            for (const [layer, ks] of kept) fillShapes(dc, layer, ks, PAD_KEEP)
            dc.globalCompositeOperation = "source-over"

            tc.clearRect(e[0], e[1], e[2], e[3])
            for (const [layer, ks] of kept) {
                const g = layer.geometry as number[]
                for (const k of coveredPicks(layer, ks)) {
                    const css = layerColor(layer, k)
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
            // A colour the figure or the layer sets for the overlay (overlaystyle `color`, a
            // hoverstyle stroke) wins over the mark's own shade.
            const figure = m.overlayStyle?.["--masque-chrome"]
            for (const p of lone) {
                const css = layerColor(p.layer, p.k)
                const rgb = css ? rgbOf(tc, css) : null
                const ink = p.layer.style?.stroke ?? figure
                    ?? (rgb ? `rgb(${rgb.map((v) => Math.round(v + (toward - v) * OUTLINE_MIX)).join(",")})` : chrome)
                tc.strokeStyle = ink
                outlines.push(ink)
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
            // Each pick's centre in image px, before any photograph moves the canvases.
            pickedAt: [...kept.keys()].flatMap((layer) => [...(selKept.get(layer) ?? [])].flatMap((k) => {
                const b = boxOf(layer, k)
                return b ? [[(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]] : []
            })),
            lone: lone.map((p) => `${p.layer.id}:${p.k}`),
            outlines,
            draws: ((h.wrap as FadeEl).masqueFade?.draws ?? 0) + 1,
        }
        h.wrap.dataset.layers = [...kept.keys()].map((l) => l.id).join(",")
        h.wrap.dataset.fill = bg
        h.wrap.dataset.faded = String(faded)
        h.wrap.dataset.kept = String(nkept)
        h.wrap.dataset.lone = String(lone.length)
        h.wrap.dataset.raised = String(raised)
        delete h.wrap.dataset.lift
        // A preview alone on its axis leaves more showing than a pick (overlaystyle `preview_opacity`).
        h.wrap.classList.toggle("masque-preview", !selScope.some((l) => l.axis === axis))
    }

    const clearAxis = (axis: string): void => {
        const h = homes.get(axis)
        if (!h) return
        h.wrap.style.display = "none"
        // Emptied, not cleared: a canvas holds its memory until it is sized down.
        for (const cv of [h.dim, h.top]) cv.width = cv.height = 0
        for (const k of ["layers", "fill", "faded", "kept", "lone", "raised", "lift"]) delete h.wrap.dataset[k]
        ;(h.wrap as FadeEl).masqueFade = { kept: [], picked: [], lone: [], draws: (h.wrap as FadeEl).masqueFade?.draws ?? 0 }
    }

    const redraw = (): void => {
        const live = Object.values(slots).filter((s) => s.kept)
        const layers = new Set<HitLayer>([...selScope, ...live.flatMap((s) => s.scope)])
        const next = new Map<string, Map<HitLayer, Set<number>>>()
        for (const layer of layers) {
            const ks = new Set<number>([...(selKept.get(layer) ?? []), ...live.flatMap((s) => [...(s.kept?.get(layer) ?? [])])])
            let byAxis = next.get(layer.axis)
            if (!byAxis) next.set(layer.axis, (byAxis = new Map()))
            byAxis.set(layer, ks)
        }
        for (const axis of drawn.keys()) if (!next.has(axis)) clearAxis(axis)
        for (const [axis, kept] of next) drawAxis(axis, kept)
        drawn = next
        const was = lifted
        lifted = []
        lift(was)
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

    // Lifts the fade off `next` (a hovered mark, and the partners of a linked one), putting back
    // the cover of the marks lifted before.
    function lift(next: { layer: HitLayer; index: number }[]): void {
        if (next.length === lifted.length && next.every((m, k) => lifted[k].layer === m.layer && lifted[k].index === m.index)) return
        for (const { layer, index } of lifted) {
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
        }
        lifted = []
        for (const m of next) {
            const ks = drawn.get(m.layer.axis)?.get(m.layer)
            if (!ks || ks.has(m.index) || isGapElement(m.layer, m.index)) continue
            const h = homes.get(m.layer.axis)
            if (!h) continue
            const c = h.dim.getContext("2d")
            if (c) {
                c.globalCompositeOperation = "destination-out"
                c.fillStyle = "#000000"
                fillShapes(c, m.layer, [m.index], PAD_DIM)
                c.globalCompositeOperation = "source-over"
            }
            const key = `${m.layer.id}:${m.index}`
            h.wrap.dataset.lift = h.wrap.dataset.lift ? `${h.wrap.dataset.lift} ${key}` : key
            lifted.push(m)
        }
    }

    function preview(s: Slot, key: string | null, hits: Hit[] | null, scope: HitLayer[]): void {
        if (key === s.key && (key === null || s.kept)) return
        s.key = hits ? key : null
        s.kept = hits ? keptBy(hits) : null
        s.scope = hits ? scope : []
        redraw()
    }

    return {
        select_(hits, scope) {
            selKept = keptBy(hits)
            selScope = scope
            redraw()
        },
        preview_(key, hits, scope) { preview(slots.legend, key, hits, scope) },
        hover_(key, hits, scope) { preview(slots.line, key, hits, scope) },
        lift_(hit, partners = []) {
            const marks = hit ? [hit, ...partners] : []
            lift(marks.filter(fadeLook).map((h) => ({ layer: h.layer, index: h.index })))
        },
        place_: place,
        refresh_() {
            if (!drawn.size || host.cssScale_() === lastScale) return
            redraw()
        },
    }
}
