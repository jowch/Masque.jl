# 5. The bond value

`@bind sel masque(fig, interactables)`:
- `sel === nothing` at mount, unless the widget carries `selected=`, in which case the bond is
  already hydrated to those elements before any click (see "Selected-state…", below). Clicks
  outside all layers are still a no-op — by design — and leave `sel` unchanged.
- On click: `sel` is an `InteractionEvent(layer, index, payload)`. For an element kind
  (`:circles`/`:rects`/`:polygons`/`:segments`/`:polyline`), `payload` is the exact object passed
  in `payloads=` for that element, looked up in the manifest rather than decoded from what the
  browser sent (`_bond_payload` in `render.jl`). There is no browser copy to discard: the click
  upload carries only `{layer, index}` for these kinds (#109) — `layer`/`index` are already
  enough to look the object up, so sending the payload back over the wire would be dead weight
  the receiver throws away — and the result is still `ev.payload === payloads[i]`, so a
  `NamedTuple` payload stays a `NamedTuple`. Kinds with no Julia-side original —
  `:axis`/`:grid`/`:roi` — have nothing to look up, so the browser-computed value is
  what ships; `_bond_payload` converts it to a flat, non-recursive `NamedTuple`, per kind, so
  `ev.payload.x` reads the same way an element payload does (#110): for `AxisInteractable`,
  `index = -1` (axis hits aren't element-indexed) and `payload` is `(; x, y)` (or `(; value)`
  for a `Colorbar`, via `AxisTransform.valueaxis`), inverted from the axis transform in JS. A
  `:grid` hit carries two disjoint shapes under the one kind tag — `(; i, j)` / `(; i, j,
  value)` from a direct cell hit, or the `selects`-ROI region descriptor below — so
  `_bond_payload`'s `:grid` branch dispatches on which keys are actually present, not on the
  kind alone. `ThresholdInteractable` is the one exception to the NamedTuple conversion: its
  payload is a bare scalar (the dragged data coordinate), so there's no field to name and
  nothing to convert.
- Hover **never** sets `sel` — it is overlay-local. Only `events` containing `:click` round-trip.

A typed `InteractionEvent` is shipped via `AbstractPlutoDingetjes.Bonds.transform_value`, which
reconstructs it from the raw JS emission — a `Dict` (or, for a selector's multi-echo, a vector of
them) — rather than trusting the browser's payload for an element kind.

**M4 selector contract — Design D.** The bond value depends on whether the interactable is a
selector (a `ROIInteractable` with `selects=:layer_id` set) or not:

- **Click interactables and bounds-only `ROIInteractable`** (no `selects` kwarg) return a single
  `InteractionEvent` (or `nothing` before the first interaction) — the v1 single-event contract is
  unchanged. This is a deliberate Design-D decision: the union `single | Vector` is resolved by the
  presence or absence of `selects`, not by a per-event flag.
- **Selector ROIs** (`ROIInteractable(…; selects=:layer_id)`) implement
  `AbstractSelector <: AbstractInteractable` and return `Vector{InteractionEvent}`:
  - **Points (`:circles`) target** → N point events, one per element whose geometry falls
    within the dragged box.
  - **Grid target** (`:grid` kind) → a 1-element vector holding a **region descriptor**
    `(; i0, i1, j0, j1, xmin, xmax, ymin, ymax)` — 0-based inclusive cell indices plus
    data-space bounds — for server-side aggregate statistics. The browser never needs `values[]`
    for box-selection. This shares the `"grid"` kind tag with a direct cell hit's `(; i, j)` /
    `(; i, j, value)` (above) — the two are disjoint key sets, not a kind-level distinction, so
    `_bond_payload` tells them apart by which keys the browser actually sent.
  - **Empty box** → `InteractionEvent[]` (never `nothing`).

**`AbstractSelector`** is the selector sub-interface (`selects(sel)::Symbol` returning the target
layer id; `compatible_kinds(sel)` returning accepted geometry kinds). At manifest-build,
`compatible_kinds` is validated against the target layer's `kind` — an incompatible pairing is a
loud `ArgumentError`. The only new manifest field is `selects` (a string id) on the selector
layer; `targetKind`/`arity` fields were designed but dropped as redundant — the JS reads the
target kind from the looked-up layer, and `transform_value` detects the `{ items: [...] }` JS
return envelope shape to produce the vector (versus the flat `{layer,index,payload}` dict for
single events).

**Selected-state lives in client-side overlay state, not a `previous=` kwarg or a bond round-trip
(#103).** A click (or Enter/Space on a keyboard-focused element, or a `selects`-ROI release) sets
`OverlayState.selHits_` directly in the browser and draws the highlight from it — no bond write
drives the highlight, and Julia never sees a "mark this selected" instruction back. `selected=`
supplies only the selection's *starting* value: `build_manifest` stamps a `"selected"` index list
onto each named layer, and `mount.ts` reads it once at mount to seed both `state.selHits_` (the
highlight) and `host.value` (the bond, via `initial_value`/`_hydrated_selection` on the Julia
side) — after that seeding `selected=` plays no further role for that widget instance, and the
next click replaces the whole selection, hydration included (single-select — a growing set is
still the `Ref`-accumulator pattern in `demo.jl`). Because the overlay is wiped on every
re-render, a rebuild always restarts from `selected=`; there is no `previous=` argument and no
feedback loop writing the selection back onto the manifest for a next render — the caller
re-supplies `selected=` (typically from the prior bond value) if the same selection should
survive a rebuild.

**A view-manipulation gesture never produces a bond value.** Frames shipped to update the view
during an active drag-to-pan or orbit ([§12](12-gesture-channel.md)) do not assign `sel` and do not touch this bond, and
neither does the gesture's release: a camera is operational state, not an analysis value ([§12.3](12-gesture-channel.md#123-what-commits-and-when)).
A `ThresholdInteractable` or `ROIInteractable` release does commit, through the ordinary path
above.

