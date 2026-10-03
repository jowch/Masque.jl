# Click marks

You can click any plot `masque(fig)` recognizes, not just scatters.
Clicking a point, bar, polygon, line, or text label sets `pick` to an
[`ElementEvent`](@ref), which holds `pick.index`, the mark's position
in your data, and fields that depend on the kind of mark. Heatmap cells,
legend entries, and colorbars give their own event types; see
[Concepts](@ref).

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
@bind pick masque(fig, regions)
```

Bands, densities, filled contours, violins, Voronoi cells, and hexbin
hexagons are polygons too. A filled contour also reports the `low` and
`high` of its level, and a hexagon reports its center and its `count`.

## Lines

A `lines!` call is one mark. Clicking anywhere along it selects the
whole line, since a line plot is read as one series. To read the value
at a particular `x` instead, use a [`SliceInteractable`](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-lines" data-masque-embed="marks_lines" title="Two lines. Click one and the readout names it." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("marks_lines")
```

`pick.layer` tells the two lines apart: it is `:lines` for the first
and `:lines_2` for the second, and `stairs!` plots get `:stairs` and
`:stairs_2` the same way. To choose the names yourself, pass each line
to [`interactables`](@ref) with an `id`:

```julia
begin
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1])
    xs = 0:0.1:10
    l1 = lines!(ax, xs, sin.(xs))
    l2 = lines!(ax, xs, cos.(xs))
    sine = interactables(l1; id = :sine)
    cosine = interactables(l2; id = :cosine)
    nothing
end
```

```julia
@bind pick masque(fig, sine, cosine)
```

Then `pick.layer` is `:sine` or `:cosine`. A `series!` call is one
layer, and `pick.index` says which series was clicked.

Plots made of separate pieces make each piece its own mark:
`linesegments!`, error bars, range bars, `hlines!`, and `vlines!`.

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
