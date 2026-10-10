# 5. The bond value

`@bind sel masque(fig, interactables)` returns a `NamedTuple` with one field per layer a reader
can set (#335). A field is named by its layer id and holds that layer's value alone, so a
click on one plot never touches another's field. `src/fields.jl` decides which layers are
fields; `build_manifest` ships them as the manifest's `fields`, in layer order (before the
legend-first hit sort), and strips `"click"` from every other layer's `events`, so those keep
hover and take no clicks.

A layer's role decides its field:

- **Pick**: a layer with `"click"` in its `events` and a bond stamp other than `"none"`.
  `nothing` until a click, then one event; a second click on the same element clears it. A
  default line (`:polyline` or `:lines` kind from a plot `masque(fig)` found by itself) is
  hover-only unless `bind` names it: neither the whole line nor a point on it is the obvious
  pick. A bound `:lines` layer with `points` (any 2D line) picks the data point a hover reads
  out: the wire adds `sample` (0-based) to `{layer, index}`, `index` still naming the line, and
  the `ElementEvent`'s `index` is the 1-based sample, its payload the line's plus `line`, `x`,
  `y`. The overlay rings the point (the selected-open ring around a circle of the line's hit
  slack). `selected=` indices on such a layer are samples, for one line only. A line without
  `points` (an `Axis3` line) still picks the whole line.
- **Control**: a threshold (stamp `"threshold"`) or an ROI box (stamp `"bounds"`, with or
  without `selects`). Always holds its event, starting at the constructor's `value` or
  `bounds`.
- **Brush**: the target of a `selects` box, stamped `"brush"` (`"elements"` or `"grid"`). It
  holds what the box contains, a `Vector{ElementEvent}` or one `GridWindowEvent`, and takes no
  clicks.
- Views, slices and `"none"` stamps have no field.

`bind` narrows and orders the fields (`_Binding`). Each entry is a field name (a `Symbol`), a
plot (its layers from `plotmap`), or an interactable (its final id, after `_number_builtin_ids`;
an interactable or plot with several layers, such as a `stem!` plot's `stem.points` and
`stem.stems`, gives all of them; a symbol that is a head, `:stem`, does too). One entry outside a tuple sets `"bare"`, which `bond_from_js` reads as that one object's value: the field's own,
or a `NamedTuple` of its parts. Names come from `id=`, a `NamedTuple` argument, or a `NamedTuple` `bind`; `_bind_call`
checks by object identity that every name an object gets is the same, then rebuilds it under
that id. A constructor's default id (`_BUILTIN_IDS`) names nothing. The binding travels with
the interactables as a `_Plan`, an `AbstractVector`, so a backend's `make_widget` passes it to
`_view_render_frame` unchanged and every frame's manifest has the same fields.

The manifest's `initial` holds every field's starting envelope, the value the browser sends
until the first commit. A pick starts at `null`, or at `{layer, index}` when `selected=` names
it. A control starts at `initial_envelope`: a threshold's `{layer, index: 0, payload: value}`
(the category's label when `value` is a category's position), a box's `BoundsEvent` payload. A
brush starts at what the first box on it contains (#330): `_contained_indices` (circle centres)
or `_contained_cells` (grid edges), computed from the manifest's own image-px numbers with the
comparisons `computeSelection` makes, so a release of the untouched box sends the same value.
Julia rather than the browser computes them because `initial_value` must equal what the
browser seeds. The `roiselect`, `roigrid`, `roiedge` and `roigridover` parity goldens pin the
two together: `selection.test.ts` runs `computeSelection` on them and compares. A grid item
carries the box's `bounds` as given, where a release inverts the box's pixel corners, so those
four numbers can differ in the last bits. `selected=` on the target wins, and an empty one
keyed to the target (`(pts = Int[],)`) starts the box empty; a bare `Int[]` seeds nothing. A frame's manifest leaves `initial` out.

`mount.ts` seeds `host.value` with `initial` (every field a key) and draws each field's
highlight from its envelope with `selectionForValue`. A commit (`ctx.commit_`) sets the fields
it names and sends the whole value, as a new object: a click sets its layer's field, a
threshold release its own, and a box release both its bounds and, with `selects`, its
target's items, in one `input` event. Keys that are not fields are dropped. The browser never
sends a diff: Pluto keeps only the latest value of a bond and replays it on reload, so a diff
could not be rebuilt reliably.

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

`bondtype(interactable)` is the type a field holds. The default is `ElementEvent`. A custom
interactable implements `hitlayers`, and `bondtype` plus `transform_bond` when the commit is
not an element event. `transform_bond` is a method on the instance. Both backends call
`bond_from_js`, which decodes each field with that method when the widget holds the layer's
interactable (`LayerOwner`) and otherwise rebuilds the event from the layer's `bond` stamp.
The stamp is one of `"element"`, `"legend"`, `"gridcell"`, `"axis"`, `"colorbar"`,
`"threshold"`, `"bounds"`, `"none"`. Owners are not serialized. A field's envelope must come
from its own layer; `bond_from_js` rejects one that names another.

The wire stays 0-based. The browser sends `{field: envelope}`, each envelope `null`, `{items}`
for a brush, or `{layer, index}` (no payload for an element kind) or `{layer, index, payload}`.
A field built with `select = :many` (its manifest layer carries `many: true`) always sends
`{items: [{layer, index[, payload]}, ...]}`, empty to start, in the order the picks were made;
`_many_value` decodes each item as the one-pick field would and returns a typed vector
(`Vector{ElementEvent}`, `Vector{LegendEvent}`, `Vector{AxisEvent}`). A `many` grid is the
exception: it holds a cell mask, sent as `{runs: [j, i0, n, ...]}` (0-based flat triples, n cells
of row j from column i0) or, once the runs pass 1 KB and packed bits are shorter,
`{bits: base64}` (cell `k = j*ncols + i` at bit `k % 8` of byte `k ÷ 8`), and `_grid_selection`
returns a `GridSelection` with a `BitMatrix` shaped like `values`. A value that doesn't fit
the grid raises `ArgumentError`. The browser holds the mask as one byte per cell
(`frontend/src/gridmask.ts`) and draws it as one hit: a fill path of the runs and an edge path of
the cell sides that border an unselected cell. A plain click replaces
the items with its one pick (or empties them when that pick was the only one), Cmd/Ctrl-click
and Cmd/Ctrl+Enter toggle one, and `clearPicks` empties every pick field on the clicked axes
(an empty click) or the whole figure (Escape), sending one value; brush targets and controls
are left alone. An empty click is one with no `click` hit and no `hover` hit, without
Cmd/Ctrl; `axesAt` takes every non-colorbar axis whose viewport holds the point (twins and an
inset's parent alike), and none when the point is inside a legend's box (a `bond: "legend"`
layer's transform).
Two more tools edit `many` fields, and add nothing to the wire. A marquee (`drag/marquee.ts`)
starts on a plot area with a `many` field: a plain drag where no view takes the drag, or
Alt-drag over a view. It holds no value of its own; on release it sets every `many` field on
that axis to the elements whose centre is inside the box (replace), adds them (Cmd/Ctrl), or
removes them (Cmd/Ctrl starting on a held element), sending one value. On a line that takes
points each sample inside is a pick (`picksInBox`); on a grid, `applyGridMarquee` sets the
cells the box overlaps, recomputed from the press-time mask on every move. A press that moves less
than `MARQUEE_MIN_CSS` client px stays a click; Escape or a pointercancel restores the picks
held at the press. A legend click also edits each linked `many` field (`legendPicks`), decided
by the entry's own field so the two never disagree: an entry the click turns on replaces the
picks with its marks (Cmd/Ctrl adds them), and one it turns off takes them out (`legendEdit`).
Pluto overwrites `initial_value` with `transform_value` of the value `mount.ts` seeds, so the
two must agree. Subtract 1 only when writing the manifest; add 1 when reading the wire. Grid
window keys on the wire are `i0,i1,j0,j1` (0-based inclusive); Julia stores `i1,i2,j1,j2`. An
element or legend row is looked up as `payloads[index]` with the 1-based index. The browser
payload for those kinds is ignored.

`selected=` names fields: a `NamedTuple` or `AbstractDict` keyed by field, one event or a
vector of events, or an `Int` or `AbstractVector{<:Integer}` when exactly one field takes
element picks. `selected = 1` and `selected = [1]` are the same seed. A pick holds one
element, so several indices for one are an `ArgumentError`; a brush takes any number. A
control, a layer outside the fields, or a kind outside `_SELECTED_KINDS` is an
`ArgumentError` too. Indices are checked `1 <= idx <= n`; `0` errors, naming `1:n`.

Hover never sets the bond. Only a commit round-trips.
