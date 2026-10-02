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
function Masque.interactables(ax, p::ComposeDots; id = :composedots, kwargs...)
    return AbstractInteractable[PointInteractable(ax, p.positions[]; id, payloads = ["dot $k" for k in eachindex(p.positions[])], kwargs...)]
end

ids(xs) = [i.id for i in xs]
assemble(fig, xs...; auto = true) = Masque._assemble(fig, xs; auto)

@testset "Composing interactables" begin
    xs = [1.0, 2.0, 3.0]
    ys = [1.0, 4.0, 9.0]

    @testset "no arguments: the defaults" begin
        f = Figure(); ax = Axis(f[1, 1])
        lines!(ax, xs, ys); scatter!(ax, xs, ys); scatter!(ax, xs, ys .+ 1)
        @test ids(assemble(f)) == ids(interactables(f)) == [:lines, :scatter, :scatter_2]
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
        @test ids(out) == [:lines, :scatter, :scatter_2]
        @test out[3] isa PointInteractable && out[3].tooltip === tip
        @test out[2].tooltip === nothing
        # The argument order does not move it: it keeps the default's position.
        out = assemble(f, ViewInteractable(ax), interactables(s2; tooltip = tip))
        @test ids(out) == [:lines, :scatter, :scatter_2, :view]
    end

    @testset "an explicit id renames the replacement" begin
        f = Figure(); ax = Axis(f[1, 1])
        lines!(ax, xs, ys); s = scatter!(ax, xs, ys)
        @test ids(assemble(f, interactables(s; id = :picks))) == [:lines, :picks]
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
        @test ids(out) == [:scatter, :lines]
        @test out[1].payloads == ["a", "b", "c"]
        # So an edited copy of the defaults is a valid call, as the old explicit form was.
        @test ids(assemble(f, interactables(f), ViewInteractable(ax))) == [:scatter, :lines, :view]
    end

    @testset "two layers with one id are refused" begin
        f = Figure(); ax = Axis(f[1, 1])
        scatter!(ax, xs, ys)
        @test_throws ArgumentError assemble(f, ViewInteractable(ax), ViewInteractable(ax))
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
        @test ids(interactables(ax2)) == [:scatter_2, :lines]
        @test ids(assemble(f, interactables(ax2); auto = false)) == [:scatter_2, :lines]
    end

    @testset "a recipe's own method" begin
        f = Figure(); ax = Axis(f[1, 1])
        d = composedots!(ax, [Point2f(1, 1), Point2f(2, 2)])
        composedots!(ax, [Point2f(3, 3)])
        out = interactables(f)
        @test ids(out) == [:composedots, :composedots_2]
        @test out[1].payloads == ["dot 1", "dot 2"]
        out = assemble(f, interactables(d; tooltip = false))
        @test ids(out) == [:composedots, :composedots_2]
        @test out[1].tooltip === false
    end

    @testset "errors point at the call" begin
        f = Figure(); ax = Axis(f[1, 1])
        s = scatter!(ax, xs, ys)
        other = Figure(); oax = Axis(other[1, 1]); os = scatter!(oax, xs, ys)
        @test_throws ArgumentError assemble(f, interactables(os))
        # A recipe with no default and no method of its own fails at the caller's line.
        hb = hexbin!(Axis(Figure()[1, 1]), rand(10), rand(10))
        @test_throws ArgumentError interactables(hb)
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

    @testset "auto_interactables is a deprecated alias" begin
        f = Figure(); ax = Axis(f[1, 1])
        scatter!(ax, xs, ys)
        @test ids(@test_deprecated auto_interactables(f)) == [:scatter]
    end

    @testset "masque builds the assembled set" begin
        f = Figure(); ax = Axis(f[1, 1])
        lines!(ax, xs, ys); s = scatter!(ax, xs, ys)
        w = masque(f, interactables(s; payloads = ["a", "b", "c"]), ViewInteractable(ax))
        @test [L["id"] for L in w.manifest["layers"]] == ["lines", "scatter", "view"]
        w = masque(f, ViewInteractable(ax); auto = false)
        @test [L["id"] for L in w.manifest["layers"]] == ["view"]
        w = masque(f; selected = Dict(:scatter => [2]))
        @test only(filter(L -> L["id"] == "scatter", w.manifest["layers"]))["selected"] == [1]
    end
end
