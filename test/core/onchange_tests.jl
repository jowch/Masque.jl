using Test, Masque, CairoMakie, Makie, FileIO
include(joinpath(@__DIR__, "..", "testutils.jl"))

# `onchange` (#334): the widget's state drives the figure over the gesture channel.
function _onchange_fixture()
    fig = Figure(size = (500, 300))
    ax = Axis(fig[1, 1])
    x = collect(1.0:6.0)
    y = [1.0, 3.0, 2.0, 5.0, 4.0, 6.0]
    sc = scatter!(ax, x, y)
    fit = lines!(ax, [1.0, 6.0], [0.0, 0.0])
    thr = ThresholdInteractable(ax; value = 2.5)
    return (; fig, ax, x, y, sc, fit, thr)
end

_state_input(state; settle = true) = Dict{String, Any}("onchange" => true, "state" => state, "settle" => settle)

@testset "onchange (#334)" begin
    @testset "runs once with the starting state, before the first picture" begin
        (; fig, sc, fit, thr) = _onchange_fixture()
        seen = Any[]
        w = masque(
            fig, (pts = interactables(sc; select = :many), cutoff = thr);
            selected = (pts = [2, 4],), onchange = st -> (push!(seen, st); update!(fit, [1.0, 6.0], fill(st.cutoff.value, 2))),
        )
        @test length(seen) == 1
        st = only(seen)
        @test keys(st) == (:pts, :cutoff)
        @test [e.index for e in st.pts] == [2, 4]
        @test st.cutoff.value == 2.5
        @test Point2f.(fit[1][]) == [Point2f(1, 2.5), Point2f(6, 2.5)]
        @test w.manifest["onchange"] === true
        @test w.render_frame isa Function   # no view, but onchange needs the channel
        Masque._sync_view_warmup!(w.render_frame)
    end

    @testset "an error at mount fails the call" begin
        (; fig, thr) = _onchange_fixture()
        @test_throws ErrorException masque(fig, (cutoff = thr,); onchange = st -> error("boom"))
        @test_throws ArgumentError masque(fig, (cutoff = thr,); onchange = 3)
    end

    @testset "adding or removing a plot is an ArgumentError" begin
        (; fig, ax, thr) = _onchange_fixture()
        err = try
            masque(fig, (cutoff = thr,); onchange = st -> lines!(ax, [1, 2], [1, 2]))
            nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin("added a `lines` plot", sprint(showerror, err))
        (; fig, ax, sc, thr) = _onchange_fixture()
        err = try
            masque(fig, (cutoff = thr,); onchange = st -> delete!(ax, sc))
            nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin("removed a `scatter` plot", sprint(showerror, err))
    end

    @testset "state is every field; bind narrows only the value" begin
        (; fig, sc, fit, thr) = _onchange_fixture()
        seen = Any[]
        w = masque(fig, (pts = interactables(sc; select = :many), cutoff = thr); bind = :cutoff, onchange = st -> push!(seen, st))
        @test w.manifest["fields"] == ["pts", "cutoff"]
        @test w.manifest["bind"] == ["cutoff"]
        # A field the bind leaves out still takes clicks: it drives onchange.
        pts_layer = only(l for l in w.manifest["layers"] if l["id"] == "pts")
        @test "click" in pts_layer["events"]
        @test Masque.initial_bond(w).value == 2.5   # `bind = :cutoff` is the bare value
        @test keys(only(seen)) == (:pts, :cutoff)
        # The browser sends the bind's part as the value.
        @test Masque.bond_from_js(w, Dict("cutoff" => Dict("layer" => "cutoff", "index" => 0, "payload" => 4.0))).value == 4.0
        @test_throws ArgumentError Masque.bond_from_js(w, Dict("pts" => Dict("items" => Any[])))
        Masque._sync_view_warmup!(w.render_frame)
    end

    @testset "without onchange the manifest is unchanged" begin
        (; fig, sc, thr) = _onchange_fixture()
        w = masque(fig, (pts = interactables(sc; select = :many), cutoff = thr); bind = :cutoff)
        @test !haskey(w.manifest, "onchange") && !haskey(w.manifest, "bind")
        @test w.manifest["fields"] == ["cutoff"]
        @test w.render_frame === nothing
    end

    @testset "a frame calls onchange, moves the control, and renders" begin
        (; fig, sc, fit, thr) = _onchange_fixture()
        level = Ref(0.0)
        w = masque(fig, (cutoff = thr,); onchange = st -> (level[] = st.cutoff.value; update!(fit, [1.0, 6.0], fill(level[], 2))))
        Masque._sync_view_warmup!(w.render_frame)
        r = w.render_frame(_state_input(Dict("cutoff" => Dict("layer" => "cutoff", "index" => 0, "payload" => 4.5)); settle = false))
        @test level[] == 4.5
        @test Point2f.(fit[1][]) == [Point2f(1, 4.5), Point2f(6, 4.5)]
        @test haskey(r, "png") && haskey(r, "manifest")
        @test !haskey(r, "clear")
        # The rebuilt manifest draws the line where the drag has it, not at its start.
        g0 = only(l for l in w.manifest["layers"] if l["id"] == "cutoff")["geometry"]
        g1 = only(l for l in r["manifest"]["layers"] if l["id"] == "cutoff")["geometry"]
        @test g1["pos"] < g0["pos"]   # higher data y is higher on screen
        # 1x mid-drag, the mount density on release.
        rs = w.render_frame(_state_input(Dict("cutoff" => Dict("layer" => "cutoff", "index" => 0, "payload" => 4.5))))
        @test size(FileIO.load(IOBuffer(rs["png"])), 2) > size(FileIO.load(IOBuffer(r["png"])), 2)
        # A missing field is its start.
        w.render_frame(_state_input(Dict{String, Any}()))
        @test level[] == 2.5
    end

    @testset "an error in a frame keeps the picture and names it" begin
        (; fig, fit, thr) = _onchange_fixture()
        w = masque(fig, (cutoff = thr,); onchange = st -> st.cutoff.value > 4 ? error("too high: $(st.cutoff.value)") : nothing)
        Masque._sync_view_warmup!(w.render_frame)
        r = @test_logs (:error, r"Masque onchange failed") match_mode = :any w.render_frame(
            _state_input(Dict("cutoff" => Dict("layer" => "cutoff", "index" => 0, "payload" => 5.0))),
        )
        @test r == Dict{String, Any}("error" => "too high: 5.0")
        # The channel stays usable.
        r2 = w.render_frame(_state_input(Dict("cutoff" => Dict("layer" => "cutoff", "index" => 0, "payload" => 3.0))))
        @test haskey(r2, "png")
    end

    @testset "a plot whose mark count changes loses its picks" begin
        fig = Figure(size = (500, 300))
        ax = Axis(fig[1, 1])
        sc = scatter!(ax, 1.0:5.0, 1.0:5.0)
        thr = ThresholdInteractable(ax; value = 5.0, orientation = :vertical)
        w = masque(
            fig, (pts = interactables(sc; select = :many), cutoff = thr);
            onchange = st -> update!(sc, collect(1.0:st.cutoff.value), collect(1.0:st.cutoff.value)),
        )
        Masque._sync_view_warmup!(w.render_frame)
        pick = Dict("items" => Any[Dict("layer" => "pts", "index" => 1)])
        same = w.render_frame(_state_input(Dict("pts" => pick, "cutoff" => Dict("layer" => "cutoff", "index" => 0, "payload" => 5.0))))
        @test !haskey(same, "clear")
        fewer = w.render_frame(_state_input(Dict("pts" => pick, "cutoff" => Dict("layer" => "cutoff", "index" => 0, "payload" => 3.0))))
        @test fewer["clear"] == ["pts"]
        again = w.render_frame(_state_input(Dict("pts" => Dict("items" => Any[]), "cutoff" => Dict("layer" => "cutoff", "index" => 0, "payload" => 3.0))))
        @test !haskey(again, "clear")
    end

    @testset "update_while_dragging = false marks the control settle-only" begin
        fig = Figure(); ax = Axis(fig[1, 1]); scatter!(ax, 1:3, 1:3)
        t = ThresholdInteractable(ax; value = 2, update_while_dragging = false)
        roi = ROIInteractable(ax; bounds = (1, 2, 1, 2), update_while_dragging = false)
        w = masque(fig, (t = t, box = roi); onchange = st -> nothing)
        g(id) = only(l for l in w.manifest["layers"] if l["id"] == id)["geometry"]
        @test g("t")["settleOnly"] === true && g("box")["settleOnly"] === true
        w2 = masque(fig, (t = ThresholdInteractable(ax; value = 2),); onchange = st -> nothing)
        @test !haskey(only(l for l in w2.manifest["layers"] if l["id"] == "t")["geometry"], "settleOnly")
        Masque._sync_view_warmup!(w.render_frame)
        Masque._sync_view_warmup!(w2.render_frame)
    end

    @testset "view frames and onchange frames share the figure" begin
        (; fig, ax, fit, thr) = _onchange_fixture()
        w = masque(fig, (cutoff = thr,), ViewInteractable(ax); onchange = st -> update!(fit, [1.0, 6.0], fill(st.cutoff.value, 2)))
        Masque._sync_view_warmup!(w.render_frame)
        w.render_frame(_state_input(Dict("cutoff" => Dict("layer" => "cutoff", "index" => 0, "payload" => 4.0))))
        fl = Masque._finallimits(ax)
        x0 = Float64(fl.origin[1]); y0 = Float64(fl.origin[2])
        r = w.render_frame(
            Dict{String, Any}(
                "id" => "view", "xmin" => x0 + 1, "xmax" => x0 + 1 + Float64(fl.widths[1]),
                "ymin" => y0, "ymax" => y0 + Float64(fl.widths[2]), "settle" => true,
            ),
        )
        # The pan keeps the refit, and the line where the reader left it.
        @test Point2f.(fit[1][]) == [Point2f(1, 4), Point2f(6, 4)]
        g = only(l for l in r["manifest"]["layers"] if l["id"] == "cutoff")["geometry"]
        g0 = only(l for l in w.manifest["layers"] if l["id"] == "cutoff")["geometry"]
        @test g["pos"] < g0["pos"]
    end

    @testset "picks are read against the picture the browser shows" begin
        fig = Figure(size = (500, 300))
        ax = Axis(fig[1, 1])
        x = [4.0, 5.0, 6.0]
        sc = scatter!(ax, x, [1.0, 2.0, 3.0])
        cut(v) = Dict("layer" => "cutoff", "index" => 0, "payload" => v)
        pick = Dict("items" => Any[Dict("layer" => "pts", "index" => 1)])
        seen = Any[]
        w2 = masque(
            fig, (pts = interactables(sc; select = :many), cutoff = ThresholdInteractable(ax; value = 0.0));
            onchange = st -> (push!(seen, st); update!(sc, x, [1.0, 2.0, 3.0] .+ 10 * st.cutoff.value)),
        )
        Masque._sync_view_warmup!(w2.render_frame)
        w2.render_frame(_state_input(Dict("cutoff" => cut(2.0))))
        w2.render_frame(_state_input(Dict("pts" => pick, "cutoff" => cut(2.0))))
        @test only(last(seen).pts).y == 22.0
        # The `@bind` value agrees with the tooltip.
        @test only(Masque.bond_from_js(w2, Dict("pts" => pick, "cutoff" => cut(2.0))).pts).y == 22.0
        # The mount value is still the starting one.
        @test isempty(Masque.initial_bond(w2).pts)
    end

    @testset "a mark that exists only after onchange grew the plot can be picked" begin
        fig = Figure(size = (500, 300))
        ax = Axis(fig[1, 1])
        sc = scatter!(ax, 1.0:3.0, 1.0:3.0)
        thr = ThresholdInteractable(ax; value = 3.0, orientation = :vertical)
        seen = Any[]
        w = masque(
            fig, (pts = interactables(sc; select = :many), cutoff = thr);
            onchange = st -> (push!(seen, st); n = round(Int, st.cutoff.value); update!(sc, collect(1.0:n), collect(1.0:n))),
        )
        Masque._sync_view_warmup!(w.render_frame)
        cut(v) = Dict("layer" => "cutoff", "index" => 0, "payload" => v)
        grown = w.render_frame(_state_input(Dict("cutoff" => cut(5.0))))
        @test grown["clear"] == ["pts"]
        pick = Dict("items" => Any[Dict("layer" => "pts", "index" => 4)])
        r = w.render_frame(_state_input(Dict("pts" => pick, "cutoff" => cut(5.0))))
        @test !haskey(r, "error")
        @test only(last(seen).pts).index == 5
        @test only(Masque.bond_from_js(w, Dict("pts" => pick, "cutoff" => cut(5.0))).pts).index == 5
    end

    @testset "a hidden plot takes no hover or clicks and keeps its field" begin
        fig = Figure(size = (500, 300))
        ax = Axis(fig[1, 1])
        a = scatter!(ax, 1.0:3.0, 1.0:3.0)
        b = scatter!(ax, 1.0:3.0, 3.0:-1.0:1.0)
        thr = ThresholdInteractable(ax; value = 1.0)
        w = masque(
            fig, (a = interactables(a), b = interactables(b; select = :many), cutoff = thr);
            onchange = st -> update!(b; visible = st.cutoff.value < 2),
        )
        layer(m, id) = only(l for l in m["layers"] if l["id"] == id)
        @test !isempty(layer(w.manifest, "b")["events"])
        Masque._sync_view_warmup!(w.render_frame)
        cut(v) = Dict("layer" => "cutoff", "index" => 0, "payload" => v)
        pick = Dict("items" => Any[Dict("layer" => "b", "index" => 0)])
        r = w.render_frame(_state_input(Dict("b" => pick, "cutoff" => cut(2.5))))
        @test isempty(layer(r["manifest"], "b")["events"]) && layer(r["manifest"], "b")["hidden"] === true
        @test "b" in r["manifest"]["fields"]
        @test r["clear"] == ["b"]   # its picks go with it
        @test !isempty(layer(r["manifest"], "a")["events"])
        back = w.render_frame(_state_input(Dict("b" => Dict("items" => Any[]), "cutoff" => cut(1.0))))
        @test "click" in layer(back["manifest"], "b")["events"]
        # Without onchange a hidden plot is hidden the same way: nothing drawn takes the
        # pointer or the fade (#484).
        b.visible = false
        w2 = masque(fig, (b = interactables(b),))
        @test isempty(layer(w2.manifest, "b")["events"]) && layer(w2.manifest, "b")["hidden"] === true
        b.visible = true
    end

    @testset "a plot hidden from the start is hidden in the manifest (#484)" begin
        fig = Figure(size = (480, 320))
        ax = Axis(fig[1, 1])
        lines!(ax, 1:10, (1:10) .^ 0.5; label = "a", linewidth = 4)
        lines!(ax, 1:10, (1:10) .^ 0.7; label = "b", linewidth = 4, visible = false)
        axislegend(ax; position = :lt)
        m = masque(fig; bind = :legend).manifest
        ls = [l for l in m["layers"] if l["kind"] == "lines"]
        @test length(ls) == 2
        @test count(l -> get(l, "hidden", false) === true, ls) == 1
        @test all(l -> get(l, "hidden", false) !== true || isempty(l["events"]), ls)
        # A recipe with a hidden child of its own is still drawn.
        fig3 = Figure()
        ax3 = Axis3(fig3[1, 1])
        arrows3d!(ax3, Point3f[(1, 1, 1), (3, 2, 1)], Vec3f[(1, 0, 0), (0, 1, 0.5)])
        al = only(l for l in masque(fig3).manifest["layers"] if l["id"] == "arrows3d")
        @test get(al, "hidden", false) !== true && !isempty(al["events"])
    end

    @testset "the docs examples run as written" begin
        xs = Float64[1, 2, 3, 4, 5, 6, 7, 8]
        ys = Float64[1.2, 1.9, 3.2, 3.8, 5.1, 6.3, 6.8, 8.1]
        fig = Figure(size = (560, 320))
        ax = Axis(fig[1, 1]; xlabel = "x", ylabel = "y")
        sc = scatter!(ax, xs, ys; markersize = 14)
        fitline = lines!(ax, [1.0, 8.0], [1.0, 8.0]; color = :crimson)
        w = masque(
            fig, (pts = interactables(sc; select = :many),);
            onchange = state -> begin
                picked = [e.index for e in state.pts]
                if length(picked) >= 2
                    x, y = xs[picked], ys[picked]
                    # The straight line closest to the picked points
                    mx, my = sum(x) / length(x), sum(y) / length(y)
                    slope = sum((x .- mx) .* (y .- my)) / sum((x .- mx) .^ 2)
                    update!(fitline, [1.0, 8.0], my .+ slope .* ([1.0, 8.0] .- mx))
                end
            end,
        )
        Masque._sync_view_warmup!(w.render_frame)
        picks = Dict("items" => Any[Dict("layer" => "pts", "index" => k) for k in (0, 7)])
        w.render_frame(_state_input(Dict("pts" => picks)))
        fit = Point2f.(fitline[1][])
        @test fit[1] ≈ Point2f(1, 1.2) && fit[2] ≈ Point2f(8, 8.1)

        img = [sin(i / 6) * cos(j / 9) for i in 1:80, j in 1:120]
        fig2 = Figure(size = (640, 280))
        ax_img = Axis(fig2[1, 1]; aspect = DataAspect())
        heatmap!(ax_img, img; colormap = :grays)
        maskplot = heatmap!(ax_img, img .> 0.5; colormap = [(:red, 0), (:red, 0.5)])
        ax_hist = Axis(fig2[1, 2]; xlabel = "value")
        hist!(ax_hist, vec(img))
        cutoff = ThresholdInteractable(ax_hist; orientation = :vertical, value = 0.5)
        mask = masque(
            fig2, (cutoff = cutoff,); bind = :cutoff,
            onchange = state -> (maskplot[1] = img .> state.cutoff.value),
        )
        Masque._sync_view_warmup!(mask.render_frame)
        mask.render_frame(_state_input(Dict("cutoff" => Dict("layer" => "cutoff", "index" => 0, "payload" => 0.2))))
        @test maskplot[3][] == (img .> 0.2)   # the matrix, after Makie adds its x and y
    end
end
