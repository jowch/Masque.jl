# Getting started

Masque overlays a Makie figure in Pluto. Draw the figure, mark what is
interactable, and `@bind` the overlay. A cell that reads the bond re-runs
when you click. Hover stays on the figure.

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

## Quick start

The notebook is the tutorial. Paste each cell into your own notebook,
including the notes. On this site the **Simulating `@bind`** chip is a
listed snapshot. In Pluto, the readout cell re-runs.

```@raw html
<div class="masque-embed-wrap">
<iframe id="masque-gs-quickstart" data-masque-embed="home_quickstart" title="Three-point scatter with a tooltip, @bind, and a readout" style="width:100%;height:1280px;border:0;background:transparent;overflow:hidden;" scrolling="no"></iframe>
</div>
```

```@eval
Main.masque_fallback("home_quickstart")
```

## Where to go next

- [Click marks](@ref) — bars, polygons, and polar points
- [Tooltips](@ref) — templates, placement, and a dark figure
- [Selection](@ref) — replace a selection, or start with a mark already
  selected
- [Brush a region](@ref) — drag a box over points
- [Pan and orbit](@ref) — move a 2D axis, or orbit an `Axis3`
- [Gallery](@ref) — a screenshot and a player for each demo
- [Constructors](@ref) — every built-in kind and its default payload
- [Backends](@ref) — CairoMakie and WGLMakie
