using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# The printed error for a call to a form removed in 0.4, or "" if it doesn't throw.
_shown_error(f) =
try
    f()
    ""
catch e
    sprint(showerror, e)
end

@testset "Removed 0.3 forms print the 0.4 form (#374)" begin
    fig = Figure(); ax = Axis(fig[1, 1]); scatter!(ax, 1:3, 1:3)
    msg = _shown_error(() -> masque(fig; tooltip_bg = :black))
    @test occursin("`tooltip_bg` was removed in Masque 0.4", msg)
    @test occursin("Use `tooltipstyle = (; bg = …)` instead", msg)
    msg = _shown_error(() -> masque(fig; tooltip_color = :white, tooltip_font_size = 12, max_width = 300))
    @test occursin("`tooltip_color`, `tooltip_font_size` were removed in Masque 0.4", msg)
    @test occursin("`tooltipstyle = (; color = …, font_size = …)`", msg)
    # The hint only explains the error; the call still raises what it did.
    @test_throws MethodError masque(fig; tooltip_radius = 3)

    # Other unknown keywords get no hint, and `tooltip_sigdigits` still works.
    @test !occursin("Masque 0.4", _shown_error(() -> masque(fig; tooltip_size = 3)))
    @test !occursin("Masque 0.4", _shown_error(() -> masque(fig; bogus = 1)))
    @test masque(fig; tooltip_sigdigits = 3).manifest["tipDigits"] == 3
end
