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
end
