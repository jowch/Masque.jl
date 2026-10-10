# Composing a call: `masque(fig, xs...)` starts from the figure's defaults and lets each
# argument replace or add to them. `interactables(plot)` is built here, once the figure is
# known: a plot does not know its axis, and its default id counts across the figure.

"""
    interactables(ax, plot; id, select, kwargs...) -> Vector{AbstractInteractable}

The interactables Masque builds for one `plot` on `ax`, the ones `masque(fig)` uses by
default. `id` names the plot: a plot with one layer takes it as its layer id, and one that
builds several (`stem!`, `scatterlines!`) names them as its parts, `stem.points` and
`stem.stems`, which the `@bind` value nests as `w.stem.points`. Other keywords
(`tooltip`, `payloads`, `label`, and any the plot's constructor takes) pass through to the
constructor, so `interactables(ax, s; tooltip = masque"…")` is `PointInteractable(ax, s;
tooltip = masque"…")` for a scatter. A two-layer plot takes `tooltip` and `label` on both
layers and refuses `payloads`. Unlike the constructor, it also moves the layers to where the
plot is drawn when `translate!`, `scale!`, or `rotate!` moved it, and returns no layers for a
plot drawn outside data space (`space = :relative`, `:pixel`, `:clip`).

`select = :many` lets a reader hold several of the plot's marks at once: its `@bind` field is
then a `Vector{ElementEvent}`, empty to start, and Cmd-click (Ctrl-click off a Mac) adds or
removes a mark. It applies to every layer the plot builds. The default, `:one`, holds one
mark or `nothing`.

This is also how a recipe gets layers of its own. Define a method for your plot type, and
`masque(fig)` uses it instead of walking the plots your recipe draws:

```julia
function Masque.interactables(ax, p::MyPlot; kwargs...)
    return [PointInteractable(ax, p.positions[]; kwargs...)]
end
```

`masque` names the layers the method returns: the first takes the plot's name, `:myplot` and
then `:myplot_2` for a second `myplot!`, and each other layer adds its own name to it
(`:myplot_bars`). A method that takes `id` by name names its layers itself instead.
"""
function interactables(ax, p::Makie.AbstractPlot; id = nothing, select = nothing, kwargs...)
    select === nothing || return _with_select(interactables(ax, p; id, kwargs...), select)
    base = _plotbase(p)
    base === nothing && throw(
        ArgumentError(
            "interactables: Masque has no default for $(Makie.plotkey(p)). `masque(fig)` builds a " *
                "recipe's layers from the plots it draws; to give it its own, define " *
                "`Masque.interactables(ax, p::YourPlotType; kwargs...)`",
        ),
    )
    return _construct(ax, p, something(id, base); kwargs...)
end

# `interactables(ax, p; id, kwargs...)` as `masque` calls it. A recipe's own method need not
# take `id`: when it doesn't, `masque` calls it without one and names the layers it returns,
# the first `id` and the rest `id` plus their own name (`:dumbbell`, `:dumbbell_scatter`).
# Other keywords come from the caller, and a method that lacks one would otherwise raise a
# bare `MethodError`, or, written without keywords, be passed over for the built-in method,
# which reports no default for the plot. Read the keywords the method declares and name the
# fix instead. A `MethodError` raised inside the method's body is not this case and passes
# through.
function _plot_interactables(ax, p; id, select = nothing, kwargs...)
    select === nothing || return _with_select(_plot_interactables(ax, p; id, kwargs...), select)
    _has_custom(ax, p) || return interactables(ax, p; id, kwargs...)
    declared = Base.kwarg_decl(which(interactables, Tuple{typeof(ax), typeof(p)}))
    slurps = any(k -> endswith(string(k), "..."), declared)
    takes(k) = slurps || k in declared
    rejected = [k for k in keys(kwargs) if !takes(k)]
    if !isempty(rejected)
        T = Makie.plotsym(typeof(p))   # the name `@recipe` gave the type, `MyPlot`
        kws = (length(rejected) == 1 ? "keyword " : "keywords ") * join(("`$k`" for k in rejected), ", ")
        throw(
            ArgumentError(
                "masque: the interactables method for $T does not take the $kws, passed with " *
                    "`interactables(plot; …)`. Add `; kwargs...` to its signature, " *
                    "`Masque.interactables(ax, p::$T; kwargs...)`, and pass them on to the layers it builds",
            ),
        )
    end
    :id in declared && return _parts_of(interactables(ax, p; id, kwargs...), id; named = true)
    return _parts_of(interactables(ax, p; kwargs...), id)
end

# The layers a recipe method returned, as a flat vector. A `NamedTuple` names its parts:
# each entry, an interactable, a vector of them, or a `NamedTuple` for a recipe of recipes, is
# built under `id.name`. A vector is named by `_name_layers`, unless the method took `id` and
# named its layers itself (`named`).
function _parts_of(built::NamedTuple, id::Symbol; named = false)
    out = AbstractInteractable[]
    for (k, v) in pairs(built)
        sub = v isa AbstractInteractable ? AbstractInteractable[v] : v
        append!(out, _parts_of(sub, _part_id(id, k)))
    end
    return out
end
_parts_of(built, id::Symbol; named = false) = named ? built : _name_layers(built, id)

# The layers of a recipe method that took no `id`, named after `id`: one layer takes it, and
# several become its parts, each under its own id (`id.scatter`, `id.bars`). A layer that
# points at another of them by id (a slice's `covers`, a selector's `selects`) follows the
# rename.
function _name_layers(built, id::Symbol)
    owned = [_layer_id(l) for l in built if _layer_id(l) !== nothing]
    names = Dict{Symbol, Symbol}()
    for own in owned
        haskey(names, own) && throw(
            ArgumentError(
                "masque: the interactables method for :$id returns two layers with the id :$own; " *
                    "give them distinct ids, or return a NamedTuple that names its parts",
            ),
        )
        names[own] = length(owned) == 1 ? id : _part_id(id, own)
    end
    rename(f, v) = f === :id ? names[v] :
        f === :selects && v isa Symbol ? get(names, v, v) :
        f === :covers ? Symbol[get(names, c, c) for c in v] : v
    return AbstractInteractable[
        _layer_id(l) === nothing ? l :
            typeof(l)(ntuple(i -> rename(fieldname(typeof(l), i), getfield(l, i)), fieldcount(typeof(l)))...)
            for l in built
    ]
end

# A recipe part's layer id, `head.part`, and back. The wire carries it as the string
# `"head.part"`; the `@bind` value nests it as `w.head.part`.
_part_id(id, part) = Symbol(id, '.', part)
_head(id::Symbol) = (s = string(id); k = findfirst('.', s); k === nothing ? id : Symbol(s[1:prevind(s, k)]))
_path(id::Symbol) = Tuple(Symbol.(split(string(id), '.')))

# A plot named as an ROI's `selects`, with the layers it became in this call. A series
# child's `id:k` entry names one element, not a layer, so only real layer ids count.
function _plot_target(p, plotmap, layer_ids)
    ids = Symbol[id for id in get(plotmap, p, Symbol[]) if id in layer_ids]
    isempty(ids) && throw(
        ArgumentError(
            "ROIInteractable: `selects` is a `$(Makie.plotkey(p))` plot with no layer in this masque() call. " *
                "With `auto = false`, pass `interactables(plot)` to the same call; otherwise check that " *
                "the plot is in this figure",
        ),
    )
    return _PlotTarget(p, ids)
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
    interactables(plot; tooltip, payloads, label, id, select, kwargs...) -> Vector{AbstractInteractable}
    interactables(i::AbstractInteractable; select) -> [i]

One plot's interactables, for `masque(fig, …)`: they replace that plot's default layers, at
the same position and with the same ids, so `selected=` and legend links keep working. Pass
`id` to rename them. The keywords are those of `interactables(ax, plot)`.

`masque` builds these once it has the figure, because a plot does not know its axis and its
default id counts across the figure. To inspect or edit the built interactables, call
`interactables(ax, plot)` instead; those are added like any other interactable, or replace
the default with the same id.

`interactables(i)` returns `[i]`, so lists of plots and interactables mix freely;
`interactables(i; select = :many)` returns it holding several picks.

# Examples
```julia
s = scatter!(ax, xs, ys)
masque(fig, interactables(s; tooltip = masque"x = \$(x)"))   # defaults, with this tooltip
masque(fig, interactables(s; select = :many))   # w.scatter is a Vector{ElementEvent}
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
interactables(i::AbstractInteractable; select = nothing) =
    AbstractInteractable[select === nothing ? i : _with_select(i, select)]

# A colorbar's layer, so `interactables(cb; select = :many)` names why it can't hold several.
interactables(cb::Makie.Colorbar; select = nothing, kwargs...) =
    interactables(ColorbarInteractable(cb; kwargs...); select)

# `select = :many` for every layer a plot built, so a `stem!` picks many points and many stems.
# A layer that can only pick one, such as a colorbar's, refuses `:many`.
_with_select(built::AbstractVector, select) = AbstractInteractable[_with_select(i, select) for i in built]
function _with_select(i::AbstractInteractable, select)
    T = typeof(i)
    if !hasfield(T, :select)
        select === :one && return i
        _check_select(T, select)
        what = i isa ColorbarInteractable ? "a colorbar pick is one value" : "a $(nameof(T)) holds one value"
        throw(ArgumentError("$what; select = :many isn't supported"))
    end
    _check_select(T, select)
    return T((f === :select ? select : getfield(i, f) for f in fieldnames(T))...)
end
function _has_custom_for(A, p)
    m = which(interactables, Tuple{A, typeof(p)})
    return m.sig != Tuple{typeof(interactables), Any, Makie.AbstractPlot}
end

# The block whose scene draws `p`, among the axes Masque supports. `who` names the caller in
# the error.
function _plot_axis(fig, p; who = "interactables($(Makie.plotkey(p)))")
    s = Makie.parent_scene(p)
    for c in fig.content
        c isa _SUPPORTED_AXES && c.scene === s && return c
    end
    throw(
        ArgumentError(
            "$who: the plot is not drawn in an Axis, Axis3, or PolarAxis of this figure",
        ),
    )
end

# Where `ax` sits in the figure's layout, `fig[1, 2]` or `fig[1, 2][1, 1]` in a nested grid,
# for an error message.
function _axis_place(ax)
    r(x) = first(x) == last(x) ? string(first(x)) : string(first(x), ":", last(x))
    place = ""
    block = ax
    while (gc = block.layoutobservables.gridcontent[]) !== nothing
        place = "[$(r(gc.span.rows)), $(r(gc.span.cols))]" * place
        block = gc.parent
    end
    isempty(place) && return "an $(nameof(typeof(ax))) outside the layout"
    return "fig" * place
end

# A slice built from plots alone, on the axis that draws them.
function _resolve_slice_axis(fig, i::SliceInteractable)
    i.ax isa _AxisOf || return i
    axes = Any[]
    for p in i.ax.plots
        a = _plot_axis(fig, p; who = "SliceInteractable($(Makie.plotkey(p)))")
        any(b -> b === a, axes) || push!(axes, a)
    end
    length(axes) == 1 || throw(
        ArgumentError(
            "SliceInteractable: the plots are on different axes ($(join(map(_axis_place, axes), ", "))); " *
                "a slice samples one axis, so pass plots from one of them",
        ),
    )
    return SliceInteractable(only(axes), i.orientation, i.series, i.id, i.covers, i.tooltip, i.crosshair, i.cover_plots)
end
_resolve_slice_axis(fig, i) = i

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

# Build `r` under `id` when given, else under the first free id from its base. The parts of
# a plot that builds several layers share its id as a head (`:stem` gives `stem.points` and
# `stem.stems`), so an id is free when no taken id is it or has it as a head.
function _build_fresh(r::_PlotRequest, ax, taken)
    haskey(r.kwargs, :id) && return _plot_interactables(ax, r.plot; r.kwargs...)
    base = _base(ax, r.plot)
    n = 1
    while _claimed(n == 1 ? base : Symbol(base, :_, n), taken)
        n += 1
    end
    return _plot_interactables(ax, r.plot; r.kwargs..., id = n == 1 ? base : Symbol(base, :_, n))
end

_claimed(id, taken) = any(t -> _head(t) === id, taken)

# The ids constructors give when the caller passes none. A list rather than a flag on each
# interactable, so an explicit `id = :view` counts too: it is the same name.
# `test/compose_tests.jl` checks it against every constructor's default.
const _BUILTIN_IDS = Set{Symbol}(
    [
        :arrows2d, :arrows3d, :axis, :band, :bars, :boxplot, :cells, :colorbar, :contourf,
        :crossbar, :density, :errorbars, :hexbin, :hist, :hlines, :hspan, :legend, :lines,
        :meshscatter, :points, :poly, :polygons, :rangebars, :rects, :region, :roi, :scatter,
        :segments, :series, :slice, :spy, :stairs, :surface, :text, :threshold, :view, :violin, :vlines,
        :voronoiplot, :vspan, :waterfall, :wireframe,
    ]
)

# Number arguments that share a built-in id, in argument order: two `ViewInteractable(ax)`
# become `:view` and `:view_2`, as two scatters' defaults do. Any other id stays put and
# counts as taken, as do the ids an `interactables(plot)` argument rebuilds, so a built-in
# id that meets one moves instead. A numbered id that names a default replaces it, so
# `ColorbarInteractable(cb1)`, `ColorbarInteractable(cb2)` replace `:colorbar` and
# `:colorbar_2`. Only calls that raised a duplicate-id error before see a new id.
function _number_builtin_ids(
        given, installed; final_ids = IdDict{Any, Symbol}(), fixed = falses(length(given)),
    )
    # A default id the caller gave as a name (`fixed`) is kept; only constructor defaults move.
    keeps(k, id) = !(id in _BUILTIN_IDS) || fixed[k]
    used = Set{Symbol}()
    for (k, g) in enumerate(given)
        if g isa _PlotRequest
            union!(used, get(installed, g.plot, Symbol[]))
        else
            id = _layer_id(g)
            id === nothing || keeps(k, id) && push!(used, id)
        end
    end
    out = AbstractInteractable[]
    for (k, g) in enumerate(given)
        id = g isa _PlotRequest ? nothing : _layer_id(g)
        if id === nothing || keeps(k, id)
            id === nothing || (final_ids[g] = id)
            push!(out, g)
            continue
        end
        n = 1
        while (n == 1 ? id : Symbol(id, :_, n)) in used
            n += 1
        end
        new = n == 1 ? id : Symbol(id, :_, n)
        push!(used, new)
        final_ids[g] = new
        push!(out, new === id ? g : _with_id(g, new))
    end
    return out
end

# `i` with its `id` field set to `id`, through the all-fields constructor.
_with_id(i::T, id) where {T} = T((f === :id ? id : getfield(i, f) for f in fieldnames(T))...)

"""
    _assemble(fig, xs; auto) -> Vector{AbstractInteractable}

The interactables one `masque(fig, xs...)` call overlays. With `auto`, start from the
figure's defaults. An argument replaces the default with its id, and `interactables(plot)`
replaces every default its plot built; a replacement takes the place of the first default
it replaces. Everything else is added after the defaults, in argument order. Legends with no
explicit `targets` are linked again, to the layers of this call. Plots it skips are warned
on once, together, at the end.
"""
_assemble(fig, xs; auto::Bool) = _collecting_skips(() -> _assemble_all(fig, xs; auto).ints)
# `named` holds the objects of `xs` the caller named, and `names` those names (see `_bind_call`).
function _assemble_all(fig, xs; auto::Bool, named = Base.IdSet{Any}(), names = Set{Symbol}())
    flat = _flatten_args!(AbstractInteractable[], collect(Any, xs))
    fixed = BitVector([g in named for g in flat])
    given = AbstractInteractable[_resolve_slice_axis(fig, g) for g in flat]
    if auto
        _reject_unsupported_axes(fig)
        d = _defaults(fig; replaced = Base.IdSet{Any}(g.plot for g in given if g isa _PlotRequest))
        defaults, plotmap, installed = d.ints, d.plotmap, d.installed
    else
        _finalize!(fig)
        defaults = AbstractInteractable[]
        plotmap = IdDict{Any, Vector{Symbol}}()
        installed = IdDict{Any, Vector{Symbol}}()
    end
    final_ids = IdDict{Any, Symbol}()
    given = _number_builtin_ids(given, installed; final_ids, fixed)
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
            built = _plot_interactables(ax, g.plot; id = _head(first(old)), g.kwargs...)
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
                id in names ?
                    "masque: the name :$id is already the id of another layer in this call; pick another name" :
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
        if i isa ROIInteractable && i.selects isa Makie.AbstractPlot
            out[k] = ROIInteractable(i.ax, i.bounds, i.id, _plot_target(i.selects, plotmap, seen))
        end
        if i isa SliceInteractable && !isempty(i.cover_plots)
            covers = unique!(Symbol[id for p in i.cover_plots for id in get(plotmap, p, Symbol[])])
            out[k] = SliceInteractable(i.ax, i.orientation, i.series, i.id, covers, i.tooltip, i.crosshair, i.cover_plots)
        end
        i isa LegendInteractable && i.lenient || continue
        out[k] = _legend_interactable(i.leg; id = i.id, events = i.evs, tooltip = i.tooltip, plotmap, select = i.select)
    end
    # The defaults left in the call, by id: a default line takes no clicks unless it is bound.
    kept = Set{Symbol}(id for id in map(_layer_id, defaults) if id !== nothing && !haskey(replaces, id))
    return (; ints = out, plotmap, final_ids, defaults = kept)
end
