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
        @test sprint(show, ev) == "ElementEvent(:scatter, 2, city = \"Osaka\")"
        ax = AxisEvent(:axis, 1.0, 2.0)
        @test occursin("x = 1.0", sprint(show, ax))
        @test !occursin("-1", sprint(show, ax))
    end
end
