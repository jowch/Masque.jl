# `streamplot!`

A `streamplot!` draws its flow as two parts, and `masque(fig)` makes
each respond on its own: the arrowheads, under the name `scatter`, and
the stream lines, all of them together, under `lines`. Hovering either
shows the point under the pointer, and a click sends it to your
notebook. Hover the arrowheads below, then click one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-streamplot-default" data-masque-embed="plots_streamplot" data-masque-segment="default" title="A swirling flow. Hover an arrowhead or a stream line, or click one to see what it returns." style="width:100%;height:820px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_streamplot"; segment = "default")
```

## What a click returns

With the plot as `bind`, `pick` holds one field per part: `pick.scatter`
for an arrowhead and `pick.lines` for a line, each `nothing` until you
click there. Each is an [`ElementEvent`](@ref):

| Part | Fields |
|---|---|
| `scatter` | `index`, which arrowhead in Makie's order, and `x`, `y`, where it sits |
| `lines` | `index`, always `1`, and `x`, `y`, the point on a line nearest the pointer |

The flow function itself isn't sent: to read the flow at a clicked
point, call it with `pick.scatter.x` and `pick.scatter.y`.

## Show your own text

Makie decides where the arrowheads and lines go, so give a tooltip
template rather than payloads. The template applies to both parts and
can use `x` and `y`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-streamplot-data" data-masque-embed="plots_streamplot" data-masque-segment="data" title="The same flow with a tooltip giving the point in kilometres." style="width:100%;height:560px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_streamplot"; segment = "data")
```

[Plots with several parts](@ref) says more about plots like this one.

## Supported axes

`streamplot!` works on a 2D `Axis`.

## Where to go next

For arrows you place yourself, see [`arrows3d!`](arrows3d.md) on an
`Axis3`.
