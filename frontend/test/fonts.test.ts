// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import { FONT_CSS, useFont } from "../src/fonts"

const MAKIE = {
    family: "TeX Gyre Heros Makie",
    src: ["https://cdn.example/a.otf", "https://raw.example/a.otf"],
    integrity: "sha384-abc",
}

function stubFonts() {
    const added: unknown[] = []
    const faces: { family: string; desc: FontFaceDescriptors }[] = []
    class Face {
        constructor(public family: string, _buf: ArrayBuffer, public desc: FontFaceDescriptors) { faces.push(this) }
        load() { return Promise.resolve(this) }
    }
    vi.stubGlobal("FontFace", Face)
    Object.defineProperty(document, "fonts", { configurable: true, value: { add: (f: unknown) => added.push(f) } })
    return { added, faces }
}

afterEach(() => {
    vi.unstubAllGlobals()
    delete (window as unknown as { __masqueFonts?: unknown }).__masqueFonts
})

const settle = () => new Promise((r) => setTimeout(r, 0))

describe("control fonts", () => {
    it("the CSS falls back to Makie's font by name", () => {
        expect(FONT_CSS).toContain('var(--ff, "TeX Gyre Heros Makie", Helvetica, Arial, sans-serif)')
    })

    it("sets the family, weight and style the CSS reads", () => {
        vi.stubGlobal("fetch", vi.fn())
        const el = document.createElement("div")
        useFont(el, { family: 'My "Font"', weight: 700, style: "italic" })
        expect(el.style.getPropertyValue("--ff")).toBe('"My \\"Font\\"", Helvetica, Arial, sans-serif')
        expect(el.style.getPropertyValue("--fw")).toBe("700")
        expect(el.style.getPropertyValue("--fst")).toBe("italic")
        // A font of the author's has no file to fetch.
        expect(fetch).not.toHaveBeenCalled()
    })

    it("fetches Makie's font once per page, checked against its hash", async () => {
        const { added, faces } = stubFonts()
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) })
        vi.stubGlobal("fetch", fetchMock)
        useFont(document.createElement("div"), MAKIE)
        useFont(document.createElement("div"), MAKIE)
        await settle()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith(MAKIE.src[0], expect.objectContaining({ integrity: MAKIE.integrity }))
        expect(added).toHaveLength(1)
        expect(faces[0].family).toBe("TeX Gyre Heros Makie")
        expect(faces[0].desc).toEqual({ weight: "400", style: "normal" })
    })

    it("registers a bold italic face as bold italic, so the browser doesn't fake either", async () => {
        const { faces } = stubFonts()
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }))
        useFont(document.createElement("div"), { ...MAKIE, integrity: "sha384-bi", weight: 700, style: "italic" })
        await settle()
        expect(faces[0].desc).toEqual({ weight: "700", style: "italic" })
    })

    it("gives up on a copy that doesn't answer and tries the next", async () => {
        stubFonts()
        // Each fetch's timeout, aborted here by hand.
        const timers: AbortController[] = []
        vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
            expect(ms).toBe(5000)
            const c = new AbortController()
            timers.push(c)
            return c.signal
        })
        const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_res, rej) =>
            init.signal?.addEventListener("abort", () => rej(new DOMException("timeout", "TimeoutError")))))
        vi.stubGlobal("fetch", fetchMock)
        useFont(document.createElement("div"), MAKIE)
        await settle()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        timers[0].abort()
        await settle()
        expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(MAKIE.src)
        vi.restoreAllMocks()
    })

    it("tries the next copy, and gives up quietly when none loads", async () => {
        const { added } = stubFonts()
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: false })
            .mockRejectedValueOnce(new TypeError("integrity"))
        vi.stubGlobal("fetch", fetchMock)
        const el = document.createElement("div")
        useFont(el, MAKIE)
        await settle()
        await settle()
        expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(MAKIE.src)
        expect(added).toHaveLength(0)
        expect(el.style.getPropertyValue("--ff")).toBe('"TeX Gyre Heros Makie", Helvetica, Arial, sans-serif')
        // A failed load is forgotten, so the next widget on the page tries again.
        fetchMock.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) })
        useFont(document.createElement("div"), MAKIE)
        await settle()
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(added).toHaveLength(1)
    })
})
