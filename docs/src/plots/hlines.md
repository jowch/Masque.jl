# `hlines!` and `vlines!`

`masque(fig)` makes each line of an `hlines!` or `vlines!` plot respond
along its whole length: hovering a line shows where it sits, and a
click selects it and sends it to your notebook. Hover the lines below,
then click a horizontal one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-hlines-default" data-masque-embed="plots_hlines" data-masque-segment="default" title="Daily load with two horizontal limits and two vertical event lines. Hover a line, or click a horizontal one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_hlines"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the `hlines!` plot as `bind`, so `pick` is that event
itself, and a click on a vertical line leaves it alone. With
`@bind sel masque(fig)`, the lines are `sel.hlines` and `sel.vlines`.

| Field | What it holds |
|---|---|
| `segment_index` | which line, in the order you gave them |
| `y` | where an `hlines!` line sits; `x` for a `vlines!` line |

## Show your own data

Give each plot its own [`interactables`](@ref), with a payload per
line:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-hlines-data" data-masque-embed="plots_hlines" data-masque-segment="data" title="The same lines with tooltips naming each limit and each event." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_hlines"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`hlines!` and `vlines!` work on a 2D `Axis`.

## Where to go next

For a line at any slope, see [`ablines!`](ablines.md). For a shaded
band instead of a line, see [`hspan!` and `vspan!`](hspan.md).
