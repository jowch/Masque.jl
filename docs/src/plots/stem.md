# `stem!`

A `stem!` plot draws two parts, and `masque(fig)` makes each respond on
its own: the points, under the name `points`, and the stems below them,
under `stems`. Hovering either shows what it marks, and a click sends
it to your notebook. Hover a point or a stem below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-stem-default" data-masque-embed="plots_stem" data-masque-segment="default" title="A decaying signal drawn as stems. Hover a point or a stem, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_stem"; segment = "default")
```

## What a click returns

With the plot as `bind`, `pick` holds one field per part: `pick.points`
for a point and `pick.stems` for a stem, each `nothing` until you click
there. With `@bind sel masque(fig)`, they are `sel.stem.points` and
`sel.stem.stems`. Each is an [`ElementEvent`](@ref):

| Part | Fields |
|---|---|
| `points` | `index`, the point's place in your data, and `x`, `y`, the point |
| `stems` | `segment_index`, the stem's place in your data, and `x1`, `y1`, `x2`, `y2`, its two ends |

## Show your own data

Key payloads and tooltips by part name. Here both parts carry the
sample number, and each gets its own template, since a point's value is
`y` and a stem's is its top end, `y2`. Hover a point or a stem:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-stem-data" data-masque-embed="plots_stem" data-masque-segment="data" title="The same signal, where hovering a point or a stem names its sample." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_stem"; segment = "data")
```

[Plots with several parts](@ref) says more about plots like this one.

## Supported axes

`stem!` works on a 2D `Axis`.

## Where to go next

For the points alone, see [`scatter!`](scatter.md); for segments you
place yourself, see [`linesegments!`](linesegments.md).
