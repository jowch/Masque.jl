using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

@testset "Axis3 / PolarAxis" begin
    @testset "PolarAxis: context + projection + payloads + gates" begin
        # Discrete hits project through the shared closure (Makie.Polar in transform_func).
        # Continuous θ/r readout is the next testset; the straight-line consumers are gated.
        fp = Figure(; size = (600, 450))
        axp = PolarAxis(fp[1, 1])
        # (θ, r) data coords — four cardinal points so the projection hinge is unambiguous
        ptsp = [
            Point2f(0.0, 1.0), Point2f(π / 2, 2.0),
            Point2f(π, 1.5), Point2f(3π / 2, 2.5),
        ]
        scatter!(axp, ptsp; color = :red, markersize = 14)
        lines!(axp, range(0, 2π; length = 64), fill(1.2, 64))
        _, ppup, ctxp = ctx_for(fp)

        tp = ctxp.transforms[IP.axis_id(ctxp, axp)]
        @test tp.ispolar
        @test !tp.is3d
        @test tp.viewport[3] > 0 && tp.viewport[4] > 0
        @test IP._transform_dict(tp)["ispolar"] === true

        # projected :circles land on the rendered markers (red-pixel hinge, same as Axis3/log)
        isred(c) = Float64(Makie.red(c)) > 0.6 && Float64(Makie.green(c)) < 0.4 && Float64(Makie.blue(c)) < 0.4
        function red_near_in(img, cx, cy; tol = 8)
            ih, iw = size(img)
            x, y = round(Int, cx), round(Int, cy)
            for dy in -tol:tol, dx in -tol:tol
                xx, yy = x + dx, y + dy
                (1 <= xx <= iw && 1 <= yy <= ih) || continue
                isred(img[yy, xx]) && return true
            end
            return false
        end
        imgp = Makie.colorbuffer(fp; px_per_unit = ppup)
        Lp = only(hitlayers(PointInteractable(axp, ptsp; radius = 7), ctxp))
        @test Lp.kind === :circles && length(Lp.geometry) == 12
        for k in 0:3
            @test red_near_in(imgp, Lp.geometry[3k + 1], Lp.geometry[3k + 2])
        end

        # AxisInteractable reads (θ, r) on a polar axis (#170); the straight-line consumers still fail loud
        @test validate(AxisInteractable(axp), ctxp) === nothing
        for bad in (
                ThresholdInteractable(axp; orientation = :horizontal, value = 1.0),
                ROIInteractable(axp; bounds = (0.0, 1.0, 0.5, 1.5)),
                SliceInteractable(axp; series = [(; x = [0.0, 1.0], y = [0.0, 1.0])]),
            )
            msg = validate(bad, ctxp)
            @test msg !== nothing && occursin("PolarAxis", msg)
            @test_throws ArgumentError build_manifest([bad], ctxp)
        end

        # auto-extract: Scatter + Lines ride; heatmap-on-polar warn-and-skips
        fpi = Figure(; size = (600, 450))
        axpi = PolarAxis(fpi[1, 1])
        scatter!(axpi, [0.0, π / 2], [1.0, 2.0]; markersize = 10)
        lines!(axpi, [0.0, π], [1.0, 1.5])
        Makie.update_state_before_display!(fpi)
        ints = interactables(fpi)
        @test any(i -> i isa PointInteractable, ints)
        @test any(i -> i isa SegmentInteractable, ints)
        _, _, ctxpi = ctx_for(fpi)
        mp = build_manifest(ints, ctxpi)
        @test mp["transforms"]["ax1"]["ispolar"] === true
        @test length(mp["layers"]) == 2

        fpg = Figure(; size = (600, 450))
        axpg = PolarAxis(fpg[1, 1])
        # heatmap on PolarAxis is a supported Makie recipe but not a polar-valid Masque extraction
        heatmap!(axpg, 0:0.5:π, 1:3, rand(7, 3))
        scatter!(axpg, [0.0], [1.0]; markersize = 10)
        Makie.update_state_before_display!(fpg)
        gints = @test_logs (:warn, r"heatmap on PolarAxis") interactables(fpg)
        @test length(gints) == 1
        @test only(gints) isa PointInteractable
    end

    @testset "PolarAxis: θ/r readout round-trips through the shipped transform (#170)" begin
        # Mirror of `invertAxis` in frontend/src/geometry.ts on a polar transform: the linear map
        # over the Cartesian window (image y-down → Makie y-up), then Makie's inverse of Polar
        # folded into the branch. Reads the serialized dict, so it checks what JS receives.
        function js_invert(td, px, py)
            vx, vy, vw, vh = td["viewport"]
            fx = (px - vx) / vw; fy = 1 - (py - vy) / vh
            xl, yl = td["xlims"], td["ylims"]
            x = xl[1] + fx * (xl[2] - xl[1]); y = yl[1] + fy * (yl[2] - yl[1])
            p = td["polar"]; lo = p["branch"][1]
            θ = lo + mod(p["direction"] * atan(y, x) - p["theta_0"] - lo, 2π)
            r = hypot(x, y) + p["r0"]
            return p["theta_as_x"] ? (θ, r) : (r, θ)
        end
        # Makie's own reading of an image pixel: the scene-relative pixel through `to_world`
        # (what `mouseposition` does), then the axis handler's atan, folded into the same branch.
        function makie_world(ctx, ax, px, py)
            o = Makie.viewport(ax.scene)[].origin
            return Makie.to_world(ax.scene, Makie.Point2d(px / ctx.scaling - o[1], (ctx.height - py) / ctx.scaling - o[2]))
        end
        function makie_reading(ctx, ax, px, py)
            mp = makie_world(ctx, ax, px, py)
            t1, t2 = ax.target_thetalims[]
            lo = abs(t2 - t1) < 2π ? 0.5 * (t1 + t2) - π : 0.0
            θ = lo + mod(ax.direction[] * atan(mp[2], mp[1]) - ax.target_theta_0[] - lo, 2π)
            r = hypot(mp[1], mp[2]) + ax.target_r0[]
            return ax.theta_as_x[] ? (θ, r) : (r, θ)
        end
        angdiff(a, b) = abs(rem2pi(a - b, RoundNearest))
        # Points go through the unrounded projection closure (hit geometry is rounded to whole
        # px). The camera is Float32: 1e-3 is ~0.2 px on these figures, far above Float32 noise.
        tol = 1.0e-3

        # Full circle (the default): marker centres invert back to their (θ, r).
        f = Figure(; size = (600, 450))
        ax = PolarAxis(f[1, 1])
        pts = [Point2f(0.0, 1.0), Point2f(π / 2, 2.0), Point2f(π, 1.5), Point2f(3π / 2, 2.5), Point2f(5.5, 0.7)]
        scatter!(ax, pts)
        _, _, ctx = ctx_for(f)
        td = IP._transform_dict(ctx.transforms[IP.axis_id(ctx, ax)])
        @test td["polar"]["branch"] ≈ [0.0, 2π]
        @test td["polar"]["direction"] == 1 && td["polar"]["theta_0"] == 0.0 && td["polar"]["r0"] == 0.0
        for p in pts
            θ, r = js_invert(td, ctx.project(ax, p)...)
            @test angdiff(θ, p[1]) < tol
            @test isapprox(r, p[2]; atol = tol)
        end
        # A letterbox pixel (the 600×450 figure makes the viewport wider than the disc) and the
        # viewport's top-left corner both read past the disc, as Makie reads them.
        vx, vy, vw, vh = td["viewport"]
        for (px, py) in ((vx + 2, vy + vh / 2), (vx + 1, vy + 1))
            θ, r = js_invert(td, px, py)
            mθ, mr = makie_reading(ctx, ax, px, py)
            @test angdiff(θ, mθ) < tol && isapprox(r, mr; rtol = tol)
            @test r > ax.target_rlims[][2]
        end
        # Makie's own inverse_transform agrees off the 0/2π seam.
        q = ctx.project(ax, pts[2])
        θ, r = js_invert(td, q...)
        itf = Makie.inverse_transform(ax.scene.transformation.transform_func[])
        mp = Makie.apply_transform(itf, makie_world(ctx, ax, q...))
        @test isapprox(θ, mp[1]; atol = tol) && isapprox(r, mp[2]; atol = tol)
        # The origin reads θ = atan2(0, 0) = 0 and r = r0.
        o = ctx.project(ax, Point2f(0.0, 0.0))
        @test js_invert(td, o[1], o[2])[2] < tol

        # A sector around 0, clockwise, rotated, with a negative radius at the origin: a point
        # drawn at θ < 0 reads back below 0, not near 2π (the branch is thetacenter ± π).
        fs = Figure(; size = (500, 500))
        axs = PolarAxis(
            fs[1, 1]; thetalimits = (-π / 3, π / 3), theta_0 = π / 4, direction = -1,
            radius_at_origin = -0.5, rlimits = (0, 3),
        )
        spts = [Point2f(-0.2, 1.0), Point2f(-0.9, 2.5), Point2f(0.6, 0.3), Point2f(0.0, 2.0)]
        scatter!(axs, spts)
        _, _, ctxs = ctx_for(fs)
        tds = IP._transform_dict(ctxs.transforms[IP.axis_id(ctxs, axs)])
        @test tds["polar"]["branch"] ≈ [-π, π]
        @test tds["polar"]["direction"] == -1 && isapprox(tds["polar"]["theta_0"], π / 4; atol = 1.0e-6) && tds["polar"]["r0"] == -0.5
        for p in spts
            θ, r = js_invert(tds, ctxs.project(axs, p)...)
            @test isapprox(θ, p[1]; atol = tol) && isapprox(r, p[2]; atol = tol)
        end
        vx, vy, vw, vh = tds["viewport"]
        for (px, py) in ((vx + 1, vy + 1), (vx + vw - 1, vy + vh - 1), (vx + vw / 2, vy + vh - 2))
            θ, r = js_invert(tds, px, py)
            mθ, mr = makie_reading(ctxs, axs, px, py)
            @test isapprox(θ, mθ; atol = tol) && isapprox(r, mr; rtol = tol)
        end

        # theta_as_x = false: data is (r, θ), and the readout is swapped to match.
        fr = Figure(; size = (450, 600))
        axr = PolarAxis(fr[1, 1]; theta_as_x = false)
        rpts = [Point2f(1.0, 0.3), Point2f(2.0, 2.2)]
        scatter!(axr, rpts)
        _, _, ctxr = ctx_for(fr)
        tdr = IP._transform_dict(ctxr.transforms[IP.axis_id(ctxr, axr)])
        @test tdr["polar"]["theta_as_x"] === false
        for p in rpts
            r, θ = js_invert(tdr, ctxr.project(axr, p)...)
            @test isapprox(r, p[1]; atol = tol) && angdiff(θ, p[2]) < tol
        end

        # Builds into an :axis layer; non-polar transforms ship `polar = nothing`.
        m = build_manifest([AxisInteractable(ax)], ctx)
        @test only(m["layers"])["kind"] == "axis"
        @test m["transforms"][string(IP.axis_id(ctx, ax))]["polar"] isa Dict
        fc = Figure(); axc = Axis(fc[1, 1]); scatter!(axc, [1, 2], [1, 2])
        _, _, ctxc = ctx_for(fc)
        @test IP._transform_dict(ctxc.transforms[IP.axis_id(ctxc, axc)])["polar"] === nothing
    end

    @testset "PolarAxis Series auto-extracts (children are polar-valid Lines)" begin
        f = Figure(; size = (600, 450))
        ax = PolarAxis(f[1, 1])
        θ = collect(range(0, 2π; length = 8))
        ys = [ones(1, 8); fill(1.5, 1, 8)]
        series!(ax, θ, ys)
        Makie.update_state_before_display!(f)
        ints = @test_logs interactables(f)
        @test length(ints) == 1
        @test only(ints) isa SegmentInteractable
        _, _, ctx = ctx_for(f)
        L = only(hitlayers(only(ints), ctx))
        @test L.kind === :lines && L.id === :series && length(L.geometry) == 2
    end

    @testset "Axis3: context + projection + payloads + gates (WS-3D core)" begin
        f3 = Figure(; size = (600, 450))
        ax3 = Axis3(f3[1, 1]; azimuth = 0.4, elevation = 0.5)
        pts3 = Makie.Point3f[(1, 2, 3), (4, 5, 6), (7, 8, 2)]
        scatter!(ax3, pts3; color = :red, markersize = 14)
        _, ppu3, ctx3 = ctx_for(f3)

        # registered with an is3d transform: degenerate lims, real pixel viewport
        t3 = ctx3.transforms[IP.axis_id(ctx3, ax3)]
        @test t3.is3d
        @test t3.viewport[3] > 0 && t3.viewport[4] > 0
        @test IP._transform_dict(t3)["is3d"] === true

        # projected :circles land on the rendered markers — the projection hinge as a unit
        # test (red-pixel assert, same idiom as the log-scale testsets), static then rotated
        isred(c) = Float64(Makie.red(c)) > 0.6 && Float64(Makie.green(c)) < 0.4 && Float64(Makie.blue(c)) < 0.4
        function red_near_in(img, cx, cy; tol = 6)
            ih, iw = size(img)
            x, y = round(Int, cx), round(Int, cy)
            for dy in -tol:tol, dx in -tol:tol
                xx, yy = x + dx, y + dy
                (1 <= xx <= iw && 1 <= yy <= ih) || continue
                isred(img[yy, xx]) && return true
            end
            return false
        end
        img3 = Makie.colorbuffer(f3; px_per_unit = ppu3)
        L3 = only(hitlayers(PointInteractable(ax3, pts3; radius = 7), ctx3))
        @test L3.kind === :circles && length(L3.geometry) == 9
        for k in 0:2
            @test red_near_in(img3, L3.geometry[3k + 1], L3.geometry[3k + 2])
        end

        # rotation via azimuth/elevation re-render: fresh context re-projects onto the new view
        ax3.azimuth[] = 1.1; ax3.elevation[] = 0.2
        _, ppu3b, ctx3b = ctx_for(f3)
        img3b = Makie.colorbuffer(f3; px_per_unit = ppu3b)
        L3b = only(hitlayers(PointInteractable(ax3, pts3; radius = 7), ctx3b))
        @test any(L3b.geometry[i] != L3.geometry[i] for i in 1:9)   # the view actually moved
        for k in 0:2
            @test red_near_in(img3b, L3b.geometry[3k + 1], L3b.geometry[3k + 2])
        end

        # 3-coord default payloads carry z; 2-coord payloads keep the exact 2D shape
        @test PointInteractable(ax3, pts3).payloads[1] == (; index = 1, x = 1.0, y = 2.0, z = 3.0)
        @test PointInteractable(ax3, [(1.0, 2.0)]).payloads[1] == (; index = 1, x = 1.0, y = 2.0)

        # continuous pixel→data consumers fail loud on is3d (a screen pixel is a ray)
        for bad in (
                AxisInteractable(ax3),
                ThresholdInteractable(ax3; orientation = :horizontal, value = 1.0),
                ROIInteractable(ax3; bounds = (1.0, 2.0, 1.0, 2.0)),
                SliceInteractable(ax3; series = [(; x = [0.0, 1.0], y = [0.0, 1.0])]),
            )
            msg = validate(bad, ctx3)
            @test msg !== nothing && occursin("Axis3", msg)
            @test_throws ArgumentError build_manifest([bad], ctx3)
        end

        # introspection: Scatter/Lines on Axis3 ride the widened constructors for free
        f3i = Figure(; size = (600, 450))
        ax3i = Axis3(f3i[1, 1])
        scatter!(ax3i, Makie.Point3f[(1, 2, 3), (4, 5, 6)]; markersize = 10)
        lines!(ax3i, Makie.Point3f[(0, 0, 0), (2, 2, 2), (4, 0, 1)])
        Makie.update_state_before_display!(f3i)
        ints = interactables(f3i)
        @test any(i -> i isa PointInteractable, ints)
        @test any(i -> i isa SegmentInteractable, ints)
        _, _, ctx3i = ctx_for(f3i)
        m3 = build_manifest(ints, ctx3i)
        @test m3["transforms"]["ax1"]["is3d"] === true
        @test length(m3["layers"]) == 2
        pl3 = only(filter(l -> l["kind"] == "circles", m3["layers"]))["payloads"][1]
        @test pl3 == (; index = 1, x = 1.0, y = 2.0, z = 3.0)   # introspected scatter payload carries z

        # Axis3 introspection gate: a recipe whose extraction is only 2D-valid (heatmap's grid
        # edges are projected per-axis — separably, which a 3D camera breaks) must warn-and-skip,
        # never construct silently-misaligned geometry.
        f3g = Figure(; size = (600, 450))
        ax3g = Axis3(f3g[1, 1])
        heatmap!(ax3g, 1:3, 1:3, [Float64(i + j) for i in 1:3, j in 1:3])
        scatter!(ax3g, Makie.Point3f[(1, 2, 3)]; markersize = 10)
        Makie.update_state_before_display!(f3g)
        gints = @test_logs (:warn, r"heatmap on Axis3") interactables(f3g)
        @test length(gints) == 1
        @test only(gints) isa PointInteractable
    end

    @testset "Axis3 per-type extraction: MeshScatter + Wireframe + Arrows3D" begin
        isredc(c) = Float64(Makie.red(c)) > 0.6 && Float64(Makie.green(c)) < 0.4 && Float64(Makie.blue(c)) < 0.4
        isbluec(c) = Float64(Makie.blue(c)) > 0.4 && Float64(Makie.red(c)) < 0.5 && Float64(Makie.green(c)) < 0.5
        function color_near(pred, img, cx, cy; tol = 5)
            ih, iw = size(img)
            x, y = round(Int, cx), round(Int, cy)
            for dy in -tol:tol, dx in -tol:tol
                xx, yy = x + dx, y + dy
                (1 <= xx <= iw && 1 <= yy <= ih) || continue
                pred(img[yy, xx]) && return true
            end
            return false
        end

        # MeshScatter: data-space markersize → per-element, depth-dependent pixel radii
        fm = Figure(; size = (600, 450))
        axm = Axis3(fm[1, 1]; azimuth = 0.4, elevation = 0.5)
        mpts = Makie.Point3f[(1, 2, 3), (4, 5, 6), (7, 8, 2)]
        msp = meshscatter!(axm, mpts; markersize = 0.6, color = :red)
        Makie.update_state_before_display!(fm)
        mints = @test_logs interactables(fm)       # no logs: meshscatter must NOT re-gate
        mi = only(mints)
        @test mi isa PointInteractable
        @test mi.radius3d !== nothing && length(mi.radius3d) == 3
        @test mi.payloads[1] == (; index = 1, x = 1.0, y = 2.0, z = 3.0)
        _, ppum, ctxm = ctx_for(fm)
        imgm = Makie.colorbuffer(fm; px_per_unit = ppum)
        Lm = only(hitlayers(mi, ctxm))
        @test Lm.kind === :circles && length(Lm.geometry) == 9
        for k in 0:2
            @test color_near(isredc, imgm, Lm.geometry[3k + 1], Lm.geometry[3k + 2])
            # computed radius, not the 9px-logical default (which would be 9×2=18 image px):
            # a 0.6-data-radius sphere at this camera projects to ~40 image px
            @test 25 < Lm.geometry[3k + 3] < 60
        end
        # edge sanity: a pixel just inside the reported radius (rightward) is still marker-red
        @test color_near(isredc, imgm, Lm.geometry[1] + 0.8 * Lm.geometry[3], Lm.geometry[2]; tol = 3)

        # radius= override disables radius3d derivation (fixed pixel radius, like Scatter)
        mio = PointInteractable(axm, msp; radius = 5)
        @test mio.radius3d === nothing
        Lo = only(hitlayers(mio, ctxm))
        @test Lo.geometry[3] == round(Int, 5 * ctxm.scaling)

        # PER-ELEMENT radii (the headline behavior): three different markersizes must yield
        # radii in that proportion — a regression that reuses one element's extents (or any
        # single shared radius) collapses the ratios to 1:1:1 and fails here. Also covers
        # _meshscatter_extents' per-element vector branch.
        fv = Figure(; size = (600, 450))
        axv = Axis3(fv[1, 1]; azimuth = 0.4, elevation = 0.5)
        meshscatter!(axv, mpts; markersize = [0.2, 0.5, 0.9], color = :red)
        Makie.update_state_before_display!(fv)
        vi = only(@test_logs interactables(fv))
        @test vi.radius3d == [Makie.Vec3f(0.2, 0.2, 0.2), Makie.Vec3f(0.5, 0.5, 0.5), Makie.Vec3f(0.9, 0.9, 0.9)]
        _, _, ctxv = ctx_for(fv)
        Lv = only(hitlayers(vi, ctxv))
        rv = [Lv.geometry[3k + 3] for k in 0:2]
        @test 2.0 < rv[2] / rv[1] < 3.0        # ≈ 0.5/0.2 = 2.5
        @test 3.6 < rv[3] / rv[1] < 5.4        # ≈ 0.9/0.2 = 4.5

        # DEPTH-dependence: under real perspective, equal extents at different depths project
        # to different radii — a camera-independent precomputed radius collapses them to equal.
        fp = Figure(; size = (600, 450))
        axp = Axis3(fp[1, 1]; azimuth = 0.4, elevation = 0.5, perspectiveness = 1.0)
        meshscatter!(axp, Makie.Point3f[(1, 1, 1), (9, 9, 9)]; markersize = 0.6, color = :red)
        Makie.update_state_before_display!(fp)
        pi3 = only(@test_logs interactables(fp))
        _, _, ctxp = ctx_for(fp)
        Lp = only(hitlayers(pi3, ctxp))
        rp = [Lp.geometry[3k + 3] for k in 0:1]
        @test abs(rp[1] / rp[2] - 1) > 0.1     # near/far radii differ (>10%)

        # radius3d validation fails loud on length mismatch
        @test_throws ArgumentError PointInteractable(axm, mpts; radius3d = [Makie.Vec3f(1, 1, 1)])

        # Wireframe: rendered edges from the child LineSegments (data space), :pairs mode
        fw = Figure(; size = (600, 450))
        axw = Axis3(fw[1, 1]; azimuth = 0.4, elevation = 0.5)
        wxs = 1:5
        wzs = [sin(x) * cos(y) + 3 for x in wxs, y in wxs]
        wireframe!(axw, wxs, wxs, wzs; color = :blue)
        Makie.update_state_before_display!(fw)
        wints = interactables(fw)
        wi = only(wints)
        @test wi isa SegmentInteractable && wi.mode === :pairs
        # a 5×5 grid draws 2·5·4 = 40 edges; Makie outlines each of the 16 quads (64 segments),
        # and the edges two quads share ship once (#316)
        @test length(wi.vertices) == 2 * 40
        wedges = Set(Set((wi.vertices[k], wi.vertices[k + 1])) for k in 1:2:length(wi.vertices))
        @test length(wedges) == 40
        _, ppuw, ctxw = ctx_for(fw)
        imgw = Makie.colorbuffer(fw; px_per_unit = ppuw)
        Lw = only(hitlayers(wi, ctxw))
        @test Lw.kind === :segments
        nseg = length(wi.vertices) ÷ 2
        for k in 0:7:(nseg - 1)   # sample every 7th segment's midpoint on the rendered wire
            mx = (Lw.geometry[4k + 1] + Lw.geometry[4k + 3]) / 2
            my = (Lw.geometry[4k + 2] + Lw.geometry[4k + 4]) / 2
            @test color_near(isbluec, imgw, mx, my; tol = 3)
        end

        # Arrows3D: SegmentInteractable(:pairs) from processed startpoints→endpoints (DATA
        # space). Raw pos→pos+dir is wrong under lengthscale/align (spike 2026-07-02 + 2026-09-11):
        # Makie autoscales into a normalized child MeshScatter space; startpoints/endpoints are
        # the post-align/lengthscale ends that the shaft+tip children span. Child quaternion ×
        # markersize.z reconstructs the same span in that child space — we read the data-space
        # ends so Masque's project closure (which applies float32convert) lands on drawn pixels.
        fa = Figure(; size = (600, 450))
        axa = Axis3(fa[1, 1]; azimuth = 0.4, elevation = 0.5)
        apts = Makie.Point3f[(1, 1, 1), (3, 2, 1), (2, 4, 3)]
        adirs = Makie.Vec3f[(1, 0, 0), (0, 1, 0.5), (-0.5, 0, 1)]
        arrows3d!(axa, apts, adirs; color = :red)
        Makie.update_state_before_display!(fa)
        aints = @test_logs interactables(fa)       # no logs: arrows3d must NOT re-gate
        ai = only(aints)
        @test ai isa SegmentInteractable && ai.mode === :pairs
        @test length(ai.vertices) == 6                  # 3 arrows × (start, end)
        @test ai.payloads[1] == (; index = 1, x = 1.0, y = 1.0, z = 1.0, u = 1.0, v = 0.0, w = 0.0)
        _, ppua, ctxa = ctx_for(fa)
        imga = Makie.colorbuffer(fa; px_per_unit = ppua)
        La = only(hitlayers(ai, ctxa))
        @test La.kind === :segments && length(La.geometry) == 12
        for k in 0:2
            mx = (La.geometry[4k + 1] + La.geometry[4k + 3]) / 2
            my = (La.geometry[4k + 2] + La.geometry[4k + 4]) / 2
            @test color_near(isredc, imga, mx, my; tol = 3)
        end

        # one direction shared by every arrow (Makie broadcasts it) must not crash (#248)
        fsh = Figure(; size = (600, 450))
        axsh = Axis3(fsh[1, 1]; azimuth = 0.4, elevation = 0.5)
        arrows3d!(axsh, apts, Makie.Vec3f(1, 0, 1); color = :red)
        Makie.update_state_before_display!(fsh)
        shi = only(@test_logs interactables(fsh))
        @test length(shi.vertices) == 6
        @test shi.payloads[3] == (; index = 3, x = 2.0, y = 4.0, z = 3.0, u = 1.0, v = 0.0, w = 1.0)
        _, ppush, ctxsh = ctx_for(fsh)
        imgsh = Makie.colorbuffer(fsh; px_per_unit = ppush)
        Lsh = only(hitlayers(shi, ctxsh))
        for k in 0:2
            mx = (Lsh.geometry[4k + 1] + Lsh.geometry[4k + 3]) / 2
            my = (Lsh.geometry[4k + 2] + Lsh.geometry[4k + 4]) / 2
            @test color_near(isredc, imgsh, mx, my; tol = 3)
        end

        # one start point shared by every direction is broadcast the same way
        fsp = Figure(; size = (600, 450))
        axsp = Axis3(fsp[1, 1]; azimuth = 0.4, elevation = 0.5)
        arrows3d!(axsp, Makie.Point3f(1, 1, 1), adirs; color = :red)
        Makie.update_state_before_display!(fsp)
        spi = only(@test_logs interactables(fsp))
        @test length(spi.vertices) == 6
        @test spi.payloads[3] == (; index = 3, x = 1.0, y = 1.0, z = 1.0, u = -0.5, v = 0.0, w = 1.0)
        _, ppusp, ctxsp = ctx_for(fsp)
        imgsp = Makie.colorbuffer(fsp; px_per_unit = ppusp)
        Lsp = only(hitlayers(spi, ctxsp))
        for k in 0:2
            mx = (Lsp.geometry[4k + 1] + Lsp.geometry[4k + 3]) / 2
            my = (Lsp.geometry[4k + 2] + Lsp.geometry[4k + 4]) / 2
            @test color_near(isredc, imgsp, mx, my; tol = 3)
        end

        # lengthscale ≠ 1: raw pos→pos+dir overshoots the drawn arrow; processed ends must hit
        fls = Figure(; size = (600, 450))
        axls = Axis3(fls[1, 1]; azimuth = 0.4, elevation = 0.5)
        arrows3d!(axls, apts, Makie.Vec3f[(2, 0, 0), (0, 2, 1), (-1, 0, 2)]; lengthscale = 0.5f0, color = :red)
        Makie.update_state_before_display!(fls)
        li = only(@test_logs interactables(fls))
        _, ppuls, ctxls = ctx_for(fls)
        imgls = Makie.colorbuffer(fls; px_per_unit = ppuls)
        Lls = only(hitlayers(li, ctxls))
        for k in 0:2
            mx = (Lls.geometry[4k + 1] + Lls.geometry[4k + 3]) / 2
            my = (Lls.geometry[4k + 2] + Lls.geometry[4k + 4]) / 2
            @test color_near(isredc, imgls, mx, my; tol = 3)
        end
        # regression: a midpoint of raw pos→pos+dir (ignoring lengthscale) must NOT be required
        # to hit — at least one overshoots past the tip (proves we didn't use the raw recipe)
        raw_miss = false
        for k in 1:3
            raw_end = apts[k] .+ Makie.Vec3f[(2, 0, 0), (0, 2, 1), (-1, 0, 2)][k]
            q = data_to_image_px(ctxls, axls, (apts[k] .+ raw_end) ./ 2)
            # sample near the far end of the raw segment (t=0.9) — past the scaled tip
            qfar = data_to_image_px(ctxls, axls, apts[k] .+ 0.9 .* (raw_end .- apts[k]))
            raw_miss |= !color_near(isredc, imgls, qfar[1], qfar[2]; tol = 3)
        end
        @test raw_miss

        # anisotropic Axis3 limits: equal data-norm dirs get unequal world lengths; data-space
        # start→end still projects onto the drawn shafts (the child-space trap)
        fan = Figure(; size = (600, 450))
        axan = Axis3(fan[1, 1]; azimuth = 0.4, elevation = 0.5)
        limits!(axan, 0, 10, 0, 2, 0, 2)
        arrows3d!(
            axan,
            Makie.Point3f[(2, 1, 1), (5, 0.5, 0.5), (2, 1, 0.5)],
            Makie.Vec3f[(2, 0, 0), (0, 1, 0), (0, 0, 1)];
            color = :red,
        )
        Makie.update_state_before_display!(fan)
        ani = only(@test_logs interactables(fan))
        _, ppuan, ctxan = ctx_for(fan)
        imgan = Makie.colorbuffer(fan; px_per_unit = ppuan)
        Lan = only(hitlayers(ani, ctxan))
        for k in 0:2
            mx = (Lan.geometry[4k + 1] + Lan.geometry[4k + 3]) / 2
            my = (Lan.geometry[4k + 2] + Lan.geometry[4k + 4]) / 2
            @test color_near(isredc, imgan, mx, my; tol = 4)
        end
    end

    @testset "Axis3 ScatterLines: a :circles and a :lines layer, as on 2D (#273)" begin
        isredc(c) = Float64(Makie.red(c)) > 0.6 && Float64(Makie.green(c)) < 0.4 && Float64(Makie.blue(c)) < 0.4
        function red_near(img, cx, cy; tol = 5)
            ih, iw = size(img)
            x, y = round(Int, cx), round(Int, cy)
            for dy in -tol:tol, dx in -tol:tol
                xx, yy = x + dx, y + dy
                (1 <= xx <= iw && 1 <= yy <= ih) || continue
                isredc(img[yy, xx]) && return true
            end
            return false
        end
        f = Figure(; size = (600, 450))
        ax = Axis3(f[1, 1]; azimuth = 0.4, elevation = 0.5)
        pts = Makie.Point3f[(1, 2, 3), (4, 5, 6), (7, 8, 2)]
        scatterlines!(ax, pts; color = :red, markersize = 14)
        Makie.update_state_before_display!(f)
        ints = @test_logs interactables(f)       # no logs: scatterlines must NOT be skipped
        @test length(ints) == 2
        pt = only(filter(i -> i isa PointInteractable, ints))
        ln = only(filter(i -> i isa SegmentInteractable, ints))
        @test pt.id === :scatterlines && ln.id === :scatterlines_line
        @test pt.payloads[1] == (; index = 1, x = 1.0, y = 2.0, z = 3.0)
        _, ppu, ctx = ctx_for(f)
        img = Makie.colorbuffer(f; px_per_unit = ppu)
        Lp = only(hitlayers(pt, ctx))
        Ll = only(hitlayers(ln, ctx))
        @test Lp.kind === :circles && length(Lp.geometry) == 9
        @test Ll.kind === :lines
        for k in 0:2
            @test red_near(img, Lp.geometry[3k + 1], Lp.geometry[3k + 2])
        end
        # the line's projected path runs through the drawn line between the markers
        g = only(Ll.geometry)
        for k in 0:1
            mx = (g[2k + 1] + g[2k + 3]) / 2
            my = (g[2k + 2] + g[2k + 4]) / 2
            @test red_near(img, mx, my; tol = 3)
        end
        # after the camera turns (an orbit, then a remount), both layers follow the view
        ax.azimuth[] = 1.1; ax.elevation[] = 0.2
        _, ppub, ctxb = ctx_for(f)
        imgb = Makie.colorbuffer(f; px_per_unit = ppub)
        Lpb = only(hitlayers(pt, ctxb))
        @test any(Lpb.geometry[i] != Lp.geometry[i] for i in 1:9)
        for k in 0:2
            @test red_near(imgb, Lpb.geometry[3k + 1], Lpb.geometry[3k + 2])
        end
        gb = only(only(hitlayers(ln, ctxb)).geometry)
        @test red_near(imgb, (gb[1] + gb[3]) / 2, (gb[2] + gb[4]) / 2; tol = 3)
    end
end
