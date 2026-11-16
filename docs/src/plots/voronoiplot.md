# `voronoiplot!`

`masque(fig)` makes each cell of a `voronoiplot!` respond: hovering a
cell shows the site it belongs to and its value, and a click selects it
and sends it to your notebook. Hover the cells below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-voronoiplot-default" data-masque-embed="plots_voronoiplot" data-masque-segment="default" title="Rainfall at 18 stations, as the area nearest each one. Hover a cell, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_voronoiplot"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.voronoiplot`.

| Field | What it holds |
|---|---|
| `index` | the cell's site, in the order of your points |
| `x`, `y` | the site the cell belongs to |
| `value` | the cell's value, when you color the cells by values |

The tooltip names `x` and `y` after the axis labels, here "East (km)"
and "North (km)".

## Show your own data

Give each cell a payload, one per site in the order of your points:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-voronoiplot-data" data-masque-embed="plots_voronoiplot" data-masque-segment="data" title="The same cells with a tooltip naming each station and its rainfall." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_voronoiplot"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`voronoiplot!` works on a 2D `Axis`.

## Where to go next

For the triangles between points instead of the area around each, see
[`triplot!`](triplot.md).
