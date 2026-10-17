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

# ╔═╡ c1d50007-0001-4000-8000-000000000001
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

# ╔═╡ c1d50007-0001-4000-8000-000000000002
begin
    z = [i + 10j for i in 1:8, j in 1:5]
    fig = Figure(size = (560, 320))
    ax = Axis(fig[1, 1]; title = "drag the box")
    p = heatmap!(ax, 1:8, 1:5, z; colormap = :viridis)
    box = ROIInteractable(ax; bounds = (1.0, 3.0, 1.0, 2.0), selects = p)
    wid = masque(fig, box; bind = p)
end;

# ╔═╡ c1d50007-0001-4000-8000-000000000003
@bind win wid

# ╔═╡ c1d50007-0001-4000-8000-000000000004
Base.Text("i $(win.i1):$(win.i2), j $(win.j1):$(win.j2), z[win] sums to $(sum(z[win]))")

# ╔═╡ c1d50007-0001-4000-8000-000000000005
HTML(
    "<span id=\"clip_manifest\" style=\"display:none\">" *
        JSON3.write((; width = wid.manifest["width"], height = wid.manifest["height"], layers = wid.manifest["layers"], transforms = wid.manifest["transforms"])) *
        "</span>"
)

# ╔═╡ Cell order:
# ╠═c1d50007-0001-4000-8000-000000000001
# ╠═c1d50007-0001-4000-8000-000000000002
# ╠═c1d50007-0001-4000-8000-000000000003
# ╠═c1d50007-0001-4000-8000-000000000004
# ╠═c1d50007-0001-4000-8000-000000000005
