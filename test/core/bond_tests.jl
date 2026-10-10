using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

@testset "Bond" begin
    @testset "element fields and indexing" begin
        pl = (; city = "Tokyo", pop = 37)
        ev = ElementEvent(:cities, 1, pl)
        @test ev.city == "Tokyo" && ev.pop == 37
        @test ev.payload === pl
        @test ev.index == 1
        xs = [10, 20, 30]
        @test xs[ev] == 10
        picks = [ev, ElementEvent(:cities, 3, (; city = "Shanghai", pop = 27))]
        @test xs[picks] == [10, 30]
        row = ElementEvent(:cities, 2, Dict(:city => "Delhi", "pop" => 32))
        @test row.city == "Delhi" && row.pop == 32
        @test_throws ArgumentError row.missing
        legend = LegendEvent(:legend, 1, (; label = "A", targets = ["scatter"]))
        @test legend.label == "A"
        @test_throws ArgumentError Base.to_index(legend)
        @test_throws ArgumentError Base.to_index(AxisEvent(:axis, 1.0, 2.0))
    end

    @testset "grid indexing" begin
        A = [10 20; 30 40]
        cell = GridCellEvent(:cells, 2, 1, nothing)
        @test A[cell] == 30
        win = GridWindowEvent(:cells, 1, 2, 1, 1, 0.0, 1.0, 0.0, 1.0)
        @test A[win] == A[1:2, 1:1]
        miss = GridWindowEvent(:cells, 1, 0, 1, 0, 0.0, 0.0, 0.0, 0.0)
        @test isempty(A[miss])
    end

    @testset "DataFrame payloads and rows" begin
        if Base.find_package("DataFrames") === nothing
            @warn "SKIPPING DataFrame bond tests — DataFrames not in this env; run via Pkg.test()"
        else
            @eval using DataFrames
            df = DataFrame(city = ["Tokyo", "Delhi", "Shanghai"], pop = [37, 32, 27])
            fig = Figure(); ax = Axis(fig[1, 1])
            pts = PointInteractable(ax, [(1.0, 1.0), (2.0, 2.0), (3.0, 3.0)]; id = :cities, payloads = df)
            @test pts.payloads[1].city == "Tokyo"
            @test pts.payloads[1] == (; city = "Tokyo", pop = 37, x = 1.0, y = 1.0)   # merged (#308)
            @test length(pts.payloads) == 3
            pick = ElementEvent(:cities, 1, pts.payloads[1])
            @test pick.city == "Tokyo"
            @test df[pick, :pop] == 37
            @test df[pick, :] == df[1, :]
            picks = [
                ElementEvent(:cities, 1, pts.payloads[1]),
                ElementEvent(:cities, 3, pts.payloads[3]),
            ]
            @test df[picks, :city] == ["Tokyo", "Shanghai"]
            @test df[picks, :] == df[[1, 3], :]
            @test_throws ArgumentError PointInteractable(
                ax, [(1.0, 1.0)]; id = :short, payloads = df,
            )
        end
    end

    @testset "show skips a payload field named index" begin
        ev = ElementEvent(:scatter, 2, (; index = 9, city = "Osaka"))
        @test ev.index == 2
        @test ev.payload.index == 9
        @test propertynames(ev) == (:layer, :index, :city, :payload)
        @test sprint(show, ev) == "ElementEvent(:scatter, 2, city = \"Osaka\")"
        ax = AxisEvent(:axis, 1.0, 2.0)
        @test occursin("x = 1.0", sprint(show, ax))
        @test !occursin("-1", sprint(show, ax))
    end

    @testset "grid cell payloads (#290)" begin
        fig = Figure(); ax = Axis(fig[1, 1])
        z = [11.0 21.0 31.0; 12.0 22.0 32.0]   # 2 columns (x) × 3 rows (y)
        hm = heatmap!(ax, 1:2, 1:3, z)
        rows = ["r1", "r2"]; cols = ["c1", "c2", "c3"]
        tip = masque"($(row), $(col)) = $(value) at $(i),$(j)"
        w = masque(fig, interactables(hm; payloads = (i, j) -> (; row = rows[i], col = cols[j]), tooltip = tip))
        L = only(l for l in w.manifest["layers"] if l["kind"] == "grid")
        # Row-major like `values`: cell (i, j) at (j - 1) * ncols + i.
        @test [p.row * p.col for p in L["payloads"]] == ["r1c1", "r2c1", "r1c2", "r2c2", "r1c3", "r2c3"]
        js = Dict("layer" => L["id"], "index" => 3, "payload" => Dict("i" => 1, "j" => 1, "value" => 22.0))
        for widget in (w, Masque.MasqueWidget("", w.manifest, 100))   # by interactable, and by stamp
            ev = commit_field(widget, js)
            @test ev isa GridCellEvent && ev.i == 2 && ev.j == 2 && ev.value == 22.0
            @test ev.row == "r2" && ev.col == "c2" && ev.payload == (; row = "r2", col = "c2")
            @test z[ev] == 22.0
        end
        ev = commit_field(w, js)
        @test propertynames(ev) == (:layer, :i, :j, :value, :row, :col, :payload)
        @test sprint(show, ev) == "GridCellEvent(:$(L["id"]), i = 2, j = 2, value = 22.0, payload = (row = \"r2\", col = \"c2\"))"
        @test_throws ArgumentError ev.nope
        # A cell outside the grid is an error, not a wrong payload.
        @test_throws ArgumentError commit_field(w, Dict("layer" => L["id"], "index" => 0, "payload" => Dict("i" => 5, "j" => 0)))
        @test_throws ArgumentError AxisEvent(:axis, 1.0, 2.0).row   # no payload to forward to

        # A matrix the same shape as the values gives the same layout.
        m = GridInteractable(ax, hm; payloads = [rows[i] * cols[j] for i in 1:2, j in 1:3])
        @test m.payloads == Any["r1c1", "r2c1", "r1c2", "r2c2", "r1c3", "r2c3"]
        @test_throws ArgumentError GridInteractable(ax, hm; payloads = ones(3, 2))
        @test_throws ArgumentError GridInteractable(ax, hm; payloads = ["a", "b"])
        # The positional form from before payloads still builds, with none.
        @test isempty(GridInteractable(ax, m.xedges, m.yedges, m.values, :c, nothing, nothing).payloads)
        # A template field that is neither a payload field nor i/j/value still fails the build.
        bad = GridInteractable(ax, hm; payloads = (i, j) -> (; row = i), tooltip = masque"$(nope)")
        @test_throws ArgumentError masque(fig, bad)

        # Without payloads, a cell is unchanged: no payload, no forwarding.
        plain = commit_field(masque(fig), Dict("layer" => "cells", "index" => 0, "payload" => Dict("i" => 0, "j" => 0, "value" => 11.0)))
        @test plain.payload === nothing
        @test propertynames(plain) == (:layer, :i, :j, :value)
        @test sprint(show, plain) == "GridCellEvent(:cells, i = 1, j = 1, value = 11.0)"
        @test_throws ArgumentError plain.row
        @test GridCellEvent(:cells, 1, 2, 3.0) == GridCellEvent(:cells, 1, 2, 3.0, nothing)
    end

    @testset "legend click is a LegendEvent" begin
        fig = Figure(); ax = Axis(fig[1, 1])
        lines!(ax, 1:3; label = "trend")
        axislegend(ax)
        w = masque(fig)
        # The line is hover-only by default; the legend takes clicks, so it is the one field.
        @test w.manifest["fields"] == ["legend"]
        ev = commit_field(w, Dict("layer" => "legend", "index" => 0))
        @test ev isa LegendEvent
        @test ev.layer === :legend && ev.index == 1 && ev.label == "trend"
        @test_throws ArgumentError Base.to_index(ev)
        bare = Masque.MasqueWidget("", w.manifest, 100)
        stamped = commit_field(bare, Dict("layer" => "legend", "index" => 0))
        @test stamped isa LegendEvent && stamped.index == 1 && stamped.label == "trend"
    end

    @testset "a categorical axis commits the category's position and label" begin
        # The overlay sends the category label on a categorical dimension (geometry.ts `mapAxis`).
        # It used to reach Float64(::String) and throw, so `pick` never got a value.
        fig = Figure()
        ax = Axis(fig[1, 1]; dim1_conversion = Makie.CategoricalConversion())
        scatter!(ax, ["a", "b", "c"], [1.0, 2.0, 3.0])
        w = masque(fig, AxisInteractable(ax); auto = false)
        id = only(w.manifest["layers"])["id"]
        ev = commit_field(w, Dict("layer" => id, "index" => -1, "payload" => Dict("x" => "b", "y" => 2.0)))
        @test ev isa AxisEvent
        @test ev.x == 2.0 && ev.xcat == "b"
        @test ev.y == 2.0 && ev.ycat === nothing
        @test sprint(show, ev) == "AxisEvent(:$id, x = 2.0, y = 2.0, xcat = \"b\")"
        @test_throws ArgumentError commit_field(w, Dict("layer" => id, "index" => -1, "payload" => Dict("x" => "z", "y" => 2.0)))
        @test_throws ArgumentError commit_field(w, Dict("layer" => id, "index" => -1, "payload" => Dict("x" => 1.0, "y" => "b")))
        # A numeric click on the same axis is unchanged.
        num = commit_field(w, Dict("layer" => id, "index" => -1, "payload" => Dict("x" => 1.2, "y" => 2.0)))
        @test num.x == 1.2 && num.xcat === nothing

        vt = masque(fig, ThresholdInteractable(ax; orientation = :vertical, value = 2.0); auto = false)
        tev = commit_field(vt, Dict("layer" => "threshold", "index" => -1, "payload" => "c"))
        @test tev isa ThresholdEvent && tev.value == 3.0 && tev.category == "c"
        # Passing the event back restores the line at that category.
        @test Masque._threshold_value(tev) == 3.0
        ht = masque(fig, ThresholdInteractable(ax; orientation = :horizontal, value = 2.0); auto = false)
        hev = commit_field(ht, Dict("layer" => "threshold", "index" => -1, "payload" => 1.5))
        @test hev.value == 1.5 && hev.category === nothing
        @test sprint(show, hev) == "ThresholdEvent(:threshold, value = 1.5)"
        @test_throws ArgumentError commit_field(ht, Dict("layer" => "threshold", "index" => -1, "payload" => "c"))
    end

    @testset "FunctionInteractable follows the layer kind" begin
        fig = Figure(); ax = Axis(fig[1, 1])
        scatter!(ax, [1.0], [1.0])
        axis = ctx -> first(keys(ctx.transforms))
        el = masque(
            fig, FunctionInteractable(
                ctx -> [
                    HitLayer(:el, :circles, Float32[1, 1, 4], Any[(; v = "a")], axis(ctx), (:click,)),
                ]
            );
            auto = false,
        )
        got = commit_field(el, Dict("layer" => "el", "index" => 0))
        @test got isa ElementEvent && got.index == 1 && got.v == "a"
        grid = masque(
            fig, FunctionInteractable(
                ctx -> [
                    HitLayer(:g, :grid, Dict{String, Any}(), Any[], axis(ctx), (:click,)),
                ]
            );
            auto = false,
        )
        cell = commit_field(grid, Dict("layer" => "g", "index" => -1, "payload" => Dict("i" => 1, "j" => 0, "value" => 12)))
        @test cell isa GridCellEvent && cell.i == 2 && cell.j == 1 && cell.value == 12
        axisw = masque(
            fig, FunctionInteractable(
                ctx -> [
                    HitLayer(:ax, :axis, Any[], Any[], axis(ctx), (:click,)),
                ]
            );
            auto = false,
        )
        aev = commit_field(axisw, Dict("layer" => "ax", "index" => -1, "payload" => Dict("x" => 1.5, "y" => 2.5)))
        @test aev isa AxisEvent && aev.x == 1.5 && aev.y == 2.5
        thr = masque(
            fig, FunctionInteractable(
                ctx -> [
                    HitLayer(:thr, :threshold, Any[], Any[], axis(ctx), (:drag,)),
                ]
            );
            auto = false,
        )
        tev = commit_field(thr, Dict("layer" => "thr", "index" => 0, "payload" => 3.25))
        @test tev isa ThresholdEvent && tev.value == 3.25
        roi = masque(
            fig, FunctionInteractable(
                ctx -> [
                    HitLayer(:box, :roi, Any[], Any[], axis(ctx), (:drag,)),
                ]
            );
            auto = false,
        )
        bev = commit_field(
            roi, Dict(
                "layer" => "box", "index" => 0,
                "payload" => Dict("xmin" => 0.0, "xmax" => 1.0, "ymin" => 2.0, "ymax" => 3.0),
            )
        )
        @test bev isa BoundsEvent && (bev.xmin, bev.xmax, bev.ymin, bev.ymax) == (0.0, 1.0, 2.0, 3.0)
        view = masque(
            fig, FunctionInteractable(
                ctx -> [
                    HitLayer(:view, :view, Any[], Any[], axis(ctx), (:drag,)),
                ]
            );
            auto = false,
        )
        # A view has no field, so the browser can't name it.
        @test isempty(view.manifest["fields"])
        @test_throws ArgumentError commit_field(view, Dict("layer" => "view", "index" => -1, "payload" => nothing))
    end

    @testset "the value has one field per layer that commits (#335)" begin
        fig = Figure(size = (400, 300)); ax = Axis(fig[1, 1]; limits = (0, 10, 0, 10))
        s1 = scatter!(ax, [1.0, 2.0], [1.0, 2.0])
        s2 = scatter!(ax, [5.0, 6.0], [5.0, 6.0])
        ln = lines!(ax, [1.0, 9.0], [9.0, 1.0])
        tv = Masque.APD.Bonds.transform_value
        iv = Masque.APD.Bonds.initial_value
        layer(w, id) = only(filter(l -> l["id"] == id, w.manifest["layers"]))
        env(id, k) = Dict{String, Any}("layer" => id, "index" => k)

        # Every plot that takes clicks, in layer order: the plot drawn last comes first, as it
        # wins the hover. A default line is hover-only.
        w = masque(fig)
        @test w.manifest["fields"] == ["scatter_2", "scatter"]
        @test !haskey(w.manifest, "bare")
        @test layer(w, "lines")["events"] == ["hover"]
        @test w.manifest["initial"] == Dict("scatter" => nothing, "scatter_2" => nothing)
        @test iv(w) === (scatter_2 = nothing, scatter = nothing)
        # `nothing` from the browser is the starting value.
        @test tv(w, nothing) === iv(w)
        # Each field holds its own pick: setting one leaves the other.
        both = tv(w, Dict("scatter" => env("scatter", 0), "scatter_2" => env("scatter_2", 1)))
        @test keys(both) == (:scatter_2, :scatter)
        @test both.scatter.layer === :scatter && both.scatter.index == 1
        @test both.scatter_2.layer === :scatter_2 && both.scatter_2.index == 2
        one = tv(w, Dict("scatter" => nothing, "scatter_2" => env("scatter_2", 0)))
        @test one.scatter === nothing && one.scatter_2.index == 1
        # A key that is not a field, or an envelope from another layer, is refused: the old
        # single-envelope wire value included.
        @test_throws ArgumentError tv(w, Dict("lines" => env("lines", 0)))
        @test_throws ArgumentError tv(w, env("scatter", 0))
        @test_throws ArgumentError tv(w, Dict("scatter" => env("scatter_2", 0)))
        @test_throws ArgumentError tv(w, [env("scatter", 0)])

        # One entry gives that field's bare value.
        wb = masque(fig; bind = s2)
        @test wb.manifest["fields"] == ["scatter_2"] && wb.manifest["bare"] === true
        @test iv(wb) === nothing
        @test layer(wb, "scatter")["events"] == ["hover"]   # left out of `bind`: hover only
        bev = tv(wb, Dict("scatter_2" => env("scatter_2", 1)))
        @test bev isa ElementEvent && bev.layer === :scatter_2 && bev.index == 2
        @test masque(fig; bind = :scatter_2).manifest == wb.manifest

        # A tuple keeps those fields, in its order; a one-element tuple stays a NamedTuple.
        wt = masque(fig; bind = (s1, :scatter_2))
        @test wt.manifest["fields"] == ["scatter", "scatter_2"]
        @test keys(iv(wt)) == (:scatter, :scatter_2)
        @test iv(masque(fig; bind = (s1,))) === (scatter = nothing,)

        # A NamedTuple names its fields, and the events carry the names.
        wn = masque(fig; bind = (left = s1, right = s2))
        @test wn.manifest["fields"] == ["left", "right"]
        @test commit_field(wn, env("right", 0)).layer === :right

        # Binding a line makes it clickable.
        wl = masque(fig; bind = (fit = ln,))
        @test wl.manifest["fields"] == ["fit"]
        @test "click" in layer(wl, "fit")["events"]

        # A NamedTuple argument names interactables; a control starts at its own value.
        thr = ThresholdInteractable(ax; value = 4.0)
        wc = masque(fig, (cutoff = thr,))
        @test wc.manifest["fields"] == ["scatter_2", "scatter", "cutoff"]
        @test iv(wc).cutoff == ThresholdEvent(:cutoff, 4.0, nothing)
        @test iv(masque(fig, (cutoff = thr,); bind = :cutoff)) == ThresholdEvent(:cutoff, 4.0, nothing)

        # An object given two names, or a name where `bind` wants an object, is an error.
        @test_throws ArgumentError masque(fig, (a = interactables(s1),); bind = (b = s1,))
        @test_throws ArgumentError masque(fig, (cutoff = ThresholdInteractable(ax; value = 4.0, id = :t),))
        @test_throws ArgumentError masque(fig; bind = (a = :scatter,))
        # A plot in a NamedTuple argument must go through `interactables`.
        @test_throws ArgumentError masque(fig, (a = s1,))
        # A name that isn't a layer, a layer that takes no value, or one listed twice.
        @test_throws ArgumentError masque(fig; bind = :nope)
        @test_throws ArgumentError masque(fig, ViewInteractable(ax; id = :pan); bind = :pan)
        @test_throws ArgumentError masque(fig; bind = (s1, :scatter))
    end

    @testset "a name keeps the id it names, even a constructor's default (#335)" begin
        fig = Figure(size = (400, 300)); ax = Axis(fig[1, 1]; limits = (0, 10, 0, 10))
        s1 = scatter!(ax, [1.0, 2.0], [1.0, 2.0])
        s2 = scatter!(ax, [5.0, 6.0], [5.0, 6.0])
        iv = Masque.APD.Bonds.initial_value
        t1 = ThresholdInteractable(ax; value = 1.0)
        t2 = ThresholdInteractable(ax; value = 2.0, orientation = :vertical)
        # The unnamed threshold moves off the default id; the named one keeps it.
        w = masque(fig, t1; bind = (threshold = t2,))
        @test w.manifest["fields"] == ["threshold"]
        @test iv(w).threshold.value == 2.0
        v = iv(masque(fig, t1, (threshold = t2,); bind = (:threshold, :threshold_2)))
        @test v.threshold.value == 2.0 && v.threshold_2.value == 1.0
        r1 = ROIInteractable(ax; bounds = (1.0, 2.0, 1.0, 2.0))
        r2 = ROIInteractable(ax; bounds = (3.0, 4.0, 3.0, 4.0))
        @test iv(masque(fig, r1; bind = (roi = r2,))).roi.xmin == 3.0
        # A plot's default id is taken by the plot: naming another plot that says so.
        err = try
            masque(fig; bind = (scatter = s2,)); nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin("the name :scatter is already the id", err.msg)
    end

    @testset "bind and selected= errors name the fields (#335)" begin
        fig = Figure(size = (400, 300)); ax = Axis(fig[1, 1]; limits = (0, 10, 0, 10))
        s1 = scatter!(ax, [1.0, 2.0], [1.0, 2.0])
        s2 = scatter!(ax, [5.0, 6.0], [5.0, 6.0])
        msg(f) = try
            f(); ""
        catch e
            sprint(showerror, e)
        end
        @test occursin("isn't in bind (fields: :left)", msg(() -> masque(fig; bind = (left = s1,), selected = (right = [1],))))
        @test occursin("as a tuple", msg(() -> masque(fig; bind = [s1, s2])))
        # One object that builds several layers gives its parts.
        reg = RegionInteractable(ax, [(:circle, (1.0, 1.0), 0.5), (:rect, (5.0, 5.0), 1.0, 1.0)]; id = :cells)
        v = Masque.APD.Bonds.initial_value(masque(fig, reg; bind = reg))
        @test v === (circles = nothing, rects = nothing)
    end

    @testset "a bound line picks its nearest data point (#335)" begin
        fig = Figure(size = (400, 300)); ax = Axis(fig[1, 1]; limits = (0, 10, 0, 10))
        xs, ys = [1.0, 5.0, 9.0], [9.0, 2.0, 1.0]
        ln = lines!(ax, xs, ys)
        se = series!(ax, [1.0, 2.0, 3.0], [1.0 2.0 3.0; 4.0 5.0 6.0])
        st = stairs!(ax, [1.0, 2.0, 3.0], [3.0, 4.0, 5.0])
        iv = Masque.APD.Bonds.initial_value
        pick(id, k, s) = Dict{String, Any}("layer" => id, "index" => k, "sample" => s)

        w = masque(fig; bind = (fit = ln, many = se, steps = st))
        ev = commit_field(w, pick("fit", 0, 1))
        @test ev isa ElementEvent && ev.layer === :fit && ev.index == 2
        @test ev.line == 1 && ev.x == 5.0 && ev.y == 2.0
        @test xs[ev] == 5.0 && ys[ev] == 2.0
        @test !(:index in keys(ev.payload))
        @test repr(ev) == "ElementEvent(:fit, 2, line = 1, x = 5.0, y = 2.0)"
        # Points ship as Float32; the event reads back what was plotted, not its widened bits.
        @test Masque._coord(0.4f0) === 0.4 && isnan(Masque._coord(NaN32))
        # The pick reads x and y at full precision from the Julia side, so a time axis in
        # seconds still names the sample it picked (Float32 spacing there is 128).
        t0 = 1.7e9
        fb = Figure(size = (400, 300)); ab = Axis(fb[1, 1])
        lb = lines!(ab, [t0, t0 + 1, t0 + 2], [0.1, 0.2, 0.3])
        ev = commit_field(masque(fb; bind = (t = lb,)), pick("t", 0, 1))
        @test ev.x === t0 + 1 && ev.y === 0.2
        si = SegmentInteractable(ab, [Point2(t0, 0.1), Point2(t0 + 3, 0.2)]; unit = :line, id = :manual)
        ev = commit_field(masque(fb, si; bind = :manual), pick("manual", 0, 1))
        @test ev.x === t0 + 3 && ev.y === 0.2
        # A plot of several lines says which one, and keeps each line's own payload.
        ev = commit_field(w, pick("many", 1, 2))
        @test ev.index == 3 && ev.line == 2 && ev.x == 3.0 && ev.y == 6.0 && ev.label == "series 2"
        # A staircase picks its own samples, not the corners it adds between them.
        ev = commit_field(w, pick("steps", 0, 1))
        @test ev.index == 2 && ev.x == 2.0 && ev.y == 4.0
        @test_throws ArgumentError commit_field(w, pick("fit", 0, 3))
        @test_throws ArgumentError commit_field(w, pick("many", 2, 0))
        # A commit without a point is the whole line, as from a line with no points to pick.
        @test commit_field(w, Dict{String, Any}("layer" => "fit", "index" => 0)).index == 1

        # `selected=` names a point on the line, the way the pick does.
        ws = masque(fig; bind = (fit = ln,), selected = (fit = [3],))
        @test ws.manifest["initial"]["fit"] == Dict("layer" => "fit", "index" => 0, "sample" => 2)
        @test iv(ws).fit.index == 3 && iv(ws).fit.x == 9.0
        @test iv(masque(fig; bind = (fit = ln,), selected = (fit = commit_field(w, pick("fit", 0, 0)),))).fit.index == 1
        @test_throws ArgumentError masque(fig; bind = (fit = ln,), selected = (fit = [4],))
        err = try
            masque(fig; bind = (many = se,), selected = (many = [1],)); nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin(":many draws 2 lines", err.msg)

        # Hand-built payloads: a Dict keeps its keys but `index`; anything else rides as `value`.
        @test Masque._point_payload(Dict(:index => 1, :tag => "a"), 2, 0.5, 1.5) == Dict(:line => 2, :x => 0.5, :y => 1.5, :tag => "a")
        @test Masque._point_payload("note", 1, 0.5, 1.5) == (; line = 1, x = 0.5, y = 1.5, value = "note")
        @test_throws ArgumentError Masque._line_point(ElementEvent(:fit, 1, (; index = 1)), Dict{String, Any}(), 1)

        # A recipe's line part picks a point too.
        sl = scatterlines!(ax, [6.0, 7.0], [6.0, 7.0])
        tv = Masque.APD.Bonds.transform_value
        ev = tv(masque(fig; bind = (trend = sl,)), Dict("trend.line" => pick("trend.line", 0, 1))).trend.line
        @test ev.layer === :trend && ev.part === (:line,) && ev.index == 2 && ev.x == 7.0

        # With `select = :many`, each pick is a point on the line, and `selected=` seeds points.
        wm = masque(fig, interactables(ln; select = :many); bind = :lines, selected = (lines = [1, 3],))
        @test wm.manifest["initial"]["lines"]["items"] == Any[
            Dict("layer" => "lines", "index" => 0, "sample" => 0), Dict("layer" => "lines", "index" => 0, "sample" => 2),
        ]
        @test [(e.index, e.x) for e in iv(wm)] == [(1, 1.0), (3, 9.0)]
        v = tv(wm, Dict("lines" => Dict("items" => [pick("lines", 0, 1)])))
        @test only(v).index == 2 && only(v).line == 1 && only(v).y == 2.0

        # A line on an Axis3 has no points to pick: its pick stays the whole line.
        f3 = Figure(size = (400, 300)); a3 = Axis3(f3[1, 1])
        l3 = lines!(a3, [0.0, 1.0, 2.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0])
        w3 = masque(f3; bind = (path = l3,))
        @test !haskey(only(w3.manifest["layers"]), "points")
        @test commit_field(w3, Dict{String, Any}("layer" => "path", "index" => 0)).index == 1
        @test iv(masque(f3; bind = (path = l3,), selected = (path = [1],))).path.index == 1
    end

    @testset "recipes nest: parts under the plot's name (#335)" begin
        fig = Figure(size = (400, 300)); ax = Axis(fig[1, 1]; limits = (0, 10, 0, 10))
        sl = scatterlines!(ax, [1.0, 2.0, 3.0], [1.0, 2.0, 3.0])
        st = stem!(ax, [5.0, 6.0], [5.0, 6.0])
        sc = scatter!(ax, [8.0], [8.0])
        iv = Masque.APD.Bonds.initial_value
        tv = Masque.APD.Bonds.transform_value
        w = masque(fig; bind = (fit = sl, spikes = st, dots = sc))
        @test w.manifest["fields"] == ["fit.points", "fit.line", "spikes.points", "spikes.stems", "dots"]
        @test iv(w) === (fit = (points = nothing, line = nothing), spikes = (points = nothing, stems = nothing), dots = nothing)
        # The wire keeps flat names; the value nests them.
        v = tv(w, Dict("spikes.stems" => Dict("layer" => "spikes.stems", "index" => 1)))
        ev = v.spikes.stems
        @test ev.layer === :spikes && ev.part === (:stems,) && ev.index == 2
        @test :part in propertynames(ev)
        @test occursin("part = (:stems,)", repr(ev))
        @test v.dots === nothing
        plain = tv(w, Dict("dots" => Dict("layer" => "dots", "index" => 0))).dots
        @test plain.layer === :dots && plain.part === () && !(:part in propertynames(plain))
        # The plot's name in `bind` keeps all its parts; a part's own name keeps that part.
        @test masque(fig; bind = (fit = sl, spikes = st)).manifest["fields"] == ["fit.points", "fit.line", "spikes.points", "spikes.stems"]
        @test masque(fig, (spikes = interactables(st),); bind = (:spikes,)).manifest["fields"] == ["spikes.points", "spikes.stems"]
        @test masque(fig, (spikes = interactables(st),); bind = (Symbol("spikes.stems"),)).manifest["fields"] == ["spikes.stems"]
        # One recipe in `bind` gives its parts, bare, and `selected=` names them the same way.
        @test iv(masque(fig; bind = st)) === (points = nothing, stems = nothing)
        @test iv(masque(fig; bind = st, selected = (stems = [2],))).stems.index == 2
        @test iv(masque(fig; bind = st, selected = (stem = (stems = [2],),))).stems.index == 2
        # selected= nests the same way, and a recipe's name alone is not enough.
        ws = masque(fig; bind = (fit = sl, spikes = st), selected = (spikes = (stems = [2],),))
        @test iv(ws).spikes.stems.index == 2 && iv(ws).spikes.points === nothing
        ws = masque(fig; bind = (fit = sl, spikes = st), selected = Dict(Symbol("spikes.points") => [1]))
        @test iv(ws).spikes.points.index == 1
        err = try
            masque(fig; bind = (fit = sl, spikes = st), selected = (spikes = [1],)); nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin("has parts :spikes.points, :spikes.stems", err.msg) &&
            occursin("`spikes = (points = …,)`", err.msg)
    end

    @testset "bind and a box with selects (#335)" begin
        fig = Figure(size = (400, 300)); ax = Axis(fig[1, 1]; limits = (0, 10, 0, 10))
        pts = scatter!(ax, [1.0, 5.0, 9.0], [1.0, 5.0, 9.0])
        iv = Masque.APD.Bonds.initial_value
        box = ROIInteractable(ax; bounds = (4.0, 6.0, 4.0, 6.0), selects = pts)
        # The box alone: its bounds, and its target is not a field.
        wb = masque(fig, box; bind = box)
        @test wb.manifest["fields"] == ["roi"] && !haskey(wb.manifest["initial"], "scatter")
        @test iv(wb) isa BoundsEvent
        # The target alone: what the box holds.
        wt = masque(fig, box; bind = pts)
        @test wt.manifest["fields"] == ["scatter"]
        @test [e.index for e in iv(wt)] == [2]
        # A box named only in `bind` is added to the call.
        wa = masque(fig; bind = (box, pts))
        @test wa.manifest["fields"] == ["roi", "scatter"]
        @test iv(wa).roi.xmin == 4.0 && [e.index for e in iv(wa).scatter] == [2]
    end

    @testset "select = :many holds a vector of picks (#335)" begin
        fig = Figure(size = (400, 300)); ax = Axis(fig[1, 1]; limits = (0, 10, 0, 10))
        sc = scatter!(ax, [1.0, 5.0, 9.0], [1.0, 5.0, 9.0]; label = "pts")
        iv = Masque.APD.Bonds.initial_value
        tv = Masque.APD.Bonds.transform_value
        w = masque(fig, interactables(sc; select = :many))
        L = only(l for l in w.manifest["layers"] if l["id"] == "scatter")
        @test L["many"] === true
        @test w.manifest["initial"]["scatter"] == Dict("items" => Any[])
        @test iv(w) == (scatter = ElementEvent[],)
        v = tv(w, Dict("scatter" => Dict("items" => [Dict("layer" => "scatter", "index" => 2), Dict("layer" => "scatter", "index" => 0)])))
        @test [e.index for e in v.scatter] == [3, 1]
        @test v.scatter isa Vector{ElementEvent}
        # selected= takes several indices for a `many` field, and one still works.
        @test [e.index for e in iv(masque(fig, interactables(sc; select = :many); selected = (scatter = [1, 3],))).scatter] == [1, 3]
        @test [e.index for e in iv(masque(fig, interactables(sc; select = :many); selected = (scatter = 2,))).scatter] == [2]
        # A one-pick field still refuses several, and names the fix.
        err = try
            masque(fig; selected = (scatter = [1, 2],)); nothing
        catch e
            e
        end
        @test err isa ArgumentError && occursin("select = :many", err.msg)
        # Constructors take it too, and a recipe's every part follows `interactables(plot; select)`.
        pts = PointInteractable(ax, [(1.0, 1.0), (2.0, 2.0)]; select = :many, id = :mine)
        @test Masque.select_mode(pts) === :many
        @test iv(masque(fig, pts; bind = pts)) == ElementEvent[]
        st = stem!(ax, [5.0], [5.0])
        @test iv(masque(fig; bind = interactables(st; select = :many))) == (points = ElementEvent[], stems = ElementEvent[])
        # A legend and an axis hold vectors of their own events.
        axislegend(ax)
        wl = masque(fig, LegendInteractable(fig.content[end]; select = :many); bind = (:legend,))
        @test iv(wl) == (legend = LegendEvent[],)
        @test tv(wl, Dict("legend" => Dict("items" => [Dict("layer" => "legend", "index" => 0)]))).legend[1].index == 1
        wa = masque(fig, AxisInteractable(ax; select = :many); bind = (:axis,))
        @test iv(wa) == (axis = AxisEvent[],)
        va = tv(wa, Dict("axis" => Dict("items" => [Dict("layer" => "axis", "index" => 0, "payload" => Dict("x" => 2.0, "y" => 3.0))])))
        @test only(va.axis).x == 2.0
        # Bad values name the problem.
        @test_throws "select must be :one or :many" PointInteractable(ax, [(1.0, 1.0)]; select = :all)
        @test_throws "a colorbar pick is one value; select = :many isn't supported" interactables(
            Colorbar(fig[1, 2], heatmap!(Axis(fig[2, 1]), rand(2, 2))); select = :many,
        )
        @test_throws ArgumentError tv(w, Dict("scatter" => Dict("layer" => "scatter", "index" => 0)))
        # A pick named twice is held once.
        @test [e.index for e in iv(masque(fig, interactables(sc; select = :many); selected = (scatter = [1, 1, 3],))).scatter] == [1, 3]
        # `select` on an interactables(plot) request carries through to the built layers.
        @test iv(masque(fig, interactables(only(interactables(sc)); select = :many))).scatter == ElementEvent[]
        # The positional constructors from before `select` still build a one-pick interactable.
        leg = fig.content[findfirst(c -> c isa Legend, fig.content)]
        for i in (
                pts, TextInteractable(ax, text!(ax, [(1.0, 1.0)]; text = ["a"])),
                PolygonInteractable(ax, [[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0)]]), AxisInteractable(ax),
                LegendInteractable(leg), RegionInteractable(ax, [(:rect, (1.0, 1.0), 1.0, 1.0)]),
            )
            T = typeof(i)
            old = T((getfield(i, f) for f in fieldnames(T)[1:(end - 1)])...)
            @test Masque.select_mode(old) === :one
        end
        # Cells don't take several picks yet, and say so.
        hm = heatmap!(Axis(fig[3, 1]), [1 2; 3 4])
        @test_throws "heatmap, image and surface cells don't take several picks yet" masque(fig, interactables(hm; select = :many))
    end

    @testset "select = :many on a recipe's parts and a box's target (#335)" begin
        fig = Figure(size = (400, 300)); ax = Axis(fig[1, 1]; limits = (0, 10, 0, 10))
        iv = Masque.APD.Bonds.initial_value
        tv = Masque.APD.Bonds.transform_value
        st = stem!(ax, [2.0, 5.0], [3.0, 6.0])
        w = masque(fig, interactables(st; select = :many); bind = (stem = st,))
        @test all(get(l, "many", false) for l in w.manifest["layers"] if startswith(l["id"], "stem."))
        v = tv(w, Dict("stem.points" => Dict("items" => [Dict("layer" => "stem.points", "index" => 1)]), "stem.stems" => Dict("items" => [])))
        @test only(v.stem.points).index == 2 && only(v.stem.points).part == (:points,)
        @test v.stem.stems == ElementEvent[]
        # A box's target stays a brush: no `many` flag, and its value is what the box holds.
        pts = scatter!(ax, [1.0, 5.0, 9.0], [1.0, 5.0, 9.0])
        box = ROIInteractable(ax; bounds = (4.0, 6.0, 4.0, 6.0), selects = pts)
        wb = masque(fig, interactables(pts; select = :many), box; bind = (box, pts))
        L = only(l for l in wb.manifest["layers"] if l["id"] == "scatter")
        @test !haskey(L, "many") && haskey(L, "brush")
        @test [e.index for e in iv(wb).scatter] == [2]
    end
end
