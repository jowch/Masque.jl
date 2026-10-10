import type { Manifest } from "../src/types"

// The fields Julia's default binding makes when a hand-built test manifest names none: every
// layer that can commit. A clicked layer (an element pick), a threshold or a box (a release),
// and the target of a `selects` box (what the box holds). A view layer commits nothing, so it
// is no field. A manifest that already lists `fields` keeps them, so a test can name its own.
export function defaultFields(m: Manifest): string[] {
    const out: string[] = []
    const add = (id: string) => { if (!out.includes(id)) out.push(id) }
    for (const l of m.layers) {
        const ev = l.events ?? []
        if (ev.includes("click")) add(l.id)
        if (ev.includes("drag") && (l.kind === "threshold" || l.kind === "roi")) add(l.id)
        if (l.kind === "roi" && l.selects) add(l.selects)
    }
    return out
}

export function withFields(m: Manifest): Manifest {
    return m.fields ? m : { ...m, fields: defaultFields(m) }
}
