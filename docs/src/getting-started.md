# Getting started

Make one scatter plot interactive, then show your own data in its
tooltips.

## Install

Load Masque and a Makie backend in a Pluto cell. Pluto installs both:

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
@bind pick masque(fig)
```

Hover over a point to see its `index`, `x`, and `y`. Click a point and
`pick` holds it. Cells that use `pick` respond to the change:

```julia
isnothing(pick) ? "click a point" : "point $(pick.index) at x = $(pick.x)"
```

`pick` is an [`ElementEvent`](@ref). `pick.index` is the clicked point's
position in the data you plotted, so `ys[pick]` is its `y`.

`masque(fig)` works on scatters, lines, bars, heatmaps, polygons, text,
legends, and colorbars. [Recipes masque(fig) extracts](@ref) has the
full list.

## Show your own data

The default tooltip shows coordinates. To show your own fields instead,
pass the scatter to [`PointInteractable`](@ref) with one `payloads`
entry per point. Replace the figure cell with this one:

```julia
begin
    xs = [1.0, 2.0, 3.0, 4.0]
    ys = [2.0, 1.0, 4.0, 3.0]
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1])
    s = scatter!(ax, xs, ys; markersize = 16)
    points = [
        (name = "one", x = 1.0, y = 2.0),
        (name = "two", x = 2.0, y = 1.0),
        (name = "three", x = 3.0, y = 4.0),
        (name = "four", x = 4.0, y = 3.0),
    ]
    pts = PointInteractable(ax, s; payloads = points)
    nothing
end
```

and pass `pts` to `masque` in the `@bind` cell:

```julia
@bind pick masque(fig, pts)
```

Hovering a point now shows its `name`, `x`, and `y`, and clicking it
sets `pick.name`.

The notebook below does the same with three points. It is a recording
of a real notebook; see [Static exports and this site](@ref).

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gs-quickstart" data-masque-embed="home_quickstart" title="Three-point scatter. Click a point and the readout names it." style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no"></iframe>
</div>
```

```@eval
Main.masque_fallback("home_quickstart")
```

## Where to go next

- [Concepts](@ref): how hover, clicks, payloads, and `@bind` fit together
- [Tooltips](@ref): templates, number formatting, and dark figures
- [Click marks](@ref): bars, polygons, lines, and polar points
- [Brush a region](@ref): drag a box and get the points inside it
- [Selection](@ref): start with a mark selected, or keep one across a rebuild
- [Linked views](@ref): update another plot or a table from a click
- [Examples](@ref): worked examples to copy
- [Backends](@ref): CairoMakie or WGLMakie
