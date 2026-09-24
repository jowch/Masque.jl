# Text twin of a `pluto_html` player. The player is a Pluto static export whose cells
# render only once Pluto's frontend loads from jsDelivr, and Documenter's search never
# sees inside the iframe. This builds the same teaching cells as Documenter Markdown: notes
# as prose, code as `julia` blocks, the idle figure and plain-text readouts. It goes into a
# `details` admonition after the player (`Main.masque_fallback` in an `@eval` block).
# `assets/masque-embed.js` opens it and hides the iframe when the player fails to render.
#
# No Pluto: this parses the notebook file, so a docs build with
# MASQUE_SKIP_EMBED_EXPORT still gets the code and notes. Harvest (`emit_pluto_notebook`)
# writes the idle figure and readouts as `<name>.png` + `<name>.fallback.toml`.

using Markdown
using TOML

const FALLBACK_TITLE = "Notebook as text"
const FALLBACK_TOML_RE = r"PLUTO_PLAYER_TOML_CONTENTS\s*=\s*\"\"\"(.*?)\"\"\""s
const CELL_HEADER_RE = r"^# ╔═╡ ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[ \t]*$"m

# Cell id => source, from the `# ╔═╡ <uuid>` blocks of a Pluto notebook file.
function notebook_cell_code(src::AbstractString)
    heads = collect(eachmatch(CELL_HEADER_RE, src))
    ends = [m.offset for m in heads[2:end]]
    order = findfirst("# ╔═╡ Cell order:", src)
    push!(ends, order === nothing ? ncodeunits(src) + 1 : first(order))
    cells = Dict{String, String}()
    for (m, stop) in zip(heads, ends)
        start = m.offset + ncodeunits(m.match)
        cells[m.captures[1]] = strip(src[start:prevind(src, stop)])
    end
    return cells
end

# The string inside a cell that is only `md"..."` / `md"""..."""`, else `nothing`.
function markdown_cell_text(code::AbstractString)
    ex = try
        Meta.parse(code)
    catch
        return nothing
    end
    ex isa Expr && ex.head === :macrocall && ex.args[1] === Symbol("@md_str") || return nothing
    s = ex.args[end]
    # `md"..."` interpolates `$x` / `$(expr)` when the cell runs; the twin never runs it.
    occursin(r"(?<!\\)\$[A-Za-z_(]", s) && error("md cell interpolates; the text twin cannot render it:\n$code")
    return s
end

function fallback_player(src::AbstractString)
    m = match(FALLBACK_TOML_RE, src)
    m === nothing && error("no PLUTO_PLAYER_TOML_CONTENTS cell")
    return TOML.parse(String(m.captures[1]))["player"]
end

"""
    fallback_markdown(nbpath; image = nothing, outputs = Dict()) -> Markdown.MD

One `details` admonition holding the player's `cells` in order. `image` is a URL placed
after the `@bind` cell; `outputs` maps a cell id to its idle plain-text output.
"""
function fallback_markdown(
        nbpath::AbstractString;
        image::Union{Nothing, AbstractString} = nothing,
        outputs::AbstractDict = Dict{String, String}(),
    )
    src = read(nbpath, String)
    player = fallback_player(src)
    haskey(player, "cells") || error("player in $(basename(nbpath)) lists no cells")
    code = notebook_cell_code(src)
    bind_needle = "@bind " * string(player["bond"])
    blocks = Any[]
    for id in player["cells"]
        haskey(code, id) || error("player cell $id is not in $(basename(nbpath))")
        c = code[id]
        text = markdown_cell_text(c)
        if text !== nothing
            append!(blocks, Markdown.parse(text).content)
            continue
        end
        push!(blocks, Markdown.Code("julia", c))
        if image !== nothing && occursin(bind_needle, c)
            push!(blocks, Markdown.Paragraph(Any[Markdown.Image(image, "The figure before any interaction")]))
        end
        out = get(outputs, id, nothing)
        out === nothing || push!(blocks, Markdown.Code("", out))
    end
    return Markdown.MD(Any[Markdown.Admonition("details", FALLBACK_TITLE, blocks)])
end

# Relative URL from the page an `@eval` block is rendering to `embeds/<file>`. Documenter
# runs `@eval` with `pwd()` in the page's build directory and does not rewrite relative
# image links in its output. With pretty URLs a non-index page is one directory deeper.
function embeds_href(file::AbstractString; build::AbstractString, pretty::Bool, cwd::AbstractString = pwd())
    rel = relpath(cwd, build)
    depth = (rel == "." ? 0 : length(splitpath(rel))) + (pretty ? 1 : 0)
    return join([fill("..", depth); "embeds"; file], "/")
end
