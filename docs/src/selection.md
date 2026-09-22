# Selection

There is exactly one selection. Before a click, the `@bind` bond is
`nothing` unless you pass `selected=`. After a click, the bond is one
[`ElementEvent`](@ref): `layer` (the interactable `id`), a 1-based
`index`, and the row's fields on the event (`pick.city`). Click a mark
to replace the selection with that mark. A cell that reads the bond
re-runs.

The highlight in the overlay is not a copy of the bond.

This page continues the cities scatter from [Getting started](@ref) in
the same notebook. Skip the load cell; `fig`, `cities`, and `pick`
already exist. There is no Selection player on this page.

Paste each snippet into its own Pluto cell. Replace the previous bind
cell instead of adding a second `@bind pick`.

**On this site:** this page has no player. For overlay versus `@bind`
versus the docs player, see [Overlay, Julia, and the host](@ref).

## Click a mark

**1.** Bind the widget:

```julia
@bind pick masque(fig, cities)
```

**2.** Read the pick:

```julia
pick === nothing ? "click a city" : "$(pick.city) selected"
```

A click in empty space leaves the current selection in place. The bond
does not change. The highlight in the overlay stays as it is.

Enter or Space on a focused mark commits the same way as a click.

For the cities figure, `payloads`, and `radius=`, see
[Getting started](@ref).

## Start with marks already selected

`selected=` is the selection's initial value. Indices are 1-based. With
one seedable layer, a bare `Int` or vector of `Int`s is enough. The
widget mounts with those marks highlighted in the overlay:

```julia
@bind pick masque(fig, cities; selected = 1)
```

`selected = 1` and `selected = [1]` both mount as one
[`ElementEvent`](@ref) for Tokyo. `selected = [1, 8]` highlights Tokyo
and Beijing and leaves the bond `nothing`: this interaction returns one
city, so a set is not a value it can hold. The next click replaces the
highlight with that city.

A `selects` ROI is the interaction that returns a vector. There,
`selected = 1` and `selected = [1]` both mount as a one-element
`Vector{ElementEvent}`, and `selected = [1, 8]` mounts as those two.
Axis, colorbar, threshold, and bounds-only ROI commits stay their own
types even inside a widget whose selection type is
`Vector{ElementEvent}`. For the catalog, see [Constructors](@ref).

Two seedable layers need a name: `selected = (; scatter = 1)` or
`selected = Dict(:scatter => [1, 8])`. A bare `1` across two layers
raises `ArgumentError`. `0` is out of range.

Valid kinds are `:circles`, `:rects`, `:polygons`, `:segments`, and
`:polyline`. Any other kind, or an out-of-range index, raises
`ArgumentError` at `masque()` time. An empty index list for a layer is
omitted from the manifest, so that layer starts with no highlight.

For a [`RegionInteractable`](@ref), key `selected=` on `:id_c`, `:id_r`,
or `:id_p`, not the base `id`.

## Bond versus highlight in the overlay

The highlight in the overlay is not a copy of the bond. Legend wash and
heatmap cells have their own hydration rules; see [Legend](@ref) and
[Inspect a grid](@ref). `selected=` on `:axis`, `:roi`, `:view`, or
`:threshold` raises `ArgumentError`.

## Keep a selection when the figure rebuilds

A remount drops the selection on purpose. An index is meaningful only
relative to the data that produced it. If the figure rebuilds with
points reordered, added, or removed, the old indices paint the wrong
marks.

The highlight after a click needs no Julia: it runs in the overlay
without a round trip. To persist a highlight across a rebuild, re-assert
indices with `selected=` from a cell that does **not** read this
`@bind`.

**1.** Keep the indices in a cell that does not read `pick`:

```julia
# Does not read `pick`.
held = [1, 8]
```

**2.** Pass them back in as `selected=`:

```julia
@bind pick masque(fig, cities; selected = held)
```

If a slider rebuilds `fig`, pass the indices you still consider valid.
Masque does not match a stored [`ElementEvent`](@ref) by payload identity
across a reorder. You can pass the event itself back into a different
cell's `selected=`.

Do not feed this widget's own bond into the same call. Pluto reports
**Cyclic references** and does not run the cell:

```julia
@bind pick masque(fig, cities; selected = pick)
```

A click already updates the highlight in the overlay and the bond.

Last pick wins. To accumulate indices across clicks, keep a `Ref` in a
cell that does not read this `@bind`, then pass the growing set as
`selected=` to a second `masque` widget. For more information, see the
[selection round-trip in `examples/demo.jl`][demo-round-trip]. Do not
copy the whole demo notebook.

To brush a box with `selects` and report several marks, see
[Brush a region](@ref). To drive another cell or plot from a click, see
[Linked views](@ref).

[demo-round-trip]: https://github.com/jowch/Masque.jl/blob/main/examples/demo.jl
