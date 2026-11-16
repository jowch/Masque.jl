# `triplot!`

`masque(fig)` makes each triangle of a `triplot!` respond: hovering a
triangle shows the three points it joins, and a click selects it and
sends it to your notebook. Hover the triangles below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-triplot-default" data-masque-embed="plots_triplot" data-masque-segment="default" title="The triangles between 12 points. Hover a triangle, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_triplot"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.poly`.

| Field | What it holds |
|---|---|
| `index` | which triangle, in Makie's order |
| `vertices` | the triangle's three corners, as places in your points |

`pts[collect(pick.vertices)]` gives the triangle's corners.

## Show your own data

Makie decides the triangles, so give a tooltip template rather than
payloads. The template can use `vertices`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-triplot-data" data-masque-embed="plots_triplot" data-masque-segment="data" title="The same triangles with a tooltip listing each one's points." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_triplot"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`triplot!` works on a 2D `Axis`.

## Where to go next

For the area nearest each point instead, see
[`voronoiplot!`](voronoiplot.md).
