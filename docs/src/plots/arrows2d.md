# `arrows2d!`

`masque(fig)` makes each arrow of an `arrows2d!` plot respond along its
shaft: hovering an arrow shows where it starts and which way it points,
and a click selects it and sends it to your notebook. Hover the arrows
below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-arrows2d-default" data-masque-embed="plots_arrows2d" data-masque-segment="default" title="A field of 24 arrows. Hover an arrow, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_arrows2d"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.arrows2d`.

| Field | What it holds |
|---|---|
| `index` | the arrow's place in your data |
| `x`, `y` | the point the arrow starts from, as you passed it |
| `u`, `v` | the direction you passed |

The tooltip names `x` and `y` after the axis labels, here "x (km)" and
"y (km)".

## Show your own data

Give each arrow a payload, one per arrow in the order of your data. The
template can use the arrow's own fields next to yours:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-arrows2d-data" data-masque-embed="plots_arrows2d" data-masque-segment="data" title="The same arrows with a tooltip giving each one's speed and start." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_arrows2d"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`arrows2d!` works on a 2D `Axis`. On an `Axis3`, use
[`arrows3d!`](arrows3d.md).

## Where to go next

For arrows that Makie places along a flow, see
[`streamplot!`](streamplot.md).
