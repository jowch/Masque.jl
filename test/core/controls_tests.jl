using Test, Masque, CairoMakie, Makie, FileIO
include(joinpath(@__DIR__, "..", "testutils.jl"))

# Makie blocks as controls (#345): a named block is a field holding its plain value, drawn by
# the browser as an HTML control over an empty box in the picture.
# Every block a call doesn't name is an error, so a test lays out only the blocks it names.
function _controls_fixture(blocks = (:sl, :tg, :isl, :cb, :menu))
    fig = Figure(size = (500, 400))
    ax = Axis(fig[1, 1:2])
    sc = scatter!(ax, 1.0:5.0, 1.0:5.0)
    fitline = lines!(ax, [1.0, 5.0], [0.0, 0.0])
    sl = :sl in blocks ? Slider(fig[2, 1]; range = 0:0.5:5, startvalue = 1.0) : nothing
    tg = :tg in blocks ? Toggle(fig[2, 2]; active = true) : nothing
    isl = :isl in blocks ? IntervalSlider(fig[3, 1]; range = 1:10, startvalues = (2, 7)) : nothing
    cb = :cb in blocks ? Checkbox(fig[3, 2]; checked = false) : nothing
    menu = :menu in blocks ? Menu(fig[4, 1:2]; options = [("red", :red), ("blue", :blue)], default = "blue") : nothing
    return (; fig, ax, sc, fitline, sl, tg, isl, cb, menu)
end

_env(id, p) = Dict{String, Any}("layer" => id, "index" => 0, "payload" => p)
_layer(m, id) = only(l for l in m["layers"] if l["id"] == id)

@testset "block controls (#345)" begin
    @testset "a named block is a field holding its plain value" begin
        (; fig, sl, tg, isl, cb, menu) = _controls_fixture()
        w = masque(fig, (degree = sl, show = tg, span = isl, fine = cb, color = menu))
        m = w.manifest
        @test ["degree", "show", "span", "fine", "color"] ⊆ m["fields"]
        v = Masque.initial_bond(w)
        @test v.degree == 1.0
        @test v.show === true
        @test v.span == (2, 7)
        @test v.fine === false
        @test v.color === :blue
        g = _layer(m, "degree")["geometry"]
        @test _layer(m, "degree")["kind"] == "control"
        @test _layer(m, "degree")["bond"] == "control"
        @test g["control"] == "slider" && g["value"] == 2 && g["n"] == 11
        @test g["range"] == [0.0, 0.5]
        @test g["horizontal"] === true
        @test !haskey(g, "settleOnly")
        @test _layer(m, "color")["geometry"]["labels"] == ["red", "blue"]
        @test _layer(m, "color")["geometry"]["value"] == 1
        @test _layer(m, "span")["geometry"]["value"] == [1, 6]
        # The release the browser sends decodes to the block's own values.
        js = Dict(
            "degree" => _env("degree", 7), "show" => _env("show", false), "span" => _env("span", [6, 0]),
            "fine" => _env("fine", true), "color" => _env("color", 0),
        )
        v2 = Masque.bond_from_js(w, js)
        @test v2.degree == 3.5
        @test v2.show === false
        @test v2.span == (1, 7)
        @test v2.fine === true
        @test v2.color === :red
        @test_throws ArgumentError Masque.bond_from_js(w, Dict("degree" => _env("degree", 11)))
        @test_throws ArgumentError Masque.bond_from_js(w, Dict("show" => _env("show", 1)))
    end

    @testset "the box sits on the block, in image px" begin
        (; fig, sl) = _controls_fixture((:sl,))
        w = masque(fig, (degree = sl,))
        g = _layer(w.manifest, "degree")["geometry"]
        bb = sl.layoutobservables.computedbbox[]
        s = w.manifest["scaling"]
        @test g["x"] ≈ bb.origin[1] * s
        @test g["w"] ≈ bb.widths[1] * s
        @test g["y"] ≈ w.manifest["height"] - (bb.origin[2] + bb.widths[2]) * s
        @test g["h"] ≈ bb.widths[2] * s
    end

    @testset "named through bind, and a bare bind" begin
        (; fig, sc, sl) = _controls_fixture((:sl,))
        w = masque(fig; bind = (degree = sl, pts = sc))
        @test w.manifest["fields"] == ["degree", "pts"]
        @test Masque.initial_bond(w).degree == 1.0
        (; fig, sl) = _controls_fixture((:sl,))
        w = masque(fig; bind = sl)
        @test Masque.initial_bond(w) == 1.0
        (; fig, sl) = _controls_fixture((:sl,))
        @test_throws ArgumentError masque(fig, (a = sl,); bind = (b = sl,))
    end

    @testset "a block passed without a name says how to name it" begin
        (; fig, sl) = _controls_fixture((:sl,))
        err = try
            masque(fig, sl)
            nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin("needs a name", sprint(showerror, err))
    end

    @testset "a block the call doesn't name is an error naming its kind" begin
        (; fig, sl) = _controls_fixture()
        err = (@test_throws ArgumentError masque(fig, (degree = sl,))).value
        msg = sprint(showerror, err)
        @test occursin("(Toggle, IntervalSlider, Checkbox, Menu)", msg)
        @test occursin("`masque(fig, (name = block,))`", msg)
        @test_throws ArgumentError masque(fig)                          # zero-config names none
        fig2 = Figure(); Axis(fig2[1, 1]); Toggle(fig2[2, 1])
        msg1 = sprint(showerror, (@test_throws ArgumentError masque(fig2)).value)
        @test occursin("a block that masque wasn't given (Toggle)", msg1) && occursin("Name it to make it", msg1)
        @test_throws ArgumentError masque(fig; bind = (degree = sl,))
        (; fig, sl) = _controls_fixture((:sl,))
        @test_logs masque(fig, (degree = sl,))
        fig = Figure(); ax = Axis(fig[1, 1]); scatter!(ax, 1:3, 1:3)
        @test_logs masque(fig)
    end

    @testset "a block masque shows as a picture is a warning naming its kind (#426)" begin
        # A `SliderGrid`, `Button` or `Textbox` would look live and do nothing too, but figures
        # with one worked before, so it warns instead of failing.
        fig = Figure(); ax = Axis(fig[1, 1]); scatter!(ax, 1:3, 1:3)
        SliderGrid(fig[2, 1], (label = "a", range = 1:3))
        Button(fig[3, 1]; label = "Go")
        Textbox(fig[4, 1])
        @test_logs (:warn, r"has a SliderGrid, a Button and a Textbox, which masque shows as a picture.*separate Makie `Slider`s.*PlutoUI's Button"s) masque(fig)
        fig = Figure(); ax = Axis(fig[1, 1]); scatter!(ax, 1:3, 1:3)
        Button(fig[2, 1])
        @test_logs (:warn, r"has a Button, which.*PlutoUI's Button") masque(fig)
        fig = Figure(); ax = Axis(fig[1, 1]); scatter!(ax, 1:3, 1:3)
        SliderGrid(fig[2, 1], (label = "a", range = 1:3))
        @test_logs (:warn, r"^(?!.*PlutoUI).*separate Makie `Slider`s"s) masque(fig)
    end

    @testset "the picture leaves the block's box empty, and the figure keeps its drawing" begin
        (; fig, sl) = _controls_fixture((:sl,))
        plots = Masque._block_plots(sl)
        @test !isempty(plots)
        @test all(p -> p.visible[], plots)
        seen = Ref{Any}(nothing)
        Masque._with_blocks_hidden([Masque.BlockControl(sl, :degree)]) do
            seen[] = [p.visible[] for p in plots]
        end
        @test !any(seen[])
        @test all(p -> p.visible[], plots)
        # In pixels: the slider's knob is accent-coloured in Makie's drawing, and not in ours.
        w = masque(fig, (degree = sl,))
        g = _layer(w.manifest, "degree")["geometry"]
        img = Makie.colorbuffer(fig; px_per_unit = w.manifest["scaling"])
        box(im) = im[round(Int, g["y"] + 1):round(Int, g["y"] + g["h"]), round(Int, g["x"] + 1):round(Int, g["x"] + g["w"])]
        accent = Makie.to_color(sl.color_active[])
        near(c) = abs(Makie.red(c) - Makie.red(accent)) + abs(Makie.green(c) - Makie.green(accent)) + abs(Makie.blue(c) - Makie.blue(accent)) < 0.1
        @test any(near, box(img))
        ours = FileIO.load(IOBuffer(parentmodule(Masque.base64encode).base64decode(w.b64)))
        @test !any(near, box(ours))
    end

    @testset "onchange sees the block's value, and the block takes it first" begin
        (; fig, fitline, sl, tg) = _controls_fixture((:sl, :tg))
        seen = Any[]
        on_value = Float64[]
        on(v -> push!(on_value, v), sl.value)
        w = masque(
            fig, (degree = sl, show = tg); onchange = st -> begin
                push!(seen, (st.degree, st.show, sl.value[], tg.active[]))
                update!(fitline, [1.0, 5.0], fill(st.degree, 2); visible = st.show)
            end
        )
        @test only(seen) == (1.0, true, 1.0, true)
        Masque._sync_view_warmup!(w.render_frame)
        r = w.render_frame(Dict{String, Any}("onchange" => true, "settle" => false, "state" => Dict("degree" => _env("degree", 8), "show" => _env("show", false))))
        @test last(seen) == (4.0, false, 4.0, false)
        @test on_value[end] == 4.0
        @test fitline.visible[] === false
        @test haskey(r, "png") && !haskey(r, "clear")
        # The rebuilt manifest starts the control where the reader left it.
        @test _layer(r["manifest"], "degree")["geometry"]["value"] == 8
        # A bad value moves no block and keeps the picture.
        r2 = @test_logs (:error, r"Masque onchange failed") match_mode = :any w.render_frame(
            Dict{String, Any}("onchange" => true, "settle" => true, "state" => Dict("degree" => _env("degree", 2), "show" => _env("show", 3))),
        )
        @test haskey(r2, "error")
        @test sl.value[] == 4.0
    end

    @testset "onchange can change a block's options, and the manifest carries them" begin
        fig = Figure()
        src = Menu(fig[1, 1]; options = ["fruit", "veg"], default = "fruit")
        item = Menu(fig[2, 1]; options = ["apple", "pear", "plum"], default = "apple")
        choices = Dict("fruit" => ["apple", "pear", "plum"], "veg" => ["kale", "leek"])
        w = masque(
            fig, (src = src, item = item); onchange = st -> begin
                opts = choices[st.src]
                item.options[] == opts || (item.options[] = opts)
            end
        )
        Masque._sync_view_warmup!(w.render_frame)
        r = w.render_frame(Dict{String, Any}("onchange" => true, "settle" => true, "state" => Dict("src" => _env("src", 1), "item" => _env("item", 0))))
        g = _layer(r["manifest"], "item")["geometry"]
        @test g["labels"] == ["kale", "leek"] && g["n"] == 2
        @test g["value"] == -1
        r2 = w.render_frame(Dict{String, Any}("onchange" => true, "settle" => true, "state" => Dict("src" => _env("src", 1), "item" => _env("item", 1))))
        @test _layer(r2["manifest"], "item")["geometry"]["value"] == 1
        @test item.selection[] == "leek"
    end

    @testset "update_while_dragging = false marks the slider settle-only" begin
        fig = Figure()
        sl = Slider(fig[1, 1]; range = 1:3, update_while_dragging = false)
        w = masque(fig, (n = sl,))
        @test _layer(w.manifest, "n")["geometry"]["settleOnly"] === true
    end

    @testset "a range that isn't numeric ships its labels; a vertical slider says so" begin
        fig = Figure()
        sl = Slider(fig[1, 1]; range = ["low", "mid", "high"], startvalue = "mid", horizontal = false)
        w = masque(fig, (level = sl,))
        g = _layer(w.manifest, "level")["geometry"]
        @test g["labels"] == ["low", "mid", "high"] && !haskey(g, "range")
        @test g["horizontal"] === false
        @test Masque.initial_bond(w).level == "mid"
    end

    @testset "a menu with nothing chosen holds nothing" begin
        fig = Figure()
        menu = Menu(fig[1, 1]; options = ["a", "b"], default = nothing)
        w = masque(fig, (m = menu,))
        @test _layer(w.manifest, "m")["geometry"]["value"] == -1
        @test Masque.initial_bond(w).m === nothing
        @test Masque.bond_from_js(w, Dict("m" => _env("m", 1))).m == "b"
    end
end
