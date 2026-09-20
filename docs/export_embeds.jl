import Pkg
using Pluto
using TOML
using UUIDs
using JSON3

# Homebrew cell-series player harvest. Getting-started embed is the README GIF demo
# (`docs/dev/readme-demo/notebook.jl`): nbpkg-on, in-process against docs/Project.toml.

const PLAYER_CELL_ID = UUID("e1be0000-0000-4000-8000-000000000001")
const PLAYER_TOML_RE = r"PLUTO_PLAYER_TOML_CONTENTS\s*=\s*\"\"\"(.*?)\"\"\""s
const EMBED_BUDGET = 2 * 1024 * 1024 # warn, never fail
const GETPUB_RE = r"getPublishedObject\(\"([^\"]+)\"\)"
const SCRIPT_RE = r"<script([^>]*)>(.*?)</script>"s

const GS_USING_ID = UUID("a1b2c3d4-0001-4000-8000-000000000001")
const GS_FIG_ID = UUID("a1b2c3d4-0001-4000-8000-000000000002")
const GS_BIND_ID = UUID("a1b2c3d4-0001-4000-8000-000000000003")
const GS_PICK_ID = UUID("a1b2c3d4-0001-4000-8000-000000000004")

# Listed states follow the GIF recorder path in `docs/dev/readme-demo/record.mjs`
# (hover Tokyo / Cairo, click São Paulo). Other cities stay overlay-only.
const GS_PLAYER_SOURCE = """
PLUTO_PLAYER_TOML_CONTENTS = \"\"\"
[player]
bond = "pick"

[[player.states]]
id = "idle"

[[player.states]]
id = "tokyo"
value = { layer = "cities", index = 0 }

[[player.states]]
id = "cairo"
value = { layer = "cities", index = 5 }

[[player.states]]
id = "sao_paulo"
value = { layer = "cities", index = 3 }
\"\"\"
"""

const GS_FIG_SOURCE = raw"""
begin
    cities_data = [
        (city = "Tokyo", pop_m = 37.4, pop = 37_400_000, gdp = 1600),
        (city = "Delhi", pop_m = 32.9, pop = 32_900_000, gdp = 370),
        (city = "Shanghai", pop_m = 28.5, pop = 28_500_000, gdp = 780),
        (city = "São Paulo", pop_m = 22.4, pop = 22_400_000, gdp = 430),
        (city = "Mexico City", pop_m = 22.1, pop = 22_100_000, gdp = 411),
        (city = "Cairo", pop_m = 21.3, pop = 21_300_000, gdp = 165),
        (city = "Mumbai", pop_m = 20.7, pop = 20_700_000, gdp = 310),
        (city = "Beijing", pop_m = 21.5, pop = 21_500_000, gdp = 700),
    ]
    city_colors = [
        "#e6194b", "#3cb44b", "#4363d8", "#f58231",
        "#911eb4", "#0e9aa7", "#f032e6", "#9a8b00",
    ]
    xs = Float64[c.pop_m for c in cities_data]
    ys = Float64[c.gdp for c in cities_data]

    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; xlabel = "Population (millions)", ylabel = "GDP (US\$bn)")
    markersize = 18
    scatter!(ax, xs, ys; color = city_colors, markersize)
    # From the Scatter plot: default `:circle` draws at ≈0.3525×markersize, not the points-
    # constructor default radius=9. `colors` is tooltip accent only (highlight is split-blend).
    cities = PointInteractable(
        ax, collect(zip(xs, ys));
        id = :cities,
        radius = 0.3525 * markersize,
        payloads = [(; city = c.city, pop = c.pop) for c in cities_data],
        colors = (; palette = city_colors, index = collect(0:(length(cities_data) - 1))),
        tooltip = masque"<b>$(city)</b><br>pop $(pop:,)",
    )
    nothing
end
"""

const GS_BIND_SOURCE = "@bind pick masque(fig, cities)"

const GS_PICK_SOURCE = "pick === nothing ? md\"*Hover a city, then click one.*\" : md\"**\$(pick.payload.city)** selected — index \$(pick.index)\""

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
    return JSON3.write(jsonable(d))
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

function rewrite_published_to_js(html::AbstractString, published::AbstractDict)
    n = Ref(0)
    rewritten = replace(
        html, GETPUB_RE => function (m)
            id = match(GETPUB_RE, m).captures[1]
            haskey(published, id) || error("published object $id missing from cell")
            n[] += 1
            return JSON3.write(jsonable(published[id]))
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

function cell_output_html(c::Pluto.Cell)
    mime = string(c.output.mime)
    body = c.output.body
    html, n_inlined = if mime == "text/html" && body isa AbstractString
        rewrite_published_to_js(body, c.published_objects)
    elseif body isa AbstractString
        s = body
        if mime == "text/plain" && length(s) >= 2 && startswith(s, '"') && endswith(s, '"')
            s = s[2:(end - 1)]
        end
        "<pre>$(html_escape(s))</pre>", 0
    else
        "<pre>$(html_escape(repr(body)))</pre>", 0
    end
    return wrap_scripts_for_static(html), n_inlined
end

function png_bytes_from_html(html::AbstractString)
    m = match(r"data:image/png;base64,([A-Za-z0-9+/=]+)", html)
    m === nothing && return 0
    # 4 base64 chars → 3 bytes, ignore padding
    return (sizeof(m.captures[1]) * 3) ÷ 4
end

function manifest_bytes(published::AbstractDict)
    isempty(published) && return 0
    return maximum(sizeof(JSON3.write(jsonable(v))) for v in values(published); init = 0)
end

function harvest_session(; distributed::Bool)
    session = Pluto.ServerSession()
    session.options.server.disable_writing_notebook_files = true
    session.options.evaluation.workspace_use_distributed = distributed
    return session
end

# In-process: Malt.InProcessWorker leaves LOAD_PATH at --project=docs (nbpkg is a no-op).
# Mark nbpkg instantiated so Pluto does not Pkg.instantiate the file's own env.
# Distributed fallback: point nbpkg_ctx at docs/ so the worker's ACTIVE_PROJECT is the harvest env.
function open_embed(session::Pluto.ServerSession, path::AbstractString; retarget_docs::Bool)
    nb = Pluto.load_notebook(path; disable_writing_notebook_files = true)
    Pluto.will_use_pluto_pkg(nb) || error("embed $path must keep nbpkg on (will_use_pluto_pkg)")
    if retarget_docs
        docs_dir = normpath(joinpath(@__DIR__))
        nb.nbpkg_ctx = Pluto.PkgCompat.load_ctx(docs_dir)
        @info "harvest: retargeted nbpkg_ctx at docs/" docs_dir
    end
    nb.nbpkg_ctx_instantiated = true
    session.notebooks[nb.notebook_id] = nb
    Pluto.update_save_run!(session, nb, nb.cells; run_async = false, save = false)
    return nb
end

function assert_no_errors(nb, path)
    errored = [c for c in nb.cells if c.errored]
    for c in errored
        firstline = first(split(strip(string(c.code)), '\n'))
        @error "cell errored in $(basename(path))" code = firstline output = string(c.output.body)
    end
    isempty(errored) || error("embed $(basename(path)) has errored cell(s)")
    return nothing
end

function package_load_failed(nb)
    for c in nb.cells
        c.errored || continue
        msg = lowercase(string(c.output.body))
        occursin("masque", msg) || occursin("cairomakie", msg) || occursin("package", msg) || continue
        return true
    end
    return false
end

function bind_cell(nb, bond::Symbol)
    needle = "@bind $bond"
    hits = [c for c in nb.cells if occursin(needle, c.code)]
    isempty(hits) && error("no cell with `$needle`")
    length(hits) == 1 || error("multiple `$needle` cells")
    return only(hits)
end

function snapshot_cells(nb, player, bond::Symbol)
    if haskey(player, "cells")
        ids = UUID.(player["cells"])
        return [nb.cells_dict[id] for id in ids]
    end
    defining = bind_cell(nb, bond)
    dependents = Pluto.where_referenced(nb.topology, Set([bond]))
    seen = Set{UUID}([defining.cell_id])
    cells = Pluto.Cell[defining]
    for c in nb.cells
        c.cell_id == PLAYER_CELL_ID && continue
        c in dependents || continue
        c.cell_id in seen && continue
        push!(seen, c.cell_id)
        push!(cells, c)
    end
    return cells
end

function set_bond!(session, nb, bond::Symbol, js_shape)
    nb.bonds[bond] = Pluto.BondValue(js_shape)
    Pluto.set_bond_values_reactive(;
        session, notebook = nb, bound_sym_names = [bond], run_async = false,
    )
    return nothing
end

function record_state(cells)
    htmls = Dict{String, String}()
    n_inlined = 0
    png_b = 0
    man_b = 0
    for c in cells
        html, n = cell_output_html(c)
        htmls[string(c.cell_id)] = html
        n_inlined += n
        png_b = max(png_b, png_bytes_from_html(html))
        man_b = max(man_b, manifest_bytes(c.published_objects))
    end
    return (; htmls, n_inlined, png_b, man_b)
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

function _css_brace_inner(css::AbstractString, open::Int)
    n = ncodeunits(css)
    depth = 0
    j = open
    while j <= n
        c = css[j]
        if c == '{'
            depth += 1
        elseif c == '}'
            depth -= 1
            if depth == 0
                inner_start = nextind(css, open)
                inner_end = prevind(css, j)
                inner_start > inner_end && return ""
                return String(strip(SubString(css, inner_start, inner_end)))
            end
        end
        j = nextind(css, j)
    end
    return error("unterminated CSS brace group")
end

# Pluto ships palettes as `@media (prefers-color-scheme: …)`. Documenter's toggle is a
# class, not OS preference, so rewrite those wrappers to `html.pluto-dark`.
function unwrap_prefers_color_scheme(css::AbstractString, scheme::AbstractString)
    needle = "@media (prefers-color-scheme: $scheme)"
    start = findfirst(needle, css)
    start === nothing && error("expected `$needle` in Pluto theme CSS")
    i = last(start)
    n = ncodeunits(css)
    while i <= n && css[i] != '{'
        i = nextind(css, i)
    end
    i > n && error("no opening brace for $needle")
    return _css_brace_inner(css, i)
end

function pluto_theme_css()
    frontend = joinpath(pkgdir(Pluto), "frontend", "themes")
    light = unwrap_prefers_color_scheme(read(joinpath(frontend, "light.css"), String), "light")
    dark = unwrap_prefers_color_scheme(read(joinpath(frontend, "dark.css"), String), "dark")
    light = replace(light, ":root" => "html:not(.pluto-dark)")
    dark = replace(dark, ":root" => "html.pluto-dark")
    return light * "\n" * dark
end

# Cell chrome copied from Pluto `frontend/editor.css` (variables, notebook, output, cell,
# trafficlight, assignee). Palette is not redefined here — it comes from the theme files.
const PLAYER_LAYOUT_CSS = raw"""
:root {
  --pluto-cell-spacing: 17px;
  --pluto-operator-ligatures: none;
  --julia-mono-font-stack: JuliaMono, Menlo, "Roboto Mono", "Lucida Sans Typewriter", "Source Code Pro", monospace;
  --lato-ui-font-stack: "Lato", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Cantarell, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", system-ui, sans-serif;
  --custom-code-font-stack: "";
  --code-font-stack: var(--julia-mono-font-stack);
}
html:not(.pluto-dark) { color-scheme: light; }
html.pluto-dark { color-scheme: dark; }
html { font-size: 16px; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  background-color: var(--main-bg-color);
  color: var(--pluto-output-color);
  font-family: var(--lato-ui-font-stack);
}
body { position: relative; padding-top: 2.25rem; }
pluto-notebook {
  display: block;
  background: var(--main-bg-color);
  --code-font-stack: var(--custom-code-font-stack), var(--julia-mono-font-stack);
  padding-left: 25px;
  padding-right: 6px;
}
pluto-output {
  font-family: "Alegreya Sans", "Trebuchet MS", sans-serif;
  font-size: 14.5px;
  font-weight: 400;
  color: var(--pluto-output-color);
  display: block;
  padding-left: 10px;
  padding-right: 10px;
  align-items: baseline;
  overflow-x: auto;
  background-color: var(--pluto-output-bg-color);
}
pluto-output pre {
  display: inline-block;
  margin: 0px;
  white-space: pre-wrap;
  word-break: break-all;
  tab-size: 4;
  font-family: var(--julia-mono-font-stack);
  font-size: 0.8rem;
  font-variant-ligatures: none;
}
pluto-cell {
  display: block;
  min-height: calc(23px + 1px + 1px);
  margin-top: var(--pluto-cell-spacing);
  position: relative;
}
pluto-cell:first-child { margin-top: 0; }
pluto-output:not(.rich_output) {
  display: flex;
  flex-wrap: wrap;
  padding-top: 3px;
  padding-bottom: 3px;
}
pluto-output > assignee {
  font-family: var(--julia-mono-font-stack);
  font-size: 0.75rem;
  font-variant-ligatures: none;
  color: var(--cm-color-variable) !important;
  font-weight: 700;
}
pluto-output > assignee::after {
  content: "\a0=\a0";
  opacity: 0.6;
}
pluto-output > assignee:empty { display: none; }
pluto-output > div {
  flex-shrink: 0;
  overflow-y: hidden;
}
pluto-trafficlight {
  box-sizing: content-box;
  width: 4px;
  position: absolute;
  left: -4px;
  top: 0px;
  bottom: 0px;
  pointer-events: none;
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
  border-left-color: var(--normal-cell-color);
  background: var(--normal-cell-color);
  overflow: hidden;
}
.ip-host { isolation: isolate; max-width: 100%; }
.masque-sim-chip {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px 4px 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--pluto-output-color) 28%, transparent);
  background: transparent;
  color: var(--pluto-output-color);
  font-family: var(--lato-ui-font-stack);
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: 0.01em;
  cursor: help;
  user-select: none;
}
.masque-sim-chip-icon {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
}
.masque-sim-chip-label code {
  font-family: var(--julia-mono-font-stack);
  font-size: 0.92em;
  font-weight: 600;
}
.masque-sim-tip {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: max-content;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--pluto-output-color) 22%, transparent);
  background: var(--pluto-output-bg-color);
  color: var(--pluto-output-color);
  box-shadow: 0 6px 18px color-mix(in srgb, #000 16%, transparent);
  font-size: 0.72rem;
  font-weight: 400;
  line-height: 1.35;
  letter-spacing: 0;
  text-align: left;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(-2px);
  transition: opacity 80ms ease, visibility 80ms ease, transform 80ms ease;
}
.masque-sim-chip:hover .masque-sim-tip,
.masque-sim-chip:focus-visible .masque-sim-tip {
  opacity: 1;
  visibility: visible;
  transform: none;
}
.masque-player-caption {
  margin: var(--pluto-cell-spacing) 0 0;
  padding: 0 10px;
  font-family: var(--lato-ui-font-stack);
  font-size: 0.85em;
  color: var(--pluto-schema-types-color);
  line-height: 1.45;
}
"""

function pluto_player_css()
    return PLAYER_LAYOUT_CSS * "\n" * pluto_theme_css()
end

# Mirrors Documenter `themeswap.js`: `html.className = "theme--" + theme`. Light primary
# leaves className empty. Anything else with `theme--` is treated as dark (Pluto dark).
const PARENT_IS_DOC_DARK_JS = raw"""function isDocDark() {
  var c = (window.parent && window.parent.document.documentElement.className) || "";
  if (!c) return false;
  if (/(^|\s)theme--(documenter-light|catppuccin-latte)(\s|$)/.test(c)) return false;
  return /(^|\s)theme--/.test(c);
}"""

const BOOT_PLUTO_DARK_JS = """
<script>
{
  $PARENT_IS_DOC_DARK_JS
  try { if (isDocDark()) document.documentElement.classList.add("pluto-dark"); } catch (e) {}
}
</script>
"""

const SIM_CHIP_HTML = raw"""
<div class="masque-sim-chip" tabindex="0" aria-describedby="masque-sim-tip">
  <svg class="masque-sim-chip-icon" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <circle cx="8" cy="5.15" r="1" fill="currentColor"/>
    <path d="M8 7.4v4.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </svg>
  <span class="masque-sim-chip-label">Simulating <code>@bind</code></span>
  <span id="masque-sim-tip" class="masque-sim-tip" role="tooltip">Precomputed snapshots, not a live Julia process.</span>
</div>
"""


# Put listed @bind states on the same manifest object the overlay mounts, not a
# side-channel SNAPSHOTS table. Lookup is still host.value (overlay's existing bond).
function inject_manifest_snapshots(html::AbstractString, snapshots)
    needle = "const manifest = "
    start = findfirst(needle, html)
    start === nothing && error("no inlined manifest to attach snapshots")
    json, j0, j1 = extract_json_object(html, last(start))
    obj = JSON3.read(String(json), Dict{String, Any})
    obj["snapshots"] = jsonable(snapshots)
    return html[1:(j0 - 1)] * JSON3.write(obj) * html[(j1 + 1):end]
end

function emit_player(path, outpath, player, cells, states, bond::Symbol)
    widget = first(cells)
    downstream = cells[2:end]
    snapshots = Dict{String, Any}()
    n_inlined_total = 0
    png_b = 0
    man_b = 0
    idle_html = nothing
    for st in states
        key = st.key
        rec = st.record
        snapshots[key] = Dict(
            "id" => st.id,
            "cells" => [rec.htmls[string(c.cell_id)] for c in downstream],
        )
        n_inlined_total += rec.n_inlined
        png_b = max(png_b, rec.png_b)
        man_b = max(man_b, rec.man_b)
        if idle_html === nothing || key == "null"
            idle_html = rec.htmls[string(widget.cell_id)]
        end
    end
    idle_down = String[]
    idle_state = findfirst(st -> st.key == "null", states)
    src_state = idle_state === nothing ? first(states) : states[idle_state]
    for c in downstream
        push!(idle_down, src_state.record.htmls[string(c.cell_id)])
    end

    n_states = length(states)
    cost = n_states * max(man_b, png_b)
    if cost > EMBED_BUDGET
        @warn "embed snapshot cost exceeds budget (warn only)" path = basename(path) n_states cost budget = EMBED_BUDGET manifest_bytes = man_b png_bytes = png_b
    end

    widget_html = inject_manifest_snapshots(something(idle_html), snapshots)
    down_html = join(idle_down, "\n")
    bond_name = html_escape(string(bond))
    title = html_escape(get(player, "title", "Masque embed"))
    caption = html_escape(
        get(
            player, "caption",
            "Listed clicks update the cell below. An unlisted click keeps the overlay alive; Julia stays on the last snapshot.",
        ),
    )
    player_css = pluto_player_css()

    html = """
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>$title</title>
      $BOOT_PLUTO_DARK_JS
      <style>
    $player_css
      </style>
    </head>
    <body>
      $SIM_CHIP_HTML
      <pluto-notebook class="masque-player">
        <pluto-cell>
          <pluto-trafficlight></pluto-trafficlight>
          <pluto-output class="rich_output">
            <div id="masque-widget">
              $widget_html
            </div>
          </pluto-output>
        </pluto-cell>
        <pluto-cell>
          <pluto-trafficlight></pluto-trafficlight>
          <pluto-output>
            <assignee>$bond_name</assignee>
            <div id="masque-out" data-masque-bind>
              $down_html
            </div>
          </pluto-output>
        </pluto-cell>
        <p class="masque-player-caption">$caption</p>
      </pluto-notebook>
      <script>
    {
      function layerIndexKey(layer, index) {
        return String(layer) + ":" + String(Number(index));
      }
      function keyOf(v) {
        if (v == null) return "null";
        if (Array.isArray(v.items)) {
          return "items:" + v.items.map(function (it) {
            return layerIndexKey(it.layer, it.index);
          }).join(",");
        }
        if (v.layer != null && v.index != null && v.index !== "") {
          return layerIndexKey(v.layer, v.index);
        }
        return JSON.stringify(v);
      }
      function snapFor(snaps, v) {
        const keys = [keyOf(v)];
        if (v && v.layer != null && v.index != null && v.index !== "") {
          keys.push(String(v.layer) + ":" + String(v.index));
          keys.push(String(v.layer) + ":" + String(v.index | 0));
        }
        for (let i = 0; i < keys.length; i++) {
          if (Object.prototype.hasOwnProperty.call(snaps, keys[i])) return snaps[keys[i]];
        }
        return null;
      }
      function applyFromHost(host) {
        const man = host && host.masqueManifest;
        const snaps = man && man.snapshots;
        if (!snaps) return false;
        const snap = snapFor(snaps, host.value);
        if (!snap) return false;
        const out = document.getElementById("masque-out");
        out.innerHTML = snap.cells.join("\\n");
        return true;
      }
      function sizeFrame() {
        if (!window.frameElement) return;
        const h = Math.ceil(document.documentElement.scrollHeight);
        window.frameElement.style.height = h + "px";
      }
      const host = document.querySelector(".ip-host");
      if (host) {
        let cur = host.value;
        Object.defineProperty(host, "value", {
          configurable: true,
          enumerable: true,
          get: function () { return cur; },
          set: function (v) {
            cur = v;
            applyFromHost(host);
            sizeFrame();
          },
        });
        const dispatch = host.dispatchEvent.bind(host);
        host.dispatchEvent = function (ev) {
          const ok = dispatch(ev);
          if (ev && ev.type === "input") {
            applyFromHost(host);
            sizeFrame();
          }
          return ok;
        };
        host.addEventListener("input", function () {
          applyFromHost(host);
          sizeFrame();
        });
        applyFromHost(host);
      }
      sizeFrame();
      window.addEventListener("load", sizeFrame);
    }
      </script>
    </body>
    </html>
    """
    mkpath(dirname(outpath))
    write(outpath, html)
    return (;
        outpath, n_states, cost, png_b, man_b, n_inlined_total,
        size = filesize(outpath),
    )
end

function harvest_one(session, path::AbstractString, outdir::AbstractString; retarget_docs::Bool)
    path = abspath(path)
    outdir = abspath(outdir)
    player = parse_player_toml(path)
    haskey(player, "bond") || error("player TOML missing bond in $path")
    haskey(player, "states") || error("player TOML missing states in $path")
    bond = Symbol(player["bond"])
    file_hash_before = hash(read(path))

    nb = open_embed(session, path; retarget_docs)
    try
        if package_load_failed(nb)
            return (; failed_pkg = true, nb, info = nothing, cells = nothing, states = nothing)
        end
        assert_no_errors(nb, path)
        cells = snapshot_cells(nb, player, bond)
        isempty(cells) && error("no cells to snapshot in $path")

        states = NamedTuple[]
        default_rec = record_state(cells)
        for row in player["states"]
            id = string(row["id"])
            js_shape = js_shape_from_toml(row)
            key = snapshot_key(js_shape)
            rec = if js_shape === nothing
                default_rec
            else
                set_bond!(session, nb, bond, js_shape)
                assert_no_errors(nb, path)
                record_state(cells)
            end
            push!(states, (; id, key, js_shape, record = rec))
        end

        outpath = joinpath(outdir, splitext(basename(path))[1] * ".html")
        info = emit_player(path, outpath, player, cells, states, bond)
        file_hash_after = hash(read(path))
        file_hash_before == file_hash_after || error("harvest rewrote $path — disable_writing_notebook_files failed")
        return (; failed_pkg = false, nb, info, cells, states)
    finally
        Pluto.SessionActions.shutdown(session, nb)
    end
end

function harvest_embed(path::AbstractString, outdir::AbstractString)
    path = abspath(path)
    outdir = abspath(outdir)
    old_cwd = pwd()
    @info "harvesting embed" name = basename(path) in_process = true
    try
        session = harvest_session(; distributed = false)
        result = harvest_one(session, path, outdir; retarget_docs = false)
        if result.failed_pkg
            @warn "in-process `using Masque, CairoMakie` failed; retrying with distributed workers + nbpkg_ctx → docs/"
            session2 = harvest_session(; distributed = true)
            result = harvest_one(session2, path, outdir; retarget_docs = true)
            result.failed_pkg && error("embed harvest could not `using Masque, CairoMakie` in-process or via retargeted nbpkg_ctx")
            return merge(result.info, (; harvest = "distributed-retarget"))
        end
        @info "using Masque, CairoMakie resolved in-process"
        return merge(result.info, (; harvest = "in-process"))
    finally
        cd(old_cwd)
    end
end

function find_embed_notebooks()
    d = joinpath(@__DIR__, "src", "embeds")
    isdir(d) || return String[]
    return sort(filter(p -> endswith(p, ".jl") && startswith(readline(p), "### A Pluto.jl notebook ###"), readdir(d; join = true)))
end

function export_embeds(outdir = joinpath(@__DIR__, "src", "embeds"))
    if get(ENV, "MASQUE_SKIP_EMBED_EXPORT", "") == "true"
        @info "MASQUE_SKIP_EMBED_EXPORT set — reusing players already in $outdir"
        return
    end
    notebooks = find_embed_notebooks()
    isempty(notebooks) && error("no embed notebooks found under docs/src/embeds/")
    mkpath(outdir)
    @info "Harvesting $(length(notebooks)) embed notebook(s)" names = basename.(notebooks)
    for path in notebooks
        t0 = time()
        info = harvest_embed(path, outdir)
        elapsed = round(time() - t0; digits = 1)
        size_kb = round(info.size / 1024; digits = 1)
        @info "✓ embed $(basename(path))" harvest = info.harvest elapsed_s = elapsed size_kb = size_kb n_states = info.n_states png_bytes = info.png_b manifest_bytes = info.man_b inlined = info.n_inlined_total
    end
    return
end

function write_getting_started_notebook(path = joinpath(@__DIR__, "src", "embeds", "getting_started.jl"))
    using_cell = Pluto.Cell(GS_USING_ID, "using Masque, CairoMakie")
    fig_cell = Pluto.Cell(GS_FIG_ID, strip(GS_FIG_SOURCE))
    bind_cell_ = Pluto.Cell(GS_BIND_ID, GS_BIND_SOURCE)
    pick_cell = Pluto.Cell(GS_PICK_ID, GS_PICK_SOURCE)
    player_cell = Pluto.Cell(PLAYER_CELL_ID, strip(GS_PLAYER_SOURCE))
    player_cell.code_folded = true
    mkpath(dirname(path))
    nb = Pluto.Notebook([using_cell, fig_cell, bind_cell_, pick_cell, player_cell], path)
    Pluto.save_notebook(nb)
    return path
end

function fill_embed_nbpkg(path::AbstractString, repo = normpath(joinpath(@__DIR__, "..")))
    Pluto.activate_notebook_environment(path) do
        Pkg.develop(; path = repo)
        Pkg.add("CairoMakie")
    end
    Pluto.will_use_pluto_pkg(path) || error("fill_embed_nbpkg left nbpkg off for $path")
    return path
end
