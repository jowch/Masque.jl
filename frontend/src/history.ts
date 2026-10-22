// Undo and redo for picks (#386). Every commit that changes a pick field records what those
// fields held before, so Cmd/Ctrl+Z can put them back and Shift+Cmd/Ctrl+Z (Ctrl+Y off Apple)
// can redo. A step is the whole commit: a marquee release or a legend click that edits several
// fields is undone at once, and sends one value, as the gesture did. Picks only: controls, a
// box's bounds, the view and hover are not recorded. The history belongs to the mounted widget,
// so a cell that re-runs starts with none.
import { renderSelection } from "./highlight"
import { sameValue, selectionForValue } from "./selection"
import { isApplePlatform } from "./bond"
import type { Manifest } from "./types"
import type { FieldSelection, OverlayCtx, OverlayState } from "./state"

// Steps kept. A long annotation session drops its oldest steps, never its picks.
export const HISTORY_LIMIT = 100

// A field a click picks into: what clearPicks clears. A box's target is the box's own field.
export function isPickField(manifest: Manifest, id: string): boolean {
    const layer = manifest.layers.find((l) => l.id === id)
    return !!layer && !layer.brush && layer.events.includes("click")
}

// The selection to hold and draw for field `f` at value `v`, or null when `v` names nothing
// the manifest has.
export function fieldSelection(manifest: Manifest, f: string, v: unknown): FieldSelection | null {
    const sel = selectionForValue(manifest, v ?? null, f)
    if (!sel) return null
    return sel.mask ? { hits_: sel.hits, source_: null, mask_: sel.mask } :
        sel.items ? { hits_: sel.hits, source_: null, items_: sel.items } :
            { hits_: sel.hits, source_: sel.source }
}

// Called by commit_ with the fields about to be set and the value they replace. A user's
// gesture becomes a step and drops the redo steps. A quiet commit that names a pick field came
// from Julia (a frame whose marks changed), so the steps may name marks that are gone: the
// history starts again.
export function recordPicks(manifest: Manifest, state: OverlayState, cur: Record<string, unknown>, updates: [string, unknown][], quiet: boolean): void {
    // Julia clears every field whose marks changed, picked or not, so an empty field it names
    // resets the history too: its steps index the old marks.
    if (quiet) {
        if (updates.some(([k]) => isPickField(manifest, k))) {
            state.undo_ = []
            state.redo_ = []
        }
        return
    }
    const before: Record<string, unknown> = {}
    let any = false
    for (const [k, v] of updates) {
        if (!isPickField(manifest, k) || sameValue(cur[k] ?? null, v ?? null)) continue
        before[k] = cur[k] ?? null
        any = true
    }
    if (!any) return
    state.undo_.push(before)
    if (state.undo_.length > HISTORY_LIMIT) state.undo_.shift()
    state.redo_ = []
}

// Undoes (or redoes) one step: redraws the picks it names and commits what they resolve to,
// once, so the drawing and the value agree. Returns false, changing nothing, when there is no
// step that way.
export function stepPicks(ctx: OverlayCtx, state: OverlayState, dir: "undo" | "redo"): boolean {
    const from = dir === "undo" ? state.undo_ : state.redo_
    const to = dir === "undo" ? state.redo_ : state.undo_
    const step = from.pop()
    if (!step) return false
    const cur = ctx.value_()
    const back: Record<string, unknown> = {}
    const updates: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(step)) {
        const sel = fieldSelection(ctx.manifest_, k, v)
        if (!sel) continue // names nothing this manifest has: leave the field as it is
        back[k] = cur[k] ?? null
        state.sel_.set(k, sel)
        updates[k] = sel.items_ ? { items: sel.items_ } : v
    }
    if (Object.keys(updates).length === 0) return false
    to.push(back)
    renderSelection(ctx, state)
    ctx.commit_(updates, false, true)
    return true
}

// The history step a key asks for: Cmd+Z / Shift+Cmd+Z on Apple platforms, Ctrl+Z /
// Shift+Ctrl+Z / Ctrl+Y elsewhere. A layout whose Z key types another letter still undoes
// with the key in Z's place.
export function historyKey(e: { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): "undo" | "redo" | null {
    if (e.altKey) return null
    const apple = isApplePlatform()
    if (!(apple ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)) return null
    const k = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : e.code === "KeyZ" ? "z" : e.code === "KeyY" ? "y" : ""
    if (k === "z") return e.shiftKey ? "redo" : "undo"
    if (k === "y" && !apple && !e.shiftKey) return "redo"
    return null
}
