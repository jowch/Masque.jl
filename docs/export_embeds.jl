import Pkg
using Pluto
using TOML
using UUIDs
using JSON3

# Homebrew cell-series player harvest. Spike for getting-started: open a tiny nbpkg-on
# notebook in-process against docs/Project.toml, snapshot author-declared @bind states,
# rewrite published_to_js → inlined JSON, emit a static iframe player.

const PLAYER_CELL_ID = UUID("e1be0000-0000-4000-8000-000000000001")
const PLAYER_TOML_RE = r"PLUTO_PLAYER_TOML_CONTENTS\s*=\s*\"\"\"(.*?)\"\"\""s
const EMBED_BUDGET = 2 * 1024 * 1024 # warn, never fail
const GETPUB_RE = r"getPublishedObject\(\"([^\"]+)\"\)"
const SCRIPT_RE = r"<script([^>]*)>(.*?)</script>"s

const GS_USING_ID = UUID("a1b2c3d4-0001-4000-8000-000000000001")
const GS_FIG_ID = UUID("a1b2c3d4-0001-4000-8000-000000000002")
const GS_BIND_ID = UUID("a1b2c3d4-0001-4000-8000-000000000003")
const GS_PICK_ID = UUID("a1b2c3d4-0001-4000-8000-000000000004")

const GS_PLAYER_SOURCE = """
PLUTO_PLAYER_TOML_CONTENTS = \"\"\"
[player]
bond = "ev"

[[player.states]]
id = "idle"

[[player.states]]
id = "a"
value = { layer = "points", index = 0 }

[[player.states]]
id = "b"
value = { layer = "points", index = 1 }

[[player.states]]
id = "c"
value = { layer = "points", index = 2 }
\"\"\"
"""

const GS_FIG_SOURCE = """
begin
    pts = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0)]
    labels = ["a", "b", "c"]
    fig = Figure(; size = (500, 350))
    ax = Axis(fig[1, 1]; title = "click a point")
    scatter!(ax, first.(pts), last.(pts); markersize = 20)
    text!(ax, first.(pts), last.(pts); text = labels, align = (:left, :bottom), offset = (10, 8))
    fig
end
"""

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
    (haskey(d, "layer") && haskey(d, "index")) && return string(d["layer"], ":", Int(d["index"]))
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

const PLAYER_CSS = raw"""
:root {
  --pluto-cell-spacing: 17px;
  --julia-mono-font-stack: JuliaMono, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  --lato-ui-font-stack: "Lato Medium", Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --doc-fg: #4c4f51;
  --doc-muted: #6b7280;
  --normal-cell-color: rgba(0, 0, 0, 0.12);
  --pluto-output-color: var(--doc-fg);
  --pluto-output-bg-color: transparent;
  --main-bg-color: transparent;
  color-scheme: light;
}
html.theme--documenter-dark,
html.theme--catppuccin-mocha,
html.theme--catppuccin-macchiato,
html.theme--catppuccin-frappe {
  --doc-fg: #dbdbdb;
  --doc-muted: #9aa0a6;
  --normal-cell-color: rgba(255, 255, 255, 0.18);
  color-scheme: dark;
}
html, body {
  margin: 0;
  padding: 0;
  background: transparent;
  color: var(--doc-fg);
  font-family: var(--lato-ui-font-stack);
  font-size: 16px;
}
pluto-notebook { display: block; background: transparent; padding-left: 8px; }
pluto-cell {
  display: block;
  position: relative;
  margin-top: var(--pluto-cell-spacing);
  min-height: 25px;
}
pluto-cell:first-child { margin-top: 0; }
pluto-trafficlight {
  box-sizing: content-box;
  width: 4px;
  position: absolute;
  left: -4px;
  top: 0;
  bottom: 0;
  pointer-events: none;
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
  background: var(--normal-cell-color);
}
pluto-output {
  display: block;
  padding: 3px 10px;
  background: var(--pluto-output-bg-color);
  color: var(--pluto-output-color);
  overflow-x: auto;
}
pluto-output:not(.rich_output) {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  font-family: var(--julia-mono-font-stack);
  font-size: 0.875rem;
  font-variant-ligatures: none;
}
pluto-output > assignee {
  font-family: var(--julia-mono-font-stack);
  font-size: 0.75rem;
}
pluto-output > assignee::after {
  content: "\a0=\a0";
  opacity: 0.6;
}
pluto-output:not(.rich_output) pre {
  margin: 0;
  font: inherit;
  color: inherit;
  background: transparent;
  white-space: pre-wrap;
}
pluto-output.rich_output { padding-left: 10px; padding-right: 10px; }
.ip-host { isolation: isolate; max-width: 100%; }
.masque-player-caption {
  margin: var(--pluto-cell-spacing) 0 0;
  padding: 0 10px;
  font-size: 0.85em;
  color: var(--doc-muted);
  line-height: 1.45;
}
"""

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

    html = """
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>$title</title>
      <style>
    $PLAYER_CSS
      </style>
    </head>
    <body>
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
      function keyOf(v) {
        if (v == null) return "null";
        if (v.items) return "items:" + v.items.map((it) => it.layer + ":" + it.index).join(",");
        if (v.layer != null && v.index != null) return String(v.layer) + ":" + String(v.index);
        return JSON.stringify(v);
      }
      function applyFromHost(host) {
        const man = host && host.masqueManifest;
        const snaps = man && man.snapshots;
        if (!snaps) return false;
        const snap = snaps[keyOf(host.value)];
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
        host.addEventListener("input", () => {
          applyFromHost(host);
          sizeFrame();
        });
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
    bind_cell_ = Pluto.Cell(
        GS_BIND_ID,
        "@bind ev masque(fig, [PointInteractable(ax, pts; id = :points, payloads = labels)])",
    )
    pick_cell = Pluto.Cell(
        GS_PICK_ID,
        "ev === nothing ? \"click a point\" : \"you picked \$(ev.payload)\"",
    )
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
