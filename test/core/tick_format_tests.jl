using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# Default tooltips follow the axis's tick format (#510): each axis dimension ships a display
# format read from its tick settings, and a layer of Masque's own payloads is flagged `coords`.
@testset "tick-format tooltips" begin
    fs = IP._format_string
    @testset "format strings" begin
        @test fs("{:.1f} mV") == Dict("suffix" => " mV", "spec" => ".1f")
        @test fs("{:.0%}") == Dict("scale" => 100.0, "suffix" => "%", "spec" => ".0f")
        @test fs("\${:,.2f}") == Dict("prefix" => "\$", "group" => true, "spec" => ",.2f")
        @test fs("{:.3e}") == Dict("exp" => true, "spec" => ".3e")
        @test fs("{:e}") == Dict("exp" => true, "spec" => "e")
        @test fs("{:.2g} s") == Dict("suffix" => " s", "spec" => ".2g")
        @test fs("{:d}") == Dict("spec" => "d")
        @test fs("{:.2}") == Dict("spec" => ".2")
        @test fs("{:>10.1f}°C") == Dict("suffix" => "°C", "spec" => ".1f")   # width/alignment dropped
        @test fs("{1:.1f}") == Dict("spec" => ".1f")
        @test fs("{:,}") == Dict("group" => true)                            # no precision: rule 4
        @test fs("{} kg") == Dict("suffix" => " kg")
        @test fs("{:x} id") == Dict("suffix" => " id")                       # outside the subset: affixes only
        @test fs("{:_.1f}") === nothing                                      # `_` grouping: not d3's
        @test fs("{{{:.1f}}}") == Dict("prefix" => "{", "suffix" => "}", "spec" => ".1f")
        @test fs("{:.1f}") == Dict("spec" => ".1f")
        @test fs("plain") === nothing                                       # no placeholder
        @test fs("{:.1f} to {:.1f}") === nothing                            # two
        @test fs("{:.1f") === nothing                                       # unclosed
        # Makie prints the same as the frontend would for these, through Format.jl.
        @test Makie.get_ticklabels("{:.1f} mV", [0.437]) == ["0.4 mV"]
        @test Makie.get_ticklabels("{:.0%}", [0.437]) == ["44%"]
    end

    @testset "tick objects, functions, scales, conversions" begin
        cf = IP._coord_format
        f = cf(Makie.AngularTicks(180 / π, "°"), Makie.automatic)
        @test f["scale"] ≈ 180 / π && f["suffix"] == "°"
        f = cf(Makie.MultiplesTicks(4, π, "π"), Makie.automatic)
        @test f["scale"] ≈ 1 / π && f["suffix"] == "π"
        @test cf(Makie.automatic, Makie.automatic) === nothing
        @test cf(Makie.LinearTicks(4), Makie.automatic) === nothing
        @test cf(Makie.automatic, vs -> string.(vs) .* "%") === nothing    # a function: not followed
        @test cf(([1, 2], ["a", "b"]), "{:.1f}") === nothing                # hand-placed labels
        @test cf(Makie.automatic, "{:.1f}"; scale = log10) === nothing      # log scale
        @test cf(Makie.automatic, "{:.1f}"; conv = Makie.CategoricalConversion()) === nothing
        @test cf(Makie.automatic, Makie.automatic; label = "r") == Dict("label" => "r")
        @test cf(Makie.automatic, "{:.1f} m"; label = "r") == Dict("suffix" => " m", "spec" => ".1f", "label" => "r")
    end

    @testset "transforms carry the formats" begin
        fig = Figure(size = (900, 700))
        ax = Axis(fig[1, 1]; ytickformat = "{:.1f} mV", xticks = MultiplesTicks(4, π, "π"))
        scatter!(ax, [1.0, 2.0], [3.47, 4.1])
        axf = Axis(fig[1, 2]; ytickformat = vs -> string.(vs) .* "!")
        scatter!(axf, [1.0], [1.0])
        pax = PolarAxis(fig[2, 1])
        scatter!(pax, [π / 2], [2.0])
        a3 = Axis3(fig[2, 2]; ztickformat = "{:.2f} K")
        scatter!(a3, [1.0], [2.0], [3.0])
        hm = heatmap!(Axis(fig[3, 1]), rand(3, 3))
        cb = Colorbar(fig[3, 2], hm; tickformat = "{:.1f} dB")
        _, _, ctx = ctx_for(fig)
        td(a) = IP._transform_dict(ctx.transforms[IP.axis_id(ctx, a)])

        d = td(ax)
        @test d["yfmt"] == Dict("suffix" => " mV", "spec" => ".1f")
        @test d["xfmt"]["suffix"] == "π" && d["xfmt"]["scale"] ≈ 1 / π
        @test !haskey(d, "zfmt")
        df = td(axf)
        @test !haskey(df, "xfmt") && !haskey(df, "yfmt")                     # a function format: plain

        dp = td(pax)
        @test dp["xfmt"]["label"] == "θ" && dp["xfmt"]["suffix"] == "°" && dp["xfmt"]["scale"] ≈ 180 / π
        @test dp["yfmt"] == Dict("label" => "r")

        d3 = td(a3)
        @test d3["zfmt"] == Dict("suffix" => " K", "spec" => ".2f")
        @test !haskey(d3, "xfmt")

        dc = td(cb)
        @test dc["valueaxis"] == "y" && dc["yfmt"] == Dict("suffix" => " dB", "spec" => ".1f")

        # θ is the plot's y when `theta_as_x = false`.
        fig2 = Figure(); pax2 = PolarAxis(fig2[1, 1]; theta_as_x = false)
        scatter!(pax2, [2.0], [π / 2])
        _, _, ctx2 = ctx_for(fig2)
        d2 = IP._transform_dict(ctx2.transforms[IP.axis_id(ctx2, pax2)])
        @test d2["yfmt"]["label"] == "θ" && d2["xfmt"] == Dict("label" => "r")

        # An axis with no tick settings sends nothing new: the wire stays as it was.
        fig3 = Figure(); ax3 = Axis(fig3[1, 1]); scatter!(ax3, [1.0], [1.0])
        _, _, ctx3 = ctx_for(fig3)
        d0 = IP._transform_dict(ctx3.transforms[IP.axis_id(ctx3, ax3)])
        @test !any(haskey(d0, k) for k in ("xfmt", "yfmt", "zfmt"))
    end

    @testset "the coordinate fields Masque fills in are listed" begin
        fig = Figure(); ax = Axis(fig[1, 1]; ytickformat = "{:.1f} mV")
        sc = scatter!(ax, [1.0, 2.0], [3.47, 4.1])
        tx = text!(ax, [1.0], [2.0]; text = ["a"])
        ar = arrows2d!(ax, [1.0], [1.0], [0.5], [0.5])
        _, _, ctx = ctx_for(fig)
        coords(i) = get(build_manifest([i], ctx)["layers"][1], "coords", String[])
        @test coords(PointInteractable(ax, sc)) == ["x", "y"]
        @test coords(TextInteractable(ax, tx)) == ["x", "y"]
        @test coords(SegmentInteractable(ax, ar)) == ["x", "y"]       # u/v are offsets: plain
        # Beside a user's own fields, the x/y Masque merged in still follow the axis.
        @test coords(PointInteractable(ax, sc; payloads = [(; name = "a"), (; name = "b")])) == ["x", "y"]
        @test coords(PointInteractable(ax, sc; payloads = [Dict("name" => "a"), Dict("name" => "b")])) == ["x", "y"]
        # A field the user sets is theirs, in any element.
        @test coords(PointInteractable(ax, sc; payloads = [(; x = "left"), (; name = "b")])) == ["y"]
        @test coords(PointInteractable(ax, sc; payloads = [(; x = 1, y = 2), (; x = 3, y = 4)])) == String[]
        @test coords(PointInteractable(ax, sc; payloads = ["a", "b"])) == String[]  # not key-value
        @test coords(RectInteractable(ax, [(0.0, 0.0, 1.0, 1.0)])) == String[]        # (; index) only
        @test coords(SegmentInteractable(ax, lines!(ax, [1, 2], [1, 2]))) == String[]  # its readout is browser-side
        # The record is per vector: a copy of Masque's payloads is the user's own.
        p = PointInteractable(ax, sc)
        @test IP._coord_keys(p.payloads) == [:x, :y]
        @test IP._coord_keys(copy(p.payloads)) == Symbol[]
    end

    @testset "tooltip_sigdigits is sent only when set" begin
        fig = Figure(); ax = Axis(fig[1, 1]); scatter!(ax, [1.0], [1.0])
        @test !haskey(masque(fig).manifest, "tipDigits")
        @test masque(fig; tooltip_sigdigits = 4).manifest["tipDigits"] == 4  # set: outranks a format's precision
    end
end
