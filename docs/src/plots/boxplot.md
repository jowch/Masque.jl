# `boxplot!`

`masque(fig)` makes each box respond: hovering a box shows its
category and quartiles, and a click selects it and sends it to your notebook. Only
the box itself responds, not its whiskers or outliers. Hover the boxes
below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-boxplot-default" data-masque-embed="plots_boxplot" data-masque-segment="default" title="Box plots of trip times on three routes. Hover a box, or click one to see what it returns." style="width:100%;height:860px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_boxplot"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the box plot as `bind`, so `pick` is that event itself;
with `@bind sel masque(fig)`, it is `sel.boxplot`.

| Field | What it holds |
|---|---|
| `index` | the box's place from left to right, so `1` is the leftmost |
| `x` | where the box sits on the axis: the value you passed in `route`, such as `2` for Route B (`y` for a horizontal box) |
| `q1`, `median`, `q3` | the box's lower edge, middle line and upper edge |

## Show your own data

To show more than the quartiles, give each box a payload, one per box
from left to right, and a tooltip template that uses its fields. The
template can use the box's own fields, such as `median`, next to yours:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-boxplot-data" data-masque-embed="plots_boxplot" data-masque-segment="data" title="The same boxes with a tooltip giving each route, its stops and its median." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_boxplot"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Make the outliers respond

Hovering an outlier shows nothing, because only the boxes respond. To
see which trip an outlier is, add a [`PointInteractable`](@ref) at the
outliers' positions, with a payload for each. Pass the positions
yourself, and `radius` for how many pixels around each one respond:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-boxplot-outliers" data-masque-embed="plots_boxplot" data-masque-segment="outliers" title="The same boxes, where hovering an outlier shows its trip number." style="width:100%;height:520px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_boxplot"; segment = "outliers")
```

Hovering an outlier now shows its trip number, and a click on one sets
the `outliers` field of the `@bind` value. The boxes keep their hover.

## Supported axes

`boxplot!` works on a 2D `Axis`. On an `Axis3` or a `PolarAxis`, it is
skipped with a warning.

## Where to go next

A `rainclouds!` plot draws a box with the data points and a violin; see
[`rainclouds!`](rainclouds.md).
