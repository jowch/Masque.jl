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
    }
    px_per_unit: number
    root_scene: WglScene | null
}

interface WglBundle {
    deserialize_scene: (data: unknown, screen: WglScreen) => WglScene
    start_renderloop: (scene: WglScene) => void
    delete_scene?: (id: unknown) => void
}

export interface PendingScene {
    scene: unknown
    pxPerUnit?: number
    width?: number
    height?: number
}

interface WglCanvas extends HTMLCanvasElement {
    wglmakie_screen?: WglScreen
    masqueReplaceScene?: (scene: unknown, pxPerUnit?: number, width?: number, height?: number) => void
    masquePendingScene?: PendingScene | null
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

function installSceneReplacer(canvas: WglCanvas, WGL: WglBundle): void {
    if (!canvas.wglmakie_screen) return
    canvas.masqueReplaceScene = (scene, pxPerUnit, width, height) => {
        replaceScene(canvas, WGL, scene, pxPerUnit, width, height)
    }
    const pending = canvas.masquePendingScene
    if (pending) {
        canvas.masquePendingScene = null
        canvas.masqueReplaceScene(pending.scene, pending.pxPerUnit, pending.width, pending.height)
    }
}

export async function mountWebGL({ canvas, wglBundleUrl, scene, width, height, pxPerUnit = 2 }: MountArgs) {
    const WGL = await import(/* @vite-ignore */ wglBundleUrl)
    ;(window as any).Bonito = makeBonitoShim()    // WGLMakie reads window.Bonito globals
    const wrapper = canvas.parentElement
    const sceneObj = rewrap(scene)
    WGL.setup_scene_init(
        wrapper, canvas,
        width, height,
        null,                  // resize_to (fixed size -> overlay alignment holds)
        pxPerUnit, 1,
        obs([width, height]),  // real_size
        obs([width, height]),  // canvas_width
        obs(sceneObj),         // scene_serialized (.value set -> immediate init)
        new ((window as any).Bonito._ConnStub)(),
        30,                    // framerate
        obs(false),            // done_init
    )
    // setup_scene_init may write canvas CSS to the framebuffer size (wider than
    // `.ip-host`). Keep the element display-sized so the overlay can pin to it.
    canvas.style.width = "100%"
    canvas.style.height = "auto"
    installSceneReplacer(canvas as WglCanvas, WGL as WglBundle)
    // Return WGL so an animation driver can do BOTH tiers without re-importing:
    //  - uniforms/camera: find the live observable in `scene` and .notify(v)
    //  - data (positions): WGL.find_plots([uuid])[0].geometry.attributes.wgl_positions
    //      .array.set(frame); attr.needsUpdate = true;   (smooth, no Julia round-trip)
    // After the first gesture frame this `scene` is stale; the live one is on the canvas.
    return { scene: sceneObj, WGL }
}
