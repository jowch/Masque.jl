# Selection

There is exactly one selection. Before a click, the `@bind` bond is
`nothing` unless you pass `selected=`. After a click, the bond is one
[`InteractionEvent`](@ref): `layer` (the interactable `id`), a 0-based
`index`, and `payload`. Click a mark to replace the selection with that
mark. A cell that reads the bond re-runs.

The overlay highlight follows `selectionFor`. It is not a copy of the
bond.

This page continues the cities scatter from [Getting started](@ref).
Paste each snippet into its own Pluto cell.

## Click a mark

Bind the widget, then read the pick:

```julia
@bind pick masque(fig, cities)
```

```julia
pick === nothing ? "click a city" : "$(pick.payload.city) selected"
```

A click in empty space does not write the bond and does not clear the
selection. The overlay highlight stays as it is.

Enter or Space on a focused mark commits the same way as a click.

For the cities figure, `payloads`, and `radius=`, see
[Getting started](@ref).

## Start with marks already selected

`selected=` is the selection's initial value. Pass a map of
`layer_id => 0-based indices`. The widget mounts with those marks
highlighted in the overlay, and the bond already holds them:

```julia
@bind pick masque(fig, cities; selected = Dict(:cities => [0, 7]))
```

At mount, `pick` is a `Vector{InteractionEvent}` for Tokyo (index 0) and
Beijing (index 7). The hydrated bond is always a `Vector`, even for one
index. Do not check `pick === nothing` after hydration, and do not read
`pick.index` as if the value were a scalar.

A later click is a scalar `InteractionEvent` and replaces that vector
wholesale. `selected=` does not accumulate with clicks. Last pick wins.

Valid kinds are `:circles`, `:rects`, `:polygons`, `:segments`, and
`:polyline`. Any other kind, or an out-of-range index, raises
`ArgumentError` at `masque()` time. An empty index list for a layer is
omitted from the manifest, so that layer starts with no highlight.

For a [`RegionInteractable`](@ref), key `selected=` on `:id_c`, `:id_r`,
or `:id_p`, not the base `id`.

## Bond versus overlay highlight

The overlay uses `selectionFor` to choose what to highlight. That set is
not a mirror of the bond.

- A legend click writes the legend entry to `@bind` and highlights the
  linked traces in the overlay. `selected = Dict(:legend => [0])`
  hydrates the **swatch** (legend is `:rects`), not the series. To
  persist a series highlight, hydrate the target layer ids. For more
  information, see [Legend](@ref).
- A heatmap click highlights the cell in the overlay. `selected=` on
  `:grid` (for example `Dict(:cells => [0])`) raises `ArgumentError`.
- `selected=` on `:axis`, `:roi`, `:view`, or `:threshold` also raises
  `ArgumentError`.

## Keep a selection when the figure rebuilds

A remount drops the selection on purpose. An index is meaningful only
relative to the data that produced it. If the figure rebuilds with
points reordered, added, or removed, the old indices paint the wrong
marks.

The highlight after a click needs no Julia: it runs in the overlay
without a round trip. To persist a highlight across a rebuild, re-assert
indices with `selected=` from a cell that does **not** read this
`@bind`.

```julia
# Does not read `pick`.
held = Dict(:cities => [0, 7])
```

```julia
@bind pick masque(fig, cities; selected = held)
```

If a slider rebuilds `fig`, pass the indices you still consider valid.
Masque does not match a stored `InteractionEvent` by payload identity
across a reorder.

Do not feed this widget's own bond into the same call. Pluto reports
**Cyclic references** and does not run the cell:

```julia
@bind pick masque(fig, cities; selected = pick)
```

A click already updates the overlay highlight and the bond.

Last pick wins. To accumulate indices across clicks, keep a `Ref` in a
cell that does not read this `@bind`, then pass the growing set as
`selected=` to a second `masque` widget. That pattern is in
[Selection round-trip in `examples/demo.jl`][demo-round-trip]. Do not
copy the whole demo notebook.

To brush a box with `selects` and report several marks, see
[Brush a region](@ref). To drive another cell or plot from a click's
payload, see [Linked views](@ref).

[demo-round-trip]: https://github.com/jowch/Masque.jl/blob/main/examples/demo.jl
