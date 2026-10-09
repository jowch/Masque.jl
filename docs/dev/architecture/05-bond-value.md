# 5. The bond value

`@bind sel masque(fig, interactables)` returns `nothing` until a commit, then one event or a
`Vector{ElementEvent}`. The type matches the interactables in that call. A
[`PointInteractable`](@ref) is always an [`ElementEvent`](@ref). A vector appears only when
the same call contains an [`ROIInteractable`](@ref) whose `selects` aims at those points. A
`selects` ROI over a grid returns one [`GridWindowEvent`](@ref). A view pan or orbit commits
nothing.

A threshold, any ROI, or a colorbar the caller passed owns the bond (#309; `owns_bond`).
`build_manifest` ships every other layer hover-only (no `"click"` in its `events`), so they take
no clicks and show no `pointer` cursor, and stamps `bondOwner` with the owner's layer id. The
other layers are transparent to clicks, not click sinks: a click on them falls through `hitTest`
and finds nothing that commits. For a `selects` box, `bond_from_js` also refuses a
single-element envelope for its target. The colorbars `masque(fig)` adds by itself
(`ColorbarInteractable.auto`) own nothing, or any figure with a colorbar would take no clicks.
Two owners in one call raise `ArgumentError` naming both: each would overwrite the other, and the
bond could not start at both initial states.

The owner sets the bond's starting value. A threshold starts at a `ThresholdEvent` at `value`
(with its category's label when `value` is a category's position) and a bounds-only ROI at a
`BoundsEvent` at `bounds`: `build_manifest` writes that wire envelope as `initial`, the same shape
a release sends. A `selects` ROI starts at what its starting box holds (#330): `initial` is the
`{items}` envelope a release of the untouched box would send, which `_contained_items` computes
from the manifest's own image-px numbers (circle centres, grid edges) with the comparisons
`computeSelection` makes, and `mount.ts` highlights it at mount. Julia rather than the browser
computes it because `initial_value` must equal what the browser seeds. The `roiselect` and
`roigrid` parity goldens pin the two together: `selection.test.ts` runs `computeSelection` on
them and compares with `initial`. A grid item carries the box's `bounds` as given, where a
release inverts the box's pixel corners, so those four numbers can differ in the last bits.
`selected=` on the target still wins, as before. A colorbar has no value before its first
click, so it starts at `nothing`. With an owner, `selected=` on another layer only highlights.

The alternatives for a `selects` target were a one-element commit (a one-cell window, or a
one-point vector, which is what points did before) and moving the box to the clicked mark. Both
were rejected: the first leaves the box drawn over its old region while the value names a
different mark, and the second builds further on one value per widget. Compound binds (a value
keyed by layer) are deferred; a hover-only layer is easy to make clickable again if they land.

| Commit | Type | Fields the cell reads |
|---|---|---|
| point, bar, polygon, segment, list of rects | `ElementEvent` | `layer`, `index` (1-based); other names forward to the row |
| legend entry | `LegendEvent` | `label`, `group`, `targets`; `index` is the entry, not a table row |
| heatmap / image cell | `GridCellEvent` | `i`, `j` (1-based); `A[cell]` is `A[cell.i, cell.j]`; `value` is `nothing` when it was not shipped; `payload` is the cell's `payloads` entry (Julia looks it up from `(i, j)`, the browser never uploads it), and its fields forward as on `ElementEvent` |
| grid brush | `GridWindowEvent` | `i1:i2`, `j1:j2` (1-based inclusive); `A[win]` is that window; a miss is an empty range |
| axis click | `AxisEvent` | `x`, `y`; `xcat`, `ycat` on a categorical dimension, else `nothing` |
| colorbar click | `ColorbarEvent` | `value` |
| threshold release | `ThresholdEvent` | `value`; `category` on a categorical dimension, else `nothing`; `value=` accepts the event or a number |
| bounds-only ROI | `BoundsEvent` | `xmin`, `xmax`, `ymin`, `ymax`; `bounds=` accepts the event or the 4-tuple |

`bondtype(interactable)` is the commit type. The default is `ElementEvent`. A custom
interactable implements `hitlayers`, and `bondtype` plus `transform_bond` when the commit is
not an element event. `transform_bond` is a method on the instance. Both backends call
`bond_from_js`, which dispatches to that method when the widget still holds the owner and
otherwise rebuilds the event from the layer's `bond` stamp. The stamp is one of
`"element"`, `"legend"`, `"gridcell"`, `"axis"`, `"colorbar"`, `"threshold"`, `"bounds"`,
`"none"`. Owners are not serialized.

The wire stays 0-based. `mount.ts` writes an envelope (`null`, `{items}`, the owner's
`initial`, or `{layer, index}` with no payload for an element). Pluto overwrites `initial_value` with
`transform_value` of that same envelope. Subtract 1 only when writing the manifest; add 1
when reading the wire. Grid window keys on the wire are `i0,i1,j0,j1` (0-based inclusive);
Julia stores `i1,i2,j1,j2`. An element or legend row is looked up as `payloads[index]` with
the 1-based index. The browser payload for those kinds is ignored.

`selected=` accepts `nothing`, one event, a vector of events, an `Int` or
`AbstractVector{<:Integer}` when exactly one seedable layer is present, or a `NamedTuple` /
`AbstractDict` keyed by layer id. `selected = 1` and `selected = [1]` are the same seed.
On a scalar point layer that seed is one `ElementEvent`; several indices highlight those
marks and leave the bond `nothing`. On a `selects` point call the same seeds are a vector,
and an explicit empty vector hydrates `ElementEvent[]` (`hydrate = "items"`). `nothing` is
not rewritten to `[]`. Indices are checked `1 <= idx <= n`; `0` errors, naming `1:n`. The
manifest stores the 0-based index the overlay already paints.

Hover never sets the bond. Only a commit round-trips.
