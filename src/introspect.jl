# ax is passed explicitly: a plot holds no back-reference to its Axis, and `axis_id`
# keys the transform by the Axis object.

const _GB = Makie.GeometryBasics

_conv(p) = _converted(p)

# markersize is a :pixel-space diameter (Makie's default markerspace); radius = ms/2 for markers
# whose drawn extent fills that square. Fails loud on non-:pixel markerspace (e.g. :data), where
# ms/2 would be the wrong unit.
function _marker_radius(p)
    p.markerspace[] === :pixel || error(
        "PointInteractable: scatter has markerspace=$(repr(p.markerspace[])); radius can only be " *
            "derived from markersize for :pixel markers (the default). Pass radius=… explicitly."
    )
    ms = p.markersize[]
    f = _marker_extent_factor(p.marker[])
    # A per-point markersize gives a per-point radius, so a small marker does not take the
    # largest one's ring (graphplot's `node_size`, `scatter(…; markersize = [...])`).
    _per_point(ms) || return _ms_extent(ms) * f / 2
    return Float64[_ms_extent(m) * f / 2 for m in ms]
end

# One diameter for a markersize element: a number, or a `Vec2f` (width, height), which is what
# Makie converts a per-point vector of numbers to. A non-square marker takes its larger side, so
# the click target never undershoots it.
_ms_extent(m::Real) = Float64(m)
_ms_extent(m) = Float64(maximum(m))
# A `Vec2f` is itself an `AbstractVector`: one size, not one per point.
_per_point(ms) = ms isa AbstractVector && !(ms isa Makie.VecTypes)
_ms_diameter(ms) = !_per_point(ms) ? _ms_extent(ms) : isempty(ms) ? 0.0 : maximum(_ms_extent, ms)

# Drawn extent of one marker as a fraction of markersize (1.0 = fills the markersize square, e.g.
# Makie's default :circle draws a BezierPath disc scaled to a 0.705·markersize bounding box, not
# markersize itself — see Makie.default_marker_map()/marker_scale_factor). `p.marker[]` is already
# converted by the time a Scatter plot holds it (`to_spritemarker` resolves a Symbol like :circle
# to its BezierPath at construction), so the Symbol branch below is a defensive fallback, not the
# normal path. A `GeometryBasics` `Circle`/`Rect` marker — TYPE or instance — always draws at
# exactly markersize: Makie never rescales by the instance's own radius/widths (the generic
# `rescale_marker(atlas, char, font, markersize) = markersize` fallback, commented "Rect / Circle
# dont need no rescaling", is what a Circle/Rect instance hits; `to_spritemarker` passes both forms
# through unchanged), so their factor is 1.0 — same fallback as markers with no readable bbox (a
# `Char` glyph, an image, a per-element vector of markers) — those still draw within markersize,
# just not filling it, so treating them as radius=ms/2 stays a safe (if loose) click-target bound,
# never an undershoot.
function _marker_extent_factor(marker)
    shape = if marker isa Symbol
        get(Makie.default_marker_map(), marker, nothing)
    elseif marker isa Makie.BezierPath
        marker
    else
        nothing
    end
    # Makie.bbox is internal (not exported API, Makie/src/bezier.jl) — Project.toml pins Makie to
    # the 0.24 minor series; a compat bump should re-check this still resolves.
    shape !== nothing && return Float64(maximum(Makie.widths(Makie.bbox(shape))))
    return 1.0
end

# Theme `markersize` (a scalar, or Makie's per-point vector) as one diameter. The points
# constructor's fallback when no single scatter matches — default `:circle`, not a fixed 9.
function _theme_markersize()
    ms = Makie.theme(:markersize)
    return _ms_diameter(ms isa Makie.Observable ? ms[] : ms)
end
_default_circle_radius() = _theme_markersize() * _marker_extent_factor(:circle) / 2

# Every Scatter under `ax`, including a recipe's child (scatterlines!/stem! keep the marker
# on a child plot, not the recipe object `ax.scene.plots` lists).
function _scatters_on(ax)
    found = Makie.Scatter[]
    seen = IdDict{Any, Nothing}()
    function walk(p)
        haskey(seen, p) && return nothing
        seen[p] = nothing
        p isa Makie.Scatter && push!(found, p)
        for c in _child_plots(p)
            walk(c)
        end
        return nothing
    end
    scene = ax isa Makie.Scene ? ax : ax.scene
    for p in _child_plots(scene)
        walk(p)
    end
    return found
end

# Same length and the same positions, in order. Compared as Point3f (z = 0 for 2D) so a
# tuple, a Point2, and the scatter's converted vector agree after one conversion.
function _scatter_matches(p::Makie.Scatter, pts::Vector{Point3f})
    raw = _converted(p)
    (raw isa Tuple && length(raw) >= 1) || return false
    pos = raw[1]
    (pos isa AbstractVector && length(pos) == length(pts)) || return false
    for (a, b) in zip(pos, pts)
        _pt3(a) == b || return false
    end
    return true
end

# Radius for `PointInteractable(ax, points)` when `radius` is omitted. One matching scatter
# takes `_marker_radius` (drawn extent; unreadable markers stay `markersize / 2`; a non-:pixel
# markerspace errors, same as passing that scatter). None, or more than one, assumes the
# default `:circle` — guessing which of two scatters to hug would halo one of them.
function _point_radius(ax, pts::Vector{Point3f})
    matches = [p for p in _scatters_on(ax) if _scatter_matches(p, pts)]
    if length(matches) == 1
        return _marker_radius(only(matches))
    end
    if length(matches) > 1
        @warn "PointInteractable: $(length(matches)) scatters on this axis share these " *
            "positions, so the highlight radius is ambiguous; using the default :circle. " *
            "Pass radius= or PointInteractable(ax, scatter)."
    end
    return _default_circle_radius()
end
# Tooltip accent colour for a Scatter's points (HitLayer's `colors` field): a shared palette of
# CSS strings + one 1-based index per point, or a single CSS string when every point is the same
# colour. `nothing` (no accent) for anything not shaped one of those two ways — not an error,
# since an accent is a nice-to-have, not something a plot must support.
const _COLOR_PALETTE_SIZE = 32
function _resolve_scatter_colors(p)
    c = p.color[]
    # A bare Real (not a Vector) is still colormap-driven in Makie — `color = 2` maps the single
    # value 2 through `colormap` the same as any element of a numeric vector would — not a
    # colorant; `_css_color(2.0f0)` would misread it as a raw grayscale channel value (`Makie.
    # to_color` clamps it to white, since 2 > 1) instead of resolving it through the colormap.
    # Every point gets the identical resolved colour here, so collapse to a uniform string
    # rather than the palette+index shape (whose `index` must have one entry per point).
    if c isa Real
        r = _colormap_palette_index(p, [c])
        return r === nothing ? nothing : r.palette[only(r.index)]
    end
    c isa AbstractVector || return _css_color(c)
    if eltype(c) <: Real
        return _colormap_palette_index(p, c)
    end
    return _categorical_palette_index(c)
end

# c's elements are already resolved Colorants (Makie converts non-numeric `color=` up front) —
# de-duplicate into a palette so a small number of distinct colours (the common categorical case)
# stays compact on the wire, same shape as the colormap branch below. A Dict lookup (not
# `findfirst` per element) keeps this O(n) — a large explicit per-point colour vector is exactly
# the case this is meant to compress, not blow up quadratically on.
function _categorical_palette_index(c)
    palette = String[]
    seen = Dict{String, Int}()
    index = Vector{Int}(undef, length(c))
    for (k, v) in enumerate(c)
        s = _css_color(v)
        idx = get(seen, s, nothing)
        if idx === nothing
            push!(palette, s)
            idx = length(palette)
            seen[s] = idx
        end
        index[k] = idx
    end
    return (; palette, index)
end

# values are the RAW numbers (colormap not yet applied to them); resolve via the same
# ComputePipeline nodes Makie's own colour lookup reads (`scaled_color`/`scaled_colorrange`,
# post-`colorscale`; `raw_colormap`, the resolved colour ramp) — `Makie.numbers_to_colors`
# itself takes a mid-render "primitive" dict a live plot doesn't have, not a plot object.
# `raw_colormap` is downsampled to `_COLOR_PALETTE_SIZE` stops: a 3px accent border doesn't need
# the full 256-entry ramp, and a smaller palette keeps the manifest small (see perf-findings.md).
function _colormap_palette_index(p, values)
    cmap = _raw_colormap(p)
    lo, hi = Float64.(_scaled_colorrange(p))
    scaled = _scaled_color(p)
    length(scaled) == length(values) || return nothing
    isfinite(lo) && isfinite(hi) || return nothing   # e.g. every value NaN — nothing to derive
    # Evenly spaced indices spanning [1, length(cmap)] inclusive — a fixed stride (e.g.
    # `1:8:256`) drops the ramp's last stop whenever length(cmap) isn't an exact multiple of
    # _COLOR_PALETTE_SIZE, so the colorrange max's accent would visibly differ from the
    # colour the marker is actually drawn in.
    n_stops = min(_COLOR_PALETTE_SIZE, length(cmap))
    stop_idx = n_stops == 1 ? [1] : round.(Int, range(1, length(cmap); length = n_stops))
    palette = [_css_color(cmap[i]) for i in stop_idx]
    n = length(palette)
    span = hi - lo
    # A non-finite element (NaN/Inf — Makie renders it via `nan_color`) can't map into the
    # palette; round(Int, NaN) throws before clamp can help, so check first. An element Makie
    # has clamped to something merely huge (not literally Inf, e.g. a saturated Float32) still
    # overflows Int64 in round(Int, huge*n) — clamp the FLOAT index into [0, n-1] before
    # rounding, not just after, so no magnitude of finite input can escape. Falls back to
    # palette[1] rather than erroring — the accent is a nice-to-have, not a rendering guarantee.
    offset = if span == 0
        fill(0, length(scaled))
    else
        [
            let idxf = (Float64(v) - lo) / span * (n - 1)
                isfinite(idxf) ? round(Int, clamp(idxf, 0.0, Float64(n - 1))) : 0
            end
                for v in scaled
        ]
    end
    return (; palette, index = offset .+ 1)
end

function PointInteractable(ax, p::Makie.Scatter; id = :scatter, payloads = nothing, radius = nothing, colors = _resolve_scatter_colors(p), tooltip = nothing, label = nothing)
    pts = _conv(p)[1]
    r = radius === nothing ? _marker_radius(p) : radius
    kw = (; id, radius = r, colors, tooltip, label)
    i = payloads === nothing ?
        PointInteractable(ax, pts; kw...) :
        PointInteractable(ax, pts; kw..., payloads)
    p.markerspace[] === :data && return _shift_data_markers(ax, i, p.marker_offset[])
    return _with_offset(i, _marker_offset(p, length(i.points)))
end

# `marker_offset` moves each marker from its point (Makie converts it to a `Vec3f`, one for
# every point or one per point). In `:pixel` markerspace it is px, kept as the circle's offset.
function _marker_offset(p, n)
    p.markerspace[] === :pixel || return Makie.Vec2f(0, 0)
    mo = p.marker_offset[]
    mo isa Makie.VecTypes && return Makie.Vec2f(mo[1], mo[2])
    return Makie.Vec2f[Makie.Vec2f(m[1], m[2]) for m in _marker_offset_vec(mo, n)]
end
# In `:data` markerspace the offset is in the axis's transformed units, added after the scale:
# the marker is drawn at `f⁻¹(f(x) + offset)`. Payloads keep the plot's own values.
function _shift_data_markers(ax, i::PointInteractable, mo)
    offs = _marker_offset_vec(mo, length(i.points))
    all(iszero, offs) && return i
    tf = _transform_func(ax.scene)
    finv = Makie.inverse_transform(tf)
    if _no_inverse(finv)
        _warn_no_inverse(i.id)
        return i
    end
    pts = map(eachindex(i.points)) do k
        x = i.points[k]
        t = _apply_transform(tf, Makie.Point3d(x[1], x[2], x[3])) .+ offs[k]
        d = _apply_transform(finv, Makie.Point3d(t...))
        Point3f(d[1], d[2], ax isa Makie.Axis3 ? d[3] : x[3])
    end
    return PointInteractable(
        i.ax, pts, i.id, i.payloads, i.radius, i.radius3d, i.tooltip, i.label, i.colors, i.offset,
    )
end
function _marker_offset_vec(mo, n)
    mo isa Makie.VecTypes && return fill(Makie.Vec3d(_pt3(mo)...), n)
    length(mo) == n || error("PointInteractable: $(length(mo)) marker offsets for $n points (Makie internals changed?)")
    return [Makie.Vec3d(_pt3(m)...) for m in mo]
end
# Makie returns `nothing`, or a tuple holding `nothing` for a per-axis transform, when a
# transform has no inverse.
_no_inverse(finv) = finv === nothing || (finv isa Tuple && any(isnothing, finv))
function _warn_no_inverse(id)
    @warn "masque: layer :$(id) stays at its unmoved positions; the axis transform has no " *
        "inverse, so the drawn positions can't be mapped back to data" maxlog = 16
    return nothing
end
_with_offset(i::PointInteractable, o) = PointInteractable(
    i.ax, i.points, i.id, i.payloads, i.radius, i.radius3d, i.tooltip, i.label, i.colors, o,
)

# markersize is DATA-space (no markerspace attribute), so pixel radius is camera/depth-dependent;
# normalize to per-element Vec3f half-extents (radius3d) and let hitlayers project them. The
# axis-aligned half-extent approximation can underestimate the true silhouette (worst case ~29%,
# at adversarial azimuth/elevation); pass radius=/radius3d= explicitly if it's too coarse.
function _meshscatter_extents(ms, n)
    ms isa Makie.VecTypes{3} && return fill(Makie.Vec3f(ms...), n)
    ms isa Real && return fill(Makie.Vec3f(ms, ms, ms), n)
    if ms isa AbstractVector && length(ms) == n
        return Makie.Vec3f[v isa Real ? Makie.Vec3f(v, v, v) : Makie.Vec3f(v...) for v in ms]
    end
    return error(
        "PointInteractable: can't derive hit radii from meshscatter markersize " *
            "$(typeof(ms)) for $(n) elements; pass radius= (pixels) or radius3d= explicitly."
    )
end
function PointInteractable(ax, p::Makie.MeshScatter; id = :meshscatter, payloads = nothing, radius = nothing, radius3d = nothing, tooltip = nothing, label = nothing)
    pts = _conv(p)[1]
    r3 = radius !== nothing || radius3d !== nothing ? radius3d : _meshscatter_extents(p.markersize[], length(pts))
    kw = (; id, radius = something(radius, 9), radius3d = r3, tooltip, label)
    return payloads === nothing ?
        PointInteractable(ax, pts; kw...) :
        PointInteractable(ax, pts; kw..., payloads)
end

SegmentInteractable(ax, p::Makie.Lines; id = :lines, payloads = nothing, tol = 6, tooltip = nothing, label = nothing) =
    SegmentInteractable(ax, _conv(p)[1]; mode = :polyline, unit = :line, id, payloads, tol, tooltip, label)
SegmentInteractable(ax, p::Makie.LineSegments; id = :segments, payloads = nothing, tol = 6, tooltip = nothing, label = nothing) =
    SegmentInteractable(ax, _conv(p)[1]; mode = :pairs, id, payloads, tol, tooltip, label)

# The rendered edges live in the child LineSegments' converted (DATA space), including
# mesh-triangulation diagonals a grid-edge reconstruction would miss.
SegmentInteractable(ax, p::Makie.Wireframe; id = :wireframe, payloads = nothing, tol = 6, tooltip = nothing, label = nothing) =
    SegmentInteractable(ax, _conv(_childof(p, Makie.LineSegments))[1]; mode = :pairs, id, payloads, tol, tooltip, label)

_bcast(v, k) = length(v) == 1 ? v[1] : v[k]

# Raw pos→pos+dir is wrong: arrows3d autoscales and renders via MeshScatter children in a
# normalized, anisotropically-scaled space. Read the processed startpoints/endpoints instead
# (already post-align/lengthscale/normalize, in DATA coords).
function SegmentInteractable(ax, p::Makie.Arrows3D; id = :arrows3d, payloads = nothing, tol = 6, tooltip = nothing, label = nothing)
    starts, ends_ = p.startpoints[], p.endpoints[]
    length(starts) == length(ends_) || error(
        "Arrows3D introspection: startpoints/endpoints length mismatch ($(length(starts)) vs $(length(ends_)))"
    )
    verts = Makie.Point3f[]
    sizehint!(verts, 2 * length(starts))
    for (a, b) in zip(starts, ends_)
        push!(verts, Makie.Point3f(a...), Makie.Point3f(b...))
    end
    if payloads === nothing
        # Makie broadcasts a single point or direction over every arrow, so either can have
        # length 1 while startpoints has one entry per arrow.
        pts, dirs = p.points[], p.directions[]
        for (name, v) in (("points", pts), ("directions", dirs))
            length(v) in (1, length(starts)) || error(
                "Arrows3D introspection: $name/startpoints length mismatch ($(length(v)) vs $(length(starts)))"
            )
        end
        payloads = [
            let pt = _bcast(pts, k), d = _bcast(dirs, k)
                (;
                    index = k,
                    x = Float64(pt[1]), y = Float64(pt[2]), z = Float64(pt[3]),
                    u = Float64(d[1]), v = Float64(d[2]), w = Float64(d[3]),
                )
            end
                for k in eachindex(starts)
        ]
    end
    return SegmentInteractable(ax, verts; mode = :pairs, id, payloads, tol, tooltip, label)
end

# Makie converts cell centers to an edge vector (length n+1); the coordinate-free form gives
# `EndPoints` (length 2), expanded here to n+1 uniform edges.
_edges(e, n) = length(e) == n + 1 ? collect(Float64, e) :
    collect(range(Float64(e[1]), Float64(e[end]); length = n + 1))
function GridInteractable(ax, p::Union{Makie.Heatmap, Makie.Image}; id = :cells, tooltip = nothing, label = nothing)
    xr, yr, vals = _conv(p)
    ncols, nrows = size(vals)
    return GridInteractable(ax, _edges(xr, ncols), _edges(yr, nrows), vals; id, tooltip, label)
end
function RectInteractable(ax, p::Union{Makie.Heatmap, Makie.Image}; kwargs...)
    Base.depwarn(
        "`RectInteractable(ax, p)` for a heatmap or image is deprecated; use `GridInteractable(ax, p)`. " *
            "Removed in 0.3.",
        :RectInteractable,
    )
    return GridInteractable(ax, p; kwargs...)
end

# The child Poly carries the final laid-out rectangles (dodge/stack/automatic-width applied);
# read those instead of replaying Makie's bar solver.
function _bar_rects(p)
    for c in _child_plots(p)
        cv = _converted(c)
        if cv isa Tuple && !isempty(cv) && cv[1] isa AbstractVector && eltype(cv[1]) <: _GB.HyperRectangle
            return [
                (r.origin[1] + r.widths[1] / 2, r.origin[2] + r.widths[2] / 2, r.widths[1], r.widths[2])
                    for r in cv[1]
            ]
        end
    end
    error("BarPlot introspection: no laid-out rectangles found in child plots (Makie internals changed?)")
end
# Value-axis extent is keyed by bar `direction` (:y default runs along y, :x along x).
function _bar_payloads(rects, direction)
    vert = direction === :y
    return Any[
        let (cx, cy, w, h) = r
            lo, hi = vert ? (cy - h / 2, cy + h / 2) : (cx - w / 2, cx + w / 2)
            (; low = Float64(lo), high = Float64(hi), value = Float64(hi - lo))
        end
            for r in rects
    ]
end
function RectInteractable(ax, p::Makie.BarPlot; id = :bars, payloads = nothing, tooltip = nothing, label = nothing)
    rs = _bar_rects(p)
    pl = payloads === nothing ? _bar_payloads(rs, p.direction[]) : payloads
    return RectInteractable(ax, rs; id, payloads = pl, tooltip, label)
end

# One element per mesh Makie draws, which is also what a per-element `color` vector indexes
# (`Makie.poly_convert`): a vector gives one element per entry, and a lone `MultiPolygon`
# gives one per polygon. A `Polygon` keeps its interiors as holes. A `MultiPolygon` entry is
# one element whose rings after the first ride along as holes; the even-odd hit-test fills
# disjoint pieces and leaves their interiors out. `Rect`, `Circle`, and other primitives are
# sampled by `coordinates`, the outline Makie tessellates. A lone mesh keeps one element per
# triangle. A mesh in a vector is one element whose rings are its faces: `coordinates` would
# be the vertex buffer, which is not an outline, and the even-odd test over faces that do
# not overlap is their union.
_poly_point(x) = x isa _GB.Point || x isa Makie.VecTypes || x isa Tuple
function _poly_element(x)
    x isa AbstractVector && return (collect(x), Vector{Any}[])
    if x isa _GB.AbstractMesh
        faces = [collect(t) for t in x]
        isempty(faces) && return (Any[], Vector{Any}[])
        return (first(faces), faces[2:end])
    end
    if x isa _GB.Polygon
        return (_GB.coordinates(x.exterior), [_GB.coordinates(h) for h in x.interiors])
    end
    if x isa _GB.MultiPolygon
        parts = [_poly_element(q) for q in x.polygons]
        isempty(parts) && return (Any[], Vector{Any}[])
        others = Any[]
        for (k, (ext, hs)) in enumerate(parts)
            k == 1 || push!(others, ext)
            append!(others, hs)
        end
        return (first(parts)[1], others)
    end
    return (_GB.coordinates(x), Vector{Any}[])
end
function _poly_elements(g)
    g isa _GB.AbstractMesh && return [(collect(t), Vector{Any}[]) for t in g]
    (g isa AbstractVector && (isempty(g) || _poly_point(first(g)))) && return [_poly_element(g)]
    g isa _GB.MultiPolygon && return [_poly_element(q) for q in g.polygons]
    g isa AbstractVector && return [_poly_element(x) for x in g]
    return [_poly_element(g)]
end
function PolygonInteractable(ax, p::Makie.Poly; id = :poly, payloads = nothing, tooltip = nothing, label = nothing)
    els = _poly_elements(_conv(p)[1])
    rings = [first(e) for e in els]
    holes = [last(e) for e in els]
    return PolygonInteractable(ax, rings; id, payloads, holes, tooltip, label)
end

# Ring = lower curve followed by the reversed upper curve, in data space. Open ring (last
# vertex ≠ first); the :polygons even-odd hit-test closes it implicitly.
_band_ring(lower, upper) = vcat(collect(lower), reverse(collect(upper)))
# direction=:y flips only the mesh; converted[] stays Point2(x, y), so swap to match the drawn band.
function PolygonInteractable(ax, p::Makie.Band; id = :band, payloads = nothing, tooltip = nothing, label = nothing)
    lower, upper = _conv(p)
    if p.direction[] === :y
        lower, upper = reverse.(lower), reverse.(upper)
    end
    return PolygonInteractable(ax, [_band_ring(lower, upper)]; id, payloads, tooltip, label)
end

# density! renders its KDE fill as a descendant Band; read that instead of recomputing the KDE.
function PolygonInteractable(ax, p::Makie.Density; id = :density, payloads = nothing, tooltip = nothing, label = nothing)
    b = _descendant(p, Makie.Band)
    lower, upper = _conv(b)
    return PolygonInteractable(ax, [_band_ring(lower, upper)]; id, payloads, tooltip, label)
end

# Voronoi cells are Polygons whose interior list is empty (Makie clips an exterior only).
# Contourf polygons carry holes and do not use this.
_poly_exterior_rings(polys) = [poly.exterior for poly in polys]

# Makie's `computed_levels` are the true band edges, but the child Poly's per-polygon `color`
# is the band MIDPOINT, not the lower edge — map each color to its nearest midpoint to recover
# (low, high).
function _contourf_payloads(p, poly)
    edges = sort(Float64.(_computed_levels(p)))
    length(edges) >= 2 || error("Contourf introspection: <2 computed level edges (Makie internals changed?)")
    mids = [(edges[k] + edges[k + 1]) / 2 for k in 1:(length(edges) - 1)]
    colors = Float64.(poly.color[])
    return Any[
        let k = argmin(abs.(mids .- c))
            (; low = edges[k], high = edges[k + 1])
        end
            for c in colors
    ]
end
function PolygonInteractable(ax, p::Makie.Contourf; id = :contourf, payloads = nothing, tooltip = nothing, label = nothing)
    poly = _childof(p, Makie.Poly)
    polys = _conv(poly)[1]
    rings = [piece.exterior for piece in polys]
    holes = [piece.interiors for piece in polys]
    pl = payloads === nothing ? _contourf_payloads(p, poly) : payloads
    return PolygonInteractable(ax, rings; id, payloads = pl, holes, tooltip, label)
end

# Payload x is read from Makie's converted category data (not ring geometry) to avoid Float32
# projection noise; each ring's geometry-center is used only to snap to the nearest category.
function _violin_payloads(p, rings)
    cats = sort(unique(Float64.(_conv(p)[1])))
    return Any[
        let xs = [Float64(pt[1]) for pt in ring]
            ctr = (minimum(xs) + maximum(xs)) / 2
            (; x = cats[argmin(abs.(cats .- ctr))])
        end
            for ring in rings
    ]
end
function PolygonInteractable(ax, p::Makie.Violin; id = :violin, payloads = nothing, tooltip = nothing, label = nothing)
    poly = _childof(p, Makie.Poly)
    rings = _conv(poly)[1]
    pl = payloads === nothing ? _violin_payloads(p, rings) : payloads
    return PolygonInteractable(ax, rings; id, payloads = pl, tooltip, label)
end

# Cells come back in tessellation order, not input-site order, so there's no cheap
# cell→generator mapping; default payload is (; index) only.
function PolygonInteractable(ax, p::Makie.Voronoiplot; id = :voronoiplot, payloads = nothing, tooltip = nothing, label = nothing)
    poly = _descendant(p, Makie.Poly)
    rings = _poly_exterior_rings(_conv(poly)[1])
    return PolygonInteractable(ax, rings; id, payloads, tooltip, label)
end

# Stats come from Makie's computed-stats node (converted is a 4-tuple centers/medians/q1s/q3s,
# the exact numbers Makie drew the box and median line from) — read them rather than
# recomputing or reading the median LineSegments.
function _boxplot_stats_node(p)
    cv = try
        _conv(p)
    catch e
        e isa InterruptException && rethrow()
        nothing
    end
    if cv isa Tuple && length(cv) == 4 && all(x -> x isa AbstractVector && eltype(x) <: Real, cv) &&
            length(cv[1]) == length(cv[2]) == length(cv[3]) == length(cv[4])
        return p
    end
    for c in _child_plots(p)
        r = try
            _boxplot_stats_node(c)
        catch e
            e isa InterruptException && rethrow()
            nothing
        end
        r !== nothing && return r
    end
    return error("BoxPlot introspection: computed-stats node (4-tuple of equal-length numeric vectors) not found (Makie internals changed?)")
end
function _boxplot_payloads(statscv)
    _centers, medians, q1s, q3s = statscv
    return Any[
        (; q1 = Float64(q1s[k]), median = Float64(medians[k]), q3 = Float64(q3s[k]))
            for k in eachindex(medians)
    ]
end
function _boxplot_interactable(ax, p; id = :boxplot, payloads = nothing, kw...)
    node = _boxplot_stats_node(p)
    boxpoly = _childof(node, Makie.Poly)
    geom = _conv(boxpoly)[1]
    pl = payloads === nothing ? _boxplot_payloads(_conv(node)) : payloads
    if eltype(geom) <: _GB.HyperRectangle
        rects = [(r.origin[1] + r.widths[1] / 2, r.origin[2] + r.widths[2] / 2, r.widths[1], r.widths[2]) for r in geom]
        return RectInteractable(ax, rects; id, payloads = pl, kw...)
    else
        return PolygonInteractable(ax, geom; id, payloads = pl, kw...)   # notched: Vector{Vector{Point}}
    end
end

_childof(p, T) = (
    for c in _child_plots(p)
        c isa T && return c
    end; error("$(typeof(p).name.name): no $T child plot found (Makie internals changed?)")
)

# Recursive (whole-subtree) search: some recipes nest the target plot below a wrapper child
# (Density wraps Band; Voronoiplot nests Poly), where _childof (direct children only) misses it.
_descendant_or_nothing(p, T) = p isa T ? p :
    (
        for c in _child_plots(p)
            r = _descendant_or_nothing(c, T)
            r !== nothing && return r
    end; nothing
    )
function _descendant(p, T)
    d = _descendant_or_nothing(p, T)
    d === nothing && error("$(typeof(p).name.name): no $T descendant found (Makie internals changed?)")
    return d
end

# The parent `converted` is the raw input points; the rendered staircase (the actual click
# target) lives in the child Lines as the pre-expanded step polyline.
SegmentInteractable(ax, p::Makie.Stairs; id = :stairs, payloads = nothing, tol = 6, tooltip = nothing, label = nothing) =
    SegmentInteractable(ax, _converted(_childof(p, Makie.Lines))[1]; mode = :polyline, unit = :line, id, payloads, tol, tooltip, label)

# Each child line (or a ScatterLines child's line, when markers are on) is one element.
# BezierPath curves aren't sampled here — a child that isn't Lines/ScatterLines fails loud.
function _series_line(child)
    child isa Makie.Lines && return child
    child isa Makie.ScatterLines && return _childof(child, Makie.Lines)
    return error(
        "Series introspection: expected a Lines or ScatterLines child, got $(typeof(child).name.name)",
    )
end
function _series_payloads(children)
    return Any[
        let lab = children[k].label[]
            lab isa AbstractString && !isempty(lab) ? (; index = k, label = String(lab)) : (; index = k)
        end
            for k in eachindex(children)
    ]
end
function SegmentInteractable(ax, p::Makie.Series; id = :series, payloads = nothing, tol = 6, tooltip = nothing, label = nothing)
    children = _child_plots(p)
    isempty(children) && error("Series introspection: no child lines (Makie internals changed?)")
    paths = [_conv(_series_line(c))[1] for c in children]
    pl = payloads === nothing ? _series_payloads(children) : payloads
    return _whole_lines(ax, paths, id, pl, tol, label; tooltip)
end

# Errorbars `converted` is Vec4 (x, y, low, high) with low/high RELATIVE offsets; Rangebars is
# Vec3 (val, low, high) ABSOLUTE.
function _errorbar_pairs(p)
    horiz = p.direction[] === :x
    vs = Point2f[]
    for v in _converted(p)[1]
        x, y, lo, hi = v[1], v[2], v[3], v[4]
        horiz ? (push!(vs, Point2f(x - lo, y)); push!(vs, Point2f(x + hi, y))) :
            (push!(vs, Point2f(x, y - lo)); push!(vs, Point2f(x, y + hi)))
    end
    return vs
end
function _rangebar_pairs(p)
    horiz = p.direction[] === :x
    vs = Point2f[]
    for v in _converted(p)[1]
        val, lo, hi = v[1], v[2], v[3]
        horiz ? (push!(vs, Point2f(lo, val)); push!(vs, Point2f(hi, val))) :
            (push!(vs, Point2f(val, lo)); push!(vs, Point2f(val, hi)))
    end
    return vs
end
SegmentInteractable(ax, p::Makie.Errorbars; id = :errorbars, payloads = nothing, tol = 6, tooltip = nothing, label = nothing) =
    SegmentInteractable(ax, _errorbar_pairs(p); mode = :pairs, id, payloads, tol, tooltip, label)
SegmentInteractable(ax, p::Makie.Rangebars; id = :rangebars, payloads = nothing, tol = 6, tooltip = nothing, label = nothing) =
    SegmentInteractable(ax, _rangebar_pairs(p); mode = :pairs, id, payloads, tol, tooltip, label)

# `xmin`/`xmax` (HLines) and `ymin`/`ymax` (VLines) are fractions of the axis in relative
# units. Default 0 and 1 is the full limits. Makie applies the fraction on the transformed
# limits (`axis_limits_transformed`); the hit segment stores the inverse-transformed
# data-space endpoints, and the position stays in data space, so projection matches the
# drawn line. `broadcast_foreach` is Makie's scalar-or-vector rule: a scalar position with
# a vector of fractions is one segment per fraction.
function _span_pairs(ax, p, ishoriz)
    dim = ishoriz ? 1 : 2
    tlo, thi = _span_transformed_interval(ax, dim)
    finv = _span_inverse(ax, dim)
    vals = _converted(p)[1]
    fr0, fr1 = ishoriz ? (p.xmin[], p.xmax[]) : (p.ymin[], p.ymax[])
    vs = Point2f[]
    Makie.broadcast_foreach(vals, fr0, fr1) do val, a, b
        s0 = _frac_to_data(finv, tlo, thi, a)
        s1 = _frac_to_data(finv, tlo, thi, b)
        ishoriz ? (push!(vs, Point2f(s0, val)); push!(vs, Point2f(s1, val))) :
            (push!(vs, Point2f(val, s0)); push!(vs, Point2f(val, s1)))
    end
    return vs
end

# Transformed min/max of one axis dimension, from `finallimits` through the scene scale.
function _span_transformed_interval(ax, dim)
    fl = _finallimits(ax)
    tf = _transform_func(ax.scene)
    o = fl.origin
    hi = o .+ fl.widths
    a = _apply_transform(tf, Makie.Point2d(Float64(o[1]), Float64(o[2])))
    b = _apply_transform(tf, Makie.Point2d(Float64(hi[1]), Float64(hi[2])))
    return min(Float64(a[dim]), Float64(b[dim])), max(Float64(a[dim]), Float64(b[dim]))
end

function _span_inverse(ax, dim)
    inv = Makie.inverse_transform(_transform_func(ax.scene))
    f = inv isa Tuple ? inv[dim] : inv
    f === nothing && error(
        "Masque: this axis scale has no inverse_transform, so an hlines/vlines span fraction " *
            "cannot be placed in data space"
    )
    return f
end

_frac_to_data(finv, tlo, thi, frac) = Float64(_apply_transform(finv, tlo + (thi - tlo) * Float64(frac)))

function SegmentInteractable(ax, p::Makie.HLines; id = :hlines, payloads = nothing, tol = 6, tooltip = nothing, label = nothing)
    vs = _span_pairs(ax, p, true)
    nseg = length(vs) ÷ 2
    pl = payloads === nothing ? Any[(; segment_index = k) for k in 1:nseg] : _check_payloads(payloads, nseg, "SegmentInteractable")
    return _segment_with_resolve(ax, vs, :pairs, id, pl, tol, _ax -> _span_pairs(_ax, p, true); tooltip, label)
end
function SegmentInteractable(ax, p::Makie.VLines; id = :vlines, payloads = nothing, tol = 6, tooltip = nothing, label = nothing)
    vs = _span_pairs(ax, p, false)
    nseg = length(vs) ÷ 2
    pl = payloads === nothing ? Any[(; segment_index = k) for k in 1:nseg] : _check_payloads(payloads, nseg, "SegmentInteractable")
    return _segment_with_resolve(ax, vs, :pairs, id, pl, tol, _ax -> _span_pairs(_ax, p, false); tooltip, label)
end

# Spy renders nonzeros as a child Scatter with markerspace=:data, so markersize IS the cell
# size in data units (PointInteractable would fail: :data markerspace can't derive a pixel
# radius).
function _spy_rects(p)
    sc = _childof(p, Makie.Scatter)
    ms = sc.markersize[]
    ms isa AbstractVector && length(ms) != 2 && error(
        "Spy introspection: expected a length-2 Vec cell size, got length-$(length(ms)) markersize " *
            "(per-marker sizes unsupported)."
    )
    w, h = ms isa AbstractVector ? (Float64(ms[1]), Float64(ms[2])) : (Float64(ms), Float64(ms))
    return [(Float64(c[1]), Float64(c[2]), w, h) for c in _converted(sc)[1]]
end
RectInteractable(ax, p::Makie.Spy; id = :spy, payloads = nothing, tooltip = nothing, label = nothing) =
    RectInteractable(ax, _spy_rects(p); id, payloads, tooltip, label)

# Hist bar height is the bin value: a count only for default normalization=:none; with
# :pdf/:density/:probability it's a density/fraction (hence `value`, not `count`).
function _hist_payloads(rects, direction)
    vert = direction === :y
    return Any[
        let (cx, cy, w, h) = r
            cnt = vert ? h : w
            lo, hi = vert ? (cx - w / 2, cx + w / 2) : (cy - h / 2, cy + h / 2)
            (; value = Float64(cnt), low = Float64(lo), high = Float64(hi))
        end
            for r in rects
    ]
end
function _waterfall_payloads(p, rects)
    deltas = _converted(p)[1]
    return Any[
        let (cx, cy, w, h) = rects[k]
            (; low = Float64(cy - h / 2), high = Float64(cy + h / 2), value = Float64(deltas[k][2]))
        end
            for k in eachindex(rects)
    ]
end
function RectInteractable(ax, p::Makie.Hist; id = :hist, payloads = nothing, tooltip = nothing, label = nothing)
    bar = _childof(p, Makie.BarPlot)
    rs = _bar_rects(bar)
    pl = payloads === nothing ? _hist_payloads(rs, bar.direction[]) : payloads
    return RectInteractable(ax, rs; id, payloads = pl, tooltip, label)
end
function RectInteractable(ax, p::Makie.Waterfall; id = :waterfall, payloads = nothing, tooltip = nothing, label = nothing)
    bar = _childof(p, Makie.BarPlot)
    rs = _bar_rects(bar)
    pl = payloads === nothing ? _waterfall_payloads(p, rs) : payloads
    return RectInteractable(ax, rs; id, payloads = pl, tooltip, label)
end

function _span_payloads(p)
    cv = _converted(p)                                   # HSpan (ymin,ymax) / VSpan (xmin,xmax)
    lo, hi = cv[1], cv[2]
    return Any[(; low = Float64(lo[k]), high = Float64(hi[k])) for k in eachindex(lo)]
end
# Do NOT reuse _bar_rects(p): it reads the child Poly's HyperRectangle, which can exceed the
# axis limits and bleed into a neighboring axis's viewport. `full` is the axis direction the
# span fills completely (:x for HSpan, :y for VSpan).
function _span_rects(ax, p, full::Symbol)
    cv = _converted(p)
    lo_vec, hi_vec = cv[1], cv[2]
    fl = _finallimits(ax)
    fa_lo = fl.origin[full === :x ? 1 : 2]
    fa_hi = fa_lo + fl.widths[full === :x ? 1 : 2]
    fa_ctr = (fa_lo + fa_hi) / 2
    fa_wid = fa_hi - fa_lo
    return [
        full === :x ?
            (fa_ctr, (Float64(lo_vec[k]) + Float64(hi_vec[k])) / 2, fa_wid, Float64(hi_vec[k]) - Float64(lo_vec[k])) :
            ((Float64(lo_vec[k]) + Float64(hi_vec[k])) / 2, fa_ctr, Float64(hi_vec[k]) - Float64(lo_vec[k]), fa_wid)
            for k in eachindex(lo_vec)
    ]
end
function RectInteractable(ax, p::Makie.HSpan; id = :hspan, payloads = nothing, tooltip = nothing, label = nothing)
    rs = _span_rects(ax, p, :x)
    pl = payloads === nothing ? _span_payloads(p) : _check_payloads(payloads, length(rs), "RectInteractable")
    return _rect_with_resolve(ax, rs, id, pl, true, _ax -> _span_rects(_ax, p, :x); tooltip, label)
end
function RectInteractable(ax, p::Makie.VSpan; id = :vspan, payloads = nothing, tooltip = nothing, label = nothing)
    rs = _span_rects(ax, p, :y)
    pl = payloads === nothing ? _span_payloads(p) : _check_payloads(payloads, length(rs), "RectInteractable")
    return _rect_with_resolve(ax, rs, id, pl, true, _ax -> _span_rects(_ax, p, :y); tooltip, label)
end

function _crossbar_payloads(p)
    _, midpts, lows, highs = _converted(p)
    return Any[(; midpoint = Float64(midpts[i]), low = Float64(lows[i]), high = Float64(highs[i])) for i in eachindex(midpts)]
end
function RectInteractable(ax, p::Makie.CrossBar; id = :crossbar, payloads = nothing, tooltip = nothing, label = nothing)
    rs = _bar_rects(p)
    pl = payloads === nothing ? _crossbar_payloads(p) : payloads
    return RectInteractable(ax, rs; id, payloads = pl, tooltip, label)
end

# Point layer keeps the base id; the line/segment layer gets a suffix so the two ids stay
# distinct in the manifest.
# `tooltip` and `label` apply to both parts. `payloads` would need one list per part, so a
# composite refuses it; build the two parts yourself for that.
function _composite_kwargs(p, kw)
    haskey(kw, :payloads) && throw(
        ArgumentError(
            "interactables($(Makie.plotkey(p))): `payloads` can't apply to both of this plot's layers; " *
                "build them with PointInteractable and SegmentInteractable instead",
        ),
    )
    return kw
end
function _stem_parts(ax, p, base; kw...)
    _composite_kwargs(p, kw)
    return AbstractInteractable[
        PointInteractable(ax, _childof(p, Makie.Scatter); id = base, kw...),
        SegmentInteractable(ax, _childof(p, Makie.LineSegments); id = Symbol(base, :_stems), kw...),
    ]
end
function _scatterlines_parts(ax, p, base; kw...)
    _composite_kwargs(p, kw)
    return AbstractInteractable[
        PointInteractable(ax, _childof(p, Makie.Scatter); id = base, kw...),
        SegmentInteractable(ax, _childof(p, Makie.Lines); id = Symbol(base, :_line), kw...),
    ]
end

# Only DATA-anchored text projects to a meaningful (x, y); other space= text is skipped loudly
# but specifically, not via the generic "unsupported plot type" path.
function _text_interactables(ax, p::Makie.Text, id; kw...)
    if p.space[] !== :data
        @warn "masque: skipping non-data-space text (space=$(p.space[]))" maxlog = 16
        return AbstractInteractable[]
    end
    return AbstractInteractable[TextInteractable(ax, p; id, kw...)]
end

# A plot drawn in another space (`space = :relative`, `:pixel`, `:clip`) is placed relative
# to the axis or the screen, not at its data coordinates, which is where Masque would put
# its hit target. Text has its own check above, which also covers `annotation!`.
function _nondata_space(p)
    hasproperty(p, :space) || return false
    sp = p.space[]
    return sp isa Symbol && sp !== :data
end

# the layer-id base for a plot, or nothing if Masque can't introspect it
function _plotbase(p)
    p isa Makie.Scatter && return :scatter
    p isa Makie.MeshScatter && return :meshscatter
    p isa Makie.Lines && return :lines
    p isa Makie.LineSegments && return :segments
    p isa Makie.Wireframe && return :wireframe
    p isa Makie.Arrows3D && return :arrows3d
    (p isa Makie.Heatmap || p isa Makie.Image) && return :cells
    p isa Makie.BarPlot && return :bars
    p isa Makie.Poly && return :poly
    p isa Makie.Stairs && return :stairs
    p isa Makie.Errorbars && return :errorbars
    p isa Makie.Rangebars && return :rangebars
    p isa Makie.HLines && return :hlines
    p isa Makie.VLines && return :vlines
    p isa Makie.Spy && return :spy
    p isa Makie.Hist && return :hist
    p isa Makie.Waterfall && return :waterfall
    p isa Makie.CrossBar && return :crossbar
    p isa Makie.HSpan && return :hspan
    p isa Makie.VSpan && return :vspan
    p isa Makie.Band && return :band
    p isa Makie.Density && return :density
    p isa Makie.Contourf && return :contourf
    p isa Makie.Violin && return :violin
    p isa Makie.Voronoiplot && return :voronoiplot
    p isa Makie.Stem && return :stem
    p isa Makie.ScatterLines && return :scatterlines
    p isa Makie.Series && return :series
    p isa Makie.BoxPlot && return :boxplot
    p isa Makie.Text && return :text
    p isa Makie.Annotation && return :annotation
    return nothing
end

# returns a Vector{AbstractInteractable} — usually one, two for composites (Stem, ScatterLines).
# A non-data-space plot gives none (with a warning), and the layers of a plot moved by its own
# transformation are moved with it.
function _construct(ax, p, id; kw...)
    if !(p isa Makie.Text || p isa Makie.Annotation) && _nondata_space(p)
        @warn "masque: skipping $(Makie.plotkey(p)) drawn in space = :$(p.space[]); only " *
            "data-space plots get hover and click targets" maxlog = 16
        return AbstractInteractable[]
    end
    built = _construct_unplaced(ax, p, id; kw...)
    f = _placement(ax, p)
    f === nothing && return built
    return AbstractInteractable[i for i in (_place(i, f) for i in built) if i !== nothing]
end
function _construct_unplaced(ax, p, id; kw...)
    p isa Makie.Scatter && return [PointInteractable(ax, p; id, kw...)]
    p isa Makie.MeshScatter && return [PointInteractable(ax, p; id, kw...)]
    (p isa Makie.Lines || p isa Makie.LineSegments || p isa Makie.Wireframe || p isa Makie.Arrows3D) &&
        return [SegmentInteractable(ax, p; id, kw...)]
    (
        p isa Makie.Stairs || p isa Makie.Errorbars || p isa Makie.Rangebars ||
            p isa Makie.HLines || p isa Makie.VLines
    ) && return [SegmentInteractable(ax, p; id, kw...)]
    (p isa Makie.Heatmap || p isa Makie.Image) && return [GridInteractable(ax, p; id, kw...)]
    (p isa Makie.BarPlot || p isa Makie.Spy) && return [RectInteractable(ax, p; id, kw...)]
    (p isa Makie.Hist || p isa Makie.Waterfall || p isa Makie.CrossBar) && return [RectInteractable(ax, p; id, kw...)]
    (p isa Makie.HSpan || p isa Makie.VSpan) && return [RectInteractable(ax, p; id, kw...)]
    p isa Makie.Band && return [PolygonInteractable(ax, p; id, kw...)]
    p isa Makie.Density && return [PolygonInteractable(ax, p; id, kw...)]
    p isa Makie.Poly && return [PolygonInteractable(ax, p; id, kw...)]
    p isa Makie.Contourf && return [PolygonInteractable(ax, p; id, kw...)]
    p isa Makie.Violin && return [PolygonInteractable(ax, p; id, kw...)]
    p isa Makie.Voronoiplot && return [PolygonInteractable(ax, p; id, kw...)]
    p isa Makie.Stem && return _stem_parts(ax, p, id; kw...)
    p isa Makie.ScatterLines && return _scatterlines_parts(ax, p, id; kw...)
    p isa Makie.Series && return [SegmentInteractable(ax, p; id, kw...)]
    p isa Makie.BoxPlot && return [_boxplot_interactable(ax, p; id, kw...)]
    p isa Makie.Text && return _text_interactables(ax, p, id; kw...)
    p isa Makie.Annotation && return _text_interactables(ax, _descendant(p, Makie.Text), id; kw...)
    # unreachable while _plotbase gates callers; loud if the two ever drift (kind added to one, not the other)
    return error("interactables: $(typeof(p).name.name) passed _plotbase but has no _construct branch")
end

# The plot's own transformation (`translate!`, `scale!`, `rotate!`) is applied after the axis
# scale: Makie draws a point `x` at `model * f(x)`, with `f` the axis transform (`log10`, …).
# Hit geometry is projected as data, so each point is replaced by the data point drawn in its
# place, `f⁻¹(model * f(x))`. Payloads keep the plot's own values. On a 2D axis only x and y
# move: a z translation is draw order, not position. `model` here is the plot's own part: an
# `Axis3` scene has a model of its own (fitting the limits into its box), which every plot
# inherits and the projection already applies. `nothing` when the plot is not moved.
function _placement(ax, p)
    hasproperty(p, :model) || return nothing
    M = inv(Makie.transformationmatrix(ax.scene)[]) * Makie.transformationmatrix(p)[]
    is3d = ax isa Makie.Axis3
    off(r, c) = abs(M[r, c] - (r == c)) > 1.0e-6
    moved = is3d ? any(off(r, c) for r in 1:4, c in 1:4) : any(off(r, c) for r in 1:2, c in 1:4)
    moved || return nothing
    tf = _transform_func(ax.scene)
    finv = Makie.inverse_transform(tf)
    if _no_inverse(finv)
        _warn_no_inverse(Makie.plotkey(p))
        return nothing
    end
    rot = is3d ? any(off(r, c) for r in 1:3, c in 1:3 if r != c) : (off(1, 2) || off(2, 1))
    # `o` is a data-space `marker_offset`, already folded into the point as `f⁻¹(f(x) + o)` (see
    # `_shift_data_markers`). Makie adds it after the model, so it is taken out before the model
    # and added back after: the marker is drawn at `M * f(x) + o`.
    place = function (pt, o = zero(Makie.Vec3d))
        x = _pt3(pt)
        t = _apply_transform(tf, Makie.Point3d(x[1], x[2], x[3])) .- o
        m = M * Makie.Vec4d(t[1], t[2], t[3], 1)
        d = _apply_transform(finv, Makie.Point3d(m[1] + o[1], m[2] + o[2], m[3] + o[3]))
        return Point3f(d[1], d[2], is3d ? d[3] : x[3])
    end
    tm = hasproperty(p, :transform_marker) && p.transform_marker[] === true
    # A marker sized in data units (`meshscatter`) grows with the model's scale when
    # `transform_marker`; a rotation turns it but leaves its size alone.
    marker = tm ? Makie.Vec3d((sqrt(sum(abs2, M[r, c] for r in 1:3)) for c in 1:3)...) : nothing
    dataoffset = p isa Makie.Scatter && p.markerspace[] === :data && !tm ? p.marker_offset[] : nothing
    return (; place, rotated = rot, marker, dataoffset)
end

# A drawn (world) position back to the data point drawn there: `f⁻¹(inv(scene model) * w)`.
# With no inverse (a custom transform) the world position is used as is.
function _world_to_data(ax)
    S = inv(Makie.transformationmatrix(ax.scene)[])
    finv = Makie.inverse_transform(_transform_func(ax.scene))
    return function (w)
        m = S * Makie.Vec4d(w[1], w[2], length(w) >= 3 ? w[3] : 0, 1)
        d = _no_inverse(finv) ? Makie.Point3d(m[1], m[2], m[3]) : _apply_transform(finv, Makie.Point3d(m[1], m[2], m[3]))
        return ax isa Makie.Axis3 ? Point3f(d[1], d[2], d[3]) : Point2f(d[1], d[2])
    end
end

_place(i::AbstractInteractable, f) = i
_place(i::TextInteractable, f) = i   # string_boundingboxes already include the transformation
function _place(i::PointInteractable, f)
    r3 = i.radius3d === nothing || f.marker === nothing ? i.radius3d :
        [Makie.Vec3f((Makie.Vec3d(r...) .* f.marker)...) for r in i.radius3d]
    pts = if f.dataoffset === nothing
        map(f.place, i.points)
    else
        offs = _marker_offset_vec(f.dataoffset, length(i.points))
        [f.place(i.points[k], offs[k]) for k in eachindex(i.points)]
    end
    return PointInteractable(
        i.ax, pts, i.id, i.payloads, i.radius, r3, i.tooltip, i.label, i.colors, i.offset,
    )
end
function _place(i::SegmentInteractable, f)
    res = i.resolve === nothing ? nothing : (ax -> map(f.place, i.resolve(ax)))
    paths = i.paths === nothing ? nothing : [map(f.place, path) for path in i.paths]
    return SegmentInteractable(
        i.ax, map(f.place, i.vertices), i.mode, i.id, i.payloads, i.tol, i.tooltip, res, i.label, i.unit, paths,
    )
end
_place(i::PolygonInteractable, f) = PolygonInteractable(
    i.ax, [map(f.place, ring) for ring in i.rings], i.id, i.payloads, i.tooltip, i.label,
    [[map(f.place, h) for h in group] for group in i.holes],
)
# A rect or a grid cell stays axis-aligned only when the plot is not rotated.
function _place_rect(f, r)
    a = f.place((r[1] - r[3] / 2, r[2] - r[4] / 2))
    b = f.place((r[1] + r[3] / 2, r[2] + r[4] / 2))
    return ((a[1] + b[1]) / 2, (a[2] + b[2]) / 2, abs(b[1] - a[1]), abs(b[2] - a[2]))
end
function _place(i::RectInteractable, f)
    _warn_rotated(i, f) && return nothing
    res = i.resolve === nothing ? nothing : (ax -> [_place_rect(f, r) for r in i.resolve(ax)])
    return RectInteractable(
        i.ax, [_place_rect(f, r) for r in i.data], i.id, i.payloads, i.tooltip, i.clamp_to_viewport, res, i.label,
    )
end
function _place(i::GridInteractable, f)
    _warn_rotated(i, f) && return nothing
    y0, x0 = i.yedges[1], i.xedges[1]
    xe = Float64[f.place((x, y0))[1] for x in i.xedges]
    ye = Float64[f.place((x0, y))[2] for y in i.yedges]
    return GridInteractable(i.ax, xe, ye, i.values, i.id, i.tooltip, i.label)
end
function _warn_rotated(i, f)
    f.rotated || return false
    @warn "masque: skipping layer :$(i.id); its plot is rotated, and its rectangles would no " *
        "longer be axis-aligned" maxlog = 16
    return true
end

# Recursive `_child_plots` walk: registers `ids` for every descendant of `p` (a leaf plot's
# `_child_plots` is `[]`, so this terminates there). The auto walk keeps an entry already in
# `plotmap`, so a plot's own entry wins over its parent's. A replacement passes
# `overwrite = true`, so the descendants stop pointing at the layer it replaced.
function _register_descendants!(plotmap, p, ids; overwrite = false)
    for c in _child_plots(p)
        (overwrite || !haskey(plotmap, c)) && (plotmap[c] = ids)
        _register_descendants!(plotmap, c, ids; overwrite)
    end
    return nothing
end

# A Series child's legend entry (`Makie.get_plots` returns the child Lines/ScatterLines, not
# the Series) must pin that one element of the parent `:lines` layer, not every series. The
# spec is `id:k` (1-based); the bare layer id still means the whole layer.
function _register_series_elements!(plotmap, p, layer_id; overwrite = false)
    for (k, c) in enumerate(_child_plots(p))
        ids = [Symbol(layer_id, :(:), k)]
        (overwrite || !haskey(plotmap, c)) && (plotmap[c] = ids)
        _register_descendants!(plotmap, c, ids; overwrite)
    end
    return nothing
end

# `plotmap` is plot -> the layer ids it became: what a legend entry links through.
function _register_plot!(plotmap, p, ids; overwrite = false)
    plotmap[p] = ids
    if p isa Makie.Series
        _register_series_elements!(plotmap, p, first(ids); overwrite)
    else
        _register_descendants!(plotmap, p, ids; overwrite)
    end
    return nothing
end

# Other 2D recipes extract pixel-separable geometry that a 3D perspective projection
# silently misaligns, and separable-edge / axis-aligned rect recipes assume Cartesian pixel
# geometry (polar maps those into arcs and wedges). Skip loudly rather than construct.
function _skip_for_axis(ax, p)
    if ax isa Makie.Axis3 && !(
            p isa Union{
                Makie.Scatter, Makie.Lines, Makie.LineSegments,
                Makie.MeshScatter, Makie.Wireframe, Makie.Arrows3D,
            }
        )
        @warn "masque: skipping $(Makie.plotkey(p)) on Axis3 — only Scatter/Lines/" *
            "LineSegments/MeshScatter/Wireframe/Arrows3D have 3D-valid extraction today; " *
            "other kinds are roadmap scope (docs/dev/roadmap.md)" maxlog = 16
        return true
    end
    if ax isa Makie.PolarAxis && !(
            p isa Union{
                Makie.Scatter, Makie.Lines, Makie.LineSegments,
                Makie.ScatterLines, Makie.Series,
            }
        )
        @warn "masque: skipping $(Makie.plotkey(p)) on PolarAxis — only Scatter/Lines/" *
            "LineSegments/ScatterLines/Series have polar-valid extraction today; grid and rect " *
            "recipes are roadmap scope (docs/dev/roadmap.md)" maxlog = 16
        return true
    end
    return false
end

# A known child of an unknown recipe that must not become its own layer. `hexbin!` draws one
# data-space hexagon `Scatter` (`markerspace = :data`); `_marker_radius` throws unless
# markerspace is `:pixel`, and a pixel radius would not be the hex. `bracket!` draws a
# pixel-space `Series`; `SegmentInteractable` would project those points as data. Non-data
# `Text` is not refused here — `_text_interactables` warns and returns an empty vector.
function _walk_refuses(p)
    p isa Makie.Scatter && p.markerspace[] !== :pixel && return true
    p isa Makie.Text && return false
    hasproperty(p, :space) || return false
    sp = p.space[]
    return sp isa Symbol && sp !== :data
end

# Vertices the interactable would hit. A grid is not a vertex list; treat it as present.
# A zero count is an empty construct: `qqplot!` with `qqline = :none` still builds a
# `LineSegments` whose converted points are `Point2f[]`.
_nverts(i::PointInteractable) = length(i.points)
_nverts(i::SegmentInteractable) = i.paths === nothing ? length(i.vertices) : sum(length, i.paths; init = 0)
_nverts(i::PolygonInteractable) = sum(length, i.rings; init = 0)
_nverts(i::RectInteractable) = length(i.data)
_nverts(::GridInteractable) = 1
_nverts(i::TextInteractable) = length(i.payloads)
_nverts(::AbstractInteractable) = 1

# `_text_interactables` or `_construct` already warned about a non-data-space plot. The parent
# walk must not add the generic "unsupported plot type" warning on top of that (`bracket!`).
function _warned_empty(p)
    t = if p isa Makie.Text
        p
    elseif p isa Makie.Annotation
        _descendant_or_nothing(p, Makie.Text)
    else
        return _nondata_space(p)
    end
    return t !== nothing && hasproperty(t, :space) && t.space[] !== :data
end

# A method a recipe defined for itself (`Masque.interactables(ax, p::MyPlot; kwargs...)`)
# rather than the built-in one.
function _has_custom(ax, p)
    m = which(interactables, Tuple{typeof(ax), typeof(p)})
    return m.sig != Tuple{typeof(interactables), Any, Makie.AbstractPlot}
end
_known(ax, p) = _plotbase(p) !== nothing || _has_custom(ax, p)
# The id a plot's first layer takes before numbering. A recipe with its own method takes its
# plot function's name (`myplot!` gives `:myplot`).
_base(ax, p) = something(_plotbase(p), Symbol(Makie.plotkey(p)))

# Construct `p` (`_known` already accepted it) and register every descendant under the new
# layer ids. `haskey` in `_register_descendants!` keeps a plot's own entry. A later parent
# constructor, or a second visit, must not construct those descendants again — that is the
# double layer (`:violin` plus the violin's `:poly`). Series children register as `id:k`.
# An empty construct — non-data text, or a construct with no vertices — does not consume a
# layer id. Returns `(built, warned)`: `warned` is the axis-skip warning or the non-data
# text warning, so the caller can suppress a second, generic one. A recipe's own method is
# trusted on every axis kind; the axis skip is for the built-in extraction.
function _install_known!(d, ax, p)
    _has_custom(ax, p) || !_skip_for_axis(ax, p) || return (built = false, warned = true)
    base = _base(ax, p)
    n = get(d.seen, base, 0) + 1
    d.seen[base] = n
    id = n == 1 ? base : Symbol(base, :_, n)
    built = interactables(ax, p; id)
    if isempty(built) || all(i -> _nverts(i) == 0, built)
        if n == 1
            delete!(d.seen, base)
        else
            d.seen[base] = n - 1
        end
        return (built = false, warned = isempty(built) && _warned_empty(p))
    end
    push!(d.drawn, built)
    ids = Symbol[ii.id for ii in built]
    d.installed[p] = ids
    _register_plot!(d.plotmap, p, ids)
    return (built = true, warned = false)
end

# Children of a recipe Masque does not know. Stop at the first known plot: constructing
# a `Violin` and also its `Poly` would be two layers for one mark. A zero-string `Text`
# (`contour!` with labels off) is not a layer; keep walking so the sibling `Lines` is still
# found. A child with `visible[] == false` is not drawn (`triplot!` ghost edges, convex hull,
# constrained edges, point scatter) and is not a layer; do not walk into it. Descendants of
# a plot just installed are already in `plotmap` and are skipped. Returns `(built, warned)`.
function _walk_unknown!(d, ax, parent)
    built_any = false
    warned_any = false
    for c in _child_plots(parent)
        haskey(d.plotmap, c) && continue
        if hasproperty(c, :visible) && c.visible[] == false
            continue
        end
        if !_known(ax, c)
            r = _walk_unknown!(d, ax, c)
            built_any |= r.built
            warned_any |= r.warned
            continue
        end
        if c isa Makie.Text && c.text[] isa AbstractVector && isempty(c.text[])
            r = _walk_unknown!(d, ax, c)
            built_any |= r.built
            warned_any |= r.warned
            continue
        end
        _walk_refuses(c) && continue
        r = _install_known!(d, ax, c)
        built_any |= r.built
        warned_any |= r.warned
    end
    return (built = built_any, warned = warned_any)
end

# Every default of `fig`. `plotmap` is plot -> layer ids for the legend links, descendants
# included. `installed` holds only the plots built directly, so a replacement can find the
# layers its plot's default took.
function _defaults(fig)
    # Introspection reads post-layout axis state (e.g. `ax.finallimits[]`).
    _finalize!(fig)
    d = (
        ints = AbstractInteractable[],
        drawn = Vector{Vector{AbstractInteractable}}(),
        seen = Dict{Symbol, Int}(),
        plotmap = IdDict{Any, Vector{Symbol}}(),
        installed = IdDict{Any, Vector{Symbol}}(),
    )
    for ax in fig.content
        ax isa _SUPPORTED_AXES || continue
        for p in _child_plots(ax.scene)
            if !_known(ax, p)
                r = _walk_unknown!(d, ax, p)
                # A child already warned (non-data text, or an axis skip). A second warning
                # that names the parent only repeats that, which `bracket!` used to do.
                if !r.built && !r.warned
                    @warn "masque: skipping unsupported plot type $(Makie.plotkey(p)) (no introspection recipe)" maxlog = 16
                end
                continue
            end
            _install_known!(d, ax, p)
        end
        # Hit precedence is manifest order, first match wins. Makie draws a later plot over
        # an earlier one, so the plot drawn last on an axis comes first: a `scatter!` after a
        # `lines!` through the same points (a graph's nodes over its edges) wins the hover.
        # The ids above are numbered in drawing order; a plot's own layers keep their order.
        for built in Iterators.reverse(d.drawn)
            append!(d.ints, built)
        end
        empty!(d.drawn)
    end
    # Colorbar blocks live in fig.content, not in an Axis's scene.
    nc = 0
    for c in fig.content
        c isa Makie.Colorbar || continue
        nc += 1
        id = nc == 1 ? :colorbar : Symbol(:colorbar_, nc)
        push!(d.ints, ColorbarInteractable(c; id))
    end
    # Likewise Legend blocks, linked through the plotmap built above.
    nl = 0
    for c in fig.content
        c isa Makie.Legend || continue
        nl += 1
        id = nl == 1 ? :legend : Symbol(:legend_, nl)
        push!(d.ints, _legend_interactable(c; id, plotmap = d.plotmap))
    end
    return d
end

"""
    interactables(fig) -> Vector{AbstractInteractable}
    interactables(ax)  -> Vector{AbstractInteractable}

The interactables `masque(fig)` builds by default: for every supported plot in every `Axis`,
`Axis3`, or `PolarAxis`, the interactable its explicit constructor would build, then one
[`ColorbarInteractable`](@ref) per `Colorbar` and one [`LegendInteractable`](@ref) per
`Legend`, linked to the layers of the plots each entry stands for. `interactables(ax)` is the
part of that list on one axis, with the same ids.

On each axis the plot drawn last comes first. Where marks overlap, the first in the list gets
the pointer, so it is the mark drawn on top.

On `Axis3`, only `Scatter`/`Lines`/`LineSegments`/`MeshScatter`/`Wireframe`/`Arrows3D` are
supported; on `PolarAxis`, only `Scatter`/`Lines`/`LineSegments`/`ScatterLines`/`Series`.
Other kinds are skipped with a warning. A recipe with its own
`Masque.interactables(ax, p::MyPlot)` method uses it. Any other recipe contributes each child
that has a default (`arc!` is the `lines!` it draws), under that child's layer id. A child
with `visible[] == false` is not a layer (`triplot!`'s ghost edges). A construct with no
vertices does not take a layer id (`qqplot!` with `qqline = :none`). A data-space `Scatter`
child is left alone (`hexbin!`), and so is a child whose `space` is not `:data` (`bracket!`).

Layer ids are the plot kind (`:scatter`, `:lines`, …), suffixed `_2`, `_3`, … when a kind
repeats across the figure. Passing an entry of this list to `masque` replaces the default with
the same id, so an edited copy of the list is a valid call.

Each interactable inherits its constructor's default per-element payloads, so the zero-config
path on a very large plot allocates one payload per element; construct with a lean `payloads=`
yourself for huge data.
"""
interactables(fig::Makie.Figure) = _defaults(fig).ints
function interactables(ax::_SUPPORTED_AXES)
    fig = ax.parent
    fig isa Makie.Figure ||
        throw(ArgumentError("interactables(ax): this axis is not in a Figure"))
    return filter(i -> hasproperty(i, :ax) && i.ax === ax, interactables(fig))
end

"""
    auto_interactables(fig) -> Vector{AbstractInteractable}

Deprecated: use [`interactables(fig)`](@ref interactables). Removed in 0.3.
"""
function auto_interactables(fig)
    Base.depwarn("`auto_interactables(fig)` is deprecated, use `interactables(fig)`", :auto_interactables)
    return interactables(fig)
end

# --- SliceInteractable from a plot -----------------------------------------------------------
# Vertices are the points the plot already draws. Stairs keeps the child line's steppoints,
# repeated probe and all, so a tread samples as a constant. Density/Band contribute the band's
# upper curve as drawn (not a recomputed KDE): a Band with direction=:y is stored unflipped
# and swapped here; a Density with direction=:y is already Point2(value, position) and is not
# swapped again. A strictly decreasing probe is stored left-to-right; a non-monotonic one fails
# in the constructor.

function _slice_xy(pts)
    xs = Float64[]
    ys = Float64[]
    for p in pts
        push!(xs, Float64(p[1]))
        push!(ys, Float64(p[2]))
    end
    return xs, ys
end

function _slice_color(p)
    hasproperty(p, :color) || return nothing
    c = p.color[]
    (c isa AbstractVector || c isa Real || c isa Makie.Automatic) && return nothing
    try
        _css_color(c)
    catch
        return nothing
    end
    return c
end

function _slice_label(p)
    hasproperty(p, :label) || return nothing
    lab = p.label[]
    return lab isa AbstractString && !isempty(lab) ? String(lab) : nothing
end

_slice_ident_id(lab) = lab isa AbstractString && occursin(r"^[A-Za-z][A-Za-z0-9_]*$", lab) ? Symbol(lab) : nothing

# Reverse only a strictly decreasing finite probe, so a right-to-left upper curve still samples.
function _flip_if_decreasing!(xs, ys, orientation)
    probe = orientation === :vertical ? xs : ys
    prev = nothing
    decreasing = false
    for v in probe
        isfinite(v) || continue
        if prev !== nothing
            v < prev && (decreasing = true)
            v > prev && return nothing
        end
        prev = v
    end
    decreasing && (reverse!(xs); reverse!(ys))
    return nothing
end

function _slice_parts(p)
    if p isa Makie.Lines
        xs, ys = _slice_xy(_conv(p)[1])
        lab = _slice_label(p)
        return :vertical, [(; id = _slice_ident_id(lab), label = lab, color = _slice_color(p), x = xs, y = ys)], :lines
    elseif p isa Makie.Stairs
        line = _childof(p, Makie.Lines)
        xs, ys = _slice_xy(_conv(line)[1])
        lab = _slice_label(p)
        col = _slice_color(p)
        col === nothing && (col = _slice_color(line))
        # plateau: :pre, :post, and :center each repeat x on the riser. Kept, so the linear
        # sampler holds the tread instead of interpolating across the step.
        return :vertical, [(; id = _slice_ident_id(lab), label = lab, color = col, x = xs, y = ys, plateau = true)], :stairs
    elseif p isa Makie.Series
        children = _child_plots(p)
        isempty(children) && error("SliceInteractable: Series has no child lines")
        series = NamedTuple[]
        for c in children
            line = _series_line(c)
            xs, ys = _slice_xy(_conv(line)[1])
            lab = _slice_label(c)
            push!(series, (; id = _slice_ident_id(lab), label = lab, color = _slice_color(line), x = xs, y = ys))
        end
        return :vertical, series, :series
    elseif p isa Makie.Density
        # The child band is called with no direction, so it stays :x. direction=:y already
        # stored Point2(offset + density, k.x); swapping that again would undo the curve.
        band = _descendant(p, Makie.Band)
        orient = p.direction[] === :y ? :horizontal : :vertical
        _lower, upper = _conv(band)
        xs, ys = _slice_xy(upper)
        lab = _slice_label(p)
        col = _slice_color(p)
        col === nothing && (col = _slice_color(band))
        return orient, [(; id = _slice_ident_id(lab), label = lab, color = col, x = xs, y = ys)], :density
    elseif p isa Makie.Band
        # converted[] stays Point2(x, yupper). direction=:y flips only the mesh, so the
        # drawn upper edge is reverse.(point).
        swap = p.direction[] === :y
        orient = swap ? :horizontal : :vertical
        _lower, upper = _conv(p)
        xs, ys = _slice_xy(upper)
        swap && ((xs, ys) = (ys, xs))
        lab = _slice_label(p)
        col = _slice_color(p)
        return orient, [(; id = _slice_ident_id(lab), label = lab, color = col, x = xs, y = ys)], :band
    else
        throw(
            ArgumentError(
                "SliceInteractable: $(typeof(p).name.name) is not a Lines, Stairs, Series, Band, or Density",
            )
        )
    end
end

function _slice_cover_ids(stems)
    seen = Dict{Symbol, Int}()
    ids = Symbol[]
    for stem in stems
        n = get(seen, stem, 0) + 1
        seen[stem] = n
        push!(ids, n == 1 ? stem : Symbol(stem, :_, n))
    end
    return ids
end

"""
    SliceInteractable(ax, plot; orientation=nothing, crosshair=true, id=:slice, covers=nothing, tooltip=nothing)
    SliceInteractable(ax, plots; ...)

One slice from a `Lines`, `Stairs`, `Series`, `Band`, or `Density`, or from a vector of those.
See [`SliceInteractable`](@ref) for the series constructor. `covers=nothing` (the default) names
each plot's auto-extract layer id (`:lines`, `:stairs`, `:series`, `:band`, `:density`, with
`_2`, `_3`, … when the vector repeats a kind). That count is inside this vector, not across
the figure. `orientation=nothing` follows the plot: a `Density` uses its own `direction`, and
a `Band` uses its `direction`; `:y` is `:horizontal` and everything else is `:vertical`.
A vector that mixes those raises `ArgumentError` unless `orientation` is passed.
"""
function SliceInteractable(
        ax, plots::AbstractVector;
        orientation = nothing, crosshair = true, id = :slice, covers = nothing, tooltip = nothing,
    )
    isempty(plots) && throw(ArgumentError("SliceInteractable: plots is empty"))
    series = NamedTuple[]
    stems = Symbol[]
    orients = Symbol[]
    auto_n = 0
    for p in plots
        orient, parts, stem = _slice_parts(p)
        push!(orients, orient)
        push!(stems, stem)
        for part in parts
            sid = part.id
            if sid === nothing
                auto_n += 1
                sid = Symbol("s", auto_n)
            end
            plateau = hasproperty(part, :plateau) && part.plateau === true
            push!(series, (; id = sid, label = part.label, color = part.color, x = part.x, y = part.y, plateau))
        end
    end
    uniq = unique(orients)
    orient = if orientation === nothing
        length(uniq) == 1 || throw(
            ArgumentError(
                "SliceInteractable: plots mix $(join(string.(uniq), " and ")) orientations; pass orientation=",
            )
        )
        only(uniq)
    else
        orientation
    end
    cover_ids = covers === nothing ? _slice_cover_ids(stems) : covers
    for s in series
        _flip_if_decreasing!(s.x, s.y, orient)
    end
    return SliceInteractable(ax; series, orientation = orient, crosshair, id, covers = cover_ids, tooltip)
end

function SliceInteractable(ax, p; orientation = nothing, crosshair = true, id = :slice, covers = nothing, tooltip = nothing)
    return SliceInteractable(ax, [p]; orientation, crosshair, id, covers, tooltip)
end
