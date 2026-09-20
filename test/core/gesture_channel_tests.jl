using Test, Masque, CairoMakie, Makie, FileIO
include(joinpath(@__DIR__, "..", "testutils.jl"))

@testset "Gesture channel (#102)" begin
    @testset "no ViewInteractable -> no render_frame" begin
        (; fig, ax, pts) = default_fixture()
        w = masque(fig, [PointInteractable(ax, pts)])
        @test w.render_frame === nothing
    end

    @testset "2D pan: frame + manifest travel together, ppu drops during the gesture" begin
        fig = Figure(size = (600, 400))
        ax = Axis(fig[1, 1])
        pts = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0)]
        scatter!(ax, first.(pts), last.(pts))
        w = masque(fig, [ViewInteractable(ax), PointInteractable(ax, pts)])
        @test w.render_frame isa Function

        aid = only(k for (k, t) in w.manifest["transforms"] if t["is3d"] == false)
        t0 = w.manifest["transforms"][aid]
        xlims0, ylims0 = t0["xlims"], t0["ylims"]

        new_xmin, new_xmax = xlims0[1] - 1.0, xlims0[2] - 1.0
        new_ymin, new_ymax = ylims0[1] + 0.5, ylims0[2] + 0.5
        resp = w.render_frame(
            Dict(
                "id" => "view", "xmin" => new_xmin, "xmax" => new_xmax,
                "ymin" => new_ymin, "ymax" => new_ymax, "settle" => false,
            ),
        )
        @test haskey(resp, "png") && resp["png"] isa Vector{UInt8} && !isempty(resp["png"])
        @test haskey(resp, "manifest")   # §12.4/§12.5: a camera-moving frame always ships a manifest

        # Coherence (tripwire #1): the returned manifest's own transform reflects the NEW
        # camera, not a stale one — build_manifest re-derives it from ax.limits[], which the
        # closure just mutated.
        m2 = resp["manifest"]
        t2 = m2["transforms"][aid]
        @test t2["xlims"][1] ≈ new_xmin atol = 1.0e-6
        @test t2["xlims"][2] ≈ new_xmax atol = 1.0e-6
        @test t2["ylims"][1] ≈ new_ymin atol = 1.0e-6
        @test t2["ylims"][2] ≈ new_ymax atol = 1.0e-6
        # The manifest's own coordinate space (viewBox/scaling) stays pinned to the MOUNT ppu
        # across every frame — only the render resolution drops — so width/height/scaling never
        # move even though the axis limits did.
        @test m2["width"] == w.manifest["width"] && m2["height"] == w.manifest["height"]
        @test m2["scaling"] == w.manifest["scaling"]

        # ppu=1 mid-gesture vs the mount ppu on settle: decode both PNGs' pixel dimensions.
        img_gesture = FileIO.load(IOBuffer(resp["png"]))
        resp_settle = w.render_frame(
            Dict(
                "id" => "view", "xmin" => new_xmin, "xmax" => new_xmax,
                "ymin" => new_ymin, "ymax" => new_ymax, "settle" => true,
            ),
        )
        img_settle = FileIO.load(IOBuffer(resp_settle["png"]))
        @test size(img_settle, 1) > size(img_gesture, 1)
        @test size(img_settle, 2) > size(img_gesture, 2)

        # Mutating the axis limits for a frame is real (not throwaway): the underlying `ax` is
        # the same object the notebook's own `fig` holds, matching the "camera stays wherever
        # the gesture left it until the cell re-runs" contract (§12.3/§12.8).
        @test ax.limits[][1] ≈ new_xmin atol = 1.0e-6
    end

    @testset "3D orbit: azimuth/elevation drive the same axis live" begin
        fig = Figure(size = (400, 400))
        ax = Axis3(fig[1, 1])
        scatter!(ax, Makie.Point3f[(1, 2, 3), (4, 5, 6)])
        w = masque(fig, [ViewInteractable(ax)])
        @test w.render_frame isa Function

        resp = w.render_frame(Dict("id" => "view", "azimuth" => 0.7, "elevation" => 0.2, "settle" => false))
        @test ax.azimuth[] ≈ 0.7 atol = 1.0e-9
        @test ax.elevation[] ≈ 0.2 atol = 1.0e-9
        view_layer = only(l for l in resp["manifest"]["layers"] if l["kind"] == "view")
        @test view_layer["geometry"]["azimuth"] ≈ 0.7 atol = 1.0e-9
        @test view_layer["geometry"]["elevation"] ≈ 0.2 atol = 1.0e-9
    end

    @testset "unknown layer id fails loud" begin
        (; fig, ax, pts) = default_fixture()
        w = masque(fig, [ViewInteractable(ax; id = :view), PointInteractable(ax, pts)])
        @test_throws ArgumentError w.render_frame(Dict("id" => "nope", "xmin" => 0.0, "xmax" => 1.0, "ymin" => 0.0, "ymax" => 1.0))
    end

    @testset "MasqueWidget 3-arg constructor still works (render_frame defaults to nothing)" begin
        w = Masque.MasqueWidget("", Dict{String, Any}(), 100)
        @test w.render_frame === nothing
    end
end
