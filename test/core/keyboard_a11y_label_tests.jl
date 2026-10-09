using Test, Masque, CairoMakie, Makie
include(joinpath(@__DIR__, "..", "testutils.jl"))

# `label` keyword round-trip. One constructor is enough per the design doc — PointInteractable
# exercises the field, HitLayer's outer 6-arg constructor, and `_layer_dict`'s manifest
# emission all at once.
@testset "label: per-layer screen-reader prefix" begin
    (; ax, pts, ctx) = default_fixture()

    @testset "absent by default" begin
        pin = PointInteractable(ax, pts; id = :unlabeled)
        L = only(hitlayers(pin, ctx))
        @test L.label === nothing
        m = build_manifest([pin], ctx)
        @test !haskey(only(m["layers"]), "label")
    end

    @testset "round-trips when set" begin
        pin = PointInteractable(ax, pts; id = :labeled, label = "Scatter")
        L = only(hitlayers(pin, ctx))
        @test L.label == "Scatter"
        m = build_manifest([pin], ctx)
        @test only(m["layers"])["label"] == "Scatter"
    end

    @testset "HitLayer's 6-arg constructor still works (label defaults to nothing)" begin
        L = HitLayer(:x, :circles, Real[0, 0, 1], Any[], :ax1, (:click, :hover))
        @test L.label === nothing
    end

    @testset "non-String label coerces (e.g. Symbol)" begin
        pin = PointInteractable(ax, pts; id = :symlabel, label = :Scatter)
        @test hitlayers(pin, ctx)[1].label == "Scatter"
    end
end

# A plot's own Makie `label` (its legend text) names its layers unless the caller names them (#304).
@testset "label: defaults to the plot's Makie label" begin
    layer_labels(w) = Dict(Symbol(l["id"]) => get(l, "label", nothing) for l in w.manifest["layers"])

    fig = Figure(size = (400, 300))
    ax = Axis(fig[1, 1])
    s = scatter!(ax, [1.0, 2.0, 3.0], [4.0, 1.0, 3.0]; label = "wild type")
    lines!(ax, [1.0, 2.0, 3.0], [1.0, 2.0, 3.0])
    barplot!(ax, [1.0, 2.0], [1.0, 2.0]; label = "")
    stem!(ax, [1.0, 2.0], [2.0, 3.0]; label = "stems")
    scatter!(ax, [1.5], [1.5]; label = L"\alpha")
    scatter!(ax, [2.5], [2.5]; label = rich("bold"; font = :bold))

    labels = layer_labels(masque(fig))
    @test labels[:scatter] == "wild type"
    @test labels[:lines] === nothing          # no Makie label: no name, as before
    @test labels[:bars] === nothing           # an empty label names nothing
    @test labels[:stem] == labels[:stem_stems] == "stems"   # both layers of a two-layer plot
    @test labels[:scatter_2] === nothing      # LaTeX would be read out as markup
    @test labels[:scatter_3] === nothing      # so would rich text

    # The caller's `label` wins, and `label = nothing` leaves the name out.
    @test layer_labels(masque(fig, interactables(s; label = "City")))[:scatter] == "City"
    @test layer_labels(masque(fig, interactables(s; label = nothing)))[:scatter] === nothing

    # The constructors that take a plot default the same way.
    _, _, ctx = ctx_for(fig)
    @test only(hitlayers(PointInteractable(ax, s), ctx)).label == "wild type"
    @test only(interactables(ax, s)).label == "wild type"
end
