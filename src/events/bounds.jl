"""
    BoundsEvent(layer, xmin, xmax, ymin, ymax)

Where an ROI box sits, the value of its field. Pass back as `bounds=` to restore the box.
"""
struct BoundsEvent <: InteractionEvent
    layer::Symbol
    xmin::Float64
    xmax::Float64
    ymin::Float64
    ymax::Float64
end

bondtype(::ROIInteractable) = BoundsEvent

function transform_bond(::Type{BoundsEvent}, i, layer::HitLayer, index, js_payload)
    return _bounds_event(layer.id, js_payload)
end

function transform_bond(i::ROIInteractable, layer::HitLayer, index, js_payload)
    return _bounds_event(i.id, js_payload)
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

_roi_bounds(b::BoundsEvent) = (b.xmin, b.xmax, b.ymin, b.ymax)
function _roi_bounds(bounds)
    length(bounds) == 4 || throw(ArgumentError("ROIInteractable: bounds must be (xmin, xmax, ymin, ymax)"))
    xmin, xmax, ymin, ymax = Float64.(Tuple(bounds))
    return (xmin, xmax, ymin, ymax)
end
