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

# Pluto's editor colors tokens with `--cm-color-*`. Static players have no CodeMirror,
# so unfolded source is highlighted into the same classes `highlightjs.css` maps onto
# those variables.
const _JULIA_KEYWORDS = Set{String}(
    [
        "abstract", "baremodule", "begin", "break", "catch", "const", "continue", "do",
        "else", "elseif", "end", "export", "false", "finally", "for", "function", "global",
        "if", "import", "let", "local", "macro", "module", "mutable", "nothing", "primitive",
        "quote", "return", "struct", "true", "try", "type", "using", "where", "while",
    ]
)

function _hljs(class, text)
    return "<span class=\"hljs-$class\">$(html_escape(text))</span>"
end

function _scan_string(code, i, n, q)
    # `i + 2` is a byte offset. A string whose first character is multibyte
    # (`"π"`) makes that index invalid.
    i2 = nextind(code, i)
    i3 = i2 <= n ? nextind(code, i2) : n + 1
    triple = i3 <= n && code[i] == q && code[i2] == q && code[i3] == q
    delim = triple ? q^3 : string(q)
    j = triple ? nextind(code, i3) : i2
    while j <= n
        if code[j] == '\\'
            j = nextind(code, j)
            j <= n && (j = nextind(code, j))
            continue
        end
        if !triple && code[j] == '\n'
            break
        end
        if startswith(SubString(code, j), delim)
            j += ncodeunits(delim)
            break
        end
        j = nextind(code, j)
    end
    return j
end

function _scan_word(code, i, n)
    j = i
    while j <= n
        c = code[j]
        (isletter(c) || isdigit(c) || c == '_' || c == '!') || break
        j = nextind(code, j)
    end
    return j
end

# `:name` is a symbol. `1:n` and `a:b` are ranges, and `::T` is a type assert.
function _colon_is_symbol(code, i, n)
    i < n || return false
    nxt = code[nextind(code, i)]
    (isletter(nxt) || nxt == '_') || return false
    i == 1 && return true
    prev = code[prevind(code, i)]
    prev == ':' && return false
    return !(isletter(prev) || isdigit(prev) || prev in ('_', '!', ')', ']', '}'))
end

function _scan_number(code, i, n)
    j = i
    if code[j] == '.'
        j = nextind(code, j)
    end
    while j <= n
        c = code[j]
        (isdigit(c) || c == '_') || break
        j = nextind(code, j)
    end
    if j <= n && code[j] == '.' && (j == n || code[nextind(code, j)] != '.')
        j = nextind(code, j)
        while j <= n && (isdigit(code[j]) || code[j] == '_')
            j = nextind(code, j)
        end
    end
    if j <= n && (code[j] == 'e' || code[j] == 'E')
        k = nextind(code, j)
        if k <= n && (code[k] == '+' || code[k] == '-')
            k = nextind(code, k)
        end
        if k <= n && isdigit(code[k])
            j = k
            while j <= n && (isdigit(code[j]) || code[j] == '_')
                j = nextind(code, j)
            end
        end
    end
    return j
end

# Highlight a Julia cell the way Pluto's markdown code blocks do: keyword, string,
# comment, number, macro, and symbol spans. Colors come from the Pluto theme.
function highlight_julia_html(code::AbstractString)
    io = IOBuffer()
    i = 1
    n = ncodeunits(code)
    while i <= n
        c = code[i]
        if c == '#'
            j = findnext('\n', code, i)
            j = j === nothing ? n + 1 : j
            write(io, _hljs("comment", code[i:prevind(code, j)]))
            i = j
        elseif c == '"' || c == '\''
            j = _scan_string(code, i, n, c)
            write(io, _hljs("string", code[i:prevind(code, j)]))
            i = j
        elseif c == '@'
            j = _scan_word(code, nextind(code, i), n)
            write(io, _hljs("meta", code[i:prevind(code, j)]))
            i = j
        elseif c == ':' && _colon_is_symbol(code, i, n)
            j = _scan_word(code, nextind(code, i), n)
            write(io, _hljs("symbol", code[i:prevind(code, j)]))
            i = j
        elseif isdigit(c) || (c == '.' && i < n && isdigit(code[nextind(code, i)]))
            j = _scan_number(code, i, n)
            write(io, _hljs("number", code[i:prevind(code, j)]))
            i = j
        elseif isletter(c) || c == '_'
            j = _scan_word(code, i, n)
            word = code[i:prevind(code, j)]
            if word in _JULIA_KEYWORDS
                write(io, _hljs("keyword", word))
            else
                write(io, html_escape(word))
            end
            i = j
        else
            write(io, html_escape(string(c)))
            i = nextind(code, i)
        end
    end
    return String(take!(io))
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
    # A snapshot can be another widget, whose HTML contains `</script>`. Inside this
    # script element that sequence ends the tag, so escape every `<`.
    payload = replace(json_write(obj), "<" => "\\u003c")
    return html[1:(j0 - 1)] * payload * html[(j1 + 1):end]
end
