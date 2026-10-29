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

# ╔═╡ c1d50016-0001-4000-8000-000000000001
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

# ╔═╡ c1d50016-0001-4000-8000-000000000002
begin
    lon = [139.7, 77.2, 3.4, -77.0, -46.6, 37.6, -99.1, 151.2]
    lat = [35.7, 28.6, 6.5, -12.0, -23.5, 55.8, 19.4, -33.9]
    names = ["Tokyo", "Delhi", "Lagos", "Lima", "São Paulo", "Moscow", "Mexico City", "Sydney"]
    rows = [(city = n,) for n in names]
    fig = Figure(size = (560, 340))
    ax = Axis(fig[1, 1]; xlabel = "Longitude", ylabel = "Latitude", title = "click a city")
    s = scatter!(ax, lon, lat; markersize = 18)
    cities = interactables(s; id = :cities, payloads = rows)
    wid = masque(fig, cities)
end;

# ╔═╡ c1d50016-0001-4000-8000-000000000003
@bind sel wid

# ╔═╡ c1d50016-0001-4000-8000-000000000004
Base.Text(isnothing(sel.cities) ? "sel.cities is nothing" : "sel.cities is $(sel.cities.city)")

# ╔═╡ c1d50016-0001-4000-8000-000000000005
HTML(
    "<span id=\"clip_manifest\" style=\"display:none\">" *
        JSON3.write((; width = wid.manifest["width"], height = wid.manifest["height"], layers = wid.manifest["layers"], transforms = wid.manifest["transforms"])) *
        "</span>"
)

# ╔═╡ Cell order:
# ╠═c1d50016-0001-4000-8000-000000000001
# ╠═c1d50016-0001-4000-8000-000000000002
# ╠═c1d50016-0001-4000-8000-000000000003
# ╠═c1d50016-0001-4000-8000-000000000004
# ╠═c1d50016-0001-4000-8000-000000000005
