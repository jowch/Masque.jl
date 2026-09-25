# 5. The bond value

`@bind sel masque(fig, interactables)` returns `nothing` until a commit, then one event or a
`Vector{ElementEvent}`. The type matches the interactables in that call. A
[`PointInteractable`](@ref) is always an [`ElementEvent`](@ref). A vector appears only when
the same call contains an [`ROIInteractable`](@ref) whose `selects` aims at those points. A
`selects` ROI over a grid returns one [`GridWindowEvent`](@ref). Either way the box owns that
bond: `build_manifest` ships the target layer hover-only (no `"click"` in its `events`), so a
click on it commits nothing and shows no `pointer` cursor, and `bond_from_js` refuses a
single-element envelope for that layer. The alternatives were a one-element commit (a one-cell
window, or a one-point vector, which is what points did before) and moving the box to the
clicked mark. Both were rejected: the first leaves the box drawn over its old region while the
value names a different mark, and the second builds further on one value per widget. Compound
binds (a value keyed by layer) are deferred; a hover-only target is easy to make clickable again
if they land. Axis, colorbar, threshold, and bounds-only ROI stay their own
types even inside a widget that also selects. A view pan or orbit commits nothing.

| Commit | Type | Fields the cell reads |
|---|---|---|
| point, bar, polygon, segment, list of rects | `ElementEvent` | `layer`, `index` (1-based); other names forward to the row |
| legend entry | `LegendEvent` | `label`, `group`, `targets`; `index` is the entry, not a table row |
| heatmap / image cell | `GridCellEvent` | `i`, `j` (1-based); `A[cell]` is `A[cell.i, cell.j]`; `value` is `nothing` when it was not shipped |
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

The wire stays 0-based. `mount.ts` writes an envelope (`null`, `{items}`, or
`{layer, index}` with no payload for an element). Pluto overwrites `initial_value` with
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
