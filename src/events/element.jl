"""
    ElementEvent(layer, index, payload)

One element of a point, bar, polygon, segment, polyline, or list-of-rects layer. `index` is
1-based. Other fields (e.g. `city`) are read from `payload`. Use as a row index:
`df[pick, :]`, `xs[pick]`.

A line's pick is the data point nearest the click: `index` is that point, and the payload adds
`line` (which line, for a plot of several like `series!`), `x` and `y`. A line on an `Axis3`
has no points to pick, so its pick is the whole line and `index` is which line.
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

# A line's pick is one of its data points, the one nearest the click. Lines on a 2D axis ship
# their data points (`points`); a line on an `Axis3` doesn't, so its pick stays the whole line.
_picks_points(L::HitLayer) = L.kind === :lines && L.points !== nothing

# `ev` is the picked line; `s` the 1-based data point on it. `index` becomes the point, so
# `xs[pick]` reads it, and the payload adds `line` (which line of a `series!`), `x` and `y`.
function _line_point(ev::ElementEvent, d::AbstractDict, s::Int)
    id, k = getfield(ev, :layer), getfield(ev, :index)
    pts = get(d, "points", nothing)
    pts === nothing && throw(ArgumentError("bond: layer :$id sent a point, but its lines have no data points"))
    p = pts[k]
    n = length(p) ÷ 2
    (1 <= s <= n) || throw(
        ArgumentError("bond: layer :$id point $s out of range for line $k's $n data points" * (n > 0 ? " (valid: 1:$n)" : "")),
    )
    return ElementEvent(id, s, _point_payload(getfield(ev, :payload), k, _coord(p[2s - 1]), _coord(p[2s])))
end
_coord(v::AbstractFloat) = Float64(v)
_coord(v) = v
# The line's own payload keys stay, except its `index`, which named the line and is now `line`.
function _point_payload(pl::NamedTuple, line, x, y)
    return merge((; line, x, y), Base.structdiff(pl, NamedTuple{(:index,)}))
end
function _point_payload(pl::AbstractDict, line, x, y)
    out = Dict{Any, Any}(:line => line, :x => x, :y => y)
    for (k, v) in pl
        string(k) == "index" || (out[k] = v)
    end
    return out
end
_point_payload(pl, line, x, y) = (; line, x, y, value = pl)
