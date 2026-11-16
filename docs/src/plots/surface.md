# `surface!`

On an `Axis3`, `masque(fig)` makes a `surface!` respond point by point:
hovering it shows the data point nearest the pointer, on the side you
can see. Hover the surface below:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-surface-default" data-masque-embed="plots_surface" data-masque-segment="default" title="A surface of two hills. Hover it to read the height under the pointer." style="width:100%;height:600px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_surface"; segment = "default")
```

## What a click returns

In the figures on this page, hover the surface to read it; a click works
in your notebook, where it gives a [`GridCellEvent`](@ref): with `@bind
pick masque(fig; bind = sf)`, `pick` is that event itself, and with
`@bind sel masque(fig)`, it is `sel.surface`. Its fields:

| Field | What it holds |
|---|---|
| `i`, `j` | the point's first and second index in your matrix |
| `value` | the point's `z` |

`zs[pick]` reads the same point from your matrix.

## Show your own data

A tooltip template can use `i`, `j`, `x`, `y` and `z`:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-plots-surface-data" data-masque-embed="plots_surface" data-masque-segment="data" title="The same surface with a tooltip giving the height in kilometers." style="width:100%;height:600px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("plots_surface"; segment = "data")
```

[Tooltips](@ref) lists what a template can do.

## Supported axes

`surface!` works on an `Axis3` and on a `PolarAxis`, where the tooltip
shows each point's angle and radius. A `heatmap!` on a `PolarAxis` is
[skipped with a warning](@ref polar-skipped-plots), so draw a polar
heatmap with `surface!(ax, θ, r, values; shading = NoShading)` instead.
On a 2D `Axis`, it is skipped with a warning; draw the matrix with
[`heatmap!`](heatmap.md) there instead. A `wireframe!` over the same
grid is left as decoration, so the surface responds.

## Where to go next

[Explore a 3D figure](@ref) puts points on a surface and turns the
view. For flat grids, see [`heatmap!`](heatmap.md).
