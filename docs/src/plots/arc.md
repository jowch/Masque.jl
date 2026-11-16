# `arc!`

`masque(fig)` makes each `arc!` respond along its whole length: hovering
an arc shows the point on it nearest the pointer. A click changes
nothing until you name the arc in `bind`; then a click picks that point
and sends it to your notebook. Here both arcs are named, so each gets
its own field. Hover an arc below, then click it:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-arc-default" data-masque-embed="plots_arc" data-masque-segment="default" title="Two arcs, an inner half circle and an outer quarter. Click an arc to pick a point on it." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_arc"; segment = "default")
```

## What a click returns

With `bind = (inner = a1, outer = a2)`, `pick.inner` and `pick.outer`
each hold `nothing` or the point clicked on that arc, as an
[`ElementEvent`](@ref) with these fields:

| Field | What it holds |
|---|---|
| `index` | the point's place along the arc as Makie draws it |
| `line` | always `1` |
| `x`, `y` | the point on the arc |

Makie draws an arc from many short pieces, so `index` counts those, not
anything you passed.

## Show your own data

An arc is one mark, so it takes a list with one payload. Give each arc
its own [`interactables`](@ref) call, with its payload and a tooltip
template:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-arc-data" data-masque-embed="plots_arc" data-masque-segment="data" title="The same arcs with tooltips naming each track and its radius." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_arc"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`arc!` works on a 2D `Axis`.

## Where to go next

For a line through your own points, see [`lines!`](lines.md).
