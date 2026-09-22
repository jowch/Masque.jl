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

bondtype(::LegendInteractable) = LegendEvent

function transform_bond(::Type{LegendEvent}, i, layer::HitLayer, index, js_payload)
    return _legend_event(layer.id, index, layer.payloads)
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
