using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# The browser's :surface hit test (frontend/src/surface.ts), ported so a test can ask which
# shipped point answers a pixel: quads in `order`, first one containing the pixel, its corner
# nearest the pixel. Returns the shipped point index (1-based) and the quad's position in
# `order`, or nothing.
function quad_corners(g, q)
    ni = g["ni"]
    a, b = q % (ni - 1), q ÷ (ni - 1)
    k0 = a + b * ni + 1
    return (k0, k0 + 1, k0 + ni, k0 + ni + 1)
end
function in_quad(g, q, px, py)
    xy = g["xy"]
    P(k) = (Float64(xy[2k - 1]), Float64(xy[2k]))
    cross(o, a, p) = (p[1] - a[1]) * (o[2] - a[2]) - (o[1] - a[1]) * (p[2] - a[2])
    function intri(p, a, b, c)
        d1, d2, d3 = cross(a, b, p), cross(b, c, p), cross(c, a, p)
        return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
    end
    c0, c1, c2, c3 = P.(quad_corners(g, q))
    return intri((px, py), c0, c1, c3) || intri((px, py), c0, c3, c2)
end
function surface_hit(g, px, py)
    xy = g["xy"]
    for (pos, q) in enumerate(g["order"])
        in_quad(g, q, px, py) || continue
        ks = quad_corners(g, q)
        k = ks[argmin([(xy[2k - 1] - px)^2 + (xy[2k] - py)^2 for k in ks])]
        return k, pos
    end
    return nothing
end

bump(n; lo = -3, hi = 3) = (xs = range(lo, hi; length = n); (xs, xs, [exp(-(a^2 + b^2) / 2) for a in xs, b in xs]))

@testset "SurfaceInteractable" begin
    @testset "geometry lands on the drawn surface (Cairo)" begin
        xs, ys, zs = bump(12)
        fig = Figure(; size = (600, 450))
        ax = Axis3(fig[1, 1])
        p = surface!(ax, xs, ys, zs; colormap = [:red, :red])
        _, ppu, ctx = ctx_for(fig)
        L = only(hitlayers(SurfaceInteractable(ax, p), ctx))
        g = L.geometry
        @test L.kind === :surface && L.id === :surface
        @test (g["ni"], g["nj"]) == (12, 12)
        @test g["i"] == 0:11 && g["j"] == 0:11
        @test length(g["xy"]) == 2 * 144 && length(g["z"]) == 144
        @test g["x"] ≈ xs && g["y"] ≈ ys
        @test !haskey(g, "value")
        @test sort(g["order"]) == 0:(11 * 11 - 1)   # every quad is drawn
        # The batch projection is the closure's, point for point (to the pixel `_q` rounds to).
        for (k, (a, b)) in enumerate((a, b) for b in 1:12 for a in 1:12)
            q = Masque.data_to_image_px(ctx, ax, (xs[a], ys[b], zs[a, b]))
            @test abs(g["xy"][2k - 1] - q[1]) <= 0.5 && abs(g["xy"][2k] - q[2]) <= 0.5
        end
        img = Makie.colorbuffer(fig; px_per_unit = ppu)
        @test all(drawn_near(img, g["xy"][2k - 1], g["xy"][2k]; tol = 2) for k in 1:144)
    end

    @testset "the visible side answers (depth order matches the picture)" begin
        # A tall bump seen from low elevation hides the floor behind it. The bump is red, the
        # floor blue; every pixel the ported hit test answers must show the answer's colour.
        n = 30
        xs, ys, zs = bump(n)
        zs = 3 .* zs
        fig = Figure(; size = (600, 450))
        ax = Axis3(fig[1, 1]; elevation = 0.12, azimuth = 1.2π)
        onbump = Float64[z > 0.4 for z in zs]
        surface!(ax, xs, ys, zs; color = onbump, colormap = [:blue, :red], colorrange = (0, 1), shading = NoShading)
        _, ppu, ctx = ctx_for(fig)
        L = only(hitlayers(only(interactables(ax)), ctx))
        g = L.geometry
        @test haskey(g, "value") && g["value"] == vec(Float32.(onbump))
        img = Makie.colorbuffer(fig; px_per_unit = ppu)
        isred(c) = Makie.red(c) > 0.6 && Makie.blue(c) < 0.4
        isblue(c) = Makie.blue(c) > 0.6 && Makie.red(c) < 0.4
        vp = ctx.transforms[L.axis].viewport
        agree = 0; checked = 0; behind = 0
        for py in round(Int, vp[2]):6:round(Int, vp[2] + vp[4]), px in round(Int, vp[1]):6:round(Int, vp[1] + vp[3])
            h = surface_hit(g, px, py)
            h === nothing && continue
            k, pos = h
            c = img[py, px]
            (isred(c) || isblue(c)) || continue   # an edge or a grid line
            # A quad further back is also under the pointer: a real overlap.
            any(q -> in_quad(g, q, px, py), @view g["order"][(pos + 1):end]) && (behind += 1)
            checked += 1
            agree += (g["value"][k] == 1) == isred(c)
        end
        @test behind > 20         # real overlaps were tested
        @test checked > 200
        @test agree / checked > 0.97
    end

    @testset "NaN holes, clipping, matrix grids, payloads" begin
        xs, ys, zs = bump(10)
        zn = copy(zs); zn[4:5, 4:5] .= NaN
        fig = Figure(; size = (500, 400))
        ax = Axis3(fig[1, 1])
        surface!(ax, xs, ys, zn)
        _, _, ctx = ctx_for(fig)
        g = only(hitlayers(SurfaceInteractable(ax, xs, ys, zn), ctx)).geometry
        # A point not drawn ships NaN; every quad touching one is left out of `order`.
        @test isnan(g["xy"][2 * (4 + 3 * 10) - 1])
        @test length(g["order"]) == 81 - 9   # the 3×3 quads around the 2×2 hole
        # A corner outside the axis limits drops the quad, as CairoMakie draws it.
        zlims!(ax, 0, 0.5)
        _, _, ctx = ctx_for(fig)
        g2 = only(hitlayers(SurfaceInteractable(ax, xs, ys, zs), ctx)).geometry
        @test 0 < length(g2["order"]) < 81
        @test all(isnan, g2["xy"][2k - 1] for k in 1:100 if zs[(k - 1) % 10 + 1, (k - 1) ÷ 10 + 1] > 0.5 + 1.0e-3)

        # Matrix x/y ship one per point; value and payloads are per shipped point.
        X = [a + 0.1b for a in 1:4, b in 1:3]; Y = [b + 0.0a for a in 1:4, b in 1:3]; Z = X .* Y
        f3 = Figure(); a3 = Axis3(f3[1, 1])
        surface!(a3, X, Y, Z)
        _, _, c3 = ctx_for(f3)
        si = SurfaceInteractable(a3, X, Y, Z; value = 2 .* Z, payloads = (i, j) -> (; name = "p$(i)$(j)"))
        L3 = only(hitlayers(si, c3))
        @test L3.geometry["x"] == vec(Float32.(X)) && length(L3.geometry["y"]) == 12
        @test L3.geometry["value"] == vec(Float32.(2 .* Z))
        @test L3.payloads[2 + 4] == (; name = "p22")
        ev = Masque.transform_bond(si, L3, nothing, Dict("i" => 1, "j" => 1, "value" => Z[2, 2]))
        @test ev isa GridCellEvent && (ev.i, ev.j) == (2, 2) && ev.value == Z[2, 2]
        @test ev.name == "p22" && Z[ev] == Z[2, 2]
        @test_throws ArgumentError SurfaceInteractable(a3, X, Y, Z; payloads = zeros(2, 2))
        @test_throws ArgumentError SurfaceInteractable(a3, 1:3, 1:3, Z)
        @test_throws ArgumentError SurfaceInteractable(a3, X, Y, Z; value = fill(:red, 4, 3))
        @test_throws ArgumentError SurfaceInteractable(a3, X, Y, Z; tooltip = true)
    end

    @testset "dense grids thin to a fixed stride" begin
        n = 1000
        xs = range(0, 1; length = n)
        zs = [sin(4a) * cos(3b) for a in xs, b in xs]
        fig = Figure(; size = (600, 450))
        ax = Axis3(fig[1, 1])
        p = surface!(ax, xs, xs, zs)
        _, _, ctx = ctx_for(fig)
        vp = ctx.transforms[Masque.axis_id(ctx, ax)].viewport
        cap = floor(Int, max(vp[3], vp[4]) * ctx.display_scale / Masque.SURFACE_MIN_SCREEN_PX)
        g = only(hitlayers(SurfaceInteractable(ax, p), ctx)).geometry
        @test g["ni"] == g["nj"] <= cap + 1
        @test g["i"][end] == n - 1 && g["i"][1] == 0
        @test g["i"] == g["j"]
        # The stride depends on the axis size only: a new view ships the same points.
        ax.azimuth[] = 0.3; ax.elevation[] = 1.0
        _, _, ctx2 = ctx_for(fig)
        g2 = only(hitlayers(SurfaceInteractable(ax, p), ctx2)).geometry
        @test g2["i"] == g["i"] && g2["j"] == g["j"]
        @test g2["xy"] != g["xy"]
        # A grid smaller than the cap ships whole.
        @test Masque._surface_stride(50, cap) == 1:50
    end

    @testset "masque(fig): surface layer, wireframe decoration, 2D skip" begin
        xs, ys, zs = bump(8)
        fig = Figure()
        ax = Axis3(fig[1, 1])
        surface!(ax, xs, ys, zs)
        wireframe!(ax, xs, ys, zs)                  # same grid: decoration
        wireframe!(ax, xs, ys, zs .+ 1)             # another grid: its own layer
        ints = interactables(fig)
        @test count(i -> i isa SurfaceInteractable, ints) == 1
        @test count(i -> i isa SegmentInteractable, ints) == 1
        w = masque(fig)
        layers = w.manifest["layers"]
        surf = only(l for l in layers if l["kind"] == "surface")
        @test surf["bond"] == "gridcell" && surf["id"] == "surface"

        f2 = Figure(); a2 = Axis(f2[1, 1])
        surface!(a2, xs, ys, zs)
        ints2 = @test_logs (:warn, r"surface on a 2D Axis") match_mode = :any interactables(f2)
        @test isempty(ints2)
        @test validate(SurfaceInteractable(a2, xs, ys, zs), ctx_for(f2)[3]) isa String

        # Templates are checked against the point's own fields.
        @test_throws ArgumentError build_manifest(
            [SurfaceInteractable(ax, xs, ys, zs; tooltip = masque"$(nope)")], ctx_for(fig)[3],
        )
        d = build_manifest([SurfaceInteractable(ax, xs, ys, zs; tooltip = masque"$(x), $(z)")], ctx_for(fig)[3])
        @test haskey(only(d["layers"]), "template")
    end

    @testset "drag frames leave the surface out; the release frame ships it" begin
        xs, ys, zs = bump(20)
        fig = Figure(; size = (400, 300))
        ax = Axis3(fig[1, 1])
        surface!(ax, xs, ys, zs)
        w = masque(fig, ViewInteractable(ax))
        drag = w.render_frame(Dict("id" => "view", "azimuth" => 0.5, "elevation" => 0.4, "settle" => false))
        s = only(l for l in drag["manifest"]["layers"] if l["kind"] == "surface")
        @test s["geometry"] == Dict("suspended" => true) && isempty(s["payloads"])
        settle = w.render_frame(Dict("id" => "view", "azimuth" => 0.5, "elevation" => 0.4, "settle" => true))
        s2 = only(l for l in settle["manifest"]["layers"] if l["kind"] == "surface")
        @test s2["geometry"]["ni"] == 20 && length(s2["geometry"]["order"]) == 19^2
        # A template naming the point's fields still builds while the layer is suspended.
        f2 = Figure(; size = (400, 300)); a2 = Axis3(f2[1, 1])
        p2 = surface!(a2, xs, ys, zs; color = zs .^ 2)
        w2 = masque(f2, ViewInteractable(a2), SurfaceInteractable(a2, p2; tooltip = masque"$(z) $(value)"))
        d2 = w2.render_frame(Dict("id" => "view", "azimuth" => 0.5, "elevation" => 0.4, "settle" => false))
        s3 = only(l for l in d2["manifest"]["layers"] if l["kind"] == "surface")
        @test s3["geometry"] == Dict("suspended" => true) && haskey(s3, "template")
    end
end
