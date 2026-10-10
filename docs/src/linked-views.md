# Linked views

A click in a Masque widget updates its `@bind` variable, and cells that
use the variable respond to the change. So linking a scatter to a detail
plot, a table, or a model fit is ordinary Pluto code: use the value in
another cell to create a plot or compute a result.

Click a point in the xy plot below, and the same sample is selected in
the xz plot:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-lv-click" data-masque-embed="linked_click" title="Two scatter plots. Click a point in the xy plot to select the same sample in the xz plot." style="width:100%;height:1100px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("linked_click")
```

The xz plot follows clicks, not hovering: hovering a point highlights
it only on the plot under the pointer. To highlight a whole series on
every plot as you hover, use a legend, as shown in
[Highlight a series across panels](@ref).

## Drive a second plot from a click

Give each payload a key that identifies its row, such as an id or a
name, and use the key in other cells. Here, clicking a city on a map
plots that city's series:

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
    s = scatter!(ax, [139.7, 77.2, 121.5], [35.7, 28.6, 31.2]; markersize = 16)
    pts = interactables(s; payloads = cities)
    nothing
end
```

```julia
@bind pick masque(fig, pts; bind = s)
```

`bind = s` makes `pick` the clicked city itself, or `nothing` before
the first click.

```julia
begin
    detail = Figure(size = (560, 240))
    dax = Axis(detail[1, 1]; title = isnothing(pick) ? "click a city" : pick.name)
    isnothing(pick) || lines!(dax, series[pick.id])
    detail
end
```

The detail cell uses `pick`, so it responds to each click but not to
hovering. The same `pick.id` could filter a `DataFrame` or choose the
data for a fit. The detail figure can be a Masque widget too.

To show the clicked point as selected in a second widget, pass it as
that widget's `selected=`. [Selection round-trip](@ref) shows how.

## Several axes in one figure

One `masque` call covers every axis in a figure, and each plot gets its
own field in the value, so two scatters give `sel.scatter` and
`sel.scatter_2`. To name the fields after your panels, pass the plots
that `scatter!` returned as `bind`:

```julia
@bind sel masque(fig; bind = (xy = p_xy, xz = p_xz))
```

Each panel keeps its own selection: clicking a point in the xy panel
sets `sel.xy` and leaves `sel.xz` as it was. Hovering or clicking a
point highlights it only on its own panel, even when another panel plots
the same row of your data.

To highlight the same row on both panels, select it on both plots from
a value `i` set in another cell, such as a slider. The value cannot come
from this widget's own `sel`, for the reason given in
[Selection](@ref):

```julia
masque(fig; selected = (scatter = i, scatter_2 = i))
```

To have a click in one panel select the same row in the other, put each
panel in its own figure, as in the example at the top of this page.

## Highlight a series across panels

Hovering a legend entry highlights every mark of its series, on every
axis where the series appears. Clicking an entry sets `sel.legend` to
a [`LegendEvent`](@ref), which another cell can use to filter your
data.
See [Legend](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-lv-legend-wash" data-masque-embed="linked_legend_wash" title="Two scatter panels with a legend. Hover an entry to highlight its series on both." style="width:100%;height:1100px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("linked_legend_wash")
```

## Filter a table from a region

To select many points at once, drag a box. When you release an
[`ROIInteractable`](@ref) with `selects`, it returns every point inside
the box, in the field of the plot it selects from. With that list as
`picks`, another cell can take those rows from your table with
`df[picks, :]`, or create another plot from them.
[Brush a region](@ref) shows how.

For what each click, release, and drag sets in the value, see
[Concepts](@ref).
