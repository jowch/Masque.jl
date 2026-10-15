import { describe, it, expect, vi } from "vitest"
import { createGestureChannel } from "../src/gesture"

// Deferred promise helper — lets a test control exactly when one round trip resolves, so it can
// assert what happened WHILE it was still in flight (the coalescing case).
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((r) => { resolve = r })
    return { promise, resolve }
}

describe("createGestureChannel", () => {
    it("null render -> every method is a safe no-op", async () => {
        const onFrame = vi.fn()
        const ch = createGestureChannel(null, onFrame)
        ch.request({ a: 1 })
        await ch.settle({ a: 2 })
        ch.dispose()
        expect(onFrame).not.toHaveBeenCalled()
    })

    it("a single request calls render once and delivers the response", async () => {
        const onFrame = vi.fn()
        const render = vi.fn(async (input: Record<string, unknown>) => ({ png: new Uint8Array([1]), input }))
        const ch = createGestureChannel(render as never, onFrame)
        ch.request({ x: 1 })
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
        expect(render).toHaveBeenCalledTimes(1)
        expect(render).toHaveBeenCalledWith({ x: 1 })
        expect(onFrame).toHaveBeenCalledTimes(1)
    })

    it("§12.6: a burst of requests while one is in flight coalesces to the latest, never queues", async () => {
        const onFrame = vi.fn()
        const d1 = deferred<{ png: Uint8Array }>()
        const render = vi.fn()
            .mockReturnValueOnce(d1.promise)
            .mockResolvedValueOnce({ png: new Uint8Array([2]) })
        const ch = createGestureChannel(render as never, onFrame)

        ch.request({ n: 1 }) // starts immediately (idle) — render call #1
        await Promise.resolve()
        expect(render).toHaveBeenCalledTimes(1)
        // Three more positions arrive while #1 is still in flight — none may start a second
        // in-flight request; only the LAST one may ever be sent, once #1 resolves.
        ch.request({ n: 2 })
        ch.request({ n: 3 })
        ch.request({ n: 4 })
        expect(render).toHaveBeenCalledTimes(1) // still just the first — no queueing, no second in-flight call yet

        d1.resolve({ png: new Uint8Array([1]) })
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
        expect(render).toHaveBeenCalledTimes(2) // exactly one more call
        expect(render).toHaveBeenLastCalledWith({ n: 4 }) // the coalesced LATEST position, not 2 or 3
    })

    it("settle supersedes a pending position and is awaited by the caller", async () => {
        const onFrame = vi.fn()
        const render = vi.fn(async (input: Record<string, unknown>) => ({ png: new Uint8Array([1]), input }))
        const ch = createGestureChannel(render as never, onFrame)
        ch.request({ n: 1, settle: false })
        await ch.settle({ n: 2, settle: true })
        expect(onFrame).toHaveBeenLastCalledWith({ n: 2, settle: true }, expect.anything())
    })

    // Round-1 review, finding #1: the opposite ordering from the test above — a `request()`
    // arriving AFTER a `settle()` has already been queued (but before its round trip has even
    // been sent, because a prior request was still in flight ahead of it in `lock`). Real callers
    // never `await` settle() (bond.ts's onUp is a synchronous event handler), so nothing stops a
    // second drag's request from racing a first drag's still-unsent settle this way. Before the
    // fix, both shared one `latest` slot and this request silently overwrote the settle payload,
    // so the widget never restored `px_per_unit` from the in-drag `1`.
    it("a request arriving after settle is queued does not clobber it", async () => {
        const onFrame = vi.fn()
        const d1 = deferred<{ png: Uint8Array }>() // a round trip already in flight when settle is called
        const render = vi.fn()
            .mockReturnValueOnce(d1.promise)
            .mockResolvedValueOnce({ png: new Uint8Array([2]) })
        const ch = createGestureChannel(render as never, onFrame)

        ch.request({ n: 1 }) // render call #1, still pending
        await Promise.resolve()
        expect(render).toHaveBeenCalledTimes(1)

        const settled = ch.settle({ n: 2, settle: true }) // queued behind #1, not sent yet
        ch.request({ n: 3, settle: false }) // a second drag's in-drag position, arriving too late

        d1.resolve({ png: new Uint8Array([1]) })
        await settled

        // Exactly one more render call, and it carries the SETTLE payload — {n:3} was dropped,
        // not queued behind it and not sent instead of it.
        expect(render).toHaveBeenCalledTimes(2)
        expect(render).toHaveBeenLastCalledWith({ n: 2, settle: true })
        expect(onFrame).toHaveBeenLastCalledWith({ n: 2, settle: true }, expect.anything())
    })

    it("a view settle and an onchange settle queued together both run, oldest first", async () => {
        for (const order of [["view", "onchange"], ["onchange", "view"]]) {
            const onFrame = vi.fn()
            const d1 = deferred<{ png: Uint8Array }>()
            const render = vi.fn().mockReturnValueOnce(d1.promise).mockResolvedValue({ png: new Uint8Array([2]) })
            const ch = createGestureChannel(render as never, onFrame)
            ch.request({ first: true })
            await Promise.resolve() // the first round trip is out
            for (const slot of order) void ch.settle({ slot, settle: true }, slot)
            // A second settle of the same kind replaces the first one still waiting.
            void ch.settle({ slot: order[0], settle: true, again: true }, order[0])
            d1.resolve({ png: new Uint8Array([1]) })
            for (let k = 0; k < 10; k++) await Promise.resolve()
            expect(render.mock.calls.map((c) => c[0])).toEqual([
                { first: true }, { slot: order[0], settle: true, again: true }, { slot: order[1], settle: true },
            ])
        }
    })

    it("a settle given as a function is built when its round trip starts", async () => {
        const d1 = deferred<{ png: Uint8Array }>()
        const render = vi.fn().mockReturnValueOnce(d1.promise).mockResolvedValue({ png: new Uint8Array([2]) })
        const ch = createGestureChannel(render as never, vi.fn())
        let state = "queued"
        ch.request({ first: true })
        await Promise.resolve()
        void ch.settle(() => ({ state }), "onchange")
        state = "sent"
        d1.resolve({ png: new Uint8Array([1]) })
        for (let k = 0; k < 10; k++) await Promise.resolve()
        expect(render.mock.calls[1][0]).toEqual({ state: "sent" })
    })

    it("a synchronous throw (the static-export dead-channel shape) degrades the channel permanently", async () => {
        const onFrame = vi.fn()
        const render = vi.fn(() => { throw new Error("nothing_actions") })
        const ch = createGestureChannel(render as never, onFrame)
        ch.request({ n: 1 })
        await Promise.resolve(); await Promise.resolve()
        expect(onFrame).not.toHaveBeenCalled()
        // Degraded: further requests are silently dropped rather than retried.
        ch.request({ n: 2 })
        await Promise.resolve(); await Promise.resolve()
        expect(render).toHaveBeenCalledTimes(1)
    })

    it("a rejected round trip also degrades the channel", async () => {
        const onFrame = vi.fn()
        const render = vi.fn(async () => { throw new Error("kernel gone") })
        const ch = createGestureChannel(render as never, onFrame)
        ch.request({ n: 1 })
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
        ch.request({ n: 2 })
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
        expect(render).toHaveBeenCalledTimes(1)
        expect(onFrame).not.toHaveBeenCalled()
    })

    it("dispose() drops a pending position and suppresses a response already in flight", async () => {
        const onFrame = vi.fn()
        const d1 = deferred<{ png: Uint8Array }>()
        const render = vi.fn(() => d1.promise)
        const ch = createGestureChannel(render as never, onFrame)
        ch.request({ n: 1 })
        await Promise.resolve()
        ch.dispose()
        d1.resolve({ png: new Uint8Array([1]) })
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
        expect(onFrame).not.toHaveBeenCalled()
        // Further calls after dispose are no-ops, not errors.
        ch.request({ n: 2 })
        await ch.settle({ n: 3 })
        expect(render).toHaveBeenCalledTimes(1)
    })
})
