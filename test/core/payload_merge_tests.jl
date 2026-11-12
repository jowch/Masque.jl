using Test, Masque, CairoMakie, Makie, DataFrames, Dates
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

# Pluto's `published_to_js` takes only plain types (its `assertpackable`): a payload holding a
# `SubString`, a CSV column's string type or a `Rational` failed to show the widget at all.
# The manifest now carries plain values, and the interactable keeps the user's own.
@testset "payloads of any string or number type reach the page" begin
    plain = Union{Nothing, Missing, String, Symbol, Bool, Int8, Int16, Int32, Int64, UInt8, UInt16, UInt32, UInt64, Float32, Float64}
    packable(x) = x isa plain || x isa Union{Tuple, NamedTuple, Vector} && all(packable, x) ||
        x isa Dict && all(packable, keys(x)) && all(packable, values(x))
    fig = Figure(); ax = Axis(fig[1, 1])
    s = scatter!(ax, [1.0, 2.0, 3.0], [1.0, 2.0, 3.0])
    gs = Test.GenericString("drugA")
    pl = [
        (; name = SubString("ctrl-1", 1, 4), n = big(2)^70, r = 1 // 2, h = Float16(1.5), c = 'q'),
        (; name = gs, tags = [SubString("ab", 1, 1)], meta = Dict(SubString("k", 1, 1) => Int128(3))),
        SubString("bare", 1, 4),
    ]
    w = masque(fig, interactables(s; payloads = pl, label = SubString("Group A", 1, 7)))
    @test packable(w.manifest)
    L = only(l for l in w.manifest["layers"] if l["id"] == "scatter")
    @test L["label"] === "Group A"
    p1, p2, p3 = L["payloads"]
    @test p1.name === "ctrl" && p1.h === 1.5 && p1.c === "q"
    # Shown as Julia prints them: digits a JavaScript number would round, a fraction.
    @test p1.n == "1180591620717411303424" && p1.r == "1//2"
    @test p1.x === 1.0 && p1.y === 1.0     # the fields Masque fills in are untouched
    @test p2.name === "drugA" && p2.tags == ["a"] && p2.meta == Dict("k" => 3)
    @test p3 === "bare"
    # The interactable, which the `@bind` value reads, keeps the values as passed.
    built = only(i for i in Masque._assemble(fig, (interactables(s; payloads = pl),); auto = true) if i.id === :scatter)
    @test built.payloads[2].name === gs && built.payloads[3] isa SubString
    # A DataFrame row that no default merges onto (a region's) goes as its columns.
    df = DataFrame(name = [SubString("ab", 1, 1)], n = [Int128(2)], m = [missing])
    wr = masque(fig, RegionInteractable(ax, [(:rect, (1.0, 1.0), 1.0, 1.0)]; payloads = df); auto = false)
    @test packable(wr.manifest)
    @test only(only(wr.manifest["layers"])["payloads"]) === (; name = "a", n = 2, m = "missing")
    # Values the page would print its own way read as they do in Julia; a payload of `nothing`
    # is still a mark with none.
    wv = masque(fig, interactables(s; payloads = [(; a = missing, b = nothing, c = NaN), (; a = -Inf32), nothing]))
    q1, q2, q3 = only(l for l in wv.manifest["layers"] if l["id"] == "scatter")["payloads"]
    @test (q1.a, q1.b, q1.c, q2.a) == ("missing", "nothing", "NaN", "-Inf")
    @test q3 === nothing
    # A linked group's value is the keys as given, though the page gets them as text (#609).
    commit(w, f, env) = Masque.bond_from_js(w, merge(Dict{String, Any}(Masque.mount_envelope(w.manifest)), Dict{String, Any}(f => env)))
    fl = Figure(); a1 = Axis(fl[1, 1]); a2 = Axis(fl[1, 2])
    l1 = scatter!(a1, 1:3, 1:3); l2 = scatter!(a2, 1:3, 1:3)
    ks = [Date(2024, 1, 1), missing, big(2)^60]
    rows = [(; k) for k in ks]
    wl = masque(fl, (pick = linked(interactables(l1; payloads = rows), interactables(l2; payloads = rows); key = :k),))
    @test packable(wl.manifest)
    @test isequal([commit(wl, "pick", Dict("row" => r)).pick for r in 0:2], ks)
    wo = masque(fl, (pick = linked(interactables(l1; key = ks), interactables(l2; key = ks)),))
    @test packable(wo.manifest)
    @test commit(wo, "pick", Dict("row" => 0)).pick === Date(2024, 1, 1)
    @test commit(wo, "pick", Dict("row" => 2)).pick == big(2)^60
    # Ends of the Int64 range are still past what a JavaScript number holds.
    @test Masque._tip_value(typemin(Int64)) == string(typemin(Int64))
    # A dict other than `Dict` keeps its order.
    od = Base.ImmutableDict{String, Any}(Base.ImmutableDict{String, Any}("b", SubString("x", 1, 1)), "a", 1)
    @test Masque._tip_value(od) === NamedTuple{Tuple(Symbol.(keys(od)))}(Tuple(Masque._tip_value(v) for v in values(od)))
    # A manifest that needs nothing keeps its own containers.
    v = [(; a = "x"), (; a = "y")]
    @test Masque._packable(v) === v
    g = [1.0f0, 2.0f0]
    @test Masque._packable(g) === g
    d = Dict{String, Any}("a" => v, "b" => g)
    @test Masque._packable(d) === d
end
