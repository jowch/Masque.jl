"""
    Masque

Overlay JS interactivity — hover tooltips, click-to-select, drag-to-pan/rotate — on a static
or live Makie `Figure` for use in a [Pluto](https://plutojl.org) notebook.

Call [`masque`](@ref)`(fig)` for every default interaction (see [`interactables`](@ref)),
pass [`AbstractInteractable`](@ref)s to add to or replace them, and bind the result with
`@bind`. The value has one field per plot or control a reader can set: `nothing` while
nothing is picked, otherwise an [`InteractionEvent`](@ref). Needs a rendering backend
loaded: `using CairoMakie` for a static image with a JS hit-test overlay, or `using WGLMakie`
for a live browser-GPU canvas (animation, large/live data, 3D) — both expose the same
`masque`/`@bind` contract.

# Examples
```julia
using Masque, CairoMakie
fig = Figure(); ax = Axis(fig[1, 1])
scatter!(ax, [1, 2, 3], [1, 4, 9])
@bind sel masque(fig)   # zero-config: auto-extracts the scatter; sel.scatter is the pick
```
"""
module Masque

using Makie: Makie, Point2f, Point3f, Point3d, RGBAf
using FileIO
using Base64: base64decode, base64encode
using SHA: sha384
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
# Where a page outside Pluto loads that bundle from: `(url, integrity)`, or `nothing` to
# inline it in every widget.
const _OVERLAY_CDN = Ref{Union{Nothing, NamedTuple{(:url, :integrity), Tuple{String, String}}}}(nothing)
function __init__()
    dir = normpath(joinpath(@__DIR__, ".."))
    _OVERLAY_JS[] = read(joinpath(dir, "assets", "overlay.js"), String)
    _OVERLAY_CDN[] = _overlay_cdn(dir, pkgversion(@__MODULE__), _OVERLAY_JS[])
    _register_error_hints()
    return nothing
end

# A registered install is the tree of its release tag, so its bundle is byte-identical to the
# one jsDelivr serves for that tag, and a page can load it once instead of inlining 80 KB per
# widget (#311). The browser checks it against this copy's hash. A git checkout may carry an
# unreleased bundle, so it inlines its own.
function _overlay_cdn(dir, version, js)
    (version === nothing || isdir(joinpath(dir, ".git"))) && return nothing
    in_depot = any(DEPOT_PATH) do depot
        startswith(dir, normpath(joinpath(depot, "packages")) * Base.Filesystem.path_separator)
    end
    in_depot || return nothing
    url = "https://cdn.jsdelivr.net/gh/jowch/Masque.jl@v$(version)/assets/overlay.js"
    return (; url, integrity = "sha384-" * base64encode(sha384(js)))
end

include("makie_compat.jl")
include("backend.jl")
include("markup.jl")
include("interactables.jl")
include("introspect.jl")
include("compose.jl")
include("fields.jl")
include("events.jl")
include("bond.jl")
include("render.jl")
include("hints.jl")

export AbstractBackend
export AbstractInteractable, AbstractSelector, HitLayer, InteractionContext, AxisTransform
export PointInteractable, SegmentInteractable, RectInteractable, GridInteractable, PolygonInteractable,
    AxisInteractable, ColorbarInteractable, LegendInteractable, RegionInteractable, FunctionInteractable,
    ThresholdInteractable, ROIInteractable, TextInteractable, ViewInteractable, SliceInteractable,
    SurfaceInteractable
export masque, interactables, data_to_image_px, hitlayers, bondtype, transform_bond
export InteractionEvent, ElementEvent, LegendEvent, GridCellEvent, GridWindowEvent, GridSelection,
    AxisEvent, ThresholdEvent, ColorbarEvent, BoundsEvent
export Markup, @masque_str

end # module Masque
