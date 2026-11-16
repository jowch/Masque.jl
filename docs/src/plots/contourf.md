# `contourf!`

`masque(fig)` makes each filled region of a `contourf!` plot respond:
hovering a region shows the two levels it lies between, and a click
selects it and sends it to your notebook. Hover the regions below, then
click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-contourf-default" data-masque-embed="plots_contourf" data-masque-segment="default" title="Filled contours of two hills. Hover a region, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_contourf"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.contourf`.

| Field | What it holds |
|---|---|
| `index` | which region: Makie's own order, not the level's |
| `low`, `high` | the levels the region lies between |

One level can be several regions, like the ring around each hill here,
and each region is its own mark with the same `low` and `high`. Inside
a hole of a region, the pointer reaches the region drawn there, if any.

## Show your own data

Makie decides how many regions there are, so give a tooltip template
rather than payloads. The template can use `low` and `high`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-contourf-data" data-masque-embed="plots_contourf" data-masque-segment="data" title="The same hills with a tooltip giving each region's height range in meters." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_contourf"; segment = "data")
```

[Tooltips](@ref) lists what a template can do, such as `:.0f` to round.

## Supported axes

`contourf!` works on a 2D `Axis`.

## Where to go next

For contour lines, see [`contour!`](contour.md). To read the value of a
grid cell by cell, draw it with [`heatmap!`](heatmap.md).
