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
        tv = Masque.APD.Bonds.transform_value
        tip = masque"($(row), $(col)) = $(value) at $(i),$(j)"
        w = masque(fig, interactables(hm; payloads = (i, j) -> (; row = rows[i], col = cols[j]), tooltip = tip))
        L = only(l for l in w.manifest["layers"] if l["kind"] == "grid")
        # Row-major like `values`: cell (i, j) at (j - 1) * ncols + i.
        @test [p.row * p.col for p in L["payloads"]] == ["r1c1", "r2c1", "r1c2", "r2c2", "r1c3", "r2c3"]
        js = Dict("layer" => L["id"], "index" => 3, "payload" => Dict("i" => 1, "j" => 1, "value" => 22.0))
        for widget in (w, Masque.MasqueWidget("", w.manifest, 100))   # by interactable, and by stamp
            ev = tv(widget, js)
            @test ev isa GridCellEvent && ev.i == 2 && ev.j == 2 && ev.value == 22.0
            @test ev.row == "r2" && ev.col == "c2" && ev.payload == (; row = "r2", col = "c2")
            @test z[ev] == 22.0
        end
        ev = tv(w, js)
        @test propertynames(ev) == (:layer, :i, :j, :value, :row, :col, :payload)
        @test sprint(show, ev) == "GridCellEvent(:$(L["id"]), i = 2, j = 2, value = 22.0, payload = (row = \"r2\", col = \"c2\"))"
        @test_throws ArgumentError ev.nope

        # A matrix the same shape as the values gives the same layout.
        m = GridInteractable(ax, hm; payloads = [rows[i] * cols[j] for i in 1:2, j in 1:3])
        @test m.payloads == Any["r1c1", "r2c1", "r1c2", "r2c2", "r1c3", "r2c3"]
        @test_throws ArgumentError GridInteractable(ax, hm; payloads = ones(3, 2))
        @test_throws ArgumentError GridInteractable(ax, hm; payloads = ["a", "b"])
        # A template field that is neither a payload field nor i/j/value still fails the build.
        bad = GridInteractable(ax, hm; payloads = (i, j) -> (; row = i), tooltip = masque"$(nope)")
        @test_throws ArgumentError masque(fig, bad)

        # Without payloads, a cell is unchanged: no payload, no forwarding.
        plain = tv(masque(fig), Dict("layer" => "heatmap", "index" => 0, "payload" => Dict("i" => 0, "j" => 0, "value" => 11.0)))
        @test plain.payload === nothing
        @test propertynames(plain) == (:layer, :i, :j, :value)
        @test sprint(show, plain) == "GridCellEvent(:heatmap, i = 1, j = 1, value = 11.0)"
        @test_throws ArgumentError plain.row
        @test GridCellEvent(:cells, 1, 2, 3.0) == GridCellEvent(:cells, 1, 2, 3.0, nothing)
    end

    @testset "legend click is a LegendEvent" begin
        fig = Figure(); ax = Axis(fig[1, 1])
        lines!(ax, 1:3; label = "trend")
        axislegend(ax)
        w = masque(fig)
        tv = Masque.APD.Bonds.transform_value
        ev = tv(w, Dict("layer" => "legend", "index" => 0))
        @test ev isa LegendEvent
        @test ev.layer === :legend && ev.index == 1 && ev.label == "trend"
        @test_throws ArgumentError Base.to_index(ev)
        bare = Masque.MasqueWidget("", w.manifest, 100)
        stamped = tv(bare, Dict("layer" => "legend", "index" => 0))
        @test stamped isa LegendEvent && stamped.index == 1 && stamped.label == "trend"
    end

    @testset "a categorical axis commits the category's position and label" begin
        # The overlay sends the category label on a categorical dimension (geometry.ts `mapAxis`).
        # It used to reach Float64(::String) and throw, so `pick` never got a value.
        fig = Figure()
        ax = Axis(fig[1, 1]; dim1_conversion = Makie.CategoricalConversion())
        scatter!(ax, ["a", "b", "c"], [1.0, 2.0, 3.0])
        tv = Masque.APD.Bonds.transform_value
        w = masque(fig, AxisInteractable(ax); auto = false)
        id = only(w.manifest["layers"])["id"]
        ev = tv(w, Dict("layer" => id, "index" => -1, "payload" => Dict("x" => "b", "y" => 2.0)))
        @test ev isa AxisEvent
        @test ev.x == 2.0 && ev.xcat == "b"
        @test ev.y == 2.0 && ev.ycat === nothing
        @test sprint(show, ev) == "AxisEvent(:$id, x = 2.0, y = 2.0, xcat = \"b\")"
        @test_throws ArgumentError tv(w, Dict("layer" => id, "index" => -1, "payload" => Dict("x" => "z", "y" => 2.0)))
        @test_throws ArgumentError tv(w, Dict("layer" => id, "index" => -1, "payload" => Dict("x" => 1.0, "y" => "b")))
        # A numeric click on the same axis is unchanged.
        num = tv(w, Dict("layer" => id, "index" => -1, "payload" => Dict("x" => 1.2, "y" => 2.0)))
        @test num.x == 1.2 && num.xcat === nothing

        vt = masque(fig, ThresholdInteractable(ax; orientation = :vertical, value = 2.0); auto = false)
        tev = tv(vt, Dict("layer" => "threshold", "index" => -1, "payload" => "c"))
        @test tev isa ThresholdEvent && tev.value == 3.0 && tev.category == "c"
        # Passing the event back restores the line at that category.
        @test Masque._threshold_value(tev) == 3.0
        ht = masque(fig, ThresholdInteractable(ax; orientation = :horizontal, value = 2.0); auto = false)
        hev = tv(ht, Dict("layer" => "threshold", "index" => -1, "payload" => 1.5))
        @test hev.value == 1.5 && hev.category === nothing
        @test sprint(show, hev) == "ThresholdEvent(:threshold, value = 1.5)"
        @test_throws ArgumentError tv(ht, Dict("layer" => "threshold", "index" => -1, "payload" => "c"))
    end

    @testset "FunctionInteractable follows the layer kind" begin
        fig = Figure(); ax = Axis(fig[1, 1])
        scatter!(ax, [1.0], [1.0])
        axis = ctx -> first(keys(ctx.transforms))
        tv = Masque.APD.Bonds.transform_value
        el = masque(
            fig, FunctionInteractable(
                ctx -> [
                    HitLayer(:el, :circles, Float32[1, 1, 4], Any[(; v = "a")], axis(ctx), (:click,)),
                ]
            );
            auto = false,
        )
        got = tv(el, Dict("layer" => "el", "index" => 0))
        @test got isa ElementEvent && got.index == 1 && got.v == "a"
        grid = masque(
            fig, FunctionInteractable(
                ctx -> [
                    HitLayer(:g, :grid, Dict{String, Any}(), Any[], axis(ctx), (:click,)),
                ]
            );
            auto = false,
        )
        cell = tv(grid, Dict("layer" => "g", "index" => -1, "payload" => Dict("i" => 1, "j" => 0, "value" => 12)))
        @test cell isa GridCellEvent && cell.i == 2 && cell.j == 1 && cell.value == 12
        axisw = masque(
            fig, FunctionInteractable(
                ctx -> [
                    HitLayer(:ax, :axis, Any[], Any[], axis(ctx), (:click,)),
                ]
            );
            auto = false,
        )
        aev = tv(axisw, Dict("layer" => "ax", "index" => -1, "payload" => Dict("x" => 1.5, "y" => 2.5)))
        @test aev isa AxisEvent && aev.x == 1.5 && aev.y == 2.5
        thr = masque(
            fig, FunctionInteractable(
                ctx -> [
                    HitLayer(:thr, :threshold, Any[], Any[], axis(ctx), (:drag,)),
                ]
            );
            auto = false,
        )
        tev = tv(thr, Dict("layer" => "thr", "index" => 0, "payload" => 3.25))
        @test tev isa ThresholdEvent && tev.value == 3.25
        roi = masque(
            fig, FunctionInteractable(
                ctx -> [
                    HitLayer(:box, :roi, Any[], Any[], axis(ctx), (:drag,)),
                ]
            );
            auto = false,
        )
        bev = tv(
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
        @test_throws ArgumentError tv(view, Dict("layer" => "view", "index" => -1, "payload" => nothing))
    end
end
