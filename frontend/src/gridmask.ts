import type { GridGeometry, Hit, HitLayer } from "./types"

// A `select = :many` grid field holds a mask: one byte per cell, row-major like the shipped
// `values` (cell (i, j) at j*ncols + i), 1 = selected. Masks are small next to the grid's own
// geometry: a byte per cell, where the manifest already ships a float per cell or per pixel.
export type GridMask = Uint8Array

// The wire envelope: runs of selected cells along each row, flat triples [j, i0, n, ...]
// (0-based, n cells from i0), or, past a kilobyte of runs, the cells as packed bits in base64
// when those are shorter.
// Runs follow the shape's outline; bits are the cap a scattered shape can't exceed.
export type MaskEnvelope = { runs: number[] } | { bits: string }
const RUNS_KEPT = 1024

export function maskSize(layer: HitLayer): [number, number] {
    const gg = layer.geometry as GridGeometry
    return [gg.ncols, gg.nrows]
}

export function emptyMask(layer: HitLayer): GridMask {
    const [nc, nr] = maskSize(layer)
    return new Uint8Array(nc * nr)
}

export function maskCount(mask: GridMask): number {
    let n = 0
    for (let k = 0; k < mask.length; k++) n += mask[k]
    return n
}

// Sets (on = true) or clears every cell in the inclusive block i0..i1 × j0..j1.
export function setBlock(mask: GridMask, ncols: number, i0: number, i1: number, j0: number, j1: number, on: boolean): void {
    const v = on ? 1 : 0
    for (let j = j0; j <= j1; j++) mask.fill(v, j * ncols + i0, j * ncols + i1 + 1)
}

function runsOf(mask: GridMask, ncols: number, nrows: number): number[] {
    const runs: number[] = []
    for (let j = 0; j < nrows; j++) {
        const row = j * ncols
        let i = 0
        while (i < ncols) {
            if (!mask[row + i]) { i++; continue }
            const i0 = i
            while (i < ncols && mask[row + i]) i++
            runs.push(j, i0, i - i0)
        }
    }
    return runs
}

function bitsOf(mask: GridMask): string {
    const bytes = new Uint8Array(Math.ceil(mask.length / 8))
    for (let k = 0; k < mask.length; k++) if (mask[k]) bytes[k >> 3] |= 1 << (k & 7)
    let s = ""
    for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000))
    return btoa(s)
}

export function encodeMask(layer: HitLayer, mask: GridMask): MaskEnvelope {
    const [nc, nr] = maskSize(layer)
    const runs = runsOf(mask, nc, nr)
    // Runs stay readable, so a value under a kilobyte keeps them whatever the bits would cost.
    // Each number takes at least two JSON bytes, so a short list needs no measuring.
    if (runs.length * 2 + 1 <= RUNS_KEPT) return { runs }
    const json = JSON.stringify(runs).length
    // The bits' base64 length is known before building them, so a mask whose runs win skips that.
    if (json <= Math.max(RUNS_KEPT, 4 * Math.ceil(Math.ceil(mask.length / 8) / 3))) return { runs }
    return { bits: bitsOf(mask) }
}

// The mask an envelope describes, or null when it doesn't fit this grid (a frame that changed
// the grid's size, or a value from elsewhere): such a value selects nothing.
export function decodeMask(layer: HitLayer, env: unknown): GridMask | null {
    if (env === null || env === undefined) return emptyMask(layer)
    if (typeof env !== "object") return null
    const [nc, nr] = maskSize(layer)
    const mask = emptyMask(layer)
    const o = env as { runs?: unknown; bits?: unknown }
    if (Array.isArray(o.runs)) {
        const r = o.runs as unknown[]
        if (r.length % 3 !== 0) return null
        for (let k = 0; k < r.length; k += 3) {
            const [j, i0, n] = [r[k], r[k + 1], r[k + 2]]
            if (!Number.isInteger(j) || !Number.isInteger(i0) || !Number.isInteger(n)) return null
            const [jj, ii, nn] = [j as number, i0 as number, n as number]
            if (jj < 0 || jj >= nr || ii < 0 || nn < 1 || ii + nn > nc) return null
            mask.fill(1, jj * nc + ii, jj * nc + ii + nn)
        }
        return mask
    }
    if (typeof o.bits === "string") {
        let s: string
        try { s = atob(o.bits) } catch { return null }
        if (s.length !== Math.ceil(mask.length / 8)) return null
        for (let k = 0; k < mask.length; k++) mask[k] = (s.charCodeAt(k >> 3) >> (k & 7)) & 1
        return mask
    }
    return null
}

// The highlight for a mask, as one hit: ["mask", fill path, edge path, side]. The fill is the
// selected cells, one rect per run (one path, so touching rows paint as one area with no
// seams); the edge is the outline, each cell side that borders an unselected cell or the grid's
// edge, joined along a row or column; the side is how wide the selection is (pieceWidth).
// Index -1 keeps its key apart from every cell's.
export function maskHit(layer: HitLayer, mask: GridMask): Hit | null {
    const gg = layer.geometry as GridGeometry
    if (mask.length !== gg.ncols * gg.nrows) return null
    const paths = maskPaths(mask, gg.ncols, gg.nrows, gg.xedges, gg.yedges)
    return paths ? { layer, index: -1, geom_: ["mask", ...paths] } : null
}

// The fill and edge paths of `mask`, an `nc` × `nr` row-major block of cells whose edges are
// `xe` (nc + 1) and `ye` (nr + 1), and its width (pieceWidth); null when it holds no cell. A
// region's outline passes the block around the region alone (regions.ts), so it walks that
// block, not the whole grid.
export function maskPaths(mask: GridMask, nc: number, nr: number, xe: ArrayLike<number>, ye: ArrayLike<number>): [string, string, number] | null {
    // Walks the typed array directly (no per-cell closure): a click on a photo-sized grid walks
    // every cell four times here.
    let fill = ""
    for (let j = 0; j < nr; j++) {
        const row = j * nc
        let i = 0
        while (i < nc) {
            if (!mask[row + i]) { i++; continue }
            const i0 = i
            while (i < nc && mask[row + i]) i++
            fill += `M${xe[i0]} ${ye[j]}H${xe[i]}V${ye[j + 1]}H${xe[i0]}Z`
        }
    }
    if (fill === "") return null
    let edge = ""
    // Horizontal sides: the line y = ye[j] between rows j-1 and j, for j in 0..nr (a row
    // outside the grid counts as unselected), joined along the row.
    for (let j = 0; j <= nr; j++) {
        const a = j * nc, b = a - nc
        let i = 0
        while (i < nc) {
            const lo = j > 0 ? mask[b + i] : 0, hi = j < nr ? mask[a + i] : 0
            if (lo === hi) { i++; continue }
            const i0 = i
            for (i++; i < nc; i++) if ((j > 0 ? mask[b + i] : 0) === (j < nr ? mask[a + i] : 0)) break
            edge += `M${xe[i0]} ${ye[j]}H${xe[i]}`
        }
    }
    // Vertical sides: the line x = xe[i] between columns i-1 and i, joined down the column.
    // Walked row by row (the array's order); open[i] is the row a side on line i began at.
    const open = new Int32Array(nc + 1).fill(-1)
    const vside = (i: number, j0: number, j1: number) => { edge += `M${xe[i]} ${ye[j0]}V${ye[j1]}` }
    for (let j = 0; j < nr; j++) {
        const row = j * nc
        for (let i = 0; i <= nc; i++) {
            const d = (i < nc ? mask[row + i] : 0) !== (i > 0 ? mask[row + i - 1] : 0)
            if (d && open[i] < 0) open[i] = j
            else if (!d && open[i] >= 0) { vside(i, open[i], j); open[i] = -1 }
        }
    }
    for (let i = 0; i <= nc; i++) if (open[i] >= 0) vside(i, open[i], nr)
    return [fill, edge, pieceWidth(mask, nc, nr, xe, ye)]
}

// How wide a selection is, image px: of its pieces (cells joined side to side), the narrowest,
// each measured by the largest square of selected cells inside it. A lone cell or a scatter of
// them is as wide as one cell however far apart they sit, an arm one cell wide keeps its piece
// one cell wide, and a disk or a blob is as wide as the square that fits in it, whatever its
// ragged edge. One pass: the square ending at each cell (the classic min of left, up and
// up-left, plus one), with a union-find joining each cell to its left and upper neighbours.
function pieceWidth(mask: GridMask, nc: number, nr: number, xe: ArrayLike<number>, ye: ArrayLike<number>): number {
    const parent = new Int32Array(nc * nr).fill(-1)
    const best = new Float64Array(nc * nr)
    const find = (k: number): number => {
        while (parent[k] !== k) k = parent[k] = parent[parent[k]]
        return k
    }
    const join = (a: number, b: number) => {
        a = find(a); b = find(b)
        if (a !== b) { parent[b] = a; best[a] = Math.max(best[a], best[b]) }
    }
    let up = new Int32Array(nc), cur = new Int32Array(nc)
    for (let j = 0; j < nr; j++) {
        const row = j * nc
        for (let i = 0; i < nc; i++) {
            if (!mask[row + i]) { cur[i] = 0; continue }
            const k = row + i
            const n = 1 + Math.min(i > 0 ? cur[i - 1] : 0, up[i], i > 0 ? up[i - 1] : 0)
            cur[i] = n
            parent[k] = k
            if (i > 0 && mask[k - 1]) join(k - 1, k)
            if (j > 0 && mask[k - nc]) join(k - nc, k)
            const r = find(k)
            const side = Math.min(Math.abs(xe[i + 1] - xe[i + 1 - n]), Math.abs(ye[j + 1] - ye[j + 1 - n]))
            best[r] = Math.max(best[r], side)
        }
        ;[up, cur] = [cur, up]
    }
    let w = Infinity
    for (let k = 0; k < nc * nr; k++) if (parent[k] === k) w = Math.min(w, best[k])
    return w
}
