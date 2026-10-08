using Test, Masque, CairoMakie, Makie, Random
include(joinpath(@__DIR__, "..", "testutils.jl"))

# Same contract the overlay uses: piecewise linear in data space, NaN starts a new run,
# outside every run is omitted.
function _lerp_probe(xy, probe)
    i = 1
    n = length(xy)
    while i + 1 <= n
        if !isfinite(xy[i]) || !isfinite(xy[i + 1])
            i += 2
            continue
        end
        stop = i
        while stop + 1 <= n && isfinite(xy[stop]) && isfinite(xy[stop + 1])
            stop += 2
        end
        last = stop - 2
        if last >= i + 2 && probe >= xy[i] && probe <= xy[last]
            k = i
            while k + 2 <= last && xy[k + 2] < probe
                k += 2
            end
            (xy[k] == probe || k == last) && return xy[k + 1]
            t = (probe - xy[k]) / (xy[k + 2] - xy[k])
            return xy[k + 1] + t * (xy[k + 3] - xy[k + 1])
        end
        i = stop
    end
    return nothing
end

@testset "SliceInteractable" begin
    (; ax, ctx) = default_fixture()

    @testset "wire geometry is data-space samples, one layer" begin
        s = SliceInteractable(
            ax; series = [
                (; id = :a, label = "wide", color = :red, x = [0.0, 1.0], y = [0.0, 1.0]),
                (; id = :b, x = [2.0, 3.0], y = [0.0, 1.0]),
            ],
        )
        @test events(s) == (:hover,)
        L = only(hitlayers(s, ctx))
        @test L.kind === :slice
        @test L.payloads == Any[]
        @test L.events == (:hover,)
        g = L.geometry
        @test g["orientation"] == "v"
        @test g["crosshair"] == true
        @test g["covers"] == String[]
        @test length(g["series"]) == 2
        a = g["series"][1]
        @test a["id"] == "a" && a["label"] == "wide"
        @test a["xy"] == [0.0, 0.0, 1.0, 1.0]
        @test a["xy"][1] isa Float64
        @test a["color"] isa String && occursin("255", a["color"])
        b = g["series"][2]
        @test b["id"] == "b" && !haskey(b, "label") && !haskey(b, "color")
        @test b["xy"] == [2.0, 0.0, 3.0, 1.0]
        @test _lerp_probe(a["xy"], 0.25) ≈ 0.25
        @test _lerp_probe(a["xy"], 1.5) === nothing
        @test _lerp_probe(b["xy"], 1.5) === nothing
        @test _lerp_probe(b["xy"], 2.5) ≈ 0.5
        m = build_manifest([s], ctx)
        layer = only(m["layers"])
        @test layer["bond"] == "none"
        @test layer["events"] == ["hover"]
    end

    @testset "horizontal probe interleaves (y, x); a NaN gap is outside support" begin
        s = SliceInteractable(
            ax; orientation = :horizontal,
            series = [(; id = :a, x = [0.0, 1.0, NaN, 3.0, 4.0], y = [0.0, 1.0, NaN, 3.0, 4.0])],
        )
        xy = only(hitlayers(s, ctx)).geometry["series"][1]["xy"]
        @test xy[1:4] == [0.0, 0.0, 1.0, 1.0]
        @test isnan(xy[5]) && isnan(xy[6])
        @test _lerp_probe(xy, 0.5) ≈ 0.5
        @test _lerp_probe(xy, 2.0) === nothing
        @test _lerp_probe(xy, 3.5) ≈ 3.5
        off = SliceInteractable(
            ax; crosshair = false,
            series = [(; id = :a, x = [0.0, 1.0], y = [0.0, 1.0])],
        )
        @test off.crosshair == false
        @test only(hitlayers(off, ctx)).geometry["crosshair"] == false
        @test_throws ArgumentError SliceInteractable(
            ax; crosshair = :no, series = [(; id = :a, x = [0.0, 1.0], y = [0.0, 1.0])],
        )
    end

    @testset "construction fails loud" begin
        @test_throws ArgumentError SliceInteractable(ax; series = [(; x = [0.0, 1.0, 0.5], y = [0.0, 1.0, 0.0])])
        err = try
            SliceInteractable(ax; series = [(; x = [0.0, 1.0, 0.5], y = [0.0, 1.0, 0.0])])
            nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin("SliceInteractable", sprint(showerror, err)) &&
            occursin("strictly increasing", sprint(showerror, err))
        @test_throws ArgumentError SliceInteractable(ax; series = [(; x = [0.0, NaN], y = [0.0, 1.0])])
        @test_throws ArgumentError SliceInteractable(ax; series = [(; x = [0.0], y = [1.0])])
        @test_throws ArgumentError SliceInteractable(ax; series = [(; id = :x, x = [0.0, 1.0], y = [0.0, 1.0])])
        @test_throws ArgumentError SliceInteractable(ax; series = NamedTuple[])
        @test_throws ArgumentError SliceInteractable(ax; series = [(; x = [0.0, 1.0], y = [0.0, 1.0])], tooltip = true)
        dup = SliceInteractable(
            ax; series = [
                (; id = :a, x = [0.0, 1.0], y = [0.0, 1.0]),
                (; id = :a, x = [0.0, 1.0], y = [1.0, 2.0]),
            ],
        )
        @test [s.id for s in dup.series] == [:a, :a_2]
    end

    @testset "template fields are the live sample, not payloads" begin
        ok = SliceInteractable(
            ax; series = [(; id = :wide, x = [0.0, 1.0], y = [0.0, 1.0])],
            tooltip = masque"x=$(x) wide=$(wide)",
        )
        @test only(build_manifest([ok], ctx)["layers"])["template"] isa Vector
        bad = SliceInteractable(
            ax; series = [(; id = :wide, x = [0.0, 1.0], y = [0.0, 1.0])],
            tooltip = masque"$(nope)",
        )
        @test_throws ArgumentError build_manifest([bad], ctx)
    end

    @testset "one slice per axis; covers must be polygons or lines" begin
        s1 = SliceInteractable(ax; series = [(; x = [0.0, 1.0], y = [0.0, 1.0])])
        s2 = SliceInteractable(ax; series = [(; x = [0.0, 1.0], y = [1.0, 0.0])], id = :slice2)
        err = try
            build_manifest([s1, s2], ctx)
            nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin("SliceInteractable", sprint(showerror, err)) &&
            occursin("second slice", sprint(showerror, err))
        pt = PointInteractable(ax, [(1.0, 1.0)]; id = :pts)
        covered = SliceInteractable(ax; series = [(; x = [0.0, 1.0], y = [0.0, 1.0])], covers = :pts)
        err2 = try
            build_manifest([pt, covered], ctx)
            nothing
        catch e
            e
        end
        @test err2 isa ArgumentError && occursin("SliceInteractable", sprint(showerror, err2)) &&
            occursin("circles", sprint(showerror, err2))
        missing = SliceInteractable(ax; series = [(; x = [0.0, 1.0], y = [0.0, 1.0])], covers = :nope)
        @test_throws ArgumentError build_manifest([missing], ctx)
    end

    @testset "default covers follow the plots, skip layers not in the call (#271)" begin
        fl = Figure(); axl = Axis(fl[1, 1])
        a = lines!(axl, [0.0, 1.0, 2.0], [0.0, 1.0, 0.0])
        b = lines!(axl, [0.0, 1.0, 2.0], [1.0, 0.0, 1.0])
        # `auto = false`: the lines are not layers, so the default covers drop out quietly.
        w = masque(fl, SliceInteractable(axl, [a, b]), AxisInteractable(axl); auto = false)
        sl = only(filter(L -> L["kind"] == "slice", w.manifest["layers"]))
        @test sl["geometry"]["covers"] == String[]
        # With the lines in the call, the default still covers both.
        w = masque(fl, SliceInteractable(axl, [a, b]))
        sl = only(filter(L -> L["kind"] == "slice", w.manifest["layers"]))
        @test sl["geometry"]["covers"] == ["lines", "lines_2"]
        # Covers follow the plot, not its place in the vector: the second line alone is :lines_2.
        w = masque(fl, SliceInteractable(axl, b))
        sl = only(filter(L -> L["kind"] == "slice", w.manifest["layers"]))
        @test sl["geometry"]["covers"] == ["lines_2"]
        # A line passed as `interactables(plot)` under its own id is covered under that id.
        w = masque(fl, interactables(b; id = :trend), SliceInteractable(axl, b); auto = false)
        sl = only(filter(L -> L["kind"] == "slice", w.manifest["layers"]))
        @test sl["geometry"]["covers"] == ["trend"]
        # A Series slice reads every row and covers the series layer.
        fs = Figure(); axs = Axis(fs[1, 1])
        sp = series!(axs, [0.0, 1.0, 2.0], [0.0 1.0 0.0; 1.0 2.0 1.0]; labels = ["a", "b"])
        w = masque(fs, SliceInteractable(axs, sp))
        sl = only(filter(L -> L["kind"] == "slice", w.manifest["layers"]))
        @test sl["geometry"]["covers"] == ["series"]
        @test length(sl["geometry"]["series"]) == 2
        # Covers the caller names are checked as before.
        err = (@test_throws ArgumentError masque(fl, SliceInteractable(axl, [a, b]; covers = [:lines]); auto = false)).value
        @test occursin("not a layer in this masque() call", err.msg)
    end

    @testset "plot constructor without the axis (#306)" begin
        f = Figure(); ax1 = Axis(f[1, 1]); ax2 = Axis(f[1, 2])
        a = lines!(ax2, [0.0, 1.0, 2.0], [0.0, 1.0, 0.0]; label = "a")
        b = lines!(ax2, [0.0, 1.0, 2.0], [1.0, 0.0, 1.0]; label = "b")
        c = lines!(ax1, [0.0, 1.0, 2.0], [2.0, 2.0, 2.0])
        slice_of(w) = only(filter(L -> L["kind"] == "slice", w.manifest["layers"]))
        # The slice lands on the plots' axis, the second panel, with the same layer as the
        # axis-taking form.
        with_ax = slice_of(masque(f, SliceInteractable(ax2, [a, b])))
        without = slice_of(masque(f, SliceInteractable([a, b])))
        @test without == with_ax
        @test without["geometry"]["covers"] == ["lines_2", "lines_3"]
        # One plot, and keywords carry over.
        one = slice_of(masque(f, SliceInteractable(b; id = :probe, crosshair = false, covers = ())))
        @test one["id"] == "probe" && one["axis"] == with_ax["axis"]
        @test one["geometry"]["covers"] == String[]
        @test one == slice_of(masque(f, SliceInteractable(ax2, b; id = :probe, crosshair = false, covers = ())))
        # Plots on two axes name both.
        err = (@test_throws ArgumentError masque(f, SliceInteractable([a, c]))).value
        @test occursin("different axes", err.msg) && occursin("fig[1, 1]", err.msg) && occursin("fig[1, 2]", err.msg)
        # An axis placed outside the layout has no grid position to name.
        free = lines!(Axis(f; width = 100, height = 100), [0.0, 1.0], [0.0, 1.0])
        err = (@test_throws ArgumentError masque(f, SliceInteractable([a, free]))).value
        @test occursin("fig[1, 2]", err.msg) && occursin("an Axis outside the layout", err.msg)
        # Axes in nested grids are named by their full path, so two panels never read the same.
        fn = Figure()
        n1 = lines!(Axis(fn[1, 1][1, 1]), [0.0, 1.0], [0.0, 1.0])
        n2 = lines!(Axis(fn[1, 2][1, 1]), [0.0, 1.0], [0.0, 1.0])
        err = (@test_throws ArgumentError masque(fn, SliceInteractable([n1, n2]))).value
        @test occursin("fig[1, 1][1, 1]", err.msg) && occursin("fig[1, 2][1, 1]", err.msg)
        # A plot from another figure is not drawn here.
        g = Figure(); stray = lines!(Axis(g[1, 1]), [0.0, 1.0], [0.0, 1.0])
        err = (@test_throws ArgumentError masque(f, SliceInteractable(stray))).value
        @test occursin("SliceInteractable", err.msg) && occursin("not drawn", err.msg)
        # Outside `masque` there is no axis yet, and `build_manifest` says where to find one.
        _, _, ctxf = ctx_for(f)
        pending = SliceInteractable([a, b])
        @test sprint(show, pending.ax) == "(the plots' axis)"
        msg = validate(pending, ctxf)
        @test msg isa String && occursin("masque(fig", msg)
        @test_throws ArgumentError SliceInteractable(Any[])
    end

    @testset "scale, categorical" begin
        fs = Figure(); axs = Axis(fs[1, 1]; yscale = sqrt); scatter!(axs, [1.0, 2.0], [1.0, 2.0])
        _, _, ctxs = ctx_for(fs)
        msg = validate(SliceInteractable(axs; series = [(; x = [1.0, 2.0], y = [1.0, 2.0])]), ctxs)
        @test msg isa String && occursin("SliceInteractable", msg)
        fc = Figure(); axc = Axis(fc[1, 1]; dim1_conversion = Makie.CategoricalConversion())
        scatter!(axc, ["a", "b"], [1.0, 2.0])
        _, _, ctxc = ctx_for(fc)
        msgc = validate(SliceInteractable(axc; series = [(; x = [1.0, 2.0], y = [1.0, 2.0])]), ctxc)
        @test msgc isa String && occursin("SliceInteractable", msgc) && occursin("categorical", msgc)
    end

    @testset "plot constructor: lines, band, density" begin
        f = Figure()
        axp = Axis(f[1, 1])
        wide = lines!(axp, [0.0, 1.0, 2.0], [0.0, 1.0, 0.0]; label = "wide", color = :blue)
        narrow = lines!(axp, [0.0, 1.0, 2.0], [1.0, 0.0, 1.0]; label = "narrow")
        b = band!(axp, [0.0, 1.0, 2.0], zeros(3), [0.0, 2.0, 4.0])
        rng = MersenneTwister(1)
        d1 = density!(axp, randn(rng, 40); label = "kde")
        Makie.update_state_before_display!(f)
        lines_slice = SliceInteractable(axp, [wide, narrow])
        @test lines_slice.orientation === :vertical
        @test lines_slice.covers == Symbol[] && lines_slice.cover_plots == [wide, narrow]
        @test [s.id for s in lines_slice.series] == [:wide, :narrow]
        @test lines_slice.series[1].y == [0.0, 1.0, 0.0]
        band_slice = SliceInteractable(axp, b; covers = ())
        @test band_slice.covers == Symbol[]
        @test band_slice.series[1].x == [0.0, 1.0, 2.0]
        @test band_slice.series[1].y ≈ [0.0, 2.0, 4.0]
        dens = SliceInteractable(axp, d1; covers = ())
        @test dens.orientation === :vertical
        @test dens.series[1].id === :kde
        @test length(dens.series[1].x) >= 2
        @test issorted(dens.series[1].x, lt = <)
        left = lines!(axp, [2.0, 1.0, 0.0], [0.0, 1.0, 0.0])
        flipped = SliceInteractable(axp, left; covers = ())
        @test flipped.series[1].x == [0.0, 1.0, 2.0]
        @test flipped.series[1].y == [0.0, 1.0, 0.0]
        hy = [0.0, 1.0, 2.0, 3.0, 4.0]
        horiz = lines!(axp, 4 .- hy, hy)
        hs = SliceInteractable(axp, horiz; orientation = :horizontal, covers = ())
        @test hs.orientation === :horizontal
        @test hs.series[1].y == hy
        @test hs.series[1].x == 4 .- hy
        back = lines!(axp, [0.0, 1.0, 0.5], [0.0, 1.0, 0.5])
        @test_throws ArgumentError SliceInteractable(axp, back)
        sc = scatter!(axp, [1.0], [1.0])
        @test_throws ArgumentError SliceInteractable(axp, sc)
    end

    # Packed the way hitlayers ships it: vertical is (x, y), horizontal is (y, x).
    function _packed(s, orientation)
        xy = Float64[]
        if orientation === :vertical
            for k in eachindex(s.x)
                push!(xy, s.x[k], s.y[k])
            end
        else
            for k in eachindex(s.x)
                push!(xy, s.y[k], s.x[k])
            end
        end
        return xy
    end

    @testset "plot constructor: stairs holds the tread" begin
        f = Figure(); ax = Axis(f[1, 1])
        xs = [0.0, 1.0, 2.0, 3.0]
        ys = [0.0, 2.0, 1.0, 3.0]
        # :pre repeats x on the riser. The series constructor still rejects that repeat.
        @test_throws ArgumentError SliceInteractable(
            ax; series = [(; x = [0.0, 0.0, 1.0], y = [0.0, 2.0, 2.0])],
        )
        for step in (:pre, :post, :center)
            p = stairs!(ax, xs, ys; step)
            Makie.update_state_before_display!(f)
            s = SliceInteractable(ax, p)
            @test s.orientation === :vertical
            @test s.cover_plots == [p]
            xy = _packed(only(s.series), :vertical)
            if step === :pre
                # (0,0),(0,2),(1,2),(1,1),(2,1),(2,3),(3,3) — constant between risers
                @test _lerp_probe(xy, 0.5) == 2.0
                @test _lerp_probe(xy, 1.5) == 1.0
                @test _lerp_probe(xy, 2.5) == 3.0
                @test _lerp_probe(xy, 1.0) == 2.0   # riser x: the y the riser starts at
            elseif step === :post
                @test _lerp_probe(xy, 0.5) == 0.0
                @test _lerp_probe(xy, 1.5) == 2.0
                @test _lerp_probe(xy, 2.5) == 1.0
                @test _lerp_probe(xy, 1.0) == 0.0
            else
                @test _lerp_probe(xy, 0.25) == 0.0
                @test _lerp_probe(xy, 1.0) == 2.0
                @test _lerp_probe(xy, 2.0) == 1.0
                @test _lerp_probe(xy, 2.75) == 3.0
                @test _lerp_probe(xy, 0.5) == 0.0
            end
        end
    end

    @testset "plot constructor: direction=:y samples the drawn edge" begin
        f = Figure(); ax = Axis(f[1, 1])
        b = band!(ax, [0.0, 1.0, 2.0], zeros(3), [1.0, 2.0, 3.0]; direction = :y)
        wig = band!(ax, [0.0, 1.0, 2.0], zeros(3), [1.0, 3.0, 2.0]; direction = :y)
        rng = MersenneTwister(1)
        d = density!(ax, randn(rng, 40); direction = :y, label = "kde")
        Makie.update_state_before_display!(f)
        sb = SliceInteractable(ax, b; covers = ())
        @test sb.orientation === :horizontal
        @test sb.series[1].x == [1.0, 2.0, 3.0]
        @test sb.series[1].y == [0.0, 1.0, 2.0]
        @test _lerp_probe(_packed(only(sb.series), :horizontal), 1.0) == 2.0
        sw = SliceInteractable(ax, wig; covers = ())
        @test sw.orientation === :horizontal
        @test sw.series[1].y == [0.0, 1.0, 2.0]
        @test sw.series[1].x == [1.0, 3.0, 2.0]
        @test _lerp_probe(_packed(only(sw.series), :horizontal), 0.5) == 2.0
        sd = SliceInteractable(ax, d; covers = ())
        @test sd.orientation === :horizontal
        @test sd.series[1].id === :kde
        @test length(sd.series[1].y) >= 2
        @test issorted(sd.series[1].y, lt = <)
        @test _lerp_probe(_packed(only(sd.series), :horizontal), sd.series[1].y[2]) == sd.series[1].x[2]
    end
end
