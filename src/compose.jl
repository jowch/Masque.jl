# Composing a call: `masque(fig, xs...)` starts from the figure's defaults and lets each
# argument replace or add to them. `interactables(plot)` is built here, once the figure is
# known: a plot does not know its axis, and its default id counts across the figure.

"""
    interactables(ax, plot; id, kwargs...) -> Vector{AbstractInteractable}

The interactables Masque builds for one `plot` on `ax`, the ones `masque(fig)` uses by
default. `id` names the first layer, and a plot that builds two layers (`stem!`,
`scatterlines!`) suffixes the second (`:stem_stems`, `:scatterlines_line`). Other keywords
(`tooltip`, `payloads`, `label`, and any the plot's constructor takes) pass through to the
constructor, so `interactables(ax, s; tooltip = masque"…")` is `PointInteractable(ax, s;
tooltip = masque"…")` for a scatter. A two-layer plot takes `tooltip` and `label` on both
layers and refuses `payloads`.

This is also how a recipe gets layers of its own. Define a method for your plot type, and
`masque(fig)` uses it instead of walking the plots your recipe draws:

```julia
function Masque.interactables(ax, p::MyPlot; id = :myplot, kwargs...)
    return [PointInteractable(ax, p.positions[]; id, kwargs...)]
end
```

Use `id` for the first layer and derive any others from it, so two `myplot!` calls in one
figure take `:myplot` and `:myplot_2` without colliding.
"""
function interactables(ax, p::Makie.AbstractPlot; id = nothing, kwargs...)
    base = _plotbase(p)
    base === nothing && throw(
        ArgumentError(
            "interactables: Masque has no default for $(Makie.plotkey(p)). `masque(fig)` builds a " *
                "recipe's layers from the plots it draws; to give it its own, define " *
                "`Masque.interactables(ax, p::YourPlotType; id, kwargs...)`",
        ),
    )
    return _construct(ax, p, something(id, base); kwargs...)
end

# `interactables(plot)` before `masque` has found its axis and its default id.
struct _PlotRequest <: AbstractInteractable
    plot::Makie.AbstractPlot
    kwargs::NamedTuple
end
function Base.show(io::IO, r::_PlotRequest)
    print(io, "interactables(", Makie.plotkey(r.plot), isempty(r.kwargs) ? "" : "; …", ")")
    return nothing
end
function validate(r::_PlotRequest, ::InteractionContext)
    return "interactables($(Makie.plotkey(r.plot))) is built by `masque(fig, …)`, which finds the plot's axis; " *
        "call `interactables(ax, plot)` to build it yourself"
end

"""
    interactables(plot; tooltip, payloads, label, id, kwargs...) -> Vector{AbstractInteractable}
    interactables(i::AbstractInteractable) -> [i]

One plot's interactables, for `masque(fig, …)`: they replace that plot's default layers, at
the same position and with the same ids, so `selected=` and legend links keep working. Pass
`id` to rename them. The keywords are those of `interactables(ax, plot)`.

`masque` builds these once it has the figure, because a plot does not know its axis and its
default id counts across the figure. To inspect or edit the built interactables, call
`interactables(ax, plot)` instead; those are added like any other interactable, or replace
the default with the same id.

`interactables(i)` returns `[i]`, so lists of plots and interactables mix freely.

# Examples
```julia
s = scatter!(ax, xs, ys)
masque(fig, interactables(s; tooltip = masque"x = {x}"))   # defaults, with this tooltip
```
"""
function interactables(p::Makie.AbstractPlot; kwargs...)
    if _plotbase(p) === nothing &&
            !any(A -> _has_custom_for(A, p), (Makie.Axis, Makie.Axis3, Makie.PolarAxis))
        # Fails the same way the axis-aware method would, but here, at the caller's own line.
        interactables(nothing, p)
    end
    return AbstractInteractable[_PlotRequest(p, NamedTuple(kwargs))]
end
interactables(i::AbstractInteractable) = AbstractInteractable[i]
function _has_custom_for(A, p)
    m = which(interactables, Tuple{A, typeof(p)})
    return m.sig != Tuple{typeof(interactables), Any, Makie.AbstractPlot}
end

# The block whose scene draws `p`, among the axes Masque supports.
function _plot_axis(fig, p)
    s = Makie.parent_scene(p)
    for c in fig.content
        c isa _SUPPORTED_AXES && c.scene === s && return c
    end
    throw(
        ArgumentError(
            "interactables($(Makie.plotkey(p))): the plot is not drawn in an Axis, Axis3, or PolarAxis of this figure",
        ),
    )
end

_layer_id(i) = hasproperty(i, :id) ? i.id : nothing

function _flatten_args!(out, x)
    if x isa AbstractInteractable
        push!(out, x)
    elseif x isa AbstractVector
        for y in x
            _flatten_args!(out, y)
        end
    elseif x isa Makie.AbstractPlot
        throw(ArgumentError("masque: pass `interactables(plot)` for a plot, not the plot itself"))
    else
        throw(ArgumentError("masque: expected interactables or vectors of them, got $(typeof(x))"))
    end
    return out
end

# Build `r` under `id` when given, else under the first free id from its base. Layers of one
# plot share its first id as a prefix (`:stem`, `:stem_stems`), and numbering keeps the
# suffix, as the defaults do (`:stem_2`, `:stem_2_stems`). So an id is free when it is not
# taken and no taken id extends it with a suffix: `:stem_stems` claims `:stem`, while
# `:stem_2` and `:stem_2_stems` do not, since their tail starts with a digit.
function _build_fresh(r::_PlotRequest, ax, taken)
    haskey(r.kwargs, :id) && return interactables(ax, r.plot; r.kwargs...)
    base = _base(ax, r.plot)
    n = 1
    while _claimed(n == 1 ? base : Symbol(base, :_, n), taken)
        n += 1
    end
    return interactables(ax, r.plot; r.kwargs..., id = n == 1 ? base : Symbol(base, :_, n))
end

function _claimed(id, taken)
    pre = string(id, "_")
    return any(taken) do t
        t === id && return true
        s = string(t)
        startswith(s, pre) || return false
        tail = chopprefix(s, pre)
        return !isempty(tail) && !isdigit(first(tail))
    end
end

"""
    _assemble(fig, xs; auto) -> Vector{AbstractInteractable}

The interactables one `masque(fig, xs...)` call overlays. With `auto`, start from the
figure's defaults. An argument replaces the default with its id, and `interactables(plot)`
replaces every default its plot built; a replacement takes the place of the first default
it replaces. Everything else is added after the defaults, in argument order. Legends with no
explicit `targets` are linked again, to the layers of this call.
"""
function _assemble(fig, xs; auto::Bool)
    given = _flatten_args!(AbstractInteractable[], collect(Any, xs))
    if auto
        _reject_unsupported_axes(fig)
        d = _defaults(fig)
        defaults, plotmap, installed = d.ints, d.plotmap, d.installed
    else
        _finalize!(fig)
        defaults = AbstractInteractable[]
        plotmap = IdDict{Any, Vector{Symbol}}()
        installed = IdDict{Any, Vector{Symbol}}()
    end
    default_ids = Set{Symbol}(id for id in map(_layer_id, defaults) if id !== nothing)

    # One group per argument; `replaces` maps a default's id to the group that takes its place.
    groups = Vector{Vector{AbstractInteractable}}()
    replaces = Dict{Symbol, Int}()
    fresh = Tuple{Int, _PlotRequest, Any}[]
    built_from = Tuple{Any, Vector{Symbol}}[]
    for g in given
        if g isa _PlotRequest
            ax = _plot_axis(fig, g.plot)
            old = get(installed, g.plot, nothing)
            if old === nothing
                push!(groups, AbstractInteractable[])
                push!(fresh, (length(groups), g, ax))
                continue
            end
            built = interactables(ax, g.plot; id = first(old), g.kwargs...)
            push!(groups, built)
            for o in old
                replaces[o] = length(groups)
            end
            push!(built_from, (g.plot, Symbol[_layer_id(b) for b in built]))
        else
            push!(groups, AbstractInteractable[g])
            id = _layer_id(g)
            id !== nothing && id in default_ids && (replaces[id] = length(groups))
        end
    end

    taken = Set{Symbol}()
    for i in defaults
        id = _layer_id(i)
        id === nothing || haskey(replaces, id) || push!(taken, id)
    end
    for grp in groups, i in grp
        id = _layer_id(i)
        id === nothing || push!(taken, id)
    end
    for (k, r, ax) in fresh
        built = _build_fresh(r, ax, taken)
        groups[k] = built
        ids = Symbol[_layer_id(b) for b in built]
        union!(taken, ids)
        push!(built_from, (r.plot, ids))
    end

    out = AbstractInteractable[]
    emitted = falses(length(groups))
    for i in defaults
        k = get(replaces, _layer_id(i), 0)
        if k == 0
            push!(out, i)
        elseif !emitted[k]
            append!(out, groups[k])
            emitted[k] = true
        end
    end
    for k in eachindex(groups)
        emitted[k] || append!(out, groups[k])
    end

    seen = Set{Symbol}()
    for i in out
        id = _layer_id(i)
        id === nothing && continue
        id in seen && throw(
            ArgumentError(
                "masque: two interactables use the layer id :$id; pass a distinct `id` to one of them",
            ),
        )
        push!(seen, id)
    end

    if !isempty(built_from)
        plotmap = copy(plotmap)
        for (p, ids) in built_from
            _register_plot!(plotmap, p, ids; overwrite = true)
        end
    end
    for k in eachindex(out)
        i = out[k]
        i isa LegendInteractable && i.lenient || continue
        out[k] = _legend_interactable(i.leg; id = i.id, events = i.evs, tooltip = i.tooltip, plotmap)
    end
    return out
end
