"""
    HitLayer

The unit `masque` serializes to the browser: one geometry `kind` for one interactable, plus the
data needed to resolve a pointer hit to an element index and its payload. Built by
[`hitlayers`](@ref); user-facing mainly when writing a [`FunctionInteractable`](@ref).

# Fields
- `id::Symbol` — the layer id; becomes `InteractionEvent.layer` on a hit.
- `kind::Symbol` — one of `:circles`, `:polyline`, `:lines`, `:segments`, `:rects`, `:grid`,
  `:surface`, `:polygons`, `:axis`, `:threshold`, `:roi`, `:view`, `:slice`. `geometry`'s layout depends on it:
  - `:circles` — flat `Real[]`, `(cx, cy, r)` per element (image px)
  - `:rects` — flat `Real[]`, `(cx, cy, w, h)` per element (image px)
  - `:polyline` / `:segments` — flat `Real[]`, `(x, y)` per vertex — one connected path hit
    per segment, or disjoint pairs, respectively (image px)
  - `:lines` — `Vector{Real}[]`, one flat `(x, y)`-per-vertex polyline per element (image px;
    `NaN` is a gap inside that line, not another element). A `lines!` / `stairs!` /
    `scatterlines!` line is one entry; a `series!` is one entry per series
  - `:polygons` — one element per filled polygon. A solid element is a flat `(x, y)`-per-vertex
    ring (`Vector{Real}`, image px). An element with holes is a vector of those rings instead:
    the exterior first, then each hole. The overlay even-odd-tests the rings of one element
    together, so a point in a hole is not a hit of that element.
  - `:grid` — a `Dict` with `"xedges"`, `"yedges"`, `"ncols"`, `"nrows"`, and either
    `"values"` (the source matrix, when a cell is at least one screen pixel) or `"sample"`
    (one source value per screen pixel of the axis viewport, when cells are smaller). A
    sub-pixel matrix that is not real-valued ships neither.
  - `:surface` — a `Dict` for a projected vertex grid of `"ni"` × `"nj"` shipped points:
    `"i"`/`"j"` (0-based source index of each shipped row/column), `"xy"` (image px,
    interleaved, row-major over `(ni, nj)`; `NaN` is a point not drawn), `"order"` (0-based quad
    indices, front to back; quad `a + b·(ni-1)` has corners `(a, b)` to `(a+1, b+1)`), the data
    `"x"`/`"y"` (length `ni`/`nj`, or one per point), `"z"`, and optionally `"value"`.
    Payloads, when present, are one per shipped point, row-major like `xy`
  - `:axis` — `nothing` (whole-axis readout, `AxisInteractable`) or flat `Real[x, y, w, h]`
    (the colorbar's pixel bbox, `ColorbarInteractable`); not element-indexed
  - `:threshold` / `:roi` / `:view` — a small `Dict` (orientation/position, drag bbox +
    hit half-size `handle` — the overlay paints the grip at a fixed 7 CSS px — or viewport +
    camera, respectively); not element-indexed
  - `:slice` — a `Dict` of data-space series to sample at the cursor (`SliceInteractable`);
    not a hit target. The overlay hair is drawn only when this layer's `crosshair` is true,
    and only the arm named by `orientation`
- `payloads::Vector{Any}` — one JSON-serializable entry per element, positional (`payloads[k]`
  binds element `k`); empty for the element-count-free kinds above.
- `axis::Symbol` — the id of this layer's [`AxisTransform`](@ref) in
  `InteractionContext.transforms` (see `axis_id`).
- `events::Tuple` — the pointer events this layer responds to (`:click`, `:hover`, `:drag`).
- `label::Union{Nothing,String}` — the layer's name, which the keyboard-navigation overlay
  announces ("wild type, element 3 of 10: …"). One string per layer, unlike a `label` field in
  a payload, which belongs to one element. `nothing` (default) omits it from the manifest.
- `colors` — an optional tooltip accent colour for this layer's elements: a single CSS colour
  string (uniform across the layer), or `(; palette, index)` with `palette::Vector{String}` (CSS
  colours) and one 1-based `index` per element into it (colormapped/categorical data).
  `nothing` (default) omits it from the manifest — no accent border on the tooltip. Built by
  [`PointInteractable`](@ref)'s plot-object constructor when the source plot's colour is
  resolvable; not derived automatically for a bare-points/vertices interactable.
- `links` — an optional `Vector{Vector{Symbol}}`, one entry per element: other layers this
  element highlights on hover/click (e.g. a legend entry linking to the trace(s) it labels).
  Each id is a layer id (every element of that layer) or `id:k` pinning element `k` (1-based)
  of that layer — auto-extracted `series!` legend entries use the pin so each swatch lights
  one trace. `nothing` (default) omits it from the manifest. Built by
  [`LegendInteractable`](@ref); every id it names must belong to another layer in the same
  `masque()` call whose `kind` supports pre-highlight (`build_manifest` raises `ArgumentError`
  otherwise, for explicitly-given targets — the auto-extracted path drops an unsupported target
  with a `@warn` instead of failing the whole build). An `id:k` pin whose `k` is out of range
  is the same kind of error as an unknown layer.
- `order` — `:rects` only, optional: the 0-based element indices front to back, which the
  overlay hit-tests in, so the nearest of overlapping boxes wins. An element left out is not
  drawn and never hit. `nothing` (default) tests in index order. Built by
  [`TextInteractable`](@ref) on an `Axis3`.
"""
struct HitLayer
    id::Symbol
    kind::Symbol          # :circles|:polyline|:lines|:segments|:rects|:grid|:surface|:polygons|:axis|:threshold|:roi|:view|:slice
    geometry::Any
    payloads::Vector{Any}
    axis::Symbol
    events::Tuple
    label::Union{Nothing, String}
    colors::Any
    links::Union{Nothing, Vector{Vector{Symbol}}}
    # :lines on a 2D axis: per element, the data samples `[x1, y1, x2, y2, …]` a hover readout
    # snaps to, and the staircase `step` mode when the drawn path adds corners between them.
    points::Union{Nothing, Vector}
    step::Union{Nothing, Symbol}
    # :rects: 0-based element indices, front to back, that the overlay hit-tests in; an
    # element left out is not drawn. `nothing` is index order.
    order::Union{Nothing, Vector{Int}}
end
HitLayer(id, kind, geometry, payloads, axis, events, label, colors, links, points, step) =
    HitLayer(id, kind, geometry, payloads, axis, events, label, colors, links, points, step, nothing)
HitLayer(id, kind, geometry, payloads, axis, events) = HitLayer(id, kind, geometry, payloads, axis, events, nothing, nothing, nothing)
HitLayer(id, kind, geometry, payloads, axis, events, label) = HitLayer(id, kind, geometry, payloads, axis, events, label, nothing, nothing)
HitLayer(id, kind, geometry, payloads, axis, events, label, colors) = HitLayer(id, kind, geometry, payloads, axis, events, label, colors, nothing)
HitLayer(id, kind, geometry, payloads, axis, events, label, colors, links) = HitLayer(id, kind, geometry, payloads, axis, events, label, colors, links, nothing, nothing)

"""
    AbstractInteractable

Supertype for everything [`masque`](@ref) can turn into hit-testable JS layers. The built-in
kinds ([`PointInteractable`](@ref), [`SegmentInteractable`](@ref), [`RectInteractable`](@ref),
[`PolygonInteractable`](@ref), [`AxisInteractable`](@ref), [`ColorbarInteractable`](@ref),
[`LegendInteractable`](@ref), [`ThresholdInteractable`](@ref), [`ROIInteractable`](@ref),
[`TextInteractable`](@ref), [`ViewInteractable`](@ref), [`SliceInteractable`](@ref),
[`RegionInteractable`](@ref), [`FunctionInteractable`](@ref)) cover most needs; implement
this interface for anything else.

# Interface

Only `hitlayers` is exported — every other method below is a non-exported function of the
`Masque` module. Extend them as `Masque.validate(::MyType, ctx) = …`, etc.; a bare
`validate(::MyType, ctx) = …` at top level defines an unrelated function that `masque` never
calls, and `masque(fig, MyType())` will build without error while silently ignoring it.

Required:
- `hitlayers(i, ctx::InteractionContext) -> Vector{HitLayer}` — see [`hitlayers`](@ref)
  (exported).

Optional (default shown; all non-exported — extend as `Masque.<name>`):
- `Masque.validate(i, ctx::InteractionContext) -> Union{Nothing,String}` — return an error
  message if `i` can't be built against `ctx` (`masque` raises it as `ArgumentError`), else
  `nothing`. Default: always valid.
- `Masque.events(i) -> Tuple` — the pointer events this interactable's layer(s) respond to
  (`:click`, `:hover`, `:drag`). Default: `(:click, :hover)`.
- `Masque.tooltip_spec(i)` — `nothing` for the auto name/value table, a [`Markup`](@ref) (built
  with `masque"..."`) template, or `false` to suppress. Default: `nothing`.
- `Masque.hoverstyle(i) -> NamedTuple` — one `(; stroke, width)` hover outline style per *layer*
  (the manifest ships one style per layer, not per element). Default: `(; stroke = nothing,
  width = 2)` — `stroke = nothing` means the overlay draws its own split highlight: a
  brightening `color-dodge` fill plus a flat grey edge stroke (`#7a7a7a` on a light figure,
  `#c8c8c8` on a dark one; the stroke is not blended into the mark), instead of a stroke color,
  so every layer brightens without Masque resolving the element's color; a CSS color string
  overrides it verbatim for that layer (no blend, single unblended element, the outline is
  exactly that color). `colors` (see [`HitLayer`](@ref)) no longer affects the hover/selection
  outline at all — it only drives the tooltip's accent border.
- `Masque.hit_tol(i) -> Union{Nothing,Real}` — logical-px hit-test slack for `:segments`/
  `:polyline`/`:lines` layers, shipped in the manifest as image px (`round(Int, hit_tol(i) *
  ctx.scaling)`). `nothing` (default) omits the field; the overlay then falls back to its
  own fixed slack. A `:rects` or `:polygons` layer takes it as a reach outside each shape
  (none when absent): a plot-object `RectInteractable`/`PolygonInteractable` sets it to half
  the plot's `strokewidth`, so the drawn outline responds too.

[`AbstractSelector`](@ref) subtypes additionally implement `Masque.selects`/`Masque.compatible_kinds`.
"""
abstract type AbstractInteractable end

"""
    hitlayers(interactable, ctx::InteractionContext) -> Vector{HitLayer}

Build the [`HitLayer`](@ref)(s) an interactable contributes to the manifest — the only method
every [`AbstractInteractable`](@ref) subtype must implement. Project data-space geometry with
`data_to_image_px(ctx, ax, point)`; never re-derive projection. Most built-ins return a single
`HitLayer`; [`RegionInteractable`](@ref) can return several (one per region kind), and
[`FunctionInteractable`](@ref) delegates entirely to a user function of `ctx`.
"""
function hitlayers end
validate(::AbstractInteractable, ::InteractionContext) = nothing
events(::AbstractInteractable) = (:click, :hover)
# How many elements a click field holds: `:one` (a pick, or `nothing`) or `:many` (a vector).
# Types that carry a `select` field read it; every other type picks one.
select_mode(i::AbstractInteractable) = hasfield(typeof(i), :select) ? getfield(i, :select) : :one
function _check_select(T, select)
    select in (:one, :many) ||
        throw(ArgumentError("$(nameof(T)): select must be :one or :many, got $(repr(select))"))
    return select
end
# Per-layer: nothing = auto name/value table (default), Markup = template, false = suppress.
tooltip_spec(::AbstractInteractable) = nothing
# One hover style per LAYER (the manifest ships one `style` dict per layer, not per element).
# stroke = nothing: the overlay draws its own split highlight — a color-dodge fill plus a flat
# chrome edge stroke (#7a7a7a light figure, #c8c8c8 dark; not blended into the mark) — instead
# of a stroke colour; `colors` no longer feeds this, only the tooltip accent; a CSS colour
# string here overrides it verbatim (no blend, single unblended element).
hoverstyle(::AbstractInteractable) = (; stroke = nothing, width = 2)
# Logical-px hit-test slack for :segments/:polyline/:lines layers; nothing omits the manifest field.
hit_tol(::AbstractInteractable) = nothing

"""
    AbstractSelector

Supertype for interactables that highlight elements on another layer — today just
[`ROIInteractable`](@ref)'s `selects` mode, brushing a `:circles`/`:grid` layer. Subtypes
additionally implement these non-exported functions (extend as `Masque.selects(::MyType) = …`):
- `Masque.selects(i) -> Union{Nothing,Symbol}` — the target layer id, or `nothing`. The
  built-in [`ROIInteractable`](@ref) may also hold a plot here until `masque` resolves it to
  that plot's layer id.
- `Masque.compatible_kinds(i) -> Tuple` — the target `HitLayer.kind`s this selector accepts;
  `masque` raises `ArgumentError` at build time if `selects` names a layer of an unlisted kind.
"""
abstract type AbstractSelector <: AbstractInteractable end

# A plot named as a selector's `selects`, with the layer ids `masque` built for it in this
# call. `build_manifest` picks the one whose kind the selector brushes.
struct _PlotTarget
    plot::Makie.AbstractPlot
    ids::Vector{Symbol}
end

# Only AbstractSelectors override these.
selects(::AbstractInteractable) = nothing
compatible_kinds(::AbstractInteractable) = ()

# Only AxisInteractable relies on client-side JS inversion and restricts scales.
const _JS_INVERTIBLE = (:identity, :log10, :log)  # scales geometry.ts `invert` implements

# Below this on-screen cell size a cursor can't land on one source cell, so the manifest
# carries one source value per screen pixel of the axis viewport instead of the full matrix.
const GRID_VALUES_MIN_SCREEN_PX = 1.0

# A surface ships at most one point per this many CSS px of its axis's longer side, along each
# grid direction (`SurfaceInteractable`). Measured in docs/dev/perf-findings.md (Section J).
const SURFACE_MIN_SCREEN_PX = 4

# An `Axis3` clips its plots to its limits (Makie's clip planes, `ax.clip = true`), so a point
# outside them, as after a zoom (#321), is not drawn. Built-in hit geometry gets NaN there, the
# "not on screen" sentinel every hit layer already skips, rather than a spot where nothing is
# visible. `data_to_image_px` itself still projects any point. Callers projecting many points
# look the box up once with `_clipbox` and pass it in.
_clipbox(ax) = ax isa Makie.Axis3 ? _axis3_clipbox(ax) : nothing
function _proj(ctx, ax, p, box = _clipbox(ax))
    box === nothing || _in_clipbox(box, p) || return Point2f(NaN32, NaN32)
    return data_to_image_px(ctx, ax, p)
end

# Points widen to Point3f (z=0 for 2-coord input) so 2D and 3D geometry share one storage path.
_pt3(p) = Point3f(p[1], p[2], length(p) >= 3 ? p[3] : 0)
# Float64, for values shown as text: a date is milliseconds since year 1, past Float32's 7 digits.
_pt3d(p) = Point3d(p[1], p[2], length(p) >= 3 ? p[3] : 0)

# Round to Int (MsgPack encodes it far more compactly than Float32). `round(Int, NaN/Inf)`
# throws, so non-finite values pass through as Float32 — NaN is the polyline gap sentinel
# (geometry.ts). Geometry vectors use `Real[]`, not a concrete eltype, to allow this mix.
_q(x) = isfinite(x) ? round(Int, x) : Float32(x)

# 0-based bin, or -1 outside. Matches `findBin` in `frontend/src/geometry.ts`, including the
# smaller-index bin on an interior edge. `edges` is 1-based; the returned index is not.
function _find_bin(edges, v)
    n = length(edges)
    (n < 2 || !isfinite(v) || !isfinite(edges[1]) || !isfinite(edges[n])) && return -1
    ascending = edges[n] > edges[1]
    if ascending
        (v < edges[1] || v > edges[n]) && return -1
    else
        (v > edges[1] || v < edges[n]) && return -1
    end
    lo = 0
    hi = n - 2
    while lo < hi
        mid = (lo + hi) >>> 1
        right = edges[mid + 2]
        brackets = ascending ? v <= right : v >= right
        lo, hi = brackets ? (lo, mid) : (mid + 1, hi)
    end
    return lo
end

# Image-px extent of sample index `i`. The last bin keeps the remainder, so it is shorter
# than `step` when `span` is not a whole number of steps.
function _sample_bin(origin, i, n, step, span)
    start = origin + i * step
    stop = i == n - 1 ? origin + span : start + step
    return start, stop
end

# Real-valued cells can be sampled. `missing` is stored as `NaN32`. A color image, or any
# other non-real eltype, cannot — the grid layer ships edges only, with neither `values` nor a sample.
_sampleable(::Type{T}) where {T} = (R = nonmissingtype(T); R === Union{} || R <: Real)
_sample_value(::Missing) = NaN32
_sample_value(v::Real) = Float32(v)

# One `Float32` per screen pixel of `vp` (`x, y, w, h` image px), or `nothing` when `vals`
# is not real-valued. The value is the source cell under that pixel's center. `NaN32` is both
# a center that misses the grid and a source cell that is `missing` / non-finite; the overlay
# tells those apart by running `findBin` on the center.
function _grid_sample(xedges, yedges, vals, vp, display_scale)
    _sampleable(eltype(vals)) || return nothing
    vx, vy, vw, vh = vp
    sample_px = 1 / display_scale
    sncols = ceil(Int, vw * display_scale)
    snrows = ceil(Int, vh * display_scale)
    (sncols < 1 || snrows < 1) && return nothing
    sample = Vector{Float32}(undef, sncols * snrows)
    for sy in 0:(snrows - 1)
        y0, y1 = _sample_bin(vy, sy, snrows, sample_px, vh)
        j = _find_bin(yedges, (y0 + y1) / 2)
        for sx in 0:(sncols - 1)
            x0, x1 = _sample_bin(vx, sx, sncols, sample_px, vw)
            i = _find_bin(xedges, (x0 + x1) / 2)
            sample[sy * sncols + sx + 1] = i < 0 || j < 0 ? NaN32 : _sample_value(vals[i + 1, j + 1])
        end
    end
    return (;
        sample, sncols, snrows, sample_px,
        origin = Float64[vx, vy], span = Float64[vw, vh],
    )
end

# A payloads-length mismatch would otherwise surface as an `undefined` tooltip at hover time.
# Positional: payloads[k] binds element k; a wrong order is undetectable here. A DataFrame is
# accepted once the DataFrames extension is loaded (`MasqueDataFramesExt`).
function expand_payloads(payloads, n, who)
    npl = length(payloads)
    npl == n || throw(ArgumentError("$who: payloads has $npl entries, expected $n"))
    return collect(Any, payloads)
end
_check_payloads(payloads, n, what) = expand_payloads(payloads, n, what)

# A user's payload is merged onto the mark's own default payload: `(; name = "a")` on a
# scatter point gives `(; name, x, y)`, and the user's fields win a clash. `index` (and a
# segment's `segment_index`) is left out, since the event carries it as `ev.index`. A payload
# that isn't key-value (a bare string) replaces the default, as there is nothing to merge.
function _merge_payloads(defaults, payloads, who)
    payloads === nothing && return defaults
    pl = expand_payloads(payloads, length(defaults), who)
    return Any[_merge_payload(d, p) for (d, p) in zip(defaults, pl)]
end
_default_fields(d::NamedTuple) = Base.structdiff(d, NamedTuple{(:index, :segment_index)})
_merge_payload(d, p) = p
_merge_payload(d::NamedTuple, p::NamedTuple) = merge(p, Base.structdiff(_default_fields(d), p))
function _merge_payload(d::NamedTuple, p::AbstractDict)
    K = keytype(p)
    key = K === Symbol ? identity : K === String ? string : nothing
    key === nothing && return p
    out = merge!(empty(p, K, Any), p)   # keeps an `OrderedDict`'s type and order
    for (k, v) in pairs(_default_fields(d))
        get!(out, key(k), v)
    end
    return out
end

# Checked at construction (not manifest build time) so the error points at the caller's own call.
_check_tooltip(tooltip) =
    tooltip === true && throw(
    ArgumentError(
        "tooltip = true is not meaningful — omit `tooltip` for the auto name/value table " *
            "(the default), pass masque\"…\" for a template, or `false` to suppress.",
    ),
)

# `colors` is user-settable on the bare-points PointInteractable constructor (not just derived
# internally by the plot-object one, which always builds a shape this accepts) — checked here so
# a bad shape fails at construction with a clear message, not as a bare FieldError/BoundsError
# deep in `_layer_dict` at manifest-build time, or worse, a silently-wrong accent the client's
# `?? null` swallows (an out-of-range or short `index` just resolves to "no accent" there).
function _check_colors(colors, npoints)
    (colors === nothing || colors isa AbstractString) && return colors
    # One CSS colour per point: stored as the same deduplicated palette + 1-based index the
    # plot-object constructor builds, so the manifest carries each distinct colour once.
    if colors isa AbstractVector{<:AbstractString}
        length(colors) == npoints ||
            throw(ArgumentError("colors: expected one colour per point (got $(length(colors)) for $npoints points)"))
        palette = unique(String.(colors))
        slot = Dict(c => k for (k, c) in enumerate(palette))
        return (; palette, index = [slot[c] for c in colors])
    end
    if colors isa NamedTuple && haskey(colors, :palette) && haskey(colors, :index)
        palette, index = colors.palette, colors.index
        palette isa AbstractVector{<:AbstractString} ||
            throw(ArgumentError("colors: palette must be a Vector{<:AbstractString}, got $(typeof(palette))"))
        index isa AbstractVector{<:Integer} ||
            throw(ArgumentError("colors: index must be a Vector{<:Integer}, got $(typeof(index))"))
        length(index) == npoints ||
            throw(ArgumentError("colors: index must have one entry per point (got $(length(index)) for $npoints points)"))
        isempty(palette) && !isempty(index) &&
            throw(ArgumentError("colors: index is non-empty but palette is empty"))
        all(1 <= i <= length(palette) for i in index) ||
            throw(ArgumentError("colors: every index must be in 1:$(length(palette)) (palette has $(length(palette)) entries)"))
        return colors
    end
    throw(
        ArgumentError(
            "colors must be `nothing`, a CSS colour String, a Vector of CSS colour Strings (one per " *
                "point), or `(; palette::Vector{<:AbstractString}, index::Vector{<:Integer})`, got $(typeof(colors))",
        ),
    )
end

# Shared by every SegmentInteractable entry point (the keyword constructor and
# _segment_with_resolve, used by the HLines/VLines plot-object constructors) so a bad `tol`
# fails here, not as a raw InexactError from round(Int, ...) at manifest build.
_check_tol(tol) =
    isfinite(tol) && tol > 0 ||
    throw(ArgumentError("SegmentInteractable: tol must be finite and positive, got $tol"))

# ============================ PointInteractable ============================
"""
    PointInteractable(ax, points; id=:points, payloads=<auto>, radius=nothing, radius3d=nothing, tooltip=nothing, label=nothing)
    PointInteractable(ax, p::Makie.Scatter; id=:scatter, payloads=nothing, radius=nothing, tooltip=nothing, label=nothing)
    PointInteractable(ax, p::Makie.MeshScatter; id=:meshscatter, payloads=nothing, radius=nothing, radius3d=nothing, tooltip=nothing, label=nothing)

Scatter-style points, hit-tested as circles. Produces one `:circles` [`HitLayer`](@ref).

# Arguments
- `points` — data-space points, each a 2- or 3-element point/tuple (`Axis3` scatters use 3).
- `id` — the layer id; becomes `InteractionEvent.layer` on a hit.
- `payloads` — one entry per point (`ArgumentError` if the length doesn't match `points`), or a
  `DataFrame` with one row per point once DataFrames is loaded. Default: `(; index, x, y)`, or
  `(; index, x, y, z)` for 3-coordinate points — `index` is 1-based. A named-tuple, row, or
  `Dict` payload is merged onto the default: `(; name = "a")` gives `(; name, x, y)`, and a
  field the payload names itself (its own `x`) wins. `index` isn't added, since the event
  carries it as `ev.index`. A `Dict` merges when it is keyed by `Symbol` or `String`; any other
  payload (a bare string) replaces the default. Every plot-object constructor merges the same
  way onto its own default payload.
- `radius` — highlight and click-target radius in px (scaled to the rendered image's DPI): a
  number for every point, or a vector with one per point. Default `nothing`: use the drawn
  radius of the one `Scatter` on `ax` with these positions (see below), per point when its
  `markersize` is per point. If none matches, or more than one does, assume Makie's default
  `:circle` at the theme `markersize` (radius ≈0.3525×`markersize`; the theme default
  markersize is 9). Pass a number or vector to override. A matched marker with no readable bbox
  (a `Char`, an image, a per-element vector of markers) keeps the `markersize / 2` bound.
- `radius3d` — per-point data-space half-extents (`Vector{Makie.Vec3f}`), for markers whose
  on-screen size is camera/depth-dependent (e.g. `meshscatter`). When set, overrides `radius`
  with the radius of each point's projected outline: the longest semi-axis of the ellipsoid
  with these half-extents, as drawn. With Axis3's `perspectiveness` above 0 it can fall a
  few percent short (about 6% at `perspectiveness = 1`). Must have one entry per point
  (`ArgumentError` otherwise).
- `tooltip` — `nothing` for the auto name/value table (default), `masque"..."` for a template, or
  `false` to suppress. `tooltip = true` is rejected (`ArgumentError`; not meaningful).
- `label` — the layer's name, which screen readers announce when the keyboard moves to an
  element ("wild type, element 3 of 10: …"). Default `nothing` (no name); from a plot object,
  the plot's own Makie `label` when it is set to plain text, so `scatter!(…; label = "wild
  type")` names its layer. Pass `label = nothing` to leave it out. A `label` field in a
  payload, as `series!` gives each line, is different: it belongs to one element and shows in
  its tooltip.
- `colors` — an optional tooltip accent colour: one CSS colour string for every point, a
  `Vector` of CSS colour strings (one per point), or `(; palette, index)` with one 1-based
  `index` per point into `palette`. Default `nothing` (no accent). Not derived automatically
  here — only `PointInteractable(ax, p::Makie.Scatter)` resolves it, from `p`'s own colour.

# From a plot object
`PointInteractable(ax, p::Makie.Scatter)` is the usual call. It reads points from `p`'s
converted data and derives `radius` from the marker's drawn extent, not the full `markersize`
square — Makie's default `:circle` marker draws a disc of diameter ≈0.705·`markersize` (radius
≈0.3525·`markersize`), so that's what ships; other `default_marker_map()` symbols/`BezierPath`s
use their own bbox in the same way, a `GeometryBasics` `Circle`/`Rect` marker draws at the full
`markersize` (radius = `markersize / 2`), and anything else (a `Char` glyph, an image, a
per-element vector of markers) falls back to `markersize / 2` as a conservative bound. The
marker's outline is added where it is drawn: half of `strokewidth` on CairoMakie, which
centers the outline on the marker's edge, and all of it on WebGL, which paints it outside. This
requires `markerspace = :pixel` (the default); pass `radius=` explicitly for any other
markerspace, or it errors. `interactables(ax, p)` and `masque(fig)` build a `markerspace =
:data` scatter as a [`PolygonInteractable`](@ref) instead, one polygon per marker's drawn
shape, unless `radius` is passed. The points constructor above takes the same radius when exactly one
`Scatter` on `ax` has the same positions (including a `scatterlines!`/`stem!` child scatter);
it does not resolve `colors`. The overlay adds its own hit-test slack on top, so the smaller
radius doesn't make small markers harder to click. The scatter constructor also resolves
`colors` from `p.color[]`: a single colour (including a bare numeric value mapped through
`colormap`) ships
as one CSS string; a numeric (colormap-driven) or explicit per-point colour vector ships as a
shared palette + one index per point; anything else (e.g. no colour, or unresolvable) omits
`colors` — no accent, not an error. A value outside `colorrange` is clamped to the nearest
palette end rather than resolved through `lowclip`/`highclip`, so such a point's accent can
differ slightly from its marker's actual (clipped) colour. `PointInteractable(ax,
p::Makie.MeshScatter)` derives `radius3d` from `p`'s data-space `markersize` (a `Vec3f`, a
`Real`, or a per-element vector of either); pass `radius=`/`radius3d=` explicitly if it can't
be derived.

# Examples
```julia
pts = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0)]
scatter!(ax, first.(pts), last.(pts); markersize = 14)
PointInteractable(ax, pts)   # radius ≈ 0.3525 * 14, from that scatter

p = scatter!(ax, xs, ys; markersize = 14)
PointInteractable(ax, p)   # the usual call; same radius, and colors from p
```
"""
struct PointInteractable <: AbstractInteractable
    ax; points::Vector{Point3f}; id::Symbol; payloads::Vector{Any}
    # px, one for every point or one per point
    radius::Union{Float64, Vector{Float64}}
    # Data-space half-extents (meshscatter markers are data-sized); overrides `radius` with
    # the radius of the projected outline (`_px_radius3d`).
    radius3d::Union{Nothing, Vector{Makie.Vec3f}}
    tooltip::Union{Nothing, Markup, Bool}
    label::Union{Nothing, String}
    colors::Any
    # A scatter's `marker_offset`: how far each marker is drawn from its point, in px (y up),
    # one for every point or one per point. Moves the hit circle with the marker.
    offset::Union{Makie.Vec2f, Vector{Makie.Vec2f}}
    # A scatter's `strokewidth` in px. How much of it lies outside the marker depends on the
    # backend (`InteractionContext.marker_stroke`), so it is added to `radius` in `hitlayers`.
    stroke::Float64
    select::Symbol
end
PointInteractable(ax, points, id, payloads, radius, radius3d, tooltip, label, colors, offset, stroke) =
    PointInteractable(ax, points, id, payloads, radius, radius3d, tooltip, label, colors, offset, stroke, :one)
function PointInteractable(
        ax, points; id = :points, payloads = nothing,
        radius = nothing, radius3d = nothing, tooltip = nothing, label = nothing, colors = nothing,
        select = :one,
    )
    _check_select(PointInteractable, select)
    _check_tooltip(tooltip)
    pts = [_pt3(p) for p in points]
    defaults = _unconvert_payloads(
        ax, Any[
            length(p) >= 3 ?
                (; index = k, x = Float64(p[1]), y = Float64(p[2]), z = Float64(p[3])) :
                (; index = k, x = Float64(p[1]), y = Float64(p[2]))
                for (k, p) in enumerate(points)
        ]
    )
    pl = _merge_payloads(defaults, payloads, "PointInteractable")
    r3 = radius3d === nothing ? nothing : Vector{Makie.Vec3f}(radius3d)
    r3 === nothing || length(r3) == length(pts) ||
        throw(ArgumentError("radius3d must have one entry per point (got $(length(r3)) for $(length(pts)))"))
    colors = _check_colors(colors, length(pts))
    # `nothing` looks the radius up (`_point_radius`, introspect.jl). A passed number wins,
    # including the `9` the MeshScatter constructor still forwards when it has no pixel radius.
    r, s = radius === nothing ? _point_radius(ax, pts) : (radius, 0.0)
    r = _check_radius(r, length(pts))
    return PointInteractable(ax, pts, id, pl, r, r3, tooltip, label === nothing ? nothing : String(label), colors, Makie.Vec2f(0, 0), s, select)
end
function _check_radius(r, n)
    r isa AbstractVector || return Float64(r)
    length(r) == n ||
        throw(ArgumentError("radius must be a number or have one entry per point (got $(length(r)) for $n)"))
    return Vector{Float64}(r)
end
tooltip_spec(i::PointInteractable) = i.tooltip
# Outline radius of the ellipsoid with data-space semi-axes `e` around `p` (projected to `q`).
# Projecting `p ± eᵢ` gives the screen images `cᵢ` of its three semi-axes; the drawn outline is
# then the ellipse `M·(unit ball)` with `M = [c₁ c₂ c₃]`, whose longest semi-axis is `M`'s
# largest singular value (exact for Axis3's default orthographic camera). The largest single
# `|cᵢ|` falls short whenever the outline's long direction isn't along a data axis. Under
# perspective the near half of an axis projects longer than the far half, which the average in
# `cᵢ` hides, so the radius is never less than the longest single half. The edge points skip
# the Axis3 clip box: `hitlayers` already hides a sphere whose centre is clipped, and one whose
# edge crosses the limits keeps its full radius. A semi-axis whose projection isn't finite is
# left out.
function _px_radius3d(ctx, ax, p, e, q)
    all(isfinite, q) || return 0.0   # a clipped sphere, skipped by the hit layer anyway
    a = b = d = 0.0   # M·Mᵀ = [a b; b d]
    half = 0.0
    for i in 1:3
        o = ntuple(j -> j == i ? Float64(e[i]) : 0.0, 3)
        hi = data_to_image_px(ctx, ax, (p[1] + o[1], p[2] + o[2], p[3] + o[3]))
        lo = data_to_image_px(ctx, ax, (p[1] - o[1], p[2] - o[2], p[3] - o[3]))
        cx, cy = (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2
        isfinite(cx) && isfinite(cy) || continue
        a += cx^2
        b += cx * cy
        d += cy^2
        half = max(half, hypot(hi[1] - q[1], hi[2] - q[2]), hypot(q[1] - lo[1], q[2] - lo[2]))
    end
    return max(half, sqrt((a + d) / 2 + hypot((a - d) / 2, b)))
end
function hitlayers(i::PointInteractable, ctx)
    g = Real[]
    box = _clipbox(i.ax)
    for (k, p) in enumerate(i.points)
        q = _proj(ctx, i.ax, p, box)
        r = if i.radius3d !== nothing
            _px_radius3d(ctx, i.ax, p, i.radius3d[k], q)
        else
            ((i.radius isa Vector ? i.radius[k] : i.radius) + i.stroke * ctx.marker_stroke) * ctx.scaling
        end
        o = i.offset isa Vector ? i.offset[k] : i.offset
        cx, cy = q[1] + o[1] * ctx.scaling, q[2] - o[2] * ctx.scaling   # image px are y-down
        append!(g, (_q(cx), _q(cy), _q(r)))
    end
    return [HitLayer(i.id, :circles, g, i.payloads, axis_id(ctx, i.ax), events(i), i.label, i.colors)]
end

# ============================ SegmentInteractable ==========================
"""
    SegmentInteractable(ax, vertices; mode=:polyline, unit=:segment, id=:segments, payloads=nothing, tol=6, tooltip=nothing, label=nothing)
    SegmentInteractable(ax, p; id=<kind-specific>, payloads=nothing, tol=<from p's linewidth>, tooltip=nothing, label=nothing)   # from a plot object

Lines / polylines or disjoint segment pairs. Produces one `:polyline`, `:lines`, or `:segments`
[`HitLayer`](@ref).

# Arguments
- `vertices` — data-space points, each a 2- or 3-element point/tuple.
- `mode` — `:polyline` (default): `vertices` is one connected path. `:pairs`: `vertices` is
  disjoint pairs `(v1,v2), (v3,v4), …`, `length(vertices) ÷ 2` segments. Any other value raises
  `ArgumentError`.
- `unit` — what one element is. `:segment` (default): a `:polyline` path is hit per edge
  (`length(vertices) - 1` elements) and `:pairs` is hit per pair. `:line`: the whole path is
  one element (kind `:lines`) — the pointer still has to land within `tol` of some edge, and a
  `NaN` gap stays a gap in that one line. `:line` requires `mode = :polyline` (`ArgumentError`
  otherwise). This is how `lines!` / `stairs!` / a `scatterlines!` line are built; the raw
  vertex constructor stays per-segment unless you pass `unit = :line`.
- `id` — the layer id; becomes `InteractionEvent.layer` on a hit.
- `payloads` — one entry per element (per segment when `unit = :segment`, one entry when
  `unit = :line`); `ArgumentError` if the length doesn't match. Default: `(; segment_index)`
  (1-based) for `:segment`, `(; index)` (1-based) for `:line`.
- `tol` — hit-test slack around a segment, in logical px (scaled to the rendered image's DPI
  like [`PointInteractable`](@ref)'s `radius`). Must be finite and positive (`ArgumentError`
  otherwise). Shipped in the manifest as a per-layer `"tol"` field; the overlay's client-side
  default (`SEG_TOL` in `frontend/src/geometry.ts`, 8 image px) applies only when this field
  is absent. From a plot object the default is `max(6, linewidth / 2)`, so the whole drawn
  stroke responds (the largest `linewidth` of a per-element vector; `errorbars!`/`rangebars!`
  also take `whiskerwidth / 2`, so their whiskers respond).
- `tooltip` — `nothing` for the auto name/value table (default), `masque"..."` for a template, or
  `false` to suppress. `tooltip = true` is rejected (`ArgumentError`).
- `label` — the layer's name, which screen readers announce (see [`PointInteractable`](@ref)).
  Default `nothing`; from a plot object, the plot's own Makie `label`.

# From a plot object
`SegmentInteractable(ax, p)` reads vertices from `p` (no `mode`/`unit` keyword — those are fixed
by the plot type):

| `p` | default `id` | hit | vertices from |
|---|---|---|---|
| `Makie.Lines` | `:lines` | one `:lines` element, the whole path | converted data |
| `Makie.Stairs` | `:stairs` | one `:lines` element, the whole staircase | the child `Lines`' pre-expanded step polyline |
| `Makie.Series` | `:series` | one `:lines` layer, one element per series | each child line (or a `ScatterLines` child's line) |
| `Makie.LineSegments` | `:segments` | `:pairs`, per segment | converted data |
| `Makie.Wireframe` | `:wireframe` | `:pairs`, per drawn edge, each once, in drawing order (see below) | the child `LineSegments`' edges (incl. mesh-triangulation diagonals), an edge shared by two faces kept at its first copy |
| `Makie.Arrows3D` | `:arrows3d` | `:pairs`, per shaft | processed `startpoints`/`endpoints` (post-align/lengthscale); default payload `(; index, x, y, z, u, v, w)` from `points`/`directions` |
| `Makie.Arrows2D` | `:arrows2d` | `:pairs`, per arrow, tail to tip | processed `startpoints`/`endpoints` (post-align/lengthscale); default payload `(; index, x, y, u, v)` from `points`/`directions` |
| `Makie.Errorbars` | `:errorbars` | `:pairs`, per bar | each bar's low→high endpoints |
| `Makie.Rangebars` | `:rangebars` | `:pairs`, per bar | each bar's low→high endpoints |
| `Makie.HLines` | `:hlines` | `:pairs`, per line | each line's rendered span (`xmin`/`xmax` fractions of the axis; default 0–1 is the full limits; re-resolved on limit changes) |
| `Makie.VLines` | `:vlines` | `:pairs`, per line | each line's rendered span (`ymin`/`ymax` fractions of the axis; default 0–1 is the full limits; re-resolved on limit changes) |

A `series!` element's default payload is `(; index, label)` when the child plot's label is a
non-empty string (Makie's own default is `"series k"`), otherwise `(; index)`.

A `wireframe!`'s edges come in Makie's drawing order (face by face), with an edge two faces
share kept where it first appears. Edge `k`'s endpoints are
`SegmentInteractable(ax, w).vertices[2k-1:2k]`, and half the length of `vertices` is the edge
count a `payloads` vector must match.

# Examples
```julia
p = lines!(ax, xs, ys)
SegmentInteractable(ax, p)                       # one element: the whole line

SegmentInteractable(ax, [(0,0), (1,1), (2,0)]; mode = :polyline)          # per segment
SegmentInteractable(ax, [(0,0), (1,1), (2,0)]; mode = :polyline, unit = :line)  # one element
```
"""
struct SegmentInteractable <: AbstractInteractable
    ax; vertices::Vector{Point3f}; mode::Symbol; id::Symbol; payloads::Vector{Any}; tol::Float64; tooltip::Union{Nothing, Markup, Bool}
    # When set, hitlayers calls resolve(ax) instead of using the stored vertices — for geometry
    # (e.g. HLines/VLines fractions of the axis limits) only correct after construction.
    resolve::Union{Nothing, Function}
    label::Union{Nothing, String}
    # :segment = one element per edge (:polyline) or pair (:pairs). :line = the whole path is
    # one element (kind :lines). `paths` is set for a multi-line :line layer (series!); nothing
    # means `vertices` is the single path.
    unit::Symbol
    paths::Union{Nothing, Vector{Vector{Point3f}}}
    # The plot's own points per line, which a hover readout shows, with the staircase step mode
    # when the drawn path adds a corner between samples. Placement (`translate!`, …) moves the
    # drawn path, never these. `nothing` reads the samples from the path itself.
    samples::Union{Nothing, Tuple{Union{Nothing, Symbol}, Vector{Vector{Point3d}}}}
    select::Symbol
end
SegmentInteractable(ax, vertices, mode, id, payloads, tol, tooltip, resolve, label, unit, paths, samples) =
    SegmentInteractable(ax, vertices, mode, id, payloads, tol, tooltip, resolve, label, unit, paths, samples, :one)
function SegmentInteractable(
        ax, vertices; mode = :polyline, unit = :segment, id = :segments,
        payloads = nothing, tol = 6, tooltip = nothing, label = nothing, select = :one,
    )
    _check_tooltip(tooltip)
    _check_select(SegmentInteractable, select)
    mode in (:polyline, :pairs) ||
        throw(ArgumentError("SegmentInteractable: mode must be :polyline or :pairs, got :$mode"))
    unit in (:segment, :line) ||
        throw(ArgumentError("SegmentInteractable: unit must be :segment or :line, got :$unit"))
    unit === :line && mode !== :polyline &&
        throw(ArgumentError("SegmentInteractable: unit=:line applies only to mode=:polyline, got mode=:$mode"))
    _check_tol(tol)
    vs = [_pt3(v) for v in vertices]
    pl = if unit === :line
        payloads === nothing ? Any[(; index = 1)] : _check_payloads(payloads, 1, "SegmentInteractable")
    else
        nseg = mode === :polyline ? max(0, length(vs) - 1) : length(vs) ÷ 2
        payloads === nothing ? Any[(; segment_index = k) for k in 1:nseg] : _check_payloads(payloads, nseg, "SegmentInteractable")
    end
    return SegmentInteractable(
        ax, vs, mode, id, pl, Float64(tol), tooltip, nothing,
        label === nothing ? nothing : String(label), unit, nothing,
        # A line's data points keep full precision for the `@bind` pick; `vs` is Float32.
        unit === :line ? (nothing, [[_pt3d(v) for v in vertices]]) : nothing, select,
    )
end
# Internal-only: construct with a lazy `resolve(ax) -> vertices`. Called directly by the
# HLines/VLines plot-object constructors (src/introspect.jl), bypassing the keyword
# constructor above — validate `tol` here too, or a user-supplied bad `tol` on those two
# recipes skips the check entirely. Those recipes are per-segment pairs, so `unit` stays
# `:segment`.
function _segment_with_resolve(ax, vertices, mode, id, payloads, tol, resolve; tooltip = nothing, label = nothing)
    _check_tol(tol)
    _check_tooltip(tooltip)
    return SegmentInteractable(
        ax, [_pt3(v) for v in vertices], mode, id, payloads, Float64(tol), tooltip, resolve,
        label === nothing ? nothing : String(label), :segment, nothing, nothing,
    )
end
# One `:lines` layer whose elements are whole polylines (a `series!`, or any caller that
# already has N paths). `paths` entries are data-space vertex lists; NaN gaps stay inside
# the path they belong to.
function _whole_lines(ax, paths, id, payloads, tol, label; tooltip = nothing)
    _check_tol(tol)
    _check_tooltip(tooltip)
    ps = [[_pt3(v) for v in path] for path in paths]
    n = length(ps)
    pl = payloads === nothing ? Any[(; index = k) for k in 1:n] : _check_payloads(payloads, n, "SegmentInteractable")
    vs = n == 0 ? Point3f[] : ps[1]
    return SegmentInteractable(
        ax, vs, :polyline, id, pl, Float64(tol), tooltip, nothing,
        label === nothing ? nothing : String(label), :line, ps, nothing,
    )
end
tooltip_spec(i::SegmentInteractable) = i.tooltip
hit_tol(i::SegmentInteractable) = i.tol
function _flat_px(ctx, ax, vs, box = _clipbox(ax))
    g = Real[]
    for v in vs
        q = _proj(ctx, ax, v, box); append!(g, (_q(q[1]), _q(q[2])))
    end
    return g
end
# Lines on a zoomed `Axis3`: Makie's clip planes cut a line where it leaves the limits, so the
# part still drawn keeps a hit. Each edge is clipped to the box in data space and the clipped
# ends are projected; only what lies wholly outside becomes a gap.
_all_finite(v) = all(x -> x isa Real && isfinite(x), (v[1], v[2], length(v) >= 3 ? v[3] : 0.0))
_needs_clip(box, vs) = box !== nothing && !all(v -> _in_clipbox(box, v), vs)
function _edge_px(ctx, ax, box, a, b)
    (_all_finite(a) && _all_finite(b)) || return nothing
    t = _clip_segment(box, _pt3(a), _pt3(b))
    t === nothing && return nothing
    at(s) = data_to_image_px(ctx, ax, Tuple(Float64.(_pt3(a)) .+ s .* (Float64.(_pt3(b)) .- Float64.(_pt3(a)))))
    return t, at(t[1]), at(t[2])
end
_push_px!(g, q) = append!(g, (_q(q[1]), _q(q[2])))
# One connected path (`:lines`): runs of visible edges, NaN-separated.
function _clipped_path_px(ctx, ax, vs, box)
    _needs_clip(box, vs) || return _flat_px(ctx, ax, vs, box)
    g = Real[]
    open = false   # g ends on the previous edge's far end, so the next edge continues from it
    for k in 1:(length(vs) - 1)
        e = _edge_px(ctx, ax, box, vs[k], vs[k + 1])
        if e === nothing
            open = false
            continue
        end
        (t0, t1), a, b = e
        if !(open && t0 == 0)
            isempty(g) || isnan(g[end]) || append!(g, (NaN32, NaN32))
            _push_px!(g, a)
        end
        _push_px!(g, b)
        open = t1 == 1
    end
    return g
end
# Vertex pairs (`:segments`), one pair per edge kept in place so element k stays edge k.
function _clipped_pairs_px(ctx, ax, vs, box)
    _needs_clip(box, vs) || return _flat_px(ctx, ax, vs, box)
    g = Real[]
    for k in 1:2:(length(vs) - 1)
        e = _edge_px(ctx, ax, box, vs[k], vs[k + 1])
        if e === nothing
            append!(g, (NaN32, NaN32, NaN32, NaN32))
        else
            _push_px!(g, e[2]); _push_px!(g, e[3])
        end
    end
    isodd(length(vs)) && append!(g, _flat_px(ctx, ax, vs[end:end], box))
    return g
end
# One line's samples as `[x1, y1, x2, y2, …]`. On a categorical or date axis a coordinate is
# shown as the label or date the user plotted, the same text a scatter's default payload holds.
# The manifest ships Float32; the `@bind` pick reads the same samples as Float64.
function _flat_data(ax, vs, ::Type{T} = Float32) where {T}
    g = T[]
    for v in vs
        push!(g, v[1], v[2])
    end
    _converts_dim(ax) || return g
    u = _unconvert_payloads(ax, Any[(; x = v[1], y = v[2]) for v in vs])
    return Any[c for pl in u for c in (pl.x, pl.y)]
end
_converts_dim(ax) = any((:dim1_conversion, :dim2_conversion)) do d
    hasproperty(ax, d) || return false
    c = getproperty(ax, d)[]
    return c isa Makie.CategoricalConversion || c isa Makie.DateTimeConversion
end
function hitlayers(i::SegmentInteractable, ctx)
    if i.unit === :line
        raw = if i.paths !== nothing
            i.paths
        else
            vs = i.resolve === nothing ? i.vertices : [_pt3(v) for v in i.resolve(i.ax)]
            [vs]
        end
        box = _clipbox(i.ax)
        geom = [_clipped_path_px(ctx, i.ax, path, box) for path in raw]
        aid = axis_id(ctx, i.ax)
        # The readout's samples. Axis3 has no 2D sample to show the cursor's position on a path.
        points, step = if ctx.transforms[aid].is3d
            nothing, nothing
        else
            [_flat_data(i.ax, path) for path in _sample_paths(i, raw)], _step(i)
        end
        return [HitLayer(i.id, :lines, geom, i.payloads, aid, events(i), i.label, nothing, nothing, points, step)]
    end
    vs = i.resolve === nothing ? i.vertices : [_pt3(v) for v in i.resolve(i.ax)]
    box = _clipbox(i.ax)
    aid = axis_id(ctx, i.ax)
    i.mode === :polyline || return [HitLayer(i.id, :segments, _clipped_pairs_px(ctx, i.ax, vs, box), i.payloads, aid, events(i), i.label)]
    _needs_clip(box, vs) || return [HitLayer(i.id, :polyline, _flat_px(ctx, i.ax, vs, box), i.payloads, aid, events(i), i.label)]
    # A clipped edge's ends no longer meet its neighbours', so a path cut by the limits ships as
    # one pair per edge: element k is still edge k.
    pairs = [vs[k + j] for k in 1:(length(vs) - 1) for j in 0:1]
    return [HitLayer(i.id, :segments, _clipped_pairs_px(ctx, i.ax, pairs, box), i.payloads, aid, events(i), i.label)]
end

# Each line's data samples, as plotted. A line built without samples reads them off its path.
_sample_paths(i::SegmentInteractable, raw = nothing) = i.samples !== nothing ? i.samples[2] :
    raw !== nothing ? raw : i.paths !== nothing ? i.paths :
    [i.resolve === nothing ? i.vertices : [_pt3(v) for v in i.resolve(i.ax)]]
_step(i::SegmentInteractable) = i.samples === nothing ? nothing : i.samples[1]
# Line `k`'s samples `[x1, y1, …]` at full precision, for the `@bind` pick; `nothing` when the
# owner isn't a line of data points.
_line_data(i::SegmentInteractable, k) = i.unit === :line ? _flat_data(i.ax, _sample_paths(i)[k], Float64) : nothing
_line_data(i, k) = nothing

# ============================ RectInteractable =============================
"""
    RectInteractable(ax, rects; id=:rects, payloads=nothing, tooltip=nothing, clamp_to_viewport=false, label=nothing)
    RectInteractable(ax, p; id=<kind-specific>, payloads=nothing, tooltip=nothing, label=nothing)   # from a plot object

Axis-aligned rectangles from an explicit list (bars, boxes). Produces one `:rects`
[`HitLayer`](@ref). For a heatmap or image grid, use [`GridInteractable`](@ref).

# Arguments
- `rects` — data-space boxes `[(xc, yc, w, h), …]` (center + width/height).
- `id` — the layer id; becomes `InteractionEvent.layer` on a hit. Default `:rects`.
- `payloads` — one entry per rect; `ArgumentError` if the length doesn't match. Default:
  `(; index)`, 1-based.
- `tooltip` — `nothing` for the auto name/value table (default), `masque"..."` for a template, or
  `false` to suppress. `tooltip = true` is rejected (`ArgumentError`).
- `clamp_to_viewport` — clamp each rect's pixel bounds to the axis viewport (inward rounding,
  so integer quantization never expands past the edge) before shipping geometry. Used
  internally by the `HSpan`/`VSpan` introspection methods below; rarely needed directly.
  Default `false`.
- `label` — the layer's name, which screen readers announce (see [`PointInteractable`](@ref)).
  Default `nothing`; from a plot object, the plot's own Makie `label`.

# From a plot object
`RectInteractable(ax, p)` builds `rects` and default payloads from `p`. A key-value `payloads`
entry is merged onto that default, as for [`PointInteractable`](@ref):

| `p` | default `id` | notes |
|---|---|---|
| `Makie.BarPlot` | `:bars` | reads the laid-out child `Poly` (dodge/stack/auto-width honored); payload `(; low, high, value)` |
| `Makie.Spy` | `:spy` | cell size from the child `Scatter`'s data-space `markersize` (length-2 vector or scalar; other shapes error) |
| `Makie.Hist` | `:hist` | payload `(; value, low, high)` (`value` is a count only for `normalization = :none`) |
| `Makie.Waterfall` | `:waterfall` | payload `(; low, high, value)` |
| `Makie.CrossBar` | `:crossbar` | payload `(; midpoint, low, high)` |
| `Makie.HSpan` | `:hspan` | spans the full x-range of `ax`'s current limits; `clamp_to_viewport = true`; payload `(; low, high)` (y-bounds); re-resolved on limit changes |
| `Makie.VSpan` | `:vspan` | spans the full y-range of `ax`'s current limits; `clamp_to_viewport = true`; payload `(; low, high)` (x-bounds); re-resolved on limit changes |

# Examples
```julia
RectInteractable(ax, [(0.0, 0.0, 1.0, 1.0)]; payloads = [(; label = "a")])

p = barplot!(ax, 1:3, [2, 5, 3])
RectInteractable(ax, p)
```
"""
struct RectInteractable <: AbstractInteractable
    ax; data::Vector{NTuple{4, Float64}}; id::Symbol; payloads::Vector{Any}; tooltip::Union{Nothing, Markup, Bool}
    # Spans only: clamp the pixel rect to the axis viewport with inward rounding (ceil near
    # edge, floor far edge) so integer quantization never expands it past the bounds.
    clamp_to_viewport::Bool
    # Same resolve-in-hitlayers mechanism as SegmentInteractable.resolve.
    resolve::Union{Nothing, Function}
    label::Union{Nothing, String}
    # px of hit slack outside each rect: half a plot's drawn outline. 0 = none.
    tol::Float64
    select::Symbol
end
RectInteractable(ax, data, id, payloads, tooltip, clamp_to_viewport, resolve, label) =
    RectInteractable(ax, data, id, payloads, tooltip, clamp_to_viewport, resolve, label, 0.0)
RectInteractable(ax, data, id, payloads, tooltip, clamp_to_viewport, resolve, label, tol) =
    RectInteractable(ax, data, id, payloads, tooltip, clamp_to_viewport, resolve, label, tol, :one)
function RectInteractable(
        ax, rects::AbstractVector; id = :rects, payloads = nothing,
        tooltip = nothing, clamp_to_viewport = false, label = nothing, select = :one,
    )
    _check_tooltip(tooltip)
    _check_select(RectInteractable, select)
    lbl = label === nothing ? nothing : String(label)
    rs = [(Float64(r[1]), Float64(r[2]), Float64(r[3]), Float64(r[4])) for r in rects]
    pl = payloads === nothing ? Any[(; index = k) for k in 1:length(rs)] : _check_payloads(payloads, length(rs), "RectInteractable")
    return RectInteractable(ax, rs, id, pl, tooltip, clamp_to_viewport, nothing, lbl, 0.0, select)
end
# Internal-only: construct a RectInteractable with a lazy `resolve(ax) -> rects`.
function _rect_with_resolve(ax, rects, id, payloads, clamp_to_viewport, resolve; tooltip = nothing, label = nothing)
    _check_tooltip(tooltip)
    rs = [(Float64(r[1]), Float64(r[2]), Float64(r[3]), Float64(r[4])) for r in rects]
    return RectInteractable(
        ax, rs, id, payloads, tooltip, clamp_to_viewport, resolve, label === nothing ? nothing : String(label),
    )
end
tooltip_spec(i::RectInteractable) = i.tooltip
hit_tol(i::RectInteractable) = i.tol > 0 ? i.tol : nothing
function hitlayers(i::RectInteractable, ctx)
    rects = i.resolve === nothing ? i.data : i.resolve(i.ax)
    g = Real[]
    vp = i.clamp_to_viewport ? ctx.transforms[axis_id(ctx, i.ax)].viewport : nothing
    for (xc, yc, w, h) in rects
        a = _proj(ctx, i.ax, (xc - w / 2, yc - h / 2)); b = _proj(ctx, i.ax, (xc + w / 2, yc + h / 2))
        cx = (a[1] + b[1]) / 2; cy = (a[2] + b[2]) / 2
        ww = abs(b[1] - a[1]); hh = abs(b[2] - a[2])
        if vp === nothing || !all(isfinite, (cx, cy, ww, hh))
            append!(g, (_q(cx), _q(cy), _q(ww), _q(hh)))
        else
            # ceil/floor on NaN/Inf throws, so non-finite coords take the _q path above.
            vp_x, vp_y, vp_w, vp_h = vp
            x_lo = ceil(Int, max(cx - ww / 2, vp_x))
            x_hi = floor(Int, min(cx + ww / 2, vp_x + vp_w))
            y_lo = ceil(Int, max(cy - hh / 2, vp_y))
            y_hi = floor(Int, min(cy + hh / 2, vp_y + vp_h))
            px_w = max(0, x_hi - x_lo); px_h = max(0, y_hi - y_lo)
            append!(g, (round(Int, (x_lo + x_hi) / 2), round(Int, (y_lo + y_hi) / 2), px_w, px_h))
        end
    end
    return [HitLayer(i.id, :rects, g, i.payloads, axis_id(ctx, i.ax), events(i), i.label)]
end

# ============================ GridInteractable =============================
"""
    GridInteractable(ax, xedges, yedges, values; id=:cells, payloads=nothing, tooltip=nothing, label=nothing)
    GridInteractable(ax, p::Union{Makie.Heatmap, Makie.Image}; id=:cells, payloads=nothing, tooltip=nothing, label=nothing)

A binned grid, such as a heatmap or image. Produces one `:grid` [`HitLayer`](@ref). A click
commits a [`GridCellEvent`](@ref) with the cell's `(i, j)` and value.

# Arguments
- `xedges`, `yedges` — cell-edge vectors (length `ncols+1`/`nrows+1`), each strictly
  ascending or descending; `ArgumentError` otherwise.
- `values` — an `(ncols, nrows)` `Matrix` of per-cell values. Shape mismatch raises
  `ArgumentError`.
- `id` — the layer id; becomes `InteractionEvent.layer` on a hit. Default `:cells`.
- `payloads` — optional data for each cell: a matrix the same shape as `values`, or a function
  `(i, j) -> payload` called once per cell. A click's [`GridCellEvent`](@ref) carries the
  cell's payload, and its fields read through (`ev.row`). Every payload ships with the widget,
  so a large grid with payloads makes a large page. Default `nothing`.
- `tooltip` — `nothing` for the default (default): `(i,j) = value`, or with `payloads` a table
  of the payload's fields and `value`. `masque"..."` is a template that can use `i`, `j`,
  `value` and the payload's fields; `false` suppresses it. `tooltip = true` is rejected
  (`ArgumentError`).
- `label` — the layer's name (see [`PointInteractable`](@ref)); from a plot object, the plot's
  own Makie `label`. It is stored and shipped, but has no effect yet: a grid is not
  keyboard-navigable.

When a cell is at least one screen pixel, the manifest carries `values` (row-major). Below
that it carries `sample`: one source value per screen pixel of the axis viewport, the cell
under that pixel's center. A pixel whose center misses the grid is `NaN` and is not a hit. A
source cell that is itself `NaN`, `Inf`, or `missing` is still that cell (`missing` is stored
as `NaN`). A matrix that is not real-valued (a color `image!`) ships edges only on this
branch: the cell index, no numeric value. Clicks still carry that center cell, so `A[cell]`
indexes it.

The plot-object form reads edges and values from a `heatmap!` or `image!` plot.

# Examples
```julia
xedges = 0:0.5:2; yedges = 0:1:3; vals = rand(4, 3)
GridInteractable(ax, xedges, yedges, vals)

p = heatmap!(ax, X, Y, Z)
GridInteractable(ax, p)

xs = ["a", "b", "c", "d"]; ys = ["p", "q", "r"]  # i runs along x, j along y
GridInteractable(ax, xedges, yedges, vals; payloads = (i, j) -> (; x = xs[i], y = ys[j]),
    tooltip = masque"(\$(x), \$(y)) = \$(value)")
```
"""
struct GridInteractable <: AbstractInteractable
    ax; xedges::Vector{Float64}; yedges::Vector{Float64}; values::AbstractMatrix
    id::Symbol; tooltip::Union{Nothing, Markup, Bool}; label::Union{Nothing, String}
    # Row-major like the shipped `values` (cell `(i, j)` at `(j-1)*ncols + i`); empty for none.
    payloads::Vector{Any}
end
# The 7-field form from before `payloads` existed: a grid with no payloads.
GridInteractable(ax, xedges, yedges, values, id, tooltip, label) =
    GridInteractable(ax, xedges, yedges, values, id, tooltip, label, Any[])
# One payload per cell, row-major. `payloads` is a `(ncols, nrows)` matrix or `(i, j) -> payload`.
function _grid_payloads(payloads, ncols, nrows)
    payloads === nothing && return Any[]
    payloads isa Function && return Any[payloads(c, r) for r in 1:nrows for c in 1:ncols]
    payloads isa AbstractMatrix && size(payloads) == (ncols, nrows) &&
        return Any[payloads[c, r] for r in 1:nrows for c in 1:ncols]
    throw(
        ArgumentError(
            "GridInteractable: `payloads` must be a matrix the same shape as `values` " *
                "$((ncols, nrows)) or a function `(i, j) -> payload`, got " *
                "$(payloads isa AbstractArray ? "an array of size $(size(payloads))" : typeof(payloads))",
        ),
    )
end
function GridInteractable(ax, xedges, yedges, values; id = :cells, payloads = nothing, tooltip = nothing, label = nothing)
    _check_tooltip(tooltip)
    xe = collect(Float64, xedges); ye = collect(Float64, yedges)
    # geometry.ts's findBin binary-searches these edges assuming strict monotonicity (asc or
    # desc); a non-monotone array silently picks a different (still-plausible-looking) bin
    # instead of erroring, so reject it here rather than let it degrade silently client-side.
    (issorted(xe) || issorted(xe; rev = true)) ||
        throw(ArgumentError("GridInteractable: `xedges` must be monotonic (ascending or descending)"))
    (issorted(ye) || issorted(ye; rev = true)) ||
        throw(ArgumentError("GridInteractable: `yedges` must be monotonic (ascending or descending)"))
    expected = (length(xe) - 1, length(ye) - 1)
    values isa AbstractMatrix && size(values) == expected || throw(
        ArgumentError(
            "GridInteractable: `values` must be a Matrix with shape (length(xedges)-1, length(yedges)-1) " *
                "= $(expected), got $(values isa AbstractMatrix ? size(values) : typeof(values))",
        ),
    )
    return GridInteractable(
        ax, xe, ye, values, id, tooltip, label === nothing ? nothing : String(label),
        _grid_payloads(payloads, expected...),
    )
end
tooltip_spec(i::GridInteractable) = i.tooltip
function hitlayers(i::GridInteractable, ctx)
    xe, ye, vals = i.xedges, i.yedges, i.values
    y0 = ye[1]
    xedges = Real[_q(_proj(ctx, i.ax, (x, y0))[1]) for x in xe]
    x0 = xe[1]
    yedges = Real[_q(_proj(ctx, i.ax, (x0, y))[2]) for y in ye]
    # A DomainError inside the projection closure (e.g. log10 of a non-positive edge on a
    # log-scale axis) degrades to a NaN point (`backend.jl`'s `_project_closure`), and `_q`
    # passes non-finite values through unchanged. geometry.ts's findBin assumes finite,
    # strictly monotonic edges — a NaN edge would silently pick a bogus bin (wrong tooltip/
    # bond) instead of the old linear scan's clean no-hit. Fail loud instead.
    all(isfinite, xedges) && all(isfinite, yedges) || throw(
        ArgumentError(
            "GridInteractable: xedges/yedges projected to a non-finite pixel coordinate " *
                "(check for a log-scale axis with a non-positive bin edge)",
        ),
    )
    ncols, nrows = length(xe) - 1, length(ye) - 1
    geom = Dict{String, Any}(
        "xedges" => xedges, "yedges" => yedges, "ncols" => ncols, "nrows" => nrows
    )
    cell_px = min(
        abs(xedges[end] - xedges[1]) / ncols,
        abs(yedges[end] - yedges[1]) / nrows,
    ) * ctx.display_scale
    if cell_px >= GRID_VALUES_MIN_SCREEN_PX
        # A non-real matrix (a color image) ships edges only, as on the sampled branch.
        if _sampleable(eltype(vals))
            geom["values"] = Float32[_sample_value(vals[c, r]) for r in 1:nrows for c in 1:ncols]  # row-major: r*ncols+c
        end
    else
        vp = ctx.transforms[axis_id(ctx, i.ax)].viewport
        sampled = _grid_sample(xedges, yedges, vals, vp, ctx.display_scale)
        if sampled !== nothing
            geom["sample"] = sampled.sample
            geom["sncols"] = sampled.sncols
            geom["snrows"] = sampled.snrows
            geom["sample_origin"] = sampled.origin
            geom["sample_span"] = sampled.span
            geom["sample_px"] = sampled.sample_px
        end
    end
    return [HitLayer(i.id, :grid, geom, i.payloads, axis_id(ctx, i.ax), events(i), i.label)]
end

# ============================ SurfaceInteractable ==========================
"""
    SurfaceInteractable(ax, x, y, z; id=:surface, value=nothing, payloads=nothing, tooltip=nothing, label=nothing)
    SurfaceInteractable(ax, p::Makie.Surface; id=:surface, payloads=nothing, tooltip=nothing, label=<p's label>)

A 3D surface on an `Axis3`. Produces one `:surface` [`HitLayer`](@ref). The pointer lands in one
of the surface's drawn quads and answers with the data point at the quad's corner nearest the
pointer, on the side of the surface you can see. A click commits a [`GridCellEvent`](@ref) with
the point's `(i, j)` and `value = z[i, j]`, so `z[pick]` (or any matrix of `z`'s shape) reads it.

# Arguments
- `x`, `y` — the grid, as in `surface!`: vectors of length `size(z, 1)` and `size(z, 2)`, or
  matrices the shape of `z`.
- `z` — the heights, a real matrix. A point with a non-finite corner in all its quads is not
  drawn and cannot be hovered.
- `value` — optional: a real matrix the shape of `z` that colours the surface (`surface!`'s
  `color`). The tooltip then shows it as `value`.
- `id` — the layer id; becomes `InteractionEvent.layer` on a hit. Default `:surface`.
- `payloads` — optional data for each point: a matrix the shape of `z`, or a function
  `(i, j) -> payload`. Its fields join the point's own (`i`, `j`, `x`, `y`, `z`, `value`) in the
  tooltip and win where a name is shared; the click's `GridCellEvent` carries it and its fields
  read through. Default `nothing`.
- `tooltip` — `nothing` for the default table of `i`, `j`, `x`, `y`, `z` (and `value`),
  `masque"..."` for a template over those fields, or `false` to suppress. `tooltip = true` is
  rejected (`ArgumentError`).
- `label` — the layer's name (see [`PointInteractable`](@ref)). A surface is not
  keyboard-navigable, so it has no effect yet.

A dense grid is thinned: along each grid direction, at most one point ships for every 4 screen
pixels of the axis's longer side, with the last row and column always kept.
A point that is not shipped cannot be hovered; at that density it is smaller than a pixel. The
stride depends on the axis size only, so it stays the same as the view turns.

Quads with a corner outside the axis limits are not hit, as CairoMakie does not draw them.
Between this layer and another plot on the same axis, the plot drawn last still wins.

# Examples
```julia
xs = range(-2, 2; length = 40); ys = xs
zs = [exp(-(x^2 + y^2)) for x in xs, y in ys]
p = surface!(ax, xs, ys, zs)
SurfaceInteractable(ax, p)
SurfaceInteractable(ax, xs, ys, zs; tooltip = masque"z = \$(z)")
```
"""
struct SurfaceInteractable <: AbstractInteractable
    ax
    # Where each point is drawn, data space, after the plot's own transformation.
    pos::Matrix{Point3f}
    # The data each point reports: x, y vectors (length size(z, 1) / size(z, 2)) or matrices.
    x::Union{Vector{Float32}, Matrix{Float32}}
    y::Union{Vector{Float32}, Matrix{Float32}}
    z::Matrix{Float32}
    value::Union{Nothing, Matrix{Float32}}
    id::Symbol
    payloads::Union{Nothing, Matrix{Any}, Function}   # a function is called at shipped points only
    tooltip::Union{Nothing, Markup, Bool}
    label::Union{Nothing, String}
end

# A real matrix, or `nothing` for anything else (a colour matrix, a symbol, one number).
_surface_matrix(v, sz) = v isa AbstractMatrix{<:Union{Real, Missing}} && size(v) == sz ?
    Float32[_sample_value(a) for a in v] : nothing

function _surface_axis(v, n, d, sz, name)
    v isa AbstractVector && length(v) == n && return Float32[_sample_value(a) for a in v]
    v isa AbstractMatrix && size(v) == sz && return Float32[_sample_value(a) for a in v]
    throw(
        ArgumentError(
            "SurfaceInteractable: `$name` must be a vector of length size(z, $d) = $n or a matrix " *
                "of size $sz, got $(v isa AbstractArray ? "an array of size $(size(v))" : typeof(v))",
        ),
    )
end

_surface_at(v::AbstractVector, a, b, d) = v[d == 1 ? a : b]
_surface_at(v::AbstractMatrix, a, b, d) = v[a, b]

function SurfaceInteractable(
        ax, x, y, z; id = :surface, value = nothing, payloads = nothing, tooltip = nothing, label = nothing,
    )
    _check_tooltip(tooltip)
    z isa AbstractMatrix{<:Union{Real, Missing}} ||
        throw(ArgumentError("SurfaceInteractable: `z` must be a real matrix, got $(typeof(z))"))
    sz = size(z)
    xs = _surface_axis(x, sz[1], 1, sz, "x")
    ys = _surface_axis(y, sz[2], 2, sz, "y")
    zs = Float32[_sample_value(a) for a in z]
    vs = value === nothing ? nothing : _surface_matrix(value, sz)
    value === nothing || vs !== nothing || throw(
        ArgumentError("SurfaceInteractable: `value` must be a real matrix of size $sz, got $(typeof(value))"),
    )
    pos = Point3f[Point3f(_surface_at(xs, a, b, 1), _surface_at(ys, a, b, 2), zs[a, b]) for a in 1:sz[1], b in 1:sz[2]]
    pl = payloads === nothing ? nothing :
        payloads isa Function ? payloads :
        payloads isa AbstractMatrix && size(payloads) == sz ? Matrix{Any}(payloads) :
        throw(
            ArgumentError(
                "SurfaceInteractable: `payloads` must be a matrix the same shape as `z` $sz or a " *
                "function `(i, j) -> payload`, got " *
                "$(payloads isa AbstractArray ? "an array of size $(size(payloads))" : typeof(payloads))",
            ),
        )
    return SurfaceInteractable(ax, pos, xs, ys, zs, vs, id, pl, tooltip, label === nothing ? nothing : String(label))
end
tooltip_spec(i::SurfaceInteractable) = i.tooltip
validate(i::SurfaceInteractable, ctx::InteractionContext) =
    ctx.transforms[axis_id(ctx, i.ax)].is3d ? nothing :
    "SurfaceInteractable :$(i.id): a surface is hit-tested on an `Axis3` only (a 2D `Axis` is roadmap scope)"

# Shipped source indices along one grid direction of `n` points, at most about `cap` of them:
# every `s`-th, and always the last, so the surface's edge answers. The stride is a whole
# number, so a grid just past the cap ships about half as many points as one just under it
# (126 ships whole under a cap of 126; 130 ships 66), and both stay under the cap.
function _surface_stride(n, cap)
    s = cld(n, max(cap, 1))
    s <= 1 && return collect(1:n)
    I = collect(1:s:n)
    last(I) == n || push!(I, n)
    return I
end

function hitlayers(i::SurfaceInteractable, ctx)
    ni0, nj0 = size(i.z)
    vp = ctx.transforms[axis_id(ctx, i.ax)].viewport
    cap = floor(Int, max(vp[3], vp[4]) * ctx.display_scale / SURFACE_MIN_SCREEN_PX)
    I, J = _surface_stride(ni0, cap), _surface_stride(nj0, cap)
    ni, nj = length(I), length(J)
    # Shipped points are row-major over (ni, nj): point (a, b) is entry a + (b - 1) * ni.
    pts = Point3f[i.pos[a, b] for b in J for a in I]
    px, py, depth = _project_depth(ctx, i.ax, pts)
    box = _clipbox(i.ax)
    ok = [all(isfinite, p) && (box === nothing || _in_clipbox(box, p)) && isfinite(px[k]) && isfinite(py[k]) for (k, p) in enumerate(pts)]
    xy = Real[]
    sizehint!(xy, 2 * length(pts))
    for k in eachindex(pts)
        ok[k] ? append!(xy, (_q(px[k]), _q(py[k]))) : append!(xy, (NaN32, NaN32))
    end
    order, d = _surface_order(ok, depth, ni, nj)
    geom = Dict{String, Any}(
        "ni" => ni, "nj" => nj, "i" => I .- 1, "j" => J .- 1, "xy" => xy, "order" => order,
        "x" => i.x isa Vector ? i.x[I] : Float32[i.x[a, b] for b in J for a in I],
        "y" => i.y isa Vector ? i.y[J] : Float32[i.y[a, b] for b in J for a in I],
        "z" => Float32[i.z[a, b] for b in J for a in I],
    )
    i.value === nothing || (geom["value"] = Float32[i.value[a, b] for b in J for a in I])
    pl = i.payloads === nothing ? Any[] :
        i.payloads isa Function ? Any[i.payloads(a, b) for b in J for a in I] : Any[i.payloads[a, b] for b in J for a in I]
    return [HitLayer(i.id, :surface, geom, pl, axis_id(ctx, i.ax), events(i), i.label)]
end

"""
    _surface_order(ok, depth, ni, nj) -> (order, depth)

Quads of an `ni × nj` vertex grid, front to back by the average clip-space depth of their
corners (smaller is nearer): the order CairoMakie paints a surface's faces in, reversed. Quad
`q` (0-based) has corners `(a, b)`, `(a+1, b)`, `(a, b+1)`, `(a+1, b+1)` with `q = a + b·(ni-1)`
(0-based `a`, `b`). A quad with a corner that is not drawn (`ok` false) is left out. Returns
the 0-based quad indices and their depths, in that order. Any layer of quads or faces drawn
by depth can reuse it.
"""
function _surface_order(ok, depth, ni, nj)
    qs = Int[]; qd = Float64[]
    for b in 1:(nj - 1), a in 1:(ni - 1)
        c1 = a + (b - 1) * ni
        c = (c1, c1 + 1, c1 + ni, c1 + ni + 1)
        all(k -> ok[k], c) || continue
        push!(qs, (a - 1) + (b - 1) * (ni - 1))
        push!(qd, (depth[c[1]] + depth[c[2]] + depth[c[3]] + depth[c[4]]) / 4)
    end
    p = sortperm(qd)
    return qs[p], qd[p]
end

# ============================ TextInteractable =============================
"""
    TextInteractable(ax, p::Makie.Text; id=:text, payloads=nothing, tooltip=nothing, label=nothing)

Click-to-pick text labels (from `text!`/`annotation!`), hit-tested as bounding-box rects. Has
**no explicit-geometry constructor** — this from-a-plot-object form is the only way to build
one. Produces one `:rects` [`HitLayer`](@ref), one box per string.

# Arguments
- `p` — a `Makie.Text` plot (for `annotation!`, pass its descendant `Text`, e.g. via
  [`interactables`](@ref)).
- `id` — the layer id; becomes `InteractionEvent.layer` on a hit. Default `:text`.
- `payloads` — one entry per string; `ArgumentError` if the length doesn't match. Default:
  `(; text, index, x, y)` — `text` is the string, `index` 1-based, `(x, y)` its data-space
  anchor (`(x, y, z)` for a 3D position). A key-value payload is merged onto the default, as for
  [`PointInteractable`](@ref).
- `tooltip` — `nothing` for the auto name/value table (default), `masque"..."` for a template, or
  `false` to suppress. `tooltip = true` is rejected (`ArgumentError`).
- `label` — the layer's name, which screen readers announce (see [`PointInteractable`](@ref)).
  Default: the text plot's own Makie `label`, or `nothing`.

Geometry is each string's axis-aligned bounding box (`Makie.string_boundingboxes`), not
projected data coordinates — a rotated label gets its expanded axis-aligned box. Boxes are
read lazily in `hitlayers`, not at construction, so a `TextInteractable` can be built before
the figure is finalized.

On an `Axis3`, where labels can overlap, the label drawn on top wins the overlap: with
`backend = :webgl` the one whose anchor is nearest the camera, and with CairoMakie, which
paints labels in order, the one listed last. A label whose anchor is outside the axis limits is
not drawn, so it is not hit either.

# Examples
```julia
p = text!(ax, "hello"; position = (1.0, 2.0))
TextInteractable(ax, p)
```
"""
struct TextInteractable <: AbstractInteractable
    ax; p; id::Symbol; payloads::Vector{Any}; tooltip::Union{Nothing, Markup, Bool}   # p::Makie.Text
    label::Union{Nothing, String}
    select::Symbol
end
TextInteractable(ax, p, id, payloads, tooltip, label) = TextInteractable(ax, p, id, payloads, tooltip, label, :one)
function TextInteractable(ax, p::Makie.Text; id = :text, payloads = nothing, tooltip = nothing, label = _plot_label(p), select = :one)
    _check_tooltip(tooltip)
    _check_select(TextInteractable, select)
    strs = p.text[]
    anchors = p.positions[]
    length(anchors) == length(strs) ||
        error("TextInteractable: $(length(anchors)) positions for $(length(strs)) strings (Makie internals changed?)")
    defaults = _unconvert_payloads(
        ax, Any[
            length(anchors[k]) >= 3 ?
                (; text = string(strs[k]), index = k, x = Float64(anchors[k][1]), y = Float64(anchors[k][2]), z = Float64(anchors[k][3])) :
                (; text = string(strs[k]), index = k, x = Float64(anchors[k][1]), y = Float64(anchors[k][2]))
                for k in eachindex(strs)
        ]
    )
    pl = _merge_payloads(defaults, payloads, "TextInteractable")
    return TextInteractable(ax, p, id, pl, tooltip, label === nothing ? nothing : String(label), select)
end
tooltip_spec(i::TextInteractable) = i.tooltip
function hitlayers(i::TextInteractable, ctx)
    boxes = _string_bboxes(i.p)
    length(boxes) == length(i.payloads) ||
        error("TextInteractable: $(length(boxes)) boxes for $(length(i.payloads)) payloads (Makie internals changed?)")
    o = _scene_viewport(i.ax).origin
    g = Real[]
    # Boxes are in markerspace: scene px by default, and for `markerspace = :data` the drawn
    # (world) position, `model * f(x)`, already past the axis scale `f`. Those corners map back
    # to data before projecting, or a log axis would apply `f` twice.
    ondata = i.p.markerspace[] === :data
    todata = ondata ? _world_to_data(i.ax) : nothing
    order = i.ax isa Makie.Axis3 ? _text_order(ctx, i.ax, i.p.positions[]) : nothing
    drawn = order === nothing ? nothing : Set(order)
    # Empty strings are not skipped: a zero-area box keeps box-count == payload-count.
    for (k, b) in enumerate(boxes)
        if drawn !== nothing && (k - 1) ∉ drawn
            append!(g, (NaN32, NaN32, NaN32, NaN32))
            continue
        end
        if ondata
            # On an Axis3 the box is 3D (a label on a plane in the scene): its 2D box is that of
            # all eight projected corners. The anchor alone decides clipping, as Makie draws it.
            cs = i.ax isa Makie.Axis3 ? Makie.corners(b) : (b.origin, b.origin .+ b.widths)
            q = [_proj(ctx, i.ax, todata(c), nothing) for c in cs]
            x0, x1 = extrema(p[1] for p in q); y0, y1 = extrema(p[2] for p in q)
            append!(g, (_q((x0 + x1) / 2), _q((y0 + y1) / 2), _q(x1 - x0), _q(y1 - y0)))
            continue
        end
        bx, by = Float64(b.origin[1]), Float64(b.origin[2])
        bw, bh = Float64(b.widths[1]), Float64(b.widths[2])
        # scene-local (y-up) → image px (y-down): same ×scaling + y-flip as the backend `project` closure.
        x_left = (bx + o[1]) * ctx.scaling
        y_top = ctx.height - (by + bh + o[2]) * ctx.scaling
        w = bw * ctx.scaling; h = bh * ctx.scaling
        append!(g, (_q(x_left + w / 2), _q(y_top + h / 2), _q(w), _q(h)))   # :rects list = (cx, cy, w, h)
    end
    return [
        HitLayer(
            i.id, :rects, g, i.payloads, axis_id(ctx, i.ax), events(i), i.label, nothing, nothing, nothing, nothing, order,
        ),
    ]
end

# The drawn labels on an Axis3, top one first, as 0-based indices: by their anchor's clip-space
# depth where the backend depth-tests text (WebGL), else last-listed first, since CairoMakie
# paints them in list order. A label whose anchor is not drawn (outside the axis limits, or not
# finite) is left out.
function _text_order(ctx, ax, anchors)
    pts = Point3f[Point3f(a[1], a[2], length(a) >= 3 ? a[3] : 0) for a in anchors]
    px, py, depth = _project_depth(ctx, ax, pts)
    box = _clipbox(ax)
    ks = [
        k for k in eachindex(pts) if all(isfinite, pts[k]) && (box === nothing || _in_clipbox(box, pts[k])) &&
            isfinite(px[k]) && isfinite(py[k]) && isfinite(depth[k])
    ]
    return (ctx.depth_test ? ks[sortperm(depth[ks])] : reverse(ks)) .- 1
end

# ============================ PolygonInteractable ==========================
"""
    PolygonInteractable(ax, rings; id=:polygons, payloads=nothing, tooltip=nothing, holes=nothing, label=nothing)
    PolygonInteractable(ax, p; id=<kind-specific>, payloads=nothing, tooltip=nothing, label=nothing)   # from a plot object

Arbitrary filled polygons, hit-tested even-odd. Produces one `:polygons` [`HitLayer`](@ref).

# Arguments
- `rings` — `Vector{Vector{point}}`, one or more rings, each a `Vector` of 2- or 3-element
  data-space points/tuples (one polygon per ring; a ring need not be closed — the hit-test
  closes it implicitly).
- `holes` — one group of hole rings per element, same point type as `rings`. `nothing`
  (default) means every element is solid. A point inside a hole is not a hit of that element,
  and the highlight leaves the hole unfilled. The group count must match `rings`.
- `id` — the layer id; becomes `InteractionEvent.layer` on a hit. Default `:polygons`.
- `payloads` — one entry per ring; `ArgumentError` if the length doesn't match. Default:
  `(; index)`, 1-based.
- `tooltip` — `nothing` for the auto name/value table (default), `masque"..."` for a template, or
  `false` to suppress. `tooltip = true` is rejected (`ArgumentError`).
- `label` — the layer's name, which screen readers announce (see [`PointInteractable`](@ref)).
  Default `nothing`; from a plot object, the plot's own Makie `label`.

# From a plot object
`PolygonInteractable(ax, p)` builds `rings` and default payloads from `p`. A key-value
`payloads` entry is merged onto that default, as for [`PointInteractable`](@ref):

| `p` | default `id` | rings from | notes |
|---|---|---|---|
| `Makie.Poly` | `:poly` | converted geometry | one element per shape: a point ring, `Rect`, `Circle`, `Polygon` (holes kept), or `MultiPolygon`; a lone `MultiPolygon` is one element per polygon, as Makie colors it |
| `Makie.Band` | `:band` | lower curve + reversed upper curve, as drawn (`direction = :y` swaps x and y) | always exactly one open ring |
| `Makie.Density` | `:density` | its descendant `Band`'s KDE fill | same shape as `Band` |
| `Makie.Contourf` | `:contourf` | each filled polygon's exterior, plus its holes as further rings of the same element | payload `(; low, high)`, the band edges nearest each polygon's fill color |
| `Makie.Violin` | `:violin` | each violin's outline | payload `(; x)`, the nearest category to the ring's geometric center |
| `Makie.Voronoiplot` | `:voronoiplot` | each cell's exterior ring | cells come back in tessellation order (no cheap cell→generator map), so default payload is `(; index)` only |
| `Makie.Hexbin` | `:hexbin` | each drawn hexagon's six corners | payload `(; x, y, count)`: the hexagon's center in data units and its count (summed `weights` when given); `threshold = 0` keeps the empty hexagons |

# Examples
```julia
PolygonInteractable(ax, [[(0,0), (1,0), (1,1), (0,1)]])

p = poly!(ax, points)
PolygonInteractable(ax, p)
```
"""
struct PolygonInteractable <: AbstractInteractable
    ax; rings::Vector; id::Symbol; payloads::Vector{Any}; tooltip::Union{Nothing, Markup, Bool}
    label::Union{Nothing, String}
    holes::Vector # one vector of hole-rings per element; empty when that element is solid
    # px of hit slack outside each ring: half a plot's drawn outline. 0 = none.
    tol::Float64
    select::Symbol
end
PolygonInteractable(ax, rings, id, payloads, tooltip, label, holes) =
    PolygonInteractable(ax, rings, id, payloads, tooltip, label, holes, 0.0)
PolygonInteractable(ax, rings, id, payloads, tooltip, label, holes, tol) =
    PolygonInteractable(ax, rings, id, payloads, tooltip, label, holes, tol, :one)
# `nothing` → every element is solid. A group is the hole rings of one element.
function _hole_groups(holes, n)
    holes === nothing && return [Vector{Point3f}[] for _ in 1:n]
    length(holes) == n || throw(ArgumentError("PolygonInteractable: $(length(holes)) hole groups for $n rings"))
    return map(holes) do group
        out = Vector{Point3f}[]
        for hole in group
            pts = [_pt3(p) for p in hole]
            isempty(pts) || push!(out, pts)
        end
        out
    end
end
function PolygonInteractable(ax, rings; id = :polygons, payloads = nothing, tooltip = nothing, label = nothing, holes = nothing, select = :one)
    _check_select(PolygonInteractable, select)
    _check_tooltip(tooltip)
    rs = [[_pt3(p) for p in ring] for ring in rings]
    pl = payloads === nothing ? Any[(; index = k) for k in 1:length(rs)] : _check_payloads(payloads, length(rs), "PolygonInteractable")
    return PolygonInteractable(ax, rs, id, pl, tooltip, label === nothing ? nothing : String(label), _hole_groups(holes, length(rs)), 0.0, select)
end
tooltip_spec(i::PolygonInteractable) = i.tooltip
hit_tol(i::PolygonInteractable) = i.tol > 0 ? i.tol : nothing
function _project_ring(ctx, ax, ring, box = _clipbox(ax))
    flat = Real[]
    for p in ring
        q = _proj(ctx, ax, p, box)
        append!(flat, (_q(q[1]), _q(q[2])))
    end
    return flat
end
function hitlayers(i::PolygonInteractable, ctx)
    geom = Any[]
    for (k, ring) in enumerate(i.rings)
        flat = _project_ring(ctx, i.ax, ring)
        hs = i.holes[k]
        if isempty(hs)
            push!(geom, flat)
        else
            group = Any[flat]
            for hole in hs
                push!(group, _project_ring(ctx, i.ax, hole))
            end
            push!(geom, group)
        end
    end
    return [HitLayer(i.id, :polygons, geom, i.payloads, axis_id(ctx, i.ax), events(i), i.label)]
end

# ============================ AxisInteractable ============================
"""
    AxisInteractable(ax; id=:axis)

The whole axis as one hit region: a click or hover anywhere returns the data coordinate under
the cursor. No per-element geometry — the browser inverts pixels→data live via the shipped
[`AxisTransform`](@ref) (no Julia round-trip on hover). Produces one `:axis` [`HitLayer`](@ref)
with `geometry = nothing`.

# Arguments
- `ax` — a `Makie.Axis` (linear, log, or categorical) or a `Makie.PolarAxis`. `id` — the layer
  id; becomes `InteractionEvent.layer` on a hit. Default `:axis`.

Payload on hit (client-side): `(; x, y)`, in the plot's own coordinates. On a `PolarAxis`, `x` is
θ in radians and `y` is r when `theta_as_x` is true (the default), swapped otherwise. Past the
edge of the disc the readout keeps extrapolating, as it does past a Cartesian axis's limits.

`masque` raises `ArgumentError` at build time if `ax` is an `Axis3` (a screen pixel is a ray, not
a data point — continuous readout is undefined), or either scale isn't client-invertible
(supported: `identity`, `log10`, `log`; categorical axes are fine).

# Examples
```julia
AxisInteractable(ax)
```
"""
struct AxisInteractable <: AbstractInteractable
    ax; id::Symbol; select::Symbol
end
AxisInteractable(ax, id::Symbol) = AxisInteractable(ax, id, :one)
AxisInteractable(ax; id = :axis, select = :one) = AxisInteractable(ax, id, _check_select(AxisInteractable, select))
function validate(i::AxisInteractable, ctx::InteractionContext)
    i.ax isa Makie.Legend && return "AxisInteractable: ax is a Legend, not an Axis — use LegendInteractable(leg) instead."
    t = ctx.transforms[axis_id(ctx, i.ax)]
    t.is3d && return "AxisInteractable: continuous pixel→data readout is undefined on an Axis3 " *
        "(a screen pixel is a ray, not a data point). Use element interactables " *
        "(points/segments/polygons) on 3D axes."
    (t.xscale in _JS_INVERTIBLE && t.yscale in _JS_INVERTIBLE) ||
        return "AxisInteractable: scale (x=$(t.xscale), y=$(t.yscale)) is not invertible client-side; " *
        "supported: identity/log10/log (categorical is fine)."
    return nothing
end
hitlayers(i::AxisInteractable, ctx) =
    [HitLayer(i.id, :axis, nothing, Any[], axis_id(ctx, i.ax), events(i))]

# ============================ ColorbarInteractable =========================
"""
    ColorbarInteractable(cb; id=:colorbar)

A `Makie.Colorbar` block as one hit region, bounded to its pixel bounding box: a click or
hover anywhere on the bar inverts the cursor position to the bar's data value, client-side —
like [`AxisInteractable`](@ref) but scoped to the colorbar and 1-D. Produces one `:axis`
[`HitLayer`](@ref) with `geometry` set to the colorbar's pixel bbox.

# Arguments
- `cb` — a `Makie.Colorbar` (not an `Axis`). `id` — the layer id; becomes
  `InteractionEvent.layer` on a hit. Default `:colorbar`.

Payload on hit (client-side): `(; value)`.

Its field in the `@bind` value holds a [`ColorbarEvent`](@ref), `nothing` until the first
click. `masque(fig)` adds one for every colorbar in the figure.

`masque` raises `ArgumentError` at build time if the colorbar's value-axis scale isn't
client-invertible (supported: `identity`, `log10`, `log`).

# Examples
```julia
cb = Colorbar(fig[1, 2], plotobj)
ColorbarInteractable(cb)
```
"""
struct ColorbarInteractable <: AbstractInteractable
    cb
    id::Symbol
    # `masque` added it for a figure's colorbar, rather than the caller passing it.
    auto::Bool
end
ColorbarInteractable(cb, id::Symbol) = ColorbarInteractable(cb, id, false)
ColorbarInteractable(cb; id = :colorbar) = ColorbarInteractable(cb, id, false)
function validate(i::ColorbarInteractable, ctx::InteractionContext)
    t = ctx.transforms[axis_id(ctx, i.cb)]
    va = t.valueaxis
    sc = va === :y ? t.yscale : t.xscale
    sc in _JS_INVERTIBLE ||
        return "ColorbarInteractable: scale $(sc) is not invertible client-side; supported: identity/log10/log."
    return nothing
end
function hitlayers(i::ColorbarInteractable, ctx)
    aid = axis_id(ctx, i.cb)
    vp = ctx.transforms[aid].viewport
    bbox = Real[vp[1], vp[2], vp[3], vp[4]]
    return [HitLayer(i.id, :axis, bbox, Any[], aid, events(i))]
end

# ============================ LegendInteractable ============================

# Best-effort per-entry accent colour: the entry's first LegendElement's own colour attribute
# (LineElement -> linecolor, MarkerElement -> markercolor, PolyElement -> polycolor). `nothing`
# for an unresolvable colour (e.g. still `Makie.automatic`) -- an accent is a nice-to-have, not
# a rendering guarantee, so this never errors.
function _legend_element_color(el)
    # Every LegendElement forwards all three colour attributes (the unused ones default to
    # black), so the element type — not `hasproperty` — picks the one that is drawn.
    raw = try
        if el isa Makie.LineElement
            el.linecolor[]
        elseif el isa Makie.MarkerElement
            el.markercolor[]
        elseif el isa Makie.PolyElement
            el.polycolor[]
        else
            return nothing
        end
    catch e
        e isa _MAKIE_SHAPE_ERRORS || rethrow()
        return nothing
    end
    raw === Makie.automatic && return nothing
    return try
        Makie.to_color(raw)
    catch e
        e isa _MAKIE_DOWNSTREAM_ERRORS || rethrow()
        nothing
    end
end
# One accent colour per entry, or `nothing` for the whole layer the moment any entry's is
# unresolvable (rather than a partial/misleading accent set).
function _legend_colors(entries)
    raws = Any[]
    for e in entries
        isempty(e.elements) && return nothing
        c = _legend_element_color(first(e.elements))
        c === nothing && return nothing
        push!(raws, c)
    end
    return _categorical_palette_index(raws)
end

# Priority (a) targets::Dict{label => id(s)}, (b) targets::Vector (one per entry), (c) plotmap
# lookup of each entry's `Makie.get_plots` union, (d) empty. Returns (resolved, lenient) —
# `lenient` is true only for (c)/(d): those links are auto-derived, so build_manifest warns and
# drops one that targets an unselectable-kind layer instead of erroring (an explicit (a)/(b)
# target is the caller's own claim and fails loud on the same problem).
# One entry's/key's `targets=` value -> Vector{Symbol}. Accepts `nothing`, a single
# Symbol/AbstractString, or a Vector of Symbol/AbstractString — checking AbstractString BEFORE
# the Vector branch matters: a bare String IS iterable (over its chars), so without this order
# `collect(Symbol, "lines")` would silently produce bogus per-character layer ids instead of
# failing loud. `desc` names the offending entry/key for the error message.
function _coerce_legend_target_ids(v, desc)
    v === nothing && return Symbol[]
    v isa Symbol && return [v]
    v isa AbstractString && return [Symbol(v)]
    if v isa AbstractVector
        return Symbol[
            if t isa Symbol
                t
            elseif t isa AbstractString
                Symbol(t)
            else
                throw(
                    ArgumentError(
                        "LegendInteractable: targets for $desc must be a Symbol/String or a Vector of them, got $(typeof(t)) inside the Vector",
                    ),
                )
            end
                for t in v
        ]
    end
    throw(ArgumentError("LegendInteractable: targets for $desc must be a Symbol/String or a Vector of them, got $(typeof(v))"))
end

function _resolve_legend_targets(entries, targets, plotmap)
    n = length(entries)
    if targets isa AbstractDict
        labelset = Set(e.label for e in entries)
        for key in keys(targets)
            key isa AbstractString ||
                throw(ArgumentError("LegendInteractable: targets Dict keys must be label Strings, got $(typeof(key))"))
            key in labelset || throw(
                ArgumentError(
                    "LegendInteractable: targets key \"$(key)\" matches no legend entry label " *
                        "(available: $(join(sort(collect(labelset)), ", ")))",
                ),
            )
        end
        result = [_coerce_legend_target_ids(get(targets, e.label, nothing), "\"$(e.label)\"") for e in entries]
        return result, false
    elseif targets isa AbstractVector
        length(targets) == n || throw(
            ArgumentError(
                "LegendInteractable: targets must have one entry per legend entry (got $(length(targets)) for $(n) entries)",
            ),
        )
        result = [
            _coerce_legend_target_ids(t, "entry $k (\"$(entries[k].label)\")")
                for (k, t) in enumerate(targets)
        ]
        return result, false
    elseif targets === nothing
        plotmap === nothing && return [Symbol[] for _ in 1:n], true
        result = Vector{Vector{Symbol}}(undef, n)
        for (k, e) in enumerate(entries)
            ids = Symbol[]
            seen = Set{Symbol}()
            for p in e.plots
                for sid in get(plotmap, p, Symbol[])
                    sid in seen && continue
                    push!(ids, sid); push!(seen, sid)
                end
            end
            result[k] = ids
        end
        return result, true
    else
        throw(ArgumentError("LegendInteractable: targets must be nothing, a Dict, or a Vector, got $(typeof(targets))"))
    end
end

"""
    LegendInteractable(leg; id=:legend, targets=nothing, events=(:click,:hover), tooltip=nothing)

A `Makie.Legend` block whose entries are hit regions linking to the plot layer(s) they stand
for: hover/click an entry to highlight the layer(s) named in `targets`. Produces one `:rects`
[`HitLayer`](@ref), one rect per legend entry.

# Arguments
- `leg` — a `Makie.Legend`.
- `id` — the layer id; becomes `InteractionEvent.layer` on a hit. Default `:legend`.
- `targets` — how each entry links to other layers, resolved once at construction:
  - `nothing` (default) — `masque` links each entry to the layers of the plots its elements
    were built with (`Makie.get_plots`): the default layers, and any built with
    `interactables(plot)` in the same call. An entry whose plots have no layer in the call,
    or a hand-built entry whose elements carry no plots, links to nothing. The entry stays a
    hit target: hover leaves the other layers as they are, and a click reports a
    [`LegendEvent`](@ref).
  - a `Dict{<:AbstractString}` keyed by entry **label** — `Symbol` or `Vector{Symbol}` of layer
    ids for that entry. A key matching no entry label raises `ArgumentError`.
  - a `Vector` with one entry per legend entry (`nothing`/`Symbol`/`Vector{Symbol}`), in entry
    order (top-to-bottom, matching `leg.entrygroups[]` flattened). A wrong-length `Vector`
    raises `ArgumentError`.
  Every id named here must belong to another layer in the same `masque()` call whose kind
  supports pre-highlight (`ArgumentError` from `build_manifest` otherwise — see
  [`HitLayer`](@ref)'s `links` field). A spec may be a layer id (every element of that layer)
  or `id:k` pinning element `k` (1-based); auto-extracted `series!` entries use the pin.
- `tooltip` — `nothing` (default) and `false` show no card. The entry's label is already
  drawn in the row, and a card there covers the entries around it. `masque"..."` shows that
  template (payload fields: `label`, `group`, `targets`). `tooltip = true` is rejected
  (`ArgumentError`). Focusing an entry still announces its label when no template is set.
- `events` — the pointer events this layer responds to. Default `(:click, :hover)`.

A custom legend built from `LineElement`/`MarkerElement`/`PolyElement` without `plots=` has
nothing to auto-link — pass `plots=` on the element (Makie's own kwarg) or use `targets=` here.

`masque` raises `ArgumentError` at build time if `leg` is handed to `AxisInteractable`,
`ViewInteractable`, `ThresholdInteractable`, or `ROIInteractable` instead — those need a
`Makie.Axis`, not a `Legend`.

# Examples
```julia
l1 = lines!(ax, xs, ys1; label = "a")
l2 = lines!(ax, xs, ys2; label = "b")
leg = axislegend(ax)
LegendInteractable(leg)   # `masque` fills in the links

LegendInteractable(leg; targets = Dict("a" => :lines, "b" => [:lines_2, :scatter]))
```
"""
struct LegendInteractable <: AbstractInteractable
    leg
    id::Symbol
    targets::Vector{Vector{Symbol}}      # resolved per-entry link ids, in entry order
    evs::Tuple
    tooltip::Union{Nothing, Markup, Bool}
    # Internal: true when `targets` came from the plotmap/empty fallback (the auto path) rather
    # than a user-given Dict/Vector — see `_resolve_legend_targets`.
    lenient::Bool
    select::Symbol
end
LegendInteractable(leg, id, targets, evs, tooltip, lenient) = LegendInteractable(leg, id, targets, evs, tooltip, lenient, :one)
function LegendInteractable(leg; id = :legend, targets = nothing, events = (:click, :hover), tooltip = nothing, select = :one)
    return _legend_interactable(leg; id, targets, events, tooltip, select)
end
# `plotmap` is plot -> layer ids. `masque` passes the one for the layers it assembled, so an
# entry with no `targets` links to whatever its plots became in this call.
function _legend_interactable(
        leg; id = :legend, targets = nothing, events = (:click, :hover), tooltip = nothing, plotmap = nothing,
        select = :one,
    )
    _check_tooltip(tooltip)
    _check_select(LegendInteractable, select)
    entries = _legend_entries_meta(leg)   # pre-render metadata only — bbox comes later, in hitlayers
    resolved, lenient = _resolve_legend_targets(entries, targets, plotmap)
    return LegendInteractable(leg, id, resolved, events, tooltip, lenient, select)
end
events(i::LegendInteractable) = i.evs
# `nothing` suppresses the card, same as `false`. A `masque"..."` template still shows.
# The entry label stays in the screen-reader announcement via the payload (`frontend`'s
# `plainTextForHit` reads `bond == "legend"`), not via a default template.
tooltip_spec(i::LegendInteractable) = i.tooltip === nothing ? false : i.tooltip
function hitlayers(i::LegendInteractable, ctx)
    entries = _legend_entries(i.leg)
    aid = axis_id(ctx, i.leg)
    scaling = ctx.scaling; out_h = ctx.height
    g = Real[]
    payloads = Any[]
    links = Vector{Symbol}[]
    for (k, e) in enumerate(entries)
        o = e.bbox.origin; wv = e.bbox.widths
        cx = (o[1] + wv[1] / 2) * scaling
        cy = out_h - (o[2] + wv[2] / 2) * scaling
        append!(g, (_q(cx), _q(cy), _q(wv[1] * scaling), _q(wv[2] * scaling)))
        tgt = i.targets[k]
        push!(payloads, (; label = e.label, group = e.group, targets = String[string(t) for t in tgt]))
        push!(links, tgt)
    end
    colors = _legend_colors(entries)
    # `nothing` (not `[[],[]]`) when every entry's links are empty, per HitLayer's own
    # documented contract that `nothing` omits `"links"` from the manifest — the frontend
    # treats absent and `[]` identically (`links?.[index]`), so this is cosmetic, not behavioral.
    links_field = all(isempty, links) ? nothing : links
    return [HitLayer(i.id, :rects, g, payloads, aid, events(i), "Legend", colors, links_field)]
end

# ============================ ViewInteractable =============================
"""
    ViewInteractable(ax; id=:view)

Drag-to-pan and wheel zoom (2D `Axis`), or drag-to-orbit, wheel zoom and Shift+drag pan
(`Axis3`). Produces one `:view` [`HitLayer`](@ref)
covering `ax`'s whole viewport; it sorts after Tier-0 `:threshold`/`:roi` layers so an ordinary
drag on those wins without a modifier — **Shift+drag** forces the view gesture even over a
`ThresholdInteractable`/`ROIInteractable` hit.

# Arguments
- `ax` — a `Makie.Axis` (pan) or `Makie.Axis3` (orbit). `id` — the layer id, used to route
  gesture-channel frame requests back to this axis. Default `:view`.

**Commits nothing.** A camera is operational state, not an analysis value a notebook reads
(docs/dev/architecture/12-gesture-channel.md §12.3) — the bond `masque` returns never carries a
`:view` [`InteractionEvent`](@ref). Drag frames stream over a `with_js_link` gesture channel
instead, on both backends: Julia mutates `ax.limits[]` (pan, zoom) or `ax.azimuth[]`/`ax.elevation[]`
(orbit) and ships a hit manifest for every frame the camera moves. On an `Axis3`, zoom (wheel,
`+`/`-`) scales the limits about their center and pan (Shift+drag, Shift+arrows) shifts them
in the screen plane, as Makie's own `Axis3` zoom and translation do; the box keeps its size and
marks outside the new limits are clipped, so they no longer hover or click. `:cairo` ships that frame as
a PNG; `:webgl` ships a freshly serialized scene applied to the canvas already on the page.
In-drag frames render at `px_per_unit = 1`; the release frame renders at the widget's own
resolution. Because nothing commits, `ax`'s camera stays wherever the gesture left it until the
cell re-runs (a fresh `Figure`/`Axis` resets it); to persist a view across re-renders, bind it
explicitly with the `Ref` + `@bind` pattern (§12.8).

`masque` raises `ArgumentError` at build time if `ax` is a `PolarAxis` (a polar pan or zoom
moves r and θ limits, not Cartesian ones), a `Colorbar`'s value axis (no pan/orbit view applies), a categorical
2D axis (pan needs numeric limits to shift), or (2D only) either scale isn't client-invertible
(supported: `identity`, `log10`, `log`). `Axis3` has no scale/categorical restriction — camera
angles are read live from `ax` at render time.

# Examples
```julia
ViewInteractable(ax)
```
"""
struct ViewInteractable <: AbstractInteractable
    ax; id::Symbol
end
ViewInteractable(ax; id = :view) = ViewInteractable(ax, id)
events(::ViewInteractable) = (:drag,)
function validate(i::ViewInteractable, ctx::InteractionContext)
    i.ax isa Makie.Legend && return "ViewInteractable: ax is a Legend, not an Axis/Axis3 — a legend has no pan/orbit view."
    t = ctx.transforms[axis_id(ctx, i.ax)]
    t.ispolar && return "ViewInteractable: PolarAxis view gestures are not supported (a polar " *
        "pan or zoom moves r and θ limits, not Cartesian ones). Use element interactables for discrete hits."
    t.valueaxis !== nothing && return "ViewInteractable: a Colorbar has no pan/orbit view; " *
        "key ViewInteractable to an Axis or Axis3."
    if t.is3d
        # Axis3: azimuth/elevation are read from the live axis in hitlayers — nothing else to gate.
        return nothing
    end
    (t.xcats === nothing && t.ycats === nothing) ||
        return "ViewInteractable: pan needs continuous numeric axes; a categorical axis has " *
        "no numeric limits to shift (use AxisInteractable for categorical readout)."
    (t.xscale in _JS_INVERTIBLE && t.yscale in _JS_INVERTIBLE) ||
        return "ViewInteractable: pan needs client-side invertible x and y scales " *
        "(x=$(t.xscale), y=$(t.yscale); supported: identity/log10/log)."
    return nothing
end
# The colour of an empty plot area: the axis background over the figure background.
function _axis_fill(ax)
    fg = Makie.RGBAf(Makie.to_color(ax.backgroundcolor[]))
    bg = Makie.RGBAf(Makie.to_color(Makie.root(ax.scene).backgroundcolor[]))
    a = fg.alpha
    mix(f, b) = a * f + (1 - a) * b
    return Makie.RGBAf(mix(fg.r, bg.r), mix(fg.g, bg.g), mix(fg.b, bg.b), 1)
end
function hitlayers(i::ViewInteractable, ctx)
    t = ctx.transforms[axis_id(ctx, i.ax)]
    vx, vy, vw, vh = t.viewport
    geom = Dict{String, Any}(
        "x" => Float32(vx), "y" => Float32(vy),
        "w" => Float32(vw), "h" => Float32(vh),
        "mode" => t.is3d ? "orbit" : "pan",
    )
    if !t.is3d && i.ax isa Makie.Axis
        # The photographic preview (#85) slides a copy of the data inside the axis box. Makie
        # strokes each spine centred on the box edge, so half the stroke, plus a pixel when the
        # edge rounds onto a device pixel, lies inside the viewport. The preview crops the copy
        # to `clip` and shows it through a window of the same rect, so neither a spine nor the
        # ticks, labels, or title outside the box slide in with the data (#171). The hit region
        # stays `x, y, w, h`.
        ins = ceil(Float64(i.ax.spinewidth[]) * ctx.scaling / 2) + 1
        geom["clip"] = Float32[vx + ins, vy + ins, max(vw - 2ins, 0), max(vh - 2ins, 0)]
        # The window is painted with the empty plot's colour, so the strip the copy leaves
        # behind reads as blank plot, not as the unmoved picture underneath.
        geom["fill"] = _css_color(_axis_fill(i.ax))
    end
    if t.is3d
        # Current camera — JS computes the drag's (azimuth, elevation) from the pixel delta, for
        # the Tier-0 readout and the gesture-channel request payload. Never committed
        # (§12.3): a view gesture reports no InteractionEvent at all.
        geom["azimuth"] = Float64(i.ax.azimuth[])
        geom["elevation"] = Float64(i.ax.elevation[])
        # Zoom and pan (#321) move the limits, as Makie's own Axis3 scroll zoom and translation
        # do: JS scales them about their center, or shifts them by `panx`/`pany` per image px.
        fl = _finallimits(i.ax)
        lo = Float64.(Tuple(fl.origin)); w = Float64.(Tuple(fl.widths))
        geom["limits"] = Float64[lo[1], lo[1] + w[1], lo[2], lo[2] + w[2], lo[3], lo[3] + w[3]]
        panx, pany = _axis3_pan_basis(ctx, i.ax, lo, w)
        geom["panx"] = panx
        geom["pany"] = pany
    end
    return [HitLayer(i.id, :view, geom, Any[], axis_id(ctx, i.ax), events(i))]
end

# The data displacement, in the plane facing the camera through the limits' center, that moves
# the picture by one image px right (`panx`) or down (`pany`). Makie's `Axis3` translation drags
# in that same plane. Measured from the projection itself: J maps data to image px, the model
# matrix S maps data to world, and the shortest world step for a screen step is J_w⁺ with
# J_w = J S⁻¹. With the default orthographic camera that step lies in the screen plane exactly.
function _axis3_pan_basis(ctx, ax, lo, w)
    c = lo .+ w ./ 2
    J = zeros(2, 3)
    for k in 1:3
        h = w[k] / 4
        a = _proj(ctx, ax, ntuple(j -> j == k ? c[j] + h : c[j], 3))
        b = _proj(ctx, ax, ntuple(j -> j == k ? c[j] - h : c[j], 3))
        J[1, k] = (a[1] - b[1]) / 2h
        J[2, k] = (a[2] - b[2]) / 2h
    end
    m = ax.scene.transformation.model[]
    s = (m[1, 1], m[2, 2], m[3, 3])
    Jw = J ./ [s[1] s[2] s[3]]
    G = Jw * transpose(Jw)
    d = G[1, 1] * G[2, 2] - G[1, 2] * G[2, 1]
    zero3 = Float64[0, 0, 0]
    (isfinite(d) && abs(d) > 0) || return zero3, zero3
    Ginv = [G[2, 2] -G[1, 2]; -G[2, 1] G[1, 1]] ./ d
    P = transpose(Jw) * Ginv                       # world per image px, 3×2
    D = P ./ [s[1], s[2], s[3]]                    # data per image px
    all(isfinite, D) || return zero3, zero3
    return Float64.(D[:, 1]), Float64.(D[:, 2])
end

# ============================ ThresholdInteractable ========================
"""
    ThresholdInteractable(ax; orientation=:horizontal, value, id=:threshold)

A draggable horizontal or vertical line: drag for a live client-side readout, and the pixel
position inverts to a data-space scalar via [`AxisTransform`](@ref) on mouse-up. Produces one
`:threshold` [`HitLayer`](@ref).

# Arguments
- `ax` — a `Makie.Axis`.
- `orientation` — `:horizontal` (constant-y line, dragged vertically) or `:vertical`
  (constant-x line, dragged horizontally). Any other value raises `ArgumentError`. Default
  `:horizontal`.
- `value` — the line's initial data-space position (a y-value for `:horizontal`, x-value for
  `:vertical`). Required, no default.
- `id` — the layer id; becomes `InteractionEvent.layer` on commit. Default `:threshold`.

Payload on commit (client-side): the scalar data coordinate.

Its field in the `@bind` value starts as a [`ThresholdEvent`](@ref) at `value` (with its
`category` on a categorical axis, when `value` is a category's position).

`masque` raises `ArgumentError` at build time if `ax` is an `Axis3` (a screen pixel is a ray, not
a data value — inversion is undefined), a `PolarAxis` (a straight line is neither a constant r nor
a constant θ), or
the dragged axis's scale isn't client-invertible (`:horizontal` needs the y-scale, `:vertical`
the x-scale; supported: `identity`, `log10`, `log`).

# Examples
```julia
ThresholdInteractable(ax; orientation = :horizontal, value = 5.0)
```
"""
struct ThresholdInteractable <: AbstractInteractable
    ax; orientation::Symbol; value::Float64; id::Symbol
end
function ThresholdInteractable(ax; orientation = :horizontal, value, id = :threshold)
    orientation in (:horizontal, :vertical) ||
        throw(ArgumentError("ThresholdInteractable: orientation must be :horizontal or :vertical, got $(orientation)"))
    return ThresholdInteractable(ax, orientation, _threshold_value(value), id)
end
events(::ThresholdInteractable) = (:drag,)
function validate(i::ThresholdInteractable, ctx::InteractionContext)
    i.ax isa Makie.Legend && return "ThresholdInteractable: ax is a Legend, not an Axis — a legend has no data-space scalar to drag."
    t = ctx.transforms[axis_id(ctx, i.ax)]
    t.is3d && return "ThresholdInteractable: drag inverts a pixel to a data scalar via the axis " *
        "transform, which is undefined on an Axis3 (a screen pixel is a ray, not a data value)."
    t.ispolar && return "ThresholdInteractable: a threshold is not supported on PolarAxis (it drags a " *
        "straight line, and constant r is a circle, constant θ a ray). Use AxisInteractable to read (θ, r)."
    sc = i.orientation === :horizontal ? t.yscale : t.xscale
    sc in _JS_INVERTIBLE || return "ThresholdInteractable: $(i.orientation) drag needs a client-side " *
        "invertible $(i.orientation === :horizontal ? "y" : "x")-scale ($(sc) is not; supported: identity/log10/log)."
    return nothing
end
function hitlayers(i::ThresholdInteractable, ctx)
    t = ctx.transforms[axis_id(ctx, i.ax)]
    vx, vy, vw, vh = t.viewport
    if i.orientation === :horizontal
        pos = _proj(ctx, i.ax, (t.xlims[1], i.value))[2]   # constant data-y → its pixel-y
        span = Float32[vx, vx + vw]; orient = "h"
    else
        pos = _proj(ctx, i.ax, (i.value, t.ylims[1]))[1]   # constant data-x → its pixel-x
        span = Float32[vy, vy + vh]; orient = "v"
    end
    geom = Dict("orientation" => orient, "pos" => Float32(pos), "span" => span)
    return [HitLayer(i.id, :threshold, geom, Any[], axis_id(ctx, i.ax), events(i))]
end

# ============================ ROIInteractable ==============================
"""
    ROIInteractable(ax; bounds, id=:roi, selects=nothing)

A draggable and resizable rectangle: drag the interior to move it, a corner to resize both
edges, or the middle of a side (no drawn grip there) to resize just that one edge; on mouse-up
its two opposite pixel
corners invert to data-space bounds via
[`AxisTransform`](@ref). An `AbstractSelector` — with `selects` set, it also brushes a
compatible layer, reporting the contained elements. Produces one `:roi` [`HitLayer`](@ref).

# Arguments
- `ax` — a `Makie.Axis`.
- `bounds` — initial `(xmin, xmax, ymin, ymax)` in data space. Requires `xmin < xmax` and
  `ymin < ymax` (`ArgumentError` otherwise); length must be 4 (`ArgumentError` otherwise).
- `id` — the layer id; becomes `InteractionEvent.layer` on commit. Default `:roi`.
- `selects` — the layer to brush: a `:circles` or `:grid` layer's `id`, or the plot itself
  (`selects = sc`), whatever id that plot's layer ends up with. On mouse-up, elements whose
  geometry falls inside the ROI are reported. `masque` raises `ArgumentError` at build time if
  `selects` names a layer absent from the same call, one of an unsupported kind, or a plot
  with no point or grid layer in the call.

The box's field in the `@bind` value is a [`BoundsEvent`](@ref), starting at `bounds`. With
`selects` set, the box also fills its target's field with what it contains: a
`Vector{ElementEvent}` for a `:circles` target (one per contained element), or one
[`GridWindowEvent`](@ref) for a `:grid` target. That field starts at what `bounds` contains,
highlighted, as a release there would set it, unless `selected=` on the target seeds it. The
target takes no clicks; every other layer keeps its own. `bounds=` accepts a `BoundsEvent` or a
`(xmin, xmax, ymin, ymax)` tuple.

`masque` raises `ArgumentError` at build time if `ax` is an `Axis3` (a screen pixel is a ray, not
a data point), a `PolarAxis` (a screen rectangle is not an annular sector), a categorical axis (bounds
need numeric limits), or either scale isn't client-invertible (supported: `identity`, `log10`,
`log`).

# Examples
```julia
ROIInteractable(ax; bounds = (0.0, 1.0, 0.0, 1.0))

# brush the points of a scatter plot `sc`
ROIInteractable(ax; bounds = (0.0, 1.0, 0.0, 1.0), selects = sc)

# brush a layer by its id
ROIInteractable(ax; bounds = (0.0, 1.0, 0.0, 1.0), selects = :scatter)
```
"""
struct ROIInteractable <: AbstractSelector
    # bounds: (xmin,xmax,ymin,ymax) data space. A plot `selects` becomes a `_PlotTarget` in
    # `_assemble`, then the one compatible layer id in `build_manifest`.
    ax; bounds::NTuple{4, Float64}; id::Symbol; selects::Union{Nothing, Symbol, Makie.AbstractPlot, _PlotTarget}
end
function ROIInteractable(ax; bounds, id = :roi, selects = nothing)
    xmin, xmax, ymin, ymax = _roi_bounds(bounds)
    (xmin < xmax && ymin < ymax) ||
        throw(ArgumentError("ROIInteractable: need xmin < xmax and ymin < ymax, got $(bounds)"))
    return ROIInteractable(ax, (xmin, xmax, ymin, ymax), id, selects)
end
selects(i::ROIInteractable) = i.selects
compatible_kinds(::ROIInteractable) = (:circles, :grid)
events(::ROIInteractable) = (:drag,)
function validate(i::ROIInteractable, ctx::InteractionContext)
    i.ax isa Makie.Legend && return "ROIInteractable: ax is a Legend, not an Axis — a legend has no data-space bounds to drag."
    t = ctx.transforms[axis_id(ctx, i.ax)]
    t.is3d && return "ROIInteractable: drag inverts pixel corners to data-space bounds via the axis " *
        "transform, which is undefined on an Axis3 (a screen pixel is a ray, not a data point)."
    t.ispolar && return "ROIInteractable: a box is not supported on PolarAxis (a screen rectangle is " *
        "not an annular sector). Use AxisInteractable to read (θ, r)."
    (t.xscale in _JS_INVERTIBLE && t.yscale in _JS_INVERTIBLE) ||
        return "ROIInteractable: drag needs client-side invertible x and y scales " *
        "(x=$(t.xscale), y=$(t.yscale); supported: identity/log10/log)."
    (t.xcats === nothing && t.ycats === nothing) ||
        return "ROIInteractable: bounds need continuous axes; a categorical axis has no numeric bounds " *
        "(use AxisInteractable/ThresholdInteractable for categorical readout)."
    return nothing
end
function hitlayers(i::ROIInteractable, ctx)
    xmin, xmax, ymin, ymax = i.bounds
    a = _proj(ctx, i.ax, (xmin, ymin)); b = _proj(ctx, i.ax, (xmax, ymax))  # y flips → normalize below
    geom = Dict(
        "x" => Float32(min(a[1], b[1])), "y" => Float32(min(a[2], b[2])),
        "w" => Float32(abs(b[1] - a[1])), "h" => Float32(abs(b[2] - a[2])),
        "handle" => Float32(8 * ctx.scaling),
    )
    return [HitLayer(i.id, :roi, geom, Any[], axis_id(ctx, i.ax), events(i))]
end

# ============================ custom: RegionInteractable (Tier A) =========
"""
    RegionInteractable(ax, regions; payloads=nothing, id=:region, tooltip=nothing, events=(:click, :hover))

Declarative mixed hit regions in data space — circles, rects, and polygons in one call, no
JavaScript required. Grouped into up to three [`HitLayer`](@ref)s (one per geometry kind
present), so a single call can mix shapes freely.

# Arguments
- `regions` — a `Vector`, each element one of:
  - `(:circle, (cx, cy), r)` — `r` in logical pixels, multiplied by `ctx.scaling` (not data units)
  - `(:rect, (cx, cy), w, h)` — `w`, `h` in data units
  - `(:polygon, [(x, y), …])` — a ring of points
  Any other first element raises `ArgumentError`.
- `payloads` — one entry per region, matched 1:1 by position (`ArgumentError` on a length
  mismatch). Default: `(; index)`, 1-based.
- `id` — the layer id. Regions of one kind make one layer under `id`. Several kinds make one
  layer each, the parts `circles`, `rects` and `polygons` of `id` (only the kinds present): the
  `@bind` value nests them as `w.region.circles`, and their events have `layer == id` and
  `part == (:circles,)`. Default `:region`.
- `tooltip` — `nothing` for the auto name/value table (default), `masque"..."` for a template, or
  `false` to suppress; applies to every generated layer. `tooltip = true` is rejected
  (`ArgumentError`).
- `events` — the pointer events all generated layers respond to. Default `(:click, :hover)`.

# Examples
```julia
RegionInteractable(
    ax, [(:circle, (0.0, 0.0), 1.0), (:rect, (3.0, 0.0), 2.0, 1.0)];
    payloads = [(; label = "circle"), (; label = "rect")],
)
```
"""
struct RegionInteractable <: AbstractInteractable
    ax; regions::Vector; payloads::Vector{Any}; id::Symbol; tooltip::Union{Nothing, Markup, Bool}; evs::Tuple
    select::Symbol
end
RegionInteractable(ax, regions, payloads, id, tooltip, evs) = RegionInteractable(ax, regions, payloads, id, tooltip, evs, :one)
function RegionInteractable(
        ax, regions::AbstractVector; payloads = nothing, id = :region,
        tooltip = nothing, events = (:click, :hover), select = :one,
    )
    _check_tooltip(tooltip)
    _check_select(RegionInteractable, select)
    pl = payloads === nothing ? Any[(; index = k) for k in 1:length(regions)] :
        expand_payloads(payloads, length(regions), "RegionInteractable")
    return RegionInteractable(ax, collect(regions), pl, id, tooltip, events, select)
end
events(i::RegionInteractable) = i.evs
tooltip_spec(i::RegionInteractable) = i.tooltip
function hitlayers(i::RegionInteractable, ctx)
    circ = Real[]; cpl = Any[]; rect = Real[]; rpl = Any[]; polys = Vector{Real}[]; ppl = Any[]
    for (reg, pl) in zip(i.regions, i.payloads)
        kind = reg[1]
        if kind === :circle
            q = _proj(ctx, i.ax, reg[2]); append!(circ, (_q(q[1]), _q(q[2]), _q(Float64(reg[3]) * ctx.scaling))); push!(cpl, pl)
        elseif kind === :rect
            xc, yc = reg[2]; w, h = Float64(reg[3]), Float64(reg[4])
            a = _proj(ctx, i.ax, (xc - w / 2, yc - h / 2)); b = _proj(ctx, i.ax, (xc + w / 2, yc + h / 2))
            append!(rect, (_q((a[1] + b[1]) / 2), _q((a[2] + b[2]) / 2), _q(abs(b[1] - a[1])), _q(abs(b[2] - a[2])))); push!(rpl, pl)
        elseif kind === :polygon
            flat = Real[]; for p in reg[2]
                q = _proj(ctx, i.ax, p); append!(flat, (_q(q[1]), _q(q[2])))
            end
            push!(polys, flat); push!(ppl, pl)
        else
            throw(ArgumentError("RegionInteractable: unknown region kind $(kind)"))
        end
    end
    aid = axis_id(ctx, i.ax); ls = HitLayer[]
    # One shape kind is the region's own layer; several are its parts (`region.circles`).
    one = count(!isempty, (cpl, rpl, ppl)) == 1
    lid(part) = one ? i.id : _part_id(i.id, part)
    isempty(cpl) || push!(ls, HitLayer(lid(:circles), :circles, circ, cpl, aid, i.evs))
    isempty(rpl) || push!(ls, HitLayer(lid(:rects), :rects, rect, rpl, aid, i.evs))
    isempty(ppl) || push!(ls, HitLayer(lid(:polygons), :polygons, polys, ppl, aid, i.evs))
    return ls
end

# ============================ SliceInteractable ============================
"""
    SliceInteractable(ax; series, orientation=:vertical, crosshair=true, id=:slice, covers=(), tooltip=nothing)
    SliceInteractable(ax, plot; orientation=nothing, crosshair=true, id=:slice, covers=nothing, tooltip=nothing)
    SliceInteractable(ax, plots; orientation=nothing, crosshair=true, id=:slice, covers=nothing, tooltip=nothing)
    SliceInteractable(plots; orientation=nothing, crosshair=true, id=:slice, covers=nothing, tooltip=nothing)

Sample one or more 1-D series at the cursor and show that sample in the tooltip. `masque(fig)`
does not add a slice, and a plot without one draws no hairline. This interactable draws one
hair — vertical or horizontal, matching `orientation` — and a filled dot per series in support.
`crosshair=false` keeps the dots and the tooltip and draws no hair. Hover only — nothing is
committed. Produces one `:slice` [`HitLayer`](@ref), which is not a hit target.

# Arguments
- `ax` — a `Makie.Axis`. The plot constructor can leave it out: `masque` then uses the axis
  that draws the plots, and raises `ArgumentError` if they are on different axes.
- `series` — a vector of `(; x, y)`, each `x` and `y` an equal-length vector of reals. Optional
  `id` (default `:s1`, `:s2`, …), `label`, and `color`. For `:vertical`, `x` is strictly
  increasing; for `:horizontal`, `y` is. A non-finite probe coordinate starts a new run, and
  a run of one point cannot be interpolated. A decreasing or repeated probe coordinate raises
  `ArgumentError`. A `Stairs` plot is the exception: its steppoints repeat the probe on each
  riser, and that repeat is kept.
- `orientation` — `:vertical` (sample `y` at the cursor's data `x`, and draw the vertical hair;
  the default) or `:horizontal` (sample `x` at the cursor's data `y`, and draw the horizontal
  hair). On the plot constructor, `nothing` (the default) follows the plot: a `Density` or
  `Band` with `direction == :y` is `:horizontal`, and everything else is `:vertical`.
- `crosshair` — draw that one hair. `false` leaves the sample tooltip and the dots, with no
  hair. Default `true`. A figure with no slice draws no hair either way.
- `id` — the layer id. Default `:slice`.
- `covers` — layer ids in the same `masque` call whose hover this slice replaces. Each must be
  a `:polygons` or `:lines` layer (`ArgumentError` otherwise). While the pointer is over one
  of them the cursor stays `crosshair`, the polygon or line highlight is skipped, and the
  tooltip is the sample. Default `()` on the series constructor. On the plot constructor,
  `nothing` (the default) covers the `:lines` and `:polygons` layers that the passed plots
  became in the `masque` call, whatever ids they have. A plot with no layer in the call (as
  with `auto = false`) covers nothing.
- `tooltip` — what the card says while this slice is the thing under the pointer (a covered
  layer, or empty axis interior inside at least one series). `nothing` is the auto table of the
  live sample (the probe coordinate plus one field per series id), `masque"…"` is a template
  over those same fields, and `false` suppresses the card. A marker that is not covered, and a
  colorbar, keep their own tooltip. `tooltip = true` is rejected (`ArgumentError`).
- `plot` / `plots` — a `Lines`, `Stairs`, `Series`, `Band`, or `Density`, or a vector of
  those. Vertices are the points those plots already draw. `Stairs` uses the child line's
  steppoints, so between risers the sample is constant; at a riser the sample is the y where
  that riser starts. `Density` and `Band` contribute the band's upper curve as drawn. A `Band`
  with `direction = :y` flips its converted edge (Makie swaps only the mesh). A `Density` with
  `direction = :y` already stores `Point2(offset + density, x)` and is `:horizontal`; it is not
  flipped again. A NaN in either coordinate of a plot's point is a gap in the slice, as in the
  drawn line. A vector becomes one slice; mixed orientations raise `ArgumentError` unless
  `orientation` is passed.

`masque` raises `ArgumentError` at build time if `ax` is an `Axis3` or a `PolarAxis`, if
either scale is not client-invertible (`identity`, `log10`, `log`), if either axis is
categorical, or if the figure already has a slice on this axis.

# Examples
```julia
SliceInteractable(ax; series = [(; id = :wide, x = xs, y = ys), (; id = :narrow, x = xs, y = zs)])

d1 = density!(ax, randn(200))
d2 = density!(ax, randn(200) .+ 2)
SliceInteractable([d1, d2])
```
"""
struct SliceInteractable <: AbstractInteractable
    ax
    orientation::Symbol
    series::Vector{NamedTuple}
    id::Symbol
    covers::Vector{Symbol}
    tooltip::Union{Nothing, Markup, Bool}
    crosshair::Bool
    # The plots the plot constructor's default covers. `masque` looks up the layers they
    # became and sets `covers` to those; empty when the caller passed `covers` or series.
    cover_plots::Vector{Any}
end
SliceInteractable(ax, orientation, series, id, covers, tooltip, crosshair) =
    SliceInteractable(ax, orientation, series, id, covers, tooltip, crosshair, Any[])

function _slice_covers(covers)
    covers isa Symbol && return Symbol[covers]
    return Symbol[Symbol(c) for c in covers]
end

function _slice_probe_ok(probe, id::Symbol; plateau::Bool = false)
    prev = nothing
    run = 0
    long = false
    for v in probe
        if !isfinite(v)
            prev = nothing
            run = 0
            continue
        end
        run += 1
        run >= 2 && (long = true)
        # A stair riser repeats the probe. The series constructor stays strict; only the
        # Stairs plot path sets plateau, so a caller-supplied repeat still errors.
        if prev !== nothing && (plateau ? v < prev : v <= prev)
            how = plateau ? "increasing" : "strictly increasing"
            throw(
                ArgumentError(
                    "SliceInteractable: series :$id probe coordinate must be $how, got $v after $prev",
                )
            )
        end
        prev = v
    end
    long || throw(ArgumentError("SliceInteractable: series :$id needs at least two finite points"))
    return nothing
end

function _slice_one(s, i::Int, orientation::Symbol)
    hasproperty(s, :x) && hasproperty(s, :y) ||
        throw(ArgumentError("SliceInteractable: series $i needs `x` and `y`"))
    x = Float64[Float64(v) for v in s.x]
    y = Float64[Float64(v) for v in s.y]
    length(x) == length(y) ||
        throw(ArgumentError("SliceInteractable: series $i has $(length(x)) x values and $(length(y)) y values"))
    for k in eachindex(x)
        if isfinite(x[k]) != isfinite(y[k])
            throw(ArgumentError("SliceInteractable: series $i has a non-finite coordinate at index $k"))
        end
    end
    id = hasproperty(s, :id) && s.id !== nothing ? Symbol(s.id) : Symbol("s", i)
    label = hasproperty(s, :label) && s.label !== nothing ? String(s.label) : nothing
    color = hasproperty(s, :color) && s.color !== nothing ? s.color : nothing
    plateau = hasproperty(s, :plateau) && s.plateau === true
    probe = orientation === :vertical ? x : y
    _slice_probe_ok(probe, id; plateau)
    return (; id, label, color, x, y)
end

function _slice_unique_ids(series)
    seen = Dict{Symbol, Int}()
    out = NamedTuple[]
    for s in series
        n = get(seen, s.id, 0) + 1
        seen[s.id] = n
        id = n == 1 ? s.id : Symbol(s.id, :_, n)
        push!(out, (; id, s.label, s.color, s.x, s.y))
    end
    return out
end

function SliceInteractable(
        ax; series, orientation = :vertical, crosshair = true, id = :slice, covers = (), tooltip = nothing,
    )
    orientation in (:vertical, :horizontal) ||
        throw(ArgumentError("SliceInteractable: orientation must be :vertical or :horizontal, got $(orientation)"))
    crosshair isa Bool ||
        throw(ArgumentError("SliceInteractable: crosshair must be true or false, got $(crosshair)"))
    tooltip === true &&
        throw(ArgumentError("tooltip = true is not meaningful — omit `tooltip` for the auto table, pass masque\"…\" for a template, or `false` to suppress."))
    series isa AbstractVector || throw(ArgumentError("SliceInteractable: series must be a vector, got $(typeof(series))"))
    isempty(series) && throw(ArgumentError("SliceInteractable: series is empty"))
    built = NamedTuple[_slice_one(s, i, orientation) for (i, s) in enumerate(series)]
    unique_series = _slice_unique_ids(built)
    coord = orientation === :vertical ? :x : :y
    for s in unique_series
        s.id === coord && throw(
            ArgumentError(
                "SliceInteractable: series id :$(s.id) is the probe coordinate; rename it",
            )
        )
    end
    return SliceInteractable(ax, orientation, unique_series, Symbol(id), _slice_covers(covers), tooltip, crosshair)
end

events(::SliceInteractable) = (:hover,)
tooltip_spec(i::SliceInteractable) = i.tooltip

function validate(i::SliceInteractable, ctx::InteractionContext)
    i.ax isa _AxisOf && return "SliceInteractable(plots) finds its axis in `masque(fig, …)`; " *
        "call `SliceInteractable(ax, plots)` to build it yourself"
    i.ax isa Makie.Legend && return "SliceInteractable: ax is a Legend, not an Axis — a legend has no data-space series to sample."
    t = ctx.transforms[axis_id(ctx, i.ax)]
    t.is3d && return "SliceInteractable: sampling inverts a pixel to a data coordinate via the axis " *
        "transform, which is undefined on an Axis3 (a screen pixel is a ray, not a data value)."
    t.ispolar && return "SliceInteractable: a slice is not supported on PolarAxis (it samples along a " *
        "straight screen line, and a constant-θ probe is a ray). Use AxisInteractable to read (θ, r)."
    (t.xscale in _JS_INVERTIBLE && t.yscale in _JS_INVERTIBLE) ||
        return "SliceInteractable: sampling needs client-side invertible x and y scales " *
        "(x=$(t.xscale), y=$(t.yscale); supported: identity/log10/log)."
    (t.xcats === nothing && t.ycats === nothing) ||
        return "SliceInteractable: sampling needs continuous axes; a categorical axis has no numeric coordinate to interpolate."
    return nothing
end

function hitlayers(i::SliceInteractable, ctx)
    t = ctx.transforms[axis_id(ctx, i.ax)]
    orient = i.orientation === :vertical ? "v" : "h"
    series = Dict{String, Any}[]
    for s in i.series
        xy = Float64[]
        if i.orientation === :vertical
            for k in eachindex(s.x)
                push!(xy, s.x[k], s.y[k])
            end
        else
            for k in eachindex(s.x)
                push!(xy, s.y[k], s.x[k])
            end
        end
        d = Dict{String, Any}("id" => string(s.id), "xy" => xy)
        s.label === nothing || (d["label"] = s.label)
        if s.color !== nothing
            d["color"] = _css_color(s.color)
        end
        push!(series, d)
    end
    geom = Dict{String, Any}(
        "orientation" => orient,
        "crosshair" => i.crosshair,
        "covers" => [string(c) for c in i.covers],
        "series" => series,
    )
    return [HitLayer(i.id, :slice, geom, Any[], axis_id(ctx, i.ax), events(i))]
end

# ============================ custom: FunctionInteractable (Tier B) =======
"""
    FunctionInteractable(f; events=(:click, :hover))

Full-control escape hatch for a geometry kind the other built-ins don't express: `f(ctx) ->
Vector{HitLayer}` is called at manifest-build time and its result is used verbatim.

# Arguments
- `f` — a function `(ctx::InteractionContext,) -> Vector{HitLayer}`. Project data-space points
  with `data_to_image_px(ctx, ax, point)`, and look up an axis's transform id with
  `Masque.axis_id(ctx, ax)` (not exported) when constructing a `HitLayer`.
- `events` — the pointer events reported by `Masque.events(::FunctionInteractable)`; `f` is free
  to give its `HitLayer`s different `events` per layer if it wants. Default `(:click, :hover)`.

# Examples
```julia
FunctionInteractable() do ctx
    q = data_to_image_px(ctx, ax, (1.0, 2.0))
    [HitLayer(:custom, :circles, [q[1], q[2], 10], [(; label = "manual")], Masque.axis_id(ctx, ax), (:click, :hover))]
end
```
"""
struct FunctionInteractable <: AbstractInteractable
    f::Function; evs::Tuple
end
FunctionInteractable(f; events = (:click, :hover)) = FunctionInteractable(f, events)
events(i::FunctionInteractable) = i.evs
hitlayers(i::FunctionInteractable, ctx) = i.f(ctx)
