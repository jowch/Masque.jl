# Current design and rough edges

Masque works differently from other interactive plotting libraries in
a few places, and a few features are not finished yet. Below is how
Masque behaves today and, where there is one, what to do instead.

## How Masque behaves

Tooltips and highlights respond in the browser without Julia, so they
are instant. The `@bind` value changes only when you click. To use a
mark in Julia, click it. See [How interactions work](@ref).

A click selects one mark and replaces the previous selection. To select
several marks at once, drag a box over them with an
[`ROIInteractable`](@ref). The box is a rectangle, and a widget takes
one box, which selects from one layer: a set of points, or a heatmap or
image.

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

When two interactive plots overlap, the pointer reaches the one drawn on
top: on each axis, the plot you created last. Points drawn over a filled
shape, or a graph's nodes over its edges, respond when you hover them,
and the shape or edges respond everywhere else. Legend entries always
come first and pan or orbit always comes last. An interactable you pass
to `masque` for one of those plots takes that plot's place, and any
other comes after them. With `auto = false`, the order is the one you
pass them in.

A shape drawn over points covers them. Here the polygon is created
after the scatter, so with `masque(fig)` hovering a point shows the
polygon's tooltip, and you cannot click the point.

```julia
begin
    fig = Figure()
    ax = Axis(fig[1, 1])
    s = scatter!(ax, [1.0, 2.0], [1.0, 2.0]; markersize = 16)
    p = poly!(ax, Point2f[(0, 0), (3, 0), (3, 3), (0, 3)]; color = (:gray, 0.3))
    nothing
end
```

To reach the points, pass in your own list of the interactables you
want, with the scatter before the polygon, and add `auto = false` so
that `masque` uses your list in place of its own:

```julia
@bind pick masque(
    fig,
    [PointInteractable(ax, s), PolygonInteractable(ax, p)];
    auto = false,
)
```

Now each point responds when you hover or click it, and the polygon
still responds everywhere else. With `auto = false`, only the plots you
list are interactive, so include every plot you want to respond.

The same order applies on an `Axis3`: distance from the camera does
not decide which mark you reach. A mark on the far side of the scene
can be reached through a nearer mark created before it, and a nearer
mark can be blocked by a farther one created after it.

## Rough edges today

- In a static HTML export, tooltips and highlights still work, but other
  cells do not respond to a click and the view does not pan or orbit. See
  [Static exports and this site](@ref).
- The keyboard does not reach heatmap or image cells. See
  [Keyboard and screen readers](@ref accessibility-limitations).
- Some plot types are skipped on `Axis3` and `PolarAxis`, a `surface!`
  does not respond to the pointer, and `LScene` is not supported.
  [Supported plots and axes](@ref) has the full list.

If something behaves differently from what this page describes, see
[Troubleshooting](@ref).
