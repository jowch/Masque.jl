using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# Corner view buttons (#525): `ViewInteractable(ax; controls)` reaches the view's geometry.
@testset "Corner view buttons (#525)" begin
    geom(w) = only(l for l in w.manifest["layers"] if l["kind"] == "view")["geometry"]
    function fig_ax()
        fig = Figure(size = (500, 350))
        ax = Axis(fig[1, 1])
        scatter!(ax, 0:10, 0:10)
        return fig, ax
    end

    @testset "the default leaves the manifest as it was" begin
        fig, ax = fig_ax()
        @test ViewInteractable(ax).controls === :hover
        @test !haskey(geom(masque(fig, ViewInteractable(ax))), "controls")
    end

    @testset ":always and :none reach the browser" begin
        for c in (:always, :none)
            fig, ax = fig_ax()
            @test geom(masque(fig, ViewInteractable(ax; controls = c)))["controls"] == String(c)
        end
    end

    @testset "an unknown setting is an error that names the choices" begin
        fig, ax = fig_ax()
        err = try
            ViewInteractable(ax; controls = :corner)
            nothing
        catch e
            e
        end
        @test err isa ArgumentError
        @test occursin(":hover, :always or :none", err.msg)
    end

    @testset "the two-field form still builds, and a renumbered id keeps controls" begin
        fig, ax = fig_ax()
        @test ViewInteractable(ax, :pan).controls === :hover
        fig = Figure(size = (700, 350))
        a1 = Axis(fig[1, 1]); a2 = Axis(fig[1, 2])
        scatter!(a1, 0:3, 0:3); scatter!(a2, 0:3, 0:3)
        w = masque(fig, ViewInteractable(a1), ViewInteractable(a2; controls = :none))
        views = [l for l in w.manifest["layers"] if l["kind"] == "view"]
        @test [l["id"] for l in views] == ["view", "view_2"]
        @test !haskey(views[1]["geometry"], "controls")
        @test views[2]["geometry"]["controls"] == "none"
    end
end
