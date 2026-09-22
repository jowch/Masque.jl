using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

@testset "Drag" begin
    @testset "ThresholdInteractable (M4 drag)" begin
        # Originally read the file's shared bare `ax`/`ctx`, which by execution order was
        # actually a TextInteractable testset's leftover text-only figure (each nested
        # `@testset`'s `let` reassigns the enclosing testset's already-existing local rather
        # than shadowing it) — unrelated to threshold semantics. Every assertion here is
        # self-referential (computed via the same ax/ctx it tests, or kind/shape-only), so
        # the swap to `default_fixture()` is behavior-preserving and fixes the staleness.
        (; ax, ctx) = default_fixture()
        th = ThresholdInteractable(ax; orientation = :horizontal, value = 4.0)
        @test events(th) == (:drag,)
        @test validate(th, ctx) === nothing
        L = only(hitlayers(th, ctx))
        @test L.kind === :threshold
        t = ctx.transforms[L.axis]
        # horizontal: pos = projected pixel-y of data-y; span = viewport x-extent
        @test L.geometry["orientation"] == "h"
        @test L.geometry["pos"] ≈ data_to_image_px(ctx, ax, (t.xlims[1], 4.0))[2]
        @test L.geometry["span"] ≈ [t.viewport[1], t.viewport[1] + t.viewport[3]]
        # vertical projects x; span = viewport y-extent
        Lv = only(hitlayers(ThresholdInteractable(ax; orientation = :vertical, value = 2.0), ctx))
        @test Lv.geometry["orientation"] == "v"
        @test Lv.geometry["pos"] ≈ data_to_image_px(ctx, ax, (2.0, t.ylims[1]))[1]
        @test Lv.geometry["span"] ≈ [t.viewport[2], t.viewport[2] + t.viewport[4]]
        # fail loud: horizontal drag needs an invertible y-scale
        fs = Figure(); axs = Axis(fs[1, 1]; yscale = sqrt); scatter!(axs, [1.0, 2.0], [1.0, 2.0])
        _, _, ctxs = ctx_for(fs)
        @test validate(ThresholdInteractable(axs; orientation = :horizontal, value = 1.0), ctxs) isa String
        @test validate(ThresholdInteractable(axs; orientation = :vertical, value = 1.0), ctxs) === nothing  # x is identity
        @test_throws ArgumentError ThresholdInteractable(ax; orientation = :diagonal, value = 1.0)
        # end-to-end: the :threshold layer serializes through build_manifest (Dict geometry + drag event)
        mt = build_manifest([th], ctx)["layers"][1]
        @test mt["kind"] == "threshold" && mt["events"] == ["drag"]
        @test mt["geometry"]["orientation"] == "h" && haskey(mt["geometry"], "pos") && haskey(mt["geometry"], "span")
        @test isempty(mt["payloads"]) && !haskey(mt, "tooltips")   # computed client-side, no payloads/tooltips
    end

    @testset "ViewInteractable (drag-to-pan / orbit)" begin
        # See the ThresholdInteractable note above — same clobbering, same fix.
        (; ax, ctx) = default_fixture()
        v = ViewInteractable(ax)
        @test events(v) == (:drag,)
        @test validate(v, ctx) === nothing
        Lv = only(hitlayers(v, ctx))
        @test Lv.kind === :view
        @test Lv.geometry["mode"] == "pan"
        @test Lv.geometry["w"] ≈ ctx.transforms[Lv.axis].viewport[3]
        @test !haskey(Lv.geometry, "azimuth")
        # view layers sort after ROI/threshold in the manifest (hit-test arbitration)
        roi = ROIInteractable(ax; bounds = (1.0, 2.0, 1.0, 2.0), id = :roi)
        morder = build_manifest([v, roi], ctx)["layers"]
        @test morder[1]["kind"] == "roi"
        @test morder[2]["kind"] == "view"
        # categorical / Axis3: pan fails loud on categories; Axis3 is orbit
        fc = Figure(); axc = Axis(fc[1, 1]; dim1_conversion = Makie.CategoricalConversion())
        scatter!(axc, ["a", "b", "c"], [1.0, 2.0, 3.0])
        _, _, ctxc = ctx_for(fc)
        @test validate(ViewInteractable(axc), ctxc) isa String
        f3 = Figure(); ax3 = Axis3(f3[1, 1]; azimuth = 0.4, elevation = 0.5)
        scatter!(ax3, Makie.Point3f[(1, 2, 3), (4, 5, 6)])
        _, _, ctx3 = ctx_for(f3)
        @test validate(ViewInteractable(ax3), ctx3) === nothing
        L3 = only(hitlayers(ViewInteractable(ax3), ctx3))
        @test L3.geometry["mode"] == "orbit"
        @test L3.geometry["azimuth"] ≈ 0.4
        @test L3.geometry["elevation"] ≈ 0.5
        # #102/§12.3: a view gesture commits nothing, so the frontend never sends a :view bond
        # payload anymore — `_computed_payload`'s :view branch retired with it. A caller that
        # somehow reaches transform_value with one anyway (there is no such path in the shipped
        # frontend) hits the same unrecognized-computed-payload-shape guard any other untaught
        # kind/keys combination would, rather than silently converting it.
        tv = Masque.APD.Bonds.transform_value
        vmanifest = Dict{String, Any}("layers" => [Dict{String, Any}("id" => "view", "kind" => "view", "payloads" => Any[])])
        w = Masque.MasqueWidget("", vmanifest, 100)
        @test_throws ArgumentError tv(w, Dict("layer" => "view", "index" => 0, "payload" => Dict("xmin" => 1.0, "xmax" => 5.0, "ymin" => 0.0, "ymax" => 10.0)))
        @test_throws ArgumentError tv(w, Dict("layer" => "view", "index" => 0, "payload" => Dict("azimuth" => 0.9, "elevation" => 0.3)))
        # PolarAxis / Colorbar: view gestures rejected (no continuous polar inversion; colorbar is 1-D)
        fp = Figure(); axp = PolarAxis(fp[1, 1])
        scatter!(axp, [Point2f(0.0, 1.0), Point2f(π / 2, 2.0)])
        _, _, ctxp = ctx_for(fp)
        msgp = validate(ViewInteractable(axp), ctxp)
        @test msgp !== nothing && occursin("PolarAxis", msgp)
        fcb = Figure(); axcb = Axis(fcb[1, 1]); hm = heatmap!(axcb, rand(4, 4))
        cb = Colorbar(fcb[1, 2], hm)
        Makie.update_state_before_display!(fcb)
        _, _, ctxcb = ctx_for(fcb)
        msgcb = validate(ViewInteractable(cb), ctxcb)
        @test msgcb !== nothing && occursin("Colorbar", msgcb)
    end

    @testset "ROIInteractable (M4 drag cut 2)" begin
        # See the ThresholdInteractable note above — same clobbering, same fix.
        (; ax, ctx) = default_fixture()
        r = ROIInteractable(ax; bounds = (1.0, 3.0, 2.0, 8.0))
        @test events(r) == (:drag,)
        @test validate(r, ctx) === nothing
        L = only(hitlayers(r, ctx))
        @test L.kind === :roi
        a = data_to_image_px(ctx, ax, (1.0, 2.0)); b = data_to_image_px(ctx, ax, (3.0, 8.0))
        @test L.geometry["x"] ≈ min(a[1], b[1])
        @test L.geometry["y"] ≈ min(a[2], b[2])
        @test L.geometry["w"] ≈ abs(b[1] - a[1])
        @test L.geometry["h"] ≈ abs(b[2] - a[2])
        @test L.geometry["handle"] ≈ 8 * ctx.scaling
        # fail loud: a non-invertible scale on EITHER axis
        fs = Figure(); axs = Axis(fs[1, 1]; yscale = sqrt); scatter!(axs, [1.0, 2.0], [1.0, 2.0])
        _, _, ctxs = ctx_for(fs)
        @test validate(ROIInteractable(axs; bounds = (1.0, 2.0, 1.0, 2.0)), ctxs) isa String
        @test_throws ArgumentError ROIInteractable(ax; bounds = (3.0, 1.0, 2.0, 8.0))   # xmin >= xmax
        @test_throws ArgumentError ROIInteractable(ax; bounds = (1.0, 3.0, 8.0, 2.0))   # ymin >= ymax
        # xscale non-invertible also fails loud
        fxx = Figure(); axx = Axis(fxx[1, 1]; xscale = sqrt); scatter!(axx, [1.0, 2.0], [1.0, 2.0])
        _, _, ctxx = ctx_for(fxx)
        @test validate(ROIInteractable(axx; bounds = (1.0, 2.0, 1.0, 2.0)), ctxx) isa String
        # categorical axes rejected (no numeric bounds)
        fc2 = Figure(); axc2 = Axis(fc2[1, 1]; dim1_conversion = Makie.CategoricalConversion())
        scatter!(axc2, ["a", "b", "c"], [1.0, 2.0, 3.0])
        _, _, ctxc2 = ctx_for(fc2)
        @test validate(ROIInteractable(axc2; bounds = (1.0, 2.0, 1.0, 2.0)), ctxc2) isa String
        # end-to-end: the :roi layer serializes through build_manifest
        mr = build_manifest([r], ctx)["layers"][1]
        @test mr["kind"] == "roi" && mr["events"] == ["drag"]
        @test all(k -> haskey(mr["geometry"], k), ("x", "y", "w", "h", "handle"))
        @test isempty(mr["payloads"]) && !haskey(mr, "tooltips")
    end
end

@testset "bond_from_js builds concrete events from the wire" begin
    tv = Masque.APD.Bonds.transform_value
    function wdg(kind, bond; extra = Dict{String, Any}())
        layer = Dict{String, Any}("id" => "L", "kind" => kind, "bond" => bond, "payloads" => Any[])
        manifest = Dict{String, Any}("layers" => [layer])
        merge!(manifest, extra)
        return Masque.MasqueWidget("", manifest, 100)
    end

    ev = tv(wdg("axis", "axis"), Dict("layer" => "L", "index" => -1, "payload" => Dict("x" => 1.0, "y" => 2.0)))
    @test ev isa AxisEvent && ev.x == 1.0 && ev.y == 2.0
    ev = tv(wdg("axis", "colorbar"), Dict("layer" => "L", "index" => -1, "payload" => Dict("value" => 3.0)))
    @test ev isa ColorbarEvent && ev.value == 3.0

    ev = tv(wdg("grid", "gridcell"), Dict("layer" => "L", "index" => 5, "payload" => Dict("i" => 1, "j" => 2)))
    @test ev isa GridCellEvent && ev.i == 2 && ev.j == 3 && ev.value === nothing
    ev = tv(wdg("grid", "gridcell"), Dict("layer" => "L", "index" => 5, "payload" => Dict("i" => 1, "j" => 2, "value" => 9.5)))
    @test ev.value == 9.5

    # wire i0/i1/j0/j1 are 0-based inclusive; Julia stores i1/i2/j1/j2 1-based inclusive
    gridw = wdg("grid", "gridcell"; extra = Dict{String, Any}("selection" => "grid", "selectionTarget" => "L"))
    win = tv(
        gridw, Dict(
            "items" => [
                Dict(
                    "layer" => "L", "index" => 0,
                    "payload" => Dict("i0" => 0, "i1" => 1, "j0" => 0, "j1" => 1, "xmin" => 0.0, "xmax" => 1.0, "ymin" => 2.0, "ymax" => 3.0),
                ),
            ],
        ),
    )
    @test win isa GridWindowEvent
    @test (win.i1, win.i2, win.j1, win.j2) == (1, 2, 1, 2)
    @test (win.xmin, win.xmax, win.ymin, win.ymax) == (0.0, 1.0, 2.0, 3.0)
    miss = tv(gridw, Dict("items" => []))
    @test miss isa GridWindowEvent && isempty(miss.i1:miss.i2) && isempty(miss.j1:miss.j2)

    ev = tv(wdg("roi", "bounds"), Dict("layer" => "L", "index" => 0, "payload" => Dict("xmin" => 0.0, "xmax" => 1.0, "ymin" => 2.0, "ymax" => 3.0)))
    @test ev isa BoundsEvent && (ev.xmin, ev.xmax, ev.ymin, ev.ymax) == (0.0, 1.0, 2.0, 3.0)
    ev = tv(wdg("threshold", "threshold"), Dict("layer" => "L", "index" => 0, "payload" => 4.5))
    @test ev isa ThresholdEvent && ev.value === 4.5

    @test_throws ArgumentError tv(wdg("view", "none"), Dict("layer" => "L", "index" => 0, "payload" => Dict("azimuth" => 0.1)))
    @test_throws ArgumentError tv(wdg("axis", "axis"), Dict("layer" => "L", "index" => -1, "payload" => Dict("x" => 1.0)))
    @test_throws ArgumentError tv(wdg("grid", "gridcell"), Dict("layer" => "L", "index" => 0, "payload" => Dict("i" => 1)))
    @test_throws ArgumentError tv(wdg("axis", "axis"), Dict("layer" => "L", "index" => -1, "payload" => "not-a-dict"))
    let err = try
            tv(wdg("axis", "axis"), Dict("layer" => "L", "index" => -1, "payload" => "not-a-dict"))
            nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin(":L", err.msg)
    end
    @test_throws ArgumentError tv(wdg("axis", "axis"), Dict("layer" => "missing", "index" => -1, "payload" => Dict("x" => 1.0, "y" => 2.0)))
    @test_throws ArgumentError tv(Masque.MasqueWidget("", Dict{String, Any}(), 100), Dict("layer" => "L", "index" => 0))
end

@testset "SELECTED_KINDS parity: Julia _SELECTED_KINDS matches frontend selection.ts (#109)" begin
    # After #109, a drift here is no longer cosmetic: the browser would omit a payload for a
    # kind Julia doesn't think it can reconstruct, and the user would silently get `nothing`.
    selection_ts = read(joinpath(@__DIR__, "..", "..", "frontend", "src", "selection.ts"), String)
    m = match(r"SELECTED_KINDS = new Set\(\[(.*?)\]\)", selection_ts)
    @test m !== nothing
    js_kinds = Set(Symbol(strip(s, ['"', ' '])) for s in split(m.captures[1], ","))
    @test js_kinds == Set(Masque._SELECTED_KINDS)
end
