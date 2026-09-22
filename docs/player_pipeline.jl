# String pipeline for the cell-series player. No Pluto — Core tests include this
# file; harvest (`export_embeds.jl`) includes it too.

using TOML

# JSON3 1.14.3 calls Parsers.typeparser / neededdigits (Parsers 2). Documenter's
# JSON.jl 1.9 loads Parsers 3 into this process, and Julia can only bind one
# Parsers per UUID, so harvest writes through JSON.jl instead.
const _JSON = Base.require(Base.PkgId(Base.UUID("682c06a0-de6a-54ab-a142-c8b1cf79cde6"), "JSON"))
json_write(x) = _JSON.json(x)
json_read(s::AbstractString) = _JSON.parse(s)

const PLAYER_TOML_RE = r"PLUTO_PLAYER_TOML_CONTENTS\s*=\s*\"\"\"(.*?)\"\"\""s
const GETPUB_RE = r"getPublishedObject\(\"([^\"]+)\"\)"
const SCRIPT_RE = r"<script([^>]*)>(.*?)</script>"s

function parse_player_toml(path::AbstractString)
    src = read(path, String)
    m = match(PLAYER_TOML_RE, src)
    m === nothing && error("no PLUTO_PLAYER_TOML_CONTENTS cell in $path")
    parsed = TOML.parse(String(m.captures[1]))
    haskey(parsed, "player") || error("player TOML in $path has no [player] table")
    return parsed["player"]
end

function js_shape_from_toml(state::AbstractDict)
    haskey(state, "value") || return nothing
    return _string_keys(state["value"])
end

function _string_keys(x)
    x isa AbstractDict || return x
    return Dict{String, Any}(string(k) => _string_keys(v) for (k, v) in x)
end

# Key the player lookup on the pre-transform JS shape the overlay posts.
# Must stay in lockstep with `keyOf` in `emit_player` (docs/export_embeds.jl).
function snapshot_key(v)
    v === nothing && return "null"
    d = v isa AbstractDict ? _string_keys(v) : Dict{String, Any}("value" => v)
    if haskey(d, "items")
        parts = String[]
        for it in d["items"]
            push!(parts, string(it["layer"], ":", Int(it["index"])))
        end
        return "items:" * join(parts, ",")
    end
    (haskey(d, "layer") && haskey(d, "index")) &&
        return string(d["layer"], ":", Int(d["index"]))
    return json_write(jsonable(d))
end

jsonable(::Nothing) = nothing
jsonable(x::Bool) = x
jsonable(x::Integer) = Int(x)
jsonable(x::AbstractFloat) = Float64(x)
jsonable(x::AbstractString) = String(x)
jsonable(x::Symbol) = String(x)
jsonable(x::AbstractVector) = Any[jsonable(v) for v in x]
jsonable(x::Tuple) = Any[jsonable(v) for v in x]
jsonable(x::NamedTuple) = Dict{String, Any}(string(k) => jsonable(v) for (k, v) in pairs(x))
jsonable(x::AbstractDict) = Dict{String, Any}(string(k) => jsonable(v) for (k, v) in x)
jsonable(x) = string(x)

function html_escape(s::AbstractString)
    s = replace(s, '&' => "&amp;")
    s = replace(s, '<' => "&lt;")
    s = replace(s, '>' => "&gt;")
    s = replace(s, '"' => "&quot;")
    return s
end

# Cairo widget HTML inlines one `data:image/png;base64,…` on `<img>`. Listed states
# that remount the figure (e.g. a `@bind` cell that changes `alpha`) carry a
# different URL; the player swaps `img.src` so the PNG matches the snapshot.
function png_data_url(html::AbstractString)
    m = match(r"data:image/png;base64,[A-Za-z0-9+/=]+", html)
    return m === nothing ? nothing : m.match
end

function rewrite_published_to_js(html::AbstractString, published::AbstractDict)
    n = Ref(0)
    rewritten = replace(
        html, GETPUB_RE => function (m)
            id = match(GETPUB_RE, m).captures[1]
            haskey(published, id) || error("published object $id missing from cell")
            n[] += 1
            return json_write(jsonable(published[id]))
        end
    )
    return rewritten, n[]
end

function wrap_scripts_for_static(html::AbstractString)
    return replace(
        html, SCRIPT_RE => function (m)
            mm = match(SCRIPT_RE, m)
            attrs, body = mm.captures
            occursin("src=", attrs) && return m
            return string(
                "<script", attrs, ">\n",
                "{\n",
                "const currentScript = document.currentScript;\n",
                "const invalidation = new Promise(() => {});\n",
                body, "\n",
                "if (typeof manifest !== \"undefined\" && currentScript && currentScript.parentElement) {\n",
                "  currentScript.parentElement.masqueManifest = manifest;\n",
                "}\n",
                "}\n",
                "</script>",
            )
        end
    )
end

function extract_json_object(s::AbstractString, start::Int)
    i = start
    n = ncodeunits(s)
    while i <= n && s[i] != '{'
        i = nextind(s, i)
    end
    i > n && error("no JSON object at $start")
    depth = 0
    in_str = false
    esc = false
    j = i
    while j <= n
        c = s[j]
        if in_str
            if esc
                esc = false
            elseif c == '\\'
                esc = true
            elseif c == '"'
                in_str = false
            end
        elseif c == '"'
            in_str = true
        elseif c == '{'
            depth += 1
        elseif c == '}'
            depth -= 1
            depth == 0 && return (SubString(s, i, j), i, j)
        end
        j = nextind(s, j)
    end
    return error("unterminated JSON object")
end

# Put listed @bind states on the same manifest object the overlay mounts, not a
# side-channel SNAPSHOTS table. Lookup is still host.value (overlay's existing bond).
function inject_manifest_snapshots(html::AbstractString, snapshots)
    needle = "const manifest = "
    start = findfirst(needle, html)
    start === nothing && error("no inlined manifest to attach snapshots")
    json, j0, j1 = extract_json_object(html, last(start))
    obj = json_read(String(json))
    obj["snapshots"] = jsonable(snapshots)
    return html[1:(j0 - 1)] * json_write(obj) * html[(j1 + 1):end]
end
