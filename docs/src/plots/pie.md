# `pie!`

`masque(fig)` makes each slice of a `pie!` plot respond: hovering a
slice shows its value and its share of the total, and a click selects
it and sends it to your notebook. Hover the slices below, then click
one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-pie-default" data-masque-embed="plots_pie" data-masque-segment="default" title="Sales by region as a pie. Hover a slice, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_pie"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.poly`.

| Field | What it holds |
|---|---|
| `index` | which slice, in the order of your values |
| `value` | the slice's value |
| `share` | its share of the total, from `0` to `1` |

## Show your own data

Give each slice a payload, one per slice in the order of your values.
The template can use `value` and `share` next to your fields, and
`:.0%` writes the share as a percentage:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-pie-data" data-masque-embed="plots_pie" data-masque-segment="data" title="The same pie with a tooltip naming the region and its share." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_pie"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`pie!` works on a 2D `Axis`.

## Where to go next

To compare the same values side by side, see [`barplot!`](barplot.md).
