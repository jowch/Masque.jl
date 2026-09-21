# String pipeline for the docs cell-series player. No Pluto session — harvest
# helpers live in docs/player_pipeline.jl so Core CI fails if overlay host.value
# stops keying a snapshot, rewrite misses getPublishedObject, wrap drops mount,
# or inject_manifest_snapshots never attaches the table. Playwright against
# docs/build/ (test/e2e/docs_player.mjs, Documentation.yml) covers the live
# overlay click → #masque-out swap.

using Test

# JSON3 comes from the test extras (Pkg.test / CI); a bare `julia --project=.` root env
# may lack it — skip LOUDLY rather than break the direct-run dev loop.
if Base.find_package("JSON3") === nothing
    @warn "SKIPPING export_embeds tests — JSON3 not in this env; run via Pkg.test()"
else
    @eval using JSON3

    include(joinpath(@__DIR__, "..", "docs", "player_pipeline.jl"))

    const GS_NB = joinpath(@__DIR__, "..", "docs", "src", "embeds", "getting_started.jl")
    const OVERLAY_JS = joinpath(@__DIR__, "..", "assets", "overlay.js")

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
        obj = JSON3.read(String(json), Dict{String, Any})
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
        obj = JSON3.read(String(json), Dict{String, Any})
        @test haskey(obj, "snapshots")
        @test obj["snapshots"]["cities:0"]["id"] == "tokyo"
        @test obj["snapshots"]["null"]["cells"] == ["<p>idle</p>"]
        @test occursin("window.Masque.mount", out)
    end
end
