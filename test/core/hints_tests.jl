using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# The printed error for a call to a form removed in 0.3, or "" if it doesn't throw.
_shown_error(f) =
try
    f()
    ""
catch e
    sprint(showerror, e)
end

@testset "Removed 0.2 forms print the 0.3 form (#299)" begin
    fig = Figure(); ax = Axis(fig[1, 1])
    hm = heatmap!(ax, rand(3, 3))
    im = image!(Axis(fig[1, 2]), rand(3, 3))
    for (call, removed, use) in (
            (() -> RectInteractable(ax, hm), "`RectInteractable(ax, p)` for a heatmap", "GridInteractable(ax, p)"),
            (() -> RectInteractable(ax, im; payloads = nothing), "for a heatmap or image", "GridInteractable(ax, p)"),
            (
                () -> RectInteractable(ax; grid = (0:3, 0:3, rand(3, 3))), "`RectInteractable(ax; grid = …)`",
                "GridInteractable(ax, xedges, yedges, values)",
            ),
            (() -> RectInteractable(ax; rects = [(0, 0, 1, 1)]), "`RectInteractable(ax; rects = …)`", "RectInteractable(ax, rects)"),
            (
                () -> RegionInteractable(ax; regions = [(:circle, (0.0, 0.0), 1.0)]), "`RegionInteractable(ax; regions = …)`",
                "RegionInteractable(ax, regions)",
            ),
            (() -> _CairoExt.CairoBackend(; max_width = 300), "`CairoBackend(; max_width)`", "backend = :cairo, max_width"),
            (() -> Masque.auto_interactables(fig), "`auto_interactables` was removed", "interactables(fig)"),
        )
        msg = _shown_error(call)
        @test occursin(removed, msg) && occursin("removed in Masque 0.3", msg) && occursin(use, msg)
    end
    # The hint only explains the error; the call still raises what it did.
    @test_throws MethodError RectInteractable(ax, hm)
    @test_throws UndefVarError Masque.auto_interactables(fig)

    # Other errors from the same constructors get no hint.
    @test !occursin("Masque 0.3", _shown_error(() -> RectInteractable(ax, 1)))
    @test !occursin("Masque 0.3", _shown_error(() -> RectInteractable(ax; payloads = nothing)))
    @test !occursin("Masque 0.3", _shown_error(() -> RegionInteractable(ax)))
    @test !occursin("Masque 0.3", _shown_error(() -> _CairoExt.CairoBackend(1)))
end
