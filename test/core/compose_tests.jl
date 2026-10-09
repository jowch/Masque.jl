using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# A recipe with its own layers: `masque(fig)` must use this method instead of walking the
# scatter the recipe draws. Types can't be defined inside a testset.
Makie.@recipe ComposeDots (positions,) begin
end
function Makie.plot!(p::ComposeDots)
    scatter!(p, p.positions)
    return p
end
const COMPOSEDOTS_BUILDS = Ref(0)
function Masque.interactables(ax, p::ComposeDots; id = :composedots, kwargs...)
    COMPOSEDOTS_BUILDS[] += 1
    return AbstractInteractable[PointInteractable(ax, p.positions[]; id, payloads = ["dot $k" for k in eachindex(p.positions[])], kwargs...)]
end

# #270: the natural first attempt at a recipe's method, with no keywords; one with two layers,
# the second a brush aimed at the first; one that takes `id` but no other keyword; and one
# whose body raises a MethodError of its own.
Makie.@recipe NoKwDots (positions,) begin
end
Makie.plot!(p::NoKwDots) = (scatter!(p, p.positions); p)
Masque.interactables(ax, p::NoKwDots) = AbstractInteractable[PointInteractable(ax, p.positions[])]
Makie.@recipe BrushedDots (positions,) begin
end
Makie.plot!(p::BrushedDots) = (scatter!(p, p.positions); p)
Masque.interactables(ax, p::BrushedDots) = AbstractInteractable[
    PointInteractable(ax, p.positions[]), ROIInteractable(ax; bounds = (0.0, 1.0, 0.0, 1.0), selects = :points),
]
Makie.@recipe IdOnlyDots (positions,) begin
end
Makie.plot!(p::IdOnlyDots) = (scatter!(p, p.positions); p)
Masque.interactables(ax, p::IdOnlyDots; id) = AbstractInteractable[PointInteractable(ax, p.positions[]; id)]
Makie.@recipe BrokenDots (positions,) begin
end
Makie.plot!(p::BrokenDots) = (scatter!(p, p.positions); p)
Masque.interactables(ax, p::BrokenDots; id, kwargs...) = AbstractInteractable[PointInteractable(ax, p.positions[], "not a keyword")]

ids(xs) = [i.id for i in xs]
assemble(fig, xs...; auto = true) = Masque._assemble(fig, xs; auto)

@testset "Composing interactables" begin
    xs = [1.0, 2.0, 3.0]
    ys = [1.0, 4.0, 9.0]

    @testset "no arguments: the defaults" begin
        f = Figure(); ax = Axis(f[1, 1])
        lines!(ax, xs, ys); scatter!(ax, xs, ys); scatter!(ax, xs, ys .+ 1)
        # Ids follow drawing order; the list is topmost first.
        @test ids(assemble(f)) == ids(interactables(f)) == [:scatter_2, :scatter, :lines]
    end

    @testset "an interactable with a new id is added after the defaults" begin
        f = Figure(); ax = Axis(f[1, 1])
        scatter!(ax, xs, ys)
        @test ids(assemble(f, ViewInteractable(ax))) == [:scatter, :view]
        @test ids(assemble(f, [ViewInteractable(ax), ThresholdInteractable(ax; value = 2.0)])) ==
            [:scatter, :view, :threshold]
    end

    @testset "interactables(plot) replaces that plot's default in place" begin
        f = Figure(); ax = Axis(f[1, 1])
        lines!(ax, xs, ys); scatter!(ax, xs, ys); s2 = scatter!(ax, xs, ys .+ 1)
        tip = masque"y = {y}"
        out = assemble(f, interactables(s2; tooltip = tip))
        @test ids(out) == [:scatter_2, :scatter, :lines]
        @test out[1] isa PointInteractable && out[1].tooltip === tip
        @test out[2].tooltip === nothing
        # The argument order does not move it: it keeps the default's position.
        out = assemble(f, ViewInteractable(ax), interactables(s2; tooltip = tip))
        @test ids(out) == [:scatter_2, :scatter, :lines, :view]
    end

    @testset "an explicit id renames the replacement" begin
        f = Figure(); ax = Axis(f[1, 1])
        lines!(ax, xs, ys); s = scatter!(ax, xs, ys)
        @test ids(assemble(f, interactables(s; id = :picks))) == [:picks, :lines]
    end

    @testset "a two-layer plot is replaced as a whole" begin
        f = Figure(); ax = Axis(f[1, 1])
        st = stem!(ax, xs, ys)
        @test ids(assemble(f)) == [:stem, :stem_stems]
        out = assemble(f, interactables(st; label = "stems"))
        @test ids(out) == [:stem, :stem_stems]
        @test all(i -> i.label == "stems", out)
        @test_throws ArgumentError assemble(f, interactables(st; payloads = ["a", "b", "c"]))
    end

    @testset "an interactable with a default's id replaces it" begin
        f = Figure(); ax = Axis(f[1, 1])
        scatter!(ax, xs, ys); lines!(ax, xs, ys)
        out = assemble(f, PointInteractable(ax, collect(zip(xs, ys)); id = :scatter, payloads = ["a", "b", "c"]))
        @test ids(out) == [:lines, :scatter]
        @test out[2].payloads == ["a", "b", "c"]
        # So an edited copy of the defaults is a valid call, as the old explicit form was.
        @test ids(assemble(f, interactables(f), ViewInteractable(ax))) == [:lines, :scatter, :view]
    end

    @testset "two layers with one id you chose are refused" begin
        f = Figure(); ax = Axis(f[1, 1])
        scatter!(ax, xs, ys)
        @test_throws ArgumentError assemble(f, ViewInteractable(ax; id = :pan), ViewInteractable(ax; id = :pan))
    end

    @testset "a repeated built-in id is numbered (#287)" begin
        f = Figure(); ax1 = Axis(f[1, 1]); ax2 = Axis(f[1, 2])
        scatter!(ax1, xs, ys); scatter!(ax2, xs, ys)
        out = assemble(f, ViewInteractable(ax1), ViewInteractable(ax2))
        @test ids(out) == [:scatter, :scatter_2, :view, :view_2]
        @test out[3].ax === ax1 && out[4].ax === ax2
        @test ids(assemble(f, AxisInteractable(ax1), AxisInteractable(ax2), AxisInteractable(ax1); auto = false)) ==
            [:axis, :axis_2, :axis_3]
        # Every kind with a fixed default, and the rest of each interactable is kept.
        t = assemble(
            f, ThresholdInteractable(ax1; value = 1.0), ThresholdInteractable(ax2; value = 2.0, orientation = :vertical),
            ROIInteractable(ax1; bounds = (0, 1, 0, 1)), ROIInteractable(ax2; bounds = (0, 2, 0, 2), selects = :scatter);
            auto = false,
        )
        @test ids(t) == [:threshold, :threshold_2, :roi, :roi_2]
        @test t[2].value == 2.0 && t[2].orientation === :vertical && t[2].ax === ax2
        @test t[4].bounds == (0.0, 2.0, 0.0, 2.0) && t[4].selects === :scatter
        pts = collect(zip(xs, ys))
        @test ids(assemble(f, PointInteractable(ax1, pts), PointInteractable(ax2, pts; payloads = ["a", "b", "c"]); auto = false)) ==
            [:points, :points_2]
        # `id = :view` is the built-in name, so it is numbered like the default. An id you
        # chose keeps its name, so a built-in id that meets it moves.
        @test ids(assemble(f, ViewInteractable(ax1), ViewInteractable(ax2; id = :view); auto = false)) == [:view, :view_2]
        @test ids(assemble(f, ViewInteractable(ax1), ViewInteractable(ax2), ViewInteractable(ax2; id = :view_2); auto = false)) ==
            [:view, :view_3, :view_2]
        # A lone built-in id is not moved by a chosen id that extends it.
        @test ids(assemble(f, ViewInteractable(ax1), AxisInteractable(ax1; id = :view_readout); auto = false)) ==
            [:view, :view_readout]
    end

    @testset "numbered built-in ids replace the defaults they name (#287)" begin
        f = Figure()
        _, hm1 = heatmap(f[1, 1], rand(3, 3)); cb1 = Colorbar(f[1, 2], hm1)
        _, hm2 = heatmap(f[2, 1], rand(3, 3)); cb2 = Colorbar(f[2, 2], hm2)
        out = assemble(f, ColorbarInteractable(cb1), ColorbarInteractable(cb2))
        @test ids(out) == [:cells, :cells_2, :colorbar, :colorbar_2]
        @test out[3].cb === cb1 && out[4].cb === cb2
        lf = Figure(); lax = Axis(lf[1, 1])
        lines!(lax, xs, ys; label = "a")
        l1 = axislegend(lax); l2 = Legend(lf[1, 2], lax)
        lout = assemble(lf, LegendInteractable(l1), LegendInteractable(l2))
        @test ids(lout) == [:lines, :legend, :legend_2]
        @test lout[2].leg === l1 && lout[3].leg === l2
        @test lout[3].targets == [[:lines]]
    end

    @testset "every constructor's default id is a built-in id (#287)" begin
        # Read each constructor's `id = :name` default from the source, so a new constructor
        # can't leave its default out of `_BUILTIN_IDS`.
        found = Set{Symbol}()
        walk(x) = nothing
        function walk(ex::Expr)
            if ex.head === :kw && ex.args[1] === :id && ex.args[2] isa QuoteNode
                push!(found, ex.args[2].value)
            end
            foreach(walk, ex.args)
            return nothing
        end
        function defs(ex)
            ex isa Expr || return
            if ex.head in (:function, :(=)) && ex.args[1] isa Expr
                sig = ex.args[1]
                while sig isa Expr && sig.head === :where
                    sig = sig.args[1]
                end
                if sig isa Expr && sig.head === :call
                    name = sig.args[1]
                    name isa Symbol && occursin(r"interactable"i, string(name)) && walk(sig)
                end
            end
            foreach(defs, ex.args)
            return
        end
        for file in ("interactables.jl", "introspect.jl")
            defs(Meta.parseall(read(joinpath(pkgdir(Masque), "src", file), String)))
        end
        @test :view in found && :scatter in found && :points in found
        @test found == Masque._BUILTIN_IDS
    end

    @testset "auto = false keeps only the arguments" begin
        f = Figure(); ax = Axis(f[1, 1])
        lines!(ax, xs, ys); s1 = scatter!(ax, xs, ys); s2 = scatter!(ax, xs, ys .+ 1)
        @test ids(assemble(f, ViewInteractable(ax); auto = false)) == [:view]
        # Without defaults, a plot's layers take the first free id from their kind.
        @test ids(assemble(f, interactables(s2), interactables(s1); auto = false)) == [:scatter, :scatter_2]
        @test ids(assemble(f, PointInteractable(ax, collect(zip(xs, ys)); id = :scatter), interactables(s1); auto = false)) ==
            [:scatter, :scatter_2]
        @test isempty(assemble(f; auto = false))
    end

    @testset "legends link to the layers of the call" begin
        f = Figure(); ax = Axis(f[1, 1])
        l = lines!(ax, xs, ys; label = "a")
        scatter!(ax, xs, ys; label = "b")
        leg = axislegend(ax)
        legend_of(out) = only(filter(i -> i isa LegendInteractable, out))
        @test legend_of(assemble(f)).targets == [[:lines], [:scatter]]
        @test legend_of(assemble(f, interactables(l; id = :curve))).targets == [[:curve], [:scatter]]
        out = assemble(f, interactables(l), LegendInteractable(leg); auto = false)
        @test legend_of(out).targets == [[:lines], Symbol[]]
        # Explicit targets are left as given.
        out = assemble(f, LegendInteractable(leg; targets = Dict("a" => :scatter)))
        @test legend_of(out).targets == [[:scatter], Symbol[]]
    end

    @testset "interactables(ax) is that axis's part of the defaults" begin
        f = Figure(); ax1 = Axis(f[1, 1]); ax2 = Axis(f[1, 2])
        scatter!(ax1, xs, ys); scatter!(ax2, xs, ys); lines!(ax2, xs, ys)
        @test ids(interactables(ax2)) == [:lines, :scatter_2]
        @test ids(assemble(f, interactables(ax2); auto = false)) == [:lines, :scatter_2]
    end

    @testset "a recipe's own method" begin
        f = Figure(); ax = Axis(f[1, 1])
        d = composedots!(ax, [Point2f(1, 1), Point2f(2, 2)])
        composedots!(ax, [Point2f(3, 3)])
        out = interactables(f)
        @test ids(out) == [:composedots_2, :composedots]
        @test out[2].payloads == ["dot 1", "dot 2"]
        out = assemble(f, interactables(d; tooltip = false))
        @test ids(out) == [:composedots_2, :composedots]
        @test out[2].tooltip === false
        # A fresh id is picked before the method runs, so each request builds once.
        COMPOSEDOTS_BUILDS[] = 0
        e = composedots!(ax, [Point2f(4, 4)])
        @test ids(assemble(f, interactables(d), interactables(e); auto = false)) == [:composedots, :composedots_2]
        @test COMPOSEDOTS_BUILDS[] == 2
    end

    @testset "fresh ids skip a taken id and the layers that extend it" begin
        f = Figure(); ax = Axis(f[1, 1])
        st1 = stem!(ax, xs, ys); st2 = stem!(ax, xs, ys .+ 1)
        @test ids(assemble(f, interactables(st1), interactables(st2); auto = false)) ==
            [:stem, :stem_stems, :stem_2, :stem_2_stems]
        @test ids(assemble(f, PointInteractable(ax, collect(zip(xs, ys)); id = :stem_stems), interactables(st1); auto = false)) ==
            [:stem_stems, :stem_2, :stem_2_stems]
    end

    @testset "interactables(boxplot) passes the box keywords through" begin
        f = Figure(); ax = Axis(f[1, 1])
        b = boxplot!(ax, repeat(1:2, 10), randn(20))
        out = assemble(f, interactables(b; clamp_to_viewport = true))
        @test only(out) isa RectInteractable && only(out).clamp_to_viewport
    end

    @testset "errors point at the call" begin
        f = Figure(); ax = Axis(f[1, 1])
        s = scatter!(ax, xs, ys)
        other = Figure(); oax = Axis(other[1, 1]); os = scatter!(oax, xs, ys)
        @test_throws ArgumentError assemble(f, interactables(os))
        # A recipe with no default and no method of its own fails at the caller's line.
        m = mesh!(Axis(Figure()[1, 1]), [Point2f(0, 0), Point2f(1, 0), Point2f(0, 1)], [1 2 3])
        @test_throws ArgumentError interactables(m)
        @test_throws ArgumentError assemble(f, s)
        @test_throws ArgumentError assemble(f, 1)
        # A request reaches build_manifest only through masque, which builds it.
        _, _, c = ctx_for(f)
        @test_throws ArgumentError Masque.build_manifest(interactables(s), c)
    end

    @testset "interactables(i) is [i]" begin
        f = Figure(); ax = Axis(f[1, 1])
        v = ViewInteractable(ax)
        @test interactables(v) == [v]
    end

    @testset "auto_interactables is removed (#299)" begin
        @test !isdefined(Masque, :auto_interactables)
    end

    @testset "masque builds the assembled set" begin
        f = Figure(); ax = Axis(f[1, 1])
        lines!(ax, xs, ys); s = scatter!(ax, xs, ys)
        w = masque(f, interactables(s; payloads = ["a", "b", "c"]), ViewInteractable(ax))
        @test [L["id"] for L in w.manifest["layers"]] == ["scatter", "lines", "view"]
        w = masque(f, ViewInteractable(ax); auto = false)
        @test [L["id"] for L in w.manifest["layers"]] == ["view"]
        # No defaults asked for, so an empty overlay is not a failed walk.
        w = @test_logs masque(f; auto = false)
        @test isempty(w.manifest["layers"])
        w = masque(f; selected = Dict(:scatter => [2]))
        @test only(filter(L -> L["id"] == "scatter", w.manifest["layers"]))["selected"] == [1]
    end

    @testset "a scatter sized in data units doesn't stop the widget (#291)" begin
        # The reporter's figure: a near-transparent square over each heatmap cell.
        f = Figure(); ax = Axis(f[1, 1]; aspect = DataAspect())
        heatmap!(ax, 1:10, 1:10, rand(10, 10))
        sc = scatter!(
            ax, vec([Point2f(i, j) for i in 1:10, j in 1:10]);
            marker = Rect, markersize = 1, markerspace = :data, color = (:white, 0.01),
        )
        w = @test_logs masque(f, interactables(sc; payloads = [(i = k,) for k in 1:100], tooltip = masque"cell $(i)"))
        L = only(filter(L -> L["id"] == "scatter", w.manifest["layers"]))
        @test L["kind"] == "polygons" && length(L["payloads"]) == 100
        @test [L["id"] for L in w.manifest["layers"]] == ["scatter", "cells"]
        # `radius` still gives pixel circles, with defaults on or off.
        @test only(filter(L -> L["id"] == "scatter", masque(f, interactables(sc; radius = 5)).manifest["layers"]))["kind"] == "circles"
        @test only(masque(f, interactables(sc; radius = 5); auto = false).manifest["layers"])["kind"] == "circles"

        # A plot Masque can't build is skipped with a warning, and the rest still responds.
        # An Axis3 scatter in data units has no pixel radius to derive.
        f = Figure(); ax = Axis3(f[1, 1])
        sc = scatter!(ax, [1.0, 2.0], [1.0, 2.0], [1.0, 2.0]; markerspace = :data, markersize = 0.3)
        lines!(ax, [1.0, 2.0], [2.0, 1.0], [1.0, 1.0])
        built = @test_logs (:warn, r"skipping scatter;") match_mode = :any assemble(f)
        @test ids(built) == [:lines]
        # Replaced by the caller: no warning, and the replacement is built.
        built = @test_logs assemble(f, interactables(sc; radius = 5))
        @test sort(ids(built)) == [:lines, :scatter]
    end

    @testset "a recipe method need not take `id` (#270)" begin
        pts = Point2f[(1, 1), (2, 4)]
        # Without keywords: `masque` names the layer after the plot, numbering the second.
        f = Figure(); ax = Axis(f[1, 1])
        nokwdots!(ax, pts); nokwdots!(ax, pts)
        @test ids(assemble(f)) == [:nokwdots_2, :nokwdots]   # the plot drawn last comes first
        @test [L["id"] for L in masque(f).manifest["layers"]] == ["nokwdots_2", "nokwdots"]
        # The other layers add their own name, and a brush follows its target's new name.
        f = Figure(); ax = Axis(f[1, 1])
        brusheddots!(ax, pts)
        built = assemble(f)
        @test ids(built) == [:brusheddots, :brusheddots_roi]
        @test Masque.selects(built[2]) === :brusheddots
        # `id` through `interactables(plot; id)` names it too.
        f = Figure(); ax = Axis(f[1, 1])
        p = nokwdots!(ax, pts)
        @test ids(assemble(f, interactables(p; id = :mine))) == [:mine]
        # A caller's keyword the method does not take is named, with the fix.
        err = (@test_throws ArgumentError assemble(f, interactables(p; tooltip = false))).value
        @test occursin("NoKwDots", err.msg) && occursin("`tooltip`", err.msg) &&
            occursin("; kwargs...", err.msg)
        f = Figure(); ax = Axis(f[1, 1])
        p = idonlydots!(ax, pts)
        @test ids(assemble(f)) == [:idonlydots]
        err = (@test_throws ArgumentError assemble(f, interactables(p; tooltip = false))).value
        @test occursin("IdOnlyDots", err.msg) && occursin("`tooltip`", err.msg) && !occursin("`id`", err.msg)
        # A MethodError from inside the method's own body is the user's, and passes through.
        f = Figure(); ax = Axis(f[1, 1])
        brokendots!(ax, pts)
        @test_throws MethodError masque(f)
    end
end
