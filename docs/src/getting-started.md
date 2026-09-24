# Getting started

Masque makes a Makie figure in a Pluto notebook respond to the pointer:
hover a mark to see its data, click it to hand that mark to the rest of
your notebook. This page installs Masque, overlays a figure with one
call, and then attaches your own data to the marks.

## Install

In a Pluto notebook, paste each snippet from these docs into its own
cell. Pluto runs one top-level expression per cell. Wrap multiple
statements in `begin ... end`, which counts as one expression.

Paste this cell into the notebook. Pluto's package manager stays on:

```julia
begin
    using Pkg
    Pkg.add(url = "https://github.com/jowch/Masque.jl")
    Pkg.add("CairoMakie")
    using Masque, CairoMakie
end
```

To install from a Julia session instead, keep the notebook file closed
and write the packages into that file.
`Pluto.activate_notebook_environment` updates the environment embedded
in the notebook, so package management stays on when you open it again.
`Pkg.activate(; temp = true)` turns package management off.

```julia
import Pluto, Pkg
Pluto.activate_notebook_environment("path/to/notebook.jl") do
    Pkg.add(url = "https://github.com/jowch/Masque.jl")
    Pkg.add("CairoMakie")
end
```

!!! info

    Masque supports CairoMakie and WGLMakie. `using Masque` with no Makie
    backend raises `ArgumentError` the first time `masque` runs. If both
    CairoMakie and WGLMakie are loaded, `masque` defaults to CairoMakie.
    For more information, see [Backends](@ref).

## Overlay a figure

Draw the figure the way you normally would. End the cell with `nothing`
so Pluto does not also print the plain figure:

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

Then hand the figure to `masque` and bind the result:

```julia
@bind pick masque(fig)
```

Hover a point and a tooltip lists its `index`, `x`, and `y`. Hovering
never re-runs Julia; it only happens on the figure. Click a point and
`pick` becomes that point, so a cell that reads `pick` re-runs:

```julia
pick === nothing ? "click a point" : "point $(pick.index) at x = $(pick.x)"
```

`pick` is an [`ElementEvent`](@ref). `pick.index` is 1-based, and `pick`
indexes your data directly: `ys[pick]` is the clicked point's `y`.

`masque(fig)` finds everything it knows how to overlay on its own:
scatters, lines, bars, heatmaps, polygons, text, legends, and colorbars
(see [Recipes masque(fig) extracts](@ref)).

## Attach your own data

A tooltip that says `x = 3.0` is only a start. Pass the scatter to
[`PointInteractable`](@ref) with one `payloads` entry per point, and the
tooltip and the click carry your fields instead. The notebook below does
that for three named points: hover reads `name` and `y`, and a click
fills `sel.name`.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gs-quickstart" data-masque-embed="home_quickstart" title="Three-point scatter with a tooltip, @bind, and a readout" style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no"></iframe>
</div>
```

```@eval
Main.masque_fallback("home_quickstart")
```

On this site the notebook is a recording, so a click swaps in a result
computed ahead of time (the **Simulating `@bind`** badge); in your own
notebook the last cell re-runs. *Notebook as text* has the same cells to
copy.

## Where to go next

- [Concepts](@ref) — how hover, clicks, payloads, and `@bind` fit together
- [Tooltips](@ref) — templates, number formatting, and a dark figure
- [Click marks](@ref) — bars, polygons, lines, and polar points
- [Brush a region](@ref) — drag a box and get the points inside it
- [Selection](@ref) — start with a mark selected, or keep one across a rebuild
- [Linked views](@ref) — drive another plot or a table from a click
- [Gallery](@ref) — more examples to copy
- [Backends](@ref) — CairoMakie or WGLMakie
