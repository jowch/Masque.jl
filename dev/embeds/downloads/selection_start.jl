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

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000001
using Masque, CairoMakie

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000100
md"""
Tokyo starts selected, and clicking another city replaces the selection.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000102
begin
    lon = [139.7, 77.2, 3.4, -77.0]
    lat = [35.7, 28.6, 6.5, -12.0]
    rows = [(city = "Tokyo",), (city = "Delhi",), (city = "Lagos",), (city = "Lima",)]
    fig = Figure(size = (560, 360))
    ax = Axis(fig[1, 1]; xlabel = "Longitude", ylabel = "Latitude")
    s = scatter!(ax, lon, lat; markersize = 18)
    cities = interactables(s; id = :cities, payloads = rows)
    nothing
end

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000103
md"""
`id = :cities` names the scatter's field, so the selected city is `sel.cities`.
"""

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000104
@bind sel masque(fig, cities; selected = 1)

# ╔═╡ a1b2c3d4-0001-4000-8000-000000000106
isnothing(sel.cities) ? "click a city" : "$(sel.cities.city) selected"

# ╔═╡ 00000000-0000-0000-0000-000000000001
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
CairoMakie = "13f3f980-e62b-5c42-98c6-ff1f3baf88f0"
Masque = "82b01fb5-7eeb-4559-83ea-8d75f85d4328"
"""

# ╔═╡ Cell order:
# ╠═a1b2c3d4-0001-4000-8000-000000000001
# ╟─a1b2c3d4-0001-4000-8000-000000000100
# ╠═a1b2c3d4-0001-4000-8000-000000000102
# ╟─a1b2c3d4-0001-4000-8000-000000000103
# ╠═a1b2c3d4-0001-4000-8000-000000000104
# ╠═a1b2c3d4-0001-4000-8000-000000000106
# ╟─00000000-0000-0000-0000-000000000001
