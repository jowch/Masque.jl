using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# An unknown recipe whose only child is a data-space Scatter, which the child walk refuses.
# Types can't be defined inside a testset.
Makie.@recipe DataDots (positions,) begin
end
function Makie.plot!(p::DataDots)
    scatter!(p, p.positions; markerspace = :data, markersize = 0.2)
    return p
end

@testset "Introspection" begin
    @testset "M2.1 plot-introspection constructors" begin
        # An introspected interactable must produce the SAME hitlayers as the explicit one a
        # user would hand-write — introspection is sugar over M1, not a parallel path.
        geom(int, c) = (L = only(hitlayers(int, c)); (L.kind, L.geometry, length(L.payloads)))

        @testset "scatter -> Point" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            p = scatter!(a, [1.0, 2.0, 3.0], [1.0, 4.0, 9.0]; markersize = 20)
            _, _, c = ctx_for(f)
            # markersize=20, default :circle marker draws a disc of diameter 0.705*markersize
            # (Makie.default_marker_map()[:circle]'s BezierPath bbox) -> radius 0.3525*20 = 7.05
            @test geom(PointInteractable(a, p), c) == geom(PointInteractable(a, p.converted[][1]; radius = 0.3525 * 20), c)
            @test only(hitlayers(PointInteractable(a, p), c)).id === :scatter
            # geometry lands on a rendered marker
            g = only(hitlayers(PointInteractable(a, p), c)).geometry
            img = Makie.colorbuffer(f; px_per_unit = 2.0)
            @test drawn_near(img, g[1], g[2])
        end

        @testset "scatter radius derived from marker's drawn extent" begin
            f = Figure(size = (200, 200)); a = Axis(f[1, 1])
            p_circle = scatter!(a, [1.0], [1.0]; marker = :circle, markersize = 22)
            @test Masque._marker_radius(p_circle) ≈ 0.3525 * 22
            p_char = scatter!(a, [1.0], [1.0]; marker = '●', markersize = 22)
            @test Masque._marker_radius(p_char) == 22 / 2   # conservative fallback: unreadable bbox
            p_img = scatter!(a, [1.0], [1.0]; marker = rand(4, 4), markersize = 22)
            @test Masque._marker_radius(p_img) == 22 / 2   # image marker: same fallback
            # GeometryBasics Circle/Rect: Makie never rescales these by their own geometry (the
            # instance's radius/widths are ignored), so a non-unit instance draws at exactly
            # markersize the same as the TYPE form.
            GB = Masque._GB
            p_circle_inst = scatter!(a, [1.0], [1.0]; marker = GB.Circle(GB.Point2f(0), 3.0f0), markersize = 22)
            @test Masque._marker_radius(p_circle_inst) == 22 / 2
            p_rect_inst = scatter!(a, [1.0], [1.0]; marker = GB.Rect(0.0f0, 0.0f0, 2.0f0, 3.0f0), markersize = 22)
            @test Masque._marker_radius(p_rect_inst) == 22 / 2
            p_circle_type = scatter!(a, [1.0], [1.0]; marker = GB.Circle, markersize = 22)
            @test Masque._marker_radius(p_circle_type) == 22 / 2
            p_rect_type = scatter!(a, [1.0], [1.0]; marker = GB.Rect, markersize = 22)
            @test Masque._marker_radius(p_rect_type) == 22 / 2
        end

        @testset "scatter radius fails loud on non-:pixel markerspace" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            p = scatter!(a, [1.0, 2.0], [1.0, 2.0]; markersize = 0.3, markerspace = :data)
            @test_throws ErrorException PointInteractable(a, p)        # can't derive radius
            @test PointInteractable(a, p; radius = 8) isa PointInteractable  # explicit radius is fine
            # The points form finds that same scatter and fails the same way.
            @test_throws ErrorException PointInteractable(a, [(1.0, 1.0), (2.0, 2.0)])
            @test PointInteractable(a, [(1.0, 1.0), (2.0, 2.0)]; radius = 8).radius == 8
        end

        @testset "points constructor hugs a matching scatter" begin
            # Getting-started shape: points next to scatter!(markersize = 18), not radius = 9.
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            pts = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0)]
            p = scatter!(a, first.(pts), last.(pts); markersize = 18)
            pin = PointInteractable(a, pts)
            @test pin.radius ≈ Masque._marker_radius(p)
            @test pin.radius ≈ 0.3525 * 18
            @test pin.radius < 9
            xs = [10.0, 20.0]; ys = [1.0, 2.0]
            scatter!(a, xs, ys; markersize = 18)
            @test PointInteractable(a, collect(zip(xs, ys))).radius ≈ 0.3525 * 18
            # An explicit radius wins over the lookup.
            @test PointInteractable(a, pts; radius = 4).radius == 4.0
            # A marker with no readable bbox keeps markersize/2 — the lookup does not invent a disc.
            ac = Axis(f[1, 2])
            scatter!(ac, [1.0], [1.0]; marker = '●', markersize = 22)
            @test PointInteractable(ac, [(1.0, 1.0)]).radius == 11.0
            # No scatter, or positions that are not that scatter's, assume default :circle.
            an = Axis(f[2, 1])
            @test PointInteractable(an, [(1.0, 2.0)]).radius ≈ Masque._default_circle_radius()
            @test Masque._default_circle_radius() ≈ 0.3525 * Float64(Makie.theme(:markersize)[])
            scatter!(an, [1.0], [1.0]; markersize = 40)
            @test PointInteractable(an, [(9.0, 9.0)]).radius ≈ Masque._default_circle_radius()
            # Reversed order is a different element mapping, so it does not match.
            ar = Axis(f[2, 2])
            scatter!(ar, [1.0, 2.0], [3.0, 4.0]; markersize = 40)
            @test PointInteractable(ar, [(2.0, 4.0), (1.0, 3.0)]).radius ≈ Masque._default_circle_radius()
            # Two scatters at the same positions: don't guess. Default :circle, and say so.
            aa = Axis(f[3, 1])
            both = [(1.0, 1.0), (2.0, 2.0)]
            scatter!(aa, first.(both), last.(both); markersize = 20)
            scatter!(aa, first.(both), last.(both); markersize = 30)
            amb = nothing
            @test_logs (:warn, r"highlight radius is ambiguous") amb = PointInteractable(aa, both)
            @test amb.radius ≈ Masque._default_circle_radius()
            # A scatterlines! child scatter is the drawn marker, not the recipe object.
            al = Axis(f[3, 2])
            sl = [(0.0, 1.0), (1.0, 2.0), (2.0, 0.5)]
            scatterlines!(al, first.(sl), last.(sl); markersize = 16)
            @test PointInteractable(al, sl).radius ≈ 0.3525 * 16
            # A stem! child scatter is the drawn marker too, not the recipe object.
            ast = Axis(f[4, 1])
            st = [(1.0, 3.0), (2.0, 4.0)]
            stem!(ast, first.(st), last.(st); markersize = 16)
            @test PointInteractable(ast, st).radius ≈ 0.3525 * 16
            # Axis3 and PolarAxis store the same positions the points constructor compares.
            f3 = Figure(size = (400, 300)); ax3 = Axis3(f3[1, 1])
            p3 = [(1.0, 2.0, 3.0), (4.0, 5.0, 6.0)]
            scatter!(ax3, p3; markersize = 12)
            @test PointInteractable(ax3, p3).radius ≈ 0.3525 * 12
            fp = Figure(size = (400, 300)); axp = PolarAxis(fp[1, 1])
            pp = [(0.0, 1.0), (π / 2, 2.0)]
            scatter!(axp, pp; markersize = 22)
            @test PointInteractable(axp, pp).radius ≈ 0.3525 * 22
        end

        @testset "per-point markersize -> per-point radius" begin
            # Makie converts a per-point markersize vector to `Vector{Vec2f}`; that used to
            # throw a MethodError and take the whole widget down (graphplot's `node_size`).
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            p = scatter!(a, [1.0, 2.0, 3.0], [1.0, 4.0, 9.0]; markersize = [10, 20, 30])
            q = scatter!(a, [5.0, 6.0], [1.0, 2.0]; markersize = (8, 24))   # one non-square size
            _, _, c = ctx_for(f)
            @test PointInteractable(a, p).radius ≈ 0.3525 .* [10, 20, 30]
            L = only(hitlayers(PointInteractable(a, p), c))
            rs = L.geometry[3:3:end]
            @test rs[1] < rs[2] < rs[3]
            @test geom(PointInteractable(a, p), c) == geom(PointInteractable(a, p.converted[][1]; radius = 0.3525 .* [10, 20, 30]), c)
            @test PointInteractable(a, q).radius ≈ 0.3525 * 24
            # the points constructor picks the per-point radii up from the matching scatter
            @test PointInteractable(a, [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0)]).radius ≈ 0.3525 .* [10, 20, 30]
            @test_throws ArgumentError PointInteractable(a, [(1.0, 1.0)]; radius = [3, 4])
            @test length(masque(f).manifest["layers"]) == 2
        end

        @testset "lines -> one whole line, linesegments -> (:pairs)" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            pl = lines!(a, [0.0, 1.0, 2.0, 3.0], [0.0, 2.0, 1.0, 3.0])
            ps = linesegments!(a, [Point2f(0, 0), Point2f(1, 1), Point2f(2, 0), Point2f(3, 1)])
            _, _, c = ctx_for(f)
            # The plot object is one element. The raw vertex constructor stays per-segment.
            L = only(hitlayers(SegmentInteractable(a, pl), c))
            raw = only(hitlayers(SegmentInteractable(a, pl.converted[][1]; mode = :polyline), c))
            whole = only(hitlayers(SegmentInteractable(a, pl.converted[][1]; mode = :polyline, unit = :line), c))
            @test L.kind === :lines && length(L.payloads) == 1 && L.payloads[1] == (; index = 1)
            @test L.geometry == whole.geometry && length(L.geometry) == 1
            @test raw.kind === :polyline && length(raw.payloads) == 3
            @test raw.payloads[1] == (; segment_index = 1)
            @test only(hitlayers(SegmentInteractable(a, ps), c)).kind === :segments
            # A NaN gap stays inside the one line; it does not become a second element.
            pg = lines!(a, [0.0, NaN, 2.0], [0.0, NaN, 1.0])
            Lg = only(hitlayers(SegmentInteractable(a, pg), c))
            @test Lg.kind === :lines && length(Lg.payloads) == 1 && length(Lg.geometry) == 1
            @test any(isnan, Lg.geometry[1])
            w = masque(f; selected = Dict(:lines => [1]))
            line = only(filter(d -> d["id"] == "lines", w.manifest["layers"]))
            @test line["selected"] == [0] && length(line["payloads"]) == 1
            @test_throws ArgumentError masque(f; selected = Dict(:lines => [2]))
            ev = Masque.APD.Bonds.transform_value(w, Dict("layer" => "lines", "index" => 0))
            @test ev isa ElementEvent && ev.index == 1 && ev.payload == (; index = 1)
        end

        @testset "heatmap/image -> GridInteractable, incl. EndPoints expansion" begin
            z = [Float64((i + j) % 5) for i in 1:4, j in 1:3]
            # explicit coords: Makie hands back full edge vectors
            f1 = Figure(size = (500, 350)); a1 = Axis(f1[1, 1]); p1 = heatmap!(a1, 1:4, 1:3, z)
            _, _, c1 = ctx_for(f1)
            @test geom(GridInteractable(a1, p1), c1) ==
                geom(GridInteractable(a1, collect(0.5:1:4.5), collect(0.5:1:3.5), z), c1)
            # coordinate-free: converted gives EndPoints (length 2) -> we expand to n+1 edges
            f2 = Figure(size = (500, 350)); a2 = Axis(f2[1, 1]); p2 = heatmap!(a2, z)
            _, _, c2 = ctx_for(f2)
            @test geom(GridInteractable(a2, p2), c2) ==
                geom(GridInteractable(a2, collect(0.5:1:4.5), collect(0.5:1:3.5), z), c2)
            # image! shares the method body but advertises its own row -> exercise it
            f3 = Figure(size = (500, 350)); a3 = Axis(f3[1, 1]); p3 = image!(a3, rand(4, 3))
            _, _, c3 = ctx_for(f3)
            @test only(hitlayers(GridInteractable(a3, p3), c3)).kind === :grid
            # The defaults build a grid for a heatmap.
            @test only(interactables(f1)) isa GridInteractable
        end

        @testset "deprecated grid forms of RectInteractable return a GridInteractable" begin
            z = [Float64((i + j) % 5) for i in 1:4, j in 1:3]
            f = Figure(size = (500, 350)); a = Axis(f[1, 1]); p = heatmap!(a, 1:4, 1:3, z)
            _, _, c = ctx_for(f)
            g = @test_deprecated RectInteractable(a; grid = (0.5:1:4.5, 0.5:1:3.5, z))
            @test g isa GridInteractable && g.id === :rects
            @test geom(g, c) == geom(GridInteractable(a, 0.5:1:4.5, 0.5:1:3.5, z), c)
            g = @test_deprecated RectInteractable(a, p; tooltip = false)
            @test g isa GridInteractable && g.id === :cells && g.tooltip === false
            @test Masque.bondtype(g) === Masque.GridCellEvent
        end

        @testset "keyword geometry forms of Rect and Region are deprecated" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1]); _, _, c = ctx_for(f)
            rs = [(1.0, 1.0, 0.5, 0.5), (2.0, 2.0, 0.5, 0.5)]
            r = @test_deprecated RectInteractable(a; rects = rs, id = :boxes, payloads = ["p", "q"])
            new = RectInteractable(a, rs; id = :boxes, payloads = ["p", "q"])
            @test r.id === :boxes && r.payloads == new.payloads && geom(r, c) == geom(new, c)
            regs = [(:circle, (1.0, 1.0), 10), (:rect, (2.0, 4.0), 1.0, 2.0)]
            g = @test_deprecated RegionInteractable(a; regions = regs, payloads = ["a", "b"], id = :reg)
            gnew = RegionInteractable(a, regs; payloads = ["a", "b"], id = :reg)
            @test g.id === :reg && g.payloads == gnew.payloads &&
                [L.geometry for L in hitlayers(g, c)] == [L.geometry for L in hitlayers(gnew, c)]
            # the positional form's payloads default to (; index), like the other element kinds
            @test RegionInteractable(a, regs).payloads == [(; index = 1), (; index = 2)]
        end

        @testset "barplot -> Rect(:list), dodge/stack via child rects" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            p = barplot!(a, [1, 2, 3], [3.0, 5.0, 2.0])
            _, _, c = ctx_for(f)
            @test geom(RectInteractable(a, p), c) ==
                geom(RectInteractable(a, [(1.0, 1.5, 0.8, 3.0), (2.0, 2.5, 0.8, 5.0), (3.0, 1.0, 0.8, 2.0)]), c)
            # dodge: 4 distinct laid-out rects pulled from the child Poly (solver already applied)
            fd = Figure(size = (500, 350)); ad = Axis(fd[1, 1])
            pd = barplot!(ad, [1, 1, 2, 2], [3.0, 1.0, 5.0, 2.0]; dodge = [1, 2, 1, 2])
            _, _, cd = ctx_for(fd)
            @test length(only(hitlayers(RectInteractable(ad, pd), cd)).payloads) == 4
        end

        @testset "BarPlot shared bar payloads" begin
            using Masque: RectInteractable
            fig = Figure(); ax = Axis(fig[1, 1])
            barplot!(ax, [1, 2, 3], [3.0, 1.0, 2.0])
            Makie.update_state_before_display!(fig)
            ri = RectInteractable(ax, ax.scene.plots[1]; id = :bars)
            pls = ri.payloads
            @test length(pls) == 3
            @test pls[1] == (; low = 0.0, high = 3.0, value = 3.0)   # bar 1: from-zero, height 3
            @test pls[2] == (; low = 0.0, high = 1.0, value = 1.0)
            @test pls[3] == (; low = 0.0, high = 2.0, value = 2.0)
            @test !haskey(pairs(pls[1]), :index)                     # no redundant index
            @test pls[1].value isa Float64                           # semantic values are Float64

            # horizontal bars (direction = :x): the value runs along x
            figh = Figure(); axh = Axis(figh[1, 1])
            barplot!(axh, [1, 2], [3.0, 5.0]; direction = :x)
            Makie.update_state_before_display!(figh)
            plh = RectInteractable(axh, axh.scene.plots[1]; id = :bars).payloads
            @test plh[1] == (; low = 0.0, high = 3.0, value = 3.0)
            @test plh[2] == (; low = 0.0, high = 5.0, value = 5.0)
        end

        @testset "poly -> Polygon (single ring and vector of rings)" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            single = poly!(a, Point2f[(0, 0), (1, 0), (1, 1), (0, 1)])
            rings = [Point2f[(0, 0), (1, 0), (0.5, 1)], Point2f[(2, 0), (3, 0), (2.5, 1)]]
            multi = poly!(a, rings)
            _, _, c = ctx_for(f)
            @test geom(PolygonInteractable(a, single), c) ==
                geom(PolygonInteractable(a, [[(0.0, 0), (1, 0), (1, 1), (0, 1)]]), c)
            @test length(only(hitlayers(PolygonInteractable(a, multi), c)).payloads) == 2
        end

        @testset "poly from shapes: one element per mesh Makie draws" begin
            GB = Makie.GeometryBasics
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            tri(x) = Point2f[(x, 0), (x + 1, 0), (x + 1, 1)]
            holed = GB.Polygon(Point2f[(0, 0), (4, 0), (4, 4), (0, 4)], [Point2f[(1, 1), (3, 1), (3, 3), (1, 3)]])
            multi = GB.MultiPolygon([GB.Polygon(tri(0)), GB.Polygon(tri(2))])
            cases = [
                (Rect2f(0, 0, 2, 1), 1), ([Rect2f(0, 0, 1, 1), Rect2f(2, 0, 1, 2)], 2),
                (Circle(Point2f(0, 0), 1.0f0), 1), ([Circle(Point2f(0, 0), 1.0f0), Circle(Point2f(3, 0), 0.5f0)], 2),
                (GB.Polygon(tri(0)), 1), ([GB.Polygon(tri(0)), GB.Polygon(tri(2))], 2), (holed, 1),
                # a lone MultiPolygon draws one mesh per polygon; a vector of them, one per entry
                (multi, 2), ([multi, GB.MultiPolygon([GB.Polygon(tri(4))])], 2),
            ]
            plots = [poly!(a, g) for (g, _) in cases]
            _, _, c = ctx_for(f)
            for ((g, n), p) in zip(cases, plots)
                @test length(only(hitlayers(PolygonInteractable(a, p), c)).payloads) == n
            end
            # a rect is its four corners
            @test geom(PolygonInteractable(a, plots[1]), c) ==
                geom(PolygonInteractable(a, [[(0.0, 0), (2, 0), (2, 1), (0, 1)]]), c)
            # a circle is sampled on that circle
            i_circ = PolygonInteractable(a, plots[4])
            for (ring, ctr, r) in zip(i_circ.rings, ((0, 0), (3, 0)), (1.0, 0.5))
                @test length(ring) >= 16
                @test all(q -> isapprox(hypot(q[1] - ctr[1], q[2] - ctr[2]), r; atol = 1.0e-5), ring)
            end
            # a polygon keeps its interior as a hole
            i_holed = PolygonInteractable(a, plots[7])
            xy(ring) = Set((Float64(q[1]), Float64(q[2])) for q in ring)
            @test xy(only(i_holed.rings)) == Set([(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)])
            @test xy(only(only(i_holed.holes))) == Set([(1.0, 1.0), (3.0, 1.0), (3.0, 3.0), (1.0, 3.0)])
            # a vector-of-MultiPolygon entry keeps its second piece, as a further ring
            i_multi = PolygonInteractable(a, plots[9])
            @test length(i_multi.holes[1]) == 1 && isempty(i_multi.holes[2])
            # every default builds, so masque(fig) no longer throws on these
            @test masque(f) isa Masque.MasqueWidget
        end

        @testset "poly from a vector of meshes: one element, hit over its faces" begin
            GB = Makie.GeometryBasics
            # A fan around an interior vertex: the vertex buffer is not an outline.
            pos = Point2f[(0, 0), (2, 0), (2, 2), (0, 2), (1, 1)]
            fan = GB.Mesh(pos, [GB.GLTriangleFace(1, 2, 5), GB.GLTriangleFace(2, 3, 5), GB.GLTriangleFace(3, 4, 5), GB.GLTriangleFace(4, 1, 5)])
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            i = PolygonInteractable(a, poly!(a, [fan]))
            @test length(i.rings) == 1
            rings = vcat([i.rings[1]], i.holes[1])
            @test length(rings) == 4
            crosses(pt, ring) = (
                n = length(ring); inside = false; j = n;
                for k in 1:n
                    (xk, yk), (xj, yj) = ring[k], ring[j]
                    ((yk > pt[2]) != (yj > pt[2])) && pt[1] < (xj - xk) * (pt[2] - yk) / (yj - yk) + xk && (inside = !inside)
                    j = k
                end; inside
            )
            evenodd(pt) = isodd(count(r -> crosses(pt, r), rings))
            # (0.2, 1) is inside the drawn quad but outside the vertex-order ring
            @test evenodd((0.2, 1.0)) && evenodd((1.8, 1.0)) && evenodd((1.0, 0.2))
            @test !evenodd((2.5, 1.0))
            _, _, c = ctx_for(f)
            @test length(only(hitlayers(i, c)).payloads) == 1
        end

        @testset "introspected interactable flows through masque unchanged" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            p = scatter!(a, [1.0, 2.0], [1.0, 2.0]; markersize = 18)
            w = masque(f, PointInteractable(a, p); auto = false)
            @test w.manifest["layers"][1]["kind"] == "circles"
            @test w.manifest["layers"][1]["id"] == "scatter"
        end
    end

    @testset "M2.2 masque(fig) auto-extraction" begin
        @testset "walks every axis, maps each known plot, unique ids" begin
            f = Figure(size = (700, 350))
            a1 = Axis(f[1, 1])
            scatter!(a1, [1.0, 2.0], [1.0, 2.0])
            lines!(a1, [0.0, 1.0, 2.0], [0.0, 1.0, 0.5])
            heatmap!(a1, 1:3, 1:3, rand(3, 3))
            barplot!(a1, [1, 2], [3.0, 4.0])
            poly!(a1, Point2f[(0, 0), (1, 0), (0.5, 1)])
            a2 = Axis(f[1, 2])
            scatter!(a2, [5.0], [5.0])             # second scatter -> :scatter_2

            ints = interactables(f)
            @test length(ints) == 6
            _, _, c = ctx_for(f)
            ids = [only(hitlayers(i, c)).id for i in ints]
            # Ids follow drawing order; the list puts each axis's last-drawn plot first, so
            # the mark drawn on top wins an overlap.
            @test ids == [:poly, :bars, :cells, :lines, :scatter, :scatter_2]
            @test length(unique(ids)) == 6      # no collisions across axes
            # a2's scatter resolves to a2's transform (its own axis), not a1's
            @test only(hitlayers(ints[6], c)).axis != only(hitlayers(ints[5], c)).axis
        end

        @testset "the plot drawn on top comes first (nodes over edges)" begin
            # A graph: edges drawn first, nodes over them. Every edge passes through the
            # centre of the nodes it joins, so the first-match hit test must reach the nodes.
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            pts = Point2f[(0, 0), (1, 1), (2, 0)]
            lines!(a, pts)
            scatter!(a, pts; markersize = 20)
            text!(a, "label"; position = (1.0, 0.5))
            w = masque(f)
            @test [L["id"] for L in w.manifest["layers"]] == ["text", "scatter", "lines"]
            # A plot's own layers keep their order: a stem's points still precede its stems.
            fs = Figure(size = (500, 350)); as = Axis(fs[1, 1])
            lines!(as, [0.0, 3.0], [0.0, 3.0])
            stem!(as, [1.0, 2.0], [1.0, 2.0])
            @test [i.id for i in interactables(fs)] == [:stem, :stem_stems, :lines]
        end

        @testset "skips unsupported plot types with a warning" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            scatter!(a, [1.0], [1.0])
            # DataDots' only child is a data-space Scatter. The walk must not construct it.
            datadots!(a, Point2f[(0.5, 0.5), (1.5, 1.5)])
            ints = @test_logs (:warn, r"plot type datadots") interactables(f)
            @test length(ints) == 1
            @test only(ints) isa PointInteractable
        end

        @testset "masque(fig) overlays the auto-extracted set" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            scatter!(a, [1.0, 2.0], [1.0, 2.0]; markersize = 18)
            heatmap!(a, 1:3, 1:3, rand(3, 3))
            w = masque(f)
            @test [L["id"] for L in w.manifest["layers"]] == ["cells", "scatter"]
            @test [L["kind"] for L in w.manifest["layers"]] == ["grid", "circles"]
        end

        @testset "no introspectable plots -> warn, render image only" begin
            f = Figure(size = (400, 300)); a = Axis(f[1, 1])
            datadots!(a, Point2f[(0.5, 0.5), (1.5, 1.5)])
            w = @test_logs (:warn, r"plot type datadots") match_mode = :any masque(f)
            @test isempty(w.manifest["layers"])
            @test !isempty(w.b64)                  # static image still produced
        end

        @testset "unknown parent contributes known children, and stops there" begin
            using Masque: PolygonInteractable, SegmentInteractable
            f = Figure(size = (640, 360))
            a = Axis(f[1, 1])
            arc!(a, Point2f(0), 1, 0.0, π)
            ablines!(a, 0.0, 1.0)
            pie!(a, [1.0, 2.0, 3.0])
            contour!(a, 1:8, 1:8, [sin(i / 2) * cos(j / 2) for i in 1:8, j in 1:8])
            Makie.update_state_before_display!(f)
            ints = @test_logs interactables(f)
            _, _, c = ctx_for(f)
            ids = [only(hitlayers(i, c)).id for i in ints]
            @test ids == [:lines_2, :poly, :segments, :lines]
            @test ints[1] isa SegmentInteractable && ints[4] isa SegmentInteractable
            @test ints[2] isa PolygonInteractable
            # The arc is one polyline. Its image-px vertices sit on the stroke Cairo drew.
            g = only(hitlayers(ints[4], c)).geometry[1]
            img = Makie.colorbuffer(f; px_per_unit = 2.0)
            @test drawn_near(img, g[1], g[2])
            mid = length(g) ÷ 2
            mid = isodd(mid) ? mid : mid - 1
            @test drawn_near(img, g[mid], g[mid + 1])

            fr = Figure(size = (640, 360)); ar = Axis(fr[1, 1])
            rainclouds!(ar, ["a", "a", "a", "b", "b", "b"], [1.0, 1.2, 0.8, 2.0, 2.3, 1.9])
            Makie.update_state_before_display!(fr)
            rints = @test_logs interactables(fr)
            _, _, cr = ctx_for(fr)
            rids = [only(hitlayers(i, cr)).id for i in rints]
            # box, raindrop scatter, violin (topmost first) — not the violin's poly or the
            # box's crossbar
            @test rids == [:boxplot, :scatter, :violin]

            fb = Figure(size = (400, 300)); ab = Axis(fb[1, 1])
            bracket!(ab, 0.0, 0.0, 1.0, 1.0)
            Makie.update_state_before_display!(fb)
            # The pixel-space label warns once. The parent has nothing else to install,
            # and must not add a second "unsupported plot type" warning.
            bints = @test_logs (:warn, r"non-data-space text") interactables(fb)
            @test isempty(bints)

            # A top-level data-space scatter still fails in PointInteractable. The refusal
            # applies to children discovered under an unknown parent, not to this plot.
            fd = Figure(size = (400, 300)); ad = Axis(fd[1, 1])
            scatter!(ad, [1.0, 2.0], [1.0, 2.0]; markersize = 0.3, markerspace = :data)
            @test_throws ErrorException interactables(fd)

            # Default `triplot!` draws the triangles and also ghost edges, the convex hull,
            # constrained edges, and a point scatter, all with `visible[] == false`. Those
            # must not be layers, and must not take `:scatter` away from a later scatter.
            ft = Figure(size = (640, 360)); at = Axis(ft[1, 1])
            triplot!(at, [0.0, 1.0, 0.2, 0.8], [0.0, 0.0, 1.0, 0.6])
            scatter!(at, [0.4], [0.3]; markersize = 12)
            Makie.update_state_before_display!(ft)
            tints = @test_logs interactables(ft)
            _, _, ct = ctx_for(ft)
            @test [only(hitlayers(i, ct)).id for i in tints] == [:scatter, :poly]

            # `qqline = :none` leaves a visible `LineSegments` with no vertices. That must
            # not publish `:segments`, so a real segment layer still gets the first id.
            fq = Figure(size = (640, 360)); aq = Axis(fq[1, 1])
            qqplot!(aq, [1.0, 2.0, 3.0, 4.0], [1.1, 1.9, 3.2, 3.8]; qqline = :none)
            linesegments!(aq, [0.0, 1.0], [0.0, 1.0])
            Makie.update_state_before_display!(fq)
            qints = @test_logs interactables(fq)
            _, _, cq = ctx_for(fq)
            @test [only(hitlayers(i, cq)).id for i in qints] == [:segments, :scatter]
            @test !isempty(only(i for i in qints if i.id === :segments).vertices)
        end

        @testset "recipes reached only through their children (#275)" begin
            # Each recipe here has no constructor of its own; its layers come from the child
            # walk. A Makie release that changes how one builds its children breaks these.
            function layers(build)
                f = Figure(size = (500, 350)); a = Axis(f[1, 1])
                build(a)
                m = (@test_logs masque(f)).manifest
                return m["layers"], Makie.colorbuffer(f; px_per_unit = m["scaling"])
            end
            shape(Ls) = [(L["id"], L["kind"], length(L["payloads"])) for L in Ls]
            firstvertex(line) = (i = findfirst(isfinite, line); (line[i], line[i + 1]))

            @testset "qqnorm! -> scatter, plus segments with a qqline" begin
                ys = [-1.2, -0.4, 0.1, 0.5, 1.3]
                Ls, img = layers(a -> qqnorm!(a, ys))
                @test shape(Ls) == [("scatter", "circles", 5)]
                # Makie plots sample quantiles against normal quantiles; the median is exact
                @test Ls[1]["payloads"][3].x ≈ 0 atol = 1.0e-6
                @test Ls[1]["payloads"][3].y ≈ 0.1
                g = Ls[1]["geometry"]
                @test drawn_near(img, g[1], g[2]; tol = 2)
                Ls, img = layers(a -> qqnorm!(a, ys; qqline = :fit))
                @test shape(Ls) == [("segments", "segments", 1), ("scatter", "circles", 5)]
                g = Ls[1]["geometry"]
                @test drawn_near(img, (g[1] + g[3]) / 2, (g[2] + g[4]) / 2; tol = 2)
            end

            @testset "stephist! and ecdfplot! -> one stairs line" begin
                for build in (
                        a -> stephist!(a, [1.0, 1.5, 2.0, 2.2, 3.0, 3.1, 3.2]; bins = 3),
                        a -> ecdfplot!(a, [1.0, 2.0, 2.0, 3.0]),
                    )
                    Ls, img = layers(build)
                    @test shape(Ls) == [("stairs", "lines", 1)]
                    @test drawn_near(img, firstvertex(only(Ls[1]["geometry"]))...; tol = 2)
                end
            end

            @testset "streamplot! -> one lines element plus arrow-head scatter" begin
                Ls, img = layers(a -> streamplot!(a, p -> Point2f(-p[2], p[1]), -2 .. 2, -2 .. 2))
                @test [(L["id"], L["kind"]) for L in Ls] == [("scatter", "circles"), ("lines", "lines")]
                # all stream lines are one NaN-separated element; each arrow head is its own point
                @test length(Ls[2]["payloads"]) == 1
                @test length(Ls[1]["payloads"]) > 1
                g = Ls[1]["geometry"]
                @test drawn_near(img, g[1], g[2]; tol = 2)
                @test drawn_near(img, firstvertex(only(Ls[2]["geometry"]))...; tol = 2)
            end

            xs = [0.0, 1.0, 0.0, 1.0, 0.5]; ys = [0.0, 0.0, 1.0, 1.0, 0.5]
            zs = [0.0, 1.0, 1.0, 2.0, 1.0]
            @testset "tricontourf! -> one polygon per band" begin
                Ls, img = layers(a -> tricontourf!(a, xs, ys, zs; levels = 3))
                @test shape(Ls) == [("poly", "polygons", 3)]
                @test all(Ls[1]["geometry"]) do ring
                    r = ring[1] isa AbstractVector ? ring[1] : ring
                    drawn_near(img, r[1], r[2]; tol = 2)
                end
            end

            @testset "tricontour! -> one lines element" begin
                Ls, img = layers(a -> tricontour!(a, xs, ys, zs; levels = 3))
                @test shape(Ls) == [("lines", "lines", 1)]
                @test drawn_near(img, firstvertex(only(Ls[1]["geometry"]))...; tol = 2)
            end

            @testset "dendrogram! -> the whole tree as one lines element" begin
                Ls, img = layers(a -> dendrogram!(a, Point2f[(0, 0), (1, 0), (2, 0)], [(1, 2), (3, 4)]))
                @test shape(Ls) == [("lines", "lines", 1)]
                @test drawn_near(img, firstvertex(only(Ls[1]["geometry"]))...; tol = 2)
            end

            @testset "timeseries! -> one lines element" begin
                Ls, img = layers() do a
                    o = Observable(1.0)
                    timeseries!(a, o)
                    for v in (2.0, 0.5, 3.0)
                        o[] = v
                    end
                end
                @test shape(Ls) == [("lines", "lines", 1)]
                @test drawn_near(img, firstvertex(only(Ls[1]["geometry"]))...; tol = 2)
            end

            @testset "datashader! -> one grid cell per canvas pixel" begin
                pts = Point2f[(0, 0), (1, 1), (1, 1), (2, 0.5)]
                Ls, img = layers(a -> datashader!(a, pts; operation = identity))
                @test shape(Ls) == [("cells", "grid", 0)]
                g = Ls[1]["geometry"]
                v = g["values"]
                @test length(v) == g["ncols"] * g["nrows"]
                @test length(g["xedges"]) == g["ncols"] + 1 && length(g["yedges"]) == g["nrows"] + 1
                @test sum(v) == length(pts) && maximum(v) == 2   # a value is a point count
                # the cell holding both (1, 1) points is drawn in a different colour than an
                # empty cell
                center(k) = (
                    (j, i) = divrem(k - 1, g["ncols"]) .+ 1;
                    ((g["xedges"][i] + g["xedges"][i + 1]) / 2, (g["yedges"][j] + g["yedges"][j + 1]) / 2)
                )
                px(k) = (c = center(k); img[round(Int, c[2]), round(Int, c[1])])
                @test px(argmax(v)) != px(findfirst(iszero, v))
                # With the default `operation`, the value is the histogram-equalized colour
                # value, not the count (#276).
                Ld, _ = layers(a -> datashader!(a, pts))
                @test_broken sum(Ld[1]["geometry"]["values"]) == length(pts)
            end
        end

        @testset "masque auto-detects text!" begin
            f = Figure(); ax = Axis(f[1, 1]); scatter!(ax, 1:3, 1:3)
            text!(ax, [1.5], [2.0]; text = ["Hi"])
            Makie.update_state_before_display!(f)
            ints = interactables(f)
            @test count(i -> i isa TextInteractable, ints) == 1
        end
        @testset "masque auto-detects annotation!" begin
            f = Figure(); ax = Axis(f[1, 1]); scatter!(ax, 1:3, 1:3)
            annotation!(ax, [1.5], [2.0]; text = ["note"])
            Makie.update_state_before_display!(f)
            ints = interactables(f)
            ti = only(filter(i -> i isa TextInteractable, ints))
            @test ti.payloads[1].text == "note"
            # x,y come from the Text descendant's positions[] — the DATA-space anchor
            @test ti.payloads[1].x == 1.5 && ti.payloads[1].y == 2.0
        end
        @testset "masque skips non-data-space text" begin
            f = Figure(); ax = Axis(f[1, 1]); scatter!(ax, 1:3, 1:3)
            text!(ax, [10.0], [10.0]; text = ["px"], space = :pixel)
            Makie.update_state_before_display!(f)
            ints = interactables(f)
            @test count(i -> i isa TextInteractable, ints) == 0
        end
        @testset "rotated text still yields one box" begin
            f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
            t = text!(ax, [1.0], [1.0]; text = ["Tilt"], rotation = 0.6)
            _, _, ctx = ctx_for(f)
            g = only(hitlayers(TextInteractable(ax, t), ctx)).geometry
            @test length(g) == 4 && g[3] > 0 && g[4] > 0   # one box, positive w, h
        end
    end

    @testset "categorical and date positions show the plotted values (#249)" begin
        built(ax, p) = only(interactables(ax, p))
        Dates = Makie.Dates   # not a test dependency of its own
        fd = Figure(); ad = Axis(fd[1, 1])
        sd = scatter!(ad, Dates.Date(2024, 1, 1) .+ Dates.Day.(0:2), [1.0, 2.0, 3.0])
        ft = Figure(); at = Axis(ft[1, 1])
        st = scatter!(at, Dates.DateTime(2024, 1, 1) .+ Dates.Hour.(0:2), [1.0, 2.0, 3.0])
        fc = Figure(); ac = Axis(fc[1, 1])
        sc = scatter!(ac, Makie.Categorical(["a", "b", "c"]), [1.0, 2.0, 3.0])
        vc = violin!(ac, Makie.Categorical(repeat(["a", "b"], 10)), collect(1.0:20.0))
        tc = text!(ac, Makie.Categorical(["c"]), [2.0]; text = ["note"])
        foreach(Makie.update_state_before_display!, (fd, ft, fc))
        @test [p.x for p in built(ad, sd).payloads] == ["2024-01-01", "2024-01-02", "2024-01-03"]
        @test [p.x for p in built(at, st).payloads] == ["2024-01-01T00:00:00", "2024-01-01T01:00:00", "2024-01-01T02:00:00"]
        @test built(ad, sd).payloads[1].y == 1.0   # an unconverted dimension stays a number
        @test [p.x for p in built(ac, sc).payloads] == ["a", "b", "c"]
        @test [p.x for p in built(ac, vc).payloads] == ["a", "b"]
        @test built(ac, tc).payloads[1].x == "c"
        # the hit geometry still comes from the converted positions
        _, _, c = ctx_for(fc)
        @test only(hitlayers(built(ac, sc), c)).geometry ==
            only(hitlayers(PointInteractable(ac, sc), c)).geometry
        # payloads you pass are yours, and the masque(fig) default carries the label too
        @test only(interactables(ac, sc; payloads = ["p", "q", "r"])).payloads == ["p", "q", "r"]
        m = masque(fc).manifest
        @test only(filter(l -> l["id"] == "scatter", m["layers"]))["payloads"][2].x == "b"
        # the plot-object constructors fill their default payloads the same way
        @test [p.x for p in PointInteractable(ad, sd).payloads] == ["2024-01-01", "2024-01-02", "2024-01-03"]
        @test [p.x for p in PolygonInteractable(ac, vc).payloads] == ["a", "b"]
        @test TextInteractable(ac, tc).payloads[1].x == "c"
        @test PointInteractable(ac, sc; payloads = [(; x = 2.0) for _ in 1:3]).payloads[1].x == 2.0
        fh = Figure(); ah = Axis(fh[1, 1])
        sh = scatter!(ah, Dates.Time.(1:3), [1.0, 2.0, 3.0])
        Makie.update_state_before_display!(fh)
        @test [p.x for p in built(ah, sh).payloads] == ["01:00:00", "02:00:00", "03:00:00"]
        # a number with no date or category behind it stays a number (here, past Int64 ms)
        @test Masque._unconvert_payloads(ad, Any[(; x = 1.0e30)])[1].x == 1.0e30
        @test Masque._unconvert_payloads(ac, Any[(; x = 7.0)])[1].x == 7.0
    end

    @testset "thick strokes are hoverable over their whole width (#246)" begin
        built(ax, p) = only(interactables(ax, p))
        f = Figure(size = (500, 350)); a = Axis(f[1, 1])
        thin = lines!(a, 1:3, 1:3)
        thick = lines!(a, 1:3, 1:3; linewidth = 20)
        segs = linesegments!(a, [1, 2, 3, 4], [1, 2, 1, 2]; linewidth = [4, 4, 30, 30])
        hl = hlines!(a, [2.0]; linewidth = 16)
        eb = errorbars!(a, [1.0], [1.0], [0.5]; whiskerwidth = 20, linewidth = 3)
        s = scatter!(a, [1.0], [1.0]; markersize = 20, strokewidth = 8)
        b = barplot!(a, [1, 2], [1, 2]; strokewidth = 8)
        b0 = barplot!(a, [1, 2], [1, 2])
        pl = poly!(a, Point2f[(0, 0), (1, 0), (1, 1)]; strokewidth = 10)
        _, _, c = ctx_for(f)
        @test built(a, thin).tol == 6          # thin lines keep the floor
        @test built(a, thick).tol == 10        # half the linewidth
        @test built(a, segs).tol == 15         # the widest of a per-segment vector
        @test built(a, hl).tol == 8
        @test built(a, eb).tol == 10           # the whiskers reach whiskerwidth / 2 from the bar end
        @test only(interactables(a, thick; tol = 3)).tol == 3   # an explicit tol wins
        @test built(a, s).radius ≈ 0.3525 * 20 && built(a, s).stroke == 8
        # Cairo centers the outline on the marker edge, so half of it reaches past the marker
        @test only(Masque.hitlayers(built(a, s), c)).geometry[3] == round(Int, (0.3525 * 20 + 4) * c.scaling)
        @test only(interactables(a, s; radius = 5)).stroke == 0   # an explicit radius is the target
        @test Masque.hit_tol(built(a, b)) == 4 && Masque.hit_tol(built(a, b0)) === nothing
        @test Masque.hit_tol(built(a, pl)) == 5
        # rects and polygons ship it as image px, like line layers
        m = masque(f).manifest
        tols = Dict(l["id"] => get(l, "tol", nothing) for l in m["layers"])
        @test tols["bars"] == round(Int, 4 * m["scaling"]) && tols["bars_2"] === nothing
        @test tols["poly"] == round(Int, 5 * m["scaling"])
    end

    @testset "placement attributes move the hit target with the mark (#245)" begin
        built(ax, p) = only(interactables(ax, p))
        centers(L) = [(L.geometry[k], L.geometry[k + 1]) for k in 1:3:length(L.geometry)]

        @testset "translate!: hit circles sit on the drawn markers, payloads keep the data" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1]; limits = (0, 8, 0, 7))
            p = scatter!(a, [1.0, 2.0, 3.0], [1.0, 2.0, 3.0]; markersize = 20)
            translate!(p, 2, 1, 0)
            _, _, c = ctx_for(f)
            i = built(a, p)
            moved = PointInteractable(a, [(3.0, 2.0), (4.0, 3.0), (5.0, 4.0)]; radius = i.radius)
            @test only(hitlayers(i, c)).geometry == only(hitlayers(moved, c)).geometry
            @test i.payloads[1] == (; index = 1, x = 1.0, y = 1.0)
            img = Makie.colorbuffer(f; px_per_unit = c.scaling)
            @test all(q -> drawn_near(img, q...; tol = 2), centers(only(hitlayers(i, c))))
        end
        @testset "translate! on a log axis moves in the axis's scale" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1]; yscale = log10, limits = (0, 4, 1, 1000))
            p = scatter!(a, [1.0, 2.0], [1.0, 10.0]; markersize = 20)
            translate!(p, 0, 1, 0)   # one decade up, drawn at y = 10 and 100
            _, _, c = ctx_for(f)
            moved = PointInteractable(a, [(1.0, 10.0), (2.0, 100.0)]; radius = 1)
            got = centers(only(hitlayers(built(a, p), c)))
            want = centers(only(hitlayers(moved, c)))
            @test all(isapprox.(collect.(got), collect.(want); atol = 1))
        end
        @testset "a z translation is draw order, not position" begin
            f = Figure(); a = Axis(f[1, 1])
            p = scatter!(a, [1.0, 2.0], [1.0, 2.0]); translate!(p, 0, 0, 5)
            _, _, c = ctx_for(f)
            @test only(hitlayers(built(a, p), c)).geometry ==
                only(hitlayers(PointInteractable(a, [(1.0, 1.0), (2.0, 2.0)]; radius = Masque._marker_radius(p)), c)).geometry
        end
        @testset "scale! and translate! on lines, bars, heatmap, poly, hlines" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1]; limits = (0, 10, 0, 10))
            l = lines!(a, [1.0, 2.0], [1.0, 2.0]); translate!(l, 1, 1, 0)
            b = barplot!(a, [1, 2], [2, 3]); scale!(b, 2, 1, 1)
            h = heatmap!(a, 1:2, 1:2, rand(2, 2)); translate!(h, 5, 5, 0)
            pl = poly!(a, Point2f[(0, 0), (1, 0), (1, 1)]); translate!(pl, 3, 0, 0)
            hl = hlines!(a, [4.0]); translate!(hl, 0, 1, 0)
            _, _, c = ctx_for(f)
            @test built(a, l).vertices == Point3f[(2, 2, 0), (3, 3, 0)]
            r = built(a, b).data[1]
            @test r[1] ≈ 2 && isapprox(r[3], 2 * 0.8; atol = 1.0e-5)   # center x doubled, width doubled
            gi = built(a, h)
            @test gi.xedges ≈ [5.5, 6.5, 7.5] && gi.yedges ≈ [5.5, 6.5, 7.5]
            @test first.(built(a, pl).rings[1]) ≈ [3, 4, 4]
            ys = only(hitlayers(built(a, hl), c)).geometry[2:2:end]
            @test all(==(only(hitlayers(PointInteractable(a, [(1.0, 5.0)]; radius = 1), c)).geometry[2]), ys)
        end
        @testset "rotate!: points follow, axis-aligned rects are skipped with a warning" begin
            f = Figure(); a = Axis(f[1, 1])
            s = scatter!(a, [1.0], [0.0]); rotate!(s, π / 2)
            b = barplot!(a, [1, 2], [2, 3]); rotate!(b, π / 2)
            Makie.update_state_before_display!(f)
            @test isapprox(built(a, s).points[1], Point3f(0, 1, 0); atol = 1.0e-5)
            @test_logs (:warn, r"rotated") @test isempty(interactables(a, b))
        end
        @testset "space = :relative / :pixel plots are skipped with a warning" begin
            f = Figure(); a = Axis(f[1, 1])
            s = scatter!(a, [0.2, 0.5], [0.2, 0.5]; space = :relative)
            l = lines!(a, [10.0, 50.0], [10.0, 50.0]; space = :pixel)
            scatter!(a, 1:3, 1:3)
            Makie.update_state_before_display!(f)
            @test_logs (:warn, r"space = :relative") @test isempty(interactables(a, s))
            @test_logs (:warn, r"space = :pixel") @test isempty(interactables(a, l))
            ints = @test_logs (:warn, r"space = :relative") (:warn, r"space = :pixel") interactables(f)
            @test [i.id for i in ints] == [:scatter]
        end
        @testset "marker_offset moves the hit circle by that many px" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1]; limits = (0, 6, 0, 6))
            p = scatter!(a, [2.0, 4.0], [2.0, 4.0]; markersize = 30, marker_offset = Vec2f(20, 20))
            _, _, c = ctx_for(f)
            base = PointInteractable(a, [(2.0, 2.0), (4.0, 4.0)]; radius = 1)
            got, want = centers(only(hitlayers(built(a, p), c))), centers(only(hitlayers(base, c)))
            @test all(isapprox.(collect.(got), [w .+ (20, -20) .* c.scaling for w in collect.(want)]; atol = 1))
            img = Makie.colorbuffer(f; px_per_unit = c.scaling)
            @test all(q -> drawn_near(img, q...; tol = 2), got)
        end
        # Center of the dark ink in an image region (grid lines and panels are light).
        function ink_center(img; rows = axes(img, 1), cols = axes(img, 2))
            dark = [(x, y) for y in rows, x in cols if Float64(Makie.red(img[y, x])) < 0.3 && Float64(Makie.blue(img[y, x])) < 0.3]
            isempty(dark) && return (NaN, NaN)
            return (sum(first, dark) / length(dark), sum(last, dark) / length(dark))
        end
        @testset "marker_offset in markerspace = :data moves by data units past the axis scale" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1]; yscale = log10, limits = (0, 6, 1, 1000))
            p = scatter!(a, [2.0], [10.0]; markerspace = :data, marker = Rect, markersize = 0.3, color = :black, marker_offset = Vec2f(1, 1))
            hidedecorations!(a); hidespines!(a)
            _, _, c = ctx_for(f)
            i = only(interactables(a, p; radius = 5))
            @test i.payloads[1] == (; index = 1, x = 2.0, y = 10.0)
            g = only(hitlayers(i, c)).geometry
            want = Masque.data_to_image_px(c, a, (3.0, 100.0))   # one unit right, one decade up
            @test isapprox(g[1], want[1]; atol = 1) && isapprox(g[2], want[2]; atol = 1)
            img = Makie.colorbuffer(f; px_per_unit = c.scaling)
            @test all(isapprox.(ink_center(img), (g[1], g[2]); atol = 4))
        end
        @testset "a data-space marker_offset is added after scale!, as Makie draws it" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1]; limits = (0, 6, 0, 6))
            p = scatter!(a, [1.0], [1.0]; markerspace = :data, marker = Rect, markersize = 0.3, color = :black, marker_offset = Vec2f(1, 0))
            scale!(p, 2, 2, 1)
            hidedecorations!(a); hidespines!(a)
            _, _, c = ctx_for(f)
            g = only(hitlayers(only(interactables(a, p; radius = 5)), c)).geometry
            want = Masque.data_to_image_px(c, a, (3.0, 2.0))   # model first, then the offset
            @test isapprox(g[1], want[1]; atol = 1) && isapprox(g[2], want[2]; atol = 1)
            img = Makie.colorbuffer(f; px_per_unit = c.scaling)
            @test all(isapprox.(ink_center(img), (g[1], g[2]); atol = 4))
        end
        @testset "text with markerspace = :data sits on its glyphs on a log axis" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1]; yscale = log10, limits = (0, 6, 1, 1000))
            t = text!(a, 2, 100; text = "data", fontsize = 0.5, markerspace = :data, align = (:center, :center))
            hidedecorations!(a); hidespines!(a)
            _, _, c = ctx_for(f)
            g = only(hitlayers(built(a, t), c)).geometry
            @test g[3] > 50   # half a decade on a three-decade axis is large, not a few px
            img = Makie.colorbuffer(f; px_per_unit = c.scaling)
            ink = ink_center(img)
            @test isapprox(ink[1], g[1]; atol = g[3] / 4) && isapprox(ink[2], g[2]; atol = g[4] / 4)
        end
        # Width in px of the dark ink in an image.
        function ink_width(img)
            cols = [x for y in axes(img, 1), x in axes(img, 2) if Float64(Makie.red(img[y, x])) < 0.5]
            return isempty(cols) ? 0 : maximum(cols) - minimum(cols) + 1
        end
        @testset "a meshscatter's hit follows scale! in size, not rotate!" begin
            for (move!, factor) in ((p -> scale!(p, 2, 2, 2), 2), (p -> rotate!(p, π / 4), 1))
                f = Figure(size = (500, 500)); a = Axis(f[1, 1]; limits = (-3, 3, -3, 3), aspect = DataAspect())
                ms = meshscatter!(a, [Point3f(0, 0, 0)]; markersize = 0.5, color = :black, shading = NoShading)
                hidedecorations!(a); hidespines!(a)
                move!(ms)
                _, _, c = ctx_for(f)
                i = built(a, ms)
                @test i.radius3d[1] ≈ Vec3f(0.5factor, 0.5factor, 0.5factor)
                r = only(hitlayers(i, c)).geometry[3]
                img = Makie.colorbuffer(f; px_per_unit = c.scaling)
                @test isapprox(2r, ink_width(img); rtol = 0.06)
            end
        end
        @testset "an axis transform with no inverse leaves the targets in place, with a warning" begin
            f = Figure(); a = Axis(f[1, 1])
            p = scatter!(a, [1.0, 2.0], [1.0, 2.0]); translate!(p, 1, 0, 0)
            Makie.update_state_before_display!(f)
            a.scene.transformation.transform_func[] = (x -> x, x -> x)
            ps = @test_logs (:warn, r"no inverse") match_mode = :any built(a, p).points
            @test ps == Point3f[(1, 1, 0), (2, 2, 0)]
        end
    end

    @testset "M3 cheap-wins introspection" begin
        geom(int, c) = (L = only(hitlayers(int, c)); (L.kind, L.geometry, length(L.payloads)))

        @testset "stairs -> one whole line from the expanded staircase" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            p = stairs!(a, [0.0, 1.0, 2.0, 3.0], [0.0, 2.0, 1.0, 3.0])
            _, _, c = ctx_for(f)
            # uses the child Lines' 7-point staircase, NOT the 4 input points, as one element
            steps = [(0.0, 0.0), (0.0, 2.0), (1.0, 2.0), (1.0, 1.0), (2.0, 1.0), (2.0, 3.0), (3.0, 3.0)]
            @test geom(SegmentInteractable(a, p), c) ==
                geom(SegmentInteractable(a, steps; mode = :polyline, unit = :line), c)
            L = only(hitlayers(SegmentInteractable(a, p), c))
            @test L.kind === :lines && L.id === :stairs && length(L.payloads) == 1
            @test L.payloads[1] == (; index = 1) && length(only(L.geometry)) == 14
            img = Makie.colorbuffer(f; px_per_unit = 2.0)
            g = only(L.geometry)
            @test drawn_near(img, g[3], g[4])   # a corner of the staircase
        end

        @testset "errorbars/rangebars -> Segment(:pairs)" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            pe = errorbars!(a, [1.0, 2.0, 3.0], [1.0, 2.0, 1.5], [0.2, 0.3, 0.1])
            pr = rangebars!(a, [1.0, 2.0], [0.5, 1.0], [1.5, 2.0])
            _, _, c = ctx_for(f)
            # one disjoint pair per bar, spanning low->high about the value
            ebars = [(1.0, 0.8), (1.0, 1.2), (2.0, 1.7), (2.0, 2.3), (3.0, 1.4), (3.0, 1.6)]
            @test geom(SegmentInteractable(a, pe), c) ==
                geom(SegmentInteractable(a, ebars; mode = :pairs), c)
            Le = only(hitlayers(SegmentInteractable(a, pe), c))
            @test Le.kind === :segments && Le.id === :errorbars && length(Le.payloads) == 3
            rbars = [(1.0, 0.5), (1.0, 1.5), (2.0, 1.0), (2.0, 2.0)]
            @test geom(SegmentInteractable(a, pr), c) ==
                geom(SegmentInteractable(a, rbars; mode = :pairs), c)
            @test only(hitlayers(SegmentInteractable(a, pr), c)).id === :rangebars
            # endpoint lands on a rendered bar (convention: assert pixel-landing, not just geom)
            Lg = only(hitlayers(SegmentInteractable(a, pe), c)).geometry
            img = Makie.colorbuffer(f; px_per_unit = 2.0)
            @test drawn_near(img, Lg[1], Lg[2])
        end

        @testset "errorbars/rangebars direction=:x (horizontal)" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            # error runs along x, position along y
            pe = errorbars!(a, [1.0, 2.0], [3.0, 4.0], [0.2, 0.3]; direction = :x)
            pr = rangebars!(a, [1.0, 2.0], [0.5, 1.0], [1.5, 2.0]; direction = :x)
            _, _, c = ctx_for(f)
            ebars = [(0.8, 3.0), (1.2, 3.0), (1.7, 4.0), (2.3, 4.0)]
            @test geom(SegmentInteractable(a, pe), c) ==
                geom(SegmentInteractable(a, ebars; mode = :pairs), c)
            rbars = [(0.5, 1.0), (1.5, 1.0), (1.0, 2.0), (2.0, 2.0)]
            @test geom(SegmentInteractable(a, pr), c) ==
                geom(SegmentInteractable(a, rbars; mode = :pairs), c)
        end

        @testset "hlines/vlines -> Segment(:pairs) spanning finallimits" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1]); scatter!(a, [0.0, 5.0], [0.0, 5.0])
            ph = hlines!(a, [1.0, 3.0]); pv = vlines!(a, [2.0, 4.0])
            _, _, c = ctx_for(f)
            fl = a.finallimits[]; x0 = fl.origin[1]; x1 = x0 + fl.widths[1]
            y0 = fl.origin[2]; y1 = y0 + fl.widths[2]
            hexp = [(x0, 1.0), (x1, 1.0), (x0, 3.0), (x1, 3.0)]
            @test geom(SegmentInteractable(a, ph), c) ==
                geom(SegmentInteractable(a, hexp; mode = :pairs), c)
            vexp = [(2.0, y0), (2.0, y1), (4.0, y0), (4.0, y1)]
            @test geom(SegmentInteractable(a, pv), c) ==
                geom(SegmentInteractable(a, vexp; mode = :pairs), c)
            @test only(hitlayers(SegmentInteractable(a, ph), c)).id === :hlines
            @test only(hitlayers(SegmentInteractable(a, pv), c)).id === :vlines
            # the first hline's midpoint (between its two span endpoints) lands on the drawn line
            g = only(hitlayers(SegmentInteractable(a, ph), c)).geometry
            img = Makie.colorbuffer(f; px_per_unit = 2.0)
            @test drawn_near(img, (g[1] + g[3]) / 2, (g[2] + g[4]) / 2)
        end

        @testset "hlines/vlines fractional span attributes" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1]; limits = (0, 10, 0, 10))
            ph = hlines!(a, [4.0]; xmin = 0.25, xmax = 0.75, linewidth = 6)
            pv = vlines!(a, [4.0]; ymin = 0.2, ymax = 0.6, linewidth = 6)
            _, _, c = ctx_for(f)
            @test geom(SegmentInteractable(a, ph), c) ==
                geom(SegmentInteractable(a, [(2.5, 4.0), (7.5, 4.0)]; mode = :pairs), c)
            @test geom(SegmentInteractable(a, pv), c) ==
                geom(SegmentInteractable(a, [(4.0, 2.0), (4.0, 6.0)]; mode = :pairs), c)
            g = only(hitlayers(SegmentInteractable(a, ph), c)).geometry
            img = Makie.colorbuffer(f; px_per_unit = 2.0)
            @test drawn_near(img, (g[1] + g[3]) / 2, (g[2] + g[4]) / 2)

            # per-line fractions, and a scalar position broadcast across a vector of fractions
            pb = hlines!(a, [2.0, 8.0]; xmin = [0.1, 0.5], xmax = [0.4, 0.9])
            @test geom(SegmentInteractable(a, pb), c) ==
                geom(SegmentInteractable(a, [(1.0, 2.0), (4.0, 2.0), (5.0, 8.0), (9.0, 8.0)]; mode = :pairs), c)
            ps = hlines!(a, 4.0; xmin = [0.1, 0.6], xmax = [0.3, 0.9])
            Ls = only(hitlayers(SegmentInteractable(a, ps), c))
            @test Ls.payloads == Any[(; segment_index = 1), (; segment_index = 2)]
            @test geom(SegmentInteractable(a, ps), c) ==
                geom(SegmentInteractable(a, [(1.0, 4.0), (3.0, 4.0), (6.0, 4.0), (9.0, 4.0)]; mode = :pairs), c)

            # fraction of the transformed limits, inverse-transformed back to data space
            flog = Figure(size = (500, 350))
            al = Axis(flog[1, 1]; xscale = log10, limits = ((1, 1000), (0, 10)))
            plog = hlines!(al, [5.0]; xmin = 0.5, xmax = 1)
            pdef = hlines!(al, [5.0])
            _, _, cl = ctx_for(flog)
            @test geom(SegmentInteractable(al, plog), cl) ==
                geom(SegmentInteractable(al, [(exp10(1.5), 5.0), (1000.0, 5.0)]; mode = :pairs), cl)
            flim = al.finallimits[]
            @test geom(SegmentInteractable(al, pdef), cl) ==
                geom(SegmentInteractable(al, [(flim.origin[1], 5.0), (flim.origin[1] + flim.widths[1], 5.0)]; mode = :pairs), cl)

            fv = Figure(size = (500, 350))
            av = Axis(fv[1, 1]; yscale = log10, limits = ((0, 10), (1, 1000)))
            pvlog = vlines!(av, [5.0]; ymin = 0.5, ymax = 1)
            _, _, cv = ctx_for(fv)
            @test geom(SegmentInteractable(av, pvlog), cv) ==
                geom(SegmentInteractable(av, [(5.0, exp10(1.5)), (5.0, 1000.0)]; mode = :pairs), cv)

            # built before finalize: a later limit change re-resolves the same fractions
            fr = Figure(size = (500, 350)); ar = Axis(fr[1, 1]; limits = (0, 10, 0, 10))
            pr = hlines!(ar, [4.0]; xmin = 0.25, xmax = 0.75)
            seg = SegmentInteractable(ar, pr)
            xlims!(ar, -20, 20)
            masque(fr, [seg]; auto = false)
            _, _, cr = ctx_for(fr)
            @test geom(seg, cr) ==
                geom(SegmentInteractable(ar, [(-10.0, 4.0), (10.0, 4.0)]; mode = :pairs), cr)
        end

        @testset "hlines/vlines: interactable built before finalize resolves against finalized limits" begin
            # Regression: masque(fig, interactables) only finalizes AFTER the caller already built
            # `interactables` (unlike masque(fig), which finalizes first). A SegmentInteractable built
            # from an HLines/VLines plot object before any finalize call must still span the
            # FINALIZED viewport at hitlayers time, not whatever finallimits happened to hold at
            # construction.
            f = Figure(size = (500, 350)); a = Axis(f[1, 1]); scatter!(a, [0.0, 5.0], [0.0, 5.0])
            ph = hlines!(a, [1.0, 3.0])
            seg = SegmentInteractable(a, ph)   # constructed BEFORE any finalize call
            xlims!(a, -20, 20)                 # widen limits after construction
            w = masque(f, [seg]; auto = false)   # finalizes internally, after seg was already built
            ref = masque(f)                      # masque(fig): finalizes first, then auto-extracts (ground truth)
            seg_layer = only(filter(l -> l["id"] == "hlines", w.manifest["layers"]))
            ref_layer = only(filter(l -> l["id"] == "hlines", ref.manifest["layers"]))
            @test seg_layer["geometry"] == ref_layer["geometry"]
            fl = a.finallimits[]
            @test fl.origin[1] ≈ -20 atol = 0.5
            @test fl.origin[1] + fl.widths[1] ≈ 20 atol = 0.5

            # VLines mirror: spans the full Y-range (ishoriz=false in `_span_pairs`), so widen ylims.
            fv = Figure(size = (500, 350)); av = Axis(fv[1, 1]); scatter!(av, [0.0, 5.0], [0.0, 5.0])
            pv = vlines!(av, [1.0, 3.0])
            segv = SegmentInteractable(av, pv)   # constructed BEFORE any finalize call
            ylims!(av, -20, 20)                  # widen limits after construction
            wv = masque(fv, [segv]; auto = false)
            refv = masque(fv)
            segv_layer = only(filter(l -> l["id"] == "vlines", wv.manifest["layers"]))
            refv_layer = only(filter(l -> l["id"] == "vlines", refv.manifest["layers"]))
            @test segv_layer["geometry"] == refv_layer["geometry"]
            flv = av.finallimits[]
            @test flv.origin[2] ≈ -20 atol = 0.5
            @test flv.origin[2] + flv.widths[2] ≈ 20 atol = 0.5
        end

        @testset "hspan/vspan: interactable built before finalize resolves against finalized limits" begin
            # Same finalize-order regression as hlines/vlines, but for RectInteractable's `resolve`
            # path (`_rect_with_resolve`, wired at the HSpan/VSpan constructors in introspect.jl).
            # Every existing HSpan/VSpan test goes through masque(fig), which finalizes first, so
            # none of them would catch hitlayers falling back to stale `data`.

            # HSpan fills the full X-range (`_span_rects(ax, p, :x)`), so widen xlims.
            f = Figure(size = (500, 350)); a = Axis(f[1, 1]); scatter!(a, [0.0, 5.0], [0.0, 5.0])
            ph = hspan!(a, [1.0], [3.0])
            rect = RectInteractable(a, ph)       # constructed BEFORE any finalize call
            xlims!(a, -20, 20)                   # widen limits after construction
            w = masque(f, [rect]; auto = false)
            ref = masque(f)
            rect_layer = only(filter(l -> l["id"] == "hspan", w.manifest["layers"]))
            ref_layer = only(filter(l -> l["id"] == "hspan", ref.manifest["layers"]))
            @test rect_layer["geometry"] == ref_layer["geometry"]
            fl = a.finallimits[]
            @test fl.origin[1] ≈ -20 atol = 0.5
            @test fl.origin[1] + fl.widths[1] ≈ 20 atol = 0.5

            # VSpan fills the full Y-range (`_span_rects(ax, p, :y)`), so widen ylims.
            fv = Figure(size = (500, 350)); av = Axis(fv[1, 1]); scatter!(av, [0.0, 5.0], [0.0, 5.0])
            pv = vspan!(av, [1.0], [3.0])
            rectv = RectInteractable(av, pv)     # constructed BEFORE any finalize call
            ylims!(av, -20, 20)                  # widen limits after construction
            wv = masque(fv, [rectv]; auto = false)
            refv = masque(fv)
            rectv_layer = only(filter(l -> l["id"] == "vspan", wv.manifest["layers"]))
            refv_layer = only(filter(l -> l["id"] == "vspan", refv.manifest["layers"]))
            @test rectv_layer["geometry"] == refv_layer["geometry"]
            flv = av.finallimits[]
            @test flv.origin[2] ≈ -20 atol = 0.5
            @test flv.origin[2] + flv.widths[2] ≈ 20 atol = 0.5
        end

        @testset "empty data -> empty layer (no pairs)" begin
            # Build the empty Errorbars from a typed Vec4f[] (the post-conversion type Makie
            # expects). Empty *untyped* vectors (Float64[], Float64[], Float64[]) fail Makie's
            # convert_arguments before Julia 1.12 — the empty broadcast infers Vector{Any},
            # which the converter rejects (upstream, not a Masque bug). The pre-typed form passes
            # straight through on all supported versions. Verified on Julia 1.10 and 1.12.
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            p = errorbars!(a, Vec4f[]); _, _, c = ctx_for(f)
            L = only(hitlayers(SegmentInteractable(a, p), c))
            @test isempty(L.geometry) && isempty(L.payloads)
        end

        @testset "spy -> Rect(:list) of unit cells at the nonzeros" begin
            M = zeros(5, 5); M[1, 2] = 3.0; M[3, 4] = 1.0; M[5, 1] = 2.0
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            p = spy!(a, M); _, _, c = ctx_for(f)
            L = only(hitlayers(RectInteractable(a, p), c))
            @test L.kind === :rects && L.id === :spy
            @test length(L.payloads) == 3                  # one rect per nonzero
            img = Makie.colorbuffer(f; px_per_unit = 2.0)
            @test drawn_near(img, L.geometry[1], L.geometry[2])   # first cell center drawn
        end

        @testset "stem -> Point + Segment(:pairs) (composite, two layers)" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            stem!(a, [1.0, 2.0, 3.0], [3.0, 1.0, 2.0]); _, _, c = ctx_for(f)
            ints = interactables(f)
            @test length(ints) == 2
            kinds = [only(hitlayers(i, c)).kind for i in ints]
            ids = [only(hitlayers(i, c)).id for i in ints]
            @test kinds == [:circles, :segments]
            @test ids == [:stem, :stem_stems]
        end

        @testset "scatterlines -> Point + one whole line (composite)" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            scatterlines!(a, [1.0, 2.0, 3.0], [1.0, 4.0, 9.0]; markersize = 16); _, _, c = ctx_for(f)
            ints = interactables(f)
            @test length(ints) == 2
            @test [only(hitlayers(i, c)).kind for i in ints] == [:circles, :lines]
            @test [only(hitlayers(i, c)).id for i in ints] == [:scatterlines, :scatterlines_line]
            @test length(only(hitlayers(ints[2], c)).payloads) == 1
        end

        @testset "series -> one :lines layer, one element per series" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            # 3 rows × 4 columns: each row is one series (Makie's matrix convention).
            ys = [1.0 1.5 2.2 2.8; 3.0 2.4 1.2 1.5; 0.6 1.4 2.6 2.0]
            series!(a, ys)
            _, _, c = ctx_for(f)
            ints = interactables(f)
            @test length(ints) == 1
            L = only(hitlayers(only(ints), c))
            @test L.kind === :lines && L.id === :series && length(L.payloads) == 3
            @test length(L.geometry) == 3
            @test all(g -> length(g) == 8, L.geometry)   # 4 vertices × (x, y), not 3 segments each
            @test L.payloads[2].index == 2
            @test L.payloads[2].label == "series 2"
            w = masque(f)
            ev = Masque.APD.Bonds.transform_value(w, Dict("layer" => "series", "index" => 1))
            @test ev isa ElementEvent && ev.index == 2 && ev.layer === :series
            @test ev.payload.index == 2
        end

        @testset "masque(fig) auto-extracts the cheap-win surfaces" begin
            f = Figure(size = (500, 350)); a = Axis(f[1, 1])
            stairs!(a, [0.0, 1.0, 2.0], [0.0, 1.0, 0.5])
            hlines!(a, [2.0])
            w = masque(f)
            @test [L["id"] for L in w.manifest["layers"]] == ["hlines", "stairs"]
            @test [L["kind"] for L in w.manifest["layers"]] == ["segments", "lines"]
        end
    end

    @testset "Hist + Waterfall extraction" begin
        using Masque: RectInteractable, interactables
        # Hist: counts + bin edges
        fig = Figure(); ax = Axis(fig[1, 1])
        data = [0.5, 0.6, 1.5, 1.6, 1.7, 2.5]
        hist!(ax, data; bins = 3)
        Makie.update_state_before_display!(fig)
        hp = ax.scene.plots[1]
        ri = RectInteractable(ax, hp; id = :hist)
        @test length(ri.payloads) == 3
        @test sum(p.value for p in ri.payloads) == length(data)        # values sum to N (default normalization=:none)
        @test all(p.low < p.high for p in ri.payloads)                 # bin edges ordered
        @test !haskey(pairs(ri.payloads[1]), :index)
        @test !haskey(pairs(ri.payloads[1]), :count)                   # field is :value, not :count
        # auto path picks it up as :hist
        ints = interactables(fig)
        @test any(i -> i isa RectInteractable, ints)

        # Waterfall: signed delta — value must reflect direction (Fix 2)
        fig2 = Figure(); ax2 = Axis(fig2[1, 1])
        waterfall!(ax2, [1, 2, 3], [2.0, -1.0, 3.0])
        Makie.update_state_before_display!(fig2)
        ri2 = RectInteractable(ax2, ax2.scene.plots[1]; id = :waterfall)
        @test length(ri2.payloads) == 3
        @test haskey(pairs(ri2.payloads[1]), :value)                   # shared bar schema
        @test ri2.payloads[1].value == 2.0                             # up-step: positive
        @test ri2.payloads[2].value == -1.0                            # down-step: negative (signed delta)
        @test ri2.payloads[3].value == 3.0                             # up-step: positive
        # |value| ≈ bar height (low..high span)
        @test abs(ri2.payloads[2].value) ≈ ri2.payloads[2].high - ri2.payloads[2].low
    end

    @testset "CrossBar extraction" begin
        using Masque: RectInteractable, interactables
        fig = Figure(); ax = Axis(fig[1, 1])
        crossbar!(ax, [1, 2], [5.0, 6.0], [3.0, 4.0], [7.0, 8.0])
        Makie.update_state_before_display!(fig)
        p = ax.scene.plots[1]
        ri = RectInteractable(ax, p; id = :crossbar)
        @test length(ri.payloads) == 2
        @test ri.payloads[1] == (; midpoint = 5.0, low = 3.0, high = 7.0)
        @test ri.payloads[2] == (; midpoint = 6.0, low = 4.0, high = 8.0)
        @test !haskey(pairs(ri.payloads[1]), :index)
        # auto path: _plotbase returns :crossbar, _construct returns RectInteractable
        _, _, c = ctx_for(fig)
        ints = interactables(fig)
        @test length(ints) == 1 && ints[1] isa RectInteractable
        @test only(hitlayers(ints[1], c)).id === :crossbar
    end

    @testset "Arrows2D extraction: one segment per arrow, tail to tip (#274)" begin
        using Masque: SegmentInteractable, interactables
        isred(c) = Float64(Makie.red(c)) > 0.6 && Float64(Makie.green(c)) < 0.4 && Float64(Makie.blue(c)) < 0.4
        function red_near(img, cx, cy; tol = 3)
            ih, iw = size(img)
            x, y = round(Int, cx), round(Int, cy)
            for dy in -tol:tol, dx in -tol:tol
                xx, yy = x + dx, y + dy
                (1 <= xx <= iw && 1 <= yy <= ih) || continue
                isred(img[yy, xx]) && return true
            end
            return false
        end
        # each end of every drawn segment, pulled `back` image px toward the other end, is on
        # the drawn arrow: the start on the shaft, the end just inside the head's point
        function on_arrows(L, img; back = 3)
            g = L.geometry
            all(0:(length(g) ÷ 4 - 1)) do k
                x1, y1, x2, y2 = g[4k + 1], g[4k + 2], g[4k + 3], g[4k + 4]
                len = hypot(x2 - x1, y2 - y1)
                ux, uy = (x2 - x1) / len, (y2 - y1) / len
                red_near(img, x1 + back * ux, y1 + back * uy) &&
                    red_near(img, (x1 + x2) / 2, (y1 + y2) / 2) &&
                    red_near(img, x2 - back * ux, y2 - back * uy)
            end
        end

        pts = Point2f[(1, 1), (3, 2), (2, 4)]
        dirs = Vec2f[(1, 0), (0, 1.5), (-1, -1)]
        fig = Figure(size = (500, 400)); ax = Axis(fig[1, 1]; limits = (0, 5, 0, 6))
        arrows2d!(ax, pts, dirs; color = :red)
        Makie.update_state_before_display!(fig)
        si = only(@test_logs interactables(fig))       # no logs: the pixel-space Poly isn't walked
        @test si isa SegmentInteractable && si.id === :arrows2d
        @test si.payloads[2] == (; index = 2, x = 3.0, y = 2.0, u = 0.0, v = 1.5)
        @test si.tol == 7.0                            # half the default 14px head width
        _, ppu, ctx = ctx_for(fig)
        L = only(hitlayers(si, ctx))
        @test L.kind === :segments && length(L.geometry) == 12
        img = Makie.colorbuffer(fig; px_per_unit = ppu)
        @test on_arrows(L, img)
        # the segment runs from the plotted point to point + direction (align = :tail)
        ref = only(hitlayers(SegmentInteractable(ax, [(1.0, 1.0), (2.0, 1.0)]; mode = :pairs), ctx))
        @test L.geometry[1:4] ≈ ref.geometry

        # align and lengthscale move the drawn arrow; the segment follows it, payloads keep
        # the plotted values
        fig2 = Figure(size = (500, 400)); ax2 = Axis(fig2[1, 1]; limits = (0, 5, 0, 6))
        arrows2d!(ax2, pts, Vec2f(1, 1); align = :center, lengthscale = 1.5, color = :red)
        Makie.update_state_before_display!(fig2)
        si2 = only(@test_logs interactables(fig2))
        @test si2.payloads[3] == (; index = 3, x = 2.0, y = 4.0, u = 1.0, v = 1.0)
        _, ppu2, ctx2 = ctx_for(fig2)
        L2 = only(hitlayers(si2, ctx2))
        ref2 = only(hitlayers(SegmentInteractable(ax2, [(0.25, 0.25), (1.75, 1.75)]; mode = :pairs), ctx2))
        @test L2.geometry[1:4] ≈ ref2.geometry
        @test on_arrows(L2, Makie.colorbuffer(fig2; px_per_unit = ppu2))

        # 2D arrows on Axis3 are skipped with a warning, not misplaced
        f3 = Figure(); ax3 = Axis3(f3[1, 1])
        arrows2d!(ax3, pts, dirs)
        Makie.update_state_before_display!(f3)
        @test isempty(@test_logs (:warn, r"arrows2d on Axis3") match_mode = :any interactables(f3))
    end

    @testset "Band extraction" begin
        using Masque: PolygonInteractable, interactables
        fig = Figure(); ax = Axis(fig[1, 1])
        band!(ax, 1:5, [0.0, 0.1, 0.2, 0.1, 0.0], [1.0, 1.2, 1.4, 1.2, 1.0])
        Makie.update_state_before_display!(fig)
        p = ax.scene.plots[1]
        pi = PolygonInteractable(ax, p; id = :band)
        @test length(pi.rings) == 1                       # one filled region → one ring
        @test length(pi.rings[1]) == 10                   # 5 lower + 5 upper, stitched
        @test pi.payloads[1] == (; index = 1)             # default; no semantic per-element value
        # auto path picks it up as :band, exactly one layer (no stray :poly from the child)
        ints = interactables(fig)
        @test length(ints) == 1
        @test ints[1] isa PolygonInteractable
        _, _, c = ctx_for(fig)
        @test only(hitlayers(ints[1], c)).id === :band

        # direction = :y draws the transpose of converted[]; the hit ring must follow (#247).
        fy = Figure(); axy = Axis(fy[1, 1])
        lo, hi = [2.5, 3.0, 0.0, 2.0, 4.0], [4.5, 5.0, 2.0, 4.0, 6.0]   # lo[1] ≠ its position, so the swap shows
        band!(axy, 1:5, lo, hi; direction = :y, color = :red)
        Makie.update_state_before_display!(fy)
        piy = PolygonInteractable(axy, axy.scene.plots[1])
        @test piy.rings[1][1][1:2] ≈ [lo[1], 1.0]         # (value, position), not (position, value)
        @test piy.rings[1][end][1:2] ≈ [hi[1], 1.0]
        _, ppuy, cy = ctx_for(fy)
        imgy = Makie.colorbuffer(fy; px_per_unit = ppuy)
        g = only(only(hitlayers(piy, cy)).geometry)
        n = length(lo)
        for k in 2:(n - 1)                             # midpoint of lower k and upper k is on the band
            j = 2n + 1 - k
            mx, my = (g[2k - 1] + g[2j - 1]) / 2, (g[2k] + g[2j]) / 2
            px = imgy[round(Int, my), round(Int, mx)]
            @test Float64(Makie.red(px)) > 0.6 && Float64(Makie.green(px)) < 0.4
        end
    end

    @testset "Density extraction" begin
        using Masque: PolygonInteractable, interactables
        fig = Figure(); ax = Axis(fig[1, 1])
        density!(ax, randn(300))
        Makie.update_state_before_display!(fig)
        p = ax.scene.plots[1]
        pi = PolygonInteractable(ax, p; id = :density)
        @test length(pi.rings) == 1                       # the KDE fill is one region
        @test length(pi.rings[1]) > 50                    # dense outline (Makie's KDE band)
        @test pi.payloads[1] == (; index = 1)
        ints = interactables(fig)
        @test length(ints) == 1 && ints[1] isa PolygonInteractable
    end

    @testset "Violin extraction" begin
        using Masque: PolygonInteractable, interactables
        fig = Figure(); ax = Axis(fig[1, 1])
        violin!(ax, repeat([1, 2, 3], inner = 80), randn(240))
        Makie.update_state_before_display!(fig)
        p = ax.scene.plots[1]
        pi = PolygonInteractable(ax, p; id = :violin)
        @test length(pi.rings) == 3                        # one ring per violin
        @test length(pi.payloads) == 3
        @test [pl.x for pl in pi.payloads] == [1.0, 2.0, 3.0]   # exact clean categories from converted (no Float32 noise)
        @test all(pl.x isa Float64 for pl in pi.payloads)
        @test !haskey(pairs(pi.payloads[1]), :index)
        ints = interactables(fig)
        @test length(ints) == 1 && ints[1] isa PolygonInteractable
    end

    @testset "Voronoiplot extraction" begin
        using Masque: PolygonInteractable, interactables
        fig = Figure(); ax = Axis(fig[1, 1])
        voronoiplot!(ax, [0.1, 0.4, 0.7, 0.3, 0.9, 0.5, 0.2, 0.8], [0.2, 0.6, 0.1, 0.9, 0.4, 0.5, 0.8, 0.3])
        Makie.update_state_before_display!(fig)
        p = ax.scene.plots[1]
        pi = PolygonInteractable(ax, p; id = :voronoiplot)
        @test length(pi.rings) == 8                        # one cell per generator site
        @test all(isempty, pi.holes)                       # cells have no interiors; the shared helper stays exterior-only
        @test pi.payloads == Any[(; index = k) for k in 1:8]   # cell order ≠ site order → index only
        ints = interactables(fig)
        @test length(ints) == 1 && ints[1] isa PolygonInteractable
    end

    @testset "Hexbin extraction" begin
        using Masque: PolygonInteractable, interactables
        notwhite(c) = !(Float64(Makie.red(c)) > 0.95 && Float64(Makie.green(c)) > 0.95 && Float64(Makie.blue(c)) > 0.95)
        shoelace(g) = abs(sum(g[i] * g[mod1(i + 3, length(g))] - g[mod1(i + 2, length(g))] * g[i + 1] for i in 1:2:length(g))) / 2
        xs = [0.1, 0.12, 0.5, 0.52, 0.55, 0.9, 0.3, 0.7, 0.71, 0.2]
        ys = [0.1, 0.11, 0.5, 0.48, 0.52, 0.9, 0.7, 0.2, 0.22, 0.8]
        for xscale in (identity, log10)
            fig = Figure(size = (500, 400)); ax = Axis(fig[1, 1]; xscale)
            hidedecorations!(ax); hidespines!(ax)
            hb = hexbin!(ax, xs .+ (xscale === log10 ? 1.0 : 0.0), ys; bins = 4, colormap = [:black, :red])
            Makie.update_state_before_display!(fig)
            pi = PolygonInteractable(ax, hb)
            @test pi.id === :hexbin
            n = length(hb.points[])
            @test length(pi.rings) == n && all(length(r) == 6 for r in pi.rings)
            @test [pl.count for pl in pi.payloads] == hb.count_hex[]
            @test sum(pl.count for pl in pi.payloads) == length(xs)
            @test all(pl.count isa Int && pl.x isa Float64 for pl in pi.payloads)
            # no Float32 widening noise: each coordinate prints as its Float32 does
            @test all(string(pl.x) == string(Float32(pl.x)) && string(pl.y) == string(Float32(pl.y)) for pl in pi.payloads)
            # The rings cover exactly the drawn hexagons: their area matches the drawn pixels
            # (decorations hidden, so every non-white pixel is a hexagon), and each centre is
            # drawn. On a log axis the corners go back through the inverse transform.
            _, _, c = ctx_for(fig)
            L = only(hitlayers(pi, c))
            img = Makie.colorbuffer(fig; px_per_unit = 2.0)
            drawn = count(notwhite, img)
            @test isapprox(sum(shoelace, L.geometry), drawn; rtol = 0.03)
            for g in L.geometry
                cx = sum(g[1:2:end]) / 6; cy = sum(g[2:2:end]) / 6
                @test drawn_near(img, cx, cy; tol = 0)
            end
            # the centre payload is in data units
            pl = pi.payloads[argmax(hb.count_hex[])]
            @test pl.x > (xscale === log10 ? 1.0 : 0.0) && 0 < pl.y < 1
        end

        # weights sum into the count; threshold = 0 keeps the empty hexagons, each an element
        fig = Figure(); ax = Axis(fig[1, 1])
        hexbin!(ax, xs, ys; bins = 4, weights = fill(2.0, length(xs)), threshold = 0)
        Makie.update_state_before_display!(fig)
        ints = interactables(fig)
        @test length(ints) == 1 && only(ints) isa PolygonInteractable && only(ints).id === :hexbin
        cnt = [pl.count for pl in only(ints).payloads]
        @test sum(cnt) == 2 * length(xs) && any(iszero, cnt)
        # its hexagon Scatter is a descendant, not a second layer
        @test only(masque(fig).manifest["layers"])["id"] == "hexbin"

        # A moved hexbin: translate!/scale!/rotate! move each center, and the hexagon keeps
        # its drawn size and orientation (its marker doesn't transform). Each moved ring is the
        # unmoved ring's shape around a center that lands on drawn pixels. (Pixel area can't be
        # compared here: moved centers no longer tile, so neighbours overlap. Geometry is whole
        # pixels, hence the 1.5 px slack.)
        function hexrings(move!)
            fm = Figure(size = (500, 400)); am = Axis(fm[1, 1]; limits = (-1.5, 2.5, -1.5, 2.5))
            hidedecorations!(am); hidespines!(am)
            hm = hexbin!(am, xs, ys; bins = 4, colormap = [:black, :red])
            move!(hm)
            Makie.update_state_before_display!(fm)
            _, _, cm = ctx_for(fm)
            return only(hitlayers(only(interactables(am, hm)), cm)).geometry, Makie.colorbuffer(fm; px_per_unit = 2.0)
        end
        centred(g) = (c = (sum(g[1:2:end]) / 6, sum(g[2:2:end]) / 6); [g[k] - c[isodd(k) ? 1 : 2] for k in eachindex(g)])
        g0, _ = hexrings(identity)
        shape = centred(first(g0))
        for move! in (h -> translate!(h, 0.3, 0.2, 0), h -> scale!(h, 1.4, 0.8, 1), h -> rotate!(h, π / 7))
            gm, imgm = hexrings(move!)
            @test gm != g0
            @test all(g -> maximum(abs, centred(g) - shape) <= 1.5, gm)
            @test all(g -> drawn_near(imgm, sum(g[1:2:end]) / 6, sum(g[2:2:end]) / 6; tol = 0), gm)
        end

        # an axis transform with no inverse: warn and skip the hexbin, not the whole figure
        fn = Figure(); an = Axis(fn[1, 1])
        hn = hexbin!(an, xs, ys; bins = 4)
        Makie.update_state_before_display!(fn)
        an.scene.transformation.transform_func[] = (x -> x, x -> x)
        @test isempty(@test_logs((:warn, r"no inverse"), PolygonInteractable(an, hn)).rings)

        # on a date axis the center shows as a date, like the other default payloads
        fd = Figure(); ad = Axis(fd[1, 1])
        hexbin!(ad, Makie.Dates.DateTime(2024, 1, 1) .+ Makie.Dates.Day.(1:20), collect(range(0, 1; length = 20)); bins = 3)
        Makie.update_state_before_display!(fd)
        @test all(pl.x isa String && startswith(pl.x, "2024-01") for pl in only(interactables(fd)).payloads)
    end

    @testset "Contourf extraction" begin
        using Masque: PolygonInteractable, interactables
        fig = Figure(); ax = Axis(fig[1, 1])
        z = [sin(i / 3) * cos(j / 3) for i in 1:20, j in 1:20]
        contourf!(ax, 1:20, 1:20, z; levels = 6)
        Makie.update_state_before_display!(fig)
        p = ax.scene.plots[1]
        pi = PolygonInteractable(ax, p; id = :contourf)
        @test length(pi.rings) == length(pi.payloads)            # one element per filled level-piece
        @test length(pi.rings) > 1
        @test all(haskey(pairs(pl), :low) && haskey(pairs(pl), :high) for pl in pi.payloads)
        @test all(pl.low isa Float64 && pl.high isa Float64 for pl in pi.payloads)
        @test all(pl.low < pl.high for pl in pi.payloads)        # band interval ordered
        @test !haskey(pairs(pi.payloads[1]), :index)
        ints = interactables(fig)
        @test length(ints) == 1 && ints[1] isa PolygonInteractable

        # explicit levels → intervals are the true bands [edge_k, edge_{k+1}] (caught the midpoint-vs-edge bug)
        fige = Figure(); axe = Axis(fige[1, 1])
        ze = [sin(i / 3) * cos(j / 3) for i in 1:20, j in 1:20]
        contourf!(axe, 1:20, 1:20, ze; levels = [0.0, 0.4, 0.8])
        Makie.update_state_before_display!(fige)
        pie = PolygonInteractable(axe, axe.scene.plots[1]; id = :contourf)
        intervals = sort(unique([(round(pl.low, digits = 6), round(pl.high, digits = 6)) for pl in pie.payloads]))
        @test intervals == [(0.0, 0.4), (0.4, 0.8)]

        # constant (zero-range) data → one fill, a correctly zero-width band, no crash
        figc = Figure(); axc = Axis(figc[1, 1])
        contourf!(axc, 1:10, 1:10, fill(1.0, 10, 10); levels = 6)
        Makie.update_state_before_display!(figc)
        pic = PolygonInteractable(axc, axc.scene.plots[1]; id = :contourf)
        @test !isempty(pic.payloads)
        @test all(pl.low <= pl.high for pl in pic.payloads)

        # A nested peak: each annular band keeps its hole on the same element. The innermost disk stays one flat ring.
        figh = Figure(); axh = Axis(figh[1, 1])
        xs = range(-2, 2, length = 40)
        ys = range(-2, 2, length = 40)
        contourf!(axh, xs, ys, [exp(-(x^2 + y^2)) for x in xs, y in ys]; levels = 5)
        _, _, ch = ctx_for(figh)
        ph = PolygonInteractable(axh, axh.scene.plots[1]; id = :contourf)
        Lh = only(hitlayers(ph, ch))
        pieces = Masque._conv(Masque._childof(axh.scene.plots[1], Makie.Poly))[1]
        @test length(Lh.geometry) == length(pieces) == length(Lh.payloads)
        @test any(!isempty, (piece.interiors for piece in pieces))
        for (piece, elem) in zip(pieces, Lh.geometry)
            n = length(piece.interiors)
            if n == 0
                @test first(elem) isa Real
            else
                @test length(elem) == 1 + n
                @test all(ring -> first(ring) isa Real, elem)
            end
        end

        # Two peaks under an explicit top edge: one band has two holes, and the unfilled peak is a hole, not its own element.
        fig2 = Figure(); ax2 = Axis(fig2[1, 1])
        xs2 = range(-3, 3, length = 50)
        ys2 = range(-2, 2, length = 40)
        z2 = [exp(-((x - 1.2)^2 + y^2)) + exp(-((x + 1.2)^2 + y^2)) for x in xs2, y in ys2]
        contourf!(ax2, xs2, ys2, z2; levels = [0.2, 0.5, 0.9])
        _, _, c2 = ctx_for(fig2)
        p2 = PolygonInteractable(ax2, ax2.scene.plots[1]; id = :contourf)
        L2 = only(hitlayers(p2, c2))
        @test length(L2.geometry) == length(p2.payloads) == 3
        @test length(L2.geometry[1]) == 3                  # exterior + two holes
        @test L2.payloads[1].low < 0.5
    end

    # A holed element is a flat list of rings, so `length` is the ring count. Several holes in one
    # band, and an island that is its own solid element of the same band. Pointer checks,
    # including a dented ring, live in test/e2e/contourf_complex.mjs.
    _ringcount(elem) = first(elem) isa Real ? 1 : length(elem)
    _rings(elem) = first(elem) isa Real ? [elem] : elem
    function _inring(px, py, ring)
        inside = false
        n = length(ring) ÷ 2
        j = n
        for i in 1:n
            xi, yi = ring[2i - 1], ring[2i]
            xj, yj = ring[2j - 1], ring[2j]
            if (yi > py) != (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi
                inside = !inside
            end
            j = i
        end
        return inside
    end
    function _inrings(px, py, rings)
        inside = false
        for ring in rings
            _inring(px, py, ring) && (inside = !inside)
        end
        return inside
    end
    function _centroid(ring)
        n = length(ring) ÷ 2
        return (sum(ring[2i - 1] for i in 1:n) / n, sum(ring[2i] for i in 1:n) / n)
    end
    @testset "Contourf holes on busier fields" begin
        using Masque: PolygonInteractable
        # Three narrow peaks on a shared pedestal: one band carries several holes.
        fig = Figure(); ax = Axis(fig[1, 1])
        xs = range(-3, 3, length = 80)
        ys = range(-3, 3, length = 80)
        centers = [(0.85, 0.0), (-0.42, 0.73), (-0.42, -0.73)]
        z = [
            0.22 * exp(-(x^2 + y^2) / 6) +
                sum(exp(-((x - cx)^2 + (y - cy)^2) / 0.18) for (cx, cy) in centers)
                for x in xs, y in ys
        ]
        contourf!(ax, xs, ys, z; levels = [0.12, 0.28, 0.65])
        _, _, ctx = ctx_for(fig)
        ped = only(hitlayers(PolygonInteractable(ax, ax.scene.plots[1]), ctx))
        @test length(ped.geometry) == length(ped.payloads)
        @test maximum(_ringcount, ped.geometry) >= 4          # exterior + at least 3 holes

        # A ring with a central bump of the same band: the bump is its own solid element.
        figb = Figure(); axb = Axis(figb[1, 1])
        xb = range(-3, 3, length = 70)
        yb = range(-3, 3, length = 70)
        zb = [exp(-((hypot(x, y) - 1.6)^2) / 0.1) + 0.35 * exp(-(x^2 + y^2) / 0.15) for x in xb, y in yb]
        contourf!(axb, xb, yb, zb; levels = [0.15, 0.4, 0.8])
        _, _, cb = ctx_for(figb)
        bump = only(hitlayers(PolygonInteractable(axb, axb.scene.plots[1]), cb))
        @test length(bump.geometry) == length(bump.payloads)
        # The central bump is a solid element of the same band, sitting in a hole of that band.
        island = false
        for (s, solid) in enumerate(bump.geometry)
            _ringcount(solid) == 1 || continue
            cx, cy = _centroid(solid)
            for (h, holed) in enumerate(bump.geometry)
                _ringcount(holed) > 1 || continue
                rings = _rings(holed)
                in_hole = any(ring -> _inring(cx, cy, ring), rings[2:end])
                same_band = bump.payloads[s].low == bump.payloads[h].low &&
                    bump.payloads[s].high == bump.payloads[h].high
                if in_hole && !_inrings(cx, cy, rings) && same_band
                    island = true
                end
            end
        end
        @test island
    end

    @testset "BoxPlot extraction" begin
        using Masque: RectInteractable, PolygonInteractable, interactables
        import Statistics
        cats = repeat([1, 2], inner = 120)
        vals = [randn(120) .- 1; randn(120) .+ 2]

        # notch off → RectInteractable; stats payload matches Statistics.quantile exactly
        fig = Figure(); ax = Axis(fig[1, 1])
        boxplot!(ax, cats, vals); Makie.update_state_before_display!(fig)
        bi = Masque._boxplot_interactable(ax, ax.scene.plots[1]; id = :boxplot)
        @test bi isa RectInteractable
        @test length(bi.payloads) == 2
        @test all(pl.q1 isa Float64 && pl.median isa Float64 && pl.q3 isa Float64 for pl in bi.payloads)
        @test all(pl.q1 < pl.median < pl.q3 for pl in bi.payloads)
        for g in (1, 2)
            q = Statistics.quantile(vals[cats .== g], [0.25, 0.5, 0.75])
            @test bi.payloads[g].q1 ≈ q[1]
            @test bi.payloads[g].median ≈ q[2]
            @test bi.payloads[g].q3 ≈ q[3]
        end
        @test !haskey(pairs(bi.payloads[1]), :index)
        @test any(i -> i isa RectInteractable, interactables(fig))

        # notch on → PolygonInteractable; same stats payload
        fig2 = Figure(); ax2 = Axis(fig2[1, 1])
        boxplot!(ax2, cats, vals; show_notch = true); Makie.update_state_before_display!(fig2)
        bi2 = Masque._boxplot_interactable(ax2, ax2.scene.plots[1]; id = :boxplot)
        @test bi2 isa PolygonInteractable
        @test length(bi2.payloads) == 2
        @test all(haskey(pairs(pl), :median) for pl in bi2.payloads)

        # fail-loud when the stats node is absent (pass a leaf child that has a 1-tuple converted, not the 4-tuple stats node)
        @test_throws ErrorException Masque._boxplot_stats_node(ax.scene.plots[1].plots[1])
    end

    @testset "masque(fig) auto-extracts spans bounded to viewport" begin
        # End-to-end guard: calling masque(fig) (the AUTO path, no manual update_state_before_display!)
        # on a 2-axis figure with a vspan must succeed and produce a layer whose pixel rect is
        # bounded within the owning axis's viewport.
        # Note: the viewport clamp masks finallimits-staleness, so this test guards the full
        # pipeline end-to-end but cannot isolate the update_state_before_display! ordering
        # line specifically — that's expected.
        fig = Figure(size = (700, 400))
        ax1 = Axis(fig[1, 1]); scatter!(ax1, [1.0, 2.0, 3.0], [1.0, 2.0, 3.0])
        ax2 = Axis(fig[1, 2])
        vspan!(ax2, [1.0], [2.0])
        # AUTO path: masque(fig) calls update_state_before_display! internally
        w = masque(fig)
        vspan_layer = only(filter(L -> L["id"] == "vspan", w.manifest["layers"]))
        ax_id = vspan_layer["axis"]                          # e.g. "ax2"
        vp = w.manifest["transforms"][ax_id]["viewport"]    # [vp_x, vp_y, vp_w, vp_h] in image-px
        vp_x, vp_y, vp_w, vp_h = vp[1], vp[2], vp[3], vp[4]
        geom = vspan_layer["geometry"]                       # flat [cx, cy, w, h] for the one span
        cx_px, cy_px, w_px, h_px = geom[1], geom[2], geom[3], geom[4]
        @test isfinite(cx_px) && isfinite(cy_px)            # layer is present and projected
        @test w_px > 0 && h_px > 0                          # has nonzero size
        @test cx_px - w_px / 2 >= vp_x                     # left edge within viewport
        @test cx_px + w_px / 2 <= vp_x + vp_w             # right edge within viewport
    end

    @testset "plot-object constructors take tooltip and label (#213)" begin
        # Every plot-object method forwards `tooltip` and `label` to its layer, the same as
        # the positions/geometry constructors do.
        tpl = masque"hit"
        layer(i, ctx) = only(build_manifest([i], ctx)["layers"])
        function check(i, ctx)
            L = layer(i, ctx)
            @test L["template"] == ["hit"]
            @test L["label"] == "L"
        end

        f = Figure(size = (900, 900))
        a1 = Axis(f[1, 1]); a2 = Axis(f[1, 2]); a3 = Axis(f[2, 1]); a4 = Axis(f[2, 2])
        a5 = Axis(f[3, 1]); a6 = Axis(f[3, 2])
        sc = scatter!(a1, [1.0, 2.0, 3.0], [1.0, 4.0, 9.0])
        ln = lines!(a1, [1.0, 2.0, 3.0], [2.0, 3.0, 1.0])
        ls = linesegments!(a1, [1.0, 2.0, 2.0, 3.0], [1.0, 1.0, 2.0, 2.0])
        st = stairs!(a1, [1.0, 2.0, 3.0], [1.0, 2.0, 1.5])
        se = series!(a2, [1.0 2.0 3.0; 2.0 1.0 3.0])
        eb = errorbars!(a2, [1.0, 2.0], [1.0, 2.0], [0.2, 0.3])
        rb = rangebars!(a2, [1.0, 2.0], [0.5, 1.0], [1.5, 2.5])
        hl = hlines!(a2, [1.5])
        vl = vlines!(a2, [1.5])
        hm = heatmap!(a3, [1.0 2.0; 3.0 4.0])
        bp = barplot!(a4, [1, 2, 3], [2.0, 3.0, 1.0])
        hs = hist!(a4, [1.0, 1.5, 2.0, 2.2, 3.0])
        wf = waterfall!(a4, [1, 2, 3], [1.0, -0.5, 2.0])
        cb = crossbar!(a4, [1, 2], [2.0, 3.0], [1.5, 2.5], [2.5, 3.5])
        hsp = hspan!(a4, [0.5], [0.8])
        vsp = vspan!(a4, [0.5], [0.8])
        sp = spy!(a5, [1.0 0.0; 0.0 1.0])
        po = poly!(a6, Point2f[(0, 0), (1, 0), (1, 1)])
        bd = band!(a6, [1.0, 2.0, 3.0], [0.0, 0.5, 0.2], [1.0, 1.5, 1.2])
        de = density!(a6, [1.0, 1.2, 1.9, 2.5, 3.0])
        tx = text!(a1, [(1.0, 1.0)]; text = ["a"])
        _, _, ctx = ctx_for(f)

        for i in (
                PointInteractable(a1, sc; tooltip = tpl, label = "L"),
                SegmentInteractable(a1, ln; tooltip = tpl, label = "L"),
                SegmentInteractable(a1, ls; tooltip = tpl, label = "L"),
                SegmentInteractable(a1, st; tooltip = tpl, label = "L"),
                SegmentInteractable(a2, se; tooltip = tpl, label = "L"),
                SegmentInteractable(a2, eb; tooltip = tpl, label = "L"),
                SegmentInteractable(a2, rb; tooltip = tpl, label = "L"),
                SegmentInteractable(a2, hl; tooltip = tpl, label = "L"),
                SegmentInteractable(a2, vl; tooltip = tpl, label = "L"),
                GridInteractable(a3, hm; tooltip = tpl, label = "L"),
                RectInteractable(a4, bp; tooltip = tpl, label = "L"),
                RectInteractable(a4, hs; tooltip = tpl, label = "L"),
                RectInteractable(a4, wf; tooltip = tpl, label = "L"),
                RectInteractable(a4, cb; tooltip = tpl, label = "L"),
                RectInteractable(a4, hsp; tooltip = tpl, label = "L"),
                RectInteractable(a4, vsp; tooltip = tpl, label = "L"),
                RectInteractable(a5, sp; tooltip = tpl, label = "L"),
                PolygonInteractable(a6, po; tooltip = tpl, label = "L"),
                PolygonInteractable(a6, bd; tooltip = tpl, label = "L"),
                PolygonInteractable(a6, de; tooltip = tpl, label = "L"),
                TextInteractable(a1, tx; tooltip = tpl, label = "L"),
            )
            check(i, ctx)
        end

        g = Figure(size = (600, 400))
        b1 = Axis(g[1, 1]); b2 = Axis(g[1, 2]); b3 = Axis(g[2, 1])
        cf = contourf!(b1, [1.0 2.0 3.0; 2.0 3.0 4.0; 3.0 4.0 5.0])
        vi = violin!(b2, [1, 1, 1, 2, 2, 2], [1.0, 2.0, 1.5, 2.0, 3.0, 2.5])
        vo = voronoiplot!(b3, [0.1, 0.8, 0.4], [0.2, 0.3, 0.9])
        _, _, gctx = ctx_for(g)
        for i in (
                PolygonInteractable(b1, cf; tooltip = tpl, label = "L"),
                PolygonInteractable(b2, vi; tooltip = tpl, label = "L"),
                PolygonInteractable(b3, vo; tooltip = tpl, label = "L"),
            )
            check(i, gctx)
        end

        h = Figure(size = (500, 400))
        c = Axis3(h[1, 1])
        ms = meshscatter!(c, [1.0, 2.0], [1.0, 2.0], [1.0, 2.0]; markersize = 0.1)
        wf3 = wireframe!(c, [0.0, 1.0], [0.0, 1.0], [0.0 1.0; 1.0 0.0])
        ar = arrows3d!(c, [Point3f(0, 0, 0)], [Vec3f(1, 0, 0)])
        _, _, hctx = ctx_for(h)
        for i in (
                PointInteractable(c, ms; tooltip = tpl, label = "L"),
                SegmentInteractable(c, wf3; tooltip = tpl, label = "L"),
                SegmentInteractable(c, ar; tooltip = tpl, label = "L"),
            )
            check(i, hctx)
        end
    end
end
