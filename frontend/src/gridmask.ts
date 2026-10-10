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
    if (json <= RUNS_KEPT) return { runs }
    const bits = bitsOf(mask)
    return json <= bits.length ? { runs } : { bits }
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

// The highlight for a mask, as one hit: ["mask", fill path, edge path]. The fill is the
// selected cells, one rect per run (one path, so touching rows paint as one area with no
// seams); the edge is the outline, each cell side that borders an unselected cell or the grid's
// edge, joined along a row or column. Index -1 keeps its key apart from every cell's.
export function maskHit(layer: HitLayer, mask: GridMask): Hit | null {
    const gg = layer.geometry as GridGeometry
    const { ncols: nc, nrows: nr, xedges: xe, yedges: ye } = gg
    if (mask.length !== nc * nr) return null
    const on = (i: number, j: number) => i >= 0 && j >= 0 && i < nc && j < nr && mask[j * nc + i] === 1
    let fill = ""
    for (let j = 0; j < nr; j++) {
        let i = 0
        while (i < nc) {
            if (!on(i, j)) { i++; continue }
            const i0 = i
            while (i < nc && on(i, j)) i++
            fill += `M${xe[i0]} ${ye[j]}H${xe[i]}V${ye[j + 1]}H${xe[i0]}Z`
        }
    }
    if (fill === "") return null
    let edge = ""
    // Horizontal sides: the line y = ye[j] between rows j-1 and j, for j in 0..nr.
    for (let j = 0; j <= nr; j++) {
        let i = 0
        while (i < nc) {
            if (on(i, j) === on(i, j - 1)) { i++; continue }
            const i0 = i
            while (i < nc && on(i, j) !== on(i, j - 1)) i++
            edge += `M${xe[i0]} ${ye[j]}H${xe[i]}`
        }
    }
    // Vertical sides: the line x = xe[i] between columns i-1 and i.
    for (let i = 0; i <= nc; i++) {
        let j = 0
        while (j < nr) {
            if (on(i, j) === on(i - 1, j)) { j++; continue }
            const j0 = j
            while (j < nr && on(i, j) !== on(i - 1, j)) j++
            edge += `M${xe[i]} ${ye[j0]}V${ye[j]}`
        }
    }
    return { layer, index: -1, geom_: ["mask", fill, edge] }
}
