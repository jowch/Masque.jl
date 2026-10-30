using Test, Masque, CairoMakie, Makie, FileIO, JSON3
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

    @testset "a toggle ships Makie's track and knob, turned by its orientation (#427)" begin
        fig = Figure(size = (300, 300))
        Axis(fig[1, 1])
        flat = Toggle(fig[2, 1]; active = true)
        tall = Toggle(fig[1, 2]; orientation = :vertical, length = 40, markersize = 20, rimfraction = 0.25, toggleduration = 0.3)
        w = masque(fig, (flat = flat, tall = tall))
        s = w.manifest["scaling"]
        g = _layer(w.manifest, "flat")["geometry"]
        @test g["theta"] == 0
        # Makie's default: a 32-long, 18-thick track, the knob off at the left end, on at the right.
        @test g["track"] ≈ [9s, 9s, 32s, 18s]
        @test g["knobOff"] ≈ [9s, 9s] && g["knobOn"] ≈ [g["w"] - 9s, 9s]
        @test g["knob"] ≈ 18 * (1 - 0.33) * s
        g = _layer(w.manifest, "tall")["geometry"]
        @test g["theta"] ≈ pi / 2
        @test g["w"] ≈ 20s && g["h"] ≈ 40s
        # Vertical: the track starts at the bottom; the knob is off at the bottom, on at the top.
        @test g["track"] ≈ [10s, 30s, 40s, 20s]
        @test g["knobOff"] ≈ [10s, 30s] && g["knobOn"] ≈ [10s, 10s]
        @test g["knob"] ≈ 15s
        @test g["duration"] == 0.3
    end

    @testset "a checkbox ships Makie's square and checkmark, and leaves its onchange alone (#428)" begin
        fig = Figure(); Axis(fig[1, 1])
        plain = Checkbox(fig[2, 1])
        odd = Checkbox(
            fig[3, 1]; size = 20, roundness = 1, checkboxstrokewidth = 2, checkmark = :circle, checkmarksize = 0.5,
            checkboxcolor_unchecked = :yellow, checkmarkcolor_unchecked = :gray,
        )
        w = @test_logs masque(fig, (plain = plain, odd = odd))
        s = w.manifest["scaling"]
        g = _layer(w.manifest, "plain")["geometry"]
        @test g["size"] ≈ 11s && g["radius"] ≈ 0.15 * 11 / 2 * s && g["stroke"] ≈ 1.5s
        @test g["markSize"] ≈ 11 * 0.85 * s
        @test startswith(g["mark"], "M") && endswith(g["mark"], "Z")
        g = _layer(w.manifest, "odd")["geometry"]
        @test g["size"] ≈ 20s && g["radius"] ≈ 10s && g["stroke"] ≈ 2s && g["markSize"] ≈ 10s
        @test g["off"] == Masque._css_color(Makie.to_color(:yellow))
        @test g["markOff"] == Masque._css_color(Makie.to_color(:gray))
        @test startswith(g["mark"], "M")              # `:circle` resolves to Makie's path
        # A character checkmark ships as the character.
        fig = Figure(); Axis(fig[1, 1]); cb = Checkbox(fig[2, 1]; checkmark = 'x')
        g = _layer(masque(fig, (cb = cb,)).manifest, "cb")["geometry"]
        @test g["markChar"] == "x" && !haskey(g, "mark")
        # A radio rule: its side effects untick the other boxes. Drawing the widget runs none of
        # it, and masque says once that a click flips the box instead (#457).
        fig = Figure(); Axis(fig[1, 1])
        rs = [Checkbox(fig[2, i]; checked = i == 1) for i in 1:3]
        calls = Ref(0)
        for r in rs
            r.onchange[] = v -> (calls[] += 1; foreach(o -> o === r || (o.checked[] = false), rs); true)
        end
        w = @test_logs (:warn, r"checkbox :r1 has its own `onchange`, which does nothing in masque.*Menu"s) match_mode = :any masque(fig, (r1 = rs[1], r2 = rs[2], r3 = rs[3]))
        @test calls[] == 0 && [r.checked[] for r in rs] == [true, false, false]
        @test Masque.initial_bond(w) == (r1 = true, r2 = false, r3 = false)
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

    @testset "a grid, button or text box masque isn't given is a warning naming its kind (#426)" begin
        # They would look live and do nothing too, but masque began drawing them in a patch
        # release and figures with one worked before, so it warns instead of failing.
        fig = Figure(); ax = Axis(fig[1, 1]); scatter!(ax, 1:3, 1:3)
        SliderGrid(fig[2, 1], (label = "a", range = 1:3))
        @test_logs (:warn, r"a SliderGrid that masque wasn't given.*Name it to make it live"s) masque(fig)
        Button(fig[3, 1])
        Textbox(fig[4, 1])
        @test_logs (:warn, r"a SliderGrid, a Button and a Textbox that masque wasn't given, so they show as pictures.*Name each one"s) masque(fig)
    end

    @testset "a text box is a field holding the text last entered, checked as Makie checks it (#433)" begin
        fig = Figure(); Axis(fig[1, 1])
        plain = Textbox(fig[2, 1]; placeholder = "name", textpadding = (4, 4, 2, 2), borderwidth = 2, boxcolor = :yellow)
        num = Textbox(fig[3, 1]; validator = Float64, stored_string = "1.5", restriction = c -> isdigit(c) || c == '.')
        pat = Textbox(fig[4, 1]; validator = r"[a-c]+"i, reset_on_defocus = true, defocus_on_submit = false)
        odd = Textbox(fig[5, 1]; validator = s -> length(s) == 3)
        # Only Julia can run a function, and without `onchange` nothing tells the box what it
        # refused: masque says so once.
        w = @test_logs (:warn, r"textbox :odd checks its text only in Julia.*onchange"s) masque(fig, (plain = plain, num = num, pat = pat, odd = odd))
        @test Masque.initial_bond(w) == (plain = nothing, num = "1.5", pat = nothing, odd = nothing)
        s = w.manifest["scaling"]
        g = _layer(w.manifest, "plain")["geometry"]
        @test g["control"] == "textbox" && g["value"] === nothing && g["placeholder"] == "name"
        @test g["pad"] ≈ [4s, 4s, 2s, 2s] && g["stroke"] ≈ 2s && g["radius"] ≈ 5s
        @test g["colors"][1] == Masque._css_color(Makie.to_color(:yellow)) && length(g["borders"]) == 4
        @test !haskey(g, "check") && !haskey(g, "allowed") && !haskey(g, "resetOnBlur") && !haskey(g, "keepFocus")
        g = _layer(w.manifest, "num")["geometry"]
        @test g["value"] == "1.5" && g["allowed"] == ".0123456789"
        rx = Regex("^(?:" * g["check"]["pattern"] * ")\$", "i")
        for t in ["1", " 2.5e3 ", ".5", "inf", "x", "1,5", ""]
            @test occursin(rx, t) == (tryparse(Float64, t) !== nothing)
        end
        g = _layer(w.manifest, "pat")["geometry"]
        @test g["check"] == Dict("pattern" => "[a-c]+", "flags" => "i") && g["resetOnBlur"] && g["keepFocus"]
        @test !haskey(_layer(w.manifest, "odd")["geometry"], "check")   # a function: Julia checks it
        # The text the browser sends, unless the validator or restriction refuses it: then the
        # field keeps what the box stored.
        bond(js) = Masque.bond_from_js(w, js)
        @test bond(Dict("odd" => _env("odd", "abc"))).odd == "abc"
        @test bond(Dict("odd" => _env("odd", "ab"))).odd === nothing
        @test bond(Dict("num" => _env("num", "2x"))).num == "1.5"
        @test bond(Dict("num" => _env("num", "2.25"))).num == "2.25"
        @test_throws ArgumentError bond(Dict("odd" => _env("odd", 3)))
        # Enter reaches the block's own `stored_string`, so code listening to it runs.
        heard = String[]
        on(t -> push!(heard, t), odd.stored_string)
        Masque._sync_controls!([Masque.BlockControl(odd, :odd)], Dict("odd" => _env("odd", "xyz")))
        @test odd.stored_string[] == "xyz" && odd.displayed_string[] == "xyz" && heard == ["xyz"]
        Masque._sync_controls!([Masque.BlockControl(odd, :odd)], Dict("odd" => _env("odd", "toolong")))
        @test odd.stored_string[] == "xyz" && heard == ["xyz"]
        # With `onchange` there is no warning, and the frame after a refused Enter carries the
        # stored text, which the browser puts back in the box.
        fig = Figure(); Axis(fig[1, 1]); odd = Textbox(fig[2, 1]; validator = s -> length(s) == 3)
        w = @test_logs masque(fig, (odd = odd,); onchange = st -> nothing)
        Masque._sync_view_warmup!(w.render_frame)
        frame(t) = w.render_frame(Dict{String, Any}("onchange" => true, "settle" => true, "state" => Dict("odd" => _env("odd", t))))
        @test _layer(frame("abc")["manifest"], "odd")["geometry"]["value"] == "abc"
        @test _layer(frame("ab")["manifest"], "odd")["geometry"]["value"] == "abc"
    end

    @testset "a slider grid is a field holding a tuple of its slider values (#430)" begin
        fig = Figure(size = (500, 400)); Axis(fig[1, 1])
        sg = SliderGrid(
            fig[2, 1],
            (label = "freq", range = 0:0.5:3, format = "{:.1f} Hz", startvalue = 1.0),
            (label = "span", range = 1:5, type = IntervalSlider, startvalues = (2, 4)),
        )
        w = @test_logs masque(fig, (grid = sg,))
        @test Masque.initial_bond(w).grid == (1.0, (2, 4))
        g = _layer(w.manifest, "grid")["geometry"]
        @test g["control"] == "slidergrid" && g["value"] == Any[2, [1, 3]]
        sl, isl = g["sliders"]
        @test sl["control"] == "slider" && sl["n"] == 7 && isl["control"] == "intervalslider"
        @test sl["valueLabel"]["labels"] == ["0.0 Hz", "0.5 Hz", "1.0 Hz", "1.5 Hz", "2.0 Hz", "2.5 Hz", "3.0 Hz"]
        @test sl["name"] == "freq" && isl["name"] == "span"
        # Only lo ≤ hi pairs, row-major: (2, 4) is lo = 2's second pair, after lo = 1's five.
        @test length(isl["valueLabel"]["pairs"]) == 15
        @test isl["valueLabel"]["pairs"][5 + 2 + 1] == "(2, 4)"
        # Each slider sits inside the grid's box, its value label to its right.
        @test g["x"] <= sl["x"] && sl["x"] + sl["w"] <= sl["valueLabel"]["x"] + 1
        v = Masque.bond_from_js(w, Dict("grid" => _env("grid", Any[6, Any[0, 4]])))
        @test v.grid == (3.0, (1, 5))
        @test_throws ArgumentError Masque.bond_from_js(w, Dict("grid" => _env("grid", Any[6])))
        # The browser's values reach the sliders themselves before `onchange`.
        Masque._sync_controls!([Masque.BlockControl(sg, :grid)], Dict("grid" => _env("grid", Any[0, Any[2, 3]])))
        @test sg.sliders[1].value[] == 0.0 && sg.sliders[2].interval[] == (3, 4)
        # The picture hides the sliders and their value labels, and keeps the names.
        hidden = Masque._block_plots(sg)
        @test !isempty(hidden)
        @test !any(p -> p in hidden, Masque._block_plots(sg.labels[1]))
        # A fine slider ships no labels, so its frames stay small; the browser writes the value.
        # An author's own `lift` on the slider's value is never called to find the format.
        fig = Figure(); Axis(fig[1, 1])
        fine = SliderGrid(fig[2, 1], (label = "fine", range = 0:0.001:10, format = "{:.3f}"))
        calls = Ref(0)
        lift(v -> (calls[] += 1; string(v)), fine.sliders[1].value)
        before = calls[]
        g = _layer(masque(fig, (fine = fine,)).manifest, "fine")["geometry"]
        @test !haskey(only(g["sliders"])["valueLabel"], "labels") && calls[] == before
        @test length(JSON3.write(g)) < 2000
    end

    @testset "a button is a field counting its clicks, drawn as Makie draws it (#431)" begin
        fig = Figure(); Axis(fig[1, 1])
        clicked = Ref(0)
        b = Button(fig[2, 1]; label = "Go", cornerradius = 8, strokewidth = 1, strokecolor = :black, buttoncolor = :yellow)
        on(n -> clicked[] = n, b.clicks)
        w = @test_logs masque(fig, (go = b,))
        @test Masque.initial_bond(w).go == 0
        s = w.manifest["scaling"]
        g = _layer(w.manifest, "go")["geometry"]
        @test g["control"] == "button" && g["value"] == 0 && g["caption"] == "Go"
        @test g["radius"] ≈ 8s && g["stroke"] ≈ 1s && g["fontsize"] ≈ b.fontsize[] * s
        @test g["colors"][1] == Masque._css_color(Makie.to_color(:yellow))
        @test g["strokeColor"] == Masque._css_color(Makie.to_color(:black))
        @test length(g["textColors"]) == 3
        @test Masque.bond_from_js(w, Dict("go" => _env("go", 2))).go == 2
        @test_throws ArgumentError Masque.bond_from_js(w, Dict("go" => _env("go", -1)))
        @test_throws ArgumentError Masque.bond_from_js(w, Dict("go" => _env("go", true)))
        # A click reaches the block's own `clicks`, so code listening to it runs.
        Masque._sync_controls!([Masque.BlockControl(b, :go)], Dict("go" => _env("go", 3)))
        @test b.clicks[] == 3 && clicked[] == 3
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

    @testset "a menu ships Makie's prompt, font size, padding and colours (#429)" begin
        fig = Figure(); Axis(fig[1, 1])
        menu = Menu(fig[2, 1]; options = ["a", "b"], prompt = "Pick one", fontsize = 20, textcolor = :red, selection_cell_color_inactive = :blue)
        w = masque(fig, (pick = menu,))
        g = _layer(w.manifest, "pick")["geometry"]
        s = w.manifest["scaling"]
        @test g["prompt"] == "Pick one"
        @test g["fontsize"] ≈ 20s
        @test g["padding"] ≈ menu.textpadding[][1] * s
        @test g["text"] == Masque._css_color(Makie.to_color(:red))
        @test g["off"] == Masque._css_color(Makie.to_color(:blue))
    end

    @testset "a control's text ships the font Makie draws it in (#476)" begin
        installed(file) = joinpath(Makie.assetpath("fonts"), file)
        hash(path) = "sha384-" * Masque.base64encode(Masque.sha384(read(path)))
        # Each of Makie's installed fonts is the file pinned at Makie's v0.21.0 tag; a Makie
        # release that changes one fails here (and in the upstream canary) before pages notice.
        for (file, pin) in values(Masque._MAKIE_FONT_FILES)
            @test hash(installed(file)) == pin
        end
        src(file) = [
            "https://cdn.jsdelivr.net/gh/MakieOrg/Makie.jl@v0.21.0/assets/fonts/$file",
            "https://raw.githubusercontent.com/MakieOrg/Makie.jl/v0.21.0/assets/fonts/$file",
        ]
        fig = Figure(); Axis(fig[1, 1])
        menu = Menu(fig[2, 1]; options = ["a", "b"])
        b = Button(fig[3, 1]; label = "Go", font = :bold)
        tb = Textbox(fig[4, 1]; font = "TeX Gyre Heros Makie Italic")
        sg = SliderGrid(fig[5, 1], (label = "f", range = 1:3))
        bi = Button(fig[6, 1]; label = "Both", font = :bold_italic)
        own = Button(fig[7, 1]; label = "Own", font = installed("DejaVuSans.ttf"))
        w = masque(fig, (pick = menu, go = b, text = tb, grid = sg, both = bi, own = own))
        font(id) = _layer(w.manifest, id)["geometry"]["font"]
        # Makie's own fonts name where the same file is online, and its hash.
        f = font("pick")
        @test f["family"] == "TeX Gyre Heros Makie" && !haskey(f, "weight") && !haskey(f, "style")
        @test f["src"] == src("TeXGyreHerosMakie-Regular.otf") && f["integrity"] == hash(installed("TeXGyreHerosMakie-Regular.otf"))
        f = font("go")
        @test f["weight"] == 700 && !haskey(f, "style")
        @test f["src"] == src("TeXGyreHerosMakie-Bold.otf") && f["integrity"] == hash(installed("TeXGyreHerosMakie-Bold.otf"))
        f = font("text")
        @test f["style"] == "italic" && !haskey(f, "weight")
        @test f["src"] == src("TeXGyreHerosMakie-Italic.otf") && f["integrity"] == hash(installed("TeXGyreHerosMakie-Italic.otf"))
        f = font("both")
        @test f["weight"] == 700 && f["style"] == "italic"
        @test f["src"] == src("TeXGyreHerosMakie-BoldItalic.otf") && f["integrity"] == hash(installed("TeXGyreHerosMakie-BoldItalic.otf"))
        @test only(_layer(w.manifest, "grid")["geometry"]["sliders"])["valueLabel"]["font"] == font("pick")
        # A font of the author's ships its name alone.
        f = font("own")
        @test f["family"] == "DejaVu Sans" && !haskey(f, "src") && !haskey(f, "integrity")
        # An installed Makie font that no longer matches its pin ships its name alone too.
        key = "tex gyre heros makie regular"
        pinned = Masque._MAKIE_FONT_FILES[key]
        try
            Masque._MAKIE_FONT_FILES[key] = (pinned[1], "sha384-changed")
            f = Masque._control_font(menu, :regular)
            @test f == Dict{String, Any}("family" => "TeX Gyre Heros Makie")
        finally
            Masque._MAKIE_FONT_FILES[key] = pinned
        end
        # A figure's own `fonts` reach the menu, which has no `font` of its own.
        fig = Figure(fonts = (; regular = "TeX Gyre Heros Makie Bold")); Axis(fig[1, 1])
        menu = Menu(fig[2, 1]; options = ["a", "b"])
        @test _layer(masque(fig, (pick = menu,)).manifest, "pick")["geometry"]["font"]["weight"] == 700
        # The weight comes from the style's name.
        @test Masque._font_weight("SemiBold Italic") == 600 && Masque._font_weight("Extra-Light") == 200
        @test Masque._font_weight("Regular") == 400 && Masque._font_weight("Bold") == 700
    end

    @testset "a menu ships Makie's list: cells, colours, arrow, direction and search (#429)" begin
        fig = Figure(); Axis(fig[1, 1])
        menu = Menu(
            fig[2, 1]; options = ["a", "b", "c"], fontsize = 20, textpadding = (6, 12, 4, 5),
            cell_color_active = :red, cell_color_hover = :green, cell_color_inactive_odd = :white,
            cell_color_inactive_even = :gray, textcolor_active = :yellow, textcolor_hover = :blue,
            dropdown_arrow_size = 14, direction = :up, search_placeholder = "Find...",
        )
        w = masque(fig, (pick = menu,))
        g = _layer(w.manifest, "pick")["geometry"]
        s = w.manifest["scaling"]
        c(x) = Masque._css_color(Makie.to_color(x))
        @test g["cellColors"] == [c(:green), c(:red), c(:white), c(:gray)]
        @test g["optionText"] == [c(:blue), c(:yellow)]
        # A cell is its text's height plus the bottom and top padding, as Makie sizes it: more
        # than the font size, which is what a failed measurement falls back to.
        @test (20 + 9) * s < g["cell"] < (20 * 1.5 + 9) * s
        @test g["direction"] == "up"
        @test g["arrow"]["size"] ≈ 14s && g["arrow"]["inset"] ≈ 12s
        @test startswith(g["arrow"]["path"], "M") && g["arrow"]["path"] != g["arrow"]["flip"]
        @test g["search"] == "Find..."
        @test haskey(g, "placeholderColor")
        # Not searchable: no search box; automatic direction: none shipped.
        fig2 = Figure()
        m2 = Menu(fig2[1, 1]; options = ["a", "b"], searchable = false)
        g2 = _layer(masque(fig2, (pick = m2,)).manifest, "pick")["geometry"]
        @test !haskey(g2, "search") && !haskey(g2, "direction")
    end

    @testset "a menu with its own filter warns that the browser runs Makie's rule (#429)" begin
        fig = Figure()
        menu = Menu(fig[1, 1]; options = ["a", "b"], filter = (q, s) -> startswith(s, q))
        @test_logs (:warn, r"menu :pick has its own `filter`") match_mode = :any masque(fig, (pick = menu,))
        fig2 = Figure()
        m2 = Menu(fig2[1, 1]; options = ["a", "b"])
        @test_logs min_level = Base.CoreLogging.Warn masque(fig2, (pick = m2,))
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
