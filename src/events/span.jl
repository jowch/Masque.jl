"""
    SpanEvent(layer, lo, hi)

Where a [`SpanInteractable`](@ref)'s band sits, the value of its field: `lo ≤ hi` in data
space (equal when an edge was dragged onto the other). Pass back as `span=` to restore the band.
"""
struct SpanEvent <: InteractionEvent
    layer::Symbol
    lo::Float64
    hi::Float64
end

bondtype(::SpanInteractable) = SpanEvent

function transform_bond(::Type{SpanEvent}, i, layer::HitLayer, index, js_payload)
    return _span_event(layer.id, js_payload)
end

function transform_bond(i::SpanInteractable, layer::HitLayer, index, js_payload)
    return _span_event(i.id, js_payload)
end

function _span_event(id::Symbol, js_payload)
    lo = Float64(_js_req(js_payload, "lo", id))
    hi = Float64(_js_req(js_payload, "hi", id))
    return SpanEvent(id, min(lo, hi), max(lo, hi))
end

_span_values(s::SpanEvent) = (s.lo, s.hi)
function _span_values(s)
    (s isa Union{Tuple, AbstractVector} && length(s) == 2) ||
        throw(ArgumentError("SpanInteractable: span must be (lo, hi) or a SpanEvent, got $(repr(s))"))
    a, b = s[1], s[2]
    (a isa Real && b isa Real) ||
        throw(ArgumentError("SpanInteractable: span must hold two numbers, got $(repr(s))"))
    return Float64(a), Float64(b)
end
