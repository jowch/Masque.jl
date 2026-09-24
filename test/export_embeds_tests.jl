# String pipeline for the docs cell-series player. No Pluto session — harvest
# helpers live in docs/player_pipeline.jl so Core CI fails if overlay host.value
# stops keying a snapshot, rewrite misses getPublishedObject, wrap drops mount,
# or inject_manifest_snapshots never attaches the table. Playwright against
# docs/build/ (test/e2e/docs_player.mjs, Documentation.yml) covers the live
# quick start: overlay click swaps the Pluto export's readout cell.

using Test

include(joinpath(@__DIR__, "..", "docs", "player_pipeline.jl"))

const GS_NB = joinpath(@__DIR__, "..", "docs", "src", "embeds", "getting_started.jl")
const OVERLAY_JS = joinpath(@__DIR__, "..", "assets", "overlay.js")

@testset "julia source highlight uses Pluto token classes" begin
    html = highlight_julia_html("@bind pick masque(fig)\n# note\nx = \"a<b\"\n:city\n20")
    @test occursin("<span class=\"hljs-meta\">@bind</span>", html)
    @test occursin("<span class=\"hljs-comment\"># note</span>", html)
    @test occursin("<span class=\"hljs-string\">&quot;a&lt;b&quot;</span>", html)
    @test occursin("<span class=\"hljs-symbol\">:city</span>", html)
    @test occursin("<span class=\"hljs-number\">20</span>", html)
    @test occursin("<span class=\"hljs-keyword\">using</span>", highlight_julia_html("using Masque"))
    @test !occursin("hljs-symbol", highlight_julia_html("x::Int"))
    @test !occursin("hljs-symbol", highlight_julia_html("for i in 1:nx"))
    @test occursin("<span class=\"hljs-symbol\">:crimson</span>", highlight_julia_html("color = :crimson"))
    pi_html = highlight_julia_html("x = \"π\"")
    @test occursin("hljs-string", pi_html)
    @test occursin("π", pi_html)
end

@testset "snapshot_key matches overlay host.value" begin
    # keyOf in emit_player: null → "null"; {layer, index} → "layer:index"; items → "items:…"
    @test snapshot_key(nothing) == "null"
    @test snapshot_key(Dict("layer" => "cities", "index" => 0)) == "cities:0"
    @test snapshot_key(Dict(:layer => "cities", :index => 0)) == "cities:0"
    @test snapshot_key(Dict("layer" => "cities", "index" => 0.0)) == "cities:0"
    items = Dict(
        "items" => [
            Dict("layer" => "cities", "index" => 0),
            Dict("layer" => "cities", "index" => 2),
        ],
    )
    @test snapshot_key(items) == "items:cities:0,cities:2"
end

@testset "getting-started TOML lists idle + all eight cities" begin
    player = parse_player_toml(GS_NB)
    @test player["bond"] == "pick"
    keys = [snapshot_key(js_shape_from_toml(row)) for row in player["states"]]
    @test keys[1] == "null"
    @test keys[2:end] == ["cities:$i" for i in 0:7]
    @test length(keys) == 9
    @test get(player, "chip", true) !== false
end

@testset "home quickstart TOML lists idle + three scatter points" begin
    path = joinpath(@__DIR__, "..", "docs", "src", "embeds", "home_quickstart.jl")
    player = parse_player_toml(path)
    @test player["bond"] == "sel"
    keys = [snapshot_key(js_shape_from_toml(row)) for row in player["states"]]
    @test keys == ["null", "scatter:0", "scatter:1", "scatter:2"]
    @test get(player, "chip", true) !== false
    @test player["show_code"] == true
    @test player["pluto_html"] == true
    @test length(player["cells"]) == 7
    @test endswith(player["cells"][1], "0009")
    src = read(path, String)
    @test occursin("Hover a point to read its name", src)
    @test occursin("`sel.index` is 1-based", src)
    @test occursin("name = \"one\"", src)
    @test occursin("if sel === nothing", src)
    @test occursin("PointInteractable(ax, s; payloads = points)", src)
end

@testset "overlay-only player TOML sets chip = false" begin
    path = joinpath(@__DIR__, "..", "docs", "src", "embeds", "gallery_limits.jl")
    player = parse_player_toml(path)
    @test player["chip"] == false
    @test player["bond"] == "pick"
    keys = [snapshot_key(js_shape_from_toml(row)) for row in player["states"]]
    @test keys == ["null"]
end

@testset "ROI items snapshot keys match overlay commit" begin
    @test snapshot_key(Dict("items" => Any[])) == "items:"
    path = joinpath(@__DIR__, "..", "docs", "src", "embeds", "roi_table.jl")
    player = parse_player_toml(path)
    @test player["bond"] == "picks"
    keys = [snapshot_key(js_shape_from_toml(row)) for row in player["states"]]
    @test keys[1] == "null"
    @test "items:" in keys
end

@testset "rewrite_published_to_js inlines getPublishedObject" begin
    html = """<script>
        const manifest = getPublishedObject("abc123");
        window.Masque.mount(currentScript, manifest, invalidation);
    </script>"""
    published = Dict("abc123" => Dict{String, Any}("layers" => Any[], "width" => 10))
    rewritten, n = rewrite_published_to_js(html, published)
    @test n == 1
    @test !occursin("getPublishedObject", rewritten)
    @test occursin("window.Masque.mount(currentScript, manifest, invalidation)", rewritten)
    start = last(findfirst("const manifest = ", rewritten))
    json, _, _ = extract_json_object(rewritten, start)
    obj = json_read(String(json))
    @test obj["width"] == 10
    @test isempty(obj["layers"])

    missed, n0 = rewrite_published_to_js("<script>const manifest = {};</script>", published)
    @test n0 == 0
    @test missed == "<script>const manifest = {};</script>"
end

@testset "wrap_scripts_for_static leaves mount callable" begin
    overlay = read(OVERLAY_JS, String)
    html = """<div class="ip-host"><script>
    $(overlay)
    const manifest = {"layers":[],"width":1,"height":1};
    window.Masque.mount(currentScript, manifest, invalidation);
    </script></div>"""
    wrapped = wrap_scripts_for_static(html)
    @test occursin("globalThis.Masque={mount", wrapped)
    @test occursin("window.Masque.mount(currentScript, manifest, invalidation)", wrapped)
    @test occursin("const currentScript = document.currentScript", wrapped)
    @test occursin("const invalidation = new Promise(() => {})", wrapped)
    @test occursin("parentElement.masqueManifest = manifest", wrapped)
    @test !occursin("if (!window.Masque)", wrapped)
    @test !occursin("if(!window.Masque)", wrapped)
    src_only = """<script src="overlay.js"></script>"""
    @test wrap_scripts_for_static(src_only) == src_only
end

@testset "inject_manifest_snapshots keys snapshots on host.value" begin
    html = """<script>
        const manifest = {"layers":[],"width":2};
        window.Masque.mount(currentScript, manifest, invalidation);
    </script>"""
    snaps = Dict(
        "null" => Dict("id" => "idle", "cells" => ["<p>idle</p>"]),
        "cities:0" => Dict("id" => "tokyo", "cells" => ["<p>Tokyo</p>"]),
    )
    out = inject_manifest_snapshots(html, snaps)
    start = last(findfirst("const manifest = ", out))
    json, _, _ = extract_json_object(out, start)
    obj = json_read(String(json))
    @test haskey(obj, "snapshots")
    @test obj["snapshots"]["cities:0"]["id"] == "tokyo"
    @test obj["snapshots"]["null"]["cells"] == ["<p>idle</p>"]
    @test occursin("window.Masque.mount", out)
end

@testset "inject_manifest_snapshots escapes a nested script tag" begin
    html = """<script>
        const manifest = {"layers":[]};
        window.Masque.mount(currentScript, manifest, invalidation);
    </script>"""
    snaps = Dict("null" => Dict("id" => "idle", "cells" => Dict("c" => "<script>bad()</script>")))
    out = inject_manifest_snapshots(html, snaps)
    @test count("</script>", out) == 1
    @test occursin("\\u003cscript>", out)
    start = last(findfirst("const manifest = ", out))
    json, _, _ = extract_json_object(out, start)
    obj = json_read(String(json))
    @test obj["snapshots"]["null"]["cells"]["c"] == "<script>bad()</script>"
end

@testset "png_data_url reads the inlined Cairo PNG" begin
    html = """<img src="data:image/png;base64,QUJDRA==" alt="fig">"""
    @test png_data_url(html) == "data:image/png;base64,QUJDRA=="
    @test png_data_url("<p>no image</p>") === nothing
end

@testset "inject_manifest_snapshots keeps a remounted png on the snapshot" begin
    html = """<script>
        const manifest = {"layers":[],"width":2};
        window.Masque.mount(currentScript, manifest, invalidation);
    </script>"""
    snaps = Dict(
        "null" => Dict("id" => "idle", "cells" => ["<p>idle</p>"]),
        "legend:2" => Dict(
            "id" => "gentoo",
            "cells" => ["<p>Gentoo</p>"],
            "png" => "data:image/png;base64,QUJD",
        ),
    )
    out = inject_manifest_snapshots(html, snaps)
    start = last(findfirst("const manifest = ", out))
    json, _, _ = extract_json_object(out, start)
    obj = json_read(String(json))
    @test obj["snapshots"]["legend:2"]["png"] == "data:image/png;base64,QUJD"
end

@testset "home hover stars TOML is overlay-only" begin
    path = joinpath(@__DIR__, "..", "docs", "src", "embeds", "home_hover_stars.jl")
    player = parse_player_toml(path)
    @test player["chip"] == false
    @test player["bond"] == "pick"
    keys = [snapshot_key(js_shape_from_toml(row)) for row in player["states"]]
    @test keys == ["null"]
end

@testset "home legend classes TOML lists idle plus three species" begin
    path = joinpath(@__DIR__, "..", "docs", "src", "embeds", "home_legend_classes.jl")
    player = parse_player_toml(path)
    @test player["bond"] == "sel"
    keys = [snapshot_key(js_shape_from_toml(row)) for row in player["states"]]
    @test keys == ["null", "legend:0", "legend:1", "legend:2"]
    @test get(player, "chip", true) !== false
end

@testset "home export TOML is overlay-only" begin
    path = joinpath(@__DIR__, "..", "docs", "src", "embeds", "home_export.jl")
    player = parse_player_toml(path)
    @test player["chip"] == false
    @test player["bond"] == "pick"
    keys = [snapshot_key(js_shape_from_toml(row)) for row in player["states"]]
    @test keys == ["null"]
end

@testset "home brush stations TOML lists region item sets" begin
    path = joinpath(@__DIR__, "..", "docs", "src", "embeds", "home_brush_stations.jl")
    player = parse_player_toml(path)
    @test player["bond"] == "picks"
    keys = [snapshot_key(js_shape_from_toml(row)) for row in player["states"]]
    @test keys[1] == "null"
    @test "items:" in keys
    @test any(startswith(k, "items:pts:0") for k in keys)
end

@testset "gallery players cover the demo sections" begin
    root = joinpath(@__DIR__, "..")
    @test !isdir(joinpath(root, "examples"))
    @test !isdir(joinpath(root, "gallery"))
    @test !isfile(joinpath(root, "docs", "export_notebooks.jl"))
    @test !isfile(joinpath(root, "docs", "src", "examples.md"))
    @test isfile(joinpath(root, "docs", "src", "embeds", "getting_started.jl"))

    names = [
        "gallery_tooltips",
        "gallery_selection",
        "gallery_bars",
        "gallery_polygons",
        "gallery_colorbar",
        "gallery_text",
        "gallery_boxselect",
        "gallery_image",
        "gallery_limits",
        "gallery_polar",
    ]
    for name in names
        path = joinpath(root, "docs", "src", "embeds", name * ".jl")
        @test isfile(path)
        player = parse_player_toml(path)
        @test player["bond"] isa AbstractString
        @test !isempty(player["states"])
        @test player["show_code"] == true
        @test player["pluto_html"] == true
        @test length(player["cells"]) >= 2
        @test any(endswith(id, "0002") for id in player["cells"])
        src = read(path, String)
        @test occursin("path = \"../../..\"", src)
        for id in player["cells"]
            @test occursin("# ╔═╡ $id", src)
        end
    end

    tips = parse_player_toml(joinpath(root, "docs", "src", "embeds", "gallery_tooltips.jl"))
    tip_keys = [snapshot_key(js_shape_from_toml(row)) for row in tips["states"]]
    @test tip_keys == ["null", "cities:0", "cities:1", "cities:2", "cities:3"]
    @test get(tips, "chip", true) !== false

    sel = parse_player_toml(joinpath(root, "docs", "src", "embeds", "gallery_selection.jl"))
    sel_keys = [snapshot_key(js_shape_from_toml(row)) for row in sel["states"]]
    @test sel_keys == ["null", "scatter:0", "scatter:2"]
    @test length(sel["cells"]) >= 5
    @test any(endswith(id, "0005") for id in sel["cells"])
    @test any(endswith(id, "0006") for id in sel["cells"])

    box = parse_player_toml(joinpath(root, "docs", "src", "embeds", "gallery_boxselect.jl"))
    box_keys = [snapshot_key(js_shape_from_toml(row)) for row in box["states"]]
    @test box_keys[1] == "null"
    @test "items:" in box_keys
    @test any(startswith(k, "items:pts:") for k in box_keys)

    polar = parse_player_toml(joinpath(root, "docs", "src", "embeds", "gallery_polar.jl"))
    polar_keys = [snapshot_key(js_shape_from_toml(row)) for row in polar["states"]]
    @test polar_keys == ["null", "scatter:0", "scatter:1", "scatter:2", "scatter:3"]

    for name in ("gallery_bars", "gallery_image", "gallery_limits")
        player = parse_player_toml(joinpath(root, "docs", "src", "embeds", name * ".jl"))
        @test player["chip"] == false
        keys = [snapshot_key(js_shape_from_toml(row)) for row in player["states"]]
        @test keys == ["null"]
    end

    gs = read(joinpath(root, "docs", "src", "embeds", "getting_started.jl"), String)
    @test occursin("bond = \"pick\"", gs)
    @test occursin("id = \"tokyo\"", gs)

    guides = [
        "marks_bars", "marks_poly", "marks_polar", "legend_lines", "roi_table",
        "tooltips_template", "tooltips_dark", "grids_heatmap", "readouts_axis",
        "custom_regions", "linked_two_axis", "linked_legend_wash",
    ]
    for name in guides
        player = parse_player_toml(joinpath(root, "docs", "src", "embeds", name * ".jl"))
        @test player["pluto_html"] == true
        @test player["show_code"] == true
        @test any(js_shape_from_toml(row) === nothing for row in player["states"])
    end
end

include(joinpath(@__DIR__, "..", "docs", "player_fallback.jl"))

@testset "player text twin: notes, code, figure, readouts" begin
    root = joinpath(@__DIR__, "..")
    embeds = joinpath(root, "docs", "src", "embeds")
    nb = joinpath(embeds, "home_quickstart.jl")
    src = read(nb, String)

    cells = notebook_cell_code(src)
    @test cells["b0e1e001-0001-4000-8000-000000000003"] == "@bind sel masque(fig, pts)"
    @test !any(occursin("# ╔═╡", c) for c in values(cells))
    @test markdown_cell_text(cells["b0e1e001-0001-4000-8000-000000000009"]) ==
        "Hover a point to read its name, then click it. The last cell names the point.\n"
    @test markdown_cell_text("@bind sel masque(fig, pts)") === nothing
    @test_throws ErrorException markdown_cell_text("md\"x = \$(1 + 1)\"")
    @test_throws ErrorException markdown_cell_text("md\"x = \$x\"")
    @test markdown_cell_text("md\"costs \\\$5\"") == "costs \\\$5"

    @test is_bind_cell("@bind pick masque(fig)", "pick")
    @test is_bind_cell("@bind  pick masque(fig)", :pick)
    @test !is_bind_cell("@bind picks masque(fig, [pts, roi])", "pick")
    @test !is_bind_cell("@bind pick! masque(fig)", "pick")

    readout = "b0e1e001-0001-4000-8000-000000000004"
    md = fallback_markdown(nb; image = "../embeds/home_quickstart.png", outputs = Dict(readout => "click a point"))
    @test length(md.content) == 1
    twin = only(md.content)
    @test twin isa Markdown.Admonition
    @test twin.category == "details"
    @test twin.title == FALLBACK_TITLE
    code = [b.code for b in twin.content if b isa Markdown.Code && b.language == "julia"]
    player = fallback_player(src)
    code_ids = [id for id in player["cells"] if markdown_cell_text(cells[id]) === nothing]
    @test code == [cells[id] for id in code_ids]
    i_bind = findfirst(b -> b isa Markdown.Code && occursin("@bind sel", b.code), twin.content)
    @test twin.content[i_bind + 1] isa Markdown.Paragraph
    @test only(twin.content[i_bind + 1].content).url == "../embeds/home_quickstart.png"
    @test any(b -> b isa Markdown.Code && b.language == "" && b.code == "click a point", twin.content)

    plain = Markdown.plain(fallback_markdown(nb))
    @test occursin("PointInteractable(ax, s; payloads = points)", plain)
    @test !occursin("home_quickstart.png", plain)

    # Every Pluto-export player on the site has a twin with its `@bind` cell.
    n = 0
    for f in readdir(embeds; join = true)
        endswith(f, ".jl") || continue
        s = read(f, String)
        occursin("pluto_html = true", s) || continue
        bond = fallback_player(s)["bond"]
        t = only(fallback_markdown(f).content)
        @test any(b -> b isa Markdown.Code && occursin("@bind $bond", b.code), t.content)
        @test any(b -> b isa Markdown.Paragraph, t.content)
        n += 1
    end
    @test n >= 23

    @test embeds_href("a.png"; build = "/b", pretty = true, cwd = "/b/gallery") == "../../embeds/a.png"
    @test embeds_href("a.png"; build = "/b", pretty = true, cwd = "/b") == "../embeds/a.png"
    @test embeds_href("a.png"; build = "/b", pretty = false, cwd = "/b/gallery") == "../embeds/a.png"
    @test embeds_href("a.png"; build = "/b", pretty = false, cwd = "/b") == "embeds/a.png"
end
