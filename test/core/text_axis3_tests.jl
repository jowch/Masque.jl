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

    @testset "overlapping labels: the one drawn on top is first" begin
        fig = Figure(; size = (600, 450))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, limits = (0, 2, 0, 2, 0, 2))
        anchors = [Point3f(0.2, 0.2, 0.2), Point3f(1.8, 1.8, 1.8), Point3f(1.0, 1.0, 1.0)]
        t = text!(ax, anchors; text = ["a", "b", "c"], fontsize = 18)
        _, _, ctx = ctx_for(fig)
        # CairoMakie paints labels in list order, so the last one listed is on top.
        @test !ctx.depth_test
        @test only(hitlayers(TextInteractable(ax, t), ctx)).order == [2, 1, 0]
        # A backend that depth-tests text puts the nearest first.
        wctx = InteractionContext(
            ctx.project, ctx.transforms, ctx.ids, ctx.width, ctx.height, ctx.scaling, ctx.display_scale, 1.0, true,
        )
        L = only(hitlayers(TextInteractable(ax, t), wctx))
        _, _, depth = Masque._project_depth(ctx, ax, anchors)
        @test L.order == sortperm(depth) .- 1
        @test L.order != [2, 1, 0]
    end

    @testset "Cairo: the label listed last covers a nearer one listed first" begin
        # "near" (blue) sits between "far" (red) and the camera. Cairo paints them in list order,
        # so far shows more red in the overlap when it is listed last than when it is listed
        # first, though it is farther, and the order puts the last listed first either way.
        el, az = 0.5, 0.4
        function overlap_red(listed)
            fig = Figure(; size = (600, 450))
            ax = Axis3(fig[1, 1]; azimuth = az, elevation = el, limits = (0, 4, 0, 4, 0, 4))
            far = Point3f(2, 2, 2)
            pos = Dict(:far => far, :near => far + 1.2f0 * Vec3f(cos(el) * cos(az), cos(el) * sin(az), sin(el)))
            col = Dict(:far => :red, :near => :blue)
            t = text!(
                ax, [pos[k] for k in listed]; text = fill("MMMM", 2), color = [col[k] for k in listed],
                fontsize = 40, align = (:center, :center),
            )
            _, ppu, ctx = ctx_for(fig)
            L = only(hitlayers(TextInteractable(ax, t), ctx))
            @test L.order == [1, 0]
            img = Makie.colorbuffer(fig; px_per_unit = ppu)
            b1, b2 = boxof(L.geometry, 1), boxof(L.geometry, 2)
            return count(p -> inbox(p, b1; pad = 0) && inbox(p, b2; pad = 0), redpx(img))
        end
        # About 5300 red pixels against 3500 with this camera.
        @test overlap_red([:near, :far]) > 1.25 * overlap_red([:far, :near])
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

    @testset "2D positions on an Axis3" begin
        fig = Figure(; size = (500, 400))
        ax = Axis3(fig[1, 1]; limits = (0, 3, 0, 3, -1, 1))
        t = text!(ax, [1.0, 2.0], [1.0, 2.0]; text = ["a", "b"])
        ti = TextInteractable(ax, t)
        @test ti.payloads[2] == (; text = "b", index = 2, x = 2.0, y = 2.0)
        w = @test_logs masque(fig)
        L = only(w.manifest["layers"])
        @test L["kind"] == "rects" && sort(L["order"]) == [0, 1]
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
