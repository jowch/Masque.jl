# String pipeline for the docs cell-series player. No Pluto session — harvest
# helpers live in docs/player_pipeline.jl so Core CI fails if overlay host.value
# stops keying a snapshot, rewrite misses getPublishedObject, wrap drops mount,
# or inject_manifest_snapshots never attaches the table. Playwright against
# docs/build/ (test/e2e/docs_player.mjs, Documentation.yml) covers the live
# quick start: overlay click swaps the Pluto export's readout cell.

using Test

include(joinpath(@__DIR__, "..", "docs", "player_pipeline.jl"))

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
    # A point picked on a line keys on its line and sample.
    @test snapshot_key(Dict("layer" => "sr", "index" => 1, "sample" => 3)) == "sr:1@3"
end

@testset "discrete_states lists every click in its wire shape" begin
    grid = (; xedges = [0.0, 1, 2, 3], yedges = [0.0, 1, 2], ncols = 3, nrows = 2, values = [1.0, 2, 3, 4, 5, 6])
    man = Dict{String, Any}(
        "layers" => Any[
            Dict{String, Any}("id" => "pts", "kind" => "circles", "events" => ["hover", "click"], "bond" => "element", "payloads" => Any[1, 2]),
            Dict{String, Any}("id" => "legend", "kind" => "rects", "events" => ["hover", "click"], "bond" => "legend", "payloads" => Any["a"]),
            Dict{String, Any}("id" => "tips", "kind" => "circles", "events" => ["hover"], "bond" => "element", "payloads" => Any[1, 2, 3]),
            Dict{String, Any}("id" => "x", "kind" => "axis", "events" => ["hover", "click"], "bond" => "axis", "payloads" => Any[]),
            Dict{String, Any}("id" => "cells", "kind" => "grid", "events" => ["hover", "click"], "bond" => "gridcell", "payloads" => Any[], "geometry" => grid),
            Dict{String, Any}("id" => "sr", "kind" => "lines", "events" => ["hover", "click"], "bond" => "element", "payloads" => Any[1, 2], "points" => Any[[0.0, 1, 1, 2], [0.0, 3]]),
        ],
    )
    states = discrete_states(man)
    @test [snapshot_key(v) for v in states] ==
        ["pts:0", "pts:1", "legend:0", "cells:0", "cells:1", "cells:2", "cells:3", "cells:4", "cells:5", "sr:0@0", "sr:0@1", "sr:1@0"]
    # `resolvePayload`: 0-based i (column), j (row), values[j * ncols + i]
    @test states[9]["payload"] == Dict("i" => 2, "j" => 1, "value" => 6.0)
    @test !haskey(states[1], "payload")

    # A grid the `selects` box brushes belongs to the box.
    brushed = deepcopy(man)
    only(L for L in brushed["layers"] if L["id"] == "cells")["brush"] = "grid"
    @test !any(v -> v["layer"] == "cells", discrete_states(brushed))

    # Sub-pixel cells ship no `values`: the clicks cannot be listed, so the notebook must change.
    sampled = Dict{String, Any}(
        "layers" => Any[
            Dict{String, Any}(
                "id" => "cells", "kind" => "grid", "events" => ["click"], "bond" => "gridcell", "payloads" => Any[],
                "geometry" => Dict{String, Any}("ncols" => 500, "nrows" => 500, "sample" => [0.0]),
            ),
        ],
    )
    @test_throws r"coarsen the grid" discrete_states(sampled)
end

@testset "discrete_states grid payload round-trips through bond_from_js" begin
    z = [Float64(i + 3j) for i in 1:4, j in 1:3]
    fig = Figure(size = (300, 200))
    ax = Axis(fig[1, 1])
    hm = heatmap!(ax, 1:4, 1:3, z)
    w = masque(fig, GridInteractable(ax, hm); auto = false)
    states = discrete_states(w.manifest)
    @test length(states) == 12
    for v in states
        ev = only(Masque.bond_from_js(w, Dict(v["layer"] => v)))
        @test z[ev.i, ev.j] == ev.value
    end
end

@testset "exported player opens on a selected= widget's seeded value" begin
    # A stored `nothing` bond would be restored over the value a `selected=` widget seeds at
    # mount, and the player must show that value's snapshot when it arms.
    src = read(joinpath(@__DIR__, "..", "docs", "pluto_html_export.jl"), String)
    @test occursin("delete!(nb.bonds, bond)", src)
    @test occursin("if (cur != null) patch(cur);", src)
end

@testset "player_states: idle, every click, then hand-listed drags" begin
    man = Dict{String, Any}(
        "layers" => Any[
            Dict{String, Any}("id" => "pts", "kind" => "circles", "events" => ["click"], "bond" => "element", "payloads" => Any[1, 2]),
        ],
    )
    # A threshold position is the kind of drag a TOML may still hand-list.
    level = Dict{String, Any}("layer" => "thr", "index" => 0, "payload" => 1.5)
    rows = player_states(Dict{String, Any}("states" => Any[Dict("id" => "t", "value" => level)]), man)
    @test [r.key for r in rows] == ["null", "pts:0", "pts:1", "thr:0"]
    @test rows[1].value === nothing
    @test [r.key for r in player_states(Dict{String, Any}(), man)] == ["null", "pts:0", "pts:1"]
    click = Dict{String, Any}("layer" => "pts", "index" => 0)
    @test_throws r"already records" player_states(Dict{String, Any}("states" => Any[Dict("id" => "c", "value" => click)]), man)
    @test_throws r"idle is always recorded" player_states(Dict{String, Any}("states" => Any[Dict("id" => "idle")]), man)
    # A second threshold position keys the same as the first: `snapshot_key` drops the payload.
    t1 = Dict{String, Any}("layer" => "thr", "index" => 0, "payload" => Dict("value" => 1.0))
    t2 = Dict{String, Any}("layer" => "thr", "index" => 0, "payload" => Dict("value" => 2.0))
    two = Dict{String, Any}("states" => Any[Dict("id" => "a", "value" => t1), Dict("id" => "b", "value" => t2)])
    @test_throws r"one position only" player_states(two, man)
end

@testset "player_states with pairs records a click on each of two fields" begin
    man = Dict{String, Any}(
        "fields" => Any["pts", "bars"],
        "layers" => Any[
            Dict{String, Any}("id" => "pts", "kind" => "circles", "events" => ["click"], "bond" => "element", "payloads" => Any[1, 2]),
            Dict{String, Any}("id" => "bars", "kind" => "rects", "events" => ["click"], "bond" => "element", "payloads" => Any[1]),
        ],
    )
    rows = player_states(Dict{String, Any}("pairs" => true), man)
    @test [r.key for r in rows] == ["null", "pts:0", "pts:1", "bars:0", "pts:0+bars:0", "pts:1+bars:0"]
    both = rows[end].value
    @test both["pts"]["index"] == 1 && both["bars"]["index"] == 0
    @test length(player_states(Dict{String, Any}(), man)) == 4
end

@testset "a grid brush keys on its cell window" begin
    win(i0, i1, j0, j1) = Dict{String, Any}(
        "items" => Any[
            Dict{String, Any}(
                "layer" => "img", "index" => 0,
                "payload" => Dict{String, Any}("i0" => i0, "i1" => i1, "j0" => j0, "j1" => j1, "xmin" => 0.0),
            ),
        ],
    )
    @test snapshot_key(win(10, 39, 10, 39)) == "items:img:0@10-39/10-39"
    @test snapshot_key(win(10, 39, 10, 39)) != snapshot_key(win(0, 29, 0, 29))
    # A point brush item has no payload window and keys as before.
    @test snapshot_key(Dict("items" => Any[Dict("layer" => "pts", "index" => 3)])) == "items:pts:3"
    # The lookup script builds the same window key `_item_key` writes.
    @test occursin("\"@\" + p.i0 + \"-\" + p.i1 + \"/\" + p.j0 + \"-\" + p.j1", PLAYER_LOOKUP_JS)
end

# A manifest the way `widget_manifest` returns it: image px, linear axes, 100 px per unit.
function _brush_manifest(target)
    t = Dict{String, Any}(
        "viewport" => [0, 0, 400, 300], "xlims" => [0.0, 4.0], "ylims" => [0.0, 3.0],
        "xscale" => "identity", "yscale" => "identity", "xreversed" => false, "yreversed" => false,
    )
    roi = Dict{String, Any}("id" => "roi", "kind" => "roi", "events" => ["drag"], "bond" => "none", "axis" => "ax")
    target = merge(target, Dict{String, Any}("brush" => target["kind"] == "grid" ? "grid" : "elements"))
    return Dict{String, Any}("layers" => Any[target, roi], "transforms" => Dict("ax" => t))
end

@testset "brush_states: every box a reader can draw" begin
    # Three points at image px (100,250), (200,150), (300,50). A box encloses a run of them
    # in x that is also a run in y: {}, each single, each adjacent pair, and all three.
    pts = Dict{String, Any}(
        "id" => "pts", "kind" => "circles", "events" => ["hover"], "bond" => "element", "axis" => "ax",
        "geometry" => Any[100, 250, 5, 200, 150, 5, 300, 50, 5], "payloads" => Any[1, 2, 3],
    )
    keys = [snapshot_key(v) for v in brush_states(_brush_manifest(pts))]
    @test keys[1] == "items:"
    @test Set(keys) == Set(["items:", "items:pts:0", "items:pts:1", "items:pts:2", "items:pts:0,pts:1", "items:pts:1,pts:2", "items:pts:0,pts:1,pts:2"])
    @test allunique(keys)
    # Not monotone: points 0 and 2 share a y, so a flat box encloses {0, 2} without 1, a
    # set that is not an index run.
    vee = merge(pts, Dict{String, Any}("geometry" => Any[100, 150, 5, 200, 250, 5, 300, 150, 5]))
    @test Set(snapshot_key(v) for v in brush_states(_brush_manifest(vee))) == Set(
        [
            "items:", "items:pts:0", "items:pts:1", "items:pts:2", "items:pts:0,pts:1",
            "items:pts:0,pts:2", "items:pts:1,pts:2", "items:pts:0,pts:1,pts:2",
        ]
    )
    # A point outside the axis viewport cannot be enclosed.
    off = merge(pts, Dict{String, Any}("geometry" => Any[100, 250, 5, 500, 150, 5]))
    @test Set(snapshot_key(v) for v in brush_states(_brush_manifest(off))) == Set(["items:", "items:pts:0"])

    # A 3 x 2 grid over the whole axis: every window i0<=i1, j0<=j1, 6 * 3 = 18, plus empty.
    grid = Dict{String, Any}(
        "id" => "img", "kind" => "grid", "events" => ["hover"], "bond" => "gridcell", "axis" => "ax",
        "geometry" => Dict{String, Any}("xedges" => Any[0, 100, 200, 400], "yedges" => Any[300, 150, 0], "ncols" => 3, "nrows" => 2),
    )
    gs = brush_states(_brush_manifest(grid))
    @test length(gs) == 19 && allunique(snapshot_key.(gs))
    w = only(v for v in gs if snapshot_key(v) == "items:img:0@1-2/0-1")
    p = only(w["items"])["payload"]
    # Data bounds run from the centre of cell (1, 0) to the centre of cell (2, 1), a box the
    # overlay would release for this window: x px 150..300, y px 225..75.
    @test (p["xmin"], p["xmax"], p["ymin"], p["ymax"]) == (1.5, 3.0, 0.75, 2.25)

    # Too many to record: the harvest fails and says to shrink the example or record a clip.
    big = merge(grid, Dict{String, Any}("geometry" => Dict{String, Any}("xedges" => collect(0:4:400), "yedges" => collect(300:-3:0), "ncols" => 100, "nrows" => 100)))
    @test_throws r"shrink the example" brush_states(_brush_manifest(big))
    # A manifest without a selects box has no brushes.
    @test isempty(brush_states(Dict{String, Any}("layers" => Any[pts])))
end

@testset "check_reachable: every player interaction reaches a recording" begin
    roi = Dict{String, Any}("id" => "roi", "kind" => "roi", "events" => ["drag"], "bond" => "none")
    pts = Dict{String, Any}("id" => "pts", "kind" => "circles", "events" => ["hover"], "bond" => "element", "payloads" => Any[1, 2])
    pts["axis"] = "ax"
    pts["geometry"] = Any[100, 250, 5, 200, 150, 5]
    brushed = _brush_manifest(pts)
    # Brushes are enumerated, not hand-listed: idle, the empty box, each point, both.
    @test [r.key for r in player_states(Dict{String, Any}(), brushed)] == ["null", "items:", "items:pts:0", "items:pts:1", "items:pts:0,pts:1"]
    one = Dict{String, Any}("states" => Any[Dict("id" => "b", "value" => Dict("items" => Any[Dict("layer" => "pts", "index" => 1)]))])
    @test_throws r"lists a brush" player_states(one, brushed)
    # Also a brush the enumeration does not produce: point 5 does not exist.
    stray = Dict{String, Any}("states" => Any[Dict("id" => "s", "value" => Dict("items" => Any[Dict("layer" => "pts", "index" => 5)]))])
    @test_throws r"lists a brush" player_states(stray, brushed)
    # An axis readout cannot be recorded; the chip must say clicks are not simulated.
    axis = Dict{String, Any}("fields" => ["axis"], "layers" => Any[Dict{String, Any}("id" => "axis", "kind" => "axis", "events" => ["click", "hover"], "bond" => "axis")])
    @test_throws r"chip = false" player_states(Dict{String, Any}(), axis)
    @test [r.key for r in player_states(Dict{String, Any}("chip" => false), axis)] == ["null"]
end

@testset "player_states records a seeded pick cleared, not a box target" begin
    pick = Dict{String, Any}("id" => "pick", "kind" => "circles", "events" => ["click", "hover"], "bond" => "element", "payloads" => Any[1, 2])
    pts = Dict{String, Any}("id" => "pts", "kind" => "circles", "events" => ["hover"], "bond" => "element", "payloads" => Any[1, 2])
    pts["axis"] = "ax"
    pts["geometry"] = Any[100, 250, 5, 200, 150, 5]
    man = _brush_manifest(pts)
    push!(man["layers"], pick)
    man["fields"] = ["pick", "pts", "roi"]
    man["initial"] = Dict{String, Any}(
        "pick" => Dict{String, Any}("layer" => "pick", "index" => 0),
        "pts" => Dict{String, Any}("items" => Any[Dict{String, Any}("layer" => "pts", "index" => 0)]),
    )
    rows = player_states(Dict{String, Any}(), man)
    keys = [r.key for r in rows]
    @test "null@pick" in keys && !("null@pts" in keys)
    cleared = only(r for r in rows if r.key == "null@pick")
    @test cleared.value["pick"] === nothing && cleared.value["pts"] == man["initial"]["pts"]
end

@testset "snapshot_table stores each distinct snapshot once" begin
    idle = Dict("cells" => Dict("c" => "idle"))
    a = Dict("cells" => Dict("c" => "adelie"))
    table, extra = snapshot_table(["null" => idle, "pts:0" => a, "pts:1" => copy(a), "pts:2" => copy(idle)])
    @test length(table["snaps"]) == 2
    @test table["keys"] == Dict("null" => 0, "pts:0" => 1, "pts:1" => 1, "pts:2" => 0)
    @test table["snaps"][table["keys"]["pts:1"] + 1]["cells"]["c"] == "adelie"
    one, extra1 = snapshot_table(["null" => idle, "pts:0" => a])
    # Two aliased keys cost less than storing one more snapshot.
    @test extra - extra1 < sizeof(json_write(a))
    @test extra1 > sizeof(json_write(a))
end

@testset "player TOMLs hand-list drags only" begin
    embeds = joinpath(@__DIR__, "..", "docs", "src", "embeds")
    n = 0
    for f in readdir(embeds; join = true)
        endswith(f, ".jl") && startswith(readline(f), "### A Pluto.jl notebook ###") || continue
        player = parse_player_toml(f)
        @test player["bond"] isa AbstractString
        # Clicks and brushes are enumerated at harvest; only axis, threshold, and bounds
        # positions may be hand-listed.
        for row in get(player, "states", Any[])
            @test !haskey(js_shape_from_toml(row), "items")
        end
        n += 1
    end
    @test n >= 25
end

@testset "the player shows the latest change when two fields differ" begin
    node = Sys.which("node")
    if node === nothing
        @test_skip "node not installed"
    else
        js = PLAYER_LOOKUP_JS * raw"""
            const t = {initial: {a: null, b: null}, keyed: ["a", "b"], keys: {"null": 0, "a:0": 1, "b:1": 2}, snaps: ["idle", "A0", "B1"]};
            const A = {layer: "a", index: 0}, B = {layer: "b", index: 1};
            const got = [lookup(t, {a: null, b: null}), lookup(t, {a: A, b: null}), lookup(t, {a: A, b: B}),
                         lookup(t, {a: A, b: B}), lookup(t, {a: null, b: B})];
            process.stdout.write(got.join(","));
            """
        # Clicking a then b shows b; the same value again keeps it; clearing a shows b alone.
        @test read(`$node -e $js`, String) == "idle,A0,B1,B1,B1"
    end
end

@testset "a box released where it started is the starting state" begin
    item(ymin) = Dict{String, Any}("layer" => "img", "index" => 0, "payload" => Dict{String, Any}("i0" => 2, "i1" => 4, "j0" => 1, "j1" => 3, "ymin" => ymin))
    start = Dict{String, Any}("items" => Any[item(1.0)])
    keying = Dict{String, Any}("initial" => Dict{String, Any}("img" => start), "keyed" => ["img"], "controls" => String[])
    # Its edges come back a float digit off, its cells the same.
    @test state_key(keying, Dict("img" => Dict{String, Any}("items" => Any[item(0.9999998)]))) == "null"
    node = Sys.which("node")
    if node === nothing
        @test_skip "node not installed"
    else
        js = PLAYER_LOOKUP_JS * """
            const t = Object.assign($(json_write(keying)), {keys: {"null": 0}, snaps: ["idle"]});
            process.stdout.write(String(lookup(t, {img: $(json_write(Dict("items" => Any[item(0.9999998)])))})));
            """
        @test read(`$node -e $js`, String) == "idle"
    end
end

@testset "a state file that lands late never covers a newer value" begin
    node = Sys.which("node")
    if node === nothing
        @test_skip "node not installed"
    else
        js = PLAYER_LOOKUP_JS * raw"""
            const pending = {};
            const load = (f) => new Promise((ok, fail) => { pending[f] = {ok, fail}; });
            const log = [];
            const show = latestOnly(load, (s) => log.push("apply " + s), (on) => log.push("miss " + on));
            console.warn = () => {};
            (async () => {
              show("a.json"); show(null);          // A still loading, then a value never recorded
              pending["a.json"].ok("A");
              show("b.json"); show("c.json");      // B, then C before B lands
              pending["c.json"].ok("C"); pending["b.json"].ok("B");
              await new Promise((r) => setTimeout(r, 10));
              show("d.json"); pending["d.json"].fail(new Error("404"));
              await new Promise((r) => setTimeout(r, 10));
              process.stdout.write(log.join(","));
            })();
            """
        # A's cells never cover the miss, B's never cover C's, and a file that fails to load says so.
        @test read(`$node -e $js`, String) ==
            "miss false,miss true,miss false,miss false,apply C,miss false,miss true"
    end
end

include(joinpath(@__DIR__, "..", "docs", "player_fallback.jl"))

@testset "the Getting started notebook: its figure cell, then its value" begin
    path = joinpath(@__DIR__, "..", "docs", "src", "embeds", "home_quickstart.jl")
    player = parse_player_toml(path)
    @test player["bond"] == "sel"
    @test get(player, "chip", true) !== false
    @test player["show_code"] == true
    @test player["pluto_html"] == true
    @test length(player["cells"]) == 4
    @test endswith(player["cells"][1], "0002")
    segs = player_segments(player)
    @test segs["figure"] == player["cells"][1:1]
    @test segs["value"] == player["cells"][2:4]
    src = read(path, String)
    @test occursin("Hover over a point to see its name", src)
    @test occursin("name = \"four\"", src)
    @test occursin("if isnothing(sel.scatter)", src)
    @test occursin("interactables(s; payloads = points)", src)
end

@testset "overlay-only players set chip = false" begin
    for name in ("home_hover_stars", "home_export", "gallery_bars")
        player = parse_player_toml(joinpath(@__DIR__, "..", "docs", "src", "embeds", name * ".jl"))
        @test player["chip"] == false
    end
end

@testset "ROI items snapshot keys match overlay commit" begin
    @test snapshot_key(Dict("items" => Any[])) == "items:"
    @test snapshot_key(Dict("items" => Any[Dict("layer" => "pts", "index" => 0), Dict("layer" => "pts", "index" => 2)])) == "items:pts:0,pts:2"
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
    @test png_data_url("<img src=\"data:image/png;base64, QUJDRA==\">") == "data:image/png;base64,QUJDRA=="
end

@testset "inject_manifest_snapshots keeps a remounted png on the snapshot" begin
    html = """<script>
        const manifest = {"layers":[],"width":2};
        window.Masque.mount(currentScript, manifest, invalidation);
    </script>"""
    idle = Dict("cells" => ["<p>idle</p>"])
    gentoo = Dict("cells" => ["<p>Gentoo</p>"], "png" => "data:image/png;base64,QUJD")
    table, _ = snapshot_table(["null" => idle, "legend:2" => gentoo, "legend:0" => copy(idle)])
    out = inject_manifest_snapshots(html, table)
    start = last(findfirst("const manifest = ", out))
    json, _, _ = extract_json_object(out, start)
    obj = json_read(String(json))
    # What emit_player's `snapFor` reads: table.snaps[table.keys[key]].
    t = obj["snapshots"]
    snap(k) = t["snaps"][t["keys"][k] + 1]
    @test snap("legend:2")["png"] == "data:image/png;base64,QUJD"
    @test snap("legend:0") == snap("null")
    @test !haskey(snap("null"), "png")
    @test !haskey(t, "legend:2")
end

@testset "gallery players cover the demo sections" begin
    root = joinpath(@__DIR__, "..")
    @test !isdir(joinpath(root, "examples"))
    @test !isdir(joinpath(root, "gallery"))
    @test !isfile(joinpath(root, "docs", "export_notebooks.jl"))
    @test !isfile(joinpath(root, "docs", "src", "examples.md"))

    names = [
        "gallery_bars",
        "gallery_polygons",
        "gallery_text",
        "gallery_boxselect",
        "gallery_image",
        "example_heatmap_trace",
    ]
    for name in names
        path = joinpath(root, "docs", "src", "embeds", name * ".jl")
        @test isfile(path)
        player = parse_player_toml(path)
        @test player["bond"] isa AbstractString
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

    guides = [
        "marks_bars", "legend_lines", "roi_table",
        "tooltips_stars", "tooltips_stars_default", "tooltips_stars_dark", "grids_heatmap", "readouts_axis",
        "custom_regions", "recipes_dumbbell", "linked_legend_wash",
        "selection_start", "slice_spectra", "widgets_value", "explore_3d",
    ]
    for name in guides
        player = parse_player_toml(joinpath(root, "docs", "src", "embeds", name * ".jl"))
        @test player["pluto_html"] == true
        @test player["show_code"] == true
    end
end

@testset "player text twin: notes, code, figure, readouts" begin
    root = joinpath(@__DIR__, "..")
    embeds = joinpath(root, "docs", "src", "embeds")
    nb = joinpath(embeds, "home_quickstart.jl")
    src = read(nb, String)

    cells = notebook_cell_code(src)
    @test cells["b0e1e001-0001-4000-8000-000000000003"] == "@bind sel masque(fig, pts)"
    @test !any(occursin("# ╔═╡", c) for c in values(cells))
    @test markdown_cell_text(cells["b0e1e001-0001-4000-8000-000000000009"]) ==
        "Hover over a point to see its name, then click it, and the last cell names the point you clicked.\n"
    @test markdown_cell_text("@bind sel masque(fig, pts)") === nothing
    @test_throws ErrorException markdown_cell_text("md\"x = \$(1 + 1)\"")
    @test_throws ErrorException markdown_cell_text("md\"x = \$x\"")
    @test markdown_cell_text("md\"costs \\\$5\"") == "costs \\\$5"

    @test is_bind_cell("@bind pick masque(fig)", "pick")
    @test is_bind_cell("@bind  pick masque(fig)", :pick)
    @test !is_bind_cell("@bind picks masque(fig, [pts, roi])", "pick")
    @test !is_bind_cell("@bind pick! masque(fig)", "pick")
    @test !is_bind_cell("@bind pick_right masque(fig)", "pick")
    @test !is_bind_cell("md\"\"\"\n`@bind pick` saves a click in `pick`.\n\"\"\"", "pick")

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
    @test occursin("interactables(s; payloads = points)", plain)
    @test !occursin("home_quickstart.png", plain)

    # Every Pluto-export player on the site has a twin with its `@bind` cell.
    n = 0
    for f in readdir(embeds; join = true)
        endswith(f, ".jl") || continue
        s = read(f, String)
        occursin("pluto_html = true", s) || continue
        player = fallback_player(s)
        bond = player["bond"]
        t = only(fallback_markdown(f).content)
        @test any(b -> b isa Markdown.Code && occursin("@bind $bond", b.code), t.content)
        # A notebook in segments has its prose on the page, between the parts.
        haskey(player, "segments") || @test any(b -> b isa Markdown.Paragraph, t.content)
        n += 1
    end
    @test n >= 23

    @test embeds_href("a.png"; build = "/b", pretty = true, cwd = "/b/gallery") == "../../embeds/a.png"
    @test embeds_href("a.png"; build = "/b", pretty = true, cwd = "/b") == "../embeds/a.png"
    @test embeds_href("a.png"; build = "/b", pretty = false, cwd = "/b/gallery") == "../embeds/a.png"
    @test embeds_href("a.png"; build = "/b", pretty = false, cwd = "/b") == "embeds/a.png"
end

@testset "player segments: named cell ranges of one notebook" begin
    ids = ["a", "b", "c", "d"]
    base = Dict{String, Any}("pluto_html" => true, "cells" => ids)
    @test isempty(player_segments(base))
    segs = player_segments(merge(base, Dict("segments" => Dict("top" => ["b", "a"], "rest" => ["d", "c"]))))
    @test segs == Dict("top" => ["a", "b"], "rest" => ["c", "d"])  # the player's order, not the TOML's
    seg(s) = player_segments(merge(base, Dict("segments" => s)))
    @test_throws ErrorException seg(Dict("top" => ["a", "x"]))            # not a player cell
    @test_throws ErrorException seg(Dict("top" => ["a"], "two" => ["a"]))  # one cell, two segments
    @test_throws ErrorException seg(Dict("top" => ["a", "b", "c"]))       # d is in no segment
    @test_throws ErrorException seg(Dict("top" => String[]))
    @test_throws ErrorException seg(Dict("Top" => ["a"]))                  # goes in a URL hash
    @test_throws ErrorException seg(["a"])
    @test_throws ErrorException player_segments(Dict("cells" => ids, "segments" => Dict("top" => ["a"])))

    # Each segment's text twin holds only its own cells, and the figure goes with the widget.
    nb = joinpath(@__DIR__, "..", "docs", "src", "embeds", "roi_table.jl")
    src = read(nb, String)
    player = fallback_player(src)
    segs = player_segments(player)
    @test sort(collect(keys(segs))) == ["figure", "table"]
    cells = notebook_cell_code(src)
    for (name, seg_ids) in segs
        twin = only(fallback_markdown(nb; image = "x.png", segment = name).content)
        code = [b.code for b in twin.content if b isa Markdown.Code && b.language == "julia"]
        @test code == [cells[id] for id in seg_ids if markdown_cell_text(cells[id]) === nothing]
        has_bind = any(id -> is_bind_cell(cells[id], player["bond"]), seg_ids)
        @test any(b -> b isa Markdown.Paragraph && any(x -> x isa Markdown.Image, b.content), twin.content) == has_bind
    end
    @test_throws ErrorException fallback_markdown(nb; segment = "nope")
end

@testset "player controls: every setting recorded, keyed the way the page keys it" begin
    ctl(id, g) = Dict{String, Any}("id" => id, "kind" => "control", "events" => ["change"], "bond" => "control", "geometry" => g)
    env(id, p) = Dict{String, Any}("layer" => id, "index" => 0, "payload" => p)
    manifest = Dict{String, Any}(
        "fields" => ["freq", "dots"],
        "layers" => Any[
            ctl("freq", Dict{String, Any}("control" => "slider", "n" => 9, "value" => 0)),
            ctl("dots", Dict{String, Any}("control" => "toggle", "value" => false)),
        ],
        "initial" => Dict{String, Any}("freq" => env("freq", 0), "dots" => env("dots", false)),
    )
    states = control_states(manifest)
    @test length(states) == 18
    keying = player_keying(manifest)
    @test keying["controls"] == ["freq", "dots"]
    @test state_key(keying, manifest["initial"]) == "null"
    @test state_key(keying, merge(manifest["initial"], Dict("freq" => env("freq", 3)))) == "freq=3"
    @test state_key(keying, merge(manifest["initial"], Dict("freq" => env("freq", 3), "dots" => env("dots", true)))) == "freq=3+dots=true"
    rows = player_states(Dict{String, Any}(), manifest)
    @test length(rows) == 18  # idle plus 17 settings; a control is never cleared
    @test !any(r -> startswith(r.key, "null@"), rows)
    @test allunique(r.key for r in rows)

    # An interval slider records each ordered pair of stops, a menu each option.
    two = Dict{String, Any}(
        "fields" => ["span", "pick"],
        "layers" => Any[
            ctl("span", Dict{String, Any}("control" => "intervalslider", "n" => 3, "value" => [0, 2])),
            ctl("pick", Dict{String, Any}("control" => "menu", "n" => 2, "value" => 0)),
        ],
        "initial" => Dict{String, Any}("span" => env("span", [0, 2]), "pick" => env("pick", 0)),
    )
    @test length(control_states(two)) == 6 * 2
    @test state_key(player_keying(two), merge(two["initial"], Dict("span" => env("span", [1, 2])))) == "span=[1,2]"
    big = deepcopy(manifest)
    big["layers"][1]["geometry"]["n"] = CONTROL_STATES_MAX
    @test_throws ErrorException control_states(big)

    node = Sys.which("node")
    if node === nothing
        @test_skip "node not installed"
    else
        # The page computes the same key from the value the overlay posts, for every setting.
        table = merge(keying, Dict{String, Any}("keys" => Dict(r.key => 0 for r in rows), "snaps" => ["x"]))
        values = [something(r.value, manifest["initial"]) for r in rows]
        js = PLAYER_LOOKUP_JS * "const t = " * json_write(table) * "; const vs = " * json_write(values) * raw""";
            process.stdout.write(vs.map((v) => keyOf(t, v)).join("\n"));
            """
        @test split(read(`$node -e $js`, String), "\n") == [r.key for r in rows]
        # With a control moved, a value the harvest skipped is a miss: no snapshot taken at
        # other settings stands in for it.
        js2 = PLAYER_LOOKUP_JS * raw"""
            const env = (l, p) => ({layer: l, index: 0, payload: p});
            const t = {initial: {f: env("f", 0), a: null}, keyed: ["f", "a"], controls: ["f"],
                       keys: {"null": 0, "a:0": 1, "f=1": 2}, snaps: ["idle", "A0", "F1"]};
            const A = {layer: "a", index: 0};
            const got = [lookup(t, {f: env("f", 0), a: A}), lookup(t, {f: env("f", 1), a: A})];
            process.stdout.write(got.map(String).join(","));
            """
        @test read(`$node -e $js2`, String) == "A0,null"
    end
end

@testset "the downloaded notebook drops the player TOML and the manifest" begin
    nb = joinpath(@__DIR__, "..", "docs", "src", "embeds", "controls_wave.jl")
    src = read(nb, String)
    out = download_notebook(src)
    @test startswith(out, "### A Pluto.jl notebook ###")
    @test !occursin("PLUTO_PLAYER_TOML_CONTENTS", out)
    @test !occursin("PLUTO_MANIFEST_TOML_CONTENTS", out)
    @test !occursin("e1be0000-0000-4000-8000-000000000001", out)
    @test !occursin("00000000-0000-0000-0000-000000000002", out)
    @test occursin("PLUTO_PROJECT_TOML_CONTENTS", out)
    @test occursin("@bind w masque(\n    fig, (freq = freq, dots = dots);", out)
    @test occursin("# ╠═a1b2c3d4-0002-4000-8000-000000000004\n", out)
    @test download_notebook(out) == out
end

@testset "players load the overlay script, pictures and states from shared files" begin
    dir = mktempdir()
    overlay = "(()=>{window.Masque={mount(){}}})();"
    png = UInt8[0x89, 0x50, 0x4e, 0x47, 0x01, 0x02]
    pic = "data:image/png;base64," * base64encode(png)
    html = """<div class="ip-host"><img src="$pic"><script>$overlay
    window.Masque.mount(currentScript)</script></div>"""
    out = externalize_html(html, dir; overlay)
    @test !occursin(overlay, out)
    @test !occursin("data:image", out)
    m = match(r"src=\"(shared/[0-9a-f]{20}\.png)\"", out)
    @test m !== nothing
    @test read(joinpath(dir, m.captures[1])) == png
    # A figure a cell returns (CairoMakie's `text/html`) has a space after the comma.
    fig_html = "<img width=560 src=\"data:image/png;base64, " * base64encode(png) * "\">"
    @test externalize_html(fig_html, dir; overlay) == "<img width=560 src=\"" * m.captures[1] * "\">"
    # The same picture in another state or player is the same file.
    @test externalize_html(html, dir; overlay) == out
    @test length(readdir(joinpath(dir, "shared"))) == 1

    idle = Dict{String, Any}("cells" => Dict{String, Any}("c" => Dict{String, Any}("mime" => "text/html", "body" => html)))
    tree = Dict{String, Any}("mime" => "application/vnd.pluto.tree+object", "body" => Dict{String, Any}("type" => "Tuple"))
    other = Dict{String, Any}("cells" => Dict{String, Any}("c" => tree))
    table = Dict{String, Any}("snaps" => Any[idle, other], "keys" => Dict("null" => 0, "pts:0" => 1), "keyed" => ["pts"])
    shipped = externalize_table(table, dir; overlay)
    @test shipped["keys"] == table["keys"] && shipped["keyed"] == table["keyed"]
    @test all(f -> occursin(r"^shared/[0-9a-f]{20}\.json$", f), shipped["snaps"])
    state(i) = _JSON.parse(read(joinpath(dir, shipped["snaps"][i]), String))["cells"]["c"]["body"]
    @test state(1) == out
    @test state(2)["type"] == "Tuple"

    # A static player's state: cell HTML in a vector, and the remounted picture.
    other_png = UInt8[0x89, 0x50, 0x4e, 0x47, 0x03, 0x04]
    snap = Dict{String, Any}("cells" => Any[html, "<p>plain</p>"], "png" => "data:image/png;base64," * base64encode(other_png))
    static = externalize_table(Dict{String, Any}("snaps" => Any[snap], "keys" => Dict("null" => 0)), dir; overlay)
    shipped_snap = _JSON.parse(read(joinpath(dir, static["snaps"][1]), String))
    @test occursin(r"^shared/[0-9a-f]{20}\.png$", shipped_snap["png"])
    @test read(joinpath(dir, shipped_snap["png"])) == other_png
    @test shipped_snap["cells"] == [out, "<p>plain</p>"]
    @test !any(c -> occursin(overlay, c) || occursin("data:image", c), shipped_snap["cells"])
end
