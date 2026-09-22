# Bond types and the wire → Julia transform. See docs/dev/architecture/05-bond-value.md
# and the design note for the contract. Indices on the wire stay 0-based; every Julia-facing
# number is 1-based. Subtract 1 only when writing the manifest; add 1 when reading the wire.

"""
    InteractionEvent

Abstract type of every `masque` `@bind` value that is not `nothing`. Concrete subtypes carry
the fields of that commit: an element pick, a legend entry, a grid cell or window, an axis or
colorbar click, a threshold, or ROI bounds. A `selects` ROI over points yields a
`Vector{ElementEvent}` instead of one event. Field names on the struct win over a payload key
of the same name; on an [`ElementEvent`](@ref) or [`LegendEvent`](@ref), other names forward
to the payload. See [`bondtype`](@ref) and [`transform_bond`](@ref).
"""
abstract type InteractionEvent end

"""
    ElementEvent(layer, index, payload)

One element of a point, bar, polygon, segment, polyline, or list-of-rects layer. `index` is
1-based. Other fields (e.g. `city`) are read from `payload`. Use as a row index:
`df[pick, :]`, `xs[pick]`.
"""
struct ElementEvent <: InteractionEvent
    layer::Symbol
    index::Int
    payload::Any
end

"""
    LegendEvent(layer, index, payload)

One legend entry. `index` is which entry (1-based), not a row of the author's table.
`entry.label` and `entry.targets` come from the payload. `df[entry, :]` does not treat the
entry number as a row.
"""
struct LegendEvent <: InteractionEvent
    layer::Symbol
    index::Int
    payload::Any
end

"""
    GridCellEvent(layer, i, j, value)

One heatmap or image cell. `i` and `j` are 1-based column and row of the author's
`(ncols, nrows)` matrix. `A[cell]` is `A[cell.i, cell.j]`. `value` is the shipped cell value,
or `nothing` when values were not sent.
"""
struct GridCellEvent <: InteractionEvent
    layer::Symbol
    i::Int
    j::Int
    value::Any
end

"""
    GridWindowEvent(layer, i1, i2, j1, j2, xmin, xmax, ymin, ymax)

A brushed window on a grid. Ranges are 1-based inclusive: `A[win]` is
`A[win.i1:win.i2, win.j1:win.j2]`. A miss has an empty `i1:i2` (and `j1:j2`).
"""
struct GridWindowEvent <: InteractionEvent
    layer::Symbol
    i1::Int
    i2::Int
    j1::Int
    j2::Int
    xmin::Float64
    xmax::Float64
    ymin::Float64
    ymax::Float64
end

"""
    AxisEvent(layer, x, y)

An axis click at data coordinates `(x, y)`. Not an array index.
"""
struct AxisEvent <: InteractionEvent
    layer::Symbol
    x::Float64
    y::Float64
end

"""
    ThresholdEvent(layer, value)

A threshold drag release at data coordinate `value`. Pass back as `value=` to restore the line.
"""
struct ThresholdEvent <: InteractionEvent
    layer::Symbol
    value::Float64
end

"""
    ColorbarEvent(layer, value)

A colorbar click at data coordinate `value`.
"""
struct ColorbarEvent <: InteractionEvent
    layer::Symbol
    value::Float64
end

"""
    BoundsEvent(layer, xmin, xmax, ymin, ymax)

A bounds-only ROI release. Pass back as `bounds=` to restore the box. A `selects` ROI is not a
`BoundsEvent`.
"""
struct BoundsEvent <: InteractionEvent
    layer::Symbol
    xmin::Float64
    xmax::Float64
    ymin::Float64
    ymax::Float64
end

# One owner per layer id: the interactable that produced the layer, and the HitLayer it returned.
# Attached to the widget (not the published manifest) so custom `transform_bond` can run at click.
struct LayerOwner
    interactable::AbstractInteractable
    layer::HitLayer
end

# ---------------------------------------------------------------------------
# Field forwarding, propertynames, show
# ---------------------------------------------------------------------------

function Base.getproperty(ev::InteractionEvent, name::Symbol)
    name === :layer && return getfield(ev, :layer)
    hasfield(typeof(ev), name) && return getfield(ev, name)
    ev isa Union{ElementEvent, LegendEvent} ||
        throw(ArgumentError("$(typeof(ev)) has no field $name"))
    pl = getfield(ev, :payload)
    hasproperty(pl, name) && return getproperty(pl, name)
    if pl isa AbstractDict
        haskey(pl, name) && return pl[name]
        ks = String(name)
        haskey(pl, ks) && return pl[ks]
    end
    throw(ArgumentError("$(typeof(ev)) has no field $name"))
end

function _payload_names(pl::NamedTuple)
    return collect(keys(pl))
end
function _payload_names(pl::AbstractDict)
    out = Symbol[]
    for k in keys(pl)
        k isa Symbol && push!(out, k)
        k isa AbstractString && push!(out, Symbol(k))
    end
    return out
end
function _payload_names(pl)
    try
        return collect(Symbol, propertynames(pl))
    catch
        return Symbol[]
    end
end

function Base.propertynames(ev::InteractionEvent)
    fs = fieldnames(typeof(ev))
    ev isa Union{ElementEvent, LegendEvent} || return fs
    pl = getfield(ev, :payload)
    data = _payload_names(pl)
    out = Symbol[]
    for n in fs
        n === :payload && continue
        push!(out, n)
    end
    for n in data
        n in out || push!(out, n)
    end
    push!(out, :payload)
    return Tuple(out)
end

function Base.show(io::IO, ev::InteractionEvent)
    print(io, nameof(typeof(ev)), '(')
    show(io, getfield(ev, :layer))
    if ev isa Union{ElementEvent, LegendEvent}
        print(io, ", ")
        show(io, getfield(ev, :index))
        pl = getfield(ev, :payload)
        if pl isa NamedTuple
            for k in keys(pl)
                k === :index && continue
                print(io, ", ", k, " = ")
                show(io, pl[k])
            end
        else
            print(io, ", ")
            show(io, pl)
        end
    else
        for f in fieldnames(typeof(ev))
            f === :layer && continue
            print(io, ", ", f, " = ")
            show(io, getfield(ev, f))
        end
    end
    return print(io, ')')
end

# ---------------------------------------------------------------------------
# Indexing
# ---------------------------------------------------------------------------

Base.to_index(ev::ElementEvent) = getfield(ev, :index)
Base.to_index(evs::AbstractVector{ElementEvent}) = Int[getfield(ev, :index) for ev in evs]

function Base.to_index(ev::InteractionEvent)
    throw(ArgumentError("$(getfield(ev, :layer)) ($(typeof(ev))) is not an element index"))
end

Base.to_indices(A, inds, I::Tuple{GridCellEvent, Vararg{Any}}) =
    to_indices(A, inds, (I[1].i, I[1].j, Base.tail(I)...))

Base.to_indices(A, inds, I::Tuple{GridWindowEvent, Vararg{Any}}) =
    to_indices(A, inds, (I[1].i1:I[1].i2, I[1].j1:I[1].j2, Base.tail(I)...))

# ---------------------------------------------------------------------------
# bondtype / transform_bond
# ---------------------------------------------------------------------------

"""
    bondtype(interactable) -> Type

The type of one commit from this interactable. Default [`ElementEvent`](@ref). A widget that
also carries a `selects` ROI aimed at points returns a `Vector{ElementEvent}` for every
element commit; that is a property of the call, not of the point layer's `bondtype`.
"""
bondtype(::AbstractInteractable) = ElementEvent
bondtype(::LegendInteractable) = LegendEvent
bondtype(::AxisInteractable) = AxisEvent
bondtype(::ColorbarInteractable) = ColorbarEvent
bondtype(::ThresholdInteractable) = ThresholdEvent
bondtype(::ROIInteractable) = BoundsEvent
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

function transform_bond(::Type{ElementEvent}, i, layer::HitLayer, index, js_payload)
    return _element_event(layer.id, index, layer.payloads)
end
function transform_bond(::Type{LegendEvent}, i, layer::HitLayer, index, js_payload)
    return _legend_event(layer.id, index, layer.payloads)
end
function transform_bond(::Type{GridCellEvent}, i, layer::HitLayer, index, js_payload)
    return _grid_cell_event(layer.id, js_payload)
end
function transform_bond(::Type{AxisEvent}, i, layer::HitLayer, index, js_payload)
    return _axis_event(layer.id, js_payload)
end
function transform_bond(::Type{ColorbarEvent}, i, layer::HitLayer, index, js_payload)
    return _colorbar_event(layer.id, js_payload)
end
function transform_bond(::Type{ThresholdEvent}, i, layer::HitLayer, index, js_payload)
    return _threshold_event(layer.id, js_payload)
end
function transform_bond(::Type{BoundsEvent}, i, layer::HitLayer, index, js_payload)
    return _bounds_event(layer.id, js_payload)
end
function transform_bond(::Type{Nothing}, i, layer::HitLayer, index, js_payload)
    throw(ArgumentError("bond: layer :$(layer.id) commits nothing"))
end

function transform_bond(i::AxisInteractable, layer::HitLayer, index, js_payload)
    return _axis_event(i.id, js_payload)
end
function transform_bond(i::ColorbarInteractable, layer::HitLayer, index, js_payload)
    return _colorbar_event(i.id, js_payload)
end
function transform_bond(i::ThresholdInteractable, layer::HitLayer, index, js_payload)
    return _threshold_event(i.id, js_payload)
end
function transform_bond(i::ROIInteractable, layer::HitLayer, index, js_payload)
    i.selects === nothing || throw(
        ArgumentError(
            "bond: ROI :$(i.id) selects :$(i.selects); the bond is the selection, not bounds",
        ),
    )
    return _bounds_event(i.id, js_payload)
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
# Event constructors shared by the owner path and the stamp path
# ---------------------------------------------------------------------------

function _element_event(id::Symbol, index, payloads)
    index isa Integer || throw(ArgumentError("bond: layer :$id element hit has no index"))
    n = length(payloads)
    idx = Int(index)
    (1 <= idx <= n) || throw(
        ArgumentError(
            "bond: layer :$id index $idx out of range for $n elements" *
                (n > 0 ? " (valid: 1:$n)" : ""),
        ),
    )
    return ElementEvent(id, idx, payloads[idx])
end

function _legend_event(id::Symbol, index, payloads)
    index isa Integer || throw(ArgumentError("bond: layer :$id legend hit has no index"))
    n = length(payloads)
    idx = Int(index)
    (1 <= idx <= n) || throw(
        ArgumentError(
            "bond: layer :$id index $idx out of range for $n entries" *
                (n > 0 ? " (valid: 1:$n)" : ""),
        ),
    )
    return LegendEvent(id, idx, payloads[idx])
end

function _js_req(js, key::String, id::Symbol)
    js isa AbstractDict && haskey(js, key) && return js[key]
    throw(ArgumentError("bond: layer :$id payload is missing `$key`"))
end

function _grid_cell_event(id::Symbol, js_payload)
    js_payload isa AbstractDict || throw(
        ArgumentError("bond: layer :$id grid cell payload must be a dict, got $(typeof(js_payload))"),
    )
    i = Int(_js_req(js_payload, "i", id)) + 1
    j = Int(_js_req(js_payload, "j", id)) + 1
    value = haskey(js_payload, "value") ? js_payload["value"] : nothing
    return GridCellEvent(id, i, j, value)
end

function _axis_event(id::Symbol, js_payload)
    return AxisEvent(id, Float64(_js_req(js_payload, "x", id)), Float64(_js_req(js_payload, "y", id)))
end

function _colorbar_event(id::Symbol, js_payload)
    return ColorbarEvent(id, Float64(_js_req(js_payload, "value", id)))
end

function _threshold_event(id::Symbol, js_payload)
    js_payload isa Real || throw(
        ArgumentError("bond: layer :$id threshold payload must be a number, got $(typeof(js_payload))"),
    )
    return ThresholdEvent(id, Float64(js_payload))
end

function _bounds_event(id::Symbol, js_payload)
    return BoundsEvent(
        id,
        Float64(_js_req(js_payload, "xmin", id)),
        Float64(_js_req(js_payload, "xmax", id)),
        Float64(_js_req(js_payload, "ymin", id)),
        Float64(_js_req(js_payload, "ymax", id)),
    )
end

function _grid_window_event(id::Symbol, js_payload)
    js_payload === nothing && return GridWindowEvent(id, 1, 0, 1, 0, 0.0, 0.0, 0.0, 0.0)
    return GridWindowEvent(
        id,
        Int(_js_req(js_payload, "i0", id)) + 1,
        Int(_js_req(js_payload, "i1", id)) + 1,
        Int(_js_req(js_payload, "j0", id)) + 1,
        Int(_js_req(js_payload, "j1", id)) + 1,
        Float64(_js_req(js_payload, "xmin", id)),
        Float64(_js_req(js_payload, "xmax", id)),
        Float64(_js_req(js_payload, "ymin", id)),
        Float64(_js_req(js_payload, "ymax", id)),
    )
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
    i isa FunctionInteractable && return kind_bond_stamp(L.kind)
    L.kind === :view && return "none"
    return "element"
end

# Wire index → Julia index (1-based) for an element kind; nothing for continuous / drag kinds.
const _ELEMENT_KINDS = (:circles, :rects, :polygons, :segments, :polyline)

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

# ---------------------------------------------------------------------------
# value= / bounds= coercion (constructors call these at runtime)
# ---------------------------------------------------------------------------

_threshold_value(x::Real) = Float64(x)
_threshold_value(x::ThresholdEvent) = getfield(x, :value)
function _threshold_value(x)
    throw(ArgumentError("ThresholdInteractable: value must be a number or a ThresholdEvent, got $(typeof(x))"))
end

_roi_bounds(b::BoundsEvent) = (b.xmin, b.xmax, b.ymin, b.ymax)
function _roi_bounds(bounds)
    length(bounds) == 4 || throw(ArgumentError("ROIInteractable: bounds must be (xmin, xmax, ymin, ymax)"))
    xmin, xmax, ymin, ymax = Float64.(Tuple(bounds))
    return (xmin, xmax, ymin, ymax)
end

# ---------------------------------------------------------------------------
# Envelope → Julia value (both backends)
# ---------------------------------------------------------------------------

function _manifest_layer(manifest::AbstractDict, id::AbstractString)
    layers = get(manifest, "layers", nothing)
    layers === nothing && throw(ArgumentError("bond: this manifest has no layers"))
    i = findfirst(d -> d["id"] == id, layers)
    i === nothing && throw(ArgumentError("bond: layer :$id is not in this widget"))
    return layers[i]
end

function _one_event(manifest, owners, js; wrap::Bool)
    layer_id = String(js["layer"])
    d = _manifest_layer(manifest, layer_id)
    kind = Symbol(d["kind"])
    wire = Int(js["index"])
    index = julia_index(kind, wire)
    js_payload = get(js, "payload", nothing)
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
