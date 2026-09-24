# What Masque does not do

Masque makes a static Makie figure respond to the pointer and hands the
reader's choices to Pluto. Some things that interactive plotting
libraries do are left out on purpose, and a few have rough edges today.
Knowing them up front saves a search.

## By design

- **Hover never reaches Julia.** Hovering is instant and works in a
  static export because it stays in the browser. To react to a mark in
  Julia, click it. See [Concepts](@ref).
- **One selection at a time.** A click replaces the selection; there is
  no Shift- or Ctrl-click to add to it. To pick several marks, brush
  them with an [`ROIInteractable`](@ref).
- **Rectangles only.** Brushes are boxes; there is no lasso, and one
  widget brushes one layer.
- **The figure is never redrawn by the overlay.** Highlights are drawn
  on top of the picture, so the overlay cannot hide a series, recolour a
  mark, or zoom to a box. Do those in Julia from the `@bind` value — for
  example, fade the other series after a legend click (see
  [Legend](@ref)).
- **No double-click to reset the view.** A pan or orbit stays where you
  left it until the figure is rebuilt; see [Pan and orbit](@ref).
- **No automatic linking between plots.** Masque does not treat the same
  row in two plots as one observation; link them in Pluto cells (see
  [Linked views](@ref)).
- **Clicks need a running notebook.** In a static HTML export, hover and
  highlights still work, but nothing reaches `@bind` and the view cannot
  pan. PlutoSliderServer cannot enumerate Masque's values ahead of time,
  so it does not make clicks work in an export either.
- **The keyboard reaches marks, not handles.** Arrow keys walk points,
  bars, polygons, lines, and legend entries, but cannot move a brush box
  or a threshold line; see [Keyboard and screen readers](@ref).

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

In 3D there is no depth test either. Which mark the pointer hits
depends on the same layer order, not on distance from the camera: a
point on the far side of an `Axis3` scene can be hit through a nearer
object in a later layer, and a nearer mark in a later layer can be
hidden by a farther one in an earlier layer.

## Current rough edges

These are known problems rather than design choices:

- On a categorical axis, the hover card shows the category, but a click
  on an [`AxisInteractable`](@ref), or a threshold released along that
  axis, fails with an error instead of returning the category. See
  [Read coordinates](@ref).
- A small RGB `image!`, whose pixels are at least one screen pixel wide,
  fails when `masque` runs. See [Inspect a grid](@ref) for a
  workaround.
- Several plot types are skipped on `Axis3` and `PolarAxis`, `Surface`
  plots are not hit-tested, and `LScene` is not supported. [Supported plots and
  axes](@ref) has the full list.
