# `scatterlines!`

A `scatterlines!` plot has two parts: the points, and the line through
them. `masque(fig)` makes each point respond: hovering one shows it,
and a click selects it and sends it to your notebook, with no `bind`
needed. The line shows its own tooltip but takes no click. Hover the
points below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-scatterlines-default" data-masque-embed="plots_scatterlines" data-masque-segment="default" title="Visitors by month, drawn as points joined by a line. Click a point to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_scatterlines"; segment = "default")
```

## What a click returns

The parts sit under the plot's name in the `@bind` value, so a click on
a point is `sel.scatterlines.points`, an [`ElementEvent`](@ref) with
these fields:

| Field | What it holds |
|---|---|
| `index` | the point's place in your data, so `1` is the first |
| `x`, `y` | the point you plotted |

## Show your own data

Give the points a payload each, under the part's name, `points`. The
tooltip then shows your fields next to the point's own:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-scatterlines-data" data-masque-embed="plots_scatterlines" data-masque-segment="data" title="The same plot, where a point's tooltip names its month and any event in it." style="width:100%;height:520px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_scatterlines"; segment = "data")
```

A click also returns the payload, so `sel.scatterlines.points.event`
is the event of the month you clicked. [Plots with several
parts](@ref) says how payloads work for each part.

## Supported axes

`scatterlines!` works on a 2D `Axis`, an `Axis3` and a `PolarAxis`.

## Where to go next

For a line without markers, see [`lines!`](lines.md).
