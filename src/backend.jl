"""
    RenderResult

The displayable artifact + the numbers JS needs to map it.
"""
struct RenderResult
    mime::String
    payload::Union{Vector{UInt8}, String}
    width::Int
    height::Int
    scaling::Float64
end

_gesture_frame(result::RenderResult) = Dict{String, Any}("png" => result.payload)

"""
    PolarFrame

The resolved `Makie.Polar` fields of one `PolarAxis`, so JS can turn the Cartesian point under
the pointer into `(θ, r)`: `θ = mod(direction·atan2(y, x) − theta_0, branch)` and
`r = hypot(x, y) + r0`, swapped when `theta_as_x` is false. `branch` is the 2π-wide interval θ is
folded into: `thetacenter ± π` on a sector narrower than 2π (as `PolarAxis`'s own zoom handler
does), else `0..2π` (as `inverse_transform(::Polar)` does).
"""
struct PolarFrame
    theta_as_x::Bool
    direction::Int
    theta_0::Float64
    r0::Float64
    branch::Tuple{Float64, Float64}
end

"""
    AxisTransform

One axis expressed declaratively, in the artifact's pixel space, so JS can invert
pixels↔data for `AxisInteractable` and live hover-coordinate readout.
"""
struct AxisTransform
    id::Symbol
    xlims::Tuple{Float64, Float64}
    ylims::Tuple{Float64, Float64}
    xscale::Symbol
    yscale::Symbol
    viewport::NTuple{4, Float64}      # (x,y,w,h) image px, top-left origin
    xreversed::Bool
    yreversed::Bool
    xcats::Union{Nothing, Vector{String}}   # nothing if not categorical
    ycats::Union{Nothing, Vector{String}}
    valueaxis::Union{Nothing, Symbol}       # nothing = 2-D {x,y}; :x/:y = 1-D colorbar readout axis
    is3d::Bool                              # pixel→data inversion is undefined on a 3D axis; lims are degenerate
    ispolar::Bool                           # lims are the Cartesian window of the viewport; `polar` maps it to (θ, r)
    polar::Union{Nothing, PolarFrame}       # PolarAxis only: the resolved `Makie.Polar` fields JS needs to invert
end
AxisTransform(id, xlims, ylims, xscale, yscale, viewport, xreversed, yreversed, xcats, ycats, valueaxis, is3d, ispolar) =
    AxisTransform(id, xlims, ylims, xscale, yscale, viewport, xreversed, yreversed, xcats, ycats, valueaxis, is3d, ispolar, nothing)

"""
    InteractionContext

Backend-produced bridge handed to every interactable. `project` is the backend's
data→image-px closure (so projection is not hard-wired to Makie). `transforms` are
serialized to JS; `ids` maps an axis object to its transform id. `marker_stroke` is the share
of a scatter marker's `strokewidth` drawn outside the marker: `0.5` when the backend centers
the outline on the marker's edge (CairoMakie, the default), `1.0` when it paints the whole
outline outside (WGLMakie).
"""
struct InteractionContext
    project::Function                       # (ax, point) -> Point2f, image px
    transforms::Dict{Symbol, AxisTransform}
    ids::IdDict{Any, Symbol}
    width::Int
    height::Int
    scaling::Float64
    display_scale::Float64                  # CSS px per image px on screen (image is rendered above display res)
    marker_stroke::Float64
end
InteractionContext(project, transforms, ids, width, height, scaling, display_scale) =
    InteractionContext(project, transforms, ids, width, height, scaling, display_scale, 0.5)

"""
    data_to_image_px(ctx::InteractionContext, ax, p) -> Point2f

Project a data-space point `p` (a 2- or 3-element point/tuple) on axis `ax` to image-pixel
coordinates (top-left origin, y-down), applying `ax`'s transform and camera the same way
Makie renders it. The one coordinate primitive every [`AbstractInteractable`](@ref)'s
`hitlayers` method calls — never re-derive projection by hand. `ax` must be a `Makie.Axis`,
`Makie.Axis3`, or `Makie.PolarAxis` that is part of the figure `masque` rendered (this function
does not itself validate that — a mismatched `ax` silently projects against the wrong scene;
use `axis_id(ctx, ax)` if you need the fail-loud registration check).

# Examples
```julia
q = data_to_image_px(ctx, ax, (1.0, 2.0))   # -> Point2f in image px
```
"""
data_to_image_px(ctx::InteractionContext, ax, p) = ctx.project(ax, p)
# No fallback to a default axis: a silent fallback here once made a missing Colorbar
# transform render a plausible-but-wrong 2-D readout instead of failing to build.
axis_id(ctx::InteractionContext, ax) =
    get(ctx.ids, ax) do
    throw(
        ArgumentError(
            "Masque: $(typeof(ax)) is not registered in this backend's InteractionContext — " *
                "no axis/colorbar/legend transform was built for it. Interactables must be keyed to a " *
                "Makie.Axis, Colorbar, or Legend that is part of the rendered figure. (If it IS part of " *
                "the figure, this is a backend context() bug — please report it.)"
        )
    )
end

# every backend extension implements methods for these (bodies stay empty here)
function render end
function context end
function _ppu end         # (backend, fig, max_width) -> default px_per_unit when `masque`'s is `nothing`
# (backend, result, manifest, display_css, fig, interactables, ppu, max_width) -> the @bind widget
function make_widget end

# An axis-like block Masque builds no transform for (`LScene` today) would otherwise be
# silently dropped, and interactables would project against the wrong axis. Every backend's
# `context` calls this first, so a figure is refused the same way wherever it renders (#172).
const _SUPPORTED_AXES = Union{Makie.Axis, Makie.Axis3, Makie.PolarAxis}

function _reject_unsupported_axes(fig)
    unsupported = unique(typeof.(c for c in fig.content if c isa Makie.AbstractAxis && !(c isa _SUPPORTED_AXES)))
    isempty(unsupported) && return nothing
    throw(
        ArgumentError(
            "Masque supports `Makie.Axis`, `Makie.Axis3`, and `Makie.PolarAxis`; found unsupported " *
                "$(join(unsupported, ", ")). This is Masque's own scoping guard, not a backend limit: " *
                "`LScene` is not supported on any backend. For interactive 3D, use `Axis3`.",
        ),
    )
end

# `Makie.project` expects post-transform_func coordinates; transform in Float64 first —
# an early Float32 cast can overflow (e.g. log10(1e39)) or lose precision. DomainError
# (e.g. log10 of a negative) degrades to a NaN point rather than throwing; `_q` in
# interactables.jl passes non-finite coordinates through unchanged. Points widen to
# Point3 so this same closure also projects 3D scenes (Axis3's transform_func is
# `identity`; `Makie.project` applies the 3D camera itself).
function _project_closure(scaling, out_h)
    return function (ax, p)
        tp = try
            _apply_transform(
                _transform_func(ax.scene),
                Makie.Point3(Float64(p[1]), Float64(p[2]), length(p) >= 3 ? Float64(p[3]) : 0.0)
            )
        catch e
            e isa DomainError || rethrow()
            Point3f(NaN32, NaN32, NaN32)
        end
        q = _project_px(ax.scene, tp)
        o = _scene_viewport(ax).origin
        return Point2f((q[1] + o[1]) * scaling, out_h - (q[2] + o[2]) * scaling)  # flip to image coords
    end
end

# `_project_closure` for many points of one 3D axis at once, plus each point's clip-space
# depth (smaller is nearer the camera). One matrix product per point instead of a closure
# call, for layers that ship thousands of vertices (a surface). Same transform, same pixel
# arithmetic; `ctx.height` is the `out_h` the closure was built with.
function _project_depth(ctx::InteractionContext, ax, pts::AbstractVector)
    tf = _transform_func(ax.scene)
    M = _data_to_clip(ax.scene)
    vp = _scene_viewport(ax)
    o, w = vp.origin, vp.widths
    s, out_h = ctx.scaling, ctx.height
    n = length(pts)
    xs = Vector{Float64}(undef, n); ys = similar(xs); ds = similar(xs)
    for k in 1:n
        p = pts[k]
        tp = try
            _apply_transform(tf, Makie.Point3(Float64(p[1]), Float64(p[2]), Float64(p[3])))
        catch e
            e isa DomainError || rethrow()
            Makie.Point3(NaN, NaN, NaN)
        end
        c = M * Makie.Vec4d(tp[1], tp[2], tp[3], 1)
        nx, ny = c[1] / c[4], c[2] / c[4]
        xs[k] = ((nx + 1) / 2 * w[1] + o[1]) * s
        ys[k] = out_h - ((ny + 1) / 2 * w[2] + o[2]) * s
        ds[k] = c[3] / c[4]
    end
    return xs, ys, ds
end
# `(lo, hi)` of an Axis3's limits, widened by Makie's own clip-plane nudge, or `nothing` when
# the axis does not clip.
function _axis3_clipbox(ax)
    hasproperty(ax, :clip) && ax.clip[] === true || return nothing
    fl = _finallimits(ax)
    lo = Float64.(Tuple(fl.origin)); w = Float64.(Tuple(fl.widths))
    tol = 1.0e-5 .* abs.(w)
    return (lo .- tol, lo .+ w .+ tol)
end
function _in_clipbox((lo, hi), p)
    z = length(p) >= 3 ? p[3] : 0.0
    for (v, a, b) in zip((p[1], p[2], z), lo, hi)
        v isa Real || continue
        x = Float64(v)
        isnan(x) && continue
        (a <= x <= b) || return false
    end
    return true
end
# The part of the data-space segment `a → b` inside the box, as `(t0, t1)` along it, or
# `nothing` when none of it is (Liang–Barsky against the six faces).
function _clip_segment((lo, hi), a, b)
    t0, t1 = 0.0, 1.0
    for k in 1:3
        d = Float64(b[k]) - Float64(a[k])
        for (p, q) in ((-d, Float64(a[k]) - lo[k]), (d, hi[k] - Float64(a[k])))
            if p == 0
                q < 0 && return nothing
            elseif p < 0
                r = q / p
                r > t1 && return nothing
                t0 = max(t0, r)
            else
                r = q / p
                r < t0 && return nothing
                t1 = min(t1, r)
            end
        end
    end
    return (t0, t1)
end

_scalesym(f) = f === identity ? :identity : Symbol(nameof(f))

# ordered category labels for a categorical dim conversion, else nothing
function _cats(conv)
    conv isa Makie.CategoricalConversion || return nothing
    isempty(conv.int_to_category) && return nothing
    return String[string(c) for (_, c) in sort(conv.int_to_category; by = first)]
end

function _axis_transform(id, ax, scaling, out_h)
    vp = _scene_viewport(ax); o = vp.origin; wv = vp.widths
    vpx = (o[1] * scaling, out_h - (o[2] + wv[2]) * scaling, wv[1] * scaling, wv[2] * scaling)
    fl = _finallimits(ax); fo = fl.origin; fw = fl.widths
    return AxisTransform(
        id,
        (fo[1], fo[1] + fw[1]), (fo[2], fo[2] + fw[2]),
        _scalesym(ax.xscale[]), _scalesym(ax.yscale[]),
        vpx, ax.xreversed[], ax.yreversed[],
        _cats(ax.dim1_conversion[]), _cats(ax.dim2_conversion[]), nothing, false, false
    )
end

# A screen pixel on a 3D axis is a ray, not a data point, so pixel→data inversion is
# undefined; lims here are placeholders and Axis/Threshold/ROI must fail loud in
# validate() on is3d rather than use them.
function _axis3_transform(id, ax, scaling, out_h)
    vp = _scene_viewport(ax); o = vp.origin; wv = vp.widths
    vpx = (o[1] * scaling, out_h - (o[2] + wv[2]) * scaling, wv[1] * scaling, wv[2] * scaling)
    return AxisTransform(
        id, (0.0, 1.0), (0.0, 1.0), :identity, :identity,
        vpx, false, false, nothing, nothing, nothing, true, false
    )
end

# The pixel inverts in two steps, the split Makie itself uses. First the linear map over `lims`,
# which are the Cartesian window of the scene viewport: its corners unprojected the way
# `mouseposition` / `Makie.to_world` does, so the letterbox and the tick inset come with it.
# Then the `PolarFrame` turns that Cartesian point into (θ, r). Identity scale, not reversed.
function _polar_transform(id, ax, scaling, out_h)
    vp = _scene_viewport(ax); o = vp.origin; wv = vp.widths
    vpx = (o[1] * scaling, out_h - (o[2] + wv[2]) * scaling, wv[1] * scaling, wv[2] * scaling)
    lo = Makie.to_world(ax.scene, Makie.Point2d(0, 0))
    hi = Makie.to_world(ax.scene, Makie.Point2d(wv[1], wv[2]))
    return AxisTransform(
        id, (Float64(lo[1]), Float64(hi[1])), (Float64(lo[2]), Float64(hi[2])), :identity, :identity,
        vpx, false, false, nothing, nothing, nothing, false, true, _polar_frame(ax)
    )
end

function _polar_frame(ax)
    t1, t2 = ax.target_thetalims[]
    lo = abs(t2 - t1) < 2π ? 0.5 * (t1 + t2) - π : 0.0
    return PolarFrame(
        ax.theta_as_x[], Int(ax.direction[]), Float64(ax.target_theta_0[]),
        Float64(ax.target_r0[]), (lo, lo + 2π)
    )
end

# The value axis carries cb.limits/scale over the colorbar's pixel bbox; the other
# axis is degenerate and never read.
function _colorbar_transform(id, cb, scaling, out_h)
    bb = _colorbar_bbox(cb)
    o = bb.origin; wv = bb.widths
    vpx = (o[1] * scaling, out_h - (o[2] + wv[2]) * scaling, wv[1] * scaling, wv[2] * scaling)
    lims = cb.limits[]
    isnothing(lims) && error("Colorbar introspection: nothing limits (Makie internals changed?)")
    lo, hi = Float64(lims[1]), Float64(lims[2])
    sc = _scalesym(cb.scale[])
    vertical = cb.vertical[]
    if vertical
        return AxisTransform(id, (0.0, 1.0), (lo, hi), :identity, sc, vpx, false, false, nothing, nothing, :y, false, false)
    else
        return AxisTransform(id, (lo, hi), (0.0, 1.0), sc, :identity, vpx, false, false, nothing, nothing, :x, false, false)
    end
end

# A Legend has no data-space readout — lims are degenerate placeholders (like Axis3
# above), never inverted client-side. Only the pixel viewport (the legend's whole bbox) is real.
function _legend_transform(id, leg, scaling, out_h)
    bb = _legend_bbox(leg)
    o = bb.origin; wv = bb.widths
    vpx = (o[1] * scaling, out_h - (o[2] + wv[2]) * scaling, wv[1] * scaling, wv[2] * scaling)
    return AxisTransform(
        id, (0.0, 1.0), (0.0, 1.0), :identity, :identity,
        vpx, false, false, nothing, nothing, nothing, false, false
    )
end
