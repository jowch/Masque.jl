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

# ╔═╡ c1d50006-0001-4000-8000-000000000001
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

# ╔═╡ c1d50006-0001-4000-8000-000000000002
begin
    # A small segmentation: five objects on a background of 0.
    labels = zeros(Int, 24, 16)
    labels[3:7, 3:6] .= 1
    labels[10:15, 2:5] .= 2
    labels[18:22, 4:9] .= 3
    labels[4:9, 10:14] .= 4
    labels[13:20, 11:14] .= 5
    img = [0.15 * sin(i / 3) + 0.8 * (labels[i, j] > 0) for i in 1:24, j in 1:16]
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; aspect = DataAspect(), title = "click an object")
    hm = heatmap!(ax, img; colormap = :grays)
    wid = masque(fig, (objects = interactables(hm; select = :many, regions = labels),))
end;

# ╔═╡ c1d50006-0001-4000-8000-000000000003
@bind sel wid

# ╔═╡ c1d50006-0001-4000-8000-000000000004
Base.Text("regions $(sel.objects.regions), $(count(sel.objects.mask)) cells")

# ╔═╡ c1d50006-0001-4000-8000-000000000005
HTML(
    "<span id=\"clip_manifest\" style=\"display:none\">" *
        JSON3.write((; width = wid.manifest["width"], height = wid.manifest["height"], layers = wid.manifest["layers"], transforms = wid.manifest["transforms"])) *
        "</span>"
)

# ╔═╡ Cell order:
# ╠═c1d50006-0001-4000-8000-000000000001
# ╠═c1d50006-0001-4000-8000-000000000002
# ╠═c1d50006-0001-4000-8000-000000000003
# ╠═c1d50006-0001-4000-8000-000000000004
# ╠═c1d50006-0001-4000-8000-000000000005
