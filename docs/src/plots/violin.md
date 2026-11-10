# `violin!`

`masque(fig)` makes each violin respond on its own: hovering a violin
shows its `x`, the number you placed it at, and a click selects it and
sends it to your notebook. Hover the violins below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-violin-default" data-masque-embed="plots_violin" data-masque-segment="default" title="Three violins of penguin weights. Hover a violin, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_violin"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with two fields. Here the
figure passes the violin plot as `bind`, so `pick` is that event
itself; with `@bind sel masque(fig)`, it is `sel.violin`.

| Field | What it holds |
|---|---|
| `index` | the violin's place from left to right, so `1` is the leftmost |
| `x` | where the violin sits on the axis: the value you passed in `groups`, such as `2` for Chinstrap |

A horizontal violin, drawn with `orientation = :horizontal`, reports
its category as `y` instead of `x`.

## Show your own data

To show the species instead of its number, give each violin a payload, one per
violin from left to right, and a tooltip template that uses its fields:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-violin-data" data-masque-embed="plots_violin" data-masque-segment="data" title="The same violins with a tooltip giving each species, its count and its median." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_violin"; segment = "data")
```

A click also returns the payload's fields, so `pick.species` is the
name of the violin you clicked. [Tooltips](@ref) lists what a template
can do.

## Select several violins

To compare groups, pass `select = :many`. Each click then adds a violin
to the selection or takes it out again:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-violin-many" data-masque-embed="plots_violin" data-masque-segment="many" title="The same violins. Click two to select both." style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_violin"; segment = "many")
```

The `@bind` value is then a vector of events, one per selected violin.
See [Select several marks](@ref).

## Read the value under the pointer

Hovering a violin shows the whole group, not the weight at the pointer.
To read the weight anywhere on the axis, add an [`AxisInteractable`](@ref)
and pass `auto = false`, so the axis is the only part that responds.
The violins then no longer respond on their own, because over a violin
the violin answers first:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-violin-axis" data-masque-embed="plots_violin" data-masque-segment="axis" title="The same violins with a readout of the weight under the pointer." style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_violin"; segment = "axis")
```

## Supported axes

`violin!` works on a 2D `Axis`. On an `Axis3` or a `PolarAxis`, it is
skipped with a warning.

## Where to go next

A `rainclouds!` plot draws violins with the data points and a box; see
[`rainclouds!`](rainclouds.md).
