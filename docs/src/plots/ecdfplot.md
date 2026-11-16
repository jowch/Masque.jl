# `ecdfplot!`

`masque(fig)` makes an `ecdfplot!` respond like a line: hovering the
curve shows the step nearest the pointer, a value and the share of your
data at or below it. Pass the plot as `bind` and a click picks that
step and sends it to your notebook. Hover the curve below, then click
it:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-ecdfplot-default" data-masque-embed="plots_ecdfplot" data-masque-segment="default" title="The share of 60 trains by delay. Click the curve to pick a delay." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_ecdfplot"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)` and no `bind`, the curve takes no click.

| Field | What it holds |
|---|---|
| `index` | the step's place along the curve, from the smallest value up |
| `line` | always `1` |
| `x` | one of your values |
| `y` | the share of your data at or below `x`, from 0 to 1 |

## Show your own data

Give the plot a tooltip template to word the step in your own terms.
The template uses the step's `x` and `y`, and `:.0%` shows the share
as a percentage:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-ecdfplot-data" data-masque-embed="plots_ecdfplot" data-masque-segment="data" title="The same curve with a tooltip that reads the share as a sentence." style="width:100%;height:520px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_ecdfplot"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`ecdfplot!` works on a 2D `Axis`.

## Where to go next

To see the same data as a curve of density, see
[`density!`](density.md).
