# Event types. Each concrete type lives with its indexing and `transform_bond` methods in
# `events/*.jl`. This file is the abstract type plus the methods that are one implementation
# for every event: field forwarding, `show`, and the `to_index` error.

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

# Browser payload field, shared by the grid, readout, and bounds constructors.
function _js_req(js, key::String, id::Symbol)
    js isa AbstractDict && haskey(js, key) && return js[key]
    throw(ArgumentError("bond: layer :$id payload is missing `$key`"))
end

include("events/element.jl")
include("events/legend.jl")
include("events/grid.jl")
include("events/readout.jl")
include("events/bounds.jl")

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
            # A category label is only set on a categorical axis; omit the unset one.
            f in (:xcat, :ycat, :category) && getfield(ev, f) === nothing && continue
            print(io, ", ", f, " = ")
            show(io, getfield(ev, f))
        end
    end
    return print(io, ')')
end

function Base.to_index(ev::InteractionEvent)
    throw(ArgumentError("$(getfield(ev, :layer)) ($(typeof(ev))) is not an element index"))
end
