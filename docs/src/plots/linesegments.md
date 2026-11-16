# `linesegments!`

`masque(fig)` makes each segment of a `linesegments!` plot respond:
hovering a segment shows its two ends, and a click selects it and sends
it to your notebook. Hover the bars of the schedule below, then click
one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-linesegments-default" data-masque-embed="plots_linesegments" data-masque-segment="default" title="A project schedule drawn as five segments. Hover a segment, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_linesegments"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.segments`.

| Field | What it holds |
|---|---|
| `segment_index` | which segment, in the order of your points: the first two points are segment `1` |
| `x1`, `y1`, `x2`, `y2` | the segment's two ends, and `z1`, `z2` on an `Axis3` |

The tooltip writes the ends the way the axis writes its ticks, so here
`y1` reads "Design" rather than `1`.

## Show your own data

Give each segment a payload, one per segment in the order you drew
them. The tooltip then shows your fields:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-linesegments-data" data-masque-embed="plots_linesegments" data-masque-segment="data" title="The same schedule with a tooltip naming each task and its days." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_linesegments"; segment = "data")
```

A click also returns the payload's fields, so `pick.task` is the task
you clicked, and the segment's place moves from `segment_index` to
`pick.index`. [Tooltips](@ref) lists what a template can do.

## Supported axes

`linesegments!` works on a 2D `Axis`, an `Axis3` and a `PolarAxis`.

## Where to go next

For one connected line through your points, see [`lines!`](lines.md).
For bars that show a spread around a value, see
[`errorbars!`](errorbars.md) and [`rangebars!`](rangebars.md).
