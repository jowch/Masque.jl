# Sample a series

Hover over a line plot and a tooltip shows each series' value at the
pointer, with a dot on each line. Pass the line plot to a
[`SliceInteractable`](@ref):

```julia
begin
    s = lines!(ax, xs, ys)
    probe = SliceInteractable(ax, s)
end
```

```julia
masque(fig, probe)
```

`masque(fig)` never adds a slice, so pass one yourself. A slice is for
reading values: hovering does not change the `@bind` value. Each axis
takes one slice, so to read several lines, pass them all to the same
slice.

## What it reads

By default, a vertical line follows the pointer, and the tooltip shows
each series' `y` at the pointer's `x`. `orientation = :horizontal` reads
`x` at the pointer's `y` instead. `crosshair = false` keeps the dots and
the tooltip but draws no line.

The plot form accepts `Lines`, `Stairs`, `Series`, `Band`, and
`Density`, or a vector of them. It reads the curve as drawn: `Stairs`
keeps its steps, and `Band` and `Density` give their upper curve. A
`Band` or `Density` with `direction = :y` is read horizontally.

The tooltip is a table of the sampled values. A `masque"..."` template
formats the same fields, and `tooltip = false` turns it off. See
[Tooltips](@ref).

## Series from data

Without a plot, pass each series as `(; x, y)`, with an optional `id`,
`label`, and `color`. For a vertical slice, `x` must be increasing; for
a horizontal slice, `y` must be.

```julia
probe = SliceInteractable(ax; series = [(; id = :wide, x = xs, y = ys)])
```

## Next to other interactables

A marker or colorbar in the same widget keeps its own tooltip, and
hovering a marker hides the slice's line. A slice replaces the hover
highlight of the line layers it covers. By default it covers each plot's own
layer id, such as `:lines`, `:stairs`, or `:band`, with `_2` added when
a type repeats. Those ids are counted among the plots you passed to the
slice, not among every plot on the axis. So if you slice only the
second of two `lines!` plots, its id in the widget is `:lines_2` but
the slice assumes `:lines`; pass the layer yourself with
`covers = [:lines_2]`.

A slice needs a 2D `Axis`; see [Supported plots and axes](@ref) for
which axes and scales.

To read a single position instead of a series, see
[Read coordinates](@ref).
