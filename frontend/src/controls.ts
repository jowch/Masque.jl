// Makie blocks drawn as native HTML controls (widget design §3, #345). Julia leaves each named
// block's box empty in the picture and ships a :control layer with its box and state; this
// module puts a real <input>/<select> over that box. The element owns its own pointer and
// keyboard input, so none of the overlay's gestures see it.
import { fmtNum } from "./template"
import type { ControlGeometry, HitLayer, Manifest, ValueLabel } from "./types"

// A field's envelope, as every control commits it. The payload is a 0-based index, a pair of
// them, or a Bool; Julia turns it into the block's plain value.
export type ControlEnvelope = { layer: string; index: number; payload: unknown }

export interface ControlHooks {
    // A release, a click, a key step or a menu pick: the field's new value.
    commit_: (id: string, env: ControlEnvelope) => void
    // A slider moving under `onchange` (not `settleOnly`): redraw without committing.
    live_: (id: string, env: ControlEnvelope) => void
    // A value `onchange` gave the block itself: the field takes it without another round trip.
    adopt_: (id: string, env: ControlEnvelope) => void
    digits_: number
}

interface ControlEl {
    layer_: HitLayer
    shape_: string
    box_: HTMLElement
    get_: () => unknown
    set_: (payload: unknown) => void
    // A new frame's colours for a control drawn here (a checkbox), without building it again.
    restyle_?: (g: ControlGeometry) => void
}

export interface Controls {
    // A new frame's manifest: boxes move with the layout. For an `onchange` frame, `sent` is the
    // state the request carried: a control whose options or range changed is built again, and
    // one whose value differs from what was sent (the author's function set it) takes it.
    update_: (m: Manifest, sent: Record<string, unknown> | null) => void
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
/* Two knobs: each input takes the pointer only on its own thumb, so either knob can be dragged;
   a press on the bar moves the nearer knob (controls.ts). */
.masque-interval .masque-range { pointer-events: none; }
.masque-interval .masque-range::-webkit-slider-thumb { pointer-events: auto; }
.masque-interval .masque-range::-moz-range-thumb { pointer-events: auto; }
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
/* Toggle, as Makie draws it: a rounded track turned by the block's orientation and a round knob
   that slides between the box's ends. Lengths are in --u, one image px as a share of the box.
   The <input> sits on top, invisible, and takes the pointer and keys. */
.masque-toggle { -webkit-appearance: none; appearance: none; position: absolute; inset: 0; width: 100%; height: 100%;
  margin: 0; opacity: 0; cursor: pointer; }
/* Makie eases the slide and the colour with sineio(), and its knob grows by 15% under the
   pointer at once. */
.masque-toggle-track, .masque-toggle-knob { position: absolute; pointer-events: none; --sineio: cubic-bezier(0.37, 0, 0.63, 1); }
.masque-toggle-track { left: calc(var(--u) * var(--x)); top: calc(var(--u) * var(--y)); width: calc(var(--u) * var(--len));
  height: calc(var(--u) * var(--th)); border-radius: calc(var(--u) * var(--th) * 0.499); rotate: var(--turn);
  transform-origin: calc(var(--u) * var(--th) / 2) calc(var(--u) * var(--th) / 2);
  background: var(--masque-ctl-off, #f0f0f0); transition: background var(--dur, 0.15s) var(--sineio); }
.masque-toggle:checked ~ .masque-toggle-track { background: var(--masque-ctl-fill, color-mix(in srgb, var(--masque-ctl) 50%, #ffffff)); }
.masque-toggle-knob { left: calc(var(--u) * var(--x)); top: calc(var(--u) * var(--y)); width: calc(var(--u) * var(--d));
  height: calc(var(--u) * var(--d)); border-radius: 50%; background: var(--masque-ctl); translate: -50% -50%;
  transition: left var(--dur, 0.15s) var(--sineio), top var(--dur, 0.15s) var(--sineio); }
.masque-control:hover .masque-toggle-knob { scale: 1.15; }
.masque-toggle:focus-visible ~ .masque-toggle-track { outline: 2px solid var(--masque-chrome, Highlight); outline-offset: 2px; }
/* Checkbox, as Makie draws it: an SVG square and checkmark under an invisible <input>. */
.masque-check { -webkit-appearance: none; appearance: none; position: absolute; inset: 0; width: 100%; height: 100%;
  margin: 0; opacity: 0; cursor: pointer; }
.masque-check-art { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.masque-check-art .mark { visibility: hidden; }
.masque-check:checked ~ .masque-check-art .mark, .masque-control:hover .masque-check-art .mark { visibility: visible; }
.masque-check:focus-visible ~ .masque-check-art .box { outline: 2px solid var(--masque-chrome, Highlight); outline-offset: 2px; }
/* Button, as Makie draws it: a rounded box with its label in the middle, in one colour pair at
   rest, another under the pointer and a third while pressed. Makie centres the outline on the
   box's edge and clips it to the box: --sw is half its width, drawn inside and out, and the
   button clips itself to its box. The focus ring goes on the box, outside that clip. */
.masque-control .masque-button { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: none; cursor: pointer;
  font-family: "TeX Gyre Heros", Helvetica, Arial, sans-serif; font-size: var(--fs); line-height: 1; white-space: nowrap;
  border-radius: var(--r, 0); box-shadow: 0 0 0 var(--sw, 0) var(--sc, transparent), inset 0 0 0 var(--sw, 0) var(--sc, transparent);
  clip-path: inset(0); outline: none; background: var(--b0); color: var(--t0); }
.masque-control .masque-button:hover { background: var(--b1); color: var(--t1); }
.masque-control .masque-button:active { background: var(--b2); color: var(--t2); }
.masque-control:has(.masque-button:focus-visible) { outline: 2px solid var(--masque-chrome, Highlight); outline-offset: 2px; }
.masque-vlabel { position: absolute; display: flex; align-items: center; justify-content: flex-end; white-space: nowrap;
  pointer-events: none; font-family: "TeX Gyre Heros", Helvetica, Arial, sans-serif; font-size: var(--fs); line-height: 1; }
.masque-control .masque-select { width: 100%; height: 100%; font-family: "TeX Gyre Heros", Helvetica, Arial, sans-serif; border: none; border-radius: 0; cursor: pointer;
  font-size: var(--fs, 50cqh); padding: 0 0 0 var(--pad, 0.5em); background: var(--masque-ctl-off, #f0f0f0); color: var(--masque-ctl-text, #000000); }
@media (prefers-reduced-motion: reduce) { .masque-toggle-track, .masque-toggle-knob { transition: none; } }
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
    // A menu's text, which `onchange` can restyle: image px as a share of the box's width, so it
    // scales with the figure.
    if (g.text) box.style.setProperty("--masque-ctl-text", g.text)
    if (g.fontsize !== undefined) box.style.setProperty("--fs", `${(100 * g.fontsize) / g.w}cqw`)
    if (g.padding !== undefined) box.style.setProperty("--pad", `${(100 * g.padding) / g.w}cqw`)
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

const SVG = "http://www.w3.org/2000/svg"

// Makie's checkbox square and checkmark, from the block's geometry (src/controls.jl). Without it
// (an older manifest), a square filling the box's shorter side and a plain tick.
function checkArt(g: ControlGeometry, el: HTMLInputElement): { svg_: SVGSVGElement; show_: () => void; restyle_: (g: ControlGeometry) => void } {
    const svg = document.createElementNS(SVG, "svg")
    svg.setAttribute("class", "masque-check-art")
    svg.setAttribute("viewBox", `0 0 ${g.w} ${g.h}`)
    const size = g.size ?? Math.min(g.w, g.h)
    const rect = document.createElementNS(SVG, "rect")
    rect.setAttribute("class", "box")
    rect.setAttribute("x", String((g.w - size) / 2))
    rect.setAttribute("y", String((g.h - size) / 2))
    rect.setAttribute("width", String(size))
    rect.setAttribute("height", String(size))
    rect.setAttribute("rx", String(g.radius ?? 0))
    rect.setAttribute("stroke-width", String(g.stroke ?? 0))
    const mark = document.createElementNS(SVG, "path")
    mark.setAttribute("class", "mark")
    const m = g.markSize ?? size * 0.85
    // The path is in marker units with y up; screen y points down.
    mark.setAttribute("transform", `translate(${g.w / 2} ${g.h / 2}) scale(${m} ${-m})`)
    mark.setAttribute("d", g.mark ?? "M-0.4 0L-0.12 -0.3L0.4 0.35")
    if (!g.mark) {
        mark.setAttribute("fill", "none")
        mark.setAttribute("stroke-width", "0.12")
    }
    svg.append(rect, mark)
    let c = g
    const show = () => {
        const on = el.checked
        rect.setAttribute("fill", (on ? c.color : c.off) ?? (on ? "#4e7fb4" : "#ffffff"))
        rect.setAttribute("stroke", (on ? c.strokeOn : c.strokeOff) ?? "#4e7fb4")
        mark.setAttribute(g.mark ? "fill" : "stroke", (on ? c.markOn : c.markOff) ?? (on ? "#ffffff" : "transparent"))
    }
    show()
    return { svg_: svg, show_: show, restyle_: (g2) => { c = g2; show() } }
}

// Makie's toggle track and knob, placed from the block's geometry (src/controls.jl). Without
// it (an older manifest), a horizontal pill that fills the box.
function toggleParts(g: ControlGeometry, el: HTMLInputElement): { parts_: HTMLElement[]; show_: () => void } {
    const t = document.createElement("div")
    t.className = "masque-toggle-track"
    const k = document.createElement("div")
    k.className = "masque-toggle-knob"
    const [tx, ty, len, th] = g.track ?? [g.h / 2, g.h / 2, g.w, g.h]
    const set = (part: HTMLElement, vars: Record<string, number | string>) => {
        for (const [name, v] of Object.entries(vars)) part.style.setProperty(`--${name}`, String(v))
    }
    // Lengths are image px; --u, one image px as a share of the box's width, scales them with
    // the figure. Makie's track runs from (-th/2, -th/2) to (len - th/2, th/2) about (tx, ty),
    // turned by theta; screen y points down, so the turn is clockwise here.
    set(t, { u: `${100 / g.w}cqw`, x: tx - th / 2, y: ty - th / 2, len, th, turn: `${-(g.theta ?? 0)}rad` })
    set(k, { u: `${100 / g.w}cqw`, d: g.knob ?? th * 0.67 })
    if (g.duration !== undefined) for (const part of [t, k]) part.style.setProperty("--dur", `${g.duration}s`)
    const off = g.knobOff ?? [th / 2, th / 2]
    const on = g.knobOn ?? [g.w - th / 2, th / 2]
    const show = () => {
        const [x, y] = el.checked ? on : off
        set(k, { x, y })
    }
    show()
    el.addEventListener("change", show)
    return { parts_: [t, k], show_: show }
}

// What a control is built from, apart from its box and value: when this changes, it is built again.
function shape(g: ControlGeometry): string {
    // A range arrives as a typed array off the kernel and as a plain one from a docs player's
    // JSON frame; the same range is the same shape either way.
    if (g.sliders) return JSON.stringify([g.control, g.sliders.map(shape), g.sliders.map((c) => [c.valueLabel?.labels?.length, c.valueLabel?.pairs?.length])])
    return JSON.stringify([g.control, g.n, g.horizontal, g.range && Array.from(g.range), g.labels, g.settleOnly, g.theta, g.track, g.knobOff, g.knobOn, g.knob, g.duration, g.prompt, g.size, g.radius, g.stroke, g.mark, g.markSize, g.next])
}

// A button's label and colours, which `onchange` can change without building it again. Lengths
// are image px as a share of the box's width, so they scale with the figure.
function styleButton(el: HTMLButtonElement, g: ControlGeometry): void {
    el.textContent = g.caption ?? ""
    const set = (name: string, v: string | undefined) => { if (v !== undefined) el.style.setProperty(`--${name}`, v) }
    const px = (v: number | undefined) => v === undefined ? undefined : `${(100 * v) / g.w}cqw`
    set("fs", px(g.fontsize))
    set("r", px(g.radius))
    set("sw", px(g.stroke === undefined ? undefined : g.stroke / 2))
    set("sc", g.strokeColor)
    g.colors?.forEach((c, i) => set(`b${i}`, c))
    g.textColors?.forEach((c, i) => set(`t${i}`, c))
}

// The knob index under a pointer at (x, y) on a slider's box.
function indexAt(box: HTMLElement, g: ControlGeometry, x: number, y: number): number {
    const r = box.getBoundingClientRect()
    const vertical = g.horizontal === false
    const knob = Math.min(r.width, r.height)
    const span = (vertical ? r.height : r.width) - knob
    const along = vertical ? r.bottom - y - knob / 2 : x - r.left - knob / 2
    const last = Math.max(0, (g.n ?? 1) - 1)
    return span > 0 ? Math.max(0, Math.min(last, Math.round((along / span) * last))) : 0
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
                layer_: layer, shape_: shape(g), box_: box, get_: () => Number(el.value),
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
            // A press on the bar, away from both thumbs, moves the nearer knob there.
            box.addEventListener("pointerdown", (e) => {
                if (e.target === lo || e.target === hi || e.button !== 0) return
                const k = indexAt(box, g, e.clientX, e.clientY)
                const a = Number(lo.value), b = Number(hi.value)
                const el = Math.abs(k - a) < Math.abs(k - b) || (a === b && k < a) ? lo : hi
                el.value = String(k)
                el.focus()
                show()
                hooks.commit_(id, envelope(id, pair()))
            })
            for (const el of [lo, hi]) {
                el.addEventListener("input", () => {
                    show()
                    if (live) hooks.live_(id, envelope(id, pair()))
                })
                el.addEventListener("change", () => hooks.commit_(id, envelope(id, pair())))
            }
            box.append(t, lo, hi)
            return {
                layer_: layer, shape_: shape(g), box_: box, get_: pair,
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
            // Makie's checkbox sets itself to `onchange(checked)`: the browser flips the input,
            // and the rule says where it lands. A click that leaves it as it was commits nothing.
            let was = el.checked
            el.addEventListener("change", () => {
                if (g.next) el.checked = g.next[was ? 1 : 0]
                const now = el.checked
                art?.show_()
                tp?.show_()
                if (now === was) return
                was = now
                hooks.commit_(id, envelope(id, now))
            })
            box.append(el)
            const tp = g.control === "toggle" ? toggleParts(g, el) : null
            if (tp) box.append(...tp.parts_)
            const art = g.control === "checkbox" ? checkArt(g, el) : null
            if (art) box.append(art.svg_)
            return {
                layer_: layer, shape_: shape(g), box_: box, get_: () => el.checked,
                set_: (p) => { if (typeof p === "boolean") { el.checked = was = p; tp?.show_(); art?.show_() } },
                restyle_: art?.restyle_,
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
                o.textContent = g.prompt ?? "Select…"
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
                layer_: layer, shape_: shape(g), box_: box, get_: () => Number(el.value),
                set_: (p) => { if (typeof p === "number") el.value = String(p) },
            }
        }
        case "button": {
            // The field counts clicks, as Makie's `clicks` does.
            const el = document.createElement("button")
            el.type = "button"
            el.className = "masque-button"
            styleButton(el, g)
            let clicks = Number(g.value) || 0
            el.addEventListener("click", () => {
                clicks += 1
                hooks.commit_(id, envelope(id, clicks))
            })
            box.append(el)
            return {
                layer_: layer, shape_: shape(g), box_: box, get_: () => clicks,
                set_: (p) => { if (typeof p === "number") clicks = p },
                restyle_: (ng) => styleButton(el, ng),
            }
        }
        case "slidergrid": {
            // Each slider is built as a control of its own inside the grid's box, and the grid
            // commits all of their values together. The value labels are drawn here too.
            box.style.pointerEvents = "none"
            const local = { width: g.w, height: g.h } as Manifest
            const values = () => kids.map((k) => k.get_())
            const kidHooks: ControlHooks = {
                commit_: () => { showLabels(); hooks.commit_(id, envelope(id, values())) },
                live_: () => hooks.live_(id, envelope(id, values())),
                adopt_: () => {},
                digits_: hooks.digits_,
            }
            const kids: ControlEl[] = []
            const labels: [HTMLElement, ControlGeometry, ValueLabel | undefined][] = []
            ;(g.sliders ?? []).forEach((cg, i) => {
                const kg = { ...cg, x: cg.x - g.x, y: cg.y - g.y }
                const kid = build({ ...layer, id: `${id}-${i}`, label: `${label} ${i + 1}`, geometry: kg }, local, kidHooks)
                if (!kid) return
                kids.push(kid)
                box.append(kid.box_)
                const vl = cg.valueLabel
                const el = document.createElement("div")
                el.className = "masque-vlabel"
                if (vl) {
                    el.style.left = `${(100 * (vl.x - g.x)) / g.w}%`
                    el.style.top = `${(100 * (vl.y - g.y)) / g.h}%`
                    el.style.width = `${(100 * vl.w) / g.w}%`
                    el.style.height = `${(100 * vl.h) / g.h}%`
                    el.style.setProperty("--fs", `${(100 * vl.fontsize) / g.w}cqw`)
                    el.style.color = vl.color
                    box.append(el)
                }
                labels.push([el, cg, vl])
            })
            const showLabels = () => labels.forEach(([el, cg, vl], i) => {
                const v = kids[i]?.get_()
                if (Array.isArray(v)) {
                    const [a, b] = v as number[]
                    el.textContent = vl?.pairs?.[a * (cg.n ?? 0) + b] ?? `(${valueText(cg, a, hooks.digits_)}, ${valueText(cg, b, hooks.digits_)})`
                } else {
                    el.textContent = vl?.labels?.[Number(v)] ?? valueText(cg, Number(v), hooks.digits_)
                }
            })
            showLabels()
            box.addEventListener("input", showLabels)
            box.addEventListener("change", showLabels)
            return {
                layer_: layer, shape_: shape(g), box_: box, get_: values,
                set_: (p) => {
                    if (!Array.isArray(p)) return
                    p.forEach((q, i) => kids[i]?.set_(q))
                    showLabels()
                },
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
    // The control the reader is dragging: a frame leaves it alone until the release's frame.
    let held: string | null = null
    const release = () => { held = null }
    const make = (l: HitLayer, m: Manifest): ControlEl | null => {
        const c = build(l, m, hooks)
        if (!c) return null
        c.box_.addEventListener("pointerdown", () => { held = l.id }, { capture: true })
        return c
    }
    window.addEventListener("pointerup", release, true)
    window.addEventListener("pointercancel", release, true)
    for (const l of manifest.layers) {
        if (l.kind !== "control") continue
        const c = make(l, manifest)
        if (!c) continue
        els.set(l.id, c)
        layer.append(c.box_)
    }
    if (els.size) parent.append(layer)
    return {
        update_(m, sent) {
            for (const l of m.layers) {
                let c = l.kind === "control" ? els.get(l.id) : undefined
                if (!c) continue
                const g = l.geometry as ControlGeometry
                // The block can't change without the author's function, which runs only for an
                // `onchange` frame; a control the reader is dragging stays as it is.
                const was = sent?.[l.id]
                const sentValue = was && typeof was === "object" && "payload" in was ? JSON.stringify((was as ControlEnvelope).payload) : undefined
                if (sentValue === undefined || held === l.id) {
                    c.layer_ = l
                    place(c.box_, g, m)
                    c.restyle_?.(g)
                    continue
                }
                if (shape(g) !== c.shape_) {
                    const fresh = make(l, m)
                    if (!fresh) continue
                    c.box_.replaceWith(fresh.box_)
                    els.set(l.id, fresh)
                    c = fresh
                } else {
                    c.layer_ = l
                    place(c.box_, g, m)
                    c.restyle_?.(g)
                }
                // The author moved the block: the control and the field follow. Otherwise the
                // frame echoes what was sent, and the control keeps what the reader has now.
                if (JSON.stringify(g.value) !== sentValue) {
                    c.set_(g.value)
                    hooks.adopt_(l.id, envelope(l.id, g.value))
                }
            }
        },
        set_(id, env) {
            const c = els.get(id)
            if (c && env && typeof env === "object" && "payload" in env) c.set_((env as ControlEnvelope).payload)
        },
        remove_() {
            window.removeEventListener("pointerup", release, true)
            window.removeEventListener("pointercancel", release, true)
            layer.remove()
            els.clear()
        },
    }
}
