# Current design and rough edges

Masque works differently from interactive plotting libraries in a few
places you might not expect, and some parts are unfinished. This page
describes how it behaves today, so you can plan around it before you
build a notebook on it.

## How Masque behaves

Tooltips and highlights respond in the browser alone, so they are
instant. The `@bind` value changes only when you click. To use a mark in
Julia, click it. See [How interactions work](@ref).

A click selects one mark and replaces the previous selection. To select
several marks at once, drag a box over them with an
[`ROIInteractable`](@ref). The box is a rectangle, and it selects marks
from one plot.

Your figure stays as you created it. Highlights are drawn on top of the
image, so a click on its own cannot hide a series, recolor a mark, or
zoom in. Do those in Julia from the `@bind` value. For example,
[Legend](@ref) fades the other series when you click a legend entry.

A pan or orbit stays where you left it until the figure is created
again. Double-clicking does not reset it. See [Pan and orbit](@ref).

Each widget knows only its own figure. To have a click in one plot
highlight the same observation in another, connect the two in Pluto
cells. See [Linked views](@ref).

## Overlapping marks

When two interactive plots overlap, the pointer reaches the plot that
comes first in Masque's list, not the one drawn on top. Legend entries
always come first and pan or orbit always comes last. In between, the
plots keep the order you passed them in, or, with `masque(fig)`, the
order you created them in.

This matters most when you draw points over a filled shape. Here the
polygon is created first, so with `masque(fig)` it covers the points:
hovering a point shows the polygon's tooltip, and you cannot click the
point.

```julia
begin
    fig = Figure()
    ax = Axis(fig[1, 1])
    p = poly!(ax, Point2f[(0, 0), (3, 0), (3, 3), (0, 3)])
    s = scatter!(ax, [1.0, 2.0], [1.0, 2.0]; markersize = 16)
    nothing
end
```

To reach the points, pass the interactables yourself and list the
scatter before the polygon:

```julia
@bind pick masque(fig, [PointInteractable(ax, s), PolygonInteractable(ax, p)])
```

Now each point responds when you hover or click it, and the polygon
still responds everywhere else. Only the plots you list are
interactive, so include every plot you want to respond.

The same order applies on an `Axis3`: distance from the camera does
not decide which mark you reach. A mark on the far side of the scene
can be reached through a nearer mark that comes later in the list, and
a nearer mark can be blocked by a farther one that comes earlier.

## Rough edges today

- In a static HTML export, tooltips and highlights still work, but other
  cells do not respond to a click and you cannot pan. See
  [Static exports and this site](@ref).
- The keyboard cannot move a brush box, a threshold line, or the view.
  See [Keyboard and screen readers](@ref).
- Some plot types are skipped on `Axis3` and `PolarAxis`, a `surface!`
  does not respond to the pointer, and `LScene` is not supported.
  [Supported plots and axes](@ref) has the full list.

If something behaves differently from what this page describes, see
[Troubleshooting](@ref).
