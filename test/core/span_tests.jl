using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

_span_input(state; settle = true) = Dict{String, Any}("onchange" => true, "state" => state, "settle" => settle)
_span_wire(id, lo, hi) = Dict{String, Any}("layer" => id, "index" => 0, "payload" => Dict("lo" => lo, "hi" => hi))

# SpanInteractable (#500): a band between two draggable edges, on an axis or a colorbar.
@testset "SpanInteractable (#500)" begin
    @testset "an x or y window on an axis" begin
        (; ax, ctx) = default_fixture()
        sp = SpanInteractable(ax; span = (2.0, 5.0))
        @test sp.orientation === :vertical && sp.id === :span
        @test events(sp) == (:drag,)
        @test validate(sp, ctx) === nothing
        L = only(hitlayers(sp, ctx))
        @test L.kind === :span
        t = ctx.transforms[L.axis]
        @test L.geometry["orientation"] == "v"
        @test L.geometry["lo"] ≈ data_to_image_px(ctx, ax, (2.0, t.ylims[1]))[1]
        @test L.geometry["hi"] ≈ data_to_image_px(ctx, ax, (5.0, t.ylims[1]))[1]
        @test L.geometry["span"] ≈ [t.viewport[2], t.viewport[2] + t.viewport[4]]
        @test !haskey(L.geometry, "settleOnly")
        Lh = only(hitlayers(SpanInteractable(ax; span = (1.0, 3.0), orientation = :horizontal), ctx))
        @test Lh.geometry["orientation"] == "h"
        @test Lh.geometry["lo"] ≈ data_to_image_px(ctx, ax, (t.xlims[1], 1.0))[2]
        @test Lh.geometry["hi"] < Lh.geometry["lo"]   # a larger y sits higher
        @test Lh.geometry["span"] ≈ [t.viewport[1], t.viewport[1] + t.viewport[3]]
        @test only(hitlayers(SpanInteractable(ax; span = (1, 2), update_while_dragging = false), ctx)).geometry["settleOnly"] === true

        # The band is checked where it is written.
        @test_throws "need lo < hi" SpanInteractable(ax; span = (5.0, 2.0))
        @test_throws "need lo < hi" SpanInteractable(ax; span = (2.0, 2.0))
        @test_throws "orientation must be" SpanInteractable(ax; span = (1, 2), orientation = :diagonal)
        @test_throws "span must be (lo, hi)" SpanInteractable(ax; span = 3.0)
        @test_throws "span must be (lo, hi)" SpanInteractable(ax; span = (1, 2, 3))
        @test SpanInteractable(ax; span = [1, 2]).hi == 2.0
        @test SpanInteractable(ax; span = SpanEvent(:old, 1.5, 4.0)).lo == 1.5
    end

    @testset "refusals: Axis3, PolarAxis, a scale the browser can't invert, categories, a Legend" begin
        f3 = Figure(); a3 = Axis3(f3[1, 1]); scatter!(a3, [1.0, 2.0], [1.0, 2.0], [1.0, 2.0])
        _, _, c3 = ctx_for(f3)
        @test occursin("Axis3", validate(SpanInteractable(a3; span = (1, 2)), c3))
        fp = Figure(); ap = PolarAxis(fp[1, 1]); lines!(ap, [0.0, 1.0], [1.0, 2.0])
        _, _, cp = ctx_for(fp)
        @test occursin("PolarAxis", validate(SpanInteractable(ap; span = (0.1, 0.5)), cp))
        fs = Figure(); as = Axis(fs[1, 1]; xscale = sqrt); scatter!(as, [1.0, 4.0], [1.0, 2.0])
        _, _, cs = ctx_for(fs)
        @test occursin("invertible x-scale", validate(SpanInteractable(as; span = (1, 2)), cs))
        @test validate(SpanInteractable(as; span = (1, 2), orientation = :horizontal), cs) === nothing
        fc = Figure(); ac = Axis(fc[1, 1]); barplot!(ac, Categorical(["a", "b", "c"]), [1, 2, 3])
        _, _, cc = ctx_for(fc)
        msg = validate(SpanInteractable(ac; span = (1, 2)), cc)
        @test msg isa String && occursin("categorical", msg) && occursin("ThresholdInteractable", msg)
        fl = Figure(); al = Axis(fl[1, 1]); lines!(al, 1:3, 1:3; label = "a"); leg = axislegend(al)
        _, _, cl = ctx_for(fl)
        @test occursin("Legend", validate(SpanInteractable(leg; span = (1, 2), orientation = :vertical), cl))
        @test_throws ArgumentError masque(f3, SpanInteractable(a3; span = (1, 2)))
    end

    @testset "a band of a colorbar's colors" begin
        fig = Figure(); ax = Axis(fig[1, 1]); hm = heatmap!(ax, reshape(collect(1.0:12.0), 4, 3))
        cb = Colorbar(fig[1, 2], hm)
        figh = Figure(); axh = Axis(figh[1, 1]); hmh = heatmap!(axh, reshape(collect(1.0:12.0), 4, 3))
        cbh = Colorbar(figh[2, 1], hmh; vertical = false)
        # The edges run across the bar unless told otherwise.
        @test SpanInteractable(cb; span = (3, 6)).orientation === :horizontal
        @test SpanInteractable(cbh; span = (3, 6)).orientation === :vertical
        Makie.update_state_before_display!(fig); Makie.update_state_before_display!(figh)
        _, _, ctx = ctx_for(fig); _, _, ctxh = ctx_for(figh)
        sp = SpanInteractable(cb; span = (3.0, 6.0), id = :band)
        @test validate(sp, ctx) === nothing
        L = only(hitlayers(sp, ctx)); t = ctx.transforms[L.axis]
        vx, vy, vw, vh = t.viewport; lo, hi = t.ylims
        @test L.axis == Masque.axis_id(ctx, cb)
        @test L.geometry["lo"] ≈ vy + (1 - (3.0 - lo) / (hi - lo)) * vh
        @test L.geometry["hi"] ≈ vy + (1 - (6.0 - lo) / (hi - lo)) * vh
        @test L.geometry["span"] ≈ [vx, vx + vw]
        Lh = only(hitlayers(SpanInteractable(cbh; span = (3.0, 6.0)), ctxh))
        @test Lh.geometry["orientation"] == "v" && Lh.geometry["lo"] < Lh.geometry["hi"]
        # Along the bar, or off it, is refused with what to do instead.
        msg = validate(SpanInteractable(cb; span = (3, 6), orientation = :vertical), ctx)
        @test occursin("SpanInteractable: a vertical colorbar takes a horizontal line", msg)
        err = (@test_throws ArgumentError SpanInteractable(cb; span = (3.0, 99.0))).value
        @test occursin("SpanInteractable: span = 99.0 is outside the colorbar's limits", err.msg)
        # The browser's value is not held to the bar: a redraw puts an edge at its end instead.
        @test only(hitlayers(SpanInteractable(cb, :horizontal, 3.0, 99.0, :band, true), ctx)).geometry["hi"] ≈ vy
        # On a whole figure the colorbar keeps its own click field next to the band's.
        w = masque(fig, (band = SpanInteractable(cb; span = (3.0, 6.0)),))
        @test any(l -> l["kind"] == "axis" && l["id"] == "colorbar", w.manifest["layers"])
        @test w.manifest["initial"]["band"]["payload"] == Dict("lo" => 3.0, "hi" => 6.0)
    end

    @testset "the bind value is a SpanEvent" begin
        fig = Figure(); ax = Axis(fig[1, 1]); scatter!(ax, 1:5, 1:5)
        sp = SpanInteractable(ax; span = (2.0, 4.0))
        @test bondtype(sp) === SpanEvent
        w = masque(fig, sp)
        L = only(l for l in w.manifest["layers"] if l["kind"] == "span")
        @test L["bond"] == "span" && L["events"] == ["drag"] && isempty(L["payloads"])
        @test "span" in w.manifest["fields"]
        @test w.manifest["initial"]["span"]["payload"] == Dict("lo" => 2.0, "hi" => 4.0)
        # The browser sends (lo, hi); the event sorts them, so a band dragged flat still reads.
        ev = Masque.event_from_stamp(L, nothing, Dict("lo" => 3.5, "hi" => 1.25))
        @test ev == SpanEvent(:span, 1.25, 3.5)
        @test sprint(show, ev) == "SpanEvent(:span, lo = 1.25, hi = 3.5)"
        @test_throws "missing `hi`" Masque.event_from_stamp(L, nothing, Dict("lo" => 1.0))
        # A FunctionInteractable that returns a :span layer reads the same payload.
        @test Masque.kind_bond_stamp(:span) == "span"
        @test transform_bond(SpanEvent, nothing, HitLayer(:mine, :span, nothing, Any[], :ax, (:drag,)), nothing, Dict("lo" => 1, "hi" => 2)) ==
            SpanEvent(:mine, 1.0, 2.0)
        # Named, it keeps its name.
        wn = masque(fig, (window = sp,))
        @test wn.manifest["initial"]["window"]["layer"] == "window"
    end

    @testset "onchange redraws the band where the browser has it" begin
        fig = Figure(size = (500, 300)); ax = Axis(fig[1, 1]; limits = (0, 10, 0, 1))
        x = collect(0.0:0.5:10.0); sc = scatter!(ax, x, fill(0.5, length(x)))
        seen = Any[]
        w = masque(fig, (win = SpanInteractable(ax; span = (2.0, 4.0)),); onchange = st -> push!(seen, st.win))
        @test only(seen) == SpanEvent(:win, 2.0, 4.0)
        Masque._sync_view_warmup!(w.render_frame)
        r = w.render_frame(_span_input(Dict("win" => _span_wire("win", 5.0, 8.0))))
        @test haskey(r, "png") && last(seen) == SpanEvent(:win, 5.0, 8.0)
        g = only(l for l in r["manifest"]["layers"] if l["id"] == "win")["geometry"]
        t = w.manifest["transforms"][only(l for l in w.manifest["layers"] if l["id"] == "win")["axis"]]
        vx, _, vw, _ = t["viewport"]
        @test g["lo"] ≈ vx + 0.5 * vw atol = 0.5
        @test g["hi"] ≈ vx + 0.8 * vw atol = 0.5
        # Two edges dragged together reach onchange as an empty band.
        w.render_frame(_span_input(Dict("win" => _span_wire("win", 6.0, 6.0))))
        @test last(seen) == SpanEvent(:win, 6.0, 6.0)
        # A colorbar band whose limits move under it waits at the end of the bar.
        z = reshape(collect(1.0:12.0), 4, 3)
        f2 = Figure(size = (500, 300)); a2 = Axis(f2[1, 1])
        data = Observable(copy(z)); hm = heatmap!(a2, data); cb = Colorbar(f2[1, 2], hm)
        w2 = masque(f2, (band = SpanInteractable(cb; span = (3.0, 9.0)),); onchange = st -> (data[] = min.(z, 8.0)))
        Masque._sync_view_warmup!(w2.render_frame)
        r2 = w2.render_frame(_span_input(Dict("band" => _span_wire("band", 3.0, 11.0))))
        t2 = w2.manifest["transforms"][only(l for l in w2.manifest["layers"] if l["id"] == "band")["axis"]]
        @test only(l for l in r2["manifest"]["layers"] if l["id"] == "band")["geometry"]["hi"] ≈ t2["viewport"][2]
    end
end
