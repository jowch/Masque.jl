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

# ╔═╡ c1d50011-0001-4000-8000-000000000001
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

# ╔═╡ c1d50011-0001-4000-8000-000000000002
begin
    fig = Figure(size = (500, 380))
    ax = Axis3(fig[1, 1]; azimuth = 0.4, elevation = 0.5, title = "drag to orbit")
    s = scatter!(
        ax,
        Makie.Point3f[(1, 2, 3), (4, 5, 6), (7, 8, 2)];
        color = :crimson,
        markersize = 16,
    )
    orbit = ViewInteractable(ax)
    wid = masque(fig, orbit)
end;

# ╔═╡ c1d50011-0001-4000-8000-000000000003
@bind pick wid

# ╔═╡ c1d50011-0001-4000-8000-000000000005
HTML(
    "<span id=\"clip_manifest\" style=\"display:none\">" *
        JSON3.write((; width = wid.manifest["width"], height = wid.manifest["height"], layers = wid.manifest["layers"], transforms = wid.manifest["transforms"])) *
        "</span>"
)

# ╔═╡ Cell order:
# ╠═c1d50011-0001-4000-8000-000000000001
# ╠═c1d50011-0001-4000-8000-000000000002
# ╠═c1d50011-0001-4000-8000-000000000003
# ╠═c1d50011-0001-4000-8000-000000000005
