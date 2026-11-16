# `hexbin!`

`masque(fig)` makes each hexagon of a `hexbin!` plot respond: hovering
a hexagon shows its center and how many points fell in it, and a click
selects it and sends it to your notebook. Hover the hexagons below,
then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-hexbin-default" data-masque-embed="plots_hexbin" data-masque-segment="default" title="Height and weight of 800 people, binned in hexagons. Hover a hexagon, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_hexbin"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.hexbin`.

| Field | What it holds |
|---|---|
| `index` | which hexagon, in Makie's order |
| `x`, `y` | the hexagon's center |
| `count` | how many points fell in it, or the sum of their `weights` |

Only the hexagons Makie draws respond. With `threshold = 0`, Makie
draws the empty ones too, and they respond with a `count` of `0`.

## Show your own text

Makie decides where the hexagons are, so give a tooltip template rather
than payloads. The template can use `x`, `y` and `count`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-hexbin-data" data-masque-embed="plots_hexbin" data-masque-segment="data" title="The same people with a tooltip giving the count and the hexagon's center." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_hexbin"; segment = "data")
```

To find the points in a clicked hexagon, keep those near `pick.x` and
`pick.y` in your own data. [Tooltips](@ref) lists what a template can
do.

## Supported axes

`hexbin!` works on a 2D `Axis`.

## Where to go next

For a fixed grid of bins, see [`heatmap!`](heatmap.md); for millions of
points, see [`datashader!`](datashader.md).
