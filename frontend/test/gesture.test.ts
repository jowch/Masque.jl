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
