// The gesture channel (#102/#133, docs/dev/architecture/12-gesture-channel.md): request
// discipline (§12.6) for a `with_js_link` round trip that streams frames during a view drag.
// `render` is `null` when the widget has no `ViewInteractable` (or the channel has degraded),
// and every method below degrades to a no-op in that case. Both backends use this; the frame
// body differs — `{png}` on `:cairo`, `{scene, width, height, pxPerUnit}` on `:webgl`.

export interface FrameResponse {
    png?: Uint8Array
    scene?: unknown
    width?: number
    height?: number
    pxPerUnit?: number
    manifest?: unknown // Manifest, kept loose here to avoid a cycle with mount.ts's own import of this file
}

export type RenderFrame = (input: Record<string, unknown>) => Promise<FrameResponse>

export interface GestureChannel {
    // Fire-and-coalesce: an in-drag position. Never awaited by the caller — a burst of these
    // collapses to the latest one still pending when the previous round trip resolves.
    request(input: Record<string, unknown>): void
    // The terminal request (drag release): supersedes anything still pending and is awaited,
    // so a caller that wants to know "the last frame has landed" can `await` this.
    settle(input: Record<string, unknown>): Promise<void>
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
): GestureChannel {
    if (!render || uiDisabled()) return noopChannel
    let lock: Promise<void> = Promise.resolve()
    let latest: Record<string, unknown> | null = null // a newer position overwrites an older one still queued
    // A queued terminal request. Kept in its OWN slot, never `latest` (round-1 review, finding
    // #1): the caller's `settle()` isn't awaited (a `PointerEvent` handler can't block on one
    // without going async itself), so nothing stops a second drag's `request()` from arriving
    // before the round trip ahead of it in `lock` has even started — if that request shared
    // `latest` with a still-unsent settle, it would silently overwrite it, and the widget would
    // never see the settle:true frame that restores `px_per_unit` back from the in-drag `1`.
    // Once this is set it can only be consumed by `runLatest` or cleared by `dispose`/a fresh
    // `settle` — `request` below refuses to touch it at all.
    let pendingSettle: Record<string, unknown> | null = null
    let disposed = false

    // Prefers `pendingSettle` over `latest` — a terminal request always wins over a stray
    // in-drag position still sitting in the coalescing slot. Consumes whichever it picks AT THE
    // TIME THIS RUNS, which may already be newer than whatever scheduled this call, if further
    // positions arrived while this was waiting its turn in `lock`.
    const runLatest = (): Promise<void> => {
        let input: Record<string, unknown> | null
        if (pendingSettle !== null) {
            input = pendingSettle
            pendingSettle = null
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
            return Promise.resolve()
        }
        return pending.then(
            (r) => { if (!disposed) onFrame(input as Record<string, unknown>, r) },
            () => { disposed = true }, // a rejected round trip degrades the same way a thrown one does
        )
    }

    return {
        request(input) {
            // A pending settle always wins. Dropping this request outright (not queueing it
            // behind the settle) is deliberate: it belongs to a gesture racing a terminal frame
            // that hasn't even been sent yet, so painting it first would show a preview the
            // about-to-land settle frame immediately supersedes anyway — the brief gap until the
            // settle round trip clears is the cost, paid instead of ever losing a terminal frame.
            if (disposed || pendingSettle !== null) return
            latest = input
            lock = lock.then(runLatest)
        },
        settle(input) {
            if (disposed) return Promise.resolve()
            latest = null // a terminal request supersedes anything mid-drag still queued
            pendingSettle = input
            const done = lock.then(runLatest)
            lock = done
            return done
        },
        dispose() {
            disposed = true
            latest = null
            pendingSettle = null
        },
    }
}
