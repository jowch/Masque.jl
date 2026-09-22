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
        using Masque: RectInteractable, auto_interactables
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

    @testset "initial_value hydrates the selection from selected=" begin
        hfig = Figure(size = (600, 400)); hax = Axis(hfig[1, 1])
        pts = DEFAULT_PTS
        scatter!(hax, first.(pts), last.(pts))
        _, _, hctx = ctx_for(hfig)
        pts_i = PointInteractable(hax, pts; id = :scatter, payloads = ["a", "b", "c"])

        # no selected= → initial_value is nothing, same as an unselected widget
        m0 = build_manifest([pts_i], hctx)
        w0 = MasqueWidget("", m0, 100)
        @test IP.APD.Bonds.initial_value(w0) === nothing

        # several indices on a scalar layer highlight only; the bond stays nothing
        m2 = build_manifest([pts_i], hctx; selected = Dict(:scatter => [1, 3]))
        @test m2["layers"][1]["selected"] == [0, 2]
        iv2 = IP.APD.Bonds.initial_value(MasqueWidget("", m2, 100))
        @test iv2 === nothing

        # one index unwraps: `2` and `[2]` are the same ElementEvent (the second point)
        m1 = build_manifest([pts_i], hctx; selected = 2)
        iv1 = IP.APD.Bonds.initial_value(MasqueWidget("", m1, 100))
        @test iv1 isa ElementEvent
        @test iv1.layer === :scatter && iv1.index == 2 && iv1.payload == "b"
        m1b = build_manifest([pts_i], hctx; selected = [2])
        iv1b = IP.APD.Bonds.initial_value(MasqueWidget("", m1b, 100))
        @test iv1b == iv1

        # two seedable layers: a set is highlight-only, not a vector bond
        segs_i = SegmentInteractable(
            hax, [(1.0, 1.0), (2.0, 2.0), (3.0, 3.0), (4.0, 4.0)];
            mode = :pairs, id = :segs, payloads = ["s0", "s1"],
        )
        mmulti = build_manifest([pts_i, segs_i], hctx; selected = Dict(:scatter => [1], :segs => [2]))
        @test mmulti["layers"][1]["selected"] == [0]
        @test mmulti["layers"][2]["selected"] == [1]
        @test IP.APD.Bonds.initial_value(MasqueWidget("", mmulti, 100)) === nothing
        @test_throws ArgumentError build_manifest([pts_i, segs_i], hctx; selected = 1)

        # no explicit payloads= (the common case): PointInteractable auto-fills one
        # `(; index, x, y)` NamedTuple per point. `selected = 2` is the second point.
        w_auto = masque(hfig, PointInteractable(hax, pts; id = :scatter); selected = 2)
        iv_auto = IP.APD.Bonds.initial_value(w_auto)
        @test iv_auto isa ElementEvent
        @test iv_auto.layer === :scatter && iv_auto.index == 2
        @test iv_auto.payload == (; index = 2, x = pts[2][1], y = pts[2][2])
    end

    @testset "transform_value reconstructs the payload from the manifest, not the wire" begin
        bfig = Figure(size = (600, 400)); bax = Axis(bfig[1, 1])
        pts = DEFAULT_PTS
        scatter!(bax, first.(pts), last.(pts))
        payloads = [(; name = "a"), (; name = "b"), (; name = "c")]
        w = masque(bfig, PointInteractable(bax, pts; id = :scatter, payloads = payloads))
        tv = IP.APD.Bonds.transform_value

        # element kind: the identical object comes back, not a JSON-shaped copy of it — a
        # NamedTuple stays a NamedTuple, and it's the very object passed in `payloads=`.
        ev = tv(w, Dict("layer" => "scatter", "index" => 1, "payload" => Dict("wrong" => "value")))
        @test ev isa ElementEvent
        @test ev.index == 2
        @test ev.payload isa NamedTuple
        @test ev.payload === payloads[2]
        @test ev.name == "b"

        # the browser's own reported payload is ignored outright for an element kind
        ev0 = tv(w, Dict("layer" => "scatter", "index" => 0, "payload" => "anything at all"))
        @test ev0.index == 1 && ev0.payload === payloads[1]

        # an axis click is an AxisEvent, not a payload NamedTuple
        w2 = masque(bfig, [PointInteractable(bax, pts; id = :scatter, payloads = payloads), AxisInteractable(bax; id = :readout)])
        computed = Dict("x" => 1.23, "y" => 4.56)
        evax = tv(w2, Dict("layer" => "readout", "index" => -1, "payload" => computed))
        @test evax isa AxisEvent && evax.x == 1.23 && evax.y == 4.56

        # a selects-ROI makes the items envelope a Vector{ElementEvent}
        roi = ROIInteractable(bax; bounds = (0.0, 1.0, 0.0, 1.0), selects = :scatter, id = :roi)
        wselroi = masque(bfig, [PointInteractable(bax, pts; id = :scatter, payloads = payloads), roi])
        multi = tv(
            wselroi, Dict(
                "items" => [
                    Dict("layer" => "scatter", "index" => 0, "payload" => "garbage"),
                    Dict("layer" => "scatter", "index" => 2, "payload" => "garbage"),
                ]
            )
        )
        @test multi isa Vector{ElementEvent}
        @test multi[1].payload === payloads[1] && multi[1].index == 1
        @test multi[2].payload === payloads[3] && multi[2].index == 3

        # out-of-range index: reconstruction fails loud rather than passing the bad index through
        @test_throws ArgumentError tv(w, Dict("layer" => "scatter", "index" => 99, "payload" => nothing))

        # one hydrated index and the click on that element are the same object
        wsel = masque(
            bfig, PointInteractable(bax, pts; id = :scatter, payloads = payloads);
            selected = 2,
        )
        iv = IP.APD.Bonds.initial_value(wsel)
        @test iv isa ElementEvent && iv.payload === payloads[2] && iv.index == 2
        ev_same = tv(wsel, Dict("layer" => "scatter", "index" => 1, "payload" => nothing))
        @test ev_same.payload === iv.payload
        @test ev_same == iv
    end
end
