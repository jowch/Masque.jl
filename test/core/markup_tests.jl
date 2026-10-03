using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

@testset "Markup + tooltips" begin
    @testset "markup parse + validation" begin
        m = masque"<b>$(name)</b> — $(pop:,) people ($(share:.1%))"
        @test m isa Masque.Markup
        @test m.fields == [:name, :pop, :share]
        @test count(s -> s isa Masque.Field, m.segments) == 3
        @test m.segments[2] == Masque.Field(:name, nothing)
        @test any(s -> s isa Masque.Field && s.spec == ",", m.segments)

        # macro-time structural errors
        for bad in ["<b>\$(name</b>", "x = \$5", "<b>\$()</b>", "\$(pop + 1)", "\$(pop:.2z)"]
            @test_throws Masque.TemplateValidationError Masque.parse_template(bad)
        end

        # spec accept / reject
        for ok in [",", ".2f", ",.0f", ".1%", "\$,.2f", ".3s", "+.1e", "~g"]
            @test Masque._valid_spec(ok)
        end
        @test !Masque._valid_spec(".2z")
        # an empty spec after `:` is a typo, not the default — rejected
        @test_throws Masque.TemplateValidationError Masque.parse_template("\$(x:)")

        # showerror renders a caret
        e = try
            Masque.parse_template("\$(pop:.2z)")
        catch err
            err
        end
        @test occursin("^", sprint(showerror, e))
    end

    @testset "markup field check + segments" begin
        m = masque"<b>$(name)</b> — $(pop:,)"
        @test Masque.check_fields(m, (:name, :pop)) === m            # all present → returns m
        @test_throws ArgumentError Masque.check_fields(m, (:name,))  # pop missing
        err = try
            Masque.check_fields(masque"$(nam)", (:name, :pop))
        catch e
            e
        end
        @test occursin("did you mean `name`", sprint(showerror, err))

        seg = Masque.markup_segments(m)
        @test seg[1] == "<b>"
        @test seg[2] == Dict("f" => "name")
        @test any(s -> s == Dict("f" => "pop", "spec" => ","), seg)
    end

    @testset "tooltip_* style kwargs" begin
        @test isempty(Masque.tip_style_dict())                                  # nothing set → empty
        d = Masque.tip_style_dict(; tooltip_bg = :red, tooltip_font_size = 13, tooltip_caret = false)
        @test d["--masque-tip-bg"] == "rgb(255,0,0)"                            # Makie color → CSS
        @test d["--masque-tip-font-size"] == "13px"
        @test d["--masque-tip-caret"] == "none"
        @test Masque.tip_style_dict(; tooltip_bg = "#abc")["--masque-tip-bg"] == "#abc"  # CSS string passthrough
        @test !haskey(Masque.tip_style_dict(; tooltip_bg = :red), "--masque-tip-color")  # unset omitted
    end

    @testset "overlaystyle" begin
        @test isempty(Masque.overlay_style_dict(nothing))                      # unset → empty
        @test isempty(Masque.overlay_style_dict((;)))
        d = Masque.overlay_style_dict((; color = :red, hover_width = 3, ring_halo_opacity = 0.5, handle_fill = "#000"))
        @test d["--masque-chrome"] == "rgb(255,0,0)"                           # Makie color → CSS
        @test d["--masque-hover-width"] == "3px"                               # length → px
        @test d["--masque-ring-halo-opacity"] == "0.5"
        @test d["--masque-handle-fill"] == "#000"                              # CSS string passthrough
        @test length(d) == 4                                                   # unset keys omitted
        # Every key maps to its own --masque-* property.
        props = [first(v) for v in values(Masque._OVERLAY_STYLE_KEYS)]
        @test allunique(props) && all(startswith("--masque-"), props)
        @test_throws "unknown key `hover_widht`" Masque.overlay_style_dict((; hover_widht = 3))
        @test_throws "hover_width" Masque.overlay_style_dict((; hover_width = -1))
        @test_throws "opacity from 0 to 1" Masque.overlay_style_dict((; cross_opacity = 2))
        @test_throws ArgumentError Masque.overlay_style_dict((; hover_width = true))
        @test_throws "NamedTuple" Masque.overlay_style_dict(Dict(:hover_width => 3))

        tfig = Figure(size = (600, 400)); tax = Axis(tfig[1, 1])
        scatter!(tax, [1.0, 2.0], [1.0, 2.0])
        m = masque(tfig; overlaystyle = (; color = :blue, selected_width = 2.5)).manifest
        @test m["overlayStyle"] == Dict("--masque-chrome" => "rgb(0,0,255)", "--masque-selected-width" => "2.5px")
        @test !haskey(masque(tfig).manifest, "overlayStyle")                  # default ships nothing
        @test_throws ArgumentError masque(tfig; overlaystyle = (; nope = 1))
    end

    @testset "tooltip_spec on interactables" begin
        # Originally read the file's shared bare `ax`, which by execution order was actually
        # the Voronoiplot testset's leftover axis (each nested `@testset`'s `let` reassigns
        # the enclosing testset's already-existing local rather than shadowing it) — unrelated
        # to tooltip_spec, which never touches geometry/ctx. `default_fixture()` fixes the
        # staleness without changing any assertion here.
        (; ax) = default_fixture()
        pts = [(1.0, 1.0), (2.0, 2.0)]
        @test Masque.tooltip_spec(PointInteractable(ax, pts)) === nothing
        pi = PointInteractable(ax, pts; tooltip = masque"$(x)")
        @test Masque.tooltip_spec(pi) isa Masque.Markup
        @test Masque.tooltip_spec(PointInteractable(ax, pts; tooltip = false)) === false
        ri = RegionInteractable(ax, [(:circle, (1.0, 1.0), 0.5)]; payloads = [(; n = "a")], tooltip = masque"$(n)")
        @test Masque.tooltip_spec(ri) isa Masque.Markup
    end

    @testset "manifest tooltip wiring" begin
        # self-contained fig/ax/ctx (see "build_manifest + widget + bond" for why)
        tfig = Figure(size = (600, 400)); tax = Axis(tfig[1, 1])
        _, _, tctx = ctx_for(tfig)
        pts2 = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0)]
        pi = PointInteractable(tax, pts2; tooltip = masque"x=$(x), y=$(y)")
        man = build_manifest([pi], tctx; tip_style = Masque.tip_style_dict(; tooltip_bg = :red))
        L = man["layers"][1]
        @test haskey(L, "template")
        @test !haskey(L, "tooltips")                       # old per-element array removed
        @test L["template"][1] == "x="
        @test man["tipStyle"]["--masque-tip-bg"] == "rgb(255,0,0)"

        off = build_manifest([PointInteractable(tax, pts2; tooltip = false)], tctx)
        @test off["layers"][1]["tooltip"] === false
        @test !haskey(build_manifest([PointInteractable(tax, pts2)], tctx), "tipStyle")

        # tooltip_sigdigits: the default ships nothing (the frontend default is the same 4)
        @test !haskey(build_manifest([PointInteractable(tax, pts2)], tctx), "tipDigits")
        @test build_manifest([PointInteractable(tax, pts2)], tctx; tip_digits = 6)["tipDigits"] == 6
        @test !haskey(masque(tfig, PointInteractable(tax, pts2); auto = false).manifest, "tipDigits")
        @test masque(
            tfig, PointInteractable(tax, pts2); tooltip_sigdigits = 2, auto = false
        ).manifest["tipDigits"] == 2
        @test masque(tfig; tooltip_sigdigits = 7).manifest["tipDigits"] == 7     # zero-config path too
        for bad in (0, 18, 2.5, "3", nothing, true)
            @test_throws ArgumentError masque(
                tfig, PointInteractable(tax, pts2); tooltip_sigdigits = bad, auto = false
            )
        end
        msg = sprint(
            showerror, try
                masque(tfig, PointInteractable(tax, pts2); tooltip_sigdigits = 0, auto = false)
            catch e
                e
            end
        )
        @test occursin("tooltip_sigdigits", msg) && occursin("1 to 17", msg)

        # bad field → build-time error
        bad = PointInteractable(tax, pts2; tooltip = masque"$(nope)")
        @test_throws ArgumentError build_manifest([bad], tctx)

        # `tooltip = true` is meaningless (only `false` suppresses) → fail loud
        @test_throws ArgumentError build_manifest([PointInteractable(tax, pts2; tooltip = true)], tctx)
    end

    @testset "manifest background wiring" begin
        tfig = Figure(size = (600, 400)); tax = Axis(tfig[1, 1])
        _, _, tctx = ctx_for(tfig)
        pts2 = [(1.0, 1.0), (2.0, 4.0), (3.0, 9.0)]
        pi = PointInteractable(tax, pts2)

        @test !haskey(build_manifest([pi], tctx), "background")   # omitted by default

        man = build_manifest([pi], tctx; background = Makie.RGBAf(0.1, 0.1, 0.1, 1))
        @test man["background"] == "rgb(26,26,26)"

        # masque() itself ships the FIGURE's own background — not just whatever's passed through
        w = masque(tfig, pi; auto = false)
        @test w.manifest["background"] == "rgb(255,255,255)"   # Figure's default background

        dfig = Figure(size = (200, 150); backgroundcolor = :gray12)
        dax = Axis(dfig[1, 1])
        dw = masque(dfig, PointInteractable(dax, pts2); auto = false)
        @test dw.manifest["background"] == Masque._css_color(:gray12)
    end
end
