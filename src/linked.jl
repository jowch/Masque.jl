# Linked selections (#346): several plots of the same rows share one pick. `linked(...)` names
# the plots; `_bind_call` resolves them to layers once the call is assembled, `build_manifest`
# checks them and ships each member layer's row per mark, and the field's value is the rows.

"""
    LinkedInteractable

Several plots that draw the same rows, sharing one selection. Build it with
[`linked`](@ref), which lists its keywords.
"""
struct LinkedInteractable <: AbstractInteractable
    members::Vector{Any}
    key::Union{Nothing, Symbol}
    select::Symbol
    id::Union{Nothing, Symbol}
end

"""
    linked(members...; key = nothing, select = :one, id = nothing) -> LinkedInteractable

Plots that draw the same rows, sharing one selection: a reader picks rows in any of them and
sees the same rows marked in all of them. A member is a plot, `interactables(plot; …)`, or an
`Axis` (or `Axis3`), which stands for every plot in it that has marks to pick.

The `@bind` field holds the selected rows. With `key = :cell_id`, a row is the `cell_id` of
the marks' payloads, which every member must have; without `key`, a row is a mark's position,
and every member must be one plot with the same number of marks. `select = :one` (the
default) holds one row or `nothing`; `select = :many` holds a `Vector` of rows in the order
they were picked, and a box (drag, or Alt-drag) or a legend entry picks many at once.

The key says what a pick is: marks that share a key are picked together, so cells keyed by
their cluster pick whole clusters. A key only some members have is marked where it is, and
stays in the value. A member can take its keys from elsewhere with
`interactables(plot; key = vector)`, one per mark, in the order of the plot's data.

Hovering a mark outlines its partners in the other members. Pass the group like any
interactable, named in a `NamedTuple` or with `id`.

# Examples
```julia
su = scatter!(Axis(fig[1, 1]), df.umap1, df.umap2)
sp = scatter!(Axis(fig[1, 2]), df.pc1, df.pc2)
@bind w masque(fig, (cells = linked(su, sp; select = :many),))
df[w.cells, :]   # the rows picked, in either panel
```
"""
function linked(members...; key = nothing, select::Symbol = :one, id = nothing)
    isempty(members) && throw(ArgumentError("linked: pass the plots, `interactables(plot)`s or axes that share a selection"))
    _check_select(LinkedInteractable, select)
    key === nothing || key isa Union{Symbol, AbstractString} || throw(
        ArgumentError(
            "linked: `key` names a payload field, as `key = :cell_id`, got $(repr(key)). For keys " *
                "of your own, pass `interactables(plot; key = vector)` as the member",
        ),
    )
    ms = Any[_link_member(m) for m in members]
    return LinkedInteractable(ms, key === nothing ? nothing : Symbol(key), select, id === nothing ? nothing : Symbol(id))
end

function _link_member(m)
    m isa AbstractVector && length(m) == 1 && (m = only(m))
    m isa Union{Makie.AbstractPlot, _SUPPORTED_AXES, AbstractInteractable} || throw(
        ArgumentError("linked: a member is a plot, `interactables(plot; …)`, or an axis, got $(typeof(m))"),
    )
    m isa LinkedInteractable && throw(ArgumentError("linked: a member can't be another `linked(...)`; list its plots instead"))
    return m
end

function Base.show(io::IO, g::LinkedInteractable)
    print(io, "linked(", length(g.members), length(g.members) == 1 ? " member" : " members")
    g.key === nothing || print(io, "; key = :", g.key)
    print(io, ")")
    return nothing
end

function validate(g::LinkedInteractable, ::InteractionContext)
    return "linked(...) is resolved by `masque(fig, …)`, which finds its plots' layers"
end

# One `linked(...)` of a call, resolved to layer ids. `members` holds, per member as the author
# listed it, the layer ids it stands for, and `what` describes it for an error. `keys` holds a
# member plot's own keys (`interactables(plot; key = v)`), by layer id.
struct _LinkGroup
    name::Symbol
    select::Symbol
    key::Union{Nothing, Symbol}
    members::Vector{Vector{Symbol}}
    what::Vector{String}
    axis::Vector{Bool}
    keys::Dict{Symbol, Any}
end

# Kinds a mark of which is one row. A line's pick is a point on it, and a polyline's elements
# are the gaps between its vertices, so neither is a row yet.
const _LINK_KINDS = (:circles, :rects, :polygons, :segments)

_link_label(p::Makie.AbstractPlot) = "the `$(Makie.plotkey(p))` plot"
_link_label(r::_PlotRequest) = _link_label(r.plot)
_link_label(ax::_SUPPORTED_AXES) = "the axis at $(_axis_place(ax))"
_link_label(i) = "the $(nameof(typeof(i))) :$(something(_layer_id(i), :unnamed))"

# The `interactables(plot; key = v)` of a member: its request without `key`, and `v`.
function _strip_key(r::_PlotRequest)
    haskey(r.kwargs, :key) || return r, nothing
    return _PlotRequest(r.plot, Base.structdiff(r.kwargs, NamedTuple{(:key,)})), r.kwargs[:key]
end

# `linked(...)` groups out of a call's arguments, before the call is assembled: each member
# plot joins `args` once (its `interactables(plot; …)` if it has one), and a member's own
# `key` vector is held back for the group. Returns the groups and their pending members.
function _take_links!(args, names)
    pending = Tuple{LinkedInteractable, Symbol, Vector{Any}, IdDict{Any, Any}}[]
    groups = [a for a in args if a isa LinkedInteractable]
    isempty(groups) && (_check_stray_keys(args); return pending)
    filter!(a -> !(a isa LinkedInteractable), args)
    taken = Set{Symbol}()
    for g in groups
        name = something(get(names, g, nothing), g.id, :linked)
        name in taken && throw(ArgumentError("masque: two `linked(...)` groups are named :$name; give each its own name"))
        push!(taken, name)
        members = Any[]
        keys = IdDict{Any, Any}()
        for m in g.members
            if m isa _PlotRequest
                haskey(m.kwargs, :select) && throw(
                    ArgumentError(
                        "linked: $(_link_label(m)) sets `select`; a linked selection has one, so pass " *
                            "`select` to `linked(...)` instead",
                    ),
                )
                m, k = _strip_key(m)
                k === nothing || (keys[m.plot] = k)
                at = findfirst(a -> _named_key(a) === m.plot, args)
                if at === nothing
                    push!(args, m)
                elseif !isempty(m.kwargs)
                    throw(
                        ArgumentError(
                            "linked: $(_link_label(m)) is also passed to masque; give its " *
                                "`interactables(plot; …)` once, and name the plot in `linked(...)`",
                        ),
                    )
                end
                push!(members, m.plot)
            elseif m isa Makie.AbstractPlot
                any(a -> _named_key(a) === m, args) || push!(args, _PlotRequest(m, (;)))
                push!(members, m)
            elseif m isa _SUPPORTED_AXES
                push!(members, m)
            else
                select_mode(m) === :many && throw(
                    ArgumentError(
                        "linked: $(_link_label(m)) sets `select`; a linked selection has one, so pass " *
                            "`select` to `linked(...)` instead",
                    ),
                )
                any(a -> a === m, args) || push!(args, m)
                push!(members, m)
            end
        end
        push!(pending, (g, name, members, keys))
    end
    _check_stray_keys(args)
    # A linked plot has no field of its own.
    for (_, name, members, _) in pending, m in members
        own = get(names, m, nothing)
        own === nothing || throw(
            ArgumentError(
                "masque: $(_link_label(m)) is named :$own and is also in `linked(...)` :$name; a linked " *
                    "plot has no field of its own, so leave out its name",
            ),
        )
    end
    return pending
end

# `interactables(plot; key)` outside a group: the constructors take no `key`.
function _check_stray_keys(args)
    for a in args
        a isa _PlotRequest && haskey(a.kwargs, :key) && throw(
            ArgumentError(
                "interactables: `key` gives the rows of a plot in `linked(...)`; $(_link_label(a)) " *
                    "is in none. Pass it to `linked`, as `linked(interactables(plot; key = …), …)`",
            ),
        )
    end
    return nothing
end

# The groups with their layer ids, once `built` (`_assemble_all`'s result) holds the call.
function _resolve_links(pending, built, renamed)
    out = _LinkGroup[]
    for (g, name, members, keyed) in pending
        ids = Vector{Symbol}[]
        what = String[]
        axis = Bool[]
        keys = Dict{Symbol, Any}()
        for m in members
            layer_ids = if m isa Makie.AbstractPlot
                _plot_layers(built.plotmap, m)
            elseif m isa _SUPPORTED_AXES
                unique!(Symbol[id for p in m.scene.plots for id in _plot_layers(built.plotmap, p)])
            else
                b = get(renamed, m, m)
                Symbol[get(built.final_ids, b, _layer_id(b))]
            end
            m isa Makie.AbstractPlot && haskey(keyed, m) && for id in layer_ids
                keys[id] = keyed[m]
            end
            push!(ids, layer_ids)
            push!(what, _link_label(m))
            push!(axis, m isa _SUPPORTED_AXES)
        end
        push!(out, _LinkGroup(name, g.select, g.key, ids, what, axis, keys))
    end
    return out
end

# A plot's own layer ids: a series child's `id:k` entry names one element, not a layer.
_plot_layers(plotmap, p) = Symbol[id for id in get(plotmap, p, Symbol[]) if !occursin(':', string(id))]

# ---------------------------------------------------------------------------
# In the manifest
# ---------------------------------------------------------------------------

# Each group's member layers, kept to the kinds that link: an axis passes over a line or a
# heatmap in it, a plot or interactable named on its own fails. `by_id` maps layer id to
# `(HitLayer, dict)`.
function _link_layers(groups::Vector{_LinkGroup}, by_id)
    out = Pair{_LinkGroup, Vector{Vector{Symbol}}}[]
    owner = Dict{Symbol, Symbol}()
    for g in groups
        kept = Vector{Symbol}[]
        for (k, ids) in enumerate(g.members)
            ok = Symbol[id for id in ids if haskey(by_id, id) && first(by_id[id]).kind in _LINK_KINDS]
            if isempty(ok)
                kinds = unique(String[string(first(by_id[id]).kind) for id in ids if haskey(by_id, id)])
                throw(
                    ArgumentError(
                        "linked: $(g.what[k]) has no marks to link" *
                            (isempty(kinds) ? " in this masque() call" : " (it draws $(join((":$s" for s in kinds), ", ")))") *
                            "; a linked selection takes scatter points, bars, text, polygons and segments",
                    ),
                )
            end
            for id in ok
                L, d = by_id[id]
                "click" in d["events"] || throw(
                    ArgumentError("linked: :$id takes no clicks (its `events` leave out `:click`), so it can't share picks"),
                )
                prev = get(owner, id, nothing)
                prev === nothing || throw(
                    ArgumentError(
                        prev === g.name ? "linked: :$id is listed twice in `linked(...)` :$(g.name)" :
                            "linked: :$id is in two `linked(...)` groups, :$prev and :$(g.name); one plot has one selection",
                    ),
                )
                owner[id] = g.name
            end
            push!(kept, ok)
        end
        push!(out, g => kept)
    end
    return out, owner
end

_member_count(L::HitLayer) = _layer_n_elements(L.kind, L.geometry)

# The keys of layer `L`'s marks: the member's own `key` vector, else its payloads' `key`
# field. `who` names the member in an error.
function _layer_keys(g::_LinkGroup, L::HitLayer, own, who)
    n = _member_count(L)
    if own !== nothing
        length(own) == n || throw(
            ArgumentError("linked: $who has $n marks but its `key` has $(length(own)) entries; give one per mark"),
        )
        return collect(Any, own)
    end
    f = g.key
    pls = L.payloads
    length(pls) == n || throw(
        ArgumentError(
            "linked: `key = :$f` is a payload field, and $who has no payloads; pass " *
                "`interactables(plot; payloads = …)` with a `$f` column, or `interactables(plot; key = …)`",
        ),
    )
    return Any[_payload_field(pl, f, who) for pl in pls]
end

function _payload_field(pl, f, who)
    if pl isa AbstractDict
        haskey(pl, f) && return pl[f]
        haskey(pl, string(f)) && return pl[string(f)]
        has = collect(keys(pl))
    elseif pl isa Union{Number, AbstractString, Symbol, Nothing}
        has = Any[]
    else
        hasproperty(pl, f) && return getproperty(pl, f)
        has = collect(propertynames(pl))
    end
    throw(
        ArgumentError(
            "linked: `key = :$f` is not a field of $who's payloads" *
                (isempty(has) ? " (they have no fields)" : " (fields: $(join(("$k" for k in has), ", ")))"),
        ),
    )
end

"""
    _link_table(g, kept, by_id) -> (table, rows)

A group's rows: `table` is every key in order of first appearance across its member layers
(positions `1:n` with no `key`), and `rows` maps each member layer to its marks' 1-based rows.
"""
function _link_table(g::_LinkGroup, kept, by_id)
    if g.key === nothing && isempty(g.keys)
        counts = Pair{String, Int}[]
        for (k, ids) in enumerate(kept)
            if length(ids) != 1
                throw(
                    ArgumentError(
                        "linked: without `key` a row is a mark's position, so each member is one plot, and " *
                            "$(g.what[k]) holds $(length(ids)) ($(_field_list(ids))). Pass `key = :field`, " *
                            "naming a payload field the plots share",
                    ),
                )
            end
            push!(counts, g.what[k] => _member_count(first(by_id[only(ids)])))
        end
        n = last(first(counts))
        if any(c -> last(c) != n, counts)
            throw(
                ArgumentError(
                    "linked: without `key` a row is a mark's position, so every member needs the same number " *
                        "of marks; " * join(("$w has $c" for (w, c) in counts), ", ") * ". Pass `key = :field`, " *
                        "naming a payload field the plots share",
                ),
            )
        end
        return collect(1:n), Dict{Symbol, Vector{Int}}(only(ids) => collect(1:n) for ids in kept)
    end
    g.key === nothing && any(id -> !haskey(g.keys, id), Iterators.flatten(kept)) && throw(
        ArgumentError(
            "linked: some members give their own keys (`interactables(plot; key = …)`), so every member needs " *
                "keys: give the others theirs, or pass `key = :field` naming a payload field they share",
        ),
    )
    table = Any[]
    at = Dict{Any, Int}()
    rows = Dict{Symbol, Vector{Int}}()
    seen = Vector{Set{Int}}()
    for (k, ids) in enumerate(kept)
        mine = Set{Int}()
        for id in ids
            L = first(by_id[id])
            ks = _layer_keys(g, L, get(g.keys, id, nothing), "$(g.what[k])" * (length(ids) > 1 ? " (:$id)" : ""))
            rows[id] = map(ks) do key
                r = get!(at, key) do
                    push!(table, key)
                    length(table)
                end
                push!(mine, r)
                r
            end
        end
        push!(seen, mine)
    end
    if length(kept) > 1 && !any(r -> count(s -> r in s, seen) > 1, 1:length(table))
        sample(s) = join((repr(table[r]) for r in Iterators.take(sort!(collect(s)), 2)), ", ")
        throw(
            ArgumentError(
                "linked: the members share no key: " *
                    join(("$(g.what[k]) has $(sample(s)), …" for (k, s) in enumerate(seen)), "; ") *
                    ". Keys match with `isequal`, so \"17\", :c17 and 17 are three keys",
            ),
        )
    end
    return identity.(table), rows
end

# What a group ships: its id, its member layers, whether it holds many rows, its row count,
# and, with a key, each member layer's 0-based row per mark. The keys themselves stay in
# Julia: a payload field is in the payloads already, and `_group_table` reads it back.
function _group_dict(g::_LinkGroup, kept, table, rows)
    d = Dict{String, Any}(
        "id" => string(g.name), "members" => String[string(id) for ids in kept for id in ids], "n" => length(table),
    )
    g.select === :many && (d["many"] = true)
    if g.key !== nothing || !isempty(g.keys)
        d["rows"] = Dict{String, Any}(string(id) => r .- 1 for (id, r) in rows)
        g.key === nothing || (d["key"] = string(g.key))
        isempty(g.keys) || (d["keys"] = Dict{String, Any}(string(id) => collect(Any, v) for (id, v) in g.keys))
    end
    return d
end

function _manifest_group(manifest::AbstractDict, id::AbstractString)
    for g in get(manifest, "groups", ())
        g["id"] == id && return g
    end
    return nothing
end

# A group's key table, read back from the manifest as `_link_table` built it: in member order,
# each mark's key, first appearance first. `nothing` for positions.
function _group_table(manifest::AbstractDict, g::AbstractDict)
    haskey(g, "rows") || return nothing
    own = get(g, "keys", nothing)
    f = haskey(g, "key") ? Symbol(g["key"]) : nothing
    table = Any[]
    at = Dict{Any, Int}()
    for id in g["members"]
        ks = if own !== nothing && haskey(own, id)
            own[id]
        else
            d = _manifest_layer(manifest, id)
            Any[_payload_field(pl, f, ":$id") for pl in d["payloads"]]
        end
        for key in ks
            haskey(at, key) || (push!(table, key); at[key] = length(table))
        end
    end
    return identity.(table)
end

# The `@bind` value of a group: one row or `nothing`, or the rows picked, in order. The wire
# carries 0-based rows: `{row}` or `null`, `{rows: [...]}`.
function _group_value(manifest, g::AbstractDict, env)
    many = get(g, "many", false) === true
    n = Int(g["n"])
    table = _group_table(manifest, g)
    row(r) = (r isa Integer && 0 <= r < n) ? Int(r) + 1 : throw(
            ArgumentError("bond: group :$(g["id"]) has $n rows, got row $(repr(r))"),
        )
    pick(r) = table === nothing ? r : table[r]
    if many
        env === nothing && return table === nothing ? Int[] : similar(table, 0)
        env isa AbstractDict && haskey(env, "rows") || throw(
            ArgumentError("bond: field :$(g["id"]) holds rows, `{rows: [...]}`; got $(repr(env))"),
        )
        rs = Int[row(r) for r in env["rows"]]
        return table === nothing ? rs : table[rs]
    end
    env === nothing && return nothing
    env isa AbstractDict && haskey(env, "row") || throw(
        ArgumentError("bond: field :$(g["id"]) holds a row, `{row}`; got $(repr(env))"),
    )
    return pick(row(env["row"]))
end

# `selected = (cells = …)` for a group: its rows, 0-based, as the wire holds them.
function _group_seed(manifest_group, table, name, v)
    many = get(manifest_group, "many", false) === true
    n = Int(manifest_group["n"])
    vals = if many
        v isa AbstractVector || v isa Tuple || throw(
            ArgumentError("selected: :$name holds several rows, so it starts from a vector of them; got $(repr(v))"),
        )
        collect(Any, v)
    else
        v isa AbstractVector && throw(
            ArgumentError("selected: :$name holds one row; pass one, or build it with `linked(...; select = :many)`"),
        )
        Any[v]
    end
    rows = Int[]
    if table === nothing
        for x in vals
            x isa Integer && !(x isa Bool) && 1 <= x <= n || throw(
                ArgumentError("selected: :$name's rows are positions 1:$n, got $(repr(x))"),
            )
            push!(rows, Int(x) - 1)
        end
    else
        at = Dict{Any, Int}(k => r for (r, k) in enumerate(table))
        for x in vals
            r = get(at, x, nothing)
            r === nothing && throw(
                ArgumentError(
                    "selected: :$name has no row with key $(repr(x))" *
                        (isempty(table) ? "" : " (keys like $(repr(first(table))))"),
                ),
            )
            push!(rows, r - 1)
        end
    end
    unique!(rows)
    return many ? Dict{String, Any}("rows" => rows) : Dict{String, Any}("row" => only(rows))
end

# The `selected=` entries that name a group, as wire seeds into `out`; returns what is left
# for the layer fields. A bare `selected` seeds the group when `bind` named only that group.
function _take_group_seeds!(out, selected, binding, fields, groups, tables)
    (selected === nothing || isempty(groups)) && return selected
    by = Dict(Symbol(g["id"]) => g for g in groups)
    if !(selected isa NamedTuple || selected isa AbstractDict)
        binding.bare && length(fields) == 1 && haskey(by, only(fields)) || return selected
        f = only(fields)
        out[f] = _group_seed(by[f], tables[f], f, selected)
        return nothing
    end
    member = Dict{String, String}(id => g["id"] for g in groups for id in g["members"])
    rest = Pair{Symbol, Any}[]
    for (k, v) in pairs(selected)
        id = Symbol(k)
        if haskey(by, id)
            out[id] = _group_seed(by[id], tables[id], id, v)
        elseif haskey(member, string(id))
            g = member[string(id)]
            throw(
                ArgumentError(
                    "selected: :$id is in `linked(...)` :$g, which holds its picks; start it with " *
                        "`selected = ($g = …,)`, by key or by position",
                ),
            )
        else
            push!(rest, id => v)
        end
    end
    isempty(rest) && return nothing
    return NamedTuple{Tuple(first.(rest))}(Tuple(last.(rest)))
end
