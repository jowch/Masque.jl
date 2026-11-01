using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# A threshold with no `value` and a box with no `bounds` start in the middle of the axis
# limits as `masque` finds them (#513).
_layer(m, id) = only(l for l in m["layers"] if l["id"] == string(id))

@testset "threshold and box starts from the axis limits (#513)" begin
    @testset "a threshold starts halfway along its axis" begin
        (; fig, ax, ctx) = default_fixture()
        t = only(values(ctx.transforms))
        w = masque(fig, (h = ThresholdInteractable(ax), v = ThresholdInteractable(ax; orientation = :vertical)); auto = false)
        st = Masque.initial_bond(w)
        @test st.h.value ≈ sum(t.ylims) / 2
        @test st.v.value ≈ sum(t.xlims) / 2
        # The line is drawn mid-viewport.
        vx, vy, vw, vh = t.viewport
        @test _layer(w.manifest, :h)["geometry"]["pos"] ≈ vy + vh / 2 atol = 0.5
        @test _layer(w.manifest, :v)["geometry"]["pos"] ≈ vx + vw / 2 atol = 0.5
        # A value given still wins.
        w2 = masque(fig, (h = ThresholdInteractable(ax; value = 4.0),); auto = false)
        @test Masque.initial_bond(w2).h.value == 4.0
        # Passing `nothing` is the same as leaving it out.
        @test ThresholdInteractable(ax; value = nothing).value === nothing
    end

    @testset "on a log axis, the middle on screen" begin
        fig = Figure(size = (600, 400))
        ax = Axis(fig[1, 1]; yscale = log10)
        scatter!(ax, [1.0, 2.0, 3.0], [1.0, 100.0, 10_000.0])
        w = masque(fig, (h = ThresholdInteractable(ax), box = ROIInteractable(ax)); auto = false)
        _, _, ctx = ctx_for(fig)
        t = only(values(ctx.transforms))
        @test Masque.initial_bond(w).h.value ≈ sqrt(t.ylims[1] * t.ylims[2])
        b = Masque.initial_bond(w).box
        a, z = log10.(t.ylims)
        @test log10(b.ymin) ≈ a + (z - a) / 4
        @test log10(b.ymax) ≈ a + 3(z - a) / 4
        vx, vy, vw, vh = t.viewport
        @test _layer(w.manifest, :h)["geometry"]["pos"] ≈ vy + vh / 2 atol = 0.5
        g = _layer(w.manifest, :box)["geometry"]
        @test g["y"] ≈ vy + vh / 4 atol = 0.5
        @test g["h"] ≈ vh / 2 atol = 0.5
    end

    @testset "on a categorical axis, the middle category" begin
        fig = Figure(size = (600, 400))
        ax = Axis(fig[1, 1]; dim1_conversion = Makie.CategoricalConversion())
        scatter!(ax, ["a", "b", "c", "d", "e"], 1.0:5.0)
        w = masque(fig, (v = ThresholdInteractable(ax; orientation = :vertical),); auto = false)
        ev = Masque.initial_bond(w).v
        @test ev.value == 3.0
        @test ev.category == "c"
        fig4 = Figure(size = (600, 400))
        ax4 = Axis(fig4[1, 1]; dim1_conversion = Makie.CategoricalConversion())
        scatter!(ax4, ["a", "b", "c", "d"], 1.0:4.0)
        ev4 = Masque.initial_bond(masque(fig4, (v = ThresholdInteractable(ax4; orientation = :vertical),); auto = false)).v
        @test ev4.value == 2.0 && ev4.category == "b"
        # Zoomed to categories 6–9 of 10, it starts on one in view, not on the 5th.
        figz = Figure(size = (600, 400))
        axz = Axis(figz[1, 1]; dim1_conversion = Makie.CategoricalConversion())
        scatter!(axz, string.('a':'j'), 1.0:10.0)
        xlims!(axz, "f", "i")
        evz = Masque.initial_bond(masque(figz, (v = ThresholdInteractable(axz; orientation = :vertical),); auto = false)).v
        @test evz.value == 7.0 && evz.category == "g"
        @test Masque._middle_category((5.5, 9.5), 10) == 7
        @test Masque._middle_category((9.5, 5.5), 10) == 7     # a reversed axis
        @test Masque._middle_category((2.6, 2.9), 10) == 3     # no category in view
    end

    @testset "a box starts as the middle half of the limits" begin
        (; fig, ax, ctx) = default_fixture()
        t = only(values(ctx.transforms))
        sc = only(ax.scene.plots)
        w = masque(fig, (pts = interactables(sc), box = ROIInteractable(ax; selects = sc)); auto = false)
        b = Masque.initial_bond(w).box
        (x0, x1), (y0, y1) = t.xlims, t.ylims
        @test (b.xmin, b.xmax) == (x0 + (x1 - x0) / 4, x0 + 3(x1 - x0) / 4)
        @test (b.ymin, b.ymax) == (y0 + (y1 - y0) / 4, y0 + 3(y1 - y0) / 4)
        # The brushed field starts at what the box holds: the middle point (2, 4).
        @test [e.index for e in Masque.initial_bond(w).pts] == [2]
        @test ROIInteractable(ax).bounds === nothing
        # Bounds given still win.
        w2 = masque(fig, (box = ROIInteractable(ax; bounds = (1.0, 2.0, 1.0, 2.0)),); auto = false)
        b2 = Masque.initial_bond(w2).box
        @test (b2.xmin, b2.xmax, b2.ymin, b2.ymax) == (1.0, 2.0, 1.0, 2.0)
    end

    @testset "build_manifest sets the start too" begin
        (; ax, ctx) = default_fixture()
        t = only(values(ctx.transforms))
        m = build_manifest([ThresholdInteractable(ax), ROIInteractable(ax)], ctx)
        @test haskey(_layer(m, :threshold)["geometry"], "pos")
        @test _layer(m, :roi)["geometry"]["w"] ≈ t.viewport[3] / 2 atol = 0.5
    end

    @testset "refused axes still say why" begin
        fig = Figure()
        ax3 = Axis3(fig[1, 1]); scatter!(ax3, [1.0, 2.0], [1.0, 2.0], [1.0, 2.0])
        @test_throws "undefined on an Axis3" masque(fig, (t = ThresholdInteractable(ax3),); auto = false)
        @test_throws "undefined on an Axis3" masque(fig, (b = ROIInteractable(ax3),); auto = false)
        fc = Figure()
        axc = Axis(fc[1, 1]); hm = heatmap!(axc, rand(3, 3)); cb = Colorbar(fc[1, 2], hm)
        @test_throws "ax is a Colorbar" masque(fc, (t = ThresholdInteractable(cb),); auto = false)
        fk = Figure(); axk = Axis(fk[1, 1]; dim1_conversion = Makie.CategoricalConversion())
        scatter!(axk, ["a", "b"], [1.0, 2.0])
        @test_throws "bounds need continuous axes" masque(fk, (b = ROIInteractable(axk),); auto = false)
    end

    @testset "the start is set once: a pan leaves the line where it was" begin
        fig = Figure(size = (600, 400))
        ax = Axis(fig[1, 1])
        scatter!(ax, [0.0, 10.0], [0.0, 10.0])
        w = masque(fig, (t = ThresholdInteractable(ax), view = ViewInteractable(ax)); auto = false)
        v0 = Masque.initial_bond(w).t.value
        Masque._sync_view_warmup!(w.render_frame)
        pan = Dict{String, Any}("id" => "view", "xmin" => 0.0, "xmax" => 10.0, "ymin" => v0, "ymax" => v0 + 20.0, "settle" => true)
        f = w.render_frame(pan)
        # v0 is now the bottom of the y range: the line sits on the viewport's lower edge.
        vx, vy, vw, vh = f["manifest"]["transforms"][_layer(f["manifest"], :t)["axis"]]["viewport"]
        @test _layer(f["manifest"], :t)["geometry"]["pos"] ≈ vy + vh atol = 0.5
    end

    @testset "with onchange, the start is the one onchange first saw" begin
        fig = Figure(size = (600, 400))
        ax = Axis(fig[1, 1])
        sc = scatter!(ax, [0.0, 10.0], [0.0, 10.0])
        seen = Float64[]
        # onchange moves the data, so the limits after it are not the ones the start came from.
        w = masque(
            fig, (t = ThresholdInteractable(ax),); auto = false,
            onchange = st -> (push!(seen, st.t.value); update!(sc, [0.0, 10.0], [100.0, 200.0])),
        )
        @test only(seen) ≈ 5.0 atol = 1.0
        @test Masque.initial_bond(w).t.value == only(seen)
        # A rebuilt plan keeps it too.
        p = Masque._Plan(Masque.AbstractInteractable[ThresholdInteractable(ax; id = :t)], Masque._Binding())
        pinned = Masque._carry_starts(p.ints, [ThresholdInteractable(ax; value = 7.0, id = :t)])
        @test only(pinned).value == 7.0
    end
end
