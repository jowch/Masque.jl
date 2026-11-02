using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# Reset a moved view (#524): Julia keeps where each view started, and a `reset` request on the
# gesture channel puts it back.
@testset "Reset a moved view (#524)" begin
    _lims(ax) = (fl = ax.finallimits[]; Float64[fl.origin..., (fl.origin .+ fl.widths)...])
    pan(w, x, y; id = "view") = w.render_frame(
        Dict("id" => id, "xmin" => x[1], "xmax" => x[2], "ymin" => y[1], "ymax" => y[2], "settle" => true),
    )
    reset(w; id = "view") = w.render_frame(Dict("id" => id, "reset" => true, "settle" => true))
    view_geom(resp) = only(l for l in resp["manifest"]["layers"] if l["kind"] == "view")["geometry"]
    moved(m) = get(only(l for l in m["layers"] if l["kind"] == "view")["geometry"], "moved", false)

    @testset "automatic limits come back automatic" begin
        fig = Figure(size = (500, 350))
        ax = Axis(fig[1, 1])
        scatter!(ax, 0:10, 0:10)
        w = masque(fig, ViewInteractable(ax))
        home = _lims(ax)
        @test !moved(w.manifest)
        resp = pan(w, (20.0, 30.0), (-5.0, 5.0))
        @test view_geom(resp)["moved"] === true
        @test ax.limits[] == (20.0, 30.0, -5.0, 5.0)
        resp = reset(w)
        @test ax.limits[] === (nothing, nothing)
        @test _lims(ax) ≈ home atol = 1.0e-6
        @test !haskey(view_geom(resp), "moved")
        # Full resolution: the reset is a settle frame.
        @test haskey(resp, "png")
    end

    @testset "the limits the author wrote come back, nothing entries kept" begin
        fig = Figure(size = (500, 350))
        ax = Axis(fig[1, 1]; limits = (0, 5, nothing, nothing))
        scatter!(ax, 0:10, 0:10)
        w = masque(fig, ViewInteractable(ax))
        home = _lims(ax)
        pan(w, (2.0, 3.0), (1.0, 2.0))
        reset(w)
        @test ax.limits[] === (0, 5, nothing, nothing)
        @test _lims(ax) ≈ home atol = 1.0e-6
    end

    @testset "the home survives a re-run of the masque cell" begin
        fig = Figure(size = (500, 350))
        ax = Axis(fig[1, 1])
        scatter!(ax, 0:10, 0:10)
        w = masque(fig, ViewInteractable(ax))
        home = _lims(ax)
        pan(w, (20.0, 30.0), (-5.0, 5.0))
        # Only the masque cell runs again: the figure still shows the moved view.
        w2 = masque(fig, ViewInteractable(ax))
        @test moved(w2.manifest)
        @test _lims(ax)[[1, 3]] ≈ [20.0, 30.0] atol = 1.0e-6
        reset(w2)
        @test ax.limits[] === (nothing, nothing)
        @test _lims(ax) ≈ home atol = 1.0e-6
        @test !moved(masque(fig, ViewInteractable(ax)).manifest)
    end

    @testset "limits the author sets between runs become the new home" begin
        fig = Figure(size = (500, 350))
        ax = Axis(fig[1, 1])
        scatter!(ax, 0:10, 0:10)
        w = masque(fig, ViewInteractable(ax))
        pan(w, (20.0, 30.0), (-5.0, 5.0))
        limits!(ax, 1, 2, 3, 4)
        w2 = masque(fig, ViewInteractable(ax))
        @test !moved(w2.manifest)
        pan(w2, (5.0, 6.0), (5.0, 6.0))
        reset(w2)
        @test ax.limits[] == ((1, 2), (3, 4))
    end

    @testset "the compile-ahead warmup does not move the home" begin
        fig = Figure(size = (500, 350))
        ax = Axis(fig[1, 1])
        scatter!(ax, 0:10, 0:10)
        w = masque(fig, ViewInteractable(ax))
        pan(w, (20.0, 30.0), (-5.0, 5.0))
        w2 = masque(fig, ViewInteractable(ax))
        Masque._warm_view_render_frame!(w2.render_frame, Dict{Symbol, Any}(:view => ax))
        # The warmup put the camera back; the next masque call still sees the pan, not a new home.
        @test moved(masque(fig, ViewInteractable(ax)).manifest)
        reset(w2)
        @test ax.limits[] === (nothing, nothing)
    end

    @testset "linked axes reset together" begin
        for link! in (linkaxes!, linkxaxes!, linkyaxes!)
            fig = Figure(size = (700, 300))
            a1 = Axis(fig[1, 1]); a2 = Axis(fig[1, 2])
            scatter!(a1, 0:10, 0:10)
            scatter!(a2, 0:5, 100:20:200)
            link!(a1, a2)
            w = masque(fig, ViewInteractable(a1))
            h1, h2 = _lims(a1), _lims(a2)
            pan(w, (20.0, 30.0), (-5.0, 5.0))
            @test _lims(a2) != h2
            reset(w)
            @test a1.limits[] === (nothing, nothing)
            @test a2.limits[] === (nothing, nothing)
            @test _lims(a1) ≈ h1 atol = 1.0e-6
            @test _lims(a2) ≈ h2 atol = 1.0e-6
        end
    end

    @testset "a view on a linked axis counts as moved when its partner's pan moved it" begin
        fig = Figure(size = (700, 300))
        a1 = Axis(fig[1, 1]); a2 = Axis(fig[1, 2])
        scatter!(a1, 0:10, 0:10)
        scatter!(a2, 0:10, 0:10)
        linkaxes!(a1, a2)
        w = masque(fig, ViewInteractable(a1; id = :v1), ViewInteractable(a2; id = :v2))
        resp = pan(w, (20.0, 30.0), (-5.0, 5.0); id = "v1")
        views = Dict(l["id"] => l["geometry"] for l in resp["manifest"]["layers"] if l["kind"] == "view")
        @test views["v1"]["moved"] === true && views["v2"]["moved"] === true
        resp = reset(w; id = "v2")
        @test !any(haskey(l["geometry"], "moved") for l in resp["manifest"]["layers"] if l["kind"] == "view")
    end

    @testset "Axis3: angles and limits come back" begin
        fig = Figure(size = (500, 400))
        ax = Axis3(fig[1, 1]; azimuth = 1.0, elevation = 0.4)
        scatter!(ax, Makie.Point3f[(0, 0, 0), (1, 1, 1)])
        w = masque(fig, ViewInteractable(ax))
        home = _lims(ax)
        w.render_frame(Dict("id" => "view", "azimuth" => 2.0, "elevation" => 0.1, "settle" => true))
        resp = w.render_frame(Dict("id" => "view", "limits" => Float64[0.4, 0.6, 0.4, 0.6, 0.4, 0.6], "settle" => true))
        @test view_geom(resp)["moved"] === true
        resp = reset(w)
        @test ax.azimuth[] == 1.0 && ax.elevation[] == 0.4
        @test ax.limits[] === (nothing, nothing, nothing)
        @test _lims(ax) ≈ home atol = 1.0e-6
        @test view_geom(resp)["azimuth"] == 1.0
        @test !haskey(view_geom(resp), "moved")
    end

    @testset "linkcameras! turns the follower back; with limits = true it zooms back too" begin
        for share in (false, true)
            fig = Figure(size = (600, 350))
            a1 = Axis3(fig[1, 1]); a2 = Axis3(fig[1, 2])
            pts = Makie.Point3f[(0, 0, 0), (1, 1, 1)]
            scatter!(a1, pts); scatter!(a2, pts)
            linkcameras!([a1, a2]; limits = share)
            w = masque(fig, ViewInteractable(a1))
            az0, el0, h2 = a2.azimuth[], a2.elevation[], _lims(a2)
            w.render_frame(Dict("id" => "view", "azimuth" => 2.0, "elevation" => 0.1, "settle" => true))
            w.render_frame(Dict("id" => "view", "limits" => Float64[0.4, 0.6, 0.4, 0.6, 0.4, 0.6], "settle" => true))
            @test a2.azimuth[] == 2.0
            reset(w)
            @test a2.azimuth[] == az0 && a2.elevation[] == el0
            @test _lims(a2) ≈ h2 atol = 1.0e-6
        end
    end
end
