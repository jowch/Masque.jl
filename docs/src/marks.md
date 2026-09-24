# Click marks

Every plot `masque(fig)` recognizes is clickable, not only scatters. A
click on a mark — a point, bar, polygon, line, or text label — hands it
to your notebook as an [`ElementEvent`](@ref): its 1-based
`pick.index`, plus fields that depend on what kind of mark it is.
Heatmap cells, legend entries, and colorbars return their own event
types (see [Concepts](@ref)). This page walks through bars, polygons,
lines, and points on a polar axis. [Plot-object defaults](@ref) lists
the fields each plot type reports, and [Supported plots and axes](@ref)
which plots work on which axes.

## Bars

A bar reports its `value` (the bar's height) and its `low` and `high`
ends, so a stacked or dodged bar still tells you which segment you hit.
Here each click reads the quarter and the value:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-bars" data-masque-embed="marks_bars" title="Four-bar plot. Click a bar and the readout names its value." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("marks_bars")
```

Histograms, waterfalls, and crossbars are clickable too, each with its
own fields: a waterfall step reports `low`, `high`, and `value`; a
histogram bin reports `value` (the bar's height, which is a count only
with `normalization = :none`), `low`, and `high`; a crossbar reports
`midpoint`, `low`, and `high`. A
heatmap is a grid of cells rather than a list of bars; it has its own
page, [Inspect a grid](@ref).

## Polygons

Each polygon of a `poly!` is one mark, reported by its `index` in the
order you drew them. Pair the index with your own list of names, or
pass `payloads` to [`PolygonInteractable`](@ref) so the name travels
with the click:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-poly" data-masque-embed="marks_poly" title="Three polygons. Click one and the readout names it." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("marks_poly")
```

Bands, densities, filled contours, violins, and Voronoi cells are
polygons too. A filled contour reports the `low` and `high` of its
level. A click inside a hole of a contour level hits whatever polygon
is drawn in the hole, not the ring around it, and hits nothing if the
hole is empty (a peak above the top level, for example).

## Lines

A `lines!` call is a single mark: clicking anywhere along the path
selects the whole line, however many vertices it has, which matches how
a line plot is read: as one series. To read the value at a particular
`x` along a line instead, use a [`SliceInteractable`](@ref).

```julia
begin
    fig = Figure()
    ax = Axis(fig[1, 1])
    xs = 0:0.1:10
    lines!(ax, xs, sin.(xs))
    lines!(ax, xs, cos.(xs))
    nothing
end
```

```julia
@bind pick masque(fig)
```

`pick.layer` tells the two lines apart (`:lines` and `:lines_2`, in the
order you drew them). `stairs!` is also one mark per call, with ids
`:stairs`, `:stairs_2`, and so on, and a `series!`
call is one layer whose `pick.index` is the series. Plots made of
separate pieces — `linesegments!`, error bars, range bars, `hlines!`,
and `vlines!` — make each piece its own mark instead.

## Points on a polar axis

Scatters, lines, and segments work on a `PolarAxis`. A point's `x` is
its angle and its `y` its radius, the same order you passed them in:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-marks-polar" data-masque-embed="marks_polar" title="Four polar points. Click one and the readout reads its radius." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("marks_polar")
```

Bars, heatmaps, and polygons on a polar axis are skipped with a warning,
and the readouts that need a flat axis are not available there; see
[Supported plots and axes](@ref).
