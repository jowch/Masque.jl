# `heatmap!` and `image!`

`masque(fig)` makes each cell of a heatmap or image respond: hovering a
cell shows its place in your matrix and its value, and a click selects
it and sends it to your notebook. Hover the cells below, then click
one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-heatmap-default" data-masque-embed="plots_heatmap" data-masque-segment="default" title="Shop visits by weekday and hour. Hover a cell, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_heatmap"; segment = "default")
```

## What a click returns

A click gives a [`GridCellEvent`](@ref) with these fields. Here the
figure passes the heatmap as `bind`, so `pick` is that event itself;
with `@bind sel masque(fig)`, it is `sel.cells`.

| Field | What it holds |
|---|---|
| `i`, `j` | the cell's first and second index in your matrix; Makie draws the first along x |
| `value` | the cell's value |

`visits[pick]` reads the same cell from your matrix, and `pick.i` and
`pick.j` index your own labels: `days[pick.i]` is the weekday.

## Show your own data

Give `payloads` a function of the cell's `i` and `j`, and a tooltip
template that uses the fields it returns. The template can use the
cell's own `value` next to yours:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-heatmap-data" data-masque-embed="plots_heatmap" data-masque-segment="data" title="The same visits with a tooltip naming the weekday and the hour." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_heatmap"; segment = "data")
```

A click also returns the payload's fields, so `pick.day` is the weekday
you clicked. A matrix of payloads, the same shape as your data, works
too. Every payload ships with the page, so on a large grid a template
that uses only `i`, `j` and `value` keeps the page small. [Tooltips](@ref)
lists what a template can do.

## Pick several cells

Pass `select = :many`, and each click adds a cell to the selection or
takes it out again:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-heatmap-many" data-masque-embed="plots_heatmap" data-masque-segment="many" title="The same visits. Click two cells to select both." style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_heatmap"; segment = "many")
```

With `@bind sel` in front, `sel.cells` is then a [`GridSelection`](@ref):
a mask the size of your matrix, so `visits[sel.cells]` is the selected
values and `findall(sel.cells)` their places. [Heatmaps and images](@ref) shows how to pick a block of
cells by dragging, and how to treat a group of cells as one region.

## Images

An `image!` responds the same way. A template can format the value:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-heatmap-image" data-masque-embed="plots_heatmap" data-masque-segment="image" title="A grey scan. Hover a pixel to see its place and intensity." style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_heatmap"; segment = "image")
```

A color image has no single value per pixel, so it reports only `i` and
`j`; `img[pick]` reads the color.

## Supported axes

`heatmap!` and `image!` work on a 2D `Axis`. On a `PolarAxis`, Makie
draws a polar heatmap as a `surface!`, which responds point by point.
When a cell is smaller than a screen pixel, hovering reports the cell
under the pointer, so even a very large matrix stays exact.

## Where to go next

[Heatmaps and images](@ref) covers grids in depth: naming two grids,
regions, grids built from edges and values, and very large grids. For
a heatmap whose click drives a line plot in another cell, see [From a
heatmap cell to its trace](@ref). To mask the pixels above a cutoff you drag,
see [Threshold a mask](@ref).
