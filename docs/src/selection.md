# Selection

A click selects a mark: the figure keeps it highlighted, and the `@bind`
variable holds it until something replaces it. This page is about what
happens around that moment — what replaces a selection, how to start
with one, and how to keep one when the figure is rebuilt.

The examples assume a scatter of cities drawn into `fig`, made
interactive with `cities = PointInteractable(ax, s; id = :cities,
payloads = rows)`, and bound as

```julia
@bind pick masque(fig, cities)
```

## What replaces a selection

Before the first click `pick` is `nothing`. A click on a mark makes `pick`
that mark's [`ElementEvent`](@ref), and a click on another mark replaces
it: one widget holds one selection, so the last click wins. A click on
empty space changes nothing — the highlight stays and no cell re-runs —
so a stray click never throws away a choice. With the keyboard, Enter or
Space on a focused mark selects it exactly as a click does.

To pick several marks at once, drag a box instead: an
[`ROIInteractable`](@ref) with `selects` returns every mark inside it
(see [Brush a region](@ref)).

## Start with a mark selected

`selected=` sets the selection the widget starts with. Indices are
1-based, like `pick.index`:

```julia
@bind pick masque(fig, cities; selected = 1)
```

The widget mounts with the first city highlighted, and `pick` starts as
its event rather than `nothing`, so downstream cells have something to
show before anyone clicks.

A few rules follow from "one widget holds one selection":

- `selected = [1, 8]` highlights both marks, but `pick` stays `nothing`,
  since a single click value cannot hold two marks. The next click
  replaces the highlight. (With a `selects` box in the widget, the value
  is a vector, and `selected = [1, 8]` does start as those two events.)
- When the widget has more than one layer you could select, name the
  layer: `selected = (; cities = 1)` or `selected = Dict(:cities => [1, 8])`.
  A bare number is ambiguous there and raises an `ArgumentError`, as does
  an index outside `1:n`.
- Points, bars, polygons, lines, and segments can start selected.
  Heatmap cells, axis readouts, boxes, thresholds, and the view cannot;
  passing `selected=` for them raises an `ArgumentError`.
- For a [`RegionInteractable`](@ref), use the layer ids it creates per
  shape (`:cells_c`, `:cells_r`, `:cells_p` for a base id `:cells`); see
  [Custom hits](@ref).

## Keep a selection when the figure rebuilds

When a cell upstream of the figure re-runs — a slider changes the data,
say — `masque` builds a new widget, and the selection starts over. That
is deliberate. A selection is an index into the data that drew the
figure, and after the data changes the same index can point at a
different mark; silently carrying it over would highlight the wrong
city.

When you do want a selection to survive, store the indices you still
consider valid in a cell that does not read `pick`, and pass them back in:

```julia
held = [1, 8]   # computed from your data, not from `pick`
```

```julia
@bind pick masque(fig, cities; selected = held)
```

You might try to feed the widget its own value, `selected = pick`. Pluto
refuses that cell with a **Cyclic references** error, because the cell
would both define `pick` and depend on it. It is also unnecessary: the
widget already keeps its highlight between clicks for as long as it
exists.

A different widget can take the value, though. Passing one widget's
`pick` as another widget's `selected=` mirrors a click from one figure
into another; [Selection round-trip](@ref) shows it, and
[Linked views](@ref) covers driving other plots and tables from a click.

## Highlight and value

The highlight is drawn by the overlay in the browser; the PNG of the
figure never changes, and no Julia runs to draw it. It follows the
selection, but it is not the same thing in every case: a legend click
highlights every mark of the series it labels while `pick` holds only the
legend entry, and a heatmap click highlights one cell. [Legend](@ref) and
[Inspect a grid](@ref) describe those cases.
