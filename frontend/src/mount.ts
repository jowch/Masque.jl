import { SVG_NS, renderSelection, clearHiImmediate, clearLinkImmediate } from "./highlight"
import { hitLayerByIndex } from "./selection"
import { onLeave, hideTip, setTipText, setTipVisible, placeTip, tipOffset, syncFocusTip } from "./hover"
import { buildCross, hideCross } from "./cross"
import { onDown, onUp, onCancel, onLostCapture, onClick, onPointerMove } from "./bond"
import { buildFocusable, computeLayerStarts, focusTo, handleKeydown } from "./keyboard"
import * as thresholdDrag from "./drag/threshold"
import * as roiDrag from "./drag/roi"
import { limitsTip } from "./drag/view"
import { createGestureChannel } from "./gesture"
import type { FrameResponse, RenderFrame } from "./gesture"
import { createOverlayState, cancelPendingMove, cancelPendingDrag, layoutImagePx, MOTION_MS } from "./state"
import type { HiGroups, OverlayCtx } from "./state"
import type { Hit, Manifest, ViewGeometry } from "./types"
import { matrixLimits } from "./geometry"
import { IDENTITY, isIdentity, mapPoint, residual, unmapPoint, wheelScale, zoomAt, WHEEL_IDLE_MS } from "./photo"
import type { PhotoMatrix } from "./photo"

// Single source for the two highlight tint strengths (mount.ts's STYLE reads both; the e2e
// drivers assert these exact computed fillOpacity values) — hover tints lightly, selection more
// strongly, so the two states stay visually distinct in the same derived colour.
const HOVER_FILL_OPACITY = 0.18
const SELECTED_FILL_OPACITY = 0.35

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

// Parses the handful of CSS colour syntaxes build_manifest's `background` kwarg actually emits
// (#rrggbb/#rgb, rgb()/rgba()) — not a general CSS colour parser (no named colours, hsl(), etc.);
// an unparseable or absent string falls through to "light" below anyway.
function parseRGB(css: string): [number, number, number] | null {
    const hex6 = css.match(/^#([0-9a-f]{6})$/i)
    if (hex6) { const n = parseInt(hex6[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
    const hex3 = css.match(/^#([0-9a-f]{3})$/i)
    if (hex3) { const [r, g, b] = [...hex3[1]].map((c) => parseInt(c + c, 16)); return [r, g, b] }
    const rgb = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
    if (rgb) return [parseFloat(rgb[1]), parseFloat(rgb[2]), parseFloat(rgb[3])]
    return null
}

// Same light/dark pivot as --masque-ink below: 49.44 is the lch lightness of middle grey
// (#808080), the exact threshold the CSS lch(from --masque-fig-bg …) clamp already pivots on for
// the tooltip theme. --masque-chrome is one of two fixed greys written once at mount (it isn't a
// live lch(from …) derivation like the tooltip vars), so this mirrors that CSS math in JS:
// sRGB → relative luminance → CIE L*. A plain WCAG relative-luminance cutoff (Y > 0.5) pivots
// at a different point than lch lightness and would disagree with the tooltip theme on some
// backgrounds — matching the constant keeps the two derivations in lockstep.
function isLightBackground(css: string | undefined): boolean {
    const rgb = css ? parseRGB(css) : null
    if (!rgb) return true // unparseable/absent → light, matching --masque-fig-bg's own #ffffff default
    const [r, g, b] = rgb.map((c) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const lStar = y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y
    return lStar > 49.44
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
.masque-cross-halo { stroke: var(--masque-fig-bg, #ffffff); stroke-width: 1.5; }
.masque-cross-hair { stroke: var(--masque-cross, #b0b0b0); stroke-width: 1; stroke-opacity: 0.8; }
.masque-cross circle { fill: var(--masque-cross, #b0b0b0); stroke: var(--masque-fig-bg, #ffffff); stroke-width: 1; }
/* Default :focus-visible outline stays until a focus ring is actually drawn (kbd-ring, set by
   keyboard.ts's focusTo) — so tabbing in still shows *something* before the first arrow press,
   but the browser outline doesn't double up with our own ring once one exists. */
.surface.kbd-ring:focus-visible { outline: none; }
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
.masque-hi.masque-hover { fill: var(--masque-hi-c); fill-opacity: ${HOVER_FILL_OPACITY}; }
.masque-hi.masque-wash { fill: var(--masque-hi-c); fill-opacity: ${SELECTED_FILL_OPACITY}; }
.masque-hi.masque-nostroke { stroke: none; }
/* Element-prefixed, not bare .masque-fillshape: the dodge fill must not leak onto plain-svg
   chrome. ROI grips are .masque-handle (white fill, chrome stroke), not .masque-hi. */
svg.masque-fill { mix-blend-mode: color-dodge; }
svg.masque-fill .masque-hi.masque-fillshape { fill: var(--masque-hi-fill); fill-opacity: 1; stroke: none; }
svg.masque-edge .masque-hi.masque-hover,
svg.masque-edge .masque-hi.masque-wash { stroke: var(--masque-chrome); fill: none; }
.masque-handle { fill: #ffffff; stroke: var(--masque-hi-stroke, var(--masque-chrome)); stroke-width: 1; vector-effect: non-scaling-stroke; }
@supports not (mix-blend-mode: color-dodge) {
  svg.masque-fill .masque-hi.masque-fillshape { fill: var(--masque-chrome); fill-opacity: 0.18; }
}
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
   box, 5px right of its left edge. --masque-caret-x (geometry.ts's caretX) is "px from the anchored
   tooltip's OUTER left edge to the anchor" — landing the apex exactly there needs both offsets
   backed out: -1 (border) -5 (this element's own half-width) = -6. The 14px fallback (used only
   when --masque-caret-x is unset, i.e. every cursor-following, non-anchored placement) preserves
   the pre-existing default apex position (14-6=8, the literal this replaced). The -1 above assumed
   the default 1px border-left; the 3px accent border (hover.ts's setMarkAccent, --masque-mark-border)
   pushes the padding box 2px further right, so the extra width beyond the baked-in 1px
   (--masque-mark-border-w, set alongside the accent) is backed out too. */
.masque-tip::before { content: ""; position: absolute; top: -5px;
       left: calc(var(--masque-caret-x, 14px) - 6px - var(--masque-mark-border-w, 1px) + 1px);
       border: 5px solid transparent; border-top: none; border-bottom-color: var(--masque-tip-bg-resolved);
       display: var(--masque-tip-caret, block); }
.masque-tip.flip-y::before { top: auto; bottom: -5px; border-bottom: none;
       border-top: 5px solid var(--masque-tip-bg-resolved); }
.masque-tip.flip-x::before { left: auto; right: 8px; }
.masque-tip-row { display: flex; gap: 8px; justify-content: space-between; }
.masque-tip-key { color: var(--masque-tip-accent, #6b7280); }
.masque-tip-val { font-variant-numeric: tabular-nums; }
@media (prefers-color-scheme: dark) {
  .masque-tip { box-shadow: var(--masque-tip-shadow, 0 2px 4px rgba(0,0,0,0.4), 0 8px 16px rgba(0,0,0,0.3)); }
}
@media (prefers-reduced-motion: reduce) {
  .masque-enter, .masque-leave { animation: none; }
  .masque-tip, .masque-cross { transition: none; }
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

    // The @bind target is the host element. Seed the same envelope Julia's `mount_envelope`
    // builds, or Pluto's mount-time read overwrites `initial_value`. A selects-elements widget
    // seeds `{items}` (including an explicit empty brush). One hydrated index on a scalar layer
    // seeds `{layer, index}`. Several indices on a scalar layer are a highlight only (`null`):
    // that interaction holds one event, so a set is not a value it can carry.
    //
    // No `payload` key: `selected=` only ever hydrates a SELECTED_KINDS layer (hitLayerByIndex
    // throws otherwise), and Julia reconstructs an element hit from its own manifest rather than
    // trusting an upload. Built in the same loop as `selHits` so both read `hitLayerByIndex` —
    // which throws on an unsupported kind or an out-of-range index — before either is assigned.
    const hydrated: { layer: string; index: number }[] = []
    const selHits: Hit[] = []
    for (const layer of manifest.layers) {
        for (const idx of layer.selected ?? []) {
            selHits.push({ layer, ...hitLayerByIndex(layer, idx) })
            hydrated.push({ layer: layer.id, index: idx })
        }
    }
    const selection = manifest.selection
    const seedItems = selection === "elements" && (hydrated.length > 0 || manifest.hydrate === "items")
    const hostValue = seedItems ? { items: hydrated } : hydrated.length === 1 ? hydrated[0] : null
    ;(host as unknown as { value: unknown }).value = hostValue

    const shadowHost = document.createElement("div")
    const shadow = shadowHost.attachShadow({ mode: "open" })
    const style = document.createElement("style")
    style.textContent = STYLE

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
    // The photographic matrix is applied to the inner group. The outer group clips that
    // drawing to the axis viewport, so tick labels and the axis frame stay put. The tooltip
    // is not inside either group.
    const fillClip = makeGroup(fillSvg, "masque-clip")
    const edgeClip = makeGroup(edgeSvg, "masque-clip")
    const plainClip = makeGroup(plainSvg, "masque-clip")
    const fillPhoto = makeGroup(fillClip, "masque-photo")
    const edgePhoto = makeGroup(edgeClip, "masque-photo")
    const plainPhoto = makeGroup(plainClip, "masque-photo")
    const clipGroups = [fillClip, edgeClip, plainClip]
    const photoGroups = [fillPhoto, edgePhoto, plainPhoto]
    // persistent box-selection highlights (g.sel, z-below link) then transient legend-linked
    // highlights (g.link, z-above sel) then transient hover highlights (g.hi, z-above sel/link) —
    // same append order in every svg, so g.hi always paints over g.link/g.sel whichever svg(s)
    // any of the three lands in.
    const selGroup: HiGroups = { fill_: makeGroup(fillPhoto, "sel"), edge_: makeGroup(edgePhoto, "sel"), plain_: makeGroup(plainPhoto, "sel") }
    const linkGroup: HiGroups = { fill_: makeGroup(fillPhoto, "link"), edge_: makeGroup(edgePhoto, "link"), plain_: makeGroup(plainPhoto, "link") }
    const hiGroup: HiGroups = { fill_: makeGroup(fillPhoto, "hi"), edge_: makeGroup(edgePhoto, "hi"), plain_: makeGroup(plainPhoto, "hi") }
    // Screen-fixed chrome paints above the clip and is not transformed. A legend or colorbar
    // ring outside the axis viewport would otherwise vanish for the whole preview.
    const fillFixed = makeGroup(fillSvg, "masque-fixed")
    const edgeFixed = makeGroup(edgeSvg, "masque-fixed")
    const plainFixed = makeGroup(plainSvg, "masque-fixed")
    const selFixed: HiGroups = { fill_: makeGroup(fillFixed, "sel"), edge_: makeGroup(edgeFixed, "sel"), plain_: makeGroup(plainFixed, "sel") }
    const hiFixed: HiGroups = { fill_: makeGroup(fillFixed, "hi"), edge_: makeGroup(edgeFixed, "hi"), plain_: makeGroup(plainFixed, "hi") }
    const surface = document.createElement("div")
    surface.className = "surface"
    // touch-action: block native scroll/pinch on the surface ONLY when this manifest has a drag
    // interaction (threshold / ROI / view) — a hover/click-only plot (e.g. a plain scatter) must
    // not hijack page scrolling when a finger lands on it. This has to be decided up front, not
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

    shadow.append(style, fillSvg, edgeSvg, plainSvg, surface, tip, kbdHint, liveRegion)
    host.appendChild(shadowHost)
    // --masque-fig-bg drives the CSS-only tooltip theme (mount.ts's STYLE, lch(from …)); set
    // before tipStyle below so an explicit tooltip_bg/tooltip_color kwarg (--masque-tip-bg/
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
    // A frame that arrives while an ROI or threshold drag holds those nodes. Rebuilt when the drag ends.
    let pendingChrome: Manifest | null = null
    const channel = createGestureChannel(requestFrame ?? null, applyFrame, () => { clearPhoto() })

    const ctx: OverlayCtx = {
        manifest_: manifest, host_: host, base_: base, surface_: surface, tip_: tip, hiGroup_: hiGroup, selGroup_: selGroup,
        hiFixed_: hiFixed, selFixed_: selFixed, linkGroup_: linkGroup,
        thresholdLines_: thresholdLines, roiBoxes_: roiBoxes,
        shadowRoot_: shadow, focusable_: focusable, layerStarts_: layerStarts, liveRegion_: liveRegion,
        cross_: cross,
        gesture_: channel,
        photoPaint_: (m) => paintPhoto(m),
    }
    const state = createOverlayState()
    state.selHits_ = selHits

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

        // Threshold lines / ROI boxes are built once, from the mount manifest, and never
        // patched in place elsewhere — a camera move invalidates every hit region on the same
        // axis (§12.4), so anything derived from the OLD manifest is torn down and rebuilt from
        // the new one rather than mutated.
        // An ROI or threshold drag still holds these nodes. Replacing them detaches the
        // gesture. The photograph and the stamp still land; the chrome waits for pointerup.
        if (chromeHeld()) pendingChrome = newManifest
        else {
            pendingChrome = null
            replaceDraggedChrome(newManifest)
        }
        ctx.manifest_ = newManifest
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
        // A frame that lands mid-pan or mid-wheel would wipe the readout the gesture is still
        // showing. Pointer-up and the wheel idle timer hide it themselves once the gesture ends.
        if (state.drag_?.kind !== "view" && state.wheelTimer_ === null) hideTip(ctx, state)

        // Re-key the LIVE selection against the new layer objects — do NOT re-derive it from
        // the new manifest's own `selected=` field, which is only the mount-time hydration seed;
        // reading it here would resurrect that and silently drop every click since (#102
        // tripwire #3, the #107 regression shape). `selKeys_` is already id-keyed and gets
        // rebuilt by `renderSelection` itself, so only `selHits_` needs re-keying here.
        const nextSel: Hit[] = []
        for (const h of state.selHits_) {
            const layer = newManifest.layers.find((l) => l.id === h.layer.id)
            if (!layer) continue
            try {
                nextSel.push({ layer, ...hitLayerByIndex(layer, h.index) })
            } catch {
                /* index no longer valid against the new geometry — drop rather than throw mid-gesture */
            }
        }
        state.selHits_ = nextSel
        renderSelection(ctx, state)
        adoptPhoto(input)

        // A paired, atomic stamp — written in the SAME synchronous block as the swap above, not
        // sampled separately — so an observer (e2e's kind_sweep.mjs) can tell "a frame actually
        // landed" from "a frame was requested," and read the exact camera it landed at, without
        // relying on the bond (which §12.3 leaves untouched for a view gesture).
        const viewLayer = newManifest.layers.find((l) => l.id === input.id)
        const geom = viewLayer?.geometry as { azimuth?: number; elevation?: number } | undefined
        const camera: Record<string, number> = "azimuth" in input
            ? { azimuth: geom?.azimuth ?? NaN, elevation: geom?.elevation ?? NaN }
            : (() => {
                const t = viewLayer ? newManifest.transforms[viewLayer.axis] : undefined
                return { xmin: t?.xlims[0] ?? NaN, xmax: t?.xlims[1] ?? NaN, ymin: t?.ylims[0] ?? NaN, ymax: t?.ylims[1] ?? NaN }
            })()
        gestureFrameCount += 1
        ;(host as unknown as { dataset: DOMStringMap }).dataset.masqueGestureFrame = JSON.stringify({
            n: gestureFrameCount, settle: input.settle === true, ...camera,
        })
    }

    // The sent frame is the photograph now. Keep whatever the live matrix has moved since
    // that request, in the new frame's image pixels. Identity means the screen already
    // matches the new pixels, so the transform comes off in this same turn.
    function adoptPhoto(input: Record<string, unknown>): void {
        const s = input.s, tx = input.tx, ty = input.ty
        if (typeof s !== "number" || typeof tx !== "number" || typeof ty !== "number") return
        if (!(s > 0) || !Number.isFinite(s + tx + ty)) return
        const sent = { s, tx, ty }
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
        state.surfaceSized_ = false
    }
    // The axis frame (spines, ticks, labels) stays on the untransformed base. A copy of the
    // same pixels, clipped to the pan view's viewport, carries the matrix, so only the data
    // inside the axes slides.
    let dataClip: HTMLDivElement | null = null
    let dataCopy: HTMLImageElement | HTMLCanvasElement | null = null
    let copyGen = -1
    const clipIds = ["masque-clip-fill", "masque-clip-edge", "masque-clip-plain"]
    const photoViewport = (): ViewGeometry | null => {
        const id = state.photoViewId_
        const layer = (id ? ctx.manifest_.layers.find((l) => l.id === id) : undefined)
            ?? ctx.manifest_.layers.find((l) => l.kind === "view" && (l.geometry as ViewGeometry).mode === "pan")
        if (!layer || layer.kind !== "view") return null
        const g = layer.geometry as ViewGeometry
        if (!(g.w > 0) || !(g.h > 0)) return null
        return g
    }
    const clearDataClip = () => {
        dataClip?.remove()
        dataClip = null
        dataCopy = null
        copyGen = -1
        for (const g of clipGroups) g.removeAttribute("clip-path")
    }
    paintPhoto = (m) => {
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
        const svgT = `translate(${m.tx} ${m.ty}) scale(${m.s})`
        for (const g of photoGroups) {
            if (id || !view) g.removeAttribute("transform")
            else g.setAttribute("transform", svgT)
        }
        if (!view) {
            clearDataClip()
        } else {
            if (!dataClip || !dataCopy) {
                dataClip = document.createElement("div")
                dataClip.className = "masque-data-clip"
                dataClip.style.position = "absolute"
                dataClip.style.overflow = "hidden"
                dataClip.style.pointerEvents = "none"
                dataCopy = ctx.base_ instanceof HTMLCanvasElement
                    ? document.createElement("canvas")
                    : document.createElement("img")
                if (dataCopy instanceof HTMLImageElement) dataCopy.alt = ""
                dataCopy.style.position = "absolute"
                dataCopy.style.transformOrigin = "0 0"
                dataCopy.style.maxWidth = "none"
                dataClip.appendChild(dataCopy)
                host.insertBefore(dataClip, shadowHost)
                copyGen = -1
            }
            dataClip.style.left = `${br.left - hr.left + view.x * sx}px`
            dataClip.style.top = `${br.top - hr.top + view.y * sy}px`
            dataClip.style.width = `${view.w * sx}px`
            dataClip.style.height = `${view.h * sy}px`
            dataCopy.style.left = `${-view.x * sx}px`
            dataCopy.style.top = `${-view.y * sy}px`
            dataCopy.style.width = `${ow}px`
            dataCopy.style.height = `${oh}px`
            dataCopy.style.transform = `translate(${m.tx * sx}px, ${m.ty * sy}px) scale(${m.s})`
            if (dataCopy instanceof HTMLImageElement && ctx.base_ instanceof HTMLImageElement) {
                if (dataCopy.src !== ctx.base_.src) dataCopy.src = ctx.base_.src
            } else if (dataCopy instanceof HTMLCanvasElement && ctx.base_ instanceof HTMLCanvasElement && copyGen !== frameGen) {
                const bw = ctx.base_.width
                const bh = ctx.base_.height
                if (bw > 0 && bh > 0) {
                    dataCopy.width = bw
                    dataCopy.height = bh
                    dataCopy.getContext("2d")?.drawImage(ctx.base_, 0, 0)
                    copyGen = frameGen
                }
            }
            clipGroups.forEach((g, i) => {
                const svg = g.ownerSVGElement
                if (!svg) return
                const cid = clipIds[i]
                let cp = svg.querySelector(`#${cid}`) as SVGClipPathElement | null
                if (!cp) {
                    cp = document.createElementNS(SVG_NS, "clipPath")
                    cp.id = cid
                    cp.appendChild(document.createElementNS(SVG_NS, "rect"))
                    svg.insertBefore(cp, svg.firstChild)
                }
                const rect = cp.firstElementChild as SVGRectElement
                rect.setAttribute("x", String(view.x))
                rect.setAttribute("y", String(view.y))
                rect.setAttribute("width", String(view.w))
                rect.setAttribute("height", String(view.h))
                g.setAttribute("clip-path", `url(#${cid})`)
            })
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
    const move = (e: PointerEvent) => onPointerMove(ctx, state, e)
    const releaseChrome = (kind: string | undefined) => {
        if ((kind === "roi" || kind === "threshold") && !state.drag_) flushPendingChrome()
    }
    const up = (e: PointerEvent) => {
        const kind = state.drag_?.kind
        onUp(ctx, state, e)
        releaseChrome(kind)
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
        onLeave(ctx, state)
        releaseChrome(kind)
    }
    const lostCapture = () => {
        const kind = state.drag_?.kind
        onLostCapture(ctx, state)
        releaseChrome(kind)
    }
    const click = (e: MouseEvent) => onClick(ctx, state, e)
    const keydown = (e: KeyboardEvent) => handleKeydown(ctx, state, e)
    // DOM focus leaving the surface — Tab-away, a click landing elsewhere on the page, or the
    // notebook cell itself losing focus — must clear keyboard focus the same way Escape does.
    // Without this, focusIdx/focusHit/kbd-ring/the live region's last text all stay pinned to
    // whatever was last focused, and hover.ts's restoreFocus keeps re-drawing that stale ring
    // on every later pointer miss even though nothing is keyboard-focused anymore.
    const focusout = () => focusTo(ctx, state, null)

    const onWheel = (e: WheelEvent) => {
        if (state.drag_) return
        // The axis viewport is in layout pixels. The zoom anchor is the content pixel
        // under the cursor, or a second notch walks off it.
        const layout = layoutImagePx(ctx.base_, ctx.manifest_, e.clientX, e.clientY)
        let id = ""
        let axis = ""
        for (const layer of ctx.manifest_.layers) {
            if (layer.kind !== "view" || !layer.events.includes("drag")) continue
            const g = layer.geometry as ViewGeometry
            if (g.mode !== "pan") continue
            if (layout.x < g.x || layout.x > g.x + g.w || layout.y < g.y || layout.y > g.y + g.h) continue
            if (!ctx.manifest_.transforms[layer.axis]) continue
            id = layer.id
            axis = layer.axis
            break
        }
        if (!id) return
        e.preventDefault()
        state.photoViewId_ = id
        const local = unmapPoint(state.photo_, layout)
        const next = zoomAt(state.photo_, local, wheelScale(e.deltaY, e.deltaMode))
        state.photo_ = next
        paintPhoto(next)
        const lim = matrixLimits(ctx.manifest_.transforms[axis], next)
        if (lim) {
            ctx.gesture_.request({ id, ...lim, settle: false, s: next.s, tx: next.tx, ty: next.ty })
            setTipText(ctx, state, limitsTip(lim))
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

    // Drawn into g.sel, not g.hi: it must survive hovers (onMove clears g.hi on every miss)
    // and support multiple selected indices (drawHi keeps only the last).
    if (state.selHits_.length) renderSelection(ctx, state)

    let cleaned = false
    const cleanup = () => {
        // Pluto invalidation and a test teardown can both call this. The second call must
        // not revoke the blob URL again or deliver a frame the first call already dropped.
        if (cleaned) return
        cleaned = true
        loadToken += 1
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
        host.masqueDead = true
        host.masqueDetach?.()
    }
    invalidation?.then(cleanup)
    return { cleanup }
}
