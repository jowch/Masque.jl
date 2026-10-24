# A page can show one notebook as several iframes with prose between them. The player TOML
# names each cell range in `[player.segments]`, as `name = [cell ids]`; an iframe shows one
# with `data-masque-segment="<name>"`, and all the iframes of one notebook share its `@bind`
# value (`assets/masque-embed.js` passes it between them). Harvest (`pluto_html_export.jl`)
# and the text twin (`player_fallback.jl`) both include this file.

# Segment name => its cell ids, in the player's `cells` order (the order the export draws).
# Empty when the TOML has no segments.
function player_segments(player::AbstractDict)
    segs = get(player, "segments", nothing)
    segs === nothing && return Dict{String, Vector{String}}()
    segs isa AbstractDict || error("player segments must be a table of name = [cell ids]")
    get(player, "pluto_html", false) === true || error("player segments need pluto_html = true")
    cells = String.(get(player, "cells", String[]))
    owner = Dict{String, String}()
    out = Dict{String, Vector{String}}()
    for (name, ids) in segs
        occursin(r"^[a-z][a-z0-9_-]*$", name) ||
            error("segment name $(repr(name)): use lowercase letters, digits, - and _")
        ids isa AbstractVector && !isempty(ids) || error("segment $name lists no cells")
        for id in ids
            id in cells || error("segment $name: cell $id is not in the player's cells")
            haskey(owner, id) && error("cell $id is in segments $(owner[id]) and $name")
            owner[id] = name
        end
        out[name] = [id for id in cells if id in ids]
    end
    return out
end
