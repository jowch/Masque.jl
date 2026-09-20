// The gesture channel (#102, docs/dev/architecture/12-gesture-channel.md): request discipline
// (§12.6) for a `with_js_link` round trip that streams frames during a view drag. `:cairo`
// only — `render` is `null` whenever the widget has no live-preview mechanism (`:webgl`, or a
// widget with no `ViewInteractable`), and every method below degrades to a no-op in that case.

export interface FrameResponse {
    png: Uint8Array
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
    let disposed = false

    // Consumes whatever `latest` holds AT THE TIME THIS RUNS — which may already be newer than
    // whatever position scheduled this call, if further positions arrived while this was
    // waiting its turn in `lock`. That's the coalescing: only ever the newest position is sent.
    const runLatest = (): Promise<void> => {
        const input = latest
        latest = null
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
            (r) => { if (!disposed) onFrame(input, r) },
            () => { disposed = true }, // a rejected round trip degrades the same way a thrown one does
        )
    }

    return {
        request(input) {
            if (disposed) return
            latest = input
            lock = lock.then(runLatest)
        },
        settle(input) {
            if (disposed) return Promise.resolve()
            latest = input
            const done = lock.then(runLatest)
            lock = done
            return done
        },
        dispose() {
            disposed = true
            latest = null
        },
    }
}
