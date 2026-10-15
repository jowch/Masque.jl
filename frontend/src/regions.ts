import type { GridGeometry, Hit, HitLayer } from "./types"
import { maskPaths } from "./gridmask"
import type { GridMask } from "./gridmask"

// A grid's regions (`regions=`, #359): each cell's region id, shipped as runs over the
// row-major cells, flat pairs [id, n, ...]. Id 0 is a cell in no region. Decoded once per
// layer, on the first hover or pick after a mount, with each region's cells and the block of
// cells around them; that first decode walks every cell (about 0.4 s on a 2048×2048 grid), and
// after it a region costs its own size. Each region's outline is built the first time it is
// drawn.
type RegionIndex = {
    ids_: Int32Array
    cells_: Map<number, number[]>
    box_: Map<number, [number, number, number, number]> // i0, i1, j0, j1, inclusive
    shapes_: Map<number, [string, string] | null>
}

const indexes = new WeakMap<HitLayer, RegionIndex | null>()

function regionIndex(layer: HitLayer): RegionIndex | null {
    const known = indexes.get(layer)
    if (known !== undefined) return known
    let out: RegionIndex | null = null
    const gg = layer.kind === "grid" ? layer.geometry as GridGeometry : null
    const runs = gg?.regions
    if (gg && Array.isArray(runs) && runs.length % 2 === 0) {
        const n = gg.ncols * gg.nrows
        const ids = new Int32Array(n)
        let k = 0
        for (let r = 0; r < runs.length && k >= 0; r += 2) {
            const id = runs[r], len = runs[r + 1]
            if (!Number.isInteger(id) || id < 0 || !Number.isInteger(len) || len < 1 || k + len > n) { k = -1; break }
            ids.fill(id, k, k + len)
            k += len
        }
        if (k === n) {
            const cells = new Map<number, number[]>()
            const box = new Map<number, [number, number, number, number]>()
            for (let c = 0; c < n; c++) {
                const id = ids[c]
                if (id === 0) continue
                const i = c % gg.ncols, j = (c - i) / gg.ncols
                const list = cells.get(id)
                if (list) {
                    list.push(c)
                    const b = box.get(id)!
                    if (i < b[0]) b[0] = i
                    if (i > b[1]) b[1] = i
                    b[3] = j
                } else {
                    cells.set(id, [c])
                    box.set(id, [i, i, j, j])
                }
            }
            out = { ids_: ids, cells_: cells, box_: box, shapes_: new Map() }
        }
    }
    indexes.set(layer, out)
    return out
}

export function hasRegions(layer: HitLayer): boolean {
    return regionIndex(layer) !== null
}

// The region id of row-major cell `index`: 0 for a cell in no region, or on a grid without.
export function regionOf(layer: HitLayer, index: number): number {
    const ri = regionIndex(layer)
    return ri && index >= 0 && index < ri.ids_.length ? ri.ids_[index] : 0
}

// The row-major cells of region `id`, empty for 0 or an id no cell has.
export function regionCells(layer: HitLayer, id: number): readonly number[] {
    return (id !== 0 && regionIndex(layer)?.cells_.get(id)) || []
}

// Region `id`'s outline as a mask geometry, ["mask", fill, edge], built over the block of
// cells around the region only, so a region on a photo-sized grid costs its own size.
export function regionGeom(layer: HitLayer, id: number): unknown[] | null {
    const ri = regionIndex(layer)
    const box = ri?.box_.get(id)
    if (!ri || !box) return null
    let paths = ri.shapes_.get(id)
    if (paths === undefined) {
        const gg = layer.geometry as GridGeometry
        const [i0, i1, j0, j1] = box
        const w = i1 - i0 + 1, h = j1 - j0 + 1
        const sub: GridMask = new Uint8Array(w * h)
        for (const c of ri.cells_.get(id)!) {
            const i = c % gg.ncols, j = (c - i) / gg.ncols
            sub[(j - j0) * w + (i - i0)] = 1
        }
        paths = maskPaths(sub, w, h, gg.xedges.slice(i0, i1 + 2), gg.yedges.slice(j0, j1 + 2))
        ri.shapes_.set(id, paths)
    }
    return paths ? ["mask", paths[0], paths[1]] : null
}

// `hit` on a grid cell, standing for the cell's whole region when it has one: drawn as the
// region's outline and keyed by the region, so moving within it keeps one highlight.
export function withRegion<H extends Omit<Hit, "layer">>(layer: HitLayer, hit: H): H {
    const id = regionOf(layer, hit.index)
    if (id === 0) return hit
    const geom = regionGeom(layer, id)
    return geom ? { ...hit, geom_: geom, region_: id } : hit
}

// Sets (on = true) or clears every cell of the regions the cells in `cells` belong to, and
// those cells themselves when they are in no region.
export function setRegionsOf(layer: HitLayer, mask: GridMask, cells: Iterable<number>, on: boolean): void {
    const v = on ? 1 : 0
    const done = new Set<number>()
    for (const c of cells) {
        const id = regionOf(layer, c)
        if (id === 0) { mask[c] = v; continue }
        if (done.has(id)) continue
        done.add(id)
        for (const k of regionCells(layer, id)) mask[k] = v
    }
}
