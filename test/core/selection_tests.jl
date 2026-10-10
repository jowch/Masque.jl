using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

@testset "Selection" begin
    @testset "AbstractSelector / ROIInteractable selects" begin
        using Masque: selects, compatible_kinds, ROIInteractable, AbstractSelector
        fig = Figure(); ax = Axis(fig[1, 1]); lines!(ax, 1:10, 1:10)
        roi = ROIInteractable(ax; bounds = (2.0, 8.0, 2.0, 8.0))
        @test roi isa AbstractSelector
        @test selects(roi) === nothing
        @test compatible_kinds(roi) == (:circles, :grid)
        roi2 = ROIInteractable(ax; bounds = (2.0, 8.0, 2.0, 8.0), selects = :pts)
        @test selects(roi2) === :pts
    end

    @testset "selects: manifest field + selector validation (M4 Task 3)" begin
        # self-contained fig/ax/ctx (see "build_manifest + widget + bond" for why)
        sfig = Figure(size = (600, 400)); sax = Axis(sfig[1, 1])
        _, _, sctx = ctx_for(sfig)
        pts_i = PointInteractable(sax, [(1.0, 1.0), (5.0, 5.0)]; id = :pts)
        seg_i = SegmentInteractable(sax, [(1.0, 1.0), (5.0, 5.0)]; id = :segs)
        roi_bare = ROIInteractable(sax; bounds = (2.0, 8.0, 2.0, 8.0))
        roi_linked = ROIInteractable(sax; bounds = (2.0, 8.0, 2.0, 8.0), selects = :pts)

        # ROI without selects: no "selects" key in layer dict
        @test !haskey(build_manifest([roi_bare], sctx)["layers"][1], "selects")

        # ROI with selects = :pts: "selects" => "pts" in layer dict; circles layer gets no "selects"
        layers_sel = build_manifest([pts_i, roi_linked], sctx)["layers"]
        roi_d = filter(l -> l["kind"] == "roi", layers_sel) |> only
        @test roi_d["selects"] == "pts"
        @test !haskey(filter(l -> l["kind"] == "circles", layers_sel) |> only, "selects")

        # Validation: target layer absent → ArgumentError
        @test_throws ArgumentError build_manifest(
            [ROIInteractable(sax; bounds = (2.0, 8.0, 2.0, 8.0), selects = :ghost)], sctx
        )

        # did-you-mean: :pt is within edit-distance 2 of :pts → suggestion appears in error message
        err = try
            build_manifest(
                [pts_i, ROIInteractable(sax; bounds = (2.0, 8.0, 2.0, 8.0), selects = :pt)], sctx
            )
            nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin("pts", err.msg)

        # Validation: target exists but kind not in compatible_kinds (:polyline ∉ (:circles,:grid)) → error
        @test_throws ArgumentError build_manifest(
            [seg_i, ROIInteractable(sax; bounds = (2.0, 8.0, 2.0, 8.0), selects = :segs)], sctx
        )

        # happy path: valid selects → manifest ROI layer carries "selects"; no error thrown
        m_ok = build_manifest([pts_i, roi_linked], sctx)
        @test filter(l -> l["kind"] == "roi", m_ok["layers"]) |> only |> l -> l["selects"] == "pts"
    end

    @testset "HSpan + VSpan extraction" begin
        using Masque: RectInteractable, interactables
        fig = Figure(); ax = Axis(fig[1, 1]); lines!(ax, 0 .. 10, sin)   # give the axis finite limits
        hspan!(ax, [1.0, 3.0], [2.0, 4.0])
        Makie.update_state_before_display!(fig)
        hp = ax.scene.plots[end]                                  # the HSpan
        ri = RectInteractable(ax, hp; id = :hspan)
        @test length(ri.payloads) == 2
        @test ri.payloads[1] == (; low = 1.0, high = 2.0)
        @test ri.payloads[2] == (; low = 3.0, high = 4.0)

        fig2 = Figure(); ax2 = Axis(fig2[1, 1]); lines!(ax2, 0 .. 10, cos)
        vspan!(ax2, [1.0, 3.0], [2.0, 4.0])
        Makie.update_state_before_display!(fig2)
        ri2 = RectInteractable(ax2, ax2.scene.plots[end]; id = :vspan)
        @test ri2.payloads[1] == (; low = 1.0, high = 2.0)
        @test length(ri2.payloads) == 2
        @test ri2.payloads[2] == (; low = 3.0, high = 4.0)
    end

    @testset "HSpan/VSpan: wrong-length user payloads rejected" begin
        # Pins existing behavior (not new in this PR): user-supplied `payloads` for HSpan/VSpan
        # go through `_check_payloads` and must match the band count, same as every other
        # interactable. Regression coverage for the `_rect_with_resolve` refactor, which now calls
        # `_check_payloads` directly instead of delegating to the public keyword `RectInteractable`
        # constructor (which checked it transitively before).
        using Masque: RectInteractable
        fig = Figure(); ax = Axis(fig[1, 1]); lines!(ax, 0 .. 10, sin)
        hspan!(ax, [1.0, 3.0], [2.0, 4.0])
        Makie.update_state_before_display!(fig)
        hp = ax.scene.plots[end]
        @test_throws ArgumentError RectInteractable(ax, hp; id = :hspan, payloads = [(; a = 1)])

        fig2 = Figure(); ax2 = Axis(fig2[1, 1]); lines!(ax2, 0 .. 10, cos)
        vspan!(ax2, [1.0, 3.0], [2.0, 4.0])
        Makie.update_state_before_display!(fig2)
        vp = ax2.scene.plots[end]
        @test_throws ArgumentError RectInteractable(ax2, vp; id = :vspan, payloads = [(; a = 1)])
    end

    @testset "HSpan/VSpan hit-rect bounded to axis limits (anti-bleed)" begin
        # Regression: span hit-rects must clamp the full-axis dimension to ax.finallimits[],
        # not rely on the child Poly's HyperRectangle (which can exceed axis limits in some
        # Makie versions / async Pluto scenarios, causing the rect to bleed into a neighboring
        # axis's viewport at the same pixel column/row).
        using Masque: RectInteractable
        fv = Figure(); axv = Axis(fv[1, 1])
        xlims!(axv, 0, 10); ylims!(axv, 0, 5)
        vspan!(axv, [2.0], [3.0])
        Makie.update_state_before_display!(fv)
        vp = only(filter(p -> p isa Makie.VSpan, axv.scene.plots))
        riv = RectInteractable(axv, vp; id = :vspan)
        # VSpan fills the Y axis: y-extent must equal the axis y-height (5.0), not exceed it.
        # x-extent is the band's own data range [2, 3].
        cx, cy, w, h = riv.data[1]
        @test cx ≈ 2.5          # band x-center  (2+3)/2
        @test cy ≈ 2.5          # axis y-center   (0+5)/2  ← from finallimits
        @test w ≈ 1.0           # band x-width    3-2
        @test h ≈ 5.0           # axis y-height   5-0  ← from finallimits, NOT a larger number

        fh = Figure(); axh = Axis(fh[1, 1])
        xlims!(axh, 0, 10); ylims!(axh, 0, 5)
        hspan!(axh, [1.0], [3.0])
        Makie.update_state_before_display!(fh)
        hp = only(filter(p -> p isa Makie.HSpan, axh.scene.plots))
        rih = RectInteractable(axh, hp; id = :hspan)
        # HSpan fills the X axis: x-extent must equal the axis x-width (10.0), not exceed it.
        # y-extent is the band's own data range [1, 3].
        cx2, cy2, w2, h2 = rih.data[1]
        @test cx2 ≈ 5.0         # axis x-center   (0+10)/2  ← from finallimits
        @test cy2 ≈ 2.0         # band y-center   (1+3)/2
        @test w2 ≈ 10.0         # axis x-width    10-0  ← from finallimits, NOT a larger number
        @test h2 ≈ 2.0          # band y-height   3-1
    end

    @testset "VSpan/HSpan pixel-space rect bounded to owning axis viewport (multi-axis)" begin
        # Regression: in a 2×2 figure the vspan on a4 (bottom-right) must not bleed in
        # PIXEL SPACE into a2 (top-right). The data-space rect is correct (uses finallimits),
        # but integer quantization (_q) can expand h by up to 0.5px beyond the viewport bounds.
        # Fix: viewport-clamp in pixel space before emitting geometry (ceil/floor inward).
        # This test uses the exact 2×2 repro that was live-verified to exhibit the bleed.
        using Masque: RectInteractable, axis_id
        f = Figure(size = (760, 520))
        a2 = Axis(f[1, 2]); waterfall!(a2, 1:4, [3.0, -1.0, 2.0, -0.5])
        a4 = Axis(f[2, 2])
        barplot!(a4, 1:3, [2.0, 3.0, 1.0])
        hspan!(a4, [0.4], [0.8])
        vspan!(a4, [1.6], [2.0])
        _, _, ctx = ctx_for(f)          # calls update_state_before_display! + builds context

        t4 = ctx.transforms[axis_id(ctx, a4)]
        vp_x, vp_y, vp_w, vp_h = t4.viewport   # image-px, top-left origin

        # ── VSpan on a4: the Y-extent fills the full axis ──────────────────────────────
        vspan_plot = only(filter(p -> p isa Makie.VSpan, a4.scene.plots))
        L_vs = only(hitlayers(RectInteractable(a4, vspan_plot; id = :vspan), ctx))
        g = L_vs.geometry   # [cx, cy, w, h] (integer image-px)
        vs_top = g[2] - g[4] / 2     # top edge in image-px (y-axis: small = toward top)
        vs_bot = g[2] + g[4] / 2
        @test vs_top >= vp_y          # vspan top edge must not poke above a4's viewport
        @test vs_bot <= vp_y + vp_h  # vspan bottom edge must not poke below a4's viewport

        # ── HSpan on a4: the X-extent fills the full axis ──────────────────────────────
        hspan_plot = only(filter(p -> p isa Makie.HSpan, a4.scene.plots))
        L_hs = only(hitlayers(RectInteractable(a4, hspan_plot; id = :hspan), ctx))
        gh = L_hs.geometry
        hs_left = gh[1] - gh[3] / 2
        hs_right = gh[1] + gh[3] / 2
        @test hs_left >= vp_x          # hspan left edge must not poke left of a4's viewport
        @test hs_right <= vp_x + vp_w  # hspan right edge must not poke right of a4's viewport
    end

    @testset "initial_value hydrates each pick from selected=" begin
        hfig = Figure(size = (600, 400)); hax = Axis(hfig[1, 1])
        pts = DEFAULT_PTS
        scatter!(hax, first.(pts), last.(pts))
        _, _, hctx = ctx_for(hfig)
        pts_i = PointInteractable(hax, pts; id = :scatter, payloads = ["a", "b", "c"])
        iv(m) = IP.APD.Bonds.initial_value(MasqueWidget("", m, 100))

        # no selected= → the pick's field starts at nothing
        m0 = build_manifest([pts_i], hctx)
        @test m0["fields"] == ["scatter"] && m0["initial"] == Dict("scatter" => nothing)
        @test iv(m0) === (scatter = nothing,)

        # one index seeds the pick: `2` and `[2]` are the same ElementEvent (the second point)
        m1 = build_manifest([pts_i], hctx; selected = 2)
        @test m1["initial"] == Dict("scatter" => Dict("layer" => "scatter", "index" => 1))
        ev1 = iv(m1).scatter
        @test ev1 isa ElementEvent
        @test ev1.layer === :scatter && ev1.index == 2 && ev1.payload == "b"
        @test iv(build_manifest([pts_i], hctx; selected = [2])).scatter == ev1

        # a pick holds one element: several indices are an error, not a highlight
        @test_throws ArgumentError build_manifest([pts_i], hctx; selected = Dict(:scatter => [1, 3]))

        # two pick fields: each is seeded from its own key
        segs_i = SegmentInteractable(
            hax, [(1.0, 1.0), (2.0, 2.0), (3.0, 3.0), (4.0, 4.0)];
            mode = :pairs, id = :segs, payloads = ["s0", "s1"],
        )
        mmulti = build_manifest([pts_i, segs_i], hctx; selected = Dict(:scatter => [1], :segs => [2]))
        both = iv(mmulti)
        @test keys(both) == (:scatter, :segs)
        @test both.scatter.index == 1 && both.scatter.payload == "a"
        @test both.segs.index == 2 && both.segs.payload == "s1"
        # a bare index is ambiguous across two pick fields, and the error names both
        err_bare = try
            build_manifest([pts_i, segs_i], hctx; selected = 1)
            nothing
        catch e
            e
        end
        @test err_bare isa ArgumentError
        bare_msg = sprint(showerror, err_bare)
        @test occursin("scatter", bare_msg) && occursin("segs", bare_msg)

        # no explicit payloads= (the common case): PointInteractable auto-fills one
        # `(; index, x, y)` NamedTuple per point. `selected = 2` is the second point.
        w_auto = masque(hfig, PointInteractable(hax, pts; id = :scatter); selected = 2, auto = false)
        iv_auto = IP.APD.Bonds.initial_value(w_auto).scatter
        @test iv_auto isa ElementEvent
        @test iv_auto.layer === :scatter && iv_auto.index == 2
        @test iv_auto.payload == (; index = 2, x = pts[2][1], y = pts[2][2])
    end

    @testset "selected= names fields (#335)" begin
        fig = Figure(size = (400, 300)); ax = Axis(fig[1, 1]; limits = (0, 10, 0, 10))
        sc = scatter!(ax, [1.0, 2.0, 3.0], [1.0, 2.0, 3.0])
        ln = lines!(ax, [1.0, 9.0], [9.0, 1.0])
        th = ThresholdInteractable(ax; value = 4.0)
        iv = IP.APD.Bonds.initial_value
        msg(f) = try
            f()
            ""
        catch e
            e isa ArgumentError || rethrow()
            e.msg
        end

        # the keyed, bare, and event forms all seed the one pick field
        @test iv(masque(fig; selected = (scatter = 3,))).scatter.index == 3
        @test iv(masque(fig; selected = 3)).scatter.index == 3
        @test iv(masque(fig; selected = ElementEvent(:scatter, 3, nothing))).scatter.index == 3
        # with `bind` narrowed to the pick, the value is the seeded event itself
        bare = iv(masque(fig; bind = sc, selected = 2))
        @test bare isa ElementEvent && bare.layer === :scatter && bare.index == 2

        # several indices for one pick
        @test occursin("holds one pick", msg(() -> masque(fig; selected = (scatter = [1, 2],))))
        # a control starts at its own value
        @test occursin("control", msg(() -> masque(fig, th; selected = (threshold = 1,))))
        # a default line takes no picks until it is bound; once bound, it does
        @test occursin("takes no picks", msg(() -> masque(fig; selected = (lines = 1,))))
        @test iv(masque(fig; bind = (sc, ln), selected = (lines = 1,))).lines.index == 1
        # a layer left out of `bind`
        @test occursin("isn't in bind", msg(() -> masque(fig; bind = ln, selected = (scatter = 1,))))
        # a layer that isn't in the call, and an index out of range
        @test occursin("not a layer", msg(() -> masque(fig; selected = (nope = 1,))))
        @test occursin("out of range", msg(() -> masque(fig; selected = (scatter = 4,))))
    end

    @testset "a selects box seeds its target's field from selected=" begin
        fig = Figure(size = (400, 300)); ax = Axis(fig[1, 1])
        pts = [(Float64(k), 1.0) for k in 1:8]
        scatter!(ax, first.(pts), last.(pts))
        payloads = ["p$k" for k in 1:8]
        pi = PointInteractable(ax, pts; id = :pts, payloads)
        roi = ROIInteractable(ax; bounds = (1.0, 3.0, 0.0, 2.0), selects = :pts, id = :box)
        iv(sel) = IP.APD.Bonds.initial_value(masque(fig, [pi, roi]; selected = sel, auto = false))
        # the box and its target are both fields; the box starts at its bounds
        start = iv(nothing)
        @test keys(start) == (:pts, :box)
        @test start.box == BoundsEvent(:box, 1.0, 3.0, 0.0, 2.0)
        one = iv(1).pts
        @test one isa Vector{ElementEvent} && length(one) == 1
        @test one[1].layer === :pts && one[1].index == 1 && one[1].payload == "p1"
        @test iv([1]).pts == one
        # a brush holds any number of elements
        two = iv([1, 8]).pts
        @test two isa Vector{ElementEvent}
        @test [e.index for e in two] == [1, 8]
        @test [e.payload for e in two] == ["p1", "p8"]
        # an explicit empty seed starts the brush empty
        empty = iv((pts = Int[],)).pts
        @test empty isa Vector{ElementEvent} && isempty(empty)
        # the box itself is a control: `selected=` can't name it
        @test_throws ArgumentError iv((box = 1,))
    end

    @testset "transform_value reconstructs the payload from the manifest, not the wire" begin
        bfig = Figure(size = (600, 400)); bax = Axis(bfig[1, 1])
        pts = DEFAULT_PTS
        scatter!(bax, first.(pts), last.(pts))
        payloads = [(; name = "a"), (; name = "b"), (; name = "c")]
        # What the widget holds: each payload merged onto its point's x and y (#308).
        stored = PointInteractable(bax, pts; payloads).payloads
        w = masque(bfig, PointInteractable(bax, pts; id = :scatter, payloads = payloads); auto = false)

        # element kind: the identical object comes back, not a JSON-shaped copy of it — a
        # NamedTuple stays a NamedTuple, and it's the payload the widget holds.
        ev = commit_field(w, Dict("layer" => "scatter", "index" => 1, "payload" => Dict("wrong" => "value")))
        @test ev isa ElementEvent
        @test ev.index == 2
        @test ev.payload isa NamedTuple
        @test ev.payload === stored[2]
        @test ev.name == "b"

        # the browser's own reported payload is ignored outright for an element kind
        ev0 = commit_field(w, Dict("layer" => "scatter", "index" => 0, "payload" => "anything at all"))
        @test ev0.index == 1 && ev0.payload === stored[1]

        # an axis click is an AxisEvent, not a payload NamedTuple
        w2 = masque(
            bfig,
            [PointInteractable(bax, pts; id = :scatter, payloads = payloads), AxisInteractable(bax; id = :readout)];
            auto = false,
        )
        computed = Dict("x" => 1.23, "y" => 4.56)
        evax = commit_field(w2, Dict("layer" => "readout", "index" => -1, "payload" => computed))
        @test evax isa AxisEvent && evax.x == 1.23 && evax.y == 4.56

        # a selects-ROI's target field decodes its items envelope as a Vector{ElementEvent}
        roi = ROIInteractable(bax; bounds = (0.0, 1.0, 0.0, 1.0), selects = :scatter, id = :roi)
        wselroi = masque(
            bfig, [PointInteractable(bax, pts; id = :scatter, payloads = payloads), roi];
            auto = false,
        )
        items = Dict(
            "items" => [
                Dict("layer" => "scatter", "index" => 0, "payload" => "garbage"),
                Dict("layer" => "scatter", "index" => 2, "payload" => "garbage"),
            ]
        )
        multi = commit_field(wselroi, items; field = "scatter")
        @test multi isa Vector{ElementEvent}
        @test multi[1].payload === stored[1] && multi[1].index == 1
        @test multi[2].payload === stored[3] && multi[2].index == 3
        # an item from another layer doesn't belong in the target's field
        @test_throws ArgumentError commit_field(
            wselroi, Dict("items" => [Dict("layer" => "roi", "index" => 0)]); field = "scatter",
        )

        # out-of-range index: reconstruction fails loud rather than passing the bad index through
        @test_throws ArgumentError commit_field(w, Dict("layer" => "scatter", "index" => 99, "payload" => nothing))

        # one hydrated index and the click on that element are the same object
        wsel = masque(
            bfig, PointInteractable(bax, pts; id = :scatter, payloads = payloads);
            selected = 2,
            auto = false,
        )
        iv = IP.APD.Bonds.initial_value(wsel).scatter
        @test iv isa ElementEvent && iv.payload === stored[2] && iv.index == 2
        ev_same = commit_field(wsel, Dict("layer" => "scatter", "index" => 1, "payload" => nothing))
        @test ev_same.payload === iv.payload
        @test ev_same == iv
    end

    @testset "a selects box gives fields for the box and its grid target; the grid takes no clicks" begin
        gfig = Figure(size = (400, 300)); gax = Axis(gfig[1, 1])
        vals = [Float64(i + 10j) for i in 1:4, j in 1:3]
        heatmap!(gax, 0 .. 4.0, 0 .. 3.0, vals)
        grid = GridInteractable(gax, collect(0.0:4.0), collect(0.0:3.0), vals; id = :img)
        roi = ROIInteractable(gax; bounds = (1.0, 3.0, 1.0, 2.0), selects = :img, id = :roi)
        tv = IP.APD.Bonds.transform_value

        # Without a box the grid is a pick: a click is a GridCellEvent.
        alone = masque(gfig, grid; auto = false)
        @test "click" in only(alone.manifest["layers"])["events"]
        @test !haskey(only(alone.manifest["layers"]), "brush")
        cell = commit_field(alone, Dict("layer" => "img", "index" => 0, "payload" => Dict("i" => 0, "j" => 0, "value" => 11.0)))
        @test cell isa GridCellEvent && (cell.i, cell.j) == (1, 1)

        # With the box, the grid is a grid brush, hover-only, so the overlay never posts a cell.
        w = masque(gfig, [grid, roi]; auto = false)
        @test w.manifest["fields"] == ["img", "roi"]
        img = only(filter(l -> l["id"] == "img", w.manifest["layers"]))
        @test img["brush"] == "grid"
        @test img["events"] == ["hover"]
        # The target starts at the cells the starting bounds overlap, as a release there would (#330).
        start = IP.APD.Bonds.initial_value(w)
        @test start.roi == BoundsEvent(:roi, 1.0, 3.0, 1.0, 2.0)
        @test start.img isa GridWindowEvent && start.img.layer === :img
        @test (start.img.xmin, start.img.xmax, start.img.ymin, start.img.ymax) == (1.0, 3.0, 1.0, 2.0)
        # Columns 2:3 and row 2 exactly (#337): the box's data edges sit on cell edges and land a
        # fraction of a pixel past the whole-pixel edges into the neighbours, which doesn't count.
        @test (start.img.i1, start.img.i2, start.img.j1, start.img.j2) == (2, 3, 2, 2)
        @test start == tv(w, w.manifest["initial"]) == tv(w, nothing)

        # A stale bundle's single cell envelope isn't a field-keyed value, so it is refused.
        @test_throws ArgumentError tv(w, Dict("layer" => "img", "index" => 0, "payload" => Dict("i" => 0, "j" => 0, "value" => 11.0)))

        # The brush commits a GridWindowEvent.
        payload = Dict("i0" => 1, "i1" => 2, "j0" => 1, "j1" => 1, "xmin" => 1.0, "xmax" => 3.0, "ymin" => 1.0, "ymax" => 2.0)
        win = commit_field(w, Dict("items" => [Dict("layer" => "img", "index" => 0, "payload" => payload)]); field = "img")
        @test win isa GridWindowEvent && (win.i1, win.i2, win.j1, win.j2) == (2, 3, 2, 2)
        @test vals[win] == vals[2:3, 2:2]
        # A box over no cells leaves an empty window, and so does an empty items list.
        @test isempty(vals[commit_field(w, Dict("items" => Any[]); field = "img")])
        @test_throws ArgumentError commit_field(
            w, Dict("items" => [Dict("layer" => "img", "index" => 0, "payload" => payload) for _ in 1:2]); field = "img",
        )
    end

    @testset "_cell_range leaves out an end cell the box only grazes (#337)" begin
        # The same cases as `cellRange` in frontend/test/selection.test.ts, 0-based cells.
        cr = Masque._cell_range
        asc = [100.0, 200.0, 300.0, 400.0]; desc = reverse(asc)
        @test cr(asc, 199.6, 300.4) == (1, 1)
        @test cr(asc, 199.5, 300.5) == (1, 1)
        @test cr(desc, 199.6, 300.4) == (1, 1)
        @test cr(asc, 199.4, 300.6) == (0, 2)
        @test cr(desc, 199.4, 300.6) == (0, 2)
        @test cr(asc, 199.8, 200.2) == (1, 1)
        @test cr(asc, 150.0, 150.1) == (0, 0)
        @test cr([0.0, 0.4, 10.0, 20.0], 0.0, 15.0) == (0, 2)
        @test cr(asc, 50.0, 250.0) == (0, 1)
        @test cr(asc, 450.0, 500.0) === nothing
    end

    @testset "a selects box gives fields for the box and its point target; other layers keep their clicks" begin
        pfig = Figure(size = (400, 300)); pax = Axis(pfig[1, 1])
        pts = [(1.0, 1.0), (2.0, 2.0), (3.0, 3.0), (4.0, 4.0)]
        scatter!(pax, first.(pts), last.(pts))
        pi = PointInteractable(pax, pts; id = :pts, payloads = ["a", "b", "c", "d"])
        other = PointInteractable(pax, [(5.0, 1.0)]; id = :other)
        roi = ROIInteractable(pax; bounds = (1.5, 3.5, 1.5, 3.5), selects = :pts, id = :box)
        tv = IP.APD.Bonds.transform_value

        # Without a box the points are a pick: a click is one ElementEvent.
        alone = masque(pfig, pi; auto = false)
        @test "click" in only(alone.manifest["layers"])["events"]
        @test commit_field(alone, Dict("layer" => "pts", "index" => 1)) isa ElementEvent

        # With the box, the target is hover-only; every other layer keeps its clicks (#335).
        w = masque(pfig, [pi, other, roi]; auto = false)
        layer_of(id) = only(filter(l -> l["id"] == id, w.manifest["layers"]))
        @test layer_of("pts")["events"] == ["hover"] && layer_of("pts")["brush"] == "elements"
        @test "click" in layer_of("other")["events"] && !haskey(layer_of("other"), "brush")
        @test w.manifest["fields"] == ["pts", "other", "box"]
        # The target starts at the points inside the starting bounds (#330), the other pick at
        # nothing, and the box at its bounds.
        start = IP.APD.Bonds.initial_value(w)
        @test start.pts isa Vector{ElementEvent} && [e.payload for e in start.pts] == ["b", "c"]
        @test start.other === nothing
        @test start.box == BoundsEvent(:box, 1.5, 3.5, 1.5, 3.5)

        # The brush commits a Vector{ElementEvent}; a click on the other layer an ElementEvent.
        got = commit_field(w, Dict("items" => [Dict("layer" => "pts", "index" => 1), Dict("layer" => "pts", "index" => 2)]); field = "pts")
        @test got isa Vector{ElementEvent} && [e.payload for e in got] == ["b", "c"]
        oev = commit_field(w, Dict("layer" => "other", "index" => 0))
        @test oev isa ElementEvent && oev.layer === :other && oev.index == 1
        # One release sets the box and its target together, and the other pick stays.
        bounds = Dict("xmin" => 0.5, "xmax" => 1.5, "ymin" => 0.5, "ymax" => 1.5)
        rel = tv(
            w, Dict(
                "pts" => Dict("items" => [Dict("layer" => "pts", "index" => 0)]),
                "other" => Dict("layer" => "other", "index" => 0),
                "box" => Dict("layer" => "box", "index" => 0, "payload" => bounds),
            )
        )
        @test [e.payload for e in rel.pts] == ["a"]
        @test rel.other.index == 1
        @test rel.box == BoundsEvent(:box, 0.5, 1.5, 0.5, 1.5)
        # A point click can't land in the brush field, nor a brush's items in a pick's.
        @test_throws ArgumentError tv(w, Dict("pts" => Dict("layer" => "pts", "index" => 1)))
        @test_throws ArgumentError tv(w, Dict("other" => Dict("items" => Any[])))

        # `selected=` seeds the brush. With two fields that take picks, name the field.
        seeded = IP.APD.Bonds.initial_value(masque(pfig, [pi, roi]; selected = 2, auto = false))
        @test only(seeded.pts).payload == "b"
        @test_throws ArgumentError masque(pfig, [pi, other, roi]; selected = 2, auto = false)
        keyed = IP.APD.Bonds.initial_value(masque(pfig, [pi, other, roi]; selected = (pts = [1, 4], other = 1), auto = false))
        @test [e.payload for e in keyed.pts] == ["a", "d"] && keyed.other.index == 1
    end

    @testset "a selecting box starts at the marks inside its starting bounds (#330)" begin
        fig = Figure(size = (400, 300)); ax = Axis(fig[1, 1]; limits = (0, 10, 0, 10))
        pts = [(1.0, 1.0), (2.0, 2.0), (3.0, 3.0), (8.0, 8.0)]
        scatter!(ax, first.(pts), last.(pts))
        pi = PointInteractable(ax, pts; id = :pts, payloads = ["a", "b", "c", "d"])
        iv(w) = IP.APD.Bonds.initial_value(w).pts
        box(b) = ROIInteractable(ax; bounds = b, selects = :pts, id = :box)

        # The start ships in `initial` as the target's items, next to the box's own bounds.
        w = masque(fig, [pi, box((1.5, 3.5, 1.5, 3.5))]; auto = false)
        @test !haskey(only(filter(l -> l["id"] == "pts", w.manifest["layers"])), "selected")
        env = IP.mount_envelope(w.manifest)
        @test env === w.manifest["initial"]
        @test env["pts"] == Dict("items" => [Dict("layer" => "pts", "index" => 1), Dict("layer" => "pts", "index" => 2)])
        @test env["box"] == Dict(
            "layer" => "box", "index" => 0,
            "payload" => Dict("xmin" => 1.5, "xmax" => 3.5, "ymin" => 1.5, "ymax" => 3.5),
        )
        @test [e.payload for e in iv(w)] == ["b", "c"]
        # The same value a release of the untouched box would send.
        @test IP.APD.Bonds.initial_value(w) == IP.APD.Bonds.transform_value(w, env)

        # A box over no marks starts empty, not at `nothing`.
        @test iv(masque(fig, [pi, box((4.0, 6.0, 4.0, 6.0))]; auto = false)) == ElementEvent[]

        # A box covering everything starts at every mark, in layer order.
        @test [e.index for e in iv(masque(fig, [pi, box((0.5, 9.0, 0.5, 9.0))]; auto = false))] == 1:4

        # `selected=` on the target wins, including an explicit empty brush.
        b = box((1.5, 3.5, 1.5, 3.5))
        @test [e.payload for e in iv(masque(fig, [pi, b]; selected = 4, auto = false))] == ["d"]
        @test iv(masque(fig, [pi, b]; selected = (pts = Int[],), auto = false)) == ElementEvent[]

        # `selected=` on another pick seeds that field; the box still starts at its own marks.
        other = PointInteractable(ax, [(9.0, 1.0)]; id = :other)
        wo = masque(fig, [pi, other, b]; selected = Dict(:other => [1]), auto = false)
        @test IP.APD.Bonds.initial_value(wo).other.index == 1
        @test [(e.layer, e.payload) for e in iv(wo)] == [(:pts, "b"), (:pts, "c")]

        # Two boxes on one figure each have a field.
        b2 = ROIInteractable(ax; bounds = (7.0, 9.0, 7.0, 9.0), id = :zoom)
        w2 = masque(fig, [pi, b, b2]; auto = false)
        @test w2.manifest["fields"] == ["pts", "box", "zoom"]
        @test IP.APD.Bonds.initial_value(w2).zoom == BoundsEvent(:zoom, 7.0, 9.0, 7.0, 9.0)
    end

    @testset "selects takes a plot (#302)" begin
        layer(w, id) = only(filter(l -> l["id"] == id, w.manifest["layers"]))
        # The box's target is the one layer stamped as a brush.
        target(w) = only(l["id"] for l in w.manifest["layers"] if haskey(l, "brush"))
        bounds = (0.0, 4.0, 0.0, 4.0)

        # Two scatters: the box finds the second one's numbered layer without the caller naming it.
        fig = Figure(size = (400, 300)); ax = Axis(fig[1, 1])
        s1 = scatter!(ax, [1.0, 2.0], [1.0, 2.0])
        s2 = scatter!(ax, [1.5, 3.0], [2.5, 3.0])
        w = masque(fig, ROIInteractable(ax; bounds, selects = s2))
        @test target(w) == "scatter_2"
        @test layer(w, "roi")["selects"] == "scatter_2"
        # Same widget as naming the id, so the browser sees nothing new.
        @test w.manifest == masque(fig, ROIInteractable(ax; bounds, selects = :scatter_2)).manifest
        w1 = masque(fig, ROIInteractable(ax; bounds, selects = s1))
        @test target(w1) == "scatter"

        # The plot's own id, set through `interactables`, is the one the box takes.
        w = masque(fig, interactables(s2; id = :pts), ROIInteractable(ax; bounds, selects = s2))
        @test target(w) == "pts"

        # Without `auto`, the plot needs its own interactables in the call.
        err = try
            masque(fig, ROIInteractable(ax; bounds, selects = s2); auto = false)
            nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin("auto = false", err.msg)
        w = masque(fig, interactables(s2), ROIInteractable(ax; bounds, selects = s2); auto = false)
        @test target(w) == "scatter"

        # A composite brushes the layer of a compatible kind: scatterlines' points, not its line.
        cfig = Figure(size = (400, 300)); cax = Axis(cfig[1, 1])
        sl = scatterlines!(cax, [1.0, 2.0, 3.0], [1.0, 3.0, 2.0])
        w = masque(cfig, ROIInteractable(cax; bounds, selects = sl))
        @test layer(w, target(w))["kind"] == "circles"

        # A heatmap gives a grid brush.
        hfig = Figure(size = (400, 300)); hax = Axis(hfig[1, 1])
        hm = heatmap!(hax, 0 .. 4.0, 0 .. 3.0, [Float64(i + j) for i in 1:4, j in 1:3])
        w = masque(hfig, ROIInteractable(hax; bounds, selects = hm))
        @test layer(w, target(w))["kind"] == "grid" && layer(w, target(w))["brush"] == "grid"

        # A plot with no brushable layer names the kinds it found.
        lfig = Figure(size = (400, 300)); lax = Axis(lfig[1, 1])
        ln = lines!(lax, 1:4, 1:4)
        err = try
            masque(lfig, ROIInteractable(lax; bounds, selects = ln))
            nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin("`lines` plot", err.msg) && occursin("lines", err.msg)

        # Two layers the box could brush: the error names both and asks for an id.
        _, _, ctx = ctx_for(fig)
        two = Masque._PlotTarget(s1, [:a, :b])
        err = try
            Masque.build_manifest(
                [
                    PointInteractable(ax, [(1.0, 1.0)]; id = :a), PointInteractable(ax, [(2.0, 2.0)]; id = :b),
                    ROIInteractable(ax, bounds, :roi, two),
                ], ctx,
            )
            nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin("`:a`, `:b`", err.msg) && occursin("selects = :a", err.msg)

        # `build_manifest` on its own takes layer ids only.
        @test_throws ArgumentError Masque.build_manifest(
            [PointInteractable(ax, [(1.0, 1.0)]; id = :scatter), ROIInteractable(ax; bounds, selects = s1)], ctx,
        )
    end

    @testset "a threshold, an ROI, or a passed colorbar is a field next to the picks (#335)" begin
        fig = Figure(size = (400, 300)); ax = Axis(fig[1, 1]; limits = (0, 10, 0, 10))
        sc = scatter!(ax, [2.0, 8.0], [2.0, 8.0]; color = [1.0, 2.0])
        cb = Colorbar(fig[1, 2], sc)
        iv = IP.APD.Bonds.initial_value
        ev_of(w, id) = only(filter(l -> l["id"] == id, w.manifest["layers"]))["events"]

        # Without a control, the automatic layers take clicks and every pick starts at `nothing`.
        plain = masque(fig)
        @test "click" in ev_of(plain, "scatter") && "click" in ev_of(plain, "colorbar")
        @test Set(plain.manifest["fields"]) == Set(["scatter", "colorbar"])
        @test all(isnothing, values(iv(plain)))

        # A threshold is a field of its own, starting at `value`; the other layers keep their clicks.
        th = ThresholdInteractable(ax; value = 4.0)
        w = masque(fig, th)
        @test "click" in ev_of(w, "scatter") && "click" in ev_of(w, "colorbar")
        @test ev_of(w, "threshold") == ["drag"]
        @test "threshold" in w.manifest["fields"]
        @test iv(w).threshold == ThresholdEvent(:threshold, 4.0, nothing)
        @test iv(w).scatter === nothing
        @test commit_field(w, Dict("layer" => "threshold", "index" => 0, "payload" => 6.5)) == ThresholdEvent(:threshold, 6.5, nothing)
        # `bind` narrows to the threshold alone.
        @test iv(masque(fig, th; bind = th)) == ThresholdEvent(:threshold, 4.0, nothing)

        # A bounds ROI starts at its `bounds`.
        roi = ROIInteractable(ax; bounds = (1.0, 3.0, 2.0, 5.0))
        wr = masque(fig, roi)
        @test "click" in ev_of(wr, "scatter")
        @test iv(wr).roi == BoundsEvent(:roi, 1.0, 3.0, 2.0, 5.0)

        # A colorbar is a pick, with no value before the first click.
        wc = masque(fig, ColorbarInteractable(cb))
        @test "click" in ev_of(wc, "scatter") && "click" in ev_of(wc, "colorbar")
        @test iv(wc).colorbar === nothing

        # `selected=` on a pick seeds it; the threshold keeps its own start.
        ws = masque(fig, th; selected = Dict(:scatter => [1]))
        @test iv(ws).scatter.index == 1
        @test iv(ws).threshold == ThresholdEvent(:threshold, 4.0, nothing)

        # Several controls share a figure, each with its own field.
        both = iv(masque(fig, th, roi; bind = (th, roi)))
        @test both == (threshold = ThresholdEvent(:threshold, 4.0, nothing), roi = BoundsEvent(:roi, 1.0, 3.0, 2.0, 5.0))
        two = iv(masque(fig, th, ThresholdInteractable(ax; value = 6.0, id = :t2); bind = (:threshold, :t2)))
        @test two.t2 == ThresholdEvent(:t2, 6.0, nothing)

        # On a categorical axis, a `value` at a category's position starts with its label.
        cfig = Figure(size = (400, 300))
        cax = Axis(cfig[1, 1]; dim2_conversion = Makie.CategoricalConversion())
        scatter!(cax, [1.0, 2.0, 3.0], ["a", "b", "c"])
        @test iv(masque(cfig, ThresholdInteractable(cax; value = 2.0); auto = false)).threshold ==
            ThresholdEvent(:threshold, 2.0, "b")
        @test iv(masque(cfig, ThresholdInteractable(cax; value = 2.5); auto = false)).threshold ==
            ThresholdEvent(:threshold, 2.5, nothing)
    end
end
