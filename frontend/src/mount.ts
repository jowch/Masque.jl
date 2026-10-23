import { SVG_NS, renderSelection, clearHiImmediate, clearLinkImmediate } from "./highlight"
import { hitLayerByIndex, keptPicks, linePointHit, picksPoints, sameValue, selectionForValue, surfaceSelection } from "./selection"
import { emptyMask, maskHit } from "./gridmask"
import { applyMove, onLeave, hideTip, setTipText, setTipVisible, placeTip, tipOffset, syncFocusTip } from "./hover"
import { buildCross, hideCross } from "./cross"
import { onDown, onUp, onCancel, onLostCapture, onClick, onPointerMove } from "./bond"
import { buildFocusable, computeLayerStarts, focusTo, handleKeydown } from "./keyboard"
import { buildDragStops } from "./dragkeys"
import type { DragStops } from "./dragkeys"
import * as thresholdDrag from "./drag/threshold"
import * as roiDrag from "./drag/roi"
import { limitsTip } from "./drag/view"
import * as viewDrag from "./drag/view"
import { createGestureChannel } from "./gesture"
import { buildControls, CONTROLS_STYLE } from "./controls"
import { DEFAULT_SIGDIGITS } from "./template"
import type { GestureChannel } from "./gesture"
import type { FrameResponse, RenderFrame } from "./gesture"
import { isLightBackground } from "./color"
import { createFade } from "./fade"
import { createOverlayState, cancelPendingMove, cancelPendingDrag, layoutImagePx, oneHome, MOTION_MS, NOTE_MS } from "./state"
import type { HiGroups, HiSet, OverlayCtx } from "./state"
import type { Hit, Limits3, Manifest, ViewGeometry } from "./types"
import { axisFrame, layoutSpaceLayer, linkedMove, matrixLimits } from "./geometry"
import { IDENTITY, isIdentity, mapPoint, residual, unmapPoint, wheelScale, zoomAt, WHEEL_IDLE_MS } from "./photo"
import type { PhotoMatrix } from "./photo"

// Keys held for a Cmd/Ctrl/Shift/Alt-click; pressing one is not keyboard use.
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"])

// Single source for the two highlight tint strengths (mount.ts's STYLE reads both; the e2e
// drivers assert these exact computed fillOpacity values) — hover tints lightly, selection more
// strongly, so the two states stay visually distinct in the same derived colour.
const HOVER_FILL_OPACITY = 0.18
const SELECTED_FILL_OPACITY = 0.35
// How much of a plot's unpicked marks still shows once it holds picks (fade.ts).
const UNPICKED_OPACITY = 0.2

// Fill/edge split highlight (highlight.ts's makeHiElement, the default for every layer without
// an explicit hoverstyle stroke). The fill BRIGHTENS (color-dodge, source #141414 — measured
// across a 10-colour palette as the only candidate that never rotated hue >8° and never dimmed
// a mark). The edge stroke is its own flat colour, not blended into the mark: the same chrome
// grey for hover and selected, so only the width (1.5 vs 2) separates the two states. Control
// chrome (ROI outline, threshold, selected-open ring) uses that same grey; ROI grips are a
// white square with a 1px chrome stroke (.masque-handle). One source here; mount() below picks
// light vs dark from the figure's own background and writes it onto the shadow host.
const HI_STYLE = {
    // `cross` is a step quieter than `chrome` (the selection edge). Light moves toward white,
    // dark moves toward black by the same amount, so the hairline is not the same ink as a
    // selected mark.
    light: { chrome: "#7a7a7a", fillSrc: "#141414", cross: "#b0b0b0" },
    dark: { chrome: "#c8c8c8", fillSrc: "#141414", cross: "#929292" },
}

const STYLE = `
:host { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; }
.surface { position: absolute; inset: 0; cursor: crosshair; pointer-events: auto; }
.surface.passthrough { pointer-events: none; }
.surface.hot { cursor: pointer; }
.surface.grab { cursor: grab; }
.surface.grabbing { cursor: grabbing; }
.surface.cur-nwse { cursor: nwse-resize; }
.surface.cur-nesw { cursor: nesw-resize; }
.surface.cur-ns { cursor: ns-resize; }
.surface.cur-ew { cursor: ew-resize; }
.surface.cur-move { cursor: move; }
.masque-threshold-line { stroke-width: var(--masque-line-w, 2); }
.masque-threshold-line.hovered { stroke-width: calc(var(--masque-line-w, 2) * 1.75); }
.masque-cross { opacity: 0; transition: opacity ${MOTION_MS}ms ease-out; }
.masque-cross.is-on { opacity: 1; }
/* Halo first (figure background, wider), hairline on top at 80%. The fringe only shows where
   the line crosses a mark; on the empty axis it matches the background. The halo is 1.5px,
   half the earlier 3px, so the guide stays a hairline. */
.masque-cross-halo { stroke: var(--masque-fig-bg, #ffffff); stroke-width: var(--masque-cross-halo-width, 1.5); }
.masque-cross-hair { stroke: var(--masque-cross, #b0b0b0); stroke-width: var(--masque-cross-width, 1); stroke-opacity: var(--masque-cross-opacity, 0.8); }
.masque-cross circle { fill: var(--masque-cross, #b0b0b0); stroke: var(--masque-fig-bg, #ffffff); stroke-width: 1; }
/* Keyboard focus shows exactly one indicator (#168). Until a mark ring is drawn (kbd-ring, set
   by keyboard.ts's focusTo) — right after Tab, and always on a widget with nothing to arrow
   through (grid, axis, threshold, ROI, view, slice) — the surface draws an inset chrome outline
   in place of the user-agent rectangle. Once the ring is up it is the indicator and the outline
   goes. An outline, not a box-shadow, so forced colours still paint it, in Highlight. A press
   focuses the surface from script (#380), which Chromium counts as :focus-visible, so a click
   would draw the outline too; pointer-focus (set by bond.ts's onDown, cleared on a key or on
   focusout) keeps it off until a key is pressed. */
.surface:focus-visible:not(.kbd-ring) { outline: 2px solid var(--masque-chrome, Highlight); outline-offset: -2px; }
.surface.kbd-ring:focus-visible { outline: none; }
.surface.pointer-focus:focus-visible { outline: none; }
/* Drag-layer tab stops (#169): invisible boxes over the line, the box, or the viewport. They
   take keys only, never the pointer. The focus outline is the stop's whole indicator: outside
   the line and the box, inset on the viewport like the surface's. */
.drag-stop { position: absolute; box-sizing: border-box; pointer-events: none; }
.drag-stop:focus { outline: none; }
.drag-stop:focus-visible { outline: 2px solid var(--masque-chrome, Highlight); outline-offset: 3px; }
.drag-stop-view:focus-visible { outline-offset: -2px; }
@media (forced-colors: active) {
  .surface:focus-visible:not(.kbd-ring) { outline-color: Highlight; }
  .drag-stop:focus-visible { outline-color: Highlight; }
}
svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
       clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.masque-enter { animation: masque-in ${MOTION_MS}ms ease-out; }
.masque-leave { animation: masque-out ${MOTION_MS}ms ease-in forwards; }
@keyframes masque-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes masque-out { from { opacity: 1 } to { opacity: 0 } }
/* --masque-fig-bg (set by mount.ts from the manifest's "background" field) is the figure's own
   background colour — the tooltip theme follows IT, not just the OS prefers-color-scheme, so a
   dark Makie figure in a light Pluto page still gets a dark tooltip. Registering the property
   makes it interpolable/animatable and, more importantly, gives lch(from …) below a typed
   <color> to read "l" off — an unregistered custom property is a plain token stream, which
   relative-color syntax cannot decompose. 49.44 is the lch lightness of middle grey (#808080);
   calc(infinity) collapses the clamp() to its 12 (dark) or 100 (light) endpoint on either side
   of it, so the derived surface is always a flat near-white or near-black grey (chroma/hue 0),
   never a tint of the figure's own hue — the mark accent (added by tooltip_* / colors, not
   here) is the only place the figure's actual colour is allowed to show through. The trailing
   / 1 forces full opacity: omitting the alpha component of lch(from …) inherits the ORIGIN
   colour's own alpha, and masque() always forces the figure's background opaque before building
   the manifest, but a caller building the manifest directly (build_manifest's background
   kwarg, not through masque()) isn't guaranteed to. */
@property --masque-fig-bg { syntax: "<color>"; inherits: true; initial-value: #ffffff; }
:host {
  --masque-tip-bg-resolved: var(--masque-tip-bg, lch(from var(--masque-fig-bg) clamp(12, calc((l - 49.44) * infinity), 100) 0 0 / 1));
  --masque-tip-color-resolved: var(--masque-tip-color, lch(from var(--masque-fig-bg) clamp(12, calc((49.44 - l) * infinity), 100) 0 0 / 1));
  --masque-tip-border-resolved: var(--masque-tip-border, color-mix(in lch, var(--masque-tip-bg-resolved), var(--masque-tip-color-resolved) 20%));
}
/* Browsers without CSS relative colour syntax (no lch(from …)/calc(infinity)) fall back to
   exactly today's behaviour: a static light theme, OS prefers-color-scheme for dark — the
   figure's own background plays no part. */
@supports not (color: lch(from red calc(l * infinity) 0 0)) {
  :host {
    --masque-tip-bg-resolved: var(--masque-tip-bg, #ffffff);
    --masque-tip-color-resolved: var(--masque-tip-color, #1a1a1a);
    --masque-tip-border-resolved: var(--masque-tip-border, rgba(0,0,0,0.1));
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --masque-tip-bg-resolved: var(--masque-tip-bg, #1e1e1e);
      --masque-tip-color-resolved: var(--masque-tip-color, #e8e8e8);
      --masque-tip-border-resolved: var(--masque-tip-border, rgba(255,255,255,0.15));
    }
  }
}
/* Highlight ink. --masque-ink is tooltip text: near-black on light figures, near-white on dark
   ones (the tooltip colour, which already carries that lightness clamp off --masque-fig-bg).
   --masque-chrome is the control/highlight stroke (set at mount: #7a7a7a light, #c8c8c8 dark).
   An explicit per-layer hoverstyle stroke from Julia arrives inline as --masque-hi-stroke and
   is used verbatim (highlight.ts's unblended path, drawn into svg.masque-plain).
   Every other highlight (the default) is TWO bare shapes of identical geometry: a fill-only
   shape in svg.masque-fill and a stroke-only shape in svg.masque-edge. The fill svg carries
   color-dodge — Firefox only honours mix-blend-mode on a top-level svg, not nested SVG content,
   so the blend lives on that svg, not a per-shape wrapper. The edge svg does not blend: the
   stroke is its own colour, painted above the dodge fill. Browsers without mix-blend-mode draw
   the fill as chrome at 0.18 opacity; the edge stroke stays the flat chrome grey. */
:host { --masque-ink: var(--masque-tip-color-resolved); }
.masque-hi { --masque-hi-c: var(--masque-hi-stroke, var(--masque-chrome)); stroke: var(--masque-hi-c); fill: none; }
.masque-hi.masque-hover { fill: var(--masque-hi-c); fill-opacity: var(--masque-hover-fill-opacity, ${HOVER_FILL_OPACITY}); }
.masque-hi.masque-wash { fill: var(--masque-hi-c); fill-opacity: var(--masque-selected-fill-opacity, ${SELECTED_FILL_OPACITY}); }
/* Chrome metrics. Each width and opacity is a custom property whose fallback is the locked
   recipe, so a property set on the shadow host (or by a notebook rule) changes that metric
   alone. Classes, not stroke-width attributes: an attribute would hide the property. A
   per-layer hoverstyle width arrives inline on the element (--masque-roi-width,
   --masque-line-w) and wins over the host's value for that layer. */
.masque-w-hover { stroke-width: var(--masque-hover-width, 1.5); }
.masque-w-selected { stroke-width: var(--masque-selected-width, 2); }
.masque-ring-inner { stroke-width: var(--masque-ring-width, 2); stroke-opacity: 1; }
.masque-ring-outer { stroke-width: var(--masque-ring-halo-width, 4); stroke-opacity: var(--masque-ring-halo-opacity, 0.25); }
.masque-roi { stroke-width: var(--masque-roi-width, 1); }
.masque-hi.masque-nostroke { stroke: none; }
/* Element-prefixed, not bare .masque-fillshape: the dodge fill must not leak onto plain-svg
   chrome. ROI grips are .masque-handle (white fill, chrome stroke), not .masque-hi. */
svg.masque-fill { mix-blend-mode: color-dodge; }
svg.masque-fill .masque-hi.masque-fillshape { fill: var(--masque-hi-fill); fill-opacity: 1; stroke: none; }
svg.masque-edge .masque-hi.masque-hover,
svg.masque-edge .masque-hi.masque-wash { stroke: var(--masque-chrome); fill: none; }
.masque-handle { fill: var(--masque-handle-fill, #ffffff); stroke: var(--masque-hi-stroke, var(--masque-chrome)); stroke-width: var(--masque-handle-width, 1); vector-effect: non-scaling-stroke; }
@supports not (mix-blend-mode: color-dodge) {
  svg.masque-fill .masque-hi.masque-fillshape { fill: var(--masque-chrome); fill-opacity: var(--masque-noblend-fill-opacity, 0.18); }
}
/* The closed-mark selected look (fade.ts): the dim canvas covers a plot's unpicked marks in the
   plot area's colour, and its opacity leaves --masque-unpicked-opacity of them showing. */
.masque-fades, .masque-fade { position: absolute; inset: 0; pointer-events: none; }
.masque-fade canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; transform-origin: 0 0; }
.masque-fade canvas.masque-dim { opacity: calc(1 - var(--masque-unpicked-opacity, ${UNPICKED_OPACITY})); }
.masque-tip { position: absolute; opacity: 0; pointer-events: none; z-index: 10;
       padding: var(--masque-tip-padding, 8px 12px); border-radius: var(--masque-tip-radius, 4px);
       background: var(--masque-tip-bg-resolved); color: var(--masque-tip-color-resolved);
       border: 1px solid var(--masque-tip-border-resolved);
       border-left: var(--masque-mark-border, 1px solid var(--masque-tip-border-resolved));
       box-shadow: var(--masque-tip-shadow, 0 2px 4px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08));
       font: var(--masque-tip-font-size, 11px)/1.4 var(--masque-tip-font, system-ui, -apple-system, sans-serif);
       max-width: var(--masque-tip-maxwidth, 320px); white-space: normal;
       transition: opacity ${MOTION_MS}ms ease-out; }
.masque-tip.show { opacity: 1; }
/* left's containing block is .masque-tip's PADDING box (absolute-position offsets are measured
   from the padding edge, CSS 2.1 §10.1), 1px inside its own 1px border — and the 5px transparent
   left/right borders below put the visible apex at the horizontal CENTRE of this element's own
   box, 5px right of its left edge. --masque-caret-x (geometry.ts's caretX, or the pointer for
   hover.ts's placeTip) is "px from the tooltip's OUTER left edge to the anchor" — landing the
   apex exactly there needs both offsets backed out: -1 (border) -5 (this element's own
   half-width) = -6. The 14px fallback (hover.ts's CARET_INSET) covers placeAnchored's zero-size
   path, which removes the property; placeTip always sets it.
   The -1 above assumed the default 1px border-left; the 3px accent border (hover.ts's setMarkAccent, --masque-mark-border)
   pushes the padding box 2px further right, so the extra width beyond the baked-in 1px
   (--masque-mark-border-w, set alongside the accent) is backed out too. */
.masque-tip::before { content: ""; position: absolute; top: -5px;
       left: calc(var(--masque-caret-x, 14px) - 6px - var(--masque-mark-border-w, 1px) + 1px);
       border: 5px solid transparent; border-top: none; border-bottom-color: var(--masque-tip-bg-resolved);
       display: var(--masque-tip-caret, block); }
.masque-tip.flip-y::before { top: auto; bottom: -5px; border-bottom: none;
       border-top: 5px solid var(--masque-tip-bg-resolved); }
/* An \`onchange\` error: the last picture stays, and this says why it didn't change. */
.masque-note { position: absolute; left: 8px; bottom: 8px; opacity: 0; pointer-events: none; z-index: 11;
       padding: 4px 8px; border-radius: var(--masque-tip-radius, 4px);
       background: var(--masque-tip-bg-resolved); color: var(--masque-tip-color-resolved);
       border: 1px solid var(--masque-tip-border-resolved);
       font: var(--masque-tip-font-size, 11px)/1.4 var(--masque-tip-font, system-ui, -apple-system, sans-serif);
       max-width: calc(100% - 32px); transition: opacity ${MOTION_MS}ms ease-out; }
.masque-note.show { opacity: 1; }
.masque-tip-row { display: flex; gap: 8px; justify-content: space-between; }
.masque-tip-key { color: var(--masque-tip-accent, #6b7280); }
.masque-tip-val { font-variant-numeric: tabular-nums; }
@media (prefers-color-scheme: dark) {
  .masque-tip { box-shadow: var(--masque-tip-shadow, 0 2px 4px rgba(0,0,0,0.4), 0 8px 16px rgba(0,0,0,0.3)); }
}
@media (prefers-reduced-motion: reduce) {
  .masque-enter, .masque-leave { animation: none; }
  .masque-tip, .masque-cross, .masque-note { transition: none; }
}
`

interface Mounted {
    cleanup: () => void
}

// Names shared with the WebGL shim (a separate bundle). No trailing underscore: esbuild
// mangles those, and the two bundles are built apart.
interface WebGLHost extends HTMLElement {
    masqueRetargetBase?: (next: HTMLElement) => void
    masqueFlushPending?: () => void
    masquePendingFrame?: { input: Record<string, unknown>; r: FrameResponse } | null
    masqueRequestLive?: () => void
    masqueDetach?: () => void
    masqueDead?: boolean
    masqueWantsLive?: boolean
}

/**
 * Mount the interaction overlay.
 * @param scriptEl  the cell's <script> (its parent is the light-DOM host containing the <img>/<canvas> base)
 * @param manifest  hit-region manifest (from published_to_js or inlined JSON)
 * @param invalidation  Pluto's cleanup promise (resolves on cell re-render)
 * @param requestFrame  per-frame callback, or null when this widget has none
 */
export function mount(scriptEl: HTMLElement, manifest: Manifest, invalidation?: Promise<unknown>, requestFrame?: RenderFrame | null): Mounted {
    const hostEl = scriptEl.parentElement as WebGLHost | null
    // Image-px scale comes from manifest.width, not the element's intrinsic size, so a
    // <canvas> needs no sizer shim. The host is assumed to hold exactly one base element.
    // `let`: the WebGL scheduler swaps the canvas for a snapshot <img> (and back) and
    // retargets this binding. Hover math reads `ctx.base_`, which tracks it.
    const found = hostEl?.querySelector("img, canvas") as HTMLElement | null
    const noop: Mounted = { cleanup: () => {} }
    if (!hostEl || !found) return noop
    const host: WebGLHost = hostEl
    let base: HTMLElement = found

    // The @bind target is the host element. Seed the same value Julia's `mount_envelope`
    // reads, the manifest's `initial` (one envelope per field), or Pluto's mount-time read
    // overwrites `initial_value`. Every field is a key, `null` until something is picked.
    const fields = manifest.fields ?? []
    const hostValue: Record<string, unknown> = {}
    for (const f of fields) hostValue[f] = manifest.initial?.[f] ?? null
    // With \`onchange\` every field above is state, and the bond carries only \`bind\`'s. The
    // full state lives here; \`host.value\` is its bind part.
    const bindKeys = manifest.bind ?? null
    const toBond = (v: Record<string, unknown>): Record<string, unknown> => {
        if (!bindKeys) return v
        const out: Record<string, unknown> = {}
        for (const k of bindKeys) out[k] = v[k] ?? null
        return out
    }
    let stateValue: Record<string, unknown> = { ...hostValue }
    const currentState = (): Record<string, unknown> => {
        const v = (host as unknown as { value: unknown }).value
        return v && typeof v === "object" ? { ...stateValue, ...(v as Record<string, unknown>) } : stateValue
    }

    const shadowHost = document.createElement("div")
    const shadow = shadowHost.attachShadow({ mode: "open" })
    const style = document.createElement("style")
    style.textContent = STYLE + CONTROLS_STYLE

    // Three coordinate-identical top-level <svg>s. The fill svg carries color-dodge (Firefox
    // only honours mix-blend-mode on a top-level svg). The edge svg paints the flat chrome
    // stroke above that fill and does not blend. svg.masque-plain (ROI, threshold,
    // explicit-stroke highlights, the selected-open ring) paints over both.
    const makeOverlaySvg = (cls: string): SVGSVGElement => {
        const s = document.createElementNS(SVG_NS, "svg")
        s.setAttribute("viewBox", `0 0 ${manifest.width} ${manifest.height}`)
        s.setAttribute("preserveAspectRatio", "none")
        s.classList.add(cls)
        return s
    }
    const makeGroup = (parent: SVGElement, cls: string): SVGGElement => {
        const g = document.createElementNS(SVG_NS, "g")
        g.setAttribute("class", cls)
        parent.appendChild(g)
        return g
    }
    const fillSvg = makeOverlaySvg("masque-fill")
    const edgeSvg = makeOverlaySvg("masque-edge")
    const plainSvg = makeOverlaySvg("masque-plain")
    // Data-mark highlights live in one home per (svg, role, axis):
    // g.masque-clip[data-axis] > g.masque-photo > g.sel|g.link|g.hi. A live photograph sets each
    // axis's inner transform and outer clip (`paintAxis`), so a linked axis's ring slides with
    // its own data and an unlinked axis's stays put (#368). Every axis's g.sel comes before any
    // g.link, and every g.link before any g.hi, in each svg, so g.hi always paints over
    // g.link/g.sel whichever svg(s) any of the three lands in. A comment marks where each
    // role's homes end, so a home made later still lands in order. The tooltip is in none of them.
    const overlaySvgs = [fillSvg, edgeSvg, plainSvg]
    const svgKinds = ["fill", "edge", "plain"]
    const roles = ["sel", "link", "hi"] as const
    const roleEnds = overlaySvgs.map((svg) => roles.map((r) => svg.appendChild(document.createComment(r))))
    // Every axis home made so far, with its clip and photo groups per svg, for `paintAxis`.
    const axisHomes = new Map<string, { clips: Array<[SVGGElement, string]>; photos: SVGGElement[] }>()
    let paintAxis: (axis: string, m?: PhotoMatrix) => void = () => {}
    const homeSet = (role: (typeof roles)[number]): HiSet => {
        const made = new Map<string, HiGroups>()
        return {
            at_(axis) {
                let groups = made.get(axis)
                if (groups) return groups
                let home = axisHomes.get(axis)
                if (!home) {
                    home = { clips: [], photos: [] }
                    axisHomes.set(axis, home)
                }
                const n = [...axisHomes.keys()].indexOf(axis)
                const leaves = overlaySvgs.map((svg, i) => {
                    const clip = document.createElementNS(SVG_NS, "g")
                    clip.setAttribute("class", "masque-clip")
                    clip.dataset.axis = axis
                    svg.insertBefore(clip, roleEnds[i][roles.indexOf(role)])
                    const photo = makeGroup(clip, "masque-photo")
                    home.clips.push([clip, `masque-clip-${svgKinds[i]}-${n}`])
                    home.photos.push(photo)
                    return makeGroup(photo, role)
                })
                groups = { fill_: leaves[0], edge_: leaves[1], plain_: leaves[2] }
                made.set(axis, groups)
                paintAxis(axis)
                return groups
            },
            all_: () => [...made.values()],
        }
    }
    const selGroup = homeSet("sel")
    const linkGroup = homeSet("link")
    const hiGroup = homeSet("hi")
    // Every axis with data marks gets its homes now, in manifest order, so the DOM does not
    // depend on which mark was picked first. An axis a later frame brings is made on first use.
    for (const l of manifest.layers) {
        if (layoutSpaceLayer(l)) continue
        for (const set of [selGroup, linkGroup, hiGroup]) set.at_(l.axis)
    }
    // ROI boxes, threshold lines, the marquee and the readout dots slide with the pan axis's
    // photograph, clipped to its viewport, above every highlight.
    const plainClip = makeGroup(plainSvg, "masque-clip")
    const plainPhoto = makeGroup(plainClip, "masque-photo")
    // Screen-fixed chrome paints above the clip and is not transformed. A legend or colorbar
    // ring outside the axis viewport would otherwise vanish for the whole preview.
    const fillFixed = makeGroup(fillSvg, "masque-fixed")
    const edgeFixed = makeGroup(edgeSvg, "masque-fixed")
    const plainFixed = makeGroup(plainSvg, "masque-fixed")
    const selFixed = oneHome({ fill_: makeGroup(fillFixed, "sel"), edge_: makeGroup(edgeFixed, "sel"), plain_: makeGroup(plainFixed, "sel") })
    const hiFixed = oneHome({ fill_: makeGroup(fillFixed, "hi"), edge_: makeGroup(edgeFixed, "hi"), plain_: makeGroup(plainFixed, "hi") })
    const surface = document.createElement("div")
    surface.className = "surface"
    // touch-action: block native scroll/pinch on the surface ONLY when this manifest has a drag
    // interaction (threshold / ROI / view) — a hover/click-only plot (e.g. a plain scatter) must
    // not hijack page scrolling when a finger lands on it. A `select = :many` field alone doesn't
    // count: on a touch screen a finger drag there scrolls the page (the browser cancels the
    // marquee), so the marquee is a mouse and pen gesture. This has to be decided up front, not
    // toggled per-pointerdown: UAs resolve touch-action at the touch's first contact, so setting
    // it later has no effect on the gesture already in flight.
    if (manifest.layers.some((l) => l.events.includes("drag"))) surface.style.touchAction = "none"
    const tip = document.createElement("div")
    tip.className = "masque-tip"
    tip.setAttribute("role", "tooltip")
    tip.setAttribute("aria-hidden", "true")

    // Keyboard nav needs the surface to be a real focus stop; role="application" (over the
    // safer "group") because NVDA/JAWS's default browse mode intercepts arrow keys before a
    // "group" ever sees them — "application" tells the AT this widget owns its own key
    // handling. aria-label is generic (there's no per-plot title in the manifest to draw one
    // from); aria-describedby points at a static, non-live usage hint (below) — the two must
    // share this shadow root, since ARIA idrefs don't cross shadow boundaries.
    surface.setAttribute("tabindex", "0")
    surface.setAttribute("role", "application")
    surface.setAttribute("aria-label", "Interactive plot")
    surface.setAttribute("aria-describedby", "masque-kbd-hint")

    const kbdHint = document.createElement("div")
    kbdHint.id = "masque-kbd-hint"
    kbdHint.className = "sr-only"
    kbdHint.textContent = "Use arrow keys to move between elements, Page Up or Page Down to jump between layers, " +
        "Enter to select, Escape to leave."

    // aria-live="polite", not the tooltip: aria-hidden toggling on the tooltip isn't an
    // announcement path for assistive tech, only a visibility one. Created empty and populated
    // later (keyboard.ts's focusTo, debounced) — a region created and filled in the same tick
    // often doesn't announce.
    const liveRegion = document.createElement("div")
    liveRegion.className = "sr-only"
    liveRegion.setAttribute("aria-live", "polite")
    liveRegion.setAttribute("aria-atomic", "true")

    const note = document.createElement("div")
    note.className = "masque-note"
    note.setAttribute("role", "status")
    let noteTimer: ReturnType<typeof setTimeout> | null = null
    // The same error again (a drag that keeps failing) keeps the note up without announcing
    // it again. The text goes once the note has faded, so a screen reader doesn't find it later.
    const showNote = (text: string) => {
        if (note.textContent !== text) note.textContent = text
        note.classList.add("show")
        if (noteTimer !== null) clearTimeout(noteTimer)
        noteTimer = setTimeout(() => {
            note.classList.remove("show")
            noteTimer = setTimeout(() => { noteTimer = null; note.textContent = "" }, MOTION_MS)
        }, NOTE_MS)
    }

    // The closed-mark selected look's canvases (fade.ts), one pair per axis, under every svg so
    // the hover fill dodges over them.
    const fadeRoot = document.createElement("div")
    fadeRoot.className = "masque-fades"
    shadow.append(style, fadeRoot, fillSvg, edgeSvg, plainSvg, surface, tip, kbdHint, liveRegion, note)
    // Named Makie blocks, drawn as HTML over the empty boxes Julia left for them. A release
    // commits like any field; a slider moving under `onchange` redraws as it goes.
    const controls = buildControls(shadow, manifest, {
        commit_: (id, env) => ctx.commit_({ [id]: env }),
        live_: (id, env) => {
            if (ctx.manifest_.onchange === true) ctx.gesture_.request({ onchange: true, state: { ...ctx.value_(), [id]: env }, settle: false })
        },
        adopt_: (id, env) => ctx.commit_({ [id]: env }, true),
        digits_: manifest.tipDigits ?? DEFAULT_SIGDIGITS,
    })
    host.appendChild(shadowHost)
    // --masque-fig-bg drives the CSS-only tooltip theme (mount.ts's STYLE, lch(from …)); set
    // before tipStyle below so an explicit tooltipstyle bg/color (--masque-tip-bg/
    // --masque-tip-color) still wins outright — they're independent custom properties consumed
    // together via nested var() fallbacks, not a write-order race.
    if (manifest.background) shadowHost.style.setProperty("--masque-fig-bg", manifest.background)
    if (manifest.tipStyle) for (const [k, v] of Object.entries(manifest.tipStyle)) shadowHost.style.setProperty(k, v)
    // Chrome grey + dodge-fill source, from the same manifest.background the tooltip theme
    // reads — see isLightBackground above. The fill source is the same on both rows.
    const hiStyle = isLightBackground(manifest.background) ? HI_STYLE.light : HI_STYLE.dark
    shadowHost.style.setProperty("--masque-chrome", hiStyle.chrome)
    shadowHost.style.setProperty("--masque-hi-fill", hiStyle.fillSrc)
    shadowHost.style.setProperty("--masque-cross", hiStyle.cross)
    // overlaystyle from Julia: written after the derived greys so a colour key wins over them.
    // Per-layer hoverstyle values sit inline on their own elements and still win there.
    if (manifest.overlayStyle) for (const [k, v] of Object.entries(manifest.overlayStyle)) shadowHost.style.setProperty(k, v)

    // Threshold lines and ROI boxes slide with the photograph. The hair stays on the plain svg,
    // after the clip, so the first <line> in the shadow is still a threshold line.
    const thresholdLines = thresholdDrag.buildThresholdLines(manifest, plainPhoto)
    const roiBoxes = roiDrag.buildROIBoxes(manifest, plainPhoto, base)
    const cross = buildCross(plainSvg, plainPhoto)
    const focusable = buildFocusable(manifest)
    const layerStarts = computeLayerStarts(focusable)

    // `applyFrame` is a hoisted function declaration (below) referencing `ctx`/`state` by
    // closure — it's never CALLED until a real round trip resolves, well after both are
    // initialized, so the forward reference here is safe despite the textual order.
    let lastFrameUrl: string | null = null
    let gestureFrameCount = 0
    let loadToken = 0
    // Bumps when the base pixels change, so the viewport copy is not redrawn on every pan sample.
    let frameGen = 0
    let paintPhoto: (m: PhotoMatrix) => void = () => {}
    // The drag-layer tab stops (dragkeys.ts), built once the ctx exists. They follow the
    // line, the box, and the photograph, so every repaint re-places them.
    let dragStops: DragStops | null = null
    // A frame that arrives while an ROI or threshold drag holds those nodes. Rebuilt when the drag ends.
    let pendingChrome: Manifest | null = null
    // Where the pointer last moved over the plot, so an \`onchange\` frame can redraw its hover.
    let lastMove: PointerEvent | null = null
    const onchangeSettle = (): Record<string, unknown> => ({ onchange: true, state: currentState(), settle: true })
    const rawChannel = createGestureChannel(requestFrame ?? null, applyFrame, () => { clearPhoto() })
    // A request's matrix is relative to the frame on screen when it was built. The channel runs
    // one round trip at a time, so a request can be built while an earlier one is still in
    // flight and land after that earlier frame has replaced the base (a wheel settle queued
    // behind its own preview, #165; a pan's coalesced position or pointer-up settle). Record
    // how many photo frames had landed when each request was built, and the matrix each landed
    // frame adopted, so `adoptPhoto` can re-express a late request against the current base.
    let photoFrames = 0
    const adoptedMatrices = new Map<number, PhotoMatrix>()
    const builtAt = new WeakMap<Record<string, unknown>, number>()
    const channel: GestureChannel = {
        request(input) { builtAt.set(input, photoFrames); rawChannel.request(input) },
        settle(input, slot) {
            // A built-when-sent input is relative to the frame on screen when it is sent.
            if (typeof input === "function") return rawChannel.settle(() => { const o = input(); builtAt.set(o, photoFrames); return o }, slot)
            builtAt.set(input, photoFrames)
            return rawChannel.settle(input, slot)
        },
        dispose() { rawChannel.dispose() },
    }

    const fade = createFade({
        root_: fadeRoot,
        style_: shadowHost,
        manifest_: () => ctx.manifest_,
        frame_: (axis) => axisFrame(ctx.manifest_, state.photo_, state.photoViewId_, axis),
        cssScale_: () => {
            const w = ctx.base_.getBoundingClientRect().width
            return w > 0 ? ctx.manifest_.width / w : ctx.manifest_.scaling || 1
        },
    })
    const ctx: OverlayCtx = {
        manifest_: manifest, tipDigits_: manifest.tipDigits ?? DEFAULT_SIGDIGITS, host_: host, base_: base, surface_: surface, tip_: tip, hiGroup_: hiGroup, selGroup_: selGroup,
        hiFixed_: hiFixed, selFixed_: selFixed, linkGroup_: linkGroup, fade_: fade,
        thresholdLines_: thresholdLines, roiBoxes_: roiBoxes, chrome_: plainPhoto,
        shadowRoot_: shadow, focusable_: focusable, layerStarts_: layerStarts, liveRegion_: liveRegion,
        cross_: cross,
        gesture_: channel,
        photoPaint_: (m) => paintPhoto(m),
        // Through `host.value`, not into `bondValue`: a page may wrap the property after mount
        // (the docs player does, to swap its snapshots) and must see every commit. The value is
        // a fresh object each time, so Pluto sees a change.
        value_: currentState,
        commit_: (updates, quiet = false) => {
            const isField = new Set(ctx.manifest_.fields ?? fields)
            const kept = Object.entries(updates).filter(([k]) => isField.has(k))
            if (!kept.length) return
            const next: Record<string, unknown> = currentState()
            for (const [k, v] of kept) next[k] = v
            stateValue = next
            const bond = toBond(next)
            // With \`onchange\`, a commit can change only fields the bind leaves out. The \`@bind\`
            // value is then the same, and the cells that read it have nothing new. Compared with
            // the value the host holds now, which a restore from Pluto may have changed.
            if (!manifest.onchange || !sameValue(bond, (host as unknown as { value: unknown }).value)) {
                committing = true
                try {
                    (host as unknown as { value: unknown }).value = bond
                } finally {
                    committing = false
                }
                host.dispatchEvent(new CustomEvent("input"))
            }
            // \`onchange\` sees every commit, bound or not. A \`quiet\` one (picks a frame cleared)
            // came from Julia and goes no further. The state is read when the round trip starts,
            // so a pick a frame cleared meanwhile is not sent back.
            if (manifest.onchange && !quiet) void channel.settle(onchangeSettle, "onchange")
        },
    }
    const state = createOverlayState()
    viewDrag.seedView3Homes(state, manifest.layers)
    // Each field starts highlighted at its `initial` value: a `selected=` pick, or what a box
    // over marks or cells holds at its starting bounds.
    const restoreSelection = (v: Record<string, unknown>) => {
        for (const f of fields) {
            if (!(f in v)) continue // a state field the bond doesn't carry keeps its own
            const sel = selectionForValue(ctx.manifest_, v[f] ?? null, f)
            if (sel) state.sel_.set(f, sel.mask ? { hits_: sel.hits, source_: null, mask_: sel.mask } : sel.items ? { hits_: sel.hits, source_: null, items_: sel.items } : { hits_: sel.hits, source_: sel.source })
        }
    }
    restoreSelection(hostValue)

    // `host.value` is the bond. Pluto writes it after mount: on a page reload it restores the
    // kernel's value, which can be a click made since the `selected=` seed. Until a gesture of
    // ours commits, a written value that differs from the current one redraws the selection,
    // so the highlight shows what `@bind` holds (#272). After that our own commits are newer,
    // so a late write of an older value must not undo a click. Pluto also re-writes an equal
    // value whenever any bond in the notebook changes; that is a no-op here.
    let bondValue: unknown = toBond(hostValue)
    let restoring = true
    let committing = false
    const getBond = () => bondValue
    // An accessor already on the host belongs to the page (the docs player's survives a
    // remount, since ours is taken down on cleanup), so writes go through it untouched.
    const theirs = Object.getOwnPropertyDescriptor(host, "value")?.set
    if (theirs) theirs.call(host, toBond(hostValue))
    else Object.defineProperty(host, "value", {
        configurable: true,
        enumerable: true,
        get: getBond,
        set: (v: unknown) => {
            if (committing) restoring = false
            else if (restoring && !sameValue(v, bondValue) && v && typeof v === "object") {
                restoreSelection(v as Record<string, unknown>)
                for (const [f, env] of Object.entries(v as Record<string, unknown>)) controls.set_(f, env)
                renderSelection(ctx, state)
                stateValue = { ...stateValue, ...(v as Record<string, unknown>) }
                // Julia drew the starting state; the picture follows the restored one.
                if (manifest.onchange) void channel.settle(onchangeSettle, "onchange")
            }
            bondValue = v
        },
    })

    type GestureCanvas = HTMLCanvasElement & {
        masqueReplaceScene?: (scene: unknown, pxPerUnit?: number, width?: number, height?: number) => void
        masqueFlushPending?: () => void
        masquePendingFrame?: { input: Record<string, unknown>; r: FrameResponse } | null
    }
    type PendingFrame = { input: Record<string, unknown>; r: FrameResponse }
    // The pending frame lives on the host. The canvas element is replaced on suspend/resume,
    // so a stash on the canvas would be thrown away with it. The canvas mirror exists so a
    // replacer installed on the current canvas can still see the same object.
    const mirrorPending = (pending: PendingFrame | null) => {
        if (base instanceof HTMLCanvasElement) (base as GestureCanvas).masquePendingFrame = pending
    }
    const takePending = (): PendingFrame | null => {
        const pending = host.masquePendingFrame ?? null
        host.masquePendingFrame = null
        mirrorPending(null)
        return pending
    }
    host.masqueFlushPending = () => {
        const pending = takePending()
        if (!pending) return
        applyFrame(pending.input, pending.r)
    }
    if (!host.masqueRequestLive) host.masqueRequestLive = () => { host.masqueWantsLive = true }
    if (base instanceof HTMLCanvasElement) {
        const canvas = base as GestureCanvas
        canvas.masqueFlushPending = () => { host.masqueFlushPending?.() }
    }

    function clearPhoto(): void {
        state.photo_ = IDENTITY
        state.photoAnchor_ = null
        paintPhoto(IDENTITY)
    }

    function chromeHeld(): boolean {
        const k = state.drag_?.kind
        return k === "roi" || k === "threshold"
    }

    function replaceDraggedChrome(man: Manifest): void {
        for (const line of ctx.thresholdLines_.values()) line.remove()
        for (const box of ctx.roiBoxes_.values()) {
            box.rect_.remove()
            for (const hdl of box.handles_) hdl.remove()
        }
        ctx.thresholdLines_ = thresholdDrag.buildThresholdLines(man, plainPhoto)
        ctx.roiBoxes_ = roiDrag.buildROIBoxes(man, plainPhoto, ctx.base_)
        plainPhoto.appendChild(ctx.cross_.dots_)
    }

    function flushPendingChrome(): void {
        if (!pendingChrome || chromeHeld()) return
        const man = pendingChrome
        pendingChrome = null
        replaceDraggedChrome(man)
    }

    function applyFrame(input: Record<string, unknown>, r: FrameResponse): void {
        // A wheel-settle timer can resolve after happy-dom tears the test environment down.
        // `instanceof HTMLCanvasElement` throws ReferenceError once that constructor is gone,
        // so a frame for a dead widget is dropped instead of applied.
        if (host.masqueDead || typeof HTMLCanvasElement !== "function") {
            channel.dispose()
            return
        }
        // \`onchange\` threw: the picture on screen is the last good one, and stays.
        if (typeof r.error === "string") {
            showNote(r.error)
            ;(host as unknown as { dataset: DOMStringMap }).dataset.masqueOnchangeError = r.error
            return
        }
        delete (host as unknown as { dataset: DOMStringMap }).dataset.masqueOnchangeError
        // Picks Julia cleared go now, not when the picture has loaded: a settle queued behind
        // this frame reads the state as its round trip starts, which is before that.
        if (r.clear?.length && r.manifest) clearFields(r.manifest as Manifest, r.clear)
        const canvas = base instanceof HTMLCanvasElement ? base as GestureCanvas : null
        const live = canvas != null && typeof canvas.masqueReplaceScene === "function"
        if (r.scene != null && !live) {
            const pending = { input, r }
            host.masquePendingFrame = pending
            mirrorPending(pending)
            host.masqueRequestLive?.()
            return
        }
        if (base instanceof HTMLImageElement && r.png) {
            // `r.png` decodes off `with_js_link` as a plain (never Shared) ArrayBuffer-backed
            // Uint8Array, but its TS type is the generic `Uint8Array<ArrayBufferLike>` — narrower
            // than `BlobPart` wants; the cast reflects that decoded reality, not a bypass of it.
            const url = URL.createObjectURL(new Blob([r.png as Uint8Array<ArrayBuffer>], { type: "image/png" }))
            const prev = lastFrameUrl
            lastFrameUrl = url
            const img = base
            const token = ++loadToken
            const onload = () => {
                img.removeEventListener("load", onload)
                img.removeEventListener("error", onerror)
                if (token !== loadToken || host.masqueDead) return
                revealFrame(input, r)
            }
            const onerror = () => {
                img.removeEventListener("load", onload)
                img.removeEventListener("error", onerror)
                if (token !== loadToken || host.masqueDead) return
                clearPhoto()
            }
            img.addEventListener("load", onload)
            img.addEventListener("error", onerror)
            img.src = url
            if (prev) URL.revokeObjectURL(prev) // revoke the PREVIOUS url, not this one, mid-gesture
            // The previous pixels stay until load. Dropping the matrix here snaps them.
            return
        } else if (live && canvas && r.scene != null) {
            try {
                canvas.masqueReplaceScene?.(r.scene, r.pxPerUnit, r.width, r.height)
            } catch (e) {
                console.error("[masque] webgl gesture frame failed", e)
                clearPhoto()
                return
            }
            frameGen += 1
        }
        revealFrame(input, r)
    }

    function revealFrame(input: Record<string, unknown>, r: FrameResponse): void {
        const newManifest = r.manifest as Manifest | undefined
        if (!newManifest) return
        // A frame's manifest describes the new geometry only. The figure's colour and the
        // overlay and tooltip styles were set at mount; the fade and the outlines read them here.
        newManifest.background ??= ctx.manifest_.background
        newManifest.overlayStyle ??= ctx.manifest_.overlayStyle
        newManifest.tipStyle ??= ctx.manifest_.tipStyle
        const onchangeFrame = input.onchange === true
        // An in-drag \`onchange\` frame trails the pointer by a round trip. Its lines and boxes
        // would pull the control back to where it was then, so the ones on screen stay, with
        // the geometry the drag writes to, until a settle frame redraws them from the state.
        const keepControls = onchangeFrame && input.settle !== true
        if (keepControls) {
            newManifest.layers = newManifest.layers.map((l) =>
                l.kind === "threshold" || l.kind === "roi" ? ctx.manifest_.layers.find((o) => o.id === l.id && o.kind === l.kind) ?? l : l)
        }
        // An \`onchange\` frame comes from a click or a key, and the pointer or the keyboard is
        // still on the mark: the focus and the hover come back on the new picture.
        const focused = onchangeFrame && state.focusHit_ ? { id: state.focusHit_.layer.id, index: state.focusHit_.index } : null

        // Threshold lines / ROI boxes are built once, from the mount manifest, and never
        // patched in place elsewhere — a camera move invalidates every hit region on the same
        // axis (§12.4), so anything derived from the OLD manifest is torn down and rebuilt from
        // the new one rather than mutated.
        // An ROI or threshold drag still holds these nodes. Replacing them detaches the
        // gesture. The photograph and the stamp still land; the chrome waits for pointerup.
        if (keepControls) { /* the drag's own chrome stays */ }
        else if (chromeHeld()) pendingChrome = newManifest
        else {
            pendingChrome = null
            replaceDraggedChrome(newManifest)
        }
        ctx.manifest_ = newManifest
        controls.update_(newManifest, onchangeFrame && input.state && typeof input.state === "object" ? input.state as Record<string, unknown> : null)
        // Drop a cross that described the previous frame. The hair stays on the plain svg;
        // the dots stay in the photo group, above the chrome just rebuilt there.
        hideCross(ctx, state)
        plainSvg.appendChild(ctx.cross_.g_)
        plainPhoto.appendChild(ctx.cross_.dots_)
        ctx.focusable_ = buildFocusable(newManifest)
        ctx.layerStarts_ = computeLayerStarts(ctx.focusable_)

        // §12.5: never leave the overlay live over a frame it no longer describes. A camera
        // move invalidates every hit region, so a hover ring (g.hi), a legend-linked highlight
        // (g.link), or a keyboard-focus ring drawn from the OLD geometry is exactly as stale as
        // the threshold/ROI DOM torn down above — a full remount used to wipe all of this for
        // free, and this reproduces that "nothing focused/hovered" baseline by hand (inlined,
        // not a call to keyboard.ts's focusTo(null), which fades g.hi/g.link out over
        // MOTION_MS — there is nothing valid to fade FROM here, the shape is simply gone, so
        // this clears immediately instead). Selection is the one piece of this state that
        // intentionally does NOT reset here — re-keyed above instead — because masque()'s own
        // `selected=` hydration promises it survives a rebuild; hover/focus carry no such
        // promise, and "no focus" is the same safe default a remount produced.
        state.focusIdx_ = null
        state.focusHit_ = null
        state.focusTipHtml_ = null
        state.focusTipCss_ = null
        ctx.surface_.classList.remove("kbd-ring")
        clearHiImmediate(state, ctx.hiGroup_, ctx.hiFixed_)
        clearLinkImmediate(state, ctx.linkGroup_)
        ctx.fade_.preview_(null, null, [])
        // A frame that lands mid-pan, mid-wheel, or mid-key would wipe the readout the gesture is
        // still showing. Pointer-up, the wheel idle timer, and the key's settle frame hide it.
        if (state.drag_?.kind !== "view" && state.wheelTimer_ === null && !state.keyView_) hideTip(ctx, state)

        // Re-key the LIVE selection against the new layer objects — do NOT re-derive it from
        // the mount manifest's `initial`, which is only the starting value (a frame's manifest
        // leaves it out); reading it here would resurrect that and silently drop every click
        // since (#102 tripwire #3, the #107 regression shape). `selKeys_` is already id-keyed and gets
        // rebuilt by `renderSelection` itself, so only `sel_` needs re-keying here.
        for (const [f, sel] of state.sel_) {
            if (sel.mask_) {
                // A grid's mask outlines against the new frame's cell edges. A frame comes from a
                // view gesture, which never touches the bond (§12.3) and never changes the cell
                // count; a grid whose size did change draws nothing, and its next click replaces
                // the value (gridMaskOf starts that click from an empty mask).
                const layer = newManifest.layers.find((l) => l.id === f && l.kind === "grid")
                const hit = layer && sel.mask_.length === emptyMask(layer).length ? maskHit(layer, sel.mask_) : null
                state.sel_.set(f, { ...sel, hits_: hit ? [hit] : [] })
                continue
            }
            const nextSel: Hit[] = []
            for (const h of sel.hits_) {
                const layer = newManifest.layers.find((l) => l.id === h.layer.id)
                if (!layer) continue
                if (layer.kind === "surface") {
                    const kept = surfaceSelection(layer, h.index)
                    if (kept) nextSel.push(kept)
                    continue
                }
                if (h.sample_ !== undefined) {
                    const kept = picksPoints(layer) ? linePointHit(newManifest, layer, h.index, h.sample_) : null
                    if (kept) nextSel.push(kept)
                    continue
                }
                try {
                    nextSel.push({ layer, ...hitLayerByIndex(layer, h.index) })
                } catch {
                    /* index no longer valid against the new geometry — drop rather than throw mid-gesture */
                }
            }
            // A `many` field's picks follow its hits: one whose element is gone is dropped, so
            // the next toggle doesn't send its stale index.
            state.sel_.set(f, sel.items_ ? { ...sel, hits_: nextSel, items_: keptPicks(newManifest, sel.items_) } : { ...sel, hits_: nextSel })
        }
        renderSelection(ctx, state)
        adoptPhoto(input)
        dragStops?.sync_()
        if (focused && !state.drag_) {
            const k = ctx.focusable_.findIndex((f) => f.layer_.id === focused.id && f.index_ === focused.index)
            if (k >= 0) focusTo(ctx, state, k)
        } else if (onchangeFrame && lastMove && !state.drag_) applyMove(ctx, state, lastMove)

        // A paired, atomic stamp — written in the SAME synchronous block as the swap above, not
        // sampled separately — so an observer (e2e's kind_sweep.mjs) can tell "a frame actually
        // landed" from "a frame was requested," and read the exact camera it landed at, without
        // relying on the bond (which §12.3 leaves untouched for a view gesture).
        const viewLayer = newManifest.layers.find((l) => l.id === input.id)
        const geom = viewLayer?.geometry as ViewGeometry | undefined
        // An Axis3 frame's limits decode as a typed array, which JSON writes as an object.
        const camera: Record<string, number | number[]> = "azimuth" in input || "limits" in input
            ? { azimuth: geom?.azimuth ?? NaN, elevation: geom?.elevation ?? NaN, ...(geom?.limits ? { limits: Array.from(geom.limits) } : {}) }
            : (() => {
                const t = viewLayer ? newManifest.transforms[viewLayer.axis] : undefined
                const cam: Record<string, number | number[]> = { xmin: t?.xlims[0] ?? NaN, xmax: t?.xlims[1] ?? NaN, ymin: t?.ylims[0] ?? NaN, ymax: t?.ylims[1] ?? NaN }
                // Each linked axis's limits (#363), keyed `linked:<axis id>`, so a driver can see it moved too.
                for (const l of geom?.links ?? []) {
                    const lt = newManifest.transforms[l.axis]
                    if (lt) cam[`linked:${l.axis}`] = [lt.xlims[0], lt.xlims[1], lt.ylims[0], lt.ylims[1]]
                }
                return cam
            })()
        gestureFrameCount += 1
        ;(host as unknown as { dataset: DOMStringMap }).dataset.masqueGestureFrame = JSON.stringify({
            n: gestureFrameCount, settle: input.settle === true, ...(input.onchange ? { onchange: true } : {}), ...camera,
        })
    }

    // A plot \`onchange\` gave a different number of marks loses its picks (Julia names them).
    function clearFields(man: Manifest, ids: string[]): void {
        const updates: Record<string, unknown> = {}
        for (const f of ids) {
            const layer = man.layers.find((l) => l.id === f)
            if (!layer) continue
            state.sel_.delete(f)
            updates[f] = !layer.many ? null : layer.kind === "grid" ? { runs: [] } : { items: [] }
        }
        ctx.commit_(updates, true)
    }

    // The sent frame is the photograph now. Keep whatever the live matrix has moved since
    // that request, in the new frame's image pixels. Identity means the screen already
    // matches the new pixels, so the transform comes off in this same turn.
    function adoptPhoto(input: Record<string, unknown>): void {
        const s = input.s, tx = input.tx, ty = input.ty
        if (typeof s !== "number" || typeof tx !== "number" || typeof ty !== "number") return
        if (!(s > 0) || !Number.isFinite(s + tx + ty)) return
        let sent: PhotoMatrix = { s, tx, ty }
        // Re-express the request's matrix in the current base: each frame that landed after it
        // was built already applied that frame's own matrix.
        const built = builtAt.get(input) ?? photoFrames
        for (let k = built; k < photoFrames; k++) {
            const m = adoptedMatrices.get(k)
            if (m) sent = residual(m, sent)
        }
        adoptedMatrices.set(photoFrames, sent)
        adoptedMatrices.delete(photoFrames - 8) // only a few requests are ever outstanding
        photoFrames += 1
        if (state.photoAnchor_) state.photoAnchor_ = mapPoint(sent, state.photoAnchor_)
        const next = residual(sent, state.photo_)
        state.photo_ = isIdentity(next) || !Number.isFinite(next.s + next.tx + next.ty) ? IDENTITY : next
        paintPhoto(state.photo_)
    }

    // Pinned to the base (img/canvas), not the host: WGLMakie can size the <canvas>
    // differently from `.ip-host`, which left g.sel offset when the SVG was `inset:0` on the host.
    const syncOverlayToBase = () => {
        // getBoundingClientRect follows a CSS transform. Rewriting the overlay from that
        // rect while the photograph is scaled throws every non-anchor mark off the image.
        if (!isIdentity(state.photo_)) return
        const hr = host.getBoundingClientRect()
        const br = base.getBoundingClientRect()
        if (!(br.width > 0 && br.height > 0)) return
        shadowHost.style.left = `${br.left - hr.left}px`
        shadowHost.style.top = `${br.top - hr.top}px`
        shadowHost.style.width = `${br.width}px`
        shadowHost.style.height = `${br.height}px`
        roiDrag.syncHandleDraw(ctx.roiBoxes_, ctx.manifest_.width, br.width, ctx.manifest_.scaling)
        ctx.fade_.refresh_()
        state.surfaceSized_ = false
    }
    // The axis frame (spines, ticks, labels) stays on the untransformed base. A copy of the
    // same pixels, clipped to the pan view's viewport, carries the matrix, so only the data
    // inside the axes slides.
    // One window per axis whose data slides: the pan view's, then each axis linked to it (#363).
    interface DataWindow { clip: HTMLDivElement; copy: HTMLImageElement | HTMLCanvasElement; gen: number }
    let windows: DataWindow[] = []
    // The chrome group's clip, and each axis's in each svg (`masque-clip-<svg>-<n>`).
    const setClip = (g: SVGGElement, cid: string, rect: [number, number, number, number] | null) => {
        if (!rect) { g.removeAttribute("clip-path"); return }
        const svg = g.ownerSVGElement
        if (!svg) return
        let cp = svg.querySelector(`#${cid}`) as SVGClipPathElement | null
        if (!cp) {
            cp = document.createElementNS(SVG_NS, "clipPath")
            cp.id = cid
            cp.appendChild(document.createElementNS(SVG_NS, "rect"))
            svg.insertBefore(cp, svg.firstChild)
        }
        const r = cp.firstElementChild as SVGRectElement
        r.setAttribute("x", String(rect[0]))
        r.setAttribute("y", String(rect[1]))
        r.setAttribute("width", String(rect[2]))
        r.setAttribute("height", String(rect[3]))
        g.setAttribute("clip-path", `url(#${cid})`)
    }
    paintAxis = (axis, m = state.photo_) => {
        const home = axisHomes.get(axis)
        if (!home) return
        const f = axisFrame(ctx.manifest_, m, state.photoViewId_, axis)
        const t = f ? `translate(${f.tx} ${f.ty}) scale(${f.sx === f.sy ? f.sx : `${f.sx} ${f.sy}`})` : null
        home.photos.forEach((g) => { if (t) g.setAttribute("transform", t); else g.removeAttribute("transform") })
        for (const [g, cid] of home.clips) setClip(g, cid, f ? f.clip : null)
        ctx.fade_.place_(axis, f)
    }
    const photoViewport = (): ViewGeometry | null => {
        const id = state.photoViewId_
        const layer = (id ? ctx.manifest_.layers.find((l) => l.id === id) : undefined)
            ?? ctx.manifest_.layers.find((l) => l.kind === "view" && (l.geometry as ViewGeometry).mode === "pan")
        if (!layer || layer.kind !== "view") return null
        const g = layer.geometry as ViewGeometry
        if (!(g.w > 0) || !(g.h > 0)) return null
        return g
    }
    const dropWindows = (keep: number) => {
        for (const w of windows.slice(keep)) w.clip.remove()
        windows = windows.slice(0, keep)
    }
    const clearDataClip = () => {
        dropWindows(0)
        plainClip.removeAttribute("clip-path")
    }
    const makeWindow = (cls: string): DataWindow => {
        const clip = document.createElement("div")
        clip.className = cls
        clip.style.position = "absolute"
        clip.style.overflow = "hidden"
        clip.style.pointerEvents = "none"
        const copy = ctx.base_ instanceof HTMLCanvasElement
            ? document.createElement("canvas")
            : document.createElement("img")
        if (copy instanceof HTMLImageElement) copy.alt = ""
        copy.style.position = "absolute"
        copy.style.transformOrigin = "0 0"
        copy.style.maxWidth = "none"
        clip.appendChild(copy)
        host.insertBefore(clip, shadowHost)
        return { clip, copy, gen: -1 }
    }
    paintPhoto = (m) => {
        paintMatrix(m)
        dragStops?.sync_()
    }
    const paintMatrix = (m: PhotoMatrix) => {
        const id = isIdentity(m)
        const w = ctx.manifest_.width
        const h = ctx.manifest_.height
        const br = ctx.base_.getBoundingClientRect()
        const hr = host.getBoundingClientRect()
        const ow = ctx.base_.offsetWidth > 0 ? ctx.base_.offsetWidth : br.width
        const oh = ctx.base_.offsetHeight > 0 ? ctx.base_.offsetHeight : br.height
        const sx = ow > 0 && w > 0 ? ow / w : 1
        const sy = oh > 0 && h > 0 ? oh / h : 1
        // The base itself never scales. A transform here moves the axis frame, and the next
        // frame draws that frame back where it was.
        ctx.base_.style.transform = ""
        ctx.base_.style.transformOrigin = ""
        const view = id ? null : photoViewport()
        if (id || !view) plainPhoto.removeAttribute("transform")
        else plainPhoto.setAttribute("transform", `translate(${m.tx} ${m.ty}) scale(${m.s})`)
        for (const axis of axisHomes.keys()) paintAxis(axis, m)
        // Only data pixels slide (#171). Each copy is cropped to its clip rect, inside the spine
        // stroke, and the crop moves with it, so the chrome outside the axis box never enters
        // the window. The window, the same rect, is painted with the empty plot's colour, so
        // the strip the copy leaves shows no stale picture from underneath.
        const paintWindow = (
            win: DataWindow, rect: [number, number, number, number], fill: string | undefined,
            k: { sx: number; sy: number; tx: number; ty: number },
        ) => {
            const [cx, cy, cw, ch] = rect
            win.clip.style.left = `${br.left - hr.left + cx * sx}px`
            win.clip.style.top = `${br.top - hr.top + cy * sy}px`
            win.clip.style.width = `${cw * sx}px`
            win.clip.style.height = `${ch * sy}px`
            win.clip.style.background = fill ?? ""
            const copy = win.copy
            copy.style.left = `${-cx * sx}px`
            copy.style.top = `${-cy * sy}px`
            copy.style.width = `${ow}px`
            copy.style.height = `${oh}px`
            copy.style.setProperty(
                "clip-path",
                `inset(${cy * sy}px ${ow - (cx + cw) * sx}px ${oh - (cy + ch) * sy}px ${cx * sx}px)`,
            )
            copy.style.transform = k.sx === k.sy
                ? `translate(${k.tx * sx}px, ${k.ty * sy}px) scale(${k.sx})`
                : `translate(${k.tx * sx}px, ${k.ty * sy}px) scale(${k.sx}, ${k.sy})`
            if (copy instanceof HTMLImageElement && ctx.base_ instanceof HTMLImageElement) {
                if (copy.src !== ctx.base_.src) copy.src = ctx.base_.src
            } else if (copy instanceof HTMLCanvasElement && ctx.base_ instanceof HTMLCanvasElement && win.gen !== frameGen) {
                const bw = ctx.base_.width
                const bh = ctx.base_.height
                if (bw > 0 && bh > 0) {
                    copy.width = bw
                    copy.height = bh
                    copy.getContext("2d")?.drawImage(ctx.base_, 0, 0)
                    win.gen = frameGen
                }
            }
        }
        if (!view) {
            clearDataClip()
        } else {
            const links = view.links ?? []
            dropWindows(1 + links.length)
            while (windows.length < 1 + links.length) {
                windows.push(makeWindow(windows.length === 0 ? "masque-data-clip" : "masque-data-clip masque-link-clip"))
            }
            const [cx, cy, cw, ch] = view.clip ?? [view.x, view.y, view.w, view.h]
            paintWindow(windows[0], [cx, cy, cw, ch], view.fill, { sx: m.s, sy: m.s, tx: m.tx, ty: m.ty })
            links.forEach((link, i) => {
                const [lsx, ltx] = linkedMove(m, link.x, m.tx)
                const [lsy, lty] = linkedMove(m, link.y, m.ty)
                paintWindow(windows[i + 1], link.clip, link.fill, { sx: lsx, sy: lsy, tx: ltx, ty: lty })
            })
            setClip(plainClip, "masque-clip-plain", [cx, cy, cw, ch])
        }
        host.dataset.masquePhoto = id ? "" : `${m.s},${m.tx},${m.ty}`
        if (id) syncOverlayToBase()
        syncFocusTip(ctx, state)
    }
    syncOverlayToBase()
    const overlayRO = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncOverlayToBase) : null
    overlayRO?.observe(host)
    overlayRO?.observe(base)
    host.masqueRetargetBase = (next: HTMLElement) => {
        if (next === base) {
            syncOverlayToBase()
            return
        }
        mirrorPending(null)
        base.style.transform = ""
        base.style.transformOrigin = ""
        overlayRO?.unobserve(base)
        base = next
        ctx.base_ = next
        if (base instanceof HTMLCanvasElement) {
            const canvas = base as GestureCanvas
            canvas.masqueFlushPending = () => { host.masqueFlushPending?.() }
            canvas.masquePendingFrame = host.masquePendingFrame ?? null
        }
        overlayRO?.observe(base)
        paintPhoto(state.photo_)
    }
    window.addEventListener("resize", syncOverlayToBase)
    let overlayFrames = 0
    const overlayTick = () => {
        syncOverlayToBase()
        if (++overlayFrames < 24) requestAnimationFrame(overlayTick)
    }
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(overlayTick)

    const down = (e: PointerEvent) => onDown(ctx, state, e)
    const move = (e: PointerEvent) => { lastMove = e; onPointerMove(ctx, state, e) }
    const releaseChrome = (kind: string | undefined) => {
        if ((kind === "roi" || kind === "threshold") && !state.drag_) flushPendingChrome()
    }
    const up = (e: PointerEvent) => {
        const kind = state.drag_?.kind
        onUp(ctx, state, e)
        releaseChrome(kind)
        dragStops?.sync_()
    }
    const cancel = (e: PointerEvent) => {
        const kind = state.drag_?.kind
        onCancel(ctx, state, e)
        releaseChrome(kind)
    }
    const leave = () => {
        // onLeave nulls an uncaptured drag. Capture the kind first or the deferred
        // ROI/threshold frame stays pending with the old nodes still on screen.
        const kind = state.drag_?.kind
        lastMove = null
        onLeave(ctx, state)
        releaseChrome(kind)
    }
    const lostCapture = () => {
        const kind = state.drag_?.kind
        onLostCapture(ctx, state)
        releaseChrome(kind)
    }
    const click = (e: MouseEvent) => onClick(ctx, state, e)
    const keydown = (e: KeyboardEvent) => {
        // A key, not a modifier held for Cmd/Ctrl-click, shows where keys go (pointer-focus).
        if (!MODIFIER_KEYS.has(e.key)) surface.classList.remove("pointer-focus")
        handleKeydown(ctx, state, e)
    }
    // DOM focus leaving the surface — Tab-away, a click landing elsewhere on the page, or the
    // notebook cell itself losing focus — must clear keyboard focus the same way Escape does.
    // Without this, focusIdx/focusHit/kbd-ring/the live region's last text all stay pinned to
    // whatever was last focused, and hover.ts's restoreFocus keeps re-drawing that stale ring
    // on every later pointer miss even though nothing is keyboard-focused anymore.
    const focusout = () => {
        surface.classList.remove("pointer-focus")
        focusTo(ctx, state, null)
    }

    const onWheel = (e: WheelEvent) => {
        if (state.drag_) return
        // The axis viewport is in layout pixels. The zoom anchor is the content pixel
        // under the cursor, or a second notch walks off it.
        const layout = layoutImagePx(ctx.base_, ctx.manifest_, e.clientX, e.clientY)
        let id = ""
        let axis = ""
        let limits3: Limits3 | null = null // an Axis3 view's limits, on screen now
        for (const layer of ctx.manifest_.layers) {
            if (layer.kind !== "view" || !layer.events.includes("drag")) continue
            const g = layer.geometry as ViewGeometry
            if (layout.x < g.x || layout.x > g.x + g.w || layout.y < g.y || layout.y > g.y + g.h) continue
            if (g.mode === "orbit") {
                if (!g.limits) continue
                id = layer.id
                limits3 = g.limits
                break
            }
            if (!ctx.manifest_.transforms[layer.axis]) continue
            id = layer.id
            axis = layer.axis
            break
        }
        if (!id) return
        e.preventDefault()
        if (limits3) {
            const shown = limits3
            // Axis3 (#321): no photograph to scale. Each notch asks for limits scaled about
            // their center; the idle timer settles the last ones at full resolution.
            const lim = viewDrag.zoom3(state, id, shown, wheelScale(e.deltaY, e.deltaMode))
            ctx.gesture_.request({ id, limits: lim, settle: false })
            setTipText(ctx, state, viewDrag.limits3Tip(lim, ctx.tipDigits_))
            setTipVisible(ctx, true)
            const tp = tipOffset(ctx, e)
            placeTip(ctx, state, tp.x, tp.y)
            if (state.wheelTimer_ !== null) clearTimeout(state.wheelTimer_)
            const wheelId = id
            state.wheelTimer_ = setTimeout(() => {
                state.wheelTimer_ = null
                hideTip(ctx, state)
                ctx.gesture_.settle({ id: wheelId, limits: viewDrag.view3Base(state, wheelId, shown), settle: true })
            }, WHEEL_IDLE_MS)
            return
        }
        state.photoViewId_ = id
        const local = unmapPoint(state.photo_, layout)
        const next = zoomAt(state.photo_, local, wheelScale(e.deltaY, e.deltaMode))
        state.photo_ = next
        paintPhoto(next)
        const lim = matrixLimits(ctx.manifest_.transforms[axis], next)
        if (lim) {
            ctx.gesture_.request({ id, ...lim, settle: false, s: next.s, tx: next.tx, ty: next.ty })
            setTipText(ctx, state, limitsTip(lim, ctx.tipDigits_))
            setTipVisible(ctx, true)
            const tp = tipOffset(ctx, e)
            placeTip(ctx, state, tp.x, tp.y)
        }
        if (state.wheelTimer_ !== null) clearTimeout(state.wheelTimer_)
        const wheelId = id
        const wheelAxis = axis
        state.wheelTimer_ = setTimeout(() => {
            state.wheelTimer_ = null
            hideTip(ctx, state)
            const layer = ctx.manifest_.layers.find((l) => l.id === wheelId)
            const shown = layer ? ctx.manifest_.transforms[layer.axis] : ctx.manifest_.transforms[wheelAxis]
            if (!shown) return
            const settled = matrixLimits(shown, state.photo_)
            if (settled) ctx.gesture_.settle({ id: wheelId, ...settled, settle: true, s: state.photo_.s, tx: state.photo_.tx, ty: state.photo_.ty })
        }, WHEEL_IDLE_MS)
    }

    surface.addEventListener("pointerdown", down)
    surface.addEventListener("wheel", onWheel, { passive: false })
    surface.addEventListener("pointermove", move)
    surface.addEventListener("pointerup", up)
    surface.addEventListener("pointercancel", cancel)
    surface.addEventListener("pointerleave", leave)
    surface.addEventListener("lostpointercapture", lostCapture)
    surface.addEventListener("click", click)
    surface.addEventListener("keydown", keydown)
    surface.addEventListener("focusout", focusout)
    // After the surface in the shadow root, so Tab reaches the plot first, then each drag layer.
    dragStops = buildDragStops(ctx, state, shadow)

    // Drawn into g.sel, not g.hi: it must survive hovers (onMove clears g.hi on every miss)
    // and support multiple selected indices (drawHi keeps only the last).
    if (state.sel_.size) renderSelection(ctx, state)

    let cleaned = false
    const cleanup = () => {
        // Pluto invalidation and a test teardown can both call this. The second call must
        // not revoke the blob URL again or deliver a frame the first call already dropped.
        if (cleaned) return
        cleaned = true
        loadToken += 1
        controls.remove_()
        surface.removeEventListener("pointerdown", down)
        surface.removeEventListener("wheel", onWheel)
        surface.removeEventListener("pointermove", move)
        surface.removeEventListener("pointerup", up)
        surface.removeEventListener("pointercancel", cancel)
        surface.removeEventListener("pointerleave", leave)
        surface.removeEventListener("lostpointercapture", lostCapture)
        surface.removeEventListener("click", click)
        surface.removeEventListener("keydown", keydown)
        surface.removeEventListener("focusout", focusout)
        dragStops?.cleanup_()
        window.removeEventListener("resize", syncOverlayToBase)
        overlayRO?.disconnect()
        overlayFrames = 24
        cancelPendingMove(state)
        cancelPendingDrag(state)
        if (state.hiLeaveTimer_ != null) clearTimeout(state.hiLeaveTimer_)
        if (state.linkLeaveTimer_ != null) clearTimeout(state.linkLeaveTimer_)
        if (state.tipFlipTimer_ != null) clearTimeout(state.tipFlipTimer_)
        if (state.announceTimer_ != null) clearTimeout(state.announceTimer_)
        if (state.wheelTimer_ !== null) clearTimeout(state.wheelTimer_)
        state.wheelTimer_ = null
        state.photo_ = IDENTITY
        paintPhoto(IDENTITY)
        channel.dispose() // abandon anything in flight — a late response must not touch a dead DOM
        if (lastFrameUrl) URL.revokeObjectURL(lastFrameUrl)
        shadowHost.remove()
        // A plain property again, so a dead overlay no longer redraws on a write. A page that
        // wrapped it since keeps its own.
        if (Object.getOwnPropertyDescriptor(host, "value")?.get === getBond)
            Object.defineProperty(host, "value", { configurable: true, enumerable: true, writable: true, value: bondValue })
        host.masqueDead = true
        host.masqueDetach?.()
    }
    invalidation?.then(cleanup)
    return { cleanup }
}
