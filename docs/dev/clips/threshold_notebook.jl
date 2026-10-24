### A Pluto.jl notebook ###
# v1.0.3

using Markdown
using InteractiveUtils

# This Pluto notebook uses @bind for interactivity. When running this notebook outside of Pluto, the following 'mock version' of @bind gives bound variables a default value (instead of an error).
macro bind(def, element)
    #! format: off
    return quote
        local iv = try Base.loaded_modules[Base.PkgId(Base.UUID("6e696c72-6542-2067-7265-42206c756150"), "AbstractPlutoDingetjes")].Bonds.initial_value catch; b -> missing; end
        local el = $(esc(element))
        global $(esc(def)) = Core.applicable(Base.get, el) ? Base.get(el) : iv(el)
        el
    end
    #! format: on
end

# ╔═╡ c1d50013-0001-4000-8000-000000000001
begin
    import Pkg
    dev = get(ENV, "MASQUE_DEV_ENV", "")
    if !isempty(dev)
        Pkg.activate(dev)
    else
        Pkg.activate(; temp = true)
        Pkg.add(["CairoMakie", "JSON3"])
        Pkg.develop(path = joinpath(@__DIR__, "..", "..", ".."))
        Pkg.instantiate()
    end
    using Masque
    using CairoMakie
    import JSON3
end

# ╔═╡ c1d50013-0001-4000-8000-000000000002
begin
    using Random
    Random.seed!(7)   # the same picture every time the notebook runs

    # A dim, uneven background with eighteen bright cells on it
    img = [0.15 + 0.1 * (i / 160) + 0.04 * randn() for i in 1:160, j in 1:100]
    for _ in 1:18
        ci, cj, r = rand(8:152), rand(8:92), rand(3.0:0.5:6.0)
        b = 0.45 + 0.4 * rand()
        img .+= [b * exp(-((i - ci)^2 + (j - cj)^2) / (2r^2)) for i in 1:160, j in 1:100]
    end

    fig = Figure(size = (720, 300))
    ax_img = Axis(fig[1, 1]; aspect = DataAspect(), title = "cells above the cutoff in red")
    hidedecorations!(ax_img)
    heatmap!(ax_img, img; colormap = :grays)
    maskplot = heatmap!(ax_img, img .> 0.4; colormap = [(:red, 0), (:red, 0.55)])
    ax_hist = Axis(fig[1, 2]; xlabel = "brightness", ylabel = "pixels", yscale = log10, title = "drag the cutoff")
    hist!(ax_hist, vec(img); bins = 60, color = :gray60, fillto = 0.5)
    ylims!(ax_hist, 0.8, 5000)
    cutoff = ThresholdInteractable(ax_hist; orientation = :vertical, value = 0.4)

    wid = masque(
        fig, (cutoff = cutoff,); bind = :cutoff,
        onchange = state -> (maskplot[1] = img .> state.cutoff.value)
    )
end;

# ╔═╡ c1d50013-0001-4000-8000-000000000003
@bind level wid

# ╔═╡ c1d50013-0001-4000-8000-000000000004
Base.Text("$(round(100 * count(>(level.value), img) / length(img); digits = 1))% of the picture is above $(round(level.value; digits = 2))")

# ╔═╡ c1d50013-0001-4000-8000-000000000005
HTML(
    "<span id=\"clip_manifest\" style=\"display:none\">" *
        JSON3.write((; width = wid.manifest["width"], height = wid.manifest["height"], layers = [l for l in wid.manifest["layers"] if string(l["id"]) == "cutoff"], transforms = wid.manifest["transforms"])) *
        "</span>"
)

# ╔═╡ Cell order:
# ╠═c1d50013-0001-4000-8000-000000000001
# ╠═c1d50013-0001-4000-8000-000000000002
# ╠═c1d50013-0001-4000-8000-000000000003
# ╠═c1d50013-0001-4000-8000-000000000004
# ╠═c1d50013-0001-4000-8000-000000000005
