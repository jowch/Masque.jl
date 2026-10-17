using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# A widget's PNG and text forms, for tools that read a cell's value without a browser (#373).
@testset "PNG and text forms" begin
    fig = Figure(size = (500, 300))
    ax = Axis(fig[1, 1]; title = "Growth")
    sc = scatter!(ax, 1:4, [1, 4, 9, 16]; label = "samples")
    lines!(ax, 1:4, [1, 3, 8, 15])
    Axis(fig[1, 2])
    w = masque(fig; selected = (scatter = 2,))

    @test showable(MIME"image/png"(), w)
    png = repr(MIME"image/png"(), w)
    @test png[1:8] == UInt8[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    @test png == Masque.base64decode(w.b64)
    # A notebook still gets the live figure.
    @test showable(MIME"text/html"(), w)

    text = repr(MIME"text/plain"(), w)
    lines_ = split(text, '\n')
    @test startswith(lines_[1], "MasqueWidget, 1000×600 px, 2 layers")
    @test occursin("ax1 \"Growth\":", text)
    @test occursin("samples (scatter): 4 points; click, hover; tooltip: index, x, y", text)
    @test occursin("lines: 1 line; hover; tooltip: index, x, y", text)
    @test !occursin("ax2", text)                   # an axis with no layers is left out
    @test occursin("value: ", text) && occursin("ElementEvent(:scatter, 2", text)
    @test length(lines_) <= 6 && length(text) < 1000
    @test !occursin(w.b64[1:min(end, 40)], text)

    @test repr(w) == "MasqueWidget(1000×600 px, 2 layers)"

    # A template names its fields; `tooltip = false` says none.
    fig2 = Figure(size = (300, 200))
    ax2 = Axis(fig2[1, 1])
    s2 = scatter!(ax2, 1:3, 1:3)
    w2 = masque(fig2, [PointInteractable(ax2, s2; payloads = [(; name = "a$k", v = k) for k in 1:3], tooltip = masque"$(name) is $(v)")])
    @test occursin("tooltip: name, v", repr(MIME"text/plain"(), w2))
    w3 = masque(fig2, [PointInteractable(ax2, s2; tooltip = false)])
    @test occursin("tooltip: none", repr(MIME"text/plain"(), w3))

    # A heatmap names its cells' fields; a control sits under the figure.
    fig4 = Figure(size = (300, 300))
    heatmap!(Axis(fig4[1, 1]), [1 2 3; 4 5 6])
    sl = Slider(fig4[2, 1]; range = 1:5)
    text4 = repr(MIME"text/plain"(), masque(fig4, (; sl)))
    @test occursin("2×3 cells; click, hover; tooltip: i, j, value", text4)
    @test occursin("\nfigure:\n  sl: slider; change", text4)
    @test occursin("sl = 1", text4)

    # The default table's own fields, as the overlay draws them.
    tt = Masque._tooltip_text
    gridgeom = Dict{String, Any}("ncols" => 2, "nrows" => 1)
    @test tt(Dict{String, Any}("kind" => "grid", "geometry" => gridgeom, "payloads" => [(; name = "a"), (; name = "b")])) == "name, value"
    @test tt(Dict{String, Any}("kind" => "grid", "geometry" => gridgeom, "payloads" => [])) == "i, j, value"
    slicegeom = Dict{String, Any}("orientation" => "v", "series" => [Dict("id" => "temp"), Dict("id" => "rain")])
    @test tt(Dict{String, Any}("kind" => "slice", "geometry" => slicegeom, "payloads" => [])) == "rain, temp, x"
    @test tt(Dict{String, Any}("kind" => "surface", "geometry" => Dict{String, Any}(), "payloads" => [])) == "i, j, x, y, z"

    # A widget built by hand has no picture to hand back.
    bare = Masque.MasqueWidget("", Dict{String, Any}(), 100)
    @test !showable(MIME"image/png"(), bare)
    @test repr(MIME"text/plain"(), bare) == "MasqueWidget, no picture, 0 layers"
end
