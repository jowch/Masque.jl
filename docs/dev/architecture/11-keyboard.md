# 11. Keyboard navigation & ARIA

The overlay `surface` is a `tabindex="0"` focus stop (`role="application"` — NVDA/JAWS's default
browse mode otherwise intercepts arrow keys before a `role="group"` element sees them). Focus
moves over a flat, manifest-order list (`frontend/src/keyboard.ts`'s `buildFocusable`) restricted
to the element-indexed kinds `:circles`/`:rects`/`:polygons`/`:segments`/`:polyline`/`:lines`, in the same
layer-then-element order `hitTest` resolves ties in. `:grid` is excluded even though it's
element-indexed — `hitLayerByIndex` has no pre-highlight geometry for it, its `payloads[]` is
empty by design (values are resolved client-side from `(i,j)`, not positionally), and
`ncols*nrows` is unbounded (a 1000×1000 heatmap is not something to arrow through one cell at a
time). `:axis`/`:threshold`/`:roi`/`:view` are continuous or drag-only, not element-indexed.

Keys (handled only while the surface has DOM focus): →/↓ next, ←/↑ previous (both clamp at the
ends, they don't wrap), Home/End first/last, PageDown/PageUp next/previous layer, Enter/Space
dispatch the identical `commitClick` bond payload a mouse click on the same element would (only
if the layer's `events` includes `:click`), Escape clears focus and blurs. Every handled key
calls `preventDefault`/`stopPropagation`; everything else, notably Tab, passes through untouched
— the surface must never become a keyboard trap.

The focus ring reuses the existing hover highlight (`highlight.ts`'s `drawHi`/`makeHiElement`,
mode `"hover"`) — no new visual recipe. Pointer hover and keyboard focus share one ring: a
pointer hover overwrites it and a pointer miss restores it (`hover.ts`'s `restoreFocus`, reading
a cache `keyboard.ts`'s `focusTo` populates on `OverlayState`) so there is never a moment with
two rings, or a "focused but no ring" gap when the mouse merely passes over empty canvas.

**Announcements** go to a visually-hidden `aria-live="polite" aria-atomic="true"` `<div>` inside
the shadow root — not the tooltip (`aria-hidden` toggling on the tooltip is a visibility signal,
not an announcement path for assistive tech). Text is `<label prefix, if set>element <n> of
<count in that layer>: <plain-text tooltip>`, debounced 150ms so a held arrow key announces only
the element you land on. `template.ts`'s `plainTextForHit`/`stripToPlain`/`renderAutoTablePlain`
produce the plain-text body (tag-stripped + entity-unescaped for the template path, a parallel
non-HTML renderer for the auto-table path — a bare tag-strip over the auto-table's markup would
announce `"amp;"` for an escaped `&`). `aria-describedby` on the surface points at a static,
non-live usage hint in the same shadow root (ARIA idrefs don't cross shadow boundaries).

The per-layer `label` field ([§3](03-interactables.md), `HitLayer`) is the only manifest-shape change here — see
`perf-findings.md` for its measured wire cost. Keyboard-driving the drag interactables
(threshold/ROI/view arrow-nudge) is explicitly out of scope: three drag state machines, each
needing the same live-verification pass across both backends, is a disproportionate v1 cost for
a feature with a full mouse/touch path already.

