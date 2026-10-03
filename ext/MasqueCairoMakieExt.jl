module MasqueCairoMakieExt

using Masque: Masque, AbstractBackend, RenderResult, InteractionContext, AxisTransform
using CairoMakie
using FileIO
import Makie
import Makie: Point2f

"""
    CairoBackend

Static-image `Masque` backend, chosen with `masque(fig; backend = :cairo)` once `CairoMakie` is
loaded: renders `fig` once to a PNG, with a transparent JS overlay doing hit-testing over it —
no server, no WebGL, and the inspection layer keeps working in an exported, offline static HTML.
This is the default backend `masque` picks when `CairoMakie` is loaded. Its density follows
`masque`'s `max_width` (output ≈ 2× `min(figure width, max_width)`) unless `masque`'s
`px_per_unit` sets it.

The widget owns its DPI, format, and background; the figure's plots and size are kept.
`CairoMakie.activate!` settings apply to a bare `Figure` and to `save`, never to the widget.

`CairoBackend(; max_width)` is deprecated: use `masque(fig; backend = :cairo, max_width)`.
Removed in 0.3.
"""
struct CairoBackend <: AbstractBackend
    CairoBackend(::Masque._Builtin) = new()
end
function CairoBackend(; max_width = nothing)
    return Masque._legacy_backend(CairoBackend(Masque._Builtin()), :cairo, max_width, nothing)
end
Masque._builtin_backend(::Val{:cairo}) = CairoBackend(Masque._Builtin())

function Masque._ppu(::CairoBackend, fig, max_width)
    sw = size(fig.scene)[1]
    return 2 * min(sw, max_width) / sw
end

function Masque.render(::CairoBackend, fig, ppu)
    # backend=CairoMakie pinned explicitly as defense in depth: current_backend() is a bare
    # global Ref any loaded backend's __init__ can flip unconditionally on load.
    img = Makie.colorbuffer(fig; px_per_unit = ppu, backend = CairoMakie)
    io = IOBuffer(); save(Stream{format"PNG"}(io), img)
    return RenderResult("image/png", take!(io), size(img, 2), size(img, 1), Float64(ppu))
end

function Masque.context(b::CairoBackend, fig, ppu, max_width)
    w, h = size(fig.scene)
    scaling = Float64(ppu)
    out_w, out_h = round(Int, w * scaling), round(Int, h * scaling)
    # Lets grid hitlayers reason in true on-screen px instead of hardcoding the 2× DPI factor.
    display_scale = min(w, max_width) / out_w

    project = Masque._project_closure(scaling, out_h)

    Masque._reject_unsupported_axes(fig)

    axes = [c for c in fig.content if c isa Masque._SUPPORTED_AXES]
    ids = IdDict{Any, Symbol}()
    transforms = Dict{Symbol, AxisTransform}()
    for (k, ax) in enumerate(axes)
        id = Symbol("ax", k); ids[ax] = id
        transforms[id] = if ax isa Makie.Axis3
            Masque._axis3_transform(id, ax, scaling, out_h)
        elseif ax isa Makie.PolarAxis
            Masque._polar_transform(id, ax, scaling, out_h)
        else
            Masque._axis_transform(id, ax, scaling, out_h)
        end
    end
    cbs = [c for c in fig.content if c isa Makie.Colorbar]
    for (k, cb) in enumerate(cbs)
        id = Symbol("cb", k); ids[cb] = id
        transforms[id] = Masque._colorbar_transform(id, cb, scaling, out_h)
    end
    legs = [c for c in fig.content if c isa Makie.Legend]
    for (k, leg) in enumerate(legs)
        id = k == 1 ? :legend : Symbol(:legend_, k); ids[leg] = id
        transforms[id] = Masque._legend_transform(id, leg, scaling, out_h)
    end
    # CairoMakie centers a marker's outline on its edge.
    return InteractionContext(project, transforms, ids, out_w, out_h, scaling, display_scale, 0.5)
end

Masque.make_widget(b::CairoBackend, result::RenderResult, manifest, display_css, fig, interactables, ppu, max_width) =
    Masque.MasqueWidget(
    Masque.base64encode(result.payload), manifest, display_css,
    Masque._view_render_frame(b, fig, interactables, ppu, max_width),
)

end # module MasqueCairoMakieExt
