# Scalar readouts. Each section is one type: the struct, then `bondtype`, `transform_bond`,
# and the constructor. None of these is an array index.

"""
    AxisEvent(layer, x, y)

An axis click at data coordinates `(x, y)`. Not an array index.
"""
struct AxisEvent <: InteractionEvent
    layer::Symbol
    x::Float64
    y::Float64
end

bondtype(::AxisInteractable) = AxisEvent

function transform_bond(::Type{AxisEvent}, i, layer::HitLayer, index, js_payload)
    return _axis_event(layer.id, js_payload)
end
function transform_bond(i::AxisInteractable, layer::HitLayer, index, js_payload)
    return _axis_event(i.id, js_payload)
end

function _axis_event(id::Symbol, js_payload)
    return AxisEvent(
        id, Float64(_js_req(js_payload, "x", id)), Float64(_js_req(js_payload, "y", id)),
    )
end

"""
    ColorbarEvent(layer, value)

A colorbar click at data coordinate `value`.
"""
struct ColorbarEvent <: InteractionEvent
    layer::Symbol
    value::Float64
end

bondtype(::ColorbarInteractable) = ColorbarEvent

function transform_bond(::Type{ColorbarEvent}, i, layer::HitLayer, index, js_payload)
    return _colorbar_event(layer.id, js_payload)
end
function transform_bond(i::ColorbarInteractable, layer::HitLayer, index, js_payload)
    return _colorbar_event(i.id, js_payload)
end

function _colorbar_event(id::Symbol, js_payload)
    return ColorbarEvent(id, Float64(_js_req(js_payload, "value", id)))
end

"""
    ThresholdEvent(layer, value)

A threshold drag release at data coordinate `value`. Pass back as `value=` to restore the line.
"""
struct ThresholdEvent <: InteractionEvent
    layer::Symbol
    value::Float64
end

bondtype(::ThresholdInteractable) = ThresholdEvent

function transform_bond(::Type{ThresholdEvent}, i, layer::HitLayer, index, js_payload)
    return _threshold_event(layer.id, js_payload)
end
function transform_bond(i::ThresholdInteractable, layer::HitLayer, index, js_payload)
    return _threshold_event(i.id, js_payload)
end

function _threshold_event(id::Symbol, js_payload)
    js_payload isa Real || throw(
        ArgumentError("bond: layer :$id threshold payload must be a number, got $(typeof(js_payload))"),
    )
    return ThresholdEvent(id, Float64(js_payload))
end

_threshold_value(x::Real) = Float64(x)
_threshold_value(x::ThresholdEvent) = getfield(x, :value)
function _threshold_value(x)
    throw(ArgumentError("ThresholdInteractable: value must be a number or a ThresholdEvent, got $(typeof(x))"))
end
