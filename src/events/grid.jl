"""
    GridCellEvent(layer, i, j, value, payload = nothing)

One heatmap or image cell, or one point of a 3D surface. `i` and `j` are the cell's first
and second index in the matrix you plotted; Makie draws the first index along x and the second
along y. `A[cell]` is `A[cell.i, cell.j]`. `value` is the shipped cell value (a surface
point's `z`), or `nothing` when values were not sent. `payload` is the cell's entry from the grid's
`payloads`, or `nothing` when it has none; its fields read through, so `cell.row` is
`cell.payload.row`.
"""
struct GridCellEvent <: InteractionEvent
    layer::Symbol
    i::Int
    j::Int
    value::Any
    payload::Any
end
GridCellEvent(layer, i, j, value) = GridCellEvent(layer, i, j, value, nothing)

Base.to_indices(A, inds, I::Tuple{GridCellEvent, Vararg{Any}}) =
    to_indices(A, inds, (I[1].i, I[1].j, Base.tail(I)...))

function transform_bond(::Type{GridCellEvent}, i, layer::HitLayer, index, js_payload)
    return _grid_cell_event(layer.id, js_payload, layer.payloads, layer.geometry)
end

# `payloads` is row-major over the cells, like the shipped `values`; empty when the grid has none.
# A surface's are row-major over its shipped points, found by their source indices.
function _grid_cell_event(id::Symbol, js_payload, payloads = Any[], geometry = nothing)
    js_payload isa AbstractDict || throw(
        ArgumentError("bond: layer :$id grid cell payload must be a dict, got $(typeof(js_payload))"),
    )
    i = Int(_js_req(js_payload, "i", id)) + 1
    j = Int(_js_req(js_payload, "j", id)) + 1
    value = haskey(js_payload, "value") ? js_payload["value"] : nothing
    isempty(payloads) && return GridCellEvent(id, i, j, value, nothing)
    haskey(geometry, "ni") && return GridCellEvent(id, i, j, value, _surface_payload(id, i, j, payloads, geometry))
    ncols = Int(geometry["ncols"])
    nrows = Int(geometry["nrows"])
    (1 <= i <= ncols && 1 <= j <= nrows) ||
        throw(ArgumentError("bond: layer :$id cell ($i, $j) is outside the $ncols×$nrows grid"))
    return GridCellEvent(id, i, j, value, payloads[(j - 1) * ncols + i])
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

function _surface_payload(id, i, j, payloads, geometry)
    a = findfirst(==(i - 1), geometry["i"])
    b = findfirst(==(j - 1), geometry["j"])
    (a === nothing || b === nothing) &&
        throw(ArgumentError("bond: layer :$id point ($i, $j) is not a shipped point of the surface"))
    return payloads[a + (b - 1) * Int(geometry["ni"])]
end
