# Linked views

Masque does not wire plots together itself; Pluto does. A click in a
Masque widget becomes the value of a `@bind` variable, and every cell
that reads that variable re-runs. So "linking" a scatter to a detail
plot, a table, or a model fit is ordinary Pluto code: read `pick`, draw
or compute something from it. This page shows that pattern first, then
what one widget can do across several axes on its own.

## Drive a second plot from a click

Put a key in each payload that identifies the row — an id, a name — and
use it downstream. Here a map of cities drives a plot of the clicked
city's series:

```julia
begin
    cities = [
        (id = "tok", name = "Tokyo", lon = 139.7, lat = 35.7),
        (id = "del", name = "Delhi", lon = 77.2, lat = 28.6),
        (id = "sha", name = "Shanghai", lon = 121.5, lat = 31.2),
    ]
    series = Dict(
        "tok" => [3.1, 3.4, 3.2, 3.6],
        "del" => [2.2, 2.5, 2.9, 3.0],
        "sha" => [2.0, 2.4, 2.3, 2.7],
    )
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; xlabel = "longitude", ylabel = "latitude")
    s = scatter!(ax, [c.lon for c in cities], [c.lat for c in cities]; markersize = 16)
    pts = PointInteractable(ax, s; payloads = cities)
    nothing
end
```

```julia
@bind pick masque(fig, pts)
```

```julia
begin
    detail = Figure(size = (560, 240))
    dax = Axis(detail[1, 1]; title = pick === nothing ? "click a city" : pick.name)
    pick === nothing || lines!(dax, series[pick.id])
    detail
end
```

The detail cell reads `pick`, so it re-runs on each click. The same
`pick.id` could filter a `DataFrame`, pick the data for a fit, or be
passed to another Masque widget — the second figure can be interactive
too. Hovering never re-runs these cells; only clicks and releases do.

To show the clicked point as selected in a *second* widget as well, pass
it as that widget's `selected=`; [Selection round-trip](@ref) shows it.

## Several axes in one figure

One `masque` call covers every axis in a figure, and each axis keeps its
own hits: hovering a point highlights that point on the panel you are
on. Each scatter becomes its own layer (`:scatter`, `:scatter_2`, …), so
`pick.layer` says which panel was clicked.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-lv-two-axis" data-masque-embed="linked_two_axis" title="Two Axis panels, four points, overlay-only hover" style="width:100%;height:1100px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("linked_two_axis")
```

Masque does not assume that the same index in two plots is the same
observation, so hovering point 3 in one panel does not highlight point 3
in the other. When they are the same row, make the connection
explicitly: on a click, rebuild the figure with both layers selected,

```julia
masque(fig; selected = Dict(:scatter => [i], :scatter_2 => [i]))
```

where `i` comes from a cell that does not read this widget's own value.
With one index on each of two layers the widget highlights both but
starts with its value at `nothing`, so a cell reading this widget's
`pick` goes back to its "nothing clicked" state after the rebuild.

## Highlight a series across panels

A legend entry is the one thing that highlights across axes by itself:
hovering it lights up every mark of the series it names, on whatever
axis the series is drawn. Clicking it returns the legend entry, which a
downstream cell can use to filter (see [Legend](@ref)).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-lv-legend-wash" data-masque-embed="linked_legend_wash" title="Legend whole-layer wash across two Axis panels" style="width:100%;height:1100px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("linked_legend_wash")
```

## Filter a table from a region

Brushing is the many-marks version of a click: an
[`ROIInteractable`](@ref) with `selects` returns every point inside the
box on release, and a cell slices your table with it —
`df[picks, :]`. [Brush a region](@ref) walks through it.

## What Masque does not link for you

- Hover is local to the mark under the pointer; it does not echo into
  other plots.
- There is no shared data source between widgets. Two `masque` calls
  are two independent widgets, connected only through the Pluto cells
  you write.
- Every box with `selects` in one widget must name the same layer, and
  boxes are rectangles: there is no lasso and no cross-filtering
  between brushes on different plots.

For how hover, clicks, and drags reach Julia, see [Concepts](@ref).
