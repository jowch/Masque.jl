import type { Manifest } from "./types"

// A circles layer ships its numbers in quarters of an image px (#588), so a point's halo sits
// concentric on its marker. Once per manifest: the result is plain image px, and `q` goes.
export function dequantize(m: Manifest): Manifest {
    for (const l of m.layers ?? []) {
        if (!l.q || (!Array.isArray(l.geometry) && !ArrayBuffer.isView(l.geometry))) continue
        const q = l.q
        l.geometry = Array.from(l.geometry as ArrayLike<number>, (v) => v / q)
        delete l.q
    }
    return m
}
