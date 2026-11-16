# `arrows3d!`

On an `Axis3`, `masque(fig)` makes each arrow of an `arrows3d!` plot
respond along its shaft: hovering an arrow shows where it starts and
which way it points, and a click selects it and sends it to your
notebook. Hover the arrows below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-arrows3d-default" data-masque-embed="plots_arrows3d" data-masque-segment="default" title="Nine arrows of a flow field in 3D. Hover an arrow, or click one to see what it returns." style="width:100%;height:860px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_arrows3d"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.arrows3d`.

| Field | What it holds |
|---|---|
| `index` | the arrow's place in your data |
| `x`, `y`, `z` | the point the arrow starts from, as you passed it |
| `u`, `v`, `w` | the direction you passed |

## Show your own data

Give each arrow a payload, one per arrow in the order of your data. The
template can use the arrow's own fields next to yours:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-arrows3d-data" data-masque-embed="plots_arrows3d" data-masque-segment="data" title="The same arrows with a tooltip giving each one's speed and start." style="width:100%;height:600px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_arrows3d"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`arrows3d!` works on an `Axis3`. For arrows in 2D, `arrows2d!` responds
the same way on an `Axis`, with `x`, `y`, `u` and `v`.

## Where to go next

For points in 3D, see [Points and lines on an `Axis3`](points3d.md).
