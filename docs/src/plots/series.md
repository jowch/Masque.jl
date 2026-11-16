# `series!`

`masque(fig)` makes each curve of a `series!` respond on its own:
hovering a curve shows its label and the point you plotted nearest the
pointer. Pass the plot as `bind` and a click picks that point and sends
it to your notebook, with the curve it is on. Hover a curve below, then
click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-series-default" data-masque-embed="plots_series" data-masque-segment="default" title="Units sold by week for three regions. Click a curve to pick its nearest week." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_series"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the series as `bind`, so `pick` is that event itself;
with `@bind sel masque(fig; bind = (sales = s,))`, it is `sel.sales`.

| Field | What it holds |
|---|---|
| `line` | which curve, in the order of your data's rows, so `3` is the third |
| `label` | that curve's label, when you passed `labels` |
| `index` | the point's place along the curve, so `week[pick.index]` reads it |
| `x`, `y` | the point you plotted |

## Show your own data

Each curve is one mark, so the payloads are one per curve, in the order
of your rows. The tooltip template can use the curve's `label` and the
hovered point's `x` and `y` next to your fields:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-series-data" data-masque-embed="plots_series" data-masque-segment="data" title="The same curves with a tooltip naming the region, its manager and the week." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_series"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`series!` works on a 2D `Axis` and a `PolarAxis`. On an `Axis3`, it is
skipped with a warning.

## Where to go next

For curves drawn one call each, see [`lines!`](lines.md).
