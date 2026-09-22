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

Base.to_index(ev::ElementEvent) = getfield(ev, :index)
Base.to_index(evs::AbstractVector{ElementEvent}) = Int[getfield(ev, :index) for ev in evs]

function transform_bond(::Type{ElementEvent}, i, layer::HitLayer, index, js_payload)
    return _element_event(layer.id, index, layer.payloads)
end

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
