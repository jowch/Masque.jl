# `density!`

`masque(fig)` makes each density curve respond as one filled area:
hovering it highlights the curve and shows its `index`, and a click selects it and sends it
to your notebook. Hover the curves below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-density-default" data-masque-embed="plots_density" data-masque-segment="default" title="Two overlapping density curves of height. Hover a curve, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_density"; segment = "default")
```

## What a click returns

Each `density!` is one mark with its own field in the `@bind` value:
`sel.density` for the first, then `sel.density_2`, `sel.density_3`.
A click gives an [`ElementEvent`](@ref) whose `index` is `1`, since
each plot has one curve. Where two curves overlap, the one drawn last
answers.

## Show your own data

The field name alone doesn't say which group a curve is. To name each
curve, give each plot one payload and a tooltip template:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-density-data" data-masque-embed="plots_density" data-masque-segment="data" title="The same curves with a tooltip naming each group." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_density"; segment = "data")
```

A click also returns the payload's fields, so `sel.density.group` is
`"Women"`. [Tooltips](@ref) lists what a template can do.

## Read the value under the pointer

Hovering a curve shows its group, not the height under the pointer. To
read the height anywhere on the axis, add an [`AxisInteractable`](@ref)
and pass `auto = false`. Without it, a curve answers wherever the
pointer is over one, so the axis would only read between them. With it,
the curves no longer respond on their own:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-density-axis" data-masque-embed="plots_density" data-masque-segment="axis" title="The same curves with a readout of the height under the pointer." style="width:100%;height:420px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_density"; segment = "axis")
```

## Supported axes

`density!` works on a 2D `Axis`.

## Where to go next

To compare several groups side by side, see [`violin!`](violin.md).
