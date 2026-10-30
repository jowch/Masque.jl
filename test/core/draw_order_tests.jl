using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# Where marks overlap, the overlay answers with the one drawn on top (#331, #340). These
# render with CairoMakie and compare the colour painted at a pixel with the element the
# overlay would test first there.

colour_at(img, x, y) = img[round(Int, y), round(Int, x)]
isred(c) = Float64(Makie.red(c)) > 0.6 && Float64(Makie.green(c)) < 0.4 && Float64(Makie.blue(c)) < 0.4
isblue(c) = Float64(Makie.blue(c)) > 0.6 && Float64(Makie.red(c)) < 0.4 && Float64(Makie.green(c)) < 0.4

# The 1-based element a `:circles` layer answers at image px (x, y), as `hitLayer` in
# frontend/src/geometry.ts tests them: `order` first to last, else the last listed first; the
# drawn `ellipses` first, then inside a circle, then within its `tol` reach.
function circle_hit(L, x, y; tol = 4)
    g = Float64.(L.geometry)
    ks = L.order === nothing ? reverse(1:(length(g) ÷ 3)) : L.order .+ 1
    if L.ellipses !== nothing
        e = Float64.(L.ellipses)
        for k in ks
            sxx, sxy, syy = e[3k - 2], e[3k - 1], e[3k]
            det = sxx * syy - sxy^2
            det > 0 || continue
            dx, dy = x - g[3k - 2], y - g[3k - 1]
            syy * dx^2 - 2 * sxy * dx * dy + sxx * dy^2 <= det && return k
        end
    end
    for reach in (0, tol), k in ks
        cx, cy, r = g[3k - 2], g[3k - 1], g[3k]
        (x - cx)^2 + (y - cy)^2 <= (r + reach)^2 && return k
    end
    return nothing
end
centre(L, k) = (Float64(L.geometry[3k - 2]), Float64(L.geometry[3k - 1]))
midpoint(a, b) = ((a[1] + b[1]) / 2, (a[2] + b[2]) / 2)

@testset "hover answers with the mark drawn on top" begin
    @testset "2D scatter: the marker listed last is painted over the other" begin
        fig = Figure(; size = (400, 300))
        ax = Axis(fig[1, 1]; limits = (0, 2, 0, 2))
        s = scatter!(ax, [1.0, 1.08], [1.0, 1.0]; color = [:red, :blue], markersize = 40)
        _, ppu, ctx = ctx_for(fig)
        L = only(hitlayers(only(interactables(ax, s)), ctx))
        @test L.order === nothing
        m = midpoint(centre(L, 1), centre(L, 2))
        @test isblue(colour_at(Makie.colorbuffer(fig; px_per_unit = ppu), m...))
        @test circle_hit(L, m...) == 2
    end

    @testset "2D text: the label listed last is painted over the other (#340)" begin
        function overlap(colours)
            fig = Figure(; size = (500, 300))
            ax = Axis(fig[1, 1]; limits = (0.5, 2, 0.5, 1.5))
            t = text!(ax, [Point2f(1, 1), Point2f(1.05, 1)]; text = ["MMMM", "MMMM"], color = colours, fontsize = 40)
            _, ppu, ctx = ctx_for(fig)
            L = only(hitlayers(TextInteractable(ax, t), ctx))
            @test L.order === nothing
            g = Float64.(L.geometry)
            (c1x, c1y, w1, h1), (c2x, c2y, w2, h2) = g[1:4], g[5:8]
            xs = max(c1x - w1 / 2, c2x - w2 / 2):min(c1x + w1 / 2, c2x + w2 / 2)
            ys = max(c1y - h1 / 2, c2y - h2 / 2):min(c1y + h1 / 2, c2y + h2 / 2)
            @test length(xs) > 20 && length(ys) > 20   # the boxes overlap
            img = Makie.colorbuffer(fig; px_per_unit = ppu)
            cs = [colour_at(img, x, y) for x in xs, y in ys]
            return count(isred, cs), count(isblue, cs)
        end
        # The last-listed label's colour fills the overlap, whichever colour that is.
        red, blue = overlap([:red, :blue])
        @test blue > 1.5 * red
        red, blue = overlap([:blue, :red])
        @test red > 1.5 * blue
    end

    @testset "2D poly: the shape listed last is painted over the other" begin
        fig = Figure(; size = (400, 300))
        ax = Axis(fig[1, 1]; limits = (0, 3, 0, 3))
        p = poly!(ax, [Rect2f(0.5, 0.5, 1, 1), Rect2f(1, 1, 1, 1)]; color = [:red, :blue])
        _, ppu, ctx = ctx_for(fig)
        q = Masque.data_to_image_px(ctx, ax, (1.25, 1.25))
        @test isblue(colour_at(Makie.colorbuffer(fig; px_per_unit = ppu), q...))
        @test only(hitlayers(only(interactables(ax, p)), ctx)).kind === :polygons
    end

    # Two marks on an Axis3: `front` sits between `back` and the camera, listed first.
    el, az = 0.5, 0.4
    toward = Makie.Vec3f(cos(el) * cos(az), cos(el) * sin(az), sin(el))
    back = Makie.Point3f(2, 2, 2)
    front = back + 0.6f0 * toward + Makie.Vec3f(0, 0.3, 0)
    axis3(fig) = Axis3(fig[1, 1]; azimuth = az, elevation = el, limits = (0, 4, 0, 4, 0, 4))

    @testset "Axis3 scatter: Cairo paints markers in list order" begin
        fig = Figure(; size = (500, 400))
        ax = axis3(fig)
        s = scatter!(ax, [front, back]; color = [:blue, :red], markersize = 60)
        _, ppu, ctx = ctx_for(fig)
        L = only(hitlayers(only(interactables(ax, s)), ctx))
        @test L.order === nothing
        m = midpoint(centre(L, 1), centre(L, 2))
        # The back marker is painted over the front one, so it answers.
        @test isred(colour_at(Makie.colorbuffer(fig; px_per_unit = ppu), m...))
        @test circle_hit(L, m...) == 2
        # WebGL depth-tests markers: the nearest is on top whatever the list order.
        wctx = InteractionContext(
            ctx.project, ctx.transforms, ctx.ids, ctx.width, ctx.height, ctx.scaling, ctx.display_scale, 1.0, true,
        )
        W = only(hitlayers(only(interactables(ax, s)), wctx))
        @test W.order == [0, 1]
        @test circle_hit(W, m...) == 1
    end

    @testset "Axis3 meshscatter: Cairo paints spheres far to near (#331)" begin
        fig = Figure(; size = (500, 400))
        ax = axis3(fig)
        s = meshscatter!(ax, [front, back]; color = [:blue, :red], markersize = 0.5, shading = NoShading)
        _, ppu, ctx = ctx_for(fig)
        L = only(hitlayers(only(interactables(ax, s)), ctx))
        @test L.order == [0, 1]
        m = midpoint(centre(L, 1), centre(L, 2))
        @test isblue(colour_at(Makie.colorbuffer(fig; px_per_unit = ppu), m...))
        @test circle_hit(L, m...) == 1
    end

    @testset "Axis3 meshscatter: the overlay picks the painted sphere (#331)" begin
        # #331's measurement: a 6×6 grid of overlapping spheres, each its own colour. Of the
        # pixels painted in one sphere's colour, count those where the overlay would pick
        # another. Circles in index order got 87% of them wrong, circles front to back 41%
        # (Axis3 stretches each sphere into an ellipse its hit circle reaches past), and the
        # ellipses front to back under 1%.
        n = 6
        pts = vec([Makie.Point3f(i, j, 0.5 * (i + j) / n) for i in 1:n, j in 1:n])
        cols = [Makie.RGBf((k % 6) / 5, ((k ÷ 6) % 6) / 5, 0.5) for k in 0:(n^2 - 1)]
        fig = Figure(; size = (500, 450))
        ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5)
        s = meshscatter!(ax, pts; color = cols, markersize = 0.8, shading = NoShading)
        _, ppu, ctx = ctx_for(fig)
        L = only(hitlayers(only(interactables(ax, s)), ctx))
        @test sort(L.order) == 0:(n^2 - 1)
        @test length(L.ellipses) == 3 * n^2
        img = Makie.colorbuffer(fig; px_per_unit = ppu)
        dist(c, d) = abs(Makie.red(c) - Makie.red(d)) + abs(Makie.green(c) - Makie.green(d)) + abs(Makie.blue(c) - Makie.blue(d))
        wrong = right = 0
        for y in axes(img, 1), x in axes(img, 2)
            painted = findfirst(c -> dist(img[y, x], c) < 0.02, cols)
            painted === nothing && continue
            hit = circle_hit(L, x, y)
            hit === nothing && continue
            hit == painted ? (right += 1) : (wrong += 1)
        end
        @test right > 10_000
        @test wrong < 0.02 * (right + wrong)
    end

    @testset "each layer carries its plot's place in the drawing order (#462)" begin
        # The fade reads `draw` to tell which of two crossing marks is on top. The manifest's
        # own order is the hit-test precedence: the plot drawn last first, or as a list names them.
        draw(m) = Dict(d["id"] => get(d, "draw", nothing) for d in m["layers"])
        fig = Figure(; size = (400, 300))
        ax = Axis(fig[1, 1])
        xs = 0:0.5:3
        l1 = lines!(ax, xs, xs .^ 2; label = "quad")
        l2 = lines!(ax, xs, 2 .* xs; label = "lin")
        sc = scatter!(ax, [0.5, 1.5], [1.0, 3.0]; label = "pts")
        axislegend(ax)
        auto = draw(masque(fig).manifest)
        @test auto["lines"] < auto["lines_2"] < auto["scatter"]
        ints = [SegmentInteractable(ax, l1; id = :lines), SegmentInteractable(ax, l2; id = :lines_2), PointInteractable(ax, sc; id = :scatter)]
        d = draw(masque(fig, ints).manifest)
        @test d["lines"] < d["lines_2"] < d["scatter"]
        # Layers listed by hand with `auto = false` name no plots: no `draw`, and the fade puts
        # no layer back over another.
        @test all(isnothing, values(draw(masque(fig, ints; auto = false).manifest)))
        # A z translation draws a plot over those added after it.
        translate!(l1, 0, 0, 1)
        @test draw(masque(fig).manifest)["lines"] > draw(masque(fig).manifest)["scatter"]
    end
end
