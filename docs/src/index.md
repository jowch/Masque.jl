# Masque.jl

Masque adds an interactive layer over Makie figures inside a Pluto
notebook. Add rich tooltips, hover interactions, selections, and more to
your figures.

## Hover a mark

![Holding the pointer over a scatter point shows a tooltip with the city name and population](assets/home/hover.gif)

Hold the pointer over a point, bar, heatmap cell, polygon, or legend
entry. A tooltip appears on the figure you already drew. For templates
and styling, see [Tooltips](@ref).

## Click, then use the pick in Julia

![Clicking São Paulo on a cities scatter updates the bound pick cell to that city](assets/home/click.gif)

Click a mark. `@bind` writes that pick into the next cell, the same way
a PlutoUI slider does. Downstream cells re-run with the selected row,
bar, or cell. For more information, see [Click marks](@ref) and
[Selection](@ref).

## Brush, threshold, and pan

![Dragging a region box onto the North stations updates the bound table](assets/home/brush.gif)

Drag a box over points to select a region. Drag a cutoff on a colorbar.
Pan a 2D axis, or orbit `Axis3` on the WebGL backend. See
[Brush a region](@ref), [Read coordinates](@ref), and
[Pan and orbit](@ref).

## Highlight from the legend

![Hovering and clicking a legend entry washes that series and updates the bound pick](assets/home/legend.gif)

Hover or click a `Makie.Legend` entry to wash the traces it labels. See
[Legend](@ref).

## Inspect a static export

![Holding the pointer over heatmap cells shows each cell's value on a static overlay](assets/home/export.gif)

Hover and click still work in a Pluto HTML export of the notebook.
Re-running Julia cells needs a live session. CairoMakie is the default;
WGLMakie is the live canvas when you want animation, large data, or 3D
you can orbit. See [Backends](@ref).

## Where to go next

- [Getting started](@ref) — a walkthrough: explicit vs. zero-config,
  choosing a backend, what a bond value looks like
- [Constructors](@ref) — every built-in kind, its constructor, and its
  default payload
- [Selection](@ref) — reacting to clicks, linking plots, persisting a
  highlight
- [Legend](@ref) — hover/click a `Makie.Legend` entry to highlight the
  trace(s) it labels
- [Tooltips](@ref) — `masque"..."` templates and styling
- [Custom hits](@ref) — `RegionInteractable` / `FunctionInteractable`
- [Backends](@ref) — `:cairo` vs `:webgl`, and when to reach for which
- [Troubleshooting](@ref) — common errors and what causes them
- [Examples](@ref) — every runnable notebook in the repo
- [API](@ref) — full docstrings
