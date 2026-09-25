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

The type of one commit from this interactable. Default [`ElementEvent`](@ref). When the same
widget carries a `selects` ROI aimed at this interactable's point layer, a click on one of its
points arrives as a one-element `Vector{ElementEvent}`; that is a property of the call, not of
the point layer's `bondtype`.
"""
bondtype(::AbstractInteractable) = ElementEvent
bondtype(::ViewInteractable) = Nothing
function bondtype(i::RectInteractable)
    return i.layout === :grid ? GridCellEvent : ElementEvent
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

function transform_bond(i::RectInteractable, layer::HitLayer, index, js_payload)
    i.layout === :list && return _element_event(i.id, index, layer.payloads)
    return _grid_cell_event(i.id, js_payload)
end
function transform_bond(i::ViewInteractable, layer::HitLayer, index, js_payload)
    throw(ArgumentError("bond: layer :$(i.id) is a view gesture and commits nothing"))
end
function transform_bond(i::FunctionInteractable, layer::HitLayer, index, js_payload)
    k = layer.kind
    k === :grid && return _grid_cell_event(layer.id, js_payload)
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
    kind === :grid && return "gridcell"
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
    if i isa ROIInteractable
        return i.selects === nothing ? "bounds" : "none"
    end
    if i isa RectInteractable
        return i.layout === :grid ? "gridcell" : "element"
    end
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
    bond == "gridcell" && return _grid_cell_event(id, js_payload)
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

function explicit_empty_seed(selected)::Bool
    selected === nothing && return false
    selected isa AbstractVector && return isempty(selected)
    if selected isa NamedTuple || selected isa AbstractDict
        isempty(selected) && return false
        return all(v -> v isa AbstractVector && isempty(v), values(selected))
    end
    return false
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

function _one_event(manifest, owners, js; wrap::Bool)
    layer_id = String(js["layer"])
    d = _manifest_layer(manifest, layer_id)
    kind = Symbol(d["kind"])
    wire = Int(js["index"])
    index = julia_index(kind, wire)
    if get(manifest, "selection", nothing) == "grid" &&
            get(manifest, "selectionTarget", nothing) == layer_id
        throw(
            ArgumentError(
                "bond: grid :$layer_id is brushed by a `selects` box, which owns the bond; " *
                    "a click on one of its cells commits nothing (expected an {items} window)",
            ),
        )
    end
    js_payload = _decategorize(manifest, d, get(js, "payload", nothing))
    ev = if haskey(owners, layer_id)
        o = owners[layer_id]
        transform_bond(o.interactable, o.layer, index, js_payload)
    else
        event_from_stamp(d, index, js_payload)
    end
    if wrap && get(manifest, "selection", nothing) == "elements" &&
            get(manifest, "selectionTarget", nothing) == layer_id
        ev isa ElementEvent || throw(
            ArgumentError(
                "bond: selection target :$layer_id produced a $(typeof(ev)), expected ElementEvent",
            ),
        )
        return ElementEvent[ev]
    end
    return ev
end

function selection_value(manifest, owners, items)
    sel = get(manifest, "selection", nothing)
    if sel == "grid"
        target = get(manifest, "selectionTarget", nothing)
        target === nothing && throw(ArgumentError("bond: grid selection has no selectionTarget"))
        id = Symbol(target)
        isempty(items) && return _grid_window_event(id, nothing)
        length(items) == 1 || throw(
            ArgumentError("bond: a grid brush must carry one window item, got $(length(items))"),
        )
        it = only(items)
        return _grid_window_event(id, get(it, "payload", nothing))
    end
    if sel != "elements"
        throw(
            ArgumentError(
                "bond: an items envelope needs a selects target " *
                    "(manifest selection is $(repr(sel)))",
            ),
        )
    end
    out = ElementEvent[]
    for it in items
        ev = _one_event(manifest, owners, it; wrap = false)
        ev isa ElementEvent || throw(
            ArgumentError("bond: selection item is a $(typeof(ev)), expected ElementEvent"),
        )
        push!(out, ev)
    end
    return out
end

"""
    mount_envelope(manifest) -> Union{Nothing, Dict}

The wire envelope `mount.ts` seeds into `host.value` at mount, so Julia `initial_value` and the
browser agree. A `selects` elements call seeds `{items}` (possibly empty when `hydrate` is set).
A single hydrated index on a scalar layer seeds `{layer, index}`. Multiple indices on a scalar
layer are highlight-only (`nothing`).
"""
function mount_envelope(manifest::AbstractDict)
    hydrated = Dict{String, Any}[]
    for d in get(manifest, "layers", Any[])
        idxs = get(d, "selected", nothing)
        idxs === nothing && continue
        for idx in idxs
            push!(hydrated, Dict{String, Any}("layer" => d["id"], "index" => Int(idx)))
        end
    end
    sel = get(manifest, "selection", nothing)
    if sel == "elements" && (!isempty(hydrated) || get(manifest, "hydrate", nothing) == "items")
        return Dict{String, Any}("items" => hydrated)
    end
    length(hydrated) == 1 && return only(hydrated)
    return nothing
end

"""
    bond_from_js(manifest, owners, js) -> Union{Nothing, InteractionEvent, Vector}

Pluto's `transform_value` entry: turn the browser envelope into the Julia bond. `owners` maps
layer id strings to [`LayerOwner`](@ref) (empty for hand-built test manifests; the layer's
`bond` stamp is enough for built-ins).
"""
function bond_from_js(manifest::AbstractDict, owners, js)
    js === nothing && return nothing
    haskey(js, "items") && return selection_value(manifest, owners, js["items"])
    return _one_event(manifest, owners, js; wrap = true)
end

function bond_from_js(w, js)
    return bond_from_js(w.manifest, w.owners, js)
end

function initial_bond(w)
    return bond_from_js(w.manifest, w.owners, mount_envelope(w.manifest))
end

function with_owners end   # backends that own a distinct widget type extend this
