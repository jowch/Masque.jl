using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# Red pixels of `img` (the labels are drawn red; nothing else in these figures is).
isred(c) = Float64(Makie.red(c)) > 0.6 && Float64(Makie.green(c)) < 0.4 && Float64(Makie.blue(c)) < 0.4
function redpx(img; rows = axes(img, 1), cols = axes(img, 2))
    return [(x, y) for y in rows, x in cols if isred(img[y, x])]
end
inbox((x, y), (cx, cy, w, h); pad = 2) = abs(x - cx) <= w / 2 + pad && abs(y - cy) <= h / 2 + pad
boxof(g, k) = Tuple(Float64.(g[(4k - 3):(4k)]))

@testset "TextInteractable on Axis3 (#292)" begin
    @testset "boxes cover the drawn labels; payloads carry z" begin
        fig = Figure(; size = (600, 450))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, limits = (0, 2, 0, 2, 0, 2))
        anchors = [Point3f(0.25, 0.25, 0.25), Point3f(1.75, 1.0, 1.0), Point3f(1.0, 1.75, 1.75)]
        t = text!(ax, anchors; text = ["one", "two", "three"], color = :red, fontsize = 18)
        _, ppu, ctx = ctx_for(fig)
        ti = TextInteractable(ax, t)
        @test ti.payloads[2] == (; text = "two", index = 2, x = 1.75, y = 1.0, z = 1.0)
        L = only(hitlayers(ti, ctx))
        g = L.geometry
        @test L.kind === :rects && length(g) == 12
        @test sort(L.order) == 0:2
        img = Makie.colorbuffer(fig; px_per_unit = ppu)
        red = redpx(img)
        boxes = [boxof(g, k) for k in 1:3]
        # Every red pixel is in some label's box, and every box holds red pixels.
        @test all(p -> any(b -> inbox(p, b), boxes), red)
        @test all(b -> count(p -> inbox(p, b; pad = 0), red) > 20, boxes)
        # Each anchor projects onto its box (default align is the box's bottom-left corner).
        for k in 1:3
            q = Masque.data_to_image_px(ctx, ax, anchors[k])
            @test inbox((q[1], q[2]), boxes[k]; pad = 3)
        end
    end

    @testset "overlapping labels: the one nearest the camera is first" begin
        fig = Figure(; size = (600, 450))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, limits = (0, 2, 0, 2, 0, 2))
        anchors = [Point3f(0.2, 0.2, 0.2), Point3f(1.8, 1.8, 1.8), Point3f(1.0, 1.0, 1.0)]
        t = text!(ax, anchors; text = ["a", "b", "c"], fontsize = 18)
        _, _, ctx = ctx_for(fig)
        L = only(hitlayers(TextInteractable(ax, t), ctx))
        _, _, depth = Masque._project_depth(ctx, ax, anchors)
        @test L.order == sortperm(depth) .- 1
        @test issorted(depth[L.order .+ 1])
        # This camera looks from +x, so the label at the low corner is the farthest.
        @test last(L.order) == 0
    end

    @testset "a label outside the axis limits is not drawn and not hit" begin
        fig = Figure(; size = (600, 450))
        ax = Axis3(fig[1, 1]; limits = (0, 2, 0, 2, 0, 2))
        t = text!(ax, [Point3f(1, 1, 1), Point3f(5, 1, 1)]; text = ["in", "out"], color = :red)
        _, ppu, ctx = ctx_for(fig)
        L = only(hitlayers(TextInteractable(ax, t), ctx))
        @test L.order == [0]
        @test all(isnan, L.geometry[5:8]) && all(isfinite, L.geometry[1:4])
        # Makie doesn't draw it either: the only red is inside the one box.
        img = Makie.colorbuffer(fig; px_per_unit = ppu)
        @test all(p -> inbox(p, boxof(L.geometry, 1)), redpx(img))
    end

    @testset "markerspace = :data: the box covers the label drawn in the scene" begin
        fig = Figure(; size = (600, 450))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, limits = (0, 2, 0, 2, 0, 2))
        t = text!(
            ax, Point3f(0.5, 1.0, 1.75); text = "flat", color = :red, markerspace = :data, fontsize = 0.6,
            align = (:center, :center),
        )
        _, ppu, ctx = ctx_for(fig)
        L = only(hitlayers(TextInteractable(ax, t), ctx))
        b = boxof(L.geometry, 1)
        red = redpx(Makie.colorbuffer(fig; px_per_unit = ppu))
        @test length(red) > 50
        @test all(p -> inbox(p, b), red)
        # Centred on the glyphs (the box is the layout box, so wider than the ink).
        xs, ys = first.(red), last.(red)
        @test abs(b[1] - (maximum(xs) + minimum(xs)) / 2) < 0.1 * b[3]
        @test abs(b[2] - (maximum(ys) + minimum(ys)) / 2) < 0.1 * b[4]
    end

    @testset "masque(fig) makes text on Axis3 interactive" begin
        fig = Figure(; size = (500, 400))
        ax = Axis3(fig[1, 1])
        scatter!(ax, [1.0, 2.0], [1.0, 2.0], [1.0, 2.0])
        text!(ax, [Point3f(1, 1, 1), Point3f(2, 2, 2)]; text = ["p", "q"])
        Makie.update_state_before_display!(fig)
        w = @test_logs masque(fig)
        L = only(filter(L -> L["id"] == "text", w.manifest["layers"]))
        @test L["kind"] == "rects" && sort(L["order"]) == [0, 1]
        @test L["payloads"][1] == (; text = "p", index = 1, x = 1.0, y = 1.0, z = 1.0)
    end

    @testset "text on a 2D Axis ships no order" begin
        fig = Figure(; size = (500, 400))
        ax = Axis(fig[1, 1])
        text!(ax, [1.0, 2.0], [1.0, 2.0]; text = ["p", "q"])
        w = masque(fig)
        L = only(w.manifest["layers"])
        @test !haskey(L, "order")
    end
end
