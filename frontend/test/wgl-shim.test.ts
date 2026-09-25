// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { rewrap, obs, makeBonitoShim, mountWebGL, resetWebGLPool, contextBudget, DEFAULT_CONTEXT_BUDGET } from "../src/wgl-shim"

// rewrap is the JS half of the 4-rule scene contract — it must decode exactly what `_plain`
// in ext/MasqueWGLMakieExt.jl emits. These lock that cross-language contract (previously
// untested; the version-coupling guard covers the WGLMakie seam, not this).
describe("rewrap — the _plain 4-rule decode", () => {
    it("scalars and strings pass through", () => {
        expect(rewrap(5)).toBe(5)
        expect(rewrap("delta")).toBe("delta")
        expect(rewrap(true)).toBe(true)
        expect(rewrap(null)).toBe(null)
    })

    it("{__t__,d} → the matching TypedArray (each tag _plain emits)", () => {
        const f = rewrap({ __t__: "f32", d: [1, 2, 3] })
        expect(f).toBeInstanceOf(Float32Array)
        expect(Array.from(f)).toEqual([1, 2, 3])
        expect(rewrap({ __t__: "i32", d: [-1, 2] })).toBeInstanceOf(Int32Array)
        expect(rewrap({ __t__: "u32", d: [1, 2] })).toBeInstanceOf(Uint32Array)
        expect(rewrap({ __t__: "u8", d: [255, 0] })).toBeInstanceOf(Uint8Array)
    })

    it("{array,size} recurses: inner array becomes a TypedArray, size stays plain", () => {
        const r = rewrap({ array: { __t__: "f32", d: [1, 2, 3, 4] }, size: [2, 2] })
        expect(r.array).toBeInstanceOf(Float32Array)
        expect(Array.from(r.array)).toEqual([1, 2, 3, 4])
        expect(r.size).toEqual([2, 2]) // plain number array (Int64 size vec — not a __t__ tag)
    })

    it("{__obs__} → an observable shim holding the (recursively rewrapped) value", () => {
        const o = rewrap({ __obs__: { __t__: "f32", d: [7, 8] } })
        expect(o.value).toBeInstanceOf(Float32Array)
        expect(Array.from(o.value)).toEqual([7, 8])
        expect(typeof o.on).toBe("function")
        expect(typeof o.notify).toBe("function")
    })

    it("plain dicts recurse; arrays map element-wise (mixed tags)", () => {
        const r = rewrap({ a: { __t__: "u8", d: [1] }, b: "x", c: [{ __t__: "f32", d: [2] }, 3] })
        expect(r.a).toBeInstanceOf(Uint8Array)
        expect(r.b).toBe("x")
        expect(r.c[0]).toBeInstanceOf(Float32Array)
        expect(r.c[1]).toBe(3)
    })
})

describe("obs — the observable shim", () => {
    it("holds the initial value", () => {
        expect(obs(42).value).toBe(42)
    })
    it("notify(v) updates value and fires every callback", () => {
        const o = obs(0)
        const seen: number[] = []
        o.on((v) => seen.push(v as number))
        o.on((v) => seen.push((v as number) * 10))
        o.notify(5)
        expect(o.value).toBe(5)
        expect(seen).toEqual([5, 50])
    })
    it("notify() with no arg keeps value but still fires", () => {
        const o = obs("a")
        let fired = false
        o.on(() => { fired = true })
        o.notify()
        expect(o.value).toBe("a")
        expect(fired).toBe(true)
    })
})

describe("makeBonitoShim — the no-server Bonito stand-in", () => {
    it("can_send_to_julia is true (WGLMakie gates observable updates on it)", () => {
        expect(makeBonitoShim().can_send_to_julia()).toBe(true)
    })
    it("throttle_function is identity", () => {
        const f = () => 1
        expect(makeBonitoShim().throttle_function(f)).toBe(f)
    })
    it("lock_loading runs f immediately, and tolerates no f", () => {
        let ran = false
        makeBonitoShim().lock_loading(() => { ran = true })
        expect(ran).toBe(true)
        expect(() => makeBonitoShim().lock_loading()).not.toThrow()
    })
    it("ConnStub: send/notify/on are no-ops, on returns an unsubscribe fn, _ConnStub is constructible", () => {
        const B = makeBonitoShim()
        const c = new B._ConnStub()
        expect(() => { c.send(); c.notify() }).not.toThrow()
        expect(typeof c.on()).toBe("function")
        expect(c).toBeInstanceOf(B.Connection)
    })
    it("Connection.send_error logs to console.error with the error's stack when present", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        const B = makeBonitoShim()
        const err = new Error("boom")
        B.Connection.send_error("context msg", err)
        expect(spy).toHaveBeenCalledWith("[masque-wgl]", "context msg", err.stack)
        spy.mockRestore()
    })
    it("Connection.send_error falls back to the raw value when it has no stack", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        const B = makeBonitoShim()
        B.Connection.send_error("context msg", "plain string error")
        expect(spy).toHaveBeenCalledWith("[masque-wgl]", "context msg", "plain string error")
        spy.mockRestore()
    })
    it("Connection.send_warning exists, is callable, and logs at warn level without throwing", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
        const B = makeBonitoShim()
        expect(typeof B.Connection.send_warning).toBe("function")
        // real call shape from WGLMakie's on_shader_error: a single formatted string, no error object
        expect(() => B.Connection.send_warning("THREE.WebGLProgram: Shader Error")).not.toThrow()
        expect(spy).toHaveBeenCalledWith("[masque-wgl]", "THREE.WebGLProgram: Shader Error")
        spy.mockRestore()
    })
})

describe("mountWebGL", () => {
    // `import(/* @vite-ignore */ url)` in mountWebGL bypasses vite's module graph and hits
    // Node's native ESM loader directly, which only accepts file:/data: schemes — a vite-node
    // http: URL (e.g. from import.meta.url under the dev server) is rejected. A data: URL with
    // the fixture source inlined sidesteps module resolution entirely.
    // Not `new URL(relative, import.meta.url)`: this file runs under `@vitest-environment
    // happy-dom`, which shadows the global `URL` with its own polyfill — one that resolves a
    // relative path against a `file:` base as if the base were `http://localhost:3000`
    // (verified: `new URL("./x", "file:///…")` here yields `http://localhost:3000/x`).
    // `fileURLToPath` on the plain `import.meta.url` string sidesteps that constructor entirely.
    const fixtureSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/fake-wgl-bundle.mjs"), "utf8")
    const bundleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(fixtureSrc)}`

    afterEach(() => {
        delete (window as unknown as { Bonito?: unknown }).Bonito
        resetWebGLPool()
        document.body.replaceChildren()
    })

    function hostCanvas() {
        const host = document.createElement("div")
        const canvas = document.createElement("canvas")
        host.appendChild(canvas)
        document.body.appendChild(host)
        return { host, canvas }
    }

    it("imports the bundle, scopes the Bonito shim, and forwards args to setup_scene_init", async () => {
        const { host: wrapper, canvas } = hostCanvas()
        const scene = { __obs__: { __t__: "f32", d: [1, 2] } }
        const realBonito = { real: true }
        ;(window as unknown as { Bonito?: unknown }).Bonito = realBonito
        const result = await mountWebGL({ canvas, wglBundleUrl: bundleUrl, scene, width: 640, height: 480, pxPerUnit: 3, visible: true })

        // #175: a page's real Bonito client is left alone; the shim lives on __MasqueWGL.
        expect((window as unknown as { Bonito?: unknown }).Bonito).toBe(realBonito)
        const H = (window as unknown as { __MasqueWGL: { bonito: { can_send_to_julia: () => boolean } } }).__MasqueWGL
        expect(H.bonito.can_send_to_julia()).toBe(true)

        const [passedWrapper, passedCanvas, w, h, resizeTo, ppu, one, realSize, canvasWidth, sceneObs] = result.WGL.lastCall
        expect(passedWrapper).toBe(wrapper)
        expect(passedCanvas).toBe(canvas)
        expect(w).toBe(640)
        expect(h).toBe(480)
        expect(resizeTo).toBeNull()
        expect(ppu).toBe(3)
        expect(one).toBe(1)
        expect(realSize.value).toEqual([640, 480])
        expect(canvasWidth.value).toEqual([640, 480])
        // sceneObs is mountWebGL's own obs() wrapper around the already-rewrapped scene, so its
        // .value is the inner Obs (from the {__obs__} tag), whose own .value is the TypedArray.
        expect(sceneObs.value.value).toBeInstanceOf(Float32Array)
        expect(Array.from(sceneObs.value.value as Float32Array)).toEqual([1, 2])

        // returned scene is the same rewrapped object passed through
        expect(result.scene.value).toBeInstanceOf(Float32Array)
    })

    it("creates the scoped shim before the bundle evaluates, as the widget's prelude requires (#175)", async () => {
        // The same prelude `_widget_html` (ext/MasqueWGLMakieExt.jl) prepends to the real bundle.
        // This copy throws at module evaluation unless the shim already exists, so it locks the
        // order: mountWebGL must create window.__MasqueWGL.bonito before import().
        const prelude = "const Bonito = globalThis.__MasqueWGL.bonito;\n" +
            "if (!Bonito) throw new Error(\"scoped Bonito shim missing at bundle evaluation\");\n" +
            "export const seenBonito = Bonito;\n"
        const url = `data:text/javascript;charset=utf-8,${encodeURIComponent(prelude + fixtureSrc)}`
        delete (window as unknown as { __MasqueWGL?: unknown }).__MasqueWGL
        const { canvas } = hostCanvas()
        const result = await mountWebGL({ canvas, wglBundleUrl: url, scene: {}, width: 100, height: 50, visible: true })
        const H = (window as unknown as { __MasqueWGL: { bonito: unknown } }).__MasqueWGL
        expect((result.WGL as unknown as { seenBonito: unknown }).seenBonito).toBe(H.bonito)
        expect((window as unknown as { Bonito?: unknown }).Bonito).toBeUndefined()
    })

    it("defaults pxPerUnit to 2 when omitted", async () => {
        const { canvas } = hostCanvas()
        const result = await mountWebGL({ canvas, wglBundleUrl: bundleUrl, scene: {}, width: 100, height: 50, visible: true })
        expect(result.WGL.lastCall[5]).toBe(2)
    })

    it("sizes the canvas to fill its container via CSS after WGL's own sizing", async () => {
        const { canvas } = hostCanvas()
        await mountWebGL({ canvas, wglBundleUrl: bundleUrl, scene: {}, width: 100, height: 50, visible: true })
        expect(canvas.style.width).toBe("100%")
        expect(canvas.style.height).toBe("auto")
    })

    it("installs a scene replacer that swaps onto the existing screen and stops the old loop", async () => {
        const canvas = document.createElement("canvas") as HTMLCanvasElement & {
            wglmakie_screen?: { root_scene: { screen?: unknown; orbitcontrols?: { disposed: boolean } } }
            masqueReplaceScene?: (scene: unknown, px?: number, w?: number, h?: number) => void
        }
        const host = document.createElement("div")
        host.appendChild(canvas)
        document.body.appendChild(host)
        const mod = await import(/* @vite-ignore */ bundleUrl) as { sceneCalls: { deleted: number; loops: number; lastDeleted?: string } }
        mod.sceneCalls.deleted = 0
        mod.sceneCalls.loops = 0
        await mountWebGL({ canvas, wglBundleUrl: bundleUrl, scene: {}, width: 640, height: 480, pxPerUnit: 2, visible: true })
        const first = canvas.wglmakie_screen!.root_scene
        const controls = first.orbitcontrols!
        expect(typeof canvas.masqueReplaceScene).toBe("function")
        canvas.masqueReplaceScene!({ tag: "next" }, 1, 100, 50)
        expect(first.screen).toEqual({})
        expect(controls.disposed).toBe(true)
        expect(first.orbitcontrols).toBeUndefined()
        expect(mod.sceneCalls.deleted).toBe(1)
        expect(mod.sceneCalls.lastDeleted).toBe("mount")
        expect(mod.sceneCalls.loops).toBe(1)
        expect(canvas.wglmakie_screen!.root_scene).not.toBe(first)
        expect((canvas.wglmakie_screen!.root_scene as { data?: unknown }).data).toEqual({ tag: "next" })
        expect(canvas.width).toBe(100)
        expect(canvas.height).toBe(50)
        expect(canvas.style.width).toBe("100%")
        expect(canvas.style.height).toBe("auto")
        canvas.masqueReplaceScene!({ tag: "settle" }, 2, 100, 50)
        expect(mod.sceneCalls.deleted).toBe(2)
        expect(mod.sceneCalls.loops).toBe(2)
        expect(canvas.width).toBe(200) // 100 * ppu 2
    })

    it("flushes a pending overlay frame onto the existing screen", async () => {
        const canvas = document.createElement("canvas") as HTMLCanvasElement & {
            wglmakie_screen?: { root_scene: { data?: unknown } }
            masqueReplaceScene?: (scene: unknown, px?: number, w?: number, h?: number) => void
            masqueFlushPending?: () => void
            masquePendingFrame?: { r: { scene: unknown; pxPerUnit?: number; width?: number; height?: number } } | null
        }
        const host = document.createElement("div")
        host.appendChild(canvas)
        document.body.appendChild(host)
        canvas.masquePendingFrame = { r: { scene: { tag: "early" }, pxPerUnit: 2, width: 80, height: 40 } }
        canvas.masqueFlushPending = () => {
            const pending = canvas.masquePendingFrame
            canvas.masquePendingFrame = null
            canvas.masqueReplaceScene?.(pending!.r.scene, pending!.r.pxPerUnit, pending!.r.width, pending!.r.height)
        }
        const mod = await import(/* @vite-ignore */ bundleUrl) as { sceneCalls: { deleted: number; loops: number } }
        mod.sceneCalls.deleted = 0
        mod.sceneCalls.loops = 0
        await mountWebGL({ canvas, wglBundleUrl: bundleUrl, scene: {}, width: 80, height: 40, pxPerUnit: 2, visible: true })
        expect(canvas.masquePendingFrame).toBeNull()
        expect(mod.sceneCalls.loops).toBe(1)
        expect(canvas.wglmakie_screen!.root_scene.data).toEqual({ tag: "early" })
        expect(canvas.width).toBe(160)
    })
})

describe("WebGL context pool", () => {
    const fixtureSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/fake-wgl-bundle.mjs"), "utf8")
    const bundleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(fixtureSrc)}`

    class FakeIO {
        cb: IntersectionObserverCallback
        opts: IntersectionObserverInit
        static last: FakeIO | null = null
        constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
            this.cb = cb
            this.opts = opts ?? {}
            FakeIO.last = this
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords(): IntersectionObserverEntry[] { return [] }
        fire(pairs: [Element, boolean][]) {
            const records = pairs.map(([target, isIntersecting]) => ({
                isIntersecting, target, intersectionRatio: isIntersecting ? 1 : 0,
            })) as IntersectionObserverEntry[]
            this.cb(records, this as unknown as IntersectionObserver)
        }
    }

    const prevIO = globalThis.IntersectionObserver
    beforeEach(() => {
        globalThis.IntersectionObserver = FakeIO as unknown as typeof IntersectionObserver
        Object.defineProperty(window, "innerWidth", { value: 800, configurable: true })
        Object.defineProperty(window, "innerHeight", { value: 600, configurable: true })
    })

    afterEach(() => {
        globalThis.IntersectionObserver = prevIO
        FakeIO.last = null
        delete (window as unknown as { Bonito?: unknown }).Bonito
        resetWebGLPool()
        document.body.replaceChildren()
    })

    function at(top: number) {
        const host = document.createElement("div")
        const canvas = document.createElement("canvas") as HTMLCanvasElement & {
            masqueReplaceScene?: (scene: unknown, px?: number, w?: number, h?: number) => void
        }
        host.appendChild(canvas)
        host.getBoundingClientRect = () => ({
            left: 0, top, width: 400, height: 100, right: 400, bottom: top + 100, x: 0, y: top, toJSON() {},
        }) as DOMRect
        document.body.appendChild(host)
        return { host, canvas }
    }

    async function mod() {
        return import(/* @vite-ignore */ bundleUrl) as Promise<{ inits: unknown[][]; trace: string[] }>
    }

    async function settle() {
        for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0))
    }

    it("leaves an off-screen plot asleep", async () => {
        const { canvas } = at(4000)
        const m = await mod()
        m.inits.length = 0
        await mountWebGL({ canvas, wglBundleUrl: bundleUrl, scene: { tag: "off" }, width: 80, height: 40 })
        await settle()
        expect(m.inits).toHaveLength(0)
        expect(canvas.isConnected).toBe(true)
        expect(FakeIO.last?.opts.rootMargin).toBe("200px")
    })

    it("draws a plot when the viewport observer reports it", async () => {
        const { host, canvas } = at(0)
        const m = await mod()
        m.inits.length = 0
        await mountWebGL({ canvas, wglBundleUrl: bundleUrl, scene: { tag: "on" }, width: 80, height: 40 })
        expect(m.inits).toHaveLength(0)
        FakeIO.last!.fire([[host, true]])
        await settle()
        expect(m.inits).toHaveLength(1)
        expect((m.inits[0][9] as { value: unknown }).value).toEqual({ tag: "on" })
    })

    it("keeps eight live contexts and notes the plot that does not fit", async () => {
        const m = await mod()
        m.inits.length = 0
        const widgets = []
        for (let i = 0; i < DEFAULT_CONTEXT_BUDGET + 1; i++) widgets.push(at(0))
        for (const w of widgets) {
            await mountWebGL({ canvas: w.canvas, wglBundleUrl: bundleUrl, scene: { tag: "n" }, width: 40, height: 20 })
        }
        FakeIO.last!.fire(widgets.map((w) => [w.host, true]))
        await settle()
        expect(m.inits).toHaveLength(DEFAULT_CONTEXT_BUDGET)
        const notes = document.querySelectorAll(".masque-webgl-placeholder")
        expect(notes).toHaveLength(1)
        expect(notes[0].textContent).toBe("This plot's GPU context was released.")
        expect(widgets[DEFAULT_CONTEXT_BUDGET].host.contains(notes[0])).toBe(true)
    })

    it("snapshots a farther plot to free a slot, and resumes the latest scene", async () => {
        const m = await mod()
        m.inits.length = 0
        const pinned = []
        for (let i = 0; i < DEFAULT_CONTEXT_BUDGET - 1; i++) pinned.push(at(0))
        const gone = at(0)
        const coming = at(4000)
        const all = [...pinned, gone, coming]
        for (const w of all) {
            await mountWebGL({ canvas: w.canvas, wglBundleUrl: bundleUrl, scene: { tag: "mount" }, width: 80, height: 40 })
        }
        FakeIO.last!.fire([
            ...pinned.map((w) => [w.host, true] as [Element, boolean]),
            [gone.host, true],
            [coming.host, false],
        ])
        await settle()
        expect(m.inits).toHaveLength(DEFAULT_CONTEXT_BUDGET)
        gone.canvas.masqueReplaceScene!({ tag: "panned" }, 2, 90, 50)
        // Scroll: `gone` leaves the viewport, `coming` enters. Distance comes from the rect,
        // so the flag alone does not make a plot farther.
        gone.host.getBoundingClientRect = () => ({
            left: 0, top: 4000, width: 400, height: 100, right: 400, bottom: 4100, x: 0, y: 4000, toJSON() {},
        }) as DOMRect
        coming.host.getBoundingClientRect = () => ({
            left: 0, top: 0, width: 400, height: 100, right: 400, bottom: 100, x: 0, y: 0, toJSON() {},
        }) as DOMRect
        FakeIO.last!.fire([
            ...pinned.map((w) => [w.host, true] as [Element, boolean]),
            [gone.host, false],
            [coming.host, true],
        ])
        await settle()
        expect(gone.host.querySelector("img.masque-webgl-base")).toBeTruthy()
        expect(gone.canvas.isConnected).toBe(false)
        expect(m.inits).toHaveLength(DEFAULT_CONTEXT_BUDGET + 1)
        const lossAt = m.trace.indexOf("loss")
        expect(lossAt).toBeGreaterThan(0)
        expect(m.trace[lossAt + 1]).toBe("init")
        gone.host.getBoundingClientRect = () => ({
            left: 0, top: 0, width: 400, height: 100, right: 400, bottom: 100, x: 0, y: 0, toJSON() {},
        }) as DOMRect
        coming.host.getBoundingClientRect = () => ({
            left: 0, top: 4000, width: 400, height: 100, right: 400, bottom: 4100, x: 0, y: 4000, toJSON() {},
        }) as DOMRect
        FakeIO.last!.fire([
            ...pinned.map((w) => [w.host, true] as [Element, boolean]),
            [gone.host, true],
            [coming.host, false],
        ])
        await settle()
        const resumed = m.inits[m.inits.length - 1]
        expect((resumed[9] as { value: unknown }).value).toEqual({ tag: "panned" })
        expect(resumed[2]).toBe(90)
        expect(resumed[3]).toBe(50)
        expect(resumed[5]).toBe(2)
    })

    it("lowers the budget when a context is lost", async () => {
        const m = await mod()
        m.inits.length = 0
        const widgets = []
        for (let i = 0; i < DEFAULT_CONTEXT_BUDGET; i++) widgets.push(at(0))
        for (const w of widgets) {
            await mountWebGL({ canvas: w.canvas, wglBundleUrl: bundleUrl, scene: {}, width: 40, height: 20 })
        }
        FakeIO.last!.fire(widgets.map((w) => [w.host, true]))
        await settle()
        expect(contextBudget()).toBe(DEFAULT_CONTEXT_BUDGET)
        widgets[0].canvas.dispatchEvent(new Event("webglcontextlost"))
        expect(contextBudget()).toBe(DEFAULT_CONTEXT_BUDGET - 1)
        expect(widgets[0].canvas.style.display).toBe("none")
        expect(widgets[0].host.querySelector(".masque-webgl-placeholder")).toBeTruthy()
        const extra = at(0)
        await mountWebGL({ canvas: extra.canvas, wglBundleUrl: bundleUrl, scene: { tag: "extra" }, width: 40, height: 20 })
        FakeIO.last!.fire([[extra.host, true], ...widgets.map((w) => [w.host, true] as [Element, boolean])])
        await settle()
        expect(m.inits).toHaveLength(DEFAULT_CONTEXT_BUDGET)
        expect(extra.host.querySelector(".masque-webgl-placeholder")).toBeTruthy()
    })

    it("draws a plot that already holds a gesture frame, even before the observer fires", async () => {
        const { host, canvas } = at(4000)
        ;(host as HTMLElement & { masquePendingFrame?: unknown }).masquePendingFrame = { r: { scene: { tag: "early" } } }
        const m = await mod()
        m.inits.length = 0
        await mountWebGL({ canvas, wglBundleUrl: bundleUrl, scene: { tag: "mount" }, width: 80, height: 40 })
        await settle()
        expect(m.inits).toHaveLength(1)
    })

    it("lets a right-click reach the browser menu on a live canvas", async () => {
        const { canvas } = at(0)
        await mountWebGL({ canvas, wglBundleUrl: bundleUrl, scene: {}, width: 80, height: 40, visible: true })
        canvas.addEventListener("contextmenu", (event) => { event.preventDefault() })
        const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
        canvas.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
    })

    it("notes plots past the budget when there is no viewport observer", async () => {
        const previous = globalThis.IntersectionObserver
        globalThis.IntersectionObserver = undefined as unknown as typeof IntersectionObserver
        try {
            const m = await mod()
            m.inits.length = 0
            const widgets = []
            for (let i = 0; i < DEFAULT_CONTEXT_BUDGET + 1; i++) widgets.push(at(0))
            for (const w of widgets) {
                await mountWebGL({ canvas: w.canvas, wglBundleUrl: bundleUrl, scene: { tag: "n" }, width: 40, height: 20 })
            }
            await settle()
            expect(m.inits).toHaveLength(DEFAULT_CONTEXT_BUDGET)
            const notes = document.querySelectorAll(".masque-webgl-placeholder")
            expect(notes).toHaveLength(1)
            expect(widgets[DEFAULT_CONTEXT_BUDGET].host.contains(notes[0])).toBe(true)
        } finally {
            globalThis.IntersectionObserver = previous
        }
    })

    it("does not draw after the overlay has detached", async () => {
        const { host, canvas } = at(0)
        ;(host as HTMLElement & { masqueDead?: boolean }).masqueDead = true
        const m = await mod()
        m.inits.length = 0
        await mountWebGL({ canvas, wglBundleUrl: bundleUrl, scene: {}, width: 80, height: 40, visible: true })
        await settle()
        expect(m.inits).toHaveLength(0)
    })
})
