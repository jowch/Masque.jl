# `wireframe!`

On an `Axis3`, `masque(fig)` makes each edge of a `wireframe!` respond:
hovering an edge shows its two ends, and a click selects it and sends
it to your notebook. Hover the mesh below, then click an edge:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-wireframe-default" data-masque-embed="plots_wireframe" data-masque-segment="default" title="A hill drawn as a wireframe. Hover an edge, or click one to see what it returns." style="width:100%;height:860px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_wireframe"; segment = "default")
```

## What a click returns

A click gives an [`ElementEvent`](@ref) with these fields. Here the
figure passes the plot as `bind`, so `pick` is that event itself; with
`@bind sel masque(fig)`, it is `sel.wireframe`.

| Field | What it holds |
|---|---|
| `segment_index` | which edge, in Makie's order |
| `x1`, `y1`, `z1`, `x2`, `y2`, `z2` | the edge's two ends |

## Show your own data

Makie decides the order of the edges, so give a tooltip template rather
than payloads. The template can use the ends:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-wireframe-data" data-masque-embed="plots_wireframe" data-masque-segment="data" title="The same hill with a tooltip giving each edge's heights." style="width:100%;height:600px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_wireframe"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`wireframe!` works on an `Axis3`. Drawn over a `surface!` of the same
grid, it is left as decoration and the [surface](surface.md) responds.

## Where to go next

For the surface itself, see [`surface!`](surface.md). The figures on
this page stay put; in your notebook, [Explore a 3D figure](@ref) shows
how to turn the view.
