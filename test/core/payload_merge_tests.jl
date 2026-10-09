using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# #308: a user's payload is merged onto the mark's default payload; the user's fields win a
# clash, `index` is left out (the event carries it), and a non-key-value payload replaces.
@testset "payloads merge onto the default (#308)" begin
    @testset "points" begin
        fig = Figure(); ax = Axis(fig[1, 1])
        pts = [(1.0, 2.0), (3.0, 4.0)]
        i = PointInteractable(ax, pts; payloads = [(; name = "a"), (; name = "b")])
        @test i.payloads[1] === (; name = "a", x = 1.0, y = 2.0)
        @test i.payloads[2] === (; name = "b", x = 3.0, y = 4.0)
        # The default is unchanged without payloads.
        @test PointInteractable(ax, pts).payloads[1] === (; index = 1, x = 1.0, y = 2.0)
        # The payload's own fields win and keep their order; no `index` is added.
        i = PointInteractable(ax, pts; payloads = [(; x = "first", name = "a"), (; y = 9, name = "b")])
        @test i.payloads[1] === (; x = "first", name = "a", y = 2.0)
        @test i.payloads[2] === (; y = 9, name = "b", x = 3.0)
        # A payload that already has x and y is exactly as passed.
        @test PointInteractable(ax, pts; payloads = [(; x = 1, y = 2), (; x = 3, y = 4)]).payloads[1] === (; x = 1, y = 2)
        # A payload naming `index` keeps its own.
        @test PointInteractable(ax, pts; payloads = [(; index = 7), (; index = 8)]).payloads[1] === (; index = 7, x = 1.0, y = 2.0)
        # 3-coordinate points add z.
        p3 = PointInteractable(ax, [(1.0, 2.0, 3.0)]; payloads = [(; name = "a")])
        @test p3.payloads[1] === (; name = "a", x = 1.0, y = 2.0, z = 3.0)
        # Not key-value: replaces.
        @test PointInteractable(ax, pts; payloads = ["a", "b"]).payloads == ["a", "b"]
        @test PointInteractable(ax, pts; payloads = [1, nothing]).payloads == [1, nothing]
        # A Dict keyed by Symbol or String merges with keys of its own type.
        d = PointInteractable(ax, pts; payloads = [Dict(:name => "a"), Dict("name" => "b", "x" => 0)]).payloads
        @test d[1] == Dict{Symbol, Any}(:name => "a", :x => 1.0, :y => 2.0)
        @test d[2] == Dict{String, Any}("name" => "b", "x" => 0, "y" => 4.0)
        # The payload's own dict type is kept (an `OrderedDict` keeps its order).
        @test PointInteractable(ax, pts[1:1]; payloads = [IdDict{Symbol, Any}(:name => "a")]).payloads[1] isa IdDict{Symbol, Any}
        # Mixed keys: nothing to merge onto safely, so it replaces.
        mixed = Dict{Any, Any}(:a => 1, "b" => 2)
        @test PointInteractable(ax, pts[1:1]; payloads = [mixed]).payloads[1] === mixed
        # Length is still checked.
        @test_throws ArgumentError PointInteractable(ax, pts; payloads = [(; name = "a")])
    end

    @testset "plot objects" begin
        fig = Figure(); ax = Axis(fig[1, 1])
        s = scatter!(ax, [1.0, 2.0], [3.0, 4.0])
        i = only(interactables(ax, s; payloads = [(; name = "a"), (; name = "b")]))
        @test i.payloads[2] === (; name = "b", x = 2.0, y = 4.0)

        b = barplot!(ax, [1, 2], [5.0, 7.0])
        i = only(interactables(ax, b; payloads = [(; name = "a"), (; name = "b")]))
        @test i.payloads[2] === (; name = "b", low = 0.0, high = 7.0, value = 7.0)

        t = text!(ax, [Point2f(1, 2)]; text = ["hi"])
        i = only(interactables(ax, t; payloads = [(; name = "a")]))
        @test i.payloads[1] === (; name = "a", text = "hi", x = 1.0, y = 2.0)

        a = arrows2d!(ax, [Point2f(0, 0)], [Vec2f(1, 2)])
        i = only(interactables(ax, a; payloads = [(; name = "a")]))
        @test i.payloads[1] === (; name = "a", x = 0.0, y = 0.0, u = 1.0, v = 2.0)

        sr = series!(ax, [1.0 2.0; 3.0 4.0]; labels = ["one", "two"])
        i = only(interactables(ax, sr; payloads = [(; name = "a"), (; name = "b")]))
        @test i.payloads[1] === (; name = "a", label = "one")

        # A line's default is only its index, so there's nothing to add.
        l = lines!(ax, [1.0, 2.0], [1.0, 2.0])
        @test only(interactables(ax, l; payloads = [(; name = "a")])).payloads[1] === (; name = "a")

        @test_throws ArgumentError interactables(ax, b; payloads = [(; name = "a")])
    end

    @testset "categorical x is merged as its label" begin
        fig = Figure(); ax = Axis(fig[1, 1])
        s = scatter!(ax, Makie.Categorical(["a", "b"]), [1.0, 2.0])
        i = only(interactables(ax, s; payloads = [(; name = "p"), (; name = "q")]))
        @test i.payloads[2] === (; name = "q", x = "b", y = 2.0)
    end

    @testset "a template can name a merged field" begin
        fig = Figure(); ax = Axis(fig[1, 1])
        s = scatter!(ax, [1.0, 2.0], [3.0, 4.0])
        tip = masque"$(name) at $(x), $(y)"
        w = masque(fig, interactables(s; payloads = [(; name = "a"), (; name = "b")], tooltip = tip))
        L = only(l for l in w.manifest["layers"] if l["kind"] == "circles")
        @test L["payloads"][1] == (; name = "a", x = 1.0, y = 3.0)
        @test_throws ArgumentError masque(fig, interactables(s; payloads = [(; name = "a"), (; name = "b")], tooltip = masque"$(nme)"))
    end
end
