using Test, Masque, CairoMakie, Makie
import Masque as IP
include(joinpath(@__DIR__, "..", "testutils.jl"))

# A finger picks the nearest point or line within its reach (#528). The overlay does the
# picking; Julia ships the radius: `masque(...; touch)` for the widget, `touch_radius` per layer.
@testset "Touch radius (#528)" begin
    layer(m, id) = only(l for l in m["layers"] if l["id"] == id)

    @testset "masque(; touch) is sent only when set" begin
        fig = Figure(); ax = Axis(fig[1, 1]); scatter!(ax, 1:3, 1:3)
        @test !haskey(masque(fig).manifest, "touch")
        @test !haskey(masque(fig; touch = true).manifest, "touch")
        @test !haskey(masque(fig; touch = (;)).manifest, "touch")
        @test masque(fig; touch = false).manifest["touch"] === false
        @test masque(fig; touch = (; radius = 8)).manifest["touch"] == Dict("radius" => 8.0)
        @test masque(fig; touch = (; radius = 0)).manifest["touch"] == Dict("radius" => 0.0)
        @test_throws ArgumentError masque(fig; touch = (; radius = -1))
        @test_throws ArgumentError masque(fig; touch = (; radius = Inf))
        @test_throws ArgumentError masque(fig; touch = (; size = 8))
        @test_throws ArgumentError masque(fig; touch = 8)
    end

    @testset "touch_radius on points and lines" begin
        fig = Figure(); ax = Axis(fig[1, 1])
        pts = [(1.0, 1.0), (2.0, 4.0)]
        p = PointInteractable(ax, pts; touch_radius = 6)
        @test p.touch_radius == 6.0
        @test PointInteractable(ax, pts).touch_radius === nothing
        s = SegmentInteractable(ax, pts; touch_radius = 0)
        @test s.touch_radius == 0.0
        @test_throws ArgumentError PointInteractable(ax, pts; touch_radius = -2)
        @test_throws ArgumentError SegmentInteractable(ax, pts; touch_radius = NaN)
        @test_throws ArgumentError SegmentInteractable(ax, pts; touch_radius = "8")

        # CSS px, not scaled by the picture's density, unlike `tol`.
        w = masque(fig, (pts = p, seg = s, plain = PointInteractable(ax, pts; id = :plain)); auto = false)
        m = w.manifest
        @test m["scaling"] != 1
        @test layer(m, "pts")["touch"] == 6.0
        @test layer(m, "seg")["touch"] == 0.0
        @test !haskey(layer(m, "plain"), "touch")
    end

    @testset "interactables(plot; touch_radius)" begin
        fig = Figure(); ax = Axis(fig[1, 1])
        sc = scatter!(ax, 1:3, 1:3; marker_offset = (2, 2))
        ln = lines!(ax, 1:3, [2, 1, 3])
        st = stem!(ax, 1:3, [1, 2, 3])
        bp = barplot!(ax, 1:3, [1, 2, 3])
        # The plot-object copies (`_with_offset`, `_with_linewidth`, …) keep it.
        @test only(interactables(ax, sc; touch_radius = 5)).touch_radius == 5.0
        @test only(interactables(ax, ln; touch_radius = 5)).touch_radius == 5.0
        @test all(i -> i.touch_radius == 5.0, interactables(ax, st; touch_radius = 5))
        # Bars take a touch inside them: no radius to set, and no error.
        @test !hasfield(typeof(only(interactables(ax, bp; touch_radius = 5))), :touch_radius)
        @test_throws ArgumentError interactables(ax, sc; touch_radius = -1)
        # With select, both apply.
        i = only(interactables(ax, sc; touch_radius = 5, select = :many))
        @test i.touch_radius == 5.0 && i.select === :many

        # Through masque(fig, interactables(plot; …)), the default layer takes it.
        m = masque(fig, interactables(sc; touch_radius = 3)).manifest
        @test layer(m, "scatter")["touch"] == 3.0
        @test !haskey(layer(m, "lines"), "touch")
        @test !any(l -> l["kind"] == "rects" && haskey(l, "touch"), m["layers"])
    end

    @testset "build_manifest ships the layer radius" begin
        fig = Figure(); ax = Axis(fig[1, 1])
        p = PointInteractable(ax, [(1.0, 1.0)]; touch_radius = 4)
        bk = IP._resolve_backend(:cairo)
        ctx = IP.context(bk, fig, IP._ppu(bk, fig, 700), 700)
        m = IP.build_manifest([p], ctx)
        @test only(m["layers"])["touch"] == 4.0
    end
end

# One finger scrolls the page past a view, two move it (#537); `touch = (; views)` picks.
@testset "Touch views (#537)" begin
    fig = Figure(); ax = Axis(fig[1, 1]); scatter!(ax, 1:3, 1:3)
    v = ViewInteractable(ax)
    @test !haskey(masque(fig, v).manifest, "touchViews")
    @test !haskey(masque(fig, v; touch = (; views = :twofinger)).manifest, "touchViews")
    m = masque(fig, v; touch = (; views = :onefinger)).manifest
    @test m["touchViews"] == "onefinger"
    @test !haskey(m, "touch") # the radius stays the default
    m = masque(fig, v; touch = (; radius = 8, views = :onefinger)).manifest
    @test m["touch"] == Dict("radius" => 8.0) && m["touchViews"] == "onefinger"
    @test !haskey(masque(fig, v; touch = false).manifest, "touchViews")
    @test_throws ArgumentError masque(fig, v; touch = (; views = :one))
    @test_throws ArgumentError masque(fig, v; touch = (; views = "onefinger"))
end
