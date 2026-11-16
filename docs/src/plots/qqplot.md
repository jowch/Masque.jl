# `qqplot!` and `qqnorm!`

With a `qqline`, a `qqplot!` or `qqnorm!` plot has two parts, and
`masque(fig)` makes each respond on its own: the points and the
reference line. Without one, the plot has only the points. Hovering a point shows its two quantiles, and a click
selects it and sends it to your notebook. Hover the points below, then
click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-qqplot-default" data-masque-embed="plots_qqplot" data-masque-segment="default" title="A normal quantile plot of 80 waiting times, with a reference line. Hover a point, or click one to see what it returns." style="width:100%;height:860px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_qqplot"; segment = "default")
```

## What a click returns

Each part has its own field in the `@bind` value: `sel.scatter` for the
points and `sel.segments` for the line, or `scatter_2` and so on when
the figure already has a part of that name. A click on a point gives an
[`ElementEvent`](@ref) with these fields:

| Field | What it holds |
|---|---|
| `index` | the point's place from the smallest quantile up, so `1` is the lowest point |
| `x` | the quantile of the normal distribution, or of your first sample for `qqplot!` |
| `y` | the quantile of your data |

The points come smallest first, not in the order of your data.

## Show your own data

To say which observation a point is, give the points a payload each,
under the part's name, `scatter`. Because the points come smallest
first, sort your rows the same way: `sortperm(wait)` lists the
customers from the shortest wait up. (A `qqplot!` of two samples of
different lengths draws as many points as the shorter sample has, so
give it that many payloads.) The tooltip then shows the payload's fields
next to the quantiles:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-qqplot-data" data-masque-embed="plots_qqplot" data-masque-segment="data" title="The same plot with a tooltip naming the customer each point is." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_qqplot"; segment = "data")
```

A click on a point also returns its payload, so `sel.scatter.customer`
is the customer you clicked. [Plots with several parts](@ref) says how
payloads work for each part.

## Supported axes

`qqplot!` and `qqnorm!` are drawn as points and a line, so they respond
on a 2D `Axis`, an `Axis3` and a `PolarAxis`, as `scatter!` and
`linesegments!` do.

## Where to go next

To see the shape of a distribution instead, see
[`density!`](density.md) and [`violin!`](violin.md).
