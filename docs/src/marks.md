# Click marks

You can click any plot `masque(fig)` recognizes, not just scatters.
Clicking a point, bar, polygon, or text label sets that plot's field in
the `@bind` value to an [`ElementEvent`](@ref), which holds `index`, the
mark's position in your data, and fields that depend on the kind of
mark. Heatmap cells, legend entries, and colorbars give their own event
types; see [Concepts](@ref).

The examples on this page pass the plot as `bind`, so the value, `pick`,
is the clicked mark's event itself rather than a named tuple of fields:

```julia
b = barplot!(ax, 1:4, [2.0, 3.0, 1.5, 2.5])
@bind pick masque(fig; bind = b)
```

[Plot-object defaults](@ref) lists the fields each plot type reports,
and [Supported plots and axes](@ref) lists which plots work on which
axes.

## Bars

A bar reports its `value`, which is its height, and its `low` and `high`
ends, so in a stacked or dodged bar plot you can tell which segment was
clicked. In this example, a click shows the quarter and the value:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-bars" data-masque-embed="marks_bars" title="Four-bar plot. Click a bar and the readout names its value." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("marks_bars")
```

Other bar-like plots report these fields:

| Plot | Fields |
|---|---|
| `barplot!` | `value`, `low`, `high` |
| `hist!` | `value` (the bin's height, a count with `normalization = :none`), `low`, `high` |
| `waterfall!` | `value`, `low`, `high` |
| `crossbar!` | `midpoint`, `low`, `high` |

Heatmaps have their own page: [Inspect a grid](@ref).

## Polygons

Each polygon in a `poly!` is one mark, and its `index` is its position
in the order you plotted them. The example below uses that index to look
up the clicked polygon's name:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-poly" data-masque-embed="marks_poly" title="Three polygons. Click one and the readout names it." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("marks_poly")
```

To get the name back with the click instead, pass the polygon plot `p`
to [`interactables`](@ref) with `payloads`. Then `pick.name` is the
clicked polygon's name:

```julia
regions = interactables(p;
    payloads = [(name = "North",), (name = "South",), (name = "East",)],
)
@bind pick masque(fig, regions; bind = p)
```

Bands, densities, filled contours, violins, Voronoi cells, and hexbin
hexagons are polygons too. A filled contour also reports the `low` and
`high` of its level, and a hexagon reports its center and its `count`.

## Lines

Hovering a line shows the point you plotted nearest the pointer (see
[Tooltips](@ref)), but a click on it changes nothing until you name the
line in `bind`. A click then picks that same point, and a ring marks
it. `pick.index` is the point's position in your data, so `xs[pick]`
reads it, and `pick.x` and `pick.y` hold it too. A line on an `Axis3`
has no points to pick, so a click there picks the whole line. To read
every line at the same `x`, use a [`SliceInteractable`](@ref) instead.

In the example below, one `series!` call draws both curves, and
`bind = sr` makes it clickable, so `pick.line` says which curve you
clicked:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-lines" data-masque-embed="marks_lines" title="Two lines. Click one and the readout names it." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("marks_lines")
```

To click lines from separate `lines!` calls, name each one in `bind`,
and each gets its own field:

```julia
begin
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1])
    xs = 0:0.1:10
    l1 = lines!(ax, xs, sin.(xs))
    l2 = lines!(ax, xs, cos.(xs))
    nothing
end
```

```julia
@bind sel masque(fig; bind = (sine = l1, cosine = l2))
```

Then `sel.sine` and `sel.cosine` each hold `nothing` or the point
clicked on that line. The same works for `stairs!`. A `scatterlines!` plot's
points take clicks without `bind`, as `sel.scatterlines.points`, and its
line does not. To make a line
clickable while keeping every other plot's field, pass
`interactables(l1)` after the figure instead of naming it in `bind`.

Plots made of separate pieces make each piece its own mark and take
clicks without `bind`: `linesegments!`, error bars, range bars,
`hlines!`, and `vlines!`.

## Points on a polar axis

Scatters, lines, and segments work on a `PolarAxis`. A point's `x` is
its angle and its `y` is its radius, in the order you passed them:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-polar" data-masque-embed="marks_polar" title="Four polar points. Click one and the readout reads its radius." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("marks_polar")
```

[Supported plots and axes](@ref) lists the other plots a polar axis
supports.
