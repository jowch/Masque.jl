// MasqueWGL :webgl bootstrap — renders a serialize_scene payload with NO Bonito runtime and
// NO server. Imports WGLMakie's own bundle (version-matched, three.js inlined) and feeds it
// through a tiny shim. Validated by the spikes (full 2D+3D fidelity, animation hook).
//
// Usage (from the Masque widget HTML, mount===:webgl):
//   import { mountWebGL } from "./masque-webgl.js";  // committed ESM at assets/masque-webgl.js
//   mountWebGL({ canvas, wglBundleUrl, scene: published, width, height, pxPerUnit });
//
// `scene` is the published_to_js payload from MasqueWGLMakieExt.scene_payload (the 4-rule
// encoding); `rewrap` is the JS half of that contract — it mirrors `_plain` in
// ext/MasqueWGLMakieExt.jl, so the two must stay in sync (the unit tests lock it).

// functional observable shim: stores callbacks, notify() runs them -> the animation hook
export interface Obs<T = unknown> {
    value: T
    on(f: (v: T) => void): () => void
    notify(nv?: T): void
}

export function obs<T>(v: T): Obs<T> {
    const cbs: ((v: T) => void)[] = []
    return {
        value: v,
        on(f) { cbs.push(f); return () => {} },
        notify(nv?: T) { if (nv !== undefined) this.value = nv; cbs.forEach((f) => f(this.value)) },
    }
}

// --- the ENTIRE -bonito shim --------------------------------------------------
export function makeBonitoShim() {
    // notify() is the comm pushing a value TO Julia; we have no server, so swallow it (same
    // reason send() is a no-op). Without it WGLMakie throws "comm.notify is not a function".
    class ConnStub {
        send() {}
        notify() {}
        on() { return () => {} }
        static send_error = (msg: string, e: unknown) =>
            console.error("[masque-wgl]", msg, (e && (e as Error).stack) || e)
        // WGLMakie's shader-compile-error path calls this with a single already-formatted string
        static send_warning = (...args: unknown[]) => console.warn("[masque-wgl]", ...args)
    }
    return {
        // MUST be true: WGLMakie gates observable updates on this. comm.send is a no-op, so
        // client-side updates (camera/uniform animation) fire without any server (spike finding).
        can_send_to_julia: () => true,
        throttle_function: (f: unknown) => f,
        // Real Bonito enqueues f on a concurrency-1 lock (serializes object-freeing across
        // sessions). We have no sessions/server, so run it immediately — same effect, no queue.
        lock_loading: (f?: () => void) => { if (f) f() },
        Connection: ConnStub,
        _ConnStub: ConnStub,
    }
}

const TA = { f32: Float32Array, i32: Int32Array, u32: Uint32Array, u8: Uint8Array } as const
type TKey = keyof typeof TA

// rebuild the structures WGLMakie's deserialize expects from the 4-rule tags. `__obs__`/`__t__`
// are Julia's wire tags (MasqueWGLMakieExt.jl's `_plain`) — bracket-accessed, not `x.__obs__`,
// so esbuild's `mangleProps: /_$/` (which would otherwise catch the trailing "__") can never
// touch them.
export function rewrap(x: any): any {
    if (x && typeof x === "object" && !Array.isArray(x)) {
        if ("__obs__" in x) return obs(rewrap(x["__obs__"]))    // Observable shim
        if ("__t__" in x) return new TA[x["__t__"] as TKey](x.d) // 1-D TypedArray
        const o: Record<string, unknown> = {}
        for (const k in x) o[k] = rewrap(x[k])               // {array,size} recurse; nested dicts
        return o
    }
    if (Array.isArray(x)) return x.map(rewrap)
    return x
}

export interface MountArgs {
    canvas: HTMLCanvasElement
    wglBundleUrl: string
    scene: unknown
    width: number
    height: number
    pxPerUnit?: number
    // Test hook. Omit it in the widget: the viewport observer decides. `true` grants a
    // context immediately; `false` stays asleep until a gesture asks.
    visible?: boolean
}

// Cross-bundle names (overlay.js ↔ this ESM). No trailing underscore: esbuild mangles those,
// and the two bundles are built separately.
interface WebGLHost extends HTMLElement {
    masqueRetargetBase?: (next: HTMLElement) => void
    masqueFlushPending?: () => void
    masquePendingFrame?: unknown
    masqueRequestLive?: () => void
    masqueDetach?: () => void
    masqueDead?: boolean
    masqueWantsLive?: boolean
}

interface WglScene {
    scene_uuid?: unknown
    scene_children?: WglScene[]
    orbitcontrols?: { dispose?: () => void }
    screen?: unknown
}

interface WglScreen {
    renderer: {
        _width: number
        _height: number
        setViewport?: (x: number, y: number, w: number, h: number) => void
        forceContextLoss?: () => void
    }
    px_per_unit: number
    root_scene: WglScene | null
}

interface WglBundle {
    deserialize_scene: (data: unknown, screen: WglScreen) => WglScene
    start_renderloop: (scene: WglScene) => void
    delete_scene?: (id: unknown) => void
    setup_scene_init: (
        wrapper: HTMLElement, canvas: HTMLCanvasElement,
        width: number, height: number, resizeTo: null,
        pxPerUnit: number, devicePixelRatio: number,
        realSize: Obs<number[]>, canvasWidth: Obs<number[]>, scene: Obs<unknown>,
        conn: unknown, fps: number, done: Obs<boolean>,
    ) => void
}

interface WglCanvas extends HTMLCanvasElement {
    wglmakie_screen?: WglScreen
    masqueReplaceScene?: (scene: unknown, pxPerUnit?: number, width?: number, height?: number) => void
    masqueFlushPending?: () => void
}

// An empty screen makes WGLMakie's render loop exit. dispose_screen no-ops on {}, so the
// canvas's real renderer is not forceContextLoss'd.
function stopRenderLoop(scene: WglScene | null): void {
    if (scene) scene.screen = {}
}

function disposeOrbit(scene: WglScene | null): void {
    if (!scene) return
    scene.orbitcontrols?.dispose?.()
    scene.orbitcontrols = undefined
    for (const child of scene.scene_children ?? []) disposeOrbit(child)
}

// Do not call setup_scene_init here: that opens a second WebGL context on this canvas.
function replaceScene(canvas: WglCanvas, WGL: WglBundle, scene: unknown, pxPerUnit?: number, width?: number, height?: number): void {
    const screen = canvas.wglmakie_screen
    if (!screen) throw new Error("Masque: canvas has no WGLMakie screen to update")
    if (typeof WGL.deserialize_scene !== "function" || typeof WGL.start_renderloop !== "function") {
        throw new Error("Masque: WGLMakie bundle is missing deserialize_scene/start_renderloop")
    }
    const old = screen.root_scene
    if (old) {
        stopRenderLoop(old)
        disposeOrbit(old)
        if (old.scene_uuid != null && typeof WGL.delete_scene === "function") {
            try {
                WGL.delete_scene(old.scene_uuid)
            } catch (e) {
                console.error("[masque-wgl] delete_scene failed", e)
            }
        }
    }
    if (typeof pxPerUnit === "number" && typeof width === "number" && typeof height === "number") {
        screen.px_per_unit = pxPerUnit
        screen.renderer._width = width
        screen.renderer._height = height
        const rw = Math.ceil(width * pxPerUnit)
        const rh = Math.ceil(height * pxPerUnit)
        // Assigning canvas.width clears the drawing buffer. Skip it when the framebuffer
        // is already the right size so an in-drag frame at a steady ppu doesn't flash.
        if (canvas.width !== rw || canvas.height !== rh) {
            canvas.width = rw
            canvas.height = rh
            screen.renderer.setViewport?.(0, 0, rw, rh)
        }
    }
    const next = WGL.deserialize_scene(rewrap(scene), screen)
    next.screen = screen
    screen.root_scene = next
    WGL.start_renderloop(next)
    // setup_scene_init / set_render_size write canvas CSS to the framebuffer size.
    // The overlay pins to the element's border box, which has to stay the display size.
    canvas.style.width = "100%"
    canvas.style.height = "auto"
}

function installSceneReplacer(canvas: WglCanvas, WGL: WglBundle, plot: Plot): void {
    if (!canvas.wglmakie_screen) return
    canvas.masqueReplaceScene = (scene, pxPerUnit, width, height) => {
        replaceScene(canvas, WGL, scene, pxPerUnit, width, height)
        // The mount-time scene is stale once a gesture frame lands. Resume has to redraw
        // this one, or the camera snaps back under an overlay that already panned.
        plot.scene = scene
        if (typeof pxPerUnit === "number" && typeof width === "number" && typeof height === "number") {
            plot.pxPerUnit = pxPerUnit
            plot.width = width
            plot.height = height
        }
    }
    const flush = plot.host.masqueFlushPending ?? canvas.masqueFlushPending
    flush?.()
}

// Desktop Chrome and Safari allow 16 live WebGL contexts, Android Chrome 8. Eight fits
// all of them. The slots are not a thread pool and they are not spent on off-screen plots:
// setup_scene_init blocks the main thread, and drawing a plot the user cannot see does not
// make the next one cheaper.
export const DEFAULT_CONTEXT_BUDGET = 8
const VIEW_MARGIN = "200px"
const RELEASED = "This plot's GPU context was released."

type Phase = "blank" | "live" | "snapshot" | "placeholder"

interface Plot {
    host: WebGLHost
    canvas: HTMLCanvasElement | null
    placeholder: HTMLElement | null
    scene: unknown
    width: number
    height: number
    pxPerUnit: number
    WGL: WglBundle
    phase: Phase
    visible: boolean
    dead: boolean
    needsNewCanvas: boolean
    token: number
}

interface Pool {
    plots: Set<Plot>
    byHost: Map<HTMLElement, Plot>
    budget: number
    io: IntersectionObserver | null
    busy: boolean
    timer: number
}

const lossListening = new WeakSet<HTMLCanvasElement>()
const menuGuards = new WeakSet<HTMLCanvasElement>()
let lossToken = 0

function pool(): Pool {
    const H = ((window as any).__MasqueWGL ??= {})
    if (!H.contextPool) {
        H.contextPool = {
            plots: new Set<Plot>(), byHost: new Map<HTMLElement, Plot>(),
            budget: DEFAULT_CONTEXT_BUDGET, io: null, busy: false, timer: 0,
        }
    }
    return H.contextPool as Pool
}

export function contextBudget(): number {
    return pool().budget
}

export function resetWebGLPool(): void {
    const H = (window as any).__MasqueWGL
    const p = H?.contextPool as Pool | undefined
    if (!p) return
    if (p.timer) window.clearTimeout(p.timer)
    p.io?.disconnect()
    p.plots.clear()
    p.byHost.clear()
    p.budget = DEFAULT_CONTEXT_BUDGET
    p.busy = false
    p.timer = 0
    p.io = null
}

function livePlots(p: Pool): Plot[] {
    return [...p.plots].filter((plot) => plot.phase === "live")
}

function distanceToViewport(el: HTMLElement): number {
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth || 0
    const vh = window.innerHeight || 0
    const dx = r.right < 0 ? -r.right : r.left > vw ? r.left - vw : 0
    const dy = r.bottom < 0 ? -r.bottom : r.top > vh ? r.top - vh : 0
    return Math.hypot(dx, dy)
}

// Strictly farther than `candidate`. A tie (every plot on screen) is not a victim:
// an on-screen plot does not lose its context to another on-screen plot.
function victimFor(p: Pool, candidate: Plot): Plot | null {
    const floor = distanceToViewport(candidate.host)
    let best: Plot | null = null
    let bestD = floor
    for (const plot of livePlots(p)) {
        if (plot === candidate) continue
        const d = distanceToViewport(plot.host)
        if (d > bestD) { best = plot; bestD = d }
    }
    return best
}

function waitingPlots(p: Pool): Plot[] {
    return [...p.plots]
        .filter((plot) => plot.visible && plot.phase !== "live" && !plot.dead)
        .sort((a, b) => distanceToViewport(a.host) - distanceToViewport(b.host))
}

function grantable(p: Pool): Plot | null {
    for (const candidate of waitingPlots(p)) {
        if (livePlots(p).length < p.budget || victimFor(p, candidate)) return candidate
    }
    return null
}

function visualOf(plot: Plot): HTMLElement | null {
    if (plot.canvas?.isConnected) return plot.canvas
    return plot.host.querySelector("img.masque-webgl-base, canvas.masque-webgl-base, .masque-webgl-placeholder")
}

function showPlaceholder(plot: Plot, lostCanvas?: HTMLCanvasElement): void {
    if (plot.phase === "snapshot" && !lostCanvas) return
    if (plot.placeholder?.isConnected && !lostCanvas) {
        plot.phase = "placeholder"
        plot.host.masqueRetargetBase?.(plot.placeholder)
        return
    }
    const el = document.createElement("div")
    el.className = "masque-webgl-base masque-webgl-placeholder"
    el.textContent = RELEASED
    el.style.display = "grid"
    el.style.placeItems = "center"
    el.style.width = "100%"
    el.style.boxSizing = "border-box"
    el.style.aspectRatio = `${plot.width} / ${plot.height}`
    el.style.color = "CanvasText"
    el.style.background = "Canvas"
    el.style.border = "1px solid GrayText"
    el.style.font = "13px/1.4 sans-serif"
    el.style.textAlign = "center"
    el.style.padding = "12px"
    if (lostCanvas?.isConnected) {
        // Leave the canvas in the document. WGLMakie's own lost handler removes it;
        // pulling it out first makes that removeChild throw and skip forceContextLoss.
        lostCanvas.insertAdjacentElement("beforebegin", el)
        lostCanvas.style.display = "none"
    } else {
        const old = visualOf(plot)
        if (old) old.replaceWith(el)
        else plot.host.prepend(el)
    }
    plot.placeholder = el
    plot.canvas = null
    plot.needsNewCanvas = true
    plot.phase = "placeholder"
    plot.host.masqueRetargetBase?.(el)
}

function suspend(plot: Plot): void {
    const canvas = plot.canvas
    plot.token = 0
    if (!canvas?.isConnected) {
        plot.phase = "blank"
        plot.canvas = null
        plot.needsNewCanvas = true
        return
    }
    const img = document.createElement("img")
    img.className = "masque-webgl-base"
    img.alt = ""
    img.width = canvas.width || plot.width
    img.height = canvas.height || plot.height
    img.style.cssText = canvas.style.cssText || "display:block;width:100%;height:auto;"
    try {
        const url = canvas.toDataURL("image/png")
        if (url) img.src = url
    } catch { /* a sized <img> still holds the box */ }
    // The still has to be in the host before the context dies: WGLMakie's lost
    // handler removes the canvas, and a removed canvas with no sibling collapses the cell.
    canvas.insertAdjacentElement("beforebegin", img)
    plot.host.masqueRetargetBase?.(img)
    // Removing the canvas does not drop its WebGL context. WGLMakie only calls
    // forceContextLoss from check_screen, on a later frame. The next plot's
    // setup_scene_init would then be the one past the browser cap.
    try {
        ;(canvas as WglCanvas).wglmakie_screen?.renderer.forceContextLoss?.()
    } catch (e) {
        console.error("[masque-wgl] forceContextLoss failed", e)
    }
    if (canvas.isConnected) canvas.remove()
    plot.canvas = null
    plot.placeholder = null
    plot.needsNewCanvas = true
    plot.phase = "snapshot"
    plot.host.masqueRetargetBase?.(img)
}

function takeCanvas(plot: Plot): HTMLCanvasElement {
    if (!plot.needsNewCanvas && plot.canvas?.isConnected) return plot.canvas
    const canvas = document.createElement("canvas")
    canvas.className = "masque-webgl-base"
    canvas.width = plot.width
    canvas.height = plot.height
    canvas.style.display = "block"
    canvas.style.width = "100%"
    canvas.style.height = "auto"
    const old = plot.placeholder?.isConnected ? plot.placeholder : visualOf(plot)
    if (old && old !== canvas) old.replaceWith(canvas)
    else plot.host.prepend(canvas)
    plot.canvas = canvas
    plot.placeholder = null
    plot.needsNewCanvas = false
    return canvas
}

function unexpectedLoss(plot: Plot, canvas: HTMLCanvasElement): void {
    if (plot.token === 0 || plot.dead) return
    plot.token = 0
    const p = pool()
    const remaining = livePlots(p).filter((other) => other !== plot).length
    p.budget = Math.max(1, remaining)
    plot.needsNewCanvas = true
    showPlaceholder(plot, canvas)
    armTimer(p)
}

// WGLMakie (`add_canvas_events`) and OrbitControls both preventDefault on contextmenu.
// The overlay only lets that event reach the canvas while a right-click is passing
// through, and the browser menu is the point of that pass-through. A capture listener
// runs before those bubble listeners and drops their preventDefault; the event still bubbles.
function keepContextMenu(canvas: HTMLCanvasElement): void {
    if (menuGuards.has(canvas)) return
    menuGuards.add(canvas)
    canvas.addEventListener("contextmenu", (event) => {
        event.preventDefault = () => {}
    }, true)
}

function watchLoss(plot: Plot, canvas: HTMLCanvasElement, token: number): void {
    if (lossListening.has(canvas)) return
    lossListening.add(canvas)
    canvas.addEventListener("webglcontextlost", () => {
        if (plot.token !== token) return
        unexpectedLoss(plot, canvas)
    }, true)
}

function initPlot(p: Pool, plot: Plot): void {
    p.busy = true
    const token = ++lossToken
    plot.token = token
    let lost = false
    try {
        const canvas = takeCanvas(plot)
        keepContextMenu(canvas)
        watchLoss(plot, canvas, token)
        const wrapped = rewrap(plot.scene)
        plot.WGL.setup_scene_init(
            plot.host, canvas,
            plot.width, plot.height,
            null,
            plot.pxPerUnit, 1,
            obs([plot.width, plot.height]),
            obs([plot.width, plot.height]),
            obs(wrapped),
            new ((window as any).Bonito._ConnStub)(),
            30,
            obs(false),
        )
        lost = plot.token !== token || plot.phase === "placeholder"
        if (lost) return
        // setup_scene_init may write canvas CSS to the framebuffer size (wider than
        // `.ip-host`). Keep the element display-sized so the overlay can pin to it.
        canvas.style.width = "100%"
        canvas.style.height = "auto"
        plot.canvas = canvas
        plot.phase = "live"
        installSceneReplacer(canvas as WglCanvas, plot.WGL, plot)
        plot.host.masqueRetargetBase?.(canvas)
    } catch (e) {
        console.error("[masque-wgl] setup_scene_init failed", e)
        // Stay asleep until the viewport (or a gesture) asks again. Leaving `visible`
        // set retries setup_scene_init on every timer tick.
        plot.visible = false
        if (plot.phase !== "placeholder") showPlaceholder(plot)
    } finally {
        p.busy = false
        if (!lost) armTimer(p)
    }
}

function armTimer(p: Pool): void {
    if (p.busy || p.timer || waitingPlots(p).length === 0) return
    p.timer = window.setTimeout(() => {
        p.timer = 0
        pump()
    }, 0)
}

function drop(p: Pool, plot: Plot): void {
    plot.dead = true
    plot.token = 0
    p.plots.delete(plot)
    p.byHost.delete(plot.host)
    p.io?.unobserve(plot.host)
}

function reap(p: Pool): void {
    for (const plot of [...p.plots]) {
        if (plot.dead || plot.host.masqueDead || !plot.host.isConnected) drop(p, plot)
    }
}

function pump(): void {
    const p = pool()
    if (p.busy || p.timer) return
    reap(p)
    const next = grantable(p)
    if (!next) {
        for (const plot of waitingPlots(p)) {
            if (plot.phase !== "snapshot") showPlaceholder(plot)
        }
        return
    }
    if (livePlots(p).length >= p.budget) {
        const victim = victimFor(p, next)
        if (!victim) return
        suspend(victim)
    }
    initPlot(p, next)
}

function observe(plot: Plot): void {
    const p = pool()
    if (typeof IntersectionObserver !== "function") {
        // No viewport signal. Treat every plot as wanted: the pump still grants only
        // `budget` contexts, and the rest get the released-context note instead of an
        // empty canvas that can never be granted later.
        plot.visible = true
        return
    }
    if (!p.io) p.io = new IntersectionObserver((records) => {
        for (const rec of records) {
            const known = p.byHost.get(rec.target as HTMLElement)
            if (!known || known.dead) continue
            if (!known.host.isConnected || known.host.masqueDead) { drop(p, known); continue }
            known.visible = rec.isIntersecting
        }
        pump()
    }, { rootMargin: VIEW_MARGIN })
    p.io.observe(plot.host)
}

function enroll(host: WebGLHost, canvas: HTMLCanvasElement, WGL: WglBundle, scene: unknown, width: number, height: number, pxPerUnit: number, visible: boolean | undefined): void {
    const p = pool()
    if (p.byHost.has(host)) return
    const plot: Plot = {
        host, canvas, placeholder: null, scene, width, height, pxPerUnit, WGL,
        phase: "blank", visible: false, dead: false, needsNewCanvas: false, token: 0,
    }
    p.plots.add(plot)
    p.byHost.set(host, plot)
    host.masqueDetach = () => drop(p, plot)
    host.masqueRequestLive = () => {
        if (plot.dead) return
        plot.visible = true
        pump()
    }
    // Observe after the plot is registered. A browser can deliver the first intersection
    // record from inside observe(), and the callback looks the plot up by host.
    if (visible === true || host.masqueWantsLive || host.masquePendingFrame) plot.visible = true
    else if (visible !== false) observe(plot)
    pump()
}

export async function mountWebGL({ canvas, wglBundleUrl, scene, width, height, pxPerUnit = 2, visible }: MountArgs) {
    const WGL = await import(/* @vite-ignore */ wglBundleUrl)
    ;(window as any).Bonito = makeBonitoShim()    // WGLMakie reads window.Bonito globals
    const sceneObj = rewrap(scene)
    const host = canvas.parentElement as WebGLHost | null
    // Return WGL so an animation driver can do BOTH tiers without re-importing:
    //  - uniforms/camera: find the live observable in `scene` and .notify(v)
    //  - data (positions): WGL.find_plots([uuid])[0].geometry.attributes.wgl_positions
    //      .array.set(frame); attr.needsUpdate = true;   (smooth, no Julia round-trip)
    // After the first gesture frame this `scene` is stale; the live one is on the canvas.
    if (!host || host.masqueDead) return { scene: sceneObj, WGL }
    enroll(host, canvas, WGL as WglBundle, scene, width, height, pxPerUnit, visible)
    return { scene: sceneObj, WGL }
}
