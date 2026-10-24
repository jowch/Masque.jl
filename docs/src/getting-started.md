# Getting started

Make one scatter plot interactive, then show your own data in its
tooltips.

## Install

Load Masque and a Makie backend in a Pluto cell, and Pluto installs both
for you:

```julia
using Masque, CairoMakie
```

Put each code block from these docs in its own cell.

!!! info

    Masque works with CairoMakie and WGLMakie. If you load both, `masque`
    uses CairoMakie. See [Backends](@ref) to choose between them.

## Make a figure interactive

Create a figure the way you normally would. End the cell with `nothing`,
or Pluto shows a second, static copy of the figure:

```julia
begin
    xs = [1.0, 2.0, 3.0, 4.0]
    ys = [2.0, 1.0, 4.0, 3.0]
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1])
    scatter!(ax, xs, ys; markersize = 16)
    nothing
end
```

Pass the figure to `masque` and bind the result to a variable:

```julia
@bind sel masque(fig)
```

`sel` has one field for each plot you can click, named after the plot,
so this figure's scatter is `sel.scatter`. Hover over a point to see its
`index`, `x`, and `y`; hovering leaves `sel` as it was. Clicking a point
stores it in `sel.scatter`, and cells that use `sel` respond to the
change:

```julia
pick = sel.scatter
```

```julia
isnothing(pick) ? "click a point" : "point $(pick.index) at x = $(pick.x)"
```

`pick` is `nothing` until you click, then an [`ElementEvent`](@ref), and
`pick.index` is the clicked point's position in the data you plotted, so
`ys[pick]` is its `y`. To have `sel` be the point itself, without the
field, see [What the `@bind` value holds](@ref).

`masque(fig)` works on scatters, lines, bars, heatmaps, polygons, text,
legends, and colorbars. [Recipes masque(fig) extracts](@ref) has the
full list.

## Show your own data

The default tooltip shows coordinates. To add your own fields, pass the
scatter to [`interactables`](@ref) with one `payloads` entry per point.
Replace the figure cell with this one:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gs-figure" data-masque-embed="home_quickstart" data-masque-segment="figure" title="The figure cell: a four-point scatter with a name for each point." style="width:100%;height:360px;border:0;background:transparent;overflow:hidden;" scrolling="no" loading="lazy"></iframe>
</div>
```

```@eval
Main.masque_fallback("home_quickstart"; segment = "figure")
```

and pass `pts` to `masque` in the `@bind` cell:

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gs-quickstart" data-masque-embed="home_quickstart" data-masque-segment="value" title="Four-point scatter. Click a point and the readout names it." style="width:100%;height:760px;border:0;background:transparent;overflow:hidden;" scrolling="no"></iframe>
</div>
```

```@eval
Main.masque_fallback("home_quickstart"; segment = "value")
```

Hovering a point now shows its `name`, `x`, and `y`, and clicking it
sets `sel.scatter.name`. Your fields are added to the point's own `x`
and `y`, so you don't copy the coordinates into each entry. These cells
were recorded from a real notebook (see
[Examples on this site](@ref this-site)).

## Where to go next

- [How Masque works](@ref): how hover, clicks, payloads, and `@bind` fit together
- [Tooltips](@ref): templates, number formatting, and dark figures
- [What each mark returns](@ref): bars, polygons, lines, and polar points
- [Brush a region](@ref): drag a box and get the points inside it
- [Selection](@ref): start with a mark selected, or keep one across a rebuild
- [Linked views](@ref): update another plot or a table from a click
- [Examples](@ref): worked examples to copy
- [Backends](@ref): CairoMakie or WGLMakie
