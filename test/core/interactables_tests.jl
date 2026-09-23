using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# Minimal AbstractInteractable subtype exercising the extension interface's hoverstyle
# override: delegates hitlayers to its wrapped PointInteractable, but ships an explicit
# stroke rather than the derived-colour default.
struct _CustomHoverInteractable <: Masque.AbstractInteractable
    inner::PointInteractable
end
Masque.hitlayers(i::_CustomHoverInteractable, ctx::Masque.InteractionContext) = hitlayers(i.inner, ctx)
Masque.hoverstyle(::_CustomHoverInteractable) = (; stroke = "#123456", width = 3)

# Stand-in for a color image cell: not `Real`, so it must not be cast to Float32.
struct _NotReal end

@testset "Interactables" begin
    @testset "RectInteractable grid is compact" begin
        fh = Figure(); axh = Axis(fh[1, 1]); z = rand(20, 30); heatmap!(axh, 1:20, 1:30, z)
        _, _, ctxh = ctx_for(fh)
        L = only(hitlayers(RectInteractable(axh; grid = (0.5:1:20.5, 0.5:1:30.5, z)), ctxh))
        @test L.kind === :grid
        @test L.geometry["ncols"] == 20 && L.geometry["nrows"] == 30
        @test length(L.geometry["xedges"]) == 21 && length(L.geometry["values"]) == 600
        @test !haskey(L.geometry, "sample")
    end

    @testset "RectInteractable grid samples sub-pixel values to the screen" begin
        # 1000² grid on a ~700px column → ~0.7 px/cell on screen. The manifest keeps the source
        # edges and ships one source value per screen pixel, not the source matrix.
        fb = Figure(); axb = Axis(fb[1, 1]); zb = rand(Float32, 1000, 1000); heatmap!(axb, zb)
        _, _, ctxb = ctx_for(fb)
        L = only(hitlayers(RectInteractable(axb; grid = (0.5:1:1000.5, 0.5:1:1000.5, zb)), ctxb))
        g = L.geometry
        @test L.kind === :grid
        @test g["ncols"] == 1000 && length(g["xedges"]) == 1001
        @test !haskey(g, "values")
        sample = g["sample"]
        sncols, snrows = g["sncols"], g["snrows"]
        @test length(sample) == sncols * snrows
        @test g["sample_px"] ≈ 1 / ctxb.display_scale
        vp = ctxb.transforms[Masque.axis_id(ctxb, axb)].viewport
        @test g["sample_origin"] == [vp[1], vp[2]]
        @test g["sample_span"] == [vp[3], vp[4]]
        # A heatmap whose limits are the cell edges fills the axis, so every sample center
        # lands on a cell. The margin case is the test below.
        ox, oy = g["sample_origin"]
        step = g["sample_px"]
        bad = 0
        for sy in 0:(snrows - 1), sx in 0:(sncols - 1)
            x0, x1 = Masque._sample_bin(ox, sx, sncols, step, vp[3])
            y0, y1 = Masque._sample_bin(oy, sy, snrows, step, vp[4])
            i = Masque._find_bin(g["xedges"], (x0 + x1) / 2)
            j = Masque._find_bin(g["yedges"], (y0 + y1) / 2)
            got = sample[sy * sncols + sx + 1]
            match = i < 0 || j < 0 ? isnan(got) : got == Float32(zb[i + 1, j + 1])
            bad += !match
        end
        @test bad == 0
        @test all(isfinite, sample)
    end

    @testset "a viewport wider than the grid stores NaN outside the cells" begin
        n = 800
        fw = Figure(size = (600, 400))
        axw = Axis(fw[1, 1]; limits = (-50, n + 50, -50, n + 50))
        _, _, ctxw = ctx_for(fw)
        zw = rand(Float32, n, n)
        edges = range(0, n; length = n + 1)
        L = only(hitlayers(RectInteractable(axw; grid = (edges, edges, zw)), ctxw))
        g = L.geometry
        @test !haskey(g, "values")
        sample = g["sample"]
        @test any(isnan, sample)
        @test any(isfinite, sample)
        ox, oy = g["sample_origin"]
        step = g["sample_px"]
        sncols, snrows = g["sncols"], g["snrows"]
        span = g["sample_span"]
        bad = 0
        for sy in 0:(snrows - 1), sx in 0:(sncols - 1)
            x0, x1 = Masque._sample_bin(ox, sx, sncols, step, span[1])
            y0, y1 = Masque._sample_bin(oy, sy, snrows, step, span[2])
            i = Masque._find_bin(g["xedges"], (x0 + x1) / 2)
            j = Masque._find_bin(g["yedges"], (y0 + y1) / 2)
            got = sample[sy * sncols + sx + 1]
            match = i < 0 || j < 0 ? isnan(got) : got == Float32(zw[i + 1, j + 1])
            bad += !match
        end
        @test bad == 0
    end

    @testset "grid sample bin search matches the overlay, including a miss and a short last bin" begin
        @test Masque._find_bin([0.0, 10.0, 20.0, 30.0], 12.0) == 1
        @test Masque._find_bin([30.0, 20.0, 10.0, 0.0], 12.0) == 1
        @test Masque._find_bin([0.0, 10.0, 20.0, 30.0], 10.0) == 0
        @test Masque._find_bin([0.0, 10.0, 20.0], 99.0) == -1
        # Irregular edges, descending y. Viewport is wider than the data, so the margin is NaN.
        xe = Float64[0, 1, 4, 10]
        ye = Float64[10, 6, 0]
        vals = Float32[1 4; 2 5; 3 6]
        s = Masque._grid_sample(xe, ye, vals, (0.0, -2.0, 12.0, 14.0), 0.5)
        @test s.sample_px == 2
        @test s.sncols == 6 && s.snrows == 7
        # Sample (0, 0): y bin [-2, 0], center -1, below the data. That slot is not a hit.
        @test isnan(s.sample[1])
        # A center inside both: x [4, 6] → 5 is in [4, 10] → i=2; y [6, 8] → 7 is in [6, 10] (desc) → j=0.
        # vals[3, 1] == 3. Locate that sample by scanning centers rather than assuming the index.
        found = false
        for sy in 0:(s.snrows - 1), sx in 0:(s.sncols - 1)
            x0, x1 = Masque._sample_bin(0.0, sx, s.sncols, s.sample_px, 12.0)
            y0, y1 = Masque._sample_bin(-2.0, sy, s.snrows, s.sample_px, 14.0)
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            cx == 5 && cy == 7 || continue
            found = true
            @test s.sample[sy * s.sncols + sx + 1] == Float32(3)
        end
        @test found
        # span 5, step 2 → last bin is the remainder [4, 5], shorter than one step.
        x0, x1 = Masque._sample_bin(0.0, 2, 3, 2.0, 5.0)
        @test (x0, x1) == (4.0, 5.0)
    end

    @testset "a non-real sub-pixel grid ships edges and no sample" begin
        # Same 1000² layout as the float sample above. A color image (or any non-real matrix)
        # used to throw inside Float32(cell) and the widget never mounted.
        n = 1000
        fb = Figure(); axb = Axis(fb[1, 1]); heatmap!(axb, rand(Float32, n, n))
        _, _, ctxb = ctx_for(fb)
        zb = fill(_NotReal(), n, n)
        L = only(hitlayers(RectInteractable(axb; grid = (0.5:1:(n + 0.5), 0.5:1:(n + 0.5), zb)), ctxb))
        g = L.geometry
        @test g["ncols"] == n && length(g["xedges"]) == n + 1
        @test !haskey(g, "values")
        @test !haskey(g, "sample")
        @test Masque._grid_sample(Float64[0, 1], Float64[0, 1], fill(_NotReal(), 1, 1), (0.0, 0.0, 4.0, 4.0), 0.5) === nothing
    end

    @testset "missing and non-finite source cells are stored as sample values" begin
        missing_cell = reshape(Union{Missing, Float64}[missing], 1, 1)
        sm = Masque._grid_sample(Float64[0, 10], Float64[0, 10], missing_cell, (0.0, 0.0, 4.0, 4.0), 0.5)
        @test sm !== nothing && all(isnan, sm.sample)
        sn = Masque._grid_sample(Float64[0, 10], Float64[0, 10], Float64[NaN;;], (0.0, 0.0, 4.0, 4.0), 0.5)
        @test all(isnan, sn.sample)
        si = Masque._grid_sample(Float64[0, 10], Float64[0, 10], Float64[Inf;;], (0.0, 0.0, 4.0, 4.0), 0.5)
        @test all(isinf, si.sample)
    end

    @testset "RectInteractable grid rejects non-monotonic edges and non-finite projections" begin
        (; ax) = default_fixture()
        # non-monotonic edges: caught at construction, before any projection happens
        @test_throws ArgumentError RectInteractable(ax; grid = ([0.0, 2.0, 1.0, 3.0], [0.0, 1.0, 2.0], rand(3, 2)))
        @test_throws ArgumentError RectInteractable(ax; grid = ([0.0, 1.0, 2.0], [0.0, 2.0, 1.0], rand(2, 2)))
        e = try
            RectInteractable(ax; grid = ([0.0, 2.0, 1.0, 3.0], [0.0, 1.0, 2.0], rand(3, 2)))
            nothing
        catch err
            err
        end
        @test e isa ArgumentError && occursin("monotonic", sprint(showerror, e))

        # a log-scale axis edge that DomainErrors under the projection transform (same mechanism
        # as the "out-of-domain log input degrades to non-finite geometry" PointInteractable case
        # elsewhere in this file) must fail loud at hitlayers time instead of shipping a NaN edge.
        # No heatmap/scatter is plotted on this axis, so this can't be Makie's own auto-limit
        # boundingbox throwing first — the negative edge only ever reaches our own projection.
        fn = Figure(size = (600, 400)); axn = Axis(fn[1, 1]; yscale = log10)
        _, _, ctxn = ctx_for(fn)
        badgrid = RectInteractable(axn; grid = ([0.0, 1.0, 2.0], [-1.0, 1.0, 10.0], rand(2, 2)))
        eg = try
            hitlayers(badgrid, ctxn)
            nothing
        catch err
            err
        end
        @test eg isa ArgumentError && occursin("non-finite", sprint(showerror, eg))
    end

    @testset "SegmentInteractable tol ships in the manifest, scaled" begin
        tfig = Figure(); axt = Axis(tfig[1, 1])
        _, _, ctxt = ctx_for(tfig)
        # default tol (6 logical px), both modes
        d_poly = only(build_manifest([SegmentInteractable(axt, [(1.0, 1.0), (2.0, 2.0)])], ctxt)["layers"])
        @test d_poly["tol"] == round(Int, 6 * ctxt.scaling)
        d_pairs = only(build_manifest([SegmentInteractable(axt, [(1.0, 1.0), (2.0, 2.0)]; mode = :pairs)], ctxt)["layers"])
        @test d_pairs["tol"] == round(Int, 6 * ctxt.scaling)
        # custom tol scales the same way
        d_custom = only(build_manifest([SegmentInteractable(axt, [(1.0, 1.0), (2.0, 2.0)]; tol = 20)], ctxt)["layers"])
        @test d_custom["tol"] == round(Int, 20 * ctxt.scaling)
        # other kinds are untouched — no "tol" key, manifest byte-identical to before this feature
        d_pt = only(build_manifest([PointInteractable(axt, [(1.0, 1.0)])], ctxt)["layers"])
        @test !haskey(d_pt, "tol")
        d_rect = only(build_manifest([RectInteractable(axt; rects = [(1.0, 1.0, 1.0, 1.0)])], ctxt)["layers"])
        @test !haskey(d_rect, "tol")
        # Masque.hit_tol interface: nothing by default, i.tol for SegmentInteractable
        @test Masque.hit_tol(PointInteractable(axt, [(1.0, 1.0)])) === nothing
        @test Masque.hit_tol(SegmentInteractable(axt, [(1.0, 1.0), (2.0, 2.0)]; tol = 12)) == 12
    end

    @testset "Polygon geometry projects per ring" begin
        (; ax, ctx) = default_fixture()
        rings = [[(1.0, 1.0), (2.0, 4.0), (3.0, 1.0)], [(1.5, 2.0), (2.5, 2.0), (2.0, 3.0)]]
        L = only(hitlayers(PolygonInteractable(ax, rings; id = :poly), ctx))
        @test L.kind === :polygons && L.id === :poly
        @test length(L.geometry) == 2                       # two rings
        @test all(r -> length(r) == 6, L.geometry)          # 3 pts × (x,y) each
        @test [p.index for p in L.payloads] == [1, 2]       # default per-ring payloads, 1-based
        # a hole is another ring of the same element, not another element
        hole = [(1.2, 1.5), (1.8, 1.5), (1.5, 2.2)]
        holed = only(hitlayers(PolygonInteractable(ax, [rings[1]]; holes = [[hole]]), ctx))
        @test length(holed.geometry) == 1 && length(holed.payloads) == 1
        @test length(holed.geometry[1]) == 2               # exterior, then the hole
        @test length(holed.geometry[1][1]) == 6 && length(holed.geometry[1][2]) == 6
        @test_throws ArgumentError PolygonInteractable(ax, rings; holes = [[hole]])  # 1 group, 2 rings
    end

    @testset "TextInteractable" begin
        f = Figure(size = (600, 400)); ax = Axis(f[1, 1]); scatter!(ax, 1:3, 1:3)
        t = text!(ax, [1.5, 2.5], [2.0, 1.0]; text = ["Hello", "Wörld"], fontsize = 20)
        bk, ppu, ctx = ctx_for(f)          # finalizes (update_state_before_display!) + builds ctx
        ti = TextInteractable(ax, t)
        # payload: (; text, index, x, y) — 1-based index, DATA anchors
        @test ti.payloads[1] == (; text = "Hello", index = 1, x = 1.5, y = 2.0)
        @test ti.payloads[2] == (; text = "Wörld", index = 2, x = 2.5, y = 1.0)
        # hitlayer: one :rects layer, 2 boxes × (cx,cy,w,h) = 8 coords
        L = only(hitlayers(ti, ctx))
        @test L.kind === :rects && length(L.geometry) == 8
        # the box centers land on rendered glyphs (non-white pixels near center)
        img = Makie.colorbuffer(f; px_per_unit = ppu)
        for k in 0:1
            @test drawn_near(img, L.geometry[4k + 1], L.geometry[4k + 2])
        end
        # the projected data anchor lies within its label's box
        for (k, anchor) in enumerate(((1.5, 2.0), (2.5, 1.0)))
            aimg = data_to_image_px(ctx, ax, anchor)
            cx, cy, w, h = L.geometry[(4k - 3):(4k)]
            @test (cx - w / 2 - 1) <= aimg[1] <= (cx + w / 2 + 1)
            @test (cy - h / 2 - 2) <= aimg[2] <= (cy + h / 2 + 2)
        end
    end

    @testset "TextInteractable: scalar text! normalizes to a length-1 vector" begin
        f = Figure(size = (600, 400)); ax = Axis(f[1, 1]); scatter!(ax, 1:3, 1:3)
        t = text!(ax, 1.0, 1.0; text = "single")   # Makie normalizes: p.text[] == ["single"]
        _, _, ctx = ctx_for(f)
        ti = TextInteractable(ax, t)
        @test ti.payloads == [(; text = "single", index = 1, x = 1.0, y = 1.0)]
        L = only(hitlayers(ti, ctx))
        @test L.kind === :rects && length(L.geometry) == 4   # one box × (cx,cy,w,h)
    end

    @testset "TextInteractable: one box per string (count invariant)" begin
        # Locks the `length(boxes) == length(payloads)` assumption `hitlayers` guards on: an empty
        # string still emits a (degenerate) box, and a multi-line string is ONE box, not one per line
        # — so both drift-guards stay satisfied if a future Makie ever splits strings into per-run boxes.
        f = Figure(size = (600, 400)); ax = Axis(f[1, 1])
        t = text!(ax, [1.0, 2.0], [1.0, 2.0]; text = ["", "multi\nline"])
        _, _, ctx = ctx_for(f)
        ti = TextInteractable(ax, t)
        @test length(ti.payloads) == 2
        @test length(only(hitlayers(ti, ctx)).geometry) == 8   # 2 strings × (cx,cy,w,h) — one box each
    end

    @testset "Segment + Axis + custom" begin
        # Originally read the file's shared bare `ax`/`ctx` — by execution order in the old
        # monolith that was actually the TextInteractable testset's leftover text-only figure
        # (each nested `@testset`'s `let` reassigns the enclosing testset's already-existing
        # local rather than shadowing it), not the canonical scatter fixture this testset's
        # name and its `pts` usage clearly intend. Assertions here are kind/type-only, so the
        # swap is behavior-preserving; using `default_fixture()` fixes the underlying staleness.
        (; ax, ctx, pts) = default_fixture()
        @test only(hitlayers(SegmentInteractable(ax, pts; mode = :polyline), ctx)).kind === :polyline
        @test only(hitlayers(AxisInteractable(ax), ctx)).geometry === nothing
        ri = RegionInteractable(
            ax; regions = [(:circle, (1.0, 1.0), 10), (:rect, (2.0, 4.0), 1.0, 2.0)],
            payloads = ["a", "b"], tooltip = masque"region"
        )
        @test Set(L.kind for L in hitlayers(ri, ctx)) == Set([:circles, :rects])
        @test IP.tooltip_spec(ri) isa Masque.Markup
        fi = FunctionInteractable(c -> [HitLayer(:f, :circles, Float32[10, 10, 5], Any[(; v = 1)], :ax1, (:click,))])
        @test only(hitlayers(fi, ctx)).id === :f
    end

    @testset "build_manifest + widget + bond" begin
        # Self-contained: the file's shared fig/ax/ctx get clobbered by earlier testsets
        # (soft-scope `ax = Axis(...)` / `_, _, ctx = ctx_for(f)` assignments), leaving a
        # desynced ax/ctx pair here. axis_id's old :ax1 fallback silently absorbed that;
        # it now fails loudly, so this testset builds its own consistent trio.
        bfig = Figure(size = (600, 400)); bax = Axis(bfig[1, 1])
        pts = DEFAULT_PTS
        scatter!(bax, first.(pts), last.(pts))
        _, _, bctx = ctx_for(bfig)
        m = build_manifest([PointInteractable(bax, pts; id = :scatter), AxisInteractable(bax)], bctx)
        @test [L["kind"] for L in m["layers"]] == ["circles", "axis"]
        @test haskey(m["transforms"], "ax1")

        # hover outline: default stroke is nothing (overlay derives the colour), so the
        # manifest's style dict omits "stroke" and carries only "width".
        @test Masque.hoverstyle(PointInteractable(bax, pts; id = :scatter)).stroke === nothing
        @test Masque.hoverstyle(PointInteractable(bax, pts; id = :scatter)).width == 2
        @test !haskey(m["layers"][1]["style"], "stroke")
        @test m["layers"][1]["style"]["width"] == 2

        # a custom interactable subtype can override hoverstyle with an explicit stroke; it
        # rides the manifest verbatim.
        @test Masque.hoverstyle(_CustomHoverInteractable(PointInteractable(bax, pts; id = :customhover))) ==
            (; stroke = "#123456", width = 3)
        mc = build_manifest([_CustomHoverInteractable(PointInteractable(bax, pts; id = :customhover))], bctx)
        @test mc["layers"][1]["style"]["stroke"] == "#123456"
        @test mc["layers"][1]["style"]["width"] == 3

        # selection round-trip: author indices are 1-based; the manifest stores 0-based
        @test !haskey(m["layers"][1], "selected")                       # absent when unselected
        ms = build_manifest([PointInteractable(bax, pts; id = :scatter)], bctx; selected = Dict(:scatter => [1, 3]))
        @test ms["layers"][1]["selected"] == [0, 2]
        @test ms["layers"][1]["bond"] == "element"
        @test !haskey(
            build_manifest(
                [PointInteractable(bax, pts; id = :scatter)], bctx;
                selected = Dict(:scatter => Int[])
            )["layers"][1], "selected"
        )   # empty omitted
        @test masque(bfig, PointInteractable(bax, pts; id = :scatter); selected = Dict(:scatter => [2])).manifest["layers"][1]["selected"] == [1]

        # selected= fail-loud (issue #39): still-unsupported kinds (grid/axis/…) and OOB
        # indices throw at build_manifest. Open kinds (segments/polyline) now accept
        # selected= so the overlay can draw the selected-ring recipe.
        @testset "selected= fails loud on unsupported kinds and OOB indices" begin
            segs = SegmentInteractable(bax, [(1.0, 1.0), (2.0, 2.0), (3.0, 3.0), (4.0, 4.0)]; mode = :pairs, id = :segs)
            ms_seg = build_manifest([segs], bctx; selected = Dict(:segs => [1]))
            @test ms_seg["layers"][1]["selected"] == [0]
            @test ms_seg["layers"][1]["kind"] == "segments"

            grid_i = RectInteractable(bax; grid = (0.5:1:3.5, 0.5:1:3.5, rand(3, 3)), id = :heat)
            @test_throws ArgumentError build_manifest([grid_i], bctx; selected = Dict(:heat => [0]))
            err_grid = try
                build_manifest([grid_i], bctx; selected = Dict(:heat => [0])); nothing
            catch e
                e
            end
            @test err_grid isa ArgumentError
            @test occursin(r"selected"i, sprint(showerror, err_grid))
            @test occursin("grid", sprint(showerror, err_grid))

            # 3 pts → valid indices 1:3; index 0, 5, and -1 must fail, naming that range
            err_zero = try
                build_manifest(
                    [PointInteractable(bax, pts; id = :scatter)], bctx; selected = Dict(:scatter => [0])
                )
                nothing
            catch e
                e
            end
            @test err_zero isa ArgumentError
            @test occursin("1:3", sprint(showerror, err_zero))
            @test_throws ArgumentError build_manifest(
                [PointInteractable(bax, pts; id = :scatter)], bctx; selected = Dict(:scatter => [-1])
            )
            err_oob = try
                build_manifest(
                    [PointInteractable(bax, pts; id = :scatter)], bctx; selected = Dict(:scatter => [5])
                ); nothing
            catch e
                e
            end
            @test err_oob isa ArgumentError
            @test occursin("1:3", sprint(showerror, err_oob))

            # supported kinds still accept in-range indices (rects list + polygons + polyline)
            rects = RectInteractable(bax; rects = [(1.0, 1.0, 0.5, 0.5), (2.0, 2.0, 0.5, 0.5)], id = :boxes)
            mr = build_manifest([rects], bctx; selected = Dict(:boxes => [2]))
            @test mr["layers"][1]["selected"] == [1]
            polys = PolygonInteractable(bax, [[(0.0, 0.0), (1.0, 0.0), (0.5, 1.0)]]; id = :poly)
            mp = build_manifest([polys], bctx; selected = Dict(:poly => [1]))
            @test mp["layers"][1]["selected"] == [0]
            poly = SegmentInteractable(bax, [(1.0, 1.0), (2.0, 2.0), (3.0, 1.5)]; mode = :polyline, id = :line)
            ml = build_manifest([poly], bctx; selected = Dict(:line => [2]))
            @test ml["layers"][1]["selected"] == [1]
            @test ml["layers"][1]["kind"] == "polyline"
        end

        w = masque(bfig, PointInteractable(bax, pts; id = :scatter))
        @test w isa MasqueWidget
        @test w.manifest["layers"][1]["kind"] == "circles"
        @test !isempty(w.b64)
        @test w.display_css == 600

        @test IP.APD.Bonds.initial_value(w) === nothing
        @test IP.APD.Bonds.transform_value(w, nothing) === nothing
        ev = IP.APD.Bonds.transform_value(w, Dict("layer" => "scatter", "index" => 2, "payload" => Dict("i" => 2)))
        @test ev isa ElementEvent && ev.layer === :scatter && ev.index == 3
    end

    @testset "axis_id fails loud on unregistered blocks" begin
        # The old :ax1 fallback silently rebound any unregistered fig.content block to the
        # main axis (the Colorbar-misbind class). Pin the fail-loud replacement: an
        # interactable keyed to an axis from a DIFFERENT figure must error at manifest
        # build, as ArgumentError, naming the problem — a regression back to a silent
        # default (or a bare KeyError) fails here.
        ffig = Figure(size = (600, 400)); Axis(ffig[1, 1])
        _, _, fctx = ctx_for(ffig)
        other = Figure(size = (600, 400)); oax = Axis(other[1, 1])
        @test_throws ArgumentError build_manifest([PointInteractable(oax, [(1.0, 1.0)])], fctx)
        err = try
            build_manifest([PointInteractable(oax, [(1.0, 1.0)])], fctx)
            nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin("not registered", err.msg)
    end

    @testset "transform_value multi-select envelope" begin
        tv = Masque.APD.Bonds.transform_value
        manifest = Dict{String, Any}(
            "selection" => "elements", "selectionTarget" => "pts",
            "layers" => [
                Dict{String, Any}(
                    "id" => "pts", "kind" => "circles", "bond" => "element",
                    "payloads" => Any["a", "b", "c", "d", "e"],
                ),
            ],
        )
        w = Masque.MasqueWidget("", manifest, 100)
        @test tv(w, nothing) === nothing
        # wire index 3 is the fourth element (Julia index 4)
        single = tv(w, Dict("layer" => "pts", "index" => 3, "payload" => Dict("city" => "NYC")))
        @test single isa Vector{ElementEvent} && only(single).layer === :pts && only(single).index == 4
        @test only(single).payload == "d"
        multi = tv(
            w, Dict(
                "items" => [
                    Dict("layer" => "pts", "index" => 1, "payload" => Dict("v" => 10)),
                    Dict("layer" => "pts", "index" => 4, "payload" => Dict("v" => 40)),
                ]
            )
        )
        @test multi isa Vector{ElementEvent} && length(multi) == 2
        @test multi[1].index == 2 && multi[1].payload == "b"
        @test multi[2].index == 5 && multi[2].payload == "e"
        empty = tv(w, Dict("items" => []))
        @test empty isa Vector{ElementEvent} && isempty(empty)
        @test_throws ArgumentError tv(Masque.MasqueWidget("", Dict{String, Any}(), 100), Dict("items" => []))
    end

    @testset "payload-length validation (Segment/Rect/Polygon)" begin
        using Masque: SegmentInteractable, RectInteractable, PolygonInteractable
        fig = Figure(); ax = Axis(fig[1, 1])
        # RectInteractable list: 2 rects, wrong + right payload counts
        rects = [(0.0, 0.0, 1.0, 1.0), (2.0, 2.0, 1.0, 1.0)]
        @test_throws ArgumentError RectInteractable(ax; rects, payloads = [(; a = 1)])           # too short
        @test_throws ArgumentError RectInteractable(ax; rects, payloads = [(; a = 1), (; a = 2), (; a = 3)])  # too long
        @test RectInteractable(ax; rects, payloads = [(; a = 1), (; a = 2)]) isa RectInteractable  # exact
        # SegmentInteractable :pairs — 2 vertices = 1 segment
        @test_throws ArgumentError SegmentInteractable(ax, [Point2f(0, 0), Point2f(1, 1)]; mode = :pairs, payloads = [(; a = 1), (; a = 2)])  # too long
        @test_throws ArgumentError SegmentInteractable(ax, [Point2f(0, 0), Point2f(1, 1), Point2f(2, 2), Point2f(3, 3)]; mode = :pairs, payloads = [(; a = 1)])  # too short: 2 segments, 1 payload
        @test SegmentInteractable(ax, [Point2f(0, 0), Point2f(1, 1)]; mode = :pairs, payloads = [(; a = 1)]) isa SegmentInteractable  # exact
        # PolygonInteractable — 1 ring
        ring = [Point2f(0, 0), Point2f(1, 0), Point2f(1, 1)]
        @test_throws ArgumentError PolygonInteractable(ax, [ring]; payloads = [(; a = 1), (; a = 2)])      # too long
        @test_throws ArgumentError PolygonInteractable(ax, [ring, ring]; payloads = [(; a = 1)])          # too short: 2 rings, 1 payload
        @test PolygonInteractable(ax, [ring]; payloads = [(; a = 1)]) isa PolygonInteractable             # exact
    end

    @testset "construction-time validation: mode / grid shape / tooltip=true" begin
        using Masque: SegmentInteractable, RectInteractable, PointInteractable
        fig = Figure(); ax = Axis(fig[1, 1])
        pts = [Point2f(0, 0), Point2f(1, 1)]
        @test_throws ArgumentError SegmentInteractable(ax, pts; mode = :segments)
        @test SegmentInteractable(ax, pts; mode = :pairs) isa SegmentInteractable
        @test SegmentInteractable(ax, pts; mode = :polyline) isa SegmentInteractable
        # unit=:line is the whole path (one payload). It does not apply to :pairs.
        whole = SegmentInteractable(ax, [Point2f(0, 0), Point2f(1, 1), Point2f(2, 0)]; unit = :line)
        @test whole.unit === :line && length(whole.payloads) == 1 && whole.payloads[1] == (; index = 1)
        @test_throws ArgumentError SegmentInteractable(ax, pts; mode = :pairs, unit = :line)
        @test_throws ArgumentError SegmentInteractable(ax, pts; unit = :edge)
        per_seg = SegmentInteractable(ax, [Point2f(0, 0), Point2f(1, 1), Point2f(2, 0)])
        @test per_seg.unit === :segment && length(per_seg.payloads) == 2

        # grid `values` must be (length(xedges)-1, length(yedges)-1)
        xe = 0.0:1.0:3.0; ye = 0.0:1.0:2.0   # 3x2 cells expected
        good = zeros(3, 2)
        @test RectInteractable(ax; grid = (xe, ye, good)) isa RectInteractable
        bad = zeros(2, 3)   # transposed — wrong shape
        @test_throws ArgumentError RectInteractable(ax; grid = (xe, ye, bad))
        # non-Matrix `values` (e.g. a vector, or nothing) must raise the same friendly
        # ArgumentError, not a bare MethodError from `size(nothing)` deep inside the check.
        @test_throws ArgumentError RectInteractable(ax; grid = (xe, ye, nothing))
        @test_throws ArgumentError RectInteractable(ax; grid = (xe, ye, [1.0, 2.0, 3.0]))

        # exactly one of rects/grid — both, and neither, are construction-time errors
        @test_throws ArgumentError RectInteractable(ax)
        @test_throws ArgumentError RectInteractable(ax; rects = [(0.0, 0.0, 1.0, 1.0)], grid = (xe, ye, good))

        # tol must be finite and positive — a raw round(Int, ...) InexactError/silent
        # unhittable layer otherwise (same "raw downstream error" class this PR closes for
        # RectInteractable's rects/grid)
        @test_throws ArgumentError SegmentInteractable(ax, pts; tol = Inf)
        @test_throws ArgumentError SegmentInteractable(ax, pts; tol = NaN)
        @test_throws ArgumentError SegmentInteractable(ax, pts; tol = 0)
        @test_throws ArgumentError SegmentInteractable(ax, pts; tol = -1)
        @test SegmentInteractable(ax, pts; tol = 0.5) isa SegmentInteractable
        # HLines/VLines route through `_segment_with_resolve`, not the keyword constructor
        # above — regression coverage for that separate entry point skipping the check.
        hl = hlines!(ax, [0.5])
        @test_throws ArgumentError SegmentInteractable(ax, hl; tol = Inf)
        @test_throws ArgumentError SegmentInteractable(ax, hl; tol = NaN)
        @test_throws ArgumentError SegmentInteractable(ax, hl; tol = 0)
        @test SegmentInteractable(ax, hl; tol = 3) isa SegmentInteractable
        vl = vlines!(ax, [0.5])
        @test_throws ArgumentError SegmentInteractable(ax, vl; tol = -1)

        # tooltip = true fails at construction, not at manifest build — every constructor that
        # accepts `tooltip` shares the `_check_tooltip` helper; pin the contract on all of them.
        @test_throws ArgumentError PointInteractable(ax, [(0.0, 0.0)]; tooltip = true)
        @test_throws ArgumentError SegmentInteractable(ax, pts; tooltip = true)
        @test_throws ArgumentError RectInteractable(ax; rects = [(0.0, 0.0, 1.0, 1.0)], tooltip = true)
        tp = text!(ax, [0.0], [0.0]; text = ["a"])
        @test_throws ArgumentError TextInteractable(ax, tp; tooltip = true)
        ring = [Point2f(0, 0), Point2f(1, 0), Point2f(1, 1)]
        @test_throws ArgumentError PolygonInteractable(ax, [ring]; tooltip = true)
        @test_throws ArgumentError RegionInteractable(
            ax; regions = [(:circle, (1.0, 1.0), 0.5)], payloads = [(; n = "a")], tooltip = true
        )
    end

    @testset "clamp path is non-finite-safe" begin
        # A RectInteractable with clamp_to_viewport=true whose projected rect is non-finite
        # must NOT throw — it must fall back to the _q path instead of passing NaN/Inf to
        # ceil/floor (which throw). Deterministic repro: a rect whose center is NaN.
        using Masque: RectInteractable
        fig = Figure(size = (500, 350)); ax = Axis(fig[1, 1])
        scatter!(ax, [1.0], [1.0])   # force a layout so viewport is non-empty
        _, _, ctx = ctx_for(fig)
        # Inject a rect with a NaN center directly (clamp_to_viewport=true, so the clamp path
        # would be taken — the fix makes it fall back to _q instead).
        ri = RectInteractable(ax; rects = [(NaN, 0.0, 1.0, 1.0)], clamp_to_viewport = true)
        @test_nowarn hitlayers(ri, ctx)   # must not throw
        L = only(hitlayers(ri, ctx))
        @test !isfinite(L.geometry[1])    # NaN center passes through as Float32(NaN) via _q
    end
end
