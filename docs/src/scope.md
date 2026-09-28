# What Masque does not do

Masque adds tooltips and click selection to a Makie figure, and sends a
click to your notebook through `@bind`. Some things that interactive
plotting libraries do are left out on purpose, and a few have rough
edges today.

## By design

- Hovering never changes a `@bind` value. Tooltips and highlights work
  in the browser alone, so they are instant. To use a mark in Julia,
  click it. See [How interactions work](@ref).
- You select one mark at a time. A click replaces the selection, and
  there is no Shift-click or Ctrl-click to add to it. To pick several
  marks, brush them with an [`ROIInteractable`](@ref).
- Brushes are rectangles. There is no lasso, and one widget brushes one
  layer.
- Hovering and clicking never change the figure itself. Highlights are
  drawn on top of it, so a click cannot hide a series, recolor a mark,
  or zoom to a box by itself. Do those in Julia from the `@bind` value,
  for example to fade the other series after a legend click (see
  [Legend](@ref)).
- Double-clicking does not reset the view. A pan or orbit stays where
  you left it until the figure is rebuilt. See [Pan and orbit](@ref).
- Plots are not linked for you. Masque does not know that a row in one
  plot is the same observation as a row in another. Link them in Pluto
  cells (see [Linked views](@ref)).

## Overlapping marks

When two interactive layers overlap, the pointer hits the one listed
first. Legend entries always come first and pan or orbit always comes
last; everything else keeps the order of the interactables you passed,
and `masque(fig)` lists plots in the order you drew them.

That means a point drawn *on top of* a filled polygon is hidden from
the pointer by the polygon drawn before it. Pass the interactables
yourself, points first:

```julia
begin
    fig = Figure()
    ax = Axis(fig[1, 1])
    p = poly!(ax, Point2f[(0, 0), (3, 0), (3, 3), (0, 3)])
    s = scatter!(ax, [1.0, 2.0], [1.0, 2.0]; markersize = 16)
    nothing
end
```

```julia
@bind pick masque(fig, [PointInteractable(ax, s), PolygonInteractable(ax, p)])
```

In 3D, distance from the camera does not matter either. Which mark the
pointer hits depends on the same layer order. A point on the far side
of an `Axis3` scene can be hit through a nearer object in a later layer,
and a nearer mark in a later layer can be hidden by a farther one in an
earlier layer.

## Current rough edges

- In a static HTML export, other cells do not respond to a click and
  the view does not pan. See [Static exports and this site](@ref).
- The keyboard does not move a brush box, a threshold line, or the
  view. See [Keyboard and screen readers](@ref).
- Several plot types are skipped on `Axis3` and `PolarAxis`, a
  `surface!` plot does not respond to the pointer, and `LScene` is not
  supported. [Supported plots and axes](@ref) has the full list.
