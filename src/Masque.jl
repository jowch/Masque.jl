"""
    Masque

Overlay JS interactivity — hover tooltips, click-to-select, drag-to-pan/rotate — on a static
or live Makie `Figure` for use in a [Pluto](https://plutojl.org) notebook.

Call [`masque`](@ref)`(fig)` for every default interaction (see [`interactables`](@ref)),
pass [`AbstractInteractable`](@ref)s to add to or replace them, and bind the result with
`@bind`; the bond
reports the current selection — `nothing` when nothing is selected, otherwise an
[`InteractionEvent`](@ref). Needs a rendering backend
loaded: `using CairoMakie` for a static image with a JS hit-test overlay, or `using WGLMakie`
for a live browser-GPU canvas (animation, large/live data, 3D) — both expose the same
`masque`/`@bind` contract.

# Examples
```julia
using Masque, CairoMakie
fig = Figure(); ax = Axis(fig[1, 1])
scatter!(ax, [1, 2, 3], [1, 4, 9])
@bind sel masque(fig)   # zero-config: auto-extracts the scatter
```
"""
module Masque

using Makie: Makie, Point2f, Point3f, Point3d, RGBAf
using FileIO
using Base64: base64encode
using HypertextLiteral: HypertextLiteral, @htl
import AbstractPlutoDingetjes
const APD = AbstractPlutoDingetjes

# Every deprecation warns through here. Plain `Base.depwarn` logs only under `--depwarn=yes`,
# which `Pkg.test` sets and Pluto and the REPL do not, so a notebook user would never see it.
# `force = true` logs it anyway, once per call site; `--depwarn=error` still throws.
_deprecate(msg, funcsym) = Base.depwarn(msg, funcsym; force = true)

"""
    AbstractBackend

Supertype for a Masque rendering backend. The built-in backends live in package extensions and
are chosen by name with [`masque`](@ref)'s `backend=` keyword: `:cairo` (a static image, once
`CairoMakie` is loaded) and `:webgl` (a live browser-GPU canvas, once `WGLMakie` is loaded).
`masque` picks one automatically from whichever is loaded.

A third-party backend subtypes `AbstractBackend`, implements `render`, `context`, `_ppu`, and
`make_widget`, and is passed as an instance: `masque(fig; backend = MyBackend())`. `masque`'s
`max_width` and `px_per_unit` keywords reach it through those methods.
"""
abstract type AbstractBackend end

# The committed overlay bundle, read once at module load (see docs/dev/frontend-delivery.md).
const _OVERLAY_JS = Ref{String}("")
function __init__()
    _OVERLAY_JS[] = read(joinpath(@__DIR__, "..", "assets", "overlay.js"), String)
    return nothing
end

include("makie_compat.jl")
include("backend.jl")
include("markup.jl")
include("interactables.jl")
include("introspect.jl")
include("compose.jl")
include("events.jl")
include("bond.jl")
include("render.jl")

export AbstractBackend
export AbstractInteractable, AbstractSelector, HitLayer, InteractionContext, AxisTransform
export PointInteractable, SegmentInteractable, RectInteractable, GridInteractable, PolygonInteractable,
    AxisInteractable, ColorbarInteractable, LegendInteractable, RegionInteractable, FunctionInteractable,
    ThresholdInteractable, ROIInteractable, TextInteractable, ViewInteractable, SliceInteractable
export masque, interactables, auto_interactables, data_to_image_px, hitlayers, bondtype, transform_bond
export InteractionEvent, ElementEvent, LegendEvent, GridCellEvent, GridWindowEvent,
    AxisEvent, ThresholdEvent, ColorbarEvent, BoundsEvent
export Markup, @masque_str

end # module Masque
