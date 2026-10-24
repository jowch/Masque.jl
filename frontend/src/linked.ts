import { hitLayerByIndex, isGapElement, layerNElements } from "./selection"
import type { FieldSelection } from "./state"
import type { Hit, HitLayer, LinkGroup, Manifest } from "./types"

// --- linked selections (#346): several plots of the same rows share one field ---
// A group's field holds rows. A row is a mark's position, or, with a key, the index Julia gave
// that key (`rows`, per member layer and mark). A pick on any member edits the group's rows,
// and every mark of a held row, in every member, is drawn as selected. The keys themselves
// stay in Julia, which turns the rows into the `@bind` value.

// Above this many marks of one row on one axis, a hover outlines none of them there: a row
// keyed by cluster can stand for thousands of marks, and a click still shows them all.
export const PARTNER_CAP = 50

export function groupOf(manifest: Manifest, layer: HitLayer): LinkGroup | undefined {
    return layer.group === undefined ? undefined : manifest.groups?.find((g) => g.id === layer.group)
}

export function groupById(manifest: Manifest, id: string): LinkGroup | undefined {
    return manifest.groups?.find((g) => g.id === id)
}

// The row of mark `k` of a member layer, or undefined when it has none.
export function rowOf(g: LinkGroup, layer: HitLayer, k: number): number | undefined {
    if (!g.rows) return k >= 0 && k < g.n ? k : undefined
    const r = g.rows[layer.id]?.[k]
    return typeof r === "number" && r >= 0 && r < g.n ? r : undefined
}

// Every drawn mark of each row, built once per group: a frame's manifest is a new group.
const marksCache = new WeakMap<LinkGroup, Map<number, [HitLayer, number][]>>()
function marksIndex(manifest: Manifest, g: LinkGroup): Map<number, [HitLayer, number][]> {
    let index = marksCache.get(g)
    if (index) return index
    index = new Map()
    for (const id of g.members) {
        const layer = manifest.layers.find((l) => l.id === id)
        if (!layer) continue
        const n = layerNElements(layer)
        for (let k = 0; k < n; k++) {
            if (isGapElement(layer, k)) continue
            const r = rowOf(g, layer, k)
            if (r === undefined) continue
            let marks = index.get(r)
            if (!marks) index.set(r, (marks = []))
            marks.push([layer, k])
        }
    }
    marksCache.set(g, index)
    return index
}

function markHit(layer: HitLayer, k: number): Hit | null {
    try {
        return { layer, ...hitLayerByIndex(layer, k) }
    } catch {
        return null
    }
}

// The marks of `rows`, in every member.
export function rowsHits(manifest: Manifest, g: LinkGroup, rows: number[]): Hit[] {
    const index = marksIndex(manifest, g)
    const out: Hit[] = []
    for (const r of rows) {
        for (const [layer, k] of index.get(r) ?? []) {
            const h = markHit(layer, k)
            if (h) out.push(h)
        }
    }
    return out
}

export function groupSelection(manifest: Manifest, g: LinkGroup, rows: number[]): FieldSelection {
    return { hits_: rowsHits(manifest, g, rows), source_: null, rows_: rows }
}

// The wire envelope: `{rows: [...]}` for a group that holds many, else `{row}` or null.
export function groupEnvelope(g: LinkGroup, rows: number[]): unknown {
    if (g.many) return { rows: [...rows] }
    return rows.length ? { row: rows[0] } : null
}

// The rows an envelope names, or null when it isn't one of this group's. A row out of range
// is dropped, as a pick on a mark that is gone is.
export function envelopeRows(g: LinkGroup, v: unknown): number[] | null {
    if (v === null || v === undefined) return []
    if (typeof v !== "object") return null
    const o = v as { row?: unknown; rows?: unknown }
    const ok = (r: unknown): r is number => typeof r === "number" && Number.isInteger(r) && r >= 0 && r < g.n
    if (g.many) {
        if (!Array.isArray(o.rows)) return null
        return [...new Set(o.rows.filter(ok))]
    }
    if (o.row === undefined) return null
    return ok(o.row) ? [o.row] : []
}

// A click on a mark of row `row`: a group of many adds the row or takes it out; a group of
// one takes it, or lets it go when it held it.
export function clickRows(g: LinkGroup, cur: number[], row: number): number[] {
    const held = cur.includes(row)
    if (g.many) return held ? cur.filter((r) => r !== row) : [...cur, row]
    return held ? [] : [row]
}

// The rows marks `indices` of member `layer` stand for, each once, in mark order.
export function rowsOfMarks(g: LinkGroup, layer: HitLayer, indices: number[]): number[] {
    const out: number[] = []
    const seen = new Set<number>()
    for (const k of indices) {
        const r = rowOf(g, layer, k)
        if (r === undefined || seen.has(r)) continue
        seen.add(r)
        out.push(r)
    }
    return out
}

// The marks a hover on `hit` outlines besides it: the other marks of its row, on every axis
// where the row has at most PARTNER_CAP of them.
export function partnerHits(manifest: Manifest, g: LinkGroup, hit: Hit): Hit[] {
    const r = rowOf(g, hit.layer, hit.index)
    if (r === undefined) return []
    const byAxis = new Map<string, [HitLayer, number][]>()
    for (const m of marksIndex(manifest, g).get(r) ?? []) {
        if (m[0] === hit.layer && m[1] === hit.index) continue
        const list = byAxis.get(m[0].axis) ?? []
        list.push(m)
        byAxis.set(m[0].axis, list)
    }
    const out: Hit[] = []
    for (const marks of byAxis.values()) {
        if (marks.length > PARTNER_CAP) continue
        for (const [layer, k] of marks) {
            const h = markHit(layer, k)
            if (h) out.push(h)
        }
    }
    return out
}
