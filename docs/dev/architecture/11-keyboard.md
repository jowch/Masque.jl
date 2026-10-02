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

Keyboard focus shows exactly one indicator (#168). Until a mark ring exists, the surface draws its
own: `.surface:focus-visible:not(.kbd-ring)` is a 2px inset outline in `--masque-chrome` (the same
grey as the ring, set at mount from the figure's background), falling back to `Highlight`, which
forced-colours mode also uses. That covers the moment after Tab and before the first arrow, and
every widget with nothing to arrow through: a heatmap or image, an axis or colorbar readout, a
threshold, ROI, view, or slice. The `kbd-ring` class (added by `keyboard.ts`'s `focusTo`, removed
when focus clears) switches it off once a mark ring is showing, so the two never stack. It is an
`outline`, not a `box-shadow`, because forced colours drop shadows, and it keys on
`:focus-visible`, not `:focus`, so a pointer click focuses the surface without drawing it.
`keyboard_a11y.mjs` asserts the computed outline on both backends.

**Announcements** go to a visually-hidden `aria-live="polite" aria-atomic="true"` `<div>` inside
the shadow root — not the tooltip (`aria-hidden` toggling on the tooltip is a visibility signal,
not an announcement path for assistive tech). Text is `<label prefix, if set>element <n> of
<count in that layer>: <body>`, debounced 150ms so a held arrow key announces only
the element you land on. `template.ts`'s `plainTextForHit`/`stripToPlain`/`renderAutoTablePlain`
produce that body (tag-stripped + entity-unescaped for the template path, a parallel
non-HTML renderer for the auto-table path — a bare tag-strip over the auto-table's markup would
announce `"amp;"` for an escaped `&`). A legend with no card (`tooltip === false` and
`bond == "legend"`) uses `payload.label` for the body, so the entry name is still announced. `aria-describedby` on the surface points at a static,
non-live usage hint in the same shadow root (ARIA idrefs don't cross shadow boundaries).

The per-layer `label` field ([§3](03-interactables.md), `HitLayer`) is the only manifest-shape
change here — see `perf-findings.md` for its measured wire cost.

The drag interactables (threshold, ROI, view) get one tab stop each (#169), built by
`dragkeys.ts` and appended to the shadow root after the surface, so Tab reaches the plot first and
arrows on the surface keep walking marks; `buildFocusable` never sees these layers. A stop is an
invisible, `pointer-events: none` box over the line, the box, or the view's viewport (re-placed on
every photographic repaint and pointer release); its own `:focus-visible` outline is its
indicator, since it draws no mark ring. A threshold stop is `role="slider"` with
`aria-orientation` along the free axis; ROI and view stops are `role="application"`. Each has its
own `aria-describedby` hint.

Keys drive the pointer path's geometry, not a second state machine: `drag/threshold.ts`'s
`begin`/`move`/`end`, `drag/roi.ts`'s move and edge branches, the photographic matrix plus
`bond.ts`'s `settleCurrentPan` for pan, and `drag/view.ts`'s `requestInput` for orbit. Each
keydown updates the geometry and the readout; keyup (or blur, or Escape) commits once — the
`@bind` write for threshold and ROI, the `gesture_.settle` for a view, which never writes `@bind`
(#122). Steps: threshold and ROI 1 CSS px (10 with Page), converted by `manifest.width / cssWidth`
(fallback `scaling`), or one category on a categorical threshold axis; view 10% of the viewport
(pan translate, or the orbit offset fed to `orbitAngles`); `+`/`-` one wheel notch of `zoomAt` at
the viewport centre, pan only. Ctrl/Cmd chords and Tab pass through; handled keys
`preventDefault` and `stopPropagation`. Alt+Shift+Arrow shrinks an ROI side, which the issue's
grow-only Alt+Arrow could not.
