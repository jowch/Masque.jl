// Makie blocks drawn as native HTML controls (widget design §3, #345). Julia leaves each named
// block's box empty in the picture and ships a :control layer with its box and state; this
// module puts a real <input>/<select> over that box. The element owns its own pointer and
// keyboard input, so none of the overlay's gestures see it.
import { fmtNum } from "./template"
import type { ControlGeometry, HitLayer, Manifest } from "./types"

// A field's envelope, as every control commits it. The payload is a 0-based index, a pair of
// them, or a Bool; Julia turns it into the block's plain value.
export type ControlEnvelope = { layer: string; index: number; payload: unknown }

export interface ControlHooks {
    // A release, a click, a key step or a menu pick: the field's new value.
    commit_: (id: string, env: ControlEnvelope) => void
    // A slider moving under `onchange` (not `settleOnly`): redraw without committing.
    live_: (id: string, env: ControlEnvelope) => void
    digits_: number
}

interface ControlEl {
    layer_: HitLayer
    box_: HTMLElement
    get_: () => unknown
    set_: (payload: unknown) => void
}

export interface Controls {
    // A new frame's manifest: boxes move with the layout; values stay as the reader set them.
    update_: (m: Manifest) => void
    // A value written from outside (Pluto restoring the bond on reload).
    set_: (id: string, env: unknown) => void
    remove_: () => void
}

export const CONTROLS_STYLE = `
.masque-controls { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
.masque-control { position: absolute; box-sizing: border-box; pointer-events: auto; container-type: size;
  display: flex; align-items: center; justify-content: center; --masque-ctl: #4e7fb4; }
.masque-control input, .masque-control select { margin: 0; font: inherit; }
.masque-control input:focus-visible, .masque-control select:focus-visible { outline: 2px solid var(--masque-chrome, Highlight); outline-offset: 2px; }
/* Slider: Makie's look, drawn here: a rounded bar the box's thickness, filled up to a knob as
   wide as the bar. The <input> sits on top, invisible, and takes the pointer and keys; its thumb
   is the knob's size, so it travels the same span (half a knob in from each end). --a and --b
   are the fill's two ends and the knobs, as fractions of that span. */
.masque-range { -webkit-appearance: none; appearance: none; position: absolute; inset: 0; width: 100%; height: 100%;
  margin: 0; opacity: 0; cursor: pointer; background: transparent; }
.masque-range.v { writing-mode: vertical-lr; direction: rtl; }
.masque-range::-webkit-slider-thumb { -webkit-appearance: none; width: 100cqmin; height: 100cqmin; }
.masque-range::-moz-range-thumb { width: 100cqmin; height: 100cqmin; border: none; }
.masque-range:focus-visible { outline: none; }
.masque-control:has(.masque-range:focus-visible) .masque-knob { outline: 2px solid var(--masque-chrome, Highlight); outline-offset: 2px; }
.masque-track { position: absolute; inset: 0; pointer-events: none; --span: calc(100% - 100cqmin); }
.masque-bar, .masque-fill, .masque-knob { position: absolute; }
.masque-bar { border-radius: 100cqmin; background: var(--masque-ctl-off, #f0f0f0); }
.masque-fill { background: var(--masque-ctl-fill, var(--masque-ctl)); }
.masque-knob { width: 100cqmin; height: 100cqmin; border-radius: 50%; background: var(--masque-ctl); }
.masque-track.h .masque-bar { inset: 0; }
.masque-track.h .masque-fill { top: 0; bottom: 0; left: calc(50cqmin + var(--a) * var(--span)); width: calc((var(--b) - var(--a)) * var(--span)); }
.masque-track.h .masque-knob { top: 0; left: calc(var(--k) * var(--span)); }
.masque-track.v .masque-bar { inset: 0; }
.masque-track.v .masque-fill { left: 0; right: 0; bottom: calc(50cqmin + var(--a) * var(--span)); height: calc((var(--b) - var(--a)) * var(--span)); }
.masque-track.v .masque-knob { left: 0; bottom: calc(var(--k) * var(--span)); }
/* A plain slider's fill starts at the bar's own rounded end. */
.masque-track.from0.h .masque-fill { left: 0; width: calc(50cqmin + var(--b) * var(--span)); border-radius: 100cqmin 0 0 100cqmin; }
.masque-track.from0.v .masque-fill { bottom: 0; height: calc(50cqmin + var(--b) * var(--span)); border-radius: 0 0 100cqmin 100cqmin; }
/* Toggle: a pill with a knob, as Makie draws it. */
.masque-toggle { -webkit-appearance: none; appearance: none; cursor: pointer; position: relative; margin: 0;
  width: 100%; height: 100%; border-radius: 100cqmin; background: var(--masque-ctl-off, #f0f0f0); transition: background 0.15s; }
.masque-toggle::after { content: ""; position: absolute; top: 15%; left: 7.5cqh; height: 70%; aspect-ratio: 1;
  border-radius: 50%; background: var(--masque-ctl); transition: left 0.15s; }
.masque-toggle:checked { background: var(--masque-ctl-fill, color-mix(in srgb, var(--masque-ctl) 50%, #ffffff)); }
.masque-toggle:checked::after { left: calc(100% - 77.5cqh); }
.masque-check { width: 100cqmin; height: 100cqmin; accent-color: var(--masque-ctl); cursor: pointer; }
.masque-select { width: 100%; height: 100%; font-family: system-ui, sans-serif; font-size: 50cqh; padding: 0 0.5em; border: none; border-radius: 0;
  background: #f0f0f0; color: #000000; cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .masque-toggle, .masque-toggle::after { transition: none; } }
`

function envelope(id: string, payload: unknown): ControlEnvelope {
    return { layer: id, index: 0, payload }
}

// The text a screen reader reads for slider position `k`.
function valueText(g: ControlGeometry, k: number, digits: number): string {
    if (g.labels) return g.labels[k] ?? String(k)
    if (g.range) return fmtNum(g.range[0] + k * g.range[1], digits)
    return String(k)
}

function place(box: HTMLElement, g: ControlGeometry, m: Manifest): void {
    box.style.left = `${(100 * g.x) / m.width}%`
    box.style.top = `${(100 * g.y) / m.height}%`
    box.style.width = `${(100 * g.w) / m.width}%`
    box.style.height = `${(100 * g.h) / m.height}%`
    if (g.color) box.style.setProperty("--masque-ctl", g.color)
    if (g.fill) box.style.setProperty("--masque-ctl-fill", g.fill)
    if (g.off) box.style.setProperty("--masque-ctl-off", g.off)
}

function rangeInput(g: ControlGeometry, k: number, label: string, digits: number): HTMLInputElement {
    const el = document.createElement("input")
    el.type = "range"
    el.className = `masque-range ${g.horizontal === false ? "v" : "h"}`
    el.min = "0"
    el.max = String(Math.max(0, (g.n ?? 1) - 1))
    el.step = "1"
    el.value = String(k)
    el.setAttribute("aria-label", label)
    el.setAttribute("aria-valuetext", valueText(g, k, digits))
    if (g.horizontal === false) el.setAttribute("aria-orientation", "vertical")
    return el
}

// The bar, its fill, and one knob per thumb. `from0`: a plain slider, filled from the bar's end.
function track(g: ControlGeometry, knobs: number): HTMLElement {
    const t = document.createElement("div")
    t.className = `masque-track ${g.horizontal === false ? "v" : "h"}${knobs === 1 ? " from0" : ""}`
    const bar = document.createElement("div")
    bar.className = "masque-bar"
    const fill = document.createElement("div")
    fill.className = "masque-fill"
    t.append(bar, fill)
    for (let i = 0; i < knobs; i++) {
        const k = document.createElement("div")
        k.className = "masque-knob"
        t.append(k)
    }
    return t
}

// The fill from `lo` to `hi` and each knob at its index, as fractions of the knob's travel.
function fillTrack(t: HTMLElement, g: ControlGeometry, lo: number, hi: number, knobs: number[]): void {
    const last = Math.max(1, (g.n ?? 1) - 1)
    t.style.setProperty("--a", String(lo / last))
    t.style.setProperty("--b", String(hi / last))
    t.querySelectorAll<HTMLElement>(".masque-knob").forEach((el, i) => el.style.setProperty("--k", String(knobs[i] / last)))
}

function build(layer: HitLayer, m: Manifest, hooks: ControlHooks): ControlEl | null {
    const g = layer.geometry as ControlGeometry
    const id = layer.id
    const label = layer.label ?? id
    const box = document.createElement("div")
    box.className = `masque-control masque-ctl-${g.control}`
    box.dataset.masqueControl = id
    place(box, g, m)
    // The overlay's own pointer, wheel and key handlers sit on the surface underneath; a
    // control's events stop here so dragging a knob never pans or picks.
    for (const t of ["pointerdown", "pointermove", "pointerup", "wheel", "keydown", "click", "dblclick"]) {
        box.addEventListener(t, (e) => e.stopPropagation())
    }
    const live = g.settleOnly !== true
    switch (g.control) {
        case "slider": {
            const t = track(g, 1)
            const el = rangeInput(g, Number(g.value), label, hooks.digits_)
            const show = () => {
                const k = Number(el.value)
                fillTrack(t, g, 0, k, [k])
                el.setAttribute("aria-valuetext", valueText(g, k, hooks.digits_))
            }
            show()
            el.addEventListener("input", () => {
                show()
                if (live) hooks.live_(id, envelope(id, Number(el.value)))
            })
            el.addEventListener("change", () => hooks.commit_(id, envelope(id, Number(el.value))))
            box.append(t, el)
            return {
                layer_: layer, box_: box, get_: () => Number(el.value),
                set_: (p) => { if (typeof p === "number") { el.value = String(p); show() } },
            }
        }
        case "intervalslider": {
            const [k0, k1] = (g.value as number[]) ?? [0, 0]
            const t = track(g, 2)
            const lo = rangeInput(g, k0, `${label}, low`, hooks.digits_)
            const hi = rangeInput(g, k1, `${label}, high`, hooks.digits_)
            box.classList.add("masque-interval")
            const pair = (): [number, number] => {
                const a = Number(lo.value), b = Number(hi.value)
                return a <= b ? [a, b] : [b, a]
            }
            const show = () => {
                const [a, b] = pair()
                fillTrack(t, g, a, b, [Number(lo.value), Number(hi.value)])
                lo.setAttribute("aria-valuetext", valueText(g, Number(lo.value), hooks.digits_))
                hi.setAttribute("aria-valuetext", valueText(g, Number(hi.value), hooks.digits_))
            }
            show()
            for (const el of [lo, hi]) {
                el.addEventListener("input", () => {
                    show()
                    if (live) hooks.live_(id, envelope(id, pair()))
                })
                el.addEventListener("change", () => hooks.commit_(id, envelope(id, pair())))
            }
            box.append(t, lo, hi)
            return {
                layer_: layer, box_: box, get_: pair,
                set_: (p) => {
                    if (!Array.isArray(p) || p.length !== 2) return
                    lo.value = String(p[0])
                    hi.value = String(p[1])
                    show()
                },
            }
        }
        case "toggle":
        case "checkbox": {
            const el = document.createElement("input")
            el.type = "checkbox"
            el.className = g.control === "toggle" ? "masque-toggle" : "masque-check"
            if (g.control === "toggle") el.setAttribute("role", "switch")
            el.checked = g.value === true
            el.setAttribute("aria-label", label)
            el.addEventListener("change", () => hooks.commit_(id, envelope(id, el.checked)))
            box.append(el)
            return {
                layer_: layer, box_: box, get_: () => el.checked,
                set_: (p) => { if (typeof p === "boolean") el.checked = p },
            }
        }
        case "menu": {
            const el = document.createElement("select")
            el.className = "masque-select"
            el.setAttribute("aria-label", label)
            const k = Number(g.value)
            if (k < 0) {
                // Makie's menu with nothing chosen yet shows its prompt.
                const o = document.createElement("option")
                o.value = "-1"
                o.textContent = "Select…"
                o.disabled = true
                el.append(o)
            }
            ;(g.labels ?? []).forEach((text, i) => {
                const o = document.createElement("option")
                o.value = String(i)
                o.textContent = text
                el.append(o)
            })
            el.value = String(k)
            el.addEventListener("change", () => hooks.commit_(id, envelope(id, Number(el.value))))
            box.append(el)
            return {
                layer_: layer, box_: box, get_: () => Number(el.value),
                set_: (p) => { if (typeof p === "number") el.value = String(p) },
            }
        }
        default:
            return null
    }
}

export function buildControls(parent: ShadowRoot | HTMLElement, manifest: Manifest, hooks: ControlHooks): Controls {
    const layer = document.createElement("div")
    layer.className = "masque-controls"
    const els = new Map<string, ControlEl>()
    for (const l of manifest.layers) {
        if (l.kind !== "control") continue
        const c = build(l, manifest, hooks)
        if (!c) continue
        els.set(l.id, c)
        layer.append(c.box_)
    }
    if (els.size) parent.append(layer)
    return {
        update_(m) {
            for (const l of m.layers) {
                const c = l.kind === "control" ? els.get(l.id) : undefined
                if (!c) continue
                c.layer_ = l
                place(c.box_, l.geometry as ControlGeometry, m)
            }
        },
        set_(id, env) {
            const c = els.get(id)
            if (c && env && typeof env === "object" && "payload" in env) c.set_((env as ControlEnvelope).payload)
        },
        remove_() {
            layer.remove()
            els.clear()
        },
    }
}
