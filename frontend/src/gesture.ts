// Request discipline for the view-drag `with_js_link` channel (architecture §12.6).
// `render` is null when there is no callback; every method below no-ops in that case.

export interface FrameResponse {
    png?: Uint8Array
    scene?: unknown
    width?: number
    height?: number
    pxPerUnit?: number
    manifest?: unknown // Manifest, kept loose here to avoid a cycle with mount.ts's own import of this file
    error?: string     // `onchange` threw: no picture, a note instead
    clear?: string[]   // fields whose plot changed its number of marks; their picks go
}

export type RenderFrame = (input: Record<string, unknown>) => Promise<FrameResponse>

// A settle's input, or a function that builds it when the round trip starts, so it carries
// the state as it is then rather than when it was queued.
export type SettleInput = Record<string, unknown> | (() => Record<string, unknown>)

export interface GestureChannel {
    // Fire-and-coalesce: an in-drag position. Never awaited by the caller — a burst of these
    // collapses to the latest one still pending when the previous round trip resolves.
    request(input: Record<string, unknown>): void
    // The terminal request (drag release): supersedes anything still pending and is awaited,
    // so a caller that wants to know "the last frame has landed" can `await` this. `slot`
    // keeps different kinds of terminal frame apart: a view's settle and an `onchange` settle
    // each replace only an older one of their own kind, and both run, in the order queued.
    settle(input: SettleInput, slot?: string): Promise<void>
    // Stops delivering frames and drops anything queued — call from mount's own cleanup so a
    // response arriving after unmount never touches a dead DOM.
    dispose(): void
}

const noopChannel: GestureChannel = {
    request() {},
    settle: async () => {},
    dispose() {},
}

// §12.9's export backstop: `window.pluto_disable_ui` is set in exported HTML BEFORE any widget
// renders (Pluto/src/notebook/Export.jl), so this is checked once, at channel construction, not
// per request — a session that starts live and is later exported gets a fresh channel/page load
// anyway. `is_supported_by_display` (the Julia-side gate) can't see this case at all: it's true
// during export GENERATION, when a kernel is still live to produce the export, and that stale
// `true` is what ends up baked into the reader's HTML — this is the gate that actually holds at
// use time. try/catch below (not this flag) is the fallback for a kernel that goes away mid-
// session or a `render_frame`/`with_js_link` call that throws for some other reason.
function uiDisabled(): boolean {
    return typeof window !== "undefined" && (window as unknown as { pluto_disable_ui?: boolean }).pluto_disable_ui === true
}

// Request discipline (§12.6): at most one in-flight request, a burst of intermediate positions
// coalesces to the latest rather than queueing, every round trip is awaited before the next is
// issued, never a fixed-interval poll. `lock` below IS that one-at-a-time serialization: every
// `request`/`settle` call chains off the SAME promise, so there's no separate inFlight flag to
// keep in sync with it.
export function createGestureChannel(
    render: RenderFrame | null,
    onFrame: (input: Record<string, unknown>, response: FrameResponse) => void,
    onDead?: () => void,
): GestureChannel {
    if (!render || uiDisabled()) return noopChannel
    let lock: Promise<void> = Promise.resolve()
    let latest: Record<string, unknown> | null = null // a newer position overwrites an older one still queued
    // Queued terminal requests, one per slot ("view" unless the caller names another). Kept
    // apart from `latest` (round-1 review, finding #1): the caller's `settle()` isn't awaited
    // (a `PointerEvent` handler can't block on one without going async itself), so nothing
    // stops a second drag's `request()` from arriving before the round trip ahead of it in
    // `lock` has even started — if that request shared `latest` with a still-unsent settle, it
    // would silently overwrite it, and the widget would never see the settle:true frame that
    // restores `px_per_unit` back from the in-drag `1`. A view settle and an `onchange` settle
    // queued together are both sent, oldest slot first: either alone would leave the picture
    // without the other's change. A slot is consumed by `runLatest` or cleared by `dispose`;
    // `request` below refuses to touch any of them.
    const pendingSettles = new Map<string, SettleInput>()
    let disposed = false

    // Prefers a pending settle over `latest` — a terminal request always wins over a stray
    // in-drag position still sitting in the coalescing slot. Consumes whichever it picks AT THE
    // TIME THIS RUNS, which may already be newer than whatever scheduled this call, if further
    // positions arrived while this was waiting its turn in `lock`.
    const runLatest = (): Promise<void> => {
        let input: Record<string, unknown> | null
        const first = pendingSettles.entries().next()
        if (!first.done) {
            const [slot, queued] = first.value
            pendingSettles.delete(slot)
            input = typeof queued === "function" ? queued() : queued
        } else {
            input = latest
            latest = null
        }
        if (!input || disposed) return Promise.resolve()
        let pending: Promise<FrameResponse>
        try {
            // A static export's dead channel throws SYNCHRONOUSLY here (Pluto swaps in
            // `nothing_actions`, so the generated wrapper calls `undefined` and its own
            // internal `.then` throws before ever returning a Promise) — this try/catch is the
            // backstop `uiDisabled()` above can't cover (a kernel that's live at render time
            // but gone by the time a frame is actually requested).
            pending = render(input)
        } catch {
            disposed = true
            onDead?.()
            return Promise.resolve()
        }
        const sent = input
        return pending.then(
            (r) => { if (!disposed) onFrame(sent, r) },
            () => { disposed = true; onDead?.() }, // a rejected round trip degrades the same way a thrown one does
        )
    }

    return {
        request(input) {
            // A pending settle always wins. Dropping this request outright (not queueing it
            // behind the settle) is deliberate: it belongs to a gesture racing a terminal frame
            // that hasn't even been sent yet, so painting it first would show a preview the
            // about-to-land settle frame immediately supersedes anyway — the brief gap until the
            // settle round trip clears is the cost, paid instead of ever losing a terminal frame.
            if (disposed || pendingSettles.size > 0) return
            latest = input
            lock = lock.then(runLatest)
        },
        settle(input, slot = "view") {
            if (disposed) return Promise.resolve()
            latest = null // a terminal request supersedes anything mid-drag still queued
            pendingSettles.set(slot, input)
            const done = lock.then(runLatest)
            lock = done
            return done
        },
        dispose() {
            disposed = true
            latest = null
            pendingSettles.clear()
        },
    }
}
