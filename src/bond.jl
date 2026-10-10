# Bond routing: which event a layer commits, the wire envelope, and `selected=` normalization.
# Concrete event types live in events.jl. Indices on the wire stay 0-based; every Julia-facing
# number is 1-based. Subtract 1 only when writing the manifest; add 1 when reading the wire.

# One owner per layer id: the interactable that produced the layer, and the HitLayer it returned.
# Attached to the widget (not the published manifest) so custom `transform_bond` can run at click.
struct LayerOwner
    interactable::AbstractInteractable
    layer::HitLayer
end

# ---------------------------------------------------------------------------
# bondtype / transform_bond — the methods that pick a type
# ---------------------------------------------------------------------------

"""
    bondtype(interactable) -> Type

The type of one commit from this interactable, the value its field holds. Default
[`ElementEvent`](@ref).
"""
bondtype(::AbstractInteractable) = ElementEvent
bondtype(::ViewInteractable) = Nothing
bondtype(::GridInteractable) = GridCellEvent
bondtype(::SurfaceInteractable) = GridCellEvent

# The wire envelope a control's field starts at, as the browser would send it on release.
# `layers` are the manifest's layer dicts.
initial_envelope(::AbstractInteractable, ctx, layers) = nothing
function initial_envelope(i::ThresholdInteractable, ctx, layers)
    t = ctx.transforms[axis_id(ctx, i.ax)]
    cats = i.orientation === :horizontal ? t.ycats : t.xcats
    k = cats === nothing || !isinteger(i.value) ? 0 : Int(i.value)
    # On a categorical dimension the browser sends the category's label, as a release does.
    payload = 1 <= k <= length(something(cats, ())) ? cats[k] : i.value
    return Dict{String, Any}("layer" => string(i.id), "index" => 0, "payload" => payload)
end
function initial_envelope(i::ROIInteractable, ctx, layers)
    xmin, xmax, ymin, ymax = i.bounds
    payload = Dict{String, Any}("xmin" => xmin, "xmax" => xmax, "ymin" => ymin, "ymax" => ymax)
    return Dict{String, Any}("layer" => string(i.id), "index" => 0, "payload" => payload)
end

# What a box's target holds before the first drag: the elements inside the box's starting
# bounds, as a release of the untouched box would send them. `seed` is the target's 0-based
# `selected=` indices, which win over the box. The first box on the target decides.
function _brush_start(target, built, seed, layers)
    tl = only(l for l in layers if l["id"] == string(target))
    if tl["kind"] != "grid"
        idxs = seed !== nothing ? seed : begin
                box = first(d for (i, _, d) in built if selects(i) === target)["geometry"]
                _contained_indices(box, tl["geometry"])
            end
        return Dict{String, Any}("items" => [Dict{String, Any}("layer" => string(target), "index" => k) for k in idxs])
    end
    i, _, d = first((i, L, d) for (i, L, d) in built if selects(i) === target)
    cells = _contained_cells(d["geometry"], tl["geometry"])
    cells === nothing && return Dict{String, Any}("items" => Dict{String, Any}[])
    ci, cj = cells
    xmin, xmax, ymin, ymax = i.bounds
    # The data bounds the box was given, where the browser inverts its pixel corners.
    payload = Dict{String, Any}(
        "i0" => ci[1], "i1" => ci[2], "j0" => cj[1], "j1" => cj[2],
        "xmin" => xmin, "xmax" => xmax, "ymin" => ymin, "ymax" => ymax,
    )
    return Dict{String, Any}("items" => [Dict{String, Any}("layer" => string(target), "index" => 0, "payload" => payload)])
end

# What a box at image-px `box` holds: the 0-based indices of the circles whose centres it
# contains, or the grid cells it overlaps (`nothing` if none). The same comparisons as
# `computeSelection` in frontend/src/selection.ts, on the same manifest numbers, so the starting
# value and a release at the starting bounds agree.
_box_span(box) = (Float64(box["x"]), Float64(box["x"]) + Float64(box["w"]), Float64(box["y"]), Float64(box["y"]) + Float64(box["h"]))
function _contained_indices(box, a)
    xlo, xhi, ylo, yhi = _box_span(box)
    return Int[
        k for k in 0:(length(a) ÷ 3 - 1)
            if xlo <= Float64(a[3k + 1]) <= xhi && ylo <= Float64(a[3k + 2]) <= yhi
    ]
end
function _contained_cells(box, g)
    xlo, xhi, ylo, yhi = _box_span(box)
    ci = _cell_range(g["xedges"], xlo, xhi)
    cj = _cell_range(g["yedges"], ylo, yhi)
    return ci === nothing || cj === nothing ? nothing : (ci, cj)
end

# `cellRange` in selection.ts: the 0-based, inclusive cells a pixel span `[lo, hi]` overlaps
# on monotonic `edges`, or `nothing`. `_find_bin` is geometry.ts's `findBin`. An end cell the
# span only grazes, by `_EDGE_SLACK` px or less and not all of it, is left out (#337): the cell
# edges are whole pixels, so a box edge on a data cell edge lands up to half a pixel past it.
const _EDGE_SLACK = 0.5
function _cell_range(edges, lo, hi)
    e1 = Float64(first(edges)); en = Float64(last(edges))
    clo = max(lo, min(e1, en)); chi = min(hi, max(e1, en))
    chi < clo && return nothing
    a = _find_bin(edges, clo); b = _find_bin(edges, chi)
    (a < 0 || b < 0) && return nothing
    i0, i1 = minmax(a, b)
    function grazes(k)
        c0, c1 = minmax(Float64(edges[k + 1]), Float64(edges[k + 2]))
        overlap = min(chi, c1) - max(clo, c0)
        return overlap <= _EDGE_SLACK && overlap < c1 - c0
    end
    i0 < i1 && grazes(i0) && (i0 += 1)
    i0 < i1 && grazes(i1) && (i1 -= 1)
    return (i0, i1)
end

"""
    transform_bond(interactable, layer, index, js_payload) -> InteractionEvent

Build one event from a wire hit. `index` is already 1-based for an element kind, or `nothing`
for axis / colorbar / threshold / ROI / grid (those read the browser payload). Custom
interactables implement this (and [`bondtype`](@ref)) when the default [`ElementEvent`](@ref)
is not enough; a type that only wants `ElementEvent` writes [`hitlayers`](@ref) and inherits
the default.
"""
function transform_bond(i::AbstractInteractable, layer::HitLayer, index, js_payload)
    return transform_bond(bondtype(i), i, layer, index, js_payload)
end

function transform_bond(::Type{Nothing}, i, layer::HitLayer, index, js_payload)
    throw(ArgumentError("bond: layer :$(layer.id) commits nothing"))
end

function transform_bond(i::Union{GridInteractable, SurfaceInteractable}, layer::HitLayer, index, js_payload)
    return _grid_cell_event(i.id, js_payload, layer.payloads, layer.geometry)
end
function transform_bond(i::ViewInteractable, layer::HitLayer, index, js_payload)
    throw(ArgumentError("bond: layer :$(i.id) is a view gesture and commits nothing"))
end
function transform_bond(i::FunctionInteractable, layer::HitLayer, index, js_payload)
    k = layer.kind
    k in (:grid, :surface) && return _grid_cell_event(layer.id, js_payload, layer.payloads, layer.geometry)
    k === :axis && return _axis_event(layer.id, js_payload)
    k === :threshold && return _threshold_event(layer.id, js_payload)
    k === :roi && return _bounds_event(layer.id, js_payload)
    k === :view && throw(ArgumentError("bond: layer :$(layer.id) commits nothing"))
    return _element_event(layer.id, index, layer.payloads)
end

# ---------------------------------------------------------------------------
# Manifest stamps and wire index
# ---------------------------------------------------------------------------

# Wire kind → bond stamp when the interactable is a FunctionInteractable (or stamp is missing).
function kind_bond_stamp(kind::Symbol)
    kind in (:grid, :surface) && return "gridcell"
    kind === :axis && return "axis"
    kind === :threshold && return "threshold"
    kind === :roi && return "bounds"
    kind === :view && return "none"
    kind === :slice && return "none"
    return "element"
end

function bond_stamp(i::AbstractInteractable, L::HitLayer)
    i isa ViewInteractable && return "none"
    i isa LegendInteractable && return "legend"
    i isa AxisInteractable && return "axis"
    i isa ColorbarInteractable && return "colorbar"
    i isa ThresholdInteractable && return "threshold"
    i isa ROIInteractable && return "bounds"
    i isa Union{GridInteractable, SurfaceInteractable} && return "gridcell"
    i isa SliceInteractable && return "none"
    i isa FunctionInteractable && return kind_bond_stamp(L.kind)
    L.kind === :view && return "none"
    L.kind === :slice && return "none"
    return "element"
end

# Wire index → Julia index (1-based) for an element kind; nothing for continuous / drag kinds.
const _ELEMENT_KINDS = (:circles, :rects, :polygons, :segments, :polyline, :lines)

function julia_index(kind::Symbol, wire::Integer)
    kind in _ELEMENT_KINDS && return Int(wire) + 1
    return nothing
end

function event_from_stamp(d::AbstractDict, index, js_payload)
    id = Symbol(d["id"])
    kind = Symbol(d["kind"])
    bond = get(d, "bond", nothing)
    if bond === nothing
        # Hand-built test manifests may omit the stamp; element kinds are unambiguous.
        kind in _ELEMENT_KINDS || throw(
            ArgumentError(
                "bond: layer :$id (kind :$kind) has no bond stamp; " *
                    "rebuild the manifest or set layer[\"bond\"]",
            ),
        )
        bond = "element"
    end
    bond == "element" && return _element_event(id, index, d["payloads"])
    bond == "legend" && return _legend_event(id, index, d["payloads"])
    bond == "gridcell" && return _grid_cell_event(id, js_payload, get(d, "payloads", Any[]), get(d, "geometry", nothing))
    bond == "axis" && return _axis_event(id, js_payload)
    bond == "colorbar" && return _colorbar_event(id, js_payload)
    bond == "threshold" && return _threshold_event(id, js_payload)
    bond == "bounds" && return _bounds_event(id, js_payload)
    bond == "none" && throw(ArgumentError("bond: layer :$id commits nothing"))
    throw(ArgumentError("bond: layer :$id has unknown bond stamp $(repr(bond))"))
end

# ---------------------------------------------------------------------------
# selected= normalization (1-based author indices → Dict of 1-based vectors)
# ---------------------------------------------------------------------------

function _seed_pair(ev::Union{ElementEvent, LegendEvent})
    return getfield(ev, :layer), getfield(ev, :index)
end
function _seed_pair(ev::InteractionEvent)
    throw(
        ArgumentError(
            "selected: a $(typeof(ev)) is not an element index; pass an element or legend event",
        ),
    )
end

function _bare_indices(seedable_ids::Vector{Symbol}, idxs::Vector{Int})
    if length(seedable_ids) != 1
        if isempty(seedable_ids)
            throw(ArgumentError("selected: this figure has no layer that can take an element index"))
        end
        names = join(string.(sort(seedable_ids)), ", ")
        throw(
            ArgumentError(
                "selected: a bare index is ambiguous across layers $names; name the layer",
            ),
        )
    end
    return Dict{Symbol, Vector{Int}}(only(seedable_ids) => idxs)
end

function _value_indices(id::Symbol, v::Integer)
    v isa Bool && throw(ArgumentError("selected: key :$id must not be a Bool"))
    return Int[Int(v)]
end
function _value_indices(id::Symbol, v::Union{ElementEvent, LegendEvent})
    getfield(v, :layer) === id || throw(
        ArgumentError("selected: key :$id does not match $(typeof(v)) layer :$(getfield(v, :layer))"),
    )
    return Int[getfield(v, :index)]
end
function _value_indices(id::Symbol, v::InteractionEvent)
    throw(ArgumentError("selected: key :$id holds a $(typeof(v)), which is not an element index"))
end
function _value_indices(id::Symbol, v::AbstractVector)
    isempty(v) && return Int[]
    if all(x -> x isa Integer && !(x isa Bool), v)
        return Int[Int(x) for x in v]
    end
    if all(x -> x isa InteractionEvent, v)
        out = Int[]
        for ev in v
            layer, idx = _seed_pair(ev)
            layer === id || throw(
                ArgumentError("selected: key :$id does not match $(typeof(ev)) layer :$layer"),
            )
            push!(out, idx)
        end
        return out
    end
    throw(
        ArgumentError(
            "selected: key :$id must be an index, an event, or a vector of either; got $(typeof(v))",
        ),
    )
end
function _value_indices(id::Symbol, v)
    throw(
        ArgumentError(
            "selected: key :$id must be an index, an event, or a vector of either; got $(typeof(v))",
        ),
    )
end

function _keyed_selected(layer_ids::Vector{Symbol}, selected)
    known = Set(layer_ids)
    d = Dict{Symbol, Vector{Int}}()
    for (k, v) in pairs(selected)
        id = k isa Symbol ? k : Symbol(k)
        id in known || throw(
            ArgumentError(
                "selected: :$id is not a layer in this masque() call " *
                    "(available: $(join(sort(string.(layer_ids)), ", ")))",
            ),
        )
        d[id] = _value_indices(id, v)
    end
    return d
end

"""
    normalize_selected(layer_ids, seedable_ids, selected) -> Dict{Symbol,Vector{Int}}

Accept the author forms of `selected=` (1-based) and return a layer → indices map, still
1-based. Range checks and 0-based storage happen in `_check_selected`.
"""
function normalize_selected(layer_ids::Vector{Symbol}, seedable_ids::Vector{Symbol}, selected)
    selected === nothing && return Dict{Symbol, Vector{Int}}()
    if selected isa InteractionEvent
        layer, idx = _seed_pair(selected)
        return Dict{Symbol, Vector{Int}}(layer => Int[idx])
    end
    if selected isa Integer
        selected isa Bool && throw(ArgumentError("selected: a Bool is not an element index"))
        return _bare_indices(seedable_ids, Int[Int(selected)])
    end
    if selected isa AbstractVector
        isempty(selected) && return Dict{Symbol, Vector{Int}}()
        if all(x -> x isa Integer && !(x isa Bool), selected)
            return _bare_indices(seedable_ids, Int[Int(x) for x in selected])
        end
        if all(x -> x isa InteractionEvent, selected)
            d = Dict{Symbol, Vector{Int}}()
            for ev in selected
                layer, idx = _seed_pair(ev)
                push!(get!(() -> Int[], d, layer), idx)
            end
            return d
        end
        throw(
            ArgumentError(
                "selected: a vector must be element indices or events; got $(typeof(selected))",
            ),
        )
    end
    if selected isa NamedTuple || selected isa AbstractDict
        return _keyed_selected(layer_ids, selected)
    end
    throw(
        ArgumentError(
            "selected: expected nothing, an index, a vector of indices, an event, " *
                "or a layer-keyed collection; got $(typeof(selected))",
        ),
    )
end

# Closed kinds get the selected wash; open kinds (:segments/:polyline/:lines) get the ring.
# `selected=` on any other kind fails loud.
const _SELECTED_KINDS = (:circles, :rects, :polygons, :segments, :polyline, :lines)

# Element count for a HitLayer geometry, matching the JS layout in types.ts / hitLayerByIndex.
function _layer_n_elements(kind::Symbol, geometry)
    return if kind === :circles
        length(geometry) ÷ 3
    elseif kind === :rects
        length(geometry) ÷ 4
    elseif kind === :polygons
        length(geometry)
    elseif kind === :segments
        length(geometry) ÷ 4
    elseif kind === :polyline
        max(0, length(geometry) ÷ 2 - 1)
    elseif kind === :lines
        length(geometry)
    elseif kind === :grid
        Int(geometry["ncols"]) * Int(geometry["nrows"])
    else
        0   # :axis / :threshold / :roi / :view — not element-indexed for selected=
    end
end

# Validate `selected=` indices for one layer: supported kind + in-range (1-based). Stores 0-based.
function _check_selected(L::HitLayer, sel)
    kind = L.kind
    if !(kind in _SELECTED_KINDS)
        throw(
            ArgumentError(
                "selected: layer :$(L.id) has kind :$kind, which does not support pre-highlight " *
                    "(supported: $(join(_SELECTED_KINDS, ", ")))",
            ),
        )
    end
    n = _layer_n_elements(kind, L.geometry)
    idxs = collect(Int, sel)
    for idx in idxs
        (1 <= idx <= n) || throw(
            ArgumentError(
                "selected: layer :$(L.id) index $idx out of range for $n elements" *
                    (n > 0 ? " (valid: 1:$n)" : ""),
            ),
        )
    end
    return idxs .- 1
end

function _manifest_layer(manifest::AbstractDict, id::AbstractString)
    layers = get(manifest, "layers", nothing)
    layers === nothing && throw(ArgumentError("bond: this manifest has no layers"))
    i = findfirst(d -> d["id"] == id, layers)
    i === nothing && throw(ArgumentError("bond: layer :$id is not in this widget"))
    return layers[i]
end

# On a categorical dimension the overlay sends the category label, not a number (`mapAxis` in
# geometry.ts), so the hover card can show it. Makie places categories at `1:n`: the label
# becomes its position here, before any `transform_bond`, and travels on as `xcat` / `ycat`
# (axis) or `category` (threshold). The payload shapes are pinned in frontend/test/geometry.test.ts
# ("categorical wire payloads").
function _decategorize(manifest::AbstractDict, d::AbstractDict, js_payload)
    kind = d["kind"]
    (kind == "axis" || kind == "threshold") || return js_payload
    t = get(get(manifest, "transforms", Dict()), string(get(d, "axis", "")), nothing)
    id = d["id"]
    if kind == "axis"
        js_payload isa AbstractDict || return js_payload
        any(k -> get(js_payload, k, nothing) isa AbstractString, ("x", "y")) || return js_payload
        out = Dict{String, Any}(string(k) => v for (k, v) in js_payload)
        for k in ("x", "y")
            v = get(out, k, nothing)
            v isa AbstractString || continue
            out[k] = _category_position(t, k, v, id)
            out[k * "cat"] = String(v)
        end
        return out
    end
    js_payload isa AbstractString || return js_payload
    g = get(d, "geometry", nothing)
    dim = g isa AbstractDict && get(g, "orientation", "v") == "h" ? "y" : "x"
    return Dict{String, Any}(
        "value" => _category_position(t, dim, js_payload, id), "category" => String(js_payload),
    )
end

function _category_position(t, dim, label, id)
    cats = t === nothing ? nothing : get(t, dim * "cats", nothing)
    cats === nothing && throw(
        ArgumentError("bond: layer :$id sent $(repr(label)) for $dim, which is not a categorical axis"),
    )
    k = findfirst(==(label), cats)
    k === nothing && throw(
        ArgumentError("bond: layer :$id sent $(repr(label)), which is not a category on its $dim axis"),
    )
    return Float64(k)
end

function _one_event(manifest, owners, js)
    layer_id = String(js["layer"])
    d = _manifest_layer(manifest, layer_id)
    kind = Symbol(d["kind"])
    wire = Int(js["index"])
    index = julia_index(kind, wire)
    js_payload = _decategorize(manifest, d, get(js, "payload", nothing))
    ev = if haskey(owners, layer_id)
        o = owners[layer_id]
        transform_bond(o.interactable, o.layer, index, js_payload)
    else
        event_from_stamp(d, index, js_payload)
    end
    return ev
end

# A box's target field: the marks it holds as a `Vector{ElementEvent}`, or the grid cells as
# one `GridWindowEvent`.
function _brush_value(manifest, owners, d, env)
    id = Symbol(d["id"])
    env === nothing || (env isa AbstractDict && haskey(env, "items")) || throw(
        ArgumentError("bond: field :$id holds the elements a box encloses, `{items: [...]}`; got $(repr(env))"),
    )
    items = env === nothing ? Any[] : env["items"]
    if d["brush"] == "grid"
        isempty(items) && return _grid_window_event(id, nothing)
        length(items) == 1 || throw(
            ArgumentError("bond: a grid brush must carry one window item, got $(length(items))"),
        )
        return _grid_window_event(id, get(only(items), "payload", nothing))
    end
    out = ElementEvent[]
    for it in items
        String(it["layer"]) == d["id"] || throw(
            ArgumentError("bond: field :$id holds an element of layer :$(it["layer"])"),
        )
        ev = _one_event(manifest, owners, it)
        ev isa ElementEvent || throw(
            ArgumentError("bond: selection item is a $(typeof(ev)), expected ElementEvent"),
        )
        push!(out, ev)
    end
    return out
end

function _field_value(manifest, owners, field::AbstractString, env)
    d = _manifest_layer(manifest, field)
    haskey(d, "brush") && return _brush_value(manifest, owners, d, env)
    env === nothing && return nothing
    env isa AbstractDict && haskey(env, "layer") || throw(
        ArgumentError("bond: field :$field holds $(repr(env)), expected a commit `{layer, index}`"),
    )
    String(env["layer"]) == field || throw(
        ArgumentError("bond: field :$field holds a commit from layer :$(env["layer"])"),
    )
    return _one_event(manifest, owners, env)
end

"""
    mount_envelope(manifest) -> Dict

The wire value `mount.ts` seeds into `host.value` at mount, so Julia `initial_value` and the
browser agree: every field's starting envelope (`build_manifest`'s `initial`).
"""
mount_envelope(manifest::AbstractDict) = get(manifest, "initial", Dict{String, Any}())

"""
    bond_from_js(manifest, owners, js) -> NamedTuple or one field's value

Pluto's `transform_value` entry: turn the browser's value, one envelope per field, into the
`@bind` value. A `NamedTuple` with one entry per field, in the manifest's `fields` order, or
that one field's value when `bind` named one. `owners` maps layer id strings to
[`LayerOwner`](@ref) (empty for hand-built test manifests; the layer's `bond` stamp is enough
for built-ins).
"""
function bond_from_js(manifest::AbstractDict, owners, js)
    js === nothing && (js = mount_envelope(manifest))
    js isa AbstractDict || throw(
        ArgumentError("bond: expected one value per field, got $(typeof(js))"),
    )
    fields = get(manifest, "fields", String[])
    for k in keys(js)
        k in fields || throw(
            ArgumentError("bond: `$(k)` is not a field of this value (fields: $(join(fields, ", ")))"),
        )
    end
    vals = Tuple(_field_value(manifest, owners, f, get(js, f, nothing)) for f in fields)
    get(manifest, "bare", false) === true && return only(vals)
    return NamedTuple{Tuple(Symbol.(fields))}(vals)
end

function bond_from_js(w, js)
    return bond_from_js(w.manifest, w.owners, js)
end

function initial_bond(w)
    return bond_from_js(w.manifest, w.owners, mount_envelope(w.manifest))
end

function with_owners end   # backends that own a distinct widget type extend this

# ---------------------------------------------------------------------------
# A call's starting value
# ---------------------------------------------------------------------------

# `selected=` as 0-based indices per field. A key must be a field that holds picks: a control
# starts at its own value, and a layer outside the bind value takes no picks.
function _field_seeds(built, fields, roles, binding, selected)
    seeds = Dict{Symbol, Vector{Int}}()
    selected === nothing && return seeds
    layer_ids = Symbol[L.id for (_, L, _) in built]
    by_id = Dict(L.id => L for (_, L, _) in built)
    seedable = Symbol[f for f in fields if roles[f] in (:pick, :brush) && by_id[f].kind in _SELECTED_KINDS]
    for (id, idxs) in normalize_selected(layer_ids, seedable, selected)
        id in layer_ids || throw(
            ArgumentError(
                "selected: :$id is not a layer in this masque() call " *
                    "(available: $(join(sort(string.(layer_ids)), ", ")))",
            ),
        )
        if !(id in fields)
            throw(
                ArgumentError(
                    binding.refs === nothing ?
                        "selected: :$id takes no picks; it has no `:click` in its `events`, or it is a line, which takes clicks once it is bound" :
                        "selected= names :$id, which isn't in bind (fields: $(_field_list(fields)))",
                ),
            )
        end
        roles[id] === :control && throw(
            ArgumentError("selected: :$id is a control; it starts at its own value, which its constructor sets"),
        )
        roles[id] === :pick && length(idxs) > 1 && throw(
            ArgumentError("selected: :$id holds one pick, got $(length(idxs)) indices"),
        )
        seeds[id] = _check_selected(by_id[id], idxs)
    end
    return seeds
end

"""
    _initial_value(built, fields, roles, binding, selected, ctx, layers) -> Dict

Every field's starting wire envelope, the value the browser sends until the first commit:
`nothing` for a pick `selected=` does not seed, `{layer, index}` for one it does, a control's
start, and the elements a box's starting bounds hold for its target.
"""
function _initial_value(built, fields, roles, binding, selected, ctx, layers)
    seeds = _field_seeds(built, fields, roles, binding, selected)
    by_id = Dict(L.id => i for (i, L, _) in built)
    out = Dict{String, Any}()
    for f in fields
        out[string(f)] = if roles[f] === :control
            initial_envelope(by_id[f], ctx, layers)
        elseif roles[f] === :brush
            _brush_start(f, built, get(seeds, f, nothing), layers)
        else
            idxs = get(seeds, f, Int[])
            isempty(idxs) ? nothing : Dict{String, Any}("layer" => string(f), "index" => only(idxs))
        end
    end
    return out
end
