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

Base.to_indices(A, inds, I::Tuple{GridCellEvent, Vararg{Any}}) =
    to_indices(A, inds, (I[1].i, I[1].j, Base.tail(I)...))

function transform_bond(::Type{GridCellEvent}, i, layer::HitLayer, index, js_payload)
    return _grid_cell_event(layer.id, js_payload)
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

Base.to_indices(A, inds, I::Tuple{GridWindowEvent, Vararg{Any}}) =
    to_indices(A, inds, (I[1].i1:I[1].i2, I[1].j1:I[1].j2, Base.tail(I)...))

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
