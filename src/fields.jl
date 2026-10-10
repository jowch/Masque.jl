# The `@bind` value's fields: which layers commit, under which names, and in which order.
# `masque` reads names from three places (`id=`, a NamedTuple argument, a NamedTuple `bind`),
# checks they agree, and hands `build_manifest` a `_Binding` that says which layers are fields.

# What one `masque` call binds. `refs` holds the `bind` entries in order, each as the label an
# error names it by and the ids it stands for: a layer id, or an interactable's id whose layers
# all count (`RegionInteractable` builds `:region_c` and `:region_r`). `refs === nothing` binds
# every layer that can commit. `bare` unwraps a value of one field. `defaults` are the ids of
# the defaults left in the call: a default line takes no clicks unless `bind` names it.
struct _Binding
    refs::Union{Nothing, Vector{Pair{String, Vector{Symbol}}}}
    bare::Bool
    defaults::Set{Symbol}
end
_Binding() = _Binding(nothing, false, Set{Symbol}())

# The interactables of one call with its binding. It is a vector, so a backend's `make_widget`
# passes it on to `_view_render_frame` as it is, and every frame's manifest makes the same
# fields as the first.
struct _Plan <: AbstractVector{AbstractInteractable}
    ints::Vector{AbstractInteractable}
    binding::_Binding
end
Base.size(p::_Plan) = size(p.ints)
Base.getindex(p::_Plan, k::Int) = p.ints[k]
Base.IndexStyle(::Type{_Plan}) = IndexLinear()
_binding(p::_Plan) = p.binding
_binding(_) = _Binding()

# The object a name belongs to: a plot for `interactables(plot)`, else the interactable.
_named_key(r::_PlotRequest) = r.plot
_named_key(x) = x

_describe(p::Makie.AbstractPlot) = "the `$(Makie.plotkey(p))` plot"
_describe(r::_PlotRequest) = _describe(r.plot)
_describe(i) = "a $(nameof(typeof(i)))"

# The name an object already carries: an `id` the caller chose. A constructor's default id
# (`:threshold`, `:roi`) is not a choice, so it names nothing and yields to any other name.
_own_name(r::_PlotRequest) = haskey(r.kwargs, :id) ? Symbol(r.kwargs[:id]) : nothing
function _own_name(i)
    id = _layer_id(i)
    return id === nothing || id in _BUILTIN_IDS ? nothing : id
end

function _give_name!(names, key, name::Symbol)
    old = get(names, key, nothing)
    old === nothing || old === name || throw(
        ArgumentError("masque: $(_describe(key)) is named both :$old and :$name; give it one name"),
    )
    names[key] = name
    return nothing
end

# One NamedTuple argument entry: an interactable, or the one-element vector
# `interactables(plot)` or `interactables(i)` returns.
function _one_object(where, k, v)
    v isa AbstractVector && length(v) == 1 && (v = only(v))
    v isa AbstractInteractable && return v
    v isa Makie.AbstractPlot && where == "masque" && throw(
        ArgumentError("masque: `$k = …` is a plot; pass `$k = interactables(plot)`, or name it in `bind`"),
    )
    v isa Makie.AbstractPlot && return v
    throw(ArgumentError("$where: `$k = …` must name one interactable or plot, got $(typeof(v))"))
end

# `x` named `name`: the id it is built under.
function _apply_name(r::_PlotRequest, name)
    return _PlotRequest(r.plot, merge(r.kwargs, (; id = name)))
end
function _apply_name(i, name)
    _layer_id(i) === name && return i
    hasfield(typeof(i), :id) || throw(
        ArgumentError("masque: $(_describe(i)) has no `id` field, so it can't take the name :$name"),
    )
    return _with_id(i, name)
end

"""
    _bind_call(fig, xs, bind; auto) -> _Plan

The interactables one `masque(fig, xs...; bind)` call overlays, with the binding
`build_manifest` makes fields from. A NamedTuple in `xs` names its entries; a NamedTuple
`bind` names the objects it lists and adds those not otherwise passed.
"""
function _bind_call(fig, xs, bind; auto::Bool)
    names = IdDict{Any, Symbol}()
    args = AbstractInteractable[]
    for x in xs
        if x isa NamedTuple
            for (k, v) in pairs(x)
                obj = _one_object("masque", k, v)
                push!(args, obj)
                _give_name!(names, _named_key(obj), k)
            end
        else
            _flatten_args!(args, x)
        end
    end
    for a in args
        own = _own_name(a)
        own === nothing || _give_name!(names, _named_key(a), own)
    end

    refs = nothing
    bare = false
    if bind !== nothing
        entries = if bind isa NamedTuple
            Pair{Union{Nothing, Symbol}, Any}[k => v for (k, v) in pairs(bind)]
        elseif bind isa Tuple
            Pair{Union{Nothing, Symbol}, Any}[nothing => v for v in bind]
        elseif bind isa AbstractVector && length(bind) != 1
            throw(ArgumentError("bind: list several objects as a tuple, `bind = (a, b)`, not a vector"))
        else
            bare = true
            Pair{Union{Nothing, Symbol}, Any}[nothing => bind]
        end
        refs = Any[]
        for (k, v) in entries
            if v isa Symbol
                k === nothing || throw(
                    ArgumentError(
                        "bind: `$k = :$v` names a name; a NamedTuple in `bind` names objects " *
                            "(`$k = plot`). To keep the field :$v, write `bind = (:$v,)`",
                    ),
                )
                push!(refs, v)
                continue
            end
            obj = _one_object("bind", something(k, "an entry"), v)
            key = _named_key(obj)
            k === nothing || _give_name!(names, key, k)
            if !any(a -> _named_key(a) === key, args)
                push!(args, key isa Makie.AbstractPlot && !(obj isa _PlotRequest) ? _PlotRequest(key, (;)) : obj)
            elseif obj isa _PlotRequest && !isempty(obj.kwargs)
                throw(
                    ArgumentError(
                        "bind: $(_describe(key)) is also passed to masque; give its " *
                            "`interactables(plot; …)` once, there, and name the plot in `bind`",
                    ),
                )
            end
            push!(refs, key)
        end
    end

    renamed = IdDict{Any, Any}()
    named = AbstractInteractable[]
    fixed = Base.IdSet{Any}()
    for a in args
        n = get(names, _named_key(a), nothing)
        b = n === nothing ? a : _apply_name(a, n)
        n === nothing || push!(fixed, b)
        renamed[_named_key(a)] = b
        push!(named, b)
    end
    given_names = Set{Symbol}(values(names))
    built = _collecting_skips(() -> _assemble_all(fig, named; auto, named = fixed, names = given_names))
    resolved = if refs === nothing
        nothing
    else
        Pair{String, Vector{Symbol}}[_resolve_ref(r, built, renamed) for r in refs]
    end
    return _Plan(built.ints, _Binding(resolved, bare, built.defaults))
end

_resolve_ref(r::Symbol, built, renamed) = ":$r" => Symbol[r]
function _resolve_ref(p::Makie.AbstractPlot, built, renamed)
    ids = get(built.plotmap, p, Symbol[])
    # A series child's `id:k` entry names one element, not a layer.
    ids = Symbol[id for id in ids if !occursin(':', string(id))]
    isempty(ids) && throw(
        ArgumentError(
            "bind: $(_describe(p)) has no layer in this masque() call; check that it is drawn in " *
                "this figure, in data space",
        ),
    )
    return _describe(p) => ids
end
function _resolve_ref(i, built, renamed)
    b = renamed[i]
    id = get(built.final_ids, b, _layer_id(b))
    id === nothing && throw(ArgumentError("bind: $(_describe(i)) has no layer id"))
    return ":$id" => Symbol[id]
end

# ---------------------------------------------------------------------------
# Fields in the manifest
# ---------------------------------------------------------------------------

# What a built layer holds in the bind value: `:pick` (clicks choose an element), `:control`
# (a parameter with a start, a threshold or a box's bounds), `:brush` (the elements a
# `selects` box holds), or `nothing`.
function _layer_role(L::HitLayer, d, brushed)
    L.id in brushed && return :brush
    stamp = d["bond"]
    stamp in ("threshold", "bounds") && return :control
    stamp == "none" && return nothing
    return "click" in d["events"] ? :pick : nothing
end

# Kinds a default plot draws as a line. Neither the whole line nor a point on it is the
# obvious pick, so a default line answers hover only until it is bound.
const _LINE_KINDS = (:polyline, :lines)

"""
    _fields(binding, built, owner_ids) -> (fields, roles)

The ids of the layers that are fields of the bind value, in order, and every layer's role.
`built` is `build_manifest`'s `(interactable, HitLayer, dict)` list. Layers outside `fields`
take no clicks.
"""
function _fields(binding::_Binding, built, brushed)
    roles = Dict{Symbol, Any}()
    owner = Dict{Symbol, Symbol}()
    order = Symbol[]
    for (i, L, d) in built
        roles[L.id] = _layer_role(L, d, brushed)
        owner[L.id] = something(_layer_id(i), L.id)
        push!(order, L.id)
    end
    candidate(id) = roles[id] !== nothing
    if binding.refs === nothing
        hover_only(id) = owner[id] in binding.defaults && _layer_kind(built, id) in _LINE_KINDS
        return Symbol[id for id in order if candidate(id) && !hover_only(id)], roles
    end
    fields = Symbol[]
    for (label, ids) in binding.refs
        layers = Symbol[]
        for r in ids
            if haskey(roles, r)
                push!(layers, r)
            else
                append!(layers, (id for id in order if owner[id] === r))
            end
        end
        isempty(layers) && throw(
            ArgumentError(
                "bind: $label is not a layer in this masque() call " *
                    "(fields: $(_field_list(Symbol[id for id in order if candidate(id)])))",
            ),
        )
        for id in layers
            candidate(id) || throw(
                ArgumentError(
                    "bind: :$id takes no value: it is a view, a slice, or a layer without `:click` in its `events`",
                ),
            )
            id in fields && throw(ArgumentError("bind: :$id is listed twice"))
            push!(fields, id)
        end
    end
    return fields, roles
end

_layer_kind(built, id) = first(L.kind for (_, L, _) in built if L.id === id)
_field_list(ids) = isempty(ids) ? "none" : join((":$id" for id in ids), ", ")
